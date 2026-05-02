// Multi-flow integration test harness for the Builder Canvas pipeline.
// Inserts WorkflowJSON jobs directly via service role + polls until terminal.
//
//   node scripts/test-builder-flows.mjs <flow-name>
//   flow-name: image | image-to-video | merge | all

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ogcsrvdfxtxcpaogplph.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(1); }

const USER_ID = process.env.TEST_USER_ID || '34a822f8-9b7a-46c9-8738-bec0a44b591d';
const want = process.argv[2] ?? 'image';

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const ts = () => Date.now();
const id = (kind) => `${kind}-test-${ts()}-${Math.random().toString(36).slice(2, 6)}`;

function topo(nodes, edges) {
  const inDeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!inDeg.has(e.target)) continue;
    adj.get(e.source).push(e.target);
    inDeg.set(e.target, inDeg.get(e.target) + 1);
  }
  const q = []; for (const [k, v] of inDeg) if (v === 0) q.push(k);
  const out = []; while (q.length) {
    const x = q.shift(); out.push(x);
    for (const nb of adj.get(x) ?? []) {
      inDeg.set(nb, inDeg.get(nb) - 1);
      if (inDeg.get(nb) === 0) q.push(nb);
    }
  }
  return out;
}

const FLOWS = {
  image: () => {
    const p = id('prompt'), g = id('image');
    const nodes = [
      { id: p, type: 'prompt', position: { x: 0, y: 0 }, data: { config: { text: 'tao ảnh con mèo nâu vàng đang ngủ' } } },
      { id: g, type: 'generate_image', position: { x: 300, y: 0 }, data: { config: { ratio: 'landscape', quantity: 1, imageModel: 'nano_banana_2' } } },
    ];
    const edges = [{ id: 'e', source: p, target: g, sourceHandle: 'output-0', targetHandle: 'input-0' }];
    return { name: 'TEST: image', nodes, edges, executionOrder: topo(nodes, edges) };
  },
  'image-to-video': () => {
    const p = id('prompt'), gi = id('image'), gv = id('video');
    const nodes = [
      { id: p, type: 'prompt', position: { x: 0, y: 0 }, data: { config: { text: 'con mèo cam đang ngủ trên ghế gỗ, ánh sáng vàng dịu' } } },
      { id: gi, type: 'generate_image', position: { x: 300, y: 0 }, data: { config: { ratio: 'landscape', quantity: 1, imageModel: 'nano_banana_2' } } },
      { id: gv, type: 'generate_video', position: { x: 600, y: 0 }, data: { config: { ratio: 'landscape', quantity: 1, videoModel: 'veo31_fast_lower', videoMode: 'FRAME', duration: 8 } } },
    ];
    const edges = [
      { id: 'e1', source: p, target: gi, sourceHandle: 'output-0', targetHandle: 'input-0' },
      { id: 'e2', source: p, target: gv, sourceHandle: 'output-0', targetHandle: 'input-0' },
      { id: 'e3', source: gi, target: gv, sourceHandle: 'output-0', targetHandle: 'input-1' }, // Start Frame
    ];
    return { name: 'TEST: text→image→video (FRAME)', nodes, edges, executionOrder: topo(nodes, edges) };
  },
  merge: () => {
    const p = id('prompt'), v1 = id('video'), v2 = id('video'), m = id('merge');
    const nodes = [
      { id: p, type: 'prompt', position: { x: 0, y: 0 }, data: { config: { text: 'mèo con đùa nghịch trong vườn' } } },
      { id: v1, type: 'generate_video', position: { x: 300, y: -100 }, data: { config: { ratio: 'landscape', quantity: 1, videoModel: 'veo31_fast_lower', videoMode: 'FRAME', duration: 8 } } },
      { id: v2, type: 'generate_video', position: { x: 300, y: 100 }, data: { config: { ratio: 'landscape', quantity: 1, videoModel: 'veo31_fast_lower', videoMode: 'FRAME', duration: 8 } } },
      { id: m, type: 'merge_video', position: { x: 600, y: 0 }, data: { config: {} } },
    ];
    const edges = [
      { id: 'e1', source: p, target: v1, sourceHandle: 'output-0', targetHandle: 'input-0' },
      { id: 'e2', source: p, target: v2, sourceHandle: 'output-0', targetHandle: 'input-0' },
      { id: 'e3', source: v1, target: m, sourceHandle: 'output-0', targetHandle: 'input-0' },
      { id: 'e4', source: v2, target: m, sourceHandle: 'output-0', targetHandle: 'input-1' },
    ];
    return { name: 'TEST: 2 videos → merge', nodes, edges, executionOrder: topo(nodes, edges) };
  },
};

async function runFlow(name, builder) {
  const flow = builder();
  console.log(`\n▶ ${flow.name}  nodes=${flow.nodes.length} edges=${flow.edges.length}`);
  console.log(`  exec order: ${flow.executionOrder.map((id) => id.split('-')[0]).join(' → ')}`);
  const t0 = Date.now();
  const r = await fetch(`${SB_URL}/rest/v1/jobs`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: USER_ID, flow_id: null, workflow_id: null,
      flow_graph: { version: '1.0', ...flow },
      status: 'pending', input: {},
      stats: { done: 0, wait: flow.nodes.length, err: 0 },
    }),
  });
  if (!r.ok) { console.error('  ✗ insert failed', r.status, await r.text()); return false; }
  const [row] = await r.json();
  console.log(`  jobId=${row.id}`);

  const timeoutMs = 8 * 60_000;
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((s) => setTimeout(s, 3000));
    const q = await fetch(`${SB_URL}/rest/v1/jobs?id=eq.${row.id}&select=status,stats,error,output_url`, { headers });
    const [j] = await q.json();
    process.stdout.write(`\r  [${Math.round((Date.now() - t0) / 1000)}s] ${j.status} stats=${JSON.stringify(j.stats)}      `);
    if (['completed', 'failed', 'cancelled'].includes(j.status)) {
      console.log();
      const total = ((Date.now() - t0) / 1000).toFixed(1);
      if (j.status === 'completed') {
        console.log(`  ✅ COMPLETED in ${total}s   output=${j.output_url?.slice(0, 100)}…`);
      } else {
        console.log(`  ❌ ${j.status.toUpperCase()} in ${total}s   error=${(j.error ?? '').slice(0, 200)}`);
      }
      return j.status === 'completed';
    }
  }
  console.log('\n  ⏱  TIMEOUT');
  return false;
}

const flowsToRun = want === 'all' ? Object.keys(FLOWS) : [want];
for (const k of flowsToRun) {
  if (!FLOWS[k]) { console.error(`unknown flow: ${k}`); continue; }
  await runFlow(k, FLOWS[k]);
}
