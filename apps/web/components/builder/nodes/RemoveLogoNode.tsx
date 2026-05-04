'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { ConfigChip } from './ConfigChip';
import { useFlowStore } from '@/lib/builder/flow-store';

const ZOOM_OPTIONS = [
  { value: 1.05, label: '105% (cắt ít)' },
  { value: 1.07, label: '107% (đề xuất)' },
  { value: 1.1, label: '110%' },
  { value: 1.15, label: '115% (cắt nhiều)' },
];

export function RemoveLogoNode(props: NodeProps) {
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  const cfg = ((props.data as any)?.config ?? {}) as { zoom?: number };
  const zoom = cfg.zoom ?? 1.07;
  return (
    <BaseNode {...props} runIcon="play">
      <div className="flex flex-wrap gap-1.5">
        <ConfigChip
          value={zoom}
          options={ZOOM_OPTIONS}
          onChange={(v) => updateConfig(props.id, { zoom: v })}
          format={(v) => `Zoom ${Math.round((Number(v) - 1) * 100 + 100)}%`}
        />
      </div>
      <div className="text-[10px] text-text-muted mt-1.5 opacity-70">
        Re-encode CRF 17 lanczos. Càng zoom cao càng sạch logo nhưng cắt nhiều frame.
      </div>
    </BaseNode>
  );
}
