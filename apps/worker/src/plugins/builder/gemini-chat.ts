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

  const tmpl = input.config.promptTemplate?.trim() ?? '';
  const upstream = (input.text ?? '').trim();
  let userPrompt: string;
  if (tmpl && tmpl.includes('{{text}}')) {
    userPrompt = tmpl.replace(/\{\{text\}\}/g, upstream);
  } else if (tmpl) {
    userPrompt = upstream ? `${tmpl}\n\n${upstream}` : tmpl;
  } else {
    userPrompt = upstream;
  }
  userPrompt = userPrompt.trim();
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
    // BEFORE setting new cookies, clear stale .google.com cookies from the
    // Brave profile. Otherwise Brave reads expired session cookies from
    // disk and they take precedence on the first request to gemini.google.com,
    // landing us on the login page even when the user just pasted fresh
    // cookies.
    const cookieStr = input.config.geminiCookies?.trim();
    if (cookieStr) {
      try {
        const parsed = JSON.parse(cookieStr);
        if (Array.isArray(parsed)) {
          // Wipe existing google.com cookies first (CDP Network.clearBrowserCookies
          // is too aggressive — drops Veo3 too. Use deleteCookie per current cookie
          // matching .google.com).
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existing = await (page as any).cookies('https://gemini.google.com', 'https://accounts.google.com');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const c of existing as any[]) {
              if (typeof c.domain === 'string' && c.domain.includes('google.com')) {
                try {
                  await page.deleteCookie({ name: c.name, domain: c.domain, path: c.path });
                } catch { /* ignore individual failures */ }
              }
            }
            logger.info({ cleared: (existing as any[]).length }, 'gemini_chat: cleared stale google.com cookies');
          } catch (e) {
            logger.warn(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { err: (e as any)?.message ?? e },
              'gemini_chat: clearing stale cookies failed (continuing)',
            );
          }

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
          // Sanity log: which auth-critical cookies we now have.
          const names = cookieList.map((c: { name: string }) => c.name);
          const hasSession =
            names.includes('SAPISID') ||
            names.includes('__Secure-1PSID') ||
            names.includes('__Secure-3PSID') ||
            names.includes('SID');
          logger.info(
            { count: cookieList.length, hasSession, sample: names.slice(0, 8) },
            'gemini_chat: injected per-node Gemini cookies',
          );
          if (!hasSession) {
            logger.warn(
              'gemini_chat: pasted cookies missing session keys (SAPISID / __Secure-1PSID / SID). Re-export khi login gemini.google.com active tab.',
            );
          }
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
    // Gemini's file input is mounted lazily behind a "+" menu. UI keeps
    // changing so we cast a wide net: try multiple "plus / attach" buttons,
    // then click any "Upload file / Tải tệp" menu item if a popup opened,
    // and finally fall through to looking for an existing input[type=file].
    if (input.mediaUrls && input.mediaUrls.length > 0) {
      logger.info({ count: input.mediaUrls.length }, 'gemini_chat: attaching media');

      // Verify the page actually finished loading before probing the DOM.
      // Critical: prefer waiting for the UPLOAD button specifically, with
      // a longer timeout. The sign-in button is sometimes rendered briefly
      // as a splash before the authed shell takes over — relying on either-
      // or matching here causes false-positive "logged out" failures.
      try {
        await page.waitForFunction(
          () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const doc: any = (globalThis as any).document;
            return !!(
              doc.querySelector('button[aria-controls="upload-file-menu"]') ||
              doc.querySelector('button.upload-card-button') ||
              doc.querySelector('button[aria-label*="upload" i]') ||
              doc.querySelector('input[type="file"]')
            );
          },
          { timeout: 25_000 },
        );
      } catch {
        // Upload button never showed up — likely truly logged out, but
        // double-check below before throwing.
      }

      // Detect logged-out state — only after the page has had a chance to
      // load. Re-check by url too: a real logout redirects to accounts.google.com.
      const url = page.url();
      const isLoggedOut = /accounts\.google\.com\/.*signin/i.test(url) ||
        /accounts\.google\.com\/.*ServiceLogin/i.test(url) ||
        await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc: any = (globalThis as any).document;
        // Only treat as logged-out when the sign-in CTA is the dominant
        // affordance AND we don't see any authed-only element. Authed
        // gemini.google.com renders the chat composer (rich-textarea) and
        // the sidebar — if either is present, the user IS logged in.
        const hasComposer = !!(
          doc.querySelector('rich-textarea div[contenteditable="true"]') ||
          doc.querySelector('div[contenteditable="true"][role="textbox"]') ||
          doc.querySelector('side-nav-menu-button')
        );
        if (hasComposer) return false;
        return !!(
          doc.querySelector('button.sign-in-button') ||
          doc.querySelector('a[href*="ServiceLogin"]')
        );
      });
      if (isLoggedOut) {
        throw new Error(
          'gemini_chat: Gemini chưa login (page có nút "Sign in"). Cookies hết hạn — vào /accounts cập nhật lại cookies cho account loại "gemini" hoặc "veo3", hoặc paste cookies mới vào field "Gemini Cookies" trong node.',
        );
      }

      const fileInputSel = 'input[type="file"]';
      // If file input already mounted, skip menu navigation.
      let inputAlreadyThere = false;
      try {
        const existing = await page.$(fileInputSel);
        inputAlreadyThere = !!existing;
      } catch { /* ignore */ }

      if (!inputAlreadyThere) {
        // Step 1: click the upload button via real mouse event (Angular
        // Material listens to pointerdown/pointerup, NOT synthetic .click()).
        // Selector chain — confirmed by DOM dump 2026-05-03: aria-label
        // "Open upload file menu" + aria-controls="upload-file-menu".
        const plusBtnSelectors = [
          'button[aria-controls="upload-file-menu"]',
          'button.upload-card-button',
          'button[aria-label="Open upload file menu"]',
          'button[aria-label*="upload" i]',
          'button[aria-label*="attach" i]',
          'button[aria-label*="thêm" i]',
          'button[aria-label*="đính kèm" i]',
          'button[aria-label*="tải" i]',
          'button[data-test-id="upload-trigger"]',
        ];
        let clickedSel = '';
        for (const sel of plusBtnSelectors) {
          try {
            const btn = await page.$(sel);
            if (btn) {
              await btn.click({ delay: 50 });
              clickedSel = sel;
              break;
            }
          } catch { /* try next */ }
        }
        logger.info({ clickedSel }, 'gemini_chat: plus button click result');

        if (!clickedSel) {
          // Most likely cause: Gemini is in logged-out state (cookies stale)
          // and the upload button doesn't exist on the unauthenticated page.
          // Detect that explicitly and surface a useful error.
          const loggedOut = await page.evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const doc: any = (globalThis as any).document;
            const signInBtn =
              doc.querySelector('[aria-label*="sign in" i]') ||
              doc.querySelector('button.sign-in-button') ||
              [...doc.querySelectorAll('a, button')].find((el: HTMLElement) =>
                /\bsign in\b|\bđăng nhập\b/i.test(el.innerText || ''),
              );
            return !!signInBtn;
          });
          if (loggedOut) {
            throw new Error(
              'gemini_chat: Gemini chưa login (page có nút "Sign in"). Cookies hết hạn — vào /accounts cập nhật lại cookies cho account loại "gemini" hoặc "veo3", hoặc paste cookies mới vào field "Gemini Cookies" trong node.',
            );
          }
          // Dump current DOM so we can update selectors without re-running.
          try {
            const html = await page.content();
            const debugFile = `/tmp/gemini-chat-upload-debug-${Date.now()}.html`;
            writeFileSync(debugFile, html);
            // Also dump every button's aria-label / class / text — easier to scan.
            const btnList = await page.evaluate(() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const doc: any = (globalThis as any).document;
              return [...doc.querySelectorAll('button')]
                .filter((b: HTMLButtonElement) => {
                  const rect = b.getBoundingClientRect();
                  return rect.width > 0 && rect.height > 0;
                })
                .slice(0, 40)
                .map((b: HTMLButtonElement) => ({
                  aria: b.getAttribute('aria-label'),
                  cls: b.className.slice(0, 80),
                  controls: b.getAttribute('aria-controls'),
                  text: (b.innerText || '').trim().slice(0, 30),
                }));
            });
            const btnFile = `/tmp/gemini-chat-buttons-${Date.now()}.json`;
            writeFileSync(btnFile, JSON.stringify(btnList, null, 2));
            logger.warn(
              { debugFile, btnFile, count: btnList.length },
              'gemini_chat: upload button not matched — DOM + buttons dumped',
            );
          } catch { /* ignore */ }
          throw new Error(
            'gemini_chat: không tìm thấy nút upload trên Gemini UI. Đã dump DOM vào /tmp/gemini-chat-upload-debug-*.html và /tmp/gemini-chat-buttons-*.json.',
          );
        }

        // Step 2: wait for the menu to open. The button toggles
        // aria-expanded="true" when its mat-menu materialises.
        try {
          await page.waitForFunction(
            (sel: string) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const doc: any = (globalThis as any).document;
              const b = doc.querySelector(sel);
              return b && b.getAttribute('aria-expanded') === 'true';
            },
            { timeout: 4000 },
            clickedSel,
          );
        } catch { /* fall through — menu may have opened without aria flag */ }
        await new Promise((r) => setTimeout(r, 300));

        // Step 3: prepare files on disk + intercept the native file picker.
        // Gemini's "Upload files" menu item triggers an OS-level file dialog
        // (NOT a hidden input.setInputFiles). Puppeteer can hook this with
        // page.waitForFileChooser BEFORE the click — when the menu fires
        // the picker, the chooser handle becomes available and we feed our
        // pre-downloaded files into it programmatically. No native dialog
        // ever surfaces to the user.

        // Download the upstream media URLs to /tmp first so they're ready
        // to pass into the chooser the moment it opens.
        const tmpFiles: string[] = [];
        for (const m of input.mediaUrls) {
          const buf = await downloadFromUrl(m.url);
          const ext = m.kind === 'video' ? 'mp4' : 'png';
          const f = path.join(
            '/tmp',
            `gemini-chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`,
          );
          writeFileSync(f, buf);
          tmpFiles.push(f);
        }
        logger.info({ files: tmpFiles.length }, 'gemini_chat: media downloaded, opening file chooser');

        // Race: wait for either the chooser OR the file input to appear.
        // Whichever comes first determines the upload path.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chooserPromise = (page as any).waitForFileChooser({ timeout: 12_000 }).catch(() => null);
        const inputPromise = page
          .waitForSelector(fileInputSel, { timeout: 12_000 })
          .catch(() => null);

        // Click the menu item AFTER the chooser listener is attached.
        try {
          const exactSel = '[data-test-id="local-images-files-uploader-button"]';
          const exact = await page.$(exactSel);
          if (exact) {
            await exact.click({ delay: 50 });
            logger.info({ via: 'data-test-id' }, 'gemini_chat: upload menu item clicked');
          } else {
            // Fallback: click any menu item carrying the attach_file icon
            // or matching the upload-files label.
            const menuItemKeywords = [
              'upload files', 'upload file', 'tải tệp lên', 'tải lên tệp',
              'tải tệp', 'tệp từ thiết bị', 'from this device', 'từ thiết bị',
            ];
            const skipKeywords = ['drive', 'photos', 'ảnh google', 'ảnh từ', 'youtube'];
            const menuClicked = await page.evaluate(
              (keywords: string[], skips: string[]) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const doc: any = (globalThis as any).document;
                const candidates: HTMLElement[] = [
                  ...doc.querySelectorAll(
                    '[role="menuitem"], [mat-menu-item], button[role="menuitem"], .mat-mdc-menu-item, .mat-menu-item, [mat-list-item]',
                  ),
                ] as HTMLElement[];
                for (const el of candidates) {
                  if (el.querySelector('[fonticon="attach_file"]')) {
                    el.click();
                    return 'icon:attach_file';
                  }
                  const text = (el.innerText || el.textContent || '').toLowerCase().trim();
                  if (!text) continue;
                  if (skips.some((s) => text.includes(s))) continue;
                  if (keywords.some((k) => text.includes(k))) {
                    el.click();
                    return text.slice(0, 50);
                  }
                }
                return null;
              },
              menuItemKeywords,
              skipKeywords,
            );
            logger.info({ menuClicked }, 'gemini_chat: upload menu item (fallback)');
          }
        } catch { /* ignore */ }

        // Race: chooser usually wins for Gemini's current UI.
        const [chooser, inputHandle] = await Promise.all([chooserPromise, inputPromise]);
        if (chooser) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (chooser as any).accept(tmpFiles);
          logger.info({ files: tmpFiles.length }, 'gemini_chat: files fed to native file chooser');
        } else if (inputHandle) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (inputHandle as any).uploadFile(...tmpFiles);
          logger.info({ files: tmpFiles.length }, 'gemini_chat: files attached via input element');
        } else {
          // Neither path materialised — dump and throw.
          try {
            const html = await page.content();
            const debugFile = `/tmp/gemini-chat-upload-debug-${Date.now()}.html`;
            writeFileSync(debugFile, html);
            logger.warn({ debugFile }, 'gemini_chat: chooser/input never appeared — DOM dumped');
          } catch { /* ignore */ }
          throw new Error(
            'gemini_chat: Upload files menu không trigger được file chooser. Có thể do Gemini UI thay đổi — tạm dùng node Gemini Vision (API) thay thế.',
          );
        }
      } else {
        // Pre-existing input[type=file] in DOM — direct upload path.
        const tmpFiles: string[] = [];
        for (const m of input.mediaUrls) {
          const buf = await downloadFromUrl(m.url);
          const ext = m.kind === 'video' ? 'mp4' : 'png';
          const f = path.join('/tmp', `gemini-chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`);
          writeFileSync(f, buf);
          tmpFiles.push(f);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inputElems = await page.$$(fileInputSel);
        const fileInput = inputElems[inputElems.length - 1] ?? inputElems[0];
        await fileInput.uploadFile(...tmpFiles);
        logger.info({ files: tmpFiles.length }, 'gemini_chat: files attached via existing input');
      }

      // Wait for Gemini's upload progress to settle (server-side processing).
      await new Promise((r) => setTimeout(r, 6000));
    }

    // ─── Dismiss any pre-existing starter prompt / suggestion chips ───
    // Gemini's empty-state shows a list of clickable suggestion chips (and
    // sometimes a banner) — clicking outside or pressing Escape doesn't
    // remove them, but they don't actually populate the input until clicked.
    // What we DO need to defend against: a stale draft in the input from
    // a previous run. Hard-clear it.
    await page.evaluate((selector: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: any = (globalThis as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win: any = (globalThis as any).window;
      const all = doc.querySelectorAll(selector);
      const el = all[all.length - 1] ?? all[0];
      if (!el) return;
      el.focus();
      if ('value' in el) el.value = '';
      else { while (el.firstChild) el.removeChild(el.firstChild); }
      el.dispatchEvent(new win.Event('input', { bubbles: true }));
    }, inputSel);

    // ─── Insert the prompt via CDP Input.insertText ───
    // This is the ONLY method that's atomic and IME-safe across all editor
    // frameworks (Angular/Lit/contenteditable). It sends an IME-commit-style
    // text input event directly to the focused element — same path real
    // keyboard composition uses, no per-char race, no DataTransfer mocking.
    // page.keyboard.type drops Vietnamese diacritics; execCommand and
    // ClipboardEvent paths are inconsistent across Gemini's editor versions.
    logger.info({ promptLen: userPrompt.length }, 'gemini_chat: inserting prompt via CDP');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputEl = await page.$(inputSel);
    if (!inputEl) throw new Error('gemini_chat: chat input not found');
    await inputEl.focus();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cdpClient: any = await (page.target() as any).createCDPSession();
    try {
      await cdpClient.send('Input.insertText', { text: userPrompt });
    } finally {
      try { await cdpClient.detach(); } catch { /* ignore */ }
    }
    await new Promise((r) => setTimeout(r, 250));

    // Verify the chat input actually contains our full prompt. If CDP
    // insertText was rejected (rare — happens when focus shifted), retry
    // once via direct DOM injection.
    const readActual = async (): Promise<string> =>
      await page.evaluate((selector: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc: any = (globalThis as any).document;
        const all = doc.querySelectorAll(selector);
        const el = all[all.length - 1] ?? all[0];
        if (!el) return '';
        if ('value' in el && typeof el.value === 'string') return el.value;
        // eslint-disable-next-line no-irregular-whitespace
        return (el.innerText ?? el.textContent ?? '').replace(/​/g, '');
      }, inputSel);

    let actualPrompt = (await readActual()).trim();
    const expected = userPrompt.trim();
    if (actualPrompt !== expected) {
      logger.warn(
        { expectedLen: expected.length, actualLen: actualPrompt.length, expectedHead: expected.slice(0, 60), actualHead: actualPrompt.slice(0, 60) },
        'gemini_chat: CDP insertText round-trip mismatch — retrying via DOM injection',
      );
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
          el.value = text;
        } else {
          while (el.firstChild) el.removeChild(el.firstChild);
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
      actualPrompt = (await readActual()).trim();
      if (actualPrompt !== expected) {
        logger.error(
          { expectedLen: expected.length, actualLen: actualPrompt.length, actualHead: actualPrompt.slice(0, 80) },
          'gemini_chat: prompt insertion failed even after fallback',
        );
        throw new Error('gemini_chat: failed to insert full prompt into chat input');
      }
    }
    logger.info({ len: expected.length }, 'gemini_chat: prompt verified in input');

    // ─── Send ───
    logger.info('gemini_chat: sending');
    // Try Enter first (works for most layouts). If after 2s the "stop"
    // streaming button hasn't appeared, fall back to clicking the send
    // button — the textarea may be in multi-line mode where Enter inserts
    // a newline instead of submitting.
    await page.keyboard.press('Enter');

    const sendBtnSel =
      'button[aria-label*="send" i], button[aria-label*="gửi" i], button[data-test-id="send-button"], button[mattooltip*="send" i]';
    const stopBtnSel =
      'button[aria-label*="stop" i], button[aria-label*="dừng" i], button[data-test-id="stop-button"]';

    await new Promise((r) => setTimeout(r, 2000));
    const streamingStarted = await page.evaluate((sel: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: any = (globalThis as any).document;
      return !!doc.querySelector(sel);
    }, stopBtnSel);
    if (!streamingStarted) {
      logger.info('gemini_chat: Enter did not submit, clicking send button');
      const clicked = await page.evaluate((sel: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc: any = (globalThis as any).document;
        const candidates = Array.from(doc.querySelectorAll(sel)) as HTMLElement[];
        // Pick the first enabled button.
        for (const b of candidates) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!(b as any).disabled && b.offsetParent !== null) {
            b.click();
            return true;
          }
        }
        return false;
      }, sendBtnSel);
      logger.info({ clicked }, 'gemini_chat: send button click result');
    }

    // ─── Wait for response — fast path ───
    // Primary signal: the "Stop generating" button is present while
    // streaming and removed when finished. That's instant detection.
    // Fallback: poll text stability with shorter window.
    const respSel =
      'message-content, [data-test-id="response-message"], .response-container .markdown, model-response .markdown, .conversation-turn:last-of-type .response-content';

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
