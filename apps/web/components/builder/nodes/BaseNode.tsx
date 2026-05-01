'use client';

import * as Icons from 'lucide-react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Loader2, CheckCircle2, AlertCircle, Info, Download, Play, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  NODE_TYPES,
  NODE_AVG_RUNTIME_MS,
  type BuilderNodeType,
} from '@/lib/builder/node-types';
import { getNodeInputPorts, inputHandleId, outputHandleId } from '@/lib/builder/dynamic-ports';
import { useFlowStore, type BuilderNodeData } from '@/lib/builder/flow-store';
import { PreviewMedia } from '../preview/PreviewMedia';

interface BaseNodeProps extends NodeProps {
  /** Body content rendered between header and ports overlay. */
  children?: ReactNode;
  /** Optional override for the run button — gemini_prompt uses ✨ Sparkles instead of ▶ Play. */
  runIcon?: 'play' | 'sparkles' | 'upload' | 'none';
  /** Called when the per-node run button is pressed. */
  onRun?: () => void;
  /** Disable run button (no input + no fallback config). */
  runDisabled?: boolean;
  /** Show download button (set to true when previewMedia.length > 0). */
  showDownload?: boolean;
  onDownload?: () => void;
  /** Show info button (always visible). */
  onInfoClick?: () => void;
}

export function BaseNode(props: BaseNodeProps) {
  const { id, type, data, selected, children, runIcon = 'none', onRun, runDisabled, showDownload, onDownload, onInfoClick } = props;
  const def = NODE_TYPES[type as BuilderNodeType];
  const status = (data as BuilderNodeData)?.status ?? 'idle';
  const error = (data as BuilderNodeData)?.error;
  const previewMedia = (data as BuilderNodeData)?.previewMedia ?? [];
  const edges = useFlowStore((s) => s.edges);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === id));
  const selectNode = useFlowStore((s) => s.selectNode);

  // Auto-derive showDownload when caller didn't override it.
  const effectiveShowDownload = showDownload ?? previewMedia.length > 0;
  // Default Info click → open right editor panel.
  const effectiveInfoClick = onInfoClick ?? (() => selectNode(id));
  // Default Download click → open first media in a new tab.
  const effectiveDownload =
    onDownload ??
    (() => {
      const m = previewMedia[0];
      if (!m) return;
      const a = document.createElement('a');
      a.href = m.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.download = '';
      a.click();
    });

  const dynamicInputs = useMemo(() => {
    if (!node) return def?.inputs ?? [];
    return getNodeInputPorts({ id, type: type ?? 'prompt', data: node.data }, edges);
  }, [node, edges, id, type, def]);

  if (!def) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = ((Icons as any)[def.icon] ?? Icons.Box) as Icons.LucideIcon;

  const borderClass = selected
    ? 'border-2'
    : status === 'running'
      ? 'border-2 border-info'
      : status === 'done'
        ? 'border-2 border-success/50'
        : status === 'error'
          ? 'border-2 border-error/50'
          : 'border border-white/[0.08]';

  const shadowStyle = selected
    ? { boxShadow: `0 2px 16px ${def.color}60` }
    : status === 'running'
      ? { boxShadow: '0 0 20px rgba(96,165,250,0.3)' }
      : status === 'done'
        ? { boxShadow: '0 0 20px rgba(52,211,153,0.2)' }
        : status === 'error'
          ? { boxShadow: '0 0 20px rgba(239,68,68,0.2)' }
          : undefined;

  return (
    <div
      className={`relative bg-[#1a1a2e] rounded-[10px] transition-all ${borderClass}`}
      style={{
        width: def.width,
        minHeight: def.minHeight,
        ...shadowStyle,
        ...(selected ? { borderColor: def.color } : {}),
      }}
    >
      {/* Input handles (dynamic) */}
      {dynamicInputs.map((port, i) => (
        <Handle
          key={inputHandleId(i)}
          type="target"
          position={Position.Left}
          id={inputHandleId(i)}
          className="!w-[14px] !h-[14px]"
          style={{
            top: 50 + i * 28,
            background: port.color,
            border: '2px solid #1a1a2e',
          }}
        >
          <span
            className="absolute left-[14px] top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none text-[10px] font-medium"
            style={{ color: '#8888a0' }}
          >
            {port.name}
            {port.optional && <span className="opacity-60"> (opt)</span>}
          </span>
        </Handle>
      ))}

      {/* Output handles (static) */}
      {def.outputs.map((port, i) => (
        <Handle
          key={outputHandleId(i)}
          type="source"
          position={Position.Right}
          id={outputHandleId(i)}
          className="!w-[14px] !h-[14px]"
          style={{
            top: 50 + i * 28,
            background: port.color,
            border: '2px solid #1a1a2e',
          }}
        >
          <span
            className="absolute right-[14px] top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none text-[10px] font-medium"
            style={{ color: '#8888a0' }}
          >
            {port.name}
          </span>
        </Handle>
      ))}

      {/* Header (36px) */}
      <div
        className="flex items-center gap-2 h-9 px-3 rounded-t-[10px]"
        style={{
          background: `${def.color}30`,
          borderBottom: `1px solid ${def.color}40`,
        }}
      >
        {/* Status dot before title */}
        {(status === 'done' || status === 'error') && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: status === 'done' ? '#34d399' : '#ef4444' }}
          />
        )}
        <Icon size={14} style={{ color: def.color }} />
        <h3 className="font-bold text-[12px] text-[#f0f0f5] flex-1 truncate">{def.label}</h3>

        {/* Header buttons (right) */}
        <div className="flex items-center gap-1 shrink-0">
          {status === 'running' && <Loader2 className="animate-spin text-info" size={14} />}
          {status === 'done' && !effectiveShowDownload && <CheckCircle2 className="text-success" size={14} />}
          {status === 'error' && <AlertCircle className="text-error" size={14} />}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              effectiveInfoClick();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="nodrag w-[22px] h-[22px] flex items-center justify-center rounded text-[#a0aec0] hover:bg-white/10"
            title="Chi tiết"
          >
            <Info size={12} />
          </button>
          {effectiveShowDownload && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                effectiveDownload();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="nodrag w-[22px] h-[22px] flex items-center justify-center rounded text-success hover:bg-success/10"
              title="Tải xuống"
            >
              <Download size={12} />
            </button>
          )}
          {runIcon !== 'none' && (
            <button
              type="button"
              disabled={runDisabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!runDisabled) onRun?.();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`nodrag w-[22px] h-[22px] flex items-center justify-center rounded transition-colors ${
                runDisabled
                  ? 'text-[#444] cursor-not-allowed'
                  : runIcon === 'sparkles'
                    ? 'text-[#84cc16] hover:bg-[#84cc16]/10'
                    : runIcon === 'upload'
                      ? 'text-warning hover:bg-warning/10'
                      : 'text-accent hover:bg-accent/10'
              }`}
              title={
                runDisabled
                  ? 'Cần kết nối điểm [prompt] trước khi chạy node này!'
                  : runIcon === 'upload'
                    ? 'Upload media'
                    : 'Chạy node'
              }
            >
              {runIcon === 'sparkles' ? (
                <Sparkles size={12} />
              ) : runIcon === 'upload' ? (
                <Icons.Upload size={12} />
              ) : (
                <Play size={12} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        {children}
        {(data as BuilderNodeData)?.previewMedia && (data as BuilderNodeData).previewMedia!.length > 0 && (
          <PreviewMedia media={(data as BuilderNodeData).previewMedia!} />
        )}
      </div>

      {/* Loading ring overlay */}
      {status === 'running' && <LoadingRing nodeType={type as BuilderNodeType} color={def.color} />}

      {/* Error message inline */}
      {status === 'error' && error && (
        <div className="px-3 pb-2 text-[10px] text-error truncate" title={error}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

function LoadingRing({ nodeType, color }: { nodeType: BuilderNodeType; color: string }) {
  const startRef = useRef<number>(Date.now());
  const [pct, setPct] = useState(0);
  const avg = NODE_AVG_RUNTIME_MS[nodeType] ?? 30_000;

  useEffect(() => {
    startRef.current = Date.now();
    const t = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setPct(Math.min(95, (elapsed / avg) * 100));
    }, 200);
    return () => clearInterval(t);
  }, [avg]);

  return (
    <div className="absolute inset-1 bg-[rgba(14,14,28,0.65)] rounded-md flex flex-col items-center justify-center pointer-events-none">
      <svg width="60" height="60" viewBox="0 0 60 60" className="animate-spin-slow">
        <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle
          cx="30"
          cy="30"
          r="22"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="35 200"
        />
      </svg>
      <div className="mt-1 text-white font-bold text-sm">{Math.round(pct)}%</div>
      <div className="text-[10px] text-[#ccc]">Đang chạy...</div>
    </div>
  );
}
