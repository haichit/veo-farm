// Create a new run for the most recent flow.
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

const idea = process.argv[2] ?? 'một con mèo uống cà phê buổi sáng';

const { data: flow } = await sb
  .from('flows')
  .select('id, user_id, graph')
  .order('updated_at', { ascending: false })
  .limit(1)
  .single();

if (!flow) {
  console.error('No flow found');
  process.exit(1);
}

const { data: job, error } = await sb
  .from('jobs')
  .insert({
    flow_id: flow.id,
    user_id: flow.user_id,
    status: 'pending',
    input: { idea },
  })
  .select()
  .single();

if (error) {
  console.error('insert job error:', error);
  process.exit(1);
}

console.log('created job:', job.id, '— idea:', idea);
console.log('watch worker terminal for progress.');
