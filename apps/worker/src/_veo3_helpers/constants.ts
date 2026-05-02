// Constants for Veo 3 Flow API replica.
// Reverse-engineered from VEO3 Flow Automation v1.5.0. All public values.
// Reference: SPEC_REPLICA_BACKEND.md sections 18.2 + 18.5.

export const API_BASE = 'https://aisandbox-pa.googleapis.com';
export const LABS_BASE = 'https://labs.google';
export const STORAGE_BASE = 'https://storage.googleapis.com/ai-sandbox-videofx/';

export const API_KEY = 'AIzaSyBtrm0o5ab1c-Ec8ZuLcGt3oJAA5VWt3pY';
export const RECAPTCHA_SITE_KEY = '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV';
export const TOOL_NAME = 'PINHOLE';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

export const SEC_CH_UA = '"Not;A Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"';
export const SEC_CH_UA_PLATFORM = '"Windows"';

// === Endpoints ===
export const ENDPOINTS = {
  // Video generation (4 modes)
  generateText: '/v1/video:batchAsyncGenerateVideoText',
  generateStartImage: '/v1/video:batchAsyncGenerateVideoStartImage',
  generateReferenceImages: '/v1/video:batchAsyncGenerateVideoReferenceImages',
  generateStartAndEndImage: '/v1/video:batchAsyncGenerateVideoStartAndEndImage',
  // Polling
  checkStatus: '/v1/video:batchCheckAsyncVideoGenerationStatus',
  // Image
  generateImage: '/flowMedia:batchGenerateImages',
  // Upload
  uploadImage: '/v1/flow/uploadImage',
  // Misc
  checkAvailability: '/v1:checkAppAvailability',
  // Labs (separate base)
  labsSession: '/fx/api/auth/session',
  labsCreateProject: '/fx/api/trpc/project.createProject',
  labsGetMediaUrl: '/fx/api/trpc/media.getMediaUrlRedirect',
};

export const ENDPOINT_BY_MODE: Record<'t2v' | 'i2v' | 'r2v' | 'f2v', string> = {
  t2v: ENDPOINTS.generateText,
  i2v: ENDPOINTS.generateStartImage,
  r2v: ENDPOINTS.generateReferenceImages,
  f2v: ENDPOINTS.generateStartAndEndImage,
};

// === Video model keys ===
// Map: model_family -> mode -> aspect_variant -> key
export const VIDEO_MODEL_KEYS = {
  veo_3_1_lite: {
    t2v: { default: 'veo_3_1_t2v_lite' },
    i2v: { default: 'veo_3_1_i2v_lite' },
    f2v: { default: 'veo_3_1_i2v_s_lite_fl' },
  },
  veo_3_1_fast: {
    t2v: {
      landscape_advanced: 'veo_3_1_t2v_fast_ultra',
      portrait_advanced: 'veo_3_1_t2v_fast_portrait_ultra',
      landscape: 'veo_3_1_t2v_fast',
      portrait: 'veo_3_1_t2v_fast_portrait',
    },
    i2v: {
      landscape_advanced: 'veo_3_1_i2v_s_fast_ultra',
      portrait_advanced: 'veo_3_1_i2v_s_fast_portrait_ultra',
      landscape: 'veo_3_1_i2v_s_fast',
      portrait: 'veo_3_1_i2v_s_fast_portrait',
    },
    f2v: {
      landscape_advanced: 'veo_3_1_i2v_s_fast_ultra_fl',
      portrait_advanced: 'veo_3_1_i2v_s_fast_portrait_ultra_fl',
      landscape: 'veo_3_1_i2v_s_fast_fl',
      portrait: 'veo_3_1_i2v_s_fast_portrait_fl',
    },
    r2v: {
      landscape_advanced: 'veo_3_1_r2v_fast_landscape_ultra',
      portrait_advanced: 'veo_3_1_r2v_fast_portrait_ultra',
      landscape: 'veo_3_1_r2v_fast_landscape',
      portrait: 'veo_3_1_r2v_fast_portrait',
    },
  },
  veo_3_1_quality: {
    t2v: {
      landscape: 'veo_3_1_t2v',
      portrait: 'veo_3_1_t2v_portrait',
    },
    i2v: {
      landscape: 'veo_3_1_i2v_s',
      portrait: 'veo_3_1_i2v_s_portrait',
    },
  },
} as const;

// === Image model keys ===
export const IMAGE_MODELS = {
  nano_banana_pro: 'GEM_PIX_2',
  nano_banana_2: 'NARWHAL',
  imagen_4: 'IMAGEN_3_5',
  imagen_4_ref: 'R2I',
  upsample_2k: 'GEM_PIX_2_UPSAMPLE_2K',
  upsample_4k: 'GEM_PIX_2_UPSAMPLE_4K',
} as const;

// === Aspect ratio enums ===
export const VIDEO_ASPECT_RATIOS: Record<'16:9' | '9:16', string> = {
  '16:9': 'VIDEO_ASPECT_RATIO_LANDSCAPE',
  '9:16': 'VIDEO_ASPECT_RATIO_PORTRAIT',
};

export const IMAGE_ASPECT_RATIOS: Record<string, string> = {
  '16:9': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
  '9:16': 'IMAGE_ASPECT_RATIO_PORTRAIT',
  '1:1': 'IMAGE_ASPECT_RATIO_SQUARE',
  '4:3': 'IMAGE_ASPECT_RATIO_LANDSCAPE_4_3',
  '3:4': 'IMAGE_ASPECT_RATIO_PORTRAIT_3_4',
};

// === Paygate tiers ===
export type PaygateTier =
  | 'PAYGATE_TIER_FREE'
  | 'PAYGATE_TIER_ONE'
  | 'PAYGATE_TIER_TWO'
  | 'PAYGATE_TIER_THREE';

// === Policy / safety keywords (detect in error responses) ===
export const POLICY_KEYWORDS = [
  'SAFETY_FILTER',
  'CONTENT_POLICY',
  'POLICY_VIOLATION',
  'PUBLIC_POLICY_VIOLATION',
  'BLOCKED_FOR_SAFETY',
  'SAFETY_BLOCKED',
  'PROHIBITED_CONTENT',
  'TERMS_OF_SERVICE',
  'HARMFUL_CONTENT',
  'PROMINENT_PEOPLE_FILTER_FAILED',
  'PUBLIC_FIGURE',
  'CHILD_SAFETY',
  'ADULT_CONTENT',
  'UNSAFE_CONTENT',
];

// === Default settings ===
export const POLL_INTERVAL_MS = 5000;
export const POLL_TIMEOUT_MS = 600_000;
export const RETRY_MAX = 3;
export const RATE_LIMIT_DELAY_MS = 3000;
