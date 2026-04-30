import type { Page } from 'playwright';
import type { ScriptProvider } from '@veo-farm/shared';
import { parseScriptOutput } from '../_helpers.js';

// TODO: VERIFY SELECTORS LIVE — chatgpt.com DOM changes frequently.
// First-run flow: open chatgpt.com with cookies, inspect DOM, update selectors below.
export const ChatGPTScriptPlugin: ScriptProvider = {
  id: 'chatgpt',
  name: 'ChatGPT (web)',
  url: 'https://chatgpt.com',
  loginUrl: 'https://chatgpt.com',

  async generateScript(input, ctx) {
    const page = ctx.page as Page;
    const { logger } = ctx;

    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Login check — adjust selector if needed
    const loginVisible = await page
      .getByText('Log in', { exact: true })
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (loginVisible) throw new Error('Account expired - cookies invalid, need re-login');

    // Switch to a fast (non-thinking) model to avoid 5+ min waits.
    try {
      await page.locator('[data-testid="model-switcher-dropdown-button"]').first().click({ timeout: 5000 });
      await page.waitForTimeout(1000);
      const items = await page.getByRole('menuitem').all();
      const labels: string[] = [];
      for (const it of items) {
        const t = await it.innerText().catch(() => '');
        if (t) labels.push(t.replace(/\s+/g, ' ').trim());
      }
      logger.info('chatgpt: model menu items', { labels });

      // Try to find a fast model option — patterns ordered by preference.
      const fastNames = [
        /Instant/i,
        /^Auto/i,
        /^GPT-?5\b(?!.*Thinking)/i,
        /^GPT-?4o\b(?!.*mini)/i,
        /^GPT-?4o\s*mini\b/i,
      ];
      let switched = false;
      for (const re of fastNames) {
        const item = page.getByRole('menuitem').filter({ hasText: re }).first();
        if (await item.isVisible({ timeout: 1500 }).catch(() => false)) {
          await item.click();
          switched = true;
          logger.info('chatgpt: switched model', { match: re.source });
          break;
        }
      }
      if (!switched) {
        await page.keyboard.press('Escape');
        logger.warn('chatgpt: no fast model match — using current default');
      }
      await page.waitForTimeout(500);
    } catch (e) {
      logger.warn('chatgpt: model switch failed, continuing', { err: String(e) });
    }

    const fullPrompt = `${input.systemPrompt}\n\nIDEA: ${input.idea}\n\nReturn ONLY a single valid JSON object matching the schema. No commentary, no markdown fence.`;

    // Find prompt input — try several selectors (ChatGPT DOM varies).
    const editor = page
      .locator('#prompt-textarea, div[contenteditable="true"][data-virtualkeyboard="true"], div.ProseMirror[contenteditable="true"], textarea[placeholder*="Message" i]')
      .first();
    await editor.waitFor({ state: 'visible', timeout: 30_000 });
    await editor.click();
    // Type prompt — use Shift+Enter for newlines so ChatGPT doesn't submit prematurely.
    const lines = fullPrompt.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.type(lines[i], { delay: 1 });
      if (i < lines.length - 1) await page.keyboard.press('Shift+Enter');
    }
    logger.info('chatgpt: prompt typed', { lines: lines.length });

    // Submit — try several selectors. ChatGPT button is `#composer-submit-button` with data-testid="send-button".
    const sendCandidates = [
      '#composer-submit-button',
      'button[data-testid="send-button"]',
      'button[data-testid="composer-send-button"]',
      'button[aria-label*="Send prompt" i]',
      'button[aria-label*="Send message" i]',
      'button[aria-label*="Gửi" i]', // Vietnamese
      'button[aria-label="Send" i]',
    ];
    let clicked = false;
    for (const sel of sendCandidates) {
      try {
        const btn = page.locator(sel).first();
        await btn.waitFor({ state: 'attached', timeout: 5000 });
        await btn.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        await btn.click({ timeout: 5000, force: true });
        clicked = true;
        logger.info(`chatgpt: clicked send via "${sel}"`);
        break;
      } catch {
        // try next
      }
    }
    if (!clicked) {
      logger.warn('chatgpt: no send button found, pressing Enter as fallback');
      await page.keyboard.press('Enter');
    }

    // Wait until response stops streaming. Poll innerText length until stable.
    // Try multiple selectors for assistant message.
    logger.info('chatgpt: waiting for response to stabilize');
    const responseSelectors = [
      '[data-message-author-role="assistant"]',
      'article[data-testid^="conversation-turn"]:has([data-message-author-role="assistant"])',
      'div[data-message-id]:has(.markdown)',
      'div.markdown.prose',
      'article:has(.markdown)',
    ];

    let prevLen = -1;
    let stableTicks = 0;
    const start = Date.now();
    const maxWait = 600_000;
    let text = '';
    let activeSel = '';
    while (Date.now() - start < maxWait) {
      await page.waitForTimeout(2000);
      for (const sel of responseSelectors) {
        try {
          const loc = page.locator(sel).last();
          const t = await loc.innerText({ timeout: 1500 });
          if (t && t.length > text.length) {
            text = t;
            activeSel = sel;
          }
        } catch { /* try next */ }
      }
      if (text.length > 0 && text.length === prevLen) {
        stableTicks++;
        if (stableTicks >= 2) break;
      } else {
        stableTicks = 0;
      }
      prevLen = text.length;
    }
    logger.info('chatgpt: response stable', { len: text.length, sel: activeSel, preview: text.slice(0, 200) });

    if (!text) {
      // Save screenshot + HTML for debugging
      try {
        await page.screenshot({ path: '/tmp/chatgpt-debug.png', fullPage: true });
        const html = await page.content();
        const fs = await import('node:fs');
        fs.writeFileSync('/tmp/chatgpt-debug.html', html);
        logger.error('chatgpt: empty response — debug saved to /tmp/chatgpt-debug.{png,html}');
      } catch (e) {
        logger.warn('chatgpt: debug save failed', { err: String(e) });
      }
      throw new Error('chatgpt: empty response (selector miss — see /tmp/chatgpt-debug.html)');
    }

    try {
      return parseScriptOutput(text);
    } catch (e: any) {
      logger.error('chatgpt: JSON parse failed', { rawHead: text.slice(0, 500), rawTail: text.slice(-300) });
      throw new Error(`JSON parse failed: ${e?.message ?? e}`);
    }
  },
};

export default ChatGPTScriptPlugin;
