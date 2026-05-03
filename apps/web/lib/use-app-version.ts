'use client';

import { useEffect, useState } from 'react';

// Reads the real packaged version from the Electron main process via the
// preload bridge. Falls back to the hardcoded string when running in a
// regular browser (web-only dev mode).
const FALLBACK = '0.1.0';

export function useAppVersion(): string {
  const [v, setV] = useState(FALLBACK);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).veoFarmDesktop;
    if (!api?.getAppVersion) return;
    api.getAppVersion().then((ver: string) => ver && setV(ver)).catch(() => {});
  }, []);
  return v;
}
