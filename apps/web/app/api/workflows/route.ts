import { NextResponse } from 'next/server';
import { resolveAuth } from '@/lib/api-auth';

// List workflows owned by the caller (most recent first). Reachable from
// the UI (session cookie) or externally via an API key.
export async function GET(req: Request) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { userId, viaApiKey, sb } = auth;
  let query = sb.from('workflows').select('id, name, updated_at').order('updated_at', { ascending: false });
  if (viaApiKey) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Create a new workflow. Body: { name, graph }.
export async function POST(req: Request) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { userId, sb } = auth;

  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string | undefined) ?? 'Workflow mới';
  const graph = body?.graph ?? { version: '1.0', name, nodes: [], edges: [] };

  const { data, error } = await sb
    .from('workflows')
    .insert({ user_id: userId, name, graph })
    .select('id, name, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
