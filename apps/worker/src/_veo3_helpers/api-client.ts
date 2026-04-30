// Veo 3 Flow API client (replica from VEO3 Flow Automation v1.5.0).
// Reference: SPEC_REPLICA_BACKEND.md section 18.8.

import { EventEmitter } from 'node:events';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
// @ts-ignore — got-scraping has loose types
import { gotScraping } from 'got-scraping';

import {
  API_BASE,
  LABS_BASE,
  TOOL_NAME,
  USER_AGENT,
  SEC_CH_UA,
  SEC_CH_UA_PLATFORM,
  VIDEO_MODEL_KEYS,
  VIDEO_ASPECT_RATIOS,
  ENDPOINT_BY_MODE,
  ENDPOINTS,
  POLICY_KEYWORDS,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  RETRY_MAX,
  type PaygateTier,
} from './constants.js';
import type { TokenManager } from './token-manager.js';
import type {
  CheckStatusResponse,
  ClientContext,
  GenerateVideoRequest,
  GenerateVideoResponse,
  GenerationMode,
  GenerateVideoOptions,
  UploadImageResponse,
  VideoRequestItem,
} from './flow-types.js';

export interface ApiClientOptions {
  paygateTier?: PaygateTier;
  projectId?: string | null;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: T;
}

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export class ApiClient extends EventEmitter {
  private _sessionId: string;
  private _paygateTier: PaygateTier;
  private _projectId: string | null;
  private _cachedCookies: { str: string; ts: number } | null = null;

  constructor(private tokenManager: TokenManager, opts: ApiClientOptions = {}) {
    super();
    this._sessionId = ';' + Date.now();
    this._paygateTier = opts.paygateTier ?? 'PAYGATE_TIER_TWO';
    this._projectId = opts.projectId ?? null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  async generateVideo(prompt: string, opts: GenerateVideoOptions = {}): Promise<GenerateVideoResponse> {
    const projectId = await this._ensureProject();
    const aspectRatio = VIDEO_ASPECT_RATIOS[opts.aspectRatio ?? '16:9'];
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    const count = Math.max(1, Math.min(opts.count ?? 1, 4));
    const batchId = crypto.randomUUID();

    const hasStart = !!opts.startImageId;
    const hasEnd = !!opts.endImageId;
    const hasRef = Array.isArray(opts.referenceImages) && opts.referenceImages.length > 0;
    const mode: GenerationMode =
      hasStart && hasEnd ? 'f2v' : hasStart ? 'i2v' : hasRef ? 'r2v' : 't2v';

    const model = opts.model ?? 'veo_3_1_fast';
    const videoModelKey = this._resolveVideoModelKey(model, mode, aspectRatio);

    const requests: VideoRequestItem[] = Array.from({ length: count }, (_, i) => {
      const req: VideoRequestItem = {
        aspectRatio: aspectRatio as 'VIDEO_ASPECT_RATIO_LANDSCAPE' | 'VIDEO_ASPECT_RATIO_PORTRAIT',
        seed: seed + i,
        textInput: { structuredPrompt: { parts: [{ text: this._stripAudioCommands(prompt) }] } },
        videoModelKey,
        metadata: {},
      };
      if (hasStart) {
        req.startImage = {
          mediaId: opts.startImageId!,
          cropCoordinates: { top: 0, left: 0, bottom: 1, right: 1 },
        };
      }
      if (hasEnd) {
        req.endImage = {
          mediaId: opts.endImageId!,
          cropCoordinates: { top: 0, left: 0, bottom: 1, right: 1 },
        };
      }
      if (hasRef) {
        req.referenceImages = opts.referenceImages!.map((r) =>
          typeof r === 'string'
            ? { mediaId: r, imageUsageType: 'IMAGE_USAGE_TYPE_ASSET' as const }
            : { imageUsageType: 'IMAGE_USAGE_TYPE_ASSET' as const, ...r },
        );
      }
      if (hasRef && opts.voice && opts.voice !== 'none') {
        req.referenceAudio = [{ mediaId: opts.voice }];
      }
      return req;
    });

    const clientContext = await this._buildClientContext(projectId, 'VIDEO_GENERATION');

    const body: GenerateVideoRequest = {
      mediaGenerationContext: { batchId, audioFailurePreference: 'BLOCK_SILENCED_VIDEOS' },
      clientContext: { ...clientContext, userPaygateTier: this._paygateTier },
      requests,
      useV2ModelConfig: true,
    };

    this.emit('video:generating', { prompt, model: videoModelKey, mode, count });
    const result = await this._browserFetch<GenerateVideoResponse>(
      'POST',
      API_BASE + ENDPOINT_BY_MODE[mode],
      body,
      'VIDEO_GENERATION',
    );
    this.emit('video:started', result.body);
    return result.body;
  }

  async checkVideoStatus(
    media: Array<{ name: string; projectId?: string }>,
  ): Promise<CheckStatusResponse> {
    const body = {
      media: media.map((m) => ({ name: m.name, projectId: m.projectId ?? this._projectId })),
    };
    const res = await this._apiRequest<CheckStatusResponse>(
      'POST',
      ENDPOINTS.checkStatus,
      body,
    );
    return res.body;
  }

  async waitForVideos(
    media: Array<{ name: string; projectId?: string }>,
    opts: {
      intervalMs?: number;
      timeoutMs?: number;
      onProgress?: (data: CheckStatusResponse, elapsed: number) => void;
    } = {},
  ): Promise<CheckStatusResponse> {
    const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
    const timeout = opts.timeoutMs ?? POLL_TIMEOUT_MS;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await sleep(interval);
      const result = await this.checkVideoStatus(media);
      const allDone = result.media?.every((m) => {
        const status = m.mediaMetadata?.mediaStatus?.mediaGenerationStatus;
        return (
          status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL' ||
          status === 'MEDIA_GENERATION_STATUS_FAILED' ||
          status === 'MEDIA_GENERATION_STATUS_FILTERED'
        );
      });
      const elapsed = Math.round((Date.now() - start) / 1000);
      opts.onProgress?.(result, elapsed);
      if (allDone) return result;
    }
    throw new Error(`Video generation timed out after ${timeout / 1000}s`);
  }

  async uploadImage(
    source: Buffer | string,
    mimeType = 'image/jpeg',
  ): Promise<UploadImageResponse> {
    const buffer = typeof source === 'string' ? fs.readFileSync(source) : source;
    const body = {
      data: buffer.toString('base64'),
      mimeType,
      projectId: await this._ensureProject(),
    };
    const res = await this._apiRequest<UploadImageResponse>(
      'POST',
      ENDPOINTS.uploadImage,
      body,
    );
    if (!res.body?.mediaId) throw new Error('uploadImage: no mediaId');
    return res.body;
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private async _buildClientContext(
    projectId: string,
    recaptchaAction: string,
  ): Promise<ClientContext> {
    const recaptchaToken = await this.tokenManager.getRecaptchaToken(recaptchaAction);
    return {
      projectId,
      tool: TOOL_NAME,
      userPaygateTier: this._paygateTier,
      sessionId: this._sessionId,
      recaptchaContext: {
        token: recaptchaToken,
        applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB',
      },
    };
  }

  private _resolveVideoModelKey(model: string, mode: GenerationMode, aspect: string): string {
    const aspectKey = aspect === 'VIDEO_ASPECT_RATIO_LANDSCAPE' ? 'landscape' : 'portrait';
    const advancedKey = `${aspectKey}_advanced`;
    const family = (VIDEO_MODEL_KEYS as Record<string, Record<string, Record<string, string>>>)[model];
    if (!family) throw new Error(`Unknown video model: ${model}`);
    const modeMap = family[mode];
    if (!modeMap) throw new Error(`Mode ${mode} not supported for ${model}`);
    return modeMap[advancedKey] ?? modeMap[aspectKey] ?? modeMap.default;
  }

  private _stripAudioCommands(prompt: string): string {
    if (!/\b(no audio|without audio|silent video|silent)\b/i.test(prompt)) return prompt;
    return (
      prompt
        .replace(/(\bno audio\b|\bwithout audio\b|\bsilent video\b|\bsilent\b)/gi, '')
        .trim() + ', with subtle background wind noise'
    );
  }

  private async _ensureProject(): Promise<string> {
    if (this._projectId) return this._projectId;
    const result = await this._labsRequest<any>(
      'POST',
      ENDPOINTS.labsCreateProject,
      {},
    );
    const id = result.body?.result?.data?.id ?? result.body?.id;
    if (!id) throw new Error('Failed to create Flow project');
    this._projectId = id;
    return id;
  }

  private async _apiRequest<T = unknown>(
    method: string,
    path: string,
    body: unknown = null,
    extra: Record<string, string> = {},
  ): Promise<HttpResponse<T>> {
    const token = await this.tokenManager.getToken();
    if (!token) throw new Error('No OAuth token');
    const url = API_BASE + path;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain;charset=UTF-8',
      Origin: LABS_BASE,
      Referer: LABS_BASE + '/',
      'User-Agent': USER_AGENT,
      'sec-ch-ua': SEC_CH_UA,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': SEC_CH_UA_PLATFORM,
      ...extra,
    };
    return this._httpRequest<T>(method, url, headers, body);
  }

  private async _browserFetch<T = unknown>(
    method: string,
    url: string,
    body: any,
    recaptchaAction: string,
  ): Promise<HttpResponse<T>> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
      try {
        const token = await this.tokenManager.getToken();
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain;charset=UTF-8',
          Origin: LABS_BASE,
          Referer: LABS_BASE + '/fx/vi/tools/flow',
          'User-Agent': USER_AGENT,
          'sec-ch-ua': SEC_CH_UA,
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': SEC_CH_UA_PLATFORM,
        };
        return await this._httpRequest<T>(method, url, headers, body);
      } catch (err) {
        lastErr = err;
        if (!(err instanceof ApiError)) {
          if (attempt < RETRY_MAX) {
            await sleep(5000 * attempt);
            continue;
          }
          throw err;
        }
        const status = err.status;
        const bodyStr =
          typeof err.body === 'object' ? JSON.stringify(err.body) : String(err.body ?? '');
        if (POLICY_KEYWORDS.some((k) => bodyStr.includes(k))) {
          throw new Error(`POLICY_VIOLATION: ${bodyStr.substring(0, 500)}`);
        }
        if (
          status === 403 &&
          bodyStr.includes('PUBLIC_ERROR_UNUSUAL_ACTIVITY') &&
          attempt < RETRY_MAX
        ) {
          await this.tokenManager._rotateRecaptchaSession?.('UNUSUAL_ACTIVITY');
          if (body?.clientContext?.recaptchaContext) {
            body.clientContext.recaptchaContext.token = await this.tokenManager.getRecaptchaToken(
              recaptchaAction,
            );
          }
          continue;
        }
        if (status === 429 && attempt < RETRY_MAX) {
          await sleep(Math.min(60_000 * attempt, 300_000));
          continue;
        }
        if (status === 401 || status === 403) {
          throw new Error(`AUTH_ERROR_${status}: ${bodyStr.substring(0, 500)}`);
        }
        if (attempt < RETRY_MAX) {
          await sleep(5000 * attempt);
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new Error('Retries exhausted');
  }

  private async _labsRequest<T = unknown>(
    method: string,
    path: string,
    body: unknown = null,
  ): Promise<HttpResponse<T>> {
    const url = LABS_BASE + path;
    const cookies = await this._getCookieString();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Referer: LABS_BASE + '/fx/vi/tools/flow',
      'User-Agent': USER_AGENT,
      'sec-ch-ua': SEC_CH_UA,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': SEC_CH_UA_PLATFORM,
    };
    if (cookies) headers.Cookie = cookies;
    return this._httpRequest<T>(method, url, headers, body);
  }

  private async _getCookieString(): Promise<string | null> {
    if (this._cachedCookies && Date.now() - this._cachedCookies.ts < 30_000) {
      return this._cachedCookies.str;
    }
    const page = this.tokenManager._page;
    if (!page) return null;
    const [labs, accounts] = await Promise.all([
      page.cookies('https://labs.google').catch(() => [] as any[]),
      page.cookies('https://accounts.google.com').catch(() => [] as any[]),
    ]);
    const seen = new Set<string>();
    const all = [...labs, ...accounts].filter((c: any) =>
      seen.has(c.name) ? false : (seen.add(c.name), true),
    );
    const str = all.map((c: any) => `${c.name}=${c.value}`).join('; ');
    this._cachedCookies = { str, ts: Date.now() };
    return str;
  }

  private async _httpRequest<T = unknown>(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: unknown = null,
  ): Promise<HttpResponse<T>> {
    const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined;
    if (bodyStr && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await gotScraping({
      url,
      method: method.toUpperCase() as any,
      headers,
      body: bodyStr,
      responseType: 'text',
      timeout: { request: 300_000 },
      throwHttpErrors: false,
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 125, maxVersion: 130 }],
        devices: ['desktop'],
        operatingSystems: ['windows'],
      },
    });
    let parsed: any = res.body;
    try {
      parsed = JSON.parse(res.body as string);
    } catch {
      // body may not be JSON
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { status: res.statusCode, headers: res.headers, body: parsed as T };
    }
    throw new ApiError(
      `API ${res.statusCode} ${method} ${new URL(url).pathname}`,
      res.statusCode,
      parsed,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
