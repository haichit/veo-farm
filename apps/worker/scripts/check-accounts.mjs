import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(here, '../../../.env'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data, error } = await sb
  .from('accounts')
  .select('id, provider_id, label, status, cookies_encrypted, last_error, created_at');

if (error) {
  console.error(error);
  process.exit(1);
}

for (const a of data) {
  console.log(`[${a.status}] ${a.provider_id} · ${a.label}`);
  console.log(`  id: ${a.id}`);
  console.log(`  cookies_encrypted: ${a.cookies_encrypted ? `${a.cookies_encrypted.length} chars` : 'NULL'}`);
  if (a.last_error) console.log(`  last_error: ${a.last_error}`);
}
