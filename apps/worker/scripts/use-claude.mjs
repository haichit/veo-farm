// Patch latest flow to use Claude instead of ChatGPT for script.
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

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: flow } = await sb.from('flows').select('id, user_id, graph').order('updated_at', { ascending: false }).limit(1).single();
const newGraph = JSON.parse(JSON.stringify(flow.graph));
const sn = newGraph.nodes.find((n) => n.type === 'scriptWriter');
sn.data.provider = 'claude';
await sb.from('flows').update({ graph: newGraph }).eq('id', flow.id);
console.log('flow patched: scriptWriter.provider =', sn.data.provider);
