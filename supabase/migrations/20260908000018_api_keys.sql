-- API keys for programmatic access to the Builder Canvas HTTP API (external
-- tools/agents — e.g. a Codex/script driving workflows without a browser
-- session). Only a SHA-256 hash of the key is stored; the plaintext key is
-- shown once at creation time and never persisted or logged.
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'API Key',
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL, -- first chars of the plaintext key, for identifying it in the UI list
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX api_keys_key_hash_idx ON public.api_keys (key_hash);
CREATE INDEX api_keys_user_id_idx ON public.api_keys (user_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Key *lookup* during request auth goes through the service-role client
-- (bypasses RLS, since there's no user session yet at that point) — these
-- policies only govern the key-management UI (list/create/revoke own keys).
CREATE POLICY "users manage own api keys" ON public.api_keys
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
