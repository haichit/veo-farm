'use client';

import { X, Trash2 } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useFlowStore, type BuilderNode } from '@/lib/builder/flow-store';
import {
  ASPECT_RATIOS,
  IMAGE_MODELS,
  NODE_TYPES,
  QUALITY_OPTIONS,
  QUANTITY_OPTIONS,
  VEO_MODELS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_MODE_OPTIONS,
  type BuilderNodeType,
} from '@/lib/builder/node-types';
import { PreviewMedia } from './preview/PreviewMedia';

// Right-side panel — shown when a single node is selected. Renders the
// type-appropriate editor (textareas, chips, pickers) plus inline media
// previews and a delete button. One unified component instead of 10 split
// editors so adding a config field only touches one place.
export function NodeEditorPanel() {
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const node = useFlowStore((s) =>
    s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) : null,
  ) as BuilderNode | null | undefined;
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  const removeNodes = useFlowStore((s) => s.removeNodes);
  const selectNode = useFlowStore((s) => s.selectNode);
  const setDefaultGeminiApiKey = useFlowStore((s) => s.setDefaultGeminiApiKey);
  const defaultGeminiApiKey = useFlowStore((s) => s.defaultGeminiApiKey);

  if (!selectedNodeId || !node) return null;
  const type = (node.type ?? 'prompt') as BuilderNodeType;
  const def = NODE_TYPES[type];
  if (!def) return null;
  // eslint-disable-next-line
  const Icon = ((Icons as any)[def.icon] ?? Icons.Box) as Icons.LucideIcon;
  const cfg = (node.data?.config ?? {}) as Record<string, unknown>;
  const previewMedia = node.data?.previewMedia ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3.5 py-3 border-b border-border"
        style={{ background: `${def.color}10` }}
      >
        <Icon size={16} style={{ color: def.color }} />
        <h3 className="flex-1 truncate text-sm font-semibold text-text-primary">
          {def.label}
        </h3>
        <button
          type="button"
          onClick={() => {
            if (confirm('Xoá node này?')) {
              removeNodes([node.id]);
              selectNode(null);
            }
          }}
          className="p-1 rounded text-error/70 hover:text-error hover:bg-error/10"
          title="Xoá node"
        >
          <Trash2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => selectNode(null)}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-white/10"
          title="Đóng"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        <Field label="ID" mono>{node.id}</Field>
        <Field label="Trạng thái">
          {node.data?.status ?? 'idle'}
          {node.data?.error && <span className="block text-error text-[10px] mt-1">⚠ {node.data.error}</span>}
        </Field>

        {(type === 'prompt' || type === 'prompt_list') && (
          <TextEdit
            label={type === 'prompt_list' ? 'Danh sách prompt (1/dòng)' : 'Text'}
            value={(cfg.text as string) ?? ''}
            onChange={(v) => updateConfig(node.id, { text: v })}
            rows={type === 'prompt_list' ? 8 : 5}
          />
        )}

        {type === 'gemini_prompt' && (
          <>
            <TextEdit
              label={`API Key${defaultGeminiApiKey ? ' (đã lưu, dùng chung mọi node)' : ''}`}
              value={(cfg.apiKey as string) ?? ''}
              onChange={(v) => {
                updateConfig(node.id, { apiKey: v });
                // Auto-save key as default so the next gemini_* node mày
                // tạo sẽ tự fill, khỏi paste lại.
                if (v.trim()) setDefaultGeminiApiKey(v);
              }}
              placeholder="AIza..."
              rows={1}
              monospace
            />
            <TextEdit
              label="Prompt template"
              value={(cfg.promptTemplate as string) ?? ''}
              onChange={(v) => updateConfig(node.id, { promptTemplate: v })}
              placeholder="Dùng {{text}} cho input động..."
              rows={4}
            />
            <Toggle
              label="Bổ sung lệnh phụ"
              value={!!cfg.useAdditionalText}
              onChange={(v) => updateConfig(node.id, { useAdditionalText: v })}
            />
            {!!cfg.useAdditionalText && (
              <TextEdit
                label="Lệnh phụ"
                value={(cfg.additionalText as string) ?? ''}
                onChange={(v) => updateConfig(node.id, { additionalText: v })}
                rows={3}
              />
            )}
          </>
        )}

        {type === 'gemini_prompt_kie' && (
          <>
            <TextEdit
              label="API Key (Kie.ai)"
              value={(cfg.apiKey as string) ?? ''}
              onChange={(v) => updateConfig(node.id, { apiKey: v })}
              placeholder="kie_..."
              rows={1}
              monospace
            />
            <Select
              label="Model"
              value={(cfg.model as string) ?? 'gemini-2.5-flash'}
              onChange={(v) => updateConfig(node.id, { model: v })}
              options={[
                { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recommended)' },
                { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (slower, higher quality)' },
                { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
                { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (legacy)' },
              ]}
            />
            <TextEdit
              label="Prompt template"
              value={(cfg.promptTemplate as string) ?? ''}
              onChange={(v) => updateConfig(node.id, { promptTemplate: v })}
              rows={4}
            />
          </>
        )}

        {type === 'gemini_vision' && (
          <>
            <TextEdit
              label={`API Key (aistudio.google.com/apikey)${defaultGeminiApiKey ? ' — đã lưu, dùng chung' : ''}`}
              value={(cfg.apiKey as string) ?? ''}
              onChange={(v) => {
                updateConfig(node.id, { apiKey: v });
                if (v.trim()) setDefaultGeminiApiKey(v);
              }}
              placeholder="AIza..."
              rows={1}
              monospace
            />
            <Select
              label="Model"
              value={(cfg.model as string) ?? 'gemini-2.5-flash'}
              onChange={(v) => updateConfig(node.id, { model: v })}
              options={[
                { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (multimodal)' },
                { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (chậm, chất hơn)' },
                { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
              ]}
            />
            <TextEdit
              label="Câu hỏi cho media"
              value={(cfg.promptTemplate as string) ?? ''}
              onChange={(v) => updateConfig(node.id, { promptTemplate: v })}
              placeholder="vd: Mô tả chi tiết, viết prompt giống ảnh, tóm tắt video..."
              rows={4}
            />
            <Field label="Media input">
              Cắm Upload Media / Generate Image vào port &quot;media N&quot; bên trái. File ≤50MB.
            </Field>
          </>
        )}

        {type === 'generate_image' && (
          <>
            <Select
              label="Tỷ lệ"
              value={(cfg.ratio as string) ?? 'landscape'}
              onChange={(v) => updateConfig(node.id, { ratio: v })}
              options={ASPECT_RATIOS.map((r) => ({ ...r }))}
            />
            <Select
              label="Số lượng"
              value={(cfg.quantity as number) ?? 1}
              onChange={(v) => updateConfig(node.id, { quantity: v })}
              options={QUANTITY_OPTIONS.map((o) => ({ ...o }))}
            />
            <Select
              label="Chất lượng"
              value={(cfg.quality as string) ?? '1080p'}
              onChange={(v) => updateConfig(node.id, { quality: v })}
              options={QUALITY_OPTIONS.map((o) => ({ ...o }))}
            />
            <Select
              label="Model"
              value={(cfg.imageModel as string) ?? 'imagen_4'}
              onChange={(v) => updateConfig(node.id, { imageModel: v })}
              options={IMAGE_MODELS.map((m) => ({ ...m }))}
            />
          </>
        )}

        {type === 'generate_video' && (
          <>
            <Select
              label="Tỷ lệ"
              value={(cfg.ratio as string) ?? 'landscape'}
              onChange={(v) => updateConfig(node.id, { ratio: v })}
              options={ASPECT_RATIOS.map((r) => ({ ...r }))}
            />
            <Select
              label="Số lượng"
              value={(cfg.quantity as number) ?? 1}
              onChange={(v) => updateConfig(node.id, { quantity: v })}
              options={QUANTITY_OPTIONS.map((o) => ({ ...o }))}
            />
            <Select
              label="Chất lượng"
              value={(cfg.quality as string) ?? '1080p'}
              onChange={(v) => updateConfig(node.id, { quality: v })}
              options={QUALITY_OPTIONS.map((o) => ({ ...o }))}
            />
            <Select
              label="Veo model"
              value={(cfg.videoModel as string) ?? 'veo31_fast_lower'}
              onChange={(v) => updateConfig(node.id, { videoModel: v })}
              options={VEO_MODELS.map((m) => ({ value: m.value, label: `${m.label} — ${m.subtitle}` }))}
            />
            <Select
              label="Chế độ"
              value={(cfg.videoMode as string) ?? 'FRAME'}
              onChange={(v) => updateConfig(node.id, { videoMode: v })}
              options={VIDEO_MODE_OPTIONS.map((o) => ({ ...o }))}
            />
            <Select
              label="Thời lượng"
              value={(cfg.duration as number) ?? 8}
              onChange={(v) => updateConfig(node.id, { duration: v })}
              options={VIDEO_DURATION_OPTIONS.map((o) => ({ ...o }))}
            />
          </>
        )}

        {type === 'upload_image' && (
          <Field label="Tệp">{(cfg.imagePath as string) || 'Chưa chọn'}</Field>
        )}

        {type === 'download' && (
          <>
            <Select
              label="Chất lượng tải"
              value={(cfg.quality as string) ?? 'native'}
              onChange={(v) => updateConfig(node.id, { quality: v })}
              options={QUALITY_OPTIONS.map((o) => ({ ...o }))}
            />
            <TextEdit
              label="Thư mục con"
              value={(cfg.directory as string) ?? ''}
              onChange={(v) => updateConfig(node.id, { directory: v })}
              placeholder="vd: nhan-vat-A/"
              rows={1}
            />
          </>
        )}

        {type === 'frame' && (
          <>
            <TextEdit
              label="Tên khung"
              value={(cfg.name as string) ?? 'Khung Nhóm'}
              onChange={(v) => updateConfig(node.id, { name: v })}
              rows={1}
            />
            <NumberPair
              label="Kích thước"
              w={(cfg.width as number) ?? 500}
              h={(cfg.height as number) ?? 400}
              onChange={(w, h) => updateConfig(node.id, { width: w, height: h })}
            />
          </>
        )}

        {previewMedia.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
              Kết quả ({previewMedia.length})
            </div>
            <PreviewMedia media={previewMedia} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Form primitives ──────────────────────────────────────────────────────

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</div>
      <div className={`text-xs text-text-primary ${mono ? 'font-mono break-all' : ''}`}>{children}</div>
    </div>
  );
}

function TextEdit({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  monospace,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  monospace?: boolean;
}) {
  if (rows === 1) {
    return (
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-bg-input border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent ${monospace ? 'font-mono' : ''}`}
        />
      </div>
    );
  }
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full bg-bg-input border border-border rounded-md p-2 text-xs text-text-primary outline-none focus:border-accent resize-none ${monospace ? 'font-mono' : ''}`}
      />
    </div>
  );
}

function Select<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</label>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const opt = options.find((o) => String(o.value) === raw);
          if (opt) onChange(opt.value);
        }}
        className="w-full bg-bg-input border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} className="bg-bg-card">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-xs text-text-secondary">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent"
      />
      {label}
    </label>
  );
}

function NumberPair({
  label,
  w,
  h,
  onChange,
}: {
  label: string;
  w: number;
  h: number;
  onChange: (w: number, h: number) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="number"
          value={w}
          min={120}
          step={10}
          onChange={(e) => onChange(Number(e.target.value) || w, h)}
          className="flex-1 bg-bg-input border border-border rounded-md px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent tabular-nums"
        />
        <span className="text-text-muted self-center text-xs">×</span>
        <input
          type="number"
          value={h}
          min={120}
          step={10}
          onChange={(e) => onChange(w, Number(e.target.value) || h)}
          className="flex-1 bg-bg-input border border-border rounded-md px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent tabular-nums"
        />
      </div>
    </div>
  );
}
