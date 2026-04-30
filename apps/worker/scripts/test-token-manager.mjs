// Standalone smoke test for TokenManager — launches Brave/Chrome, loads cookies from DB,
// navigates to labs.google, verifies Bearer token can be extracted.
//
// Usage:
//   node scripts/test-token-manager.mjs <accountId>
// Or pass nothing → uses first veo3 account.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(here, '../../../.env'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}

function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const accountId = process.argv[2];
let q = sb.from('accounts').select('*');
if (accountId) q = q.eq('id', accountId);
else q = q.eq('provider_id', 'veo3').limit(1);
const { data: acc, error } = await q.single();
if (error) {
  console.error('Account fetch error:', error);
  process.exit(1);
}

const cookies = JSON.parse(decrypt(acc.cookies_encrypted));
console.log(`Loaded account ${acc.id} (${acc.provider_id}/${acc.label}) — ${cookies.length} cookies`);

const { TokenManager } = await import('../src/_veo3_helpers/token-manager.ts').catch(async () => {
  // tsx import path
  return await import('../dist/_veo3_helpers/token-manager.js').catch(() => null);
});

if (!TokenManager) {
  console.error('Cannot import TokenManager — run via:');
  console.error('  pnpm tsx scripts/test-token-manager.mjs');
  process.exit(1);
}

const tm = new TokenManager(
  {
    accountId: acc.id,
    email: acc.label,
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: typeof c.expires === 'number' ? c.expires : undefined,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    })),
  },
  process.env.CAPTCHA_SERVER_URL ?? 'http://127.0.0.1:3456',
);

const browserExe = process.env.BRAVE_PATH ?? process.env.CHROME_PATH;
console.log('Launching browser...', { exe: browserExe ?? '(default)' });
await tm.launch({ headless: false, chromeExecutablePath: browserExe });

console.log('Browser ready. Attempting to extract Bearer token...');
try {
  const token = await tm.getToken();
  console.log(`✅ Bearer token captured (${token.length} chars)`);
  console.log(`   prefix: ${token.slice(0, 30)}...`);
} catch (e) {
  console.error('❌ Token extraction failed:', e.message);
}

console.log('\nKeeping browser open for 60s for you to inspect / login if needed...');
await new Promise((r) => setTimeout(r, 60_000));
await tm.close();
console.log('Done.');
