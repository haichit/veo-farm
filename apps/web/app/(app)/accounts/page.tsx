'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AddAccountModal } from '@/components/account-manager/AddAccountModal';

interface Account {
  id: string;
  provider_id: string;
  label: string;
  status: string;
  last_error: string | null;
  meta: Record<string, unknown>;
  created_at: string;
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

  return (
    <div className="container mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-sm text-muted-foreground">Cookies AI tools (lưu mã hoá AES-256-GCM)</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Thêm account
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Đang load...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có account nào.</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium text-sm">{a.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.provider_id} · added {new Date(a.created_at).toLocaleDateString('vi-VN')}
                  </div>
                  {a.last_error && (
                    <div className="text-xs text-red-600 mt-1 truncate">⚠ {a.last_error}</div>
                  )}
                </div>
                <Badge status={a.status}>{a.status}</Badge>
                <button onClick={() => del(a.id)} className="p-1 hover:bg-red-50 rounded">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </button>
              </CardContent>
            </Card>
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
