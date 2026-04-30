import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sb = createSupabaseServerClient();
  const [job, subs] = await Promise.all([
    sb.from('jobs').select('*').eq('id', params.id).single(),
    sb.from('sub_jobs').select('*').eq('job_id', params.id).order('created_at', { ascending: true }),
  ]);
  if (job.error) return NextResponse.json({ error: job.error.message }, { status: 404 });
  return NextResponse.json({ job: job.data, sub_jobs: subs.data ?? [] });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sb = createSupabaseServerClient();
  const { error } = await sb.from('jobs').update({ status: 'cancelled' }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
