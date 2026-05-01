'use client';
import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { ProviderConfig } from './ProviderNode';
import { VideosPreview } from './OutputPreview';

export function VideoRenderNode({ id, data, selected }: NodeProps) {
  return (
    <BaseNode selected={selected} icon="🎬" title="Video Render" width={340}>
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
      <VideosPreview nodeId={id} />
    </BaseNode>
  );
}
