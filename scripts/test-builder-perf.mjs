// Test harness — insert N builder jobs into DB and watch them complete.
// Service-role bypass auth. Measures end-to-end time per job + warm reuse.
//
//   node scripts/test-builder-perf.mjs [count]

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ogcsrvdfxtxcpaogplph.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(1);
}
const USER_ID = process.env.TEST_USER_ID || '34a822f8-9b7a-46c9-8738-bec0a44b591d';
const COUNT = Number(process.argv[2] ?? 3);

const headers = {
  apikey: KEY, Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

const promptNodeId = `prompt-test-${Date.now()}`;
const imgNodeId = `generate_image-test-${Date.now()}`;

function buildFlow(prompt) {
  return {
    version: '1.0',
    name: 'perf test',
    executionOrder: [promptNodeId, imgNodeId],
    nodes: [
      { id: promptNodeId, type: 'prompt', position: { x: 100, y: 100 },
        data: { config: { text: prompt } } },
      { id: imgNodeId, type: 'generate_image', position: { x: 400, y: 100 },
        data: { config: { ratio: 'landscape', quantity: 1, imageModel: 'nano_banana_2' } } },
    ],
    edges: [
      { id: 'e1', source: promptNodeId, target: imgNodeId, sourceHandle: 'output-0', targetHandle: 'input-0' },
    ],
  };
}

async function insertJob(prompt) {
  const r = await fetch(`${SB_URL}/rest/v1/jobs`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: USER_ID,
      flow_id: null,
      workflow_id: null,
      flow_graph: buildFlow(prompt),
      status: 'pending',
      input: {},
      stats: { done: 0, wait: 2, err: 0 },
    }),
  });
  if (!r.ok) throw new Error(`insert ${r.status}: ${await r.text()}`);
  const [row] = await r.json();
  return row.id;
}

async function getJobStatus(id) {
  const r = await fetch(
    `${SB_URL}/rest/v1/jobs?id=eq.${id}&select=status,started_at,finished_at,stats,error`,
    { headers },
  );
  const [row] = await r.json();
  return row;
}

async function waitTerminal(id, timeoutMs = 4 * 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const j = await getJobStatus(id);
    if (j && (j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled')) return j;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`timeout waiting for ${id}`);
}

async function main() {
  const results = [];
  for (let i = 1; i <= COUNT; i++) {
    const prompt = `tao ảnh con mèo số ${i}`;
    const t0 = Date.now();
    const id = await insertJob(prompt);
    console.log(`[${i}] inserted ${id}  prompt="${prompt}"`);
    const job = await waitTerminal(id);
    const total = ((Date.now() - t0) / 1000).toFixed(1);
    const started = job.started_at ? new Date(job.started_at).getTime() : null;
    const finished = job.finished_at ? new Date(job.finished_at).getTime() : null;
    const queueWait = started ? ((started - t0) / 1000).toFixed(1) : '?';
    const exec = started && finished ? ((finished - started) / 1000).toFixed(1) : '?';
    console.log(
      `[${i}] ${job.status.toUpperCase()}  total=${total}s  queue=${queueWait}s  exec=${exec}s  stats=${JSON.stringify(job.stats)}${
        job.error ? `  error=${job.error.slice(0, 100)}` : ''
      }`,
    );
    results.push({ i, total: +total, exec: +exec, status: job.status });
  }
  console.log('\n=== summary ===');
  for (const r of results) console.log(`  job ${r.i}: ${r.status}  exec=${r.exec}s`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
