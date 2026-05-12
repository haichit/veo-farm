import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// @supabase/realtime-js@2.105.x throws "Node.js 20 detected without native
// WebSocket support" unless an explicit transport is provided. Electron 31
// bundles Node 20, so wire in the `ws` polyfill at client init time.
import WebSocket from 'ws';

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false },
    realtime: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: WebSocket as any,
    },
  });
  return _client;
}
