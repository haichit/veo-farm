'use client';
import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { useJobStatus } from '@/lib/hooks/useFlowOutputs';

export function DownloadNode({ id, selected }: NodeProps) {
  const job = useJobStatus();
  return (
    <BaseNode id={id} selected={selected} icon="⬇️" title="Download" outputs={false} width={300}>
      <div className="text-muted-foreground">Final MP4 output</div>
      {job?.output_url ? (
        <a
          href={job.output_url}
          target="_blank"
          rel="noopener noreferrer"
          className="nodrag mt-2 block w-full text-center bg-primary text-primary-foreground rounded py-2 text-xs font-medium"
        >
          ⬇ Download MP4
        </a>
      ) : (
        <div className="mt-2 text-[10px] text-muted-foreground italic">
          {job?.status === 'failed' ? '⚠ Job failed' : job?.status === 'running' ? '⏳ Đang xử lý...' : 'Chưa có output'}
        </div>
      )}
    </BaseNode>
  );
}
