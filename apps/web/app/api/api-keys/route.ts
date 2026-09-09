import { NextResponse } from 'next/server';
import { resolveAuth, generateApiKey, hashApiKey, API_KEY_PREFIX } from '@/lib/api-auth';

// Key management is deliberately session-only — an API key can't be used to
// mint or revoke other API keys (avoids a leaked key silently spawning more
// of itself). Only the Builder Canvas UI (browser session) can call these.
async function requireSession(req: Request) {
  const auth = await resolveAuth(req);
  if (!auth || auth.viaApiKey) return null;
  return auth;
}

// List the caller's own keys — never returns the plaintext key, only the
// stored prefix so the UI can show "vf_live_ab12…" for identification.
export async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data, error } = await auth.sb
    .from('api_keys')
    .select('id, label, key_prefix, created_at, last_used_at, revoked_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Create a new key. Body: { label?: string }. Returns the plaintext key
// exactly once — the caller must copy it now, it's never retrievable again.
export async function POST(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : 'API Key';

  const key = generateApiKey();
  const { data, error } = await auth.sb
    .from('api_keys')
    .insert({
      user_id: auth.userId,
      label,
      key_hash: hashApiKey(key),
      key_prefix: key.slice(0, API_KEY_PREFIX.length + 6),
    })
    .select('id, label, key_prefix, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, key });
}
