// Set veo3 account.meta.projectId so plugin skips project creation.
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

const projectId = process.argv[2] ?? 'f40788d5-13db-48e8-8c37-570e8572404b';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});

const { data: acc } = await sb.from('accounts').select('*').eq('provider_id', 'veo3').limit(1).single();
const meta = { ...(acc.meta ?? {}), projectId };
await sb.from('accounts').update({ meta }).eq('id', acc.id);
console.log(`Account ${acc.id} meta.projectId = ${projectId}`);
