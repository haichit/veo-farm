// Insert a gemini_vision-only job and watch the sub_jobs output.
const URL = 'https://ogcsrvdfxtxcpaogplph.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI = process.env.GEMINI_API_KEY;
if (!KEY || !GEMINI) { console.error('missing keys'); process.exit(1); }
const UID = '34a822f8-9b7a-46c9-8738-bec0a44b591d';
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// Use a known small image URL as the "media" upstream input (avoids upload step).
const SAMPLE_IMG = 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400';

const promptId = 'prompt-' + Date.now();
const uploadId = 'upload-' + Date.now();
const gvId = 'gemini-' + Date.now();

const flow = {
  version: '1.0',
  name: 'gemini_vision smoke',
  executionOrder: [promptId, uploadId, gvId],
  nodes: [
    { id: promptId, type: 'prompt', position: { x: 0, y: 0 }, data: { config: { text: 'in 1 short sentence' } } },
    // Hack: use upload_image with imageUrl pre-set so its executor
    // emits {media:[{url}]} without needing an actual file pick.
    { id: uploadId, type: 'upload_image', position: { x: 0, y: 200 }, data: { config: { imageUrl: SAMPLE_IMG, imagePath: 'mountain.jpg' } } },
    { id: gvId, type: 'gemini_vision', position: { x: 300, y: 100 }, data: { config: { apiKey: GEMINI, model: 'gemini-2.5-flash', promptTemplate: 'Describe what you see in this image briefly. {{text}}' } } },
  ],
  edges: [
    { id: 'e1', source: promptId, target: gvId, sourceHandle: 'output-0', targetHandle: 'input-0' },
    { id: 'e2', source: uploadId, target: gvId, sourceHandle: 'output-0', targetHandle: 'input-1' },
  ],
};

console.log('inserting test job...');
const r = await fetch(`${URL}/rest/v1/jobs`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'return=representation' },
  body: JSON.stringify({
    user_id: UID, flow_id: null, workflow_id: null,
    flow_graph: flow, status: 'pending', input: {},
    stats: { done: 0, wait: 3, err: 0 },
  }),
});
if (!r.ok) { console.error('insert failed', r.status, await r.text()); process.exit(1); }
const [row] = await r.json();
console.log('jobId =', row.id);

const t0 = Date.now();
while (Date.now() - t0 < 5 * 60_000) {
  await new Promise((s) => setTimeout(s, 3000));
  const q = await fetch(`${URL}/rest/v1/jobs?id=eq.${row.id}&select=status,stats,error`, { headers });
  const [j] = await q.json();
  process.stdout.write(`\r[${Math.round((Date.now() - t0) / 1000)}s] ${j.status} ${JSON.stringify(j.stats)}    `);
  if (['completed', 'failed', 'cancelled'].includes(j.status)) {
    console.log();
    if (j.error) console.log('error:', j.error.slice(0, 400));
    const s = await fetch(`${URL}/rest/v1/sub_jobs?job_id=eq.${row.id}&select=node_id,node_type,output,error`, { headers });
    const subs = await s.json();
    for (const sj of subs) {
      console.log(`\n  ${sj.node_type} ${sj.node_id}:`);
      console.log('    output:', JSON.stringify(sj.output).slice(0, 500));
      if (sj.error) console.log('    error:', sj.error.slice(0, 300));
    }
    process.exit(j.status === 'completed' ? 0 : 1);
  }
}
console.log('\nTIMEOUT');
process.exit(1);
