export type NodeType =
  | 'ideaInput'
  | 'scriptWriter'
  | 'imageGenerator'
  | 'videoRender'
  | 'voiceGen'
  | 'concat'
  | 'download';

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label?: string;
    provider?: string;
    concurrency?: number | 'auto';
    config?: Record<string, unknown>;
    [k: string]: unknown;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface Flow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  graph: FlowGraph;
  created_at: string;
  updated_at: string;
}
