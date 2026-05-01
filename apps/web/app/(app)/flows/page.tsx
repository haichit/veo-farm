'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Layers3, Trash2, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FlowItem {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
}

export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function load() {
    setLoading(true);
    const [fr, tr] = await Promise.all([fetch('/api/flows'), fetch('/api/flows/templates')]);
    setFlows(await fr.json());
    setTemplates(await tr.json());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function createFlow(templateId: string | null) {
    setCreating(true);
    const res = await fetch('/api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Flow mới',
        template: templateId === null ? 'blank' : templateId,
      }),
    });
    const flow = await res.json();
    setCreating(false);
    setPickerOpen(false);
    router.push(`/flows/${flow.id}`);
  }

  async function deleteFlow(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Xoá flow này?')) return;
    await fetch(`/api/flows/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="container mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Flows</h1>
          <p className="text-sm text-text-muted mt-1">Workflow video AI — tạo, chỉnh, chạy</p>
        </div>
        <Button variant="primary" onClick={() => setPickerOpen(true)} disabled={creating}>
          <Plus className="h-4 w-4" /> {creating ? 'Đang tạo...' : 'Tạo flow mới'}
        </Button>
      </div>

      {loading ? (
        <p className="text-text-muted text-sm">Đang load...</p>
      ) : flows.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <Layers3 className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary text-sm mb-4">
            Chưa có flow nào. Bấm &quot;Tạo flow mới&quot; để bắt đầu.
          </p>
          <Button variant="primary" onClick={() => setPickerOpen(true)} disabled={creating}>
            <Plus className="h-4 w-4" /> Tạo flow đầu tiên
          </Button>
        </GlassCard>
      ) : null}

      <Dialog open={pickerOpen} onOpenChange={(o) => !o && setPickerOpen(false)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Chọn template</DialogTitle>
            <DialogDescription>Pick một template hoặc bắt đầu rỗng.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={creating}
                onClick={() => createFlow(t.id)}
                className="w-full text-left p-4 rounded-xl border border-border hover:border-accent/50 hover:bg-white/[0.03] transition-all"
              >
                <div className="font-semibold text-sm text-text-primary">{t.name}</div>
                <div className="text-[11px] text-text-muted mt-0.5">{t.description}</div>
              </button>
            ))}
            <button
              type="button"
              disabled={creating}
              onClick={() => createFlow(null)}
              className="w-full text-left p-4 rounded-xl border border-border hover:border-accent/50 hover:bg-white/[0.03] transition-all"
            >
              <div className="font-semibold text-sm text-text-primary">Blank canvas</div>
              <div className="text-[11px] text-text-muted mt-0.5">
                Không node nào — tự kéo thả từ đầu.
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {flows.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((f) => (
            <Link key={f.id} href={`/flows/${f.id}`} className="group block">
              <GlassCard className="p-5 transition-all hover:border-accent/40 hover:shadow-accent-glow hover:-translate-y-0.5 relative">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-glow flex items-center justify-center text-accent shrink-0">
                    <Layers3 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-text-primary truncate">{f.name}</h3>
                    {f.description && (
                      <p className="text-xs text-text-muted truncate mt-0.5">{f.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <Clock className="w-3 h-3" />
                  {new Date(f.updated_at).toLocaleString('vi-VN')}
                </div>
                <button
                  type="button"
                  onClick={(e) => deleteFlow(f.id, e)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-text-muted hover:text-error hover:bg-error-bg transition-all"
                  aria-label="Xoá flow"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
