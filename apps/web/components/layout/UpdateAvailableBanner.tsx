'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X, AlertTriangle } from 'lucide-react';

type UpdateState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  | { state: 'not-supported' };

// Top-of-screen pre-install banner. Appears when an update is fully
// downloaded and waiting for the user to click "Update" in the top-right
// UpdateBadge. Dismissible per-session.
export function UpdateAvailableBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demoUpdate');
    if (demo === 'downloaded') {
      setVersion('0.1.14');
      return;
    }
    const api = window.veoFarmDesktop?.update;
    if (!api) return;
    let unsub = () => {};
    api.getStatus().then((s: UpdateState) => {
      if (s.state === 'downloaded') setVersion(s.version);
    });
    unsub = api.onEvent((p) => {
      const s = p as UpdateState;
      if (s.state === 'downloaded') {
        setVersion(s.version);
        setDismissed(false);
      }
    });
    return unsub;
  }, []);

  if (!version || dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-orange-500/25 via-pink-500/20 to-orange-500/25 border-b border-orange-400/40 px-4 py-2.5 flex items-center gap-3">
      <Sparkles className="w-4 h-4 text-orange-300 shrink-0" />
      <div className="flex-1 text-sm text-text-primary">
        <span className="font-semibold">Có bản cập nhật mới — v{version}.</span>
        <span className="ml-2 inline-flex items-center gap-1 text-warning text-[12px]">
          <AlertTriangle className="w-3.5 h-3.5" />
          Vui lòng <strong className="mx-1">LƯU mọi workflow</strong> rồi bấm{' '}
          <strong className="mx-1">Update</strong> ở góc trên phải để cài.
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary"
        aria-label="Đóng"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
