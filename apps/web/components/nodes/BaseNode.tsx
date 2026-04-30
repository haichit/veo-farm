'use client';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';

interface Props {
  selected?: boolean;
  icon: string;
  title: string;
  children?: React.ReactNode;
  inputs?: boolean;
  outputs?: boolean;
  width?: number;
}

export function BaseNode({ selected, icon, title, children, inputs = true, outputs = true, width = 280 }: Props) {
  return (
    <div
      style={{ width }}
      className={cn(
        'rounded-lg border-2 bg-white p-3 shadow-sm',
        selected ? 'border-blue-500' : 'border-gray-300',
      )}
    >
      {inputs && <Handle type="target" position={Position.Left} className="!bg-gray-400" />}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="space-y-2 text-xs">{children}</div>
      {outputs && <Handle type="source" position={Position.Right} className="!bg-gray-400" />}
    </div>
  );
}
