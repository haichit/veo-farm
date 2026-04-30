import type { VoiceProvider } from '@veo-farm/shared';

// Sentinel plugin — when used, voice is embedded inside Veo prompts at the video stage.
// generateVoice should never be called for veo_native (job-runner short-circuits).
export const VeoNativeVoicePlugin: VoiceProvider = {
  id: 'veo_native',
  name: 'Veo Native (embedded)',
  url: 'https://labs.google/flow',
  loginUrl: 'https://labs.google/flow',
  capabilities: {
    languages: ['vi', 'en'],
    voices: [{ id: 'default', name: 'Veo default', gender: 'neutral' }],
  },
  async generateVoice() {
    throw new Error('veo_native should not be invoked — voice is embedded in Veo video prompts');
  },
};

export default VeoNativeVoicePlugin;
