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

export const getSavedDefaultDeliveryLocation = (): LocationData | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(KEYS.DEFAULT_DELIVERY_LOCATION);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
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

const servicePickupKey = (service: string) =>
  `jamanot_pickup_loc_${service.trim().toLowerCase().replace(/\s+/g, '_')}`;

export const getServicePickupLocation = (service: string): LocationData | null => {
  if (typeof window === 'undefined' || !service) return null;
  const raw = localStorage.getItem(servicePickupKey(service));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const saveServicePickupLocation = (service: string, loc: LocationData) => {
  if (typeof window === 'undefined' || !service) return;
  localStorage.setItem(servicePickupKey(service), JSON.stringify(loc));
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

