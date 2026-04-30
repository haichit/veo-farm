// Veo 3 Flow API replica — primary video plugin (uses got-scraping HTTP + Puppeteer for token).
// Reference: SPEC_REPLICA_BACKEND.md section 18.15.

import type { VideoProvider } from '@veo-farm/shared';
import { ApiClient } from '../../_veo3_helpers/api-client.js';
import { TokenManager } from '../../_veo3_helpers/token-manager.js';
import { downloadVideoViaCDP } from '../../_veo3_helpers/cdp-downloader.js';
import { RateLimiter } from '../../core/concurrency.js';
import { downloadFromUrl } from '../../core/storage.js';
import { RATE_LIMIT_DELAY_MS } from '../../_veo3_helpers/constants.js';

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

    logger.info('veo3_flow_v2: launching browser', { browserExe: browserExe ?? '(default)' });
    await tm.launch({
      headless: false,
      chromeExecutablePath: browserExe,
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

      const videoUri = success.mediaMetadata?.video?.servingUri ?? success.mediaMetadata?.video?.uri;
      if (!videoUri) throw new Error('veo3_flow_v2: no video URI in success response');

      logger.info('veo3_flow_v2: downloading via CDP');
      if (!tm._page || !tm._cdp) throw new Error('veo3_flow_v2: page/cdp not available');
      const buffer = await downloadVideoViaCDP(tm._page, tm._cdp, videoUri);
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
