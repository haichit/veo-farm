'use client';

import { useEffect } from 'react';

// Notifies the Electron main process which user is logged in so the worker
// subprocess can be (re)spawned with WORKER_USER_ID. No-op when running in
// a regular browser (no preload bridge).
export function DesktopUserBridge({ userId }: { userId: string | null }) {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).veoFarmDesktop;
    if (!api?.setCurrentUser) return;
    api.setCurrentUser(userId).catch(() => {
      /* ignore — desktop bridge is best-effort */
    });
  }, [userId]);
  return null;
}
