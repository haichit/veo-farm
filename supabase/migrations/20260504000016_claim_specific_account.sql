-- Per-node account pinning. claim_specific_account locks ONE specific account
-- (instead of round-robin within a provider). Same idle/quota/cooldown checks
-- as claim_account so semantics stay consistent.

CREATE OR REPLACE FUNCTION public.claim_specific_account(
  p_account_id uuid,
  p_user_id uuid
)
RETURNS public.accounts AS $$
DECLARE acc public.accounts;
DECLARE v_today DATE := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  UPDATE public.accounts a
  SET status = 'busy', last_used_at = now(), updated_at = now()
  WHERE a.id = p_account_id
    AND a.user_id = p_user_id
    AND a.status = 'idle'
    AND (a.cooldown_until IS NULL OR a.cooldown_until < now())
    AND (
      (a.meta ->> 'daily_quota') IS NULL
      OR COALESCE(
        (SELECT u.count FROM public.account_usage u
          WHERE u.account_id = p_account_id AND u.usage_date = v_today),
        0
      ) < (a.meta ->> 'daily_quota')::int
    )
  RETURNING * INTO acc;
  RETURN acc;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
