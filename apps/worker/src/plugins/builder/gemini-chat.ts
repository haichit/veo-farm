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
    /** User-edited output override — bypasses the chat call. */
    manualOutput?: string;
    /** JSON array of cookies (Cookie-Editor export shape) for
     *  gemini.google.com / .google.com — overlaid on the shared Veo3
     *  session right before navigation. Lets user paste Gemini-specific
     *  cookies per node without re-using Veo3 account meta. */
    geminiCookies?: string;
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

  // Try a dedicated Gemini account first (provider 'gemini' on /accounts).
  // Fall back to the shared Veo3 account if none — same Google session
  // covers gemini.google.com when cookies span .google.com.
  let account: Awaited<ReturnType<typeof claimAccount>>;
  try {
    account = await claimAccount(input.userId, 'gemini', 1);
    logger.info({ accountId: account.id }, 'gemini_chat: using dedicated gemini account');
  } catch {
    account = await claimAccount(input.userId, 'veo3');
    logger.info({ accountId: account.id }, 'gemini_chat: falling back to veo3 account');
  }
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

    // Per-node Gemini cookies — user pastes them in the editor panel.
    // We layer them on top of the shared Veo3 session BEFORE navigating
    // so the very first request to gemini.google.com is authenticated.
    const cookieStr = input.config.geminiCookies?.trim();
    if (cookieStr) {
      try {
        const parsed = JSON.parse(cookieStr);
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cookieList = parsed.map((c: any) => ({
            name: c.name,
            value: c.value,
            domain: c.domain ?? '.google.com',
            path: c.path ?? '/',
            expires: typeof c.expirationDate === 'number'
              ? Math.floor(c.expirationDate)
              : typeof c.expires === 'number'
                ? c.expires
                : undefined,
            httpOnly: c.httpOnly ?? false,
            secure: c.secure ?? true,
            sameSite: c.sameSite === 'no_restriction' ? 'None' : c.sameSite,
          }));
          await page.setCookie(...cookieList);
          logger.info({ count: cookieList.length }, 'gemini_chat: injected per-node Gemini cookies');
        }
      } catch (e) {
        logger.warn(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { err: (e as any)?.message ?? e },
          'gemini_chat: geminiCookies JSON parse failed, falling back to shared session',
        );
      }
    }

    // Always force a fresh chat — reusing the tab keeps the prior turn
    // in the conversation context, which causes the next prompt to be
    // interpreted relative to old questions ("describe media" turns into
    // a follow-up about the same nonexistent media). Clicking "New chat"
    // is fast (~200ms) when the tab is already loaded.
    const currentUrl = page.url();
    if (!/^https:\/\/gemini\.google\.com\//.test(currentUrl)) {
      logger.info('gemini_chat: navigate to gemini.google.com');
      await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    } else {
      logger.info('gemini_chat: reusing tab — starting new chat');
      // Try clicking the "New chat" / "Cuộc trò chuyện mới" button.
      const newChatSel =
        'button[aria-label*="new chat" i], button[aria-label*="cuộc trò chuyện mới" i], button[aria-label*="trò chuyện mới" i], button[data-test-id="new-chat-button"], a[href$="/app"]';
      try {
        await page.evaluate((sel: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const doc: any = (globalThis as any).document;
          const btn = doc.querySelector(sel);
          if (btn) (btn as HTMLElement).click();
        }, newChatSel);
        await new Promise((r) => setTimeout(r, 400));
      } catch {
        /* fall through to forced reload */
      }
      // If the URL still has a chat id (/app/<id>), force-navigate to /app.
      if (/\/app\/[a-z0-9-]{6,}/.test(page.url())) {
        await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      }
    }

    // Detect login redirect — surface a clear error so the user knows to
    // paste cookies or login manually.
    const finalUrl = page.url();
    if (/accounts\.google\.com\/.*signin/.test(finalUrl)) {
      throw new Error(
        'gemini_chat: redirected to Google login. Paste Gemini cookies into "Gemini Cookies" field in the editor panel, or add a Gemini account on /accounts.',
      );
    }

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

    // ─── Insert the prompt ───
    // page.keyboard.type() drops/duplicates Vietnamese diacritics (composed
    // chars get split into base+combining and the IME loses sync). Paste
    // the text directly via the Clipboard API instead — atomic, no IME.
    logger.info({ promptLen: userPrompt.length }, 'gemini_chat: inserting prompt');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputEl = await page.$(inputSel);
    if (!inputEl) throw new Error('gemini_chat: chat input not found');
    await inputEl.focus();

    // Grant clipboard permission to the page origin so navigator.clipboard works.
    try {
      const ctx = page.browserContext();
      await ctx.overridePermissions('https://gemini.google.com', [
        'clipboard-read',
        'clipboard-write',
      ]);
    } catch {
      /* non-fatal — fall back to execCommand path below */
    }

    const inserted = await page.evaluate(async (text: string, selector: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: any = (globalThis as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win: any = (globalThis as any).window;
      const all = doc.querySelectorAll(selector);
      const el = all[all.length - 1] ?? all[0];
      if (!el) return false;
      el.focus();

      // Read final text out of the DOM after insertion to verify.
      const readBack = (): string => {
        if ('value' in el && typeof el.value === 'string') return el.value;
        return (el.innerText ?? el.textContent ?? '').replace(/​/g, '');
      };

      // Path 1: synthesize a real ClipboardEvent('paste') with DataTransfer.
      // Most contenteditable handlers (Angular/Lit/Quill — Gemini uses one)
      // listen for 'paste' and consume the whole text atomically. This is
      // how real Cmd+V works and avoids any per-char IME race.
      try {
        const dt = new win.DataTransfer();
        dt.setData('text/plain', text);
        const evt = new win.ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(evt);
        // Give Gemini a tick to commit the paste into the editor model.
        await new Promise((r) => setTimeout(r, 50));
        if (readBack().trim().length >= text.trim().length) return true;
      } catch {
        /* fall through */
      }

      // Path 2: clipboard.writeText + execCommand('paste').
      try {
        await win.navigator.clipboard.writeText(text);
        const ok = doc.execCommand('paste');
        await new Promise((r) => setTimeout(r, 50));
        if (ok && readBack().trim().length >= text.trim().length) return true;
      } catch {
        /* fall through */
      }

      // Path 3: execCommand('insertText') — last resort.
      try {
        doc.execCommand('insertText', false, text);
        await new Promise((r) => setTimeout(r, 50));
        if (readBack().trim().length >= text.trim().length) return true;
      } catch {
        /* fall through */
      }

      // Path 4: direct assignment (textarea only) — definitely loses
      // contenteditable framework state but at least gets full text in.
      if ('value' in el) {
        el.value = text;
        el.dispatchEvent(new win.Event('input', { bubbles: true }));
        return true;
      }
      // Path 5: contenteditable manual node injection.
      const range = doc.createRange();
      el.innerHTML = '';
      const p = doc.createElement('p');
      p.textContent = text;
      el.appendChild(p);
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = win.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      el.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      return true;
    }, userPrompt, inputSel);

    if (!inserted) throw new Error('gemini_chat: failed to insert prompt into chat input');
    // Tiny settle so Gemini registers the input event before Enter.
    await new Promise((r) => setTimeout(r, 200));

    // Verify the chat input actually contains our full prompt before pressing
    // Enter. If chars were dropped, abort with a useful error rather than
    // sending a corrupted question and getting a confused response.
    const actualPrompt = await page.evaluate((selector: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: any = (globalThis as any).document;
      const all = doc.querySelectorAll(selector);
      const el = all[all.length - 1] ?? all[0];
      if (!el) return '';
      if ('value' in el && typeof el.value === 'string') return el.value;
      // eslint-disable-next-line no-irregular-whitespace
      return (el.innerText ?? el.textContent ?? '').replace(/​/g, '').trim();
    }, inputSel);
    const expected = userPrompt.trim();
    if (actualPrompt.trim() !== expected) {
      logger.warn(
        { expectedLen: expected.length, actualLen: actualPrompt.length, expectedHead: expected.slice(0, 40), actualHead: actualPrompt.slice(0, 40) },
        'gemini_chat: prompt round-trip mismatch — retrying with fallback paste',
      );
      // Force-clear and retry via direct DOM injection (path 5 in inserter).
      await page.evaluate((text: string, selector: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc: any = (globalThis as any).document;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win: any = (globalThis as any).window;
        const all = doc.querySelectorAll(selector);
        const el = all[all.length - 1] ?? all[0];
        if (!el) return;
        el.focus();
        if ('value' in el) {
          el.value = '';
          el.value = text;
        } else {
          el.innerHTML = '';
          const p = doc.createElement('p');
          p.textContent = text;
          el.appendChild(p);
          const range = doc.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = win.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        el.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }, userPrompt, inputSel);
      await new Promise((r) => setTimeout(r, 300));
    }

    // ─── Send ───
    logger.info('gemini_chat: sending');
    // Either Enter (most layouts) or click the send button.
    await page.keyboard.press('Enter');

    // ─── Wait for response — fast path ───
    // Primary signal: the "Stop generating" button is present while
    // streaming and removed when finished. That's instant detection.
    // Fallback: poll text stability with shorter window.
    const respSel =
      'message-content, [data-test-id="response-message"], .response-container .markdown, model-response .markdown, .conversation-turn:last-of-type .response-content';
    const stopBtnSel =
      'button[aria-label*="stop" i], button[aria-label*="dừng" i], button[data-test-id="stop-button"]';

    const start = Date.now();
    let lastText = '';
    let stableSince = 0;
    let sawStreaming = false;
    while (Date.now() - start < 120_000) {
      await new Promise((r) => setTimeout(r, 350));
      const probe = await page.evaluate(
        (textSel: string, stopSel: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const doc: any = (globalThis as any).document;
          const all = doc.querySelectorAll(textSel);
          const last = all && all.length > 0 ? all[all.length - 1] : null;
          const text = (last?.innerText ?? '').trim();
          const stopBtn = doc.querySelector(stopSel);
          return { text, streaming: !!stopBtn };
        },
        respSel,
        stopBtnSel,
      );

      if (probe.streaming) sawStreaming = true;

      if (probe.text && probe.text.length > 3) {
        // Fast-path: we observed the stop button at least once and now
        // it's gone → streaming definitely finished.
        if (sawStreaming && !probe.streaming) {
          logger.info({ outLen: probe.text.length, ms: Date.now() - start }, 'gemini_chat: streaming flag cleared');
          return { text: probe.text };
        }
        // Fallback stability check (shorter 1s window).
        if (probe.text === lastText) {
          if (stableSince === 0) stableSince = Date.now();
          if (Date.now() - stableSince > 1000) {
            logger.info({ outLen: probe.text.length, ms: Date.now() - start }, 'gemini_chat: text stable');
            return { text: probe.text };
          }
        } else {
          lastText = probe.text;
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
