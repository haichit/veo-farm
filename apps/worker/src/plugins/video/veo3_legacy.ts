import type { Page } from 'playwright';
import type { VideoProvider } from '@veo-farm/shared';
import { downloadFromUrl } from '../../core/storage.js';

// LEGACY Playwright plugin — kept as fallback. Primary is veo3_flow_v2.
// TODO: VERIFY SELECTORS LIVE — labs.google/flow DOM. This is the most fragile plugin.
export const Veo3VideoPlugin: VideoProvider = {
  id: 'veo3_legacy',
  name: 'Veo 3 Legacy (Playwright)',
  url: 'https://labs.google/flow',
  loginUrl: 'https://labs.google/flow',
  capabilities: {
    max_duration_sec: 8,
    supports_image_ref: true,
    supports_voice_in_prompt: true,
    aspect_ratios: ['9:16', '16:9', '1:1'],
  },

  async generateVideo(input, ctx) {
    const page = ctx.page as Page;
    const { uploadFile, logger } = ctx;

    await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (await page.getByText('Sign in', { exact: false }).first().isVisible({ timeout: 3000 }).catch(() => false)) {
      throw new Error('Account expired');
    }

    // Click "New project" or similar — TODO verify
    const newProjBtn = page.getByRole('button', { name: /new project|create/i }).first();
    if (await newProjBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newProjBtn.click();
    }

    // Optional: upload reference image
    if (input.refImageUrl) {
      try {
        const buf = await downloadFromUrl(input.refImageUrl);
        const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
        const uploadBtn = page.getByRole('button', { name: /upload|image/i }).first();
        await uploadBtn.click();
        const chooser = await fileChooserPromise;
        await chooser.setFiles({ name: 'ref.jpg', mimeType: 'image/jpeg', buffer: buf });
        await page.waitForTimeout(2000);
      } catch (e) {
        logger.warn('veo3: ref image upload failed, continuing without', { err: String(e) });
      }
    }

    // Fill prompt
    let fullPrompt = input.prompt;
    if (input.voiceScript) {
      fullPrompt += `\n\nVoiceover (Vietnamese): "${input.voiceScript}"`;
    }
    const textarea = page.locator('textarea').first();
    await textarea.fill(fullPrompt);

    // Submit / Generate
    const generateBtn = page.getByRole('button', { name: /generate|create video/i }).first();
    await generateBtn.click();
    logger.info('veo3: submitted, waiting up to 10min');

    // Wait for video element with src
    const video = page.locator('video[src]').first();
    await video.waitFor({ state: 'attached', timeout: 10 * 60_000 });
    const src = await video.getAttribute('src');
    if (!src) throw new Error('Veo: no video src');

    const buf = await downloadFromUrl(src);
    const url = await uploadFile(buf, 'mp4');
    return { videoUrl: url, durationSec: input.durationSec, hasAudio: !!input.voiceScript };
  },
};

export default Veo3VideoPlugin;
