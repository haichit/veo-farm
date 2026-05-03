'use client';

import { useEffect, useState } from 'react';
import { Shield, ShieldCheck, Ban, RotateCcw, Trash2, Users } from 'lucide-react';

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  workflow_count: number;
  account_count: number;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  async function load() {
    const r = await fetch('/api/admin/users');
    if (r.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    setRows(await r.json());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    const r = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      alert(await r.text());
      return;
    }
    load();
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Xoá vĩnh viễn user ${email}? Mọi workflow + account sẽ mất.`)) return;
    const r = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      alert(await r.text());
      return;
    }
    load();
  }

  if (forbidden) {
    return (
      <div className="container mx-auto py-10 px-6">
        <div className="text-error font-bold">403 — Chỉ admin truy cập được trang này.</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-6">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-accent" />
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Quản lý user</h1>
        <span className="ml-2 text-xs text-text-muted">({rows.length})</span>
      </div>

      {loading ? (
        <p className="text-text-muted text-sm">Đang tải…</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-text-muted text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Role</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Wf</th>
                <th className="text-left p-3">Acc</th>
                <th className="text-left p-3">Đăng ký</th>
                <th className="text-left p-3">Login lần cuối</th>
                <th className="text-right p-3">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-border hover:bg-white/[0.02]">
                  <td className="p-3">
                    <div className="font-medium text-text-primary">{u.email}</div>
                    {!u.email_confirmed_at && (
                      <div className="text-[10px] text-warning">⚠ chưa verify email</div>
                    )}
                  </td>
                  <td className="p-3">
                    {u.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-accent/15 text-accent">
                        <ShieldCheck size={12} /> admin
                      </span>
                    ) : (
                      <span className="text-text-muted text-[11px]">user</span>
                    )}
                  </td>
                  <td className="p-3">
                    {u.status === 'suspended' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-error/15 text-error">
                        <Ban size={12} /> suspended
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-success/15 text-success">
                        active
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-text-muted">{u.workflow_count}</td>
                  <td className="p-3 text-text-muted">{u.account_count}</td>
                  <td className="p-3 text-[11px] text-text-muted">
                    {new Date(u.created_at).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="p-3 text-[11px] text-text-muted">
                    {u.last_sign_in_at
                      ? new Date(u.last_sign_in_at).toLocaleString('vi-VN')
                      : 'chưa'}
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-1">
                      {u.status === 'active' ? (
                        <button
                          onClick={() => patch(u.id, { status: 'suspended' })}
                          title="Khoá"
                          className="p-1.5 rounded hover:bg-error/15 text-error"
                        >
                          <Ban size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => patch(u.id, { status: 'active' })}
                          title="Mở khoá"
                          className="p-1.5 rounded hover:bg-success/15 text-success"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button
                        onClick={() =>
                          patch(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })
                        }
                        title={u.role === 'admin' ? 'Hạ quyền' : 'Promote admin'}
                        className="p-1.5 rounded hover:bg-accent/15 text-accent"
                      >
                        <Shield size={14} />
                      </button>
                      <button
                        onClick={() => remove(u.id, u.email)}
                        title="Xoá"
                        className="p-1.5 rounded hover:bg-error/15 text-error"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
