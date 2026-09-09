-- Accounts store an optional `meta.cookies_expire_at` (ISO timestamp, set
-- when cookies are added/tested). claim_account and claim_specific_account
-- previously ignored it entirely, so an account whose cookies had visibly
-- expired hours ago could still be handed out — the job would only find out
-- once Flow redirected to /about mid-run. Skip it up front instead, same
-- way daily_quota is already skipped when unset.

CREATE OR REPLACE FUNCTION public.claim_account(p_user_id uuid, p_provider_id text)
RETURNS public.accounts AS $$
DECLARE acc public.accounts;
DECLARE v_today DATE := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  UPDATE public.accounts
  SET status = 'busy', last_used_at = now(), updated_at = now()
  WHERE id = (
    SELECT a.id FROM public.accounts a
    LEFT JOIN public.account_usage u
      ON u.account_id = a.id AND u.usage_date = v_today
    WHERE a.user_id = p_user_id
      AND a.provider_id = p_provider_id
      AND a.status = 'idle'
      AND (a.cooldown_until IS NULL OR a.cooldown_until < now())
      AND (
        (a.meta ->> 'daily_quota') IS NULL
        OR COALESCE(u.count, 0) < (a.meta ->> 'daily_quota')::int
      )
      AND (
        (a.meta ->> 'cookies_expire_at') IS NULL
        OR (a.meta ->> 'cookies_expire_at')::timestamptz > now()
      )
    ORDER BY COALESCE(u.count, 0) ASC, a.last_used_at NULLS FIRST
    LIMIT 1
    FOR UPDATE OF a SKIP LOCKED
  )
  RETURNING * INTO acc;
  RETURN acc;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

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
    AND (
      (a.meta ->> 'cookies_expire_at') IS NULL
      OR (a.meta ->> 'cookies_expire_at')::timestamptz > now()
    )
  RETURNING * INTO acc;
  RETURN acc;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Best-effort mark: any account already past its own declared expiry gets
-- flagged now so it shows up as "expired" in /accounts instead of quietly
-- sitting as "idle" until the next claim attempt skips it silently.
UPDATE public.accounts
SET status = 'expired', updated_at = now()
WHERE status = 'idle'
  AND (meta ->> 'cookies_expire_at') IS NOT NULL
  AND (meta ->> 'cookies_expire_at')::timestamptz <= now();
