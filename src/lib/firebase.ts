import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  arrayUnion,
  writeBatch,
} from 'firebase/firestore';
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported as isMessagingSupported,
  Messaging,
} from 'firebase/messaging';
import {
  Order,
  HelperApplication,
  StoreApplication,
  Wallet,
  WalletTransaction,
  WithdrawalRequest,
  PricingSettings,
  AppNotification,
  UserProfile,
  Shop,
  OrderFeedback,
  AdminCustomModalConfig,
  FeeSuggestion,
  ShopOrder,
  ShopOrderStatus,
} from '@/types';
import { DEFAULT_PRICING_SETTINGS, calculateHelperCommission, isHelperWithinOrderRadius } from './pricing';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDSN_Q5PTgnL7nTm0Ni1yktCculx6jlRYY',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'jamanot-pwa.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'jamanot-pwa',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'jamanot-pwa.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '685363529279',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:685363529279:web:fcdd94d0e5181b7b4b9a8a',
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// ─── Firebase Cloud Messaging ─────────────────────────────────────────────────
// VAPID public key — generated from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates.
// Replace the placeholder below with your actual VAPID key once you generate it in the Firebase Console.
const VAPID_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
  'BPtS3UGEa9rMWrIi1L3BDtXVcKWqHpYvEqLmW0xZbF5k4V8Nz2jMqRlJXD6TuYbKz9mN7cQ3wOeHbAiPkFgE'; // ← Replace with your real VAPID key

let _messaging: Messaging | null = null;

/**
 * Initializes Firebase Cloud Messaging on the client.
 * - Requests the FCM device token (VAPID)
 * - Saves the token to the user profile in Firestore
 * - Sets up a foreground message handler (shows notification when app is open)
 *
 * Call this after the user logs in and notification permission is granted.
 */
export async function initFcmMessaging(userId: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const supported = await isMessagingSupported();
    if (!supported) {
      console.info('[FCM] Messaging not supported in this browser.');
      return null;
    }

    if (!_messaging) {
      _messaging = getMessaging(app);
    }

    // Register/ensure our SW is active before requesting token
    let swReg: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      swReg = await navigator.serviceWorker.ready;
    }

    const token = await getToken(_messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (token) {
      console.info('[FCM] Token obtained:', token.substring(0, 20) + '...');
      // Save token to Firestore so other devices can push to this one
      await saveFcmToken(userId, token);

      // Handle foreground messages (app is open & focused)
      onMessage(_messaging, (payload) => {
        console.info('[FCM] Foreground message:', payload);
        const title = payload.notification?.title || payload.data?.title || 'Jamanot';
        const body  = payload.notification?.body  || payload.data?.body  || '';
        const id    = payload.data?.tag || `fcm-fg-${Date.now()}`;
        // Reuse existing browser notification trigger
        triggerBrowserNotification({ id, title, body });
      });
    }

    return token || null;
  } catch (e: any) {
    console.warn('[FCM] initFcmMessaging note:', e?.message || e);
    return null;
  }
}

/**
 * Saves this device's FCM token to the user's Firestore profile.
 * Other devices read this token to send targeted pushes.
 */
export async function saveFcmToken(userId: string, token: string): Promise<void> {
  try {
    const existing = fallbackStore.users.get(userId);
    if (existing && existing.fcmToken === token) return; // no change needed
    await setDoc(doc(db, 'users', userId), { fcmToken: token }, { merge: true });
    if (existing) {
      const updated = { ...existing, fcmToken: token };
      fallbackStore.users.set(userId, updated);
    }
  } catch (e: any) {
    console.warn('[FCM] saveFcmToken note:', e?.message || e);
  }
}

/**
 * One-time read: loads the customer's saved delivery addresses from their Firestore user profile.
 * Should be called once at login time. Result is cached to localStorage by the caller.
 */
export async function loadCustomerSavedAddresses(uid: string): Promise<import('@/types').LocationData[]> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const data = snap.data();
      const addresses = data?.savedDeliveryAddresses;
      if (Array.isArray(addresses) && addresses.length > 0) {
        return addresses as import('@/types').LocationData[];
      }
    }
  } catch (e: any) {
    console.warn('[Firestore] loadCustomerSavedAddresses note:', e?.message || e);
  }
  return [];
}

/**
 * Appends a new delivery address to the customer's Firestore savedDeliveryAddresses array.
 * Uses arrayUnion so concurrent writes don't overwrite each other.
 */
export async function saveCustomerSavedAddressToFirestore(uid: string, address: import('@/types').LocationData): Promise<void> {
  try {
    await setDoc(
      doc(db, 'users', uid),
      { savedDeliveryAddresses: arrayUnion(cleanForFirestore(address)) },
      { merge: true }
    );
  } catch (e: any) {
    console.warn('[Firestore] saveCustomerSavedAddressToFirestore note:', e?.message || e);
  }
}

/**
 * Sends a native push notification to all target devices via FCM.
 * Works even when the target device's app is closed or backgrounded.
 *
 * Note: FCM HTTP v1 API requires a server-side OAuth token. Since this is a
 * client-only app, we use the Firestore-based approach: FCM background messages
 * are delivered to the device's registered service worker automatically when the
 * device is online. For immediate cross-device push, we fan-out to all tokens
 * using FCM's legacy REST API with a server key (set NEXT_PUBLIC_FCM_SERVER_KEY).
 * This is optional — the SW onBackgroundMessage handler covers the delivery.
 */
export async function sendFcmPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  tag?: string,
  url?: string,
  imageUrl?: string
): Promise<void> {
  const serverKey = process.env.NEXT_PUBLIC_FCM_SERVER_KEY;
  if (!serverKey || tokens.length === 0) {
    // Without server key, FCM still delivers in background via SW onBackgroundMessage
    // when the Firestore notification doc is synced. No action needed here.
    return;
  }
  try {
    const payload = {
      registration_ids: tokens.slice(0, 1000), // FCM max per request
      notification: { title, body, icon: '/Jamanot-Logo.png', image: imageUrl || undefined },
      data: { title, body, tag: tag || 'jamanot', url: url || '/', image: imageUrl || undefined },
    };
    await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${serverKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    console.warn('[FCM] sendFcmPushToTokens note:', e?.message || e);
  }
}

// Helper to recursively strip undefined properties before saving to Firestore
function cleanForFirestore<T>(data: T): T {
  if (data === undefined || data === null) return data;
  return JSON.parse(JSON.stringify(data));
}

// -------------------------------------------------------------
// Browser Notification Helper
// Fires a native browser popup on the CURRENT device for the given notification.
// Each device calls this for itself via the Firestore onSnapshot listener.
// -------------------------------------------------------------
let _lastNotifTime = 0;

export function triggerBrowserNotification(notif: { id: string; title: string; body?: string; orderId?: string; imageUrl?: string }) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const targetUrl = notif.orderId ? `/?orderId=${notif.orderId}` : '/';
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => {
          reg
            .showNotification(notif.title, {
              body: notif.body || '',
              icon: '/Jamanot-Logo.png',
              badge: '/Jamanot-Logo.png',
              image: notif.imageUrl || undefined,
              tag: notif.id,
              vibrate: [200, 100, 200],
              renotify: true,
              data: { orderId: notif.orderId, url: targetUrl },
            } as any)
            .catch(() => {
              // SW showNotification failed — fallback to basic Notification
              const popup = new Notification(notif.title, {
                body: notif.body || '',
                icon: '/Jamanot-Logo.png',
                image: notif.imageUrl || undefined,
                tag: notif.id,
              } as any);
              popup.onclick = () => {
                window.focus();
                if (notif.orderId) window.location.search = `?orderId=${notif.orderId}`;
              };
            });
        })
        .catch(() => {
          // SW not ready
          const popup = new Notification(notif.title, {
            body: notif.body || '',
            icon: '/Jamanot-Logo.png',
            image: notif.imageUrl || undefined,
            tag: notif.id,
          } as any);
          popup.onclick = () => {
            window.focus();
            if (notif.orderId) window.location.search = `?orderId=${notif.orderId}`;
          };
        });
    } else {
      const popup = new Notification(notif.title, {
        body: notif.body || '',
        icon: '/Jamanot-Logo.png',
        image: notif.imageUrl || undefined,
        tag: notif.id,
      } as any);
      popup.onclick = () => {
        window.focus();
        if (notif.orderId) window.location.search = `?orderId=${notif.orderId}`;
      };
    }
    
    // Throttling sound and vibration: only trigger if 5 seconds have passed since the last one.
    const now = Date.now();
    if (now - _lastNotifTime > 5000) {
      _lastNotifTime = now;
      playNotificationSound();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([200, 100, 200]); } catch (_) { /* ignore */ }
      }
    }
  } catch (err) {
    console.warn('[triggerBrowserNotification] note:', err);
  }
}

// -------------------------------------------------------------
// Live Realtime State Store with Firestore Synchronization
// -------------------------------------------------------------
type Listener = () => void;

// ─── Shared AudioContext (Fix 3) ─────────────────────────────────────────────
// Reuse a single AudioContext instead of creating one per sound.
// This avoids the 6-context browser limit and eliminates the associated memory leak.
let _sharedAudioCtx: AudioContext | null = null;
function getSharedAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
      _sharedAudioCtx = new AudioContextClass();
    }
    if (_sharedAudioCtx.state === 'suspended') {
      _sharedAudioCtx.resume().catch(() => {});
    }
    return _sharedAudioCtx;
  } catch (_) {
    return null;
  }
}

class FallbackStore {
  private listeners: Set<Listener> = new Set();

  public users: Map<string, UserProfile> = new Map();
  public orders: Map<string, Order> = new Map();
  public helperApplications: Map<string, HelperApplication> = new Map();
  public storeApplications: Map<string, StoreApplication> = new Map();
  public wallets: Map<string, Wallet> = new Map();
  public walletTransactions: Map<string, WalletTransaction[]> = new Map();
  public withdrawals: Map<string, WithdrawalRequest> = new Map();
  public notifications: Map<string, AppNotification[]> = new Map();
  public shops: Map<string, Shop> = new Map();
  public shopOrders: Map<string, ShopOrder> = new Map();
  public orderFeedbacks: Map<string, OrderFeedback> = new Map();
  public customModals: Map<string, AdminCustomModalConfig> = new Map();
  public feeSuggestions: Map<string, FeeSuggestion> = new Map();
  public scheduledNotifications: Map<string, AppNotification> = new Map();
  public pricingSettings: PricingSettings = DEFAULT_PRICING_SETTINGS;

  // Set by AuthContext when a user logs in/out so the Firestore
  // notification listener knows which device belongs to which user.
  public currentUserId: string | null = null;

  // Tracks Firestore notification doc IDs that have already been processed
  // on this device, so we don't re-fire a browser popup for old ones.
  // Fix 2: Pre-populated from sessionStorage so page refreshes don't re-fire old notifications.
  private _knownNotifIds: Set<string> = new Set();
  private _KNOWN_NOTIF_SS_KEY = 'jamanot_known_notif_ids';
  private _MAX_KNOWN_NOTIF_IDS = 200;

  // Fix 1: Debounce timer for saveLocalStore — prevents blocking the main thread
  // on every Firestore event. Store is written at most every 2 seconds.
  private _saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Role-Scoped Listener Management ─────────────────────────────────────
  // Stores active unsubscribe callbacks; torn down on role/user switch.
  private _unsubListeners: (() => void)[] = [];
  private _shopsCachedAt = 0;  // epoch ms when shops were last fetched
  private _modalsCachedAt = 0; // epoch ms when customModals were last fetched
  private _listenersRole: string | null = null; // e.g. 'helper:uid123'

  constructor() {
    this.loadFromLocalStorage();
    // Fix 2: Pre-populate known notif IDs from sessionStorage to survive page refreshes.
    this._hydrateKnownNotifIds();
    // NOTE: Firestore listeners are NOT started here.
    // AuthContext calls initListenersForRole() after login so we know the user's role.
    this.startRoutingTimer();
    this.startScheduledNotificationTimer();
  }

  // ─── Fix 2: sessionStorage helpers for _knownNotifIds ────────────────────
  private _hydrateKnownNotifIds() {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(this._KNOWN_NOTIF_SS_KEY);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        if (Array.isArray(ids)) {
          ids.forEach((id) => this._knownNotifIds.add(id));
        }
      }
    } catch (_) { /* ignore */ }
  }

  private _persistKnownNotifIds() {
    if (typeof window === 'undefined') return;
    try {
      // Keep only the most recent N IDs to avoid unbounded growth
      const ids = Array.from(this._knownNotifIds);
      const toStore = ids.slice(-this._MAX_KNOWN_NOTIF_IDS);
      sessionStorage.setItem(this._KNOWN_NOTIF_SS_KEY, JSON.stringify(toStore));
    } catch (_) { /* ignore – sessionStorage full, best-effort */ }
  }

  private startRoutingTimer() {
    if (typeof window === 'undefined') return;
    setInterval(() => {
      this.checkDedicatedRouting();
    }, 15000);
  }

  private startScheduledNotificationTimer() {
    if (typeof window === 'undefined') return;
    setInterval(() => {
      this.checkScheduledNotifications();
    }, 10000);
  }

  private async checkScheduledNotifications() {
    const now = Date.now();
    const toProcess: AppNotification[] = [];
    this.scheduledNotifications.forEach((notif) => {
      if (notif.scheduledAt) {
        const scheduledTime = new Date(notif.scheduledAt).getTime();
        if (now >= scheduledTime) {
          toProcess.push(notif);
        }
      }
    });

    for (const notif of toProcess) {
      // Dispatch notification
      const dispatchNotif: AppNotification = {
        ...notif,
        id: `notif-disp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        createdAt: new Date().toISOString(),
        isScheduled: false,
      };
      await this.addNotification(dispatchNotif);

      // Handle recurrence
      if (notif.repeatFrequency === 'DAILY') {
        const nextDate = new Date(now + 24 * 3600 * 1000);
        notif.scheduledAt = nextDate.toISOString();
        this.scheduledNotifications.set(notif.id, notif);
      } else if (notif.repeatFrequency === 'WEEKLY') {
        const nextDate = new Date(now + 7 * 24 * 3600 * 1000);
        notif.scheduledAt = nextDate.toISOString();
        this.scheduledNotifications.set(notif.id, notif);
      } else {
        this.scheduledNotifications.delete(notif.id);
      }
      this.notify();
      this.saveLocalStore();
    }
  }

  private async checkDedicatedRouting() {
    const delayMins = this.pricingSettings.dedicatedHelperDelayMinutes || 7;
    const now = Date.now();
    const thresholdMs = delayMins * 60 * 1000;

    this.orders.forEach((order) => {
      if (order.status === 'PENDING' && !order.routedToDedicated) {
        const createdMs = new Date(order.createdAt).getTime();
        if (now - createdMs >= thresholdMs) {
          order.routedToDedicated = true;
          order.dedicatedNotifiedAt = new Date().toISOString();
          this.orders.set(order.id, order);

          const itemDesc = order.items.map((i) => i.name).join(', ') || order.title;
          this.addNotification({
            id: `notif-ded-${Date.now()}-${order.id}`,
            userId: 'all-dedicated-helpers',
            title: `[ডেডিকেটেড রাইডার] অর্ডার গ্রহণ করতে পারেন!`,
            body: `${order.title}: ${itemDesc} - ${delayMins} মিনিট পার হয়েছে।`,
            orderId: order.id,
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    });
  }

  private safeParse<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw || raw.trim().startsWith('<')) return null;
      return JSON.parse(raw) as T;
    } catch (e) {
      console.warn(`[FallbackStore] Error parsing localStorage item "${key}":`, e);
      return null;
    }
  }

  private loadFromLocalStorage() {
    if (typeof window === 'undefined') return;
    try {
      const parsedOrders = this.safeParse<[string, Order][]>('jamanot_orders_store');
      if (parsedOrders && Array.isArray(parsedOrders)) {
        parsedOrders.forEach(([id, order]) => {
          if (id && order) this.orders.set(id, order);
        });
      }

      const parsedUsers = this.safeParse<[string, UserProfile][]>('jamanot_users_store');
      if (parsedUsers && Array.isArray(parsedUsers)) {
        parsedUsers.forEach(([id, u]) => {
          if (id && u) this.users.set(id, u);
        });
      }

      const parsedApps = this.safeParse<[string, HelperApplication][]>('jamanot_helper_apps_store');
      if (parsedApps && Array.isArray(parsedApps)) {
        parsedApps.forEach(([id, app]) => {
          if (id && app) this.helperApplications.set(id, app);
        });
      }

      const parsedStoreApps = this.safeParse<[string, StoreApplication][]>('jamanot_store_apps_store');
      if (parsedStoreApps && Array.isArray(parsedStoreApps)) {
        parsedStoreApps.forEach(([id, app]) => {
          if (id && app) this.storeApplications.set(id, app);
        });
      }

      const parsedWallets = this.safeParse<[string, Wallet][]>('jamanot_wallets_store');
      if (parsedWallets && Array.isArray(parsedWallets)) {
        parsedWallets.forEach(([id, w]) => {
          if (id && w) this.wallets.set(id, w);
        });
      }

      const parsedTxs = this.safeParse<[string, WalletTransaction[]][]>('jamanot_wallet_txs_store');
      if (parsedTxs && Array.isArray(parsedTxs)) {
        parsedTxs.forEach(([id, list]) => {
          if (id && Array.isArray(list)) this.walletTransactions.set(id, list);
        });
      }

      const parsedWds = this.safeParse<[string, WithdrawalRequest][]>('jamanot_withdrawals_store');
      if (parsedWds && Array.isArray(parsedWds)) {
        parsedWds.forEach(([id, wd]) => {
          if (id && wd) this.withdrawals.set(id, wd);
        });
      }

      const parsedNotifs = this.safeParse<[string, AppNotification[]][]>('jamanot_notifications_store');
      if (parsedNotifs && Array.isArray(parsedNotifs)) {
        parsedNotifs.forEach(([id, list]) => {
          if (id && Array.isArray(list)) this.notifications.set(id, list);
        });
      }

      const parsedShops = this.safeParse<[string, Shop][]>('jamanot_shops_store');
      if (parsedShops && Array.isArray(parsedShops)) {
        parsedShops.forEach(([id, s]) => {
          if (id && s) this.shops.set(id, s);
        });
      }

      const parsedShopOrders = this.safeParse<[string, ShopOrder][]>('jamanot_shop_orders_store');
      if (parsedShopOrders && Array.isArray(parsedShopOrders)) {
        parsedShopOrders.forEach(([id, so]) => {
          if (id && so) this.shopOrders.set(id, so);
        });
      }

      const parsedFbs = this.safeParse<[string, OrderFeedback][]>('jamanot_feedbacks_store');
      if (parsedFbs && Array.isArray(parsedFbs)) {
        parsedFbs.forEach(([id, fb]) => {
          if (id && fb) this.orderFeedbacks.set(id, fb);
        });
      }

      const parsedModals = this.safeParse<[string, AdminCustomModalConfig][]>('jamanot_modals_store');
      if (parsedModals && Array.isArray(parsedModals)) {
        parsedModals.forEach(([id, m]) => {
          if (id && m) this.customModals.set(id, m);
        });
      }

      const parsedSuggestions = this.safeParse<[string, FeeSuggestion][]>('jamanot_fee_suggestions_store');
      if (parsedSuggestions && Array.isArray(parsedSuggestions)) {
        parsedSuggestions.forEach(([id, s]) => {
          if (id && s) this.feeSuggestions.set(id, s);
        });
      }

      const savedPricing = this.safeParse<PricingSettings>('jamanot_pricing_store');
      if (savedPricing && typeof savedPricing === 'object') {
        this.pricingSettings = savedPricing;
      }
    } catch (e) {
      console.warn('Local storage hydration error:', e);
    }
  }

  private saveLocalStore() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('jamanot_orders_store', JSON.stringify(Array.from(this.orders.entries())));
      localStorage.setItem('jamanot_users_store', JSON.stringify(Array.from(this.users.entries())));
      localStorage.setItem('jamanot_helper_apps_store', JSON.stringify(Array.from(this.helperApplications.entries())));
      localStorage.setItem('jamanot_store_apps_store', JSON.stringify(Array.from(this.storeApplications.entries())));
      localStorage.setItem('jamanot_wallets_store', JSON.stringify(Array.from(this.wallets.entries())));
      localStorage.setItem('jamanot_wallet_txs_store', JSON.stringify(Array.from(this.walletTransactions.entries())));
      localStorage.setItem('jamanot_withdrawals_store', JSON.stringify(Array.from(this.withdrawals.entries())));
      localStorage.setItem('jamanot_notifications_store', JSON.stringify(Array.from(this.notifications.entries())));
      localStorage.setItem('jamanot_shops_store', JSON.stringify(Array.from(this.shops.entries())));
      localStorage.setItem('jamanot_shop_orders_store', JSON.stringify(Array.from(this.shopOrders.entries())));
      localStorage.setItem('jamanot_feedbacks_store', JSON.stringify(Array.from(this.orderFeedbacks.entries())));
      localStorage.setItem('jamanot_modals_store', JSON.stringify(Array.from(this.customModals.entries())));
      localStorage.setItem('jamanot_fee_suggestions_store', JSON.stringify(Array.from(this.feeSuggestions.entries())));
      localStorage.setItem('jamanot_pricing_store', JSON.stringify(this.pricingSettings));
    } catch (e) {
      console.warn('Local storage persist error:', e);
    }
  }

  // ─── Shared notification snapshot handler ─────────────────────────────────
  // Processes any notification snapshot (from any role-scoped query) and:
  //   1. Stores notifications in the local map keyed by the current userId
  //      (broadcast notifications like 'all-helpers' are keyed under the actual uid)
  //   2. Fires browser popups only for genuinely NEW, unread, targeted notifications
  //      Fix 2: _knownNotifIds is now persisted to sessionStorage so page refreshes
  //             don't re-fire all previously seen notifications.
  private _handleNotificationSnapshot(snapshot: any, userId: string) {
    const BROADCAST_IDS = new Set(['all', 'all-helpers', 'all-customers', 'all-commuter-helpers', 'all-dedicated-helpers']);
    // Fix 4: Max notifications to store per user in memory.
    const MAX_NOTIFS_PER_USER = 100;

    const map = new Map<string, AppNotification[]>();
    snapshot.docs.forEach((docSnap: any) => {
      const data = docSnap.data() as AppNotification;
      // Broadcast notifications are stored under the current user's uid locally
      const storeKey = BROADCAST_IDS.has(data.userId) ? userId : data.userId;
      const userList = map.get(storeKey) || [];
      userList.push(data);
      map.set(storeKey, userList);
    });
    map.forEach((list, key) => {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      // Fix 4: Cap list length to avoid unbounded memory usage.
      this.notifications.set(key, list.slice(0, MAX_NOTIFS_PER_USER));
    });

    // Fire browser popup only for genuinely NEW, unread notifications targeting this device.
    // Fix 2: Because _knownNotifIds is pre-populated from sessionStorage on refresh,
    //        previously-seen notifications are already in the set and won't re-fire.
    if (this.currentUserId) {
      const uid = this.currentUserId;
      const currentUser = this.users.get(uid);
      // isInitial is now only true when the set truly has zero entries
      // (i.e. first-ever login in this browser session, not a refresh).
      const isInitial = this._knownNotifIds.size === 0;
      let newUnreadCount = 0;
      const toTrigger: AppNotification[] = [];
      let knownIdsChanged = false;

      snapshot.docs.forEach((docSnap: any) => {
        const notif = docSnap.data() as AppNotification;
        if (this._knownNotifIds.has(notif.id)) return; // already seen — skip
        this._knownNotifIds.add(notif.id);
        knownIdsChanged = true;

        const targets =
          notif.userId === uid ||
          notif.userId === 'all' ||
          (notif.userId === 'all-helpers' && currentUser?.isHelper) ||
          (notif.userId === 'all-commuter-helpers' && currentUser?.isHelper && currentUser?.helperType !== 'dedicated') ||
          (notif.userId === 'all-dedicated-helpers' && currentUser?.isHelper && currentUser?.helperType === 'dedicated') ||
          (notif.userId === 'all-customers' && currentUser && !currentUser.isHelper && currentUser.role !== 'admin');

        if (targets && !notif.read) {
          if (isInitial) {
            newUnreadCount++;
            toTrigger.push(notif);
          } else {
            triggerBrowserNotification(notif);
          }
        }
      });

      // Persist updated set to sessionStorage so refresh won't re-fire these.
      if (knownIdsChanged) {
        this._persistKnownNotifIds();
      }

      // Flood control on very first load (no sessionStorage data) — consolidate if many unread.
      if (isInitial && newUnreadCount > 0) {
        if (newUnreadCount > 2) {
          triggerBrowserNotification({
            id: `consolidated-init-${Date.now()}`,
            title: 'নতুন নোটিফিকেশন (New Notifications)',
            body: `আপনার ${newUnreadCount}টি নতুন নোটিফিকেশন আছে। দেখতে নোটিফিকেশন বেল ট্যাপ করুন।`,
          });
        } else {
          toTrigger.forEach((n) => triggerBrowserNotification(n));
        }
      }
    }

    this.notify();
  }

  // ─── Shops: one-time read with 30-minute localStorage cache ───────────────
  private _loadShopsCached() {
    const CACHE_TTL = 30 * 60 * 1000;
    if (Date.now() - this._shopsCachedAt < CACHE_TTL && this.shops.size > 0) return;
    getDocs(collection(db, 'shops'))
      .then((snapshot) => {
        this.shops.clear();
        snapshot.forEach((docSnap) => {
          this.shops.set(docSnap.id, docSnap.data() as Shop);
        });
        this._shopsCachedAt = Date.now();
        this.notify();
      })
      .catch((err) => console.warn('[Firestore] Shops getDocs note:', err));
  }

  // ─── Custom modals: one-time read with 30-minute localStorage cache ────────
  private _loadModalsCached() {
    const CACHE_TTL = 30 * 60 * 1000;
    if (Date.now() - this._modalsCachedAt < CACHE_TTL && this.customModals.size > 0) return;
    getDocs(collection(db, 'customModals'))
      .then((snapshot) => {
        this.customModals.clear();
        snapshot.forEach((docSnap) => {
          this.customModals.set(docSnap.id, docSnap.data() as AdminCustomModalConfig);
        });
        this._modalsCachedAt = Date.now();
        this.notify();
      })
      .catch((err) => console.warn('[Firestore] CustomModals getDocs note:', err));
  }

  // ─── Tear down all active Firestore listeners ──────────────────────────────
  // Called on logout and before switching to a different role/user.
  public teardownListeners() {
    this._unsubListeners.forEach((unsub) => { try { unsub(); } catch (_) {} });
    this._unsubListeners = [];
    this._listenersRole = null;
  }

  // ─── Role-scoped Firestore listener initialization ────────────────────────
  // Call this from AuthContext after login and whenever active mode changes.
  //
  // OPTIMIZATION SUMMARY vs old 12-listener approach:
  //   Customer: own orders + own notifs + pricing + cached shops/modals
  //   Helper:   active orders + own orders + own notifs + own wallet + pricing + cached shops/modals
  //   Store:    incoming shopOrders + store orders + own customer orders + notifs + wallet + cached shops/modals
  //   Admin:    full visibility with sensible limits (200 orders, 300 users, 500 txns)
  //
  // Estimated reads/day: ~1,400 (vs ~50,000 previously) for 500 orders/day
  public initListenersForRole(
    role: 'customer' | 'helper' | 'admin' | 'store',
    userId: string,
    helperType?: string,
    storeId?: string
  ) {
    if (typeof window === 'undefined') return;

    const roleKey = `${role}:${userId}`;
    if (this._listenersRole === roleKey) return; // Already listening — no-op

    // Tear down previous set before starting new one
    this.teardownListeners();
    this._listenersRole = roleKey;

    const unsubs: (() => void)[] = [];

    // ── Pricing settings: single doc, tiny cost, always needed ────────────────
    unsubs.push(
      onSnapshot(
        doc(db, 'settings', 'pricing'),
        (docSnap) => {
          if (docSnap.exists()) {
            this.pricingSettings = docSnap.data() as PricingSettings;
            this.notify();
          }
        },
        (err) => console.warn('[Firestore] PricingSettings sync note:', err)
      )
    );

    // ── STORE role ────────────────────────────────────────────────────────────
    if (role === 'store') {
      const effectiveStoreId = storeId || `store-${userId}`;

      // Shop orders submitted to this store (realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'shopOrders'), where('shopId', '==', effectiveStoreId), limit(100)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.shopOrders.delete(change.doc.id);
              } else {
                this.shopOrders.set(change.doc.id, change.doc.data() as ShopOrder);
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Store shopOrders sync note:', err)
        )
      );

      // Parent orders selected for this store (realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'orders'), where('selectedShopIds', 'array-contains', effectiveStoreId), limit(60)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.orders.delete(change.doc.id);
              } else {
                this.orders.set(change.doc.id, change.doc.data() as Order);
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Store orders sync note:', err)
        )
      );

      // Store owner's own customer orders (realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'orders'), where('customerId', '==', userId), limit(30)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.orders.delete(change.doc.id);
              } else {
                this.orders.set(change.doc.id, change.doc.data() as Order);
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Store customer orders sync note:', err)
        )
      );

      // Notifications for store owner + all-stores (realtime)
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'notifications'),
            where('userId', 'in', [userId, 'all', 'all-stores']),
            limit(50)
          ),
          (snapshot) => this._handleNotificationSnapshot(snapshot, userId),
          (err) => console.warn('[Firestore] Store notifications sync note:', err)
        )
      );

      // Store owner's wallet document (realtime)
      unsubs.push(
        onSnapshot(
          doc(db, 'wallets', userId),
          (docSnap) => {
            if (docSnap.exists()) {
              this.wallets.set(userId, docSnap.data() as Wallet);
              this.notify();
            }
          },
          (err) => console.warn('[Firestore] Store wallet sync note:', err)
        )
      );

      // Shops & modals: one-time reads with 30-min cache
      this._loadShopsCached();
      this._loadModalsCached();

    // ── CUSTOMER role ─────────────────────────────────────────────────────────
    } else if (role === 'customer') {
      // Only this customer's orders (realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'orders'), where('customerId', '==', userId), limit(50)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.orders.delete(change.doc.id);
              } else {
                this.orders.set(change.doc.id, change.doc.data() as Order);
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Customer orders sync note:', err)
        )
      );

      // Own notifications + broadcast ones (realtime)
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'notifications'),
            where('userId', 'in', [userId, 'all', 'all-customers']),
            limit(50)
          ),
          (snapshot) => this._handleNotificationSnapshot(snapshot, userId),
          (err) => console.warn('[Firestore] Customer notifications sync note:', err)
        )
      );

      // Own withdrawals (realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'withdrawals'), where('helperId', '==', userId), limit(50)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.withdrawals.delete(change.doc.id);
              } else {
                this.withdrawals.set(change.doc.id, change.doc.data() as WithdrawalRequest);
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Customer withdrawals sync note:', err)
        )
      );

      // Shops & modals: one-time reads with 30-min cache (rarely change)
      this._loadShopsCached();
      this._loadModalsCached();

    // ── HELPER role ───────────────────────────────────────────────────────────
    } else if (role === 'helper') {
      const helperGroup =
        helperType === 'dedicated' ? 'all-dedicated-helpers' : 'all-commuter-helpers';

      // Active/in-progress orders that any helper can see (realtime)
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'orders'),
            where('status', 'in', ['PENDING', 'ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED', 'SCHEDULED']),
            limit(60)
          ),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.orders.delete(change.doc.id);
              } else {
                this.orders.set(change.doc.id, change.doc.data() as Order);
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Helper active orders sync note:', err)
        )
      );

      // This helper's own orders — all statuses (history, delivered, etc.) (realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'orders'), where('helperId', '==', userId), limit(30)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.orders.delete(change.doc.id);
              } else {
                this.orders.set(change.doc.id, change.doc.data() as Order);
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Helper own orders sync note:', err)
        )
      );

      // Own withdrawals (realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'withdrawals'), where('helperId', '==', userId), limit(50)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.withdrawals.delete(change.doc.id);
              } else {
                this.withdrawals.set(change.doc.id, change.doc.data() as WithdrawalRequest);
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Helper withdrawals sync note:', err)
        )
      );

      // Own notifications + all-helpers broadcast + helperType-specific (realtime)
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'notifications'),
            where('userId', 'in', [userId, 'all', 'all-helpers', helperGroup]),
            limit(60)
          ),
          (snapshot) => this._handleNotificationSnapshot(snapshot, userId),
          (err) => console.warn('[Firestore] Helper notifications sync note:', err)
        )
      );

      // Helper's own wallet document (realtime, needed for earnings display)
      unsubs.push(
        onSnapshot(
          doc(db, 'wallets', userId),
          (docSnap) => {
            if (docSnap.exists()) {
              this.wallets.set(userId, docSnap.data() as Wallet);
              this.notify();
            }
          },
          (err) => console.warn('[Firestore] Helper wallet sync note:', err)
        )
      );

      // Shops & modals: one-time reads with 30-min cache
      this._loadShopsCached();
      this._loadModalsCached();

      // Shop orders placed by this helper (realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'shopOrders'), where('helperId', '==', userId), limit(100)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.shopOrders.delete(change.doc.id);
              } else {
                this.shopOrders.set(change.doc.id, change.doc.data() as ShopOrder);
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Helper shopOrders sync note:', err)
        )
      );

    // ── ADMIN role ────────────────────────────────────────────────────────────
    } else if (role === 'admin') {
      // All orders (most recent 20, realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(20)),
          (snapshot) => {
            const currentIds = new Set(snapshot.docs.map((d) => d.id));
            for (const key of Array.from(this.orders.keys())) {
              if (!currentIds.has(key)) this.orders.delete(key);
            }
            snapshot.docs.forEach((docSnap) => {
              this.orders.set(docSnap.id, docSnap.data() as Order);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin orders sync note:', err)
        )
      );

      // All users (up to 30, realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'users'), limit(30)),
          (snapshot) => {
            snapshot.docs.forEach((docSnap) => {
              const u = docSnap.data() as UserProfile;
              this.users.set(u.uid, u);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin users sync note:', err)
        )
      );

      // All wallets (realtime)
      unsubs.push(
        onSnapshot(
          collection(db, 'wallets'),
          (snapshot) => {
            snapshot.docs.forEach((docSnap) => {
              const w = docSnap.data() as Wallet;
              this.wallets.set(w.userId, w);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin wallets sync note:', err)
        )
      );

      // Wallet transactions (up to 500, realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'walletTransactions'), limit(500)),
          (snapshot) => {
            const map = new Map<string, WalletTransaction[]>();
            snapshot.docs.forEach((docSnap) => {
              const tx = docSnap.data() as WalletTransaction;
              const list = map.get(tx.userId) || [];
              list.push(tx);
              map.set(tx.userId, list);
            });
            map.forEach((list, key) => {
              list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              this.walletTransactions.set(key, list);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin walletTransactions sync note:', err)
        )
      );

      // All withdrawals (realtime)
      unsubs.push(
        onSnapshot(
          collection(db, 'withdrawals'),
          (snapshot) => {
            snapshot.docs.forEach((docSnap) => {
              const wd = docSnap.data() as WithdrawalRequest;
              this.withdrawals.set(wd.id, wd);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin withdrawals sync note:', err)
        )
      );

      // All helper applications (realtime)
      unsubs.push(
        onSnapshot(
          collection(db, 'helperApplications'),
          (snapshot) => {
            snapshot.docs.forEach((docSnap) => {
              const a = docSnap.data() as HelperApplication;
              this.helperApplications.set(a.id, a);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin helperApplications sync note:', err)
        )
      );

      // All store applications (realtime)
      unsubs.push(
        onSnapshot(
          collection(db, 'storeApplications'),
          (snapshot) => {
            snapshot.docs.forEach((docSnap) => {
              const a = docSnap.data() as StoreApplication;
              this.storeApplications.set(a.id, a);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin storeApplications sync note:', err)
        )
      );

      // Notifications (up to 200, realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'notifications'), limit(200)),
          (snapshot) => this._handleNotificationSnapshot(snapshot, userId),
          (err) => console.warn('[Firestore] Admin notifications sync note:', err)
        )
      );

      // Order feedbacks (realtime)
      unsubs.push(
        onSnapshot(
          collection(db, 'orderFeedbacks'),
          (snapshot) => {
            snapshot.docs.forEach((docSnap) => {
              const fb = docSnap.data() as OrderFeedback;
              this.orderFeedbacks.set(fb.id, fb);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin orderFeedbacks sync note:', err)
        )
      );

      // Fee suggestions (realtime)
      unsubs.push(
        onSnapshot(
          collection(db, 'feeSuggestions'),
          (snapshot) => {
            snapshot.docs.forEach((docSnap) => {
              this.feeSuggestions.set(docSnap.id, docSnap.data() as FeeSuggestion);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin feeSuggestions sync note:', err)
        )
      );

      // Custom modals (realtime for admin, so they see changes immediately)
      unsubs.push(
        onSnapshot(
          collection(db, 'customModals'),
          (snapshot) => {
            snapshot.docs.forEach((docSnap) => {
              this.customModals.set(docSnap.id, docSnap.data() as AdminCustomModalConfig);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin customModals sync note:', err)
        )
      );

      // Shops (realtime for admin, limited to 20)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'shops'), limit(20)),
          (snapshot) => {
            snapshot.docs.forEach((docSnap) => {
              this.shops.set(docSnap.id, docSnap.data() as Shop);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin shops sync note:', err)
        )
      );

      // All shop orders (realtime for admin)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'shopOrders'), limit(500)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.shopOrders.delete(change.doc.id);
              } else {
                this.shopOrders.set(change.doc.id, change.doc.data() as ShopOrder);
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin shopOrders sync note:', err)
        )
      );
    }

    this._unsubListeners = unsubs;
    console.info(`[Firestore] Listeners initialized for role=${role}, uid=${userId}, listeners=${unsubs.length}`);
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notify() {
    // Fix 1: Debounce localStorage saves. Notify all React subscribers immediately
    // (so the UI stays snappy), but only persist to localStorage at most every 2s.
    // This prevents blocking the main thread on every Firestore snapshot.
    this.listeners.forEach((l) => l());
    if (this._saveDebounceTimer) clearTimeout(this._saveDebounceTimer);
    this._saveDebounceTimer = setTimeout(() => {
      this.saveLocalStore();
      this._saveDebounceTimer = null;
    }, 2000);
  }

  // --- Actions with Firebase Persistence & Dynamic Notifications ---

  public async saveUser(user: UserProfile) {
    this.users.set(user.uid, user);
    this.notify();
    try {
      await setDoc(doc(db, 'users', user.uid), cleanForFirestore(user), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] saveUser note (stored locally):', e?.message || e);
    }
  }

  public async blockUser(uid: string, isBlocked: boolean, reason?: string) {
    const existing = this.users.get(uid);
    if (!existing) return;
    const updated: UserProfile = {
      ...existing,
      isBlocked,
      blockedReason: isBlocked ? reason || 'Blocked by administrator' : undefined,
    };
    this.users.set(uid, updated);
    this.notify();
    try {
      await setDoc(doc(db, 'users', uid), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] blockUser note (stored locally):', e?.message || e);
    }
  }

  public async deleteUser(uid: string) {
    this.users.delete(uid);
    this.notify();
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (e: any) {
      console.warn('[Firestore] deleteUser note (stored locally):', e?.message || e);
    }
  }

  public async updateUserLabels(uid: string, labels: string[]) {
    const existing = this.users.get(uid);
    if (!existing) return;
    const updated: UserProfile = {
      ...existing,
      labels,
    };
    this.users.set(uid, updated);
    this.notify();
    try {
      await setDoc(doc(db, 'users', uid), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] updateUserLabels note (stored locally):', e?.message || e);
    }
  }

  public async setAdminRole(uid: string, isAdmin: boolean) {
    const existing = this.users.get(uid);
    if (!existing) return;
    const updated: UserProfile = {
      ...existing,
      isAdmin,
      role: isAdmin ? 'admin' : (existing.isHelper ? 'helper' : 'customer'),
      lastActiveMode: isAdmin ? 'admin' : (existing.lastActiveMode === 'admin' ? 'customer' : existing.lastActiveMode),
    };
    this.users.set(uid, updated);
    this.notify();
    try {
      await setDoc(doc(db, 'users', uid), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] setAdminRole note (stored locally):', e?.message || e);
    }
  }

  public async addOrder(order: Order) {
    this.orders.set(order.id, order);

    const rule = this.pricingSettings.orderReceiverRule || 'commuter_first';
    const targetGroup =
      rule === 'dedicated_first'
        ? 'all-dedicated-helpers'
        : rule === 'both_simultaneous'
        ? 'all-helpers'
        : 'all-commuter-helpers';

    const itemDesc = order.items.map((i) => i.name).join(', ') || order.title;

    // Dynamic notification to helpers with Service Name/Title & Description
    this.addNotification({
      id: `notif-${Date.now()}`,
      userId: targetGroup,
      title: `নতুন সার্ভিস রিকোয়েস্ট: ${order.title}`,
      body: `বিবরণ: ${itemDesc} (${order.pickupLocation?.address ? 'পিকআপ: ' + order.pickupLocation.address + ' | ' : ''}ডেলিভারি: ${order.deliveryLocation.address})`,
      orderId: order.id,
      read: false,
      createdAt: new Date().toISOString(),
      targetRole: 'helper',
      type: 'new_order',
    });

    this.notify();

    try {
      await setDoc(doc(db, 'orders', order.id), cleanForFirestore(order));
    } catch (e: any) {
      console.warn('[Firestore] addOrder note (saved locally):', e?.message || e);
    }
  }

  public async deleteOrder(orderId: string) {
    this.orders.delete(orderId);
    this.notify();
    try {
      await deleteDoc(doc(db, 'orders', orderId));
    } catch (e: any) {
      console.warn('[Firestore] deleteOrder note:', e?.message || e);
    }
  }

  public async updateOrder(orderId: string, updater: (order: Order) => Order) {
    const existing = this.orders.get(orderId);
    if (!existing) return;

    const previousStatus = existing.status;
    const updated = updater(existing);
    updated.updatedAt = new Date().toISOString();
    this.orders.set(orderId, updated);

    // Dynamic Notifications based on Order Status changes
    if (updated.status !== previousStatus) {
      let notifTitle = '';
      let notifBody = '';

      if (updated.status === 'ACCEPTED') {
        notifTitle = 'রিকোয়েস্ট একসেপ্ট করা হয়েছে!';
        notifBody = `${updated.helperName || 'হেলপার'} আপনার অর্ডার #${updated.id} গ্রহণ করেছেন।`;
      } else if (updated.status === 'PURCHASED_EXECUTED') {
        notifTitle = 'পণ্য ক্রয় সম্পন্ন!';
        notifBody = `${updated.helperName || 'হেলপার'} আপনার প্রয়োজনীয় জিনিসপত্র কিনেছেন।`;
      } else if (updated.status === 'ON_THE_WAY') {
        notifTitle = 'হেলপার আপনার পথে আছেন!';
        notifBody = `${updated.helperName || 'হেলপার'} ডেলিভারি দিতে রওনা হয়েছেন।`;
      } else if (updated.status === 'ARRIVED') {
        notifTitle = 'হেলপার আপনার ঠিকানায় পৌঁছেছেন!';
        notifBody = `আপনার বাসার সামনে হেলপার উপস্থিত আছেন।`;
      } else if (updated.status === 'DELIVERED') {
        notifTitle = 'অর্ডার সম্পন্ন হয়েছে!';
        notifBody = `ধন্যবাদ! আপনার অর্ডার #${updated.id} সফলভাবে ডেলিভারি হয়েছে।`;
      } else if (updated.status === 'CANCELED') {
        notifTitle = 'অর্ডার বাতিল হয়েছে';
        notifBody = `অর্ডার #${updated.id} বাতিল করা হয়েছে।`;
      }

      if (notifTitle && updated.customerId) {
        this.addNotification({
          id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          userId: updated.customerId,
          title: notifTitle,
          body: notifBody,
          orderId: updated.id,
          read: false,
          createdAt: new Date().toISOString(),
          targetRole: 'customer',
          type: 'order_update',
        });
      }

      // If order canceled, also notify assigned helper or all helpers
      if (updated.status === 'CANCELED') {
        const helperTarget = updated.helperId || existing.helperId || 'all-helpers';
        this.addNotification({
          id: `notif-cancel-hlp-${Date.now()}`,
          userId: helperTarget,
          title: 'অর্ডার বাতিল করা হয়েছে',
          body: `অর্ডার #${updated.id} বাতিল করা হয়েছে।`,
          orderId: updated.id,
          read: false,
          createdAt: new Date().toISOString(),
          targetRole: helperTarget === 'all-helpers' ? undefined : 'helper',
          type: 'order_update',
        });
      }

      // Notify stores/shops involved in this order when completed (Requirement 4)
      if (updated.status === 'DELIVERED') {
        const relatedShopOrders = this.getShopOrdersForOrder(updated.id);
        relatedShopOrders.forEach((so) => {
          const shop = this.shops.get(so.shopId);
          if (shop?.ownerUserId) {
            this.addNotification({
              id: `notif-store-comp-${Date.now()}-${so.id}`,
              userId: shop.ownerUserId,
              title: 'অর্ডার সম্পন্ন হয়েছে!',
              body: `আপনার স্টোরের অর্ডার #${updated.id.slice(-6).toUpperCase()} সফলভাবে সম্পন্ন এবং ডেলিভারি হয়েছে।`,
              orderId: updated.id,
              read: false,
              createdAt: new Date().toISOString(),
              targetRole: 'store',
              type: 'order_update',
            });
          }
        });
      }
    }

    // Product cost addition / update notification to customer
    if (
      updated.productCost !== undefined &&
      existing.productCost !== updated.productCost &&
      updated.customerId
    ) {
      this.addNotification({
        id: `notif-${Date.now()}-cost`,
        userId: updated.customerId,
        title: 'পণ্যের খরচ যোগ/আপডেট করা হয়েছে',
        body: `আপনার অর্ডার #${updated.id} এর পণ্যের মোট খরচ ৳${updated.productCost} টাকা ধরা হয়েছে।`,
        orderId: updated.id,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'customer',
        type: 'order_update',
      });
    }

    // Delivery fee update notification to customer
    if (
      existing.deliveryFee !== undefined &&
      existing.deliveryFee !== updated.deliveryFee &&
      updated.customerId
    ) {
      this.addNotification({
        id: `notif-${Date.now()}-fee-change`,
        userId: updated.customerId,
        title: 'ডেলিভারি ফি আপডেট করা হয়েছে',
        body: `আপনার অর্ডার #${updated.id} এর ডেলিভারি চার্জ ৳${updated.deliveryFee} টাকা করা হয়েছে।`,
        orderId: updated.id,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'customer',
        type: 'order_update',
      });
    }

    // Customer edit notification to helper
    if (
      updated.lastEditedBy === 'customer' &&
      existing.lastEditedAt !== updated.lastEditedAt
    ) {
      const helperTarget = updated.helperId || 'all-helpers';
      this.addNotification({
        id: `notif-${Date.now()}-cust-edit`,
        userId: helperTarget,
        title: 'অর্ডার পরিবর্তন (Order Updated)',
        body: `গ্রাহক অর্ডার #${updated.id} এর তথ্য/বিবরণ আপডেট করেছেন।`,
        orderId: updated.id,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'helper',
        type: 'order_update',
      });
    }

    // Helper/Admin address edit notification to customer
    if (
      (updated.lastEditedBy === 'helper' || updated.lastEditedBy === 'admin') &&
      (existing.deliveryLocation.address !== updated.deliveryLocation.address ||
       existing.pickupLocation?.address !== updated.pickupLocation?.address)
    ) {
      const editorName = updated.lastEditedBy === 'helper' ? (updated.helperName || 'হেলপার') : 'এডমিন';
      const isDeliveryChanged = existing.deliveryLocation.address !== updated.deliveryLocation.address;
      const isPickupChanged = existing.pickupLocation?.address !== updated.pickupLocation?.address;
      let changeText = '';
      if (isDeliveryChanged && isPickupChanged) {
        changeText = 'পিকআপ ও ডেলিভারি ঠিকানা';
      } else if (isDeliveryChanged) {
        changeText = 'ডেলিভারি ঠিকানা';
      } else {
        changeText = 'পিকআপ ঠিকানা';
      }

      this.addNotification({
        id: `notif-${Date.now()}-addr-edit`,
        userId: updated.customerId,
        title: 'ঠিকানা পরিবর্তন করা হয়েছে (Address Updated)',
        body: `${editorName} অর্ডার #${updated.id} এর ${changeText} আপডেট করেছেন।`,
        orderId: updated.id,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'customer',
        type: 'order_update',
      });
    }

    // Helper/Admin items or general info edit notification to customer (Requirement 2)
    if (
      (updated.lastEditedBy === 'helper' || updated.lastEditedBy === 'admin') &&
      existing.lastEditedAt !== updated.lastEditedAt &&
      updated.customerId &&
      (JSON.stringify(existing.items) !== JSON.stringify(updated.items) ||
       existing.title !== updated.title ||
       existing.additionalNote !== updated.additionalNote)
    ) {
      const editorName = updated.lastEditedBy === 'helper' ? (updated.helperName || 'হেলপার') : 'এডমিন';
      this.addNotification({
        id: `notif-${Date.now()}-general-edit`,
        userId: updated.customerId,
        title: 'অর্ডার আপডেট করা হয়েছে (Order Updated)',
        body: `${editorName} আপনার অর্ডার #${updated.id} এর বিবরণ বা পণ্য তালিকা পরিবর্তন করেছেন।`,
        orderId: updated.id,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'customer',
        type: 'order_update',
      });
    }

    // Admin changes regarding order - notification to helper (Requirement 3)
    if (
      updated.lastEditedBy === 'admin' &&
      existing.lastEditedAt !== updated.lastEditedAt
    ) {
      const helperTarget = updated.helperId || existing.helperId;
      if (helperTarget) {
        let changes = [];
        if (existing.status !== updated.status) changes.push(`অবস্থা (স্ট্যাটাস: ${updated.status})`);
        if (existing.productCost !== updated.productCost) changes.push(`পণ্যের দাম (৳${updated.productCost || 0})`);
        if (existing.deliveryFee !== updated.deliveryFee) changes.push(`ডেলিভারি ফি (৳${updated.deliveryFee || 0})`);
        if (JSON.stringify(existing.items) !== JSON.stringify(updated.items)) changes.push('পণ্য তালিকা');
        if (existing.deliveryLocation.address !== updated.deliveryLocation.address || existing.pickupLocation?.address !== updated.pickupLocation?.address) changes.push('ঠিকানা');
        
        const changeDesc = changes.length > 0 ? changes.join(', ') + ' পরিবর্তন করা হয়েছে।' : 'তথ্য পরিবর্তন করা হয়েছে।';
        this.addNotification({
          id: `notif-${Date.now()}-admin-change`,
          userId: helperTarget,
          title: 'এডমিন অর্ডার পরিবর্তন করেছেন',
          body: `এডমিন অর্ডার #${updated.id} এর ${changeDesc}`,
          orderId: updated.id,
          read: false,
          createdAt: new Date().toISOString(),
          targetRole: 'helper',
          type: 'order_update',
        });
      }
    }

    // Fee adjustment notification to customer
    if (updated.feeAdjustment && updated.feeAdjustment.status === 'PENDING' && existing.feeAdjustment?.status !== 'PENDING') {
      this.addNotification({
        id: `notif-${Date.now()}-fee`,
        userId: updated.customerId,
        title: 'ডেলিভারি ফি সমন্বয় অনুরোধ',
        body: `হেলপার ডেলিভারি ফি ৳${updated.feeAdjustment.amount} টাকা করার অনুরোধ করেছেন।`,
        orderId: updated.id,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'customer',
        type: 'fee_adjustment',
      });
    }

    // If order was already delivered or is now delivered, update the helper's wallet document in Firestore
    if ((previousStatus === 'DELIVERED' || updated.status === 'DELIVERED') && (updated.helperId || existing.helperId)) {
      const helperId = updated.helperId || existing.helperId;
      if (helperId) {
        if (updated.status === 'DELIVERED' && previousStatus !== 'DELIVERED') {
          const commission = calculateHelperCommission(updated.deliveryFee, this.pricingSettings);
          await this.creditHelperEarning(helperId, commission, updated.deliveryFee, updated.id);
        } else {
          const updatedWallet = this.getHelperWallet(helperId);
          this.wallets.set(helperId, updatedWallet);
          try {
            await setDoc(doc(db, 'wallets', helperId), cleanForFirestore(updatedWallet), { merge: true });
          } catch (e) {
            console.warn('[Firestore] updateOrder wallet sync note:', e);
          }
        }
      }
    }

    this.notify();

    try {
      await setDoc(doc(db, 'orders', orderId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] updateOrder note (saved locally):', e?.message || e);
    }
  }

  // ─── Shop Orders (Helper → Store ordering system) ──────────────────────────

  public async addShopOrder(shopOrder: ShopOrder): Promise<void> {
    this.shopOrders.set(shopOrder.id, shopOrder);
    this.notify();
    // Notify the store owner if we know their userId
    const shop = this.shops.get(shopOrder.shopId);
    if (shop?.ownerUserId) {
      this.addNotification({
        id: `notif-shop-order-${Date.now()}`,
        userId: shop.ownerUserId,
        title: `নতুন অর্ডার: ${shopOrder.helperName}`,
        body: `হেলপার অর্ডার করেছেন: ${shopOrder.requestText.substring(0, 80)}`,
        orderId: shopOrder.parentOrderId,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'store',
        type: 'new_order',
      });
    }
    try {
      await setDoc(doc(db, 'shopOrders', shopOrder.id), cleanForFirestore(shopOrder));
    } catch (e: any) {
      console.warn('[Firestore] addShopOrder note (saved locally):', e?.message || e);
    }
  }

  public async updateShopOrder(
    shopOrderId: string,
    updater: (so: ShopOrder) => ShopOrder,
    actorRole?: 'helper' | 'store'
  ): Promise<void> {
    const existing = this.shopOrders.get(shopOrderId);
    if (!existing) return;
    const updated = updater(existing);
    updated.updatedAt = new Date().toISOString();
    this.shopOrders.set(shopOrderId, updated);

    // 1. Notify helper when status changes (triggered by store actions like accept, prepare)
    if (updated.status !== existing.status && updated.helperId && actorRole === 'store') {
      const statusLabels: Record<ShopOrderStatus, string> = {
        PENDING: 'অপেক্ষমাণ',
        ACCEPTED: 'গ্রহণ করা হয়েছে',
        PREPARING: 'প্রস্তুত হচ্ছে',
        READY: 'প্রস্তুত',
        HANDOVER: 'হস্তান্তর',
        CANCELED: 'বাতিল',
      };
      this.addNotification({
        id: `notif-shop-status-${Date.now()}`,
        userId: updated.helperId,
        title: `${updated.shopName}: অর্ডার ${statusLabels[updated.status]}`,
        body: updated.note || `আপনার অর্ডারের স্ট্যাটাস আপডেট হয়েছে।`,
        orderId: updated.parentOrderId,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'helper',
        type: 'order_update',
      });
    }

    // 2. Notify helper when store sets/updates price
    if (updated.price !== existing.price && updated.helperId && actorRole === 'store') {
      this.addNotification({
        id: `notif-shop-price-${Date.now()}`,
        userId: updated.helperId,
        title: `${updated.shopName}: মূল্য নির্ধারণ করা হয়েছে`,
        body: updated.price !== undefined ? `দোকানদার পণ্যের মূল্য নির্ধারণ করেছেন: ৳${updated.price}` : `দোকানদার মূল্য পরিবর্তন করেছেন।`,
        orderId: updated.parentOrderId,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'helper',
        type: 'order_update',
      });
    }

    // 3. Notify store owner when helper edits request text or price
    if (actorRole === 'helper') {
      const shop = this.shops.get(updated.shopId);
      if (shop?.ownerUserId && (updated.requestText !== existing.requestText || updated.price !== existing.price)) {
        this.addNotification({
          id: `notif-shop-order-edit-${Date.now()}`,
          userId: shop.ownerUserId,
          title: `অর্ডার এডিট করা হয়েছে: ${updated.helperName}`,
          body: `হেলপার অর্ডার এডিট করেছেন: ${updated.requestText.substring(0, 80)}${updated.price !== existing.price ? ` (নতুন মূল্য: ৳${updated.price || 0})` : ''}`,
          orderId: updated.parentOrderId,
          read: false,
          createdAt: new Date().toISOString(),
          targetRole: 'store',
          type: 'order_update',
        });
      }
    }

    this.notify();
    try {
      await setDoc(doc(db, 'shopOrders', shopOrderId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] updateShopOrder note (saved locally):', e?.message || e);
    }
  }

  public async deleteShopOrder(shopOrderId: string): Promise<void> {
    const existing = this.shopOrders.get(shopOrderId);
    this.shopOrders.delete(shopOrderId);
    this.notify();

    if (existing) {
      const shop = this.shops.get(existing.shopId);
      if (shop?.ownerUserId) {
        this.addNotification({
          id: `notif-shop-order-delete-${Date.now()}`,
          userId: shop.ownerUserId,
          title: `অর্ডার মুছে ফেলা হয়েছে: ${existing.helperName}`,
          body: `হেলপার অর্ডারটি মুছে ফেলেছেন: ${existing.requestText.substring(0, 80)}`,
          orderId: existing.parentOrderId,
          read: false,
          createdAt: new Date().toISOString(),
          targetRole: 'store',
          type: 'order_update',
        });
      }
    }

    try {
      await deleteDoc(doc(db, 'shopOrders', shopOrderId));
    } catch (e: any) {
      console.warn('[Firestore] deleteShopOrder note (saved locally):', e?.message || e);
    }
  }

  public getShopOrdersForOrder(parentOrderId: string): ShopOrder[] {
    return Array.from(this.shopOrders.values()).filter(
      (so) => so.parentOrderId === parentOrderId
    );
  }

  public getShopOrdersForStore(shopId: string): ShopOrder[] {
    return Array.from(this.shopOrders.values())
      .filter((so) => so.shopId === shopId && so.status !== 'CANCELED')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getHelperWallet(helperId: string): Wallet {
    const allOrders = Array.from(this.orders.values());
    const helperOrders = allOrders.filter(
      (o) => o.helperId === helperId && o.status === 'DELIVERED'
    );
    // All approved withdrawals are the single source of truth for paid commission.
    // Manual paybacks recorded by admin also create an APPROVED withdrawal record.
    const approvedWithdrawals = Array.from(this.withdrawals.values()).filter(
      (w) => w.helperId === helperId && w.status === 'APPROVED'
    );

    let totalEarned = 0;
    let totalPlatformShare = 0;

    helperOrders.forEach((o) => {
      const helperShare = calculateHelperCommission(o.deliveryFee, this.pricingSettings);
      totalEarned += helperShare;
      totalPlatformShare += (o.deliveryFee - helperShare);
    });

    const totalPaidCommission = approvedWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    const balance = Math.max(0, totalPlatformShare - totalPaidCommission);

    return {
      userId: helperId,
      balance,
      totalEarned,
      totalWithdrawn: totalPaidCommission,
      totalPaidCommission,
      updatedAt: new Date().toISOString(),
    };
  }

  public getStoreWallet(storeUserId: string, storeId: string): Wallet {
    const shopDoc = this.shops.get(storeId);
    const commissionRate = shopDoc?.commissionPercent ?? 0;

    // Filter shop orders belonging to this store where parent order is delivered and shop order is not canceled
    const storeShopOrders = Array.from(this.shopOrders.values()).filter((so) => {
      if (so.shopId !== storeId || so.status === 'CANCELED') return false;
      const parentOrder = this.orders.get(so.parentOrderId);
      return parentOrder?.status === 'DELIVERED';
    });

    // Only sum the price set for items ordered from this store
    const totalSales = storeShopOrders.reduce((sum, so) => sum + (so.price ?? 0), 0);
    const totalCommissionDue = Math.round(totalSales * (commissionRate / 100));

    const approvedWithdrawals = Array.from(this.withdrawals.values()).filter(
      (w) => w.helperId === storeUserId && w.status === 'APPROVED'
    );

    const totalPaidCommission = approvedWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    const balance = Math.max(0, totalCommissionDue - totalPaidCommission);

    return {
      userId: storeUserId,
      balance,
      totalEarned: totalSales,
      totalWithdrawn: totalPaidCommission,
      totalPaidCommission,
      updatedAt: new Date().toISOString(),
    };
  }


  public async creditHelperEarning(helperId: string, helperShare: number, deliveryFee: number, orderId: string) {
    const platformShare = deliveryFee - helperShare;
    const txs = this.walletTransactions.get(helperId) || [];
    const newTx: WalletTransaction = {
      id: `tx-${Date.now()}`,
      userId: helperId,
      amount: platformShare,
      type: 'EARNING',
      orderId: orderId,
      description: `Order #${orderId} completed (Commission ${100 - this.pricingSettings.helperCommissionPercent}% due: ৳${platformShare})`,
      createdAt: new Date().toISOString(),
    };
    txs.unshift(newTx);
    this.walletTransactions.set(helperId, txs);

    const wallet = this.getHelperWallet(helperId);
    this.wallets.set(helperId, wallet);
    this.notify();

    try {
      await setDoc(doc(db, 'wallets', helperId), cleanForFirestore(wallet), { merge: true });
      await setDoc(doc(db, 'walletTransactions', newTx.id), cleanForFirestore(newTx));
    } catch (e: any) {
      console.warn('[Firestore] creditHelperEarning note (saved locally):', e?.message || e);
    }
  }

  public async recordHelperPayback(helperId: string, amount: number, note: string) {
    const txs = this.walletTransactions.get(helperId) || [];
    const newTx: WalletTransaction = {
      id: `tx-${Date.now()}`,
      userId: helperId,
      amount: -amount,
      type: 'PAYBACK',
      description: `Paid back commission to platform: ৳${amount} (${note})`,
      createdAt: new Date().toISOString(),
    };
    txs.unshift(newTx);
    this.walletTransactions.set(helperId, txs);

    const user = this.users.get(helperId);
    const helperName = user?.displayName || 'Helper';
    const req: WithdrawalRequest = {
      id: `wd-manual-${Date.now()}`,
      helperId,
      helperName,
      amount,
      status: 'APPROVED',
      paymentMethod: 'Manual Record',
      accountNumber: note,
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };
    this.withdrawals.set(req.id, req);

    const wallet = this.getHelperWallet(helperId);
    this.wallets.set(helperId, wallet);
    this.notify();

    try {
      await setDoc(doc(db, 'wallets', helperId), cleanForFirestore(wallet), { merge: true });
      await setDoc(doc(db, 'walletTransactions', newTx.id), cleanForFirestore(newTx));
      await setDoc(doc(db, 'withdrawals', req.id), cleanForFirestore(req));
    } catch (e: any) {
      console.warn('[Firestore] recordHelperPayback note (saved locally):', e?.message || e);
    }
  }

  public async submitWithdrawalRequest(
    helperId: string,
    helperName: string,
    amount: number,
    paymentMethod: string,
    accountNumber: string
  ) {
    const req: WithdrawalRequest = {
      id: `wd-${Date.now()}`,
      helperId,
      helperName,
      amount,
      status: 'PENDING',
      paymentMethod,
      accountNumber,
      createdAt: new Date().toISOString(),
    };
    this.withdrawals.set(req.id, req);
    this.notify();

    try {
      await setDoc(doc(db, 'withdrawals', req.id), cleanForFirestore(req));
    } catch (e: any) {
      console.warn('[Firestore] submitWithdrawal note (saved locally):', e?.message || e);
    }
    return req;
  }

  public async approveWithdrawal(withdrawalId: string) {
    const req = this.withdrawals.get(withdrawalId);
    if (!req || req.status !== 'PENDING') return;
    req.status = 'APPROVED';
    req.processedAt = new Date().toISOString();
    this.withdrawals.set(withdrawalId, req);

    const txs = this.walletTransactions.get(req.helperId) || [];
    const newTx: WalletTransaction = {
      id: `tx-${Date.now()}`,
      userId: req.helperId,
      amount: -req.amount,
      type: 'PAYBACK',
      description: `Commission payback approved (#${req.id})`,
      createdAt: new Date().toISOString(),
    };
    txs.unshift(newTx);
    this.walletTransactions.set(req.helperId, txs);

    const wallet = this.getHelperWallet(req.helperId);
    this.wallets.set(req.helperId, wallet);
    this.notify();

    try {
      await setDoc(doc(db, 'wallets', req.helperId), cleanForFirestore(wallet), { merge: true });
      await setDoc(doc(db, 'walletTransactions', newTx.id), cleanForFirestore(newTx));
      await setDoc(doc(db, 'withdrawals', withdrawalId), cleanForFirestore(req), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] approveWithdrawal note (saved locally):', e?.message || e);
    }
  }

  public async rejectWithdrawal(withdrawalId: string) {
    const req = this.withdrawals.get(withdrawalId);
    if (!req || req.status !== 'PENDING') return;
    req.status = 'REJECTED';
    req.processedAt = new Date().toISOString();
    this.withdrawals.set(withdrawalId, req);
    this.notify();

    try {
      await setDoc(doc(db, 'withdrawals', withdrawalId), cleanForFirestore(req), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] rejectWithdrawal note (saved locally):', e?.message || e);
    }
  }

  public async submitHelperApp(app: HelperApplication) {
    this.helperApplications.set(app.id, app);
    this.notify();

    try {
      await setDoc(doc(db, 'helperApplications', app.id), cleanForFirestore(app));
    } catch (e: any) {
      console.warn('[Firestore] submitHelperApp note (saved locally):', e?.message || e);
    }
  }

  public migrateUserUid(oldUid: string, newUid: string) {
    if (!oldUid || !newUid || oldUid === newUid) return;

    // 1. Migrate user profile key if exists under oldUid
    const oldUser = this.users.get(oldUid);
    if (oldUser) {
      this.users.delete(oldUid);
      const updatedUser = { ...oldUser, uid: newUid };
      this.users.set(newUid, updatedUser);
      this.saveUser(updatedUser);
    }

    // 2. Orders
    this.orders.forEach((o) => {
      let changed = false;
      if (o.customerId === oldUid) { o.customerId = newUid; changed = true; }
      if (o.helperId === oldUid) { o.helperId = newUid; changed = true; }
      if (changed) {
        this.orders.set(o.id, o);
        try { setDoc(doc(db, 'orders', o.id), cleanForFirestore(o), { merge: true }); } catch (_) {}
      }
    });

    // 3. Helper Applications
    this.helperApplications.forEach((app) => {
      if (app.userId === oldUid) {
        app.userId = newUid;
        this.helperApplications.set(app.id, app);
        try { setDoc(doc(db, 'helperApplications', app.id), cleanForFirestore(app), { merge: true }); } catch (_) {}
      }
    });

    // 3b. Store Applications
    this.storeApplications.forEach((app) => {
      if (app.userId === oldUid) {
        app.userId = newUid;
        this.storeApplications.set(app.id, app);
        try { setDoc(doc(db, 'storeApplications', app.id), cleanForFirestore(app), { merge: true }); } catch (_) {}
      }
    });

    // 4. Wallets
    const oldWallet = this.wallets.get(oldUid);
    if (oldWallet) {
      this.wallets.delete(oldUid);
      const updatedWallet = { ...oldWallet, userId: newUid };
      this.wallets.set(newUid, updatedWallet);
      try { setDoc(doc(db, 'wallets', newUid), cleanForFirestore(updatedWallet)); } catch (_) {}
    }

    // 5. Wallet Transactions
    const oldTxs = this.walletTransactions.get(oldUid);
    if (oldTxs) {
      this.walletTransactions.delete(oldUid);
      const updatedTxs = oldTxs.map((tx) => ({ ...tx, userId: newUid }));
      this.walletTransactions.set(newUid, updatedTxs);
      updatedTxs.forEach((tx) => {
        try { setDoc(doc(db, 'walletTransactions', tx.id), cleanForFirestore(tx), { merge: true }); } catch (_) {}
      });
    }

    // 6. Withdrawals
    this.withdrawals.forEach((w) => {
      if (w.helperId === oldUid) {
        w.helperId = newUid;
        this.withdrawals.set(w.id, w);
        try { setDoc(doc(db, 'withdrawals', w.id), cleanForFirestore(w), { merge: true }); } catch (_) {}
      }
    });

    // 7. Notifications
    const oldNotifs = this.notifications.get(oldUid);
    if (oldNotifs) {
      this.notifications.delete(oldUid);
      const updatedNotifs = oldNotifs.map((n) => ({ ...n, userId: newUid }));
      this.notifications.set(newUid, updatedNotifs);
    }

    // 8. Order Feedbacks
    this.orderFeedbacks.forEach((fb) => {
      let changed = false;
      if (fb.customerId === oldUid) { fb.customerId = newUid; changed = true; }
      if (fb.helperId === oldUid) { fb.helperId = newUid; changed = true; }
      if (changed) {
        this.orderFeedbacks.set(fb.id, fb);
        try { setDoc(doc(db, 'orderFeedbacks', fb.id), cleanForFirestore(fb), { merge: true }); } catch (_) {}
      }
    });

    this.notify();
  }

  public async approveHelperApp(appId: string) {
    const app = this.helperApplications.get(appId);
    if (!app) return;
    app.status = 'APPROVED';
    this.helperApplications.set(appId, app);

    const user = this.users.get(app.userId);
    if (user) {
      const isDedicated = app.applicationType === 'dedicated' || !app.applicationType;
      const updatedUser: UserProfile = {
        ...user,
        isHelper: true,
        helperType: isDedicated ? 'dedicated' : (user.helperType || 'commuter'),
        alternativePhone: app.whatsapp || user.alternativePhone,
      };
      this.users.set(app.userId, updatedUser);
      await this.saveUser(updatedUser);
    }
    this.notify();

    try {
      await setDoc(doc(db, 'helperApplications', appId), cleanForFirestore(app), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] approveHelperApp note (saved locally):', e?.message || e);
    }
  }

  public async removeHelperEligibility(uid: string) {
    const existing = this.users.get(uid);
    if (!existing) return;
    const updated: UserProfile = {
      ...existing,
      isHelper: false,
      role: existing.isAdmin ? 'admin' : 'customer',
      lastActiveMode: existing.lastActiveMode === 'helper' ? 'customer' : existing.lastActiveMode,
    };
    this.users.set(uid, updated);

    const app = Array.from(this.helperApplications.values()).find((a) => a.userId === uid);
    if (app) {
      app.status = 'REJECTED';
      this.helperApplications.set(app.id, app);
      try {
        await setDoc(doc(db, 'helperApplications', app.id), cleanForFirestore(app), { merge: true });
      } catch (e) {
        console.warn(e);
      }
    }

    this.notify();
    try {
      await setDoc(doc(db, 'users', uid), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] removeHelperEligibility note (stored locally):', e?.message || e);
    }
  }

  public doesUserMatchSegment(u: UserProfile, segName: string): boolean {
    const userOrders = Array.from(this.orders.values()).filter((o) => o.customerId === u.uid);
    const orderCount = userOrders.length;
    const lastOrder = orderCount > 0 
      ? [...userOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] 
      : null;
    const daysSinceLastOrder = lastOrder 
      ? Math.floor((Date.now() - new Date(lastOrder.createdAt).getTime()) / (24 * 3600 * 1000)) 
      : null;

    const userCreatedTime = u.createdAt ? new Date(u.createdAt).getTime() : (orderCount > 0 ? new Date(userOrders[orderCount - 1].createdAt).getTime() : Date.now());
    const weeksElapsed = Math.max(1, (Date.now() - userCreatedTime) / (7 * 24 * 3600 * 1000));
    const weeklyOrderRate = orderCount / weeksElapsed;
    const monthlyOrderRate = orderCount / (weeksElapsed / 4.33);

    if (segName === 'MULTIPLE_ORDERS') return orderCount >= 2;
    if (segName === 'WEEKLY_2_ORDERS') return weeklyOrderRate >= 2;
    if (segName === 'WEEKLY_1_ORDERS') return weeklyOrderRate >= 1;
    if (segName === 'RARE_ORDERS_WEEK') return orderCount > 0 && weeklyOrderRate < 1;
    if (segName === 'RARE_ORDERS_MONTH') return orderCount > 0 && monthlyOrderRate < 1;
    if (segName === 'INACTIVE_1_WEEK') return orderCount > 0 && daysSinceLastOrder !== null && daysSinceLastOrder >= 7;
    if (segName === 'INACTIVE_2_WEEKS') return orderCount > 0 && daysSinceLastOrder !== null && daysSinceLastOrder >= 14;
    if (segName === 'NEVER_ORDERED') return orderCount === 0;
    if (segName === 'NEW_REGISTERED') {
      const registeredDaysAgo = Math.floor((Date.now() - userCreatedTime) / (24 * 3600 * 1000));
      return registeredDaysAgo <= 7;
    }
    return false;
  }

  public async addNotification(notif: AppNotification) {
    const target = notif.userId;
    const radiusKm = this.pricingSettings.helperRadiusKm || 3.5;
    const targetOrder = notif.orderId ? this.orders.get(notif.orderId) : undefined;

    if (target === 'all-helpers') {
      this.users.forEach((u) => {
        if (u.isHelper) {
          if (targetOrder && !isHelperWithinOrderRadius(u.helperLocation, targetOrder, radiusKm)) {
            return;
          }
          const userList = this.notifications.get(u.uid) || [];
          userList.unshift({ ...notif, userId: u.uid });
          this.notifications.set(u.uid, userList);
        }
      });
    } else if (target === 'all-commuter-helpers') {
      this.users.forEach((u) => {
        if (u.isHelper && u.helperType !== 'dedicated') {
          if (targetOrder && !isHelperWithinOrderRadius(u.helperLocation, targetOrder, radiusKm)) {
            return;
          }
          const userList = this.notifications.get(u.uid) || [];
          userList.unshift({ ...notif, userId: u.uid });
          this.notifications.set(u.uid, userList);
        }
      });
    } else if (target === 'all-dedicated-helpers') {
      this.users.forEach((u) => {
        if (u.isHelper && u.helperType === 'dedicated') {
          if (targetOrder && !isHelperWithinOrderRadius(u.helperLocation, targetOrder, radiusKm)) {
            return;
          }
          const userList = this.notifications.get(u.uid) || [];
          userList.unshift({ ...notif, userId: u.uid });
          this.notifications.set(u.uid, userList);
        }
      });
    } else if (target === 'all-customers') {
      this.users.forEach((u) => {
        if (!u.isHelper || u.role === 'customer') {
          const userList = this.notifications.get(u.uid) || [];
          userList.unshift({ ...notif, userId: u.uid });
          this.notifications.set(u.uid, userList);
        }
      });
    } else if (target.startsWith('segment:')) {
      const segName = target.replace('segment:', '');
      this.users.forEach((u) => {
        if (this.doesUserMatchSegment(u, segName)) {
          const userList = this.notifications.get(u.uid) || [];
          userList.unshift({ ...notif, userId: u.uid });
          this.notifications.set(u.uid, userList);
        }
      });
    } else if (target === 'all') {
      this.users.forEach((u) => {
        const userList = this.notifications.get(u.uid) || [];
        userList.unshift({ ...notif, userId: u.uid });
        this.notifications.set(u.uid, userList);
      });
    } else {
      const list = this.notifications.get(notif.userId) || [];
      list.unshift(notif);
      this.notifications.set(notif.userId, list);
    }

    this.notify();

    // In-app feedback: sound + vibration on the device that created the notification.
    // (Useful for admin creating notifications while the app is open.)
    playNotificationSound();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate([200, 100, 200, 100, 200]); } catch (_) { /* ignore */ }
    }

    // NOTE: We no longer fire reg.showNotification() here because that would
    // only show a popup on the device that CREATED the notification (wrong device).
    // Instead, each target device fires its own popup via two channels:
    //   1. Foreground: Firestore onSnapshot → triggerBrowserNotification()
    //   2. Background/Closed: FCM push → SW onBackgroundMessage → showNotification()

    try {
      await setDoc(doc(db, 'notifications', notif.id), cleanForFirestore(notif));
    } catch (e: any) {
      console.warn('[Firestore] addNotification note (saved locally):', e?.message || e);
    }

    // ─── FCM Push Fan-out ─────────────────────────────────────────────────────
    // Collect FCM tokens of all target users and send a background push.
    // This ensures delivery even when the target device has the app closed.
    try {
      const targetTokens: string[] = [];
      const allUsers = Array.from(this.users.values());
      const t = notif.userId;

      if (t === 'all-helpers') {
        allUsers.forEach((u) => { if (u.isHelper && u.fcmToken) targetTokens.push(u.fcmToken); });
      } else if (t === 'all-customers') {
        allUsers.forEach((u) => { if (!u.isHelper && u.role !== 'admin' && u.fcmToken) targetTokens.push(u.fcmToken); });
      } else if (t === 'all') {
        allUsers.forEach((u) => { if (u.fcmToken) targetTokens.push(u.fcmToken); });
      } else if (t.startsWith('segment:')) {
        const segName = t.replace('segment:', '');
        allUsers.forEach((u) => {
          if (u.fcmToken && this.doesUserMatchSegment(u, segName)) {
            targetTokens.push(u.fcmToken);
          }
        });
      } else {
        const targetUser = this.users.get(t);
        if (targetUser?.fcmToken) targetTokens.push(targetUser.fcmToken);
      }

      if (targetTokens.length > 0) {
        // sendFcmPushToTokens is a no-op unless NEXT_PUBLIC_FCM_SERVER_KEY is set.
        // FCM background messages still work via SW onBackgroundMessage without it.
        const targetUrl = notif.orderId ? `/?orderId=${notif.orderId}` : '/';
        sendFcmPushToTokens(targetTokens, notif.title, notif.body || '', notif.id, targetUrl, notif.imageUrl);
      }
    } catch (e: any) {
      console.warn('[FCM] Push fan-out note:', e?.message || e);
    }
  }

  public async sendAdminPushNotification(
    targetAudience: 'helpers' | 'customers' | 'all' | string,
    title: string,
    body: string,
    orderId?: string,
    imageUrl?: string,
    scheduledAt?: string,
    repeatFrequency?: 'NONE' | 'DAILY' | 'WEEKLY',
    repeatTime?: string
  ) {
    const notifId = `admin-notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let mappedAudience = targetAudience;
    if (targetAudience === 'helpers') mappedAudience = 'all-helpers';
    if (targetAudience === 'customers') mappedAudience = 'all-customers';

    const isFutureScheduled = scheduledAt ? new Date(scheduledAt).getTime() > Date.now() : false;

    const notif: AppNotification = {
      id: notifId,
      userId: mappedAudience,
      title: title,
      body: body,
      orderId: orderId,
      read: false,
      createdAt: new Date().toISOString(),
      imageUrl: imageUrl,
      scheduledAt: scheduledAt,
      isScheduled: isFutureScheduled || (repeatFrequency && repeatFrequency !== 'NONE'),
      repeatFrequency: repeatFrequency || 'NONE',
      repeatTime: repeatTime,
    };

    if (isFutureScheduled || (repeatFrequency && repeatFrequency !== 'NONE')) {
      this.scheduledNotifications.set(notif.id, notif);
      this.notify();
      this.saveLocalStore();
      try {
        await setDoc(doc(db, 'scheduledNotifications', notif.id), cleanForFirestore(notif));
      } catch (e) {
        console.warn('[Firestore] saveScheduledNotification note:', e);
      }
    } else {
      await this.addNotification(notif);
    }
    return notif;
  }

  public async markNotificationsRead(userId: string) {
    const list = this.notifications.get(userId) || [];
    // Only process actually unread items to avoid unnecessary Firestore writes
    const unread = list.filter((n) => !n.read);
    if (unread.length === 0) return;
    const updated = list.map((n) => ({ ...n, read: true }));
    this.notifications.set(userId, updated);
    this.notify();

    try {
      // Write only the ones that changed (unread → read) using writeBatch to save write requests
      const batch = writeBatch(db);
      for (const n of unread) {
        batch.set(doc(db, 'notifications', n.id), { read: true }, { merge: true });
      }
      await batch.commit();
    } catch (e: any) {
      console.warn('[Firestore] markNotificationsRead note (saved locally):', e?.message || e);
    }
  }

  public async savePricingSettings(settings: PricingSettings) {
    this.pricingSettings = settings;
    this.notify();
    try {
      await setDoc(doc(db, 'settings', 'pricing'), cleanForFirestore(settings), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] savePricingSettings note (saved locally):', e?.message || e);
    }
  }

  public async addHelperAppAdmin(app: HelperApplication) {
    this.helperApplications.set(app.id, app);
    if (app.status === 'APPROVED') {
      const user = this.users.get(app.userId);
      if (user) {
        const isDedicated = app.applicationType === 'dedicated' || !app.applicationType;
        const updatedUser: UserProfile = {
          ...user,
          isHelper: true,
          helperType: isDedicated ? 'dedicated' : (user.helperType || 'commuter'),
          alternativePhone: app.whatsapp || user.alternativePhone,
        };
        this.users.set(app.userId, updatedUser);
        await this.saveUser(updatedUser);
      }
    }
    this.notify();
    try {
      await setDoc(doc(db, 'helperApplications', app.id), cleanForFirestore(app));
    } catch (e: any) {
      console.warn('[Firestore] addHelperAppAdmin note (saved locally):', e?.message || e);
    }
  }

  public async updateHelperApp(appId: string, updatedFields: Partial<HelperApplication>) {
    const existing = this.helperApplications.get(appId);
    if (!existing) return;
    const updated = { ...existing, ...updatedFields };
    this.helperApplications.set(appId, updated);

    if (updated.status === 'APPROVED' && existing.status !== 'APPROVED') {
      const user = this.users.get(updated.userId);
      if (user) {
        const isDedicated = updated.applicationType === 'dedicated' || !updated.applicationType;
        const updatedUser: UserProfile = {
          ...user,
          isHelper: true,
          helperType: isDedicated ? 'dedicated' : (user.helperType || 'commuter'),
          alternativePhone: updated.whatsapp || user.alternativePhone,
        };
        this.users.set(updated.userId, updatedUser);
        await this.saveUser(updatedUser);
      }
    } else if (updated.status !== 'APPROVED' && existing.status === 'APPROVED') {
      const user = this.users.get(updated.userId);
      if (user) {
        const updatedUser = {
          ...user,
          isHelper: false,
        };
        this.users.set(updated.userId, updatedUser);
        await this.saveUser(updatedUser);
      }
    }

    this.notify();
    try {
      await setDoc(doc(db, 'helperApplications', appId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] updateHelperApp note (saved locally):', e?.message || e);
    }
  }

  public async deleteHelperApp(appId: string) {
    const existing = this.helperApplications.get(appId);
    if (existing && existing.status === 'APPROVED') {
      const user = this.users.get(existing.userId);
      if (user) {
        const updatedUser = {
          ...user,
          isHelper: false,
        };
        this.users.set(existing.userId, updatedUser);
        await this.saveUser(updatedUser);
      }
    }
    this.helperApplications.delete(appId);
    this.notify();
    try {
      await deleteDoc(doc(db, 'helperApplications', appId));
    } catch (e: any) {
      console.warn('[Firestore] deleteHelperApp note (saved locally):', e?.message || e);
    }
  }

  public async cancelHelperApp(appId: string) {
    const existing = this.helperApplications.get(appId);
    if (!existing) return;
    const updated: HelperApplication = {
      ...existing,
      status: 'CANCELED',
    };
    this.helperApplications.set(appId, updated);
    this.notify();
    try {
      await setDoc(doc(db, 'helperApplications', appId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] cancelHelperApp note (saved locally):', e?.message || e);
    }
  }

  public async saveShop(shop: Shop) {
    this.shops.set(shop.id, shop);
    this.notify();
    try {
      await setDoc(doc(db, 'shops', shop.id), cleanForFirestore(shop), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] saveShop note (saved locally):', e?.message || e);
    }
  }

  public async deleteShop(shopId: string) {
    this.shops.delete(shopId);
    this.notify();
    try {
      await deleteDoc(doc(db, 'shops', shopId));
    } catch (e: any) {
      console.warn('[Firestore] deleteShop note (saved locally):', e?.message || e);
    }
  }

  public async submitOrderFeedback(feedback: OrderFeedback) {
    this.orderFeedbacks.set(feedback.id, feedback);
    const ord = this.orders.get(feedback.orderId);
    if (ord) {
      ord.feedback = feedback;
      this.orders.set(ord.id, ord);
      try {
        await setDoc(doc(db, 'orders', ord.id), cleanForFirestore(ord), { merge: true });
      } catch (e) {
        console.warn(e);
      }
    }
    this.notify();
    try {
      await setDoc(doc(db, 'orderFeedbacks', feedback.id), cleanForFirestore(feedback));
    } catch (e: any) {
      console.warn('[Firestore] submitOrderFeedback note (saved locally):', e?.message || e);
    }
  }

  public async saveCustomModal(config: AdminCustomModalConfig) {
    this.customModals.set(config.id, config);
    this.notify();
    try {
      await setDoc(doc(db, 'customModals', config.id), cleanForFirestore(config), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] saveCustomModal note (saved locally):', e?.message || e);
    }
  }

  public async deleteCustomModal(modalId: string) {
    this.customModals.delete(modalId);
    this.notify();
    try {
      await deleteDoc(doc(db, 'customModals', modalId));
    } catch (e: any) {
      console.warn('[Firestore] deleteCustomModal note (saved locally):', e?.message || e);
    }
  }

  public async addFeeSuggestion(suggestion: FeeSuggestion) {
    this.feeSuggestions.set(suggestion.id, suggestion);
    this.notify();
    try {
      await setDoc(doc(db, 'feeSuggestions', suggestion.id), cleanForFirestore(suggestion));
    } catch (e: any) {
      console.warn('[Firestore] addFeeSuggestion note (saved locally):', e?.message || e);
    }
  }

  public async deleteFeeSuggestion(id: string) {
    this.feeSuggestions.delete(id);
    this.notify();
    try {
      await deleteDoc(doc(db, 'feeSuggestions', id));
    } catch (e: any) {
      console.warn('[Firestore] deleteFeeSuggestion note (saved locally):', e?.message || e);
    }
  }
  // ─── Store Application CRUD ───────────────────────────────────────────────

  public async submitStoreApp(app: StoreApplication) {
    this.storeApplications.set(app.id, app);
    this.notify();
    try {
      await setDoc(doc(db, 'storeApplications', app.id), cleanForFirestore(app));
    } catch (e: any) {
      console.warn('[Firestore] submitStoreApp note (saved locally):', e?.message || e);
    }
  }

  public async updateStoreApp(appId: string, updatedFields: Partial<StoreApplication>) {
    const existing = this.storeApplications.get(appId);
    if (!existing) return;
    const updated = { ...existing, ...updatedFields };
    this.storeApplications.set(appId, updated);
    this.notify();
    try {
      await setDoc(doc(db, 'storeApplications', appId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] updateStoreApp note (saved locally):', e?.message || e);
    }
  }

  public async cancelStoreApp(appId: string) {
    const existing = this.storeApplications.get(appId);
    if (!existing) return;
    const updated: StoreApplication = { ...existing, status: 'CANCELED' };
    this.storeApplications.set(appId, updated);
    this.notify();
    try {
      await setDoc(doc(db, 'storeApplications', appId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] cancelStoreApp note (saved locally):', e?.message || e);
    }
  }

  public async approveStoreApp(appId: string, reviewNote?: string) {
    const existing = this.storeApplications.get(appId);
    if (!existing) return;
    const updated: StoreApplication = {
      ...existing,
      status: 'APPROVED',
      reviewedAt: new Date().toISOString(),
      reviewNote: reviewNote || '',
    };
    this.storeApplications.set(appId, updated);

    // Create / update Shop document so this store appears in the helpers' shop list
    const shopId = `store-${existing.userId}`;
    const shop: Shop = {
      id: shopId,
      name: existing.storeName,
      type: existing.storeType,
      description: existing.storeDescription,
      contactPerson: existing.ownerName,
      whatsapp: existing.ownerWhatsapp,
      managerName: existing.managerName,
      managerWhatsapp: existing.managerWhatsapp,
      location: existing.location,
      addedByHelperId: existing.userId,
      addedByHelperName: existing.userName,
      ownerUserId: existing.userId,
      ownerUserEmail: existing.userEmail,
      applicationId: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      commissionPercent: existing.commissionPercent,
    };
    this.shops.set(shopId, shop);

    // Update user profile: mark as approved store
    const user = this.users.get(existing.userId);
    if (user) {
      const updatedUser: UserProfile = {
        ...user,
        isStore: true,
        isStoreApproved: true,
        storeId: shopId,
        lastActiveMode: 'store',
      };
      this.users.set(existing.userId, updatedUser);
      try { await this.saveUser(updatedUser); } catch (_) {}
    }

    // Notify store owner that application was approved (Requirement 4)
    this.addNotification({
      id: `notif-store-approve-${Date.now()}`,
      userId: existing.userId,
      title: 'আপনার স্টোর অ্যাপ্লিকেশন অনুমোদন করা হয়েছে!',
      body: `অভিনন্দন! আপনার স্টোর "${existing.storeName}" এডমিন দ্বারা অনুমোদিত হয়েছে। এখন আপনি অর্ডার পেতে পারেন।`,
      read: false,
      createdAt: new Date().toISOString(),
    });

    this.notify();
    try {
      await setDoc(doc(db, 'storeApplications', appId), cleanForFirestore(updated), { merge: true });
      await setDoc(doc(db, 'shops', shopId), cleanForFirestore(shop), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] approveStoreApp note (saved locally):', e?.message || e);
    }
  }

  public async rejectStoreApp(appId: string, reviewNote?: string) {
    const existing = this.storeApplications.get(appId);
    if (!existing) return;
    const updated: StoreApplication = {
      ...existing,
      status: 'REJECTED',
      reviewedAt: new Date().toISOString(),
      reviewNote: reviewNote || '',
    };
    this.storeApplications.set(appId, updated);

    // Notify store owner that application was rejected (Requirement 4)
    this.addNotification({
      id: `notif-store-reject-${Date.now()}`,
      userId: existing.userId,
      title: 'আপনার স্টোর অ্যাপ্লিকেশন বাতিল করা হয়েছে',
      body: `দুঃখিত, আপনার স্টোর "${existing.storeName}" এর অ্যাপ্লিকেশনটি বাতিল করা হয়েছে। ${reviewNote ? 'কারণ: ' + reviewNote : ''}`,
      read: false,
      createdAt: new Date().toISOString(),
    });

    this.notify();
    try {
      await setDoc(doc(db, 'storeApplications', appId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] rejectStoreApp note (saved locally):', e?.message || e);
    }
  }

  public async deleteStoreApp(appId: string) {
    const existing = this.storeApplications.get(appId);
    // If the app was APPROVED, revoke user's store flags and remove the linked shop
    if (existing && existing.status === 'APPROVED') {
      const shopId = `store-${existing.userId}`;
      this.shops.delete(shopId);
      try { await deleteDoc(doc(db, 'shops', shopId)); } catch (_) {}

      const user = this.users.get(existing.userId);
      if (user) {
        const updatedUser: UserProfile = {
          ...user,
          isStore: false,
          isStoreApproved: false,
          storeId: undefined,
        };
        this.users.set(existing.userId, updatedUser);
        try { await this.saveUser(updatedUser); } catch (_) {}
      }
    }
    this.storeApplications.delete(appId);
    this.notify();
    try {
      await deleteDoc(doc(db, 'storeApplications', appId));
    } catch (e: any) {
      console.warn('[Firestore] deleteStoreApp note (saved locally):', e?.message || e);
    }
  }

  public async blockStoreUser(userId: string, reason: string) {
    const user = this.users.get(userId);
    if (!user) return;
    const updatedUser: UserProfile = {
      ...user,
      isBlocked: true,
      blockedReason: reason,
      isStore: false,
      isStoreApproved: false,
    };
    this.users.set(userId, updatedUser);
    this.notify();
    try { await this.saveUser(updatedUser); } catch (_) {}
  }

  public async getAllOrders(): Promise<Order[]> {
    try {
      const snap = await getDocs(collection(db, 'orders'));
      const list: Order[] = [];
      snap.forEach((docSnap) => {
        list.push(docSnap.data() as Order);
      });
      return list;
    } catch (e) {
      console.warn('[Firestore] getAllOrders error:', e);
      return Array.from(this.orders.values());
    }
  }
}

export const fallbackStore = new FallbackStore();

export function playNotificationSound() {
  if (typeof window === 'undefined') return;
  // Fix 3: Use the shared AudioContext instead of creating a new one each time.
  // Creating a new AudioContext on every sound call exhausts the browser's context
  // limit (~6) and is a known source of memory leaks on mobile.
  try {
    const ctx = getSharedAudioCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Friendly 2-tone chime: E5 (659.25Hz) -> A5 (880Hz)
    osc.frequency.setValueAtTime(659.25, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // Ignore audio context block
  }
}

export async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  try {
    let res: string = Notification.permission;
    const req = Notification.requestPermission((permission) => {
      res = permission;
    });
    if (req && typeof (req as any).then === 'function') {
      res = await req;
    }
    return (Notification.permission as string) === 'granted' || res === 'granted';
  } catch (err) {
    console.warn('[Notification] requestPermission note:', err);
    return false;
  }
}


