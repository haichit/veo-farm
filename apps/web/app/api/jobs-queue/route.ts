import { NextResponse } from 'next/server';
import { resolveAuth } from '@/lib/api-auth';

// Lists the current user's own not-yet-finished jobs (pending or running),
// oldest first — i.e. queue order, since the worker claims strictly by
// created_at. Lets the Canvas toolbar answer "how many jobs are ahead of
// mine" instead of that being invisible until each one finishes.
export async function GET(req: Request) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { userId, sb } = auth;

  const { data, error } = await sb
    .from('jobs')
    .select('id, status, created_at, workflow_id, stats, workflows(name)')
    .eq('user_id', userId)
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobs = (data ?? []).map((j: any) => ({
    id: j.id,
    status: j.status,
    created_at: j.created_at,
    stats: j.stats,
    workflow_name: j.workflows?.name ?? null,
  }));
  return NextResponse.json({ jobs });
}
