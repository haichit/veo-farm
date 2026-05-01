-- Sprint 9: worker heartbeat + retry support
-- - worker_heartbeats: workers upsert every 10s, web reads to power ConnectionBadge
-- - jobs.retry_from_node: optional column so a Run can resume from a specific node
--   (e.g. concat) instead of re-executing the whole graph. Uses sub_job cache.

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB
);

CREATE INDEX IF NOT EXISTS worker_heartbeats_last_seen_idx
  ON worker_heartbeats (last_seen_at DESC);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS retry_from_node TEXT,
  ADD COLUMN IF NOT EXISTS parent_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

COMMENT ON COLUMN jobs.retry_from_node IS
  'When set, runJob skips nodes whose sub-jobs already completed in parent_job_id and re-runs only this node onward';
COMMENT ON COLUMN jobs.parent_job_id IS
  'Job that this run was retried from. Sub-job cache lookup uses this for resume.';
