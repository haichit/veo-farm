-- Add 'paused' to job_status so Builder runs can be paused mid-execution.
-- ALTER TYPE … ADD VALUE must run on its own; keeping this in a dedicated
-- migration file isolates the transactional constraint.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'job_status' AND e.enumlabel = 'paused'
  ) THEN
    ALTER TYPE public.job_status ADD VALUE 'paused';
  END IF;
END $$;
