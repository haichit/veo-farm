'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { useFlowStore } from '@/lib/builder/flow-store';

export function GeminiPromptKieNode(props: NodeProps) {
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  const cfg = ((props.data as any)?.config ?? {}) as {
    apiKey?: string;
    model?: string;
    promptTemplate?: string;
  };

  const hasApiKey = !!cfg.apiKey;

  return (
    <BaseNode {...props} runIcon="sparkles">
      <textarea
        value={cfg.promptTemplate ?? ''}
        onChange={(e) => updateConfig(props.id, { promptTemplate: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="Prompt template (Kie.ai)..."
        rows={3}
        className="nodrag nowheel w-full bg-[#12121f] border border-white/[0.08] rounded-md p-2 text-xs text-text-primary outline-none focus:border-accent resize-none"
      />
      <div className="mt-2 text-[10px] text-text-muted">Model: {cfg.model ?? 'gemini-2.0-flash-exp'}</div>
      {!hasApiKey && (
        <div className="mt-2 px-2 py-1.5 rounded-md bg-[#a855f7]/10 border border-[#a855f7]/30 text-[10px] text-[#c084fc]">
          ⚠ Chưa cài Kie.ai API Key
        </div>
      )}
    </BaseNode>
  );
}
