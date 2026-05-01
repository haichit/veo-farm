import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Retry a failed run from a specific node, reusing completed sub-job outputs from
 * the parent. Worker job-runner consults parent_job_id to skip already-completed nodes.
 *
 * POST /api/runs/<id>/retry { from_node?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sb = createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const fromNode: string | undefined = body.from_node;

  const { data: parent, error: pErr } = await sb
    .from('jobs')
    .select('id, flow_id, user_id, input, status')
    .eq('id', params.id)
    .single();
  if (pErr || !parent) return NextResponse.json({ error: 'job not found' }, { status: 404 });

  // Pick the failed node automatically if from_node not specified.
  let resumeFrom = fromNode;
  if (!resumeFrom) {
    const { data: failedSub } = await sb
      .from('sub_jobs')
      .select('node_id, status')
      .eq('job_id', params.id)
      .eq('status', 'failed')
      .order('finished_at', { ascending: true })
      .limit(1);
    resumeFrom = failedSub?.[0]?.node_id;
  }
  if (!resumeFrom) {
    return NextResponse.json(
      { error: 'no failed sub-job found and from_node not provided' },
      { status: 400 },
    );
  }

  const { data: newJob, error: insErr } = await sb
    .from('jobs')
    .insert({
      flow_id: parent.flow_id,
      user_id: parent.user_id,
      status: 'pending',
      input: parent.input,
      parent_job_id: parent.id,
      retry_from_node: resumeFrom,
    })
    .select()
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json(newJob);
}
