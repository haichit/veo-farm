import { NextResponse } from 'next/server';
import { resolveAuth } from '@/lib/api-auth';

// Mark the job as cancelled. Worker exits its execution loop on next status
// check. Existing in-flight sub-jobs are left to finish (best-effort cancel).
export async function POST(req: Request) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { userId, viaApiKey, sb } = auth;
  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  let query = sb
    .from('jobs')
    .update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('id', jobId);
  if (viaApiKey) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
