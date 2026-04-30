import type { Page } from 'playwright';
import type { ScriptProvider } from '@veo-farm/shared';
import { parseScriptOutput } from '../_helpers.js';

// TODO: VERIFY SELECTORS LIVE — gemini.google.com DOM changes frequently.
export const GeminiScriptPlugin: ScriptProvider = {
  id: 'gemini',
  name: 'Gemini (web)',
  url: 'https://gemini.google.com',
  loginUrl: 'https://gemini.google.com',

  async generateScript(input, ctx) {
    const page = ctx.page as Page;
    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    if (await page.getByText('Sign in', { exact: false }).first().isVisible({ timeout: 3000 }).catch(() => false)) {
      throw new Error('Account expired');
    }

    const prompt = `${input.systemPrompt}\n\nIDEA: ${input.idea}\n\nReturn ONLY valid JSON.`;
    const editor = page.locator('rich-textarea, [contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type(prompt, { delay: 5 });

    const sendBtn = page.locator('button[aria-label*="Send" i]').first();
    await sendBtn.click({ timeout: 10_000 });

    // Wait until "Stop" button disappears
    await page.waitForSelector('button[aria-label*="Stop" i]', { state: 'detached', timeout: 180_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const text = await page.locator('message-content, [data-message-id]').last().innerText();
    return parseScriptOutput(text);
  },
};

export default GeminiScriptPlugin;
