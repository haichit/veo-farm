'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
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

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Đang load...</div>;

  const grouped = data.sub_jobs.reduce<Record<string, SubJob[]>>((acc, sj) => {
    (acc[sj.node_id] ??= []).push(sj);
    return acc;
  }, {});

  return (
    <div className="container mx-auto py-6 px-6 max-w-4xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold">Run · <span className="font-mono text-sm">{data.job.id.slice(0, 8)}</span></h1>
        <div className="flex items-center gap-2 mt-1">
          <Badge status={data.job.status}>{data.job.status}</Badge>
          <span className="text-xs text-muted-foreground">{data.job.input?.idea}</span>
        </div>
        {data.job.error && (
          <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">⚠ {data.job.error}</div>
        )}
        {data.job.output_url && (
          <Button asChild className="mt-3" size="sm">
            <a href={data.job.output_url} target="_blank">⬇ Download MP4</a>
          </Button>
        )}
      </div>

      <h2 className="text-sm font-semibold mt-6 mb-2">Sub-jobs</h2>
      <div className="space-y-3">
        {Object.entries(grouped).map(([nodeId, subs]) => (
          <Card key={nodeId}>
            <CardContent className="p-3">
              <div className="text-sm font-medium mb-1">
                {nodeId} <span className="text-muted-foreground">· {subs[0].node_type}</span>
              </div>
              <div className="space-y-1">
                {subs.map((sj) => (
                  <div key={sj.id} className="flex items-center gap-2 text-xs">
                    <Badge status={sj.status} className="!text-[10px]">{sj.status}</Badge>
                    {sj.provider_id && <span className="text-muted-foreground">{sj.provider_id}</span>}
                    {sj.input?.sceneIdx !== undefined && <span>scene {sj.input.sceneIdx}</span>}
                    {sj.error && <span className="text-red-600 truncate">⚠ {sj.error}</span>}
                    {sj.output?.imageUrl && (
                      <a href={sj.output.imageUrl} target="_blank" className="underline">
                        image
                      </a>
                    )}
                    {sj.output?.videoUrl && (
                      <a href={sj.output.videoUrl} target="_blank" className="underline">
                        video
                      </a>
                    )}
                    {sj.output?.audioUrl && (
                      <a href={sj.output.audioUrl} target="_blank" className="underline">
                        audio
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
