export type AccountStatus = 'idle' | 'busy' | 'cooldown' | 'expired' | 'die';

export type ProviderId =
  | 'chatgpt'
  | 'gemini'
  | 'claude'
  | 'dalle'
  | 'flux'
  | 'veo3'
  | 'veo_native'
  | 'elevenlabs';

export interface Account {
  id: string;
  user_id: string;
  provider_id: ProviderId | string;
  label: string;
  cookies_encrypted: string;
  status: AccountStatus;
  cooldown_until: string | null;
  last_used_at: string | null;
  last_error: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
