// Veo 3 Flow API replica — primary video plugin (uses got-scraping HTTP + Puppeteer for token).
// Reference: SPEC_REPLICA_BACKEND.md section 18.15.

import path from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import type { VideoProvider } from '@veo-farm/shared';
import { ApiClient } from '../../_veo3_helpers/api-client.js';
import { TokenManager } from '../../_veo3_helpers/token-manager.js';
import { downloadVideoViaCDP } from '../../_veo3_helpers/cdp-downloader.js';
import { RateLimiter } from '../../core/concurrency.js';
import { downloadFromUrl } from '../../core/storage.js';
import { RATE_LIMIT_DELAY_MS } from '../../_veo3_helpers/constants.js';

const PROFILES_DIR =
  process.env.WORKER_PROFILES_DIR ?? path.join(homedir(), '.veo-farm-profiles');

const rateLimiter = new RateLimiter(RATE_LIMIT_DELAY_MS);

export const Veo3FlowV2Plugin: VideoProvider = {
  id: 'veo3_flow_v2',
  name: 'Veo 3 (Flow API replica)',
  url: 'https://labs.google/fx/vi/tools/flow',
  loginUrl: 'https://labs.google/fx/vi/tools/flow',
  capabilities: {
    max_duration_sec: 8,
    supports_image_ref: true,
    supports_voice_in_prompt: true,
    aspect_ratios: ['9:16', '16:9', '1:1'],
  },

  async generateVideo(input, ctx) {
    const { account, cookies, uploadFile, logger } = ctx;
    await rateLimiter.throttle();

    const meta = (account.meta ?? {}) as Record<string, unknown>;
    const projectId = (meta.projectId as string | undefined) ?? undefined;

    // Convert our Cookie type → Puppeteer cookie shape.
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

    // Persistent profile per account — first run user logs in manually,
    // subsequent runs reuse the OAuth tokens + cookies from disk.
    const userDataDir = path.join(PROFILES_DIR, `veo3-${account.id}`);
    mkdirSync(userDataDir, { recursive: true });

    logger.info('veo3_flow_v2: launching browser', {
      browserExe: browserExe ?? '(default)',
      userDataDir,
    });
    await tm.launch({
      headless: false,
      chromeExecutablePath: browserExe,
      userDataDir,
    });

    try {
      const client = new ApiClient(tm, {
        paygateTier: 'PAYGATE_TIER_TWO',
        projectId: projectId ?? null,
      });

      // Optional reference image upload.
      let refMediaId: string | undefined;
      if (input.refImageUrl) {
        logger.info('veo3_flow_v2: uploading reference image');
        const buf = await downloadFromUrl(input.refImageUrl);
        const upload = await client.uploadImage(buf, 'image/jpeg');
        refMediaId = upload.mediaId;
      }

      // Compose prompt — append voiceover hint if provided.
      let prompt = input.prompt;
      if (input.voiceScript) {
        prompt += `\n\nVoiceover (Vietnamese): "${input.voiceScript}"`;
      }

      const aspectRatio = (input.aspectRatio === '9:16' ? '9:16' : '16:9') as '9:16' | '16:9';

      logger.info('veo3_flow_v2: starting generation', { aspectRatio, hasRef: !!refMediaId });
      const startResult = await client.generateVideo(prompt, {
        aspectRatio,
        count: 1,
        model: 'veo_3_1_fast',
        referenceImages: refMediaId ? [refMediaId] : undefined,
      });

      const media = (startResult.media ?? []).map((m) => ({
        name: m.name,
        projectId: m.projectId,
      }));
      if (media.length === 0) throw new Error('veo3_flow_v2: no media items returned');

      logger.info('veo3_flow_v2: polling status...', { count: media.length });
      const pollResult = await client.waitForVideos(media, {
        onProgress: (_data, elapsed) => {
          if (elapsed % 30 === 0) logger.info('veo3_flow_v2: polling...', { elapsed });
        },
      });

      const success = pollResult.media?.find(
        (m) =>
          m.mediaMetadata?.mediaStatus?.mediaGenerationStatus ===
          'MEDIA_GENERATION_STATUS_SUCCESSFUL',
      );
      if (!success) {
        const reasons = pollResult.media
          ?.map((m) => m.mediaMetadata?.mediaStatus?.failureReason)
          .filter(Boolean);
        throw new Error(
          `veo3_flow_v2: generation failed${reasons?.length ? ': ' + reasons.join(', ') : ''}`,
        );
      }

      const mediaName = (success as any).name ?? (success as any).video?.operation?.name;
      const successProjectId = (success as any).projectId ?? projectId;
      const workflowId = (success as any).workflowId;
      if (!mediaName || !successProjectId || !workflowId) {
        throw new Error(
          `veo3_flow_v2: missing identifiers (mediaName=${mediaName} projectId=${successProjectId} workflowId=${workflowId})`,
        );
      }

      logger.info('veo3_flow_v2: resolving signed CDN URL via editor page');
      const videoUri = await client.getVideoUrl(mediaName, successProjectId, workflowId);

      logger.info('veo3_flow_v2: downloading from signed URL via curl');
      const { spawn } = await import('node:child_process');
      const buffer: Buffer = await new Promise((resolveBuf, rejectBuf) => {
        const chunks: Buffer[] = [];
        const p = spawn('curl', ['-sSL', '--fail', videoUri], { stdio: ['ignore', 'pipe', 'pipe'] });
        p.stdout.on('data', (c) => chunks.push(c));
        let err = '';
        p.stderr.on('data', (c) => (err += c.toString()));
        p.on('close', (code) => {
          if (code === 0) resolveBuf(Buffer.concat(chunks));
          else rejectBuf(new Error(`curl exit ${code}: ${err}`));
        });
      });
      const uploadedUrl = await uploadFile(buffer, 'mp4');

      return {
        videoUrl: uploadedUrl,
        durationSec: success.mediaMetadata?.video?.durationSec ?? 8,
        hasAudio: true,
      };
    } finally {
      await tm.close();
    }
  },
};

export default Veo3FlowV2Plugin;
