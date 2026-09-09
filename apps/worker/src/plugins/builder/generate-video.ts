// Builder Canvas — generate_video node executor.
// Reuses Sprint 7B's Veo3FlowV2 pipeline (claim account → cookies pool browser
// → ApiClient.generateVideo → poll → CDP signed URL → curl download → upload).
// All the heavy lifting is in api-client.ts; this file just maps the Builder
// node's UI config (videoModel/ratio/duration/videoMode) to ApiClient options
// and wires inputs (prompt, ref images, start/end frames) from upstream nodes.

import { spawn } from 'node:child_process';
import { ApiClient } from '../../_veo3_helpers/api-client.js';
import { acquireTokenManager, dropTokenManager } from '../../_veo3_helpers/browser-pool.js';
import { claimAccount, releaseAccount, decryptCookies } from '../../core/account-pool.js';
import { isCookiesExpiredError } from '../../core/account-expiry.js';
import { uploadBuffer, downloadFromUrl } from '../../core/storage.js';
import { logger } from '../../core/logger.js';
import { RateLimiter } from '../../core/concurrency.js';
import { RATE_LIMIT_DELAY_MS } from '../../_veo3_helpers/constants.js';

const rateLimiter = new RateLimiter(RATE_LIMIT_DELAY_MS);

// Builder UI uses string aliases; map them to Flow API '16:9' / '9:16'.
function mapAspect(ratio: string | undefined): '16:9' | '9:16' {
  if (ratio === 'portrait' || ratio === '9:16') return '9:16';
  return '16:9';
}

// UI Veo model selection → ApiClient model family.
// (Quality variants don't exist on the open Flow tier — fall back to fast.)
// flow.google's uploadImage rejects with 400 when the declared mime doesn't
// match the actual bytes. Sniff via URL extension first, then magic bytes.
function mimeFromUrl(url: string, buf: Buffer): string {
  const u = url.toLowerCase();
  if (u.includes('.png')) return 'image/png';
  if (u.includes('.webp')) return 'image/webp';
  if (u.includes('.gif')) return 'image/gif';
  if (u.includes('.jpg') || u.includes('.jpeg')) return 'image/jpeg';
  // Magic-byte fallback for Supabase signed URLs (no extension in path).
  if (buf.length >= 8) {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) return 'image/webp';
  }
  return 'image/png';
}

function mapModel(
  videoModel: string | undefined,
): 'veo_3_1_lite' | 'veo_3_1_fast' | 'veo_3_1_quality' {
  if (!videoModel) return 'veo_3_1_lite';
  if (videoModel.startsWith('veo31_lite')) return 'veo_3_1_lite';
  if (videoModel.startsWith('veo31_quality')) return 'veo_3_1_quality';
  if (videoModel.startsWith('veo31_fast')) return 'veo_3_1_fast';
  return 'veo_3_1_lite';
}

// Server enforces (tier × model) combinations:
//   - veo_3_1_lite, veo_3_1_quality → accessible on PAYGATE_TIER_ONE (free accounts)
//   - veo_3_1_fast → requires PAYGATE_TIER_TWO (Pro plan)
// Probed empirically against a free Google account: tier ONE accepts lite +
// quality, rejects fast with PUBLIC_ERROR_MODEL_ACCESS_DENIED. tier TWO accepts
// fast on Pro accounts. PAYGATE_TIER_FREE is NOT a valid enum (server 400s).
function defaultTierFor(
  model: 'veo_3_1_lite' | 'veo_3_1_fast' | 'veo_3_1_quality',
):
  | 'PAYGATE_TIER_ONE'
  | 'PAYGATE_TIER_TWO' {
  if (model === 'veo_3_1_fast') return 'PAYGATE_TIER_TWO';
  return 'PAYGATE_TIER_ONE';
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
    /** Optional pinned account id — bypasses round-robin for this node. */
    accountId?: string | null;
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

  const account = await claimAccount(input.userId, 'veo3', 5, input.config?.accountId ?? null);
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

  logger.info(
    { accountId: account.id, prompt: input.prompt.slice(0, 80) },
    'generate_video: acquiring browser',
  );
  const lease = await acquireTokenManager({
    accountId: account.id,
    email: account.label,
    cookies: puppeteerCookies,
    projectId,
  });

  let leaseHeld = true;
  try {
    let model = mapModel(input.config.videoModel);
    let tier = defaultTierFor(model);
    let client = new ApiClient(lease.tm, {
      paygateTier: tier,
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
        startImageId = await client.uploadImageV2(buf, mimeFromUrl(input.refs.startImageUrl, buf));
      }
      if (input.refs?.endImageUrl) {
        const buf = await downloadFromUrl(input.refs.endImageUrl);
        endImageId = await client.uploadImageV2(buf, mimeFromUrl(input.refs.endImageUrl, buf));
      }
    } else if (mode === 'REF') {
      for (const url of input.refs?.referenceImageUrls ?? []) {
        const buf = await downloadFromUrl(url);
        refMediaIds.push(await client.uploadImageV2(buf, mimeFromUrl(url, buf)));
      }
    }

    // Flow's new model ids read `veo_3_1_<mode>_<tier>[_low_priority]`
    // (confirmed live: "veo_3_1_r2v_lite_low_priority", and — as of the
    // 2026-09-07 HAR capture — "veo_3_1_interpolation_lite_low_priority" for
    // start+end frame together). Map the Builder's 'veo31_lite' /
    // 'veo31_fast_lower' / etc. onto tier + lowPriority.
    const lowPriority = (input.config.videoModel ?? '').endsWith('_lower');
    const tierName = model === 'veo_3_1_fast' ? 'fast' : model === 'veo_3_1_quality' ? 'quality' : 'lite';

    logger.info(
      { mode, tier: tierName, lowPriority, hasStart: !!startImageId, hasEnd: !!endImageId, refs: refMediaIds.length },
      'generate_video: starting API call (batchexecute)',
    );

    const items = await client.generateVideoV2(input.prompt, {
      tier: tierName,
      lowPriority,
      count: Math.max(1, Math.min(input.config.quantity ?? 1, 4)),
      refImageId: refMediaIds[0],
      startImageId,
      endImageId,
      aspectRatio: mapAspect(input.config.ratio),
    });

    logger.info({ count: items.length }, 'generate_video: polling for signed URL');
    const uploaded: Array<{ url: string; kind: 'video' }> = [];
    for (const item of items) {
      const videoUri = await client.pollMediaUrl(item.mediaId, item.projectId ?? projectId!);

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
  } catch (err) {
    if (leaseHeld) {
      lease.release();
      leaseHeld = false;
    }
    await dropTokenManager(account.id);

    const msg = (err as Error)?.message ?? String(err);
    if (isCookiesExpiredError(msg)) {
      logger.warn({ accountId: account.id, msg: msg.slice(0, 200) }, 'generate_video: marking account expired (cookies dead)');
      await releaseAccount(account.id, 0, 'expired', msg.slice(0, 500));
    } else {
      await releaseAccount(account.id, 0, 'idle');
    }
    throw err;
  } finally {
    if (leaseHeld) {
      lease.release();
      await releaseAccount(account.id, 0, 'idle');
    }
  }
}
