'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Key, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { AddAccountModal } from '@/components/account-manager/AddAccountModal';

interface Account {
  id: string;
  provider_id: string;
  label: string;
  status: string;
  last_error: string | null;
  meta: Record<string, unknown> & { cookies_expire_at?: string };
  created_at: string;
}

function expiryState(iso: string | undefined): { tone: 'ok' | 'warn' | 'crit'; days: number } | null {
  if (!iso) return null;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { tone: 'crit', days };
  if (days < 7) return { tone: 'crit', days };
  if (days < 30) return { tone: 'warn', days };
  return { tone: 'ok', days };
}

export default function AccountsPage() {
  const [items, setItems] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/accounts');
    setItems(await r.json());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function del(id: string) {
    if (!confirm('Xoá account này?')) return;
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    load();
  }

  const grouped = items.reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.provider_id] ??= []).push(a);
    return acc;
  }, {});
  const providers = Object.keys(grouped).sort();

  return (
    <div className="container mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Accounts</h1>
          <p className="text-sm text-text-muted mt-1">
            Cookies AI tools (lưu mã hoá AES-256-GCM)
          </p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Thêm account
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Đang load...</p>
      ) : items.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <Key className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary text-sm mb-4">
            Chưa có account nào. Thêm cookies AI tool đầu tiên.
          </p>
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Thêm account đầu tiên
          </Button>
        </GlassCard>
      ) : (
        <div className="space-y-6">
          {providers.map((p) => (
            <section key={p}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {p}
                </h2>
                <span className="text-[11px] text-text-muted">({grouped[p].length})</span>
              </div>
              <GlassCard className="divide-y divide-border">
                {grouped[p].map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-white/[0.02]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-accent-glow flex items-center justify-center text-accent shrink-0">
                      <Key className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-text-primary truncate">
                        {a.label}
                      </div>
                      <div className="text-[11px] text-text-muted flex items-center gap-2 flex-wrap">
                        <span>added {new Date(a.created_at).toLocaleDateString('vi-VN')}</span>
                        {(() => {
                          const e = expiryState(a.meta?.cookies_expire_at);
                          if (!e) return null;
                          const cls =
                            e.tone === 'crit'
                              ? 'text-error'
                              : e.tone === 'warn'
                                ? 'text-warning'
                                : 'text-text-muted';
                          const label =
                            e.days < 0
                              ? `cookies hết hạn ${-e.days}d trước`
                              : e.days === 0
                                ? 'cookies hết hạn hôm nay'
                                : `cookies còn ${e.days}d`;
                          return (
                            <span className={`inline-flex items-center gap-0.5 ${cls}`}>
                              <Clock className="w-3 h-3" /> {label}
                            </span>
                          );
                        })()}
                      </div>
                      {a.last_error && (
                        <div className="text-[11px] text-error mt-1 flex items-center gap-1 truncate">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span className="truncate">{a.last_error}</span>
                        </div>
                      )}
                    </div>
                    <Badge status={a.status}>{a.status}</Badge>
                    <button
                      type="button"
                      onClick={() => del(a.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error-bg transition-all"
                      aria-label="Xoá account"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </GlassCard>
            </section>
          ))}
        </div>
      )}

      <AddAccountModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          load();
        }}
      />
    </div>
  );
}
