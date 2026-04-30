CREATE TYPE public.account_status AS ENUM ('idle', 'busy', 'cooldown', 'expired', 'die');

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  label text NOT NULL,
  cookies_encrypted text NOT NULL,
  status account_status NOT NULL DEFAULT 'idle',
  cooldown_until timestamptz,
  last_used_at timestamptz,
  last_error text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_accounts_user_provider ON public.accounts(user_id, provider_id);
CREATE INDEX idx_accounts_status ON public.accounts(provider_id, status, cooldown_until);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_owner ON public.accounts
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
