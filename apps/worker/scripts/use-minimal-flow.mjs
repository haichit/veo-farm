// Patch latest flow to skip image+voice — direct script → video → concat.
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

// Remove edges going INTO image and voice nodes; add direct edge script → video.
g.edges = g.edges.filter((e) => e.target !== 'image' && e.target !== 'voice' && e.source !== 'image' && e.source !== 'voice');

// Wire: script → video, video → concat (skip image, voice). Also remove image/voice nodes.
g.nodes = g.nodes.filter((n) => n.type !== 'imageGenerator' && n.type !== 'voiceGen');

// Ensure script → video edge exists
const hasScriptVideo = g.edges.some((e) => e.source === 'script' && e.target === 'video');
if (!hasScriptVideo) g.edges.push({ id: 'e_sv', source: 'script', target: 'video' });

// Ensure video → concat edge exists
const hasVideoConcat = g.edges.some((e) => e.source === 'video' && e.target === 'concat');
if (!hasVideoConcat) g.edges.push({ id: 'e_vc', source: 'video', target: 'concat' });

// Set video provider to veo3 (Flow v2)
const vid = g.nodes.find((n) => n.type === 'videoRender');
if (vid) vid.data.provider = 'veo3';

await sb.from('flows').update({ graph: g }).eq('id', flow.id);
console.log('flow patched: script → video → concat → download (no image/voice)');
console.log('nodes:', g.nodes.map((n) => n.id).join(', '));
console.log('edges:', g.edges.map((e) => `${e.source}→${e.target}`).join(', '));
