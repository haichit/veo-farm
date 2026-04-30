import type { Page } from 'playwright';
import type { ImageProvider } from '@veo-farm/shared';
import { downloadFromUrl } from '../../core/storage.js';

// Image generation via Google Flow (labs.google/fx/tools/flow) using Nano Banana model.
// Requires Google AI Ultra subscription. Same account as Veo 3.
export const GeminiImagePlugin: ImageProvider = {
  id: 'gemini',
  name: 'Nano Banana (Google Flow)',
  url: 'https://labs.google/fx/tools/flow',
  loginUrl: 'https://labs.google/fx/tools/flow',
  capabilities: {
    supports_ref_image: true,
    supports_aspect_ratio: ['9:16', '16:9', '1:1'],
  },

  async generateImage(input, ctx) {
    const page = ctx.page as Page;
    const { uploadFile, logger } = ctx;

    // Warm up Google session on gemini.google.com first (cookies tied there).
    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2000);
    if (page.url().includes('accounts.google.com')) {
      throw new Error('Account expired - gemini.google.com requires signin');
    }

    // Now navigate to Flow.
    await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3000);
    if (page.url().includes('accounts.google.com')) {
      try {
        await page.screenshot({ path: '/tmp/flow-image-debug.png', fullPage: true });
      } catch {}
      throw new Error(`flow: redirect to ${page.url().slice(0, 80)} — cookies don't cover labs.google`);
    }

    // Wait for Flow UI to load.
    await page.waitForTimeout(3000);

    // Try to start a new project if needed
    try {
      const newProjBtn = page.getByRole('button', { name: /new project|create|start/i }).first();
      if (await newProjBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await newProjBtn.click();
        await page.waitForTimeout(2000);
      }
    } catch { /* skip */ }

    // Select Nano Banana model if model dropdown shows. Look for the model picker chip near textarea.
    try {
      const modelBtn = page.locator('button:has-text("Nano Banana"), button:has-text("Veo")').first();
      if (await modelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        const txt = (await modelBtn.innerText()).toLowerCase();
        if (!txt.includes('nano banana')) {
          await modelBtn.click();
          await page.waitForTimeout(800);
          const item = page.locator('[role="menuitem"]:has-text("Nano Banana"), [role="option"]:has-text("Nano Banana")').first();
          if (await item.isVisible({ timeout: 2000 }).catch(() => false)) {
            await item.click();
            logger.info('flow: selected Nano Banana model');
            await page.waitForTimeout(500);
          } else {
            await page.keyboard.press('Escape');
          }
        }
      }
    } catch (e) {
      logger.warn('flow: model select skipped', { err: String(e) });
    }

    // Optional: upload reference image first.
    if (input.refImageUrl) {
      try {
        const buf = await downloadFromUrl(input.refImageUrl);
        const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 8000 });
        // The "+" button next to the prompt textarea opens upload menu.
        await page.locator('button:has(svg)[aria-label*="add" i], button:has(svg)[aria-label*="attach" i]').first().click({ timeout: 3000 });
        const chooser = await fileChooserPromise;
        await chooser.setFiles({ name: 'ref.jpg', mimeType: 'image/jpeg', buffer: buf });
        await page.waitForTimeout(2000);
      } catch (e) {
        logger.warn('flow: ref upload failed, continuing', { err: String(e) });
      }
    }

    // Type prompt into the textarea.
    const editor = page.locator('textarea, [contenteditable="true"]').first();
    await editor.waitFor({ state: 'attached', timeout: 30_000 });
    await editor.click({ force: true, timeout: 5000 }).catch(() => {});
    await page.keyboard.type(input.prompt, { delay: 1 });
    logger.info('flow: prompt typed');

    // Submit — arrow button.
    const sendCandidates = [
      'button[aria-label*="submit" i]',
      'button[aria-label*="send" i]',
      'button[aria-label*="generate" i]',
      'button[type="submit"]',
      'button:has(svg[data-icon="arrow"])',
    ];
    let submitted = false;
    for (const sel of sendCandidates) {
      try {
        const btn = page.locator(sel).first();
        await btn.waitFor({ state: 'attached', timeout: 3000 });
        await btn.click({ force: true, timeout: 3000 });
        submitted = true;
        logger.info(`flow: submitted via "${sel}"`);
        break;
      } catch { /* try next */ }
    }
    if (!submitted) {
      logger.warn('flow: no submit button found, pressing Enter');
      await page.keyboard.press('Enter');
    }

    // Wait for generated image to appear in the canvas area.
    logger.info('flow: waiting for generated image...');
    const start = Date.now();
    const maxWait = 5 * 60_000;
    let src: string | null = null;
    while (Date.now() - start < maxWait) {
      await page.waitForTimeout(2000);
      const imgs = await page.locator('img').all();
      for (const img of imgs.reverse()) {
        try {
          const s = await img.getAttribute('src');
          if (!s) continue;
          // Skip avatars (s32, s64, s96 etc)
          if (/=s\d+-c/.test(s) && !s.startsWith('data:') && !s.startsWith('blob:')) continue;
          if (s.includes('avatar') || s.includes('profile')) continue;
          // Require visible large image
          const dims = await img.evaluate((el: any) => ({ w: el.naturalWidth, h: el.naturalHeight }));
          if (dims.w < 400 || dims.h < 400) continue;
          src = s;
          break;
        } catch { /* skip */ }
      }
      if (src) break;
    }
    if (!src) {
      try {
        await page.screenshot({ path: '/tmp/flow-image-debug.png', fullPage: true });
        const html = await page.content();
        const fs = await import('node:fs');
        fs.writeFileSync('/tmp/flow-image-debug.html', html);
      } catch {}
      throw new Error('flow-image: no generated image found within 5min');
    }
    await page.waitForTimeout(1000);

    let buf: Buffer;
    if (src.startsWith('data:image')) {
      const m = src.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (!m) throw new Error('flow: bad data URL');
      buf = Buffer.from(m[1], 'base64');
    } else if (src.startsWith('blob:')) {
      // Fetch via page context
      buf = await page.evaluate(async (url) => {
        const r = await fetch(url);
        const b = await r.arrayBuffer();
        return Array.from(new Uint8Array(b));
      }, src).then((arr) => Buffer.from(arr as number[]));
    } else {
      buf = await downloadFromUrl(src);
    }

    const url = await uploadFile(buf, 'png');
    return { imageUrl: url, mimeType: 'image/png', width: 1024, height: 1792 };
  },
};

export default GeminiImagePlugin;
