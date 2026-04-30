'use client';
import { useEffect, useState } from 'react';

export function useAccountCount(providerId: string | undefined) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!providerId) return;
    fetch(`/api/accounts?provider=${providerId}&count=1`)
      .then((r) => r.json())
      .then((d) => setCount(d.count ?? 0))
      .catch(() => setCount(0));
  }, [providerId]);
  return count;
}
