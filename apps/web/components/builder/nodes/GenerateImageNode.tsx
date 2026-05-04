'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { ConfigChip } from './ConfigChip';
import { useFlowStore } from '@/lib/builder/flow-store';
import {
  ASPECT_RATIOS,
  IMAGE_MODELS,
  QUALITY_OPTIONS,
  QUANTITY_OPTIONS,
} from '@/lib/builder/node-types';
import { useVeo3Accounts } from '@/lib/builder/use-veo3-accounts';

export function GenerateImageNode(props: NodeProps) {
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  const { accounts } = useVeo3Accounts();
  const cfg = ((props.data as any)?.config ?? {}) as {
    ratio?: string;
    quantity?: number;
    quality?: string;
    imageModel?: string;
    accountId?: string | null;
  };
  const accountOptions = [
    { value: 'auto', label: 'Tự động' },
    ...accounts.map((a) => ({ value: a.id, label: a.label })),
  ];

  return (
    <BaseNode {...props} runIcon="play">
      <div className="flex flex-wrap gap-1.5">
        <ConfigChip
          value={cfg.ratio ?? 'landscape'}
          options={[...ASPECT_RATIOS]}
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
        <ConfigChip
          value={cfg.imageModel ?? 'imagen_4'}
          options={[...IMAGE_MODELS]}
          onChange={(v) => updateConfig(props.id, { imageModel: v })}
        />
        <ConfigChip
          value={cfg.accountId ?? 'auto'}
          options={accountOptions}
          onChange={(v) =>
            updateConfig(props.id, { accountId: v === 'auto' ? null : v })
          }
        />
      </div>
    </BaseNode>
  );
}
