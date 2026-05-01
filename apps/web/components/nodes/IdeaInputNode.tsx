'use client';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { Textarea } from '@/components/ui/input';

export function IdeaInputNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow();
  const value = (data?.value as string) ?? '';
  return (
    <BaseNode id={id} selected={selected} icon="💡" title="Idea" inputs={false}>
      <Textarea
        placeholder="Vd: Mèo Mochi đi Đà Lạt 1 ngày..."
        value={value}
        onChange={(e) =>
          rf.setNodes((ns) =>
            ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, value: e.target.value } } : n)),
          )
        }
        className="text-xs min-h-[60px] nodrag"
      />
    </BaseNode>
  );
}
