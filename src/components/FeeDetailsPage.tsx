'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fallbackStore } from '@/lib/firebase';
import { calculateEstimatedFee } from '@/lib/pricing';
import {
  Calculator,
  MapPin,
  Scale,
  RotateCcw,
  Info,
  Send,
  CheckCircle2,
  ArrowLeft,
  MessageSquare,
  ShoppingBag,
  AlertTriangle,
  Store,
} from 'lucide-react';
import { useModal } from './CustomModal';

interface FeeDetailsPageProps {
  onBack?: () => void;
}

export const FeeDetailsPage: React.FC<FeeDetailsPageProps> = ({ onBack }) => {
  const { user, activeMode } = useAuth();
  const { showAlert } = useModal();

  const [pricingSettings, setPricingSettings] = useState(fallbackStore.pricingSettings);

  // Calculator inputs
  const [distanceKm, setDistanceKm] = useState<string>('2');
  const [weightKg, setWeightKg] = useState<string>('0');
  const [productPrice, setProductPrice] = useState<string>('');
  const [isReturnRequested, setIsReturnRequested] = useState<boolean>(false);
  const [customStoreCount, setCustomStoreCount] = useState<number>(0);

  // Minimalist Suggestion Form input
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);

  useEffect(() => {
    const syncPricing = () => {
      setPricingSettings({ ...fallbackStore.pricingSettings });
    };
    syncPricing();
    const unsub = fallbackStore.subscribe(syncPricing);
    return () => unsub();
  }, []);

  const ceilNum = (val: string) => Math.ceil(Math.max(0, parseFloat(val) || 0));
  const effectiveDistance = ceilNum(distanceKm);
  const effectiveWeight = ceilNum(weightKg);

  const calculation = calculateEstimatedFee(
    {
      distanceKm: effectiveDistance,
      weightKg: effectiveWeight,
      isReturnRequested,
      productPrice: parseFloat(productPrice) || 0,
      discountAmount: 0,
      customStoreItemCount: customStoreCount,
    },
    pricingSettings
  );

  const rawDeliveryFee = calculation.distanceFee + calculation.weightFee;
  const isMinFeeApplied = rawDeliveryFee < calculation.minFee;

  const handleSubmitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      showAlert('খালি মেসেজ', 'দয়া করে আপনার পরামর্শ বা মতামত লিখুন।', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await fallbackStore.addFeeSuggestion({
        id: `sug-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userId: user?.uid || 'guest',
        userName: user?.displayName || 'ব্যবহারকারী',
        userPhone: user?.alternativePhone || undefined,
        userRole: user?.isHelper && activeMode === 'helper' ? 'helper' : 'customer',
        category: 'Fee & General Feedback',
        message: message.trim(),
        createdAt: new Date().toISOString(),
      });

      setSubmitSuccess(true);
      setMessage('');
      showAlert('ধন্যবাদ!', 'আপনার মূল্যবান মতামত সফলভাবে পাঠানো হয়েছে।', 'success');
      setTimeout(() => setSubmitSuccess(false), 4000);
    } catch (err) {
      showAlert('ত্রুটি', 'মতামত পাঠাতে সমস্যা হয়েছে। আবার চেষ্টা করুন।', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full mx-auto space-y-4 pb-24 animate-fade-in-up px-1">
      {/* Header */}
      <div className="flex items-center justify-between bg-white border border-gray-100 p-4 rounded-2xl shadow-xs">
        <div className="flex items-center space-x-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all text-gray-700"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-gray-900 tracking-tight">
              ডেলিভারি ফি ক্যালকুলেটর
            </h1>
            <p className="text-[11px] text-gray-500 font-medium">
              সহজ ও স্বচ্ছ ডেলিভারি চার্জ হিসাব
            </p>
          </div>
        </div>
      </div>

      {/* ── FEE CALCULATOR ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-xs space-y-3.5">
        {/* Distance + Weight */}
        <div className="grid grid-cols-2 gap-3">
          {/* Distance */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
              <span className="flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <span>দূরত্ব</span>
              </span>
              <span className="text-[10px] text-gray-400 font-medium">৳{calculation.perKmRate}/km</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                value={distanceKm}
                onBlur={() => {
                  setDistanceKm(ceilNum(distanceKm).toString());
                }}
                onChange={(e) => setDistanceKm(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
                placeholder="0"
              />
              <span className="absolute right-2.5 top-2 text-[11px] font-semibold text-gray-400">km</span>
            </div>
          </div>

          {/* Weight */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
              <span className="flex items-center space-x-1">
                <Scale className="w-3.5 h-3.5 text-emerald-600" />
                <span>ওজন</span>
              </span>
              <span className="text-[10px] text-gray-400 font-medium">৳{calculation.perKgRate}/kg</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                value={weightKg}
                onBlur={(e) => {
                  setWeightKg(ceilNum(e.target.value).toString());
                }}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
                placeholder="0"
              />
              <span className="absolute right-2.5 top-2 text-[11px] font-semibold text-gray-400">kg</span>
            </div>
          </div>
        </div>

        {/* Product Price (only if processing fee is configured) */}
        {typeof pricingSettings.feeCalculatorProcessingFee === 'number' &&
          pricingSettings.feeCalculatorProcessingFee > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span className="flex items-center space-x-1">
                  <ShoppingBag className="w-3.5 h-3.5 text-purple-600" />
                  <span>পণ্যের দাম</span>
                </span>
                <span className="text-[10px] text-purple-600 font-medium">
                  প্রসেসিং:{' '}
                  {pricingSettings.feeCalculatorProcessingFeeType === 'percent'
                    ? `${pricingSettings.feeCalculatorProcessingFee}%`
                    : `৳${pricingSettings.feeCalculatorProcessingFee}`}
                </span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-purple-400 focus:bg-white transition-all"
                  placeholder="0 (ঐচ্ছিক)"
                />
                <span className="absolute right-2.5 top-2 text-[11px] font-semibold text-gray-400">৳</span>
              </div>
            </div>
          )}

        {/* Return / Two-Way */}
        {((pricingSettings.feeCalculatorReturnPercent ?? 20) > 0 ||
          (pricingSettings.feeCalculatorReturnFee ?? 15) > 0) && (
          <label className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 cursor-pointer hover:bg-emerald-50/50 transition-colors">
            <div className="flex items-center space-x-2.5">
              <RotateCcw className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="text-xs font-bold text-gray-800 block">
                  রিটার্ন / যাওয়া-আসা (+{pricingSettings.feeCalculatorReturnPercent ?? 20}%)
                </span>
                <span className="text-[10px] text-gray-500">
                  হেলপারকে ফেরত আসতে হলে এটি চালু করুন
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isReturnRequested}
              onChange={(e) => setIsReturnRequested(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
            />
          </label>
        )}

        {/* Custom Unlisted Store Stepper */}
        {pricingSettings.customStorePricingEnabled !== false && (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
            <div className="flex items-center space-x-2.5 min-w-0 pr-2">
              <Store className="w-4 h-4 text-indigo-600 shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-bold text-gray-800 block">
                  কাস্টম স্টোর (+৳{pricingSettings.customStorePricingAmount ?? 15}/দোকান)
                </span>
                <span className="text-[10px] text-gray-500 block truncate">
                  তালিকাভুক্ত নয় এমন দোকান থেকে কেনাকাটা
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setCustomStoreCount((prev) => Math.max(0, prev - 1))}
                disabled={customStoreCount === 0}
                className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-700 font-bold hover:bg-gray-100 disabled:opacity-40 flex items-center justify-center transition-all cursor-pointer"
                aria-label="কমান"
              >
                -
              </button>
              <span className="w-6 text-center text-xs font-extrabold text-gray-900">
                {customStoreCount}
              </span>
              <button
                type="button"
                onClick={() => setCustomStoreCount((prev) => prev + 1)}
                className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 flex items-center justify-center transition-all cursor-pointer"
                aria-label="বাড়ান"
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* ── MINIMALIST BREAKDOWN & TOTAL SUMMARY ── */}
        <div className="rounded-2xl bg-emerald-950 text-white p-4 space-y-2.5 shadow-sm">
          <div className="space-y-1.5 text-xs text-emerald-100/90 border-b border-emerald-800/70 pb-2.5">
            <div className="flex items-center justify-between">
              <span>
                দূরত্ব ({effectiveDistance} km × ৳{calculation.perKmRate})
              </span>
              <span className="font-semibold">৳{calculation.distanceFee}</span>
            </div>

            {effectiveWeight > 0 && (
              <div className="flex items-center justify-between">
                <span>
                  ওজন ({effectiveWeight} kg × ৳{calculation.perKgRate})
                </span>
                <span className="font-semibold">৳{calculation.weightFee}</span>
              </div>
            )}

            {isMinFeeApplied && (
              <div className="flex items-center justify-between text-emerald-300 text-[11px]">
                <span>সর্বনিম্ন ডেলিভারি চার্জ প্রযোজ্য</span>
                <span className="font-bold">৳{calculation.minFee}</span>
              </div>
            )}

            {calculation.returnFee > 0 && (
              <div className="flex items-center justify-between text-emerald-300">
                <span>রিটার্ন চার্জ (+{calculation.returnPercent}%)</span>
                <span className="font-semibold">+৳{calculation.returnFee}</span>
              </div>
            )}

            {calculation.processingFee > 0 && (
              <div className="flex items-center justify-between text-purple-200">
                <span>প্রসেসিং ফি</span>
                <span className="font-semibold">+৳{calculation.processingFee}</span>
              </div>
            )}

            {calculation.customStoreFee > 0 && (
              <div className="flex items-center justify-between text-indigo-200">
                <span>
                  কাস্টম স্টোর ({calculation.customStoreItemCount} × ৳{calculation.customStoreUnitFee})
                </span>
                <span className="font-semibold">+৳{calculation.customStoreFee}</span>
              </div>
            )}
          </div>

          {calculation.totalFee > (pricingSettings.feeCalculatorMaxLimit ?? 70) ? (
            <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-semibold leading-relaxed flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                {pricingSettings.feeCalculatorMaxLimitMessage ||
                  `মোট ডেলিভারি ফি ৳${pricingSettings.feeCalculatorMaxLimit ?? 70}-এর বেশি। বিস্তারিত ও নিশ্চিতকরণের জন্য আমাদের সাথে যোগাযোগ করুন।`}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-0.5">
              <div>
                <span className="text-xs font-bold text-emerald-200 block">সর্বমোট আনুমানিক ফি</span>
                <span className="text-[10px] text-emerald-400/80">সর্বনিম্ন ডেলিভারি চার্জ ৳{calculation.minFee}</span>
              </div>
              <span className="text-2xl font-black text-emerald-400">৳{calculation.totalFee}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── POLICY INFO ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-2">
        <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs">
          <Info className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>ফি সংক্রান্ত তথ্য</span>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed font-medium whitespace-pre-line bg-gray-50/80 p-3 rounded-xl border border-gray-100">
          {pricingSettings.feeCalculatorCompanyDetails ||
            'কোম্পানির পক্ষ থেকে সব সময় দূরত্ব ও কাজের পরিমাণের ভিত্তিতে যৌক্তিক ডেলিভারি ফি নির্ধারিত হয়।'}
        </p>
      </div>

      {/* ── SUGGESTION FORM ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-3">
        <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs">
          <MessageSquare className="w-4 h-4 text-purple-600 shrink-0" />
          <span>সার্ভিস ফি সংক্রান্ত আপনার মতামত</span>
        </div>

        {submitSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2 animate-scale-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>আপনার মতামত সফলভাবে জমা করা হয়েছে!</span>
          </div>
        )}

        <form onSubmit={handleSubmitSuggestion} className="space-y-3">
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:border-emerald-500 focus:bg-white text-gray-900 resize-none transition-all placeholder:text-gray-400"
            placeholder="ফি বা সেবা সংক্রান্ত কোনো পরামর্শ থাকলে এখানে লিখুন..."
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs shadow-sm transition-all disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'জমা হচ্ছে...' : 'মতামত জমা দিন'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
