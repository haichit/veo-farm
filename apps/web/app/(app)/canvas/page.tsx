'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const newWorkflow = useFlowStore((s) => s.newWorkflow);
  const searchParams = useSearchParams();
  const router = useRouter();
  const wfId = searchParams.get('wf');
  const isNew = searchParams.get('new') === '1';

  // Tracks which `?wf=` value we've already actioned, so switching workflows
  // from the sidebar list (which calls loadWorkflow directly, without ever
  // touching the URL) doesn't get immediately fought and reverted by this
  // effect re-firing — it used to compare against the store's
  // currentWorkflowId instead, which changes on EVERY workflow switch (sidebar
  // clicks included), so picking a different saved workflow from the sidebar
  // made this effect see "URL wf != currentWorkflowId" and reload the OLD
  // URL's workflow right back on top of the one just clicked.
  const handledWfId = useRef<string | null>(null);

  useEffect(() => {
    if (wfId) {
      if (handledWfId.current !== wfId) {
        handledWfId.current = wfId;
        void loadWorkflow(wfId);
      }
    } else if (isNew) {
      // Explicit "Tạo mới" intent (?new=1) — the store is a client-side
      // singleton that survives navigation, so without this the previous
      // workflow's nodes/edges just stay on screen. Scoped to this explicit
      // flag (not "any plain /canvas visit") because the top-nav "Canvas"
      // link — and the app's own startup URL — also land on plain /canvas;
      // treating that the same way wiped a live, never-saved canvas on
      // every app restart.
      handledWfId.current = null;
      newWorkflow();
      router.replace('/canvas');
    }
  }, [wfId, isNew, loadWorkflow, newWorkflow, router]);

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
