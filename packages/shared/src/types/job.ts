export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  flow_id: string;
  user_id: string;
  status: JobStatus;
  input: { idea?: string; batch?: unknown[] } | null;
  output_url: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface SubJob {
  id: string;
  job_id: string;
  node_id: string;
  node_type: string;
  provider_id: string | null;
  account_id: string | null;
  status: JobStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  retry_count: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}
