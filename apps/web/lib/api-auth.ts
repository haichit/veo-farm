import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { createSupabaseServerClient } from './supabase/server';

export const API_KEY_PREFIX = 'vf_live_';

export function generateApiKey(): string {
  return API_KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function serviceRoleClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any;
}

export interface AuthedRequest {
  userId: string;
  /** true when authenticated via an `Authorization: Bearer <api key>` header
   * instead of a browser session cookie. Routes MUST filter every query by
   * `user_id` themselves when this is true — the client below is
   * service-role and bypasses RLS entirely. */
  viaApiKey: boolean;
  /** Cookie-session path: the RLS-scoped anon client (safe to query freely).
   * API-key path: a service-role client (caller must filter by user_id).
   * Untyped (matches the rest of this codebase's Supabase call sites) —
   * the generated Database type isn't threaded through here. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any;
}

// Resolves the caller's identity from either a Bearer API key or the
// existing browser session cookie, and hands back the right Supabase client
// for each case. Used by any API route that should also be reachable by an
// external script/agent (not just the Builder Canvas UI).
export async function resolveAuth(req: Request): Promise<AuthedRequest | null> {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (apiKey && apiKey.startsWith(API_KEY_PREFIX)) {
    const sb = serviceRoleClient();
    const { data } = await sb
      .from('api_keys')
      .select('id, user_id, revoked_at')
      .eq('key_hash', hashApiKey(apiKey))
      .maybeSingle();
    if (!data || data.revoked_at) return null;
    // The cookie-session path goes through middleware.ts's suspended-account
    // check; an API key request never touches middleware's cookie-based
    // `user`, so it has to be checked here instead — otherwise a suspended
    // account could keep working indefinitely via a key it made earlier.
    const { data: profile } = await sb
      .from('profiles')
      .select('status')
      .eq('id', data.user_id)
      .maybeSingle();
    if (profile?.status === 'suspended') return null;
    // Best-effort — don't block the request on this write.
    void sb.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
    return { userId: data.user_id as string, viaApiKey: true, sb };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createSupabaseServerClient() as any;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  return { userId: user.id, viaApiKey: false, sb };
}
