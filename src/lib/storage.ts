import { LocationData, MissingItemPref, ActiveMode } from '@/types';

const KEYS = {
  ALT_PHONE: 'jamanot_alt_phone',
  MISSING_ITEM_PREF: 'jamanot_missing_item_pref',
  DEFAULT_DELIVERY_LOCATION: 'jamanot_default_delivery_loc',
  LAST_ACTIVE_MODE: 'jamanot_last_active_mode',
};

export const getSavedAltPhone = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(KEYS.ALT_PHONE) || '';
};

export const saveAltPhone = (phone: string) => {
  if (typeof window === 'undefined') return;
  if (phone) localStorage.setItem(KEYS.ALT_PHONE, phone);
};

export const getSavedMissingItemPref = (): MissingItemPref | null => {
  if (typeof window === 'undefined') return null;
  const val = localStorage.getItem(KEYS.MISSING_ITEM_PREF);
  if (val === 'SKIP' || val === 'SIMILAR' || val === 'CALL') return val;
  return null;
};

export const saveMissingItemPref = (pref: MissingItemPref) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEYS.MISSING_ITEM_PREF, pref);
};

// ── Helper to dynamically resolve saved location data with latest server addresses ──
function resolveLocationWithServerAddresses(loc: LocationData | null): LocationData | null {
  if (!loc || typeof window === 'undefined') return loc;
  try {
    const rawSa = localStorage.getItem('jamanot_server_addresses');
    if (rawSa) {
      const parsed: [string, any][] = JSON.parse(rawSa);
      if (Array.isArray(parsed)) {
        if (loc.addressId) {
          const entry = parsed.find(([id]) => id === loc.addressId);
          if (entry && entry[1]?.address) {
            return {
              ...loc,
              address: entry[1].address,
              name: entry[1].shortName || loc.name,
              lat: typeof entry[1].lat === 'number' ? entry[1].lat : loc.lat,
              lng: typeof entry[1].lng === 'number' ? entry[1].lng : loc.lng,
              details: entry[1].details || loc.details,
              addressId: entry[0],
            };
          }
        }
        if (loc.address) {
          const norm = loc.address.trim().toLowerCase();
          const matched = parsed.find(([_, sa]) => sa?.address && sa.address.trim().toLowerCase() === norm);
          if (matched && matched[1]?.address) {
            return {
              ...loc,
              address: matched[1].address,
              name: matched[1].shortName || loc.name,
              lat: typeof matched[1].lat === 'number' ? matched[1].lat : loc.lat,
              lng: typeof matched[1].lng === 'number' ? matched[1].lng : loc.lng,
              details: matched[1].details || loc.details,
              addressId: matched[0],
            };
          }
        }
      }
    }
  } catch (_) {}
  return loc;
}

export const getSavedDefaultDeliveryLocation = (): LocationData | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(KEYS.DEFAULT_DELIVERY_LOCATION);
  if (!raw) return null;
  try {
    const loc = JSON.parse(raw);
    return resolveLocationWithServerAddresses(loc);
  } catch (e) {
    return null;
  }
};

export const saveDefaultDeliveryLocation = (loc: LocationData) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEYS.DEFAULT_DELIVERY_LOCATION, JSON.stringify(loc));
};

export const getSavedActiveMode = (): ActiveMode => {
  if (typeof window === 'undefined') return 'customer';
  const val = localStorage.getItem(KEYS.LAST_ACTIVE_MODE);
  if (val === 'helper' || val === 'admin') return val;
  return 'customer';
};

export const saveActiveMode = (mode: ActiveMode) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEYS.LAST_ACTIVE_MODE, mode);
};

// ── Per-category pickup location ─────────────────────────────────────────────

const servicePickupKey = (service: string, uid?: string) =>
  uid
    ? `jamanot_pickup_loc_${uid}_${service.trim().toLowerCase().replace(/\s+/g, '_')}`
    : `jamanot_pickup_loc_${service.trim().toLowerCase().replace(/\s+/g, '_')}`;

export const getServicePickupLocation = (service: string, uid?: string): LocationData | null => {
  if (typeof window === 'undefined' || !service) return null;
  // If uid provided, try user-specific key first, then fallback to global
  let raw = uid ? localStorage.getItem(servicePickupKey(service, uid)) : null;
  if (!raw) {
    raw = localStorage.getItem(servicePickupKey(service));
  }
  if (!raw) return null;
  try {
    const loc = JSON.parse(raw);
    return resolveLocationWithServerAddresses(loc);
  } catch {
    return null;
  }
};

export const saveServicePickupLocation = (service: string, loc: LocationData, uid?: string) => {
  if (typeof window === 'undefined' || !service) return;
  // Save to global key
  localStorage.setItem(servicePickupKey(service), JSON.stringify(loc));
  // If uid provided, also save to user-specific key
  if (uid) {
    localStorage.setItem(servicePickupKey(service, uid), JSON.stringify(loc));
  }
};

// ── Per-category delivery location ───────────────────────────────────────────

const serviceDeliveryKey = (service: string, uid?: string) =>
  uid
    ? `jamanot_delivery_loc_${uid}_${service.trim().toLowerCase().replace(/\s+/g, '_')}`
    : `jamanot_delivery_loc_${service.trim().toLowerCase().replace(/\s+/g, '_')}`;

export const getServiceDeliveryLocation = (service: string, uid?: string): LocationData | null => {
  if (typeof window === 'undefined' || !service) return null;
  let raw = uid ? localStorage.getItem(serviceDeliveryKey(service, uid)) : null;
  if (!raw) {
    raw = localStorage.getItem(serviceDeliveryKey(service));
  }
  if (!raw) return null;
  try {
    const loc = JSON.parse(raw);
    return resolveLocationWithServerAddresses(loc);
  } catch {
    return null;
  }
};

export const saveServiceDeliveryLocation = (service: string, loc: LocationData, uid?: string) => {
  if (typeof window === 'undefined' || !service) return;
  localStorage.setItem(serviceDeliveryKey(service), JSON.stringify(loc));
  if (uid) {
    localStorage.setItem(serviceDeliveryKey(service, uid), JSON.stringify(loc));
  }
};

// ── Map guide overlay show count ─────────────────────────────────────────────
// modalType: 'pickup' | 'delivery'

const mapGuideKey = (modalType: string) => `jamanot_map_guide_count_${modalType}`;

export const getMapGuideShowCount = (modalType: string): number => {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(mapGuideKey(modalType)) || '0', 10);
};

export const incrementMapGuideShowCount = (modalType: string): number => {
  if (typeof window === 'undefined') return 0;
  const next = getMapGuideShowCount(modalType) + 1;
  localStorage.setItem(mapGuideKey(modalType), String(next));
  return next;
};

// ── Customer saved delivery addresses ──────────────────────────────────────
// Stored per-user to avoid mixing data between accounts on shared devices.

const savedAddressesKey = (uid: string) => `jamanot_saved_delivery_addresses_${uid}`;
const savedPickupAddressesKey = (uid: string) => `jamanot_saved_pickup_addresses_${uid}`;
const MAX_SAVED_ADDRESSES = 10;

export const getSavedDeliveryAddresses = (uid: string): import('@/types').LocationData[] => {
  if (typeof window === 'undefined' || !uid) return [];
  try {
    const raw = localStorage.getItem(savedAddressesKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => resolveLocationWithServerAddresses(item) || item);
  } catch {
    return [];
  }
};

export const saveSavedDeliveryAddresses = (uid: string, addresses: import('@/types').LocationData[]) => {
  if (typeof window === 'undefined' || !uid) return;
  // Cap to max and deduplicate by address string (case-insensitive)
  const seen = new Set<string>();
  const deduped = addresses.filter((a) => {
    const key = a.address.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_SAVED_ADDRESSES);
  localStorage.setItem(savedAddressesKey(uid), JSON.stringify(deduped));
};

/**
 * Adds a new address to the saved list for a user (prepends, deduplicates, caps).
 * Returns the updated list.
 */
export const addSavedDeliveryAddress = (uid: string, newAddress: import('@/types').LocationData): import('@/types').LocationData[] => {
  const existing = getSavedDeliveryAddresses(uid);
  // Remove any entry with the same address string
  const filtered = existing.filter(
    (a) => a.address.trim().toLowerCase() !== newAddress.address.trim().toLowerCase()
  );
  // Prepend (most recent first)
  const updated = [newAddress, ...filtered].slice(0, MAX_SAVED_ADDRESSES);
  saveSavedDeliveryAddresses(uid, updated);
  return updated;
};

// ── Customer saved pickup addresses ────────────────────────────────────────

export const getSavedPickupAddresses = (uid: string): import('@/types').LocationData[] => {
  if (typeof window === 'undefined' || !uid) return [];
  try {
    const raw = localStorage.getItem(savedPickupAddressesKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => resolveLocationWithServerAddresses(item) || item);
  } catch {
    return [];
  }
};

export const saveSavedPickupAddresses = (uid: string, addresses: import('@/types').LocationData[]) => {
  if (typeof window === 'undefined' || !uid) return;
  const seen = new Set<string>();
  const deduped = addresses.filter((a) => {
    const key = a.address.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_SAVED_ADDRESSES);
  localStorage.setItem(savedPickupAddressesKey(uid), JSON.stringify(deduped));
};

/**
 * Adds a new pickup address to the user's saved list (prepends, deduplicates, caps).
 * Returns the updated list.
 */
export const addSavedPickupAddress = (uid: string, newAddress: import('@/types').LocationData): import('@/types').LocationData[] => {
  const existing = getSavedPickupAddresses(uid);
  const filtered = existing.filter(
    (a) => a.address.trim().toLowerCase() !== newAddress.address.trim().toLowerCase()
  );
  const updated = [newAddress, ...filtered].slice(0, MAX_SAVED_ADDRESSES);
  saveSavedPickupAddresses(uid, updated);
  return updated;
};


