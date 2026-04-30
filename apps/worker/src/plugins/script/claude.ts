import type { Page } from 'playwright';
import type { ScriptProvider } from '@veo-farm/shared';
import { parseScriptOutput } from '../_helpers.js';

// claude.ai selectors as of 2026-04. DOM is more stable than ChatGPT but still changes.
export const ClaudeScriptPlugin: ScriptProvider = {
  id: 'claude',
  name: 'Claude (web)',
  url: 'https://claude.ai',
  loginUrl: 'https://claude.ai',

  async generateScript(input, ctx) {
    const page = ctx.page as Page;
    const { logger } = ctx;

    await page.goto('https://claude.ai/new', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Cloudflare challenge handling — wait up to 90s for auto-pass.
    const cfStart = Date.now();
    while (Date.now() - cfStart < 90_000) {
      const title = await page.title().catch(() => '');
      const hasChallenge =
        /just a moment|đang xác minh|verifying|cloudflare/i.test(title) ||
        (await page.locator('text=/xác minh bảo mật|verify you are human|checking your browser/i').first().isVisible({ timeout: 500 }).catch(() => false));
      if (!hasChallenge) break;
      logger.info('claude: cloudflare challenge active, waiting...', { title });
      await page.waitForTimeout(3000);
    }

    // Login check
    const loginVisible = await page
      .getByText(/Continue with|Sign in/i)
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (loginVisible) throw new Error('Account expired - cookies invalid, need re-login');

    const fullPrompt = `${input.systemPrompt}\n\nIDEA: ${input.idea}\n\nReturn ONLY a single valid JSON object matching the schema. No commentary, no markdown fence.`;

    // Find prompt input — Claude uses ProseMirror contenteditable
    const editor = page
      .locator('[data-testid="chat-input"], div[contenteditable="true"][role="textbox"], div[contenteditable="true"].ProseMirror')
      .first();
    try {
      await editor.waitFor({ state: 'attached', timeout: 60_000 });
    } catch (e) {
      try {
        await page.screenshot({ path: '/tmp/claude-debug.png', fullPage: true });
        const html = await page.content();
        const fs = await import('node:fs');
        fs.writeFileSync('/tmp/claude-debug.html', html);
        const url = page.url();
        logger.error('claude: editor not found — debug saved', { url });
      } catch {}
      throw new Error(`claude: editor not found (see /tmp/claude-debug.{png,html}, url=${page.url()})`);
    }
    // Editor is usually pre-focused (ProseMirror-focused class). Try click but don't fail hard.
    try {
      await editor.scrollIntoViewIfNeeded({ timeout: 3000 });
      await editor.click({ force: true, timeout: 8000 });
    } catch {
      logger.warn('claude: click failed, will type assuming editor is focused');
    }
    await page.waitForTimeout(300);

    // Type prompt with Shift+Enter for newlines
    const lines = fullPrompt.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.type(lines[i], { delay: 1 });
      if (i < lines.length - 1) await page.keyboard.press('Shift+Enter');
    }
    logger.info('claude: prompt typed', { lines: lines.length });

    // Submit — Claude has aria-label "Send message" or button with paper-plane icon
    const sendCandidates = [
      'button[aria-label="Send message"]',
      'button[aria-label*="Send" i]',
      'button[type="submit"]:near(div[contenteditable="true"])',
      'fieldset button[type="button"]:has(svg)',
    ];
    let clicked = false;
    for (const sel of sendCandidates) {
      try {
        const btn = page.locator(sel).first();
        await btn.waitFor({ state: 'attached', timeout: 5000 });
        await btn.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        await btn.click({ timeout: 5000, force: true });
        clicked = true;
        logger.info(`claude: clicked send via "${sel}"`);
        break;
      } catch { /* try next */ }
    }
    if (!clicked) {
      logger.warn('claude: no send button found, pressing Enter');
      await page.keyboard.press('Enter');
    }

    // Wait for response. Claude's assistant message is typically in `.font-claude-message` or
    // `[data-is-streaming]` or `div[data-test-render-count]`.
    logger.info('claude: waiting for response to stabilize');
    const responseSelectors = [
      'div.font-claude-message',
      'div[data-is-streaming]',
      'div[data-test-render-count]',
      'div.prose:not(:has(div[contenteditable="true"]))',
    ];

    let prevLen = -1;
    let stableTicks = 0;
    const start = Date.now();
    const maxWait = 240_000;
    let text = '';
    let activeSel = '';

    while (Date.now() - start < maxWait) {
      await page.waitForTimeout(2000);

      // Check if streaming finished by looking at data-is-streaming="false"
      const stillStreaming = await page.locator('[data-is-streaming="true"]').count().catch(() => 0);
      let candidateText = '';
      let candidateSel = '';
      for (const sel of responseSelectors) {
        try {
          const t = await page.locator(sel).last().innerText({ timeout: 1500 });
          if (t && t.length > candidateText.length) {
            candidateText = t;
            candidateSel = sel;
          }
        } catch { /* try next */ }
      }
      if (candidateText.length > text.length) {
        text = candidateText;
        activeSel = candidateSel;
      }
      // Require: length unchanged + not streaming + text ends with } or ] (complete JSON).
      const trimmed = text.trim();
      const looksClosed = trimmed.endsWith('}') || trimmed.endsWith(']') || trimmed.endsWith('```');
      if (text.length > 0 && text.length === prevLen && !stillStreaming && looksClosed) {
        stableTicks++;
        if (stableTicks >= 3) break; // 6s of no change + closed shape
      } else {
        stableTicks = 0;
      }
      prevLen = text.length;
    }
    logger.info('claude: response stable', { len: text.length, sel: activeSel, preview: text.slice(0, 200) });

    if (!text) {
      try {
        await page.screenshot({ path: '/tmp/claude-debug.png', fullPage: true });
        const html = await page.content();
        const fs = await import('node:fs');
        fs.writeFileSync('/tmp/claude-debug.html', html);
        logger.error('claude: empty response — debug saved to /tmp/claude-debug.{png,html}');
      } catch (e) {
        logger.warn('claude: debug save failed', { err: String(e) });
      }
      throw new Error('claude: empty response (selector miss — see /tmp/claude-debug.html)');
    }

    try {
      return parseScriptOutput(text);
    } catch (e: any) {
      try {
        const fs = await import('node:fs');
        fs.writeFileSync('/tmp/claude-raw.txt', text);
      } catch {}
      logger.error('claude: JSON parse failed', { rawHead: text.slice(0, 500), rawTail: text.slice(-300) });
      throw new Error(`JSON parse failed: ${e?.message ?? e} (raw saved to /tmp/claude-raw.txt)`);
    }
  },
};

export default ClaudeScriptPlugin;
