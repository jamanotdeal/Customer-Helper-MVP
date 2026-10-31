import { PricingSettings, Shop, Order, ShopOrder, ProductCategoryConfig } from '@/types';

export const DEFAULT_INPUT_PLACEHOLDERS: string[] = [
  'বাজার-সদাই করে দিতে হবে (গ্যাস, চাল-ডাল, মাছ-মাংস, শাকসবজি)?',
  'লন্ড্রিতে কাপড় দিয়ে আসতে হবে বা নিয়ে আসতে হবে?',
  'খাবার আনতে হবে?',
  'পার্সেল রিসিভ করতে হবে বা ডেলিভারি দিতে হবে?',
  'মেডিসিন আনতে হবে?',
  'অন্য কোনো কিছু?',
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
  'লন্ড্রির কাপড় দিয়ে আসুন': '(কোথা থেকে কাপড় নিতে হবে এবং কোন লন্ড্রিতে দিতে হবে বিস্তারিত লিখুন)',
  'লন্ড্রির দোকান থেকে কাপড় এনে দিন': '(কোন লন্ড্রি থেকে কাপড় আনতে হবে ও মানি রিসিট নম্বর লিখুন)',
  'খাবার এনে দিন': '(কোন রেস্তোরাঁ থেকে, কোন খাবার, কত পিস বা পরিমাণ — বিস্তারিত লিখুন)',
  'আমার পার্সেল রিসিভ করে দিন': '(কোথায় পার্সেল আছে, কোন নাম বা অর্ডার নম্বরে, ডেলিভারি কোথায় দিতে হবে)',
  'ওষুধ এনে দিন': '(ওষুধের নাম, পরিমাণ, ফার্মেসির নাম বা এলাকা উল্লেখ করুন)',
  'আমার একটা জিনিস দিয়ে আসুন': '(জিনিসটি কী, কোথা থেকে নিয়ে কোথায় দিতে হবে বিস্তারিত বলুন)',
  'মিক্স কিছু কাজ করে দিন': '(সব কাজের বিস্তারিত একটি একটি করে লিখুন)',
  'না, অন্য একটা কাজ করে দিন': '(আপনার কাজটি যতটা সম্ভব বিস্তারিতভাবে বলুন)',
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
  'বাজার-সদাই করে দিন',
  'লন্ড্রির কাপড় দিয়ে আসুন',
  'লন্ড্রির দোকান থেকে কাপড় এনে দিন',
  'খাবার এনে দিন',
  'আমার পার্সেল রিসিভ করে দিন',
  'ওষুধ এনে দিন',
  'আমার একটা জিনিস দিয়ে আসুন',
  'মিক্স কিছু কাজ করে দিন',
  'না, অন্য একটা কাজ করে দিন',
];

export const DEFAULT_STORE_TYPES: string[] = [
  'মুদিখানা ও সুপারশপ',
  'ফার্মেসি ও ওষুধ',
  'রেস্টুরেন্ট ও ফাস্টফুড',
  'মাংস ও মাছ বাজার',
  'ফল ও সবজির দোকান',
  'ইলেকট্রনিক্স ও গ্যাজেট',
  'স্টেশনারি ও বই',
  'পোশাক ও ফ্যাশন',
  'লন্ড্রি ও ড্রাই ক্লিনিং',
  'অন্যান্য',
];

export const DEFAULT_PRODUCT_CATEGORIES: ProductCategoryConfig[] = [
  { id: 'cat-1', name: 'চাল ও ডাল', storeTypes: ['মুদিখানা ও সুপারশপ'] },
  { id: 'cat-2', name: 'তেল ও মশলা', storeTypes: ['মুদিখানা ও সুপারশপ'] },
  { id: 'cat-3', name: 'শাকসবজি ও ফলমূল', storeTypes: ['মুদিখানা ও সুপারশপ', 'ফল ও সবজির দোকান'] },
  { id: 'cat-4', name: 'মাছ ও মাংস', storeTypes: ['মুদিখানা ও সুপারশপ', 'মাংস ও মাছ বাজার'] },
  { id: 'cat-5', name: 'দুধ ও ডিম', storeTypes: ['মুদিখানা ও সুপারশপ'] },
  { id: 'cat-6', name: 'স্ন্যাক্স ও বেকারি', storeTypes: ['মুদিখানা ও সুপারশপ', 'রেস্টুরেন্ট ও ফাস্টফুড'] },
  { id: 'cat-7', name: 'পানীয় ও জুস', storeTypes: ['মুদিখানা ও সুপারশপ', 'রেস্টুরেন্ট ও ফাস্টফুড'] },
  { id: 'cat-8', name: 'ওষুধ ও ফার্স্ট এইড', storeTypes: ['ফার্মেসি ও ওষুধ'] },
  { id: 'cat-9', name: 'ব্যক্তিগত যত্ন (Personal Care)', storeTypes: ['মুদিখানা ও সুপারশপ', 'ফার্মেসি ও ওষুধ'] },
  { id: 'cat-10', name: 'পরিষ্কার ও গৃহস্থালি', storeTypes: ['মুদিখানা ও সুপারশপ'] },
  { id: 'cat-11', name: 'শিশু যত্ন (Baby Care)', storeTypes: ['মুদিখানা ও সুপারশপ', 'ফার্মেসি ও ওষুধ'] },
  { id: 'cat-12', name: 'খাবার ও ফাস্টফুড', storeTypes: ['রেস্টুরেন্ট ও ফাস্টফুড'] },
  { id: 'cat-13', name: 'চা ও কফি', storeTypes: ['মুদিখানা ও সুপারশপ', 'রেস্টুরেন্ট ও ফাস্টফুড'] },
  { id: 'cat-14', name: 'স্টেশনারি ও খাতা-কলম', storeTypes: ['স্টেশনারি ও বই'] },
  { id: 'cat-15', name: 'অন্যান্য', storeTypes: ['ALL'] },
];

export function getProductCategories(settings?: PricingSettings): ProductCategoryConfig[] {
  if (settings?.productCategories && settings.productCategories.length > 0) {
    return settings.productCategories;
  }
  return DEFAULT_PRODUCT_CATEGORIES;
}

export function getCategoriesForStoreType(storeType?: string, settings?: PricingSettings): string[] {
  const all = getProductCategories(settings);
  if (!storeType) return all.map(c => c.name);

  const normType = storeType.trim().toLowerCase();
  const matched = all.filter(c => {
    if (c.storeTypes.includes('ALL') || c.storeTypes.includes('all') || c.storeTypes.includes('সকল দোকান') || c.storeTypes.includes('সকল ধরনের দোকান')) return true;
    return c.storeTypes.some(t => {
      const normT = t.trim().toLowerCase();
      return normT === normType || normT.includes(normType) || normType.includes(normT);
    });
  });

  const names = matched.map(c => c.name);
  if (!names.includes('অন্যান্য')) names.push('অন্যান্য');
  return names;
}

/**
 * Splits and sanitizes store types if provided as a single string,
 * delimited by newlines, or separated by '&'.
 */
export const parseStoreTypes = (rawTypes?: string[] | string | null): string[] => {
  if (!rawTypes) return DEFAULT_STORE_TYPES;
  const items = Array.isArray(rawTypes) ? rawTypes : [rawTypes];
  const parsed: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'string') continue;
    const lines = item.split(/\r?\n/);
    for (const line of lines) {
      if (line.includes('&')) {
        const parts = line.split('&').map((p) => p.trim()).filter(Boolean);
        parsed.push(...parts);
      } else {
        const trimmed = line.trim();
        if (trimmed) {
          parsed.push(trimmed);
        }
      }
    }
  }

  return parsed.length > 0 ? parsed : DEFAULT_STORE_TYPES;
};

/**
 * Returns connected store types for a given service category.
 * Supports custom admin mapping or smart keyword fallback.
 */
export function getStoreTypesForService(
  serviceName: string,
  customMapping?: Record<string, string[]>
): string[] {
  if (!serviceName) return DEFAULT_STORE_TYPES;

  // 1. Check custom admin mapping if provided
  if (customMapping && customMapping[serviceName] && customMapping[serviceName].length > 0) {
    return customMapping[serviceName];
  }

  const s = serviceName.toLowerCase().trim();

  // All / general options
  if (s === 'all' || s.includes('সকল') || s.includes('সব দোকান') || s.includes('mix') || s.includes('onno') || s.includes('অন্যান্য')) {
    return DEFAULT_STORE_TYPES;
  }

  // Bazar / Grocery
  if (s.includes('bazar') || s.includes('বাজার') || s.includes('সদাই') || s.includes('sodai') || s.includes('grocery')) {
    return [
      'মুদিখানা ও সুপারশপ',
      'ফল ও সবজির দোকান',
      'মাংস ও মাছ বাজার',
      'মুদিখানা',
      'সুপারশপ',
      'Grocery',
      'Supermarket',
      'Bazar',
      'Market',
    ];
  }

  // Food / Restaurant
  if (s.includes('khabar') || s.includes('খাবার') || s.includes('food') || s.includes('restaurant') || s.includes('রেস্টুরেন্ট')) {
    return [
      'রেস্টুরেন্ট ও ফাস্টফুড',
      'রেস্টুরেন্ট',
      'Restaurant',
      'Fast Food',
      'Food',
      'Cafe',
    ];
  }

  // Medicine / Pharmacy
  if (s.includes('medicine') || s.includes('ওষুধ') || s.includes('ঔষধ') || s.includes('pharmacy') || s.includes('ফার্মেসি')) {
    return [
      'ফার্মেসি ও ওষুধ',
      'ফার্মেসি',
      'ওষুধ',
      'Pharmacy',
      'Medicine',
    ];
  }

  // Shoes / Shoe repair / Laundry / Tailor
  if (s.includes('zuta') || s.includes('জুতা') || s.includes('laundry') || s.includes('লন্ড্রি') || s.includes('সেলাই')) {
    return [
      'লন্ড্রি ও ড্রাই ক্লিনিং',
      'পোশাক ও ফ্যাশন',
      'Laundry',
      'অন্যান্য',
    ];
  }

  // Parcel / Document
  if (s.includes('parcel') || s.includes('পার্সেল') || s.includes('ডকুমেন্ট') || s.includes('চিঠি')) {
    return [
      'স্টেশনারি ও বই',
      'অন্যান্য',
    ];
  }

  // Default: return serviceName as connected store type keyword
  return [serviceName];
}

/**
 * Checks whether a given shop belongs to the connected store types of a service.
 */
export function isShopMatchingService(
  shop: Shop,
  serviceName: string,
  customMapping?: Record<string, string[]>
): boolean {
  if (!serviceName) return true;
  const s = serviceName.toLowerCase().trim();
  if (s === 'all' || s.includes('সকল') || s.includes('সব দোকান') || s.includes('mix')) {
    return true;
  }

  const connectedTypes = getStoreTypesForService(serviceName, customMapping);
  const shopType = (shop.type || '').trim().toLowerCase();
  const shopCategory = (shop.category || '').trim().toLowerCase();
  const shopName = (shop.name || '').trim().toLowerCase();
  const shopDesc = (shop.description || '').trim().toLowerCase();

  return connectedTypes.some((t) => {
    const target = t.trim().toLowerCase();
    if (!target) return false;
    return (
      shopType.includes(target) ||
      target.includes(shopType) ||
      (shopCategory && (shopCategory.includes(target) || target.includes(shopCategory))) ||
      shopName.includes(target) ||
      shopDesc.includes(target)
    );
  });
}


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
  showBecomeHelper: false,
  inAppBrowserPromptEnabled: true,
  inAppBrowserPromptTitle: 'ব্রাউজারে ওপেন করুন',
  inAppBrowserPromptSubtitle: 'Open in Chrome or Safari',
  inAppBrowserPromptMessage: 'লগইন ও নির্ভুল সেবার জন্য ওয়েবসাইটটি Chrome বা Safari ব্রাউজারে ওপেন করুন।',
  locationPermissionModalTitle: 'লোকেশন পারমিশন আবশ্যক (Location Required)',
  locationPermissionModalBody: 'কম্পিউটার হেলপার (Commuter Helper) মোড চালু করতে এবং আপনার আশেপাশের অর্ডারের নোটিফিকেশন পেতে ডিভাইসের জিপিএস লোকেশন পারমিশন দেওয়া আবশ্যক। অনুগ্রহ করে ব্রাউজার সেটিংসে Location Allow করুন।',
  notificationPermissionModalTitle: 'নোটিফিকেশন পারমিশন আবশ্যক (Notification Required)',
  notificationPermissionModalBody: 'জরুরি আপডেট ও অর্ডারের নোটিফিকেশন পাওয়ার জন্য ব্রাউজার বা ডিভাইসে নোটিফিকেশন পারমিশন দেওয়া আবশ্যক।',
  displayOverPermissionModalTitle: 'ডিসপ্লে ওভার পারমিশন আবশ্যক (Display Over Other Apps)',
  displayOverPermissionModalBody: 'নতুন অর্ডার আসলে সাথে সাথে স্ক্রিনের উপর রিয়েল-টাইম পপআপ ও অ্যালার্ম নোটিফিকেশন পেতে ডিসপ্লে ওভার পারমিশন দেওয়া আবশ্যক।',
  bkashInstructions: 'bKash Personal: Send Money to 018XXXXXXXX and provide transaction ID.',
  nagadInstructions: 'Nagad Personal: Send Money to 018XXXXXXXX and provide transaction ID.',
  rocketInstructions: 'Rocket Personal: Send Money to 018XXXXXXXX and provide transaction ID.',
  bankInstructions: 'Bank Account: Transfer due commission to Bank Name, Account: XXXX-XXXX-XXXX, Branch: XXX, and write Reference.',
  cashInstructions: 'Cash Payment: Pay directly at the Jamanot office desk and get a receipt.',
  storeTypes: DEFAULT_STORE_TYPES,
  // Map picker guide overlay & placeholders
  mapPickerGuideText: 'যে location select করতে চান, সেখান পিন (icon) টি নিয়ে বসান, বা ওই place-এ click করুন। তারপর specific ভাবে building, market-এর নাম add করুন map-এর নিচের যে input box টি আছে সেখানে।',
  mapPickerPickupGuideText: 'যে দোকান বা স্থান থেকে আনতে বা কাজ করতে হবে, সেই স্থানে ম্যাপের পিন সরিয়ে নিয়ে যান অথবা ক্লিক করুন। দোকানের নাম বা বিস্তারিত ঠিকানা নিচের input box-এ লিখুন।',
  mapPickerDeliveryGuideText: 'আপনার বাসা বা ডেলিভারি পাওয়ার স্থানে পিন সরিয়ে নিন। ডেলিভারি ঠিকানা নির্ভুল হলে হেল্পার ঠিক সময়ে পৌঁছাতে পারবেন। নিচের box-এ বাসার নাম বা ফ্ল্যাট নম্বর যোগ করুন।',
  mapPickerGuideOkText: 'ঠিক আছে',
  mapPickerGuideShowCount: 5,
  mapPickerPlaceholder: 'আপনার নির্দিষ্ট ঠিকানার বিবরণ ম্যানুয়ালি লিখুন...',
  mapPickerPickupPlaceholder: 'যেমন: আরিফ স্টোর, আশুলিয়া বাজার.',
  mapPickerDeliveryPlaceholder: 'যেমন: ৪এ, রহমান ভিলা, মডেল টাউন.',
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
  manualAuthEnabled: false,
  // Gamification & Rewards Defaults
  defaultOrderCoins: 10,
  serviceCoins: {
    'Bazar-sodai korte hobe': 15,
    'Khabar ante hobe': 10,
    'Medicine ante hobe': 12,
    'zuta selai korte hobe': 10,
    'amar parcel recive kore dite hobe': 10,
    'mix': 20,
    'onno kicu': 10,
    'বাজার-সদাই করে দিন': 15,
    'খাবার এনে দিন': 10,
    'ওষুধ এনে দিন': 12,
    'জুতা সেলাই করে দিন': 10,
    'পার্সেল রিসিভ করে দিন': 10,
    'মিক্স / একাধিক কাজ': 20,
    'অন্য কিছু': 10,
  },
  freeDeliveryRequiredCoins: 50,
  freeDeliveryDiscountPercent: 100,
  insufficientCoinsMessage: 'আপনার অ্যাকাউন্টে পর্যাপ্ত কয়েন নেই! ফ্রি ডেলিভারি পেতে আরও অর্ডার সম্পন্ন করে কয়েন অর্জন করুন।',
  rewardStoreTips: `💡 জামানত কয়েন টিপস:
• প্রতিটি ডেলিভারি সফলভাবে সম্পন্ন হলে আপনি কয়েন পাবেন।
• নির্দিষ্ট সার্ভিসে (যেমন: বাজার-সদাই বা মিক্স কাজ) বেশি কয়েন পাওয়ার সুযোগ রয়েছে।
• অর্জিত কয়েন দিয়ে ১০০% ফ্রি ডেলিভারি চার্জ অথবা আকর্ষণীয় উপহার ও ডিসকাউন্ট ভাউচার ক্লেইম করতে পারবেন।`,
  referralRewardCoins: 20,
  referredUserRewardCoins: 10,
  referredUserRewardOrderLimit: 1,
  referralMessageTemplate: 'আসসালামু আলাইকুম! জামানত (Jamanot) দিয়ে সহজে বাজার-সদাই ও প্রয়োজনীয় ডেলিভারি নিন। এখনই এই লিঙ্কে গিয়ে অর্ডার করুন: {link}',
  // Blocked User Custom Modal Defaults
  blockedUserModalTitle: 'অ্যাকাউন্ট সাময়িকভাবে স্থগিত (Account Suspended)',
  blockedUserModalSubtitle: 'আপনার অ্যাকাউন্টটি সাময়িকভাবে সীমাবদ্ধ করা হয়েছে',
  blockedUserModalMessage: 'নিরাপত্তা বা নীতিমালা ভঙ্গের কারণে আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত করা হয়েছে। এই মুহূর্তে নতুন সার্ভিস রিকোয়েস্ট তৈরি বা নতুন অর্ডার গ্রহণ করা যাবে না। বিস্তারিত তথ্য বা সহায়তার জন্য অনুগ্রহ করে অ্যাডমিন বা সাপোর্টে যোগাযোগ করুন।',
  blockedUserModalButtonText: 'সাপোর্টে যোগাযোগ করুন (Contact Support)',
  blockedUserModalContactUrl: 'https://wa.me/8801800000000',
  customStorePricingEnabled: false,
  customStorePricingAmount: 15,
};

/**
 * Calculates coins to award for an order based on service type and pricing settings
 */
export function getCoinsForService(service?: string, settings: PricingSettings = DEFAULT_PRICING_SETTINGS): number {
  const defaultCoins = settings.defaultOrderCoins ?? 10;
  if (!service) return defaultCoins;
  const svcCoins = settings.serviceCoins || {};
  if (svcCoins[service] !== undefined && typeof svcCoins[service] === 'number') {
    return svcCoins[service];
  }
  // Try case-insensitive / trimmed match
  const lower = service.toLowerCase().trim();
  const matchKey = Object.keys(svcCoins).find(k => k.toLowerCase().trim() === lower);
  if (matchKey && svcCoins[matchKey] !== undefined) {
    return svcCoins[matchKey];
  }
  return defaultCoins;
}


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
    customStoreItemCount?: number;
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
  if (procConfig && procConfig > 0) {
    if (settings.feeCalculatorProcessingFeeType === 'percent') {
      if (productPrice > 0) {
        processingFee = Math.round((productPrice * procConfig) / 100);
      }
    } else {
      processingFee = procConfig;
    }
  }

  // Custom Store fee calculation
  let customStoreFee = 0;
  const customStoreItemCount = Math.max(0, Number(params.customStoreItemCount) || 0);
  const customStoreUnitFee = Number(settings.customStorePricingAmount ?? 15) || 0;
  if (settings.customStorePricingEnabled && customStoreItemCount > 0) {
    customStoreFee = customStoreItemCount * customStoreUnitFee;
  }

  const discount = Math.max(0, Number(params.discountAmount) || 0);

  const rawTotal = deliverySubtotal + returnFee + processingFee + customStoreFee - discount;
  const totalFee = Math.max(0, Math.round(rawTotal));

  return {
    basePrice,
    distanceFee,
    weightFee,
    deliverySubtotal,
    returnFee,
    returnPercent,
    processingFee,
    customStoreFee,
    customStoreItemCount,
    customStoreUnitFee,
    productPrice,
    discount,
    totalFee,
    perKmRate,
    perKgRate,
    minFee,
  };
}

/**
 * Counts how many custom store items are in an order.
 * This includes:
 * - Items included in helper's custom cost (ShopOrder with shopId === 'myself')
 * - Items marked isCustom that have price or buyFrom or were purchased from outside stores
 */
export function getCustomStoreItemCount(order?: Order | null, shopOrders: ShopOrder[] = []): number {
  if (!order) return 0;

  // Only count actual "myself" shop orders created by the helper when they
  // purchased from a non-listed store. Deduplicate by sellerName + sellerPhone
  // so multiple items from the same shop count as 1 store charge.
  const myselfSOs = (shopOrders || []).filter(
    (so) =>
      so.parentOrderId === order.id &&
      so.shopId === 'myself' &&
      so.status !== 'CANCELED' &&
      (so.status as string) !== 'CANCELLED'
  );

  if (myselfSOs.length === 0) return 0;

  const uniqueStoreKeys = new Set<string>();
  for (const so of myselfSOs) {
    const name = (so.sellerName || so.shopName || '').trim().toLowerCase();
    const phone = (so.sellerPhone || '').trim().replace(/\s/g, '');
    // If both are empty, use the shop order ID so it still counts as 1 store
    const key = (name || phone) ? `${name}::${phone}` : so.id;
    uniqueStoreKeys.add(key);
  }

  return uniqueStoreKeys.size;
}


/**
 * Calculates custom store fee for an order based on admin settings.
 * If setting is enabled and there are custom cost items, returns count, unitFee, and totalFee.
 */
export function calculateCustomStoreFee(
  order?: Order | null,
  shopOrders: ShopOrder[] = [],
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
): { count: number; unitFee: number; totalFee: number } {
  if (!order || !settings?.customStorePricingEnabled) {
    return { count: 0, unitFee: 0, totalFee: 0 };
  }
  const unitFee = Number(settings.customStorePricingAmount ?? 15) || 0;
  // count = number of unique stores (not items)
  const count = getCustomStoreItemCount(order, shopOrders);
  const totalFee = count * unitFee;

  return { count, unitFee, totalFee };
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
  const percent = settings.helperCommissionPercent ?? 80;
  return Math.round((deliveryFee * percent) / 100);
}
