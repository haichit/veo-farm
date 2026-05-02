'use client';

import { useEffect, useRef } from 'react';
import { useFlowStore, type BuilderNode } from './flow-store';
import type { Edge } from '@xyflow/react';

const KEY = 'veo-farm:builder:autosave:v1';
const DEBOUNCE_MS = 2000;

interface AutosavePayload {
  name: string;
  workflowId: string | null;
  nodes: BuilderNode[];
  edges: Edge[];
  ts: number;
}

/**
 * Persist the current canvas state to localStorage with a 2s debounce.
 * Survives F5 / accidental tab close even when the user hasn't clicked
 * "Lưu" (which writes to the DB). Called once at the top of the canvas
 * page; on first mount it restores the most recent autosave if the
 * canvas is empty.
 */
export function useAutosave(): void {
  const restored = useRef(false);

  // Restore on first mount.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const payload = JSON.parse(raw) as AutosavePayload;
      if (!Array.isArray(payload.nodes) || payload.nodes.length === 0) return;
      const state = useFlowStore.getState();
      // Only restore if the user is on a fresh / empty canvas. If they
      // explicitly loaded a saved workflow already, leave it alone.
      if (state.nodes.length === 0 && state.currentWorkflowId === null) {
        useFlowStore.setState({
          nodes: payload.nodes,
          edges: payload.edges,
          currentWorkflowId: payload.workflowId,
          currentWorkflowName: payload.name,
        });
      }
    } catch {
      /* corrupted entry — ignore */
    }
  }, []);

  // Subscribe + debounce-write.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useFlowStore.subscribe((s, prev) => {
      if (s.nodes === prev.nodes && s.edges === prev.edges && s.currentWorkflowName === prev.currentWorkflowName) {
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const payload: AutosavePayload = {
          name: s.currentWorkflowName,
          workflowId: s.currentWorkflowId,
          // Strip ephemeral status before persisting so a stale running
          // badge doesn't reappear after reload.
          nodes: s.nodes.map((n) => ({
            ...n,
            data: {
              config: n.data?.config ?? {},
              label: n.data?.label,
            },
          })),
          edges: s.edges,
          ts: Date.now(),
        };
        try {
          window.localStorage.setItem(KEY, JSON.stringify(payload));
        } catch {
          /* quota exceeded — fail silently */
        }
      }, DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
