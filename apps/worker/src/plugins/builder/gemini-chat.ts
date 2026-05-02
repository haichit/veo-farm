// Builder Canvas — gemini_chat node executor.
// Free unlimited usage of Gemini via gemini.google.com chat UI driven by
// puppeteer through the Sprint 7B cookies pool (same Google account that
// runs Veo3). No API key, no quota.
//
// Caveat: brittle by nature — Google updates Gemini UI frequently, so
// selectors here will need touch-ups over time. We log the page HTML to
// /tmp/gemini-chat-debug-{ts}.html when scraping fails so we can adapt.

import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { acquireTokenManager, dropTokenManager } from '../../_veo3_helpers/browser-pool.js';
import { claimAccount, releaseAccount, decryptCookies } from '../../core/account-pool.js';
import { downloadFromUrl } from '../../core/storage.js';
import { logger } from '../../core/logger.js';

const GEMINI_URL = 'https://gemini.google.com/app';

export interface GeminiChatInput {
  /** Resolved upstream text prompt. */
  text: string;
  /** Optional image / video URLs to upload alongside the prompt. */
  mediaUrls: Array<{ url: string; kind: 'image' | 'video' }>;
  config: {
    promptTemplate?: string;
    /** User-edited override — bypasses the chat call. */
    manualOutput?: string;
  };
  /** Owner — used to claim the right cookies account. */
  userId: string;
}

export interface GeminiChatOutput {
  text: string;
}

export async function runGeminiChatNode(input: GeminiChatInput): Promise<GeminiChatOutput> {
  const override = input.config.manualOutput?.trim();
  if (override) {
    logger.info({ len: override.length }, 'gemini_chat: using manual override');
    return { text: override };
  }

  const tmpl = input.config.promptTemplate?.trim() || 'Mô tả chi tiết nội dung trong media này.';
  const userPrompt = tmpl.includes('{{text}}')
    ? tmpl.replace(/\{\{text\}\}/g, input.text ?? '')
    : (tmpl + (input.text ? `\n\n${input.text}` : '')).trim();
  if (!userPrompt) {
    throw new Error('gemini_chat: prompt rỗng (cả template lẫn upstream text đều trống)');
  }

  const account = await claimAccount(input.userId, 'veo3');
  const cookies = decryptCookies(account);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (account.meta ?? {}) as Record<string, any>;
  const projectId = (meta.projectId as string | undefined) ?? undefined;

  const puppeteerCookies = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: typeof c.expires === 'number' ? c.expires : undefined,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
  }));

  logger.info({ accountId: account.id }, 'gemini_chat: acquiring browser');
  const lease = await acquireTokenManager({
    accountId: account.id,
    email: account.label,
    cookies: puppeteerCookies,
    projectId,
  });

  let leaseHeld = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = (lease.tm as any)._page;
    if (!page) throw new Error('gemini_chat: no browser page available');

    // Navigate to gemini.google.com — cookies are already injected on the
    // shared Brave instance (Veo3 + Gemini share *.google.com session).
    logger.info('gemini_chat: navigate to gemini.google.com');
    await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });

    // Wait for the chat input to mount. Selectors covered: contenteditable
    // div with role=textbox, textarea, rich-textarea custom element.
    const inputSel = 'rich-textarea div[contenteditable="true"], div[contenteditable="true"][role="textbox"], textarea';
    await page.waitForSelector(inputSel, { timeout: 60_000 });

    // ─── Optional file uploads ───
    // Files attach via the + menu → file input. We probe for any file input
    // on the page and call setInputFiles. Works for image and small video.
    if (input.mediaUrls && input.mediaUrls.length > 0) {
      logger.info({ count: input.mediaUrls.length }, 'gemini_chat: attaching media');
      // Click the "+" attach button so the hidden file input mounts.
      const plusBtnSel =
        'button[aria-label*="upload" i], button[aria-label*="attach" i], button[aria-label*="thêm" i], button[data-test-id="upload-trigger"]';
      try {
        await page.click(plusBtnSel, { timeout: 5000 });
      } catch {
        // Some layouts have the input always present — fall through.
      }
      const fileInputSel = 'input[type="file"]';
      await page.waitForSelector(fileInputSel, { timeout: 10_000 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inputElems = await page.$$(fileInputSel);
      const fileInput = inputElems[inputElems.length - 1] ?? inputElems[0];

      // Download every media URL to /tmp and feed to setInputFiles.
      const tmpFiles: string[] = [];
      for (const m of input.mediaUrls) {
        const buf = await downloadFromUrl(m.url);
        const ext = m.kind === 'video' ? 'mp4' : 'png';
        const f = path.join('/tmp', `gemini-chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`);
        writeFileSync(f, buf);
        tmpFiles.push(f);
      }
      await fileInput.uploadFile(...tmpFiles);
      // Wait for upload progress to finish — heuristic: spinner gone.
      await new Promise((r) => setTimeout(r, 6000));
    }

    // ─── Type the prompt ───
    logger.info('gemini_chat: typing prompt');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputEl = await page.$(inputSel);
    if (!inputEl) throw new Error('gemini_chat: chat input not found');
    await inputEl.focus();
    await page.keyboard.type(userPrompt, { delay: 5 });

    // ─── Send ───
    logger.info('gemini_chat: sending');
    // Either Enter (most layouts) or click the send button.
    await page.keyboard.press('Enter');

    // ─── Wait for response ───
    // Heuristic: poll the latest model-response container for stable text
    // (no change for >2s = streaming finished).
    const respSel =
      'message-content, [data-test-id="response-message"], .response-container .markdown, model-response .markdown, .conversation-turn:last-of-type .response-content';

    const start = Date.now();
    let lastText = '';
    let stableSince = 0;
    while (Date.now() - start < 120_000) {
      await new Promise((r) => setTimeout(r, 1000));
      const t = await page.evaluate((sel: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const all = (globalThis as any).document.querySelectorAll(sel);
        if (!all || all.length === 0) return '';
        const last = all[all.length - 1];
        return (last?.innerText ?? '').trim();
      }, respSel);
      if (t && t.length > 5) {
        if (t === lastText) {
          if (stableSince === 0) stableSince = Date.now();
          if (Date.now() - stableSince > 2500) {
            logger.info({ outLen: t.length }, 'gemini_chat: response stable, returning');
            return { text: t };
          }
        } else {
          lastText = t;
          stableSince = 0;
        }
      }
    }
    // No stable response — dump page for debugging then throw.
    try {
      const html = await page.content();
      const debugFile = `/tmp/gemini-chat-debug-${Date.now()}.html`;
      writeFileSync(debugFile, html);
      logger.warn({ debugFile }, 'gemini_chat: response did not stabilise — DOM dumped');
    } catch {
      /* ignore */
    }
    throw new Error('gemini_chat: response did not arrive within 120s — Gemini UI may have changed');
  } catch (err) {
    if (leaseHeld) {
      lease.release();
      leaseHeld = false;
    }
    // Drop the slot so next call cold-starts (page state may be corrupt).
    await dropTokenManager(account.id);
    await releaseAccount(account.id, 0, 'idle');
    throw err;
  } finally {
    if (leaseHeld) {
      lease.release();
      await releaseAccount(account.id, 0, 'idle');
    }
  }
}
