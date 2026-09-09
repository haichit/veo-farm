'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Workflow, Trash2, Clock } from 'lucide-react';

interface WorkflowItem {
  id: string;
  name: string;
  updated_at: string;
}

export default function WorkflowsListPage() {
  const router = useRouter();
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/workflows');
    setItems(await r.json());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(id: string, name: string) {
    if (!confirm(`Xoá workflow "${name}"?`)) return;
    await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="container mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Workflows</h1>
          <p className="text-sm text-text-muted mt-1">Mọi workflow đã lưu từ Canvas</p>
        </div>
        <Link
          href="/canvas?new=1"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow hover:shadow-accent-glow-lg transition-all"
        >
          <Plus size={16} /> Tạo mới
        </Link>
      </div>

      {loading ? (
        <p className="text-text-muted text-sm">Đang tải…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-border bg-white/[0.02]">
          <Workflow className="w-10 h-10 mx-auto text-text-muted opacity-50 mb-3" />
          <p className="text-text-muted text-sm mb-4">Chưa có workflow nào.</p>
          <Link
            href="/canvas?new=1"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            <Plus size={16} /> Tạo workflow đầu tiên
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((wf) => (
            <div
              key={wf.id}
              className="group relative rounded-xl border border-border bg-white/[0.02] hover:bg-white/[0.04] hover:border-accent/40 transition-all"
            >
              <button
                onClick={() => router.push(`/canvas?wf=${wf.id}`)}
                className="block w-full text-left p-4"
              >
                <div className="flex items-start gap-2.5 mb-2">
                  <Workflow className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span className="font-semibold text-sm text-text-primary truncate flex-1">
                    {wf.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <Clock size={11} />
                  {new Date(wf.updated_at).toLocaleString('vi-VN')}
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(wf.id, wf.name);
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-error hover:bg-error/10 transition-all"
                title="Xoá"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
