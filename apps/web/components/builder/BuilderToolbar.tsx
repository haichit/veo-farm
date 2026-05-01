'use client';

import { Play, Pause, Square, Image as ImageIcon, ZoomIn } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useFlowStore } from '@/lib/builder/flow-store';

// Top toolbar inside the canvas column — Run/Pause/Stop + stats counter +
// Album button. Run/pause/stop wiring lands in Day 7; today the buttons just
// flip runState locally so layout + dynamic visibility can be verified.
export function BuilderToolbar() {
  const runState = useFlowStore((s) => s.runState);
  const setRunState = useFlowStore((s) => s.setRunState);
  const stats = useFlowStore((s) => s.stats);
  const openAlbum = useFlowStore((s) => s.openAlbum);
  const albumCount = useFlowStore((s) => s.albumMedia.length);
  const resetAllNodeStatus = useFlowStore((s) => s.resetAllNodeStatus);
  const { fitView } = useReactFlow();

  return (
    <div className="flex items-center gap-3 px-3.5 py-2 bg-bg-secondary border-b border-border shrink-0">
      <button
        type="button"
        onClick={() => setRunState('running')}
        disabled={runState === 'running'}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-accent-glow-lg transition-all"
      >
        <Play size={16} />
        Chạy Workflow
      </button>

      {runState === 'running' && (
        <button
          type="button"
          onClick={() => setRunState('paused')}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-br from-warning to-[#d97706] text-white"
        >
          <Pause size={16} />
          Tạm dừng
        </button>
      )}

      {(runState === 'running' || runState === 'paused') && (
        <button
          type="button"
          onClick={() => {
            if (confirm('Dừng workflow đang chạy?')) {
              setRunState('stopped');
              resetAllNodeStatus();
              setTimeout(() => setRunState('idle'), 300);
            }
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-br from-error to-[#dc2626] text-white"
        >
          <Square size={16} />
          Dừng
        </button>
      )}

      <div className="flex items-center gap-2.5 px-3 py-1 rounded-md bg-white/[0.03] border border-border">
        <Stat label="Xong" value={stats.done} variant="done" />
        <Stat label="Chờ" value={stats.wait} variant="wait" />
        <Stat label="Lỗi" value={stats.err} variant="err" />
      </div>

      <span className="text-[11px] text-text-muted ml-auto mr-3 hidden md:inline">
        Scroll: zoom | Alt+drag: pan | Del: xoá
      </span>

      <button
        type="button"
        onClick={() => fitView({ duration: 300, padding: 0.2 })}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] bg-white/[0.03] border border-border text-text-secondary hover:bg-white/[0.06] hover:text-text-primary transition-colors"
      >
        <ZoomIn size={14} /> Về trung tâm
      </button>

      <button
        type="button"
        onClick={openAlbum}
        title="Album kết quả"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-accent/35 bg-accent/10 text-[#a78bfa] hover:bg-accent/15 transition-colors"
      >
        <ImageIcon size={17} />
        <span className="bg-accent/35 rounded-full px-1.5 text-[10px] min-w-[18px] text-center">
          {albumCount}
        </span>
      </button>
    </div>
  );
}

function Stat({ label, value, variant }: { label: string; value: number; variant: 'done' | 'wait' | 'err' }) {
  const colorClass = variant === 'done' ? 'text-accent' : variant === 'wait' ? 'text-warning' : 'text-error';
  return (
    <div className="flex items-center gap-1">
      <span className={`text-sm font-bold tabular-nums ${colorClass}`}>{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</span>
    </div>
  );
}
