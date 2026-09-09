// Full E2E test: verify a FREE Google account can actually complete a Veo 3
// video generation via the Flow API — not just start the job.
// Uses ship6xyz cookies, TIER_ONE + veo_3_1_lite, text-to-video, polls until
// MEDIA_GENERATION_STATUS_SUCCESSFUL / FAILED / FILTERED.
// Run: pnpm tsx scripts/test-free-account-full.ts

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

import { TokenManager } from '../src/_veo3_helpers/token-manager.js';
import { ApiClient } from '../src/_veo3_helpers/api-client.js';

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
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Pick the newest veo3 account (ship6xyz the user just added).
  const { data: acc, error } = await sb
    .from('accounts')
    .select('*')
    .eq('provider_id', 'veo3')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !acc) {
    console.error('No veo3 account found:', error);
    process.exit(1);
  }

  // Reset its status — heuristic may have flagged it expired.
  await sb.from('accounts').update({ status: 'idle', last_error: null }).eq('id', acc.id);

  const cookies = JSON.parse(decrypt(acc.cookies_encrypted));
  console.log(`Account: ${acc.id} (${acc.label}) — ${cookies.length} cookies, status reset → idle`);

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

  console.log('→ Launching Brave (headed)...');
  await tm.launch({
    headless: false,
    chromeExecutablePath: browserExe,
    userDataDir,
  });

  // Wait up to 3 minutes for Bearer token capture.
  const pollStart = Date.now();
  const maxLogin = 3 * 60_000;
  let token: string | null = null;
  while (Date.now() - pollStart < maxLogin) {
    if ((tm as any)._bearerToken) {
      token = (tm as any)._bearerToken;
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!token) {
    console.error('❌ Token capture timed out');
    await tm.close();
    process.exit(1);
  }
  console.log(`✅ Token captured (${token.length} chars)`);

  // Resolve projectId.
  let projectId: string | null = (acc.meta as any)?.projectId ?? null;
  if (!projectId && (tm as any)._page) {
    const url = (tm as any)._page.url();
    const m = url.match(/\/project\/([a-f0-9-]{8,})/i);
    if (m) projectId = m[1];
  }
  console.log(`projectId: ${projectId ?? '(will probe)'}`);

  // TIER_ONE + veo_3_1_lite — text-to-video.
  const client = new ApiClient(tm, {
    paygateTier: 'PAYGATE_TIER_ONE',
    projectId: projectId ?? null,
  });

  console.log('\n→ generateVideo(t2v, lite, TIER_ONE)...');
  let startResult;
  try {
    startResult = await client.generateVideo(
      'A small fluffy dog running across a sunny green field, cinematic, slow motion',
      {
        aspectRatio: '16:9',
        count: 1,
        model: 'veo_3_1_lite',
      },
    );
  } catch (e: any) {
    console.error('❌ generateVideo START failed:', e.message);
    await tm.close();
    process.exit(1);
  }

  const media = (startResult.media ?? []).map((m: any) => ({
    name: m.name,
    projectId: m.projectId,
  }));
  console.log(`✅ START accepted — media items: ${media.length}`);
  if (media.length === 0) {
    console.error('❌ No media items returned');
    await tm.close();
    process.exit(1);
  }
  console.log(`   first media name: ${media[0].name?.slice(0, 80) ?? '(no name)'}...`);

  // Poll up to 10 min for completion.
  console.log('\n→ Polling status every 5s, up to 10 min...');
  let lastStatus = '';
  const pollResult = await client.waitForVideos(media, {
    intervalMs: 5000,
    timeoutMs: 10 * 60_000,
    onProgress: (data, elapsed) => {
      const m0: any = data.media?.[0];
      const status = m0?.mediaMetadata?.mediaStatus?.mediaGenerationStatus ?? 'no-status';
      const reason = m0?.mediaMetadata?.mediaStatus?.failureReason;
      if (status !== lastStatus) {
        console.log(`   [${elapsed}s] status: ${status}${reason ? ` (reason=${reason})` : ''}`);
        lastStatus = status;
      } else if (elapsed % 15 === 0) {
        console.log(`   [${elapsed}s] still ${status}...`);
      }
    },
  });

  const m0: any = pollResult.media?.[0];
  const finalStatus = m0?.mediaMetadata?.mediaStatus?.mediaGenerationStatus;
  const failureReason = m0?.mediaMetadata?.mediaStatus?.failureReason;
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`FINAL STATUS: ${finalStatus}`);
  if (failureReason) console.log(`FAILURE REASON: ${failureReason}`);
  if (finalStatus === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
    console.log(`🎉 VIDEO GENERATED — free account can fully produce video on Veo 3.1 Lite via Flow API.`);
    const fife = m0?.mediaMetadata?.video?.servingUri ?? m0?.video?.fifeUrl;
    if (fife) console.log(`   fife URL prefix: ${fife.slice(0, 80)}...`);
  } else if (finalStatus === 'MEDIA_GENERATION_STATUS_FAILED') {
    console.log(`💀 GENERATION FAILED at server — free account NOT fully usable via this API path.`);
  } else if (finalStatus === 'MEDIA_GENERATION_STATUS_FILTERED') {
    console.log(`🛑 Content filter — try a different prompt.`);
  } else {
    console.log(`⏱  Did not finish in 10 min — status: ${finalStatus}`);
  }
  console.log(`══════════════════════════════════════════════════`);

  await tm.close();
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
