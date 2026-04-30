import type { FlowGraph, FlowNode } from '@veo-farm/shared';

export function topologicalSort(graph: FlowGraph): FlowNode[] {
  const inDeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  const byId = new Map<string, FlowNode>();
  graph.nodes.forEach((n) => {
    inDeg.set(n.id, 0);
    out.set(n.id, []);
    byId.set(n.id, n);
  });
  graph.edges.forEach((e) => {
    out.get(e.source)?.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  });
  const queue: string[] = [];
  inDeg.forEach((d, id) => d === 0 && queue.push(id));
  const order: FlowNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    out.get(id)?.forEach((t) => {
      const nd = (inDeg.get(t) ?? 0) - 1;
      inDeg.set(t, nd);
      if (nd === 0) queue.push(t);
    });
  }
  if (order.length !== graph.nodes.length) throw new Error('Graph has a cycle');
  return order;
}

export function getIncomingNodes(nodeId: string, graph: FlowGraph): FlowNode[] {
  const sources = graph.edges.filter((e) => e.target === nodeId).map((e) => e.source);
  return graph.nodes.filter((n) => sources.includes(n.id));
}
