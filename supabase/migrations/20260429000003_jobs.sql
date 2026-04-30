CREATE TYPE public.job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status job_status NOT NULL DEFAULT 'pending',
  input jsonb,
  output_url text,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_jobs_status ON public.jobs(status, created_at);
CREATE INDEX idx_jobs_user ON public.jobs(user_id, created_at DESC);

CREATE TABLE public.sub_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_type text NOT NULL,
  provider_id text,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  status job_status NOT NULL DEFAULT 'pending',
  input jsonb,
  output jsonb,
  error text,
  retry_count int DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sub_jobs_job ON public.sub_jobs(job_id);
CREATE INDEX idx_sub_jobs_status ON public.sub_jobs(status);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_owner ON public.jobs
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY sub_jobs_owner ON public.sub_jobs
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = sub_jobs.job_id AND j.user_id = auth.uid()));
