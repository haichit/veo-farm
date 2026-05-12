// Debug script: try every (paygateTier × model) combo against Veo Flow API to
// find which one the user's account is allowed to use. Use the newest veo3
// account in DB (the one user just added). Text-to-video — no image upload.
// Run: pnpm tsx scripts/test-paygate-combos.ts

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

const PAYGATE_TIERS = [
  'PAYGATE_TIER_FREE',
  'PAYGATE_TIER_ONE',
  'PAYGATE_TIER_TWO',
  'PAYGATE_TIER_THREE',
] as const;

const MODELS = ['veo_3_1_lite', 'veo_3_1_fast', 'veo_3_1_quality'] as const;

async function main() {
  const prompt = 'A small dog running across a sunny green field, cinematic';

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Pick the NEWEST veo3 account (the one user just added).
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

  const cookies = JSON.parse(decrypt(acc.cookies_encrypted));
  console.log(`Account: ${acc.id} (${acc.label}) — ${cookies.length} cookies, status=${acc.status}`);

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

  console.log('Launching browser (headed)...');
  await tm.launch({
    headless: false,
    chromeExecutablePath: browserExe,
    userDataDir,
  });

  // Poll up to 5 minutes for Bearer token.
  const pollStart = Date.now();
  const maxLogin = 5 * 60_000;
  let token: string | null = null;
  while (Date.now() - pollStart < maxLogin) {
    if ((tm as any)._bearerToken) {
      token = (tm as any)._bearerToken;
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
    const elapsed = Math.round((Date.now() - pollStart) / 1000);
    if (elapsed > 0 && elapsed % 30 === 0) console.log(`   ...waiting for login (${elapsed}s)`);
  }
  if (!token) {
    console.error('❌ Login timed out after 5 minutes.');
    await tm.close();
    process.exit(1);
  }
  console.log(`✅ Token captured (${token.length} chars)`);

  // Detect projectId.
  let projectId: string | null = (acc.meta as any)?.projectId ?? null;
  if (!projectId && (tm as any)._page) {
    const url = (tm as any)._page.url();
    const m = url.match(/\/project\/([a-f0-9-]{8,})/i);
    if (m) projectId = m[1];
  }
  console.log(`projectId: ${projectId ?? '(not detected — will probe)'}`);

  // Iterate combos. For each combo, just call generateVideo (start only).
  console.log('\n===== ITERATING COMBOS =====\n');
  const results: Array<{ tier: string; model: string; ok: boolean; reason: string }> = [];

  for (const tier of PAYGATE_TIERS) {
    for (const model of MODELS) {
      const label = `tier=${tier.replace('PAYGATE_TIER_', '')} model=${model}`;
      process.stdout.write(`→ ${label.padEnd(45, ' ')} `);

      const client = new ApiClient(tm, {
        paygateTier: tier,
        projectId: projectId ?? null,
      });

      try {
        const r = await client.generateVideo(prompt, {
          aspectRatio: '16:9',
          count: 1,
          model: model as any,
        });
        const count = (r.media ?? []).length;
        console.log(`✅ OK — media[${count}]`);
        results.push({ tier, model, ok: true, reason: `started, media=${count}` });
      } catch (e: any) {
        const msg = (e?.message ?? String(e)).slice(0, 200);
        const isPerm = msg.includes('PERMISSION_DENIED') || msg.includes('MODEL_ACCESS_DENIED');
        const isAuth = msg.includes('AUTH_ERROR_');
        const tag = isPerm ? '❌ PERM_DENIED' : isAuth ? '❌ AUTH' : '❌ FAIL';
        console.log(`${tag} — ${msg.slice(0, 120)}`);
        results.push({ tier, model, ok: false, reason: msg });
      }

      // Small delay between calls to avoid rate-limit.
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  console.log('\n===== SUMMARY =====');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.tier.padEnd(22, ' ')} ${r.model.padEnd(18, ' ')}  ${r.reason.slice(0, 80)}`);
  }
  const winners = results.filter((r) => r.ok);
  if (winners.length > 0) {
    console.log(`\n🎉 ${winners.length} working combo(s):`);
    for (const w of winners) console.log(`   ${w.tier} + ${w.model}`);
  } else {
    console.log('\n💀 No working combo found.');
  }

  await tm.close();
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
