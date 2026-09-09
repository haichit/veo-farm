'use client';

import { useState } from 'react';
import { Lightbox } from './Lightbox';
import type { PreviewMedia as PM } from '@/lib/builder/flow-store';

interface PreviewMediaProps {
  media: PM[];
}

// Inline grid of media thumbnails inside a node body. Hover autoplay for
// videos, double-click opens the fullscreen Lightbox.
export function PreviewMedia({ media }: PreviewMediaProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  if (!media || media.length === 0) return null;

  const n = media.length;
  const cols = n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : n <= 9 ? 3 : 4;

  return (
    <>
      <div
        className="mt-2 grid gap-1.5 w-full min-w-0"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {media.map((m, i) => (
          <Thumb key={`${m.url}-${i}`} media={m} index={i} total={media.length} onOpen={() => setLightboxIdx(i)} />
        ))}
      </div>
      {lightboxIdx !== null && (
        <Lightbox media={media} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
    </>
  );
}

function Thumb({
  media,
  index,
  total,
  onOpen,
}: {
  media: PM;
  index: number;
  total: number;
  onOpen: () => void;
}) {
  // A single item shows at its real aspect ratio (capped by max-height) so a
  // portrait 9:16 image/video isn't forced into a 16:9 box and cropped down
  // to a near-square sliver via object-cover. Grids of 2+ still use a fixed
  // 16:9 cell — needed for a uniform grid when mixing different aspects.
  const single = total === 1;

  return (
    <div
      className={
        single
          ? 'nodrag relative w-full max-h-72 rounded-md overflow-hidden bg-white/[0.04] border border-white/[0.08] cursor-pointer group'
          : 'nodrag relative aspect-video w-full rounded-md overflow-hidden bg-white/[0.04] border border-white/[0.08] cursor-pointer group'
      }
      onDoubleClick={onOpen}
      onMouseDown={(e) => e.stopPropagation()}
      title="Nhấp đúp để xem"
    >
      {media.kind === 'video' ? (
        <video
          src={media.url}
          muted
          playsInline
          preload="metadata"
          className={single ? 'w-full h-full max-h-72 object-contain' : 'w-full h-full object-cover'}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLVideoElement).play().catch(() => {});
          }}
          onMouseLeave={(e) => {
            const v = e.currentTarget as HTMLVideoElement;
            v.pause();
            v.currentTime = 0;
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.url}
          alt=""
          className={single ? 'w-full h-full max-h-72 object-contain' : 'w-full h-full object-cover'}
        />
      )}
      {total > 1 && (
        <span className="absolute top-1 left-1 px-1 py-px rounded bg-black/60 text-[9px] text-white tabular-nums">
          {index + 1}/{total}
        </span>
      )}
    </div>
  );
}
