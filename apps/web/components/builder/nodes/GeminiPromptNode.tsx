'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { useFlowStore, type BuilderNodeData } from '@/lib/builder/flow-store';

export function GeminiPromptNode(props: NodeProps) {
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = ((props.data as any)?.config ?? {}) as {
    apiKey?: string;
    promptTemplate?: string;
    useAdditionalText?: boolean;
    additionalText?: string;
    /** User-typed override — when set, worker uses this instead of calling Gemini. */
    manualOutput?: string;
  };
  const data = props.data as BuilderNodeData;
  const lastOutput = data?.lastOutputText ?? '';
  const status = data?.status ?? 'idle';
  const defaultKey = useFlowStore((s) => s.defaultGeminiApiKey);
  // Effective key: per-node value wins, fall back to global default the
  // user pasted into another gemini node. Workflow runner does the same
  // substitution on POST so worker receives a non-empty key.
  const hasApiKey = !!(cfg.apiKey?.trim() || defaultKey);
  const usingManual = !!cfg.manualOutput?.trim();

  return (
    <BaseNode {...props} runIcon="play">
      <textarea
        value={cfg.promptTemplate ?? ''}
        onChange={(e) => updateConfig(props.id, { promptTemplate: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="Prompt template (dùng {{text}} cho input)..."
        rows={3}
        className="nodrag nowheel w-full bg-[#12121f] border border-white/[0.08] rounded-md p-2 text-xs text-text-primary outline-none focus:border-accent resize-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[10px] text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={!!cfg.useAdditionalText}
            onChange={(e) => updateConfig(props.id, { useAdditionalText: e.target.checked })}
          />
          Bổ sung lệnh phụ
        </label>
      </div>
      {!hasApiKey && (
        <div className="mt-2 px-2 py-1.5 rounded-md bg-warning-bg border border-warning/30 text-[10px] text-warning">
          ⚠ Chưa cài API Key! Mở editor để nhập.
        </div>
      )}

      {/* Output preview + override — visible after the node has run at least
          once OR the user has typed a manual override. Editing the box saves
          to config.manualOutput so the worker skips the Gemini call next run. */}
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
                title="Xoá override, lần Run sau Gemini sẽ chạy lại"
              >
                ↺ revert
              </button>
            )}
          </div>
          <textarea
            value={cfg.manualOutput ?? lastOutput}
            onChange={(e) => updateConfig(props.id, { manualOutput: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="(output sẽ hiện ở đây sau khi Run)"
            className="nodrag nowheel flex-1 min-h-[60px] w-full bg-[#0c0c18] border border-success/30 rounded-md p-2 text-[11px] text-text-primary outline-none focus:border-accent resize-none"
          />
        </div>
      )}
    </BaseNode>
  );
}
