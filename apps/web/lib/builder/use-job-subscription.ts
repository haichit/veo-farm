'use client';

import { useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useFlowStore, type NodeStatus, type PreviewMedia } from './flow-store';

// Mirror a Builder job into the flow store using **always-on polling** plus
// (optionally) Supabase Realtime for snappier updates.
//
// Why polling-first instead of subscription-first: Realtime requires the
// publication ALTER TABLE migration to land AND the user's session JWT to
// be attached to the channel. Either failing leaves the UI stuck even
// though the worker happily wrote the result. Polling the REST API uses
// the same auth cookie as every other fetch on the page and is impossible
// to misconfigure — once we have working SELECT, we have working updates.
//
// Realtime stays on as a bonus channel: when it works the UI updates
// within ~50ms instead of waiting up to 1s for the next poll tick.
export function useJobSubscription(jobId: string | null) {
  const updateNodeStatus = useFlowStore((s) => s.updateNodeStatus);
  const setNodePreview = useFlowStore((s) => s.setNodePreview);
  const setNodeOutputText = useFlowStore((s) => s.setNodeOutputText);
  const setStats = useFlowStore((s) => s.setStats);
  const setRunState = useFlowStore((s) => s.setRunState);

  useEffect(() => {
    if (!jobId) return;
    const sb = createSupabaseBrowserClient();
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    // Track which sub_jobs we've already pushed previewMedia for so polling
    // doesn't keep appending the same items to the album every tick.
    const seenMediaForNode = new Set<string>();
    let lastJobStatus = '';

    function applySubJob(row: {
      node_id?: string;
      status?: string;
      error?: string | null;
      output?: unknown;
    }) {
      if (!row?.node_id) return;
      updateNodeStatus(row.node_id, normaliseStatus(row.status), {
        error: row.error ?? undefined,
      });
      const media = extractMedia(row.output);
      if (media.length > 0 && !seenMediaForNode.has(row.node_id)) {
        seenMediaForNode.add(row.node_id);
        setNodePreview(row.node_id, media);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = row.output as any;
      const txt = typeof o?.text === 'string' ? o.text : null;
      if (txt && txt.trim()) setNodeOutputText(row.node_id, txt);
    }

    function applyJob(row: { status?: string; stats?: { done: number; wait: number; err: number } }) {
      if (row?.stats) setStats(row.stats);
      const status = row?.status ?? '';
      if (status === lastJobStatus) return;
      lastJobStatus = status;
      if (status === 'completed' || status === 'failed') setRunState('idle');
      else if (status === 'cancelled') setRunState('stopped');
      else if (status === 'paused') setRunState('paused');
      else if (status === 'running') setRunState('running');
    }

    async function pollOnce(): Promise<string | null> {
      const [{ data: subRows, error: subErr }, { data: jobRow, error: jobErr }] = await Promise.all([
        sb.from('sub_jobs').select('node_id, status, error, output').eq('job_id', jobId),
        sb.from('jobs').select('status, stats').eq('id', jobId).single(),
      ]);
      if (cancelled) return null;
      if (subErr || jobErr) {
        // eslint-disable-next-line no-console
        console.warn('[builder] poll error', { subErr, jobErr });
      }
      // eslint-disable-next-line
      if (subRows) for (const r of subRows) applySubJob(r as any);
      // eslint-disable-next-line
      if (jobRow) applyJob(jobRow as any);
      // eslint-disable-next-line
      return (jobRow as any)?.status ?? null;
    }

    function isTerminal(status: string | null): boolean {
      return status === 'completed' || status === 'failed' || status === 'cancelled';
    }

    async function pollLoop() {
      const status = await pollOnce();
      if (cancelled) return;
      if (isTerminal(status)) {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }
    }

    // Always poll — first tick now, then every second until terminal.
    void pollLoop();
    pollTimer = setInterval(() => void pollLoop(), 1000);

    // Realtime bonus channel — speeds updates up but the UI does not
    // depend on it.
    const channel = sb
      .channel(`job:${jobId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sub_jobs', filter: `job_id=eq.${jobId}` },
        (payload) => {
          // eslint-disable-next-line
          applySubJob(payload.new as any);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        (payload) => {
          // eslint-disable-next-line
          applyJob(payload.new as any);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      void sb.removeChannel(channel);
    };
  }, [jobId, updateNodeStatus, setNodePreview, setStats, setRunState]);
}

function normaliseStatus(s: string | null | undefined): NodeStatus {
  switch (s) {
    case 'pending':
      return 'wait';
    case 'running':
      return 'running';
    case 'completed':
      return 'done';
    case 'failed':
      return 'error';
    default:
      return 'idle';
  }
}

// Best-effort extraction of {url, kind} pairs from a sub_job's output blob.
// Worker is free to use any of these shapes; we accept the union.
function extractMedia(output: unknown): PreviewMedia[] {
  if (!output || typeof output !== 'object') return [];
  // eslint-disable-next-line
  const o = output as any;
  if (Array.isArray(o.media)) return o.media.filter(isMedia);
  if (Array.isArray(o.images)) return o.images.map((u: string) => ({ url: u, kind: 'image' }));
  if (Array.isArray(o.videos)) return o.videos.map((u: string) => ({ url: u, kind: 'video' }));
  if (typeof o.url === 'string') {
    const kind = inferKind(o.url, o.mime);
    return [{ url: o.url, kind, mime: o.mime }];
  }
  return [];
}

function isMedia(x: unknown): x is PreviewMedia {
  return !!x && typeof x === 'object' && typeof (x as PreviewMedia).url === 'string';
}

function inferKind(url: string, mime?: string): PreviewMedia['kind'] {
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('image/')) return 'image';
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return 'video';
  return 'image';
}
