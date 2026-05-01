'use client';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface Props {
  selected?: boolean;
  icon: ReactNode;
  title: string;
  status?: 'idle' | 'running' | 'success' | 'error';
  children?: ReactNode;
  inputs?: boolean;
  outputs?: boolean;
  width?: number;
}

const STATUS_CLASSES = {
  idle: 'border-border',
  running: 'border-info shadow-[0_0_20px_rgba(96,165,250,0.3)] animate-pulse',
  success: 'border-success/50 shadow-[0_0_20px_rgba(52,211,153,0.2)]',
  error: 'border-error/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]',
} as const;

export function BaseNode({
  selected,
  icon,
  title,
  status = 'idle',
  children,
  inputs = true,
  outputs = true,
  width = 320,
}: Props) {
  return (
    <div
      style={{ width }}
      className={cn(
        'bg-bg-card rounded-2xl border-2 transition-all',
        selected ? 'border-accent shadow-accent-glow' : STATUS_CLASSES[status],
      )}
    >
      {inputs && (
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-accent !border-bg-card !w-2.5 !h-2.5"
        />
      )}

      <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-accent-glow flex items-center justify-center text-accent text-base">
          {icon}
        </div>
        <h3 className="font-semibold text-sm text-text-primary flex-1 truncate">{title}</h3>
        {status === 'running' && (
          <span className="w-2 h-2 rounded-full bg-info animate-pulse" aria-label="Running" />
        )}
        {status === 'success' && (
          <span className="w-2 h-2 rounded-full bg-success" aria-label="Success" />
        )}
        {status === 'error' && (
          <span className="w-2 h-2 rounded-full bg-error" aria-label="Error" />
        )}
      </div>

      <div className="p-4 space-y-3 text-xs text-text-secondary">{children}</div>

      {outputs && (
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-accent !border-bg-card !w-2.5 !h-2.5"
        />
      )}
    </div>
  );
}
