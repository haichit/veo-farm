// Reset all stuck accounts to idle.
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
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await sb
  .from('accounts')
  .update({ status: 'idle', cooldown_until: null, last_error: null })
  .neq('status', 'die')
  .select('id, provider_id');
if (error) console.error(error);
else console.log(`reset ${data.length} accounts:`, data.map((a) => `${a.provider_id}/${a.id.slice(0, 8)}`).join(', '));
