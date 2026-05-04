'use client';

import { useEffect, useState } from 'react';

interface Veo3Account {
  id: string;
  label: string;
  status: string;
}

let cache: Veo3Account[] | null = null;
let inflight: Promise<Veo3Account[]> | null = null;
const subscribers = new Set<(rows: Veo3Account[]) => void>();

async function load(): Promise<Veo3Account[]> {
  const res = await fetch('/api/accounts?provider=veo3');
  if (!res.ok) throw new Error(`accounts: ${res.status}`);
  const data = await res.json();
  const rows: Veo3Account[] = (Array.isArray(data) ? data : (data.rows ?? [])).map(
    (a: { id: string; label?: string; status?: string }) => ({
      id: a.id,
      label: a.label || a.id.slice(0, 8),
      status: a.status ?? 'idle',
    }),
  );
  cache = rows;
  for (const fn of subscribers) fn(rows);
  return rows;
}

/**
 * Lightweight SWR-style fetch of veo3 accounts. First subscriber triggers a
 * single network call; later subscribers reuse the cache. Manual refresh via
 * the returned `reload`.
 */
export function useVeo3Accounts(): { accounts: Veo3Account[]; reload: () => void } {
  const [accounts, setAccounts] = useState<Veo3Account[]>(cache ?? []);

  useEffect(() => {
    subscribers.add(setAccounts);
    if (cache === null && !inflight) {
      inflight = load().finally(() => {
        inflight = null;
      });
    } else if (cache) {
      setAccounts(cache);
    }
    return () => {
      subscribers.delete(setAccounts);
    };
  }, []);

  return {
    accounts,
    reload: () => {
      cache = null;
      inflight = load().finally(() => {
        inflight = null;
      });
    },
  };
}
