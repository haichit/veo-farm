'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X, AlertTriangle } from 'lucide-react';

// Top-of-screen banner shown right after the Electron app auto-updates.
// Reads ?updated=1&from=...&to=... from the URL (set by Electron main on
// launch). Persists to sessionStorage so refreshes don't dismiss it until
// the user clicks ✕.
export function UpdatedBanner() {
  const [info, setInfo] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('updated') === '1') {
      const from = params.get('from') ?? '';
      const to = params.get('to') ?? '';
      sessionStorage.setItem('vf-updated', JSON.stringify({ from, to }));
      // Strip the query so a manual refresh keeps the URL clean.
      const url = new URL(window.location.href);
      url.searchParams.delete('updated');
      url.searchParams.delete('from');
      url.searchParams.delete('to');
      window.history.replaceState({}, '', url.toString());
      setInfo({ from, to });
      return;
    }
    const cached = sessionStorage.getItem('vf-updated');
    if (cached) {
      try {
        setInfo(JSON.parse(cached));
      } catch {
        /* ignore */
      }
    }
  }, []);

  if (!info) return null;

  return (
    <div className="bg-gradient-to-r from-accent/30 via-accent/20 to-accent/30 border-b border-accent/40 px-4 py-2.5 flex items-center gap-3">
      <Sparkles className="w-4 h-4 text-accent shrink-0" />
      <div className="flex-1 text-sm text-text-primary">
        <span className="font-semibold">Đã cập nhật lên v{info.to}</span>
        {info.from && (
          <span className="text-text-muted text-xs ml-2">(từ v{info.from})</span>
        )}
        <span className="ml-3 inline-flex items-center gap-1 text-warning text-[12px]">
          <AlertTriangle className="w-3.5 h-3.5" />
          Mở workflow đang làm dở và bấm <strong className="mx-1">Lưu</strong> ngay để tránh lệch schema.
        </span>
      </div>
      <button
        onClick={() => {
          sessionStorage.removeItem('vf-updated');
          setInfo(null);
        }}
        className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary"
        aria-label="Đóng"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
