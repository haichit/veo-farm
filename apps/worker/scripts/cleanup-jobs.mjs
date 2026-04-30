// One-shot cleanup: cancel stuck jobs, prune their sub_jobs.
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

const { data: stuck, error: e1 } = await sb
  .from('jobs')
  .update({ status: 'cancelled', finished_at: new Date().toISOString() })
  .in('status', ['pending', 'running'])
  .select('id');
if (e1) {
  console.error('update jobs error:', e1);
  process.exit(1);
}
console.log(`cancelled ${stuck.length} jobs:`, stuck.map((j) => j.id));

const ids = stuck.map((j) => j.id);
if (ids.length) {
  const { error: e2 } = await sb.from('sub_jobs').delete().in('job_id', ids);
  if (e2) console.error('delete sub_jobs error:', e2);
  else console.log('sub_jobs cleaned');
}
