// Patch latest flow: video provider = veo3 (Flow v2 plugin).
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
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});

const { data: flow } = await sb.from('flows').select('id, graph').order('updated_at', { ascending: false }).limit(1).single();
const g = JSON.parse(JSON.stringify(flow.graph));
const vid = g.nodes.find((n) => n.type === 'videoRender');
vid.data.provider = 'veo3';
await sb.from('flows').update({ graph: g }).eq('id', flow.id);
console.log('video provider set to: veo3 (Flow v2)');
