'use client';

import { BuilderLayout } from '@/components/builder/BuilderLayout';
import { BuilderCanvas } from '@/components/builder/BuilderCanvas';
import { BuilderToolbar } from '@/components/builder/BuilderToolbar';
import { NodePalette } from '@/components/builder/NodePalette';
import { WorkflowControls } from '@/components/builder/WorkflowControls';
import { NodeEditorPanel } from '@/components/builder/NodeEditorPanel';
import { useFlowStore } from '@/lib/builder/flow-store';

// Index entry — opens an empty workspace. User can drag nodes in and hit
// "Lưu" to persist; the saveWorkflow action redirects flow id afterwards.
export default function CanvasIndexPage() {
  const hasSelection = useFlowStore((s) => !!s.selectedNodeId);
  return (
    <BuilderLayout
      sidebar={
        <>
          <NodePalette />
          <div className="mt-auto">
            <WorkflowControls />
          </div>
        </>
      }
      toolbar={<BuilderToolbar />}
      canvas={<BuilderCanvas />}
      editor={hasSelection ? <NodeEditorPanel /> : undefined}
    />
  );
}
