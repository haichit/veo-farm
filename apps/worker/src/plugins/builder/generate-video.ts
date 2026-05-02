// Builder Canvas — generate_video node executor.
// Reuses Sprint 7B's Veo3FlowV2 pipeline (claim account → cookies pool browser
// → ApiClient.generateVideo → poll → CDP signed URL → curl download → upload).
// All the heavy lifting is in api-client.ts; this file just maps the Builder
// node's UI config (videoModel/ratio/duration/videoMode) to ApiClient options
// and wires inputs (prompt, ref images, start/end frames) from upstream nodes.

import path from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { ApiClient } from '../../_veo3_helpers/api-client.js';
import { TokenManager } from '../../_veo3_helpers/token-manager.js';
import { claimAccount, releaseAccount, decryptCookies } from '../../core/account-pool.js';
import { uploadBuffer, downloadFromUrl } from '../../core/storage.js';
import { logger } from '../../core/logger.js';
import { RateLimiter } from '../../core/concurrency.js';
import { RATE_LIMIT_DELAY_MS } from '../../_veo3_helpers/constants.js';

const PROFILES_DIR =
  process.env.WORKER_PROFILES_DIR ?? path.join(homedir(), '.veo-farm-profiles');

const rateLimiter = new RateLimiter(RATE_LIMIT_DELAY_MS);

// Builder UI uses string aliases; map them to Flow API '16:9' / '9:16'.
function mapAspect(ratio: string | undefined): '16:9' | '9:16' {
  if (ratio === 'portrait' || ratio === '9:16') return '9:16';
  return '16:9';
}

// UI Veo model selection → ApiClient model family.
// (Quality variants don't exist on the open Flow tier — fall back to fast.)
function mapModel(
  videoModel: string | undefined,
): 'veo_3_1_lite' | 'veo_3_1_fast' | 'veo_3_1_quality' {
  if (!videoModel) return 'veo_3_1_fast';
  if (videoModel.startsWith('veo31_lite')) return 'veo_3_1_lite';
  if (videoModel.startsWith('veo31_quality')) return 'veo_3_1_quality';
  return 'veo_3_1_fast';
}

export interface GenerateVideoNodeInput {
  /** Resolved prompt from upstream Text/Prompt node or this node's config. */
  prompt: string;
  /** Builder UI config block. */
  config: {
    ratio?: string;
    quantity?: number;
    quality?: string;
    videoModel?: string;
    /** 'FRAME' (start + optional end frame) or 'REF' (reference images). */
    videoMode?: string;
    /** 4 / 6 / 8 — Flow currently caps at 8s, longer values are clipped. */
    duration?: number;
  };
  /** Resolved input ports beyond the primary text. */
  refs?: {
    /** First-frame image (videoMode === 'FRAME'). */
    startImageUrl?: string;
    /** Last-frame image (videoMode === 'FRAME', optional). */
    endImageUrl?: string;
    /** Style/character reference images (videoMode === 'REF'). */
    referenceImageUrls?: string[];
  };
  userId: string;
  jobId: string;
}

export interface GenerateVideoNodeOutput {
  media: Array<{ url: string; kind: 'video' }>;
}

export async function runGenerateVideoNode(
  input: GenerateVideoNodeInput,
): Promise<GenerateVideoNodeOutput> {
  if (!input.prompt || input.prompt.trim().length === 0) {
    throw new Error('generate_video: prompt is empty (connect a Text/Prompt node)');
  }
  await rateLimiter.throttle();

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

  const tm = new TokenManager(
    {
      accountId: account.id,
      email: account.label,
      cookies: puppeteerCookies,
      projectId,
    },
    process.env.CAPTCHA_SERVER_URL ?? 'http://127.0.0.1:3456',
  );

  const browserExe = process.env.BRAVE_PATH ?? process.env.CHROME_PATH ?? undefined;
  const userDataDir = path.join(PROFILES_DIR, `veo3-${account.id}`);
  mkdirSync(userDataDir, { recursive: true });

  logger.info(
    { accountId: account.id, prompt: input.prompt.slice(0, 80) },
    'generate_video: launching browser',
  );
  await tm.launch({ headless: false, chromeExecutablePath: browserExe, userDataDir });

  try {
    const client = new ApiClient(tm, {
      paygateTier: 'PAYGATE_TIER_TWO',
      projectId: projectId ?? null,
    });

    // Optionally upload reference / frame images so they live in flow.google
    // (the API requires `mediaId`, not raw URLs).
    let startImageId: string | undefined;
    let endImageId: string | undefined;
    let refMediaIds: string[] = [];

    const mode = (input.config.videoMode ?? 'FRAME').toUpperCase();
    if (mode === 'FRAME') {
      if (input.refs?.startImageUrl) {
        const buf = await downloadFromUrl(input.refs.startImageUrl);
        const up = await client.uploadImage(buf, 'image/jpeg');
        startImageId = up.mediaId;
      }
      if (input.refs?.endImageUrl) {
        const buf = await downloadFromUrl(input.refs.endImageUrl);
        const up = await client.uploadImage(buf, 'image/jpeg');
        endImageId = up.mediaId;
      }
    } else if (mode === 'REF') {
      for (const url of input.refs?.referenceImageUrls ?? []) {
        const buf = await downloadFromUrl(url);
        const up = await client.uploadImage(buf, 'image/jpeg');
        refMediaIds.push(up.mediaId);
      }
    }

    logger.info(
      {
        mode,
        hasStart: !!startImageId,
        hasEnd: !!endImageId,
        refs: refMediaIds.length,
      },
      'generate_video: starting API call',
    );

    const startResult = await client.generateVideo(input.prompt, {
      aspectRatio: mapAspect(input.config.ratio),
      count: Math.max(1, Math.min(input.config.quantity ?? 1, 4)),
      model: mapModel(input.config.videoModel),
      startImageId,
      endImageId,
      referenceImages: refMediaIds.length > 0 ? refMediaIds : undefined,
    });

    const media = (startResult.media ?? []).map((m) => ({
      name: m.name,
      projectId: m.projectId,
    }));
    if (media.length === 0) throw new Error('generate_video: no media items returned');

    logger.info({ count: media.length }, 'generate_video: polling status');
    const pollResult = await client.waitForVideos(media, {
      onProgress: (_data, elapsed) => {
        if (elapsed % 30 === 0) logger.info({ elapsed }, 'generate_video: polling…');
      },
    });

    // Collect every successful clip — Flow can return multiple if count > 1.
    const successes = (pollResult.media ?? []).filter(
      (m) =>
        m.mediaMetadata?.mediaStatus?.mediaGenerationStatus ===
        'MEDIA_GENERATION_STATUS_SUCCESSFUL',
    );
    if (successes.length === 0) {
      const reasons = pollResult.media
        ?.map((m) => m.mediaMetadata?.mediaStatus?.failureReason)
        .filter(Boolean);
      throw new Error(
        `generate_video: all clips failed${reasons?.length ? ': ' + reasons.join(', ') : ''}`,
      );
    }

    const uploaded: Array<{ url: string; kind: 'video' }> = [];
    for (const success of successes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sa = success as any;
      const mediaName: string | undefined = sa.name ?? sa.video?.operation?.name;
      const successProjectId: string | undefined = sa.projectId ?? projectId;
      const workflowId: string | undefined = sa.workflowId;
      if (!mediaName || !successProjectId || !workflowId) {
        logger.warn(
          { mediaName, successProjectId, workflowId },
          'generate_video: missing identifiers, skipping clip',
        );
        continue;
      }

      logger.info({ mediaName }, 'generate_video: resolving signed CDN URL');
      const videoUri = await client.getVideoUrl(mediaName, successProjectId, workflowId);

      const buffer: Buffer = await new Promise((resolveBuf, rejectBuf) => {
        const chunks: Buffer[] = [];
        const p = spawn('curl', ['-sSL', '--fail', videoUri], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        p.stdout.on('data', (c) => chunks.push(c));
        let err = '';
        p.stderr.on('data', (c) => (err += c.toString()));
        p.on('close', (code) => {
          if (code === 0) resolveBuf(Buffer.concat(chunks));
          else rejectBuf(new Error(`curl exit ${code}: ${err}`));
        });
      });

      const publicUrl = await uploadBuffer(input.userId, input.jobId, buffer, 'mp4');
      uploaded.push({ url: publicUrl, kind: 'video' });
    }

    if (uploaded.length === 0) {
      throw new Error('generate_video: produced clips but failed to download any');
    }
    logger.info({ count: uploaded.length }, 'generate_video: complete');
    return { media: uploaded };
  } finally {
    await tm.close();
    await releaseAccount(account.id, 0, 'idle');
  }
}
