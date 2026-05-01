'use client';
import { useState } from 'react';
import { useNodeOutput } from '@/lib/hooks/useFlowOutputs';

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-text-muted',
    running: 'bg-info animate-pulse',
    completed: 'bg-success',
    failed: 'bg-error',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? 'bg-text-muted'}`} />;
}

export function ScriptPreview({ nodeId }: { nodeId: string }) {
  const out = useNodeOutput(nodeId);
  const [open, setOpen] = useState(false);
  if (!out) return null;
  const item = out.items[0];
  if (!item) return null;

  return (
    <div className="mt-2 border border-border rounded-lg bg-bg-input p-2">
      <div className="flex items-center gap-2 mb-1">
        <StatusDot status={out.status} />
        <span className="text-[10px] font-medium uppercase tracking-wide">Output</span>
      </div>
      {item.error && <div className="text-[10px] text-error break-words">{item.error.slice(0, 200)}</div>}
      {item.output && (
        <div className="text-[11px] space-y-1">
          <div className="font-medium">{item.output.character_bible?.name ?? '(no name)'}</div>
          <div className="text-text-muted line-clamp-2">{item.output.scene_bible?.setting}</div>
          <div className="text-text-muted">📜 {item.output.scenes?.length ?? 0} scenes</div>
          <button
            className="nodrag text-accent underline text-[10px]"
            onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          >
            {open ? 'Ẩn' : 'Xem JSON'}
          </button>
          {open && (
            <pre className="nodrag nowheel mt-1 text-[9px] bg-bg-primary border border-border text-text-secondary rounded p-1 max-h-60 overflow-auto whitespace-pre-wrap break-all">
              {JSON.stringify(item.output, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ImagesPreview({ nodeId }: { nodeId: string }) {
  const out = useNodeOutput(nodeId);
  if (!out) return null;
  const items = [...out.items].sort((a, b) => (a.sceneIdx ?? 0) - (b.sceneIdx ?? 0));
  return (
    <div className="mt-2 border border-border rounded-lg bg-bg-input p-2">
      <div className="flex items-center gap-2 mb-1">
        <StatusDot status={out.status} />
        <span className="text-[10px] font-medium uppercase tracking-wide">Images ({items.length})</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {items.map((it, i) => (
          <ItemTile key={i} status={it.status} url={it.output?.imageUrl} kind="image" error={it.error} />
        ))}
      </div>
    </div>
  );
}

export function VideosPreview({ nodeId }: { nodeId: string }) {
  const out = useNodeOutput(nodeId);
  if (!out) return null;
  const items = [...out.items].sort((a, b) => (a.sceneIdx ?? 0) - (b.sceneIdx ?? 0));
  return (
    <div className="mt-2 border border-border rounded-lg bg-bg-input p-2">
      <div className="flex items-center gap-2 mb-1">
        <StatusDot status={out.status} />
        <span className="text-[10px] font-medium uppercase tracking-wide">Videos ({items.length})</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {items.map((it, i) => (
          <ItemTile key={i} status={it.status} url={it.output?.videoUrl} kind="video" error={it.error} />
        ))}
      </div>
    </div>
  );
}

export function VoicesPreview({ nodeId }: { nodeId: string }) {
  const out = useNodeOutput(nodeId);
  if (!out) return null;
  const items = [...out.items].sort((a, b) => (a.sceneIdx ?? 0) - (b.sceneIdx ?? 0));
  return (
    <div className="mt-2 border border-border rounded-lg bg-bg-input p-2">
      <div className="flex items-center gap-2 mb-1">
        <StatusDot status={out.status} />
        <span className="text-[10px] font-medium uppercase tracking-wide">Voices ({items.length})</span>
      </div>
      <div className="space-y-1">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-1 text-[10px]">
            <StatusDot status={it.status} />
            <span className="text-text-muted">scene {it.sceneIdx ?? i}</span>
            {it.output?.audioUrl && (
              <audio controls src={it.output.audioUrl} className="nodrag h-6 flex-1" />
            )}
            {it.error && <span className="text-error truncate">{it.error.slice(0, 30)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinalVideoPreview({ nodeId }: { nodeId: string }) {
  const out = useNodeOutput(nodeId);
  if (!out) return null;
  const item = out.items[0];
  if (!item) return null;
  return (
    <div className="mt-2 border border-border rounded-lg bg-bg-input p-2">
      <div className="flex items-center gap-2 mb-1">
        <StatusDot status={out.status} />
        <span className="text-[10px] font-medium uppercase tracking-wide">Final Video</span>
      </div>
      {item.error && <div className="text-[10px] text-error">{item.error.slice(0, 200)}</div>}
      {item.output?.videoUrl && (
        <video
          controls
          src={item.output.videoUrl}
          className="nodrag w-full rounded-lg border border-border bg-black"
          style={{ maxHeight: 220 }}
        />
      )}
    </div>
  );
}

function ItemTile({ status, url, kind, error }: { status: string; url?: string; kind: 'image' | 'video'; error: string | null }) {
  return (
    <div className="relative aspect-[9/16] bg-bg-primary border border-border rounded overflow-hidden">
      {url ? (
        kind === 'image' ? (
          <img src={url} className="w-full h-full object-cover" alt="" />
        ) : (
          <video src={url} className="nodrag w-full h-full object-cover" muted preload="metadata" />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <StatusDot status={status} />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 bg-error/80 text-white text-[8px] p-0.5 flex items-center justify-center text-center break-words">
          ⚠
        </div>
      )}
    </div>
  );
}
