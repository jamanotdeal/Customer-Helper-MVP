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
