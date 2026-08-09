import { PricingSettings } from '@/types';

export const DEFAULT_INPUT_PLACEHOLDERS: string[] = [
  'চাল, ডাল, তেল, তরকারি বা ঘরের বাজার...',
  'লন্ড্রির কাপড় পাঠানো বা দোকান থেকে আনা...',
  'পছন্দের রেস্তোরাঁ থেকে গরম খাবার...',
  'যেকোনো জরুরি পার্সেল এক স্থান থেকে অন্য স্থানে...',
  'ফার্মেসি থেকে জরুরি প্রয়োজনীয় ওষুধ...',
  'অন্য যেকোনো কাজ যা আপনার প্রয়োজন...',
];

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
