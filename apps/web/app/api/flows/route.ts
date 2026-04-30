import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { defaultFlowGraph } from '@/lib/flow/default-flows';

export async function GET() {
  const sb = createSupabaseServerClient();
  const { data, error } = await sb
    .from('flows')
    .select('id, name, description, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const sb = createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = body.name ?? 'Flow mới';
  const useTemplate = body.template !== false;

  const { data, error } = await sb
    .from('flows')
    .insert({
      user_id: user.id,
      name,
      description: body.description ?? null,
      graph: useTemplate ? defaultFlowGraph() : { nodes: [], edges: [] },
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
