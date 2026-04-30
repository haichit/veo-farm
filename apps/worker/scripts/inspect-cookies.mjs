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

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const provider = process.argv[2] ?? 'claude';
const { data } = await sb.from('accounts').select('cookies_encrypted').eq('provider_id', provider).limit(1).single();
const cookies = JSON.parse(decrypt(data.cookies_encrypted));
console.log(`Provider: ${provider}, ${cookies.length} cookies`);
const interesting = ['cf_clearance', '__cf_bm', '_cfuvid', 'sessionKey', '__Secure-next-auth.session-token', '__Host-next-auth.csrf-token', 'oai-did', 'cf-mitigated'];
for (const c of cookies) {
  const star = interesting.includes(c.name) || c.name.startsWith('cf_') || c.name.startsWith('__cf') ? '⭐ ' : '   ';
  console.log(`${star}${c.name.padEnd(35)} domain=${c.domain.padEnd(20)} sameSite=${c.sameSite ?? '-'}`);
}
