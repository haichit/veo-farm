import { NextResponse } from 'next/server';
import { resolveAuth } from '@/lib/api-auth';

// Revoke (soft-delete) an API key. Session-only, same reasoning as
// api-keys/route.ts.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await resolveAuth(req);
  if (!auth || auth.viaApiKey) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { error } = await auth.sb
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
