'use client';
import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { ProviderConfig } from './ProviderNode';
import { ScriptPreview } from './OutputPreview';

export function ScriptWriterNode({ id, data, selected }: NodeProps) {
  return (
    <BaseNode selected={selected} icon="📝" title="Script Writer" width={320}>
      <ProviderConfig
        id={id}
        provider={(data?.provider as string) ?? 'chatgpt'}
        options={[
          { value: 'chatgpt', label: 'ChatGPT' },
          { value: 'gemini', label: 'Gemini' },
          { value: 'claude', label: 'Claude' },
        ]}
        showConcurrency={false}
      />
      <ScriptPreview nodeId={id} />
    </BaseNode>
  );
}
