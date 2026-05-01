'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks, Clock } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';

interface Run {
  id: string;
  flow_id: string;
  status: string;
  input: { idea?: string } | null;
  output_url: string | null;
  created_at: string;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/runs');
    setRuns(await r.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="container mx-auto py-8 px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Runs</h1>
        <p className="text-sm text-text-muted mt-1">Lịch sử jobs · auto-refresh mỗi 5s</p>
      </div>

      {loading && runs.length === 0 ? (
        <p className="text-sm text-text-muted">Đang load...</p>
      ) : runs.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <ListChecks className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary text-sm">Chưa có run nào.</p>
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-border">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/runs/${r.id}`}
              className="flex items-center gap-3 p-4 transition-colors hover:bg-white/[0.02]"
            >
              <div className="w-10 h-10 rounded-xl bg-accent-glow flex items-center justify-center text-accent shrink-0">
                <ListChecks className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-text-primary truncate">
                  {r.input?.idea ?? '(no idea)'}
                </div>
                <div className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {new Date(r.created_at).toLocaleString('vi-VN')}
                </div>
              </div>
              <Badge status={r.status}>{r.status}</Badge>
            </Link>
          ))}
        </GlassCard>
      )}
    </div>
  );
}
