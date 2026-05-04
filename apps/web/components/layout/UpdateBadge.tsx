'use client';

import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';

type UpdateState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  | { state: 'not-supported' };

interface DesktopBridge {
  getAppVersion?: () => Promise<string>;
  update?: {
    getStatus: () => Promise<UpdateState>;
    check: () => Promise<{ ok: boolean; reason?: string }>;
    install: () => Promise<{ ok: boolean; reason?: string }>;
    onEvent: (cb: (payload: UpdateState) => void) => () => void;
  };
}

declare global {
  interface Window {
    veoFarmDesktop?: DesktopBridge;
  }
}

export function UpdateBadge() {
  const [status, setStatus] = useState<UpdateState>({ state: 'idle' });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  useEffect(() => {
    window.veoFarmDesktop?.getAppVersion?.().then(setCurrentVersion).catch(() => {});
  }, []);

  useEffect(() => {
    // Dev-mode demo: ?demoUpdate=downloaded|checking|available|error to
    // exercise the UI without an Electron host. Skipped in real Electron
    // because that ships the IPC bridge.
    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demoUpdate');
    if (demo && !window.veoFarmDesktop?.update) {
      const map: Record<string, UpdateState> = {
        idle: { state: 'idle' },
        checking: { state: 'checking' },
        downloading: { state: 'downloading', version: '0.1.14', percent: 42 },
        downloaded: { state: 'downloaded', version: '0.1.14' },
        error: { state: 'error', message: 'Network timeout (demo)' },
      };
      setStatus(map[demo] ?? { state: 'idle' });
      return;
    }

    const api = window.veoFarmDesktop?.update;
    if (!api) return; // not running inside Electron, hide
    let unsub = () => {};
    api.getStatus().then(setStatus).catch(() => {});
    unsub = api.onEvent((p) => setStatus(p as UpdateState));
    return unsub;
  }, []);

  // Hide entirely outside Electron unless the demo flag is set above.
  const isDemo =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demoUpdate');
  if (!isDemo && typeof window !== 'undefined' && !window.veoFarmDesktop?.update) return null;
  if (status.state === 'not-supported') return null;

  if (status.state === 'downloaded') {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-400 hover:to-pink-400 shadow-md shadow-orange-500/30 animate-pulse"
          title={`Có bản v${status.version} sẵn sàng — bấm để cài`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Update v{status.version}
        </button>
        {confirmOpen && (
          <UpdateConfirmModal
            version={status.version}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={() => {
              window.veoFarmDesktop?.update?.install();
            }}
          />
        )}
      </>
    );
  }

  if (status.state === 'checking') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-text-muted bg-white/[0.04] border border-white/[0.08]">
        <Loader2 className="w-3 h-3 animate-spin" /> Đang kiểm tra update...
      </span>
    );
  }

  if (status.state === 'downloading') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-accent bg-accent-glow border border-accent/30">
        <Loader2 className="w-3 h-3 animate-spin" />
        Đang tải v{status.version} ({status.percent}%)
      </span>
    );
  }

  if (status.state === 'error') {
    return (
      <button
        type="button"
        onClick={() => window.veoFarmDesktop?.update?.check()}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-error bg-error-bg border border-error/30 hover:bg-error/20 transition-colors"
        title={`Update lỗi: ${status.message}. Bấm để thử lại.`}
      >
        <AlertTriangle className="w-3 h-3" /> Update lỗi
      </button>
    );
  }

  // idle / available — render a quiet check button + current version chip
  const versionLabel =
    currentVersion ?? (isDemo ? '0.1.13' : null);
  return (
    <button
      type="button"
      onClick={() => window.veoFarmDesktop?.update?.check()}
      className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-text-muted hover:text-text-secondary bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] transition-colors"
      title={
        versionLabel
          ? `Đang chạy v${versionLabel} — bấm để kiểm tra update`
          : 'Kiểm tra update'
      }
    >
      {versionLabel && (
        <span className="font-mono text-text-secondary">v{versionLabel}</span>
      )}
      <RefreshCw className="w-3 h-3 opacity-70 group-hover:rotate-180 transition-transform duration-500" />
      <span className="hidden md:inline">Kiểm tra</span>
    </button>
  );
}

function UpdateConfirmModal({
  version,
  onCancel,
  onConfirm,
}: {
  version: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-bg-card border border-border rounded-xl shadow-2xl max-w-md w-full mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-base font-semibold text-text-primary">
              Có bản cập nhật mới — v{version}
            </h2>
            <p className="text-xs text-text-muted mt-1">
              App sẽ đóng và cài đặt ngay.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-md bg-warning-bg border border-warning/30 text-xs text-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Vui lòng <strong>LƯU mọi workflow</strong> trước khi tiếp tục — mọi thay đổi chưa lưu sẽ mất.
          </span>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded-md text-xs font-medium text-text-secondary bg-white/[0.04] hover:bg-white/[0.08] border border-border transition-colors"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-md text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-400 hover:to-pink-400 shadow-md shadow-orange-500/30"
          >
            Update ngay
          </button>
        </div>
      </div>
    </div>
  );
}
