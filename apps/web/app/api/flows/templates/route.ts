import { NextResponse } from 'next/server';
import { FLOW_TEMPLATES } from '@/lib/flow/default-flows';

export async function GET() {
  const list = Object.values(FLOW_TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }));
  return NextResponse.json(list);
}
