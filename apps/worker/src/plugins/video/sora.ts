import type { Page } from 'playwright';
import type { VideoProvider } from '@veo-farm/shared';
import { downloadFromUrl } from '../../core/storage.js';

/**
 * Sora plugin (DOM scrape via chatgpt.com/sora).
 *
 * Status: SCAFFOLD. Requires:
 * - ChatGPT Pro account (Sora available in Pro+)
 * - Tested selectors (TODO before production use)
 *
 * Architecture: same Playwright + cookies pattern as veo3_legacy. Sora outputs
 * 5-20s clips per generation; we reuse the existing scenes loop in job-runner
 * (one Sora call per scene, refImageUrl supported as image upload).
 */
export const SoraVideoPlugin: VideoProvider = {
  id: 'sora',
  name: 'Sora (chatgpt.com)',
  url: 'https://sora.com',
  loginUrl: 'https://sora.com/library',
  capabilities: {
    max_duration_sec: 20,
    supports_image_ref: true,
    supports_voice_in_prompt: false,
    aspect_ratios: ['9:16', '16:9', '1:1'],
  },

  async generateVideo(input, ctx) {
    const page = ctx.page as Page;
    const { uploadFile, logger } = ctx;

    await page.goto('https://sora.com/explore', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    if (
      await page
        .getByText(/sign in|log in/i)
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      throw new Error('Sora account expired or not logged in');
    }

    // TODO: replace these selectors with real ones from a logged-in Sora session.
    // The placeholders below mirror the Veo flow shape so the rest of the
    // pipeline works as soon as DOM is mapped.
    throw new Error(
      'Sora plugin scaffold: DOM selectors not mapped yet. ' +
        'Open https://sora.com with a logged-in account and capture the create-prompt + result-video selectors before enabling.',
    );

    // eslint-disable-next-line no-unreachable
    void downloadFromUrl;
    void input;
    void uploadFile;
    void logger;
  },
};
