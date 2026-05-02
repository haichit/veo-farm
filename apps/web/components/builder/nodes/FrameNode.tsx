'use client';

import type { NodeProps } from '@xyflow/react';
import { Frame as FrameIcon, Play } from 'lucide-react';
import { useFlowStore, type BuilderNodeData } from '@/lib/builder/flow-store';

// Frame node — bounding-box visual container. Header bar floating top -34px is
// the only pointer-events:auto region; body is pointer-events:none so clicks
// pass through to child nodes inside.
export function FrameNode(props: NodeProps) {
  const { id, data, selected } = props;
  const cfg = (data as BuilderNodeData)?.config as
    | { name?: string; width?: number; height?: number }
    | undefined;
  const w = cfg?.width ?? 500;
  const h = cfg?.height ?? 400;
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);

  return (
    <div
      className="relative pointer-events-none"
      style={{ width: w, height: h }}
    >
      {/* Floating header bar above the frame — clickable */}
      <div
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
            // TODO Day 7 — wire up frame-only run.
          }}
          className="nodrag flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-300 hover:bg-amber-500/15"
          title="Chạy các node bên trong khung"
        >
          <Play size={10} /> Run frame
        </button>
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
