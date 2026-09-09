import { NextResponse } from 'next/server';
import { resolveAuth } from '@/lib/api-auth';

interface Ctx {
  params: { id: string };
}

export async function GET(req: Request, { params }: Ctx) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { userId, viaApiKey, sb } = auth;
  let query = sb.from('workflows').select('id, name, graph, updated_at').eq('id', params.id);
  if (viaApiKey) query = query.eq('user_id', userId);
  const { data, error } = await query.single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { userId, viaApiKey, sb } = auth;
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.name === 'string') update.name = body.name;
  if (body?.graph) update.graph = body.graph;
  let query = sb.from('workflows').update(update).eq('id', params.id);
  if (viaApiKey) query = query.eq('user_id', userId);
  const { data, error } = await query.select('id, name, updated_at').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: 'workflow_not_found', id: params.id },
      { status: 404 },
    );
  }
  return NextResponse.json(data);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { userId, viaApiKey, sb } = auth;
  let query = sb.from('workflows').delete().eq('id', params.id);
  if (viaApiKey) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
