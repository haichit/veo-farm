-- Sprint 10 (Builder Canvas): workflows table for the new Builder.
-- Distinct from the legacy `flows` table (MVP-1 7-node taxonomy) — kept side
-- by side so both UI/runners can co-exist during migration.
--
-- Schema mirrors `flows`: graph is a WorkflowJSON blob (SPEC §20.11).

CREATE TABLE IF NOT EXISTS public.workflows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  graph       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_user_updated
  ON public.workflows (user_id, updated_at DESC);

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflows_owner ON public.workflows
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- updated_at touch trigger (re-uses existing helper if defined; else inline).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS trigger AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END $fn$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS workflows_set_updated_at ON public.workflows;
CREATE TRIGGER workflows_set_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Track which Builder workflow a job came from (NULL for legacy /flows jobs).
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.jobs.workflow_id IS
  'When the job was launched from the Builder Canvas, points at the workflow that produced flow_graph. NULL = legacy /flows job.';
