import type { Page } from 'playwright';
import type { ImageProvider } from '@veo-farm/shared';
import { downloadFromUrl } from '../../core/storage.js';

// TODO: VERIFY SELECTORS LIVE — chatgpt.com image generation flow.
export const DallEImagePlugin: ImageProvider = {
  id: 'dalle',
  name: 'DALL-E (ChatGPT)',
  url: 'https://chatgpt.com',
  loginUrl: 'https://chatgpt.com',
  capabilities: {
    supports_ref_image: false,
    supports_aspect_ratio: ['9:16', '16:9', '1:1'],
  },

  async generateImage(input, ctx) {
    const page = ctx.page as Page;
    const { uploadFile } = ctx;

    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (await page.getByText('Log in', { exact: true }).first().isVisible({ timeout: 3000 }).catch(() => false)) {
      throw new Error('Account expired');
    }

    const aspect = input.aspectRatio === '9:16' ? 'portrait 1024x1792' : input.aspectRatio === '16:9' ? 'landscape 1792x1024' : 'square 1024x1024';
    const prompt = `Generate an image: ${input.prompt}. Aspect: ${aspect}.`;

    const textarea = page.locator('#prompt-textarea').first();
    await textarea.click();
    await page.keyboard.type(prompt, { delay: 5 });
    await page.locator('[data-testid="send-button"]').first().click();

    await page.waitForSelector('[data-testid="stop-button"]', { state: 'detached', timeout: 240_000 });

    // Find generated image element in last message
    const img = page.locator('[data-message-author-role="assistant"]').last().locator('img').first();
    await img.waitFor({ state: 'visible', timeout: 30_000 });
    const src = await img.getAttribute('src');
    if (!src) throw new Error('No image src');

    const buf = await downloadFromUrl(src.startsWith('http') ? src : `https://chatgpt.com${src}`);
    const url = await uploadFile(buf, 'png');
    return { imageUrl: url, mimeType: 'image/png', width: 1024, height: 1792 };
  },
};

export default DallEImagePlugin;
