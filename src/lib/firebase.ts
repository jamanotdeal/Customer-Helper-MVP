import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
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
  increment,
  deleteField,
  documentId,
  startAfter,
  runTransaction,
} from 'firebase/firestore';
import type { Query, QuerySnapshot, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
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
  RewardPrize,
  RewardClaim,
  CoinTransaction,
  ServerAddress,
  LocationData,
} from '@/types';
import { DEFAULT_PRICING_SETTINGS, calculateHelperCommission, isHelperWithinOrderRadius, getCoinsForService } from './pricing';
import { isHelperEligibleForOrder } from './geofenceUtils';

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

if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('[Firebase] Persistence init note:', err?.message);
  });
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
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
        const body = payload.notification?.body || payload.data?.body || '';
        const id = payload.data?.tag || `fcm-fg-${Date.now()}`;
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
 * Removes this device's FCM token from the user's Firestore profile on logout
 * so notifications are not delivered to subsequent users on the same device.
 */
export async function removeFcmToken(userId: string): Promise<void> {
  try {
    await setDoc(doc(db, 'users', userId), { fcmToken: '' }, { merge: true });
    const existing = fallbackStore.users.get(userId);
    if (existing) {
      const updated = { ...existing, fcmToken: undefined };
      fallbackStore.users.set(userId, updated);
    }
  } catch (e: any) {
    console.warn('[FCM] removeFcmToken note:', e?.message || e);
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

export async function loadCustomerSavedPickupData(uid: string): Promise<{ addresses: import('@/types').LocationData[]; serviceLocations: Record<string, import('@/types').LocationData> }> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const data = snap.data();
      const addresses = Array.isArray(data?.savedPickupAddresses) ? (data.savedPickupAddresses as import('@/types').LocationData[]) : [];
      const serviceLocations = (data?.servicePickupLocations && typeof data.servicePickupLocations === 'object')
        ? (data.servicePickupLocations as Record<string, import('@/types').LocationData>)
        : {};
      return { addresses, serviceLocations };
    }
  } catch (e: any) {
    console.warn('[Firestore] loadCustomerSavedPickupData note:', e?.message || e);
  }
  return { addresses: [], serviceLocations: {} };
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
 * Saves a pickup address to the customer's Firestore profile.
 * Adds to savedPickupAddresses and optionally sets the servicePickupLocations entry.
 */
export async function saveCustomerPickupAddressToFirestore(uid: string, address: import('@/types').LocationData, service?: string): Promise<void> {
  if (!uid || !address?.address) return;
  try {
    const updatePayload: Record<string, any> = {
      savedPickupAddresses: arrayUnion(cleanForFirestore(address)),
    };
    if (service && service.trim()) {
      const svcKey = service.trim().toLowerCase().replace(/\s+/g, '_');
      updatePayload[`servicePickupLocations.${svcKey}`] = cleanForFirestore(address);
    }
    await setDoc(
      doc(db, 'users', uid),
      updatePayload,
      { merge: true }
    );
  } catch (e: any) {
    console.warn('[Firestore] saveCustomerPickupAddressToFirestore note:', e?.message || e);
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
export function cleanForFirestore<T>(data: T): T {
  if (data === undefined || data === null) return data;
  return JSON.parse(JSON.stringify(data));
}

/**
 * The top-level fields in which `after` differs from `before`, as an updateDoc
 * payload: a changed field carries its new value, a field `after` no longer
 * has is deleted.
 *
 * Order writes send only this. They used to send the device's whole copy of
 * the order, so a copy that had fallen behind (the app was in the background,
 * the network was slow) put every field back to what that device last saw —
 * including the status, which is how an order a helper had just accepted went
 * back to PENDING, or to another helper, from someone else's phone.
 */
function changedFields<T extends object>(before: T, after: T): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).forEach((key) => {
    if (b[key] === undefined) {
      if (a[key] !== undefined) patch[key] = deleteField();
    } else if (a[key] === undefined || JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      patch[key] = cleanForFirestore(b[key]);
    }
  });
  return patch;
}

/** Statuses of an order a helper is currently running. */
const RUNNING_ORDER_STATUSES = ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED'];

/** What became of an order write — see FallbackStore.updateOrder. */
export type OrderWriteOutcome = 'saved' | 'queued' | 'unchanged' | 'conflict' | 'missing' | 'failed';

/** Whether an order was read, is confirmed gone, or could not be checked. */
export type OrderFetchResult =
  | { state: 'found'; order: Order }
  | { state: 'missing' }
  | { state: 'unreachable' };

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
      _sharedAudioCtx.resume().catch(() => { });
    }
    return _sharedAudioCtx;
  } catch (_) {
    return null;
  }
}

/**
 * Most recent orders kept in the localStorage cache. The cache only has to make
 * a cold start look warm; the listeners refill everything else within a second.
 * Writing every order this device had ever seen made each save and each launch
 * slower as an account's history grew.
 */
const MAX_CACHED_ORDERS = 200;

let lastMapVersion = 0;

/**
 * A Map that records when it last changed. Every subscriber is woken by every
 * notify(), so without this a notification or wallet snapshot made each screen
 * re-copy and re-render its whole order list. Comparing versions lets them skip
 * the work when their collection is untouched.
 *
 * Versions come from one counter shared by every map, so a replacement map is
 * always newer than the one it replaced.
 */
class VersionedMap<K, V> extends Map<K, V> {
  // Assigned in the methods rather than initialised here: Map's constructor
  // calls set() before subclass fields exist.
  version?: number;

  set(key: K, value: V): this {
    super.set(key, value);
    this.version = ++lastMapVersion;
    return this;
  }

  delete(key: K): boolean {
    const removed = super.delete(key);
    if (removed) this.version = ++lastMapVersion;
    return removed;
  }

  clear(): void {
    if (this.size > 0) this.version = ++lastMapVersion;
    super.clear();
  }

  static adopt<K, V>(source: Map<K, V>): VersionedMap<K, V> {
    const m = source instanceof VersionedMap ? source : new VersionedMap<K, V>(source);
    m.version = ++lastMapVersion;
    return m;
  }
}

/** Change version of a store collection; changes whenever its contents do. */
export function versionOf(map: Map<unknown, unknown>): number {
  return (map as VersionedMap<unknown, unknown>).version ?? 0;
}

/**
 * For store subscribers: returns a check that is true on the first call and
 * afterwards only when one of the values passed differs from the previous call.
 * Pass versionOf(...) for collections and the object itself for pricingSettings.
 */
export function createChangeGate() {
  let last: unknown[] | null = null;
  return (...current: unknown[]): boolean => {
    const prev = last;
    if (prev && prev.length === current.length && current.every((v, i) => v === prev[i])) return false;
    last = current;
    return true;
  };
}

class FallbackStore {
  private listeners: Set<Listener> = new Set();

  // Each collection sits behind an accessor so that code assigning a whole new
  // Map (the admin fetchers do) still gets a VersionedMap.
  private _users = new VersionedMap<string, UserProfile>();
  public get users(): Map<string, UserProfile> { return this._users; }
  public set users(m: Map<string, UserProfile>) { this._users = VersionedMap.adopt(m); }

  private _orders = new VersionedMap<string, Order>();
  public get orders(): Map<string, Order> { return this._orders; }
  public set orders(m: Map<string, Order>) { this._orders = VersionedMap.adopt(m); }

  private _helperApplications = new VersionedMap<string, HelperApplication>();
  public get helperApplications(): Map<string, HelperApplication> { return this._helperApplications; }
  public set helperApplications(m: Map<string, HelperApplication>) { this._helperApplications = VersionedMap.adopt(m); }

  private _storeApplications = new VersionedMap<string, StoreApplication>();
  public get storeApplications(): Map<string, StoreApplication> { return this._storeApplications; }
  public set storeApplications(m: Map<string, StoreApplication>) { this._storeApplications = VersionedMap.adopt(m); }

  private _wallets = new VersionedMap<string, Wallet>();
  public get wallets(): Map<string, Wallet> { return this._wallets; }
  public set wallets(m: Map<string, Wallet>) { this._wallets = VersionedMap.adopt(m); }

  private _walletTransactions = new VersionedMap<string, WalletTransaction[]>();
  public get walletTransactions(): Map<string, WalletTransaction[]> { return this._walletTransactions; }
  public set walletTransactions(m: Map<string, WalletTransaction[]>) { this._walletTransactions = VersionedMap.adopt(m); }

  private _withdrawals = new VersionedMap<string, WithdrawalRequest>();
  public get withdrawals(): Map<string, WithdrawalRequest> { return this._withdrawals; }
  public set withdrawals(m: Map<string, WithdrawalRequest>) { this._withdrawals = VersionedMap.adopt(m); }

  public notifications: Map<string, AppNotification[]> = new Map();

  private _adminNotificationsHistory = new VersionedMap<string, AppNotification>();
  public get adminNotificationsHistory(): Map<string, AppNotification> { return this._adminNotificationsHistory; }
  public set adminNotificationsHistory(m: Map<string, AppNotification>) { this._adminNotificationsHistory = VersionedMap.adopt(m); }

  private _shops = new VersionedMap<string, Shop>();
  public get shops(): Map<string, Shop> { return this._shops; }
  public set shops(m: Map<string, Shop>) { this._shops = VersionedMap.adopt(m); }

  private _shopOrders = new VersionedMap<string, ShopOrder>();
  public get shopOrders(): Map<string, ShopOrder> { return this._shopOrders; }
  public set shopOrders(m: Map<string, ShopOrder>) { this._shopOrders = VersionedMap.adopt(m); }

  private _orderFeedbacks = new VersionedMap<string, OrderFeedback>();
  public get orderFeedbacks(): Map<string, OrderFeedback> { return this._orderFeedbacks; }
  public set orderFeedbacks(m: Map<string, OrderFeedback>) { this._orderFeedbacks = VersionedMap.adopt(m); }

  private _customModals = new VersionedMap<string, AdminCustomModalConfig>();
  public get customModals(): Map<string, AdminCustomModalConfig> { return this._customModals; }
  public set customModals(m: Map<string, AdminCustomModalConfig>) { this._customModals = VersionedMap.adopt(m); }

  private _feeSuggestions = new VersionedMap<string, FeeSuggestion>();
  public get feeSuggestions(): Map<string, FeeSuggestion> { return this._feeSuggestions; }
  public set feeSuggestions(m: Map<string, FeeSuggestion>) { this._feeSuggestions = VersionedMap.adopt(m); }

  public scheduledNotifications: Map<string, AppNotification> = new Map();
  public rewardPrizes: Map<string, RewardPrize> = new Map();
  public rewardClaims: Map<string, RewardClaim> = new Map();
  public coinTransactions: Map<string, CoinTransaction[]> = new Map();
  public serverAddresses: Map<string, ServerAddress> = new Map();
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
  // Settles when the store is ready for a one-off read — see whenNetworkReady().
  private _networkReady: Promise<void> = Promise.resolve();

  // Order writes in flight, per order, so two changes to the same order are
  // committed one after the other — see updateOrder().
  private _orderWrites: Map<string, Promise<unknown>> = new Map();
  // Order changes made without a connection that the SDK is still holding.
  private _queuedOrderWrites: Map<string, Promise<void>> = new Map();
  private _orderWriteIssueListeners: Set<(issue: 'conflict' | 'missing', orderId: string) => void> = new Set();

  // ─── Role-Scoped Listener Management ─────────────────────────────────────
  // Stores active unsubscribe callbacks; torn down on role/user switch.
  private _unsubListeners: (() => void)[] = [];
  private _shopsCachedAt = 0;  // epoch ms when shops were last fetched
  private _modalsCachedAt = 0; // epoch ms when customModals were last fetched
  private _addressesCachedAt = 0; // epoch ms when serverAddresses were last fetched
  private _listenersRole: string | null = null; // e.g. 'helper:uid123'
  // uid the per-account collections currently belong to. Unlike _listenersRole
  // it survives teardown, so a different account signing in can be detected.
  private _dataOwnerUid: string | null = null;
  // Admin: the background read of every order, and of every user (see
  // loadAdminOrderHistory / getAllUsers). Kept for the session so switching
  // tabs or re-running a search does not download the collection again.
  private _orderHistoryPromise: Promise<void> | null = null;
  public adminOrderHistoryLoading = false;
  public adminOrderHistoryLoaded = false;
  private _allUsersPromise: Promise<void> | null = null;
  // Orders being re-read after leaving one of the admin's live queries.
  private _recheckingOrders: Set<string> = new Set();
  // Always-on pricing listener — started immediately so unauthenticated users
  // (e.g. in-app browser visitors) always see the latest admin settings.
  private _unsubPricingListener: (() => void) | null = null;

  constructor() {
    this.loadFromLocalStorage();
    // Fix 2: Pre-populate known notif IDs from sessionStorage to survive page refreshes.
    this._hydrateKnownNotifIds();
    // Start a lightweight always-on pricing listener so admin settings are
    // always live even for unauthenticated / pre-login users.
    this._startPricingListener();
    this.startRoutingTimer();
    this.startScheduledNotificationTimer();
  }

  // ─── Always-on pricing listener ───────────────────────────────────────────
  // Starts a Firestore snapshot on settings/pricing immediately so that any
  // visitor (including unauthenticated in-app browser users) sees the latest
  // admin-set values without needing to log in first.
  private _startPricingListener() {
    if (typeof window === 'undefined') return;
    try {
      const unsub = onSnapshot(
        doc(db, 'settings', 'pricing'),
        (docSnap) => {
          if (docSnap.exists()) {
            this.pricingSettings = { ...DEFAULT_PRICING_SETTINGS, ...(docSnap.data() as PricingSettings) };
            this.notify();
          }
        },
        (err) => console.warn('[Firestore] PricingSettings (global) sync note:', err)
      );
      this._unsubPricingListener = unsub;
    } catch (err) {
      console.warn('[Firestore] Could not start global pricing listener:', err);
    }
  }

  /**
   * Resolves once one-off reads and transactions can go out. The mobile build
   * cycles the Firestore connection when the app returns from the background
   * and holds them back until that is over; the website never does, so here
   * this is always ready.
   */
  public whenNetworkReady(): Promise<void> {
    return this._networkReady;
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
        isAdminPush: true,
        createdByAdmin: true,
      };
      await this.addNotification(dispatchNotif);

      // Handle recurrence
      if (notif.repeatFrequency === 'DAILY') {
        const nextDate = new Date(now + 24 * 3600 * 1000);
        notif.scheduledAt = nextDate.toISOString();
        this.scheduledNotifications.set(notif.id, notif);
        try {
          await setDoc(doc(db, 'scheduledNotifications', notif.id), cleanForFirestore(notif), { merge: true });
        } catch (_) { }
      } else if (notif.repeatFrequency === 'WEEKLY') {
        const nextDate = new Date(now + 7 * 24 * 3600 * 1000);
        notif.scheduledAt = nextDate.toISOString();
        this.scheduledNotifications.set(notif.id, notif);
        try {
          await setDoc(doc(db, 'scheduledNotifications', notif.id), cleanForFirestore(notif), { merge: true });
        } catch (_) { }
      } else {
        this.scheduledNotifications.delete(notif.id);
        try {
          await deleteDoc(doc(db, 'scheduledNotifications', notif.id));
        } catch (_) { }
      }
      this.notify();
      this.scheduleLocalStoreSave();
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
      this._dataOwnerUid = localStorage.getItem('jamanot_cache_owner') || null;

      const parsedOrders = this.safeParse<[string, Order][]>('jamanot_orders_store');
      if (parsedOrders && Array.isArray(parsedOrders)) {
        // Caches written before the cap could hold an account's whole history.
        this.cacheableOrders(parsedOrders.filter((e) => Array.isArray(e) && e[1])).forEach(([id, order]) => {
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

      const parsedScheduled = this.safeParse<[string, AppNotification][]>('jamanot_scheduled_notifs_store');
      if (parsedScheduled && Array.isArray(parsedScheduled)) {
        parsedScheduled.forEach(([id, notif]) => {
          if (id && notif) this.scheduledNotifications.set(id, notif);
        });
      }

      const parsedAdminNotifs = this.safeParse<[string, AppNotification][]>('jamanot_admin_notifs_history_store');
      if (parsedAdminNotifs && Array.isArray(parsedAdminNotifs)) {
        parsedAdminNotifs.forEach(([id, notif]) => {
          if (id && notif && (notif.isAdminPush || notif.createdByAdmin || id.startsWith('admin-notif-') || id.startsWith('notif-disp-'))) {
            this.adminNotificationsHistory.set(id, notif);
          }
        });
      }

      const parsedPrizes = this.safeParse<[string, RewardPrize][]>('jamanot_reward_prizes_store');
      if (parsedPrizes && Array.isArray(parsedPrizes)) {
        parsedPrizes.forEach(([id, p]) => {
          if (id && p && !['prize-free-delivery', 'prize-voucher-50', 'prize-gift-box'].includes(id)) {
            this.rewardPrizes.set(id, p);
          }
        });
      }

      const parsedClaims = this.safeParse<[string, RewardClaim][]>('jamanot_reward_claims_store');
      if (parsedClaims && Array.isArray(parsedClaims)) {
        parsedClaims.forEach(([id, c]) => {
          if (id && c) this.rewardClaims.set(id, c);
        });
      }

      const parsedServerAddrs = this.safeParse<[string, ServerAddress][]>('jamanot_server_addresses');
      if (parsedServerAddrs && Array.isArray(parsedServerAddrs)) {
        parsedServerAddrs.forEach(([id, addr]) => {
          if (id && addr) this.serverAddresses.set(id, addr);
        });
      }

      const savedPricing = this.safeParse<PricingSettings>('jamanot_pricing_store');
      if (savedPricing && typeof savedPricing === 'object') {
        this.pricingSettings = { ...DEFAULT_PRICING_SETTINGS, ...savedPricing };
      }
    } catch (e) {
      console.warn('Local storage hydration error:', e);
    }
  }

  /**
   * The orders worth caching: the newest MAX_CACHED_ORDERS, plus any still in
   * progress however old, since those are what the first screen shows.
   */
  private cacheableOrders(entries: [string, Order][]): [string, Order][] {
    if (entries.length <= MAX_CACHED_ORDERS) return entries;
    const isOpen = (o: Order) => o.status !== 'DELIVERED' && o.status !== 'CANCELED';
    const newestFirst = [...entries].sort(([, a], [, b]) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    return newestFirst.filter(([, o], i) => i < MAX_CACHED_ORDERS || isOpen(o));
  }

  private saveLocalStore() {
    if (typeof window === 'undefined') return;
    // Admin holds platform-wide users, ledgers and shop orders. They are
    // fetched again on every admin load, so caching them only made each save
    // and each cold start slower; keep just the admin's own profile.
    const isAdmin = Boolean(this._listenersRole?.startsWith('admin:'));
    const ownUser = this.currentUserId ? this.users.get(this.currentUserId) : undefined;
    try {
      localStorage.setItem('jamanot_cache_owner', this._dataOwnerUid || '');
      localStorage.setItem('jamanot_orders_store', JSON.stringify(this.cacheableOrders(Array.from(this.orders.entries()))));
      localStorage.setItem(
        'jamanot_users_store',
        JSON.stringify(isAdmin ? (ownUser ? [[this.currentUserId, ownUser]] : []) : Array.from(this.users.entries()))
      );
      localStorage.setItem('jamanot_helper_apps_store', JSON.stringify(Array.from(this.helperApplications.entries())));
      localStorage.setItem('jamanot_store_apps_store', JSON.stringify(Array.from(this.storeApplications.entries())));
      localStorage.setItem('jamanot_wallets_store', JSON.stringify(Array.from(this.wallets.entries())));
      localStorage.setItem('jamanot_wallet_txs_store', JSON.stringify(isAdmin ? [] : Array.from(this.walletTransactions.entries())));
      localStorage.setItem('jamanot_withdrawals_store', JSON.stringify(Array.from(this.withdrawals.entries())));
      localStorage.setItem('jamanot_notifications_store', JSON.stringify(Array.from(this.notifications.entries())));
      localStorage.setItem('jamanot_admin_notifs_history_store', JSON.stringify(Array.from(this.adminNotificationsHistory.entries())));
      localStorage.setItem('jamanot_scheduled_notifs_store', JSON.stringify(Array.from(this.scheduledNotifications.entries())));
      localStorage.setItem('jamanot_shops_store', JSON.stringify(Array.from(this.shops.entries())));
      localStorage.setItem('jamanot_shop_orders_store', JSON.stringify(isAdmin ? [] : Array.from(this.shopOrders.entries())));
      localStorage.setItem('jamanot_feedbacks_store', JSON.stringify(Array.from(this.orderFeedbacks.entries())));
      localStorage.setItem('jamanot_modals_store', JSON.stringify(Array.from(this.customModals.entries())));
      localStorage.setItem('jamanot_fee_suggestions_store', JSON.stringify(Array.from(this.feeSuggestions.entries())));
      localStorage.setItem('jamanot_reward_prizes_store', JSON.stringify(Array.from(this.rewardPrizes.entries())));
      localStorage.setItem('jamanot_reward_claims_store', JSON.stringify(Array.from(this.rewardClaims.entries())));
      localStorage.setItem('jamanot_server_addresses', JSON.stringify(Array.from(this.serverAddresses.entries())));
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
  // ─── Shared notification snapshot handler ─────────────────────────────────
  // Processes any notification snapshot (from any role-scoped query) and:
  //   1. Stores notifications in the local map ONLY for the logged in userId
  //      (broadcast notifications like 'all-helpers' are strictly verified against the user's role)
  //   2. Fires browser popups & dispatches instant new-order-received events for eligible helpers
  private _handleNotificationSnapshot(snapshot: any, userId: string) {
    const BROADCAST_IDS = new Set(['all', 'all-helpers', 'all-customers', 'all-commuter-helpers', 'all-dedicated-helpers', 'all-stores']);
    const MAX_NOTIFS_PER_USER = 100;

    const currentUser = this.users.get(userId);
    const userNotifs: AppNotification[] = [];

    // Helper check helper function
    const isTargetForThisUser = (notif: AppNotification): boolean => {
      const isHelperBroadcast =
        (notif.userId === 'all-helpers' && currentUser?.isHelper) ||
        (notif.userId === 'all-commuter-helpers' && currentUser?.isHelper && currentUser?.helperType !== 'dedicated') ||
        (notif.userId === 'all-dedicated-helpers' && currentUser?.isHelper && currentUser?.helperType === 'dedicated');

      let helperBroadcastEligible = isHelperBroadcast;
      if (isHelperBroadcast && notif.type === 'new_order' && notif.orderId && currentUser) {
        const targetOrder = this.orders.get(notif.orderId);
        const areas = this.pricingSettings.allowedDeliveryAreas;
        if (targetOrder && areas && areas.length > 0) {
          helperBroadcastEligible = isHelperEligibleForOrder(
            currentUser,
            targetOrder,
            areas,
            this.pricingSettings.allowedDeliveryAreasEnabled
          );
        }
      }

      const isCustomerBroadcast = notif.userId === 'all-customers' && currentUser && !currentUser.isHelper && currentUser.role !== 'admin';
      const isStoreBroadcast = notif.userId === 'all-stores' && currentUser && (currentUser.isStoreApproved || currentUser.role === 'store' || Boolean(currentUser.storeId));
      const isSegmentMatch = Boolean(notif.userId?.startsWith('segment:') && currentUser && this.doesUserMatchSegment(currentUser, notif.userId.replace('segment:', '')));

      return (
        notif.userId === userId ||
        notif.userId === 'all' ||
        helperBroadcastEligible ||
        isCustomerBroadcast ||
        isStoreBroadcast ||
        isSegmentMatch
      );
    };

    snapshot.docs.forEach((docSnap: any) => {
      const data = docSnap.data() as AppNotification;
      if (isTargetForThisUser(data)) {
        userNotifs.push(data);
      }
    });

    userNotifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    this.notifications.set(userId, userNotifs.slice(0, MAX_NOTIFS_PER_USER));

    // Fire browser popup and instant dispatch only for genuinely NEW, unread notifications targeting this device.
    if (this.currentUserId && this.currentUserId === userId) {
      const uid = this.currentUserId;
      const isInitial = this._knownNotifIds.size === 0;
      let newUnreadCount = 0;
      const toTrigger: AppNotification[] = [];
      let knownIdsChanged = false;

      snapshot.docs.forEach((docSnap: any) => {
        const notif = docSnap.data() as AppNotification;
        if (this._knownNotifIds.has(notif.id)) return; // already seen — skip
        this._knownNotifIds.add(notif.id);
        knownIdsChanged = true;

        if (isTargetForThisUser(notif)) {
          // Instant order dispatch for helper overlay
          if (notif.orderId && notif.type === 'new_order' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('new-order-received', { detail: { orderId: notif.orderId } }));
          }

          if (!notif.read) {
            if (isInitial) {
              newUnreadCount++;
              toTrigger.push(notif);
            } else {
              triggerBrowserNotification(notif);
            }
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

    this.scheduleLocalStoreSave();
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

  // ─── Server Addresses: cached read with localStorage cache ─────────────────
  private _loadServerAddressesCached() {
    const CACHE_TTL = 15 * 60 * 1000;
    if (Date.now() - this._addressesCachedAt < CACHE_TTL && this.serverAddresses.size > 0) return;
    getDocs(collection(db, 'server_addresses'))
      .then((snapshot) => {
        snapshot.forEach((docSnap) => {
          const addr = docSnap.data() as ServerAddress;
          if (addr) {
            const id = addr.id || docSnap.id;
            this.serverAddresses.set(id, { ...addr, id });
          }
        });
        this._addressesCachedAt = Date.now();
        this.orders.forEach((ord, id) => {
          this.orders.set(id, this.resolveOrderLocations(ord));
        });
        this.scheduleLocalStoreSave();
        this.notify();
      })
      .catch((err) => console.warn('[Firestore] ServerAddresses getDocs note:', err));
  }

  // ─── Tear down all active Firestore listeners ──────────────────────────────
  // Called on logout and before switching to a different role/user.
  public teardownListeners() {
    this._unsubListeners.forEach((unsub) => { try { unsub(); } catch (_) { } });
    this._unsubListeners = [];
    this._listenersRole = null;
    this._orderHistoryPromise = null;
    this.adminOrderHistoryLoading = false;
    this.adminOrderHistoryLoaded = false;
    this._allUsersPromise = null;
    this.notifications.clear();
    this._knownNotifIds.clear();
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('jamanot_known_notif_ids');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('jamanot_notifications_store');
    }
  }

  /**
   * Listens to `newest` — a query ordered by createdAt desc, so a capped
   * listener holds an account's most recent documents. A cap without an order
   * returns documents by id, and ids here are random (order ids are random
   * numbers), so on an account past the cap recent orders were simply missing.
   *
   * Ordering needs a composite index (firestore.indexes.json). Until that is
   * deployed Firestore rejects the query with failed-precondition, and this
   * falls back to `unordered` — the query used before — rather than leaving
   * the list empty.
   */
  private _listenNewestFirst(
    newest: Query<DocumentData>,
    unordered: Query<DocumentData>,
    onNext: (snapshot: QuerySnapshot<DocumentData>) => void,
    label: string
  ): () => void {
    let unsub = onSnapshot(newest, onNext, (err) => {
      if ((err as { code?: string })?.code === 'failed-precondition') {
        console.warn(`[Firestore] ${label}: index not deployed yet, using the unordered query.`, err.message);
        unsub = onSnapshot(unordered, onNext, (e) => console.warn(`[Firestore] ${label} sync note:`, e));
      } else {
        console.warn(`[Firestore] ${label} sync note:`, err);
      }
    });
    return () => unsub();
  }

  // ─── Role-scoped Firestore listener initialization ────────────────────────
  // Call this from AuthContext after login and whenever active mode changes.
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

    // Another account on this device: drop the previous one's orders and
    // ledgers rather than mixing them into this account's lists. A role switch
    // or pull-to-refresh by the same account keeps them, so lists don't blank.
    if (this._dataOwnerUid && this._dataOwnerUid !== userId) {
      this.orders.clear();
      this.shopOrders.clear();
      this.withdrawals.clear();
      this.walletTransactions.clear();
    }
    this._dataOwnerUid = userId;

    const unsubs: (() => void)[] = [];

    // ── Pricing settings: handled by the always-on _startPricingListener() ───
    // No need to add another snapshot here; the global one already keeps
    // pricingSettings live for all users including unauthenticated visitors.

    // ── Server Addresses: realtime sync so address text updates reflect instantly across all clients ──
    unsubs.push(
      onSnapshot(
        collection(db, 'server_addresses'),
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'removed') {
              this.serverAddresses.delete(change.doc.id);
            } else {
              const addr = change.doc.data() as ServerAddress;
              const id = addr.id || change.doc.id;
              this.serverAddresses.set(id, { ...addr, id });
            }
          });
          this.orders.forEach((ord, id) => {
            this.orders.set(id, this.resolveOrderLocations(ord));
          });
          this.scheduleLocalStoreSave();
          this.notify();
        },
        (err) => console.warn('[Firestore] ServerAddresses realtime sync note:', err)
      )
    );

    // ── STORE role ────────────────────────────────────────────────────────────
    if (role === 'store') {
      const effectiveStoreId = storeId || `store-${userId}`;

      // Live user profile sync (so role/permission updates or store deletions take effect immediately)
      unsubs.push(
        onSnapshot(
          doc(db, 'users', userId),
          (docSnap) => {
            if (docSnap.exists()) {
              const u = docSnap.data() as UserProfile;
              this.users.set(userId, u);
              this.notify();
            }
          },
          (err) => console.warn('[Firestore] Store user doc sync note:', err)
        )
      );

      // Live shop doc sync (so if shop is deleted by admin, store mode exits immediately)
      unsubs.push(
        onSnapshot(
          doc(db, 'shops', effectiveStoreId),
          (docSnap) => {
            if (!docSnap.exists()) {
              this.shops.delete(effectiveStoreId);
              const current = this.users.get(userId);
              if (current && (current.storeId === effectiveStoreId || current.isStore || current.isStoreApproved || current.role === 'store')) {
                const updatedUser: UserProfile = {
                  ...current,
                  isStore: false,
                  isStoreApproved: false,
                  storeId: undefined,
                  role: current.role === 'store' ? 'customer' : current.role,
                  lastActiveMode: current.lastActiveMode === 'store' ? 'customer' : current.lastActiveMode,
                };
                this.users.set(userId, updatedUser);
              }
              this.notify();
            } else {
              const s = docSnap.data() as Shop;
              this.shops.set(effectiveStoreId, { ...s, id: effectiveStoreId });
              this.notify();
            }
          },
          (err) => console.warn('[Firestore] Store shop doc sync note:', err)
        )
      );

      // Shop orders submitted to this store (realtime)
      unsubs.push(
        this._listenNewestFirst(
          query(
            collection(db, 'shopOrders'),
            where('shopId', '==', effectiveStoreId),
            orderBy('createdAt', 'desc'),
            limit(100)
          ),
          query(
            collection(db, 'shopOrders'),
            where('shopId', '==', effectiveStoreId),
            limit(100)
          ),
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
          'Store shopOrders'
        )
      );

      // Parent orders selected for this store (realtime)
      unsubs.push(
        this._listenNewestFirst(
          query(
            collection(db, 'orders'),
            where('selectedShopIds', 'array-contains', effectiveStoreId),
            orderBy('createdAt', 'desc'),
            limit(100)
          ),
          query(
            collection(db, 'orders'),
            where('selectedShopIds', 'array-contains', effectiveStoreId),
            limit(100)
          ),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.orders.delete(change.doc.id);
              } else {
                this.orders.set(change.doc.id, this.resolveOrderLocations(change.doc.data() as Order));
              }
            });
            this.notify();
          },
          'Store orders'
        )
      );

      // Store owner's own customer orders (realtime, active only)
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'orders'),
            where('customerId', '==', userId),
            where('status', 'in', ['PENDING', 'ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED', 'SCHEDULED']),
            limit(30)
          ),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.orders.delete(change.doc.id);
              } else {
                this.orders.set(change.doc.id, this.resolveOrderLocations(change.doc.data() as Order));
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
            orderBy('createdAt', 'desc'),
            limit(100)
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

      if (effectiveStoreId && effectiveStoreId !== userId) {
        unsubs.push(
          onSnapshot(
            doc(db, 'wallets', effectiveStoreId),
            (docSnap) => {
              if (docSnap.exists()) {
                this.wallets.set(effectiveStoreId, docSnap.data() as Wallet);
                this.notify();
              }
            },
            (err) => console.warn('[Firestore] Store shop wallet sync note:', err)
          )
        );
      }

      // Store owner's withdrawals (realtime)
      unsubs.push(
        this._listenNewestFirst(
          query(collection(db, 'withdrawals'), where('helperId', '==', userId), orderBy('createdAt', 'desc'), limit(50)),
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
          'Store withdrawals'
        )
      );

      if (effectiveStoreId && effectiveStoreId !== userId) {
        unsubs.push(
          this._listenNewestFirst(
            query(collection(db, 'withdrawals'), where('helperId', '==', effectiveStoreId), orderBy('createdAt', 'desc'), limit(50)),
            query(collection(db, 'withdrawals'), where('helperId', '==', effectiveStoreId), limit(50)),
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
            'Store shop withdrawals'
          )
        );
      }

      // Shops & modals: one-time reads with 30-min cache
      this._loadShopsCached();
      this._loadModalsCached();
      this._loadServerAddressesCached();

      // ── CUSTOMER role ─────────────────────────────────────────────────────────
    } else if (role === 'customer') {
      // Only this customer's orders (realtime)
      unsubs.push(
        this._listenNewestFirst(
          query(collection(db, 'orders'), where('customerId', '==', userId), orderBy('createdAt', 'desc'), limit(100)),
          query(collection(db, 'orders'), where('customerId', '==', userId), limit(100)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.orders.delete(change.doc.id);
              } else {
                const incoming = this.resolveOrderLocations(change.doc.data() as Order);
                const previous = this.orders.get(change.doc.id);

                // Customer-side coin deduction safety net:
                // If the order just became DELIVERED and has a free delivery coin claim
                // that hasn't been deducted yet, trigger deduction now on the customer's
                // own device where their profile is guaranteed to be loaded.
                if (
                  incoming.status === 'DELIVERED' &&
                  previous?.status !== 'DELIVERED' &&
                  (incoming.isFreeDelivery || (incoming.coinsRedeemedForDelivery || 0) > 0) &&
                  !incoming.coinsDeductedForDelivery
                ) {
                  const coinsToDeduct = incoming.coinsRedeemedForDelivery || this.pricingSettings.freeDeliveryRequiredCoins || 50;
                  // Mark locally immediately so UI reflects it
                  incoming.coinsDeductedForDelivery = true;
                  incoming.coinsDeductedAt = new Date().toISOString();
                  // Deduct coins and persist the flag on the order doc
                  this.deductCoinsForFreeDelivery(userId, coinsToDeduct, incoming.id).then(() => {
                    updateDoc(doc(db, 'orders', incoming.id), { coinsDeductedForDelivery: true, coinsDeductedAt: incoming.coinsDeductedAt }).catch(() => { });
                  }).catch(() => { });
                }

                this.orders.set(change.doc.id, incoming);
              }
            });
            this.notify();
          },
          'Customer orders'
        )
      );

      // Own notifications + broadcast ones (realtime)
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'notifications'),
            orderBy('createdAt', 'desc'),
            limit(100)
          ),
          (snapshot) => this._handleNotificationSnapshot(snapshot, userId),
          (err) => console.warn('[Firestore] Customer notifications sync note:', err)
        )
      );

      // Own withdrawals (realtime)
      unsubs.push(
        this._listenNewestFirst(
          query(collection(db, 'withdrawals'), where('helperId', '==', userId), orderBy('createdAt', 'desc'), limit(50)),
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
          'Customer withdrawals'
        )
      );

      // Reward prizes (realtime)
      unsubs.push(
        onSnapshot(
          collection(db, 'rewardPrizes'),
          (snapshot) => {
            const prizeMap = new Map<string, RewardPrize>();
            snapshot.docs.forEach((docSnap) => {
              if (['prize-free-delivery', 'prize-voucher-50', 'prize-gift-box'].includes(docSnap.id)) {
                deleteDoc(doc(db, 'rewardPrizes', docSnap.id)).catch(() => { });
                return;
              }
              prizeMap.set(docSnap.id, docSnap.data() as RewardPrize);
            });
            this.rewardPrizes = prizeMap;
            this.scheduleLocalStoreSave();
            this.notify();
          },
          (err) => console.warn('[Firestore] Customer rewardPrizes sync note:', err)
        )
      );

      // Own reward claims (realtime)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'rewardClaims'), where('userId', '==', userId), limit(50)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.rewardClaims.delete(change.doc.id);
              } else {
                this.rewardClaims.set(change.doc.id, change.doc.data() as RewardClaim);
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Customer rewardClaims sync note:', err)
        )
      );

      // Customer's own profile (for live coins sync)
      unsubs.push(
        onSnapshot(
          doc(db, 'users', userId),
          (docSnap) => {
            if (docSnap.exists()) {
              const u = docSnap.data() as UserProfile;
              this.users.set(userId, u);
              this.notify();
            }
          },
          (err) => console.warn('[Firestore] Customer user doc sync note:', err)
        )
      );

      // Shops & modals: one-time reads with 30-min cache (rarely change)
      this._loadShopsCached();
      this._loadModalsCached();
      this._loadServerAddressesCached();

      // ── HELPER role ───────────────────────────────────────────────────────────
    } else if (role === 'helper') {
      // Recent orders stream (realtime, latest 150 orders ordered by createdAt desc)
      // This ensures any newly created order is immediately received by helpers in realtime
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'orders'),
            orderBy('createdAt', 'desc'),
            limit(150)
          ),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                // "Removed" from this query only means it left the newest-150
                // window. Pending orders and this helper's own orders are each
                // owned by a stream below, which removes them itself once they
                // are truly gone — deleting them here dropped live requests,
                // and running orders from the helper's own list.
                const cached = this.orders.get(change.doc.id);
                if (cached?.status !== 'PENDING' && cached?.helperId !== userId) {
                  this.orders.delete(change.doc.id);
                }
              } else {
                this.orders.set(change.doc.id, this.resolveOrderLocations(change.doc.data() as Order));
              }
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Helper active orders sync note:', err)
        )
      );

      // Unassigned pending requests stream (realtime, ensures all new requests are received immediately)
      let pendingOrdersPrimed = false;
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'orders'),
            where('status', '==', 'PENDING'),
            limit(100)
          ),
          // Metadata changes too, so the server confirming a first snapshot
          // that was served from cache is reported.
          { includeMetadataChanges: true },
          (snapshot) => {
            const changes = snapshot.docChanges();
            changes.forEach((change) => {
              if (change.type === 'removed') {
                // It stopped being PENDING (accepted, cancelled) or was
                // deleted. If another stream already delivered its new state,
                // keep that — it is newer than what this query last saw.
                const cached = this.orders.get(change.doc.id);
                if (!cached || cached.status === 'PENDING') {
                  this.orders.delete(change.doc.id);
                }
              } else {
                this.orders.set(change.doc.id, this.resolveOrderLocations(change.doc.data() as Order));
              }
            });
            // On the server's first answer: an order cached as open that it
            // does not list is not open any more. This query only reports
            // removals of what it delivered in this session, so one taken or
            // cancelled while the site was closed would otherwise sit in the
            // New list for good. Done once, and only when the answer is the
            // complete set.
            let dropped = false;
            if (!pendingOrdersPrimed && !snapshot.metadata.fromCache) {
              pendingOrdersPrimed = true;
              if (snapshot.size < 100) {
                const open = new Set(snapshot.docs.map((d) => d.id));
                Array.from(this.orders.entries()).forEach(([id, o]) => {
                  if (o.status === 'PENDING' && !o.helperId && !open.has(id)) {
                    this.orders.delete(id);
                    dropped = true;
                  }
                });
              }
            }
            if (changes.length > 0 || dropped) this.notify();
          },
          (err) => console.warn('[Firestore] Helper pending orders sync note:', err)
        )
      );

      // The orders this helper is running — all of them, however old.
      //
      // The history stream below is capped, and until its index is deployed it
      // is not even the newest 200 but 200 by (random) document id. A helper
      // past that many orders could accept one that the stream never carried,
      // or have a running order pushed out of it by the next one they took —
      // and it was then deleted from this device. Running orders are few (the
      // admin's active-order limit), so this query needs no cap.
      unsubs.push(
        onSnapshot(
          query(collection(db, 'orders'), where('helperId', '==', userId), where('status', 'in', RUNNING_ORDER_STATUSES)),
          // Metadata changes too: the first snapshot is often served from what
          // the streams above have already loaded, and the server confirming
          // it unchanged would otherwise never be reported.
          { includeMetadataChanges: true },
          (snapshot) => {
            const changes = snapshot.docChanges();
            changes.forEach((change) => {
              if (change.type === 'removed') {
                // Delivered, cancelled, given to someone else or deleted — the
                // server says which.
                this.recheckOrder(change.doc.id);
              } else {
                this.orders.set(change.doc.id, this.resolveOrderLocations(change.doc.data() as Order));
              }
            });
            // Cached as running for this helper, but not among the server's:
            // left over from an earlier session, where this query never
            // delivered it and so will never report it removed.
            if (!snapshot.metadata.fromCache) {
              const running = new Set(snapshot.docs.map((d) => d.id));
              this.orders.forEach((o, id) => {
                if (o.helperId === userId && RUNNING_ORDER_STATUSES.includes(o.status) && !running.has(id)) {
                  this.recheckOrder(id);
                }
              });
            }
            if (changes.length > 0) this.notify();
          },
          (err) => console.warn('[Firestore] Helper running orders sync note:', err)
        )
      );

      // This helper's own orders — all statuses (history, delivered, canceled, active) (realtime)
      // The newest 200; older history is paged in on demand (loadOlderOrders).
      unsubs.push(
        this._listenNewestFirst(
          query(collection(db, 'orders'), where('helperId', '==', userId), orderBy('createdAt', 'desc'), limit(200)),
          query(collection(db, 'orders'), where('helperId', '==', userId), limit(200)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                // Mostly an old order leaving the 200-order window. A running
                // one belongs to the stream above and is never dropped here.
                const cached = this.orders.get(change.doc.id);
                if (cached && cached.helperId === userId && RUNNING_ORDER_STATUSES.includes(cached.status)) {
                  this.recheckOrder(change.doc.id);
                } else {
                  this.orders.delete(change.doc.id);
                }
              } else {
                this.orders.set(change.doc.id, this.resolveOrderLocations(change.doc.data() as Order));
              }
            });
            this.notify();
          },
          'Helper own orders'
        )
      );

      // Own withdrawals (realtime)
      unsubs.push(
        this._listenNewestFirst(
          query(collection(db, 'withdrawals'), where('helperId', '==', userId), orderBy('createdAt', 'desc'), limit(50)),
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
          'Helper withdrawals'
        )
      );

      // Notifications (realtime stream, filtered client-side by _handleNotificationSnapshot)
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'notifications'),
            orderBy('createdAt', 'desc'),
            limit(100)
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

      // Helper's own wallet transactions (realtime, needed for ledger display)
      unsubs.push(
        this._listenNewestFirst(
          query(collection(db, 'walletTransactions'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(100)),
          query(collection(db, 'walletTransactions'), where('userId', '==', userId), limit(100)),
          (snapshot) => {
            const txs: WalletTransaction[] = [];
            snapshot.forEach((docSnap) => {
              txs.push(docSnap.data() as WalletTransaction);
            });
            txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            this.walletTransactions.set(userId, txs);
            this.notify();
          },
          'Helper walletTransactions'
        )
      );

      // Shops & modals: one-time reads with 30-min cache
      this._loadShopsCached();
      this._loadModalsCached();
      this._loadServerAddressesCached();

      // Shop orders placed by this helper (realtime)
      unsubs.push(
        this._listenNewestFirst(
          query(collection(db, 'shopOrders'), where('helperId', '==', userId), orderBy('createdAt', 'desc'), limit(100)),
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
          'Helper shopOrders'
        )
      );

      // Helper's own user profile (for live coins & profile sync)
      unsubs.push(
        onSnapshot(
          doc(db, 'users', userId),
          (docSnap) => {
            if (docSnap.exists()) {
              const u = docSnap.data() as UserProfile;
              this.users.set(userId, u);
              this.notify();
            }
          },
          (err) => console.warn('[Firestore] Helper user doc sync note:', err)
        )
      );

      // ── ADMIN role ────────────────────────────────────────────────────────────
    } else if (role === 'admin') {
      // ── REALTIME: orders ──────────────────────────────────────────────────
      // The newest 100, plus every order the Needs Attention queue can list,
      // however old. Together they make the dashboard correct from the first
      // second; the full history arrives later (loadAdminOrderHistory).
      //
      // An order leaving one of these queries has not necessarily been deleted:
      // it may have been pushed out of the newest 100, or stopped being
      // PENDING. Deleting it here made orders vanish from the admin lists, so
      // it is re-read instead (recheckOrder).
      const trackOrders = (q: Query<DocumentData>, label: string) =>
        onSnapshot(
          q,
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                this.recheckOrder(change.doc.id);
              } else {
                this.orders.set(change.doc.id, this.resolveOrderLocations(change.doc.data() as Order));
              }
            });
            this.notify();
          },
          (err) => console.warn(`[Firestore] Admin ${label} sync note:`, err)
        );
      const ordersCol = collection(db, 'orders');
      unsubs.push(trackOrders(query(ordersCol, orderBy('createdAt', 'desc'), limit(100)), 'recent orders'));
      unsubs.push(trackOrders(query(ordersCol, where('status', '==', 'PENDING'), limit(200)), 'pending orders'));
      unsubs.push(
        trackOrders(
          query(ordersCol, where('status', 'in', ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED']), limit(300)),
          'in-progress orders'
        )
      );
      unsubs.push(trackOrders(query(ordersCol, where('cancellationRequest.status', '==', 'PENDING'), limit(100)), 'cancellation requests'));
      unsubs.push(trackOrders(query(ordersCol, where('feeAdjustment.status', '==', 'PENDING'), limit(100)), 'fee adjustments'));

      // ── REALTIME: reward claims (for Needs Attention pending badges) ──────────
      unsubs.push(
        onSnapshot(
          query(collection(db, 'rewardClaims'), orderBy('createdAt', 'desc'), limit(200)),
          (snapshot) => {
            const currentIds = new Set(snapshot.docs.map((d) => d.id));
            for (const key of Array.from(this.rewardClaims.keys())) {
              if (!currentIds.has(key)) this.rewardClaims.delete(key);
            }
            snapshot.docs.forEach((docSnap) => {
              this.rewardClaims.set(docSnap.id, docSnap.data() as RewardClaim);
            });
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin rewardClaims sync note:', err)
        )
      );

      // ── REALTIME: order feedbacks (for Needs Attention bad feedback & feedback tab) ──
      unsubs.push(
        onSnapshot(
          query(collection(db, 'orderFeedbacks'), orderBy('createdAt', 'desc'), limit(200)),
          (snapshot) => {
            const currentIds = new Set(snapshot.docs.map((d) => d.id));
            for (const key of Array.from(this.orderFeedbacks.keys())) {
              if (!currentIds.has(key)) this.orderFeedbacks.delete(key);
            }
            snapshot.docs.forEach((docSnap) => {
              this.orderFeedbacks.set(docSnap.id, docSnap.data() as OrderFeedback);
            });
            this.scheduleLocalStoreSave();
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin orderFeedbacks sync note:', err)
        )
      );

      // ── REALTIME: notifications (admin push history + incoming) ──────────────
      unsubs.push(
        onSnapshot(
          query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(300)),
          (snapshot) => {
            const currentAdminNotifs = new Map<string, AppNotification>();
            snapshot.docs.forEach((docSnap) => {
              const n = docSnap.data() as AppNotification;
              if (n.isAdminPush || n.createdByAdmin || n.id?.startsWith('admin-notif-') || n.id?.startsWith('notif-disp-')) {
                currentAdminNotifs.set(n.id || docSnap.id, n);
              }
            });
            this.adminNotificationsHistory = currentAdminNotifs;
            this._handleNotificationSnapshot(snapshot, userId);
            this.scheduleLocalStoreSave();
            this.notify();
          },
          (err) => console.warn('[Firestore] Admin notifications sync note:', err)
        )
      );

      // ── ONE-TIME FETCH: everything else loaded once on mount ─────────────────
      // Remaining collections (users, wallets, walletTransactions, withdrawals,
      // helperApplications, storeApplications, orderFeedbacks, feeSuggestions,
      // customModals, rewardPrizes, shops, shopOrders, scheduledNotifications)
      // are NOT kept as realtime listeners. They are fetched once here and
      // re-fetched on demand when the admin clicks "Refresh" or takes an action.
      this._adminInitialFetch();
    }

    this._unsubListeners = unsubs;
    console.info(`[Firestore] Listeners initialized for role=${role}, uid=${userId}, listeners=${unsubs.length}`);
  }

  // ── Admin one-time & on-demand fetch helpers ─────────────────────────────
  //
  // Collections that are NOT realtime-subscribed for admin are loaded here:
  // users, wallets, walletTransactions, withdrawals, helperApplications,
  // storeApplications, orderFeedbacks, feeSuggestions, customModals,
  // rewardPrizes, shops, shopOrders, scheduledNotifications.
  //
  // Called once after initListenersForRole (admin). Also called by
  // refreshAdminData() when the admin clicks a "Refresh" button.
  private async _adminInitialFetch(refresh = false) {
    try {
      await Promise.all([
        this._fetchAdminUsers(),
        this._fetchAdminWithdrawals(),
        this._fetchAdminHelperApplications(),
        this._fetchAdminStoreApplications(),
        this._fetchAdminOrderFeedbacks(),
        this._fetchAdminFeeSuggestions(),
        this._fetchAdminCustomModals(),
        this._fetchAdminRewardPrizes(),
        this._fetchAdminShops(),
        this._fetchAdminShopOrders(),
        this._fetchAdminWallets(),
        this._fetchAdminWalletTransactions(),
        this._fetchAdminScheduledNotifications(),
        this._fetchServerAddresses(),
      ]);
      this.scheduleLocalStoreSave();
      this.notify();
    } catch (err) {
      console.warn('[Firestore] Admin initial fetch error:', err);
    }
    // Not awaited: the dashboard is usable on the live queries alone, and the
    // history only completes the reports and lifetime totals.
    this.loadAdminOrderHistory(refresh).catch(() => { });
  }

  /**
   * Reads a whole collection a page at a time, letting the UI run between
   * pages. A single getDocs over thousands of documents is parsed in one go,
   * which is what froze the admin dashboard while it loaded. Ordered by
   * document id because every document has one; ordering by a field would
   * silently skip documents missing it.
   */
  private async _scanCollection(path: string, pageSize = 500): Promise<QueryDocumentSnapshot<DocumentData>[]> {
    const out: QueryDocumentSnapshot<DocumentData>[] = [];
    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
    for (;;) {
      const q: Query<DocumentData> = cursor
        ? query(collection(db, path), orderBy(documentId()), startAfter(cursor), limit(pageSize))
        : query(collection(db, path), orderBy(documentId()), limit(pageSize));
      const snap: QuerySnapshot<DocumentData> = await getDocs(q);
      out.push(...snap.docs);
      if (snap.docs.length < pageSize) return out;
      cursor = snap.docs[snap.docs.length - 1];
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /**
   * Admin: every order on the platform, for the lifetime totals, the helper
   * table and the revenue/growth reports. Runs in the background once per
   * session (or again when the admin presses Refresh) and is published in a
   * single update at the end, so the dashboard re-renders once rather than
   * once per page. It is never written to localStorage (see cacheableOrders).
   */
  public loadAdminOrderHistory(force = false): Promise<void> {
    if (this._orderHistoryPromise && !force) return this._orderHistoryPromise;

    const run = async (): Promise<void> => {
      this.adminOrderHistoryLoading = true;
      this.notify();
      const startedAt = new Date().toISOString();
      try {
        const docs = await this._scanCollection('orders');
        // Superseded while reading — a forced reload, or the admin left admin
        // mode (teardownListeners). Its orders must not land in another role.
        if (this._orderHistoryPromise !== promise) return;
        const seen = new Set<string>();
        docs.forEach((d) => {
          const o = this.resolveOrderLocations(d.data() as Order);
          const id = o?.id || d.id;
          if (!o) return;
          seen.add(id);
          this.orders.set(id, o);
        });
        // The scan listed every order, so a cached one it did not see, and
        // that is older than the scan, has been deleted since it was cached.
        Array.from(this.orders.entries()).forEach(([id, o]) => {
          if (!seen.has(id) && (o.createdAt || '') < startedAt) this.orders.delete(id);
        });
        this.adminOrderHistoryLoaded = true;
      } catch (e) {
        console.warn('[Firestore] Admin order history load error:', e);
        if (this._orderHistoryPromise === promise) this._orderHistoryPromise = null; // let the next call try again
      } finally {
        if (this._orderHistoryPromise === promise || this._orderHistoryPromise === null) {
          this.adminOrderHistoryLoading = false;
          this.notify();
        }
      }
    };

    // Assigned before run() can reach its first check: run() is suspended at
    // its first await until after this line.
    let promise: Promise<void> = Promise.resolve();
    promise = run();
    this._orderHistoryPromise = promise;
    return promise;
  }

  /**
   * Re-reads one order after it left a live query, then keeps it or drops it
   * according to the server. Coalesces repeats, since one change can remove
   * the same order from several queries at once. If the server can't be
   * reached the cached copy stays as it is.
   */
  private recheckOrder(orderId: string) {
    if (this._recheckingOrders.has(orderId)) return;
    this._recheckingOrders.add(orderId);
    this.whenNetworkReady()
      .then(() => getDoc(doc(db, 'orders', orderId)))
      .then((snap) => {
        if (snap.exists()) {
          this.orders.set(orderId, this.resolveOrderLocations(snap.data() as Order));
        } else {
          this.orders.delete(orderId);
        }
        this.notify();
      })
      .catch(() => { })
      .finally(() => this._recheckingOrders.delete(orderId));
  }

  // Public: called by AdminDashboard when admin clicks "Refresh" on a tab,
  // or automatically after an admin action updates a collection.
  // Pass a specific collection name to refresh only that subset, or omit
  // to refresh all non-realtime admin collections.
  public async refreshAdminData(
    subset?: 'orders' | 'users' | 'withdrawals' | 'helperApplications' | 'storeApplications' |
      'orderFeedbacks' | 'feeSuggestions' | 'customModals' | 'rewardPrizes' |
      'shops' | 'shopOrders' | 'wallets' | 'walletTransactions' | 'scheduledNotifications' | 'serverAddresses' | 'all'
  ): Promise<void> {
    try {
      const target = subset ?? 'all';
      if (target === 'all') {
        await this._adminInitialFetch(true);
        return;
      }
      switch (target) {
        case 'orders': await this.loadAdminOrderHistory(true); break;
        case 'users': await this._fetchAdminUsers(); break;
        case 'withdrawals': await this._fetchAdminWithdrawals(); break;
        case 'helperApplications': await this._fetchAdminHelperApplications(); break;
        case 'storeApplications': await this._fetchAdminStoreApplications(); break;
        case 'orderFeedbacks': await this._fetchAdminOrderFeedbacks(); break;
        case 'feeSuggestions': await this._fetchAdminFeeSuggestions(); break;
        case 'customModals': await this._fetchAdminCustomModals(); break;
        case 'rewardPrizes': await this._fetchAdminRewardPrizes(); break;
        case 'shops': await this._fetchAdminShops(); break;
        case 'shopOrders': await this._fetchAdminShopOrders(); break;
        case 'wallets': await this._fetchAdminWallets(); break;
        case 'walletTransactions': await this._fetchAdminWalletTransactions(); break;
        case 'scheduledNotifications': await this._fetchAdminScheduledNotifications(); break;
        case 'serverAddresses': await this._fetchServerAddresses(); break;
      }
      this.scheduleLocalStoreSave();
      this.notify();
    } catch (err) {
      console.warn('[Firestore] refreshAdminData error:', err);
    }
  }

  private async _fetchAdminUsers() {
    // Once a tab has needed every user, a refresh re-reads every user rather
    // than shrinking the list back to the first 500.
    if (this._allUsersPromise) {
      await this.getAllUsers(true);
      return;
    }
    const snap = await getDocs(query(collection(db, 'users'), limit(500)));
    // A full read started while this one was in flight; don't shrink it back.
    if (this._allUsersPromise) return;
    const map = new Map<string, UserProfile>();
    snap.docs.forEach((d) => {
      const u = d.data() as UserProfile;
      const uid = u.uid || d.id;
      map.set(uid, { ...u, uid });
    });
    this.users = map;
    this.scheduleLocalStoreSave();
  }

  private async _fetchAdminWithdrawals() {
    const snap = await getDocs(query(collection(db, 'withdrawals'), limit(300)));
    const map = new Map<string, WithdrawalRequest>();
    snap.docs.forEach((d) => {
      const w = d.data() as WithdrawalRequest;
      const id = w.id || d.id;
      map.set(id, { ...w, id });
    });
    this.withdrawals = map;
    this.scheduleLocalStoreSave();
  }

  private async _fetchAdminHelperApplications() {
    const snap = await getDocs(query(collection(db, 'helperApplications'), limit(300)));
    const map = new Map<string, HelperApplication>();
    snap.docs.forEach((d) => {
      const a = d.data() as HelperApplication;
      const id = a.id || d.id;
      map.set(id, { ...a, id });
    });
    this.helperApplications = map;
    this.scheduleLocalStoreSave();
  }

  private async _fetchAdminStoreApplications() {
    const snap = await getDocs(query(collection(db, 'storeApplications'), limit(300)));
    const map = new Map<string, StoreApplication>();
    snap.docs.forEach((d) => {
      const a = d.data() as StoreApplication;
      const id = a.id || d.id;
      map.set(id, { ...a, id });
    });
    this.storeApplications = map;
    this.scheduleLocalStoreSave();
  }

  private async _fetchAdminOrderFeedbacks() {
    const snap = await getDocs(query(collection(db, 'orderFeedbacks'), limit(300)));
    const map = new Map<string, OrderFeedback>();
    snap.docs.forEach((d) => {
      const f = d.data() as OrderFeedback;
      const id = f.id || d.id;
      map.set(id, { ...f, id });
    });
    this.orderFeedbacks = map;
    this.scheduleLocalStoreSave();
  }

  private async _fetchAdminFeeSuggestions() {
    const snap = await getDocs(query(collection(db, 'feeSuggestions'), limit(300)));
    const map = new Map<string, FeeSuggestion>();
    snap.docs.forEach((d) => {
      const s = d.data() as FeeSuggestion;
      const id = s.id || d.id;
      map.set(id, { ...s, id });
    });
    this.feeSuggestions = map;
    this.scheduleLocalStoreSave();
  }

  private async _fetchAdminCustomModals() {
    const snap = await getDocs(query(collection(db, 'customModals'), limit(100)));
    const map = new Map<string, AdminCustomModalConfig>();
    snap.docs.forEach((d) => {
      const c = d.data() as AdminCustomModalConfig;
      const id = c.id || d.id;
      map.set(id, { ...c, id });
    });
    this.customModals = map;
    this.scheduleLocalStoreSave();
  }

  public async fetchRewardPrizes(): Promise<RewardPrize[]> {
    try {
      const snap = await getDocs(query(collection(db, 'rewardPrizes'), limit(50)));
      const prizeMap = new Map<string, RewardPrize>();
      snap.docs.forEach((d) => {
        if (['prize-free-delivery', 'prize-voucher-50', 'prize-gift-box'].includes(d.id)) {
          deleteDoc(doc(db, 'rewardPrizes', d.id)).catch(() => { });
          return;
        }
        prizeMap.set(d.id, d.data() as RewardPrize);
      });
      this.rewardPrizes = prizeMap;
      this.scheduleLocalStoreSave();
      this.notify();
      return Array.from(prizeMap.values());
    } catch (e: any) {
      console.warn('[Firestore] fetchRewardPrizes note:', e?.message || e);
      return Array.from(this.rewardPrizes.values());
    }
  }

  private async _fetchAdminRewardPrizes() {
    await this.fetchRewardPrizes();
  }

  private async _fetchAdminShops() {
    const snap = await getDocs(query(collection(db, 'shops'), limit(300)));
    const map = new Map<string, Shop>();
    snap.docs.forEach((d) => {
      const s = d.data() as Shop;
      const id = s.id || d.id;
      map.set(id, { ...s, id });
    });
    this.shops = map;
    this.scheduleLocalStoreSave();
  }

  private async _fetchAdminShopOrders() {
    const snap = await getDocs(query(collection(db, 'shopOrders'), limit(500)));
    const map = new Map<string, ShopOrder>();
    snap.docs.forEach((d) => {
      const so = d.data() as ShopOrder;
      const id = so.id || d.id;
      map.set(id, { ...so, id });
    });
    this.shopOrders = map;
    this.scheduleLocalStoreSave();
  }

  private async _fetchAdminWallets() {
    const snap = await getDocs(query(collection(db, 'wallets'), limit(300)));
    const map = new Map<string, Wallet>();
    snap.docs.forEach((d) => {
      const w = d.data() as Wallet;
      const userId = w.userId || d.id;
      map.set(userId, { ...w, userId });
    });
    this.wallets = map;
    this.scheduleLocalStoreSave();
  }

  private async _fetchAdminWalletTransactions() {
    const snap = await getDocs(query(collection(db, 'walletTransactions'), limit(500)));
    const map = new Map<string, WalletTransaction[]>();
    snap.docs.forEach((d) => {
      const tx = d.data() as WalletTransaction;
      const list = map.get(tx.userId) || [];
      list.push(tx);
      map.set(tx.userId, list);
    });
    map.forEach((list) => {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    this.walletTransactions = map;
    this.scheduleLocalStoreSave();
  }

  private async _fetchAdminScheduledNotifications() {
    const snap = await getDocs(query(collection(db, 'scheduledNotifications'), limit(50)));
    // Clear and reload to reflect deletions
    this.scheduledNotifications.clear();
    snap.docs.forEach((d) => { this.scheduledNotifications.set(d.id, d.data() as AppNotification); });
    this.scheduleLocalStoreSave();
  }

  private async _fetchServerAddresses() {
    try {
      const snap = await getDocs(collection(db, 'server_addresses'));
      this.serverAddresses.clear();
      snap.docs.forEach((d) => {
        const a = d.data() as ServerAddress;
        if (a) {
          const id = a.id || d.id;
          this.serverAddresses.set(id, { ...a, id });
        }
      });
      this.scheduleLocalStoreSave();
    } catch (e) {
      console.warn('[Firestore] _fetchServerAddresses error:', e);
    }
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
    this.scheduleLocalStoreSave();
  }

  /**
   * Persists the cache at most every 2s. saveLocalStore serialises every
   * collection, so it must not run once per snapshot or per fetch; the many
   * places that change the store all come through here instead.
   */
  private scheduleLocalStoreSave() {
    if (this._saveDebounceTimer) clearTimeout(this._saveDebounceTimer);
    this._saveDebounceTimer = setTimeout(() => {
      this._saveDebounceTimer = null;
      this.saveLocalStore();
    }, 2000);
  }

  // --- Actions with Firebase Persistence & Dynamic Notifications ---

  // Reconciles a signed-in user's store/helper flags with their applications.
  // An approval can fail to reach the user document (e.g. the admin's client had
  // never cached that profile), which would otherwise leave an approved store
  // owner or helper stuck on the customer interface. Returns the corrected
  // profile, or null when nothing needed changing.
  public async syncApprovedRolesForUser(profile: UserProfile): Promise<UserProfile | null> {
    if (!profile || profile.isAdmin || profile.role === 'admin') return null;
    let next = profile;
    let changed = false;

    // ── Store applications & Direct Shop Assignment & Shop Existence ────────
    try {
      // 1. Check direct shop assignment (admin assigned shop where ownerUserId === profile.uid or assignedUserIds contains profile.uid)
      let assignedShop: Shop | undefined;
      for (const s of Array.from(this.shops.values())) {
        if (s.ownerUserId === profile.uid || (s.assignedUserIds && s.assignedUserIds.includes(profile.uid))) {
          assignedShop = s;
          break;
        }
      }

      if (!assignedShop && profile.uid) {
        try {
          const shopByOwnerSnap = await getDocs(
            query(collection(db, 'shops'), where('ownerUserId', '==', profile.uid), limit(1))
          );
          if (shopByOwnerSnap && !shopByOwnerSnap.empty) {
            assignedShop = shopByOwnerSnap.docs[0].data() as Shop;
            this.shops.set(assignedShop.id, assignedShop);
          } else {
            const shopByAssignedSnap = await getDocs(
              query(collection(db, 'shops'), where('assignedUserIds', 'array-contains', profile.uid), limit(1))
            );
            if (shopByAssignedSnap && !shopByAssignedSnap.empty) {
              assignedShop = shopByAssignedSnap.docs[0].data() as Shop;
              this.shops.set(assignedShop.id, assignedShop);
            }
          }
        } catch (_) { }
      }

      if (assignedShop) {
        const effectiveShopId = assignedShop.id;
        if (!next.isStore || !next.isStoreApproved || next.storeId !== effectiveShopId || next.role !== 'store' || next.lastActiveMode !== 'store') {
          next = {
            ...next,
            isStore: true,
            isStoreApproved: true,
            storeId: effectiveShopId,
            role: 'store',
            lastActiveMode: 'store',
          };
          changed = true;
        }
      } else if (next.isStore || next.isStoreApproved || next.storeId || next.role === 'store' || next.lastActiveMode === 'store') {
        // Shop was deleted or user was unassigned/removed — clean up store applications and reset user to customer
        try {
          const snap = await getDocs(
            query(collection(db, 'storeApplications'), where('userId', '==', profile.uid), limit(10))
          );
          snap.forEach((docSnap) => {
            const a = docSnap.data() as StoreApplication;
            if (a && a.id) {
              this.storeApplications.delete(a.id);
              deleteDoc(doc(db, 'storeApplications', a.id)).catch(() => { });
            }
          });
        } catch (_) { }

        next = {
          ...next,
          isStore: false,
          isStoreApproved: false,
          storeId: undefined,
          role: next.role === 'store' ? 'customer' : next.role,
          lastActiveMode: next.lastActiveMode === 'store' ? 'customer' : next.lastActiveMode,
        };
        changed = true;

        try {
          await setDoc(
            doc(db, 'users', profile.uid),
            {
              isStore: false,
              isStoreApproved: false,
              storeId: null,
              role: next.role,
              lastActiveMode: next.lastActiveMode,
            },
            { merge: true }
          );
        } catch (_) { }
      }
    } catch (e: any) {
      console.warn('[Firestore] syncApprovedRolesForUser store note:', e?.message || e);
    }

    // ── Helper applications ───────────────────────────────────────────────────
    // Promote only: commuter helpers enable themselves without ever filing an
    // application, so a missing/rejected application must never revoke isHelper.
    try {
      const snap = await getDocs(
        query(collection(db, 'helperApplications'), where('userId', '==', profile.uid), limit(10))
      );
      const apps: HelperApplication[] = [];
      snap.forEach((docSnap) => {
        const a = docSnap.data() as HelperApplication;
        if (a && a.id) {
          this.helperApplications.set(a.id, a);
          apps.push(a);
        }
      });

      const approved = apps.find((a) => a.status === 'APPROVED');
      if (approved) {
        const isDedicated = approved.applicationType === 'dedicated' || !approved.applicationType;
        const targetType = isDedicated ? 'dedicated' : next.helperType || 'commuter';
        if (!next.isHelper || next.helperType !== targetType) {
          next = { ...next, isHelper: true, helperType: targetType };
          changed = true;
        }
      }
    } catch (e: any) {
      console.warn('[Firestore] syncApprovedRolesForUser helper note:', e?.message || e);
    }

    if (!changed) return null;
    await this.saveUser(next);
    return next;
  }

  // Admin listeners only cache a limited slice of the `users` collection, so a
  // profile an admin action needs to mutate is often missing locally. Always go
  // through this before updating a user from an admin flow.
  public async getUserForUpdate(uid: string): Promise<UserProfile | null> {
    const cached = this.users.get(uid);
    if (cached) return cached;
    return await this.fetchUserFromFirestore(uid);
  }

  public async fetchUserFromFirestore(uid: string): Promise<UserProfile | null> {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const u = snap.data() as UserProfile;
        this.users.set(uid, u);
        this.notify();
        return u;
      }
    } catch (e: any) {
      console.warn('[Firestore] fetchUserFromFirestore error:', e?.message || e);
    }
    return null;
  }

  public async saveUser(user: UserProfile) {
    const existing = this.users.get(user.uid);
    const mergedUser: UserProfile = {
      ...(existing || {}),
      ...user,
      coins: user.coins !== undefined ? user.coins : existing?.coins,
      totalEarnedCoins: user.totalEarnedCoins !== undefined ? user.totalEarnedCoins : existing?.totalEarnedCoins,
    };
    this.users.set(user.uid, mergedUser);
    this.scheduleLocalStoreSave();
    this.notify();
    try {
      await setDoc(doc(db, 'users', user.uid), cleanForFirestore(user), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] saveUser note (stored locally):', e?.message || e);
    }

    // If user is a helper or has an application, sync application legalName & whatsapp and orders
    const helperApp = Array.from(this.helperApplications.values()).find((a) => a.userId === user.uid);
    if (helperApp) {
      let appChanged = false;
      const updatedApp = { ...helperApp };
      if (mergedUser.displayName && mergedUser.displayName !== '?' && helperApp.legalName !== mergedUser.displayName) {
        updatedApp.legalName = mergedUser.displayName;
        appChanged = true;
      }
      const newPhone = mergedUser.alternativePhone || mergedUser.phoneNumber;
      if (newPhone && helperApp.whatsapp !== newPhone) {
        updatedApp.whatsapp = newPhone;
        appChanged = true;
      }
      if (appChanged) {
        this.helperApplications.set(helperApp.id, updatedApp);
        try {
          await setDoc(doc(db, 'helperApplications', helperApp.id), cleanForFirestore(updatedApp), { merge: true });
        } catch (_) { }
      }
    }

    if (mergedUser.isHelper || helperApp) {
      const helperName = mergedUser.displayName;
      const helperPhone = mergedUser.alternativePhone || mergedUser.phoneNumber;
      if (helperName || helperPhone) {
        this.syncHelperDataAcrossOrders(mergedUser.uid, helperName, helperPhone);
      }
    }
  }

  public async syncHelperDataAcrossOrders(helperId: string, newName?: string, newPhone?: string) {
    if (!helperId) return;
    const ordersToUpdate: Order[] = [];
    this.orders.forEach((o) => {
      if (o.helperId === helperId) {
        let changed = false;
        const updated = { ...o };
        if (newName && updated.helperName !== newName) {
          updated.helperName = newName;
          changed = true;
        }
        if (newPhone && updated.helperPhone !== newPhone) {
          updated.helperPhone = newPhone;
          changed = true;
        }
        if (changed) {
          this.orders.set(o.id, updated);
          ordersToUpdate.push(updated);
        }
      }
    });

    if (ordersToUpdate.length > 0) {
      this.scheduleLocalStoreSave();
      this.notify();
      try {
        // Only the two fields this changes — these are cached copies, and the
        // rest of each may be behind the server's.
        await Promise.all(
          ordersToUpdate.slice(0, 50).map((ord) =>
            updateDoc(doc(db, 'orders', ord.id), cleanForFirestore({ helperName: ord.helperName, helperPhone: ord.helperPhone }))
          )
        );
      } catch (err) {
        console.warn('[Firestore] syncHelperDataAcrossOrders note:', err);
      }
    }
  }

  public async blockUser(uid: string, isBlocked: boolean, reason?: string, adminName?: string) {
    const existing = this.users.get(uid);
    if (!existing) return;
    const updated: UserProfile = {
      ...existing,
      isBlocked,
      blockedReason: isBlocked ? reason || 'Blocked by administrator' : undefined,
      adminBlockNote: isBlocked ? reason || 'Blocked by administrator' : undefined,
      blockedAt: isBlocked ? new Date().toISOString() : undefined,
      blockedBy: isBlocked ? adminName || 'Admin' : undefined,
    };
    this.users.set(uid, updated);
    this.notify();
    try {
      await setDoc(doc(db, 'users', uid), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] blockUser note (stored locally):', e?.message || e);
    }
  }

  public async blockShop(shopId: string, isBlocked: boolean, reason?: string, adminName?: string) {
    const existing = this.shops.get(shopId);
    if (!existing) return;
    const updated: Shop = {
      ...existing,
      isBlocked,
      blockedReason: isBlocked ? reason || 'Blocked by administrator' : undefined,
      adminBlockNote: isBlocked ? reason || 'Blocked by administrator' : undefined,
      blockedAt: isBlocked ? new Date().toISOString() : undefined,
      blockedBy: isBlocked ? adminName || 'Admin' : undefined,
      canReceiveOrders: isBlocked ? false : (existing.canReceiveOrders !== undefined ? existing.canReceiveOrders : true),
      updatedAt: new Date().toISOString(),
    };
    this.shops.set(shopId, updated);
    this.notify();
    try {
      await setDoc(doc(db, 'shops', shopId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] blockShop note (stored locally):', e?.message || e);
    }
  }

  public async deleteUser(uid: string) {
    this.users.delete(uid);
    this.wallets.delete(uid);
    this.walletTransactions.delete(uid);
    this.scheduleLocalStoreSave();
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
      isSuperAdmin: !isAdmin ? false : existing.isSuperAdmin,
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

  public async setSuperAdminRole(uid: string, isSuperAdmin: boolean) {
    const existing = this.users.get(uid);
    if (!existing) return;
    const updated: UserProfile = {
      ...existing,
      isAdmin: isSuperAdmin ? true : existing.isAdmin,
      isSuperAdmin,
      role: isSuperAdmin ? 'admin' : (existing.isAdmin ? 'admin' : (existing.isHelper ? 'helper' : 'customer')),
      lastActiveMode: isSuperAdmin ? 'admin' : existing.lastActiveMode,
    };
    this.users.set(uid, updated);
    this.notify();
    try {
      await setDoc(doc(db, 'users', uid), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] setSuperAdminRole note (stored locally):', e?.message || e);
    }
  }


  public async getOrder(orderId: string): Promise<Order | undefined> {
    const result = await this.fetchOrder(orderId, 2);
    return result.state === 'found' ? result.order : undefined;
  }

  /**
   * The cached order, or failing that the server's — telling "it does not
   * exist" apart from "couldn't ask".
   *
   * getOrder() answers undefined for both, and screens took that to mean the
   * order was gone: a helper opening an order from a notification got "order
   * not found" whenever the read happened to fail — most often because it ran
   * during the reconnect the same tap had just set off (whenNetworkReady).
   */
  public async fetchOrder(orderId: string, attempts = 3): Promise<OrderFetchResult> {
    if (!orderId) return { state: 'missing' };
    for (let attempt = 0; attempt < attempts; attempt++) {
      const existing = this.orders.get(orderId);
      if (existing) return { state: 'found', order: existing };
      await this.whenNetworkReady();
      try {
        // Rejects, rather than reporting "doesn't exist", while offline.
        const snap = await getDoc(doc(db, 'orders', orderId));
        if (!snap.exists()) return { state: 'missing' };
        const order = this.resolveOrderLocations(snap.data() as Order);
        this.orders.set(orderId, order);
        this.notify();
        return { state: 'found', order };
      } catch (e: any) {
        console.warn('[Firestore] fetchOrder note:', e?.message || e);
        if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
    return { state: 'unreachable' };
  }

  public async addOrder(order: Order) {
    const customer = this.users.get(order.customerId);
    if (customer?.isBlocked) {
      throw new Error('আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত করা হয়েছে। নতুন রিকোয়েস্ট তৈরি করা সম্ভব নয়।');
    }

    // 1. Temporarily place in local memory
    this.orders.set(order.id, order);
    this.notify();

    // 2. Persist to Firestore FIRST — must succeed before alerting helpers
    try {
      await setDoc(doc(db, 'orders', order.id), cleanForFirestore(order));
    } catch (e: any) {
      // Rollback local memory so app state matches server truth
      this.orders.delete(order.id);
      this.notify();
      console.error('[Firestore] addOrder failed to persist to Firestore:', e?.message || e);
      throw e;
    }

    // 3. ONLY after the order is confirmed in Firestore, dispatch helper notification
    const rule = this.pricingSettings.orderReceiverRule || 'commuter_first';
    const targetGroup =
      rule === 'dedicated_first'
        ? 'all-dedicated-helpers'
        : rule === 'both_simultaneous'
          ? 'all-helpers'
          : 'all-commuter-helpers';

    const itemDesc = order.items.map((i) => i.name).join(', ') || order.title;
    try {
      await this.addNotification({
        // Tied to the order, so a retry of addOrder cannot announce it twice.
        id: `notif-${new Date(order.createdAt).getTime()}-new-${order.id}`,
        userId: targetGroup,
        title: `নতুন সার্ভিস রিকোয়েস্ট: ${order.title}`,
        body: `বিবরণ: ${itemDesc} (${order.pickupLocation?.address ? 'পিকআপ: ' + order.pickupLocation.address + ' | ' : ''}ডেলিভারি: ${order.deliveryLocation.address})`,
        orderId: order.id,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'helper',
        type: 'new_order',
      });
    } catch (notifErr: any) {
      console.warn('[Firestore] Broadcast new order notification note:', notifErr?.message || notifErr);
      // Non-blocking notification error: do NOT fail the order since it was already saved
    }
  }

  public async deleteOrder(orderId: string) {
    this.orders.delete(orderId);
    this.scheduleLocalStoreSave();
    this.notify();
    try {
      await deleteDoc(doc(db, 'orders', orderId));
    } catch (e: any) {
      console.warn('[Firestore] deleteOrder note:', e?.message || e);
    }
  }

  /**
   * Subscribes to order changes that were refused: `conflict` when the order
   * had moved on since this device last saw it, `missing` when it no longer
   * exists. The screen has already been put back to the server's version; this
   * is for telling the user why their tap did nothing.
   */
  public onOrderWriteIssue(listener: (issue: 'conflict' | 'missing', orderId: string) => void): () => void {
    this._orderWriteIssueListeners.add(listener);
    return () => {
      this._orderWriteIssueListeners.delete(listener);
    };
  }

  /**
   * Changes an order: `updater` receives the current order and returns the
   * new one.
   *
   * The change is shown on this device at once, then committed in a
   * transaction that runs `updater` again on the server's copy and writes only
   * the fields it changed (see changedFields). So an edit made from a copy that
   * has fallen behind can no longer undo what happened in between — a customer
   * editing an order a helper accepted a moment ago changes the details, not
   * the status and the helper. `updater` must therefore be a pure function of
   * its argument; it runs more than once.
   *
   * A change of status or helper made from a copy that was behind on exactly
   * that is refused instead (isStaleOrderAction) and reported through
   * onOrderWriteIssue.
   *
   * Without a connection the transaction cannot run, and the changed fields
   * are queued for the SDK to send on reconnect, as before.
   */
  public async updateOrder(orderId: string, updater: (order: Order) => Order): Promise<OrderWriteOutcome> {
    const cached = this.orders.get(orderId);
    let optimistic: Order | undefined;
    if (cached) {
      optimistic = { ...this.withDeliveryFlags(cached, updater(cached)), updatedAt: new Date().toISOString() };
      this.orders.set(orderId, optimistic);
      this.notify();
    }

    // One at a time per order: a second change must find the first one on the
    // server, or its own baseline would look stale.
    const previous = this._orderWrites.get(orderId) ?? Promise.resolve();
    const run: Promise<OrderWriteOutcome> = previous
      .catch(() => { })
      .then(() => this.commitOrderUpdate(orderId, updater, cached, optimistic, () => this._orderWrites.get(orderId) === run));
    this._orderWrites.set(orderId, run);
    run.catch(() => { }).finally(() => {
      if (this._orderWrites.get(orderId) === run) this._orderWrites.delete(orderId);
    });
    return run;
  }

  /**
   * @param cached the order as this device held it before the change
   * @param optimistic `cached` with the change applied, already on screen
   * @param isLatest false once a later change to the same order is waiting
   *   behind this one — its optimistic copy is on screen and must stay there
   */
  private async commitOrderUpdate(
    orderId: string,
    updater: (order: Order) => Order,
    cached: Order | undefined,
    optimistic: Order | undefined,
    isLatest: () => boolean
  ): Promise<OrderWriteOutcome> {
    const ref = doc(db, 'orders', orderId);
    const now = new Date().toISOString();
    type Commit =
      | { kind: 'saved'; before: Order; after: Order }
      | { kind: 'unchanged' | 'conflict'; before: Order }
      | { kind: 'missing' };

    let commit: Commit | null = null;
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      try {
        await this.whenNetworkReady();
        // A change to this order queued while offline goes first, if it can
        // be sent now: until it has landed, the server's copy is behind this
        // device's, and that must not be mistaken for the reverse.
        const queued = this._queuedOrderWrites.get(orderId);
        if (queued) await Promise.race([queued, new Promise((resolve) => setTimeout(resolve, 4000))]);
        commit = await runTransaction(db, async (tx): Promise<Commit> => {
          const snap = await tx.get(ref);
          if (!snap.exists()) return { kind: 'missing' };
          const stored = snap.data() as Order;
          // An order left PENDING with a helper on it (see the self-healing in
          // resolveOrderLocations) is read as accepted, as every screen
          // already shows it, and is put right by this write.
          const before: Order = stored.helperId && stored.status === 'PENDING' ? { ...stored, status: 'ACCEPTED' } : stored;
          let after: Order;
          try {
            after = this.withDeliveryFlags(before, updater(before));
          } catch (_) {
            // The server's copy lacks what this action builds on.
            return { kind: 'conflict', before };
          }
          if (this.isStaleOrderAction(cached, optimistic, before, after)) return { kind: 'conflict', before };
          const patch = changedFields(stored, after);
          if (Object.keys(patch).length === 0) return { kind: 'unchanged', before };
          tx.update(ref, { ...patch, updatedAt: now });
          return { kind: 'saved', before, after: { ...after, updatedAt: now } };
        });
      } catch (e: any) {
        console.warn('[Firestore] updateOrder: server not reached, queueing the change:', e?.message || e);
      }
    }

    if (commit?.kind === 'missing') {
      if (this.orders.delete(orderId)) this.notify();
      this._orderWriteIssueListeners.forEach((l) => l('missing', orderId));
      return 'missing';
    }
    if (commit?.kind === 'conflict' || commit?.kind === 'unchanged') {
      if (isLatest()) {
        this.orders.set(orderId, this.resolveOrderLocations(commit.before));
        this.notify();
      }
      if (commit.kind === 'conflict') this._orderWriteIssueListeners.forEach((l) => l('conflict', orderId));
      return commit.kind;
    }

    let before: Order;
    let after: Order;
    if (commit?.kind === 'saved') {
      ({ before, after } = commit);
      if (isLatest()) this.orders.set(orderId, this.resolveOrderLocations(after));
    } else {
      if (!cached || !optimistic) return 'failed';
      before = cached;
      after = optimistic;
      const patch = changedFields(before, after);
      // Appended rather than replaced: this device's copy of a history may be
      // missing entries others have added since.
      (['statusHistory', 'editHistory'] as const).forEach((key) => {
        const was: unknown[] = before[key] || [];
        const is: unknown[] = after[key] || [];
        if (key in patch && is.length > was.length && JSON.stringify(is.slice(0, was.length)) === JSON.stringify(was)) {
          patch[key] = arrayUnion(...cleanForFirestore(is.slice(was.length)));
        }
      });
      // Not awaited: offline, the SDK holds the write and sends it on reconnect.
      const earlier = this._queuedOrderWrites.get(orderId) ?? Promise.resolve();
      const sent: Promise<void> = Promise.all([
        earlier,
        updateDoc(ref, patch).catch((e) => console.warn('[Firestore] updateOrder queued write note:', e?.message || e)),
      ]).then(() => {
        if (this._queuedOrderWrites.get(orderId) === sent) this._queuedOrderWrites.delete(orderId);
      });
      this._queuedOrderWrites.set(orderId, sent);
    }

    try {
      await this.runOrderSideEffects(orderId, before, after);
    } catch (e: any) {
      console.warn('[Firestore] updateOrder side effects note:', e?.message || e);
    }
    this.notify();
    return commit ? 'saved' : 'queued';
  }

  /**
   * Marks, on the change that delivers an order, the coin movements that go
   * with it. They are part of that same write so that the order is never seen
   * DELIVERED without them: the customer's own device deducts the coins itself
   * when it sees that (see the customer orders listener), and neither movement
   * can be repeated safely. runOrderSideEffects then moves the coins.
   */
  private withDeliveryFlags(existing: Order, updated: Order): Order {
    if (updated.status !== 'DELIVERED' || existing.status === 'DELIVERED' || !updated.customerId) return updated;
    const now = new Date().toISOString();
    const flagged = { ...updated };
    if ((flagged.isFreeDelivery || (flagged.coinsRedeemedForDelivery || 0) > 0) && !flagged.coinsDeductedForDelivery) {
      flagged.coinsDeductedForDelivery = true;
      flagged.coinsDeductedAt = now;
    }
    if (!flagged.coinsAwarded) {
      flagged.coinsAwarded = getCoinsForService(flagged.service, this.pricingSettings);
      flagged.coinsAwardedAt = now;
    }
    return flagged;
  }

  /**
   * Whether a change must be refused because the device making it had fallen
   * behind: `cached` is what it saw and `intended` what it meant to make of
   * that; `server` is what is true and `next` what the change makes of it.
   *
   * Only changes of status or helper are judged — anything else is merged
   * field by field and cannot do harm. A customer cancelling an order they
   * still see as PENDING, or a helper moving on an order that was cancelled or
   * given to someone else meanwhile, is acting on something that is no longer
   * so; they are shown the real state and can decide again. An admin's status
   * change is a deliberate override and goes through; only an assignment that
   * would replace a helper the admin had not seen yet is held back.
   */
  private isStaleOrderAction(cached: Order | undefined, intended: Order | undefined, server: Order, next: Order): boolean {
    const uid = this.currentUserId;
    const helperOf = (o: Order) => o.helperId || '';
    const asAdmin = Boolean(this._listenersRole?.startsWith('admin:')) || Boolean(uid && this.users.get(uid)?.isAdmin);

    // A helper, on an order that is someone else's by now.
    if (
      !asAdmin && uid && this._listenersRole === `helper:${uid}` &&
      server.customerId !== uid && helperOf(server) !== '' && helperOf(server) !== uid
    ) {
      return true;
    }

    if (!cached) return false;
    // Judged on what the user meant as well as on what it comes to: marking
    // an order delivered that already is, from a screen still showing it on
    // the way, changes nothing on the server but was a status change to them.
    const changesHelper =
      helperOf(next) !== helperOf(server) || Boolean(intended && helperOf(intended) !== helperOf(cached));
    const changesStatus = next.status !== server.status || Boolean(intended && intended.status !== cached.status);
    const staleHelper = helperOf(cached) !== helperOf(server);
    const staleStatus = cached.status !== server.status;
    if (asAdmin) return changesHelper && staleHelper;
    return (changesStatus || changesHelper) && (staleStatus || staleHelper);
  }

  /**
   * Everything that follows from an order having changed from `existing` to
   * `updated`: notifications, shop orders, the helper's wallet, coins.
   */
  private async runOrderSideEffects(orderId: string, existing: Order, updated: Order) {
    const previousStatus = existing.status;
    const previousHelperId = existing.helperId;

    // The helper it was taken from is told. Their order used to just vanish
    // from the Running list.
    if (previousHelperId && updated.helperId !== previousHelperId && updated.status !== 'CANCELED') {
      this.addNotification({
        id: `notif-unassign-${Date.now()}-${updated.id}`,
        userId: previousHelperId,
        title: 'অর্ডারটি আপনার কাছ থেকে সরানো হয়েছে',
        body: `অর্ডার #${updated.id} এডমিন কর্তৃক ${updated.helperId ? 'অন্য একজন হেলপারকে দেওয়া হয়েছে' : 'আপনার কাছ থেকে সরিয়ে নেওয়া হয়েছে'}।`,
        orderId: updated.id,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'helper',
        type: 'order_update',
      });
    }

    // If helper changed (e.g. reassigned or assigned to a new helper), reassign existing shopOrders to the new helper
    if (updated.helperId && updated.helperId !== previousHelperId) {
      this.reassignShopOrdersForOrder(orderId, updated.helperId, updated.helperName || 'Helper');
    }

    // Dynamic Notifications based on Order Status changes
    if (updated.status !== previousStatus) {
      let notifTitle = '';
      let notifBody = '';

      if (updated.status === 'ACCEPTED') {
        notifTitle = 'রিকোয়েস্ট একসেপ্ট করা হয়েছে!';
        notifBody = `${updated.helperName || 'হেলপার'} আপনার অর্ডার #${updated.id} গ্রহণ করেছেন।`;
      } else if (updated.status === 'PURCHASED_EXECUTED') {
        notifTitle = 'Helper Purchasing/Executing your task.';
        notifBody = `${updated.helperName || 'Helper'} is purchasing/executing your task right now. Please wait!`;
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

      // If order canceled, notify assigned helper ONLY if the order was accepted (has helperId)
      if (updated.status === 'CANCELED') {
        const helperTarget = updated.helperId || existing.helperId;
        if (helperTarget) {
          const isCustomerCancel = updated.cancellationRequest?.requestedBy === 'customer' || updated.statusHistory?.some(h => h.actor === 'Customer');
          const notifTitle = isCustomerCancel ? 'কাস্টমার অর্ডার বাতিল করেছেন' : 'অর্ডার বাতিল করা হয়েছে';
          const notifBody = isCustomerCancel
            ? `কাস্টমার আপনার অ্যাসাইন করা অর্ডার #${updated.id.slice(-6).toUpperCase() || updated.id} বাতিল করেছেন।`
            : `অর্ডার #${updated.id.slice(-6).toUpperCase() || updated.id} বাতিল করা হয়েছে।`;

          this.addNotification({
            id: `notif-cancel-hlp-${Date.now()}`,
            userId: helperTarget,
            title: notifTitle,
            body: notifBody,
            orderId: updated.id,
            read: false,
            createdAt: new Date().toISOString(),
            targetRole: 'helper',
            type: 'order_update',
          });
        }

        // Notify connected stores/shops involved in this order when main order is cancelled by anyone
        const relatedShopOrders = this.getShopOrdersForOrder(updated.id);
        relatedShopOrders.forEach((so) => {
          const shop = this.shops.get(so.shopId);
          const ownerId = shop?.ownerUserId || (so.shopId.startsWith('store-') ? so.shopId.replace('store-', '') : null);
          if (ownerId) {
            this.addNotification({
              id: `notif-store-canc-${Date.now()}-${so.id}`,
              userId: ownerId,
              title: 'অর্ডার বাতিল হয়েছে!',
              body: `মূল অর্ডার #${updated.id.slice(-6).toUpperCase()} বাতিল হওয়ায় আপনার স্টোরের অর্ডারটি বাতিল করা হয়েছে।`,
              orderId: updated.id,
              read: false,
              createdAt: new Date().toISOString(),
              targetRole: 'store',
              type: 'order_update',
            });
          }
        });
      }

      // Notify stores/shops involved in this order when completed (Requirement 4)
      if (updated.status === 'DELIVERED') {
        const relatedShopOrders = this.getShopOrdersForOrder(updated.id);
        relatedShopOrders.forEach((so) => {
          const shop = this.shops.get(so.shopId);
          const ownerId = shop?.ownerUserId || (so.shopId.startsWith('store-') ? so.shopId.replace('store-', '') : null);
          if (ownerId) {
            this.addNotification({
              id: `notif-store-comp-${Date.now()}-${so.id}`,
              userId: ownerId,
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

      // Update related shop orders status when main order is DELIVERED or CANCELED
      if (updated.status === 'DELIVERED' || updated.status === 'CANCELED' || (updated.status as string) === 'CANCELLED') {
        const relatedShopOrders = this.getShopOrdersForOrder(updated.id);
        const targetStatus: ShopOrderStatus = updated.status === 'DELIVERED' ? 'DELIVERED' : 'CANCELED';
        relatedShopOrders.forEach((so) => {
          if (so.status !== targetStatus) {
            if (updated.status === 'CANCELED' || (updated.status as string) === 'CANCELLED' || so.status === 'HANDOVER' || so.status === 'READY' || so.status === 'PREPARING' || so.status === 'ACCEPTED' || so.status === 'PENDING') {
              this.updateShopOrder(so.id, (prev) => ({
                ...prev,
                status: targetStatus,
                statusHistory: [
                  ...prev.statusHistory,
                  {
                    status: targetStatus,
                    timestamp: new Date().toISOString(),
                    actor: 'System',
                    note: `Main order #${updated.id} ${updated.status === 'DELIVERED' ? 'delivered' : 'canceled'}.`,
                  },
                ],
              }));
            }
          }
        });
        if (updated.status === 'CANCELED' || (updated.status as string) === 'CANCELLED') {
          this.cancelShopOrdersForOrder(updated.id).catch((e) => console.warn('[Firestore] cancelShopOrdersForOrder err:', e));
        }
      }
    }

    // Product cost addition / update notification to customer (suppressed if updated by helper)
    if (
      updated.productCost !== undefined &&
      existing.productCost !== updated.productCost &&
      updated.customerId &&
      updated.lastEditedBy !== 'helper'
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

    // Delivery fee update notification to customer & helper (customer notification suppressed if updated by helper)
    if (
      existing.deliveryFee !== undefined &&
      (existing.deliveryFee !== updated.deliveryFee || existing.originalDeliveryFee !== updated.originalDeliveryFee)
    ) {
      if (updated.customerId && updated.lastEditedBy !== 'helper') {
        this.addNotification({
          id: `notif-${Date.now()}-fee-change`,
          userId: updated.customerId,
          title: 'ডেলিভারি ফি আপডেট করা হয়েছে',
          body: `আপনার অর্ডার #${updated.id} এর ডেলিভারি চার্জ ৳${updated.deliveryFee} টাকা করা হয়েছে।${updated.feeAdjustment?.reason ? ` (${updated.feeAdjustment.reason})` : ''}`,
          orderId: updated.id,
          read: false,
          createdAt: new Date().toISOString(),
          targetRole: 'customer',
          type: 'order_update',
        });
      }

      const helperTarget = updated.helperId || existing.helperId;
      if (helperTarget) {
        this.addNotification({
          id: `notif-${Date.now()}-fee-change-hlp`,
          userId: helperTarget,
          title: 'ডেলিভারি ফি পরিবর্তিত হয়েছে',
          body: `অর্ডার #${updated.id} এর ডেলিভারি ফি ৳${existing.deliveryFee || 0} থেকে ৳${updated.deliveryFee || 0} এ সমন্বয় করা হয়েছে।${(updated.status === 'DELIVERED' || previousStatus === 'DELIVERED') ? ' আপনার ওয়ালেটেও নতুন ফি অনুযায়ী সমন্বয় করা হয়েছে।' : ''}`,
          orderId: updated.id,
          read: false,
          createdAt: new Date().toISOString(),
          targetRole: 'helper',
          type: 'order_update',
        });
      }
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

      // Save updated delivery address to customer's saved address history in localStorage & Firestore
      if (isDeliveryChanged && updated.customerId && updated.deliveryLocation?.address) {
        try {
          import('./storage').then(({ addSavedDeliveryAddress }) => {
            addSavedDeliveryAddress(updated.customerId, updated.deliveryLocation);
          });
          saveCustomerSavedAddressToFirestore(updated.customerId, updated.deliveryLocation).catch(() => { });
        } catch (e) {
          console.warn('[Firestore] Error saving updated address to customer history:', e);
        }
      }

      // Save updated pickup address to customer's saved pickup address history & per-service in localStorage & Firestore
      if (isPickupChanged && updated.customerId && updated.pickupLocation?.address && updated.pickupLocation.address !== 'Local Helper Area') {
        try {
          import('./storage').then(({ addSavedPickupAddress, saveServicePickupLocation }) => {
            addSavedPickupAddress(updated.customerId, updated.pickupLocation!);
            if (updated.service) {
              saveServicePickupLocation(updated.service, updated.pickupLocation!, updated.customerId);
            }
          });
          saveCustomerPickupAddressToFirestore(updated.customerId, updated.pickupLocation, updated.service).catch(() => { });
        } catch (e) {
          console.warn('[Firestore] Error saving updated pickup address to customer history:', e);
        }
      }
    }

    // Admin items or general info edit notification to customer (suppressed if edited by helper)
    if (
      updated.lastEditedBy === 'admin' &&
      existing.lastEditedAt !== updated.lastEditedAt &&
      updated.customerId &&
      (JSON.stringify(existing.items) !== JSON.stringify(updated.items) ||
        existing.title !== updated.title ||
        existing.additionalNote !== updated.additionalNote)
    ) {
      this.addNotification({
        id: `notif-${Date.now()}-general-edit`,
        userId: updated.customerId,
        title: 'অর্ডার আপডেট করা হয়েছে (Order Updated)',
        body: `এডমিন আপনার অর্ডার #${updated.id} এর বিবরণ বা পণ্য তালিকা পরিবর্তন করেছেন।`,
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

    // Helper Wallet Management (Order completion, cancellation reversals, or admin fee adjustments)
    if ((previousStatus === 'DELIVERED' || updated.status === 'DELIVERED') && (updated.helperId || existing.helperId)) {
      const helperId = updated.helperId || existing.helperId;
      const minFee = this.pricingSettings.feeCalculatorMinFee ?? 0;

      if (helperId) {
        if (updated.status === 'DELIVERED' && previousStatus !== 'DELIVERED') {
          // Newly delivered: Credit helper earnings & platform commission
          const baseFeeForHelper = updated.isFreeDelivery
            ? Math.max(updated.originalDeliveryFee || 0, minFee)
            : Math.max(updated.deliveryFee || 0, minFee);
          const helperShare = calculateHelperCommission(baseFeeForHelper, this.pricingSettings);
          await this.creditHelperEarning(helperId, helperShare, baseFeeForHelper, updated.id);
        } else if (previousStatus === 'DELIVERED' && updated.status !== 'DELIVERED') {
          // Status reverted/canceled from DELIVERED: Reverse previously credited earnings
          const baseFeeForHelper = existing.isFreeDelivery
            ? Math.max(existing.originalDeliveryFee || 0, minFee)
            : Math.max(existing.deliveryFee || 0, minFee);
          const helperShare = calculateHelperCommission(baseFeeForHelper, this.pricingSettings);
          const platformShare = Math.max(0, baseFeeForHelper - helperShare);
          await this.adjustHelperWalletForOrder(helperId, -helperShare, -platformShare, baseFeeForHelper, 0, updated.id, 'reversal');
        } else if (previousStatus === 'DELIVERED' && updated.status === 'DELIVERED') {
          // Already DELIVERED order was edited
          if (previousHelperId && updated.helperId && previousHelperId !== updated.helperId) {
            // Helper was reassigned on an already delivered order
            const prevFee = existing.isFreeDelivery
              ? Math.max(existing.originalDeliveryFee || 0, minFee)
              : Math.max(existing.deliveryFee || 0, minFee);
            const prevHelperShare = calculateHelperCommission(prevFee, this.pricingSettings);
            const prevPlatformShare = Math.max(0, prevFee - prevHelperShare);
            await this.adjustHelperWalletForOrder(previousHelperId, -prevHelperShare, -prevPlatformShare, prevFee, 0, updated.id, 'reversal');

            const newFee = updated.isFreeDelivery
              ? Math.max(updated.originalDeliveryFee || 0, minFee)
              : Math.max(updated.deliveryFee || 0, minFee);
            const newHelperShare = calculateHelperCommission(newFee, this.pricingSettings);
            await this.creditHelperEarning(updated.helperId, newHelperShare, newFee, updated.id);
          } else {
            // Delivery fee or free-delivery settings adjusted on an already delivered order
            const oldBaseFee = existing.isFreeDelivery
              ? Math.max(existing.originalDeliveryFee || 0, minFee)
              : Math.max(existing.deliveryFee || 0, minFee);
            const newBaseFee = updated.isFreeDelivery
              ? Math.max(updated.originalDeliveryFee || 0, minFee)
              : Math.max(updated.deliveryFee || 0, minFee);

            const oldHelperShare = calculateHelperCommission(oldBaseFee, this.pricingSettings);
            const newHelperShare = calculateHelperCommission(newBaseFee, this.pricingSettings);

            const oldPlatformShare = Math.max(0, oldBaseFee - oldHelperShare);
            const newPlatformShare = Math.max(0, newBaseFee - newHelperShare);

            const diffHelperShare = newHelperShare - oldHelperShare;
            const diffPlatformShare = newPlatformShare - oldPlatformShare;

            if (diffHelperShare !== 0 || diffPlatformShare !== 0) {
              await this.adjustHelperWalletForOrder(helperId, diffHelperShare, diffPlatformShare, oldBaseFee, newBaseFee, updated.id, 'adjustment');
            }
          }
        }
      }
    }

    // Deduct coins for free delivery reward when order is DELIVERED
    if (
      updated.status === 'DELIVERED' &&
      previousStatus !== 'DELIVERED' &&
      updated.customerId &&
      updated.coinsDeductedForDelivery &&
      !existing.coinsDeductedForDelivery
    ) {
      // Flagged by withDeliveryFlags in the write that delivered the order.
      const coinsToDeduct = updated.coinsRedeemedForDelivery || this.pricingSettings.freeDeliveryRequiredCoins || 50;
      await this.deductCoinsForFreeDelivery(updated.customerId, coinsToDeduct, updated.id);

      this.addNotification({
        id: `notif-${Date.now()}-free-delivery-deduct`,
        userId: updated.customerId,
        title: '🎁 ফ্রি ডেলিভারি রিওয়ার্ড সম্পন্ন',
        body: `আপনার অর্ডার #${updated.id} সফলভাবে ডেলিভারি হওয়ায় ফ্রি ডেলিভারির জন্য ${coinsToDeduct} কয়েন কাটা হয়েছে।`,
        orderId: updated.id,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'customer',
        type: 'status_update',
      });
    }

    // Award customer gamification coins on order completion
    if (updated.status === 'DELIVERED' && previousStatus !== 'DELIVERED' && updated.customerId && updated.coinsAwarded && !existing.coinsAwarded) {
      const earnedCoins = updated.coinsAwarded;

      await this.awardCoinsToCustomer(updated.customerId, earnedCoins, updated.id);

      // Add coin notification to customer
      this.addNotification({
        id: `notif-${Date.now()}-coins`,
        userId: updated.customerId,
        title: '🪙 আপনি জামানত কয়েন জিতেছেন!',
        body: `অভিনন্দন! অর্ডার #${updated.id} সম্পন্ন করায় আপনি +${earnedCoins} কয়েন পেয়েছেন। আপনার কয়েন দিয়ে ফ্রি ডেলিভারি ও আকর্ষণীয় গিফট ক্লেইম করুন!`,
        orderId: updated.id,
        read: false,
        createdAt: new Date().toISOString(),
        targetRole: 'customer',
        type: 'coins_earned',
      });
    }

    // Auto-settle previous due payments when an order with appliedDuePayment is DELIVERED
    if (updated.status === 'DELIVERED' && updated.appliedDuePayment?.sourceOrderIds?.length) {
      for (const srcId of updated.appliedDuePayment.sourceOrderIds) {
        const srcOrder = this.orders.get(srcId);
        if (srcOrder && srcOrder.duePayment && srcOrder.duePayment.status !== 'PAID') {
          const updatedSrc: Order = {
            ...srcOrder,
            duePayment: {
              ...srcOrder.duePayment,
              status: 'PAID',
              paidInOrderId: updated.id,
              updatedAt: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          };
          this.orders.set(srcId, updatedSrc);
          updateDoc(doc(db, 'orders', srcId), {
            duePayment: cleanForFirestore(updatedSrc.duePayment),
            updatedAt: updatedSrc.updatedAt,
          }).catch((e) => console.warn('[Firestore] error updating source due payment status:', e?.message || e));
        }
      }
    }
  }

  public async removeOrderDuePayment(orderId: string) {
    let existing = this.orders.get(orderId);
    if (!existing) {
      existing = await this.getOrder(orderId);
    }
    if (!existing) return;

    const updated: Order = { ...existing };
    delete updated.duePayment;
    updated.updatedAt = new Date().toISOString();
    this.orders.set(orderId, updated);
    this.notify();

    try {
      if (db) {
        await updateDoc(doc(db, 'orders', orderId), {
          duePayment: deleteField(),
          updatedAt: updated.updatedAt,
        });
      }
    } catch (e: any) {
      console.warn('[Firestore] removeOrderDuePayment note:', e?.message || e);
    }
  }

  public getCustomerUnpaidDuePayments(customerId: string): { totalAmount: number; notes: string[]; sourceOrderIds: string[] } {
    let totalAmount = 0;
    const notes: string[] = [];
    const sourceOrderIds: string[] = [];

    this.orders.forEach((ord) => {
      if (
        ord.customerId === customerId &&
        ord.status === 'DELIVERED' &&
        ord.duePayment &&
        ord.duePayment.amount > 0 &&
        ord.duePayment.status !== 'PAID'
      ) {
        totalAmount += ord.duePayment.amount;
        if (ord.duePayment.note) {
          notes.push(ord.duePayment.note);
        }
        sourceOrderIds.push(ord.id);
      }
    });

    return {
      totalAmount,
      notes,
      sourceOrderIds,
    };
  }

  // ─── Shop Orders (Helper → Store ordering system) ──────────────────────────

  public markShopOrderViewed(id: string) {
    const existing = this.shopOrders.get(id);
    if (!existing || existing.viewedByStore) return;
    this.updateShopOrder(id, (so) => ({ ...so, viewedByStore: true }), 'store');
  }

  public async addShopOrder(shopOrder: ShopOrder): Promise<void> {
    const shop = this.shops.get(shopOrder.shopId);
    if (shop?.isBlocked) {
      throw new Error('এই স্টোরটি বর্তমানে সাময়িকভাবে স্থগিত রয়েছে।');
    }
    this.shopOrders.set(shopOrder.id, shopOrder);
    this.notify();
    try {
      await setDoc(doc(db, 'shopOrders', shopOrder.id), cleanForFirestore(shopOrder));
    } catch (e: any) {
      this.shopOrders.delete(shopOrder.id);
      this.notify();
      console.error('[Firestore] addShopOrder failed to persist to Firestore:', e?.message || e);
      throw e;
    }

    // Notify the store owner if we know their userId
    try {
      if (shop?.ownerUserId) {
        await this.addNotification({
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
    } catch (notifErr: any) {
      console.warn('[Firestore] Broadcast shop order notification note:', notifErr?.message || notifErr);
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
        DELIVERED: 'ডেলিভার্ড',
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
    this.scheduleLocalStoreSave();
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

  public async reassignShopOrdersForOrder(parentOrderId: string, newHelperId: string, newHelperName: string) {
    try {
      const toUpdate: ShopOrder[] = [];

      // Update in-memory shopOrders
      this.shopOrders.forEach((so) => {
        if (so.parentOrderId === parentOrderId && so.helperId !== newHelperId) {
          const updatedSo: ShopOrder = {
            ...so,
            helperId: newHelperId,
            helperName: newHelperName,
            updatedAt: new Date().toISOString(),
          };
          this.shopOrders.set(so.id, updatedSo);
          toUpdate.push(updatedSo);
        }
      });

      // Fetch from Firestore by parentOrderId to catch any shopOrders not yet loaded in memory
      const snap = await getDocs(
        query(collection(db, 'shopOrders'), where('parentOrderId', '==', parentOrderId))
      );

      snap.forEach((docSnap) => {
        const so = docSnap.data() as ShopOrder;
        if (so && so.id && so.helperId !== newHelperId) {
          const updatedSo: ShopOrder = {
            ...so,
            helperId: newHelperId,
            helperName: newHelperName,
            updatedAt: new Date().toISOString(),
          };
          this.shopOrders.set(so.id, updatedSo);
          if (!toUpdate.some((u) => u.id === so.id)) {
            toUpdate.push(updatedSo);
          }
        }
      });

      // Persist all updated shopOrders to Firestore
      for (const updatedSo of toUpdate) {
        await setDoc(doc(db, 'shopOrders', updatedSo.id), cleanForFirestore(updatedSo), { merge: true });
      }

      if (toUpdate.length > 0) {
        this.notify();
      }
    } catch (e: any) {
      console.warn('[Firestore] reassignShopOrdersForOrder note:', e?.message || e);
    }
  }

  public async cancelShopOrdersForOrder(parentOrderId: string) {
    try {
      const toUpdate: ShopOrder[] = [];

      // Update in-memory
      this.shopOrders.forEach((so) => {
        if (so.parentOrderId === parentOrderId && so.status !== 'CANCELED') {
          const updatedSo: ShopOrder = {
            ...so,
            status: 'CANCELED',
            updatedAt: new Date().toISOString(),
            statusHistory: [
              ...(so.statusHistory || []),
              {
                status: 'CANCELED',
                timestamp: new Date().toISOString(),
                actor: 'System',
                note: `Main order #${parentOrderId} canceled.`,
              },
            ],
          };
          this.shopOrders.set(so.id, updatedSo);
          toUpdate.push(updatedSo);
        }
      });

      // Fetch from Firestore by parentOrderId to catch any shopOrders not in memory
      const snap = await getDocs(
        query(collection(db, 'shopOrders'), where('parentOrderId', '==', parentOrderId))
      );

      snap.forEach((docSnap) => {
        const so = docSnap.data() as ShopOrder;
        if (so && so.id && so.status !== 'CANCELED') {
          const updatedSo: ShopOrder = {
            ...so,
            status: 'CANCELED',
            updatedAt: new Date().toISOString(),
            statusHistory: [
              ...(so.statusHistory || []),
              {
                status: 'CANCELED',
                timestamp: new Date().toISOString(),
                actor: 'System',
                note: `Main order #${parentOrderId} canceled.`,
              },
            ],
          };
          this.shopOrders.set(so.id, updatedSo);
          if (!toUpdate.some((u) => u.id === so.id)) {
            toUpdate.push(updatedSo);
          }
        }
      });

      // Persist all updated shopOrders to Firestore
      for (const updatedSo of toUpdate) {
        await setDoc(doc(db, 'shopOrders', updatedSo.id), cleanForFirestore(updatedSo), { merge: true });
      }

      if (toUpdate.length > 0) {
        this.notify();
      }
    } catch (e: any) {
      console.warn('[Firestore] cancelShopOrdersForOrder note:', e?.message || e);
    }
  }

  public async fetchShopOrdersForOrder(parentOrderId: string, currentHelperId?: string, currentHelperName?: string): Promise<ShopOrder[]> {
    try {
      const snap = await getDocs(
        query(collection(db, 'shopOrders'), where('parentOrderId', '==', parentOrderId))
      );
      const fetched: ShopOrder[] = [];
      const updatesToPersist: ShopOrder[] = [];

      snap.forEach((docSnap) => {
        let so = docSnap.data() as ShopOrder;
        if (so && so.id) {
          if (currentHelperId && so.helperId !== currentHelperId) {
            so = {
              ...so,
              helperId: currentHelperId,
              helperName: currentHelperName || so.helperName || 'Helper',
              updatedAt: new Date().toISOString(),
            };
            updatesToPersist.push(so);
          }
          this.shopOrders.set(so.id, so);
          fetched.push(so);
        }
      });

      for (const updatedSo of updatesToPersist) {
        await setDoc(doc(db, 'shopOrders', updatedSo.id), cleanForFirestore(updatedSo), { merge: true });
      }

      if (snap.size > 0) {
        this.notify();
      }
      return fetched.length > 0 ? fetched : this.getShopOrdersForOrder(parentOrderId);
    } catch (e: any) {
      console.warn('[Firestore] fetchShopOrdersForOrder note:', e?.message || e);
      return this.getShopOrdersForOrder(parentOrderId);
    }
  }

  public async getAllShopOrders(): Promise<ShopOrder[]> {
    try {
      const snap = await getDocs(query(collection(db, 'shopOrders'), orderBy('createdAt', 'desc'), limit(1000)));
      const map = new Map<string, ShopOrder>();
      snap.docs.forEach((d) => {
        const so = d.data() as ShopOrder;
        if (so && so.id) {
          map.set(d.id, so);
        }
      });
      this.shopOrders = map;
      this.scheduleLocalStoreSave();
      this.notify();
      return Array.from(map.values());
    } catch (e: any) {
      try {
        const snap2 = await getDocs(query(collection(db, 'shopOrders'), limit(1000)));
        const map2 = new Map<string, ShopOrder>();
        snap2.docs.forEach((d) => {
          const so = d.data() as ShopOrder;
          if (so && so.id) {
            map2.set(d.id, so);
          }
        });
        this.shopOrders = map2;
        this.scheduleLocalStoreSave();
        this.notify();
        return Array.from(map2.values());
      } catch (err) {
        console.warn('[Firestore] getAllShopOrders fallback note:', err);
        return Array.from(this.shopOrders.values());
      }
    }
  }

  public async deleteShopOrdersBulk(shopOrderIds: string[]): Promise<void> {
    for (const id of shopOrderIds) {
      await this.deleteShopOrder(id);
    }
  }

  public async updateShopOrderDetails(
    shopOrderId: string,
    updates: Partial<ShopOrder>,
    adminName?: string
  ): Promise<void> {
    const existing = this.shopOrders.get(shopOrderId);
    if (!existing) return;

    const historyItem: import('@/types').ShopOrderStatusHistoryItem | undefined =
      updates.status && updates.status !== existing.status
        ? {
          status: updates.status,
          timestamp: new Date().toISOString(),
          actor: adminName || 'Admin',
          note: updates.note || `Status changed to ${updates.status} by Admin`,
        }
        : undefined;

    const updated: ShopOrder = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      statusHistory: historyItem
        ? [...(existing.statusHistory || []), historyItem]
        : existing.statusHistory || [],
    };

    this.shopOrders.set(shopOrderId, updated);
    this.notify();
    try {
      await setDoc(doc(db, 'shopOrders', shopOrderId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] updateShopOrderDetails note:', e?.message || e);
    }
  }


  public async fetchCustomerOrders(userId: string): Promise<Order[]> {
    const own = () => Array.from(this.orders.values()).filter((o) => o.customerId === userId);
    if (!userId || !db) return own();
    const windowSize = 100; // matches the customer orders listener
    try {
      let ordered = true;
      let snap: QuerySnapshot<DocumentData>;
      try {
        snap = await getDocs(
          query(collection(db, 'orders'), where('customerId', '==', userId), orderBy('createdAt', 'desc'), limit(windowSize))
        );
      } catch (e: any) {
        if (e?.code !== 'failed-precondition') throw e;
        // Index not deployed yet (see _listenNewestFirst).
        ordered = false;
        snap = await getDocs(query(collection(db, 'orders'), where('customerId', '==', userId), limit(windowSize)));
      }
      const firestoreIds = new Set<string>();
      snap.forEach((docSnap) => {
        const orderData = docSnap.data() as Order;
        if (orderData && orderData.id) {
          this.orders.set(orderData.id, orderData);
          firestoreIds.add(orderData.id);
        }
      });
      // Evict locally-cached orders that no longer exist in Firestore (e.g.
      // deleted by admin). Only orders inside the range this read covered can
      // be judged: past the window, an order missing from the result is just
      // older, and evicting those emptied heavy accounts' history on every
      // focus — the read used to be 50 unordered orders.
      const complete = snap.size < windowSize;
      const oldestRead = ordered && snap.size > 0
        ? (snap.docs[snap.docs.length - 1].data() as Order).createdAt || ''
        : null;
      if (complete || oldestRead !== null) {
        for (const [id, order] of Array.from(this.orders.entries())) {
          if (order.customerId !== userId || firestoreIds.has(id)) continue;
          if (complete || (order.createdAt || '') >= (oldestRead as string)) this.orders.delete(id);
        }
      }
      this.notify();
      return own();
    } catch (e: any) {
      console.warn('[Firestore] fetchCustomerOrders note:', e?.message || e);
      return own();
    }
  }

  // Where each account's "load older" paging has got to, keyed `${field}:${uid}`.
  private _olderOrdersCursor: Map<string, string> = new Map();

  /**
   * Pages in an account's orders older than its live listener's window (the
   * newest 100 for a customer, 200 for a helper). Returns whether more remain.
   * Needs the same createdAt index as those listeners; until it is deployed
   * this reports nothing more rather than failing.
   */
  public async loadOlderOrders(field: 'customerId' | 'helperId', uid: string, pageSize = 50): Promise<boolean> {
    if (!uid || !db) return false;
    const key = `${field}:${uid}`;
    let cursor = this._olderOrdersCursor.get(key);
    if (!cursor) {
      // Start below the oldest finished order already held. Open orders are
      // left out: an old one still in progress would make the paging jump
      // past everything between it and the window.
      this.orders.forEach((o) => {
        if (o[field] !== uid || !o.createdAt || o.status === 'PENDING') return;
        if (o.status !== 'DELIVERED' && o.status !== 'CANCELED') return;
        if (!cursor || o.createdAt < cursor) cursor = o.createdAt;
      });
    }
    if (!cursor) return false;
    try {
      const snap = await getDocs(
        query(collection(db, 'orders'), where(field, '==', uid), orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize))
      );
      snap.docs.forEach((d) => this.orders.set(d.id, this.resolveOrderLocations(d.data() as Order)));
      if (snap.size > 0) {
        this._olderOrdersCursor.set(key, (snap.docs[snap.docs.length - 1].data() as Order).createdAt);
        this.notify();
      }
      return snap.size === pageSize;
    } catch (e: any) {
      console.warn('[Firestore] loadOlderOrders note:', e?.message || e);
      return false;
    }
  }

  public getShopOrdersForStore(shopId: string): ShopOrder[] {
    return Array.from(this.shopOrders.values())
      .filter((so) => so.shopId === shopId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getHelperWallet(helperId: string): Wallet {
    const allOrders = Array.from(this.orders.values());
    const helperOrders = allOrders.filter(
      (o) => o.helperId === helperId && (o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED')
    );
    const helperOrderIds = new Set(helperOrders.map((o) => o.id));

    // All approved withdrawals are the single source of truth for paid commission.
    // Manual paybacks recorded by admin also create an APPROVED withdrawal record.
    const approvedWithdrawals = Array.from(this.withdrawals.values()).filter(
      (w) => w.helperId === helperId && w.status === 'APPROVED'
    );

    let totalEarned = 0;
    let totalPlatformShare = 0;

    const minFee = this.pricingSettings.feeCalculatorMinFee ?? 20;
    helperOrders.forEach((o) => {
      const baseFeeForHelper = o.isFreeDelivery
        ? Math.max(o.originalDeliveryFee || 0, minFee)
        : Math.max(o.deliveryFee || 0, minFee);
      const helperShare = calculateHelperCommission(baseFeeForHelper, this.pricingSettings);
      totalEarned += helperShare;
      totalPlatformShare += (baseFeeForHelper - helperShare);
    });

    // Store Order amounts and commissions calculation
    let returnableStoreAmount = 0;
    let nonAcceptableStoreCommission = 0;

    const allShopOrders = Array.from(this.shopOrders.values());
    const validHelperShopOrders = allShopOrders.filter((so) => {
      if (so.status === 'CANCELED') return false;
      if (so.helperId === helperId || (so.parentOrderId && helperOrderIds.has(so.parentOrderId))) {
        const parentOrder = this.orders.get(so.parentOrderId);
        return parentOrder ? (parentOrder.status === 'DELIVERED' || (parentOrder.status as string) === 'COMPLETED') : true;
      }
      return false;
    });

    validHelperShopOrders.forEach((so) => {
      const price = so.price || 0;
      if (price <= 0) return;

      const isMyself = so.shopId === 'myself';
      const shop = !isMyself ? this.shops.get(so.shopId) : null;
      const canReceive = !isMyself && !!shop && shop.canReceiveOrders !== false;

      if (canReceive) {
        // Registered order-acceptable store: full store order amount is returnable to company
        returnableStoreAmount += price;
      } else {
        // Non-order-acceptable store: commission on store order is added to amount owed to company
        let commissionRate = Number(shop?.commissionPercent);
        if (isNaN(commissionRate) || shop?.commissionPercent === undefined) {
          const app = Array.from(this.storeApplications.values()).find(
            (a) => a.id === shop?.applicationId || (shop?.ownerUserId && a.userId === shop.ownerUserId)
          );
          commissionRate = Number(app?.commissionPercent) || 0;
        }
        if (commissionRate > 0) {
          const comm = Math.round(price * (commissionRate / 100));
          nonAcceptableStoreCommission += comm;
        }
      }
    });

    const totalPayableToCompany = totalPlatformShare + returnableStoreAmount + nonAcceptableStoreCommission;
    const totalPaidCommission = approvedWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    const balance = Math.max(0, totalPayableToCompany - totalPaidCommission);

    return {
      userId: helperId,
      balance,
      totalEarned,
      totalWithdrawn: totalPaidCommission,
      totalPaidCommission,
      updatedAt: new Date().toISOString(),
    };
  }

  public getStoreWallet(
    storeUserId: string,
    storeId?: string,
    cachedParentOrders?: Record<string, Order>,
    extraShopOrders?: ShopOrder[]
  ): Wallet {
    const targetStoreId = storeId || `store-${storeUserId}`;
    const shopDoc = this.shops.get(targetStoreId) || Array.from(this.shops.values()).find(
      (s) => s.id === targetStoreId || s.ownerUserId === storeUserId || s.id === `store-${storeUserId}`
    );

    let commissionRate = Number(shopDoc?.commissionPercent);
    if (isNaN(commissionRate) || shopDoc?.commissionPercent === undefined) {
      const app = Array.from(this.storeApplications.values()).find(
        (a) => a.userId === storeUserId || a.id === shopDoc?.applicationId
      );
      commissionRate = Number(app?.commissionPercent) || 0;
    }

    // Combine shop orders from memory and any extra passed (e.g. from pagination)
    const allShopOrdersMap = new Map<string, ShopOrder>();
    Array.from(this.shopOrders.values()).forEach((so) => allShopOrdersMap.set(so.id, so));
    if (extraShopOrders) {
      extraShopOrders.forEach((so) => allShopOrdersMap.set(so.id, so));
    }

    const effectiveShopId = shopDoc?.id || targetStoreId;

    // Filter shop orders belonging to this store where parent order is delivered, handed over, or canceled
    const storeShopOrders = Array.from(allShopOrdersMap.values()).filter((so) => {
      const matchesShop = so.shopId === effectiveShopId || so.shopId === targetStoreId || so.shopId === `store-${storeUserId}`;
      if (!matchesShop) return false;
      if (so.status === 'CANCELED' || so.status === 'HANDOVER' || so.status === 'DELIVERED') return true;
      const parentOrder = this.orders.get(so.parentOrderId) || (cachedParentOrders ? cachedParentOrders[so.parentOrderId] : undefined);
      return parentOrder?.status === 'DELIVERED' || parentOrder?.status === 'CANCELED';
    });

    const seenParentOrderIds = new Set<string>();
    let totalSales = 0;
    let totalCommission = 0;
    let totalNetSales = 0;

    storeShopOrders.forEach((so) => {
      seenParentOrderIds.add(so.parentOrderId);
      const parentOrder = this.orders.get(so.parentOrderId) || (cachedParentOrders ? cachedParentOrders[so.parentOrderId] : undefined);
      const isCanceled = so.status === 'CANCELED' || parentOrder?.status === 'CANCELED';
      const isDelivered = parentOrder?.status === 'DELIVERED' || so.status === 'DELIVERED';
      const sales = (so.price && so.price > 0) ? so.price : (parentOrder?.productCost || 0);

      totalSales += sales;
      if (!isCanceled && isDelivered) {
        const commission = Math.round(sales * (commissionRate / 100));
        totalCommission += commission;
        totalNetSales += Math.max(0, sales - commission);
      }
    });

    // Also include main orders with selectedShopIds that might not have a separate shopOrder subdocument
    const allMainOrders = Array.from(this.orders.values());
    allMainOrders.forEach((mo) => {
      const matchesShop = mo.shopId === effectiveShopId || mo.shopId === targetStoreId || mo.selectedShopIds?.includes(effectiveShopId) || mo.selectedShopIds?.includes(targetStoreId);
      if (matchesShop && !seenParentOrderIds.has(mo.id)) {
        if (mo.status === 'DELIVERED' || mo.status === 'CANCELED') {
          const sales = mo.productCost || 0;
          totalSales += sales;
          if (mo.status === 'DELIVERED') {
            const commission = Math.round(sales * (commissionRate / 100));
            totalCommission += commission;
            totalNetSales += Math.max(0, sales - commission);
          }
        }
      }
    });

    const approvedWithdrawals = Array.from(this.withdrawals.values()).filter((w) => {
      if (w.status !== 'APPROVED') return false;
      if (w.helperId === storeUserId || w.helperId === effectiveShopId || w.helperId === targetStoreId) return true;
      if (shopDoc && (w.helperId === shopDoc.id || w.helperId === shopDoc.ownerUserId || w.helperId === `store-${shopDoc.ownerUserId}`)) return true;
      if (storeUserId && (w.helperId === `store-${storeUserId}` || (w.helperId.startsWith('store-') && w.helperId.replace('store-', '') === storeUserId))) return true;
      if (w.userType === 'store') {
        if (shopDoc?.name && w.helperName === shopDoc.name) return true;
        if (effectiveShopId && (w.helperId === effectiveShopId || w.shopId === effectiveShopId)) return true;
        if (storeUserId && (w.helperId === storeUserId || w.shopId === storeUserId)) return true;
      }
      return false;
    });

    const totalPaidPayouts = approvedWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    const balance = Math.max(0, totalNetSales - totalPaidPayouts);

    return {
      userId: storeUserId,
      balance,
      totalEarned: totalNetSales,
      totalWithdrawn: totalPaidPayouts,
      totalPaidCommission: totalCommission,
      updatedAt: new Date().toISOString(),
    };
  }


  public async creditHelperEarning(helperId: string, helperShare: number, deliveryFee: number, orderId: string) {
    const platformShare = Math.max(0, deliveryFee - helperShare);
    const commissionPercent = 100 - (this.pricingSettings.helperCommissionPercent ?? 80);

    // ── Wallet: purely additive increment ──────────────────────────────────
    // NEVER recompute from the order list — it's query-limited and will give
    // wrong results for helpers with many orders. Instead, increment on top
    // of the current stored Firestore wallet so totals always grow correctly.
    const existing = this.wallets.get(helperId);
    const updatedWallet: Wallet = {
      userId: helperId,
      totalEarned: (existing?.totalEarned ?? 0) + helperShare,
      balance: (existing?.balance ?? 0) + platformShare,
      totalPaidCommission: existing?.totalPaidCommission ?? 0,
      totalWithdrawn: existing?.totalWithdrawn ?? 0,
      updatedAt: new Date().toISOString(),
    };
    this.wallets.set(helperId, updatedWallet);

    // Transaction ledger entry
    const txs = this.walletTransactions.get(helperId) || [];
    const newTx: WalletTransaction = {
      id: `tx-${Date.now()}`,
      userId: helperId,
      amount: helperShare,
      type: 'EARNING',
      orderId: orderId,
      description: `Order #${orderId} completed — Earned ৳${helperShare} (${commissionPercent}% platform commission ৳${platformShare} due)`,
      createdAt: new Date().toISOString(),
    };
    txs.unshift(newTx);
    this.walletTransactions.set(helperId, txs);
    this.notify();

    try {
      await setDoc(doc(db, 'wallets', helperId), cleanForFirestore(updatedWallet), { merge: true });
      await setDoc(doc(db, 'walletTransactions', newTx.id), cleanForFirestore(newTx));
    } catch (e: any) {
      console.warn('[Firestore] creditHelperEarning note (saved locally):', e?.message || e);
    }
  }

  public async adjustHelperWalletForOrder(
    helperId: string,
    diffHelperShare: number,
    diffPlatformShare: number,
    oldFee: number,
    newFee: number,
    orderId: string,
    mode: 'adjustment' | 'reversal' = 'adjustment'
  ) {
    const existing = this.wallets.get(helperId);
    const updatedWallet: Wallet = {
      userId: helperId,
      totalEarned: Math.max(0, (existing?.totalEarned ?? 0) + diffHelperShare),
      balance: Math.max(0, (existing?.balance ?? 0) + diffPlatformShare),
      totalPaidCommission: existing?.totalPaidCommission ?? 0,
      totalWithdrawn: existing?.totalWithdrawn ?? 0,
      updatedAt: new Date().toISOString(),
    };
    this.wallets.set(helperId, updatedWallet);

    const desc = mode === 'reversal'
      ? `Order #${orderId} status changed/reverted by Admin — Reversed earning ৳${Math.abs(diffHelperShare)}`
      : `Order #${orderId} fee adjusted by Admin (৳${oldFee} → ৳${newFee}) — Net earning: ${diffHelperShare >= 0 ? '+' : ''}৳${diffHelperShare}`;

    const txs = this.walletTransactions.get(helperId) || [];
    const newTx: WalletTransaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: helperId,
      amount: diffHelperShare,
      type: 'ADJUSTMENT',
      orderId: orderId,
      description: desc,
      createdAt: new Date().toISOString(),
    };
    txs.unshift(newTx);
    this.walletTransactions.set(helperId, txs);
    this.notify();

    try {
      await setDoc(doc(db, 'wallets', helperId), cleanForFirestore(updatedWallet), { merge: true });
      await setDoc(doc(db, 'walletTransactions', newTx.id), cleanForFirestore(newTx));
    } catch (e: any) {
      console.warn('[Firestore] adjustHelperWalletForOrder note (saved locally):', e?.message || e);
    }
  }


  public async recordHelperPayback(helperId: string, amount: number, note: string, paymentMethod: string = 'Manual Record') {
    const txs = this.walletTransactions.get(helperId) || [];
    const newTx: WalletTransaction = {
      id: `tx-${Date.now()}`,
      userId: helperId,
      amount: -amount,
      type: 'PAYBACK',
      description: `Paid back commission to platform: ৳${amount} (${paymentMethod}${note ? ` - ${note}` : ''})`,
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
      paymentMethod: paymentMethod || 'Manual Record',
      accountNumber: note || 'Admin recorded payment',
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };
    this.withdrawals.set(req.id, req);

    // ── Wallet: purely subtractive decrement ───────────────────────────────
    const existing = this.wallets.get(helperId);
    const updatedWallet: Wallet = {
      userId: helperId,
      totalEarned: existing?.totalEarned ?? 0,
      balance: Math.max(0, (existing?.balance ?? 0) - amount),
      totalPaidCommission: (existing?.totalPaidCommission ?? 0) + amount,
      totalWithdrawn: (existing?.totalWithdrawn ?? 0) + amount,
      updatedAt: new Date().toISOString(),
    };
    this.wallets.set(helperId, updatedWallet);
    this.notify();

    try {
      await setDoc(doc(db, 'wallets', helperId), cleanForFirestore(updatedWallet), { merge: true });
      await setDoc(doc(db, 'walletTransactions', newTx.id), cleanForFirestore(newTx));
      await setDoc(doc(db, 'withdrawals', req.id), cleanForFirestore(req));
    } catch (e: any) {
      console.warn('[Firestore] recordHelperPayback note (saved locally):', e?.message || e);
    }
  }

  public async recordStoreDisbursement(
    shopId: string,
    amount: number,
    paymentMethod: string = 'Bank Transfer',
    refNote: string = '',
    targetUserId?: string
  ): Promise<WithdrawalRequest> {
    const shop = this.shops.get(shopId) || Array.from(this.shops.values()).find((s) => s.id === shopId);
    const storeUserId = targetUserId || shop?.ownerUserId || (shopId.startsWith('store-') ? shopId.replace('store-', '') : shopId);
    const storeName = shop?.name || 'Store';

    const txId = `tx-store-${Date.now()}`;
    const newTx: WalletTransaction = {
      id: txId,
      userId: storeUserId,
      amount: -amount,
      type: 'PAYBACK',
      description: `Store payout disbursement by admin: ৳${amount} (${paymentMethod}${refNote ? ` - ${refNote}` : ''})`,
      createdAt: new Date().toISOString(),
    };

    const userTxs = this.walletTransactions.get(storeUserId) || [];
    userTxs.unshift(newTx);
    this.walletTransactions.set(storeUserId, userTxs);

    const reqId = `wd-store-${Date.now()}`;
    const req: WithdrawalRequest = {
      id: reqId,
      helperId: storeUserId,
      helperName: storeName,
      amount,
      status: 'APPROVED',
      paymentMethod: paymentMethod || 'Bank Transfer',
      accountNumber: refNote || 'Admin store disbursement',
      userType: 'store',
      shopId: shopId,
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };
    this.withdrawals.set(req.id, req);

    // Also associate with effectiveShopId if different
    if (shop?.id && shop.id !== storeUserId) {
      const shopTxs = this.walletTransactions.get(shop.id) || [];
      shopTxs.unshift({ ...newTx, userId: shop.id });
      this.walletTransactions.set(shop.id, shopTxs);
    }

    const existing = this.wallets.get(storeUserId) || (shop?.id ? this.wallets.get(shop.id) : undefined);
    const currentWithdrawn = (existing?.totalWithdrawn ?? 0) + amount;
    const currentBalance = Math.max(0, (existing?.balance ?? 0) - amount);
    const updatedWallet: Wallet = {
      userId: storeUserId,
      totalEarned: existing?.totalEarned ?? 0,
      balance: currentBalance,
      totalPaidCommission: existing?.totalPaidCommission ?? 0,
      totalWithdrawn: currentWithdrawn,
      updatedAt: new Date().toISOString(),
    };
    this.wallets.set(storeUserId, updatedWallet);
    if (shop?.id && shop.id !== storeUserId) {
      this.wallets.set(shop.id, { ...updatedWallet, userId: shop.id });
    }

    this.notify();

    try {
      await setDoc(doc(db, 'wallets', storeUserId), cleanForFirestore(updatedWallet), { merge: true });
      if (shop?.id && shop.id !== storeUserId) {
        await setDoc(doc(db, 'wallets', shop.id), cleanForFirestore({ ...updatedWallet, userId: shop.id }), { merge: true });
      }
      await setDoc(doc(db, 'walletTransactions', newTx.id), cleanForFirestore(newTx));
      await setDoc(doc(db, 'withdrawals', req.id), cleanForFirestore(req));
    } catch (e: any) {
      console.warn('[Firestore] recordStoreDisbursement note:', e?.message || e);
    }

    return req;
  }

  public async submitWithdrawalRequest(
    helperId: string,
    helperName: string,
    amount: number,
    paymentMethod: string,
    accountNumber: string,
    userType?: 'helper' | 'store'
  ) {
    const req: WithdrawalRequest = {
      id: `wd-${Date.now()}`,
      helperId,
      helperName,
      amount,
      status: 'PENDING',
      paymentMethod,
      accountNumber,
      userType,
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

  public async updateWithdrawalRequest(
    withdrawalId: string,
    updates: { status?: 'PENDING' | 'APPROVED' | 'REJECTED'; amount?: number }
  ) {
    const req = this.withdrawals.get(withdrawalId);
    if (!req) return;

    const oldStatus = req.status;
    const oldAmount = req.amount;

    const newStatus = updates.status !== undefined ? updates.status : oldStatus;
    const newAmount = updates.amount !== undefined && !isNaN(updates.amount) && updates.amount > 0 ? updates.amount : oldAmount;

    req.status = newStatus;
    req.amount = newAmount;
    req.processedAt = new Date().toISOString();
    this.withdrawals.set(withdrawalId, req);

    const existingWallet = this.wallets.get(req.helperId);
    let currentBalance = existingWallet?.balance ?? 0;
    let currentTotalPaid = existingWallet?.totalPaidCommission ?? 0;
    let currentTotalWithdrawn = existingWallet?.totalWithdrawn ?? 0;

    // Adjust wallet if transitions occurred between APPROVED and non-APPROVED, or if APPROVED amount changed
    if (oldStatus === 'APPROVED' && newStatus !== 'APPROVED') {
      // Revert previous approval
      currentBalance = currentBalance + oldAmount;
      currentTotalPaid = Math.max(0, currentTotalPaid - oldAmount);
      currentTotalWithdrawn = Math.max(0, currentTotalWithdrawn - oldAmount);
    } else if (oldStatus !== 'APPROVED' && newStatus === 'APPROVED') {
      // Apply new approval
      currentBalance = Math.max(0, currentBalance - newAmount);
      currentTotalPaid = currentTotalPaid + newAmount;
      currentTotalWithdrawn = currentTotalWithdrawn + newAmount;

      // Add transaction ledger entry
      const txs = this.walletTransactions.get(req.helperId) || [];
      const newTx: WalletTransaction = {
        id: `tx-${Date.now()}`,
        userId: req.helperId,
        amount: -newAmount,
        type: 'PAYBACK',
        description: `Commission payback approved (#${req.id})`,
        createdAt: new Date().toISOString(),
      };
      txs.unshift(newTx);
      this.walletTransactions.set(req.helperId, txs);
      try {
        await setDoc(doc(db, 'walletTransactions', newTx.id), cleanForFirestore(newTx));
      } catch (e) { }
    } else if (oldStatus === 'APPROVED' && newStatus === 'APPROVED' && oldAmount !== newAmount) {
      // Amount changed while remaining approved
      const diff = newAmount - oldAmount;
      currentBalance = Math.max(0, currentBalance - diff);
      currentTotalPaid = Math.max(0, currentTotalPaid + diff);
      currentTotalWithdrawn = Math.max(0, currentTotalWithdrawn + diff);
    }

    const updatedWallet: Wallet = {
      userId: req.helperId,
      totalEarned: existingWallet?.totalEarned ?? 0,
      balance: currentBalance,
      totalPaidCommission: currentTotalPaid,
      totalWithdrawn: currentTotalWithdrawn,
      updatedAt: new Date().toISOString(),
    };
    this.wallets.set(req.helperId, updatedWallet);
    this.notify();

    try {
      await setDoc(doc(db, 'wallets', req.helperId), cleanForFirestore(updatedWallet), { merge: true });
      await setDoc(doc(db, 'withdrawals', withdrawalId), cleanForFirestore(req), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] updateWithdrawalRequest note:', e?.message || e);
    }
  }

  public async approveWithdrawal(withdrawalId: string) {
    return this.updateWithdrawalRequest(withdrawalId, { status: 'APPROVED' });
  }

  public async rejectWithdrawal(withdrawalId: string) {
    return this.updateWithdrawalRequest(withdrawalId, { status: 'REJECTED' });
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
      const moved: { customerId?: string; helperId?: string } = {};
      if (o.customerId === oldUid) { o.customerId = newUid; moved.customerId = newUid; }
      if (o.helperId === oldUid) { o.helperId = newUid; moved.helperId = newUid; }
      if (moved.customerId || moved.helperId) {
        this.orders.set(o.id, o);
        updateDoc(doc(db, 'orders', o.id), moved).catch(() => { });
      }
    });

    // 3. Helper Applications
    this.helperApplications.forEach((app) => {
      if (app.userId === oldUid) {
        app.userId = newUid;
        this.helperApplications.set(app.id, app);
        try { setDoc(doc(db, 'helperApplications', app.id), cleanForFirestore(app), { merge: true }); } catch (_) { }
      }
    });

    // 3b. Store Applications
    this.storeApplications.forEach((app) => {
      if (app.userId === oldUid) {
        app.userId = newUid;
        this.storeApplications.set(app.id, app);
        try { setDoc(doc(db, 'storeApplications', app.id), cleanForFirestore(app), { merge: true }); } catch (_) { }
      }
    });

    // 4. Wallets
    const oldWallet = this.wallets.get(oldUid);
    if (oldWallet) {
      this.wallets.delete(oldUid);
      const updatedWallet = { ...oldWallet, userId: newUid };
      this.wallets.set(newUid, updatedWallet);
      try { setDoc(doc(db, 'wallets', newUid), cleanForFirestore(updatedWallet)); } catch (_) { }
    }

    // 5. Wallet Transactions
    const oldTxs = this.walletTransactions.get(oldUid);
    if (oldTxs) {
      this.walletTransactions.delete(oldUid);
      const updatedTxs = oldTxs.map((tx) => ({ ...tx, userId: newUid }));
      this.walletTransactions.set(newUid, updatedTxs);
      updatedTxs.forEach((tx) => {
        try { setDoc(doc(db, 'walletTransactions', tx.id), cleanForFirestore(tx), { merge: true }); } catch (_) { }
      });
    }

    // 6. Withdrawals
    this.withdrawals.forEach((w) => {
      if (w.helperId === oldUid) {
        w.helperId = newUid;
        this.withdrawals.set(w.id, w);
        try { setDoc(doc(db, 'withdrawals', w.id), cleanForFirestore(w), { merge: true }); } catch (_) { }
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
        try { setDoc(doc(db, 'orderFeedbacks', fb.id), cleanForFirestore(fb), { merge: true }); } catch (_) { }
      }
    });

    this.notify();
  }

  public async approveHelperApp(appId: string) {
    const app = this.helperApplications.get(appId);
    if (!app) return;
    app.status = 'APPROVED';
    this.helperApplications.set(appId, app);

    const applicant = await this.getUserForUpdate(app.userId);
    if (applicant) {
      const isDedicated = app.applicationType === 'dedicated' || !app.applicationType;
      const updatedUser: UserProfile = {
        ...applicant,
        isHelper: true,
        helperType: isDedicated ? 'dedicated' : (applicant.helperType || 'commuter'),
        alternativePhone: app.whatsapp || applicant.alternativePhone,
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
    const existing = await this.getUserForUpdate(uid);
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

    const userCreatedTime = u.createdAt
      ? new Date(u.createdAt).getTime()
      : (orderCount > 0 ? new Date(userOrders[orderCount - 1].createdAt).getTime() : Date.now());
    const weeksElapsed = Math.max(1, (Date.now() - userCreatedTime) / (7 * 24 * 3600 * 1000));
    const weeklyOrderRate = orderCount / weeksElapsed;
    const monthlyOrderRate = orderCount / (weeksElapsed / 4.33);

    // ── Preset segments ──────────────────────────────────────────────────────
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

    // ── Custom compound segment (CUSTOM:key=val:key=val:...) ─────────────────
    // Encoded by the AdminPushNotificationModal filter builder.
    // All specified conditions must pass (AND logic).
    if (segName.startsWith('CUSTOM:')) {
      const params = segName.slice('CUSTOM:'.length).split(':');
      const parsed: Record<string, number> = {};
      for (const p of params) {
        const [k, v] = p.split('=');
        if (k && v !== undefined) parsed[k] = parseFloat(v);
      }

      const coinBalance = typeof u.coins === 'number' ? u.coins : 0;
      const registeredDaysAgo = Math.floor((Date.now() - userCreatedTime) / (24 * 3600 * 1000));

      // minOrders: total orders >= N
      if (parsed.minOrders !== undefined && orderCount < parsed.minOrders) return false;
      // maxOrders: total orders <= N
      if (parsed.maxOrders !== undefined && orderCount > parsed.maxOrders) return false;
      // lastOrderWithinDays: must have ordered within the last N days
      if (parsed.lastOrderWithinDays !== undefined) {
        if (daysSinceLastOrder === null || daysSinceLastOrder > parsed.lastOrderWithinDays) return false;
      }
      // lastOrderOlderThanDays: last order must be more than N days ago (inactive targeting)
      if (parsed.lastOrderOlderThanDays !== undefined) {
        if (daysSinceLastOrder === null || daysSinceLastOrder < parsed.lastOrderOlderThanDays) return false;
      }
      // weeklyRateGte: weekly order rate >= N
      if (parsed.weeklyRateGte !== undefined && weeklyOrderRate < parsed.weeklyRateGte) return false;
      // weeklyRateLt: weekly order rate < N
      if (parsed.weeklyRateLt !== undefined && weeklyOrderRate >= parsed.weeklyRateLt) return false;
      // minCoins: coin balance >= N
      if (parsed.minCoins !== undefined && coinBalance < parsed.minCoins) return false;
      // maxCoins: coin balance <= N
      if (parsed.maxCoins !== undefined && coinBalance > parsed.maxCoins) return false;
      // registeredWithinDays: user registered within last N days
      if (parsed.registeredWithinDays !== undefined && registeredDaysAgo > parsed.registeredWithinDays) return false;

      return true; // all conditions passed
    }

    return false;
  }

  public async addNotification(notif: AppNotification) {
    const target = notif.userId;
    const radiusKm = this.pricingSettings.helperRadiusKm || 3.5;
    const targetOrder = notif.orderId ? this.orders.get(notif.orderId) : undefined;

    if (target === 'all-helpers') {
      this.users.forEach((u) => {
        if (u.isHelper && !u.isBlocked) {
          if (targetOrder) {
            if (this.pricingSettings.allowedDeliveryAreas && this.pricingSettings.allowedDeliveryAreas.length > 0) {
              if (!isHelperEligibleForOrder(u, targetOrder, this.pricingSettings.allowedDeliveryAreas, this.pricingSettings.allowedDeliveryAreasEnabled)) {
                return;
              }
            }
            if (!isHelperWithinOrderRadius(u.helperLocation, targetOrder, radiusKm)) {
              return;
            }
          }
          const userList = this.notifications.get(u.uid) || [];
          userList.unshift({ ...notif, userId: u.uid });
          this.notifications.set(u.uid, userList);
        }
      });
    } else if (target === 'all-commuter-helpers') {
      this.users.forEach((u) => {
        if (u.isHelper && !u.isBlocked && u.helperType !== 'dedicated') {
          if (targetOrder) {
            if (this.pricingSettings.allowedDeliveryAreas && this.pricingSettings.allowedDeliveryAreas.length > 0) {
              if (!isHelperEligibleForOrder(u, targetOrder, this.pricingSettings.allowedDeliveryAreas, this.pricingSettings.allowedDeliveryAreasEnabled)) {
                return;
              }
            }
            if (!isHelperWithinOrderRadius(u.helperLocation, targetOrder, radiusKm)) {
              return;
            }
          }
          const userList = this.notifications.get(u.uid) || [];
          userList.unshift({ ...notif, userId: u.uid });
          this.notifications.set(u.uid, userList);
        }
      });
    } else if (target === 'all-dedicated-helpers') {
      this.users.forEach((u) => {
        if (u.isHelper && !u.isBlocked && u.helperType === 'dedicated') {
          if (targetOrder) {
            if (this.pricingSettings.allowedDeliveryAreas && this.pricingSettings.allowedDeliveryAreas.length > 0) {
              if (!isHelperEligibleForOrder(u, targetOrder, this.pricingSettings.allowedDeliveryAreas, this.pricingSettings.allowedDeliveryAreasEnabled)) {
                return;
              }
            }
            if (!isHelperWithinOrderRadius(u.helperLocation, targetOrder, radiusKm)) {
              return;
            }
          }
          const userList = this.notifications.get(u.uid) || [];
          userList.unshift({ ...notif, userId: u.uid });
          this.notifications.set(u.uid, userList);
        }
      });
    } else if (target === 'all-customers') {
      this.users.forEach((u) => {
        if (!u.isBlocked && (!u.isHelper || u.role === 'customer')) {
          const userList = this.notifications.get(u.uid) || [];
          userList.unshift({ ...notif, userId: u.uid });
          this.notifications.set(u.uid, userList);
        }
      });
    } else if (target.startsWith('segment:')) {
      const segName = target.replace('segment:', '');
      this.users.forEach((u) => {
        if (!u.isBlocked && this.doesUserMatchSegment(u, segName)) {
          const userList = this.notifications.get(u.uid) || [];
          userList.unshift({ ...notif, userId: u.uid });
          this.notifications.set(u.uid, userList);
        }
      });
    } else if (target === 'all') {
      this.users.forEach((u) => {
        if (!u.isBlocked) {
          const userList = this.notifications.get(u.uid) || [];
          userList.unshift({ ...notif, userId: u.uid });
          this.notifications.set(u.uid, userList);
        }
      });
    } else {
      const list = this.notifications.get(notif.userId) || [];
      list.unshift(notif);
      this.notifications.set(notif.userId, list);
    }

    this.adminNotificationsHistory.set(notif.id, notif);
    this.scheduleLocalStoreSave();
    this.notify();

    // In-app feedback: sound + vibration on the device that created the notification (for manual admin notifications)
    if (notif.type !== 'new_order') {
      playNotificationSound();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([200, 100, 200, 100, 200]); } catch (_) { /* ignore */ }
      }
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

      if (t === 'all-helpers' || t === 'all-commuter-helpers' || t === 'all-dedicated-helpers') {
        allUsers.forEach((u) => {
          if (u.isHelper && u.fcmToken) {
            if (t === 'all-commuter-helpers' && u.helperType === 'dedicated') return;
            if (t === 'all-dedicated-helpers' && u.helperType !== 'dedicated') return;
            if (targetOrder && this.pricingSettings.allowedDeliveryAreas && this.pricingSettings.allowedDeliveryAreas.length > 0) {
              if (!isHelperEligibleForOrder(u, targetOrder, this.pricingSettings.allowedDeliveryAreas, this.pricingSettings.allowedDeliveryAreasEnabled)) {
                return;
              }
            }
            targetTokens.push(u.fcmToken);
          }
        });
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
      isAdminPush: true,
      createdByAdmin: true,
    };

    if (isFutureScheduled || (repeatFrequency && repeatFrequency !== 'NONE')) {
      this.scheduledNotifications.set(notif.id, notif);
      this.notify();
      this.scheduleLocalStoreSave();
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

  public async updateScheduledNotification(notifId: string, updatedFields: Partial<AppNotification>) {
    const existing = this.scheduledNotifications.get(notifId);
    if (!existing) return null;
    const updated: AppNotification = {
      ...existing,
      ...updatedFields,
      isAdminPush: true,
      createdByAdmin: true,
    };
    this.scheduledNotifications.set(notifId, updated);
    this.notify();
    this.scheduleLocalStoreSave();
    try {
      await setDoc(doc(db, 'scheduledNotifications', notifId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] updateScheduledNotification note (saved locally):', e?.message || e);
    }
    return updated;
  }

  public async deleteScheduledNotification(notifId: string) {
    this.scheduledNotifications.delete(notifId);
    this.notify();
    this.scheduleLocalStoreSave();
    try {
      await deleteDoc(doc(db, 'scheduledNotifications', notifId));
    } catch (e: any) {
      console.warn('[Firestore] deleteScheduledNotification note (saved locally):', e?.message || e);
    }
  }

  public async publishScheduledNotificationNow(notifId: string) {
    const notif = this.scheduledNotifications.get(notifId);
    if (!notif) return;

    // Dispatch immediately
    const dispatchNotif: AppNotification = {
      ...notif,
      id: `notif-disp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      isScheduled: false,
      isAdminPush: true,
      createdByAdmin: true,
    };
    await this.addNotification(dispatchNotif);

    if (notif.repeatFrequency === 'DAILY' || notif.repeatFrequency === 'WEEKLY') {
      const nextInterval = notif.repeatFrequency === 'DAILY' ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
      notif.scheduledAt = new Date(Date.now() + nextInterval).toISOString();
      this.scheduledNotifications.set(notif.id, notif);
      try {
        await setDoc(doc(db, 'scheduledNotifications', notif.id), cleanForFirestore(notif), { merge: true });
      } catch (_) { }
    } else {
      this.scheduledNotifications.delete(notif.id);
      try {
        await deleteDoc(doc(db, 'scheduledNotifications', notif.id));
      } catch (_) { }
    }
    this.notify();
    this.scheduleLocalStoreSave();
  }

  public async deleteNotification(notifId: string) {
    this.adminNotificationsHistory.delete(notifId);
    this.notifications.forEach((list, uid) => {
      const filtered = list.filter((n) => n.id !== notifId);
      if (filtered.length !== list.length) {
        this.notifications.set(uid, filtered);
      }
    });
    this.notify();
    this.scheduleLocalStoreSave();
    try {
      await deleteDoc(doc(db, 'notifications', notifId));
    } catch (e: any) {
      console.warn('[Firestore] deleteNotification note (saved locally):', e?.message || e);
    }
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
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('jamanot_pricing_store', JSON.stringify(this.pricingSettings));
      }
    } catch {}
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

    const user = this.users.get(updated.userId);
    if (updated.status === 'APPROVED' && existing.status !== 'APPROVED') {
      if (user) {
        const isDedicated = updated.applicationType === 'dedicated' || !updated.applicationType;
        const updatedUser: UserProfile = {
          ...user,
          displayName: updated.legalName ? updated.legalName.trim() : user.displayName,
          isHelper: true,
          helperType: isDedicated ? 'dedicated' : (user.helperType || 'commuter'),
          alternativePhone: updated.whatsapp ? updated.whatsapp.trim() : user.alternativePhone,
        };
        this.users.set(updated.userId, updatedUser);
        await this.saveUser(updatedUser);
      }
    } else if (updated.status !== 'APPROVED' && existing.status === 'APPROVED') {
      if (user) {
        const updatedUser = {
          ...user,
          displayName: updated.legalName ? updated.legalName.trim() : user.displayName,
          isHelper: false,
          alternativePhone: updated.whatsapp ? updated.whatsapp.trim() : user.alternativePhone,
        };
        this.users.set(updated.userId, updatedUser);
        await this.saveUser(updatedUser);
      }
    } else if (user) {
      const needsNameUpdate = updatedFields.legalName && updatedFields.legalName.trim() !== user.displayName;
      const needsPhoneUpdate = updatedFields.whatsapp && updatedFields.whatsapp.trim() !== user.alternativePhone;
      if (needsNameUpdate || needsPhoneUpdate) {
        const updatedUser: UserProfile = {
          ...user,
          displayName: updatedFields.legalName ? updatedFields.legalName.trim() : user.displayName,
          alternativePhone: updatedFields.whatsapp ? updatedFields.whatsapp.trim() : user.alternativePhone,
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
    this.scheduleLocalStoreSave();
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
    const shopToSave: Shop = {
      ...shop,
      status: shop.status || 'Approved',
      canReceiveOrders: shop.canReceiveOrders !== undefined ? shop.canReceiveOrders : true,
    };
    this.shops.set(shopToSave.id, shopToSave);
    this.notify();
    try {
      await setDoc(doc(db, 'shops', shopToSave.id), cleanForFirestore(shopToSave), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] saveShop note (saved locally):', e?.message || e);
    }
  }

  public async updateShopStatus(shopId: string, status: 'Approved' | 'Pending' | 'Rejected') {
    const existing = this.shops.get(shopId);
    const normalizedStatus: 'Approved' | 'Pending' | 'Rejected' = status;
    const appStatus: 'APPROVED' | 'PENDING' | 'REJECTED' =
      status === 'Approved' ? 'APPROVED' : status === 'Pending' ? 'PENDING' : 'REJECTED';

    if (existing) {
      const updatedShop: Shop = { ...existing, status: normalizedStatus, updatedAt: new Date().toISOString() };
      this.shops.set(shopId, updatedShop);
      try {
        await setDoc(doc(db, 'shops', shopId), cleanForFirestore(updatedShop), { merge: true });
      } catch (e: any) {
        console.warn('[Firestore] updateShopStatus note (saved locally):', e?.message || e);
      }
    }

    // Update associated StoreApplication if present
    const storeApp = Array.from(this.storeApplications.values()).find(
      (a) => a.id === existing?.applicationId || (existing?.ownerUserId && a.userId === existing.ownerUserId)
    );
    if (storeApp) {
      const updatedApp: StoreApplication = {
        ...storeApp,
        status: appStatus,
        reviewedAt: new Date().toISOString(),
      };
      this.storeApplications.set(storeApp.id, updatedApp);
      try {
        await setDoc(doc(db, 'storeApplications', storeApp.id), cleanForFirestore(updatedApp), { merge: true });
      } catch (_) { }
    }

    // Update owner user profile if present
    if (existing?.ownerUserId) {
      const storeOwner = await this.getUserForUpdate(existing.ownerUserId);
      if (storeOwner) {
        const isApproved = status === 'Approved';
        const isPending = status === 'Pending';
        const updatedUser: UserProfile = {
          ...storeOwner,
          isStore: isApproved || isPending,
          isStoreApproved: isApproved,
          storeId: isApproved || isPending ? shopId : undefined,
          lastActiveMode: isApproved ? 'store' : (storeOwner.lastActiveMode === 'store' ? 'customer' : storeOwner.lastActiveMode),
        };
        this.users.set(existing.ownerUserId, updatedUser);
        try { await this.saveUser(updatedUser); } catch (_) { }
      }
    }

    this.notify();
  }

  public async deleteShop(shopId: string) {
    let existing = this.shops.get(shopId);
    if (!existing) {
      try {
        const snap = await getDoc(doc(db, 'shops', shopId));
        if (snap.exists()) {
          existing = snap.data() as Shop;
        }
      } catch (_) { }
    }
    this.shops.delete(shopId);
    this.notify();

    try {
      await deleteDoc(doc(db, 'shops', shopId));
    } catch (e: any) {
      console.warn('[Firestore] deleteShop note (saved locally):', e?.message || e);
    }

    // Identify owner user ID(s)
    let ownerUserId = existing?.ownerUserId;
    if (!ownerUserId && shopId.startsWith('store-')) {
      ownerUserId = shopId.replace('store-', '');
    }

    const userIdsToRevoke = new Set<string>();
    if (ownerUserId) userIdsToRevoke.add(ownerUserId);

    this.users.forEach((u) => {
      if (u.storeId === shopId || (ownerUserId && u.uid === ownerUserId)) {
        userIdsToRevoke.add(u.uid);
      }
    });

    try {
      const uSnap = await getDocs(query(collection(db, 'users'), where('storeId', '==', shopId)));
      uSnap.forEach((d) => userIdsToRevoke.add(d.id));
    } catch (_) { }

    // Remove or cancel associated store applications
    const appIdsToDelete: string[] = [];
    this.storeApplications.forEach((app) => {
      if (app.id === existing?.applicationId || (ownerUserId && app.userId === ownerUserId)) {
        appIdsToDelete.push(app.id);
      }
    });

    try {
      if (existing?.applicationId) {
        await deleteDoc(doc(db, 'storeApplications', existing.applicationId));
      }
      if (ownerUserId) {
        const appSnap = await getDocs(query(collection(db, 'storeApplications'), where('userId', '==', ownerUserId)));
        appSnap.forEach((d) => {
          appIdsToDelete.push(d.id);
          deleteDoc(doc(db, 'storeApplications', d.id)).catch(() => { });
        });
      }
    } catch (_) { }

    appIdsToDelete.forEach((id) => this.storeApplications.delete(id));

    // Revoke store role and store flags on all associated users
    for (const uid of Array.from(userIdsToRevoke)) {
      const storeOwner = await this.getUserForUpdate(uid);
      const updatedUser: UserProfile = storeOwner
        ? {
          ...storeOwner,
          isStore: false,
          isStoreApproved: false,
          storeId: undefined,
          role: storeOwner.role === 'store' ? 'customer' : storeOwner.role,
          lastActiveMode: storeOwner.lastActiveMode === 'store' ? 'customer' : storeOwner.lastActiveMode,
        }
        : {
          uid,
          displayName: existing?.name || 'User',
          email: existing?.ownerUserEmail || '',
          role: 'customer',
          isHelper: false,
          isStore: false,
          isStoreApproved: false,
          storeId: undefined,
          lastActiveMode: 'customer',
          createdAt: new Date().toISOString(),
        };

      this.users.set(uid, updatedUser);
      try {
        await this.saveUser(updatedUser);
      } catch (_) { }

      try {
        await setDoc(
          doc(db, 'users', uid),
          {
            isStore: false,
            isStoreApproved: false,
            storeId: null,
            role: 'customer',
            lastActiveMode: 'customer',
          },
          { merge: true }
        );
      } catch (_) { }

      // Add a notification for the store owner
      this.addNotification({
        id: `notif-store-del-${Date.now()}`,
        userId: uid,
        title: 'স্টোর মুছে ফেলা হয়েছে',
        body: existing?.name
          ? `আপনার "${existing.name}" স্টোরটি মুছে ফেলা হয়েছে এবং আপনার অ্যাকাউন্ট সাধারণ কাস্টমার অ্যাকাউন্টে ফিরিয়ে দেওয়া হয়েছে।`
          : 'আপনার স্টোরটি মুছে ফেলা হয়েছে এবং আপনার অ্যাকাউন্ট সাধারণ কাস্টমার অ্যাকাউন্টে ফিরিয়ে দেওয়া হয়েছে।',
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    this.scheduleLocalStoreSave();
    this.notify();
  }

  public async submitOrderFeedback(feedback: OrderFeedback) {
    this.orderFeedbacks.set(feedback.id, feedback);
    const ord = this.orders.get(feedback.orderId);
    if (ord) {
      ord.feedback = feedback;
      this.orders.set(ord.id, ord);
      try {
        await updateDoc(doc(db, 'orders', ord.id), { feedback: cleanForFirestore(feedback) });
      } catch (e) {
        console.warn(e);
      }
    }
    this.notify();
    try {
      localStorage.setItem('jamanot_feedbacks_store', JSON.stringify(Array.from(this.orderFeedbacks.entries())));
    } catch (_) { }
    try {
      await setDoc(doc(db, 'orderFeedbacks', feedback.id), cleanForFirestore(feedback));
    } catch (e: any) {
      console.warn('[Firestore] submitOrderFeedback note (saved locally):', e?.message || e);
    }
  }

  public async deleteOrderFeedback(feedbackId: string) {
    const fb = this.orderFeedbacks.get(feedbackId);
    this.orderFeedbacks.delete(feedbackId);
    if (fb && fb.orderId) {
      const ord = this.orders.get(fb.orderId);
      if (ord) {
        delete ord.feedback;
        this.orders.set(ord.id, ord);
        try {
          await updateDoc(doc(db, 'orders', ord.id), { feedback: deleteField() });
        } catch (e: any) {
          console.warn('[Firestore] deleteOrderFeedback order update note:', e?.message || e);
        }
      }
    }
    this.notify();
    try {
      localStorage.setItem('jamanot_feedbacks_store', JSON.stringify(Array.from(this.orderFeedbacks.entries())));
    } catch (_) { }
    try {
      await deleteDoc(doc(db, 'orderFeedbacks', feedbackId));
    } catch (e: any) {
      console.warn('[Firestore] deleteOrderFeedback note (saved locally):', e?.message || e);
    }
  }

  public async updateOrderFeedbackReply(feedbackId: string, replyText: string, showUntil?: string, showFrom?: string) {
    const fb = this.orderFeedbacks.get(feedbackId);
    if (!fb) return;
    const updated: OrderFeedback = {
      ...fb,
      adminReply: replyText,
      adminReplyAt: new Date().toISOString(),
      adminReplyShowFrom: showFrom || undefined,
      adminReplyShowUntil: showUntil || undefined,
      adminReplyShownToCustomer: false, // reset so customer sees it again
    };
    this.orderFeedbacks.set(feedbackId, updated);
    this.notify();
    try {
      localStorage.setItem('jamanot_feedbacks_store', JSON.stringify(Array.from(this.orderFeedbacks.entries())));
    } catch (_) { }
    try {
      await setDoc(doc(db, 'orderFeedbacks', feedbackId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] updateOrderFeedbackReply error:', e?.message || e);
    }
  }

  public async markFeedbackReplyShown(feedbackId: string) {
    const fb = this.orderFeedbacks.get(feedbackId);
    if (!fb) return;
    const updated: OrderFeedback = { ...fb, adminReplyShownToCustomer: true };
    this.orderFeedbacks.set(feedbackId, updated);
    try {
      localStorage.setItem('jamanot_feedbacks_store', JSON.stringify(Array.from(this.orderFeedbacks.entries())));
    } catch (_) { }
    try {
      await setDoc(doc(db, 'orderFeedbacks', feedbackId), { adminReplyShownToCustomer: true }, { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] markFeedbackReplyShown error:', e?.message || e);
    }
  }

  public async updateOrderFeedbackMutuallyDiscussed(feedbackId: string, mutuallyDiscussed: boolean = true) {
    const fb = this.orderFeedbacks.get(feedbackId);
    if (!fb) return;
    const updated: OrderFeedback = {
      ...fb,
      mutuallyDiscussed,
    };
    this.orderFeedbacks.set(feedbackId, updated);

    // Also update order mutuallyDiscussed flag and order.feedback if available
    if (fb.orderId) {
      const ord = this.orders.get(fb.orderId);
      if (ord) {
        ord.mutuallyDiscussed = mutuallyDiscussed;
        if (ord.feedback) {
          ord.feedback.mutuallyDiscussed = mutuallyDiscussed;
        }
        this.orders.set(ord.id, ord);
        try {
          await updateDoc(
            doc(db, 'orders', ord.id),
            cleanForFirestore({ mutuallyDiscussed, ...(ord.feedback ? { feedback: ord.feedback } : {}) })
          );
        } catch (e: any) {
          console.warn('[Firestore] updateOrderFeedbackMutuallyDiscussed order update note:', e?.message || e);
        }
      }
    }

    this.notify();
    try {
      localStorage.setItem('jamanot_feedbacks_store', JSON.stringify(Array.from(this.orderFeedbacks.entries())));
    } catch (_) { }
    try {
      await setDoc(doc(db, 'orderFeedbacks', feedbackId), cleanForFirestore(updated), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] updateOrderFeedbackMutuallyDiscussed error:', e?.message || e);
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

  // ─── Gamification & Rewards CRUD ──────────────────────────────────────────

  public async submitRewardClaim(claimData: Omit<RewardClaim, 'id' | 'createdAt' | 'status'>): Promise<RewardClaim> {
    // Check if user already has an active pending claim for the same prize
    const hasPending = Array.from(this.rewardClaims.values()).some(
      (c) => c.userId === claimData.userId && c.prizeId === claimData.prizeId && c.status === 'PENDING'
    );
    if (hasPending) {
      throw new Error('এই পুরস্কারের একটি দাবি ইতোমধ্যে অপেক্ষমাণ রয়েছে। এডমিনের অনুমোদন বা বাতিলের পর পুনরায় চেষ্টা করুন।');
    }

    const claim: RewardClaim = {
      ...claimData,
      id: `claim-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.rewardClaims.set(claim.id, claim);
    this.notify();
    try {
      await setDoc(doc(db, 'rewardClaims', claim.id), cleanForFirestore(claim));
    } catch (e: any) {
      console.warn('[Firestore] submitRewardClaim note (saved locally):', e?.message || e);
    }
    return claim;
  }

  public async approveRewardClaim(claimId: string, reviewNote?: string, reviewedBy?: string): Promise<boolean> {
    const claim = this.rewardClaims.get(claimId);
    if (!claim) return false;

    // Deduct coins from user profile
    let user = this.users.get(claim.userId);
    if (!user) {
      user = (await this.fetchUserFromFirestore(claim.userId)) || undefined;
    }
    const reqCoins = Number(claim.requiredCoins) || 0;
    const currentCoins = typeof user?.coins === 'number' ? user.coins : 0;
    const updatedCoins = Math.max(0, currentCoins - reqCoins);
    if (user) {
      const updatedUser: UserProfile = {
        ...user,
        coins: updatedCoins,
      };
      this.users.set(claim.userId, updatedUser);
      this.notify();
    }
    try {
      await setDoc(doc(db, 'users', claim.userId), { coins: updatedCoins }, { merge: true });
    } catch (e) {
      console.warn('[Firestore] approveRewardClaim user coins update error:', e);
    }

    const updatedClaim: RewardClaim = {
      ...claim,
      status: 'APPROVED',
      reviewedAt: new Date().toISOString(),
      reviewNote: reviewNote || 'অনুমোদিত',
      reviewedBy: reviewedBy || 'Admin',
    };
    this.rewardClaims.set(claimId, updatedClaim);
    this.notify();

    try {
      await setDoc(doc(db, 'rewardClaims', claimId), cleanForFirestore(updatedClaim), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] approveRewardClaim note:', e);
    }

    // Send notification to customer
    await this.addNotification({
      id: `notif-reward-${Date.now()}`,
      userId: claim.userId,
      title: '🎉 পুরস্কার দাবি অনুমোদিত হয়েছে!',
      body: `অভিনন্দন! আপনার "${claim.prizeTitle}" পুরস্কার দাবিটি সফলভাবে অনুমোদিত হয়েছে। আপনার অ্যাকাউন্ট থেকে ${claim.requiredCoins} কয়েন কর্তন করা হয়েছে।${reviewNote ? ` (নোট: ${reviewNote})` : ''}`,
      read: false,
      createdAt: new Date().toISOString(),
      type: 'reward_approved',
    });

    return true;
  }

  public async rejectRewardClaim(claimId: string, reason?: string, reviewedBy?: string): Promise<boolean> {
    const claim = this.rewardClaims.get(claimId);
    if (!claim) return false;

    const updatedClaim: RewardClaim = {
      ...claim,
      status: 'REJECTED',
      reviewedAt: new Date().toISOString(),
      reviewNote: reason || 'বাতিল করা হয়েছে',
      reviewedBy: reviewedBy || 'Admin',
    };
    this.rewardClaims.set(claimId, updatedClaim);
    this.notify();

    try {
      await setDoc(doc(db, 'rewardClaims', claimId), cleanForFirestore(updatedClaim), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] rejectRewardClaim note:', e);
    }

    // Send notification to customer
    await this.addNotification({
      id: `notif-reward-${Date.now()}`,
      userId: claim.userId,
      title: '❌ পুরস্কার দাবি বাতিল করা হয়েছে',
      body: `আপনার "${claim.prizeTitle}" পুরস্কার দাবিটি বাতিল করা হয়েছে। কারণ: ${reason || 'অনুরোধটি প্রক্রিয়াকরণ করা সম্ভব হয়নি। বিস্তারিত জানতে যোগাযোগ করুন।'}`,
      read: false,
      createdAt: new Date().toISOString(),
      type: 'reward_rejected',
    });

    return true;
  }

  public async saveRewardPrize(prize: RewardPrize): Promise<void> {
    this.rewardPrizes.set(prize.id, prize);
    this.scheduleLocalStoreSave();
    this.notify();
    try {
      await setDoc(doc(db, 'rewardPrizes', prize.id), cleanForFirestore(prize), { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] saveRewardPrize note (saved locally):', e?.message || e);
    }
  }

  public async deleteRewardPrize(prizeId: string): Promise<void> {
    this.rewardPrizes.delete(prizeId);
    this.scheduleLocalStoreSave();
    this.notify();
    try {
      await deleteDoc(doc(db, 'rewardPrizes', prizeId));
    } catch (e: any) {
      console.warn('[Firestore] deleteRewardPrize note (saved locally):', e?.message || e);
    }
  }

  public async awardCoinsToCustomer(userId: string, earnedCoins: number, orderId?: string) {
    if (!userId || !earnedCoins || earnedCoins <= 0) return;

    // 1. Update in-memory user if present
    const customer = this.users.get(userId);
    if (customer) {
      const credited = new Set(customer.creditedOrderIds || []);
      if (orderId) credited.add(orderId);
      const newCoinBalance = (customer.coins || 0) + earnedCoins;
      const newTotalEarned = (customer.totalEarnedCoins || 0) + earnedCoins;
      const updatedCustomer: UserProfile = {
        ...customer,
        coins: newCoinBalance,
        totalEarnedCoins: newTotalEarned,
        creditedOrderIds: Array.from(credited),
      };
      this.users.set(userId, updatedCustomer);
      this.notify();
    }

    if (orderId && typeof localStorage !== 'undefined') {
      localStorage.setItem(`credited_order_coins_${userId}_${orderId}`, 'true');
    }

    // 2. Atomic Firestore update so it always succeeds regardless of memory state
    try {
      const payload: any = {
        coins: increment(earnedCoins),
        totalEarnedCoins: increment(earnedCoins),
      };
      if (orderId) {
        payload.creditedOrderIds = arrayUnion(orderId);
      }
      await setDoc(doc(db, 'users', userId), payload, { merge: true });
    } catch (e: any) {
      console.warn('[Firestore] awardCoinsToCustomer error:', e?.message || e);
    }
  }

  public async ensureCustomerOrderCoinsAwarded(_userId: string, _order: Order) {
    // Coins for orders are awarded strictly on completion status change (DELIVERED) in updateOrder/updateOrderStatus.
    // Kept as a safe no-op to prevent retroactively inflating coins on settings changes or snapshot fetches.
    return;
  }

  public async reconcileCustomerCoins(_userId: string) {
    // Coins for orders are awarded strictly on completion status change (DELIVERED) in updateOrder/updateOrderStatus.
    // Kept as a safe no-op to prevent retroactively re-awarding coins when service coins are updated in Admin panel.
    return;
  }

  public async updateUserCoins(
    userId: string,
    newCoins: number,
    reason?: string
  ): Promise<{ success: boolean; user?: UserProfile; delta: number }> {
    if (!userId) return { success: false, delta: 0 };
    let user = this.users.get(userId);
    if (!user) {
      user = (await this.fetchUserFromFirestore(userId)) || undefined;
      if (!user) return { success: false, delta: 0 };
    }

    const cleanCoins = Math.max(0, Math.floor(newCoins));
    const oldCoins = typeof user.coins === 'number' ? user.coins : 0;
    const delta = cleanCoins - oldCoins;

    let updatedLifetime = user.totalEarnedCoins || 0;
    if (delta > 0) {
      updatedLifetime = Math.max(updatedLifetime, oldCoins) + delta;
    }

    const updatedUser: UserProfile = {
      ...user,
      coins: cleanCoins,
      totalEarnedCoins: updatedLifetime,
    };

    this.users.set(userId, updatedUser);
    this.notify();

    // 1. Sync to Firestore
    try {
      await setDoc(
        doc(db, 'users', userId),
        {
          coins: cleanCoins,
          totalEarnedCoins: updatedLifetime,
        },
        { merge: true }
      );
    } catch (e: any) {
      console.warn('[Firestore] updateUserCoins sync error:', e?.message || e);
    }

    // 2. Add in-app notification to the user so they know their coins were modified
    try {
      const notifTitle =
        delta > 0
          ? `🎁 +${delta} জামানত কয়েন যোগ হয়েছে!`
          : delta < 0
            ? `🪙 ${delta} জামানত কয়েন সমন্বয় করা হয়েছে`
            : `🪙 জামানত কয়েন আপডেট করা হয়েছে`;

      const notifBody =
        delta > 0
          ? `এডমিন আপনার অ্যাকাউন্টে +${delta} কয়েন যোগ করেছেন। বর্তমান কয়েন ব্যালেন্স: ${cleanCoins} কয়েন।${reason ? ` (নোট: ${reason})` : ''}`
          : delta < 0
            ? `এডমিন আপনার অ্যাকাউন্টের কয়েন ব্যালেন্স সমন্বয় করে ${cleanCoins} কয়েন নির্ধারণ করেছেন (${delta} কয়েন)।${reason ? ` (নোট: ${reason})` : ''}`
            : `এডমিন আপনার অ্যাকাউন্টের কয়েন ব্যালেন্স ${cleanCoins} কয়েন নিশ্চিত করেছেন।${reason ? ` (নোট: ${reason})` : ''}`;

      await this.addNotification({
        id: `notif-${Date.now()}-coins-adj`,
        userId: userId,
        title: notifTitle,
        body: notifBody,
        createdAt: new Date().toISOString(),
        read: false,
        type: 'coins_earned',
      });
    } catch (e) {
      console.warn('[Firestore] updateUserCoins notif error:', e);
    }

    return { success: true, user: updatedUser, delta };
  }

  public async deductCoinsForFreeDelivery(userId: string, coinsToDeduct: number, orderId: string): Promise<boolean> {
    if (!userId || !coinsToDeduct || coinsToDeduct <= 0) return false;

    try {
      // Always fetch fresh coin balance from Firestore — do NOT rely on local cache.
      // This ensures correctness when called from any device (helper, admin, etc.)
      // where the customer's profile may not be loaded locally.
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (!userSnap.exists()) {
        console.warn('[deductCoinsForFreeDelivery] User not found:', userId);
        return false;
      }
      const freshUser = userSnap.data() as UserProfile;
      const currentCoins = typeof freshUser.coins === 'number' ? freshUser.coins : 0;
      const updatedCoins = Math.max(0, currentCoins - coinsToDeduct);

      // Update locally if the user is cached
      const cachedUser = this.users.get(userId);
      if (cachedUser) {
        this.users.set(userId, { ...cachedUser, coins: updatedCoins });
        this.notify();
      }

      // Persist to Firestore
      await setDoc(doc(db, 'users', userId), { coins: updatedCoins }, { merge: true });

      // Record a coin transaction for the deduction
      const txId = `ctx-free-delivery-${orderId}-${Date.now()}`;
      const tx: CoinTransaction = {
        id: txId,
        userId,
        amount: -coinsToDeduct,
        type: 'FREE_DELIVERY',
        description: `Free delivery redeemed for order #${orderId}`,
        orderId,
        createdAt: new Date().toISOString(),
      };
      setDoc(doc(db, 'coinTransactions', txId), cleanForFirestore(tx)).catch(() => { });

      return true;
    } catch (e) {
      console.warn('[Firestore] deductCoinsForFreeDelivery error:', e);
      return false;
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
      status: 'Approved',
      canReceiveOrders: true,
    };
    this.shops.set(shopId, shop);

    // Update user profile: mark as approved store
    const storeOwner = await this.getUserForUpdate(existing.userId);
    if (storeOwner) {
      const updatedUser: UserProfile = {
        ...storeOwner,
        isStore: true,
        isStoreApproved: true,
        storeId: shopId,
        lastActiveMode: 'store',
      };
      this.users.set(existing.userId, updatedUser);
      try { await this.saveUser(updatedUser); } catch (_) { }
    } else {
      // Owner's profile document is missing — still persist the store flags so the
      // owner lands on the store dashboard the next time they sign in.
      try {
        await setDoc(
          doc(db, 'users', existing.userId),
          cleanForFirestore({
            uid: existing.userId,
            email: existing.userEmail,
            displayName: existing.userName,
            isStore: true,
            isStoreApproved: true,
            storeId: shopId,
            lastActiveMode: 'store',
          }),
          { merge: true }
        );
      } catch (_) { }
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
      try { await deleteDoc(doc(db, 'shops', shopId)); } catch (_) { }

      const storeOwner = await this.getUserForUpdate(existing.userId);
      if (storeOwner) {
        const updatedUser: UserProfile = {
          ...storeOwner,
          isStore: false,
          isStoreApproved: false,
          storeId: undefined,
          role: storeOwner.role === 'store' ? 'customer' : storeOwner.role,
          lastActiveMode: storeOwner.lastActiveMode === 'store' ? 'customer' : storeOwner.lastActiveMode,
        };
        this.users.set(existing.userId, updatedUser);
        try { await this.saveUser(updatedUser); } catch (_) { }
      }
    }
    this.storeApplications.delete(appId);
    this.scheduleLocalStoreSave();
    this.notify();
    try {
      await deleteDoc(doc(db, 'storeApplications', appId));
    } catch (e: any) {
      console.warn('[Firestore] deleteStoreApp note (saved locally):', e?.message || e);
    }
  }

  public async blockStoreUser(userId: string, reason: string) {
    const storeOwner = await this.getUserForUpdate(userId);
    if (!storeOwner) return;
    const updatedUser: UserProfile = {
      ...storeOwner,
      isBlocked: true,
      blockedReason: reason,
      isStore: false,
      isStoreApproved: false,
    };
    this.users.set(userId, updatedUser);
    this.scheduleLocalStoreSave();
    this.notify();
    try { await this.saveUser(updatedUser); } catch (_) { }
  }

  /**
   * Admin: every user. Read in pages (_scanCollection) and kept for the session,
   * since the user and helper tabs call this on each search and page change and
   * the admin modals on each open. Pass force to read it again.
   */
  public async getAllUsers(force = false): Promise<UserProfile[]> {
    if (!this._allUsersPromise || force) {
      const load = async () => {
        try {
          const docs = await this._scanCollection('users');
          // The admin left admin mode while this was reading: every user's
          // profile has no place in another role's store (or its cache).
          if (!this._listenersRole?.startsWith('admin:')) {
            this._allUsersPromise = null;
            return;
          }
          const map = new Map<string, UserProfile>();
          docs.forEach((d) => {
            const u = d.data() as UserProfile;
            const uid = u.uid || d.id;
            if (uid) map.set(uid, { ...u, uid });
          });
          this.users = map;
          this.scheduleLocalStoreSave();
          this.notify();
        } catch (e) {
          console.warn('[Firestore] getAllUsers error:', e);
          this._allUsersPromise = null; // let the next call try again
        }
      };
      this._allUsersPromise = load();
    }
    await this._allUsersPromise;
    return Array.from(this.users.values());
  }

  public async getAllShops(): Promise<Shop[]> {
    try {
      const snap = await getDocs(collection(db, 'shops'));
      const list: Shop[] = [];
      const map = new Map<string, Shop>();
      snap.forEach((docSnap) => {
        const s = docSnap.data() as Shop;
        const id = s.id || docSnap.id;
        if (id) {
          const shopObj = { ...s, id };
          map.set(id, shopObj);
          list.push(shopObj);
        }
      });
      this.shops = map;
      this.scheduleLocalStoreSave();
      this.notify();
      return list;
    } catch (e) {
      console.warn('[Firestore] getAllShops error:', e);
      return Array.from(this.shops.values());
    }
  }

  public async getAllHelperApplications(): Promise<HelperApplication[]> {
    try {
      const snap = await getDocs(collection(db, 'helperApplications'));
      const list: HelperApplication[] = [];
      const map = new Map<string, HelperApplication>();
      snap.forEach((docSnap) => {
        const app = docSnap.data() as HelperApplication;
        const id = app.id || docSnap.id;
        if (id) {
          const appObj = { ...app, id };
          map.set(id, appObj);
          list.push(appObj);
        }
      });
      this.helperApplications = map;
      this.scheduleLocalStoreSave();
      this.notify();
      return list;
    } catch (e) {
      console.warn('[Firestore] getAllHelperApplications error:', e);
      return Array.from(this.helperApplications.values());
    }
  }

  public async getAllWithdrawals(): Promise<WithdrawalRequest[]> {
    try {
      const snap = await getDocs(collection(db, 'withdrawals'));
      const list: WithdrawalRequest[] = [];
      const map = new Map<string, WithdrawalRequest>();
      snap.forEach((docSnap) => {
        const w = docSnap.data() as WithdrawalRequest;
        const id = w.id || docSnap.id;
        if (id) {
          const wdObj = { ...w, id };
          map.set(id, wdObj);
          list.push(wdObj);
        }
      });
      this.withdrawals = map;
      this.scheduleLocalStoreSave();
      this.notify();
      return list;
    } catch (e) {
      console.warn('[Firestore] getAllWithdrawals error:', e);
      return Array.from(this.withdrawals.values());
    }
  }

  public async getAllOrderFeedbacks(): Promise<OrderFeedback[]> {
    try {
      const snap = await getDocs(collection(db, 'orderFeedbacks'));
      const list: OrderFeedback[] = [];
      const map = new Map<string, OrderFeedback>();
      snap.forEach((docSnap) => {
        const f = docSnap.data() as OrderFeedback;
        const id = f.id || docSnap.id;
        if (id) {
          const fbObj = { ...f, id };
          map.set(id, fbObj);
          list.push(fbObj);
        }
      });
      this.orderFeedbacks = map;
      this.scheduleLocalStoreSave();
      this.notify();
      return list;
    } catch (e) {
      console.warn('[Firestore] getAllOrderFeedbacks error:', e);
      return Array.from(this.orderFeedbacks.values());
    }
  }

  public async getAllCustomModals(): Promise<AdminCustomModalConfig[]> {
    try {
      const snap = await getDocs(collection(db, 'customModals'));
      const list: AdminCustomModalConfig[] = [];
      const map = new Map<string, AdminCustomModalConfig>();
      snap.forEach((docSnap) => {
        const c = docSnap.data() as AdminCustomModalConfig;
        const id = c.id || docSnap.id;
        if (id) {
          const modalObj = { ...c, id };
          map.set(id, modalObj);
          list.push(modalObj);
        }
      });
      this.customModals = map;
      this.scheduleLocalStoreSave();
      this.notify();
      return list;
    } catch (e) {
      console.warn('[Firestore] getAllCustomModals error:', e);
      return Array.from(this.customModals.values());
    }
  }

  public async addServerAddress(addr: ServerAddress): Promise<void> {
    this.serverAddresses.set(addr.id, addr);
    this.scheduleLocalStoreSave();
    this.notify();
    try {
      await setDoc(doc(db, 'server_addresses', addr.id), cleanForFirestore(addr), { merge: true });
    } catch (e) {
      console.warn('[Firestore] addServerAddress error:', e);
    }
  }

  public resolveLocation(loc?: LocationData): LocationData | undefined {
    if (!loc) return loc;
    if (loc.addressId && this.serverAddresses.has(loc.addressId)) {
      const sa = this.serverAddresses.get(loc.addressId)!;
      return {
        ...loc,
        address: sa.address,
        name: sa.shortName || loc.name,
        lat: typeof sa.lat === 'number' ? sa.lat : loc.lat,
        lng: typeof sa.lng === 'number' ? sa.lng : loc.lng,
        details: sa.details || loc.details,
        addressId: sa.id,
      };
    }
    if (loc.address) {
      const norm = loc.address.trim().toLowerCase();
      const matched = Array.from(this.serverAddresses.values()).find(
        (s) => s.address && s.address.trim().toLowerCase() === norm
      );
      if (matched) {
        return {
          ...loc,
          address: matched.address,
          name: matched.shortName || loc.name,
          lat: typeof matched.lat === 'number' ? matched.lat : loc.lat,
          lng: typeof matched.lng === 'number' ? matched.lng : loc.lng,
          details: matched.details || loc.details,
          addressId: matched.id,
        };
      }
    }
    return loc;
  }

  public resolveOrderLocations(order: Order): Order {
    if (!order) return order;
    // Self-healing: If an order has a helper assigned (helperId) but status is still PENDING, ensure it reflects ACCEPTED
    const effectiveStatus = (order.helperId && order.status === 'PENDING') ? 'ACCEPTED' : order.status;
    return {
      ...order,
      status: effectiveStatus,
      deliveryLocation: order.deliveryLocation ? this.resolveLocation(order.deliveryLocation)! : order.deliveryLocation,
      pickupLocation: order.pickupLocation ? this.resolveLocation(order.pickupLocation) : order.pickupLocation,
    };
  }

  public async updateServerAddress(id: string, updates: Partial<ServerAddress>): Promise<void> {
    const existing = this.serverAddresses.get(id);
    if (!existing) return;
    const oldAddressText = existing.address.trim().toLowerCase();
    const updated: ServerAddress = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.serverAddresses.set(id, updated);
    const newAddressText = updated.address.trim();

    // 1. Update all matching orders in store and sync to Firestore
    const orderPromises: Promise<void>[] = [];
    this.orders.forEach((ord, orderId) => {
      let isChanged = false;
      let newDeliv = ord.deliveryLocation;
      let newPickup = ord.pickupLocation;

      if (newDeliv) {
        const isMatch = (newDeliv.addressId && newDeliv.addressId === id) ||
          (newDeliv.address && newDeliv.address.trim().toLowerCase() === oldAddressText);
        if (isMatch) {
          newDeliv = {
            ...newDeliv,
            address: newAddressText,
            name: updated.shortName || newDeliv.name,
            lat: typeof updated.lat === 'number' ? updated.lat : newDeliv.lat,
            lng: typeof updated.lng === 'number' ? updated.lng : newDeliv.lng,
            addressId: id,
          };
          isChanged = true;
        }
      }

      if (newPickup) {
        const isMatch = (newPickup.addressId && newPickup.addressId === id) ||
          (newPickup.address && newPickup.address.trim().toLowerCase() === oldAddressText);
        if (isMatch) {
          newPickup = {
            ...newPickup,
            address: newAddressText,
            name: updated.shortName || newPickup.name,
            lat: typeof updated.lat === 'number' ? updated.lat : newPickup.lat,
            lng: typeof updated.lng === 'number' ? updated.lng : newPickup.lng,
            addressId: id,
          };
          isChanged = true;
        }
      }

      if (isChanged) {
        const newOrd: Order = {
          ...ord,
          deliveryLocation: newDeliv,
          pickupLocation: newPickup,
          updatedAt: new Date().toISOString(),
        };
        this.orders.set(orderId, newOrd);
        orderPromises.push(
          updateDoc(
            doc(db, 'orders', orderId),
            cleanForFirestore({ deliveryLocation: newDeliv, ...(newPickup ? { pickupLocation: newPickup } : {}), updatedAt: newOrd.updatedAt })
          ).then(() => { }).catch(() => { })
        );
      }
    });

    // 2. Update user default locations in users map & Firestore
    this.users.forEach((user, uid) => {
      if (user.defaultDeliveryLocation) {
        const isMatch = (user.defaultDeliveryLocation.addressId && user.defaultDeliveryLocation.addressId === id) ||
          (user.defaultDeliveryLocation.address && user.defaultDeliveryLocation.address.trim().toLowerCase() === oldAddressText);
        if (isMatch) {
          const updatedUser: UserProfile = {
            ...user,
            defaultDeliveryLocation: {
              ...user.defaultDeliveryLocation,
              address: newAddressText,
              name: updated.shortName || user.defaultDeliveryLocation.name,
              lat: typeof updated.lat === 'number' ? updated.lat : user.defaultDeliveryLocation.lat,
              lng: typeof updated.lng === 'number' ? updated.lng : user.defaultDeliveryLocation.lng,
              addressId: id,
            },
          };
          this.users.set(uid, updatedUser);
          orderPromises.push(
            setDoc(doc(db, 'users', uid), cleanForFirestore(updatedUser), { merge: true }).then(() => { }).catch(() => { })
          );
        }
      }
    });

    // 3. Update localStorage saved keys
    if (typeof window !== 'undefined') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('jamanot_')) {
            const raw = localStorage.getItem(key);
            if (raw && (raw.includes(id) || raw.toLowerCase().includes(oldAddressText))) {
              try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  let arrChanged = false;
                  const newArr = parsed.map((item) => {
                    if (item && typeof item === 'object' && ('address' in item || 'addressId' in item)) {
                      if (item.addressId === id || (item.address && item.address.trim().toLowerCase() === oldAddressText)) {
                        arrChanged = true;
                        return {
                          ...item,
                          address: newAddressText,
                          name: updated.shortName || item.name,
                          lat: typeof updated.lat === 'number' ? updated.lat : item.lat,
                          lng: typeof updated.lng === 'number' ? updated.lng : item.lng,
                          addressId: id,
                        };
                      }
                    }
                    return item;
                  });
                  if (arrChanged) {
                    localStorage.setItem(key, JSON.stringify(newArr));
                  }
                } else if (parsed && typeof parsed === 'object' && ('address' in parsed || 'addressId' in parsed)) {
                  if (parsed.addressId === id || (parsed.address && parsed.address.trim().toLowerCase() === oldAddressText)) {
                    localStorage.setItem(key, JSON.stringify({
                      ...parsed,
                      address: newAddressText,
                      name: updated.shortName || parsed.name,
                      lat: typeof updated.lat === 'number' ? updated.lat : parsed.lat,
                      lng: typeof updated.lng === 'number' ? updated.lng : parsed.lng,
                      addressId: id,
                    }));
                  }
                }
              } catch (_) { }
            }
          }
        }
      } catch (_) { }
    }

    this.scheduleLocalStoreSave();
    this.notify();
    try {
      await setDoc(doc(db, 'server_addresses', id), cleanForFirestore(updated), { merge: true });
      await Promise.all(orderPromises);
    } catch (e) {
      console.warn('[Firestore] updateServerAddress error:', e);
    }
  }

  public async deleteServerAddress(id: string): Promise<void> {
    this.serverAddresses.delete(id);
    this.scheduleLocalStoreSave();
    this.notify();
    try {
      await deleteDoc(doc(db, 'server_addresses', id));
    } catch (e) {
      console.warn('[Firestore] deleteServerAddress error:', e);
    }
  }

  public async getAllServerAddresses(): Promise<ServerAddress[]> {
    try {
      const snap = await getDocs(collection(db, 'server_addresses'));
      const map = new Map<string, ServerAddress>();
      snap.forEach((docSnap) => {
        const addr = docSnap.data() as ServerAddress;
        if (addr) {
          const id = addr.id || docSnap.id;
          map.set(id, { ...addr, id });
        }
      });
      this.serverAddresses = map;
      this.orders.forEach((ord, id) => {
        this.orders.set(id, this.resolveOrderLocations(ord));
      });
      this.scheduleLocalStoreSave();
      this.notify();
      return Array.from(map.values());
    } catch (e) {
      console.warn('[Firestore] getAllServerAddresses error:', e);
      return Array.from(this.serverAddresses.values());
    }
  }

  public async searchServerAddresses(query: string, maxResults = 4): Promise<ServerAddress[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    try {
      await this._loadServerAddressesCached();
    } catch (_) { }

    const tokens = q.split(/[\s,]+/).filter(Boolean);
    const results = Array.from(this.serverAddresses.values())
      .map((item) => {
        const itemText = (item.address || '').toLowerCase();
        const itemShort = (item.shortName || '').toLowerCase();
        const itemDetails = (item.details || '').toLowerCase();
        const full = `${itemText} ${itemShort} ${itemDetails}`;

        let score = 0;
        if (itemText.startsWith(q)) score += 100;
        else if (itemShort.startsWith(q)) score += 90;
        else if (itemText.includes(q)) score += 60;
        else if (full.includes(q)) score += 50;
        else if (tokens.length > 0) {
          let tokenMatches = 0;
          for (const token of tokens) {
            if (full.includes(token)) tokenMatches++;
          }
          if (tokenMatches > 0) {
            score += (tokenMatches / tokens.length) * 40;
            if (tokenMatches === tokens.length) score += 25;
          }
        }
        if (score === 0) return { item, score: 0 };
        if (item.lat && item.lng) score += 5;
        score += Math.min(item.usageCount || 1, 10);
        return { item, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item)
      .slice(0, maxResults);

    return results;
  }

  public async recordOrUpsertServerAddress(
    addressText: string,
    coords?: { lat?: number; lng?: number; shortName?: string; details?: string }
  ): Promise<ServerAddress> {
    const cleanText = addressText.trim();
    if (!cleanText) throw new Error('Address is empty');

    // Check if an existing address matches cleanText
    const matched = Array.from(this.serverAddresses.values()).find(
      (a) => a.address.trim().toLowerCase() === cleanText.toLowerCase()
    );

    if (matched) {
      const shouldUpdate =
        (coords?.lat && coords?.lat !== matched.lat) ||
        (coords?.lng && coords?.lng !== matched.lng) ||
        (coords?.shortName && coords?.shortName !== matched.shortName) ||
        (coords?.details && coords?.details !== matched.details);

      if (shouldUpdate) {
        const updated: ServerAddress = {
          ...matched,
          lat: coords?.lat ?? matched.lat,
          lng: coords?.lng ?? matched.lng,
          shortName: coords?.shortName ?? matched.shortName,
          details: coords?.details ?? matched.details,
          usageCount: (matched.usageCount || 1) + 1,
          updatedAt: new Date().toISOString(),
        };
        this.serverAddresses.set(matched.id, updated);
        this.scheduleLocalStoreSave();
        this.notify();
        setDoc(doc(db, 'server_addresses', matched.id), cleanForFirestore(updated), { merge: true }).catch(() => { });
        return updated;
      }
      return matched;
    }

    // Create new ServerAddress
    const id = `addr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newAddr: ServerAddress = {
      id,
      address: cleanText,
      shortName: coords?.shortName || undefined,
      lat: coords?.lat || undefined,
      lng: coords?.lng || undefined,
      details: coords?.details || undefined,
      usageCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.serverAddresses.set(id, newAddr);
    this.scheduleLocalStoreSave();
    this.notify();
    setDoc(doc(db, 'server_addresses', id), cleanForFirestore(newAddr), { merge: true }).catch(() => { });
    return newAddr;
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


