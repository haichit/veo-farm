'use client';

import { useRef } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { Frame as FrameIcon, Play } from 'lucide-react';
import { useFlowStore, type BuilderNodeData } from '@/lib/builder/flow-store';
import { useWorkflowRun } from '@/lib/builder/use-workflow-run';
import { BulkDownloadButton } from '../BulkDownloadButton';

// Frame node — bounding-box visual container. Header bar floating top -34px is
// the only pointer-events:auto region; body is pointer-events:none so clicks
// pass through to child nodes inside.
export function FrameNode(props: NodeProps) {
  const { id, data, selected, positionAbsoluteX, positionAbsoluteY } = props;
  const cfg = (data as BuilderNodeData)?.config as
    | { name?: string; width?: number; height?: number }
    | undefined;
  // React Flow's NodeResizer writes the live size onto the node's
  // top-level width/height props; fall back to the persisted config size
  // for the very first render before any resize.
  const w = (props.width as number | undefined) ?? cfg?.width ?? 500;
  const h = (props.height as number | undefined) ?? cfg?.height ?? 400;
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  const scaleNodesInFrame = useFlowStore((s) => s.scaleNodesInFrame);
  const selectMany = useFlowStore((s) => s.selectMany);
  const setNodes = useFlowStore((s) => s.setNodes);
  const frameNodes = useFlowStore((s) =>
    s.nodes.filter((n) => (n.data as { frameId?: string } | undefined)?.frameId === id),
  );
  const { startRun } = useWorkflowRun();

  // Clicking the frame selects it AND every node inside it (by data.frameId,
  // same field the drag-together logic uses) — so "Chạy N đã chọn" in the
  // toolbar can run a whole frame's worth of nodes without having to
  // Shift-drag a marquee over it by hand.
  function onSelectFrame(e: React.MouseEvent) {
    // React Flow's own node-click-selection runs on this same click (it
    // narrows selection down to just the frame), which would otherwise fire
    // right after this handler and stomp our broader selection back to 1.
    // Stopping propagation here keeps it from ever reaching RF's handler.
    e.stopPropagation();
    const allNodes = useFlowStore.getState().nodes;
    const idsInFrame = allNodes
      .filter((n) => (n.data as { frameId?: string } | undefined)?.frameId === id)
      .map((n) => n.id);
    const ids = [id, ...idsInFrame];
    selectMany(ids);
    setNodes(allNodes.map((n) => ({ ...n, selected: ids.includes(n.id) })));
  }
  // Track frame box at the moment NodeResizer started so we scale children
  // relative to the OLD bounding box (not the live one which mutates per frame).
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Run frame: find every other node whose centre lies inside this frame's
  // bounding box, then run the union of their ancestors.
  function onRunFrame() {
    const allNodes = useFlowStore.getState().nodes;
    // React Flow gives positionAbsolute* (parent-relative or absolute);
    // fallback to position fields.
    const fx = positionAbsoluteX ?? (props as unknown as { xPos?: number }).xPos ?? 0;
    const fy = positionAbsoluteY ?? (props as unknown as { yPos?: number }).yPos ?? 0;
    const insideIds: string[] = [];
    for (const n of allNodes) {
      if (n.id === id || n.type === 'frame') continue;
      const nx = n.position?.x ?? 0;
      const ny = n.position?.y ?? 0;
      const nw = n.width ?? 240;
      const nh = n.height ?? 100;
      const cx = nx + nw / 2;
      const cy = ny + nh / 2;
      if (cx >= fx && cx <= fx + w && cy >= fy && cy <= fy + h) {
        insideIds.push(n.id);
      }
    }
    if (insideIds.length === 0) {
      alert('Khung này chưa chứa node nào — kéo node vào trong khung trước khi chạy.');
      return;
    }
    void startRun(insideIds);
  }

  return (
    <div
      className="relative pointer-events-none"
      style={{ width: '100%', height: '100%', minWidth: 320, minHeight: 200 }}
    >
      {/* Resize handles — pointer-events:auto override so user can grab the
          corner/edges even though the frame body is otherwise click-through. */}
      <div className="pointer-events-auto">
        <NodeResizer
          isVisible={selected}
          minWidth={320}
          minHeight={200}
          handleStyle={{
            width: 12,
            height: 12,
            borderRadius: 2,
            background: 'rgb(245, 158, 11)',
            border: '1px solid #1a1a2e',
          }}
          lineStyle={{ borderColor: 'rgba(245, 158, 11, 0.7)', borderWidth: 1 }}
          onResizeStart={() => {
            const fx = positionAbsoluteX ?? (props as unknown as { xPos?: number }).xPos ?? 0;
            const fy = positionAbsoluteY ?? (props as unknown as { yPos?: number }).yPos ?? 0;
            resizeStart.current = { x: fx, y: fy, w, h };
          }}
          onResizeEnd={(_e, params) => {
            const start = resizeStart.current;
            resizeStart.current = null;
            if (start && start.w > 0 && start.h > 0) {
              const sx = params.width / start.w;
              const sy = params.height / start.h;
              scaleNodesInFrame(start, start.x, start.y, sx, sy);
            }
            // Persist the new size into config so the next mount renders at
            // the same size before NodeResizer re-syncs.
            updateConfig(id, { width: params.width, height: params.height });
          }}
        />
      </div>
      {/* Floating header bar above the frame — clickable */}
      <div
        onClick={onSelectFrame}
        className="absolute -top-[34px] left-0 right-0 h-[28px] flex items-center gap-2 px-3 rounded-md pointer-events-auto"
        style={{
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
        }}
      >
        <FrameIcon size={12} className="text-amber-400 shrink-0" />
        <input
          type="text"
          value={cfg?.name ?? 'Khung Nhóm'}
          onChange={(e) => updateConfig(id, { name: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          className="nodrag flex-1 bg-transparent outline-none text-[11px] font-semibold text-amber-200 placeholder:text-amber-200/40"
          placeholder="Tên khung..."
        />
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRunFrame();
          }}
          className="nodrag flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 ring-1 ring-amber-500/50 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/30"
          title="Chạy mọi node bên trong khung"
        >
          <Play size={10} /> Run frame
        </button>
        <BulkDownloadButton nodes={frameNodes} compact />
      </div>

      {/* Body — dashed amber container, pointer-events:none */}
      <div
        className="w-full h-full rounded-[12px]"
        style={{
          border: selected
            ? '2px dashed rgba(245, 158, 11, 0.85)'
            : '2px dashed rgba(245, 158, 11, 0.45)',
          background: 'rgba(245, 158, 11, 0.04)',
        }}
      />
    </div>
  );
}
