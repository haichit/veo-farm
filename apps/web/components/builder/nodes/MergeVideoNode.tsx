'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function MergeVideoNode(props: NodeProps) {
  return (
    <BaseNode {...props} runIcon="play">
      <div className="text-[10px] text-text-muted">Ghép tất cả video input theo thứ tự kết nối.</div>
    </BaseNode>
  );
}
