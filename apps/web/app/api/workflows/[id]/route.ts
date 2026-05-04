import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

interface Ctx {
  params: { id: string };
}

export async function GET(_req: Request, { params }: Ctx) {
  const sb = createSupabaseServerClient();
  const { data, error } = await sb
    .from('workflows')
    .select('id, name, graph, updated_at')
    .eq('id', params.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const sb = createSupabaseServerClient();
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.name === 'string') update.name = body.name;
  if (body?.graph) update.graph = body.graph;
  const { data, error } = await sb
    .from('workflows')
    .update(update)
    .eq('id', params.id)
    .select('id, name, updated_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: 'workflow_not_found', id: params.id },
      { status: 404 },
    );
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const sb = createSupabaseServerClient();
  const { error } = await sb.from('workflows').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
