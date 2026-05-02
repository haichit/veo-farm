// Builder Canvas — generate_image node executor.
// Real implementation that drives flow.google through the Sprint 7B cookies
// pool (same auth path as Veo3 video). Returns N image URLs hosted on
// Supabase Storage so the browser doesn't have to hit Google CDN directly.
//
// Browser is reused across calls via the browser-pool — first job per
// account pays the cold start, subsequent jobs reuse the warm browser
// (saves ~55s/job).

import { spawn } from 'node:child_process';
import { ApiClient } from '../../_veo3_helpers/api-client.js';
import { acquireTokenManager, dropTokenManager } from '../../_veo3_helpers/browser-pool.js';
import { claimAccount, releaseAccount, decryptCookies } from '../../core/account-pool.js';
import { uploadBuffer } from '../../core/storage.js';
import { logger } from '../../core/logger.js';
import {
  IMAGE_MODELS,
  IMAGE_ASPECT_RATIOS,
  RATE_LIMIT_DELAY_MS,
} from '../../_veo3_helpers/constants.js';
import { RateLimiter } from '../../core/concurrency.js';

// One in-flight generation at a time per worker process — prevents flow.google
// from rate-limiting our cookies pool.
const rateLimiter = new RateLimiter(RATE_LIMIT_DELAY_MS);

// Map UI ratio strings (16:9 / portrait / etc.) → Flow aspect enum keys.
function mapAspect(ratio: string | undefined): keyof typeof IMAGE_ASPECT_RATIOS {
  switch (ratio) {
    case 'portrait':
    case '9:16':
      return '9:16';
    case 'square':
    case '1:1':
      return '1:1';
    case '4_3':
    case '4:3':
      return '4:3';
    case '3_4':
    case '3:4':
      return '3:4';
    case 'landscape':
    case '16:9':
    default:
      return '16:9';
  }
}

function mapModel(model: string | undefined): keyof typeof IMAGE_MODELS {
  if (model === 'nano_banana_pro') return 'nano_banana_pro';
  if (model === 'imagen_4') return 'imagen_4';
  if (model === 'imagen_4_ref') return 'imagen_4_ref';
  return 'nano_banana_2';
}

export interface GenerateImageNodeInput {
  /** Resolved prompt text from upstream Text/Prompt node or this node's config. */
  prompt: string;
  /** UI config block from the workflow node (data.config). */
  config: {
    ratio?: string;
    quantity?: number;
    quality?: string;
    imageModel?: string;
  };
  /** Owner of the run — used for storage key prefix and account claim. */
  userId: string;
  /** Parent job id — used for storage key prefix. */
  jobId: string;
}

export interface GenerateImageNodeOutput {
  media: Array<{ url: string; kind: 'image' }>;
}

export async function runGenerateImageNode(
  input: GenerateImageNodeInput,
): Promise<GenerateImageNodeOutput> {
  if (!input.prompt || input.prompt.trim().length === 0) {
    throw new Error('generate_image: prompt is empty (connect a Text/Prompt node)');
  }
  await rateLimiter.throttle();

  // Reuse the same provider id Veo3 plugins use — same Google account works
  // for both image and video. Provider registered as 'veo3' in the UI.
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

  logger.info(
    { accountId: account.id, prompt: input.prompt.slice(0, 80) },
    'generate_image: acquiring browser',
  );
  const lease = await acquireTokenManager({
    accountId: account.id,
    email: account.label,
    cookies: puppeteerCookies,
    projectId,
  });

  let leaseHeld = true;
  try {
    const client = new ApiClient(lease.tm, {
      paygateTier: 'PAYGATE_TIER_TWO',
      projectId: projectId ?? null,
    });

    const fifeUrls = await client.generateImages(input.prompt, {
      aspectRatio: mapAspect(input.config.ratio),
      count: Math.max(1, Math.min(input.config.quantity ?? 1, 4)),
      model: mapModel(input.config.imageModel),
    });

    logger.info({ urls: fifeUrls.length }, 'generate_image: got fifeUrls, downloading');

    const uploaded: Array<{ url: string; kind: 'image' }> = [];
    for (const fife of fifeUrls) {
      // curl avoids Node fetch's TLS fingerprint which Google sometimes resets.
      const buffer: Buffer = await new Promise((resolveBuf, rejectBuf) => {
        const chunks: Buffer[] = [];
        const p = spawn('curl', ['-sSL', '--fail', fife], { stdio: ['ignore', 'pipe', 'pipe'] });
        p.stdout.on('data', (c) => chunks.push(c));
        let err = '';
        p.stderr.on('data', (c) => (err += c.toString()));
        p.on('close', (code) => {
          if (code === 0) resolveBuf(Buffer.concat(chunks));
          else rejectBuf(new Error(`curl exit ${code}: ${err}`));
        });
      });
      const publicUrl = await uploadBuffer(input.userId, input.jobId, buffer, 'png');
      uploaded.push({ url: publicUrl, kind: 'image' });
    }

    logger.info({ count: uploaded.length }, 'generate_image: complete');
    return { media: uploaded };
  } catch (err) {
    // Browser may be in a bad state — release the lease then drop the slot
    // entirely so the next call cold-starts.
    if (leaseHeld) {
      lease.release();
      leaseHeld = false;
    }
    await dropTokenManager(account.id);

    // 401 on the Flow API means the cookies are no longer good for OAuth.
    // Mark the account expired so claimAccount stops picking it and the
    // user can re-login from /accounts.
    const msg = (err as Error)?.message ?? String(err);
    if (/AUTH_ERROR_401|UNAUTHENTICATED/.test(msg)) {
      logger.warn({ accountId: account.id }, 'generate_image: marking account expired (401)');
      await releaseAccount(account.id, 0, 'expired');
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
