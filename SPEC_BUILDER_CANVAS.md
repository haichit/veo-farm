# Veo Farm — Workflow Builder Canvas Spec

**Source:** Reverse-engineered từ commercial tool VEO3 Flow Automation v1.5.0 (`workflow-builder.js` 4488 lines + `index.html` lines 1025-1135 + `styles.css` lines 1880-2240).

**Mục tiêu:** Build Workflow Builder UI cho Veo Farm match 80% UX của tool gốc nhưng dùng **React Flow** thay HTML5 Canvas custom (tool gốc dùng `<canvas>` raw + custom paint).

**Status:** Section 20 — sau Sprint 8 (UI glass-morphism foundation đã ship). Build **Sprint 10** (Builder canvas).

---

## 20.1 Architecture overview

### Tool gốc (vanilla JS + HTML5 Canvas)

```
.wfb-layout (flex 3 cột)
├── .wfb-sidebar (240px left)
│   ├── #wfbNodePalette (categories: Input/Generate/Output/Util, drag-from)
│   └── .wfb-wf-controls (workflow CRUD: name + save/+/export/import + saved list)
├── .wfb-canvas-wrapper (flex-1 center)
│   ├── .wfb-toolbar (Chạy/Pause/Stop + Stats Done/Wait/Err + Album btn)
│   └── #wfbCanvas (HTML5 canvas, pan/zoom/lasso/multi-select)
└── #wfbNodeEditor (240px right, hidden default)
```

### Veo Farm (Next.js + React Flow)

```
apps/web/app/(app)/canvas/[flowId]/page.tsx
├── components/builder/
│   ├── BuilderLayout.tsx              (flex 3 cột)
│   ├── NodePalette.tsx                (sidebar left, drag-from)
│   ├── WorkflowControls.tsx           (sidebar bottom, CRUD)
│   ├── BuilderToolbar.tsx             (top: Run/Pause/Stop + Stats + Album)
│   ├── BuilderCanvas.tsx              (wrap React Flow)
│   ├── NodeEditorPanel.tsx            (right, show on node click)
│   └── nodes/                         (10 custom React Flow nodes)
│       ├── PromptNode.tsx
│       ├── PromptListNode.tsx
│       ├── UploadMediaNode.tsx
│       ├── GeminiPromptNode.tsx
│       ├── GeminiPromptKieNode.tsx
│       ├── GenerateImageNode.tsx
│       ├── GenerateVideoNode.tsx
│       ├── MergeVideoNode.tsx
│       ├── DownloadNode.tsx
│       └── FrameNode.tsx
└── lib/builder/
    ├── node-types.ts                  (NODE_TYPES const đầy đủ)
    ├── workflow-runner.ts             (run/pause/stop API client)
    └── workflow-storage.ts            (save/load/import/export)
```

---

## 20.2 Node Types — 10 types đầy đủ (verified)

### NODE_TYPES const (TypeScript)

```typescript
// apps/web/lib/builder/node-types.ts

export interface NodeTypeDef {
  type: string;
  label: string;
  category: 'input' | 'generate' | 'output' | 'util';
  color: string;
  icon: string;          // lucide-react icon name
  inputs: PortDef[];
  outputs: PortDef[];
  defaults: Record<string, any>;
  width: number;         // default width px
  minHeight: number;
}

export interface PortDef {
  name: string;
  type: 'string' | 'image' | 'video' | 'any';
  color: string;
  optional?: boolean;
}

export const NODE_TYPES: Record<string, NodeTypeDef> = {
  prompt: {
    type: 'prompt',
    label: '📄 Text / Prompt',
    category: 'input',
    color: '#8a5cf6',     // purple
    icon: 'StickyNote',
    inputs: [{ name: 'text', type: 'string', color: '#a78bfa', optional: true }],
    outputs: [{ name: 'text', type: 'string', color: '#a78bfa' }],
    defaults: { text: '' },
    width: 240,
    minHeight: 130
  },
  prompt_list: {
    type: 'prompt_list',
    label: '📝 Prompt List',
    category: 'input',
    color: '#6366f1',     // indigo
    icon: 'List',
    inputs: [{ name: 'text', type: 'string', color: '#a78bfa', optional: true }],
    outputs: [{ name: 'textList', type: 'string', color: '#a78bfa' }],
    defaults: { text: '' },
    width: 280,
    minHeight: 100
  },
  upload_image: {
    type: 'upload_image',
    label: '📤 Upload Media',
    category: 'input',
    color: '#06b6d4',     // cyan
    icon: 'Upload',
    inputs: [],
    outputs: [{ name: 'media', type: 'any', color: '#22d3ee' }],
    defaults: { imagePath: '', imageUrl: '' },
    width: 220,
    minHeight: 90
  },
  gemini_prompt: {
    type: 'gemini_prompt',
    label: '🤖 Gemini Prompt',
    category: 'generate',
    color: '#84cc16',     // lime
    icon: 'Bot',
    inputs: [{ name: 'text', type: 'string', color: '#a78bfa', optional: true }],
    outputs: [{ name: 'text', type: 'string', color: '#a78bfa' }],
    defaults: {
      apiKey: '',
      promptTemplate: '',
      useAdditionalText: false,
      additionalText: 'Chỉ trả về prompt không kèm hướng dẫn, không kèm bất cứ điều gì'
    },
    width: 280,
    minHeight: 110
  },
  gemini_prompt_kie: {
    type: 'gemini_prompt_kie',
    label: '🤖 Gemini Prompt (Kie.ai)',
    category: 'generate',
    color: '#a855f7',     // violet
    icon: 'Sparkles',
    inputs: [{ name: 'text', type: 'string', color: '#a78bfa', optional: true }],
    outputs: [{ name: 'text', type: 'string', color: '#a78bfa' }],
    defaults: { apiKey: '', model: 'gemini-2.0-flash-exp', promptTemplate: '' },
    width: 280,
    minHeight: 110
  },
  generate_image: {
    type: 'generate_image',
    label: '🖼️ Generate Image',
    category: 'generate',
    color: '#ec4899',     // pink
    icon: 'Image',
    inputs: [{ name: 'prompt', type: 'string', color: '#a78bfa' }],
    outputs: [{ name: 'image', type: 'image', color: '#22d3ee' }],
    defaults: {
      ratio: 'landscape',         // 16:9 | 9:16 | 1:1 | 4:3 | 3:4
      quantity: 1,
      quality: '1080p',           // native | 720p | 1080p | 2K | 4K
      imageModel: 'imagen_4'      // imagen_4 | imagen_4_ref | nano_banana_pro | nano_banana_2
    },
    width: 260,
    minHeight: 150
  },
  generate_video: {
    type: 'generate_video',
    label: '🎬 Generate Video',
    category: 'generate',
    color: '#f97316',     // orange
    icon: 'Video',
    inputs: [{ name: 'prompt', type: 'string', color: '#a78bfa' }],
    outputs: [{ name: 'video', type: 'video', color: '#fb923c' }],
    defaults: {
      ratio: 'landscape',         // 16:9 | 9:16
      quantity: 1,
      quality: '1080p',
      videoModel: 'veo31_fast_lower',  // veo31_lite | veo31_fast | veo31_quality | _lower variants
      videoMode: 'FRAME'          // FRAME (start frame) | REF (reference images)
    },
    width: 370,
    minHeight: 120
  },
  merge_video: {
    type: 'merge_video',
    label: '🎞️ Ghép Video (Merge)',
    category: 'generate',
    color: '#10b981',     // emerald
    icon: 'Combine',
    inputs: [{ name: 'video', type: 'video', color: '#fb923c' }],
    outputs: [{ name: 'video', type: 'video', color: '#fb923c' }],
    defaults: {},
    width: 240,
    minHeight: 100
  },
  download: {
    type: 'download',
    label: '💾 Download',
    category: 'output',
    color: '#34d399',     // green
    icon: 'Download',
    inputs: [{ name: 'stream', type: 'any', color: '#86efac' }],
    outputs: [{ name: 'stream_out', type: 'any', color: '#86efac' }],
    defaults: { quality: 'native', directory: '' },
    width: 230,
    minHeight: 100
  },
  frame: {
    type: 'frame',
    label: '🔳 Khung Nhóm (Frame)',
    category: 'util',
    color: '#f59e0b',     // amber
    icon: 'Frame',
    inputs: [],
    outputs: [],
    defaults: { width: 500, height: 400, name: 'Khung Nhóm' },
    width: 500,
    minHeight: 400
  }
};

export const NODE_CATEGORIES = {
  input: 'Input',
  generate: 'Generate',
  output: 'Output',
  util: 'Công cụ'
} as const;
```

### Dynamic ports (cho `gemini_prompt`, `generate_image`, `generate_video`)

Các node generate có **dynamic input ports** — số ref image slots mở rộng theo số connection hiện tại.

```typescript
// apps/web/lib/builder/dynamic-ports.ts
const MAX_IMG_REFS = 5;

export function getNodeInputPorts(node: FlowNode, connections: Edge[]): PortDef[] {
  const def = NODE_TYPES[node.type];
  if (!def) return [];

  if (['gemini_prompt', 'gemini_prompt_kie', 'generate_image', 'generate_video'].includes(node.type)) {
    const refConns = connections.filter(c =>
      c.target === node.id && c.targetHandle && parseInt(c.targetHandle.replace('input-', '')) > 0
    ).length;

    const maxRefs = node.type === 'generate_video'
      ? (node.data.config?.videoMode === 'REF' ? MAX_IMG_REFS : 2)
      : MAX_IMG_REFS;

    const showSlots = Math.min(refConns + 1, maxRefs);

    // Port 0: text/prompt
    const ports: PortDef[] = [{
      name: ['gemini_prompt', 'gemini_prompt_kie'].includes(node.type) ? 'text' : 'prompt',
      type: 'string',
      color: '#a78bfa',
      optional: true
    }];

    // Ports > 0: dynamic media references
    for (let i = 0; i < showSlots; i++) {
      let portName = `ref img ${i + 1}`;
      let portType: PortDef['type'] = 'image';
      let portColor = '#22d3ee';

      if (node.type === 'generate_video') {
        if (node.data.config?.videoMode === 'REF') {
          portName = `ref img ${i + 1}`;
        } else {
          portName = i === 0 ? 'Start Frame' : 'End Frame';
        }
      }
      ports.push({ name: portName, type: portType, color: portColor });
    }

    return ports;
  }

  return def.inputs;
}
```

---

## 20.3 Layout — 3 cột flex

```typescript
// apps/web/app/(app)/canvas/[flowId]/page.tsx
import { BuilderLayout } from '@/components/builder/BuilderLayout';
import { NodePalette } from '@/components/builder/NodePalette';
import { WorkflowControls } from '@/components/builder/WorkflowControls';
import { BuilderToolbar } from '@/components/builder/BuilderToolbar';
import { BuilderCanvas } from '@/components/builder/BuilderCanvas';
import { NodeEditorPanel } from '@/components/builder/NodeEditorPanel';

export default function CanvasPage() {
  return (
    <BuilderLayout>
      <aside className="w-60 min-w-[240px] bg-bg-secondary border-r border-border flex flex-col overflow-y-auto">
        <NodePalette />
        <WorkflowControls />
      </aside>
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <BuilderToolbar />
        <BuilderCanvas />
      </main>
      <aside className="w-60 min-w-[240px] bg-bg-secondary border-l border-border overflow-y-auto" id="nodeEditor">
        <NodeEditorPanel />
      </aside>
    </BuilderLayout>
  );
}
```

### CSS variables (đã có từ Sprint 8)

```css
/* apps/web/app/globals.css — extend */
.builder-layout {
  display: flex;
  gap: 0;
  height: calc(100vh - 48px);  /* topnav 48px */
  overflow: hidden;
  background: var(--bg-primary);
}
```

---

## 20.4 NodePalette component

```tsx
// apps/web/components/builder/NodePalette.tsx
'use client';
import * as Icons from 'lucide-react';
import { NODE_TYPES, NODE_CATEGORIES } from '@/lib/builder/node-types';

export function NodePalette() {
  // Group by category
  const grouped = Object.values(NODE_TYPES).reduce<Record<string, typeof NODE_TYPES[string][]>>((acc, def) => {
    if (!acc[def.category]) acc[def.category] = [];
    acc[def.category].push(def);
    return acc;
  }, {});

  function onDragStart(e: React.DragEvent, type: string) {
    e.dataTransfer.setData('application/veofarm-node-type', type);
    e.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <div className="p-3 border-b border-border">
      <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2.5">Nodes</div>

      {(Object.keys(NODE_CATEGORIES) as Array<keyof typeof NODE_CATEGORIES>).map(catKey => {
        const items = grouped[catKey];
        if (!items?.length) return null;
        return (
          <div key={catKey} className="mb-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              {NODE_CATEGORIES[catKey]}
            </div>
            {items.map(item => {
              const Icon = (Icons as any)[item.icon] ?? Icons.Box;
              return (
                <div
                  key={item.type}
                  draggable
                  onDragStart={e => onDragStart(e, item.type)}
                  className="flex items-center gap-2 py-1.5 px-2.5 rounded-md bg-bg-card border border-border mb-1 cursor-grab text-xs font-medium text-text-secondary hover:bg-bg-card-hover hover:text-text-primary hover:border-glass-border hover:translate-x-0.5 active:cursor-grabbing active:opacity-70 transition-all select-none"
                  style={{ borderLeft: `3px solid ${item.color}` }}
                >
                  <Icon size={15} style={{ color: item.color }} />
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
```

### Drop handler trong BuilderCanvas

```tsx
// apps/web/components/builder/BuilderCanvas.tsx (excerpt)
import { ReactFlow, useReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import { useFlowStore } from '@/lib/builder/flow-store';
import { NODE_TYPES } from '@/lib/builder/node-types';
import { customNodeTypes } from './nodes';

export function BuilderCanvas() {
  const { screenToFlowPosition } = useReactFlow();
  const addNode = useFlowStore(s => s.addNode);

  return (
    <div
      className="flex-1"
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={e => {
        e.preventDefault();
        const type = e.dataTransfer.getData('application/veofarm-node-type');
        if (!type || !NODE_TYPES[type]) return;
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addNode({
          id: `node_${Date.now()}`,
          type,
          position: pos,
          data: { config: { ...NODE_TYPES[type].defaults }, status: null }
        });
      }}
    >
      <ReactFlow
        nodeTypes={customNodeTypes}
        // ... pan/zoom config
      >
        <Background color="#1c1c38" gap={20} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
```

---

## 20.5 WorkflowControls component (sidebar bottom)

```tsx
// apps/web/components/builder/WorkflowControls.tsx
'use client';
import { Save, Plus, Download, Upload, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFlowStore } from '@/lib/builder/flow-store';

export function WorkflowControls() {
  const [name, setName] = useState('Untitled Workflow');
  const { saveWorkflow, newWorkflow, exportWorkflow, importWorkflow, savedWorkflows, loadWorkflow, deleteWorkflow } = useFlowStore();

  return (
    <div className="p-3 border-b border-border">
      <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2.5">Workflows</div>

      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Tên workflow..."
          className="w-full bg-bg-input border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent transition-colors"
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => saveWorkflow(name)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-md text-[11px] font-medium bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow"
          >
            <Save size={14} /> Lưu
          </button>
          <button
            onClick={newWorkflow}
            className="px-2.5 py-1.5 rounded-md text-[11px] bg-white/[0.03] border border-border text-text-secondary hover:bg-white/[0.06]"
            title="New workflow"
          >
            <Plus size={14} />
          </button>
          <button onClick={exportWorkflow} title="Export" className="px-2.5 py-1.5 rounded-md text-[11px] bg-white/[0.03] border border-border text-text-secondary hover:bg-white/[0.06]">
            <Download size={14} />
          </button>
          <button onClick={importWorkflow} title="Import" className="px-2.5 py-1.5 rounded-md text-[11px] bg-white/[0.03] border border-border text-text-secondary hover:bg-white/[0.06]">
            <Upload size={14} />
          </button>
        </div>
      </div>

      {/* Saved workflows list */}
      <div className="mt-3 space-y-1 max-h-60 overflow-y-auto">
        {savedWorkflows.map(wf => (
          <div
            key={wf.id}
            className="group flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-bg-card-hover text-xs"
            onClick={() => loadWorkflow(wf.id)}
          >
            <span className="flex-1 truncate text-text-primary">{wf.name}</span>
            <span className="text-[10px] text-text-muted">{wf.nodeCount} nodes</span>
            <button
              onClick={e => { e.stopPropagation(); deleteWorkflow(wf.id); }}
              className="opacity-0 group-hover:opacity-100 text-error hover:bg-error/10 p-1 rounded"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 20.6 BuilderToolbar — Top bar với stats

```tsx
// apps/web/components/builder/BuilderToolbar.tsx
'use client';
import { Play, Pause, Square, Image as ImageIcon, ZoomIn } from 'lucide-react';
import { useFlowStore } from '@/lib/builder/flow-store';
import { useReactFlow } from '@xyflow/react';

export function BuilderToolbar() {
  const { runState, runWorkflow, pauseWorkflow, stopWorkflow, stats, openAlbum, albumCount } = useFlowStore();
  const { fitView } = useReactFlow();

  return (
    <div className="flex items-center gap-3 px-3.5 py-2 bg-bg-secondary border-b border-border">
      <button
        onClick={runWorkflow}
        disabled={runState === 'running'}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow disabled:opacity-50"
      >
        <Play size={16} />
        Chạy Workflow
      </button>

      {runState === 'running' && (
        <button
          onClick={pauseWorkflow}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-br from-warning to-[#d97706] text-white"
        >
          <Pause size={16} />
          Tạm dừng
        </button>
      )}

      {(runState === 'running' || runState === 'paused') && (
        <button
          onClick={stopWorkflow}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-br from-error to-[#dc2626] text-white"
        >
          <Square size={16} />
          Dừng
        </button>
      )}

      {/* Stats */}
      <div className="flex items-center gap-2.5 px-3 py-1 rounded-md bg-white/[0.03] border border-border">
        <Stat label="Xong" value={stats.done} variant="done" />
        <Stat label="Chờ" value={stats.wait} variant="wait" />
        <Stat label="Lỗi" value={stats.err} variant="err" />
      </div>

      <span className="text-[11px] text-text-muted ml-auto mr-3">
        Scroll: zoom | Alt+drag: pan
      </span>

      <button
        onClick={() => fitView({ duration: 300 })}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] bg-white/[0.03] border border-border text-text-secondary hover:bg-white/[0.06]"
      >
        <ZoomIn size={14} /> Về trung tâm
      </button>

      <button
        onClick={openAlbum}
        title="Album kết quả"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-accent/35 bg-accent/10 text-[#a78bfa]"
      >
        <ImageIcon size={17} />
        <span className="bg-accent/35 rounded-full px-1.5 text-[10px]">{albumCount}</span>
      </button>
    </div>
  );
}

function Stat({ label, value, variant }: { label: string; value: number; variant: 'done'|'wait'|'err' }) {
  const colorClass = {
    done: 'text-accent',
    wait: 'text-warning',
    err: 'text-error'
  }[variant];
  return (
    <div className="flex items-center gap-1">
      <span className={`text-sm font-bold ${colorClass}`}>{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</span>
    </div>
  );
}
```

---

## 20.7 Custom Node Component template — BaseNode

```tsx
// apps/web/components/builder/nodes/BaseNode.tsx
'use client';
import { Handle, Position, NodeProps } from '@xyflow/react';
import * as Icons from 'lucide-react';
import { NODE_TYPES } from '@/lib/builder/node-types';
import { GlassCard } from '@/components/ui/GlassCard';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface BaseNodeData {
  config: Record<string, any>;
  status: null | 'running' | 'done' | 'error';
  previewMedia?: Array<{ url: string; type: 'image' | 'video' }>;
}

export function BaseNode({ id, type, data, selected }: NodeProps<BaseNodeData>) {
  const def = NODE_TYPES[type!];
  if (!def) return null;
  const Icon = (Icons as any)[def.icon] ?? Icons.Box;

  const borderClass = selected
    ? 'border-accent shadow-accent-glow'
    : data.status === 'running'
    ? 'border-info shadow-[0_0_20px_rgba(96,165,250,0.3)] animate-pulse'
    : data.status === 'done'
    ? 'border-success/50 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
    : data.status === 'error'
    ? 'border-error/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
    : 'border-border';

  return (
    <div
      className={`bg-bg-card rounded-2xl border-2 transition-all`}
      style={{ width: def.width, minHeight: def.minHeight, borderColor: selected ? def.color : undefined }}
    >
      {/* Input handles */}
      {def.inputs.map((port, i) => (
        <Handle
          key={`input-${i}`}
          type="target"
          position={Position.Left}
          id={`input-${i}`}
          style={{
            top: 36 + i * 28,
            background: port.color,
            border: '2px solid var(--bg-card)',
            width: 14, height: 14
          }}
        />
      ))}

      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: `${def.color}20`, color: def.color }}
        >
          <Icon size={16} />
        </div>
        <h3 className="font-semibold text-sm text-text-primary truncate">{def.label}</h3>
        {data.status === 'running' && <Loader2 className="ml-auto animate-spin text-info" size={14} />}
        {data.status === 'done' && <CheckCircle2 className="ml-auto text-success" size={14} />}
        {data.status === 'error' && <AlertCircle className="ml-auto text-error" size={14} />}
      </div>

      {/* Body — node-specific content rendered by child component */}
      {/* ... children render below ... */}

      {/* Output handles */}
      {def.outputs.map((port, i) => (
        <Handle
          key={`output-${i}`}
          type="source"
          position={Position.Right}
          id={`output-${i}`}
          style={{
            bottom: 36 + i * 28,
            background: port.color,
            border: '2px solid var(--bg-card)',
            width: 14, height: 14
          }}
        />
      ))}
    </div>
  );
}
```

### Specific node example — PromptNode

```tsx
// apps/web/components/builder/nodes/PromptNode.tsx
'use client';
import { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { useFlowStore } from '@/lib/builder/flow-store';

export function PromptNode(props: NodeProps) {
  const updateConfig = useFlowStore(s => s.updateNodeConfig);
  const text = props.data.config.text || '';

  return (
    <BaseNode {...props}>
      <div className="p-3">
        <textarea
          value={text}
          onChange={e => updateConfig(props.id, 'text', e.target.value)}
          placeholder="Nhập prompt..."
          rows={4}
          className="w-full bg-bg-input border border-border rounded-md p-2 text-xs text-text-primary outline-none focus:border-accent resize-none"
        />
      </div>
    </BaseNode>
  );
}
```

### customNodeTypes registry

```tsx
// apps/web/components/builder/nodes/index.tsx
import { PromptNode } from './PromptNode';
import { PromptListNode } from './PromptListNode';
import { UploadMediaNode } from './UploadMediaNode';
import { GeminiPromptNode } from './GeminiPromptNode';
import { GeminiPromptKieNode } from './GeminiPromptKieNode';
import { GenerateImageNode } from './GenerateImageNode';
import { GenerateVideoNode } from './GenerateVideoNode';
import { MergeVideoNode } from './MergeVideoNode';
import { DownloadNode } from './DownloadNode';
import { FrameNode } from './FrameNode';

export const customNodeTypes = {
  prompt: PromptNode,
  prompt_list: PromptListNode,
  upload_image: UploadMediaNode,
  gemini_prompt: GeminiPromptNode,
  gemini_prompt_kie: GeminiPromptKieNode,
  generate_image: GenerateImageNode,
  generate_video: GenerateVideoNode,
  merge_video: MergeVideoNode,
  download: DownloadNode,
  frame: FrameNode
};
```

---

## 20.8 Run Workflow — API + WebSocket

### POST `/api/run-workflow-builder`

```typescript
// apps/web/app/api/run-workflow-builder/route.ts
export async function POST(req: Request) {
  const { workflow } = await req.json();
  const { user } = await getUser();

  // 1. Validate workflow JSON shape
  const validation = workflowSchema.safeParse(workflow);
  if (!validation.success) return Response.json({ error: validation.error }, { status: 400 });

  // 2. Topological sort nodes
  const order = topologicalSort(workflow.nodes, workflow.edges);

  // 3. Insert job into Supabase jobs table
  const { data: job } = await supabase
    .from('jobs')
    .insert({
      user_id: user.id,
      flow_graph: workflow,
      execution_order: order,
      status: 'pending'
    })
    .select()
    .single();

  // 4. Worker picks up job + executes node-by-node
  return Response.json({ success: true, jobId: job.id });
}
```

### Real-time updates via Supabase Realtime

```tsx
// apps/web/lib/builder/use-job-subscription.ts
'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useFlowStore } from './flow-store';

export function useJobSubscription(jobId: string | null) {
  const { updateNodeStatus, setNodePreview, setStats } = useFlowStore();

  useEffect(() => {
    if (!jobId) return;

    const channel = supabase
      .channel(`job:${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sub_jobs',
        filter: `job_id=eq.${jobId}`
      }, (payload) => {
        const sub = payload.new;
        updateNodeStatus(sub.node_id, sub.status);
        if (sub.output?.media) {
          setNodePreview(sub.node_id, sub.output.media);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`
      }, (payload) => {
        const job = payload.new;
        setStats(job.stats);  // { done, wait, err }
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [jobId, updateNodeStatus, setNodePreview, setStats]);
}
```

### Pause/Stop endpoints

```
POST /api/workflow-builder-pause   { jobId }
POST /api/workflow-builder-resume  { jobId }
POST /api/workflow-builder-stop    { jobId }
```

→ Worker check `job.status` mỗi step. Nếu `paused` → wait. Nếu `cancelled` → exit.

---

## 20.9 NodeEditorPanel — Right sidebar

Hiện khi click 1 node. Show config form + preview media generated.

```tsx
// apps/web/components/builder/NodeEditorPanel.tsx
'use client';
import { useFlowStore } from '@/lib/builder/flow-store';
import { NODE_TYPES } from '@/lib/builder/node-types';
import { X } from 'lucide-react';
import { PromptEditor } from './editors/PromptEditor';
import { GenerateVideoEditor } from './editors/GenerateVideoEditor';
// ... other editors

const editorMap = {
  prompt: PromptEditor,
  prompt_list: PromptListEditor,
  gemini_prompt: GeminiPromptEditor,
  generate_image: GenerateImageEditor,
  generate_video: GenerateVideoEditor,
  download: DownloadEditor,
  frame: FrameEditor
};

export function NodeEditorPanel() {
  const { selectedNodeId, getNode, deselectNode, deleteNode } = useFlowStore();
  if (!selectedNodeId) return null;
  const node = getNode(selectedNodeId);
  if (!node) return null;
  const def = NODE_TYPES[node.type!];
  const Editor = editorMap[node.type as keyof typeof editorMap];

  return (
    <div className="w-60 min-w-[240px] bg-bg-secondary border-l border-border overflow-y-auto">
      <div className="flex items-center gap-2 px-3.5 py-3 border-b border-border text-sm font-semibold">
        <span style={{ color: def.color }}>{/* Icon */}</span>
        <span className="flex-1 truncate">{node.data.config.name || def.label}</span>
        <button onClick={() => deleteNode(node.id)} className="text-error hover:bg-error/10 p-1 rounded">
          <X size={14} />
        </button>
      </div>

      <div className="p-3.5 space-y-2.5">
        {Editor && <Editor node={node} />}

        {/* Preview media inline */}
        {node.data.previewMedia && node.data.previewMedia.length > 0 && (
          <PreviewGrid media={node.data.previewMedia} />
        )}
      </div>
    </div>
  );
}
```

---

## 20.10 Album Gallery Overlay

Modal fullscreen show tất cả media generated trong session current workflow.

```tsx
// apps/web/components/builder/AlbumGalleryOverlay.tsx
'use client';
import { Image as ImageIcon, Trash2, X } from 'lucide-react';
import { useFlowStore } from '@/lib/builder/flow-store';

export function AlbumGalleryOverlay() {
  const { albumOpen, closeAlbum, albumMedia, clearAlbum } = useFlowStore();
  if (!albumOpen) return null;

  return (
    <div className="fixed inset-0 z-[9000] bg-[rgba(5,5,15,0.92)] backdrop-blur-xl flex flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.07] flex-shrink-0">
        <ImageIcon size={22} className="text-[#a78bfa]" />
        <div>
          <div className="text-base font-bold text-[#f1f5f9]">Album Kết Quả Workflow</div>
          <div className="text-[11px] text-[#64748b]">Ảnh & Video tạm thời trong phiên làm việc này</div>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={clearAlbum} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-error/30 bg-error/[0.08] text-error text-xs">
            <Trash2 size={14} /> Xóa
          </button>
          <button onClick={closeAlbum} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 bg-white/[0.05] text-[#94a3b8] text-xs">
            <X size={14} /> Đóng
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {albumMedia.length === 0 ? (
          <div className="text-center py-20 text-[#334155]">
            <ImageIcon size={56} className="mx-auto opacity-30" />
            <p className="mt-3 text-sm">Chưa có media nào.<br />Chạy một Workflow để kết quả hiển thị ở đây.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {albumMedia.map((m, i) => (
              <MediaThumb key={i} media={m} onDownload={() => downloadMedia(m)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 20.11 Save/Load Workflow JSON

### Schema

```typescript
// packages/shared/src/types/workflow.ts
export interface WorkflowJSON {
  version: '1.0';
  name: string;
  nodes: Array<{
    id: string;
    type: keyof typeof NODE_TYPES;
    position: { x: number; y: number };
    data: { config: Record<string, any> };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }>;
}
```

### Storage Supabase table

```sql
-- migration 0007_workflows.sql
CREATE TABLE public.workflows (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  graph jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflows_owner ON public.workflows USING (user_id = auth.uid());

CREATE INDEX idx_workflows_user ON public.workflows(user_id, updated_at DESC);
```

### Save/Load store actions

```typescript
// apps/web/lib/builder/flow-store.ts
import { create } from 'zustand';

export const useFlowStore = create((set, get) => ({
  // ... state
  savedWorkflows: [],

  async saveWorkflow(name: string) {
    const { nodes, edges } = get();
    const graph = { version: '1.0', name, nodes, edges };
    const res = await fetch('/api/workflows', {
      method: 'POST',
      body: JSON.stringify({ name, graph })
    });
    const data = await res.json();
    if (data.success) {
      get().refreshSavedWorkflows();
      toast.success('Đã lưu workflow!');
    }
  },

  async loadWorkflow(id: string) {
    const res = await fetch(`/api/workflows/${id}`);
    const wf = await res.json();
    set({
      currentWorkflowId: id,
      currentWorkflowName: wf.name,
      nodes: wf.graph.nodes,
      edges: wf.graph.edges
    });
  },

  exportWorkflow() {
    const { nodes, edges, currentWorkflowName } = get();
    const json = JSON.stringify({ version: '1.0', name: currentWorkflowName, nodes, edges }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentWorkflowName}.veoflow.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importWorkflow() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.veoflow.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const wf = JSON.parse(text);
      set({ nodes: wf.nodes, edges: wf.edges, currentWorkflowName: wf.name });
    };
    input.click();
  }
}));
```

---

## 20.12 Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Z` | Undo (60-stack) |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + C` | Copy selected nodes |
| `Cmd/Ctrl + V` | Paste at cursor position |
| `Cmd/Ctrl + X` | Cut |
| `Delete` / `Backspace` | Delete selected nodes/edges |
| `Cmd/Ctrl + A` | Select all |
| `Esc` | Deselect / Close editor panel |
| `Cmd/Ctrl + S` | Save workflow |
| `Space + drag` | Pan canvas |
| `Alt + drag` | Pan canvas (alt) |
| `Scroll wheel` | Zoom in/out at cursor |
| `Cmd/Ctrl + 0` | Fit view |

→ React Flow built-in nhiều shortcut; còn lại implement trong store (undo/redo/copy/paste).

---

## 20.13 Implementation order — Sprint 10 (5-7 ngày)

| Day | Task |
|---|---|
| 1 | `lib/builder/node-types.ts` đầy đủ 10 types + `dynamic-ports.ts` |
| 1 | `flow-store.ts` Zustand: nodes/edges/selectedNodeId/runState/stats/savedWorkflows + actions |
| 2 | `BuilderLayout` + `BuilderCanvas` (React Flow setup) + drag-drop từ palette |
| 2 | `NodePalette` component đầy đủ với 4 categories + lucide icons |
| 3 | `BaseNode` + 5 simple node components (prompt, prompt_list, upload_image, merge_video, download) |
| 3 | `BuilderToolbar` với run/pause/stop + stats |
| 4 | 5 complex node components (gemini_prompt, gemini_prompt_kie, generate_image, generate_video, frame) với dynamic ports |
| 4 | `NodeEditorPanel` right sidebar + 10 editor components |
| 5 | `WorkflowControls` save/load/import/export + Supabase migration 0007_workflows |
| 5 | `useJobSubscription` + worker integration (run-workflow-builder API) |
| 6 | `AlbumGalleryOverlay` + media download |
| 6 | Keyboard shortcuts (undo/redo, copy/paste, delete, fit view) |
| 7 | Polish: connection styling theo port type color, multi-select lasso, frame grouping |

---

## 20.14 Acceptance criteria

| Item | Criterion |
|---|---|
| Sidebar palette | 4 categories với 10 node types, drag từ palette → drop trên canvas tạo node |
| Canvas | Pan (Alt+drag) + Zoom (scroll) + multi-select (lasso) work |
| Node connect | Click output → drag → click input port, edge match màu port |
| Node editor right | Click node → panel hiện form theo type + preview media inline |
| Toolbar run | Click "Chạy Workflow" → POST API → worker pick up + node status update real-time |
| Stats | Done/Wait/Err counter update real-time qua Supabase Realtime |
| Pause/Stop | Pause toggle resume; Stop confirm dialog → reset all status |
| Save workflow | Tên workflow + Lưu → POST /api/workflows → DB |
| Load workflow | Click item trong list → nodes/edges restore trên canvas |
| Export | Download `.veoflow.json` file |
| Import | File picker → parse JSON → load |
| Album gallery | Btn top-right canvas → fullscreen overlay với grid media |
| Keyboard | Cmd+Z/Y undo/redo, Cmd+C/V copy/paste, Delete xóa node |
| Frame node | Tạo Frame, kéo nodes vào trong Frame area → group visual |

---

## 20.15 Element KHÔNG copy từ tool gốc

Pattern Veo Farm KHÁC tool gốc nên KHÔNG cần:

- HTML5 Canvas custom render (Veo Farm dùng React Flow)
- Manual paint connection lines (React Flow tự xử)
- Custom hit-testing cho nodes/ports (React Flow events)
- Image cache cho thumbnails (Next.js Image / browser cache)
- "Album session" tạm thời trong RAM (Veo Farm lưu Supabase Storage permanent)
- "API Key Toàn cục Gemini" (Veo Farm dùng cookies pool)
- Vietnamese branding "Workflow Giá Rẻ"

---

## 20.16 Reuse từ Sprint 8 UI

Đã build trong Sprint 8 — không cần redo:

- ✅ Tailwind config với colors, animations, shadows (section 19.2)
- ✅ Inter font (section 19.3)
- ✅ `BackgroundEffects`, `GlassCard`, `GradientLogo`, `GradientText` shared components
- ✅ Button variants (primary/success/danger/teal/ghost)
- ✅ React Flow theme dark (section 19.7)
- ✅ Top nav layout với tabs

→ Sprint 10 build **trên nền Sprint 8** — focus thuần vào Builder canvas + node components + run logic.

---

## 20.17 Files reference

- `/Users/phanthanhhai/Desktop/Hai brain's/projects/veo3-reference/source/public/workflow-builder.js` (4488 lines — full canvas logic)
- `/Users/phanthanhhai/Desktop/Hai brain's/projects/veo3-reference/source/public/index.html` lines 1025-1135 (Builder layout HTML)
- `/Users/phanthanhhai/Desktop/Hai brain's/projects/veo3-reference/source/public/styles.css` lines 1880-2240 (`.wfb-*` CSS)
- `/Users/phanthanhhai/Desktop/Hai brain's/projects/veo3-reference/source/automation.js` (Flow execution backend)

---

## 20.18 Visual anatomy chính xác (từ drawNode + screenshots)

User đã confirm tool gốc là của user → copy visual đầy đủ. Visual specs chính xác từ `drawNode()` function:

### Node body

```
Width:           theo NODE_TYPES[type].width (vd 240/260/280/370)
MinHeight:       theo NODE_TYPES[type].minHeight
Border-radius:   10px
Background:      #1a1a2e (solid dark navy)

Border (default):       1px solid rgba(255,255,255,0.08)
Border (selected):      2px solid {def.color}
Border (multi-select):  2px dashed #a78bfa

Shadow (selected):       0 2px 16px {def.color}60
Shadow (multi-select ≤4): 0 2px 14px #a78bfa60
```

### Node header (36px)

```
Height:           36px
Background:       {def.color}30  (color with 30% alpha overlay)
Bottom border:    1px solid {def.color}40
Border-radius:    10px top-left + top-right only
```

**Header layout (left → right):**
- Status dot 3px tại x+6 (chỉ hiện khi done/error)
- Title: bold 12px Inter, color `#f0f0f5`, padding-left 12px, truncate trước button area
- Header buttons right-aligned

**Header buttons (right → left, mỗi cái 22×22px, gap 4px):**

| Button | Visible khi | Icon | Color (active) | Color (disabled) |
|---|---|---|---|---|
| ℹ Detail | Always | `Info` lucide | `#a0aec0` | — |
| ⬇ Download | `previewMedia.length > 0` | `Download` | `#34d399` | — |
| ▶ Run | `generate_image/video, merge_video` | `Play` | `#a78bfa` (purple) | `#444` |
| ✨ Run | `gemini_prompt` (replace ▶) | `Sparkles` | `#84cc16` (lime) | `#444` |
| 📁 Upload | `upload_image` | `Upload` | `#f59e0b` (amber) | — |

Run button DISABLED khi không có connection input + không có config.text fallback. Hover hint: "Cần kết nối điểm [prompt] trước khi chạy node này!".

### Ports

```
Port radius:        7px
Port border:        2px solid #1a1a2e (match body bg)
Port spacing:       28px vertical
Port Y start:       headerHeight + 14 = 50px from node top

Input ports:        x = 0 (left edge), label x = +12 (right of dot)
Output ports:       x = width (right edge), label x = -12 (left of dot)
Label font:         10px Inter, color #8888a0
Label suffix:       " (opt)" nếu port.optional === true
```

**Port colors theo type:**

| Port type | Color |
|---|---|
| `string` (text/prompt) | `#a78bfa` (purple) |
| `image` (single image) | `#22d3ee` (cyan) |
| `video` (single video) | `#fb923c` (orange) |
| `any` (media stream) | `#22d3ee` cyan hoặc `#86efac` light green (download) |

### Connections (edges)

Bezier curve giữa source port → target port. Stroke gradient match source → target color.

```
Stroke width:     2.5px
Stroke gradient:  linear-gradient(source.color → target.color)
Curvature:        0.4 (smooth horizontal bezier)
Animated dash:    on running (animate stroke-dashoffset)
```

→ React Flow custom edge component:
```tsx
import { BezierEdge, EdgeProps } from '@xyflow/react';

export function ColoredEdge(props: EdgeProps) {
  const sourceColor = props.data?.sourceColor ?? '#a78bfa';
  const targetColor = props.data?.targetColor ?? sourceColor;
  // Use SVG gradient or single color depending on source = target
  return <BezierEdge {...props} style={{ stroke: targetColor, strokeWidth: 2.5 }} />;
}
```

### Loading state — Progress ring

Khi `node.status === 'running'`:

```
Overlay:          inset 4px from node body, bg rgba(14,14,28,0.65), border-radius 6px
Ring center:      node center
Ring radius:      min(width, height-headerHeight) * 0.2
Ring track:       stroke rgba(255,255,255,0.08), width = radius * 0.22
Ring progress:    stroke {def.color}, alpha 0.4 (faint progress arc)
Ring spinner:     stroke {def.color}, alpha 1.0, arc length = π*0.5 (rotates)
                  → React Flow: SVG <circle> với CSS animation rotate

Percentage text:  bold {radius*0.5}px Inter, white, center
                  pct = min(95, elapsed_ms / avg_ms * 100)
                  avg_ms = 18000 (image) | 85000 (video)

Subtext:          bold {radius*0.35}px Inter, color #ccc, "Đang chạy..." or "Đang gen..."
                  Position: ring center + radius + 14px
```

### Image/video preview inline (sau khi done)

```
Container:        full width node body, padding 8px
Grid:             repeat(auto-fill, minmax(80px, 1fr)), gap 6px
Thumb height:     70px
Thumb border:     1px solid rgba(255,255,255,0.08), radius 6px
Thumb bg:         rgba(255,255,255,0.04)
Hover:            cursor pointer
Double-click:     open lightbox
```

Mỗi thumb có Download button overlay khi hover (18px height).

### Resize handle (chỉ cho prompt/prompt_list)

Triangle 12×12px góc dưới phải, color `rgba(255,255,255,0.2)`. Drag = resize height.

---

## 20.19 Inline config chips (compact dropdowns trong node body)

Theo screenshot, các generate node có chips compact trong body:

**Generate Image:** `[16:9 ▾] [x1 ▾] [1080p ▾] [Imagen4 ▾]`
**Generate Video:** `[16:9 ▾] [x1 ▾] [1080p ▾] [Fast↓ ▾] [FRAME ▾] [8s ▾]`

### Visual spec

```css
.config-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #d4d4d4;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.config-chip:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}
.config-chip-arrow {
  font-size: 8px;
  opacity: 0.6;
}
```

### React component

```tsx
// apps/web/components/builder/nodes/ConfigChip.tsx
import { ChevronDown } from 'lucide-react';

interface ChipProps<T extends string | number> {
  value: T;
  options: Array<{ value: T; label: string; subtitle?: string }>;
  onChange: (value: T) => void;
  format?: (value: T) => string;
}

export function ConfigChip<T extends string | number>({ value, options, onChange, format }: ChipProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[#d4d4d4] text-[10px] font-medium hover:bg-white/[0.08]"
      >
        {format ? format(value) : selected?.label ?? value}
        <ChevronDown size={8} className="opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] bg-bg-card border border-border rounded-md shadow-lg py-1">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-bg-card-hover ${opt.value === value ? 'text-accent' : 'text-text-secondary'}`}
            >
              <div className="flex items-center gap-1.5">
                {opt.value === value && <span className="text-accent">✓</span>}
                <span>{opt.label}</span>
              </div>
              {opt.subtitle && <div className="text-[9px] text-text-muted ml-3">{opt.subtitle}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Veo Model dropdown (theo screenshot 1)

```typescript
const VEO_MODELS = [
  { value: 'veo31_lite', label: 'Veo 3.1 Lite', subtitle: 'Nhanh nhất' },
  { value: 'veo31_lite_lower', label: 'Veo 3.1 Lite', subtitle: 'Ưu tiên thấp' },
  { value: 'veo31_fast', label: 'Veo 3.1 Fast', subtitle: 'Nhanh' },
  { value: 'veo31_fast_lower', label: 'Veo 3.1 Fast', subtitle: 'Ưu tiên thấp' },
  { value: 'veo31_quality', label: 'Veo 3 Quality', subtitle: 'Chất lượng cao' }
];
```

Format chip text: lite → "Lite", fast → "Fast↓" (với arrow nếu lower), quality → "Q+".

### Image Model dropdown

```typescript
const IMAGE_MODELS = [
  { value: 'imagen_4', label: 'Imagen 4' },
  { value: 'imagen_4_ref', label: 'Imagen 4 Ref' },
  { value: 'nano_banana_pro', label: 'NB-Pro' },        // Gemini 3 Pro Image
  { value: 'nano_banana_2', label: 'NB-2' }             // Gemini 2.5 Pro Image
];
```

### Aspect ratio + Quantity + Quality + Mode (Video)

```typescript
const ASPECT_RATIOS = [
  { value: 'landscape', label: '16:9' },
  { value: 'portrait', label: '9:16' },
  { value: 'square', label: '1:1' },
  { value: '4_3', label: '4:3' },
  { value: '3_4', label: '3:4' }
];

const QUANTITY = [1, 2, 4].map(n => ({ value: n, label: `x${n}` }));

const QUALITY = [
  { value: 'native', label: 'Gốc' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' }
];

const VIDEO_MODE = [
  { value: 'FRAME', label: 'FRAME' },     // Start + (optional) End frame
  { value: 'REF', label: 'REF' }          // Reference images
];

const VIDEO_DURATION = [
  { value: 4, label: '4s' },
  { value: 6, label: '6s' },
  { value: 8, label: '8s' }
];
```

---

## 20.20 Per-node anatomy theo screenshots

### 📄 PromptNode

```
Header: 📄 Text / Prompt (purple #8a5cf6)
Body:
  Textarea full-width, rows 4, placeholder "Nhập prompt..."
  Background: #12121f input bg
Resize: triangle handle bottom-right
Output port: text (purple) right
```

### 🤖 GeminiPromptNode (theo screenshot 1)

```
Header: 🤖 Gemini Prompt (lime #84cc16) + ✨ Run button right
Body:
  Input ports left:
    • text (opt) — purple
    • media 1 (opt) — cyan
    • [+ dynamic ref slots up to 5]
  
  Toggle "Tắt" (horizontal switch right-aligned)
  Warning box: bg rgba(132,204,22,0.1), border 1px lime/30
    "🔑 Đang sử dụng Gemini API Key Toàn cục"
    
  Khi missing API key → màu vàng:
    bg rgba(251,191,36,0.1), border yellow
    Text: "Chưa cài API Key!" + button "Cài đặt"
    
Output port: text (purple) right
```

### 🖼️ GenerateImageNode

```
Header: 🖼️ Generate Image (pink #ec4899) + ▶ Run + ⬇ Download (sau khi done)
Body:
  Input ports:
    • prompt (opt) — purple
    • ref img 1 (opt) — cyan
    • [+ dynamic up to 5 ref slots]
  
  Inline chips row (gap 6px):
    [16:9 ▾] [x1 ▾] [1080p ▾] [Imagen4 ▾]
    
  Khi running: progress ring overlay
  Khi done: image preview grid inline

Output port: image (cyan) right
```

### 🎬 GenerateVideoNode

```
Header: 🎬 Generate Video (orange #f97316) + ▶ Run + ⬇ Download
Body:
  Input ports:
    • prompt (opt) — purple
    • Start Frame (opt) — cyan        [khi videoMode = FRAME]
    • End Frame (opt) — cyan          [khi videoMode = FRAME, dynamic slot 2]
    • ref img 1..5 — cyan             [khi videoMode = REF, dynamic slots]
  
  Inline chips row 1: [16:9 ▾] [x1 ▾] [1080p ▾]
  Inline chips row 2: [Fast↓ ▾] [FRAME ▾] [8s ▾]
    
Output port: video (orange) right
```

### 📤 UploadMediaNode

```
Header: 📤 Upload Media (cyan #06b6d4) + 📁 Upload button
Body:
  Empty state: 
    Drag-drop zone "Kéo ảnh/video vào đây hoặc bấm 📁"
    Background: rgba(6,182,212,0.05), dashed border cyan/30
    
  After upload:
    Image/video preview thumbnail full-width (max-height 200px)
    "✕" button top-right để remove

Output port: media (cyan) right
```

### 🎞️ MergeVideoNode

```
Header: 🎞️ Ghép Video (Merge) (emerald #10b981) + ▶ Run + ⬇ Download
Body:
  Input port: video (orange) — accepts multiple
  
  Display: "{N} videos đã kết nối"
  Inline chip: [Quality ▾]
  
Output port: video (orange) right
```

### 💾 DownloadNode

```
Header: 💾 Download (green #34d399)
Body:
  Input port: stream (light green) — accepts any
  
  Inline chips:
    [Quality ▾] [📁 Choose dir]
  
  Counter: "{N} streams kết nối"
  
Output port: stream_out (light green, pass-through)
```

### 🔳 FrameNode (theo screenshot 2)

```
Special: container node, render as dashed border rectangle
NO input/output ports
Default size: 500x400
Header: 🔳 Khung Nhóm (amber #f59e0b)
  - Header buttons: ▶ Run (gọi child nodes), ℹ Detail, 🗑 Delete
  
Body: empty (transparent), nodes inside được render normally trên top

Border: 2px dashed rgba(245,158,11,0.4)
Background: rgba(245,158,11,0.02)
Resize handle: bottom-right corner

Behavior:
- Drag header → move whole frame + all child nodes inside
- Run button → execute only nodes inside frame
- Detail panel show "{N} nodes inside"
```

### 📝 PromptListNode

```
Header: 📝 Prompt List (indigo #6366f1)
Body:
  Textarea full-width, rows 6
  Placeholder: "Mỗi dòng 1 prompt..."
  Auto-detect lines, hiển thị counter "{N} prompts"
Resize: triangle handle bottom-right
Output port: textList (purple) right
```

### 🤖 GeminiPromptKieNode (Kie.ai variant)

Giống GeminiPromptNode nhưng:
- Header color: violet `#a855f7`
- Icon: ✨ Sparkles
- API: gọi qua Kie.ai endpoint thay vì direct Gemini
- Settings: API key Kie.ai + model dropdown

---

## 20.21 Edge styling chính xác

```css
/* React Flow custom edge with gradient */
.react-flow__edge-path {
  stroke-width: 2.5;
  fill: none;
}

.react-flow__edge.string > .react-flow__edge-path {
  stroke: #a78bfa;
}

.react-flow__edge.image > .react-flow__edge-path {
  stroke: #22d3ee;
}

.react-flow__edge.video > .react-flow__edge-path {
  stroke: #fb923c;
}

.react-flow__edge.stream > .react-flow__edge-path {
  stroke: #86efac;
}

/* Animated when running */
.react-flow__edge.running > .react-flow__edge-path {
  stroke-dasharray: 8 4;
  animation: edgeFlow 0.8s linear infinite;
}

@keyframes edgeFlow {
  to { stroke-dashoffset: -12; }
}

/* Hover */
.react-flow__edge:hover > .react-flow__edge-path {
  stroke-width: 3.5;
  filter: drop-shadow(0 0 4px currentColor);
}
```

Apply class via React Flow edge `className` based on port type của source.

---

## 20.22 Frame node implementation (custom React Flow node)

React Flow không hỗ trợ "frame" group built-in. Custom render:

```tsx
// apps/web/components/builder/nodes/FrameNode.tsx
'use client';
import { NodeProps, useReactFlow } from '@xyflow/react';
import { useFlowStore } from '@/lib/builder/flow-store';
import { Frame as FrameIcon, Play, Info, Trash2 } from 'lucide-react';
import { NODE_TYPES } from '@/lib/builder/node-types';

export function FrameNode({ id, data, selected }: NodeProps) {
  const def = NODE_TYPES.frame;
  const { width = 500, height = 400, name = 'Khung Nhóm' } = data.config;
  const { runFrameNodes, deleteNode } = useFlowStore();
  const { getNodes } = useReactFlow();

  // Find nodes inside this frame's bounding box
  const node = getNodes().find(n => n.id === id);
  const childNodes = getNodes().filter(n => {
    if (n.id === id || n.type === 'frame') return false;
    const nx = n.position.x, ny = n.position.y;
    return nx >= node!.position.x && nx <= node!.position.x + width
        && ny >= node!.position.y && ny <= node!.position.y + height;
  });

  return (
    <div
      className={`relative rounded-2xl pointer-events-auto`}
      style={{
        width, height,
        background: 'rgba(245, 158, 11, 0.02)',
        border: `2px dashed ${selected ? def.color : 'rgba(245, 158, 11, 0.4)'}`
      }}
    >
      {/* Header bar */}
      <div
        className="absolute -top-9 left-0 flex items-center gap-2 px-3 py-1.5 rounded-md backdrop-blur"
        style={{ background: `${def.color}30`, border: `1px solid ${def.color}40` }}
      >
        <FrameIcon size={14} className="text-amber-500" />
        <span className="text-xs font-bold text-text-primary">{name}</span>
        <span className="text-[10px] text-text-muted">({childNodes.length} nodes)</span>
        <button
          onClick={() => runFrameNodes(id, childNodes.map(n => n.id))}
          className="ml-2 p-0.5 rounded hover:bg-white/10"
          title="Chạy frame"
        >
          <Play size={12} className="text-accent" />
        </button>
        <button onClick={() => deleteNode(id)} className="p-0.5 rounded hover:bg-error/20">
          <Trash2 size={12} className="text-error" />
        </button>
      </div>

      {/* Resize handle bottom-right */}
      <div className="absolute bottom-1 right-1 w-3 h-3 cursor-nwse-resize">
        <svg viewBox="0 0 12 12" className="text-amber-500/40">
          <path d="M0 12 L12 0 L12 12 Z" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}
```

Frame là **non-interactive container** — child nodes được render độc lập trên top, frame chỉ là visual + grouping logic.

---

## 20.23 Implementation order updated (Sprint 10)

| Day | Task |
|---|---|
| 1 | `lib/builder/node-types.ts` đầy đủ 10 types với defaults from screenshots |
| 1 | `flow-store.ts` Zustand: nodes/edges/run state/stats/history (undo 60-stack) |
| 2 | `BuilderLayout` + `BuilderCanvas` (React Flow setup) + drag-drop từ palette |
| 2 | `NodePalette` với 4 categories, chip border-left 3px màu |
| 3 | `BaseNode` shared shell (header với buttons, ports, status indicator, loading ring) |
| 3 | `ConfigChip` component (compact dropdown trong node body) |
| 3 | `BuilderToolbar` Run/Pause/Stop + Stats Done/Wait/Err |
| 4 | 5 simple nodes: PromptNode, PromptListNode, UploadMediaNode, MergeVideoNode, DownloadNode |
| 4 | Edge style theo port type color + animated when running |
| 5 | 4 generate nodes với dynamic ports + inline chips: GeminiPrompt, GeminiPromptKie, GenerateImage, GenerateVideo |
| 5 | Loading ring overlay với percentage simulation |
| 5 | FrameNode visual + bounding-box detect child nodes |
| 6 | `NodeEditorPanel` right sidebar đầy đủ 10 editors |
| 6 | `WorkflowControls` save/load/import/export + migration 0007_workflows |
| 7 | `useJobSubscription` + worker integration (run-workflow-builder API) |
| 7 | `AlbumGalleryOverlay` + media download via `/api/download` |
| 7 | Keyboard shortcuts (undo/redo, copy/paste, delete, Cmd+S, fit view) |
| 7 | Polish: multi-select lasso, image preview lightbox, hover tooltips

---

## 20.24 License note

User confirm 30/4/2026: **"Đây là tool của tao"** — user own commercial tool VEO3 Flow Automation v1.5.0. Visual specs + UI patterns trong section 20 được copy nguyên si từ tool gốc. Veo Farm rebuild bằng React Flow + Tailwind nhưng UX 1:1 với tool gốc.

Note này là internal — không publish/share Veo Farm code public.
