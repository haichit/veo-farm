'use client';

import { useCallback } from 'react';
import { useFlowStore } from './flow-store';
import type { WorkflowJSON } from '@veo-farm/shared';

/**
 * Hook used by both BuilderToolbar (Run button) and per-node Play buttons
 * (the ▶ in each node header). Submitting from a specific node passes its
 * id as `targetNodeId` so the worker can stop after that node — saving
 * generation time when the user only wants to test one branch.
 */
export function useWorkflowRun() {
  const setRunState = useFlowStore((s) => s.setRunState);
  const resetAllNodeStatus = useFlowStore((s) => s.resetAllNodeStatus);
  const setCurrentJobId = useFlowStore((s) => s.setCurrentJobId);
  const currentWorkflowId = useFlowStore((s) => s.currentWorkflowId);
  const currentWorkflowName = useFlowStore((s) => s.currentWorkflowName);

  const startRun = useCallback(
    async (target?: string | string[]) => {
      const { nodes, edges } = useFlowStore.getState();
      if (nodes.length === 0) {
        alert('Workflow chưa có node nào.');
        return;
      }
      resetAllNodeStatus();
      setRunState('running');
      const workflow: WorkflowJSON = {
        version: '1.0',
        name: currentWorkflowName,
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type ?? 'prompt',
          position: n.position,
          data: { config: n.data?.config ?? {}, label: n.data?.label },
          width: n.width,
          height: n.height,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? '',
          targetHandle: e.targetHandle ?? '',
        })),
      };
      const targetNodeIds = Array.isArray(target) ? target : target ? [target] : null;
      try {
        // eslint-disable-next-line no-console
        console.log('[builder] POST /api/run-workflow-builder', {
          nodes: nodes.length,
          edges: edges.length,
          targetNodeIds,
        });
        const r = await fetch('/api/run-workflow-builder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflow,
            workflowId: currentWorkflowId,
            targetNodeIds,
          }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          // eslint-disable-next-line no-console
          console.error('[builder] run failed', r.status, err);
          alert(`Run failed (${r.status}): ${err?.error ?? r.statusText}`);
          setRunState('idle');
          return;
        }
        const { jobId } = await r.json();
        // eslint-disable-next-line no-console
        console.log('[builder] job created', jobId, targetNodeIds ? `(targets=${targetNodeIds.join(',')})` : '');
        setCurrentJobId(jobId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[builder] network error', e);
        alert(`Network error: ${(e as Error).message ?? e}`);
        setRunState('idle');
      }
    },
    [currentWorkflowId, currentWorkflowName, resetAllNodeStatus, setRunState, setCurrentJobId],
  );

  return { startRun };
}
