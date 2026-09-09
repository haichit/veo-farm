'use client';

import { useEffect, useState } from 'react';
import { ListOrdered, X } from 'lucide-react';

interface QueuedJob {
  id: string;
  status: string;
  created_at: string;
  workflow_name: string | null;
  stats?: { done: number; wait: number; err: number } | null;
}

// Shows how many of the user's own jobs are queued (pending/running) ahead
// of / including whatever they just kicked off — the worker processes one
// job at a time in created_at order, so "Chạy Workflow" can sit invisible
// behind earlier Run-frame clicks with zero feedback otherwise. Click to
// see + cancel individual queued jobs.
export function JobQueueBadge() {
  const [jobs, setJobs] = useState<QueuedJob[]>([]);
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch('/api/jobs-queue');
      if (!r.ok) return;
      const data = await r.json();
      setJobs(data.jobs ?? []);
    } catch {
      // ignore — next poll retries
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function cancel(id: string) {
    setCancelling(id);
    try {
      await fetch('/api/workflow-builder-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id }),
      });
      await load();
    } finally {
      setCancelling(null);
    }
  }

  if (jobs.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Job đang chờ / đang chạy của bạn"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-warning/10 border border-warning/30 text-warning hover:bg-warning/15 transition-colors"
      >
        <ListOrdered size={14} />
        {jobs.length} job trong hàng đợi
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-80 rounded-lg border border-border bg-bg-secondary shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 text-[11px] font-semibold text-text-secondary border-b border-border flex items-center justify-between">
            Hàng đợi ({jobs.length})
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-text-muted hover:text-text-primary"
            >
              <X size={13} />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {jobs.map((j, i) => (
              <div key={j.id} className="px-3 py-2 flex items-center gap-2">
                <span className="text-[10px] font-bold text-text-muted w-4 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary truncate">
                    {j.workflow_name ?? '(chưa lưu tên)'}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {j.status === 'running' ? 'Đang chạy' : 'Đang chờ'}
                    {j.stats ? ` · ${j.stats.done}/${j.stats.done + j.stats.wait} xong` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => cancel(j.id)}
                  disabled={cancelling === j.id}
                  title="Huỷ job này"
                  className="text-[10px] px-2 py-1 rounded bg-error/10 text-error border border-error/30 hover:bg-error/15 disabled:opacity-50 shrink-0"
                >
                  {cancelling === j.id ? '...' : 'Huỷ'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
