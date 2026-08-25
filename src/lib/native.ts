/**
 * native.ts — Web API Compatibility Layer
 *
 * Pure browser/PWA implementation. All Capacitor plugin code has been removed.
 * Uses standard browser APIs: Geolocation, Notification, ServiceWorker, vibrate, etc.
 */

// ---------------------------------------------------------------------------
// Runtime detection — always web now
// ---------------------------------------------------------------------------

/** Always returns false — no Capacitor native runtime. */
export function isNativeApp(): boolean {
  return false;
}

/** Always returns 'web'. */
export function getPlatform(): 'android' | 'ios' | 'web' {
  return 'web';
}

// ---------------------------------------------------------------------------
// Geolocation — Browser Geolocation API
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

/** Get the device's current GPS position using the browser Geolocation API */
export async function getNativePosition(
  options: NativeGeolocationOptions = {}
): Promise<NativePosition> {
  const opts = {
    enableHighAccuracy: true,
    timeout: options.timeout ?? 12000,
    maximumAge: options.maximumAge ?? 0,
    ...options,
  };

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude ?? undefined,
        speed: pos.coords.speed ?? undefined,
        timestamp: pos.timestamp,
      }),
      (err) => reject(err),
      { enableHighAccuracy: opts.enableHighAccuracy, timeout: opts.timeout, maximumAge: opts.maximumAge }
    );
  });
}

/** Watch position continuously using browser Geolocation API */
export function watchNativePosition(
  callback: (pos: NativePosition) => void,
  errorCallback?: (err: any) => void,
  options: NativeGeolocationOptions = {}
): (() => void) {
  const opts = { enableHighAccuracy: true, maximumAge: 0, ...options };

  if (!navigator.geolocation) {
    return () => {};
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => callback({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude ?? undefined,
      speed: pos.coords.speed ?? undefined,
      timestamp: pos.timestamp,
    }),
    errorCallback,
    { enableHighAccuracy: opts.enableHighAccuracy, maximumAge: opts.maximumAge }
  );

  return () => navigator.geolocation.clearWatch(id);
}

// ---------------------------------------------------------------------------
// Push Notifications — Browser Notification API
// ---------------------------------------------------------------------------

export interface NativePushRegistration {
  token: string;
  platform: 'android' | 'ios' | 'web';
}

/** Request push notification permission via browser Notification API */
export async function requestNativePushPermission(): Promise<boolean> {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
  return false;
}

/** No-op on web — native FCM push token registration is not available in browser */
export async function registerNativePush(
  onToken?: (token: string) => void,
  onNotification?: (data: any) => void
): Promise<void> {
  // Web: FCM token registration happens via the service worker and Firebase SDK.
  // Nothing to do here.
}

// ---------------------------------------------------------------------------
// Local Notifications — Browser Notification API / Service Worker
// ---------------------------------------------------------------------------

let _localNotifId = 1;

export async function showNativeLocalNotification(
  title: string,
  body: string,
  data?: any
): Promise<void> {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await (reg as any).showNotification(title, { body, icon: '/Jamanot-Logo.png', tag: String(_localNotifId++) });
      } else {
        new Notification(title, { body, icon: '/Jamanot-Logo.png' });
      }
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Haptics — Browser vibration API fallback
// ---------------------------------------------------------------------------

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection';

/** Trigger haptic feedback via browser vibration API. No-op where unsupported. */
export async function hapticFeedback(style: HapticStyle = 'light'): Promise<void> {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      const ms = style === 'heavy' ? 50 : style === 'medium' ? 25 : 10;
      navigator.vibrate(ms);
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Status Bar — No-op on web
// ---------------------------------------------------------------------------

export async function setNativeStatusBar(
  style: 'dark' | 'light' = 'dark',
  color?: string
): Promise<void> {
  // No-op on web — status bar is controlled by the OS/browser
}

// ---------------------------------------------------------------------------
// Network — Browser online/offline events
// ---------------------------------------------------------------------------

export async function isOnline(): Promise<boolean> {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function watchNetwork(
  callback: (connected: boolean) => void
): (() => void) {
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
// Camera — No-op on web (caller should use <input type="file">)
// ---------------------------------------------------------------------------

export interface NativePhoto {
  dataUrl: string;
  format: string;
}

/** Returns null on web — use an <input type="file" accept="image/*"> instead */
export async function takeNativePhoto(): Promise<NativePhoto | null> {
  return null;
}

// ---------------------------------------------------------------------------
// App lifecycle — No-op on web (no hardware back button / app state events)
// ---------------------------------------------------------------------------

export function setupAppListeners(onBackButton?: () => boolean): (() => void) {
  // No-op on web
  return () => {};
}
