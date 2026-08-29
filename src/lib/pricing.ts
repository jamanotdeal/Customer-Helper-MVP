import { PricingSettings } from '@/types';

export const DEFAULT_INPUT_PLACEHOLDERS: string[] = [
  'চাল, ডাল, তেল, তরকারি বা ঘরের বাজার...',
  'লন্ড্রির কাপড় পাঠানো বা দোকান থেকে আনা...',
  'পছন্দের রেস্তোরাঁ থেকে গরম খাবার...',
  'যেকোনো জরুরি পার্সেল এক স্থান থেকে অন্য স্থানে...',
  'ফার্মেসি থেকে জরুরি প্রয়োজনীয় ওষুধ...',
  'অন্য যেকোনো কাজ যা আপনার প্রয়োজন...',
];

/**
 * Service-specific description hints shown as textarea placeholder
 * when a customer picks a particular service from the dropdown.
 * Key should match the service name exactly (case-sensitive).
 */
export const SERVICE_DESCRIPTION_HINTS: Record<string, string> = {
  // Latin transliterated service names (default)
  'Bazar-sodai korte hobe': '(গ্যাস, শাকসবজি, মাছ-মাংস, চাল, ডাল, তেল, পেঁয়াজ ইত্যাদি — যা যা লাগবে লিখুন)',
  'Khabar ante hobe': '(কোন রেস্তোরাঁ থেকে, কোন খাবার, কত পিস বা পরিমাণ — বিস্তারিত লিখুন)',
  'Medicine ante hobe': '(ওষুধের নাম, পরিমাণ, ফার্মেসির নাম বা এলাকা উল্লেখ করুন)',
  'zuta selai korte hobe': '(কোন ধরনের জুতা, কী সমস্যা আছে, বিস্তারিত বলুন)',
  'amar parcel recive kore dite hobe': '(কোথায় পার্সেল আছে, কোন নাম বা অর্ডার নম্বরে, ডেলিভারি কোথায় দিতে হবে)',
  'mix': '(সব কাজের বিস্তারিত একটি একটি করে লিখুন)',
  'onno kicu': '(আপনার কাজটি যতটা সম্ভব বিস্তারিতভাবে বলুন)',

  // Bengali service names (admin may configure these)
  'বাজার-সদাই করে দিন': '(গ্যাস, শাকসবজি, মাছ-মাংস, চাল, ডাল, তেল, পেঁয়াজ ইত্যাদি — যা যা লাগবে লিখুন)',
  'খাবার এনে দিন': '(কোন রেস্তোরাঁ থেকে, কোন খাবার, কত পিস বা পরিমাণ — বিস্তারিত লিখুন)',
  'ওষুধ এনে দিন': '(ওষুধের নাম, পরিমাণ, ফার্মেসির নাম বা এলাকা উল্লেখ করুন)',
  'জুতা সেলাই করে দিন': '(কোন ধরনের জুতা, কী সমস্যা আছে, বিস্তারিত বলুন)',
  'পার্সেল রিসিভ করে দিন': '(কোথায় পার্সেল আছে, কোন নাম বা অর্ডার নম্বরে, ডেলিভারি কোথায় দিতে হবে)',
  'মিক্স / একাধিক কাজ': '(সব কাজের বিস্তারিত একটি একটি করে লিখুন)',
  'অন্য কিছু': '(আপনার কাজটি যতটা সম্ভব বিস্তারিতভাবে বলুন)',
};

/** Returns a description placeholder for a given service name */
export function getServiceDescriptionHint(service: string, settings?: PricingSettings): string {
  if (!service) return 'কী লাগবে বা করতে হবে তা এখানে বিস্তারিত লিখুন....';

  // 1. Check admin-configured custom hints first (exact)
  if (settings?.serviceDescriptionHints?.[service]) {
    return settings.serviceDescriptionHints[service];
  }

  // 2. Exact match in built-in map
  if (SERVICE_DESCRIPTION_HINTS[service]) {
    return SERVICE_DESCRIPTION_HINTS[service];
  }

  // 3. Case-insensitive / partial fuzzy match
  const lowerService = service.toLowerCase().trim();
  const matchKey = Object.keys(SERVICE_DESCRIPTION_HINTS).find(
    (k) => k.toLowerCase().includes(lowerService) || lowerService.includes(k.toLowerCase())
  );
  if (matchKey) return SERVICE_DESCRIPTION_HINTS[matchKey];

  return 'কী লাগবে বা করতে হবে তা এখানে বিস্তারিত লিখুন....';
}

export const DEFAULT_SERVICES: string[] = [
  'Bazar-sodai korte hobe',
  'Khabar ante hobe',
  'Medicine ante hobe',
  'zuta selai korte hobe',
  'amar parcel recive kore dite hobe',
  'mix',
  'onno kicu',
];

export const DEFAULT_STORE_TYPES: string[] = [
  'Grocery & Supermarket',
  'Pharmacy & Medicine',
  'Restaurant & Fast Food',
  'Meat & Fish Market',
  'Fruits & Vegetables',
  'Electronics & Gadgets',
  'Stationery & Books',
  'Clothing & Fashion',
  'Laundry & Dry Cleaning',
  'Other',
];

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  rules: [
    { maxOrderValue: 100, fee: 20 },
    { maxOrderValue: 500, fee: 30 },
    { maxOrderValue: 1000, fee: 40 },
  ],
  helperCommissionPercent: 80,
  minWithdrawalAmount: 100,
  helperActiveOrderLimit: 5,
  inputPlaceholders: DEFAULT_INPUT_PLACEHOLDERS,
  services: DEFAULT_SERVICES,
  orderTimingType: 'always_on',
  orderTimingStart: '08:00',
  orderTimingEnd: '22:00',
  orderTimingMessage: 'অনুরোধ গ্রহণ সাময়িকভাবে বন্ধ আছে। পরে আবার চেষ্টা করুন।',
  eduEmailDomains: ['@diu.edu.bd'],
  dedicatedHelperDelayMinutes: 7,
  orderReceiverRule: 'commuter_first',
  helperRadiusKm: 3.5,
  mapLocationPreference: 'BD',
  customCountryCode: 'bd',
  locationPermissionModalTitle: 'লোকেশন পারমিশন আবশ্যক (Location Required)',
  locationPermissionModalBody: 'কম্পিউটার হেলপার (Commuter Helper) মোড চালু করতে এবং আপনার আশেপাশের অর্ডারের নোটিফিকেশন পেতে ডিভাইসের জিপিএস লোকেশন পারমিশন দেওয়া আবশ্যক। অনুগ্রহ করে ব্রাউজার সেটিংসে Location Allow করুন।',
  notificationPermissionModalTitle: 'নোটিফিকেশন পারমিশন আবশ্যক (Notification Required)',
  notificationPermissionModalBody: 'জরুরি আপডেট ও অর্ডারের নোটিফিকেশন পাওয়ার জন্য ব্রাউজার বা ডিভাইসে নোটিফিকেশন পারমিশন দেওয়া আবশ্যক।',
  bkashInstructions: 'bKash Personal: Send Money to 018XXXXXXXX and provide transaction ID.',
  nagadInstructions: 'Nagad Personal: Send Money to 018XXXXXXXX and provide transaction ID.',
  rocketInstructions: 'Rocket Personal: Send Money to 018XXXXXXXX and provide transaction ID.',
  bankInstructions: 'Bank Account: Transfer due commission to Bank Name, Account: XXXX-XXXX-XXXX, Branch: XXX, and write Reference.',
  cashInstructions: 'Cash Payment: Pay directly at the Jamanot office desk and get a receipt.',
  storeTypes: DEFAULT_STORE_TYPES,
  // Map picker guide overlay
  mapPickerGuideText: 'যে location select করতে চান, সেখান পিন (icon) টি নিয়ে বসান, বা ওই place-এ click করুন। তারপর specific ভাবে building, market-এর নাম add করুন map-এর নিচের যে input box টি আছে সেখানে।',
  mapPickerPickupGuideText: 'যে দোকান বা স্থান থেকে আনতে বা কাজ করতে হবে, সেই স্থানে ম্যাপের পিন সরিয়ে নিয়ে যান অথবা ক্লিক করুন। দোকানের নাম বা বিস্তারিত ঠিকানা নিচের input box-এ লিখুন।',
  mapPickerDeliveryGuideText: 'আপনার বাসা বা ডেলিভারি পাওয়ার স্থানে পিন সরিয়ে নিন। ডেলিভারি ঠিকানা নির্ভুল হলে হেল্পার ঠিক সময়ে পৌঁছাতে পারবেন। নিচের box-এ বাসার নাম বা ফ্ল্যাট নম্বর যোগ করুন।',
  mapPickerGuideOkText: 'ঠিক আছে',
  mapPickerGuideShowCount: 5,
  // Fee Details Estimation Calculator & Company Description Defaults
  feeCalculatorBasePrice: 0,
  feeCalculatorPerKmRate: 10,
  feeCalculatorPerKgRate: 5,
  feeCalculatorReturnFee: 15,
  feeCalculatorReturnPercent: 20,
  feeCalculatorProcessingFee: 5,
  feeCalculatorProcessingFeeType: 'flat',
  feeCalculatorMinFee: 25,
  feeCalculatorMaxLimit: 70,
  feeCalculatorMaxLimitMessage: 'অনুরোধকৃত সার্ভিসের ডেলিভারি ফি ৳৭০-এর উপরে নির্ধারিত হয়েছে। সঠিক ফি নিশ্চিত করতে জামানতের হটলাইনে বা কাস্টমার কেয়ারে যোগাযোগ করার অনুরোধ করা হচ্ছে।',
  feeCalculatorCompanyDetails: `জামানত (Jamanot)-এর প্রতিটি সার্ভিস চার্জ সম্পূর্ণ স্বচ্ছ এবং সাশ্রয়ী। নিচে আমাদের ফি নির্ধারণের বিস্তারিত দেওয়া হলো:

1. **দূরত্ব ফি (Distance Rate):** প্রতি কিমি (km) দূরত্বের জন্য মাত্র ৳১০ চার্জ প্রযোজ্য।
2. **ওজন ফি (Product Weight Rate):** ১ কেজির বেশি অতিরিক্ত পণ্যের জন্য প্রতি কেজিতে ৳৫ ফি যোগ করা হয়।
3. **পণ্য রিটার্ন সেবা (Return Service):** ডেলিভারি ফি-এর নির্ধারিত % সার্ভিস চার্জ হিসেবে যোগ হয়।
4. **প্রসেসিং ফি (Processing Fee):** পণ্যের খরচের উপর ভিত্তি করে প্রসেসিং সার্ভিস চার্জ যোগ হয়।

আপনার যেকোনো মতামত বা সার্ভিস ফি সংক্রান্ত পরামর্শ নিচে লিখে আমাদের জানাতে পারেন।`,
  allowedAdminTabs: [],
};

/**
 * Calculates estimated delivery fee based on distance, product weight, return option, product price, base price, and discount.
 */
export function calculateEstimatedFee(
  params: {
    distanceKm: number;
    weightKg: number;
    isReturnRequested: boolean;
    productPrice?: number;
    discountAmount?: number;
  },
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
) {
  const basePrice = 0;
  const perKmRate = settings.feeCalculatorPerKmRate ?? 10;
  const perKgRate = settings.feeCalculatorPerKgRate ?? 5;
  const returnPercent = settings.feeCalculatorReturnPercent ?? 20;
  const minFee = settings.feeCalculatorMinFee ?? 25;

  const distanceKm = Math.max(0, Number(params.distanceKm) || 0);
  const weightKg = Math.max(0, Number(params.weightKg) || 0);
  const productPrice = Math.max(0, Number(params.productPrice) || 0);

  const distanceFee = Math.round(distanceKm * perKmRate);
  const weightFee = Math.round(weightKg * perKgRate);

  let deliverySubtotal = distanceFee + weightFee;
  if (deliverySubtotal < minFee) {
    deliverySubtotal = minFee;
  }
  const returnFee = params.isReturnRequested ? Math.round((deliverySubtotal * returnPercent) / 100) : 0;

  let processingFee = 0;
  const procConfig = settings.feeCalculatorProcessingFee;
  if (procConfig && procConfig > 0 && productPrice > 0) {
    if (settings.feeCalculatorProcessingFeeType === 'percent') {
      processingFee = Math.round((productPrice * procConfig) / 100);
    } else {
      processingFee = procConfig;
    }
  }

  const discount = Math.max(0, Number(params.discountAmount) || 0);

  const rawTotal = deliverySubtotal + returnFee + processingFee - discount;
  const totalFee = Math.max(0, Math.round(rawTotal));

  return {
    basePrice,
    distanceFee,
    weightFee,
    deliverySubtotal,
    returnFee,
    returnPercent,
    processingFee,
    productPrice,
    discount,
    totalFee,
    perKmRate,
    perKgRate,
    minFee,
  };
}


/**
 * Calculates distance in kilometers between two lat/lng points using Haversine formula.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Returns minimum distance in km from helper location to order pickup or delivery locations.
 * Returns null if helper or order has no valid coordinates.
 */
export function getOrderMinDistanceKm(
  helperLoc?: { lat?: number; lng?: number },
  orderLocs?: { pickupLocation?: { lat?: number; lng?: number }; deliveryLocation?: { lat?: number; lng?: number } }
): number | null {
  if (!helperLoc?.lat || !helperLoc?.lng) return null;

  const dists: number[] = [];
  if (orderLocs?.pickupLocation?.lat && orderLocs?.pickupLocation?.lng) {
    dists.push(
      calculateDistanceKm(
        helperLoc.lat,
        helperLoc.lng,
        orderLocs.pickupLocation.lat,
        orderLocs.pickupLocation.lng
      )
    );
  }
  if (orderLocs?.deliveryLocation?.lat && orderLocs?.deliveryLocation?.lng) {
    dists.push(
      calculateDistanceKm(
        helperLoc.lat,
        helperLoc.lng,
        orderLocs.deliveryLocation.lat,
        orderLocs.deliveryLocation.lng
      )
    );
  }

  if (dists.length === 0) return null;
  return Math.min(...dists);
}

/**
 * Checks if a helper is within the configured order radius size (e.g. 3.5 km).
 * If helper or order has no lat/lng coordinates, returns true (so missing GPS doesn't block visibility).
 */
export function isHelperWithinOrderRadius(
  helperLoc?: { lat?: number; lng?: number },
  orderLocs?: { pickupLocation?: { lat?: number; lng?: number }; deliveryLocation?: { lat?: number; lng?: number } },
  radiusKm: number = 3.5
): boolean {
  if (!helperLoc?.lat || !helperLoc?.lng) return true;
  const minDist = getOrderMinDistanceKm(helperLoc, orderLocs);
  if (minDist === null) return true;
  return minDist <= radiusKm;
}

/**
 * Checks if the platform is currently open for orders based on the admin settings and current local time.
 */
export function isOrderTimingOpen(settings?: PricingSettings): { isOpen: boolean; message: string } {
  if (!settings) return { isOpen: true, message: '' };

  const type = settings.orderTimingType || 'always_on';
  const customMessage = settings.orderTimingMessage || 'অনুরোধ গ্রহণ সাময়িকভাবে বন্ধ আছে।';

  if (type === 'always_on') {
    return { isOpen: true, message: '' };
  }
  if (type === 'always_off') {
    return { isOpen: false, message: customMessage };
  }

  if (type === 'custom_range') {
    const startStr = settings.orderTimingStart || '08:00';
    const endStr = settings.orderTimingEnd || '22:00';

    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);

    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();

    const currentTimeMinutes = currentH * 60 + currentM;
    const startTimeMinutes = startH * 60 + startM;
    const endTimeMinutes = endH * 60 + endM;

    let isOpen = false;
    if (startTimeMinutes <= endTimeMinutes) {
      isOpen = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
    } else {
      // Overnight range, e.g. 22:00 - 06:00 (10 PM to 6 AM)
      isOpen = currentTimeMinutes >= startTimeMinutes || currentTimeMinutes <= endTimeMinutes;
    }

    return {
      isOpen,
      message: isOpen ? '' : customMessage,
    };
  }

  return { isOpen: true, message: '' };
}

export function calculateDeliveryFee(estimatedValue: number, settings: PricingSettings = DEFAULT_PRICING_SETTINGS): number {
  if (!estimatedValue || estimatedValue <= 0) {
    return settings.rules[0]?.fee || 20;
  }

  const sortedRules = [...settings.rules].sort((a, b) => a.maxOrderValue - b.maxOrderValue);
  for (const rule of sortedRules) {
    if (estimatedValue < rule.maxOrderValue) {
      return rule.fee;
    }
  }

  // Fallback for higher order values
  const maxDefinedRule = sortedRules[sortedRules.length - 1];
  return maxDefinedRule ? maxDefinedRule.fee + 10 : 50;
}

export function calculateHelperCommission(deliveryFee: number, settings: PricingSettings = DEFAULT_PRICING_SETTINGS): number {
  const percent = settings.helperCommissionPercent || 80;
  return Math.round((deliveryFee * percent) / 100);
}
