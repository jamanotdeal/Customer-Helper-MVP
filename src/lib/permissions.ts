'use client';

import {
  isNativeApp,
  getNativePermissionStatus,
  requestNativeNotificationPermission,
  requestNativeLocationPermission,
  requestOverlayPermission,
  openBatteryOptimizationSettings,
  openOemAutostartSettings,
  openAppSettings,
  setAutoOpenEnabled,
  type NativePermissionStatus,
} from './native';

/**
 * The native permission ladder for Helpers and Stores.
 *
 * Ordering and timing are deliberate. Asking for everything at first launch
 * tanks grant rates and reads badly at review, so each rung is requested at the
 * moment its purpose is obvious:
 *
 *   1. Notifications - at login, so any order can reach the user at all.
 *   2. Location      - on entering Helper/Store mode; the 3.5 km dispatch
 *                      radius is meaningless without it.
 *   3. Battery       - only once duty has actually been switched on.
 *   4. Overlay       - last, and only if the user opts into auto-open.
 *
 * Only the first two are required. Everything below them makes delivery more
 * reliable but the app works without them, which is both the honest framing for
 * the user and the answer to "why do you need this permission?".
 */

export type PermissionStep = 'notifications' | 'location' | 'battery' | 'overlay' | 'autostart';

export interface ReadinessReport {
  supported: boolean;
  status: NativePermissionStatus | null;
  /** Blocks alerts entirely. */
  missingCritical: PermissionStep[];
  /** Degrades reliability but the app still works. */
  missingOptional: PermissionStep[];
  /** True when new orders can reach the user at all. */
  canReceiveOrders: boolean;
  /** True when the app can bring itself to the foreground. */
  canAutoOpen: boolean;
}

/** Vendors whose battery managers kill foreground services by default. */
const AGGRESSIVE_OEMS = ['xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'vivo', 'huawei', 'honor'];

export async function getReadiness(): Promise<ReadinessReport> {
  if (!isNativeApp()) {
    return {
      supported: false,
      status: null,
      missingCritical: [],
      missingOptional: [],
      canReceiveOrders: true,
      canAutoOpen: false,
    };
  }

  const status = await getNativePermissionStatus();
  if (!status) {
    return {
      supported: false,
      status: null,
      missingCritical: [],
      missingOptional: [],
      canReceiveOrders: false,
      canAutoOpen: false,
    };
  }

  const missingCritical: PermissionStep[] = [];
  const missingOptional: PermissionStep[] = [];

  if (status.notifications !== 'granted') missingCritical.push('notifications');
  if (status.location !== 'granted') missingCritical.push('location');
  if (!status.batteryUnrestricted) missingOptional.push('battery');
  if (!status.overlay) missingOptional.push('overlay');
  if (AGGRESSIVE_OEMS.includes(status.oemVendor)) missingOptional.push('autostart');

  return {
    supported: true,
    status,
    missingCritical,
    missingOptional,
    canReceiveOrders: status.notifications === 'granted',
    canAutoOpen: status.overlay && status.autoOpenEnabled,
  };
}

/**
 * Runs one rung of the ladder.
 *
 * @returns true if the permission ended up granted (or the settings screen was
 *          opened, for the ones with no programmatic result).
 */
export async function requestStep(step: PermissionStep): Promise<boolean> {
  if (!isNativeApp()) return false;

  switch (step) {
    case 'notifications':
      return requestNativeNotificationPermission();

    case 'location':
      return requestNativeLocationPermission();

    case 'overlay': {
      const granted = await requestOverlayPermission();
      // Only arm auto-open once the permission that makes it possible exists —
      // otherwise the service would try to launch an activity and be silently
      // blocked by the OS.
      await setAutoOpenEnabled(granted);
      return granted;
    }

    case 'battery':
      // No programmatic result: the user flips this in system settings and we
      // re-read the state when the app returns to the foreground.
      await openBatteryOptimizationSettings();
      return false;

    case 'autostart':
      await openOemAutostartSettings();
      return false;

    default:
      return false;
  }
}

/** Escape hatch for a permission the user has denied permanently. */
export async function openSettings(): Promise<void> {
  await openAppSettings();
}

/** Turn auto-open off without touching the underlying OS permission. */
export async function disableAutoOpen(): Promise<void> {
  await setAutoOpenEnabled(false);
}

// ── Copy ────────────────────────────────────────────────────────────────────
// Bengali-first, matching the rest of the app. Each explains what the user
// gets, not what the OS calls the permission.

export const STEP_COPY: Record<PermissionStep, { title: string; message: string; action: string }> = {
  notifications: {
    title: 'নোটিফিকেশন চালু করুন',
    message: 'নতুন অর্ডার এলে সাথে সাথে জানতে নোটিফিকেশন পারমিশন দিন। এটি ছাড়া আপনি কোনো অর্ডারের খবর পাবেন না।',
    action: 'Allow Notification',
  },
  location: {
    title: 'লোকেশন পারমিশন দিন',
    message: 'আপনার কাছাকাছি অর্ডারগুলো দেখাতে ও পাঠাতে আপনার অবস্থান জানা প্রয়োজন।',
    action: 'Allow Location',
  },
  battery: {
    title: 'ব্যাটারি অপটিমাইজেশন বন্ধ করুন',
    message: 'ফোন ব্যাটারি বাঁচাতে অ্যাপ বন্ধ করে দিতে পারে, ফলে অর্ডার মিস হতে পারে। সেটিংসে গিয়ে Jamanot-কে "Unrestricted" করে দিন।',
    action: 'সেটিংসে যান',
  },
  overlay: {
    title: 'অ্যাপ নিজে থেকে খুলতে দিন',
    message: 'নতুন অর্ডার এলে অ্যাপটি নিজে থেকে খুলবে — এজন্য "Display over other apps" অনুমতি প্রয়োজন। এটি না দিলেও নোটিফিকেশন আসবে।',
    action: 'অনুমতি দিন',
  },
  autostart: {
    title: 'অটোস্টার্ট চালু করুন',
    message: 'আপনার ফোনের ব্র্যান্ড ব্যাকগ্রাউন্ডে অ্যাপ বন্ধ করে দেয়। সেটিংসে Jamanot-এর Autostart চালু করলে অর্ডার মিস হবে না।',
    action: 'সেটিংসে যান',
  },
};
