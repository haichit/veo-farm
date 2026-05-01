-- Sprint 10: per-account daily quota tracking.
-- Each successful video generation increments today's counter; claim_account
-- skips accounts that hit their daily limit.

CREATE TABLE IF NOT EXISTS account_usage (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, usage_date)
);

CREATE INDEX IF NOT EXISTS account_usage_date_idx
  ON account_usage (usage_date DESC);

-- Per-account quota config lives in accounts.meta.daily_quota (number).
-- If unset, no limit (skip check).

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
    ORDER BY COALESCE(u.count, 0) ASC, a.last_used_at NULLS FIRST
    LIMIT 1
    FOR UPDATE OF a SKIP LOCKED
  )
  RETURNING * INTO acc;
  RETURN acc;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_account_usage(p_account_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.account_usage (account_id, usage_date, count)
  VALUES (p_account_id, (now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (account_id, usage_date)
  DO UPDATE SET count = account_usage.count + 1;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
