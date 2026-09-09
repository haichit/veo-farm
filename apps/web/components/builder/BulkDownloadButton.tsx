'use client';

import { Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BuilderNode } from '@/lib/builder/flow-store';
import { bulkDownloadMedia } from '@/lib/download-media';

interface BulkDownloadButtonProps {
  /** Nodes to pull previewMedia from — whole canvas, or just one frame's nodes. */
  nodes: BuilderNode[];
  /** Compact icon-only style for tight spaces (frame header); full label otherwise. */
  compact?: boolean;
}

// "Tải tất cả ảnh" / "Tải tất cả video" — scoped to whatever `nodes` the
// caller passes in (BuilderToolbar passes every node for a whole-canvas
// download; FrameNode passes just its own children for a per-frame one).
export function BulkDownloadButton({ nodes, compact }: BulkDownloadButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const images = nodes.flatMap((n) => (n.data?.previewMedia ?? []).filter((m) => m.kind === 'image'));
  const videos = nodes.flatMap((n) => (n.data?.previewMedia ?? []).filter((m) => m.kind === 'video'));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    // Capture phase — React Flow's own mousedown handlers stopPropagation()
    // for pan/selection, which would otherwise swallow a bubble-phase
    // document listener before it ever sees a click on the canvas.
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open]);

  if (images.length === 0 && videos.length === 0) return null;

  async function runDownload(kind: 'image' | 'video') {
    const items = (kind === 'image' ? images : videos).map((m, i) => ({
      url: m.url,
      kind: m.kind,
      key: i + 1,
    }));
    setOpen(false);
    setBusy(true);
    try {
      const r = await bulkDownloadMedia(items);
      if (!r.ok) {
        if (r.reason !== 'canceled') alert(`Tải xuống thất bại: ${r.reason ?? 'unknown'}`);
        return;
      }
      if ((r.failed ?? 0) > 0) {
        alert(`Đã lưu ${r.saved}/${items.length} file vào ${r.dir}. ${r.failed} file lỗi.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative nodrag" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={busy}
        title="Tải tất cả ảnh/video"
        className={
          compact
            ? 'flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[10px] text-text-secondary disabled:opacity-50'
            : 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white/[0.05] border border-border text-text-secondary hover:bg-white/[0.1] disabled:opacity-50 transition-colors'
        }
      >
        <Download size={compact ? 11 : 14} />
        {!compact && (busy ? 'Đang tải…' : 'Tải tất cả')}
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 min-w-[180px] rounded-md py-1 bg-bg-card border border-border shadow-lg z-50"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {images.length > 0 && (
            <button
              type="button"
              onClick={() => void runDownload('image')}
              className="w-full text-left px-3 py-1.5 text-[11px] text-text-secondary hover:bg-bg-card-hover transition-colors"
            >
              Tất cả ảnh ({images.length})
            </button>
          )}
          {videos.length > 0 && (
            <button
              type="button"
              onClick={() => void runDownload('video')}
              className="w-full text-left px-3 py-1.5 text-[11px] text-text-secondary hover:bg-bg-card-hover transition-colors"
            >
              Tất cả video ({videos.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
