'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Workflow, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FlowItem {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
}

export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/flows');
    setFlows(await res.json());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function createFlow() {
    setCreating(true);
    const res = await fetch('/api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Flow mới', template: true }),
    });
    const flow = await res.json();
    setCreating(false);
    router.push(`/flows/${flow.id}`);
  }

  async function deleteFlow(id: string) {
    if (!confirm('Xoá flow này?')) return;
    await fetch(`/api/flows/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="container mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Flows</h1>
        <Button onClick={createFlow} disabled={creating}>
          <Plus className="h-4 w-4" /> {creating ? 'Đang tạo...' : 'Tạo flow mới'}
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Đang load...</p>
      ) : flows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Chưa có flow nào. Bấm &quot;Tạo flow mới&quot; để bắt đầu.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((f) => (
            <Card key={f.id} className="group relative">
              <Link href={`/flows/${f.id}`}>
                <CardHeader>
                  <Workflow className="h-5 w-5 text-primary" />
                  <CardTitle className="truncate">{f.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Cập nhật: {new Date(f.updated_at).toLocaleString('vi-VN')}
                  </p>
                </CardContent>
              </Link>
              <button
                onClick={() => deleteFlow(f.id)}
                className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
