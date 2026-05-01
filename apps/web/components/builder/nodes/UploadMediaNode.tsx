'use client';

import { Upload, ImageIcon } from 'lucide-react';
import { useRef } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { useFlowStore } from '@/lib/builder/flow-store';

export function UploadMediaNode(props: NodeProps) {
  const updateConfig = useFlowStore((s) => s.updateNodeConfig);
  const cfg = ((props.data as any)?.config ?? {}) as { imageUrl?: string; imagePath?: string };
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = String(e.target?.result ?? '');
      updateConfig(props.id, { imageUrl: dataUrl, imagePath: file.name });
    };
    reader.readAsDataURL(file);
  }

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
        <div className="space-y-1.5">
          {cfg.imageUrl.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(cfg.imageUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cfg.imageUrl}
              alt={cfg.imagePath ?? 'preview'}
              className="w-full h-24 object-cover rounded-md border border-white/[0.08]"
            />
          ) : (
            <video
              src={cfg.imageUrl}
              className="nodrag w-full h-24 object-cover rounded-md border border-white/[0.08]"
              muted
              preload="metadata"
            />
          )}
          <div className="text-[10px] text-text-muted truncate">{cfg.imagePath}</div>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="nodrag w-full h-20 flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-white/[0.12] bg-[#12121f] text-text-muted hover:border-accent/40 hover:text-accent transition-colors"
        >
          <Upload size={16} />
          <span className="text-[10px]">Click to upload</span>
        </button>
      )}
      {!cfg.imageUrl && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-text-muted">
          <ImageIcon size={10} /> image / video
        </div>
      )}
    </BaseNode>
  );
}
