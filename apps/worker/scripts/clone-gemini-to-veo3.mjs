// Clone the gemini account to a veo3 account (same cookies — Google SSO is shared).
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
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});

const { data: gem } = await sb.from('accounts').select('*').eq('provider_id', 'gemini').limit(1).single();
if (!gem) { console.error('no gemini account'); process.exit(1); }

const { data: existing } = await sb.from('accounts').select('id').eq('provider_id', 'veo3').eq('user_id', gem.user_id).maybeSingle();
if (existing) {
  console.log('veo3 account already exists:', existing.id, '— updating cookies from gemini');
  await sb.from('accounts').update({ cookies_encrypted: gem.cookies_encrypted, status: 'idle', cooldown_until: null, last_error: null }).eq('id', existing.id);
} else {
  const { data: cloned, error } = await sb.from('accounts').insert({
    user_id: gem.user_id,
    provider_id: 'veo3',
    label: gem.label + '-(cloned-veo3)',
    cookies_encrypted: gem.cookies_encrypted,
    status: 'idle',
    meta: gem.meta,
  }).select().single();
  if (error) { console.error(error); process.exit(1); }
  console.log('cloned veo3 account:', cloned.id);
}
