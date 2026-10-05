/**
 * native.ts — Web / Native compatibility layer
 *
 * Every export works on both targets. On the website each function takes the
 * browser path (or is a harmless no-op); inside the Capacitor Android app it
 * routes to a Capacitor plugin or to our custom `JamanotNative` Java plugin.
 *
 * Two rules keep the website safe:
 *   1. Nothing from @capacitor/* is imported at module scope — every native
 *      call sits behind a dynamic import inside an `isNativeApp()` branch, so
 *      the web bundle never pulls Capacitor in.
 *   2. Existing export signatures are frozen. Components import from here and
 *      must not need to change.
 */

import type { Order, ShopOrder } from '@/types';

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

let _classMarked = false;

/** True only inside the Capacitor native shell (Android/iOS), false in any browser. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());

  // Tag <html> once so CSS can target the app shell (e.g. the white splash seam).
  if (native && !_classMarked && typeof document !== 'undefined') {
    _classMarked = true;
    document.documentElement.classList.add('capacitor');
  }
  return native;
}

export function getPlatform(): 'android' | 'ios' | 'web' {
  if (typeof window === 'undefined') return 'web';
  const cap = (window as any).Capacitor;
  const p = cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';
  return p === 'android' || p === 'ios' ? p : 'web';
}

// ---------------------------------------------------------------------------
// Custom Java plugin proxy (JamanotNative)
// ---------------------------------------------------------------------------

let _jamanotPlugin: any = null;
let _googleAuthPlugin: any = null;

/**
 * A plugin proxy, boxed.
 *
 * `registerPlugin()` returns a Proxy that turns EVERY property access into a
 * native method call — `.then` included. So the proxy must never be the resolved
 * value of a promise: JavaScript's thenable check would read `.then` off it and
 * invoke a native method called "then", which fails with
 * `"JamanotNative.then()" is not implemented on android` and takes the whole
 * call down with it.
 *
 * Boxing it in a plain object keeps the thenable check away from the proxy.
 * Hence `(await jn())?.p` at every call site rather than `await jn()`.
 */
interface PluginBox {
  p: any;
}

let _corePromise: Promise<any> | null = null;

async function loadRegisterPlugin(): Promise<((name: string) => any) | null> {
  try {
    if (!_corePromise) _corePromise = import('@capacitor/core');
    const { registerPlugin } = await _corePromise;
    return registerPlugin;
  } catch (e) {
    _corePromise = null;
    console.warn('[native] @capacitor/core unavailable:', e);
    return null;
  }
}

/**
 * Lazily boxes the proxy to our Java plugin. `registerPlugin` is pure JS — it
 * never touches native code — but it is still kept behind isNativeApp() so the
 * website never loads @capacitor/core at all.
 */
async function boxPlugin(
  name: string,
  cache: 'jamanot' | 'googleAuth'
): Promise<PluginBox | null> {
  if (!isNativeApp()) return null;
  const existing = cache === 'jamanot' ? _jamanotPlugin : _googleAuthPlugin;
  if (existing) return { p: existing };

  const registerPlugin = await loadRegisterPlugin();
  if (!registerPlugin) return null;

  // Re-check after the await: several callers can reach this point before any
  // of them has assigned the cache, and registering twice makes Capacitor warn.
  const raced = cache === 'jamanot' ? _jamanotPlugin : _googleAuthPlugin;
  if (raced) return { p: raced };

  const plugin = registerPlugin(name);
  if (cache === 'jamanot') _jamanotPlugin = plugin;
  else _googleAuthPlugin = plugin;
  return { p: plugin };
}

async function jn(): Promise<PluginBox | null> {
  return boxPlugin('JamanotNative', 'jamanot');
}

async function googleAuth(): Promise<PluginBox | null> {
  return boxPlugin('JamanotGoogleAuth', 'googleAuth');
}

// ---------------------------------------------------------------------------
// Geolocation
// ---------------------------------------------------------------------------

export interface NativePosition {
  lat: number;
  lng: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  timestamp: number;
}

export interface NativeGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

/** Device GPS position — Capacitor Geolocation natively, browser API on web. */
export async function getNativePosition(
  options: NativeGeolocationOptions = {}
): Promise<NativePosition> {
  const opts = {
    enableHighAccuracy: options.enableHighAccuracy ?? true,
    timeout: options.timeout ?? 12000,
    maximumAge: options.maximumAge ?? 0,
  };

  if (isNativeApp()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const pos = await Geolocation.getCurrentPosition(opts);
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude ?? undefined,
        speed: pos.coords.speed ?? undefined,
        timestamp: pos.timestamp,
      };
    } catch (e: any) {
      // Fall through to the browser API — the Capacitor WebView proxies it too.
      console.warn('[native] Geolocation plugin note:', e?.message || e);
    }
  }

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude ?? undefined,
          speed: pos.coords.speed ?? undefined,
          timestamp: pos.timestamp,
        }),
      (err) => reject(err),
      opts
    );
  });
}

/** Continuous position updates. Returns an unsubscribe function. */
export function watchNativePosition(
  callback: (pos: NativePosition) => void,
  options: NativeGeolocationOptions = {}
): () => void {
  const opts = {
    enableHighAccuracy: options.enableHighAccuracy ?? true,
    timeout: options.timeout ?? 15000,
    maximumAge: options.maximumAge ?? 0,
  };

  if (isNativeApp()) {
    let watchId: string | null = null;
    let cancelled = false;
    import('@capacitor/geolocation')
      .then(({ Geolocation }) =>
        Geolocation.watchPosition(opts, (pos) => {
          if (!pos || cancelled) return;
          callback({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude ?? undefined,
            speed: pos.coords.speed ?? undefined,
            timestamp: pos.timestamp,
          });
        })
      )
      .then((id) => {
        if (cancelled) {
          import('@capacitor/geolocation').then(({ Geolocation }) =>
            Geolocation.clearWatch({ id })
          );
        } else {
          watchId = id;
        }
      })
      .catch((e) => console.warn('[native] watchPosition note:', e?.message || e));

    return () => {
      cancelled = true;
      if (watchId) {
        import('@capacitor/geolocation').then(({ Geolocation }) =>
          Geolocation.clearWatch({ id: watchId as string })
        );
      }
    };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return () => {};
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      callback({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude ?? undefined,
        speed: pos.coords.speed ?? undefined,
        timestamp: pos.timestamp,
      }),
    () => {},
    opts
  );
  return () => navigator.geolocation.clearWatch(id);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NativePushRegistration {
  token: string;
  platform: 'android' | 'ios' | 'web';
}

/**
 * Ask for notification permission.
 * Native: POST_NOTIFICATIONS via our Java plugin (Android 13+).
 * Web: the browser Notification API, exactly as before.
 */
export async function requestNativePushPermission(): Promise<boolean> {
  if (isNativeApp()) {
    const p = (await jn())?.p;
    if (p) {
      try {
        const res = await p.requestNotificationPermission();
        return res?.status === 'granted';
      } catch (e: any) {
        console.warn('[native] requestNotificationPermission note:', e?.message || e);
        return false;
      }
    }
  }
  if (typeof window !== 'undefined' && 'Notification' in window) {
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
  return false;
}

/** Alias with an explicit name, for call sites that read better this way. */
export const requestNativeNotificationPermission = requestNativePushPermission;

/** Ask for foreground location permission (native only; web uses the geolocation prompt). */
export async function requestNativeLocationPermission(): Promise<boolean> {
  if (!isNativeApp()) {
    // On web the prompt is raised by the geolocation call itself.
    return true;
  }
  const p = (await jn())?.p;
  if (!p) return false;
  try {
    const res = await p.requestLocationPermission();
    return res?.status === 'granted';
  } catch (e: any) {
    console.warn('[native] requestLocationPermission note:', e?.message || e);
    return false;
  }
}

export interface NativePermissionStatus {
  notifications: 'granted' | 'denied' | 'blocked' | 'unsupported';
  location: 'granted' | 'denied' | 'blocked' | 'unsupported';
  coarseOnly: boolean;
  overlay: boolean;
  batteryUnrestricted: boolean;
  autoOpenEnabled: boolean;
  dutyRunning: boolean;
  oemVendor: string;
}

/** Full native permission picture, used by the "Never miss an order" settings card. */
export async function getNativePermissionStatus(): Promise<NativePermissionStatus | null> {
  const p = (await jn())?.p;
  if (!p) return null;
  try {
    return await p.getPermissionStatus();
  } catch (e: any) {
    console.warn('[native] getPermissionStatus note:', e?.message || e);
    return null;
  }
}

/** Send the user to the "Display over other apps" settings screen. */
export async function requestOverlayPermission(): Promise<boolean> {
  const p = (await jn())?.p;
  if (!p) return false;
  try {
    const res = await p.requestOverlayPermission();
    return !!res?.granted;
  } catch (e: any) {
    console.warn('[native] requestOverlayPermission note:', e?.message || e);
    return false;
  }
}

/** Opens the system battery-optimization list (no restricted permission needed). */
export async function openBatteryOptimizationSettings(): Promise<void> {
  const p = (await jn())?.p;
  if (p) await p.openBatteryOptimizationSettings().catch(() => {});
}

/** The escape hatch when a permission has been denied permanently. */
export async function openAppSettings(): Promise<void> {
  const p = (await jn())?.p;
  if (p) await p.openAppSettings().catch(() => {});
}

/** Vendor-specific autostart screen (Xiaomi/Oppo/Vivo/…), falls back to app settings. */
export async function openOemAutostartSettings(): Promise<void> {
  const p = (await jn())?.p;
  if (p) await p.openOemAutostartSettings().catch(() => {});
}

/** Native FCM registration token (from Play Services), or null on web. */
export async function getNativeFcmToken(): Promise<string | null> {
  const p = (await jn())?.p;
  if (!p) return null;
  try {
    const res = await p.getFcmToken();
    return res?.token || null;
  } catch (e: any) {
    console.warn('[native] getFcmToken note:', e?.message || e);
    return null;
  }
}

/** Kept for API compatibility. Native push is handled entirely in Java. */
export async function registerNativePush(
  onToken?: (token: string) => void,
  onNotification?: (data: any) => void
): Promise<void> {
  if (isNativeApp() && onToken) {
    const token = await getNativeFcmToken();
    if (token) onToken(token);
  }
}

// ---------------------------------------------------------------------------
// Local notifications
// ---------------------------------------------------------------------------

let _localNotifId = 1;

export async function showNativeLocalNotification(
  title: string,
  body: string,
  data?: any
): Promise<void> {
  if (isNativeApp()) {
    const p = (await jn())?.p;
    if (p) {
      try {
        await p.showLocalNotification({
          title,
          body,
          orderId: data?.orderId ?? null,
          // Firestore notification id — shares the de-dup set with the duty service
          notifId: data?.notifId ?? null,
          // true -> CH_ORDER heads-up channel (sound + vibration + lights)
          important: data?.important === true,
        });
        return;
      } catch (e: any) {
        console.warn('[native] showLocalNotification note:', e?.message || e);
      }
    }
    return;
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await (reg as any).showNotification(title, {
          body,
          icon: '/Jamanot-Logo.png',
          tag: String(_localNotifId++),
        });
      } else {
        new Notification(title, { body, icon: '/Jamanot-Logo.png' });
      }
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// New-order alerts (Java <-> JS)
// ---------------------------------------------------------------------------

/**
 * What Java sends with an alert. `order` (helper) or `shopOrders` (store) is
 * the document Java already fetched, so the popup can open without waiting on
 * the WebView's own Firestore connection — see OrderPayload.java.
 */
export interface NativeOrderAlert {
  orderId: string;
  order?: Order;
  shopOrders?: ShopOrder[];
  /** The helper tapped Accept on the card drawn over other apps (OrderOverlay.java). */
  action?: 'accept';
}

function toOrderAlert(data: any): NativeOrderAlert | null {
  if (!data?.orderId) return null;
  return {
    orderId: String(data.orderId),
    order: data.order && typeof data.order === 'object' ? (data.order as Order) : undefined,
    shopOrders: Array.isArray(data.shopOrders) ? (data.shopOrders as ShopOrder[]) : undefined,
    action: data.action === 'accept' ? 'accept' : undefined,
  };
}

function addNativeListener(event: string, handler: (data: any) => void): () => void {
  if (!isNativeApp()) return () => {};
  let handle: any = null;
  let cancelled = false;

  jn()
    .then((box) => {
      if (!box || cancelled) return;
      return box.p.addListener(event, handler);
    })
    .then((h) => {
      if (cancelled) h?.remove?.();
      else handle = h;
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    handle?.remove?.();
  };
}

/**
 * A new order Java has alerted on (foreground or background), or a tapped
 * notification while the WebView is alive. Returns an unsubscribe function.
 */
export function onOrderAlert(callback: (alert: NativeOrderAlert) => void): () => void {
  return addNativeListener('orderAlert', (data) => {
    const alert = toOrderAlert(data);
    if (alert) callback(alert);
  });
}

/**
 * Java's own watch on an alerted order saw it go — accepted by another helper,
 * cancelled, or answered by the store. Close its popup.
 */
export function onOrderAlertCleared(callback: (orderId: string) => void): () => void {
  return addNativeListener('orderAlertCleared', (data) => {
    if (data?.orderId) callback(String(data.orderId));
  });
}

// The alert ids last reported to Java. Calls are chained so a burst of changes
// reaches Java in order — an out-of-order stop would silence a live alert.
let syncedAlarmIds = new Set<string>();
let alarmCalls: Promise<unknown> = Promise.resolve();

function queueAlarmCall(fn: (p: any) => Promise<unknown>) {
  alarmCalls = alarmCalls
    .then(async () => {
      const p = (await jn())?.p;
      if (p) await fn(p);
    })
    .catch(() => {});
}

/**
 * Declares the alerts currently on screen. Java rings while any is
 * outstanding and watches each order natively, so it stops by itself the
 * moment an order is taken elsewhere — even if this WebView never hears of it.
 *
 * Only changes are sent, so mounting with an empty list silences nothing: on a
 * cold start the popup mounts empty while Java may already be ringing for an
 * order, which JS adopts afterwards (see getActiveNativeOrderAlerts).
 */
export function syncNativeOrderAlarm(orderIds: string[]): void {
  if (!isNativeApp()) return;
  const next = new Set(orderIds);
  const added = orderIds.filter((id) => !syncedAlarmIds.has(id));
  const removed = Array.from(syncedAlarmIds).filter((id) => !next.has(id));
  syncedAlarmIds = next;

  // Per id, never "stop everything": Java may hold an alert this screen
  // hasn't adopted yet (it is about to be), and that one must keep ringing.
  removed.forEach((orderId) => queueAlarmCall((p) => p.dismissOrderAlarm({ orderId })));
  if (added.length > 0) queueAlarmCall((p) => p.startOrderAlarm({ orderIds: added }));
}

/** Ends one native alert that no popup is going to show (order already gone). */
export function dismissNativeOrderAlarm(orderId: string): void {
  if (!isNativeApp()) return;
  syncedAlarmIds.delete(orderId);
  queueAlarmCall((p) => p.dismissOrderAlarm({ orderId }));
}

/** Alerts Java holds right now — adopted when the app comes to the foreground. */
export async function getActiveNativeOrderAlerts(): Promise<NativeOrderAlert[]> {
  const p = (await jn())?.p;
  if (!p) return [];
  try {
    const res = await p.getActiveOrderAlarms();
    return (Array.isArray(res?.alerts) ? res.alerts : [])
      .map(toOrderAlert)
      .filter((a: NativeOrderAlert | null): a is NativeOrderAlert => a !== null);
  } catch (_) {
    return [];
  }
}

/**
 * Hands a new-order notification the WebView saw first to Java's dispatcher,
 * so it is alerted exactly as if the duty listener had seen it.
 */
export async function handleNativeNewOrderNotification(n: {
  notifId: string;
  orderId: string;
  title: string;
  body: string;
}): Promise<void> {
  const p = (await jn())?.p;
  if (p) await p.handleNewOrderNotification(n).catch(() => {});
}

/**
 * Drains an alert delivered by a cold-start intent — the case where Java
 * launched the app long before React mounted, so no event listener existed yet.
 */
export async function consumePendingOrderAlert(): Promise<NativeOrderAlert | null> {
  const p = (await jn())?.p;
  if (!p) return null;
  try {
    return toOrderAlert(await p.getPendingIntentPayload());
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Duty foreground service (Helper / Store)
// ---------------------------------------------------------------------------

export interface NativeUserState {
  uid?: string | null;
  role?: 'customer' | 'helper' | 'admin' | 'store' | null;
  isHelper?: boolean;
  helperType?: 'commuter' | 'dedicated' | null;
  isStoreApproved?: boolean;
  storeId?: string | null;
  activeMode?: string | null;
  onDuty?: boolean;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
}

/**
 * Pushes identity + role into Android SharedPreferences. This is the mechanism
 * that lets the Java service decide who to alert with no JavaScript running.
 */
export async function syncNativeUserState(state: NativeUserState): Promise<void> {
  const p = (await jn())?.p;
  if (!p) return;
  try {
    await p.setUserState(state);
  } catch (e: any) {
    console.warn('[native] setUserState note:', e?.message || e);
  }
}

export async function startDutyService(): Promise<boolean> {
  const p = (await jn())?.p;
  if (!p) return false;
  try {
    const res = await p.startDutyService();
    return res?.started !== false;
  } catch (e: any) {
    console.warn('[native] startDutyService note:', e?.message || e);
    return false;
  }
}

export async function stopDutyService(): Promise<void> {
  const p = (await jn())?.p;
  if (p) await p.stopDutyService().catch(() => {});
}

/** User-facing opt-in for the app bringing itself to the foreground. Default off. */
export async function setAutoOpenEnabled(enabled: boolean): Promise<void> {
  const p = (await jn())?.p;
  if (p) await p.setAutoOpenEnabled({ enabled }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Pull to refresh (native SwipeRefreshLayout)
// ---------------------------------------------------------------------------

/**
 * Arms or disarms the native pull gesture. Disarm while a map or modal is open —
 * those consume touch inside the WebView, so the WebView's own scrollY stays 0
 * and a drag would otherwise read as a page pull.
 */
export async function setPullToRefreshEnabled(enabled: boolean): Promise<void> {
  const p = (await jn())?.p;
  if (p) await p.setPullToRefreshEnabled({ enabled }).catch(() => {});
}

/** Subscribe to the native pull gesture. Returns an unsubscribe function. */
export function onPullToRefresh(callback: () => void): () => void {
  return addNativeListener('pullToRefresh', () => callback());
}

/** Tell Java the refresh finished so it can retract the spinner. */
export async function finishRefresh(): Promise<void> {
  const p = (await jn())?.p;
  if (p) await p.finishRefresh().catch(() => {});
}

// ---------------------------------------------------------------------------
// Splash screen
// ---------------------------------------------------------------------------

/** Hide the native splash. Called once auth has resolved, not on first paint. */
export async function hideNativeSplash(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 150 });
  } catch (e: any) {
    console.warn('[native] SplashScreen.hide note:', e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Google sign-in (native)
// ---------------------------------------------------------------------------

export interface NativeGoogleCredential {
  idToken: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
}

/**
 * Native account picker via Android Credential Manager. Returns the Google ID
 * token; the caller signs the JS Firebase SDK in with it so that
 * onAuthStateChanged still drives the app. Throws with code 'CANCELLED' when
 * the user dismisses the sheet.
 */
export async function nativeGoogleSignIn(): Promise<NativeGoogleCredential> {
  const p = (await googleAuth())?.p;
  if (!p) throw new Error('Native Google sign-in is unavailable');

  // Hard ceiling on the native call. If the account sheet never appears and the
  // plugin never answers, the caller must still get a rejection — otherwise the
  // await never settles and the UI sits on its loading state forever, with no
  // way for the user to retry. 90s is well past any legitimate sign-in.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.signIn() as Promise<NativeGoogleCredential>,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err: any = new Error(
            'Google sign-in did not respond. Check that Google Play services is up to date.'
          );
          err.code = 'TIMEOUT';
          reject(err);
        }, 90_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Clear the native FirebaseAuth session and cached credential state. */
export async function nativeGoogleSignOut(): Promise<void> {
  const p = (await googleAuth())?.p;
  if (p) await p.signOut().catch(() => {});
}

// ---------------------------------------------------------------------------
// Haptics
// ---------------------------------------------------------------------------

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection';

export async function hapticFeedback(style: HapticStyle = 'light'): Promise<void> {
  if (isNativeApp()) {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      if (style === 'selection') {
        await Haptics.selectionStart();
        await Haptics.selectionEnd();
      } else {
        const impact =
          style === 'heavy' ? ImpactStyle.Heavy : style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
        await Haptics.impact({ style: impact });
      }
      return;
    } catch (e: any) {
      console.warn('[native] Haptics note:', e?.message || e);
    }
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      const ms = style === 'heavy' ? 50 : style === 'medium' ? 25 : 10;
      navigator.vibrate(ms);
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

/**
 * `style` describes the *content*: 'dark' = dark icons (for a light bar),
 * 'light' = light icons (for a dark bar).
 */
export async function setNativeStatusBar(
  style: 'dark' | 'light' = 'dark',
  color?: string
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Capacitor's Style.Light means "light background" => dark content.
    await StatusBar.setStyle({ style: style === 'dark' ? Style.Light : Style.Dark });
    if (color && getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color });
    }
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (e: any) {
    console.warn('[native] StatusBar note:', e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export async function isOnline(): Promise<boolean> {
  if (isNativeApp()) {
    try {
      const { Network } = await import('@capacitor/network');
      const status = await Network.getStatus();
      return status.connected;
    } catch (_) {}
  }
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function watchNetwork(callback: (connected: boolean) => void): () => void {
  if (isNativeApp()) {
    let handle: any = null;
    let cancelled = false;
    import('@capacitor/network')
      .then(({ Network }) => Network.addListener('networkStatusChange', (s) => callback(s.connected)))
      .then((h) => {
        if (cancelled) h?.remove?.();
        else handle = h;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      handle?.remove?.();
    };
  }

  const onOnline = () => callback(true);
  const onOffline = () => callback(false);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

// ---------------------------------------------------------------------------
// Camera — unused; the app uses <input type="file"> everywhere
// ---------------------------------------------------------------------------

export interface NativePhoto {
  dataUrl: string;
  format: string;
}

/** Always null. @capacitor/camera is deliberately not installed (fewer permissions). */
export async function takeNativePhoto(): Promise<NativePhoto | null> {
  return null;
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

/**
 * Wires the Android hardware back button and app state events.
 * `onBackButton` returns true if it handled the press (don't exit the app).
 */
export function setupAppListeners(onBackButton?: () => boolean): () => void {
  if (!isNativeApp()) return () => {};

  const handles: any[] = [];
  let cancelled = false;

  import('@capacitor/app')
    .then(async ({ App }) => {
      if (cancelled) return;

      const backHandle = await App.addListener('backButton', ({ canGoBack }) => {
        const handled = onBackButton ? onBackButton() : false;
        if (handled) return;
        if (canGoBack) {
          window.history.back();
        } else {
          App.exitApp();
        }
      });
      handles.push(backHandle);

      // Re-check permissions when the user returns from a system settings screen.
      const stateHandle = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          window.dispatchEvent(new Event('focus'));
        }
      });
      handles.push(stateHandle);
    })
    .catch((e) => console.warn('[native] App listeners note:', e?.message || e));

  return () => {
    cancelled = true;
    handles.forEach((h) => h?.remove?.());
  };
}
