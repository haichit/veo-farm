import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/encryption';
import { schemas } from '@veo-farm/shared';
import { normalizeCookies } from '@/lib/cookies-normalize';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider');
  const wantCount = searchParams.get('count') === '1';

  const sb = createSupabaseServerClient();
  let q = sb.from('accounts').select('id, provider_id, label, status, cooldown_until, last_used_at, last_error, meta, created_at');
  if (provider) q = q.eq('provider_id', provider);

  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (wantCount) {
    const usable = (data ?? []).filter((a) => a.status === 'idle' || a.status === 'cooldown');
    return NextResponse.json({ count: usable.length });
  }

  // Annotate each account with today's usage so the UI can show "12/50 today".
  const today = new Date().toISOString().slice(0, 10);
  const ids = (data ?? []).map((a) => a.id);
  let usage: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: usageRows } = await sb
      .from('account_usage')
      .select('account_id, count')
      .in('account_id', ids)
      .eq('usage_date', today);
    for (const r of usageRows ?? []) usage[r.account_id] = r.count;
  }
  const annotated = (data ?? []).map((a) => ({
    ...a,
    usage_today: usage[a.id] ?? 0,
  }));
  return NextResponse.json(annotated);
}

const createSchema = z.object({
  provider_id: z.string().min(1),
  label: z.string().min(1),
  cookies: z.preprocess(normalizeCookies, schemas.cookiesArraySchema),
  meta: z.record(z.unknown()).optional(),
});

export async function POST(req: Request) {
  const sb = createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const { provider_id, label, cookies, meta } = parsed.data;
  const cookies_encrypted = encrypt(JSON.stringify(cookies));

  // Find earliest expiration across all cookies that have one (some are session-only).
  // Stored as ISO string in meta so UI can warn before login breaks.
  const expirations = cookies
    .map((c: any) => {
      const v = c.expires ?? c.expirationDate;
      if (typeof v !== 'number') return null;
      const ms = v < 1e12 ? v * 1000 : v; // seconds vs ms
      return ms;
    })
    .filter((n): n is number => typeof n === 'number' && n > Date.now());
  const minExpires = expirations.length > 0 ? Math.min(...expirations) : null;
  const enrichedMeta = {
    ...(meta ?? {}),
    ...(minExpires ? { cookies_expire_at: new Date(minExpires).toISOString() } : {}),
  };

  const { data, error } = await sb
    .from('accounts')
    .insert({
      user_id: user.id,
      provider_id,
      label,
      cookies_encrypted,
      meta: enrichedMeta,
      status: 'idle',
    })
    .select('id, provider_id, label, status, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
