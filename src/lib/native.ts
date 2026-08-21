/**
 * native.ts — Capacitor Native API Compatibility Layer
 *
 * This file provides a unified API surface that works both:
 *   1. Inside the Capacitor native app → uses precise native OS APIs
 *   2. In a regular browser (PWA mode)  → gracefully falls back to browser APIs
 *
 * Always import from here rather than directly from browser APIs or Capacitor plugins,
 * so the same code runs everywhere without conditional checks scattered across the codebase.
 */

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

/** Returns true when running inside a Capacitor native app (Android or iOS) */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

/** Returns 'android' | 'ios' | 'web' */
export function getPlatform(): 'android' | 'ios' | 'web' {
  if (typeof window === 'undefined') return 'web';
  return (window as any).Capacitor?.getPlatform?.() ?? 'web';
}

// ---------------------------------------------------------------------------
// Geolocation — Most accurate native GPS
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

/** Get the device's current GPS position with highest possible accuracy */
export async function getNativePosition(
  options: NativeGeolocationOptions = {}
): Promise<NativePosition> {
  const opts = {
    enableHighAccuracy: true,
    timeout: options.timeout ?? 12000,
    maximumAge: options.maximumAge ?? 0,
    ...options,
  };

  if (isNativeApp()) {
    // Native Capacitor Geolocation — uses OS-level GPS chip directly
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.checkPermissions();
      if (perm.location === 'denied') {
        const req = await Geolocation.requestPermissions();
        if (req.location === 'denied') {
          throw new Error('Location permission denied');
        }
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: opts.enableHighAccuracy,
        timeout: opts.timeout,
        maximumAge: opts.maximumAge,
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude ?? undefined,
        speed: pos.coords.speed ?? undefined,
        timestamp: pos.timestamp,
      };
    } catch (err) {
      console.warn('[Native GPS] Error, falling back to browser geolocation:', err);
    }
  }

  // Browser fallback
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
        timestamp: pos.timestamp,
      }),
      (err) => reject(err),
      { enableHighAccuracy: opts.enableHighAccuracy, timeout: opts.timeout, maximumAge: opts.maximumAge }
    );
  });
}

/** Watch position continuously with native GPS precision */
export function watchNativePosition(
  callback: (pos: NativePosition) => void,
  errorCallback?: (err: any) => void,
  options: NativeGeolocationOptions = {}
): (() => void) {
  const opts = { enableHighAccuracy: true, maximumAge: 0, ...options };

  let watchId: string | number | null = null;
  let cleanup: (() => void) | null = null;

  if (isNativeApp()) {
    import('@capacitor/geolocation').then(({ Geolocation }) => {
      Geolocation.watchPosition(
        { enableHighAccuracy: opts.enableHighAccuracy, maximumAge: opts.maximumAge },
        (pos, err) => {
          if (err) {
            errorCallback?.(err);
            return;
          }
          if (pos) {
            callback({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            });
          }
        }
      ).then((id) => {
        watchId = id;
        cleanup = () => { Geolocation.clearWatch({ id: id as string }); };
      });
    });
  } else {
    if (navigator.geolocation) {
      const id = navigator.geolocation.watchPosition(
        (pos) => callback({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
        errorCallback,
        { enableHighAccuracy: opts.enableHighAccuracy, maximumAge: opts.maximumAge }
      );
      cleanup = () => navigator.geolocation.clearWatch(id);
    }
  }

  return () => { cleanup?.(); };
}

// ---------------------------------------------------------------------------
// Push Notifications — Native FCM vs Web Push
// ---------------------------------------------------------------------------

export interface NativePushRegistration {
  token: string;
  platform: 'android' | 'ios' | 'web';
}

/** Request push notification permission and return the device push token */
export async function requestNativePushPermission(): Promise<boolean> {
  if (isNativeApp()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'granted') return true;
      const req = await PushNotifications.requestPermissions();
      return req.receive === 'granted';
    } catch (err) {
      console.warn('[NativePush] Error requesting permission:', err);
      return false;
    }
  }
  // Browser fallback
  if (typeof window !== 'undefined' && 'Notification' in window) {
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
  return false;
}

/** Register for push notifications and get the FCM token */
export async function registerNativePush(
  onToken: (token: string) => void,
  onNotification?: (data: any) => void
): Promise<void> {
  if (isNativeApp()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Remove any stale listeners before re-registering
      await PushNotifications.removeAllListeners();

      // Listen for registration token
      await PushNotifications.addListener('registration', (token) => {
        console.info('[NativePush] FCM token:', token.value.substring(0, 20) + '...');
        onToken(token.value);
      });

      // Listen for registration errors
      await PushNotifications.addListener('registrationError', (err) => {
        console.warn('[NativePush] Registration error:', err.error);
      });

      // Listen for foreground push messages
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.info('[NativePush] Foreground notification:', notification);
        onNotification?.(notification);
        // Show local notification when app is in foreground
        showNativeLocalNotification(
          notification.title || 'Jamanot',
          notification.body || '',
          notification.data
        );
      });

      // Listen for notification taps
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.info('[NativePush] Notification tapped:', action);
      });

      await PushNotifications.register();
    } catch (err) {
      console.warn('[NativePush] Setup error:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Local Notifications — Show in-app notifications
// ---------------------------------------------------------------------------

let _localNotifId = 1;

export async function showNativeLocalNotification(
  title: string,
  body: string,
  data?: any
): Promise<void> {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
      await LocalNotifications.schedule({
        notifications: [{
          id: _localNotifId++,
          title,
          body,
          extra: data,
          smallIcon: 'ic_notification',
          iconColor: '#059669',
        }],
      });
    } catch (err) {
      console.warn('[LocalNotif] Error:', err);
    }
    return;
  }
  // Browser fallback — use service worker notification
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
// Haptics — Tactile feedback
// ---------------------------------------------------------------------------

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection';

/** Trigger haptic feedback. No-op on platforms that don't support it. */
export async function hapticFeedback(style: HapticStyle = 'light'): Promise<void> {
  if (isNativeApp()) {
    try {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (style === 'selection') {
        await Haptics.selectionChanged();
      } else {
        const impactStyle =
          style === 'heavy' ? ImpactStyle.Heavy :
          style === 'medium' ? ImpactStyle.Medium :
          ImpactStyle.Light;
        await Haptics.impact({ style: impactStyle });
      }
      return;
    } catch (err) {
      // Haptics not available on this device — ignore
    }
  }
  // Browser fallback: short vibration
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      const ms = style === 'heavy' ? 50 : style === 'medium' ? 25 : 10;
      navigator.vibrate(ms);
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Status Bar — Native status bar styling
// ---------------------------------------------------------------------------

export async function setNativeStatusBar(
  style: 'dark' | 'light' = 'dark',
  color?: string
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: style === 'light' ? Style.Light : Style.Dark });
    if (color) {
      await StatusBar.setBackgroundColor({ color });
    }
  } catch (err) {
    console.warn('[StatusBar] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Network — Connectivity detection
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

export function watchNetwork(
  callback: (connected: boolean) => void
): (() => void) {
  if (isNativeApp()) {
    let cleanup: (() => void) | null = null;
    import('@capacitor/network').then(({ Network }) => {
      Network.addListener('networkStatusChange', (status) => {
        callback(status.connected);
      }).then((handle) => {
        cleanup = () => handle.remove();
      });
    });
    return () => { cleanup?.(); };
  }
  // Browser fallback
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
// Camera — Photo capture
// ---------------------------------------------------------------------------

export interface NativePhoto {
  dataUrl: string;
  format: string;
}

/** Take a photo using native camera or browser file picker */
export async function takeNativePhoto(): Promise<NativePhoto | null> {
  if (isNativeApp()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const perm = await Camera.checkPermissions();
      if (perm.camera !== 'granted') {
        await Camera.requestPermissions({ permissions: ['camera'] });
      }
      const photo = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        allowEditing: false,
      });
      return { dataUrl: photo.dataUrl || '', format: photo.format };
    } catch (err) {
      console.warn('[Camera] Error:', err);
      return null;
    }
  }
  // Browser fallback — return null, caller should use <input type="file">
  return null;
}

// ---------------------------------------------------------------------------
// App lifecycle — Android back button, foreground/background
// ---------------------------------------------------------------------------

export function setupAppListeners(onBackButton?: () => boolean): (() => void) {
  if (!isNativeApp()) return () => {};

  let cleanups: Array<() => void> = [];

  import('@capacitor/app').then(({ App }) => {
    // Android hardware back button
    App.addListener('backButton', ({ canGoBack }) => {
      if (onBackButton) {
        const handled = onBackButton();
        if (handled) return;
      }
      if (!canGoBack) {
        App.exitApp();
      } else {
        window.history.back();
      }
    }).then((handle) => {
      cleanups.push(() => handle.remove());
    });

    // App state changes (foreground/background)
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // App came to foreground — refresh data if needed
        document.dispatchEvent(new CustomEvent('app:foreground'));
      }
    }).then((handle) => {
      cleanups.push(() => handle.remove());
    });
  });

  return () => { cleanups.forEach(fn => fn()); };
}
