// E2E test: cached upstream output is reused (not re-generated) when
// the user runs only a downstream target.
//
// Workflow: prompt → gemini_vision (target). UI side has cachedOutputs
// for prompt with text "the cached prompt". Worker should reuse the
// cached prompt text when running gemini_vision instead of asking the
// prompt node to recompute.

const URL = 'https://ogcsrvdfxtxcpaogplph.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI = process.env.GEMINI_API_KEY;
if (!KEY || !GEMINI) { console.error('missing keys'); process.exit(1); }
const UID = '34a822f8-9b7a-46c9-8738-bec0a44b591d';
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const SAMPLE_IMG = 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400';

const promptId = 'prompt-' + Date.now();
const uploadId = 'upload-' + Date.now();
const gvId = 'gemini-' + Date.now();

const flow = {
  version: '1.0',
  name: 'cached reuse',
  // Pretend prompt + upload were run before — their output snapshots
  // are in cachedOutputs. Only gemini_vision is the target.
  targetNodeIds: [gvId],
  cachedOutputs: {
    [promptId]: { text: 'cached upstream text — describe what you see' },
    [uploadId]: {
      image: SAMPLE_IMG,
      imageUrl: SAMPLE_IMG,
      media: [{ url: SAMPLE_IMG, kind: 'image' }],
    },
  },
  executionOrder: [promptId, uploadId, gvId],
  nodes: [
    { id: promptId, type: 'prompt', position: { x: 0, y: 0 },
      // Note: config text is the OLD text. If worker incorrectly re-runs
      // prompt, we'd see this string. The cache should win and we never
      // see this in gemini_vision's output context.
      data: { config: { text: 'IF YOU SEE THIS, CACHE WAS BYPASSED — describe nothing' } } },
    { id: uploadId, type: 'upload_image', position: { x: 0, y: 200 },
      data: { config: { imageUrl: '', imagePath: 'cached.jpg' } } },
    { id: gvId, type: 'gemini_vision', position: { x: 300, y: 100 },
      data: { config: { apiKey: GEMINI, model: 'gemini-2.5-flash', promptTemplate: '{{text}}' } } },
  ],
  edges: [
    { id: 'e1', source: promptId, target: gvId, sourceHandle: 'output-0', targetHandle: 'input-0' },
    { id: 'e2', source: uploadId, target: gvId, sourceHandle: 'output-0', targetHandle: 'input-1' },
  ],
};

console.log('inserting partial-run job (target=gemini_vision, prompt+upload cached)...');
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
while (Date.now() - t0 < 4 * 60_000) {
  await new Promise((s) => setTimeout(s, 3000));
  const q = await fetch(`${URL}/rest/v1/jobs?id=eq.${row.id}&select=status,stats,error`, { headers });
  const [j] = await q.json();
  process.stdout.write(`\r[${Math.round((Date.now() - t0) / 1000)}s] ${j.status} ${JSON.stringify(j.stats)}    `);
  if (['completed', 'failed', 'cancelled'].includes(j.status)) {
    console.log();
    if (j.error) console.log('error:', j.error.slice(0, 400));
    const s = await fetch(`${URL}/rest/v1/sub_jobs?job_id=eq.${row.id}&select=node_id,node_type,output,error`, { headers });
    const subs = await s.json();
    const byNode = Object.fromEntries(subs.map((sj) => [sj.node_id, sj]));

    console.log('\n--- assertions ---');
    const checks = [
      ['prompt sub_job reused cached text', byNode[promptId]?.output?.text === 'cached upstream text — describe what you see'],
      ['upload sub_job reused cached image', byNode[uploadId]?.output?.image === SAMPLE_IMG],
      ['gemini_vision actually ran (has text output)', typeof byNode[gvId]?.output?.text === 'string' && byNode[gvId].output.text.length > 5],
      ['gemini sees a sky/mountain (used cached image)', /sky|star|mountain|night/i.test(byNode[gvId]?.output?.text ?? '')],
    ];
    let pass = 0, fail = 0;
    for (const [name, ok] of checks) { console.log(`  ${ok ? '✅' : '❌'} ${name}`); ok ? pass++ : fail++; }
    console.log(`\n${pass}/${pass + fail} pass`);
    console.log('\ngemini_vision output:', byNode[gvId]?.output?.text?.slice(0, 200));
    process.exit(fail === 0 ? 0 : 1);
  }
}
console.log('\nTIMEOUT');
process.exit(1);
