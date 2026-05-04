// Workflow Builder — node type registry (SPEC §20.2).
// Visual specs §20.18, inline chips §20.19, per-node anatomy §20.20.

export interface PortDef {
  /** Logical port name (also forms the handle id, e.g. "input-0", "input-1"). */
  name: string;
  /** Affects edge color + connection compatibility. */
  type: 'string' | 'image' | 'video' | 'any';
  /** Hex color used for the port circle and the outgoing edge. */
  color: string;
  /** When true, connection is optional — render label suffix " (opt)". */
  optional?: boolean;
}

export type NodeCategory = 'input' | 'generate' | 'output' | 'util';

export interface NodeTypeDef {
  type: BuilderNodeType;
  label: string;
  category: NodeCategory;
  /** Header tint + selected border color. */
  color: string;
  /** lucide-react icon name (rendered via dynamic icon component). */
  icon: string;
  inputs: PortDef[];
  outputs: PortDef[];
  /** Default config payload for newly-created nodes. */
  defaults: Record<string, unknown>;
  /** Default body width in px. */
  width: number;
  /** Minimum body height in px. */
  minHeight: number;
}

export const BUILDER_NODE_TYPES = [
  'prompt',
  'prompt_list',
  'upload_image',
  'gemini_prompt',
  'gemini_prompt_kie',
  'gemini_vision',
  'gemini_chat',
  'generate_image',
  'generate_video',
  'merge_video',
  'remove_logo',
  'download',
  'frame',
] as const;

export type BuilderNodeType = (typeof BUILDER_NODE_TYPES)[number];

/** Port colors by data type — also used as edge stroke. */
export const PORT_COLORS = {
  string: '#a78bfa',
  image: '#22d3ee',
  video: '#fb923c',
  any: '#86efac',
} as const;

export const NODE_TYPES: Record<BuilderNodeType, NodeTypeDef> = {
  prompt: {
    type: 'prompt',
    label: '📄 Text / Prompt',
    category: 'input',
    color: '#8a5cf6',
    icon: 'StickyNote',
    inputs: [{ name: 'text', type: 'string', color: PORT_COLORS.string, optional: true }],
    outputs: [{ name: 'text', type: 'string', color: PORT_COLORS.string }],
    defaults: { text: '' },
    width: 240,
    minHeight: 130,
  },
  prompt_list: {
    type: 'prompt_list',
    label: '📝 Prompt List',
    category: 'input',
    color: '#6366f1',
    icon: 'List',
    inputs: [{ name: 'text', type: 'string', color: PORT_COLORS.string, optional: true }],
    outputs: [{ name: 'textList', type: 'string', color: PORT_COLORS.string }],
    defaults: { text: '' },
    width: 280,
    minHeight: 100,
  },
  upload_image: {
    type: 'upload_image',
    label: '📤 Upload Media',
    category: 'input',
    color: '#06b6d4',
    icon: 'Upload',
    inputs: [],
    outputs: [{ name: 'media', type: 'any', color: PORT_COLORS.image }],
    defaults: { imagePath: '', imageUrl: '' },
    width: 220,
    minHeight: 90,
  },
  gemini_prompt: {
    type: 'gemini_prompt',
    label: '🤖 Gemini Prompt',
    category: 'generate',
    color: '#84cc16',
    icon: 'Bot',
    inputs: [{ name: 'text', type: 'string', color: PORT_COLORS.string, optional: true }],
    outputs: [{ name: 'text', type: 'string', color: PORT_COLORS.string }],
    defaults: {
      apiKey: '',
      promptTemplate: '',
      useAdditionalText: false,
      additionalText: 'Chỉ trả về prompt không kèm hướng dẫn, không kèm bất cứ điều gì',
    },
    width: 280,
    minHeight: 110,
  },
  gemini_prompt_kie: {
    type: 'gemini_prompt_kie',
    label: '🤖 Gemini Prompt (Kie.ai)',
    category: 'generate',
    color: '#a855f7',
    icon: 'Sparkles',
    inputs: [{ name: 'text', type: 'string', color: PORT_COLORS.string, optional: true }],
    outputs: [{ name: 'text', type: 'string', color: PORT_COLORS.string }],
    defaults: { apiKey: '', model: 'gemini-2.0-flash-exp', promptTemplate: '' },
    width: 280,
    minHeight: 110,
  },
  gemini_chat: {
    type: 'gemini_chat',
    label: '🍪 Gemini Chat (Cookies)',
    category: 'generate',
    color: '#22d3ee',
    icon: 'MessageCircle',
    inputs: [{ name: 'text', type: 'string', color: PORT_COLORS.string, optional: true }],
    outputs: [{ name: 'text', type: 'string', color: PORT_COLORS.string }],
    defaults: {
      promptTemplate: '',
    },
    width: 280,
    minHeight: 130,
  },
  gemini_vision: {
    type: 'gemini_vision',
    label: '👁️ Gemini Vision',
    category: 'generate',
    color: '#22c55e',
    icon: 'Eye',
    // Port 0: text prompt. Dynamic ref slots are added by getNodeInputPorts
    // (same N+1 mechanism as generate_image) so user can wire 1+ media inputs.
    inputs: [{ name: 'text', type: 'string', color: PORT_COLORS.string, optional: true }],
    outputs: [{ name: 'text', type: 'string', color: PORT_COLORS.string }],
    defaults: {
      apiKey: '',
      model: 'gemini-2.5-flash',
      promptTemplate: '',
    },
    width: 280,
    minHeight: 130,
  },
  generate_image: {
    type: 'generate_image',
    label: '🖼️ Generate Image',
    category: 'generate',
    color: '#ec4899',
    icon: 'Image',
    inputs: [{ name: 'prompt', type: 'string', color: PORT_COLORS.string }],
    outputs: [{ name: 'image', type: 'image', color: PORT_COLORS.image }],
    defaults: {
      ratio: 'landscape',
      quantity: 1,
      quality: '1080p',
      imageModel: 'imagen_4',
      accountId: null,
    },
    width: 260,
    minHeight: 150,
  },
  generate_video: {
    type: 'generate_video',
    label: '🎬 Generate Video',
    category: 'generate',
    color: '#f97316',
    icon: 'Video',
    inputs: [{ name: 'prompt', type: 'string', color: PORT_COLORS.string }],
    outputs: [{ name: 'video', type: 'video', color: PORT_COLORS.video }],
    defaults: {
      ratio: 'landscape',
      quantity: 1,
      quality: '1080p',
      videoModel: 'veo31_fast_lower',
      videoMode: 'FRAME',
      duration: 8,
      accountId: null,
    },
    width: 370,
    minHeight: 120,
  },
  merge_video: {
    type: 'merge_video',
    label: '🎞️ Ghép Video (Merge)',
    category: 'generate',
    color: '#10b981',
    icon: 'Combine',
    inputs: [{ name: 'video', type: 'video', color: PORT_COLORS.video }],
    outputs: [{ name: 'video', type: 'video', color: PORT_COLORS.video }],
    defaults: {},
    width: 240,
    minHeight: 100,
  },
  remove_logo: {
    type: 'remove_logo',
    label: '🪄 Xoá Logo Veo',
    category: 'generate',
    color: '#ec4899',
    icon: 'Eraser',
    inputs: [{ name: 'video', type: 'video', color: PORT_COLORS.video }],
    outputs: [{ name: 'video', type: 'video', color: PORT_COLORS.video }],
    defaults: { zoom: 1.07 },
    width: 240,
    minHeight: 100,
  },
  download: {
    type: 'download',
    label: '💾 Download',
    category: 'output',
    color: '#34d399',
    icon: 'Download',
    inputs: [{ name: 'stream', type: 'any', color: PORT_COLORS.any }],
    outputs: [{ name: 'stream_out', type: 'any', color: PORT_COLORS.any }],
    defaults: { quality: 'native', directory: '' },
    width: 230,
    minHeight: 100,
  },
  frame: {
    type: 'frame',
    label: '🔳 Khung Nhóm (Frame)',
    category: 'util',
    color: '#f59e0b',
    icon: 'Frame',
    inputs: [],
    outputs: [],
    defaults: { width: 500, height: 400, name: 'Khung Nhóm' },
    width: 500,
    minHeight: 400,
  },
};

export const NODE_CATEGORIES: Record<NodeCategory, string> = {
  input: 'Input',
  generate: 'Generate',
  output: 'Output',
  util: 'Công cụ',
};

/** Order in which categories render in the palette. */
export const CATEGORY_ORDER: NodeCategory[] = ['input', 'generate', 'output', 'util'];

/** Reverse lookup: list nodes belonging to a category. */
export function nodesByCategory(category: NodeCategory): NodeTypeDef[] {
  return Object.values(NODE_TYPES).filter((n) => n.category === category);
}

// ─── Inline config option lists (SPEC §20.19) ─────────────────────────────────

export const ASPECT_RATIOS = [
  { value: 'landscape', label: '16:9' },
  { value: 'portrait', label: '9:16' },
  { value: 'square', label: '1:1' },
  { value: '4_3', label: '4:3' },
  { value: '3_4', label: '3:4' },
] as const;

export const QUANTITY_OPTIONS = [1, 2, 4].map((n) => ({ value: n, label: `x${n}` }));

export const QUALITY_OPTIONS = [
  { value: 'native', label: 'Gốc' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
] as const;

export const VIDEO_MODE_OPTIONS = [
  { value: 'FRAME', label: 'FRAME' },
  { value: 'REF', label: 'REF' },
] as const;

export const VIDEO_DURATION_OPTIONS = [
  { value: 4, label: '4s' },
  { value: 6, label: '6s' },
  { value: 8, label: '8s' },
] as const;

export const VEO_MODELS = [
  { value: 'veo31_lite', label: 'Veo 3.1 Lite', subtitle: 'Nhanh nhất' },
  { value: 'veo31_lite_lower', label: 'Veo 3.1 Lite', subtitle: 'Ưu tiên thấp' },
  { value: 'veo31_fast', label: 'Veo 3.1 Fast', subtitle: 'Nhanh' },
  { value: 'veo31_fast_lower', label: 'Veo 3.1 Fast', subtitle: 'Ưu tiên thấp' },
  { value: 'veo31_quality', label: 'Veo 3 Quality', subtitle: 'Chất lượng cao' },
] as const;

export const IMAGE_MODELS = [
  { value: 'imagen_4', label: 'Imagen 4' },
  { value: 'imagen_4_ref', label: 'Imagen 4 Ref' },
  { value: 'nano_banana_pro', label: 'NB-Pro' },
  { value: 'nano_banana_2', label: 'NB-2' },
] as const;

/** Compact display for VeoModel chip (e.g. "Lite", "Fast↓", "Q+"). */
export function formatVeoModelChip(value: string): string {
  if (value.startsWith('veo31_lite')) return value.endsWith('_lower') ? 'Lite↓' : 'Lite';
  if (value.startsWith('veo31_fast')) return value.endsWith('_lower') ? 'Fast↓' : 'Fast';
  if (value.startsWith('veo31_quality')) return 'Q+';
  return value;
}

/** Maximum number of dynamic image-reference slots. */
export const MAX_IMG_REFS = 5;

/** Average expected runtime per generation (ms) — used by the loading ring. */
export const NODE_AVG_RUNTIME_MS: Partial<Record<BuilderNodeType, number>> = {
  generate_image: 18_000,
  generate_video: 85_000,
  gemini_prompt: 6_000,
  gemini_prompt_kie: 6_000,
  gemini_vision: 20_000,
  gemini_chat: 30_000,
  merge_video: 12_000,
  remove_logo: 25_000,
};
