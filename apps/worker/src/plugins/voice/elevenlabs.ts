import type { Page } from 'playwright';
import type { VoiceProvider } from '@veo-farm/shared';
import { downloadFromUrl } from '../../core/storage.js';

// TODO: VERIFY SELECTORS LIVE — elevenlabs.io speech synthesis page.
export const ElevenLabsVoicePlugin: VoiceProvider = {
  id: 'elevenlabs',
  name: 'ElevenLabs',
  url: 'https://elevenlabs.io',
  loginUrl: 'https://elevenlabs.io/sign-in',
  capabilities: {
    languages: ['vi', 'en'],
    voices: [{ id: 'default', name: 'Default', gender: 'neutral' }],
  },

  async generateVoice(input, ctx) {
    const page = ctx.page as Page;
    const { uploadFile, logger } = ctx;

    await page.goto('https://elevenlabs.io/app/speech-synthesis', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (await page.getByText('Sign in', { exact: false }).first().isVisible({ timeout: 3000 }).catch(() => false)) {
      throw new Error('Account expired');
    }

    const textarea = page.locator('textarea').first();
    await textarea.fill(input.text);

    // Generate
    const genBtn = page.getByRole('button', { name: /generate/i }).first();
    await genBtn.click();
    logger.info('elevenlabs: submitted');

    // Wait for audio to appear
    const audio = page.locator('audio[src]').first();
    await audio.waitFor({ state: 'attached', timeout: 120_000 });
    const src = await audio.getAttribute('src');
    if (!src) throw new Error('No audio src');

    const buf = await downloadFromUrl(src);
    const url = await uploadFile(buf, 'mp3');
    // Duration unknown without ffprobe; estimate by text length (rough)
    return { audioUrl: url, durationSec: Math.max(2, input.text.length * 0.07) };
  },
};

export default ElevenLabsVoicePlugin;
