// TypeScript types for Veo 3 Flow API.
// Reference: SPEC_REPLICA_BACKEND.md section 18.4.

import type { PaygateTier } from './constants.js';

// === Common ===

export interface CropCoordinates {
  top: 0 | number;
  left: 0 | number;
  bottom: 1 | number;
  right: 1 | number;
}

export interface MediaRef {
  mediaId: string;
}

export interface ImageReference extends MediaRef {
  imageUsageType: 'IMAGE_USAGE_TYPE_ASSET' | 'IMAGE_USAGE_TYPE_STYLE';
}

export interface ImageWithCrop extends MediaRef {
  cropCoordinates: CropCoordinates;
}

// === Generate Video Request ===

export interface RecaptchaContext {
  token: string;
  applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB';
}

export interface ClientContext {
  projectId: string;
  tool: 'PINHOLE';
  userPaygateTier: PaygateTier;
  sessionId: string;
  recaptchaContext: RecaptchaContext;
}

export interface MediaGenerationContext {
  batchId: string;
  audioFailurePreference?: 'BLOCK_SILENCED_VIDEOS';
}

export interface StructuredPromptPart {
  text: string;
}

export interface StructuredPrompt {
  parts: StructuredPromptPart[];
}

export interface TextInput {
  structuredPrompt: StructuredPrompt;
}

export type AspectRatioEnum = 'VIDEO_ASPECT_RATIO_LANDSCAPE' | 'VIDEO_ASPECT_RATIO_PORTRAIT';

export interface VideoRequestItem {
  aspectRatio: AspectRatioEnum;
  seed: number;
  textInput: TextInput;
  videoModelKey: string;
  metadata: Record<string, unknown>;
  referenceImages?: ImageReference[];
  referenceAudio?: MediaRef[];
  startImage?: ImageWithCrop;
  endImage?: ImageWithCrop;
}

export interface GenerateVideoRequest {
  mediaGenerationContext: MediaGenerationContext;
  clientContext: ClientContext;
  requests: VideoRequestItem[];
  useV2ModelConfig: true;
}

// === Generate Video Response ===

export interface MediaResponse {
  name: string;
  projectId?: string;
  mediaMetadata?: MediaMetadata;
}

export interface MediaMetadata {
  mediaStatus?: {
    mediaGenerationStatus?:
      | 'MEDIA_GENERATION_STATUS_PENDING'
      | 'MEDIA_GENERATION_STATUS_RUNNING'
      | 'MEDIA_GENERATION_STATUS_SUCCESSFUL'
      | 'MEDIA_GENERATION_STATUS_FAILED'
      | 'MEDIA_GENERATION_STATUS_FILTERED';
    failureReason?: string;
  };
  video?: {
    servingUri?: string;
    uri?: string;
    durationSec?: number;
  };
  image?: {
    servingUri?: string;
    uri?: string;
  };
}

export interface GenerateVideoResponse {
  media?: MediaResponse[];
  operationName?: string;
}

// === Check Status ===

export interface CheckStatusRequest {
  media: Array<{ name: string; projectId?: string }>;
}

export interface CheckStatusResponse {
  media?: MediaResponse[];
}

// === Upload Image ===

export interface UploadImageRequest {
  data: string; // base64
  mimeType: string;
  projectId: string;
}

export interface UploadImageResponse {
  mediaId: string;
  servingUri?: string;
}

// === Generate Image (storyboard) ===

export interface GenerateImageRequest {
  clientContext: ClientContext;
  mediaGenerationContext: MediaGenerationContext;
  prompt: string;
  imageModelKey: string;
  aspectRatio: string;
  count: number;
  referenceImages?: ImageReference[];
}

export interface GenerateImageResponse {
  media?: MediaResponse[];
}

// === Generation modes ===

export type GenerationMode = 't2v' | 'i2v' | 'r2v' | 'f2v';

// === Plugin options ===

export interface GenerateVideoOptions {
  aspectRatio?: '16:9' | '9:16';
  seed?: number;
  count?: number;
  model?: 'veo_3_1_lite' | 'veo_3_1_fast' | 'veo_3_1_quality';
  startImageId?: string;
  endImageId?: string;
  referenceImages?: Array<string | { mediaId: string }>;
  voice?: string;
}
