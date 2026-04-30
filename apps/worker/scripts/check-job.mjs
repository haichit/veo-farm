// Inspect latest job + its sub_jobs.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(here, '../../../.env'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const arg = process.argv[2];
let job;
if (arg) {
  ({ data: job } = await sb.from('jobs').select('*').eq('id', arg).single());
} else {
  ({ data: job } = await sb.from('jobs').select('*').order('created_at', { ascending: false }).limit(1).single());
}

if (!job) {
  console.log('no job found');
  process.exit(0);
}

console.log(`Job ${job.id}`);
console.log(`  status: ${job.status}`);
console.log(`  idea:   ${job.input?.idea ?? '(none)'}`);
console.log(`  output: ${job.output_url ?? '(none)'}`);
if (job.error) console.log(`  ERROR:  ${job.error}`);
console.log(`  started: ${job.started_at ?? '(not yet)'}`);
console.log(`  ended:   ${job.finished_at ?? '(not yet)'}`);

const { data: subs } = await sb
  .from('sub_jobs')
  .select('*')
  .eq('job_id', job.id)
  .order('created_at', { ascending: true });

console.log(`\nSub-jobs (${subs?.length ?? 0}):`);
for (const s of subs ?? []) {
  const tag = `${s.node_type}/${s.provider_id ?? '-'}`;
  console.log(`  [${s.status}] ${tag}  ${s.error ? '⚠ ' + s.error.slice(0, 120) : ''}`);
  if (s.output) {
    const url = s.output.imageUrl || s.output.videoUrl || s.output.audioUrl;
    if (url) console.log(`         → ${url.slice(0, 80)}...`);
  }
}
