'use client';

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback } from 'react';
import { useFlowStore } from '@/lib/builder/flow-store';
import { customNodeTypes } from './nodes';
import { customEdgeTypes } from './edges';
import { PALETTE_DRAG_MIME } from './NodePalette';
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
  const addNode = useFlowStore((s) => s.addNode);
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectMany = useFlowStore((s) => s.selectMany);

  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(PALETTE_DRAG_MIME) as BuilderNodeType;
      if (!type || !NODE_TYPES[type]) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(type, position);
    },
    [screenToFlowPosition, addNode],
  );

  const isValidConnection = useCallback(
    (c: Connection | { source: string | null; target: string | null }) => {
      if (!c.source || !c.target) return false;
      if (c.source === c.target) return false;
      return true;
    },
    [],
  );

  return (
    <div className="flex-1 relative bg-bg-primary" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={customNodeTypes}
        edgeTypes={customEdgeTypes}
        defaultEdgeOptions={{ type: 'colored' }}
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
        panOnDrag={[1, 2]}
        selectionOnDrag
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Meta', 'Control']}
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
