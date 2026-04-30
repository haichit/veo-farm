// Trigger a job with a SIMPLIFIED system prompt to verify ChatGPT plugin pipeline.
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

// Patch the latest flow's scriptWriter system_prompt to a tiny one for testing.
const { data: flow } = await sb.from('flows').select('id, user_id, graph').order('updated_at', { ascending: false }).limit(1).single();
const newGraph = JSON.parse(JSON.stringify(flow.graph));
const sn = newGraph.nodes.find((n) => n.type === 'scriptWriter');
sn.data.config = sn.data.config ?? {};
sn.data.config.system_prompt = 'Trả lời JSON đúng schema, ngắn gọn (1 scene). Schema: {"character_bible":{"name":"...","appearance":"...","personality":"..."},"scene_bible":{"setting":"...","visual_style":"...","camera":"..."},"scenes":[{"id":1,"duration_sec":8,"image_prompt":"...","video_prompt":"...","voice_script":"..."}],"audio":{"music_mood":"...","voice_style":"..."},"post":{"title":"...","caption":"...","hashtags":["..."]}}';

await sb.from('flows').update({ graph: newGraph }).eq('id', flow.id);
console.log('patched flow with shortened prompt');

const idea = process.argv[2] ?? 'mèo';
const { data: job } = await sb.from('jobs').insert({
  flow_id: flow.id, user_id: flow.user_id, status: 'pending', input: { idea },
}).select().single();

console.log('triggered job:', job.id);
