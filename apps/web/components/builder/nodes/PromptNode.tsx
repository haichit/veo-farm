'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { useFlowStore } from '@/lib/builder/flow-store';

export function PromptNode(props: NodeProps) {
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  const text = (props.data as any)?.config?.text ?? '';

  return (
    <BaseNode {...props}>
      <textarea
        value={text}
        onChange={(e) => updateConfig(props.id, { text: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="Nhập prompt..."
        className="nodrag nowheel flex-1 min-h-[80px] w-full bg-[#12121f] border border-white/[0.08] rounded-md p-2 text-xs text-text-primary outline-none focus:border-accent resize-none"
      />
    </BaseNode>
  );
}
