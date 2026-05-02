-- Sprint 10: enable Supabase Realtime broadcast for jobs + sub_jobs so the
-- Builder Canvas useJobSubscription hook receives UPDATE events.
--
-- Without these ALTER PUBLICATION calls, postgres_changes subscriptions on
-- these tables silently match nothing — the worker writes happen but the
-- browser never sees them.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sub_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sub_jobs;
  END IF;
END $$;

-- REPLICA IDENTITY FULL ensures UPDATE events include the previous row image
-- (otherwise partial-column UPDATEs may arrive with sparse `new` payloads).
ALTER TABLE public.jobs REPLICA IDENTITY FULL;
ALTER TABLE public.sub_jobs REPLICA IDENTITY FULL;
