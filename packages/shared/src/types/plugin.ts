import type { Account } from './account';

// Logger is a minimal shape so shared package doesn't depend on a specific lib.
export interface Logger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

// Page is typed as `unknown` here to avoid forcing playwright as a hard dep on consumers.
// Worker imports the real Playwright Page type and casts at the boundary.
export interface PluginExecutionContext {
  page: unknown;
  account: Account;
  cookies: Cookie[];
  logger: Logger;
  abortSignal: AbortSignal;
  uploadFile: (buffer: Buffer, ext: string) => Promise<string>;
}

// === SCRIPT ===

export interface ScriptInput {
  idea: string;
  systemPrompt: string;
  targetDurationSec?: number;
  numScenes?: number;
}

export interface ScriptScene {
  id: number;
  duration_sec: number;
  image_prompt: string;
  video_prompt: string;
  voice_script: string;
}

export interface ScriptOutput {
  character_bible: {
    name: string;
    appearance: string;
    personality: string;
  };
  scene_bible: {
    setting: string;
    visual_style: string;
    camera: string;
  };
  scenes: ScriptScene[];
  audio: {
    music_mood: string;
    voice_style: string;
  };
  post: {
    title: string;
    caption: string;
    hashtags: string[];
  };
}

export interface ScriptProvider {
  id: string;
  name: string;
  url: string;
  loginUrl: string;
  generateScript(input: ScriptInput, ctx: PluginExecutionContext): Promise<ScriptOutput>;
}

// === IMAGE ===

export type AspectRatio = '9:16' | '16:9' | '1:1';

export interface ImageInput {
  prompt: string;
  refImageUrl?: string;
  aspectRatio: AspectRatio;
}

export interface ImageOutput {
  imageUrl: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface ImageProvider {
  id: string;
  name: string;
  url: string;
  loginUrl: string;
  capabilities: {
    supports_ref_image: boolean;
    supports_aspect_ratio: AspectRatio[];
  };
  generateImage(input: ImageInput, ctx: PluginExecutionContext): Promise<ImageOutput>;
}

// === VIDEO ===

export interface VideoInput {
  prompt: string;
  refImageUrl?: string;
  /** URL of an image to use as the FIRST FRAME of the generated video (i2v mode).
   * Used by chain-frames mode to wire scene N+1 to the last frame of scene N. */
  startImageUrl?: string;
  voiceScript?: string;
  durationSec: number;
  aspectRatio: AspectRatio;
}

export interface VideoOutput {
  videoUrl: string;
  durationSec: number;
  hasAudio: boolean;
}

export interface VideoProvider {
  id: string;
  name: string;
  url: string;
  loginUrl: string;
  capabilities: {
    max_duration_sec: number;
    supports_image_ref: boolean;
    supports_voice_in_prompt: boolean;
    aspect_ratios: AspectRatio[];
  };
  generateVideo(input: VideoInput, ctx: PluginExecutionContext): Promise<VideoOutput>;
}

// === VOICE ===

export interface VoiceInput {
  text: string;
  voiceId: string;
  language: string;
}

export interface VoiceOutput {
  audioUrl: string;
  durationSec: number;
}

export interface VoiceProvider {
  id: string;
  name: string;
  url: string;
  loginUrl: string;
  capabilities: {
    languages: string[];
    voices: Array<{ id: string; name: string; gender: 'male' | 'female' | 'neutral' }>;
  };
  generateVoice(input: VoiceInput, ctx: PluginExecutionContext): Promise<VoiceOutput>;
}

export type AnyProvider = ScriptProvider | ImageProvider | VideoProvider | VoiceProvider;
export type ProviderKind = 'script' | 'image' | 'video' | 'voice';
