'use client';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { Link2 } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { ProviderConfig } from './ProviderNode';
import { VideosPreview } from './OutputPreview';

export function VideoRenderNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow();
  const chainFrames = data?.chainFrames === true;
  const toggleChain = () =>
    rf.setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, chainFrames: !chainFrames } } : n)),
    );

  return (
    <BaseNode id={id} selected={selected} icon="🎬" title="Video Render" width={340}>
      <ProviderConfig
        id={id}
        provider={(data?.provider as string) ?? 'veo3'}
        concurrency={(data?.concurrency as number | 'auto') ?? 'auto'}
        options={[
          { value: 'veo3', label: 'Veo 3 (Flow API v2)' },
          { value: 'veo3_legacy', label: 'Veo 3 Legacy (Playwright)' },
          { value: 'sora', label: 'Sora (chatgpt.com) — scaffold' },
        ]}
      />
      <label
        className={`nodrag flex items-center gap-2 text-[11px] cursor-pointer rounded-lg px-2 py-1.5 transition-colors ${
          chainFrames
            ? 'bg-accent-glow border border-accent/40 text-text-primary'
            : 'border border-border text-text-secondary hover:bg-white/[0.03]'
        }`}
        title="Mỗi scene N+1 dùng frame cuối của scene N làm start frame. Chậm hơn (serial) nhưng giữ liên tục camera/character."
      >
        <input type="checkbox" className="accent-accent" checked={chainFrames} onChange={toggleChain} />
        <Link2 className="w-3 h-3" />
        <span>Chain frames {chainFrames && <span className="text-text-muted">(serial)</span>}</span>
      </label>
      <VideosPreview nodeId={id} />
    </BaseNode>
  );
}
