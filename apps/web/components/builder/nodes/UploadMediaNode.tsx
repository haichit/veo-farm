'use client';

import { Upload, ImageIcon, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { useFlowStore } from '@/lib/builder/flow-store';

export function UploadMediaNode(props: NodeProps) {
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = ((props.data as any)?.config ?? {}) as {
    imageUrl?: string;
    imagePath?: string;
    mime?: string;
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload to Supabase Storage via /api/upload-media. Returns a small signed
  // URL we can safely store in the workflow config (no more 50MB data URLs
  // breaking localStorage and Postgres INSERTs).
  async function onFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/upload-media', { method: 'POST', body: fd });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.error ?? `${r.status} ${r.statusText}`);
      }
      const { url, name, mime } = (await r.json()) as { url: string; name: string; mime: string };
      updateConfig(props.id, { imageUrl: url, imagePath: name, mime });
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setUploading(false);
    }
  }

  const isVideo =
    cfg.mime?.startsWith('video/') ||
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(cfg.imageUrl ?? '');

  return (
    <BaseNode
      {...props}
      runIcon="upload"
      onRun={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {cfg.imageUrl ? (
        <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
          {isVideo ? (
            <video
              src={cfg.imageUrl}
              className="nodrag flex-1 min-h-[80px] w-full object-cover rounded-md border border-white/[0.08]"
              muted
              controls
              preload="metadata"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cfg.imageUrl}
              alt={cfg.imagePath ?? 'preview'}
              className="flex-1 min-h-[80px] w-full object-cover rounded-md border border-white/[0.08]"
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-text-muted truncate flex-1">{cfg.imagePath}</span>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              className="nodrag text-[9px] text-text-muted hover:text-accent"
            >
              ↻ chọn lại
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={uploading}
          className="nodrag flex-1 min-h-[80px] w-full flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-white/[0.12] bg-[#12121f] text-text-muted hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-60"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          <span className="text-[10px]">{uploading ? 'Đang upload...' : 'Click to upload'}</span>
          {!uploading && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted">
              <ImageIcon size={9} /> image / video (≤100MB)
            </span>
          )}
        </button>
      )}
      {error && (
        <div className="mt-1.5 px-2 py-1 rounded text-[10px] bg-error/10 border border-error/30 text-error">
          ⚠ {error}
        </div>
      )}
    </BaseNode>
  );
}
