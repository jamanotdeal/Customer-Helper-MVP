'use client';

import { useEffect } from 'react';
import { isNativeApp, setPullToRefreshEnabled } from '@/lib/native';

/**
 * Suppresses the native pull-to-refresh gesture while a component is mounted.
 *
 * Needed because the Java side can only see the WebView's own scroll position.
 * The app's inner scrollers — the notification drawer, admin tables, and every
 * Leaflet map — consume touch themselves, so `webView.getScrollY()` stays at 0
 * and a downward drag inside them would otherwise trigger a page refresh.
 *
 * Counted rather than boolean: nested overlays (a map modal opened from inside
 * another modal) would otherwise let the inner one re-arm the gesture when it
 * closes, while the outer one is still open.
 *
 * No-op on web.
 *
 * @example
 *   export function MapPickerModal() {
 *     usePullToRefreshLock();
 *     ...
 *   }
 */
let lockCount = 0;

export function usePullToRefreshLock(active: boolean = true): void {
  useEffect(() => {
    if (!active || !isNativeApp()) return;

    lockCount += 1;
    if (lockCount === 1) setPullToRefreshEnabled(false);

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) setPullToRefreshEnabled(true);
    };
  }, [active]);
}

export default usePullToRefreshLock;
