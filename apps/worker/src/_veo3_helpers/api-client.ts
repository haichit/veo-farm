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
  IMAGE_MODELS,
  IMAGE_ASPECT_RATIOS,
  ENDPOINT_BY_MODE,
  ENDPOINTS,
  POLICY_KEYWORDS,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  RETRY_MAX,
  type PaygateTier,
} from './constants.js';
import {
  captureSession,
  callBatchExecute,
  type BatchExecSession,
} from './batchexecute.js';
import { supabase } from '../core/supabase.js';
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

// Module-level cache of projectId per accountId so a 2nd generation on the
// same warm browser doesn't re-probe a (possibly post-navigation) page that
// no longer matches /project/<id>/. Cleared by dropTokenManager on error.
const _projectIdCache = new Map<string, string>();
export function clearProjectIdCache(accountId?: string): void {
  if (accountId) _projectIdCache.delete(accountId);
  else _projectIdCache.clear();
}

export class ApiClient extends EventEmitter {
  private _sessionId: string;
  private _paygateTier: PaygateTier;
  private _projectId: string | null;
  private _cachedCookies: { str: string; ts: number } | null = null;
  private _batchSession: BatchExecSession | null = null;

  constructor(private tokenManager: TokenManager, opts: ApiClientOptions = {}) {
    super();
    this._sessionId = ';' + Date.now();
    this._paygateTier = opts.paygateTier ?? 'PAYGATE_TIER_TWO';
    this._projectId = opts.projectId ?? null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Generate video(s) via the new `MZZa6b` batchexecute RPC — see
   * batchexecute.ts for why: Google replaced the whole aisandbox-pa REST API
   * (used by the old `generateVideo()` below) with this protocol in their
   * Sep 2026 Angular rewrite. Confirmed against a real HAR capture for the
   * r2v (reference-image) case; t2v (plain prompt) is inferred by analogy
   * with how ogiZ0b's null-ref case works — re-check `modelString` and the
   * per-item shape first if this throws.
   *
   * Returns media ids (not URLs yet) — pass each to pollMediaUrl to get the
   * signed download link once generation finishes.
   */
  async generateVideoV2(
    prompt: string,
    opts: {
      /** 'lite' | 'fast' | 'quality' — matches the tier segment in Flow's own model ids. */
      tier?: string;
      lowPriority?: boolean;
      count?: number;
      /** Reference-image video (style/character ref, no fixed first frame). */
      refImageId?: string;
      /** Start-frame video — the generated clip opens on this exact image. */
      startImageId?: string;
      /** End-frame — combined with startImageId, interpolates between both. */
      endImageId?: string;
      /** '16:9' | '9:16' — only wired through for r2v so far (HAR-confirmed
       * 2026-09-08); other modes still default to landscape until their
       * ratio field position is confirmed against a live capture. */
      aspectRatio?: '16:9' | '9:16';
    } = {},
  ): Promise<Array<{ mediaId: string; projectId: string }>> {
    const projectId = await this._ensureProject();
    const page = this.tokenManager._page;
    if (!page) throw new Error('generateVideoV2: no browser page available');
    const session = await this._getBatchSession(page);
    const recaptchaToken = await this.tokenManager.getRecaptchaToken('VIDEO_GENERATION');
    const count = Math.max(1, Math.min(opts.count ?? 1, 4));
    const tier = opts.tier ?? 'lite';
    const mode =
      opts.startImageId && opts.endImageId
        ? 'interpolation'
        : opts.startImageId
          ? 'i2v'
          : opts.refImageId
            ? 'r2v'
            : 't2v';
    const modelString = `veo_3_1_${mode}_${tier}${opts.lowPriority ? '_low_priority' : ''}`;

    const argsJson = this._buildVideoGenArgsJson({
      prompt,
      modelString,
      projectId,
      recaptchaToken,
      count,
      refImageId: opts.refImageId,
      startImageId: opts.startImageId,
      endImageId: opts.endImageId,
      refAspectRatioNum: opts.aspectRatio === '9:16' ? 1 : 2,
    });
    const sourcePath = `/project/${projectId}`;
    // Confirmed live: t2v / r2v (reference-image) / i2v (start-frame) /
    // interpolation (start+end frame) are FOUR DIFFERENT rpcids, not one
    // rpcid with optional fields — t2v = YhhmEf, r2v = MZZa6b, i2v = eb1hJf,
    // interpolation = nprQif (HAR-confirmed 2026-09-07).
    const rpcid =
      opts.startImageId && opts.endImageId
        ? 'nprQif'
        : opts.startImageId
          ? 'eb1hJf'
          : opts.refImageId
            ? 'MZZa6b'
            : 'YhhmEf';

    this.emit('video:generating', { prompt, model: modelString, count });
    const payload = await callBatchExecute(page, session, rpcid, argsJson, sourcePath);
    const items = this._extractGeneratedMedia(payload);
    if (items.length === 0) {
      throw new Error(
        `generateVideoV2: no media in MZZa6b response — ${JSON.stringify(payload).slice(0, 400)}`,
      );
    }
    this.emit('video:started', items);
    return items;
  }

  /**
   * Poll `as29s` until the signed flow-content.google URL for `mediaId`
   * appears (works for both images and videos). Public wrapper around the
   * private helper generateImages() also uses.
   */
  async pollMediaUrl(
    mediaId: string,
    projectId: string,
    kind: 'image' | 'video' = 'video',
    timeoutMs?: number,
  ): Promise<string> {
    const page = this.tokenManager._page;
    if (!page) throw new Error('pollMediaUrl: no browser page available');
    const session = await this._getBatchSession(page);
    return this._pollMediaUrl(page, session, mediaId, projectId, kind, timeoutMs);
  }

  /**
   * Build the `MZZa6b` (generate video) positional-array payload. Same
   * "constant" caveat as _buildImageGenArgsJson — position 3 (`2`) below is
   * copied verbatim from every capture; meaning unconfirmed.
   */
  private _buildVideoGenArgsJson(opts: {
    prompt: string;
    modelString: string;
    projectId: string;
    recaptchaToken: string;
    count: number;
    refImageId?: string;
    startImageId?: string;
    endImageId?: string;
    /** Numeric aspect-ratio enum — only confirmed for the r2v shape so far
     * (HAR 2026-09-08: 16:9=2, 9:16=1). t2v/i2v/interpolation don't use this
     * value yet — their "1" is the (separately confirmed) count field. */
    refAspectRatioNum?: number;
  }): string {
    const toolConfig = [
      null,
      22, // constant — see _buildImageGenArgsJson
      null,
      null,
      null,
      opts.projectId,
      null,
      null,
      null,
      null,
      [opts.recaptchaToken, 1],
    ];
    // Confirmed live: t2v / r2v / i2v are each shaped differently — not one
    // shape with an optional ref field. r2v inserts a ref-image array right
    // after the prompt; i2v instead inserts `[null, mediaId]` AFTER the
    // model+mode-enum+null triplet; t2v omits that slot entirely (its
    // per-item array is 1 element shorter than the other two).
    const items = Array.from({ length: opts.count }, () => {
      const sessionGuid = crypto.randomUUID().toUpperCase();
      const requestGuid = crypto.randomUUID().toUpperCase();
      const promptWrap = [null, null, [[[opts.prompt]]]];
      const guidArr = [null, null, null, null, sessionGuid, requestGuid];
      // interpolation (start+end frame): HAR-confirmed 2026-09-07 — both
      // frames use the "long" media-ref form ([null,id,null,null,null,
      // [null,null,1,1]]), same shape r2v uses for its ref image, unlike
      // plain i2v's short [null,mediaId] form below.
      if (opts.startImageId && opts.endImageId) {
        const longRef = (id: string) => [null, id, null, null, null, [null, null, 1, 1]];
        return [
          promptWrap,
          opts.modelString,
          1,
          null,
          longRef(opts.startImageId),
          longRef(opts.endImageId),
          guidArr,
        ];
      }
      if (opts.startImageId) {
        return [promptWrap, opts.modelString, 1, null, [null, opts.startImageId], guidArr];
      }
      if (opts.refImageId) {
        const refArr = [[null, opts.refImageId, null, null, null, [null, null, 1, 1]]];
        return [promptWrap, refArr, opts.modelString, opts.refAspectRatioNum ?? 2, null, guidArr];
      }
      return [promptWrap, opts.modelString, 1, null, guidArr];
    });
    const batchGuid = crypto.randomUUID().toUpperCase();
    return JSON.stringify([items, toolConfig, [batchGuid, opts.count]]);
  }

  /**
   * Upload an image via `maseQ` — needed before generating an i2v
   * (start-frame) or r2v (reference-image) video, since both take a
   * previously-uploaded mediaId, not raw bytes.
   */
  async uploadImageV2(buffer: Buffer, mimeType: string, filename = 'image.png'): Promise<string> {
    const projectId = await this._ensureProject();
    const page = this.tokenManager._page;
    if (!page) throw new Error('uploadImageV2: no browser page available');
    const session = await this._getBatchSession(page);
    const recaptchaToken = await this.tokenManager.getRecaptchaToken('IMAGE_UPLOAD');
    const toolConfig = [
      null,
      22,
      null,
      null,
      null,
      projectId,
      null,
      null,
      null,
      null,
      [recaptchaToken, 1],
    ];
    const sessionGuid = crypto.randomUUID().toUpperCase();
    const requestGuid = crypto.randomUUID().toUpperCase();
    const argsJson = JSON.stringify([
      toolConfig,
      buffer.toString('base64'),
      mimeType,
      1,
      null,
      null,
      null,
      null,
      filename,
      null,
      sessionGuid,
      requestGuid,
    ]);
    const sourcePath = `/project/${projectId}`;
    const payload = await callBatchExecute(page, session, 'maseQ', argsJson, sourcePath);
    const mediaId = Array.isArray(payload) ? (payload as unknown[][])[0]?.[0] : undefined;
    if (typeof mediaId !== 'string') {
      throw new Error(
        `uploadImageV2: no mediaId in maseQ response — ${JSON.stringify(payload).slice(0, 300)}`,
      );
    }
    return mediaId;
  }

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

  /**
   * Generate one or more images via flow.google `flowMedia:batchGenerateImages`.
   * Returns an array of direct CDN URLs (`fifeUrl`) — no polling needed since
   * the response carries `media[].image.generatedImage.fifeUrl` synchronously.
   *
   * Supported model values: 'nano_banana_2' | 'nano_banana_pro' | 'imagen_4'
   * | 'imagen_4_ref'.
   * Supported aspect ratios: '16:9' | '9:16' | '1:1' | '4:3' | '3:4'.
   */
  async generateImages(
    prompt: string,
    opts: {
      model?: keyof typeof IMAGE_MODELS;
      aspectRatio?: keyof typeof IMAGE_ASPECT_RATIOS;
      seed?: number;
      count?: number;
      referenceImages?: Array<string | { mediaId: string; name?: string }>;
    } = {},
  ): Promise<string[]> {
    // Google replaced Flow's frontend + API entirely (Sep 2026): the old
    // aisandbox-pa.googleapis.com REST endpoint this method used to call is
    // gone — the live Angular app talks exclusively through the
    // `batchexecute` RPC transport. See batchexecute.ts for the protocol
    // notes. Reverse-engineered from a real HAR capture.
    const projectId = await this._ensureProject();
    const page = this.tokenManager._page;
    if (!page) throw new Error('generateImages: no browser page available');
    const session = await this._getBatchSession(page);
    const recaptchaToken = await this.tokenManager.getRecaptchaToken('IMAGE_GENERATION');
    const imageModelName = IMAGE_MODELS[opts.model ?? 'nano_banana_2'] ?? 'NARWHAL';
    const count = Math.max(1, Math.min(opts.count ?? 1, 4));
    const refImageId = (opts.referenceImages ?? [])
      .map((r) => (typeof r === 'string' ? r : r.mediaId))
      .find(Boolean);
    // HAR-confirmed 2026-09-08: this per-item numeric field is the aspect
    // ratio enum — 16:9 (the untouched default in every earlier capture) is
    // 3, and switching the UI to 9:16 flipped it to 2. Other ratios (1:1,
    // 4:3, 3:4) aren't confirmed yet — fall back to the known-safe default
    // (3 / 16:9) rather than guess and risk another INVALID_ARGUMENT.
    const aspectRatioNum = opts.aspectRatio === '9:16' ? 2 : 3;

    const argsJson = this._buildImageGenArgsJson({
      prompt,
      aspectRatioNum,
      model: imageModelName,
      projectId,
      recaptchaToken,
      count,
      refImageId,
    });
    const sourcePath = `/project/${projectId}`;

    this.emit('image:generating', { prompt, model: imageModelName, count });
    const payload = await callBatchExecute(page, session, 'ogiZ0b', argsJson, sourcePath);
    // Unlike video (MZZa6b), image generation returns the signed
    // flow-content.google download URL synchronously in the ogiZ0b response
    // itself — no polling needed. Confirmed against a real response:
    // payload[0][*][*][6] carries `[...,"https://flow-content.google/image/<id>?Expires=...", ...]`
    // Regex the re-stringified payload rather than depend on that exact
    // position — cheaper to keep working if Google reshuffles fields again.
    const text = JSON.stringify(payload);
    const urls = Array.from(
      text.matchAll(/https:\/\/flow-content\.google\/image\/[^"\\]+/g),
      (m) => m[0],
    );
    if (urls.length === 0) {
      throw new Error(`generateImages: no download URL in ogiZ0b response — ${text.slice(0, 400)}`);
    }
    this.emit('image:complete', { urls });
    return urls;
  }

  /**
   * Build the `ogiZ0b` (generate image) positional-array payload. Field
   * meanings marked "constant" were observed identical across every
   * captured sample regardless of prompt/model/ref-image — kept verbatim
   * rather than guessed at.
   */
  private _buildImageGenArgsJson(opts: {
    prompt: string;
    model: string;
    projectId: string;
    recaptchaToken: string;
    count: number;
    refImageId?: string;
    /** Numeric aspect-ratio enum for the per-item payload — see
     * IMAGE_ASPECT_RATIO_NUMERIC below for what's actually confirmed. */
    aspectRatioNum: number;
  }): string {
    const toolConfig = [
      null,
      22, // constant across every capture — purpose unknown (tool/surface enum?)
      null,
      null,
      null,
      opts.projectId,
      null,
      null,
      null,
      null,
      [opts.recaptchaToken, 1],
    ];
    const items = Array.from({ length: opts.count }, () => {
      const bigNum = Math.floor(Math.random() * 2 ** 31); // per-item nonce, meaning unconfirmed
      const sessionGuid = crypto.randomUUID().toUpperCase();
      const requestGuid = crypto.randomUUID().toUpperCase();
      const refArr = opts.refImageId ? [[opts.refImageId, null, null, null, 1]] : null;
      return [
        null,
        null,
        refArr,
        bigNum,
        opts.aspectRatioNum,
        opts.model,
        null,
        toolConfig,
        [[[opts.prompt]]],
        null,
        null,
        null,
        sessionGuid,
        requestGuid,
      ];
    });
    const batchGuid = crypto.randomUUID().toUpperCase();
    return JSON.stringify([null, items, opts.count, toolConfig, [batchGuid]]);
  }

  /**
   * Both `ogiZ0b` (image) and `MZZa6b` (video) responses carry the same
   * ops-list shape at payload[2]: each op is
   *   [opId, null, null, [title, [ts], null, null, mediaId, batchGuid, [ts]], projectId]
   * — confirmed against a real MZZa6b response; ogiZ0b's response shape is
   * inferred by analogy (no captured sample yet) so this is the first thing
   * to re-check if generateImages() throws "no media in ogiZ0b response".
   */
  private _extractGeneratedMedia(payload: unknown): Array<{ mediaId: string; projectId: string }> {
    const ops = Array.isArray(payload) ? (payload as any[])[2] : null;
    if (!Array.isArray(ops)) return [];
    const out: Array<{ mediaId: string; projectId: string }> = [];
    for (const op of ops) {
      const detail = op?.[3];
      const mediaId = Array.isArray(detail) ? detail[4] : undefined;
      const opProjectId = op?.[4];
      if (typeof mediaId === 'string') out.push({ mediaId, projectId: opProjectId });
    }
    return out;
  }

  /**
   * Poll `as29s` (get media details) for a signed flow-content.google
   * download URL of the given `kind`. Rather than parse the exact response
   * shape (unconfirmed for the "not ready yet" case), just regex the whole
   * re-stringified payload for the URL pattern — structure-agnostic and
   * confirmed to match a real completed response.
   *
   * IMPORTANT: a video's media id resolves to an `image/` (poster/thumbnail)
   * URL FIRST, well before the actual `video/` URL is ready — confirmed by
   * comparing two real captures of the same in-flight generation. Matching
   * either kind (as an earlier version of this function did) downloads the
   * poster frame instead of the clip. Callers must pass the kind they
   * actually want and this keeps polling past an early image match.
   */
  private async _pollMediaUrl(
    page: NonNullable<TokenManager['_page']>,
    session: BatchExecSession,
    mediaId: string,
    projectId: string,
    kind: 'image' | 'video' = 'image',
    timeoutMs = POLL_TIMEOUT_MS,
  ): Promise<string> {
    const sourcePath = `/project/${projectId}`;
    const start = Date.now();
    const pattern = new RegExp(`https:\\/\\/flow-content\\.google\\/${kind}\\/[^"\\\\]+`);
    while (Date.now() - start < timeoutMs) {
      try {
        const payload = await callBatchExecute(
          page,
          session,
          'as29s',
          JSON.stringify([mediaId]),
          sourcePath,
        );
        const text = JSON.stringify(payload);
        const m = text.match(pattern);
        if (m) return m[0];
      } catch {
        // not ready yet, or a transient hiccup — keep polling
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(
      `_pollMediaUrl: timed out after ${timeoutMs}ms waiting for ${kind} media ${mediaId}`,
    );
  }

  private async _getBatchSession(page: NonNullable<TokenManager['_page']>): Promise<BatchExecSession> {
    if (this._batchSession) return this._batchSession;
    const sessionPromise = captureSession(page, 20_000);
    // Need a REAL navigation to trigger the SPA's bootstrap telemetry calls
    // (what captureSession listens for). page.reload() is a no-op when the
    // page never actually navigated anywhere yet (still about:blank — true
    // whenever _ensureProject() resolved from cache without ever calling
    // page.goto), so it fires no new requests and the listener hangs until
    // timeout. Navigate to the known project URL when we have one (cheaper
    // than root — lands straight on the real app, not the marketing page).
    const target = this._projectId ? `${LABS_BASE}/project/${this._projectId}` : `${LABS_BASE}/`;
    if (page.url() === target) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    } else {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    }
    this._batchSession = await sessionPromise;
    return this._batchSession;
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

  /**
   * Resolve the signed CDN URL for a generated video by navigating the editor page
   * and intercepting the `flow-content.google/video/<name>?Expires=...&Signature=...`
   * request via CDP. The resulting URL is self-contained (signed, no auth required) —
   * download it with plain Node fetch.
   */
  async getVideoUrl(
    mediaName: string,
    projectId: string,
    workflowId: string,
    opts: { timeoutMs?: number } = {},
  ): Promise<string> {
    const timeout = opts.timeoutMs ?? 90_000;
    const page = (this.tokenManager as any)._page;
    const cdp = (this.tokenManager as any)._cdp;
    if (!page || !cdp) throw new Error('getVideoUrl: no browser page/CDP available');

    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

    let captured: string | null = null;
    const handler = (ev: any) => {
      const url: string = ev.response?.url ?? '';
      if (
        url.includes('flow-content.google/video/') &&
        url.includes(mediaName) &&
        !captured
      ) {
        captured = url;
      }
    };
    cdp.on('Network.responseReceived', handler);

    try {
      const editorUrl = `${LABS_BASE}/project/${projectId}/edit/${workflowId}`;

      // Up to 3 attempts: navigate (or reload) and wait for the video request.
      // Veo sometimes serves the editor page before the new clip's <video> element
      // has been mounted, so a reload after ~30s is what kicks the fetch.
      for (let attempt = 0; attempt < 3 && !captured; attempt++) {
        if (attempt === 0) {
          await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        } else {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
        }
        const perAttempt = Math.ceil(timeout / 3);
        const start = Date.now();
        while (!captured && Date.now() - start < perAttempt) {
          await sleep(500);
        }
      }

      // Fallback: read <video src> from DOM (browser may have used cached request
      // from earlier scenes — handler doesn't see cached URLs even with cache disabled).
      if (!captured) {
        try {
          const domSrc = await page.evaluate((name: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const doc: any = (globalThis as any).document;
            if (!doc) return null;
            const vids: any[] = Array.from(doc.querySelectorAll('video'));
            for (const v of vids) {
              const src: string = v.currentSrc || v.src || '';
              if (src && src.includes('flow-content.google/video/') && src.includes(name)) {
                return src;
              }
            }
            return null;
          }, mediaName);
          if (typeof domSrc === 'string' && domSrc.length > 0) captured = domSrc;
        } catch {
          /* ignore */
        }
      }
    } finally {
      cdp.off('Network.responseReceived', handler);
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: false }).catch(() => {});
    }

    if (!captured) throw new Error(`getVideoUrl: no signed URL captured within ${timeout}ms`);
    return captured;
  }

  async uploadImage(
    source: Buffer | string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy signature
    _mimeType: string = 'image/jpeg',
  ): Promise<UploadImageResponse> {
    const buffer = typeof source === 'string' ? fs.readFileSync(source) : source;
    const projectId = await this._ensureProject();
    // Body shape lifted from reverse-engineered Flow client v1.5.0:
    //   { clientContext: { projectId, tool }, imageBytes: <base64> }
    // Mime is detected server-side from the bytes; passing wrong mime in
    // the body causes 400 (the bug we just hit). Keep the parameter for
    // back-compat with callers that pass it but don't send it on the wire.
    const body = {
      clientContext: { projectId, tool: TOOL_NAME },
      imageBytes: buffer.toString('base64'),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await this._apiRequest<any>('POST', ENDPOINTS.uploadImage, body);
    const mediaId =
      res.body?.media?.name ??
      res.body?.mediaId ??
      res.body?.name;
    if (!mediaId) {
      throw new Error(
        `uploadImage: no mediaId in response: ${JSON.stringify(res.body).slice(0, 300)}`,
      );
    }
    return { mediaId } as UploadImageResponse;
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

  /**
   * Persist a newly-discovered projectId onto `accounts.meta.projectId` so
   * the NEXT worker process (or a plain restart) can skip the DOM-scan
   * discovery entirely — that scan is flaky (it depends on Flow's dashboard
   * actually rendering project cards; has landed on `/about` instead at
   * least once). generate-image.ts / generate-video.ts already read
   * `meta.projectId` and pass it in as the ApiClient's initial projectId,
   * which short-circuits `_ensureProject()` on its very first check.
   * Best-effort — a failure here shouldn't fail the generation itself.
   */
  private _persistProjectId(accountId: string | undefined, projectId: string): void {
    if (!accountId) return;
    void (async () => {
      try {
        const { data } = await supabase()
          .from('accounts')
          .select('meta')
          .eq('id', accountId)
          .maybeSingle();
        const meta = (data?.meta as Record<string, unknown>) ?? {};
        if (meta.projectId === projectId) return;
        await supabase()
          .from('accounts')
          .update({ meta: { ...meta, projectId } })
          .eq('id', accountId);
      } catch {
        // best-effort — DOM-scan discovery still works next time, just slower
      }
    })();
  }

  private async _ensureProject(): Promise<string> {
    if (this._projectId) return this._projectId;

    // Strategy 0: cross-instance cache. Each generate_image / generate_video
    // call creates a NEW ApiClient even when reusing the warm browser. Once
    // any client resolves projectId for a session, subsequent ones inherit it
    // without re-probing the page (which often fails after navigation).
    const sessionKey = (this.tokenManager as unknown as { _account?: { accountId?: string } })._account?.accountId;
    if (sessionKey && _projectIdCache.has(sessionKey)) {
      this._projectId = _projectIdCache.get(sessionKey)!;
      return this._projectId;
    }

    // Strategy 1: detect existing project from current Brave page URL.
    const page = this.tokenManager._page;
    if (page) {
      const m = page.url().match(/\/project\/([a-f0-9-]{8,})/i);
      if (m) {
        this._projectId = m[1];
        if (sessionKey) _projectIdCache.set(sessionKey, m[1]);
        this._persistProjectId(sessionKey, m[1]);
        return this._projectId;
      }
    }

    // Strategy 2: parse the Flow dashboard for an existing project anchor and navigate to it.
    if (page) {
      try {
        await page.goto(`${LABS_BASE}/`, { waitUntil: 'domcontentloaded' });
        // Poll for anchors to mount — SPA renders project list async.
        let existingId: string | null = null;
        const startPoll = Date.now();
        while (Date.now() - startPoll < 20_000 && !existingId) {
          await new Promise((r) => setTimeout(r, 1000));
          existingId = await page.evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const doc: any = (globalThis as any).document;
            if (!doc) return null;
            const html: string = doc.documentElement?.outerHTML ?? '';
            const m = html.match(/\/project\/([a-f0-9-]{8,})/i);
            return m ? m[1] : null;
          });
        }
        if (existingId) {
          this._projectId = existingId;
          if (sessionKey) _projectIdCache.set(sessionKey, existingId);
          await page
            .goto(`${LABS_BASE}/project/${existingId}`, {
              waitUntil: 'domcontentloaded',
            })
            .catch(() => {});
          this._persistProjectId(sessionKey, existingId);
          return existingId;
        }
      } catch {
        // fall through
      }
    }

    // Strategies 3a/3b used to list/create a project via `/fx/api/trpc/...`
    // — that whole tRPC API is gone since Google's Sep 2026 Angular rewrite
    // (those routes now 400/405 with an HTML error page, not JSON), and no
    // replacement endpoint has been identified yet. Strategy 2 above (scan
    // the live, hydrated DOM for a `/project/<id>` anchor) is the only
    // resolution path left — if the account genuinely has zero projects in
    // Flow, there is currently no way for the worker to create one.
    //
    // Final debug dump on failure. Uses os.tmpdir() (was hard-coded to
    // `/tmp`, which doesn't exist on Windows — silently swallowed this
    // entire debug dump there, which is why past failures showed no URL).
    if (page) {
      try {
        const os = await import('node:os');
        const path = await import('node:path');
        const fs = await import('node:fs');
        const pngPath = path.join(os.tmpdir(), 'flow-projectid-debug.png');
        const htmlPath = path.join(os.tmpdir(), 'flow-projectid-debug.html');
        await page.screenshot({ path: pngPath as `${string}.png`, fullPage: true });
        fs.writeFileSync(htmlPath, await page.content());
        throw new Error(
          `No Flow project found for this account. URL=${page.url()}, debug=${pngPath}`,
        );
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('No Flow project found')) throw e;
      }
    }
    throw new Error('No Flow project found for this account — open Flow manually and create one first.');
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
    // Bump retry budget for transient network failures. Google's edge
    // randomly RSTs connections (socket hang up / ECONNRESET) and a single
    // retry isn't enough — give it 5 attempts with progressive backoff.
    const NET_RETRY_MAX = 5;
    const TRANSIENT_NET_PATTERNS = [
      'socket hang up',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EAI_AGAIN',
      'EPIPE',
      'fetch failed',
      'Premature close',
      'Client network socket disconnected',
    ];
    for (let attempt = 1; attempt <= NET_RETRY_MAX; attempt++) {
      try {
        const token = await this.tokenManager.getToken();
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain;charset=UTF-8',
          Origin: LABS_BASE,
          Referer: LABS_BASE + '/',
          'User-Agent': USER_AGENT,
          'sec-ch-ua': SEC_CH_UA,
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': SEC_CH_UA_PLATFORM,
        };
        return await this._httpRequest<T>(method, url, headers, body);
      } catch (err) {
        lastErr = err;
        if (!(err instanceof ApiError)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msg = String((err as any)?.message ?? err);
          const isTransient = TRANSIENT_NET_PATTERNS.some((p) => msg.includes(p));
          if (isTransient && attempt < NET_RETRY_MAX) {
            // Progressive backoff: 3s, 6s, 12s, 24s. Re-fetch bearer token
            // on retry — the original may have been invalidated by Google
            // alongside the RST.
            await sleep(3000 * Math.pow(2, attempt - 1));
            try {
              await this.tokenManager.getToken();
            } catch {
              /* token refresh may also fail transiently — keep retrying */
            }
            continue;
          }
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
          // Friendlier Vietnamese message for the most common reject — Google
          // blocks images naming real public figures (politicians, celebrities,
          // athletes). User has to rewrite the prompt without the name.
          if (bodyStr.includes('PROMINENT_PEOPLE_FILTER_FAILED')) {
            throw new Error(
              'POLICY_VIOLATION: Google chặn ảnh có tên nhân vật nổi tiếng (chính khách / người của công chúng). ' +
                'Bỏ tên cụ thể trong prompt và mô tả bằng đặc điểm chung (vd: "một người đàn ông trung niên mặc vest đen phát biểu") rồi thử lại.',
            );
          }
          throw new Error(`POLICY_VIOLATION: ${bodyStr.substring(0, 500)}`);
        }
        // 403 with re-solvable cause: rotate recaptcha session, fetch a
        // fresh token, retry. Covers UNUSUAL_ACTIVITY *and* generic
        // "reCAPTCHA evaluation failed" / PERMISSION_DENIED from Google's
        // verifier — both mean the previous token was rejected and a new
        // one needs to be minted from a freshened session.
        const isRecaptchaReject =
          bodyStr.includes('PUBLIC_ERROR_UNUSUAL_ACTIVITY') ||
          bodyStr.includes('reCAPTCHA evaluation failed') ||
          (bodyStr.includes('reCAPTCHA') && bodyStr.includes('PERMISSION_DENIED'));
        // Anti-bot recaptcha rejects: get a more generous retry budget than
        // the default RETRY_MAX (3). Each rotate does a full page navigate +
        // ~10s settle, so cap at 5 attempts and back off harder (15s, 30s,
        // 60s, 120s) — gives Google's bot fingerprint time to cool off.
        const RECAPTCHA_RETRY_MAX = 5;
        if (status === 403 && isRecaptchaReject && attempt < RECAPTCHA_RETRY_MAX) {
          await this.tokenManager._rotateRecaptchaSession?.('UNUSUAL_ACTIVITY');
          if (body?.clientContext?.recaptchaContext) {
            body.clientContext.recaptchaContext.token = await this.tokenManager.getRecaptchaToken(
              recaptchaAction,
            );
          }
          // Exponential backoff — give Google's anti-bot a longer cooldown
          // each round so the session looks less automated.
          await sleep(Math.min(15_000 * Math.pow(2, attempt - 1), 120_000));
          continue;
        }
        if (status === 429 && attempt < RETRY_MAX) {
          await sleep(Math.min(60_000 * attempt, 300_000));
          continue;
        }
        // 401 UNAUTHENTICATED: cached Bearer expired/revoked. Drop it and
        // force a navigate-and-intercept cycle, then retry. Cookies still
        // valid → token refreshes silently. Cookies expired → next getToken
        // throws and we surface the real auth failure on the final attempt.
        if (status === 401 && attempt < RETRY_MAX) {
          this.tokenManager.invalidateBearer();
          try {
            await this.tokenManager.getToken();
            await sleep(1000 * attempt);
            continue;
          } catch {
            /* fall through to throw below */
          }
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
      Referer: LABS_BASE + '/',
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
      page.cookies(LABS_BASE).catch(() => [] as any[]),
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
    // Surface enough of the body in the error message that callers (and the
    // node-error display in the UI) can see what Google actually rejected.
    const bodySnippet =
      typeof parsed === 'object' && parsed
        ? JSON.stringify(parsed).slice(0, 400)
        : String(parsed ?? '').slice(0, 400);
    throw new ApiError(
      `API ${res.statusCode} ${method} ${new URL(url).pathname} — ${bodySnippet}`,
      res.statusCode,
      parsed,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
