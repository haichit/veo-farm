'use client';

import { useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useFlowStore, type NodeStatus, type PreviewMedia } from './flow-store';

// Subscribes to Supabase Realtime updates for a Builder job and bridges them
// into the flow store. Mounted by the canvas page when currentJobId !== null.
//
// Channel listens to:
//   - sub_jobs UPDATE  → per-node status + previewMedia
//   - jobs UPDATE      → aggregated stats + run state transitions
export function useJobSubscription(jobId: string | null) {
  const updateNodeStatus = useFlowStore((s) => s.updateNodeStatus);
  const setNodePreview = useFlowStore((s) => s.setNodePreview);
  const setStats = useFlowStore((s) => s.setStats);
  const setRunState = useFlowStore((s) => s.setRunState);

  useEffect(() => {
    if (!jobId) return;
    const sb = createSupabaseBrowserClient();
    const channel = sb
      .channel(`job:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sub_jobs', filter: `job_id=eq.${jobId}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          if (!row?.node_id) return;
          updateNodeStatus(row.node_id, normaliseStatus(row.status), {
            error: row.error ?? undefined,
          });
          const media = extractMedia(row.output);
          if (media.length > 0) setNodePreview(row.node_id, media);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          if (row?.stats) setStats(row.stats);
          if (row?.status === 'completed') setRunState('idle');
          else if (row?.status === 'failed') setRunState('idle');
          else if (row?.status === 'cancelled') setRunState('stopped');
          else if (row?.status === 'paused') setRunState('paused');
          else if (row?.status === 'running') setRunState('running');
        },
      )
      .subscribe();

    return () => {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
