'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, AlertCircle, ImageIcon, Video, Music, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface SubJob {
  id: string;
  node_id: string;
  node_type: string;
  provider_id: string | null;
  status: string;
  input: any;
  output: any;
  error: string | null;
  retry_count: number;
  started_at: string | null;
  finished_at: string | null;
}

interface RunDetail {
  job: {
    id: string;
    status: string;
    input: any;
    output_url: string | null;
    error: string | null;
    started_at: string | null;
    finished_at: string | null;
  };
  sub_jobs: SubJob[];
}

function progressFor(subs: SubJob[]) {
  if (subs.length === 0) return 0;
  const done = subs.filter(
    (s) => s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled',
  ).length;
  return Math.round((done / subs.length) * 100);
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RunDetail | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const r = await fetch(`/api/runs/${id}`);
      const d = await r.json();
      if (active) setData(d);
    }
    load();
    const t = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [id]);

  if (!data) return <div className="p-6 text-sm text-text-muted">Đang load...</div>;

  const grouped = data.sub_jobs.reduce<Record<string, SubJob[]>>((acc, sj) => {
    (acc[sj.node_id] ??= []).push(sj);
    return acc;
  }, {});

  const totalProgress = progressFor(data.sub_jobs);

  return (
    <div className="container mx-auto py-6 px-6 max-w-4xl">
      <Link
        href="/runs"
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to runs
      </Link>

      <GlassCard className="p-5 mb-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-text-primary">
              Run · <span className="font-mono text-sm text-text-muted">{data.job.id.slice(0, 8)}</span>
            </h1>
            {data.job.input?.idea && (
              <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                {data.job.input.idea}
              </p>
            )}
          </div>
          <Badge status={data.job.status}>{data.job.status}</Badge>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-text-muted">
            <span>Tiến độ</span>
            <span>
              {data.sub_jobs.filter((s) => s.status === 'completed').length}/{data.sub_jobs.length}{' '}
              · {totalProgress}%
            </span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-secondary transition-all"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>

        {data.job.error && (
          <div className="mt-4 text-sm text-error bg-error-bg border border-error/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="break-words">{data.job.error}</span>
          </div>
        )}

        {data.job.output_url && (
          <Button asChild variant="primary" className="mt-4" size="sm">
            <a href={data.job.output_url} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4" /> Download MP4
            </a>
          </Button>
        )}
      </GlassCard>

      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2 px-1">
        Sub-jobs
      </h2>
      <div className="space-y-3">
        {Object.entries(grouped).map(([nodeId, subs]) => (
          <GlassCard key={nodeId} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-text-primary">{nodeId}</span>
              <span className="text-[11px] text-text-muted">· {subs[0].node_type}</span>
              <span className="ml-auto text-[11px] text-text-muted">
                {subs.filter((s) => s.status === 'completed').length}/{subs.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {subs.map((sj) => (
                <div
                  key={sj.id}
                  className="flex items-center gap-2 text-xs text-text-secondary"
                >
                  <Badge status={sj.status} className="!text-[10px]">
                    {sj.status}
                  </Badge>
                  {sj.provider_id && (
                    <span className="text-text-muted">{sj.provider_id}</span>
                  )}
                  {sj.input?.sceneIdx !== undefined && (
                    <span className="text-text-muted">scene {sj.input.sceneIdx}</span>
                  )}
                  {sj.error && (
                    <span className="text-error truncate flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {sj.error}
                    </span>
                  )}
                  {sj.output?.imageUrl && (
                    <a
                      href={sj.output.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline inline-flex items-center gap-0.5"
                    >
                      <ImageIcon className="w-3 h-3" /> image
                    </a>
                  )}
                  {sj.output?.videoUrl && (
                    <a
                      href={sj.output.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline inline-flex items-center gap-0.5"
                    >
                      <Video className="w-3 h-3" /> video
                    </a>
                  )}
                  {sj.output?.audioUrl && (
                    <a
                      href={sj.output.audioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline inline-flex items-center gap-0.5"
                    >
                      <Music className="w-3 h-3" /> audio
                    </a>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
