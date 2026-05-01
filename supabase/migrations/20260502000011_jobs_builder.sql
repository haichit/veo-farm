-- Sprint 10 follow-up: make jobs row work for Builder Canvas runs.
-- - flow_id becomes nullable (Builder runs may not have a saved flow).
-- - flow_graph snapshot lets the worker execute without joining workflows.
-- - stats column lets the Builder toolbar read done/wait/err counters
--   without scanning sub_jobs.

ALTER TABLE public.jobs
  ALTER COLUMN flow_id DROP NOT NULL;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS flow_graph jsonb;

COMMENT ON COLUMN public.jobs.flow_graph IS
  'Snapshot of the workflow JSON the worker should execute. Used by Builder runs to avoid coupling job execution to a saved workflow row.';

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS stats jsonb DEFAULT '{"done":0,"wait":0,"err":0}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_origin_check'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_origin_check
      CHECK (flow_id IS NOT NULL OR workflow_id IS NOT NULL OR flow_graph IS NOT NULL);
  END IF;
END $$;

-- See 20260502000012_jobs_paused_enum.sql for the 'paused' enum value
-- (kept in its own file because ALTER TYPE … ADD VALUE cannot run inside
-- a transaction that already touched the same enum).
