'use client';

import { Play, Pause, Square, Image as ImageIcon, ZoomIn } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useFlowStore } from '@/lib/builder/flow-store';
import type { WorkflowJSON } from '@veo-farm/shared';

// Top toolbar inside the canvas column — Run/Pause/Stop + stats counter +
// Album button. Hits /api/run-workflow-builder + companion endpoints; the
// flow-store updates from Realtime via useJobSubscription on the page.
export function BuilderToolbar() {
  const runState = useFlowStore((s) => s.runState);
  const setRunState = useFlowStore((s) => s.setRunState);
  const stats = useFlowStore((s) => s.stats);
  const openAlbum = useFlowStore((s) => s.openAlbum);
  const albumCount = useFlowStore((s) => s.albumMedia.length);
  const resetAllNodeStatus = useFlowStore((s) => s.resetAllNodeStatus);
  const setCurrentJobId = useFlowStore((s) => s.setCurrentJobId);
  const currentJobId = useFlowStore((s) => s.currentJobId);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const currentWorkflowId = useFlowStore((s) => s.currentWorkflowId);
  const currentWorkflowName = useFlowStore((s) => s.currentWorkflowName);
  const { fitView } = useReactFlow();

  async function startRun() {
    if (nodes.length === 0) {
      alert('Workflow chưa có node nào.');
      return;
    }
    resetAllNodeStatus();
    setRunState('running');
    const workflow: WorkflowJSON = {
      version: '1.0',
      name: currentWorkflowName,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? 'prompt',
        position: n.position,
        data: { config: n.data?.config ?? {}, label: n.data?.label },
        width: n.width,
        height: n.height,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? '',
        targetHandle: e.targetHandle ?? '',
      })),
    };
    try {
      // eslint-disable-next-line no-console
      console.log('[builder] POST /api/run-workflow-builder', { nodes: nodes.length, edges: edges.length });
      const r = await fetch('/api/run-workflow-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow, workflowId: currentWorkflowId }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        // eslint-disable-next-line no-console
        console.error('[builder] run failed', r.status, err);
        alert(`Run failed (${r.status}): ${err?.error ?? r.statusText}`);
        setRunState('idle');
        return;
      }
      const { jobId } = await r.json();
      // eslint-disable-next-line no-console
      console.log('[builder] job created', jobId, '— waiting for worker pickup');
      setCurrentJobId(jobId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[builder] network error', e);
      alert(`Network error: ${(e as Error).message ?? e}`);
      setRunState('idle');
    }
  }

  async function pauseRun() {
    if (!currentJobId) return;
    setRunState('paused');
    await fetch('/api/workflow-builder-pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: currentJobId }),
    });
  }

  async function stopRun() {
    if (!confirm('Dừng workflow đang chạy?')) return;
    if (currentJobId) {
      await fetch('/api/workflow-builder-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: currentJobId }),
      });
    }
    setRunState('stopped');
    resetAllNodeStatus();
    setCurrentJobId(null);
    setTimeout(() => setRunState('idle'), 300);
  }

  return (
    <div className="flex items-center gap-3 px-3.5 py-2 bg-bg-secondary border-b border-border shrink-0">
      <button
        type="button"
        onClick={startRun}
        disabled={runState === 'running'}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-accent-glow-lg transition-all"
      >
        <Play size={16} />
        Chạy Workflow
      </button>

      {runState === 'running' && (
        <button
          type="button"
          onClick={pauseRun}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-br from-warning to-[#d97706] text-white"
        >
          <Pause size={16} />
          Tạm dừng
        </button>
      )}

      {(runState === 'running' || runState === 'paused') && (
        <button
          type="button"
          onClick={stopRun}
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
