// Workflow Builder JSON schema (SPEC §20.11).
// Stored in the `workflows.graph` column. Distinct from MVP-1 `flows.graph`
// (which uses the older 7-node taxonomy: ideaInput/scriptWriter/...).

export interface WorkflowNodeJSON {
  id: string;
  type: string; // BuilderNodeType — kept loose at the type level for forward-compat
  position: { x: number; y: number };
  data: {
    config?: Record<string, unknown>;
    /** Optional label override (Frame node uses this for the group title). */
    label?: string;
  };
  /** Optional dimensions — Frame node + resizable Prompt nodes persist size. */
  width?: number;
  height?: number;
  /** Frame parent — set by React Flow when nodes are nested inside a Frame. */
  parentId?: string;
}

export interface WorkflowEdgeJSON {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface WorkflowJSON {
  version: '1.0';
  name: string;
  nodes: WorkflowNodeJSON[];
  edges: WorkflowEdgeJSON[];
}

export interface WorkflowRecord {
  id: string;
  user_id: string;
  name: string;
  graph: WorkflowJSON;
  created_at: string;
  updated_at: string;
}
