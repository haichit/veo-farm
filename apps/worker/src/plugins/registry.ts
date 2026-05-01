import type {
  ScriptProvider,
  ImageProvider,
  VideoProvider,
  VoiceProvider,
  ProviderKind,
} from '@veo-farm/shared';

import { ChatGPTScriptPlugin } from './script/chatgpt.js';
import { GeminiScriptPlugin } from './script/gemini.js';
import { ClaudeScriptPlugin } from './script/claude.js';
import { FluxImagePlugin } from './image/flux.js';
import { DallEImagePlugin } from './image/dalle.js';
import { GeminiImagePlugin } from './image/gemini.js';
import { Veo3VideoPlugin } from './video/veo3_legacy.js';
import { Veo3FlowV2Plugin } from './video/veo3_flow_v2.js';
import { SoraVideoPlugin } from './video/sora.js';
import { VeoNativeVoicePlugin } from './voice/veo_native.js';
import { ElevenLabsVoicePlugin } from './voice/elevenlabs.js';

const script: Record<string, ScriptProvider> = {
  chatgpt: ChatGPTScriptPlugin,
  gemini: GeminiScriptPlugin,
  claude: ClaudeScriptPlugin,
};

const image: Record<string, ImageProvider> = {
  flux: FluxImagePlugin,
  dalle: DallEImagePlugin,
  gemini: GeminiImagePlugin,
};

const video: Record<string, VideoProvider> = {
  veo3: Veo3FlowV2Plugin,           // primary (Flow API replica)
  veo3_flow_v2: Veo3FlowV2Plugin,   // alias
  veo3_legacy: Veo3VideoPlugin,     // Playwright fallback
  sora: SoraVideoPlugin,            // scaffold — DOM selectors not mapped yet
};

const voice: Record<string, VoiceProvider> = {
  veo_native: VeoNativeVoicePlugin,
  elevenlabs: ElevenLabsVoicePlugin,
};

export function getPlugin(kind: ProviderKind, id: string) {
  const map = { script, image, video, voice }[kind] as Record<string, any>;
  const plugin = map[id];
  if (!plugin) throw new Error(`No ${kind} plugin: ${id}`);
  return plugin;
}

export const pluginRegistry = { script, image, video, voice };
