'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { IdeaInputNode } from '../nodes/IdeaInputNode';
import { ScriptWriterNode } from '../nodes/ScriptWriterNode';
import { ImageGeneratorNode } from '../nodes/ImageGeneratorNode';
import { VideoRenderNode } from '../nodes/VideoRenderNode';
import { VoiceGenNode } from '../nodes/VoiceGenNode';
import { ConcatNode } from '../nodes/ConcatNode';
import { DownloadNode } from '../nodes/DownloadNode';
import { FlowOutputsProvider } from '@/lib/hooks/useFlowOutputs';

const nodeTypes = {
  ideaInput: IdeaInputNode,
  scriptWriter: ScriptWriterNode,
  imageGenerator: ImageGeneratorNode,
  videoRender: VideoRenderNode,
  voiceGen: VoiceGenNode,
  concat: ConcatNode,
  download: DownloadNode,
};

interface Props {
  flowId: string;
  initialNodes: Node[];
  initialEdges: Edge[];
}

export default function FlowCanvas({ flowId, initialNodes, initialEdges }: Props) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)), []);
  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge(c, es)), []);

  // Debounced auto-save
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const res = await fetch(`/api/flows/${flowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ graph: { nodes, edges } }),
        });
        setSaveStatus(res.ok ? 'saved' : 'error');
      } catch {
        setSaveStatus('error');
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, flowId]);

  const types = useMemo(() => nodeTypes, []);

  return (
    <div className="relative h-[calc(100vh-3rem)]">
      <div
        className={`absolute top-3 right-3 z-10 text-[11px] font-medium px-2.5 py-1 rounded-full border backdrop-blur-md transition-colors ${
          saveStatus === 'saving'
            ? 'bg-info/10 border-info/30 text-info'
            : saveStatus === 'saved'
              ? 'bg-success-bg border-success/30 text-success'
              : 'bg-error-bg border-error/30 text-error'
        }`}
      >
        {saveStatus === 'saving' && '💾 Đang lưu...'}
        {saveStatus === 'saved' && '✓ Đã lưu'}
        {saveStatus === 'error' && '❌ Lỗi lưu'}
      </div>
      <FlowOutputsProvider flowId={flowId}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={types}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap
            maskColor="rgba(10, 10, 18, 0.7)"
            nodeColor="#1c1c38"
            nodeStrokeColor="rgba(138, 92, 246, 0.4)"
            style={{ background: '#111120', border: '1px solid rgba(255,255,255,0.06)' }}
          />
        </ReactFlow>
      </ReactFlowProvider>
      </FlowOutputsProvider>
    </div>
  );
}
