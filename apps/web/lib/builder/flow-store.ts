// Workflow Builder — central Zustand store (SPEC §20.11, 20.6, 20.10).
//
// Responsibilities:
//  - nodes/edges (React Flow shape)
//  - selectedNodeId for the right Editor panel
//  - runState (idle|running|paused|stopped) + stats (done/wait/err)
//  - per-node ephemeral status + preview media (real-time from Supabase)
//  - undo/redo: 60-stack of {nodes, edges} snapshots
//  - clipboard for copy/paste (with cursor-relative offset)
//  - savedWorkflows list + CRUD actions hitting /api/workflows
//  - albumMedia overlay (gathered from completed sub-jobs)
//
// Realtime sync (subscribe to Supabase Realtime sub_jobs UPDATE) lives in a
// separate hook (useJobSubscription) and calls the *NodeStatus / *Stats setters
// here. Worker integration consumes /api/run-workflow-builder.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Edge, Node, XYPosition } from '@xyflow/react';
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import type { EdgeChange, NodeChange, Connection } from '@xyflow/react';
import type { WorkflowJSON } from '@veo-farm/shared';
import {
  NODE_TYPES,
  type BuilderNodeType,
} from './node-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RunState = 'idle' | 'running' | 'paused' | 'stopped';

export type NodeStatus = 'idle' | 'wait' | 'running' | 'done' | 'error';

export interface PreviewMedia {
  url: string;
  /** image | video — chooses thumbnail vs <video> rendering. */
  kind: 'image' | 'video';
  /** Optional: original mime type. */
  mime?: string;
}

export interface BuilderNodeData extends Record<string, unknown> {
  config?: Record<string, unknown>;
  status?: NodeStatus;
  /** % progress 0..100 — drives the loading ring fill. */
  progress?: number;
  /** Media outputs to preview inline (post-success). */
  previewMedia?: PreviewMedia[];
  /** Last text output from gemini_prompt / prompt nodes (post-success). */
  lastOutputText?: string;
  /** Last error message (renders red status dot). */
  error?: string;
  label?: string;
}

export type BuilderNode = Node<BuilderNodeData>;

export interface BuilderStats {
  done: number;
  wait: number;
  err: number;
}

export interface SavedWorkflowSummary {
  id: string;
  name: string;
  updated_at: string;
}

interface HistorySnapshot {
  nodes: BuilderNode[];
  edges: Edge[];
}

const HISTORY_LIMIT = 60;

// ─── Store ────────────────────────────────────────────────────────────────────

interface FlowStoreState {
  // Graph
  nodes: BuilderNode[];
  edges: Edge[];

  // UI selection
  selectedNodeId: string | null;
  selectedNodeIds: string[];

  // Run lifecycle
  runState: RunState;
  /** Job id returned by /api/run-workflow-builder — used for realtime subscribe. */
  currentJobId: string | null;
  stats: BuilderStats;

  // Persistence
  currentWorkflowId: string | null;
  currentWorkflowName: string;
  savedWorkflows: SavedWorkflowSummary[];

  /** Saved Gemini API key — auto-fill when user creates a new gemini_*
   *  node, auto-update when user pastes key into any gemini node editor.
   *  Persisted via the persist middleware so it survives F5. */
  defaultGeminiApiKey: string;

  // Album overlay
  albumOpen: boolean;
  albumMedia: PreviewMedia[];

  // Undo/redo
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // Clipboard
  clipboard: { nodes: BuilderNode[]; edges: Edge[] } | null;

  // ── Actions: graph mutation (React Flow handlers) ──
  setNodes: (nodes: BuilderNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange<BuilderNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: BuilderNodeType, position: XYPosition) => string;
  updateNodeData: (id: string, patch: Partial<BuilderNodeData>) => void;
  updateNodeConfig: (id: string, patch: Record<string, unknown>) => void;
  removeNodes: (ids: string[]) => void;

  // ── Actions: selection ──
  selectNode: (id: string | null) => void;
  selectMany: (ids: string[]) => void;

  // ── Actions: run lifecycle ──
  setRunState: (state: RunState) => void;
  setCurrentJobId: (jobId: string | null) => void;
  updateNodeStatus: (
    nodeId: string,
    status: NodeStatus,
    extra?: { error?: string; progress?: number },
  ) => void;
  setNodePreview: (nodeId: string, media: PreviewMedia[]) => void;
  setNodeOutputText: (nodeId: string, text: string) => void;
  setStats: (stats: BuilderStats) => void;
  resetAllNodeStatus: () => void;

  // ── Actions: undo/redo ──
  /** Push current graph onto history. Call BEFORE a destructive change. */
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // ── Actions: clipboard ──
  copySelected: () => void;
  paste: (cursor?: XYPosition) => void;

  // ── Actions: persistence ──
  setCurrentWorkflow: (id: string | null, name: string) => void;
  setDefaultGeminiApiKey: (key: string) => void;
  newWorkflow: () => void;
  refreshSavedWorkflows: () => Promise<void>;
  saveWorkflow: (name?: string) => Promise<void>;
  loadWorkflow: (id: string) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  exportWorkflow: () => void;
  importWorkflow: () => void;

  // ── Actions: album ──
  openAlbum: () => void;
  closeAlbum: () => void;
  pushAlbumMedia: (media: PreviewMedia[]) => void;
  clearAlbum: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId(prefix = 'n'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function snapshot(state: Pick<FlowStoreState, 'nodes' | 'edges'>): HistorySnapshot {
  return {
    nodes: structuredClone(state.nodes),
    edges: structuredClone(state.edges),
  };
}

// Drop fields whose value is a `data:` URL longer than 100KB — typically
// a video the user dropped on upload_image. localStorage caps around 5MB
// total so a single 50MB video data URL would crash setItem. Workflow
// structure still persists; user just has to re-upload after F5.
function stripBigBlobs(cfg: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (typeof v === 'string' && v.startsWith('data:') && v.length > 100_000) {
      // Mark as elided so UI can display "(uploaded file — re-pick after reload)"
      out[k] = '';
      out[`${k}__stripped`] = true;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function shallowGraphEqual(a: HistorySnapshot, b: HistorySnapshot): boolean {
  return (
    a.nodes.length === b.nodes.length &&
    a.edges.length === b.edges.length &&
    JSON.stringify(a.nodes) === JSON.stringify(b.nodes) &&
    JSON.stringify(a.edges) === JSON.stringify(b.edges)
  );
}

// ─── Store factory ────────────────────────────────────────────────────────────

export const useFlowStore = create<FlowStoreState>()(
  persist(
    (set, get) => ({
  nodes: [],
  edges: [],

  selectedNodeId: null,
  selectedNodeIds: [],

  runState: 'idle',
  currentJobId: null,
  stats: { done: 0, wait: 0, err: 0 },

  currentWorkflowId: null,
  currentWorkflowName: 'Workflow mới',
  savedWorkflows: [],
  defaultGeminiApiKey: '',

  albumOpen: false,
  albumMedia: [],

  past: [],
  future: [],

  clipboard: null,

  // ── Graph ──
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges<BuilderNode>(changes, s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),
  onConnect: (connection) => {
    if (!connection.source || !connection.target) return;
    get().pushHistory();
    set((s) => ({
      edges: [
        ...s.edges,
        {
          id: makeId('e'),
          source: connection.source!,
          target: connection.target!,
          sourceHandle: connection.sourceHandle ?? undefined,
          targetHandle: connection.targetHandle ?? undefined,
        },
      ],
    }));
  },
  addNode: (type, position) => {
    const def = NODE_TYPES[type];
    if (!def) throw new Error(`Unknown node type: ${type}`);
    get().pushHistory();
    const id = makeId(type);
    // Auto-fill Gemini API key on new gemini_* nodes so user doesn't have
    // to paste it every time. (gemini_prompt_kie uses a different vendor's
    // key — skip auto-fill for that one.)
    const config = { ...def.defaults } as Record<string, unknown>;
    const savedGemini = get().defaultGeminiApiKey;
    if (savedGemini && (type === 'gemini_prompt' || type === 'gemini_vision')) {
      config.apiKey = savedGemini;
    }
    const node: BuilderNode = {
      id,
      type,
      position,
      data: { config, status: 'idle' },
      width: def.width,
      height: def.minHeight,
      // Frames render behind other nodes so children appear grouped within them.
      ...(type === 'frame' ? { zIndex: -1 } : {}),
    };
    set((s) => ({
      // Prepend frames so React Flow paints them first (lower z layer).
      nodes: type === 'frame' ? [node, ...s.nodes] : [...s.nodes, node],
      selectedNodeId: id,
      selectedNodeIds: [id],
    }));
    return id;
  },
  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    })),
  updateNodeConfig: (id, patch) => {
    get().pushHistory();
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, config: { ...(n.data?.config ?? {}), ...patch } } }
          : n,
      ),
    }));
  },
  removeNodes: (ids) => {
    if (ids.length === 0) return;
    get().pushHistory();
    const idSet = new Set(ids);
    set((s) => ({
      nodes: s.nodes.filter((n) => !idSet.has(n.id)),
      edges: s.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
      selectedNodeId: s.selectedNodeId && idSet.has(s.selectedNodeId) ? null : s.selectedNodeId,
      selectedNodeIds: s.selectedNodeIds.filter((nid) => !idSet.has(nid)),
    }));
  },

  // ── Selection ──
  selectNode: (id) =>
    set({ selectedNodeId: id, selectedNodeIds: id ? [id] : [] }),
  selectMany: (ids) =>
    set({ selectedNodeIds: ids, selectedNodeId: ids.length === 1 ? ids[0] : null }),

  // ── Run lifecycle ──
  setRunState: (runState) => set({ runState }),
  setCurrentJobId: (currentJobId) => set({ currentJobId }),
  updateNodeStatus: (nodeId, status, extra) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                status,
                ...(extra?.error !== undefined ? { error: extra.error } : {}),
                ...(extra?.progress !== undefined ? { progress: extra.progress } : {}),
              },
            }
          : n,
      ),
    })),
  setNodePreview: (nodeId, media) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, previewMedia: media } } : n,
      ),
      // Also feed the album so the gallery overlay accumulates everything.
      albumMedia: [...s.albumMedia, ...media],
    })),
  setNodeOutputText: (nodeId, text) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, lastOutputText: text } } : n,
      ),
    })),
  setStats: (stats) => set({ stats }),
  resetAllNodeStatus: () =>
    set((s) => ({
      nodes: s.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          status: 'idle',
          progress: undefined,
          error: undefined,
          // Also clear stale previews so a re-run starts clean instead of
          // showing the previous run's image until the new one overwrites.
          previewMedia: undefined,
        },
      })),
      stats: { done: 0, wait: 0, err: 0 },
    })),

  // ── Undo / redo ──
  pushHistory: () => {
    const cur = snapshot(get());
    set((s) => {
      const last = s.past[s.past.length - 1];
      if (last && shallowGraphEqual(last, cur)) return {} as Partial<FlowStoreState>;
      const past = [...s.past, cur];
      if (past.length > HISTORY_LIMIT) past.shift();
      return { past, future: [] };
    });
  },
  undo: () => {
    const { past, nodes, edges } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [...get().future, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      nodes: prev.nodes,
      edges: prev.edges,
    });
  },
  redo: () => {
    const { future, nodes, edges } = get();
    if (future.length === 0) return;
    const next = future[future.length - 1];
    set({
      future: future.slice(0, -1),
      past: [...get().past, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      nodes: next.nodes,
      edges: next.edges,
    });
  },

  // ── Clipboard ──
  copySelected: () => {
    const { nodes, edges, selectedNodeIds } = get();
    if (selectedNodeIds.length === 0) return;
    const idSet = new Set(selectedNodeIds);
    const copyNodes = nodes.filter((n) => idSet.has(n.id)).map((n) => structuredClone(n));
    const copyEdges = edges
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e) => structuredClone(e));
    set({ clipboard: { nodes: copyNodes, edges: copyEdges } });
  },
  paste: (cursor) => {
    const { clipboard } = get();
    if (!clipboard || clipboard.nodes.length === 0) return;
    get().pushHistory();
    // Compute centroid of clipboard so paste lands at cursor.
    const cx = clipboard.nodes.reduce((sum, n) => sum + n.position.x, 0) / clipboard.nodes.length;
    const cy = clipboard.nodes.reduce((sum, n) => sum + n.position.y, 0) / clipboard.nodes.length;
    const offsetX = (cursor?.x ?? cx + 40) - cx;
    const offsetY = (cursor?.y ?? cy + 40) - cy;
    const idMap = new Map<string, string>();
    const newNodes: BuilderNode[] = clipboard.nodes.map((n) => {
      const newId = makeId(n.type ?? 'n');
      idMap.set(n.id, newId);
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + offsetX, y: n.position.y + offsetY },
        selected: true,
      };
    });
    const newEdges: Edge[] = clipboard.edges.map((e) => ({
      ...e,
      id: makeId('e'),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));
    set((s) => ({
      nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
      edges: [...s.edges, ...newEdges],
      selectedNodeIds: newNodes.map((n) => n.id),
      selectedNodeId: newNodes.length === 1 ? newNodes[0].id : null,
    }));
  },

  // ── Persistence ──
  setCurrentWorkflow: (id, name) => set({ currentWorkflowId: id, currentWorkflowName: name }),
  setDefaultGeminiApiKey: (key) => set({ defaultGeminiApiKey: key.trim() }),
  newWorkflow: () =>
    set({
      nodes: [],
      edges: [],
      currentWorkflowId: null,
      currentWorkflowName: 'Workflow mới',
      past: [],
      future: [],
      stats: { done: 0, wait: 0, err: 0 },
      runState: 'idle',
      currentJobId: null,
      selectedNodeId: null,
      selectedNodeIds: [],
    }),

  refreshSavedWorkflows: async () => {
    const r = await fetch('/api/workflows');
    if (!r.ok) return;
    const data: SavedWorkflowSummary[] = await r.json();
    set({ savedWorkflows: data });
  },

  saveWorkflow: async (name) => {
    const { nodes, edges, currentWorkflowId, currentWorkflowName } = get();
    const payload: WorkflowJSON = {
      version: '1.0',
      name: name ?? currentWorkflowName,
      // Strip ephemeral status fields — only persist config + position + structure.
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? 'prompt',
        position: n.position,
        data: { config: n.data?.config ?? {}, label: n.data?.label },
        width: n.width,
        height: n.height,
        parentId: (n as any).parentId,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? '',
        targetHandle: e.targetHandle ?? '',
      })),
    };
    const url = currentWorkflowId ? `/api/workflows/${currentWorkflowId}` : '/api/workflows';
    const r = await fetch(url, {
      method: currentWorkflowId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: payload.name, graph: payload }),
    });
    if (!r.ok) return;
    const data = await r.json();
    set({ currentWorkflowId: data.id, currentWorkflowName: data.name ?? payload.name });
    await get().refreshSavedWorkflows();
  },

  loadWorkflow: async (id) => {
    const r = await fetch(`/api/workflows/${id}`);
    if (!r.ok) return;
    const wf = await r.json();
    const graph: WorkflowJSON = wf.graph;
    const restoredNodes: BuilderNode[] = graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { config: n.data?.config ?? {}, label: n.data?.label, status: 'idle' },
      width: n.width,
      height: n.height,
      ...(n.parentId ? { parentId: n.parentId } : {}),
    }));
    const restoredEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
    }));
    set({
      currentWorkflowId: wf.id,
      currentWorkflowName: wf.name,
      nodes: restoredNodes,
      edges: restoredEdges,
      past: [],
      future: [],
      stats: { done: 0, wait: 0, err: 0 },
      runState: 'idle',
      currentJobId: null,
      selectedNodeId: null,
      selectedNodeIds: [],
    });
  },

  deleteWorkflow: async (id) => {
    await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
    if (get().currentWorkflowId === id) get().newWorkflow();
    await get().refreshSavedWorkflows();
  },

  exportWorkflow: () => {
    const { nodes, edges, currentWorkflowName } = get();
    const json: WorkflowJSON = {
      version: '1.0',
      name: currentWorkflowName,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? 'prompt',
        position: n.position,
        data: { config: n.data?.config ?? {}, label: n.data?.label },
        width: n.width,
        height: n.height,
        parentId: (n as any).parentId,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? '',
        targetHandle: e.targetHandle ?? '',
      })),
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentWorkflowName || 'workflow'}.veoflow.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importWorkflow: () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.veoflow.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const wf = JSON.parse(text) as WorkflowJSON;
        if (!Array.isArray(wf.nodes) || !Array.isArray(wf.edges)) {
          throw new Error('Invalid workflow JSON shape');
        }
        get().pushHistory();
        const restoredNodes: BuilderNode[] = wf.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: { config: n.data?.config ?? {}, label: n.data?.label, status: 'idle' },
          width: n.width,
          height: n.height,
          ...(n.parentId ? { parentId: n.parentId } : {}),
        }));
        const restoredEdges: Edge[] = wf.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle || undefined,
          targetHandle: e.targetHandle || undefined,
        }));
        set({
          nodes: restoredNodes,
          edges: restoredEdges,
          currentWorkflowId: null,
          currentWorkflowName: wf.name || 'Workflow đã import',
        });
      } catch (e: any) {
        alert(`Import failed: ${e?.message ?? e}`);
      }
    };
    input.click();
  },

  // ── Album ──
  openAlbum: () => set({ albumOpen: true }),
  closeAlbum: () => set({ albumOpen: false }),
  pushAlbumMedia: (media) =>
    set((s) => ({ albumMedia: [...s.albumMedia, ...media] })),
  clearAlbum: () => set({ albumMedia: [] }),
    }),
    {
      name: 'veo-farm:builder:v2',
      // Catch QuotaExceededError so user doesn't get a full app crash if
      // they paste a giant data URL into upload_image. Falls back to
      // returning the input unchanged (skip the write).
      storage: createJSONStorage(() => ({
        getItem: (k) => {
          try {
            return localStorage.getItem(k);
          } catch {
            return null;
          }
        },
        setItem: (k, v) => {
          try {
            localStorage.setItem(k, v);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[builder] localStorage quota exceeded, skipping autosave', e);
          }
        },
        removeItem: (k) => {
          try {
            localStorage.removeItem(k);
          } catch {
            /* ignore */
          }
        },
      })),
      // Only persist the user's workspace; skip transient run/realtime state
      // and server-cached lists (savedWorkflows is fetched fresh).
      partialize: (state) => ({
        nodes: state.nodes.map((n) => ({
          ...n,
          // Strip ephemeral status badges so a stale "running" doesn't
          // reappear after reload. Also strip giant data: URLs from upload
          // nodes — they blow past the 5MB localStorage quota for any
          // non-trivial file. User will need to re-upload after reload.
          data: {
            config: stripBigBlobs(n.data?.config ?? {}),
            label: n.data?.label,
          },
        })),
        edges: state.edges,
        currentWorkflowId: state.currentWorkflowId,
        currentWorkflowName: state.currentWorkflowName,
        defaultGeminiApiKey: state.defaultGeminiApiKey,
      }),
      version: 2,
    },
  ),
);
