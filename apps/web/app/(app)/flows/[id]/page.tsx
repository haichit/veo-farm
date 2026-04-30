import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import FlowCanvas from '@/components/canvas/FlowCanvas';
import { RunButton } from '@/components/canvas/RunButton';

export default async function FlowEditorPage({ params }: { params: { id: string } }) {
  const sb = createSupabaseServerClient();
  const { data: flow, error } = await sb.from('flows').select('*').eq('id', params.id).single();
  if (error || !flow) notFound();

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between border-b px-4 h-12 shrink-0">
        <div>
          <h1 className="font-semibold text-sm">{flow.name}</h1>
          <p className="text-xs text-muted-foreground">{flow.description ?? 'Drag-drop workflow editor'}</p>
        </div>
        <RunButton flowId={flow.id} />
      </header>
      <FlowCanvas flowId={flow.id} initialNodes={flow.graph?.nodes ?? []} initialEdges={flow.graph?.edges ?? []} />
    </div>
  );
}
