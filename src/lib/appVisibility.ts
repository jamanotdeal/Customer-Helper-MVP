/**
 * "Is the app actually in front of the user right now?" — one answer for both
 * the browser and the Android build.
 *
 * The Page Visibility API alone is not enough inside Capacitor: the WebView is
 * not necessarily notified when the Android activity stops, so a backgrounded
 * app can keep reporting `document.hidden === false` and every timer gated on
 * it keeps running with the screen off. That is precisely the case this app
 * cares about, because DutyForegroundService deliberately keeps the process
 * alive for on-duty helpers — nothing else would stop those timers.
 *
 * So the two signals are combined: the DOM's own visibility, and Capacitor's
 * appStateChange. Hidden by either means hidden.
 *
 * This is a foreground-work gate only. Background delivery does not depend on
 * it: the Firestore listener in DutyForegroundService and the FCM push from
 * functions/index.js both run outside the WebView entirely.
 */

type VisibilityListener = (visible: boolean) => void;

const listeners = new Set<VisibilityListener>();

/** Capacitor's view of the activity. True on web, where the concept doesn't apply. */
let nativeActive = true;
let currentVisible = true;

function computeVisible(): boolean {
  const domHidden = typeof document !== 'undefined' && document.hidden;
  return nativeActive && !domHidden;
}

function emit() {
  const next = computeVisible();
  if (next === currentVisible) return;
  currentVisible = next;
  listeners.forEach((listener) => listener(next));
}

if (typeof document !== 'undefined') {
  currentVisible = computeVisible();
  document.addEventListener('visibilitychange', emit);

  // Checked inline rather than through isNativeApp() in lib/native, which would
  // pull that module — and its Capacitor plugin imports — into every consumer
  // of this one.
  const capacitor = (globalThis as any).Capacitor;
  if (capacitor?.isNativePlatform?.()) {
    import('@capacitor/app')
      .then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          nativeActive = isActive;
          emit();
        });
      })
      .catch((e: any) => console.warn('[appVisibility] appStateChange note:', e?.message || e));
  }
}

export function isAppVisible(): boolean {
  return currentVisible;
}

/** @returns an unsubscribe function. */
export function subscribeAppVisibility(listener: VisibilityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
