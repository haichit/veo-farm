// E2E test for gemini_chat (cookies-based, no API key).
const URL = 'https://ogcsrvdfxtxcpaogplph.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const UID = '34a822f8-9b7a-46c9-8738-bec0a44b591d';
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const promptId = 'prompt-' + Date.now();
const chatId = 'gchat-' + Date.now();

const flow = {
  version: '1.0',
  name: 'gemini_chat smoke',
  executionOrder: [promptId, chatId],
  nodes: [
    { id: promptId, type: 'prompt', position: { x: 0, y: 0 },
      data: { config: { text: 'in 1 short sentence' } } },
    { id: chatId, type: 'gemini_chat', position: { x: 300, y: 0 },
      data: { config: { promptTemplate: 'Mô tả chi tiết nội dung trong media này. Đại hội Đảng. Trả lời đúng 1 câu thật ngắn không quá 20 chữ.' } } },
  ],
  edges: [
    { id: 'e1', source: promptId, target: chatId, sourceHandle: 'output-0', targetHandle: 'input-0' },
  ],
};

console.log('inserting gemini_chat job (text-only, no API key)...');
const r = await fetch(`${URL}/rest/v1/jobs`, {
  method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
  body: JSON.stringify({
    user_id: UID, flow_id: null, workflow_id: null,
    flow_graph: flow, status: 'pending', input: {},
    stats: { done: 0, wait: 2, err: 0 },
  }),
});
if (!r.ok) { console.error('insert failed', r.status, await r.text()); process.exit(1); }
const [row] = await r.json();
console.log('jobId =', row.id);

const t0 = Date.now();
while (Date.now() - t0 < 5 * 60_000) {
  await new Promise((s) => setTimeout(s, 4000));
  const q = await fetch(`${URL}/rest/v1/jobs?id=eq.${row.id}&select=status,error,stats`, { headers });
  const [j] = await q.json();
  process.stdout.write(`\r[${Math.round((Date.now() - t0) / 1000)}s] ${j.status} ${JSON.stringify(j.stats)}    `);
  if (['completed', 'failed', 'cancelled'].includes(j.status)) {
    console.log();
    if (j.error) console.log('error:', j.error.slice(0, 600));
    const s = await fetch(`${URL}/rest/v1/sub_jobs?job_id=eq.${row.id}&select=node_id,node_type,output,error`, { headers });
    const subs = await s.json();
    for (const sj of subs) {
      console.log(`  ${sj.node_type}:`, JSON.stringify(sj.output ?? {}).slice(0, 250), sj.error ? `\n    ERROR: ${sj.error.slice(0, 200)}` : '');
    }
    process.exit(j.status === 'completed' ? 0 : 1);
  }
}
console.log('\nTIMEOUT');
process.exit(1);
