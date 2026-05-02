'use client';

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  reconnectEdge,
  useReactFlow,
  type Connection,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useRef } from 'react';
import { useFlowStore } from '@/lib/builder/flow-store';
import { useKeyboardShortcuts } from '@/lib/builder/use-keyboard-shortcuts';
import { useJobSubscription } from '@/lib/builder/use-job-subscription';
import { customNodeTypes } from './nodes';
import { customEdgeTypes } from './edges';
import { PALETTE_DRAG_MIME, getDraggedType } from './NodePalette';
import { NODE_TYPES, type BuilderNodeType } from '@/lib/builder/node-types';

// Wraps React Flow with our store handlers, drag-drop from the palette, and
// canvas-level keyboard hooks. Node renderers come from `customNodeTypes`,
// edges from `customEdgeTypes` (default = ColoredEdge).
export function BuilderCanvas() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const baseOnNodesChange = useFlowStore((s) => s.onNodesChange);
  const setNodes = useFlowStore((s) => s.setNodes);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);

  // Wrap onNodesChange so a frame's position delta also shifts every node
  // whose data.frameId points at this frame. Children "move with frame".
  const onNodesChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (changes: any[]) => {
      const allNodes = useFlowStore.getState().nodes;
      // Detect frame position deltas in this batch.
      const frameDeltas = new Map<string, { dx: number; dy: number }>();
      for (const c of changes) {
        if (c?.type !== 'position' || !c.position || !c.id) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orig = allNodes.find((n: any) => n.id === c.id);
        if (!orig || orig.type !== 'frame') continue;
        const dx = c.position.x - (orig.position?.x ?? 0);
        const dy = c.position.y - (orig.position?.y ?? 0);
        if (dx !== 0 || dy !== 0) frameDeltas.set(c.id, { dx, dy });
      }
      // Apply the standard React Flow change first.
      baseOnNodesChange(changes);
      if (frameDeltas.size === 0) return;
      // Then shift every child of those frames by the same delta.
      const after = useFlowStore.getState().nodes.map((n) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fid = (n.data as any)?.frameId as string | undefined;
        if (!fid || !frameDeltas.has(fid)) return n;
        const d = frameDeltas.get(fid)!;
        return {
          ...n,
          position: { x: n.position.x + d.dx, y: n.position.y + d.dy },
        };
      });
      setNodes(after);
    },
    [baseOnNodesChange, setNodes],
  );

  const onConnect = useFlowStore((s) => s.onConnect);
  const setEdges = useFlowStore((s) => s.setEdges);
  const addNode = useFlowStore((s) => s.addNode);
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectMany = useFlowStore((s) => s.selectMany);
  const setNodeParent = useFlowStore((s) => s.setNodeParent);

  const currentJobId = useFlowStore((s) => s.currentJobId);
  useKeyboardShortcuts();
  useJobSubscription(currentJobId);

  // One-shot migration on mount: any node visually inside a frame but
  // missing data.frameId gets attached. Covers persisted state from
  // before the data.frameId mechanism existed so old workflows behave
  // correctly without making the user re-drag every node.
  const migrationDoneRef = useRef(false);
  useEffect(() => {
    if (migrationDoneRef.current) return;
    migrationDoneRef.current = true;
    const all = useFlowStore.getState().nodes;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = all.filter((n: any) => n.type === 'frame');
    if (frames.length === 0) return;
    let changed = false;
    const next = all.map((n) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = n.data as any;
      if (n.type === 'frame') return n;
      const cx = n.position.x + (n.width ?? 240) / 2;
      const cy = n.position.y + (n.height ?? 100) / 2;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const containing = frames.find((f: any) => {
        const fx = f.position.x;
        const fy = f.position.y;
        const fw = f.width ?? f.data?.config?.width ?? 500;
        const fh = f.height ?? f.data?.config?.height ?? 400;
        return cx >= fx && cx <= fx + fw && cy >= fy && cy <= fy + fh;
      });
      const newFid = containing?.id;
      if ((data?.frameId ?? undefined) !== newFid) {
        changed = true;
        return { ...n, data: { ...data, frameId: newFid } };
      }
      return n;
    });
    if (changed) {
      // eslint-disable-next-line no-console
      console.log('[builder] frame membership migrated for existing nodes');
      useFlowStore.getState().setNodes(next);
    }
  }, []);

  const { screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const raw =
        getDraggedType() ||
        e.dataTransfer.getData(PALETTE_DRAG_MIME) ||
        e.dataTransfer.getData('text/plain');
      const type = raw as BuilderNodeType;
      if (!type || !NODE_TYPES[type]) {
        // eslint-disable-next-line no-console
        console.warn('[builder] drop ignored — no recognised node type', { raw });
        return;
      }
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const newId = addNode(type, position);
      // If the drop fell inside an existing frame, attach immediately so
      // future frame drags carry this node along (onNodeDragStop only fires
      // on drag, not on palette drop).
      if (type !== 'frame') {
        const def = NODE_TYPES[type];
        const cx = position.x + def.width / 2;
        const cy = position.y + def.minHeight / 2;
        const all = useFlowStore.getState().nodes;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const containing = all.find((n: any) => {
          if (n.type !== 'frame') return false;
          const fx = n.position.x;
          const fy = n.position.y;
          const fw = n.width ?? n.data?.config?.width ?? 500;
          const fh = n.height ?? n.data?.config?.height ?? 400;
          return cx >= fx && cx <= fx + fw && cy >= fy && cy <= fy + fh;
        });
        if (containing) setNodeParent(newId, containing.id);
      }
    },
    [screenToFlowPosition, addNode, setNodeParent],
  );

  // After dragging a node, if its centre lands inside any frame, attach it
  // as a child so the frame "groups" it (frame moves → child moves).
  // Drag a child outside all frames to detach.
  const onNodeDragStop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_evt: React.MouseEvent, node: any) => {
      if (node?.type === 'frame') return;
      const allNodes = useFlowStore.getState().nodes;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frames = allNodes.filter((n: any) => n.type === 'frame');
      // Compute child's absolute centre (parent.position + child.position).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parent = (node.parentId as string | undefined)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? allNodes.find((n: any) => n.id === node.parentId)
        : null;
      const cx = (parent?.position?.x ?? 0) + node.position.x + (node.width ?? 240) / 2;
      const cy = (parent?.position?.y ?? 0) + node.position.y + (node.height ?? 100) / 2;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const containing = frames.find((f: any) => {
        const fx = f.position.x;
        const fy = f.position.y;
        const fw = f.width ?? f.data?.config?.width ?? 500;
        const fh = f.height ?? f.data?.config?.height ?? 400;
        return cx >= fx && cx <= fx + fw && cy >= fy && cy <= fy + fh;
      });
      const newParent = containing ? containing.id : null;
      // Read membership from our own data.frameId field — RF's parentId
      // isn't used anymore so node.parentId is always undefined.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldParent = ((node.data as any)?.frameId as string | undefined) ?? null;
      if (newParent !== oldParent) setNodeParent(node.id, newParent);
    },
    [setNodeParent],
  );

  const isValidConnection = useCallback(
    (c: Connection | { source: string | null; target: string | null }) => {
      if (!c.source || !c.target) return false;
      if (c.source === c.target) return false;
      return true;
    },
    [],
  );

  // Edge reconnection — drag either endpoint of an existing edge to a new
  // port. If the user drops onto empty canvas, the edge is removed instead.
  const reconnectDoneRef = useRef(true);
  const onReconnectStart = useCallback(() => {
    reconnectDoneRef.current = false;
  }, []);
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      reconnectDoneRef.current = true;
      setEdges(reconnectEdge(oldEdge, newConnection, useFlowStore.getState().edges));
    },
    [setEdges],
  );
  const onReconnectEnd = useCallback(
    (_evt: unknown, edge: Edge) => {
      if (!reconnectDoneRef.current) {
        // Endpoint dropped on empty canvas → delete the edge.
        setEdges(useFlowStore.getState().edges.filter((e) => e.id !== edge.id));
      }
      reconnectDoneRef.current = true;
    },
    [setEdges],
  );

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 bg-bg-primary builder-canvas-wrapper"
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnter={(e) => e.preventDefault()}
    >
      <ReactFlow
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        edgesReconnectable
        nodeTypes={customNodeTypes}
        edgeTypes={customEdgeTypes}
        defaultEdgeOptions={{ type: 'colored', reconnectable: true }}
        isValidConnection={isValidConnection}
        onSelectionChange={({ nodes: selNodes }) => {
          if (selNodes.length === 0) selectNode(null);
          else if (selNodes.length === 1) selectNode(selNodes[0].id);
          else selectMany(selNodes.map((n) => n.id));
        }}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
        // Left-drag pans the canvas (default). Hold Shift while dragging
        // on empty canvas to box-select nodes. Cmd/Ctrl+click toggles a
        // node into the current selection.
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Meta', 'Control']}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        panOnScroll={false}
        zoomOnScroll
        className="builder-canvas"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(138, 92, 246, 0.12)"
        />
        <Controls
          position="bottom-right"
          showInteractive={false}
          className="!bg-bg-secondary !border !border-border !rounded-lg overflow-hidden"
        />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          maskColor="rgba(10, 10, 18, 0.7)"
          nodeColor={(n) => NODE_TYPES[n.type as BuilderNodeType]?.color ?? '#8a5cf6'}
          className="!bg-bg-secondary !border !border-border !rounded-lg"
        />
      </ReactFlow>
    </div>
  );
}
