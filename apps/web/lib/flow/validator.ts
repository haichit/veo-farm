import type { FlowGraph } from '@veo-farm/shared';

export function topologicalSort(graph: FlowGraph): string[] {
  const inDeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  graph.nodes.forEach((n) => {
    inDeg.set(n.id, 0);
    out.set(n.id, []);
  });
  graph.edges.forEach((e) => {
    out.get(e.source)?.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  });
  const queue: string[] = [];
  inDeg.forEach((d, id) => d === 0 && queue.push(id));
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    out.get(id)?.forEach((t) => {
      const nd = (inDeg.get(t) ?? 0) - 1;
      inDeg.set(t, nd);
      if (nd === 0) queue.push(t);
    });
  }
  if (order.length !== graph.nodes.length) {
    throw new Error('Graph has a cycle');
  }
  return order;
}

export function validateFlow(graph: FlowGraph): string[] {
  const errors: string[] = [];
  if (graph.nodes.length === 0) errors.push('Graph rỗng');
  const hasIdea = graph.nodes.some((n) => n.type === 'ideaInput');
  const hasDownload = graph.nodes.some((n) => n.type === 'download');
  if (!hasIdea) errors.push('Thiếu node Idea');
  if (!hasDownload) errors.push('Thiếu node Download');
  try {
    topologicalSort(graph);
  } catch (e: any) {
    errors.push(e.message);
  }
  return errors;
}
