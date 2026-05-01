'use client';

import { BuilderLayout } from '@/components/builder/BuilderLayout';
import { BuilderCanvas } from '@/components/builder/BuilderCanvas';
import { BuilderToolbar } from '@/components/builder/BuilderToolbar';
import { NodePalette } from '@/components/builder/NodePalette';
import { WorkflowControls } from '@/components/builder/WorkflowControls';

// Index entry — opens an empty workspace. User can drag nodes in and hit
// "Lưu" to persist; the saveWorkflow action redirects flow id afterwards.
export default function CanvasIndexPage() {
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
    />
  );
}
