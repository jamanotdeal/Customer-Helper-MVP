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
};

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
