import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, unknown> = { service: 'web', time: new Date().toISOString() };
  let ok = true;

  // Supabase reachability
  try {
    const sb = createSupabaseServerClient();
    const { error } = await sb.from('worker_heartbeats').select('worker_id').limit(1);
    checks.supabase = error ? `error: ${error.message}` : 'ok';
    if (error) ok = false;
  } catch (e: any) {
    checks.supabase = `exception: ${e?.message ?? e}`;
    ok = false;
  }

  return NextResponse.json({ ok, ...checks }, { status: ok ? 200 : 503 });
}
