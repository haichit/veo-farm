'use client';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FinalVideoPreview } from './OutputPreview';

export function ConcatNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow();
  const config = (data?.config as any) ?? {};
  const transition = config.transition ?? 'fade';
  const addCaption = config.add_caption ?? true;

  const update = (patch: Record<string, unknown>) =>
    rf.setNodes((ns) =>
      ns.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config: { ...config, ...patch } } } : n,
      ),
    );

  return (
    <BaseNode selected={selected} icon="🎞️" title="Concat + Audio" width={340}>
      <div>
        <label className="text-muted-foreground">Transition</label>
        <Select value={transition} onValueChange={(v) => update({ transition: v })}>
          <SelectTrigger className="h-7 text-xs nodrag">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cut">Cut</SelectItem>
            <SelectItem value="fade">Fade</SelectItem>
            <SelectItem value="dissolve">Dissolve</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 nodrag">
        <input
          type="checkbox"
          checked={addCaption}
          onChange={(e) => update({ add_caption: e.target.checked })}
        />
        <span>Burn captions (Whisper)</span>
      </label>
      <FinalVideoPreview nodeId={id} />
    </BaseNode>
  );
}
