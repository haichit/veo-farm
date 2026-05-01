'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { BuilderLayout } from '@/components/builder/BuilderLayout';
import { BuilderCanvas } from '@/components/builder/BuilderCanvas';
import { BuilderToolbar } from '@/components/builder/BuilderToolbar';
import { NodePalette } from '@/components/builder/NodePalette';
import { WorkflowControls } from '@/components/builder/WorkflowControls';
import { NodeEditorPanel } from '@/components/builder/NodeEditorPanel';
import { AlbumGalleryOverlay } from '@/components/builder/AlbumGalleryOverlay';
import { useFlowStore } from '@/lib/builder/flow-store';

export default function CanvasFlowPage() {
  const params = useParams<{ flowId: string }>();
  const flowId = params?.flowId;
  const loadWorkflow = useFlowStore((s) => s.loadWorkflow);
  const newWorkflow = useFlowStore((s) => s.newWorkflow);
  const hasSelection = useFlowStore((s) => !!s.selectedNodeId);

  useEffect(() => {
    if (!flowId || flowId === 'new') {
      newWorkflow();
      return;
    }
    void loadWorkflow(flowId);
  }, [flowId, loadWorkflow, newWorkflow]);

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
      overlays={<AlbumGalleryOverlay />}
    />
  );
}
