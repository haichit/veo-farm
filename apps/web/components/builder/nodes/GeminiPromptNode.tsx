'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { useFlowStore } from '@/lib/builder/flow-store';

export function GeminiPromptNode(props: NodeProps) {
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  const cfg = ((props.data as any)?.config ?? {}) as {
    apiKey?: string;
    promptTemplate?: string;
    useAdditionalText?: boolean;
    additionalText?: string;
  };

  const hasApiKey = !!cfg.apiKey;

  return (
    <BaseNode {...props} runIcon="sparkles">
      <textarea
        value={cfg.promptTemplate ?? ''}
        onChange={(e) => updateConfig(props.id, { promptTemplate: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="Prompt template (dùng {{text}} cho input)..."
        rows={3}
        className="nodrag nowheel w-full bg-[#12121f] border border-white/[0.08] rounded-md p-2 text-xs text-text-primary outline-none focus:border-accent resize-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[10px] text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={!!cfg.useAdditionalText}
            onChange={(e) => updateConfig(props.id, { useAdditionalText: e.target.checked })}
          />
          Bổ sung lệnh phụ
        </label>
      </div>
      {!hasApiKey && (
        <div className="mt-2 px-2 py-1.5 rounded-md bg-warning-bg border border-warning/30 text-[10px] text-warning">
          ⚠ Chưa cài API Key! Mở editor để nhập.
        </div>
      )}
    </BaseNode>
  );
}
