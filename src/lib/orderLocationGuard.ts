import { fallbackStore } from '@/lib/firebase';
import { getNativePosition } from '@/lib/native';
import { getAreasForPoint } from '@/lib/geofenceUtils';
import { LocationData, UserProfile } from '@/types';
import { saveDefaultDeliveryLocation } from '@/lib/storage';

export interface EnsureLocationResult {
  allowed: boolean;
  lat?: number;
  lng?: number;
  areaId?: string;
  errorMessage?: string;
}

/**
 * Ensures user has map coordinates before placing an order.
 * - If coordinates already exist (passed or in user profile), returns them and ensures zone is set.
 * - If not, requests device/browser location permission.
 * - If granted, updates profile with defaultDeliveryLocation & areaId and returns them.
 * - If denied or failed, returns allowed: false with user-friendly message.
 */
export async function ensureOrderCoordinates(
  user?: UserProfile | null,
  currentLat?: number,
  currentLng?: number,
  addressText?: string
): Promise<EnsureLocationResult> {
  const allowedAreas = fallbackStore.pricingSettings.allowedDeliveryAreas || [];

  // 1. Check if coordinates are already present
  let lat = currentLat;
  let lng = currentLng;

  if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
    if (
      user?.defaultDeliveryLocation?.lat !== undefined &&
      user?.defaultDeliveryLocation?.lng !== undefined &&
      !isNaN(user.defaultDeliveryLocation.lat) &&
      !isNaN(user.defaultDeliveryLocation.lng)
    ) {
      lat = user.defaultDeliveryLocation.lat;
      lng = user.defaultDeliveryLocation.lng;
    }
  }

  // 2. If coordinates already exist:
  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
    const matched = getAreasForPoint({ lat, lng }, allowedAreas);
    const areaId = matched.length > 0 ? matched[0].id : (user?.areaId || undefined);

    // If user's profile is missing areaId or default coordinates, save it
    if (user?.uid && (!user.areaId || !user.defaultDeliveryLocation?.lat)) {
      const locData: LocationData = {
        address: addressText || user.defaultDeliveryLocation?.address || 'Current Location',
        lat,
        lng,
      };
      saveDefaultDeliveryLocation(locData);
      fallbackStore.saveCustomerLocation(user.uid, locData, areaId).catch(() => {});
    }

    return { allowed: true, lat, lng, areaId };
  }

  // 3. User account does NOT have coordinates — ask for location permission
  try {
    const pos = await getNativePosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });

    if (pos.lat && pos.lng) {
      const matched = getAreasForPoint({ lat: pos.lat, lng: pos.lng }, allowedAreas);
      const areaId = matched.length > 0 ? matched[0].id : undefined;

      const locData: LocationData = {
        address: addressText || user?.defaultDeliveryLocation?.address || 'Current Location',
        lat: pos.lat,
        lng: pos.lng,
      };

      saveDefaultDeliveryLocation(locData);

      if (user?.uid) {
        await fallbackStore.saveCustomerLocation(user.uid, locData, areaId);
      }

      return {
        allowed: true,
        lat: pos.lat,
        lng: pos.lng,
        areaId,
      };
    }

    return {
      allowed: false,
      errorMessage: 'লোকেশন শনাক্ত করা সম্ভব হয়নি। অনুগ্রহ করে ডিভাইসের জিপিএস অন করে আবার চেষ্টা করুন।',
    };
  } catch (err: any) {
    const isDenied =
      err?.code === 1 ||
      (typeof err?.message === 'string' && err.message.toLowerCase().includes('denied'));

    const msg = isDenied
      ? 'অর্ডার প্লেস করার জন্য আপনার লোকেশন পারমিশন অন করা আবশ্যক। অনুগ্রহ করে ব্রাউজার বা ডিভাইসের লোকেশন পারমিশন Allow করুন।'
      : 'আপনার লোকেশন পাওয়া যায়নি। অর্ডার করতে অনুগ্রহ করে ডিভাইসের GPS/লোকেশন চালু করুন।';

    return {
      allowed: false,
      errorMessage: msg,
    };
  }
}
