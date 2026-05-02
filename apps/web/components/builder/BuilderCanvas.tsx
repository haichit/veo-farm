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
import { useCallback, useRef } from 'react';
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
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const setEdges = useFlowStore((s) => s.setEdges);
  const addNode = useFlowStore((s) => s.addNode);
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectMany = useFlowStore((s) => s.selectMany);
  const setNodeParent = useFlowStore((s) => s.setNodeParent);

  const currentJobId = useFlowStore((s) => s.currentJobId);
  useKeyboardShortcuts();
  useJobSubscription(currentJobId);

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
      // Try sources in order: module ref (most reliable) → custom MIME →
      // text/plain. Some browsers/extensions strip dataTransfer payloads.
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
      addNode(type, position);
    },
    [screenToFlowPosition, addNode],
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldParent = (node.parentId as string | undefined) ?? null;
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
