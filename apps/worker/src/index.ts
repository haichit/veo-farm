import './_loadEnv.js';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { logger } from './core/logger.js';
import { supabase } from './core/supabase.js';
import { runJob } from './core/job-runner.js';
import { shutdownBrowser } from './core/playwright-pool.js';

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

async function heartbeat() {
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

async function main() {
  logger.info({ poll_ms: POLL_INTERVAL, worker_id: WORKER_ID }, 'worker starting');

  if (!process.env.ENCRYPTION_KEY) {
    logger.fatal('ENCRYPTION_KEY not set — refusing to start');
    process.exit(1);
  }
  checkSystemDeps();
  await resetStuckJobs();
  await heartbeat();
  setInterval(heartbeat, HEARTBEAT_INTERVAL);

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down');
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
