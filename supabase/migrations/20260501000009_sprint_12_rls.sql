-- Sprint 12: RLS audit — enable on tables added by sprint 9/10.
-- worker_heartbeats: read-only for authenticated users (UI ConnectionBadge);
--   only service-role (worker) can write.
-- account_usage: scoped to account owner (read), service-role (write).

ALTER TABLE public.worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY worker_heartbeats_read_authenticated ON public.worker_heartbeats
  FOR SELECT TO authenticated USING (true);

-- service_role bypasses RLS entirely; no policy needed for the worker upserts.

ALTER TABLE public.account_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_usage_owner_read ON public.account_usage
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_usage.account_id AND a.user_id = auth.uid()
    )
  );

-- Worker writes via service_role (RLS bypassed); no INSERT/UPDATE policy needed.
