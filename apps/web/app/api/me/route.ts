import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Returns the caller's profile + email so the UI can render role-gated tabs
// (e.g. show /admin only to admins) without exposing service-role data.
export async function GET() {
  const sb = createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: profile } = await sb
    .from('profiles')
    .select('role, status, display_name')
    .eq('id', user.id)
    .maybeSingle();
  return NextResponse.json({
    id: user.id,
    email: user.email,
    role: profile?.role ?? 'user',
    status: profile?.status ?? 'active',
    display_name: profile?.display_name,
  });
}
