'use client';
import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { ProviderConfig } from './ProviderNode';
import { ImagesPreview } from './OutputPreview';

export function ImageGeneratorNode({ id, data, selected }: NodeProps) {
  return (
    <BaseNode id={id} selected={selected} icon="🖼️" title="Image Generator" width={340}>
      <ProviderConfig
        id={id}
        provider={(data?.provider as string) ?? 'flux'}
        concurrency={(data?.concurrency as number | 'auto') ?? 'auto'}
        options={[
          { value: 'flux', label: 'Flux (Replicate)' },
          { value: 'dalle', label: 'DALL-E (ChatGPT)' },
          { value: 'gemini', label: 'Gemini (Imagen)' },
        ]}
      />
      <ImagesPreview nodeId={id} />
    </BaseNode>
  );
}
