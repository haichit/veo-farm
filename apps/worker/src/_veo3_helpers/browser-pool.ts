// Persistent browser pool for the Veo 3 Flow client.
//
// Without this, every generate_image / generate_video call did
//   tm.launch() → ApiClient call → tm.close()
// each launch costs 30-60s (Brave boot + cookies hydrate + grecaptcha load).
//
// With this:
//   first call per account → cold start (one launch)
//   subsequent calls → reuse the warm TokenManager (saves ~55s/job)
//   idle for IDLE_CLOSE_MS → background sweep closes the browser
//
// Concurrency: one account = one Brave profile = exactly one in-flight
// generation at a time. We serialise with a per-account mutex so two jobs
// on the same account queue instead of crashing on a profile lock.

import path from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { TokenManager } from './token-manager.js';
import { CaptchaBridge } from './captcha-bridge.js';
import { clearProjectIdCache } from './api-client.js';
import { logger } from '../core/logger.js';

const PROFILES_DIR =
  process.env.WORKER_PROFILES_DIR ?? path.join(homedir(), '.veo-farm-profiles');

const IDLE_CLOSE_MS = Number(process.env.BROWSER_POOL_IDLE_MS ?? 10 * 60 * 1000);
const SWEEP_INTERVAL_MS = 60 * 1000;

interface Slot {
  tm: TokenManager;
  lastUsed: number;
  inFlight: number;
  /** Promise chain — every release() resolves the previous waiter. */
  mutex: Promise<void>;
}

const slots = new Map<string, Slot>();

let sweepTimer: ReturnType<typeof setInterval> | null = null;
function ensureSweepRunning(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [accountId, slot] of slots) {
      if (slot.inFlight === 0 && now - slot.lastUsed > IDLE_CLOSE_MS) {
        logger.info({ accountId }, 'browser-pool: closing idle TokenManager');
        const stale = slot;
        slots.delete(accountId);
        stale.tm.close().catch((e) => {
          logger.warn({ accountId, err: e?.message ?? e }, 'browser-pool: close failed');
        });
      }
    }
  }, SWEEP_INTERVAL_MS);
  // Don't keep the worker process alive just for the sweep.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sweepTimer as any).unref?.();
}

export interface AcquireOptions {
  accountId: string;
  email?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cookies: any[];
  projectId?: string;
}

export interface AcquireResult {
  tm: TokenManager;
  /** MUST be called when caller is done — closes the lease, NOT the browser. */
  release: () => void;
}

/**
 * Acquire a TokenManager for the given account, launching the browser only
 * if there is no warm slot. Two concurrent acquire() calls for the SAME
 * account block; calls for different accounts proceed in parallel.
 */
export async function acquireTokenManager(opts: AcquireOptions): Promise<AcquireResult> {
  ensureSweepRunning();

  let slot = slots.get(opts.accountId);
  if (!slot) {
    slot = {
      tm: null as unknown as TokenManager,
      lastUsed: Date.now(),
      inFlight: 0,
      mutex: Promise.resolve(),
    };
    slots.set(opts.accountId, slot);
  }

  // Per-account serialisation — chain on the existing mutex.
  let releaseLock!: () => void;
  const myTurn = new Promise<void>((res) => {
    releaseLock = res;
  });
  const prev = slot.mutex;
  slot.mutex = myTurn;
  await prev;

  // Detect a dead/detached page on a warm slot — happens when a previous
  // job crashed mid-flight or the user closed the Brave tab. Drop the slot
  // so we cold-start fresh below.
  if (slot.tm) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tmAny = slot.tm as any;
    const page = tmAny._page;
    const browser = tmAny._browser;
    let dead =
      !page ||
      !browser ||
      browser.isConnected?.() === false ||
      page.isClosed?.() === true ||
      page.mainFrame?.()?.isDetached?.() === true ||
      (() => {
        try {
          const u = page.url();
          return !u || u === 'about:blank' || u.startsWith('chrome-error://');
        } catch {
          return true;
        }
      })();
    // Active liveness probe — `isConnected` can lag for ~10s after Brave
    // is force-killed externally. A 1s evaluate flushes the truth.
    if (!dead && page) {
      try {
        await Promise.race([
          page.evaluate('1'),
          new Promise((_, rj) => setTimeout(() => rj(new Error('probe timeout')), 1500)),
        ]);
      } catch {
        dead = true;
      }
    }
    if (dead) {
      logger.warn(
        { accountId: opts.accountId },
        'browser-pool: warm slot looks dead, dropping for cold start',
      );
      slots.delete(opts.accountId);
      try {
        await slot.tm.close();
      } catch {
        /* ignore */
      }
      slot = {
        tm: null as unknown as TokenManager,
        lastUsed: Date.now(),
        inFlight: 0,
        mutex: Promise.resolve(),
      };
      slots.set(opts.accountId, slot);
    }
  }

  // Lazy-launch on first use OR after a previous failure invalidated tm.
  if (!slot.tm) {
    const captchaUrl = process.env.CAPTCHA_SERVER_URL ?? 'http://127.0.0.1:3456';
    const tm = new TokenManager(
      {
        accountId: opts.accountId,
        email: opts.email ?? opts.accountId,
        cookies: opts.cookies,
        projectId: opts.projectId,
      },
      captchaUrl,
    );
    const browserExe = process.env.BRAVE_PATH ?? process.env.CHROME_PATH ?? undefined;
    const userDataDir = path.join(PROFILES_DIR, `veo3-${opts.accountId}`);
    mkdirSync(userDataDir, { recursive: true });
    logger.info({ accountId: opts.accountId }, 'browser-pool: cold start launching browser');
    await tm.launch({ headless: false, chromeExecutablePath: browserExe, userDataDir });
    slot.tm = tm;
  } else {
    logger.info({ accountId: opts.accountId }, 'browser-pool: reusing warm browser');
  }

  // Pre-flight extension check — extension's WebSocket to captcha-server can
  // drop after long idle. If the server reports zero connected clients, force
  // a page reload so the content-script reinjects and re-handshakes BEFORE
  // we hand the lease to the caller.
  await ensureCaptchaClientConnected(slot.tm, opts.accountId);

  slot.inFlight += 1;
  slot.lastUsed = Date.now();

  return {
    tm: slot.tm,
    release: () => {
      slot!.inFlight = Math.max(0, slot!.inFlight - 1);
      slot!.lastUsed = Date.now();
      releaseLock();
    },
  };
}

async function ensureCaptchaClientConnected(
  tm: TokenManager,
  accountId: string,
): Promise<void> {
  const captchaUrl = process.env.CAPTCHA_SERVER_URL ?? 'https://127.0.0.1:3456';
  const bridge = new CaptchaBridge(captchaUrl);
  let health: { connectedClients: number } | undefined;
  try {
    health = await bridge.health();
  } catch {
    // Server unreachable — nothing to verify, let the caller hit it directly.
    return;
  }
  if ((health?.connectedClients ?? 0) > 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (tm as any)._page;
  if (!page) return;

  logger.warn(
    { accountId },
    'browser-pool: captcha-server has 0 clients, warming cert + reloading labs.google',
  );

  // Open a side-tab and visit captcha-server's /health so Brave accepts
  // the self-signed cert for this profile session BEFORE labs.google
  // tries to fetch from it. Without this, even with --ignore-certificate-errors
  // the extension's socket.io polling fetch fails with xhr poll error.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const browser = (tm as any)._browser ?? page.browser();
    const sidePage = await browser.newPage();
    try {
      await sidePage.goto(`${captchaUrl}/health`, {
        waitUntil: 'domcontentloaded',
        timeout: 10_000,
      });
    } catch {
      /* even an error response means cert was attempted; that's enough */
    }
    try { await sidePage.close(); } catch { /* ignore */ }
  } catch (e) {
    logger.warn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { accountId, err: (e as any)?.message ?? e },
      'browser-pool: cert-warm side-tab failed (continuing)',
    );
  }

  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (e) {
    logger.warn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { accountId, err: (e as any)?.message ?? e },
      'browser-pool: page.reload failed during extension recovery',
    );
    return;
  }

  // Wait up to 15s for extension to reconnect.
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    try {
      const h = await bridge.health();
      if ((h?.connectedClients ?? 0) > 0) {
        logger.info({ accountId, ms: Date.now() - start }, 'browser-pool: extension reconnected');
        return;
      }
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  logger.warn({ accountId }, 'browser-pool: extension still disconnected after reload — request will likely fail');
}

/**
 * Force-close a browser slot — call this when generation throws so the next
 * job for this account doesn't reuse a corrupt TokenManager. The next
 * acquire() will cold-start a fresh browser.
 */
export async function dropTokenManager(accountId: string): Promise<void> {
  const slot = slots.get(accountId);
  if (!slot) return;
  slots.delete(accountId);
  clearProjectIdCache(accountId);
  try {
    await slot.tm?.close();
  } catch (e) {
    logger.warn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { accountId, err: (e as any)?.message ?? e },
      'browser-pool: drop close failed',
    );
  }
}

/** Worker shutdown — close every cached browser before exit. */
export async function shutdownBrowserPool(): Promise<void> {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  await Promise.allSettled(
    [...slots.values()].map((s) => s.tm?.close().catch(() => {})),
  );
  slots.clear();
}

/** Diagnostic — current pool size + per-account state. */
export function poolStats(): Array<{ accountId: string; inFlight: number; idleMs: number }> {
  const now = Date.now();
  return [...slots.entries()].map(([accountId, s]) => ({
    accountId,
    inFlight: s.inFlight,
    idleMs: now - s.lastUsed,
  }));
}

/**
 * Pre-warm the pool for a list of account ids — launches the browsers in
 * parallel so the first user-triggered job hits a warm slot.
 */
export async function prewarm(
  accounts: Array<{ id: string; email?: string; cookies: unknown[]; projectId?: string }>,
): Promise<void> {
  if (accounts.length === 0) return;
  logger.info({ count: accounts.length }, 'browser-pool: prewarming');
  await Promise.allSettled(
    accounts.map(async (a) => {
      try {
        const lease = await acquireTokenManager({
          accountId: a.id,
          email: a.email,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookies: a.cookies as any[],
          projectId: a.projectId,
        });
        // Release immediately — we just wanted the launch side-effect.
        lease.release();
      } catch (e) {
        logger.warn(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { accountId: a.id, err: (e as any)?.message ?? e },
          'browser-pool: prewarm failed',
        );
      }
    }),
  );
  logger.info('browser-pool: prewarm done');
}
