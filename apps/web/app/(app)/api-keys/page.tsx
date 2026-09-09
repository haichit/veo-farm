'use client';

import { useEffect, useState } from 'react';
import { Plus, KeyRound, Trash2, Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ApiKeyItem {
  id: string;
  label: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export default function ApiKeysPage() {
  const [items, setItems] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Electron doesn't implement window.prompt() (silently no-ops), so naming
  // the key needs its own small dialog instead of a native prompt().
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState('Codex');

  async function load() {
    setLoading(true);
    const r = await fetch('/api/api-keys');
    setItems(r.ok ? await r.json() : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function openCreateDialog() {
    setLabelDraft('Codex');
    setLabelDialogOpen(true);
  }

  async function create() {
    setLabelDialogOpen(false);
    const label = labelDraft.trim() || undefined;
    setCreating(true);
    try {
      const r = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (!r.ok) {
        alert('Tạo key thất bại');
        return;
      }
      const data = await r.json();
      setNewKey(data.key);
      setCopied(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string, label: string) {
    if (!confirm(`Thu hồi key "${label}"? Mọi request dùng key này sẽ bị từ chối ngay.`)) return;
    await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="container mx-auto py-8 px-6 max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">API Keys</h1>
          <p className="text-sm text-text-muted mt-1">
            Cho phép công cụ ngoài (script, Codex...) gọi API của Veo Farm mà không cần đăng nhập trình duyệt.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateDialog}
          disabled={creating}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow hover:shadow-accent-glow-lg transition-all disabled:opacity-50"
        >
          <Plus size={16} /> Tạo key mới
        </button>
      </div>

      <Dialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tạo API key mới</DialogTitle>
            <DialogDescription>Đặt tên gợi nhớ để sau này biết key này dùng cho việc gì.</DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            type="text"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
            placeholder="vd: Codex"
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={() => setLabelDialogOpen(false)}
              className="px-3.5 py-2 rounded-lg text-sm font-medium text-text-secondary hover:bg-white/[0.06] transition-colors"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={create}
              className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow hover:shadow-accent-glow-lg transition-all"
            >
              Tạo key
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {newKey && (
        <div className="mt-5 p-4 rounded-lg border border-warning/40 bg-warning/[0.07]">
          <div className="text-xs font-semibold text-warning mb-1.5">
            Lưu key này lại ngay — chỉ hiện đúng 1 lần, không lấy lại được nữa.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-black/30 rounded px-2.5 py-2 text-text-primary break-all">
              {newKey}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(newKey).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-md text-xs bg-white/[0.06] hover:bg-white/[0.12] text-text-secondary"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Đã copy' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="mt-2 text-[11px] text-text-muted hover:text-text-secondary"
          >
            Đã lưu, đóng lại
          </button>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {loading ? (
          <div className="text-sm text-text-muted py-10 text-center">Đang tải...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-text-muted py-10 text-center border border-dashed border-border rounded-lg">
            Chưa có API key nào.
          </div>
        ) : (
          items.map((k) => (
            <div
              key={k.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
                k.revoked_at ? 'border-border bg-white/[0.02] opacity-50' : 'border-border bg-bg-card'
              }`}
            >
              <KeyRound size={16} className="text-text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{k.label}</div>
                <div className="text-[11px] text-text-muted font-mono">{k.key_prefix}…</div>
              </div>
              <div className="text-[11px] text-text-muted text-right shrink-0">
                {k.revoked_at ? (
                  <span className="text-error">Đã thu hồi</span>
                ) : k.last_used_at ? (
                  <>Dùng lần cuối {new Date(k.last_used_at).toLocaleString('vi-VN')}</>
                ) : (
                  'Chưa dùng lần nào'
                )}
              </div>
              {!k.revoked_at && (
                <button
                  type="button"
                  onClick={() => revoke(k.id, k.label)}
                  title="Thu hồi key"
                  className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-error hover:bg-error/10 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-8 p-4 rounded-lg border border-border bg-white/[0.02] text-xs text-text-muted leading-relaxed">
        <div className="font-semibold text-text-secondary mb-1.5">Cách dùng</div>
        Gửi header <code className="text-text-primary">Authorization: Bearer &lt;key&gt;</code> tới các endpoint:
        <ul className="list-disc list-inside mt-1.5 space-y-0.5">
          <li><code>GET/POST /api/workflows</code>, <code>GET/PATCH/DELETE /api/workflows/:id</code></li>
          <li><code>POST /api/run-workflow-builder</code> — chạy workflow</li>
          <li><code>GET /api/jobs-queue</code> — job đang chờ/đang chạy</li>
          <li><code>GET /api/runs/:id</code> — trạng thái + kết quả 1 job</li>
          <li><code>POST /api/workflow-builder-stop</code> — huỷ job</li>
        </ul>
      </div>
    </div>
  );
}
