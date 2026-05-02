import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'media';

// Accept a file via multipart/form-data, upload to Supabase Storage under
// `{userId}/uploads/{ts}-{rand}.{ext}`, return a 24h signed URL. Used by
// the Builder Canvas Upload Media node so the file isn't base64-stuffed
// into a config field (was breaking localStorage + Postgres INSERTs).
export async function POST(req: Request) {
  const sb = createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field missing or not a File' }, { status: 400 });
  }
  // Hard cap 100MB so a runaway upload doesn't lock up the request lane.
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: 'file too large (>100MB)' }, { status: 413 });
  }

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const key = `${user.id}/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from(BUCKET).upload(key, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: signed, error: signErr } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(key, 60 * 60 * 24);
  if (signErr || !signed) {
    return NextResponse.json({ error: signErr?.message ?? 'sign failed' }, { status: 500 });
  }

  return NextResponse.json({
    url: signed.signedUrl,
    name: file.name,
    size: file.size,
    mime: file.type,
  });
}
