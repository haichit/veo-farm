# Veo Farm — Backend Replica Spec (Section 18)

**Source:** Reverse-engineered từ commercial tool VEO3 Flow Automation v1.5.0 (Vietnamese, Electron, ~380MB installer). Tool đã ship production v1.5.0, pattern + endpoints đã **verified work thật**.

**Status:** Replaces section 16 of SPEC.md (Veo 3 HTTP plugin). Section 16 chưa verified — dùng file này làm ground truth.

---

## 18.1 Endpoints CHÍNH XÁC (verified)

```
HOST:        https://aisandbox-pa.googleapis.com
LABS HOST:   https://labs.google
STORAGE:     https://storage.googleapis.com/ai-sandbox-videofx/

VIDEO GENERATE (4 endpoints theo mode):
  POST /v1/video:batchAsyncGenerateVideoText             ← t2v: text-to-video
  POST /v1/video:batchAsyncGenerateVideoStartImage       ← i2v: image-to-video (1 frame ref)
  POST /v1/video:batchAsyncGenerateVideoReferenceImages  ← r2v: reference-to-video (CONSISTENCY mode!)
  POST /v1/video:batchAsyncGenerateVideoStartAndEndImage ← f2v: first + last frame

POLLING:
  POST /v1/video:batchCheckAsyncVideoGenerationStatus

UPLOAD:
  POST /v1/flow/uploadImage                              ← upload reference image, return mediaId

IMAGE GEN:
  POST /flowMedia:batchGenerateImages                    ← gen ảnh storyboard

LABS (separate):
  GET  /fx/api/auth/session
  POST /fx/api/trpc/project.createProject
  GET  /fx/api/trpc/media.getMediaUrlRedirect?name=...

CHECK:
  GET  /v1:checkAppAvailability
```

## 18.2 Constants (hardcoded, public)

```typescript
export const API_BASE = "https://aisandbox-pa.googleapis.com";
export const LABS_BASE = "https://labs.google";
export const API_KEY = "AIzaSyBtrm0o5ab1c-Ec8ZuLcGt3oJAA5VWt3pY";       // Web app key (public)
export const RECAPTCHA_SITE_KEY = "6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV";
export const TOOL_NAME = "PINHOLE";   // Internal Flow name
export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
```

## 18.3 Headers CHÍNH XÁC

```typescript
{
  Authorization: `Bearer ${oauthToken}`,
  "Content-Type": "text/plain;charset=UTF-8",      // ⚠️ KHÔNG phải application/json
  Origin: "https://labs.google",
  Referer: "https://labs.google/fx/vi/tools/flow",
  "User-Agent": USER_AGENT,
  "sec-ch-ua": `"Not;A Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"`,
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": `"Windows"`
}
```

## 18.4 Request body shape (verified payload)

```typescript
interface GenerateVideoRequest {
  mediaGenerationContext: {
    batchId: string;                            // crypto.randomUUID()
    audioFailurePreference?: "BLOCK_SILENCED_VIDEOS";
  };
  clientContext: {
    projectId: string;                          // UUID, từ ensureProject()
    tool: "PINHOLE";
    userPaygateTier: "PAYGATE_TIER_TWO";        // hoặc TIER_ONE/THREE/FREE
    sessionId: string;                          // ";" + Date.now()
    recaptchaContext: {
      token: string;                            // reCAPTCHA v3 Enterprise token
      applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB";
    };
  };
  requests: Array<{
    aspectRatio: "VIDEO_ASPECT_RATIO_LANDSCAPE" | "VIDEO_ASPECT_RATIO_PORTRAIT";
    seed: number;
    textInput: { structuredPrompt: { parts: [{text: string}] } };
    videoModelKey: string;
    metadata: {};
    referenceImages?: Array<{ mediaId: string; imageUsageType: "IMAGE_USAGE_TYPE_ASSET" }>;
    referenceAudio?: Array<{ mediaId: string }>;
    startImage?: { mediaId: string; cropCoordinates: {top:0, left:0, bottom:1, right:1} };
    endImage?: { mediaId: string; cropCoordinates: {top:0, left:0, bottom:1, right:1} };
  }>;
  useV2ModelConfig: true;
}
```

## 18.5 Video Model Keys (15+ variants)

```typescript
export const VIDEO_MODEL_KEYS = {
  veo_3_1_lite: {
    t2v: { default: "veo_3_1_t2v_lite" },
    i2v: { default: "veo_3_1_i2v_lite" },
    f2v: { default: "veo_3_1_i2v_s_lite_fl" }
  },
  veo_3_1_fast: {
    t2v: {
      landscape_advanced: "veo_3_1_t2v_fast_ultra",
      portrait_advanced: "veo_3_1_t2v_fast_portrait_ultra",
      landscape: "veo_3_1_t2v_fast",
      portrait: "veo_3_1_t2v_fast_portrait"
    },
    i2v: {
      landscape_advanced: "veo_3_1_i2v_s_fast_ultra",
      portrait_advanced: "veo_3_1_i2v_s_fast_portrait_ultra",
      landscape: "veo_3_1_i2v_s_fast",
      portrait: "veo_3_1_i2v_s_fast_portrait"
    },
    f2v: {
      landscape_advanced: "veo_3_1_i2v_s_fast_ultra_fl",
      portrait_advanced: "veo_3_1_i2v_s_fast_portrait_ultra_fl",
      landscape: "veo_3_1_i2v_s_fast_fl",
      portrait: "veo_3_1_i2v_s_fast_portrait_fl"
    },
    r2v: {
      landscape_advanced: "veo_3_1_r2v_fast_landscape_ultra",
      portrait_advanced: "veo_3_1_r2v_fast_portrait_ultra",
      landscape: "veo_3_1_r2v_fast_landscape",
      portrait: "veo_3_1_r2v_fast_portrait"
    }
  },
  veo_3_1_quality: {
    t2v: { landscape: "veo_3_1_t2v", portrait: "veo_3_1_t2v_portrait" },
    i2v: { landscape: "veo_3_1_i2v_s", portrait: "veo_3_1_i2v_s_portrait" }
  }
  // _low_priority variants ('relaxed' suffix) cho free tier
};

export const IMAGE_MODELS = {
  nano_banana_pro: "GEM_PIX_2",      // Gemini 3 Pro Image
  nano_banana_2: "NARWHAL",          // Gemini 2.5 Pro Image
  imagen_4: "IMAGEN_3_5",
  imagen_4_ref: "R2I",
  upsample_2k: "GEM_PIX_2_UPSAMPLE_2K",
  upsample_4k: "GEM_PIX_2_UPSAMPLE_4K"
};

export const VIDEO_ASPECT_RATIOS = {
  "16:9": "VIDEO_ASPECT_RATIO_LANDSCAPE",
  "9:16": "VIDEO_ASPECT_RATIO_PORTRAIT"
};

export const IMAGE_ASPECT_RATIOS = {
  "16:9": "IMAGE_ASPECT_RATIO_LANDSCAPE",
  "9:16": "IMAGE_ASPECT_RATIO_PORTRAIT",
  "1:1": "IMAGE_ASPECT_RATIO_SQUARE",
  "4:3": "IMAGE_ASPECT_RATIO_LANDSCAPE_4_3",
  "3:4": "IMAGE_ASPECT_RATIO_PORTRAIT_3_4"
};
```

## 18.6 Architecture clone — File layout

```
apps/worker/src/
├── plugins/video/
│   ├── _interface.ts
│   ├── veo3.ts                       (OLD Playwright — keep as fallback)
│   └── veo3_flow_v2.ts               ⭐ NEW primary plugin
│
├── _veo3_helpers/
│   ├── api-client.ts                 (~600 lines, clone api_client.js)
│   ├── token-manager.ts              (~300 lines, Puppeteer login + token extraction)
│   ├── captcha-bridge.ts             (~80 lines, HTTP client → captcha-server local)
│   ├── cdp-downloader.ts             (~150 lines, video download via Chrome DevTools Protocol)
│   ├── flow-types.ts                 (TypeScript types)
│   └── constants.ts                  (Constants from 18.2 + 18.5)
│
├── captcha-server/
│   ├── server.ts                     (~250 lines, Express + Socket.IO replica)
│   ├── README.md
│   └── extension/                    ⭐ Chrome extension (replica)
│       ├── manifest.json
│       ├── background.js
│       ├── content.js
│       ├── injected.js
│       ├── socket.io.min.js          (vendor copy)
│       ├── popup.html
│       ├── popup.js
│       └── popup.css
│
├── core/
│   └── concurrency.ts                (Semaphore + RateLimiter)
```

## 18.7 New dependencies (worker)

```bash
cd apps/worker
pnpm add puppeteer-core puppeteer-extra puppeteer-extra-plugin-stealth \
        got-scraping got express socket.io \
        @types/express @types/node
```

## 18.8 `api-client.ts` (skeleton, ~600 lines clean TypeScript)

```typescript
// apps/worker/src/_veo3_helpers/api-client.ts
import { EventEmitter } from "events";
import { gotScraping } from "got-scraping";
import * as crypto from "crypto";
import {
  API_BASE, LABS_BASE, TOOL_NAME, USER_AGENT,
  VIDEO_MODEL_KEYS, VIDEO_ASPECT_RATIOS
} from "./constants";
import type { TokenManager } from "./token-manager";
import type { GenerateVideoRequest, CheckStatusResponse, UploadImageResponse } from "./flow-types";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 600_000;
const RETRY_MAX = 3;

const POLICY_KEYWORDS = [
  "SAFETY_FILTER", "CONTENT_POLICY", "POLICY_VIOLATION", "PUBLIC_POLICY_VIOLATION",
  "BLOCKED_FOR_SAFETY", "SAFETY_BLOCKED", "PROHIBITED_CONTENT",
  "TERMS_OF_SERVICE", "HARMFUL_CONTENT", "ADULT_CONTENT", "UNSAFE_CONTENT"
];

export interface ApiClientOptions {
  paygateTier?: "PAYGATE_TIER_FREE" | "PAYGATE_TIER_ONE" | "PAYGATE_TIER_TWO" | "PAYGATE_TIER_THREE";
  projectId?: string;
}

export class ApiClient extends EventEmitter {
  private _sessionId: string;
  private _paygateTier: string;
  private _projectId: string | null;
  private _cachedCookies: { str: string; ts: number } | null = null;

  constructor(private tokenManager: TokenManager, opts: ApiClientOptions = {}) {
    super();
    this._sessionId = ";" + Date.now();
    this._paygateTier = opts.paygateTier ?? "PAYGATE_TIER_TWO";
    this._projectId = opts.projectId ?? null;
  }

  async generateVideo(prompt: string, opts: {
    aspectRatio?: "16:9" | "9:16",
    seed?: number, count?: number,
    model?: keyof typeof VIDEO_MODEL_KEYS,
    startImageId?: string, endImageId?: string,
    referenceImages?: Array<string | {mediaId: string}>,
    voice?: string
  } = {}): Promise<any> {
    const projectId = await this._ensureProject();
    const clientContext = await this._buildClientContext(projectId, "VIDEO_GENERATION");

    const aspectRatio = VIDEO_ASPECT_RATIOS[opts.aspectRatio ?? "16:9"];
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    const count = Math.max(1, Math.min(opts.count ?? 1, 4));
    const batchId = crypto.randomUUID();

    const hasStart = !!opts.startImageId;
    const hasEnd = !!opts.endImageId;
    const hasRef = Array.isArray(opts.referenceImages) && opts.referenceImages.length > 0;
    const mode: "t2v"|"i2v"|"r2v"|"f2v" =
      hasStart && hasEnd ? "f2v" :
      hasStart ? "i2v" :
      hasRef ? "r2v" : "t2v";

    const model = opts.model ?? "veo_3_1_fast";
    const videoModelKey = this._resolveVideoModelKey(model, mode, aspectRatio);

    const requests = Array.from({length: count}, (_, i) => {
      const req: any = {
        aspectRatio,
        seed: seed + i,
        textInput: { structuredPrompt: { parts: [{text: this._stripAudioCommands(prompt)}] } },
        videoModelKey,
        metadata: {}
      };
      if (hasStart) req.startImage = {
        mediaId: opts.startImageId,
        cropCoordinates: { top: 0, left: 0, bottom: 1, right: 1 }
      };
      if (hasEnd) req.endImage = {
        mediaId: opts.endImageId,
        cropCoordinates: { top: 0, left: 0, bottom: 1, right: 1 }
      };
      if (hasRef) req.referenceImages = opts.referenceImages!.map(r =>
        typeof r === "string"
          ? { mediaId: r, imageUsageType: "IMAGE_USAGE_TYPE_ASSET" }
          : { imageUsageType: "IMAGE_USAGE_TYPE_ASSET", ...r }
      );
      if (hasRef && opts.voice && opts.voice !== "none") {
        req.referenceAudio = [{mediaId: opts.voice}];
      }
      return req;
    });

    const body = {
      mediaGenerationContext: { batchId, audioFailurePreference: "BLOCK_SILENCED_VIDEOS" },
      clientContext: { ...clientContext, userPaygateTier: this._paygateTier },
      requests,
      useV2ModelConfig: true
    };

    const ENDPOINT_MAP = {
      t2v: "/v1/video:batchAsyncGenerateVideoText",
      i2v: "/v1/video:batchAsyncGenerateVideoStartImage",
      r2v: "/v1/video:batchAsyncGenerateVideoReferenceImages",
      f2v: "/v1/video:batchAsyncGenerateVideoStartAndEndImage"
    };

    this.emit("video:generating", {prompt, model: videoModelKey, mode, count});
    const result = await this._browserFetch("POST", API_BASE + ENDPOINT_MAP[mode], body, "VIDEO_GENERATION");
    this.emit("video:started", result.body);
    return result.body;
  }

  async checkVideoStatus(media: Array<{name: string; projectId?: string}>): Promise<CheckStatusResponse> {
    const body = {
      media: media.map(m => ({name: m.name, projectId: m.projectId ?? this._projectId}))
    };
    const res = await this._apiRequest("POST", "/v1/video:batchCheckAsyncVideoGenerationStatus", body);
    return res.body;
  }

  async waitForVideos(media: Array<{name: string; projectId?: string}>, opts: {
    intervalMs?: number; timeoutMs?: number;
    onProgress?: (data: any, elapsed: number) => void
  } = {}): Promise<CheckStatusResponse> {
    const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
    const timeout = opts.timeoutMs ?? POLL_TIMEOUT_MS;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, interval));
      const result = await this.checkVideoStatus(media);
      const allDone = result.media?.every(m => {
        const status = m.mediaMetadata?.mediaStatus?.mediaGenerationStatus;
        return status === "MEDIA_GENERATION_STATUS_SUCCESSFUL"
            || status === "MEDIA_GENERATION_STATUS_FAILED"
            || status === "MEDIA_GENERATION_STATUS_FILTERED";
      });
      const elapsed = Math.round((Date.now() - start) / 1000);
      opts.onProgress?.(result, elapsed);
      if (allDone) return result;
    }
    throw new Error(`Video generation timed out after ${timeout/1000}s`);
  }

  async uploadImage(source: Buffer | string, mimeType = "image/jpeg"): Promise<UploadImageResponse> {
    const buffer = typeof source === "string" ? require("fs").readFileSync(source) : source;
    const body = {
      data: buffer.toString("base64"),
      mimeType,
      projectId: await this._ensureProject()
    };
    const res = await this._apiRequest("POST", "/v1/flow/uploadImage", body);
    if (!res.body?.mediaId) throw new Error("uploadImage: no mediaId");
    return res.body;
  }

  // === Private helpers ===

  private async _buildClientContext(projectId: string, recaptchaAction: string): Promise<any> {
    const recaptchaToken = await this.tokenManager.getRecaptchaToken(recaptchaAction);
    return {
      projectId,
      tool: TOOL_NAME,
      userPaygateTier: this._paygateTier,
      sessionId: this._sessionId,
      recaptchaContext: {
        token: recaptchaToken,
        applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB"
      }
    };
  }

  private _resolveVideoModelKey(model: string, mode: "t2v"|"i2v"|"r2v"|"f2v", aspect: string): string {
    const aspectKey = aspect === "VIDEO_ASPECT_RATIO_LANDSCAPE" ? "landscape" : "portrait";
    const advancedKey = `${aspectKey}_advanced`;
    const modelMap: any = (VIDEO_MODEL_KEYS as any)[model];
    if (!modelMap) throw new Error(`Unknown model: ${model}`);
    const modeMap = modelMap[mode];
    if (!modeMap) throw new Error(`Mode ${mode} not supported for ${model}`);
    return modeMap[advancedKey] ?? modeMap[aspectKey] ?? modeMap.default;
  }

  private _stripAudioCommands(prompt: string): string {
    if (!/\b(no audio|without audio|silent video|silent)\b/i.test(prompt)) return prompt;
    return prompt
      .replace(/(\bno audio\b|\bwithout audio\b|\bsilent video\b|\bsilent\b)/gi, "")
      .trim() + ", with subtle background wind noise";
  }

  private async _ensureProject(): Promise<string> {
    if (this._projectId) return this._projectId;
    const result = await this._labsRequest("POST", "/fx/api/trpc/project.createProject", {});
    this._projectId = result.body?.result?.data?.id ?? result.body?.id;
    if (!this._projectId) throw new Error("Failed to create Flow project");
    return this._projectId;
  }

  private async _apiRequest(method: string, path: string, body: any = null, extra: any = {}): Promise<any> {
    const token = await this.tokenManager.getToken();
    if (!token) throw new Error("No OAuth token");
    const url = API_BASE + path;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain;charset=UTF-8",
      Origin: LABS_BASE,
      Referer: LABS_BASE + "/",
      "User-Agent": USER_AGENT,
      "sec-ch-ua": `"Not;A Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"`,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": `"Windows"`,
      ...extra
    };
    return this._httpRequest(method, url, headers, body);
  }

  private async _browserFetch(method: string, url: string, body: any, recaptchaAction: string): Promise<any> {
    for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
      try {
        const token = await this.tokenManager.getToken();
        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain;charset=UTF-8",
          Origin: LABS_BASE,
          Referer: LABS_BASE + "/fx/vi/tools/flow"
        };
        return await this._httpRequest(method, url, headers, body);
      } catch (err: any) {
        const status = err.status ?? 0;
        const bodyStr = typeof err.body === "object" ? JSON.stringify(err.body) : String(err.body ?? "");
        if (POLICY_KEYWORDS.some(k => bodyStr.includes(k))) {
          throw new Error(`POLICY_VIOLATION: ${bodyStr.substring(0, 500)}`);
        }
        if (status === 403 && bodyStr.includes("PUBLIC_ERROR_UNUSUAL_ACTIVITY") && attempt < RETRY_MAX) {
          await this.tokenManager._rotateRecaptchaSession?.("UNUSUAL_ACTIVITY");
          if (body?.clientContext?.recaptchaContext) {
            body.clientContext.recaptchaContext.token = await this.tokenManager.getRecaptchaToken(recaptchaAction);
          }
          continue;
        }
        if (status === 429 && attempt < RETRY_MAX) {
          await new Promise(r => setTimeout(r, Math.min(60_000 * attempt, 300_000)));
          continue;
        }
        if (status === 401 || status === 403) {
          throw new Error(`AUTH_ERROR_${status}: ${bodyStr}`);
        }
        if (attempt < RETRY_MAX) {
          await new Promise(r => setTimeout(r, 5000 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Retries exhausted");
  }

  private async _labsRequest(method: string, path: string, body: any = null): Promise<any> {
    const url = LABS_BASE + path;
    const cookies = await this._getCookieString();
    const headers: any = {
      "Content-Type": "application/json",
      Referer: LABS_BASE + "/fx/vi/tools/flow",
      "User-Agent": USER_AGENT
    };
    if (cookies) headers.Cookie = cookies;
    return this._httpRequest(method, url, headers, body);
  }

  private async _getCookieString(): Promise<string | null> {
    if (this._cachedCookies && Date.now() - this._cachedCookies.ts < 30_000) {
      return this._cachedCookies.str;
    }
    const page = this.tokenManager._page;
    if (!page) return null;
    const [labs, accounts] = await Promise.all([
      page.cookies("https://labs.google").catch(() => []),
      page.cookies("https://accounts.google.com").catch(() => [])
    ]);
    const seen = new Set<string>();
    const all = [...labs, ...accounts].filter((c: any) =>
      seen.has(c.name) ? false : (seen.add(c.name), true)
    );
    const str = all.map((c: any) => `${c.name}=${c.value}`).join("; ");
    this._cachedCookies = { str, ts: Date.now() };
    return str;
  }

  private async _httpRequest(method: string, url: string, headers: any, body: any = null): Promise<any> {
    const bodyStr = body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined;
    if (bodyStr && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    const res = await gotScraping({
      url,
      method: method.toUpperCase() as any,
      headers,
      body: bodyStr,
      responseType: "text",
      timeout: { request: 300_000 },
      throwHttpErrors: false,
      headerGeneratorOptions: {
        browsers: [{ name: "chrome", minVersion: 125, maxVersion: 130 }],
        devices: ["desktop"],
        operatingSystems: ["windows"]
      }
    });
    let parsed: any = res.body;
    try { parsed = JSON.parse(res.body); } catch {}
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { status: res.statusCode, headers: res.headers, body: parsed };
    }
    const err: any = new Error(`API ${res.statusCode} ${method} ${new URL(url).pathname}`);
    err.status = res.statusCode;
    err.body = parsed;
    throw err;
  }
}
```

## 18.9 `token-manager.ts` (skeleton ~300 lines)

```typescript
// apps/worker/src/_veo3_helpers/token-manager.ts
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page, CDPSession } from "puppeteer-core";
import path from "path";
import { CaptchaBridge } from "./captcha-bridge";
import { LABS_BASE } from "./constants";

puppeteerExtra.use(StealthPlugin());

export interface AccountAuth {
  accountId: string;
  email: string;
  cookies: any[];
  projectId?: string;
}

export class TokenManager {
  public _browser: Browser | null = null;
  public _page: Page | null = null;
  public _cdp: CDPSession | null = null;
  private _captchaBridge: CaptchaBridge;
  private _bearerToken: string | null = null;
  private _account: AccountAuth;

  constructor(account: AccountAuth, captchaServerUrl = "http://127.0.0.1:3456") {
    this._account = account;
    this._captchaBridge = new CaptchaBridge(captchaServerUrl);
  }

  async launch(opts: { headless?: boolean; chromeExecutablePath?: string } = {}): Promise<void> {
    const extPath = path.join(__dirname, "../captcha-server/extension");
    this._browser = await puppeteerExtra.launch({
      headless: opts.headless ?? false,
      executablePath: opts.chromeExecutablePath,
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        `--load-extension=${extPath}`,
        `--disable-extensions-except=${extPath}`
      ],
      defaultViewport: { width: 1280, height: 800 }
    }) as any;

    this._page = await this._browser!.newPage();
    this._cdp = await (this._page as any).target().createCDPSession();

    if (this._account.cookies?.length) {
      await this._page!.setCookie(...this._account.cookies);
    }

    this._attachTokenInterceptor();
    await this._page!.goto(`${LABS_BASE}/fx/vi/tools/flow`, { waitUntil: "networkidle2" });
    // Wait for app loaded — adjust selector based on real DOM
    await this._page!.waitForSelector('[data-testid="flow-app"], [aria-label*="user"]', { timeout: 60_000 }).catch(() => {});
  }

  private _attachTokenInterceptor() {
    this._page!.on("request", req => {
      const auth = req.headers()["authorization"];
      if (auth?.startsWith("Bearer ") && req.url().includes("aisandbox-pa.googleapis.com")) {
        this._bearerToken = auth.slice(7);
      }
    });
  }

  async getToken(): Promise<string> {
    if (this._bearerToken) return this._bearerToken;
    // Trigger 1 dummy network request to capture token
    await this._page!.evaluate(() => {
      document.querySelector<HTMLElement>('[data-testid="user-menu"]')?.click();
    });
    await new Promise(r => setTimeout(r, 2000));
    if (!this._bearerToken) throw new Error("Failed to extract Bearer token");
    return this._bearerToken;
  }

  async getRecaptchaToken(action: string): Promise<string> {
    return this._captchaBridge.getToken(action);
  }

  async _rotateRecaptchaSession(reason: string): Promise<void> {
    console.warn(`[TokenManager] Rotating: ${reason}`);
    await this._captchaBridge.forceRefresh();
    await new Promise(r => setTimeout(r, 5000));
    this._bearerToken = null;  // Force re-extraction after reload
  }

  async exportCookies(): Promise<any[]> {
    return this._page!.cookies();
  }

  async close() {
    await this._browser?.close();
  }
}
```

## 18.10 `captcha-bridge.ts` (~80 lines)

```typescript
// apps/worker/src/_veo3_helpers/captcha-bridge.ts
import got from "got";

export class CaptchaBridge {
  constructor(private serverUrl = "http://127.0.0.1:3456") {}

  async getToken(action = "IMAGE_GENERATION"): Promise<string> {
    const res: any = await got(`${this.serverUrl}/captcha?action=${action}`, {
      timeout: { request: 30_000 },
      responseType: "json",
      throwHttpErrors: false
    });
    if (res.statusCode !== 200) {
      throw new Error(`Captcha bridge ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
    if (!res.body?.captcha) throw new Error(`No token: ${JSON.stringify(res.body)}`);
    return res.body.captcha;
  }

  async forceRefresh(): Promise<void> {
    await got.post(`${this.serverUrl}/force-refresh`, { timeout: { request: 5000 } });
  }

  async health(): Promise<{status: string; connectedClients: number}> {
    const res: any = await got(`${this.serverUrl}/health`, {
      responseType: "json",
      timeout: { request: 3000 }
    });
    return res.body;
  }
}
```

## 18.11 `captcha-server/server.ts` (~250 lines)

Replica từ `captcha_server.js` (đã đọc, 381 lines). Logic:

- Express HTTP server on port 3456
- Socket.IO listen connections from extensions (mỗi tab labs.google = 1 client)
- Track `connectedClients` Map + `pendingRequests` Map
- Endpoints:
  - `GET /captcha?action=IMAGE_GENERATION|VIDEO_GENERATION` → pick client → emit Socket → wait response → return token (30s timeout)
  - `GET /health` → status + connectedClients
  - `POST /force-refresh` → emit `server:reload-page` to all clients
- Socket events: `client:ready` / `client:captcha-solved` / `client:captcha-error`
- Retry với alternate clients nếu primary fail

```typescript
// apps/worker/src/captcha-server/server.ts
import http from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import crypto from "crypto";

const PORT = parseInt(process.env.CAPTCHA_PORT ?? "3456", 10);
const REQUEST_TIMEOUT_MS = 30_000;
const CAPTCHA_MODE = (process.env.CAPTCHA_MODE ?? "auto") as "auto" | "real_chrome" | "brave";

interface Client { socket: Socket; browserType: "chrome" | "brave" | "unknown"; }
const connectedClients = new Map<string, Client>();
const pendingRequests = new Map<string, {
  resolve: (v: string) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}>();

function pickClient(): Client | null {
  const all = [...connectedClients.values()];
  if (CAPTCHA_MODE === "real_chrome") return all.find(c => c.browserType === "chrome") ?? null;
  return all.find(c => c.browserType === "chrome")
      ?? all.find(c => c.browserType === "brave")
      ?? all[0] ?? null;
}

function alternateClients(excludeId: string): Client[] {
  return [...connectedClients.values()].filter(c => c.socket.id !== excludeId);
}

function requestFromClient(client: Client, action: string, reqId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingRequests.has(reqId)) {
        pendingRequests.delete(reqId);
        reject(new Error(`Timeout — client ${client.socket.id.slice(0, 6)} [${client.browserType}]`));
      }
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(reqId, { resolve, reject, timer });
    client.socket.emit("server:request-captcha", { requestId: reqId, action });
  });
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && url.pathname === "/captcha") {
    const action = url.searchParams.get("action") ?? "IMAGE_GENERATION";
    const primary = pickClient();
    if (!primary) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "No browser clients connected" }));
      return;
    }
    const reqId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    try {
      const token = await requestFromClient(primary, action, reqId);
      res.writeHead(200);
      res.end(JSON.stringify({ captcha: token }));
    } catch (err) {
      // Try alternates
      for (const alt of alternateClients(primary.socket.id)) {
        const altId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        try {
          const token = await requestFromClient(alt, action, altId);
          res.writeHead(200);
          res.end(JSON.stringify({ captcha: token }));
          return;
        } catch {}
      }
      res.writeHead(408);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: "ok",
      mode: CAPTCHA_MODE,
      connectedClients: connectedClients.size,
      pendingRequests: pendingRequests.size,
      clients: [...connectedClients.values()].map(c => ({
        id: c.socket.id.slice(0, 8),
        browserType: c.browserType
      }))
    }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/force-refresh") {
    let count = 0;
    for (const { socket } of connectedClients.values()) {
      socket.emit("server:reload-page", { delay: 500 });
      count++;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ refreshed: count }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });
io.on("connection", socket => {
  connectedClients.set(socket.id, { socket, browserType: "unknown" });
  console.log(`[Captcha] ✅ Client connected: ${socket.id.slice(0,8)}`);

  socket.on("client:ready", payload => {
    const c = connectedClients.get(socket.id);
    if (c) c.browserType = payload?.browserType ?? "unknown";
    console.log(`[Captcha]    Ready: ${socket.id.slice(0,8)} [${c?.browserType}]`);
  });

  socket.on("client:captcha-solved", ({ requestId, token }) => {
    const p = pendingRequests.get(requestId);
    if (p) {
      clearTimeout(p.timer);
      pendingRequests.delete(requestId);
      p.resolve(token);
      console.log(`[Captcha] ✅ Solved (${token?.length} chars)`);
    }
  });

  socket.on("client:captcha-error", ({ requestId, error }) => {
    const p = pendingRequests.get(requestId);
    if (p) {
      clearTimeout(p.timer);
      pendingRequests.delete(requestId);
      p.reject(new Error(error));
      console.error(`[Captcha] ❌ Error: ${error}`);
    }
  });

  socket.on("disconnect", () => {
    connectedClients.delete(socket.id);
    console.log(`[Captcha] ❌ Disconnected (total: ${connectedClients.size})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`╔══════════════════════════════════════════════════╗`);
  console.log(`║  🔓  Veo Farm Captcha Server                     ║`);
  console.log(`║  HTTP:  http://localhost:${PORT}                       ║`);
  console.log(`║  GET   /captcha?action=IMAGE_GENERATION          ║`);
  console.log(`║  GET   /health                                   ║`);
  console.log(`║  POST  /force-refresh                            ║`);
  console.log(`║  Mode:  ${CAPTCHA_MODE.padEnd(40)}║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
});
```

## 18.12 Chrome Extension files

### `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Veo Farm Captcha Solver",
  "version": "1.0.0",
  "description": "Solve reCAPTCHA Enterprise for Veo 3 Flow API. Talks to local captcha-server via Socket.IO.",
  "permissions": ["storage", "activeTab", "scripting", "tabs"],
  "host_permissions": [
    "https://labs.google/*",
    "http://localhost:3456/*",
    "http://127.0.0.1:3456/*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://labs.google/*"],
    "js": ["content.js"],
    "run_at": "document_start"
  }],
  "web_accessible_resources": [{
    "resources": ["injected.js", "socket.io.min.js"],
    "matches": ["https://labs.google/*"]
  }],
  "action": {
    "default_title": "Veo Farm Captcha Solver",
    "default_popup": "popup.html"
  }
}
```

### `background.js`

```javascript
// apps/worker/src/captcha-server/extension/background.js
const DEFAULT_SETTINGS = {
  serverUrl: 'http://127.0.0.1:3456',
  clearGrecaptcha: false
};
let currentSettings = { ...DEFAULT_SETTINGS };

chrome.storage.local.get('settings', data => {
  if (data.settings) {
    currentSettings = { ...DEFAULT_SETTINGS, ...data.settings };
    // Migrate localhost → 127.0.0.1 (some Chrome versions block localhost mixed content)
    if (currentSettings.serverUrl?.includes('localhost')) {
      currentSettings.serverUrl = currentSettings.serverUrl.replace('localhost', '127.0.0.1');
      chrome.storage.local.set({ settings: currentSettings });
    }
    console.log('[Veo-Farm-BG] Loaded:', currentSettings);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_SETTINGS') {
    sendResponse(currentSettings);
    return true;
  }
  if (msg.type === 'SAVE_SETTINGS') {
    currentSettings = { ...DEFAULT_SETTINGS, ...msg.settings };
    chrome.storage.local.set({ settings: currentSettings });
    sendResponse({ ok: true });
    return true;
  }
});
```

### `content.js`

```javascript
// apps/worker/src/captcha-server/extension/content.js
(function() {
  const TAG = '[Veo-Farm-Ext/Content]';
  function log(...args) { console.log(TAG, ...args); }
  function err(...args) { console.error(TAG, '❌', ...args); }

  function injectScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(src);
      script.type = 'text/javascript';
      (document.head || document.documentElement).appendChild(script);
      script.onload = () => { script.remove(); resolve(); };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
    });
  }

  async function inject() {
    try {
      await injectScript('socket.io.min.js');
      await injectScript('injected.js');
    } catch (e) { err('Injection failed:', e.message); }
  }

  // Bridge: page (window.postMessage) ↔ background (chrome.runtime)
  window.addEventListener('message', evt => {
    if (evt.source !== window) return;
    if (evt.data?.type === 'VEO_GET_SETTINGS_REQUEST') {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, response => {
        window.postMessage({ type: 'VEO_GET_SETTINGS_RESPONSE', settings: response || {} }, '*');
      });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
  log('✅ Content script ready');
})();
```

### `injected.js`

```javascript
// apps/worker/src/captcha-server/extension/injected.js
(async function() {
  const TAG = '[Veo-Farm-Ext/Injected]';
  const RECAPTCHA_SITE_KEY = '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV';
  const DEFAULT_SERVER = 'http://127.0.0.1:3456';

  function log(...args) { console.log(TAG, ...args); }
  function warn(...args) { console.warn(TAG, '⚠️', ...args); }
  function err(...args) { console.error(TAG, '❌', ...args); }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function waitForGrecaptcha(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.grecaptcha?.enterprise?.execute) return;
      await sleep(200);
    }
    throw new Error('reCAPTCHA Enterprise not available after 30s');
  }

  async function solveRecaptcha(action = 'IMAGE_GENERATION') {
    log('Solving reCAPTCHA action=' + action);
    const token = await window.grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action });
    log('Token obtained (' + token.length + ' chars)');
    try { localStorage.removeItem('_grecaptcha'); } catch {}
    return token;
  }

  function getSettings() {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve({ serverUrl: DEFAULT_SERVER }), 500);
      const handler = evt => {
        if (evt.source !== window || evt.data?.type !== 'VEO_GET_SETTINGS_RESPONSE') return;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(evt.data.settings || {});
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'VEO_GET_SETTINGS_REQUEST' }, '*');
    });
  }

  try {
    const settings = await getSettings();
    const serverUrl = settings.serverUrl ?? DEFAULT_SERVER;
    log('Server URL:', serverUrl);

    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity
    });

    socket.on('connect', () => {
      log('✅ Connected (id=' + socket.id + ')');
      const ua = navigator.userAgent || '';
      const isHeadless = navigator.webdriver === true || ua.includes('HeadlessChrome');
      const browserType = isHeadless ? 'brave' : 'chrome';
      socket.emit('client:ready', { timestamp: new Date().toISOString(), browserType });
    });

    socket.on('disconnect', reason => warn('Disconnected:', reason));
    socket.on('connect_error', e => warn('Connection error:', e.message));

    socket.on('server:request-captcha', async ({ requestId, action }) => {
      log('Captcha request:', action);
      try {
        await waitForGrecaptcha();
        const token = await solveRecaptcha(action || 'IMAGE_GENERATION');
        socket.emit('client:captcha-solved', {
          requestId,
          token,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        const msg = e?.message || String(e);
        err('Solve failed:', msg);
        socket.emit('client:captcha-error', { requestId, error: msg });
      }
    });

    socket.on('server:reload-page', ({ delay = 0 }) => {
      warn('Server requested page reload');
      try { localStorage.removeItem('_grecaptcha'); } catch {}
      if (delay > 0) setTimeout(() => location.reload(), delay);
      else location.reload();
    });

    // Initial wait so reCAPTCHA library is preloaded
    await waitForGrecaptcha().catch(e => warn('Initial wait:', e.message));

    // Expose for manual debug
    window.veoFarmCaptcha = {
      socket,
      solve: () => solveRecaptcha(),
      reload: () => location.reload()
    };
    log('✅ Captcha solver ready');
  } catch (e) {
    err('Init failed:', e.message);
  }
})();
```

### `popup.html` + `popup.js` + `popup.css`

Simple settings UI để config server URL. ~100 lines total. Skip code chi tiết.

## 18.13 `cdp-downloader.ts` (~150 lines)

Download video qua CDP để bypass auth/CORS:

```typescript
// apps/worker/src/_veo3_helpers/cdp-downloader.ts
import type { Page, CDPSession } from "puppeteer-core";

export async function downloadVideoViaCDP(
  page: Page,
  cdp: CDPSession,
  videoUrl: string,
  timeoutMs = 20_000
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    let resolved = false;
    let requestId: string | null = null;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error("CDP download timeout"));
      }
    }, timeoutMs);

    const onResponse = (params: any) => {
      if (resolved) return;
      const url = params.response?.url ?? "";
      const ct = (params.response?.headers?.["content-type"]
                ?? params.response?.headers?.["Content-Type"] ?? "").toLowerCase();
      const matches = url.includes(videoUrl)
        || (url.includes("storage.googleapis.com") && url.includes("ai-sandbox-videofx"));
      if (!matches) return;
      if (ct.startsWith("video/") || ct.includes("mp4") || ct.includes("webm")) {
        requestId = params.requestId;
      }
    };

    const onLoadingFinished = async (params: any) => {
      if (resolved || params.requestId !== requestId) return;
      try {
        const result: any = await cdp.send("Network.getResponseBody", {
          requestId: params.requestId
        });
        resolved = true;
        clearTimeout(timer);
        cleanup();
        const buffer = result.base64Encoded
          ? Buffer.from(result.body, "base64")
          : Buffer.from(result.body);
        resolve(buffer);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const cleanup = () => {
      cdp.off("Network.responseReceived", onResponse);
      cdp.off("Network.loadingFinished", onLoadingFinished);
    };

    cdp.on("Network.responseReceived", onResponse);
    cdp.on("Network.loadingFinished", onLoadingFinished);

    // Inject <video> to trigger network request
    await page.evaluate(url => {
      const v = document.createElement("video");
      v.src = url;
      v.style.display = "none";
      v.preload = "auto";
      document.body.appendChild(v);
      v.play().catch(() => {});
    }, videoUrl);
  });
}
```

## 18.14 `concurrency.ts`

```typescript
// apps/worker/src/core/concurrency.ts
export class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];
  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.maxConcurrent) {
      this.current++;
      return;
    }
    return new Promise<void>(resolve => this.queue.push(resolve));
  }

  release(): void {
    if (this.queue.length > 0) {
      this.queue.shift()!();
    } else {
      this.current--;
    }
  }
}

export class RateLimiter {
  private lastDispatchedAt = 0;
  private _lock = new Semaphore(1);

  constructor(private minDelayMs: number) {}

  async throttle(): Promise<void> {
    await this._lock.acquire();
    try {
      const now = Date.now();
      const wait = this.lastDispatchedAt + this.minDelayMs - now;
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      this.lastDispatchedAt = Date.now();
    } finally {
      this._lock.release();
    }
  }
}
```

## 18.15 Plugin entry `veo3_flow_v2.ts`

```typescript
// apps/worker/src/plugins/video/veo3_flow_v2.ts
import type { VideoProvider, VideoInput, VideoOutput, PluginExecutionContext } from "@veo-farm/shared";
import { ApiClient } from "../../_veo3_helpers/api-client";
import { TokenManager } from "../../_veo3_helpers/token-manager";
import { downloadVideoViaCDP } from "../../_veo3_helpers/cdp-downloader";
import { RateLimiter } from "../../core/concurrency";

const rateLimiter = new RateLimiter(3000);

export const Veo3FlowV2Plugin: VideoProvider = {
  id: "veo3_flow_v2",
  name: "Veo 3 (Flow API replica)",
  url: "https://labs.google/fx/vi/tools/flow",
  loginUrl: "https://labs.google/fx/vi/tools/flow",
  capabilities: {
    max_duration_sec: 8,
    supports_image_ref: true,
    supports_voice_in_prompt: true,
    aspect_ratios: ["9:16", "16:9", "1:1"]
  },

  async generateVideo(input: VideoInput, ctx: PluginExecutionContext): Promise<VideoOutput> {
    const { account, uploadFile, logger } = ctx;
    await rateLimiter.throttle();

    const tm = new TokenManager({
      accountId: account.id,
      email: account.label,
      cookies: JSON.parse(account.meta?.cookies_decrypted ?? "[]"),
      projectId: account.meta?.projectId
    });

    await tm.launch({
      headless: false,
      chromeExecutablePath: process.env.BRAVE_PATH ?? process.env.CHROME_PATH
    });

    try {
      const client = new ApiClient(tm, {
        paygateTier: "PAYGATE_TIER_TWO",
        projectId: account.meta?.projectId
      });

      let refMediaId: string | undefined;
      if (input.refImageUrl) {
        const buf = await downloadFromStorage(input.refImageUrl);
        const upload = await client.uploadImage(buf, "image/jpeg");
        refMediaId = upload.mediaId;
      }

      const startResult = await client.generateVideo(input.prompt, {
        aspectRatio: input.aspectRatio as "16:9" | "9:16",
        count: 1,
        model: "veo_3_1_fast",
        referenceImages: refMediaId ? [refMediaId] : undefined
      });

      const media = (startResult.media ?? []).map((m: any) => ({
        name: m.name,
        projectId: m.projectId
      }));
      if (media.length === 0) throw new Error("No media items returned");

      const pollResult = await client.waitForVideos(media, {
        onProgress: (data, elapsed) => logger.info(`Polling... ${elapsed}s`)
      });

      const success = pollResult.media?.find((m: any) =>
        m.mediaMetadata?.mediaStatus?.mediaGenerationStatus === "MEDIA_GENERATION_STATUS_SUCCESSFUL"
      );
      if (!success) throw new Error("Video generation failed");

      const videoUri = success.mediaMetadata?.video?.servingUri
                    ?? success.mediaMetadata?.video?.uri;
      if (!videoUri) throw new Error("No video URI in response");

      const buffer = await downloadVideoViaCDP(tm._page!, tm._cdp!, videoUri);
      const uploadedUrl = await uploadFile(buffer, "mp4");

      return {
        videoUrl: uploadedUrl,
        durationSec: 8,
        hasAudio: true
      };
    } finally {
      await tm.close();
    }
  }
};

declare function downloadFromStorage(url: string): Promise<Buffer>;
export default Veo3FlowV2Plugin;
```

## 18.16 Schema migration `0006_veo3_flow_v2.sql`

```sql
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS auth_blob_encrypted text,
  ADD COLUMN IF NOT EXISTS auth_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS browser_profile_path text,
  ADD COLUMN IF NOT EXISTS captcha_server_port int DEFAULT 3456;

-- New providers
ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'rotating';
```

## 18.17 Local setup

```bash
# 1. Install deps in apps/worker
cd apps/worker
pnpm add puppeteer-core puppeteer-extra puppeteer-extra-plugin-stealth \
        got-scraping got express socket.io \
        @types/express @types/node

# 2. Browser binary
# Mac: brew install --cask brave-browser
# Path: /Applications/Brave Browser.app/Contents/MacOS/Brave Browser
# OR use Chrome: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# 3. Set env in apps/worker/.env
echo 'BRAVE_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"' >> .env
echo 'CAPTCHA_PORT=3456' >> .env
echo 'CAPTCHA_MODE=auto' >> .env

# 4. Run captcha-server (separate terminal hoặc pm2)
pnpm tsx src/captcha-server/server.ts
# Output:
# ╔══════════════════════════════════════════════════╗
# ║  🔓  Veo Farm Captcha Server                     ║
# ║  HTTP:  http://localhost:3456                    ║
# ║  ...                                              ║
# ╚══════════════════════════════════════════════════╝

# 5. Run worker (auto-launches Brave với extension loaded)
pnpm worker:dev
```

## 18.18 Migration plan từ veo3.ts → veo3_flow_v2.ts

**Sprint 7B (5-7 ngày sau MVP-1 work end-to-end):**

| Day | Task |
|---|---|
| 1-2 | Setup `_veo3_helpers/` + `constants.ts` + `flow-types.ts` + `api-client.ts` (skeleton) |
| 2-3 | `token-manager.ts` + `captcha-bridge.ts` + verify Bearer extraction work |
| 3-4 | Build `captcha-server/` + Chrome extension + verify Socket.IO end-to-end |
| 4-5 | Wire `veo3_flow_v2.ts` plugin + register vào `plugins/registry.ts` + run schema 0006 |
| 5 | UI: thêm option "Veo 3 (Flow v2)" vào dropdown Video node |
| 6-7 | Test end-to-end 1 video → 5 parallel → 50 batch |

**KHÔNG xoá `veo3.ts` cũ** — giữ làm fallback dropdown.

## 18.19 Risk + mitigation

| Risk | Mức | Mitigation |
|---|---|---|
| Google rotate Flow internal API | Medium | Plugin `veo3.ts` Playwright fallback. Healthcheck cron monitor. |
| reCAPTCHA Enterprise schema thay đổi | Low | Extension dùng `grecaptcha.enterprise.execute` — official browser API |
| Account ban do hammer endpoint | Medium | RateLimiter 3s/request + cooldown 5-10 phút |
| Cookies expire | Medium | TokenManager detect 401 → re-login flow |
| Brave/Chrome path khác máy | Low | Env var `BRAVE_PATH` + `CHROME_PATH` fallback |
| Extension không load (security) | Low | Use `--load-extension` + `--disable-extensions-except` flags |
| TLS fingerprint detect | Low | got-scraping mimick Chrome 125-130 |

## 18.20 Gain vs SPEC section 16 (cũ)

| | Section 16 (cũ — chưa verified) | Section 18 (verified production) |
|---|---|---|
| Endpoint | `flowMedia:batchGenerateVideos` ❌ | `/v1/video:batchAsyncGenerateVideo*` ✅ |
| Polling | `GET /v1/operations/{name}` ❌ | `POST /v1/video:batchCheckAsyncVideoGenerationStatus` ✅ |
| Body | Generic JSON ❌ | `clientContext.tool="PINHOLE"` + `videoModelKey` enum + `useV2ModelConfig:true` ✅ |
| Content-Type | `application/json` ❌ | `text/plain;charset=UTF-8` ✅ |
| HTTP client | `fetch` ❌ | `got-scraping` (TLS mimick) ✅ |
| Browser | Playwright | `puppeteer-extra-stealth` + Brave nhúng ✅ |
| reCAPTCHA | 2captcha service / pre-cache | Custom extension + Socket.IO ✅ |
| Video download | `fetch` → buffer | CDP `Network.getResponseBody` (anti-CORS) ✅ |

→ Section 18 là **production-grade pattern** (verified với commercial tool ship v1.5.0). Build theo này.
