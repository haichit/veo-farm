import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Server-side guard. Returns the admin user, or null if the caller is not
 * an authenticated admin. API routes should respond 403 when this returns null.
 */
export async function requireAdmin() {
  const sb = createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') return null;
  return user;
}
