import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sb = createSupabaseServerClient();

  // Latest job for this flow
  const { data: job } = await sb
    .from('jobs')
    .select('id, status, output_url')
    .eq('flow_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) return NextResponse.json({ job: null, outputs: {} });

  // All sub_jobs for this job grouped by node_id
  const { data: subs } = await sb
    .from('sub_jobs')
    .select('node_id, node_type, status, output, error, input, created_at, finished_at')
    .eq('job_id', job.id)
    .order('created_at', { ascending: true });

  // Group: for each node_id, collect outputs by sceneIdx if present
  const outputs: Record<string, any> = {};
  for (const s of subs ?? []) {
    const key = s.node_id;
    if (!outputs[key]) {
      outputs[key] = { nodeType: s.node_type, items: [], status: s.status };
    }
    outputs[key].items.push({
      status: s.status,
      output: s.output,
      error: s.error,
      sceneIdx: (s.input as any)?.sceneIdx,
    });
    // Aggregate status: if any failed → failed; if any running → running; else completed
    const statuses = outputs[key].items.map((i: any) => i.status);
    if (statuses.includes('failed')) outputs[key].status = 'failed';
    else if (statuses.includes('running') || statuses.includes('pending')) outputs[key].status = 'running';
    else outputs[key].status = 'completed';
  }

  return NextResponse.json({
    job: { id: job.id, status: job.status, output_url: job.output_url },
    outputs,
  });
}
