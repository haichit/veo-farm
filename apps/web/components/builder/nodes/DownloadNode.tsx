'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function DownloadNode(props: NodeProps) {
  return (
    <BaseNode {...props}>
      <div className="text-[10px] text-text-muted">Tải xuống tất cả media kết nối vào.</div>
    </BaseNode>
  );
}
