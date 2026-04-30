// Token Manager — Puppeteer + Stealth.
// Launches Brave/Chrome with the captcha extension loaded, intercepts Bearer tokens
// from labs.google → aisandbox-pa.googleapis.com requests, and exposes them to the API client.
// Reference: SPEC_REPLICA_BACKEND.md section 18.9.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore — puppeteer-extra has loose types
import puppeteerExtra from 'puppeteer-extra';
// @ts-ignore — stealth plugin types are loose
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page, CDPSession } from 'puppeteer-core';
import { CaptchaBridge } from './captcha-bridge.js';
import { LABS_BASE } from './constants.js';

puppeteerExtra.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AccountAuth {
  accountId: string;
  email?: string;
  cookies?: any[];
  projectId?: string;
}

export interface LaunchOptions {
  headless?: boolean;
  chromeExecutablePath?: string;
  userDataDir?: string;
  captchaServerUrl?: string;
}

export class TokenManager {
  public _browser: Browser | null = null;
  public _page: Page | null = null;
  public _cdp: CDPSession | null = null;

  private _captchaBridge: CaptchaBridge;
  private _bearerToken: string | null = null;
  private _account: AccountAuth;

  constructor(account: AccountAuth, captchaServerUrl = 'http://127.0.0.1:3456') {
    this._account = account;
    this._captchaBridge = new CaptchaBridge(captchaServerUrl);
  }

  /**
   * Launch a Chrome/Brave instance with the captcha extension loaded.
   * Headless=false by default — extensions don't load in headless: 'new'.
   */
  async launch(opts: LaunchOptions = {}): Promise<void> {
    const extPath = path.resolve(__dirname, '../captcha-server/extension');

    const args = [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      `--load-extension=${extPath}`,
      `--disable-extensions-except=${extPath}`,
    ];

    const launchOpts: any = {
      headless: opts.headless ?? false,
      args,
      defaultViewport: { width: 1280, height: 800 },
    };
    if (opts.chromeExecutablePath) launchOpts.executablePath = opts.chromeExecutablePath;
    if (opts.userDataDir) launchOpts.userDataDir = opts.userDataDir;

    this._browser = (await puppeteerExtra.launch(launchOpts)) as Browser;

    const pages = await this._browser.pages();
    this._page = pages.length > 0 ? pages[0] : await this._browser.newPage();
    this._cdp = await (this._page as any).target().createCDPSession();

    // Inject cookies if provided (works with launchPersistentContext too).
    if (this._account.cookies?.length) {
      try {
        await this._page.setCookie(...this._account.cookies);
      } catch (e) {
        console.warn('[TokenManager] setCookie failed (non-fatal)', String(e));
      }
    }

    this._attachTokenInterceptor();

    await this._page.goto(`${LABS_BASE}/fx/vi/tools/flow`, {
      waitUntil: 'networkidle2',
      timeout: 90_000,
    });

    // Best-effort wait for the Flow app shell. Adjust selector if/when DOM changes.
    await this._page
      .waitForSelector(
        '[data-testid="flow-app"], [aria-label*="user"], textarea, [contenteditable="true"]',
        { timeout: 60_000 },
      )
      .catch(() => {});
  }

  private _attachTokenInterceptor() {
    if (!this._page) return;
    this._page.on('request', (req) => {
      const headers = req.headers();
      const auth = headers['authorization'] ?? headers['Authorization'];
      if (auth && auth.startsWith('Bearer ') && req.url().includes('aisandbox-pa.googleapis.com')) {
        this._bearerToken = auth.slice(7);
      }
    });
  }

  /**
   * Returns a fresh Bearer token. If none captured yet, trigger a UI interaction
   * that causes the SPA to make an authenticated XHR.
   */
  async getToken(): Promise<string> {
    if (this._bearerToken) return this._bearerToken;
    if (!this._page) throw new Error('TokenManager not launched');

    // Try to provoke an authenticated request — clicking the user menu often
    // refreshes the session check XHR. Falls back to a no-op evaluate.
    try {
      await this._page.evaluate(() => {
        const d = (globalThis as any).document;
        if (!d) return;
        const candidates = [
          '[data-testid="user-menu"]',
          'button[aria-label*="account" i]',
          'header button',
        ];
        for (const sel of candidates) {
          const el = d.querySelector(sel);
          if (el && typeof el.click === 'function') {
            el.click();
            return;
          }
        }
      });
    } catch {
      // ignore
    }

    // Wait up to 15s for a request to populate the token.
    const start = Date.now();
    while (Date.now() - start < 15_000) {
      if (this._bearerToken) return this._bearerToken;
      await sleep(500);
    }
    throw new Error('Failed to extract Bearer token from labs.google requests');
  }

  async getRecaptchaToken(action: string): Promise<string> {
    return this._captchaBridge.getToken(action);
  }

  async _rotateRecaptchaSession(reason: string): Promise<void> {
    console.warn(`[TokenManager] Rotating session: ${reason}`);
    await this._captchaBridge.forceRefresh();
    // Wait for extension client to reconnect after page reload.
    await sleep(8000);
    this._bearerToken = null;
  }

  async exportCookies(): Promise<any[]> {
    if (!this._page) return [];
    return this._page.cookies();
  }

  async close(): Promise<void> {
    try {
      await this._cdp?.detach();
    } catch {
      // ignore
    }
    await this._browser?.close().catch(() => {});
    this._browser = null;
    this._page = null;
    this._cdp = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
