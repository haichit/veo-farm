'use client';
import { useReactFlow } from '@xyflow/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useAccountCount } from '@/lib/hooks/useAccountCount';

interface Props {
  id: string;
  provider: string;
  options: { value: string; label: string; disabled?: boolean }[];
  concurrency?: number | 'auto';
  showConcurrency?: boolean;
}

export function ProviderConfig({ id, provider, options, concurrency = 'auto', showConcurrency = true }: Props) {
  const rf = useReactFlow();
  const accountCount = useAccountCount(provider);

  const update = (patch: Record<string, unknown>) =>
    rf.setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    );

  const concNum = concurrency === 'auto' ? Math.max(1, accountCount) : concurrency;

  return (
    <div className="space-y-2">
      <div>
        <label className="text-muted-foreground">Provider</label>
        <Select value={provider} onValueChange={(v) => update({ provider: v })}>
          <SelectTrigger className="h-7 text-xs nodrag">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showConcurrency && (
        <div>
          <label className="text-muted-foreground">
            Concurrency: {concNum} / {Math.max(1, accountCount)}
          </label>
          <Slider
            className="nodrag"
            value={[concNum]}
            min={1}
            max={Math.max(1, accountCount)}
            step={1}
            onValueChange={(v) => update({ concurrency: v[0] })}
          />
        </div>
      )}
      <div className="text-[10px] text-muted-foreground">{accountCount} account khả dụng</div>
    </div>
  );
}
