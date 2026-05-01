// Direct test of Veo 3 Flow v2 plugin — bypass Claude script entirely.
// Loads cookies from DB veo3 account, launches Brave with extension, generates 1 video.
// Run: pnpm tsx scripts/test-veo3-direct.ts ["prompt here"]

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

import { TokenManager } from '../src/_veo3_helpers/token-manager.js';
import { ApiClient } from '../src/_veo3_helpers/api-client.js';
import { downloadVideoViaCDP } from '../src/_veo3_helpers/cdp-downloader.js';

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(here, '../../../.env'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}

function decrypt(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

async function main() {
  const prompt =
    process.argv[2] ??
    'Cinematic close-up of a fluffy gray British Shorthair cat named Mochi sitting on a wooden windowsill at golden hour, soft warm sunlight, slight head tilt, ears twitching, slow camera dolly in, ultra detailed fur, shallow depth of field, 8 seconds';

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: acc, error } = await sb
    .from('accounts')
    .select('*')
    .eq('provider_id', 'veo3')
    .limit(1)
    .single();

  if (error || !acc) {
    console.error('No veo3 account found:', error);
    process.exit(1);
  }

  const cookies = JSON.parse(decrypt(acc.cookies_encrypted));
  console.log(`Account: ${acc.id} (${acc.label}) — ${cookies.length} cookies`);

  const tm = new TokenManager(
    {
      accountId: acc.id,
      email: acc.label,
      cookies: cookies.map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: typeof c.expires === 'number' ? c.expires : undefined,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })),
      projectId: acc.meta?.projectId,
    },
    process.env.CAPTCHA_SERVER_URL ?? 'https://127.0.0.1:3456',
  );

  const browserExe = process.env.BRAVE_PATH ?? process.env.CHROME_PATH;
  const profilesDir = process.env.WORKER_PROFILES_DIR ?? join(homedir(), '.veo-farm-profiles');
  const userDataDir = join(profilesDir, `veo3-${acc.id}`);
  mkdirSync(userDataDir, { recursive: true });

  console.log('Launching browser...', { browserExe, userDataDir });
  await tm.launch({
    headless: false,
    chromeExecutablePath: browserExe,
    userDataDir,
  });

  console.log('Browser opened.');
  console.log('👉 If you see a landing page, click "Create with Flow" and login.');
  console.log('   Script will wait up to 10 minutes for an authenticated request.\n');

  // Poll up to 10 minutes for Bearer token.
  const pollStart = Date.now();
  const maxLogin = 10 * 60_000;
  let token: string | null = null;
  while (Date.now() - pollStart < maxLogin) {
    if ((tm as any)._bearerToken) {
      token = (tm as any)._bearerToken;
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
    const elapsed = Math.round((Date.now() - pollStart) / 1000);
    if (elapsed > 0 && elapsed % 60 === 0) console.log(`   ...waiting for login (${elapsed}s)`);
  }
  if (!token) {
    console.error('❌ Login timed out after 10 minutes.');
    await tm.close();
    process.exit(1);
  }
  console.log(`✅ Token captured (${token.length} chars)`);

  console.log('   (captcha will be solved in-page via grecaptcha.execute — no server needed)');

  // Try to extract a projectId from the current Brave page URL — if user is in a Flow project,
  // labs URL looks like .../flow/project/<uuid>. Avoids createProject 400 errors.
  let projectId: string | null = (acc.meta as any)?.projectId ?? null;
  if (!projectId && tm._page) {
    const currentUrl = tm._page.url();
    const m = currentUrl.match(/\/project\/([a-f0-9-]{8,})/i);
    if (m) {
      projectId = m[1];
      console.log(`✅ Detected projectId from URL: ${projectId}`);
    }
  }
  if (!projectId) {
    console.warn('⚠ No projectId detected. Will attempt createProject (may 400).');
    console.warn('  → If this fails, click "New Project" in Brave first, then re-run script.');
  }

  console.log('\n→ Generating video with prompt:');
  console.log('   "' + prompt.slice(0, 100) + '..."\n');

  const client = new ApiClient(tm, {
    paygateTier: 'PAYGATE_TIER_TWO',
    projectId: projectId ?? null,
  });

  client.on('video:generating', (data) => console.log('   [event] video:generating', data));
  client.on('video:started', (data) =>
    console.log('   [event] video:started — media count:', data?.media?.length ?? 0),
  );

  let startResult: any;
  try {
    startResult = await client.generateVideo(prompt, {
      aspectRatio: '16:9',
      count: 1,
      model: 'veo_3_1_fast',
    });
  } catch (e: any) {
    console.error('❌ generateVideo failed:', e.message);
    await tm.close();
    process.exit(1);
  }

  const media = (startResult.media ?? []).map((m: any) => ({
    name: m.name,
    projectId: m.projectId,
  }));
  if (media.length === 0) {
    console.error('❌ No media returned from generation start');
    await tm.close();
    process.exit(1);
  }
  console.log('   media items:', media.length);

  console.log('\n→ Polling status (up to 10min)...');
  const pollResult = await client.waitForVideos(media, {
    intervalMs: 5000,
    timeoutMs: 600_000,
    onProgress: (_d, elapsed) => {
      if (elapsed % 15 === 0) console.log(`   ...${elapsed}s elapsed`);
    },
  });

  const success = pollResult.media?.find(
    (m) =>
      m.mediaMetadata?.mediaStatus?.mediaGenerationStatus === 'MEDIA_GENERATION_STATUS_SUCCESSFUL',
  );
  if (!success) {
    const reasons = pollResult.media
      ?.map((m) => m.mediaMetadata?.mediaStatus?.failureReason)
      .filter(Boolean);
    console.error('❌ Generation did not succeed:', reasons?.join(', '));
    console.log(JSON.stringify(pollResult, null, 2));
    await tm.close();
    process.exit(1);
  }

  let videoUri: string | undefined =
    (success as any).mediaMetadata?.video?.servingUri ??
    (success as any).mediaMetadata?.video?.uri ??
    (success as any).video?.servingUri ??
    (success as any).video?.fifeUrl;

  // Fall back to media.getMediaUrlRedirect tRPC: ask Flow for a signed URL by media name.
  if (!videoUri) {
    const mediaName = (success as any).name ?? (success as any).video?.operation?.name;
    const mediaProjectId = (success as any).projectId ?? projectId;
    const workflowId = (success as any).workflowId;
    if (mediaName && tm._page && tm._cdp && workflowId && mediaProjectId) {
      console.log('\n→ Navigating to editor URL to capture GCS video URL via CDP...');
      const editorUrl = `https://labs.google/fx/vi/tools/flow/project/${mediaProjectId}/edit/${workflowId}`;
      console.log('   editorUrl:', editorUrl);
      await tm._cdp.send('Network.enable');
      let capturedUrl: string | null = null;
      const handler = (ev: any) => {
        const ct = ev.response?.headers?.['content-type'] ?? ev.response?.headers?.['Content-Type'] ?? '';
        const url: string = ev.response?.url ?? '';
        if (
          (String(ct).startsWith('video/') || String(ct).includes('mp4') || String(ct).includes('webm') || url.includes('flow-content.google/video/')) &&
          (url.includes('flow-content.google') || url.includes('storage.googleapis')) &&
          !url.includes('gstatic.com') &&
          !capturedUrl
        ) {
          console.log('   📡 Captured GCS video URL:', url.slice(0, 120));
          capturedUrl = url;
        }
      };
      tm._cdp.on('Network.responseReceived', handler);
      try {
        await tm._page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        console.log('   editor page loaded; waiting up to 60s for video request...');
        let waited = 0;
        while (!capturedUrl && waited < 60_000) {
          await new Promise((r) => setTimeout(r, 1000));
          waited += 1000;
          if (waited % 10_000 === 0) console.log(`   ...${waited / 1000}s`);
        }
      } finally {
        tm._cdp.off('Network.responseReceived', handler);
      }
      if (capturedUrl) videoUri = capturedUrl;
      else console.warn('   ⚠ No GCS video URL captured within 60s');
    }
    // Old probe code kept as fallback (will not run if videoUri found above)
    if (!videoUri && mediaName && tm._page) {
      console.log('\n→ Fallback: probing media.getMediaUrlRedirect...');
      const probeResult = await tm._page.evaluate(async (name: string) => {
        const types = [
          'MEDIA_URL_TYPE_DOWNLOAD',
          'MEDIA_URL_TYPE_ORIGINAL',
          'MEDIA_URL_TYPE_VIDEO',
          'MEDIA_URL_TYPE_STREAM',
          'MEDIA_URL_TYPE_PLAYBACK',
        ];
        const out: any[] = [];
        for (const t of types) {
          const url = `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${encodeURIComponent(name)}&mediaUrlType=${t}`;
          try {
            const r = await fetch(url, { credentials: 'include', redirect: 'follow' });
            const ct = r.headers.get('content-type') || '';
            const isVideo = ct.startsWith('video/') || ct.includes('mp4') || ct.includes('webm');
            out.push({ type: t, status: r.status, ct, finalUrl: r.url, isVideo });
            if (isVideo) break;
          } catch (e: any) {
            out.push({ type: t, error: e.message });
          }
        }
        return out;
      }, mediaName);
      for (const r of probeResult) {
        console.log(`   [${r.type.replace('MEDIA_URL_TYPE_', '')}] status=${r.status} ct=${r.ct} ${r.isVideo ? '✅ VIDEO' : ''}`);
        if (r.finalUrl) console.log(`     finalUrl=${r.finalUrl.slice(0, 100)}...`);
        if (r.error) console.log(`     error=${r.error}`);
        if (!videoUri && r.isVideo && r.finalUrl) videoUri = r.finalUrl;
      }
    }
  }

  if (!videoUri) {
    console.error('❌ No video URI in success response. Full success media object:');
    console.log(JSON.stringify(success, null, 2));
    await tm.close();
    process.exit(1);
  }
  console.log('✅ Generation done.');
  console.log('   videoUri:', videoUri.slice(0, 80) + '...');

  console.log('\n→ Downloading full file via curl...');
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
  const outPath = `/tmp/veo3-test-${Date.now()}.mp4`;
  const fs = await import('node:fs');
  fs.writeFileSync(outPath, buffer);
  console.log(`✅ Saved ${buffer.length} bytes → ${outPath}`);

  await tm.close();
  console.log('\n🎉 Done.');
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
