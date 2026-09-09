'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

// Video in → last-frame image out. Chains scenes: connect a Generate Video's
// "video" output here, then this node's "image" output into the NEXT Generate
// Video's "Start Frame" port — the new clip picks up exactly where the last
// one ended.
export function ExtractLastFrameNode(props: NodeProps) {
  return (
    <BaseNode {...props} runIcon="play">
      <div className="text-[10px] text-text-muted opacity-70">
        Lấy khung hình cuối của video nối vào — dùng làm Start Frame cho Generate Video tiếp theo để nối cảnh liền mạch.
      </div>
    </BaseNode>
  );
}
