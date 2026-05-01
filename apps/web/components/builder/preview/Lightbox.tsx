'use client';

import { Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { PreviewMedia } from '@/lib/builder/flow-store';

interface LightboxProps {
  media: PreviewMedia[];
  startIndex: number;
  onClose: () => void;
}

// Fullscreen viewer for image/video previews. ESC closes, arrow keys navigate,
// Download button saves the active item with a sensible filename.
export function Lightbox({ media, startIndex, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(startIndex);

  const prev = useCallback(() => setIdx((i) => (i - 1 + media.length) % media.length), [media.length]);
  const next = useCallback(() => setIdx((i) => (i + 1) % media.length), [media.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  const item = media[idx];
  if (!item) return null;

  function downloadActive() {
    const a = document.createElement('a');
    a.href = item.url;
    a.download = inferFilename(item, idx);
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
  }

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute top-3 right-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={downloadActive}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs"
        >
          <Download size={14} /> Tải xuống
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs"
        >
          <X size={14} /> Đóng
        </button>
      </div>

      {media.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      <div className="max-w-[92vw] max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
        {item.kind === 'video' ? (
          <video src={item.url} controls autoPlay className="max-w-full max-h-[88vh] rounded-md" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" className="max-w-full max-h-[88vh] rounded-md object-contain" />
        )}
      </div>

      {media.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs">
          {idx + 1} / {media.length}
        </div>
      )}
    </div>
  );
}

function inferFilename(m: PreviewMedia, idx: number): string {
  const ext = m.kind === 'video' ? 'mp4' : 'png';
  try {
    const u = new URL(m.url);
    const last = u.pathname.split('/').pop();
    if (last && last.includes('.')) return last;
  } catch {
    /* not a URL — data: or relative */
  }
  return `veo-farm-${m.kind}-${idx + 1}.${ext}`;
}
