'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { ConfigChip } from './ConfigChip';
import { useFlowStore } from '@/lib/builder/flow-store';
import {
  ASPECT_RATIOS,
  QUALITY_OPTIONS,
  QUANTITY_OPTIONS,
  VEO_MODELS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_MODE_OPTIONS,
  formatVeoModelChip,
} from '@/lib/builder/node-types';

export function GenerateVideoNode(props: NodeProps) {
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  const cfg = ((props.data as any)?.config ?? {}) as {
    ratio?: string;
    quantity?: number;
    quality?: string;
    videoModel?: string;
    videoMode?: string;
    duration?: number;
  };

  return (
    <BaseNode {...props} runIcon="play">
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          <ConfigChip
            value={cfg.ratio ?? 'landscape'}
            options={ASPECT_RATIOS.filter((r) => r.value === 'landscape' || r.value === 'portrait')}
            onChange={(v) => updateConfig(props.id, { ratio: v })}
          />
          <ConfigChip
            value={cfg.quantity ?? 1}
            options={[...QUANTITY_OPTIONS]}
            onChange={(v) => updateConfig(props.id, { quantity: v })}
          />
          <ConfigChip
            value={cfg.quality ?? '1080p'}
            options={[...QUALITY_OPTIONS]}
            onChange={(v) => updateConfig(props.id, { quality: v })}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ConfigChip
            value={cfg.videoModel ?? 'veo31_fast_lower'}
            options={[...VEO_MODELS]}
            onChange={(v) => updateConfig(props.id, { videoModel: v })}
            format={(v) => formatVeoModelChip(String(v))}
          />
          <ConfigChip
            value={cfg.videoMode ?? 'FRAME'}
            options={[...VIDEO_MODE_OPTIONS]}
            onChange={(v) => updateConfig(props.id, { videoMode: v })}
          />
          <ConfigChip
            value={cfg.duration ?? 8}
            options={[...VIDEO_DURATION_OPTIONS]}
            onChange={(v) => updateConfig(props.id, { duration: v })}
          />
        </div>
      </div>
    </BaseNode>
  );
}
