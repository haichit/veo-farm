'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { BuilderLayout } from '@/components/builder/BuilderLayout';
import { BuilderCanvas } from '@/components/builder/BuilderCanvas';
import { BuilderToolbar } from '@/components/builder/BuilderToolbar';
import { NodePalette } from '@/components/builder/NodePalette';
import { WorkflowControls } from '@/components/builder/WorkflowControls';
import { NodeEditorPanel } from '@/components/builder/NodeEditorPanel';
import { AlbumGalleryOverlay } from '@/components/builder/AlbumGalleryOverlay';
import { useFlowStore } from '@/lib/builder/flow-store';

// Empty workspace by default; loads ?wf=<id> when launched from /workflows.
export default function CanvasIndexPage() {
  const hasSelection = useFlowStore((s) => !!s.selectedNodeId);
  const loadWorkflow = useFlowStore((s) => s.loadWorkflow);
  const currentWorkflowId = useFlowStore((s) => s.currentWorkflowId);
  const searchParams = useSearchParams();
  const wfId = searchParams.get('wf');

  useEffect(() => {
    if (wfId && wfId !== currentWorkflowId) {
      void loadWorkflow(wfId);
    }
  }, [wfId, currentWorkflowId, loadWorkflow]);

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
