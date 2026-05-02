// Verify: running node B does not wipe outputs of node A.
// Tests the ancestor walk in use-workflow-run + resetNodesStatus action
// (the bits responsible for partial reset).

// --- minimal localStorage shim so persist middleware doesn't blow up ---
globalThis.localStorage = {
  _: new Map(),
  getItem(k) { return this._.get(k) ?? null; },
  setItem(k, v) { this._.set(k, v); },
  removeItem(k) { this._.delete(k); },
};
globalThis.window = { localStorage: globalThis.localStorage };

// Manually re-implement the core actions to avoid TS/Zustand dance.
function makeStore(initialNodes, initialEdges) {
  let state = { nodes: structuredClone(initialNodes), edges: structuredClone(initialEdges) };
  return {
    get: () => state,
    setNodes: (nodes) => { state = { ...state, nodes }; },
    resetNodesStatus(ids) {
      const idSet = new Set(ids);
      state = {
        ...state,
        nodes: state.nodes.map((n) =>
          idSet.has(n.id)
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: 'idle',
                  progress: undefined,
                  error: undefined,
                  previewMedia: undefined,
                  lastOutputText: undefined,
                },
              }
            : n,
        ),
      };
    },
  };
}

// Re-implement the ancestor walk used by startRun.
function ancestorsOf(targetIds, edges) {
  const reverseAdj = new Map();
  for (const e of edges) {
    if (!reverseAdj.has(e.target)) reverseAdj.set(e.target, []);
    reverseAdj.get(e.target).push(e.source);
  }
  const seen = new Set(targetIds);
  const stack = [...targetIds];
  while (stack.length) {
    const id = stack.pop();
    for (const src of reverseAdj.get(id) ?? []) {
      if (!seen.has(src)) { seen.add(src); stack.push(src); }
    }
  }
  return [...seen];
}

// --- fixture: 2 independent branches A and B ---
const nodes = [
  { id: 'pa', type: 'prompt', position: { x: 0, y: 0 },
    data: { config: { text: 'a' }, lastOutputText: 'OUT_A_text' } },
  { id: 'ga', type: 'generate_image', position: { x: 200, y: 0 },
    data: { config: {}, previewMedia: [{ url: 'http://imgA', kind: 'image' }] } },
  { id: 'pb', type: 'prompt', position: { x: 0, y: 200 },
    data: { config: { text: 'b' }, lastOutputText: 'OUT_B_text' } },
  { id: 'gb', type: 'generate_image', position: { x: 200, y: 200 },
    data: { config: {}, previewMedia: [{ url: 'http://imgB', kind: 'image' }] } },
];
const edges = [
  { id: 'e1', source: 'pa', target: 'ga' },
  { id: 'e2', source: 'pb', target: 'gb' },
];

const store = makeStore(nodes, edges);

// --- act: run node B only (▶ on gb) ---
const targets = ['gb'];
const ancestors = ancestorsOf(targets, edges);
console.log('ancestors of [gb] =', ancestors.sort());
store.resetNodesStatus(ancestors);

const after = Object.fromEntries(store.get().nodes.map((n) => [n.id, n.data]));
console.log('\nafter reset:');
for (const [id, data] of Object.entries(after)) {
  console.log(`  ${id}: lastOutputText=${data.lastOutputText ?? '(cleared)'}  preview=${
    Array.isArray(data.previewMedia) ? JSON.stringify(data.previewMedia[0]) : '(cleared)'
  }`);
}

// --- assertions ---
const checks = [
  ['A branch text untouched', after.pa.lastOutputText === 'OUT_A_text'],
  ['A branch preview untouched', after.ga.previewMedia?.[0]?.url === 'http://imgA'],
  ['B branch text cleared', after.pb.lastOutputText === undefined],
  ['B branch preview cleared', after.gb.previewMedia === undefined],
  ['Ancestor walk includes self', ancestors.includes('gb')],
  ['Ancestor walk includes upstream', ancestors.includes('pb')],
  ['Ancestor walk excludes other branch (A)', !ancestors.includes('ga') && !ancestors.includes('pa')],
];

console.log('\nassertions:');
let pass = 0, fail = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass}/${pass + fail} pass`);
process.exit(fail === 0 ? 0 : 1);
