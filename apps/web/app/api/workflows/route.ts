import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// List workflows owned by the caller (most recent first).
export async function GET() {
  const sb = createSupabaseServerClient();
  const { data, error } = await sb
    .from('workflows')
    .select('id, name, updated_at')
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Create a new workflow. Body: { name, graph }.
export async function POST(req: Request) {
  const sb = createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string | undefined) ?? 'Workflow mới';
  const graph = body?.graph ?? { version: '1.0', name, nodes: [], edges: [] };

  const { data, error } = await sb
    .from('workflows')
    .insert({ user_id: user.id, name, graph })
    .select('id, name, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
