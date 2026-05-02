'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { useFlowStore } from '@/lib/builder/flow-store';

export function PromptListNode(props: NodeProps) {
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  const text = (props.data as any)?.config?.text ?? '';
  const lines = String(text)
    .split('\n')
    .filter((l) => l.trim().length > 0);

  return (
    <BaseNode {...props}>
      <textarea
        value={text}
        onChange={(e) => updateConfig(props.id, { text: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="Mỗi dòng = 1 prompt..."
        className="nodrag nowheel flex-1 min-h-[100px] w-full bg-[#12121f] border border-white/[0.08] rounded-md p-2 text-xs text-text-primary outline-none focus:border-accent resize-none"
      />
      <div className="text-[10px] text-text-muted">{lines.length} prompts</div>
    </BaseNode>
  );
}
