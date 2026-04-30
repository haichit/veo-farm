CREATE OR REPLACE FUNCTION public.claim_account(p_user_id uuid, p_provider_id text)
RETURNS public.accounts AS $$
DECLARE acc public.accounts;
BEGIN
  UPDATE public.accounts
  SET status = 'busy', last_used_at = now(), updated_at = now()
  WHERE id = (
    SELECT id FROM public.accounts
    WHERE user_id = p_user_id
      AND provider_id = p_provider_id
      AND status = 'idle'
      AND (cooldown_until IS NULL OR cooldown_until < now())
    ORDER BY last_used_at NULLS FIRST
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO acc;
  RETURN acc;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.release_account(
  p_account_id uuid,
  p_cooldown_sec int DEFAULT 300,
  p_new_status public.account_status DEFAULT 'idle',
  p_error text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE public.accounts
  SET status = p_new_status,
      cooldown_until = CASE WHEN p_new_status = 'idle' THEN now() + (p_cooldown_sec || ' seconds')::interval ELSE NULL END,
      last_error = p_error,
      updated_at = now()
  WHERE id = p_account_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.claim_next_job()
RETURNS public.jobs AS $$
DECLARE j public.jobs;
BEGIN
  UPDATE public.jobs
  SET status = 'running', started_at = now()
  WHERE id = (
    SELECT id FROM public.jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO j;
  RETURN j;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
