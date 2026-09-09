import { NextResponse } from 'next/server';
import { resolveAuth } from '@/lib/api-auth';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { userId, viaApiKey, sb } = auth;
  let jobQuery = sb.from('jobs').select('*').eq('id', params.id);
  if (viaApiKey) jobQuery = jobQuery.eq('user_id', userId);
  const [job, subs] = await Promise.all([
    jobQuery.single(),
    sb.from('sub_jobs').select('*').eq('job_id', params.id).order('created_at', { ascending: true }),
  ]);
  if (job.error) return NextResponse.json({ error: job.error.message }, { status: 404 });
  return NextResponse.json({ job: job.data, sub_jobs: subs.data ?? [] });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { userId, viaApiKey, sb } = auth;
  let query = sb.from('jobs').update({ status: 'cancelled' }).eq('id', params.id);
  if (viaApiKey) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
