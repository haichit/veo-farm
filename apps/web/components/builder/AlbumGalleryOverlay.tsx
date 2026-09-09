'use client';

import { Image as ImageIcon, Trash2, X, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFlowStore } from '@/lib/builder/flow-store';
import { downloadMediaUrl, inferMediaFilename } from '@/lib/download-media';
import { Lightbox } from './preview/Lightbox';

// Fullscreen overlay (z-9000) showing every media output collected this
// session. Powered by flow-store.albumMedia which setNodePreview appends to.
export function AlbumGalleryOverlay() {
  const albumOpen = useFlowStore((s) => s.albumOpen);
  const closeAlbum = useFlowStore((s) => s.closeAlbum);
  const albumMedia = useFlowStore((s) => s.albumMedia);
  const clearAlbum = useFlowStore((s) => s.clearAlbum);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!albumOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && lightboxIdx === null) closeAlbum();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [albumOpen, closeAlbum, lightboxIdx]);

  if (!albumOpen) return null;

  return (
    <div className="fixed inset-0 z-[9000] bg-[rgba(5,5,15,0.92)] backdrop-blur-xl flex flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.07] flex-shrink-0">
        <ImageIcon size={22} className="text-[#a78bfa]" />
        <div>
          <div className="text-base font-bold text-[#f1f5f9]">Album Kết Quả Workflow</div>
          <div className="text-[11px] text-[#64748b]">
            Ảnh & Video tạm thời trong phiên làm việc này ({albumMedia.length})
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {albumMedia.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Xoá toàn bộ media trong album?')) clearAlbum();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-error/30 bg-error/[0.08] text-error text-xs hover:bg-error/[0.15] transition-colors"
            >
              <Trash2 size={14} /> Xoá
            </button>
          )}
          <button
            type="button"
            onClick={closeAlbum}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 bg-white/[0.05] text-[#94a3b8] text-xs hover:bg-white/[0.1] transition-colors"
          >
            <X size={14} /> Đóng
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {albumMedia.length === 0 ? (
          <div className="text-center py-20 text-[#334155]">
            <ImageIcon size={56} className="mx-auto opacity-30" />
            <p className="mt-3 text-sm">
              Chưa có media nào.
              <br />
              Chạy một Workflow để kết quả hiển thị ở đây.
            </p>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
          >
            {albumMedia.map((m, i) => (
              <div
                key={`${m.url}-${i}`}
                className="group relative aspect-square rounded-lg overflow-hidden bg-white/[0.04] border border-white/[0.08] cursor-pointer hover:border-accent/40 transition-colors"
                onClick={() => setLightboxIdx(i)}
              >
                {m.kind === 'video' ? (
                  <video
                    src={m.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
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
                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadMediaUrl(m.url, inferMediaFilename(m.url, m.kind, i + 1)).catch((err) => {
                      alert(`Tải xuống thất bại: ${(err as Error).message ?? err}`);
                    });
                  }}
                  className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center w-8 h-8 rounded-md bg-black/60 hover:bg-black/80 text-white"
                  title="Tải xuống"
                >
                  <Download size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightboxIdx !== null && (
        <Lightbox media={albumMedia} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
    </div>
  );
}
