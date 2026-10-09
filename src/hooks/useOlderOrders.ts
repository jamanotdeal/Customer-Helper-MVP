'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fallbackStore } from '@/lib/firebase';

/**
 * Infinite scroll past the live order window.
 *
 * The realtime listeners hold an account's newest orders only (100 for a
 * customer, 200 for a helper) so that a long history doesn't load, and get
 * re-sent, on every launch. When a list has shown everything it holds, this
 * pages older orders in from the server (fallbackStore.loadOlderOrders). Attach
 * `sentinelRef` to an element at the end of the list; it loads a page whenever
 * that element scrolls into view and `active` is true.
 */
export function useOlderOrders(field: 'customerId' | 'helperId', uid: string | undefined, active: boolean) {
  const [hasOlder, setHasOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // A different account starts from the top again.
  useEffect(() => {
    setHasOlder(true);
  }, [field, uid]);

  const loadOlder = useCallback(async () => {
    if (!uid || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingOlder(true);
    try {
      setHasOlder(await fallbackStore.loadOlderOrders(field, uid));
    } finally {
      loadingRef.current = false;
      setLoadingOlder(false);
    }
  }, [field, uid]);

  const showSentinel = active && hasOlder && Boolean(uid);

  useEffect(() => {
    if (!showSentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadOlder();
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [showSentinel, loadOlder, loadingOlder]);

  return { showSentinel, loadingOlder, sentinelRef };
}
