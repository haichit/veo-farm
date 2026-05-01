'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RunButton({ flowId }: { flowId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_id: flowId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Run failed: ${data.error ?? 'unknown'}`);
        return;
      }
      router.push(`/runs/${data.id}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button onClick={run} disabled={running} variant="primary" size="sm">
      <Play className="h-4 w-4" /> {running ? 'Đang queue...' : 'Run'}
    </Button>
  );
}
