import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/encryption';
import { schemas } from '@veo-farm/shared';
import { normalizeCookies } from '@/lib/cookies-normalize';

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
