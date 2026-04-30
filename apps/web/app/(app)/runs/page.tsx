'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
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
      <h1 className="text-2xl font-bold mb-6">Runs</h1>
      {loading && runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Đang load...</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có run nào.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <Link key={r.id} href={`/runs/${r.id}`}>
              <Card className="hover:bg-accent cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{r.input?.idea ?? '(no idea)'}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString('vi-VN')}
                    </div>
                  </div>
                  <Badge status={r.status}>{r.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
