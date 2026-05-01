'use client';
import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { ProviderConfig } from './ProviderNode';
import { VoicesPreview } from './OutputPreview';

export function VoiceGenNode({ id, data, selected }: NodeProps) {
  return (
    <BaseNode id={id} selected={selected} icon="🎤" title="Voice Gen" width={320}>
      <ProviderConfig
        id={id}
        provider={(data?.provider as string) ?? 'veo_native'}
        options={[
          { value: 'veo_native', label: 'Veo Native (skip)' },
          { value: 'elevenlabs', label: 'ElevenLabs' },
        ]}
        showConcurrency={false}
      />
      <VoicesPreview nodeId={id} />
    </BaseNode>
  );
}
