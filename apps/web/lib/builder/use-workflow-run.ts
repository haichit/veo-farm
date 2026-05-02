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
  const resetNodesStatus = useFlowStore((s) => s.resetNodesStatus);
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
      // Partial reset: when running a specific node (▶ on node / Run frame),
      // only clear status+output for that node and its upstream ancestors.
      // Other nodes' previous outputs stay visible. Full reset only when
      // running the whole workflow from the toolbar.
      const targetIds = Array.isArray(target) ? target : target ? [target] : null;
      if (targetIds && targetIds.length > 0) {
        const reverseAdj = new Map<string, string[]>();
        for (const e of edges) {
          if (!reverseAdj.has(e.target)) reverseAdj.set(e.target, []);
          reverseAdj.get(e.target)!.push(e.source);
        }
        const ancestors = new Set<string>(targetIds);
        const stack = [...targetIds];
        while (stack.length) {
          const id = stack.pop()!;
          for (const src of reverseAdj.get(id) ?? []) {
            if (!ancestors.has(src)) {
              ancestors.add(src);
              stack.push(src);
            }
          }
        }
        resetNodesStatus([...ancestors]);
      } else {
        resetAllNodeStatus();
      }
      setRunState('running');
      // Defensive — if any node still holds a giant data: URL (from before
      // /api/upload-media existed), the Postgres INSERT will time out. Drop
      // them and warn the user to re-upload.
      let stripped = 0;
      const safeConfig = (cfg: Record<string, unknown>): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(cfg ?? {})) {
          if (typeof v === 'string' && v.startsWith('data:') && v.length > 100_000) {
            out[k] = '';
            stripped += 1;
          } else {
            out[k] = v;
          }
        }
        return out;
      };
      const workflow: WorkflowJSON = {
        version: '1.0',
        name: currentWorkflowName,
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type ?? 'prompt',
          position: n.position,
          data: { config: safeConfig((n.data?.config ?? {}) as Record<string, unknown>), label: n.data?.label },
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
      if (stripped > 0) {
        alert(
          `Đã loại bỏ ${stripped} file lớn cũ khỏi workflow (data URL). Vui lòng pick lại file qua nút Upload Media — hệ thống mới sẽ upload thẳng lên Storage.`,
        );
      }
      const targetNodeIds = targetIds;
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
