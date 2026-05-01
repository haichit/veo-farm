'use client';

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useFlowStore, type BuilderNode } from '@/lib/builder/flow-store';
import { NODE_TYPES, PORT_COLORS } from '@/lib/builder/node-types';
import { getNodeInputPorts, parseHandleIndex } from '@/lib/builder/dynamic-ports';

// Custom React Flow edge: stroke colour matches the source port's data type,
// 2.5px width, animated dashes when source node is running.
export function ColoredEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    source,
    target,
    selected,
  } = props;

  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);

  const fullEdge = edges.find((e) => e.id === id);
  const sourceHandle = fullEdge?.sourceHandle;
  const targetHandle = fullEdge?.targetHandle;

  const sourceNode = nodes.find((n) => n.id === source) as BuilderNode | undefined;
  const targetNode = nodes.find((n) => n.id === target) as BuilderNode | undefined;

  const stroke = computeEdgeColor(sourceNode, targetNode, sourceHandle, targetHandle, edges);
  const isRunning = sourceNode?.data?.status === 'running' || targetNode?.data?.status === 'wait';

  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke,
        strokeWidth: selected ? 3 : 2.5,
        strokeDasharray: isRunning ? '8 6' : undefined,
        animation: isRunning ? 'edgeFlow 0.8s linear infinite' : undefined,
        filter: selected ? `drop-shadow(0 0 6px ${stroke}aa)` : undefined,
      }}
    />
  );
}

function computeEdgeColor(
  sourceNode: BuilderNode | undefined,
  targetNode: BuilderNode | undefined,
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
  allEdges: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[],
): string {
  // 1) Try the source node's output port at the given handle index.
  if (sourceNode?.type) {
    const def = NODE_TYPES[sourceNode.type as keyof typeof NODE_TYPES];
    if (def) {
      const idx = parseHandleIndex(sourceHandle);
      const port = def.outputs[idx ?? 0];
      if (port?.color) return port.color;
    }
  }

  // 2) Fall back to the target's resolved input port colour.
  if (targetNode?.type) {
    const inputs = getNodeInputPorts(
      { id: targetNode.id, type: targetNode.type as keyof typeof NODE_TYPES, data: targetNode.data },
      allEdges as any,
    );
    const idx = parseHandleIndex(targetHandle);
    const port = inputs[idx ?? 0];
    if (port?.color) return port.color;
  }

  return PORT_COLORS.string;
}
