import type { Page } from 'playwright';
import type { ImageProvider } from '@veo-farm/shared';
import { downloadFromUrl } from '../../core/storage.js';

// TODO: VERIFY SELECTORS LIVE — replicate.com Flux model page.
export const FluxImagePlugin: ImageProvider = {
  id: 'flux',
  name: 'Flux (Replicate)',
  url: 'https://replicate.com',
  loginUrl: 'https://replicate.com/signin',
  capabilities: {
    supports_ref_image: true,
    supports_aspect_ratio: ['9:16', '16:9', '1:1'],
  },

  async generateImage(input, ctx) {
    const page = ctx.page as Page;
    const { uploadFile, logger } = ctx;

    // Default to flux-1.1-pro model page; user can swap model in node config later.
    await page.goto('https://replicate.com/black-forest-labs/flux-1.1-pro', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    if (await page.getByText('Sign in', { exact: false }).first().isVisible({ timeout: 3000 }).catch(() => false)) {
      throw new Error('Account expired');
    }

    // Fill prompt
    const promptArea = page.locator('textarea[name="prompt"], textarea[id="prompt"]').first();
    await promptArea.fill(input.prompt);

    // Aspect ratio
    const aspectSelect = page.locator('select[name="aspect_ratio"]').first();
    if (await aspectSelect.count()) {
      await aspectSelect.selectOption(input.aspectRatio);
    }

    // Submit
    await page.locator('button[type="submit"]:has-text("Run")').first().click({ timeout: 10_000 });
    logger.info('flux: submitted');

    // Wait for result image
    const img = page.locator('img[alt*="output" i], img[src*="replicate.delivery"]').first();
    await img.waitFor({ state: 'visible', timeout: 5 * 60_000 });
    const src = await img.getAttribute('src');
    if (!src) throw new Error('No image URL produced');

    const buf = await downloadFromUrl(src);
    const url = await uploadFile(buf, 'jpg');
    return { imageUrl: url, mimeType: 'image/jpeg', width: 768, height: 1344 };
  },
};

export default FluxImagePlugin;
