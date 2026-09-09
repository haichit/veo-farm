import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/encryption';
import { schemas } from '@veo-farm/shared';
import { normalizeCookies, computeCookiesExpireAt } from '@/lib/cookies-normalize';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const sb = createSupabaseServerClient();
  const body = await req.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label !== undefined) patch.label = body.label;
  if (body.status !== undefined) patch.status = body.status;
  if (body.meta !== undefined) patch.meta = body.meta;
  if (body.cookies !== undefined) {
    const normalized = normalizeCookies(body.cookies);
    const parsed = schemas.cookiesArraySchema.safeParse(normalized);
    if (!parsed.success) return NextResponse.json({ error: 'invalid cookies' }, { status: 400 });
    patch.cookies_encrypted = encrypt(JSON.stringify(parsed.data));
    // Pasting fresh cookies must refresh cookies_expire_at too — otherwise
    // an account edited after its old session expired keeps the stale
    // (already-past) timestamp forever, and claim_account skips it even
    // though the just-pasted cookies are good again. Re-fetch current meta
    // first since `patch.meta` above only applies when the caller passed a
    // full replacement meta object in the same request.
    const { data: current } = await sb.from('accounts').select('meta, status').eq('id', params.id).maybeSingle();
    const baseMeta = (patch.meta as Record<string, unknown> | undefined) ?? (current?.meta as Record<string, unknown> | undefined) ?? {};
    const expireAt = computeCookiesExpireAt(parsed.data);
    patch.meta = { ...baseMeta, ...(expireAt ? { cookies_expire_at: expireAt } : {}) };
    // Cookies are back — don't leave the account stuck as 'expired' from a
    // previous claim_account skip. Leave alone if it's currently mid-job.
    if (body.status === undefined && current?.status !== 'busy') patch.status = 'idle';
  }
  const { data, error } = await sb.from('accounts').update(patch).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sb = createSupabaseServerClient();
  const { error } = await sb.from('accounts').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
