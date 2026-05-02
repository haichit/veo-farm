import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Mark the job as cancelled. Worker exits its execution loop on next status
// check. Existing in-flight sub-jobs are left to finish (best-effort cancel).
export async function POST(req: Request) {
  const sb = createSupabaseServerClient();
  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  const { error } = await sb
    .from('jobs')
    .update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
