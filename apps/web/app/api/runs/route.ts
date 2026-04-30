import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const sb = createSupabaseServerClient();
  const { data, error } = await sb
    .from('jobs')
    .select('id, flow_id, status, input, output_url, error, started_at, finished_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const sb = createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json();
  if (!body.flow_id) return NextResponse.json({ error: 'flow_id required' }, { status: 400 });

  // Read flow to extract idea from ideaInput node
  const { data: flow } = await sb.from('flows').select('graph').eq('id', body.flow_id).single();
  const idea =
    body.idea ??
    (flow?.graph?.nodes ?? []).find((n: any) => n.type === 'ideaInput')?.data?.value ??
    '';

  const { data, error } = await sb
    .from('jobs')
    .insert({
      flow_id: body.flow_id,
      user_id: user.id,
      status: 'pending',
      input: { idea },
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
