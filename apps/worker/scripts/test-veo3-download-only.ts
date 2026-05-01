// Test ONLY the download flow for an already-generated video.
// Skips generateVideo + waitForVideos. Pass projectId + workflowId from a previous run.
//
// Usage:
//   pnpm tsx scripts/test-veo3-download-only.ts <projectId> <workflowId>
//
// Defaults to the cat video generated earlier:
//   pnpm tsx scripts/test-veo3-download-only.ts

import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

import { TokenManager } from '../src/_veo3_helpers/token-manager.js';
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
  const projectId = process.argv[2] ?? 'f40788d5-13db-48e8-8c37-570e8572404b';
  const workflowId = process.argv[3] ?? 'b3d0e4ce-230d-483d-8990-4bc839c7144e';

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
    console.error('No veo3 account:', error);
    process.exit(1);
  }

  const cookies = JSON.parse(decrypt(acc.cookies_encrypted));
  console.log(`Account: ${acc.id} (${acc.label}) — ${cookies.length} cookies`);
  console.log(`Target: project=${projectId} workflow=${workflowId}`);

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

  console.log('Launching browser...');
  await tm.launch({ headless: false, chromeExecutablePath: browserExe, userDataDir });
  console.log('Browser opened.');

  if (!tm._page || !tm._cdp) {
    console.error('No page/cdp');
    process.exit(1);
  }

  console.log('\n→ Enabling CDP Network domain + cache disable...');
  await tm._cdp.send('Network.enable');
  await tm._cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

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
      console.log('   📡 Captured GCS video URL:', url.slice(0, 140));
      capturedUrl = url;
    }
  };
  tm._cdp.on('Network.responseReceived', handler);

  const editorUrl = `https://labs.google/fx/vi/tools/flow/project/${projectId}/edit/${workflowId}`;
  console.log('\n→ Navigating to editor:', editorUrl);
  await tm._page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  console.log('   loaded; waiting up to 60s for GCS video request...');

  let waited = 0;
  while (!capturedUrl && waited < 60_000) {
    await new Promise((r) => setTimeout(r, 1000));
    waited += 1000;
    if (waited % 10_000 === 0) console.log(`   ...${waited / 1000}s`);
  }
  tm._cdp.off('Network.responseReceived', handler);

  // Fallback: read Location header server-side via Node fetch with cookies from puppeteer.
  if (!capturedUrl) {
    console.log('   Fallback: Node-side fetch with redirect:manual to read Location header...');
    const mediaName = 'f42169c7-8232-40c0-98c6-c2d7b21dbe38';
    const cookies = await tm._page.cookies('https://labs.google');
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const redirectUrl = `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${encodeURIComponent(mediaName)}`;
    const r = await fetch(redirectUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Cookie: cookieHeader,
        Referer: 'https://labs.google/',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        Accept: '*/*',
      },
    });
    console.log(`   status=${r.status} location=${r.headers.get('location')?.slice(0, 100)}`);
    if (r.status >= 300 && r.status < 400) {
      capturedUrl = r.headers.get('location');
    } else {
      const txt = await r.text();
      console.log('   body:', txt.slice(0, 300));
    }
  }

  if (!capturedUrl) {
    console.error('❌ No GCS video URL captured');
    await tm.close();
    process.exit(1);
  }

  // Strip query (signature only valid for ranged) — actually keep it: signed CDN requires it.
  // Download full file via fetch in page context (cookies + signature both work).
  console.log('\n→ Downloading full file via Node fetch (no Range)...');
  const dl = await fetch(capturedUrl);
  console.log(`   status=${dl.status} ct=${dl.headers.get('content-type')} size=${dl.headers.get('content-length')}`);
  const ab = await dl.arrayBuffer();
  const base64 = { size: ab.byteLength, status: dl.status, ct: dl.headers.get('content-type'), buf: Buffer.from(ab) };
  console.log(`   final size=${base64.size}`);
  const buffer = base64.buf;
  const outPath = `/tmp/veo3-download-${Date.now()}.mp4`;
  const fs = await import('node:fs');
  fs.writeFileSync(outPath, buffer);
  console.log(`✅ Saved ${buffer.length} bytes → ${outPath}`);

  await tm.close();
  console.log('\n🎉 Done.');
}

main().catch((e) => {
  console.error('Unhandled:', e);
  process.exit(1);
});
