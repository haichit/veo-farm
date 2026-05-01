import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const STALE_AFTER_SECONDS = 30;

export async function GET() {
  const sb = createSupabaseServerClient();
  const { data, error } = await sb
    .from('worker_heartbeats')
    .select('worker_id,last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json({ online: false, error: error.message, workers: [] }, { status: 200 });
  }

  const now = Date.now();
  const workers = (data ?? []).map((w) => {
    const ageSec = Math.floor((now - new Date(w.last_seen_at).getTime()) / 1000);
    return { worker_id: w.worker_id, last_seen_at: w.last_seen_at, age_sec: ageSec };
  });

  const online = workers.some((w) => w.age_sec < STALE_AFTER_SECONDS);
  return NextResponse.json({ online, workers });
}
