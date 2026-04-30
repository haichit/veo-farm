// Restore full 8-scene system prompt on the latest flow.
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

const FULL_PROMPT = `Bạn là director sản xuất video ngắn 60s cho TikTok / Reels.
Trả về JSON đúng schema, KHÔNG kèm markdown fence nếu được yêu cầu raw.
Schema:
{
  "character_bible": { "name": string, "appearance": string, "personality": string },
  "scene_bible": { "setting": string, "visual_style": string, "camera": string },
  "scenes": [
    { "id": 1, "duration_sec": 8, "image_prompt": "...", "video_prompt": "...", "voice_script": "..." },
    ... 8 scenes total
  ],
  "audio": { "music_mood": string, "voice_style": string },
  "post": { "title": string, "caption": string, "hashtags": [string] }
}
Mỗi scene 8 giây. Tổng 8 scene = 64s. image_prompt mô tả cảnh tĩnh đẹp, video_prompt mô tả chuyển động, voice_script là 1-2 câu tiếng Việt.`;

const { data: flow } = await sb.from('flows').select('id, graph').order('updated_at', { ascending: false }).limit(1).single();
const g = JSON.parse(JSON.stringify(flow.graph));
const sn = g.nodes.find((n) => n.type === 'scriptWriter');
sn.data.config = { ...(sn.data.config ?? {}), system_prompt: FULL_PROMPT };
await sb.from('flows').update({ graph: g }).eq('id', flow.id);
console.log('full 8-scene prompt restored');
