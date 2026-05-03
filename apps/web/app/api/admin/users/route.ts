import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/require-admin';

// List all users with their profile + counts. Uses the service-role key so
// admin can see auth.users rows that are otherwise locked behind RLS.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: authUsers, error: authErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

  const ids = authUsers.users.map((u) => u.id);
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, role, status, display_name, created_at')
    .in('id', ids);

  const [{ data: wfCounts }, { data: accCounts }] = await Promise.all([
    sb.from('workflows').select('user_id').in('user_id', ids),
    sb.from('accounts').select('user_id').in('user_id', ids),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const wfCount = new Map<string, number>();
  for (const r of wfCounts ?? []) wfCount.set(r.user_id, (wfCount.get(r.user_id) ?? 0) + 1);
  const accCount = new Map<string, number>();
  for (const r of accCounts ?? []) accCount.set(r.user_id, (accCount.get(r.user_id) ?? 0) + 1);

  const rows = authUsers.users.map((u) => {
    const p = profileById.get(u.id);
    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      email_confirmed_at: u.email_confirmed_at,
      role: p?.role ?? 'user',
      status: p?.status ?? 'active',
      display_name: p?.display_name ?? null,
      workflow_count: wfCount.get(u.id) ?? 0,
      account_count: accCount.get(u.id) ?? 0,
    };
  });

  return NextResponse.json(rows);
}
