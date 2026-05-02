'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { useFlowStore, type BuilderNodeData } from '@/lib/builder/flow-store';

// Gemini Vision — multimodal LLM. Accepts text + N media inputs (images
// and/or videos) and returns text via the official Files API +
// generateContent. See apps/worker/src/plugins/builder/gemini-vision.ts.
export function GeminiVisionNode(props: NodeProps) {
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = ((props.data as any)?.config ?? {}) as {
    apiKey?: string;
    model?: string;
    promptTemplate?: string;
    manualOutput?: string;
  };
  const data = props.data as BuilderNodeData;
  const lastOutput = data?.lastOutputText ?? '';
  const status = data?.status ?? 'idle';
  const defaultKey = useFlowStore((s) => s.defaultGeminiApiKey);
  const hasApiKey = !!(cfg.apiKey?.trim() || defaultKey);
  const usingManual = !!cfg.manualOutput?.trim();

  return (
    <BaseNode {...props} runIcon="play">
      <textarea
        value={cfg.promptTemplate ?? ''}
        onChange={(e) => updateConfig(props.id, { promptTemplate: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="Câu hỏi cho media (vd: Mô tả chi tiết, viết prompt giống ảnh, tóm tắt video...)"
        className="nodrag nowheel min-h-[60px] w-full bg-[#12121f] border border-white/[0.08] rounded-md p-2 text-xs text-text-primary outline-none focus:border-accent resize-none"
      />
      {!hasApiKey && (
        <div className="mt-1 px-2 py-1.5 rounded-md bg-warning-bg border border-warning/30 text-[10px] text-warning">
          ⚠ Chưa cài API Key! Mở editor để paste.
        </div>
      )}
      {(lastOutput || usingManual || status === 'done') && (
        <div className="flex-1 flex flex-col min-h-0 mt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Output {usingManual && <span className="text-accent normal-case">(đã sửa)</span>}
            </span>
            {usingManual && (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  updateConfig(props.id, { manualOutput: '' });
                }}
                className="nodrag text-[9px] text-text-muted hover:text-error"
                title="Xoá override"
              >
                ↺ revert
              </button>
            )}
          </div>
          <textarea
            value={cfg.manualOutput || lastOutput}
            onChange={(e) => updateConfig(props.id, { manualOutput: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="(output hiện sau khi Run)"
            className="nodrag nowheel flex-1 min-h-[60px] w-full bg-[#0c0c18] border border-success/30 rounded-md p-2 text-[11px] text-text-primary outline-none focus:border-accent resize-none"
          />
        </div>
      )}
    </BaseNode>
  );
}
