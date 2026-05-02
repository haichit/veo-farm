// Token Manager — Puppeteer + Stealth.
// Launches Brave/Chrome with the captcha extension loaded, intercepts Bearer tokens
// from labs.google → aisandbox-pa.googleapis.com requests, and exposes them to the API client.
// Reference: SPEC_REPLICA_BACKEND.md section 18.9.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore — puppeteer-extra has loose types
import puppeteerExtra from 'puppeteer-extra';
// @ts-ignore — stealth plugin types are loose
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page, CDPSession } from 'puppeteer-core';
import { CaptchaBridge } from './captcha-bridge.js';
import { LABS_BASE, RECAPTCHA_SITE_KEY } from './constants.js';

puppeteerExtra.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AccountAuth {
  accountId: string;
  email?: string;
  cookies?: any[];
  projectId?: string;
}

export interface LaunchOptions {
  headless?: boolean;
  chromeExecutablePath?: string;
  userDataDir?: string;
  captchaServerUrl?: string;
}

export class TokenManager {
  public _browser: Browser | null = null;
  public _page: Page | null = null;
  public _cdp: CDPSession | null = null;

  private _captchaBridge: CaptchaBridge;
  private _bearerToken: string | null = null;
  private _account: AccountAuth;

  constructor(account: AccountAuth, captchaServerUrl = 'http://127.0.0.1:3456') {
    this._account = account;
    this._captchaBridge = new CaptchaBridge(captchaServerUrl);
  }

  /**
   * Launch a Chrome/Brave instance with the captcha extension loaded.
   * Headless=false by default — extensions don't load in headless: 'new'.
   */
  async launch(opts: LaunchOptions = {}): Promise<void> {
    const extPath = path.resolve(__dirname, '../captcha-server/extension');

    const args = [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      // BlockInsecurePrivateNetworkRequests: Chromium's PNA blocks
      // labs.google → 127.0.0.1:3456 fetch from extension's page-context
      // socket.io even with CORS+self-signed-trust. Disabling lets the
      // extension's WebSocket handshake actually reach captcha-server.
      '--disable-features=IsolateOrigins,site-per-process,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
      `--load-extension=${extPath}`,
      `--disable-extensions-except=${extPath}`,
      // Trust captcha-server's self-signed cert so extension can WS to https://127.0.0.1:3456.
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
      '--allow-running-insecure-content',
    ];

    const launchOpts: any = {
      headless: opts.headless ?? false,
      args,
      defaultViewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      acceptInsecureCerts: true,
    };
    if (opts.chromeExecutablePath) launchOpts.executablePath = opts.chromeExecutablePath;
    if (opts.userDataDir) launchOpts.userDataDir = opts.userDataDir;

    // Kill any stale browser processes still holding our userDataDir lock from a
    // crashed previous run. browser.close() can leave subprocesses alive on macOS.
    if (opts.userDataDir) {
      await killStaleProfileProcesses(opts.userDataDir);
    }

    // Retry launch with backoff in case the OS hasn't fully released the lock yet.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        this._browser = (await puppeteerExtra.launch(launchOpts)) as Browser;
        lastErr = null;
        break;
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message ?? err);
        if (!msg.includes('already running')) throw err;
        if (opts.userDataDir) await killStaleProfileProcesses(opts.userDataDir);
        await sleep(3000);
      }
    }
    if (!this._browser) throw lastErr ?? new Error('TokenManager.launch: browser is null');

    const pages = await this._browser.pages();
    this._page = pages.length > 0 ? pages[0] : await this._browser.newPage();
    // Close any other tabs left over from previous (possibly crashed) sessions.
    for (const p of pages) {
      if (p !== this._page) {
        try {
          await p.close();
        } catch {
          /* ignore */
        }
      }
    }
    this._cdp = await (this._page as any).target().createCDPSession();

    // Inject cookies if provided (works with launchPersistentContext too).
    if (this._account.cookies?.length) {
      try {
        await this._page.setCookie(...this._account.cookies);
      } catch (e) {
        console.warn('[TokenManager] setCookie failed (non-fatal)', String(e));
      }
    }

    this._attachTokenInterceptor();

    // Forward browser-page console to stdout so extension logs are visible.
    this._page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('Veo-Farm') ||
        text.includes('Captcha') ||
        text.includes('socket.io')
      ) {
        // eslint-disable-next-line no-console
        console.log(`[browser:${msg.type()}] ${text}`);
      }
    });
    this._page.on('pageerror', (e: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[browser:pageerror]', (e as Error)?.message ?? e);
    });

    await this._page.goto(`${LABS_BASE}/fx/vi/tools/flow`, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });

    // Best-effort wait for the Flow app shell. Adjust selector if/when DOM changes.
    await this._page
      .waitForSelector(
        '[data-testid="flow-app"], [aria-label*="user"], textarea, [contenteditable="true"]',
        { timeout: 60_000 },
      )
      .catch(() => {});
  }

  private _attachTokenInterceptor() {
    if (!this._page) return;
    this._page.on('request', (req) => {
      const headers = req.headers();
      const auth = headers['authorization'] ?? headers['Authorization'];
      if (auth && auth.startsWith('Bearer ') && req.url().includes('aisandbox-pa.googleapis.com')) {
        this._bearerToken = auth.slice(7);
      }
    });
  }

  /**
   * Returns a fresh Bearer token. If none captured yet, trigger a UI interaction
   * that causes the SPA to make an authenticated XHR.
   */
  async getToken(): Promise<string> {
    if (this._bearerToken) return this._bearerToken;
    if (!this._page) throw new Error('TokenManager not launched');

    // Try to provoke an authenticated request — clicking the user menu often
    // refreshes the session check XHR. Falls back to a no-op evaluate.
    try {
      await this._page.evaluate(() => {
        const d = (globalThis as any).document;
        if (!d) return;
        const candidates = [
          '[data-testid="user-menu"]',
          'button[aria-label*="account" i]',
          'header button',
        ];
        for (const sel of candidates) {
          const el = d.querySelector(sel);
          if (el && typeof el.click === 'function') {
            el.click();
            return;
          }
        }
      });
    } catch {
      // ignore
    }

    // Wait up to 15s for a request to populate the token.
    const start = Date.now();
    while (Date.now() - start < 15_000) {
      if (this._bearerToken) return this._bearerToken;
      await sleep(500);
    }
    throw new Error('Failed to extract Bearer token from labs.google requests');
  }

  /**
   * Resolve a reCAPTCHA Enterprise token. Prefers in-page grecaptcha.execute (no captcha-server
   * needed) and falls back to the local captcha-server bridge.
   */
  async getRecaptchaToken(action: string): Promise<string> {
    // In-page execute (preferred — no socket.io / cert hassles).
    // Outer retry wraps both waitForFunction + evaluate so a detached frame /
    // destroyed context anywhere in the sequence triggers a fresh attempt.
    if (this._page) {
      const isTransient = (msg: string) =>
        msg.includes('Execution context was destroyed') ||
        msg.includes('Target closed') ||
        msg.includes('Protocol error') ||
        msg.includes('detached Frame') ||
        msg.includes('Frame');

      for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt > 0) await sleep(2000);
        try {
          await this._page.waitForFunction(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            () => !!(globalThis as any).grecaptcha?.enterprise?.execute,
            { timeout: 30_000, polling: 500 },
          );
          const result = await this._page.evaluate(
            async (siteKey: string, act: string) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const ent = (globalThis as any).grecaptcha?.enterprise;
              if (!ent?.execute) return { ok: false, reason: 'no-grecaptcha' };
              if (ent.ready) {
                await new Promise<void>((resolve) => ent.ready(() => resolve()));
              }
              try {
                const tok = await ent.execute(siteKey, { action: act });
                return { ok: true, token: tok };
              } catch (e: any) {
                return { ok: false, reason: 'execute-threw', err: String(e?.message ?? e) };
              }
            },
            RECAPTCHA_SITE_KEY,
            action,
          );
          if (result?.ok && typeof result.token === 'string' && result.token.length > 0) {
            return result.token;
          }
          console.warn(
            `[TokenManager] grecaptcha attempt ${attempt + 1}/6: no token`,
            (result as any)?.reason,
            (result as any)?.err ?? '',
          );
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          console.warn(
            `[TokenManager] grecaptcha attempt ${attempt + 1}/6 threw:`,
            msg,
          );
          if (!isTransient(msg)) break;
        }
      }
    }
    return this._captchaBridge.getToken(action);
  }

  async _rotateRecaptchaSession(reason: string): Promise<void> {
    console.warn(`[TokenManager] Rotating session: ${reason}`);
    await this._captchaBridge.forceRefresh();
    // Wait for extension client to reconnect after page reload.
    await sleep(8000);
    this._bearerToken = null;
  }

  async exportCookies(): Promise<any[]> {
    if (!this._page) return [];
    return this._page.cookies();
  }

  async close(): Promise<void> {
    try {
      await this._cdp?.detach();
    } catch {
      // ignore
    }
    await this._browser?.close().catch(() => {});
    this._browser = null;
    this._page = null;
    this._cdp = null;
    // Wait for OS to release the userDataDir lock (Brave subprocesses can linger
    // for a couple seconds after CDP says the browser is closed).
    await sleep(2000);
  }
}

async function killStaleProfileProcesses(userDataDir: string): Promise<void> {
  const { exec } = await import('node:child_process');
  await new Promise<void>((resolve) => {
    // pgrep matches command line; kill -9 any process whose argv contains our profile dir.
    exec(
      `pgrep -f ${JSON.stringify(userDataDir)} | xargs kill -9 2>/dev/null; true`,
      () => resolve(),
    );
  });
  await sleep(500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
