// Standalone smoke test — validates the same SELECT shape useJobSubscription
// uses against the live DB, then runs the extract/apply pipeline so we can
// see exactly what would land in the flow store.
//
//   node apps/web/lib/builder/__test_subscription.mjs <jobId>
//
// Service-role bypasses RLS so we can verify the worker wrote the rows.
// Browser auth is a separate concern but uses the SAME query shape.

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ogcsrvdfxtxcpaogplph.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY missing — set it before running.');
  process.exit(1);
}

const jobId = process.argv[2];
if (!jobId) {
  console.error('usage: __test_subscription.mjs <jobId>');
  process.exit(1);
}

async function fetchRows(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

function normaliseStatus(s) {
  return ({ pending: 'wait', running: 'running', completed: 'done', failed: 'error' })[s] ?? 'idle';
}

function extractMedia(output) {
  if (!output || typeof output !== 'object') return [];
  if (Array.isArray(output.media)) return output.media;
  if (Array.isArray(output.images)) return output.images.map((u) => ({ url: u, kind: 'image' }));
  if (Array.isArray(output.videos)) return output.videos.map((u) => ({ url: u, kind: 'video' }));
  if (typeof output.url === 'string') return [{ url: output.url, kind: /\.(mp4|webm)$/i.test(output.url) ? 'video' : 'image' }];
  return [];
}

const subRows = await fetchRows(
  `sub_jobs?job_id=eq.${jobId}&select=node_id,node_type,status,error,output`,
);
const [jobRow] = await fetchRows(`jobs?id=eq.${jobId}&select=status,stats`);

console.log('=== JOB ===');
console.log({ status: jobRow?.status, stats: jobRow?.stats });
console.log('\n=== SUB_JOBS APPLIED ===');
for (const r of subRows) {
  const media = extractMedia(r.output);
  console.log({
    node_id: r.node_id,
    node_type: r.node_type,
    apply_status: normaliseStatus(r.status),
    apply_media: media.length,
    media_first: media[0],
  });
}

console.log('\n=== EXPECTED FLOW STORE STATE ===');
console.log('runState:', jobRow?.status === 'completed' || jobRow?.status === 'failed' ? 'idle' : jobRow?.status);
console.log('stats:', jobRow?.stats);
const statusByNode = Object.fromEntries(subRows.map((r) => [r.node_id, normaliseStatus(r.status)]));
console.log('node statuses:', statusByNode);
const mediaByNode = Object.fromEntries(
  subRows.map((r) => [r.node_id, extractMedia(r.output)]).filter(([, m]) => m.length),
);
console.log('node previewMedia:', mediaByNode);
