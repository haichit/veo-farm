import { supabase } from './supabase.js';

export async function createSubJob(
  jobId: string,
  nodeId: string,
  nodeType: string,
  providerId: string | null,
  input: unknown = null,
): Promise<string> {
  const { data, error } = await supabase()
    .from('sub_jobs')
    .insert({
      job_id: jobId,
      node_id: nodeId,
      node_type: nodeType,
      provider_id: providerId,
      status: 'running',
      input,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`createSubJob: ${error.message}`);
  return data.id;
}

export async function completeSubJob(id: string, output: unknown, accountId?: string) {
  await supabase()
    .from('sub_jobs')
    .update({
      status: 'completed',
      output,
      account_id: accountId ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id);
}

export async function failSubJob(id: string, errorText: string, accountId?: string) {
  await supabase()
    .from('sub_jobs')
    .update({
      status: 'failed',
      error: errorText,
      account_id: accountId ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id);
}
