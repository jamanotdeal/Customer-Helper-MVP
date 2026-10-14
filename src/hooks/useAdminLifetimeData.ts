'use client';

import { useCallback, useEffect, useState } from 'react';
import { fallbackStore } from '@/lib/firebase';

/**
 * For admin views that show helper wallets or lifetime totals: those are summed
 * from every order, withdrawal and shop order, which the admin panel no longer
 * reads at startup. This asks for them when such a view is open (once per
 * session — see ensureAdminLifetimeData) and re-renders when they arrive.
 * Until `ready`, the view's totals are incomplete and it should say so.
 */
export function useAdminLifetimeData(enabled = true) {
  const [ready, setReady] = useState(() => fallbackStore.isAdminLifetimeDataReady());
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Also catches a Refresh re-reading it after it was ready.
    const sync = () => {
      if (!cancelled) setReady(fallbackStore.isAdminLifetimeDataReady());
    };
    const unsub = fallbackStore.subscribe(sync);
    setError(false);
    fallbackStore
      .ensureAdminLifetimeData()
      .then(sync)
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ready, loading: enabled && !ready && !error, error: enabled && error, retry };
}
