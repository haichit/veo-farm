import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Browser, BrowserContext, Page } from 'playwright';
// @ts-ignore — playwright-extra has loose types
import { chromium as chromiumExtra } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromiumExtra.use(StealthPlugin());
const chromium = chromiumExtra;
import type { Cookie } from '@veo-farm/shared';
import { logger } from './logger.js';

// Providers needing persistent profile (Google OAuth flows): cookies-only auth fails for labs.google etc.
const PERSISTENT_PROVIDERS = new Set(['gemini', 'veo3']);

const PROFILES_DIR = process.env.WORKER_PROFILES_DIR ?? join(homedir(), '.veo-farm-profiles');

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser) return _browser;
  const headless = process.env.WORKER_PLAYWRIGHT_HEADLESS !== 'false';
  try {
    _browser = await chromium.launch({
      headless,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    logger.info('playwright: using real Chrome (channel=chrome)');
  } catch (e) {
    logger.warn({ err: String(e) }, 'playwright: real Chrome unavailable, using bundled chromium');
    _browser = await chromium.launch({
      headless,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }
  return _browser;
}

function toPlaywrightCookies(cookies: Cookie[]) {
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    expires: c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
  }));
}

export async function withPage<T>(
  account: { id: string; provider_id: string },
  cookies: Cookie[],
  fn: (page: Page, ctx: BrowserContext) => Promise<T>,
): Promise<T> {
  if (PERSISTENT_PROVIDERS.has(account.provider_id)) {
    return withPersistentPage(account, cookies, fn);
  }
  return withSharedBrowserPage(cookies, fn);
}

async function withSharedBrowserPage<T>(
  cookies: Cookie[],
  fn: (page: Page, ctx: BrowserContext) => Promise<T>,
): Promise<T> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addCookies(toPlaywrightCookies(cookies) as any);
  const page = await ctx.newPage();
  try {
    return await fn(page, ctx);
  } finally {
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
}

async function withPersistentPage<T>(
  account: { id: string; provider_id: string },
  cookies: Cookie[],
  fn: (page: Page, ctx: BrowserContext) => Promise<T>,
): Promise<T> {
  const userDataDir = join(PROFILES_DIR, `${account.provider_id}-${account.id}`);
  mkdirSync(userDataDir, { recursive: true });

  const headless = process.env.WORKER_PLAYWRIGHT_HEADLESS !== 'false';
  logger.info({ provider: account.provider_id, userDataDir, headless }, 'playwright: launching persistent context');

  let ctx: BrowserContext;
  try {
    ctx = await chromium.launchPersistentContext(userDataDir, {
      headless,
      channel: 'chrome',
      viewport: { width: 1440, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
  } catch (e) {
    logger.warn({ err: String(e) }, 'persistent: real Chrome unavailable, fallback bundled chromium');
    ctx = await chromium.launchPersistentContext(userDataDir, {
      headless,
      viewport: { width: 1440, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }

  // Seed cookies in case the profile is fresh / missing.
  try {
    await ctx.addCookies(toPlaywrightCookies(cookies) as any);
  } catch (e) {
    logger.warn({ err: String(e) }, 'persistent: cookie seeding failed (non-fatal)');
  }

  const pages = ctx.pages();
  const page = pages.length > 0 ? pages[0] : await ctx.newPage();

  try {
    return await fn(page, ctx);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function shutdownBrowser() {
  if (_browser) {
    await _browser.close().catch((e) => logger.warn({ err: e }, 'browser close error'));
    _browser = null;
  }
}
