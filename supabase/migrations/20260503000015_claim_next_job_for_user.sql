-- Per-user job claim — used by local Electron workers so user A's machine
-- only ever picks up user A's jobs. Stops cookies from being decrypted on a
-- different physical machine than the one that uploaded them.

CREATE OR REPLACE FUNCTION public.claim_next_job_for_user(p_user_id uuid)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE j public.jobs;
BEGIN
  UPDATE public.jobs
  SET status = 'running', started_at = now()
  WHERE id = (
    SELECT id FROM public.jobs
    WHERE status = 'pending' AND user_id = p_user_id
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO j;
  RETURN j;
END;
$$;
