import './_loadEnv.js';
import { logger } from './core/logger.js';
import { supabase } from './core/supabase.js';
import { runJob } from './core/job-runner.js';
import { shutdownBrowser } from './core/playwright-pool.js';

const POLL_INTERVAL = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000);

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

async function main() {
  logger.info({ poll_ms: POLL_INTERVAL }, 'worker starting');

  if (!process.env.ENCRYPTION_KEY) {
    logger.fatal('ENCRYPTION_KEY not set — refusing to start');
    process.exit(1);
  }

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
