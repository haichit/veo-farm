import './_loadEnv.js';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { logger } from './core/logger.js';
import { supabase } from './core/supabase.js';
import { runJob } from './core/job-runner.js';
import { shutdownBrowser } from './core/playwright-pool.js';
import { prewarm, shutdownBrowserPool } from './_veo3_helpers/browser-pool.js';
import { decryptCookies } from './core/account-pool.js';

const POLL_INTERVAL = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000);
const HEARTBEAT_INTERVAL = Number(process.env.WORKER_HEARTBEAT_MS ?? 10_000);
const WORKER_ID = `${process.env.HOSTNAME ?? 'local'}-${process.pid}`;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollOnce() {
  const { data, error } = await supabase().rpc('claim_next_job');
  if (error) {
    logger.error({ err: error }, 'claim_next_job failed');
    return null;
  }
  return data;
}

async function processJob(job: any) {
  try {
    const { outputUrl } = await runJob(job);
    await supabase()
      .from('jobs')
      .update({
        status: 'completed',
        output_url: outputUrl,
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    logger.info({ jobId: job.id, outputUrl }, 'job completed');
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    logger.error({ err, jobId: job.id }, 'job failed');
    await supabase()
      .from('jobs')
      .update({
        status: 'failed',
        error: msg,
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  }
}

function checkSystemDeps() {
  // ffmpeg required for Concat node. Crash early with a clear message.
  const ff = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (ff.error || ff.status !== 0) {
    logger.fatal(
      'ffmpeg not found in PATH. Install: `brew install ffmpeg` (macOS) / `apt install ffmpeg` (linux). Concat node will fail without it.',
    );
    process.exit(1);
  }
  // Brave (or Chrome) required for puppeteer-based plugins (veo3).
  const bravePath = process.env.BRAVE_PATH;
  if (bravePath && !existsSync(bravePath)) {
    logger.fatal({ bravePath }, 'BRAVE_PATH set but file does not exist');
    process.exit(1);
  }
}

async function resetStuckJobs() {
  // Any job left in 'running' from a previous worker crash gets bumped back to
  // 'pending' so it can be re-picked. Sub-jobs already 'completed' stay so we
  // don't re-do their work on retry (worker-level retry has cache-by-subjob).
  const { data, error } = await supabase()
    .from('jobs')
    .update({ status: 'pending', started_at: null })
    .eq('status', 'running')
    .select('id');
  if (error) {
    logger.warn({ err: error.message }, 'reset stuck jobs failed');
    return;
  }
  if (data && data.length > 0) {
    logger.info({ count: data.length, ids: data.map((j) => j.id) }, 'reset stuck running jobs');
  }
}

// Cleanup for accounts stuck at status='busy' — happens when:
//  - a previous worker crashed mid-generation (no release ran)
//  - a release race-conditioned with another worker write (rare)
//  - tsx watch SIGKILLed the worker between completion and release
//
// If `staleAfterSec` is set, only flip rows whose last update is older
// than that — protects in-flight jobs from being yanked. Boot-time call
// uses 0 (force reset everything since there are no in-flight jobs at boot).
async function resetStuckAccounts(staleAfterSec = 0) {
  const cutoff = new Date(Date.now() - staleAfterSec * 1000).toISOString();
  let q = supabase().from('accounts').update({ status: 'idle' }).eq('status', 'busy');
  if (staleAfterSec > 0) q = q.lt('updated_at', cutoff);
  const { data, error } = await q.select('id, label');
  if (error) {
    logger.warn({ err: error.message }, 'reset stuck accounts failed');
    return;
  }
  if (data && data.length > 0) {
    logger.info(
      { count: data.length, accounts: data.map((a) => a.label ?? a.id) },
      'reset stuck busy accounts',
    );
  }
}

async function heartbeat() {
  // Local marker for Docker HEALTHCHECK (mtime-based liveness probe).
  try {
    writeFileSync('/tmp/worker-alive', String(Date.now()));
  } catch {
    /* ignore — in case /tmp is read-only */
  }
  const { error } = await supabase()
    .from('worker_heartbeats')
    .upsert(
      { worker_id: WORKER_ID, last_seen_at: new Date().toISOString() },
      { onConflict: 'worker_id' },
    );
  if (error) {
    // Table may not exist yet (migration not run) — log once and continue.
    if (!(heartbeat as any)._warned) {
      logger.warn({ err: error.message }, 'heartbeat upsert failed (worker_heartbeats table?)');
      (heartbeat as any)._warned = true;
    }
  }
}

// Pull idle veo3 accounts from the DB and warm the browser pool with them.
// Stops at PREWARM_MAX (default 1) so we don't boot ten browsers on a
// dev laptop. Service-role client bypasses RLS so a worker process — which
// has no auth context — can still see the rows.
async function prewarmVeo3Accounts(): Promise<void> {
  const max = Number(process.env.PREWARM_MAX ?? 1);
  if (max <= 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase()
    .from('accounts')
    .select('*')
    .eq('provider_id', 'veo3')
    .eq('status', 'idle')
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(max);
  if (error) {
    logger.warn({ err: error.message }, 'prewarm: failed to query accounts');
    return;
  }
  if (!data || data.length === 0) {
    logger.info('prewarm: no idle veo3 accounts to warm');
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targets = data.map((a: any) => {
    const cookies = decryptCookies(a);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (a.meta ?? {}) as Record<string, any>;
    return {
      id: a.id as string,
      email: (a.label as string) ?? a.id,
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: typeof c.expires === 'number' ? c.expires : undefined,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })),
      projectId: meta.projectId as string | undefined,
    };
  });
  await prewarm(targets);
}

async function main() {
  logger.info({ poll_ms: POLL_INTERVAL, worker_id: WORKER_ID }, 'worker starting');

  if (!process.env.ENCRYPTION_KEY) {
    logger.fatal('ENCRYPTION_KEY not set — refusing to start');
    process.exit(1);
  }
  checkSystemDeps();
  await resetStuckJobs();
  await resetStuckAccounts();
  await heartbeat();
  setInterval(heartbeat, HEARTBEAT_INTERVAL);

  // Self-healing: every 30s, reset any account that has been 'busy' but
  // hasn't been touched in 3 minutes. Average gen takes <90s, so a row
  // older than 3 min is almost certainly leftover from a crash or race.
  setInterval(() => {
    void resetStuckAccounts(180).catch((e) =>
      logger.warn({ err: e?.message ?? e }, 'periodic account cleanup failed'),
    );
  }, 30_000);

  // Pre-warm the browser pool for veo3 accounts — first user-triggered job
  // hits a warm slot instead of paying ~60s cold-start. Disabled with
  // PREWARM_BROWSERS=0 (e.g. CI / local dev where the user wants fast restarts).
  if (process.env.PREWARM_BROWSERS !== '0') {
    void prewarmVeo3Accounts().catch((e) =>
      logger.warn({ err: e?.message ?? e }, 'prewarm task failed'),
    );
  }

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down');
    await shutdownBrowserPool().catch(() => {});
    await shutdownBrowser();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down');
    await shutdownBrowserPool().catch(() => {});
    await shutdownBrowser();
    process.exit(0);
  });

  while (true) {
    try {
      const job = await pollOnce();
      if (job && job.id) {
        await processJob(job);
      } else {
        await sleep(POLL_INTERVAL);
      }
    } catch (err) {
      logger.error({ err }, 'poll loop error');
      await sleep(POLL_INTERVAL);
    }
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'worker crashed');
  process.exit(1);
});
