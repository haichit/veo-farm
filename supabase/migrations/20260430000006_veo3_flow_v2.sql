-- Veo 3 Flow v2 plugin support: persistent browser profile, auth blob, captcha port.
-- Reference: SPEC_REPLICA_BACKEND.md section 18.16.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS auth_blob_encrypted text,
  ADD COLUMN IF NOT EXISTS auth_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS browser_profile_path text,
  ADD COLUMN IF NOT EXISTS captcha_server_port int DEFAULT 3456;

-- New status: account being rotated due to UNUSUAL_ACTIVITY etc.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'rotating'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'account_status')
  ) THEN
    ALTER TYPE public.account_status ADD VALUE 'rotating';
  END IF;
END$$;
