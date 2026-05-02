import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// POST { jobId } — flip the job into a "paused" state. The worker checks
// jobs.status between sub-jobs and sleeps until it goes back to "running".
export async function POST(req: Request) {
  const sb = createSupabaseServerClient();
  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  const { error } = await sb.from('jobs').update({ status: 'paused' }).eq('id', jobId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
