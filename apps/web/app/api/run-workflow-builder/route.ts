import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { WorkflowJSON } from '@veo-farm/shared';

// Launch a Builder Canvas run.
// Body: { workflow: WorkflowJSON, workflowId?: string (when saved) }
// → inserts a `jobs` row with flow_graph + workflow_id; the worker picks
//   up by status='pending' and walks the graph in topological order.
export async function POST(req: Request) {
  const sb = createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const wf = body?.workflow as WorkflowJSON | undefined;
  if (!wf || !Array.isArray(wf.nodes) || !Array.isArray(wf.edges)) {
    return NextResponse.json({ error: 'workflow JSON missing or malformed' }, { status: 400 });
  }
  if (wf.nodes.length === 0) {
    return NextResponse.json({ error: 'workflow has no nodes' }, { status: 400 });
  }

  const order = topologicalSort(wf);
  if (!order) {
    return NextResponse.json({ error: 'workflow contains a cycle' }, { status: 400 });
  }

  // Optional: per-node Run / Run-frame buttons pass target node id(s) so the
  // worker only executes the target's transitive dependencies (saves time +
  // tokens when iterating on a single branch or frame).
  let executionOrder = order;
  // Accept both new array shape and the legacy single targetNodeId.
  const targetIdsRaw = Array.isArray(body?.targetNodeIds)
    ? body.targetNodeIds
    : typeof body?.targetNodeId === 'string'
      ? [body.targetNodeId]
      : null;
  const targetNodeIds: string[] | null =
    targetIdsRaw && targetIdsRaw.length > 0
      ? targetIdsRaw.filter((x: unknown): x is string => typeof x === 'string')
      : null;
  if (targetNodeIds) {
    const reachable = new Set<string>();
    for (const t of targetNodeIds) {
      for (const id of collectAncestors(wf, t)) reachable.add(id);
    }
    executionOrder = order.filter((id) => reachable.has(id));
  }

  const { data, error } = await sb
    .from('jobs')
    .insert({
      user_id: user.id,
      flow_id: null,
      workflow_id: typeof body?.workflowId === 'string' ? body.workflowId : null,
      flow_graph: {
        ...wf,
        executionOrder,
        targetNodeIds,
        // UI-supplied snapshot of upstream outputs so the worker can skip
        // re-generation on a partial run. Keys are nodeId, values are
        // {text?, image?, video?, media?, imageUrl?}.
        cachedOutputs:
          body?.cachedOutputs && typeof body.cachedOutputs === 'object'
            ? body.cachedOutputs
            : undefined,
      },
      status: 'pending',
      input: {},
      stats: { done: 0, wait: executionOrder.length, err: 0 },
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ jobId: data.id });
}

// Walk edges backwards from `targetId` and collect every transitive
// upstream node (plus the target itself). Used to trim the execution
// order when the user clicks Run on a specific node.
function collectAncestors(wf: WorkflowJSON, targetId: string): Set<string> {
  const reverseAdj = new Map<string, string[]>();
  for (const e of wf.edges) {
    if (!reverseAdj.has(e.target)) reverseAdj.set(e.target, []);
    reverseAdj.get(e.target)!.push(e.source);
  }
  const seen = new Set<string>([targetId]);
  const stack = [targetId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const src of reverseAdj.get(id) ?? []) {
      if (!seen.has(src)) {
        seen.add(src);
        stack.push(src);
      }
    }
  }
  return seen;
}

// Kahn's algorithm — null on cycle.
function topologicalSort(wf: WorkflowJSON): string[] | null {
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of wf.nodes) {
    inDeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of wf.edges) {
    if (!inDeg.has(e.source) || !inDeg.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, d] of inDeg.entries()) if (d === 0) queue.push(id);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const nb of adj.get(id) ?? []) {
      inDeg.set(nb, (inDeg.get(nb) ?? 0) - 1);
      if (inDeg.get(nb) === 0) queue.push(nb);
    }
  }
  return out.length === wf.nodes.length ? out : null;
}
