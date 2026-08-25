'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fallbackStore } from '@/lib/firebase';
import { calculateEstimatedFee } from '@/lib/pricing';
import { DistanceCalculatorMapModal } from './DistanceCalculatorMapModal';
import {
  Calculator,
  MapPin,
  Scale,
  RotateCcw,
  Tag,
  Info,
  Send,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  MessageSquare,
  ShoppingBag,
  AlertTriangle,
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
  const [distanceKm, setDistanceKm] = useState<string>('2.0');
  const [weightKg, setWeightKg] = useState<string>('0');
  const [productPrice, setProductPrice] = useState<string>('');
  const [isReturnRequested, setIsReturnRequested] = useState<boolean>(false);
  const [discountCode, setDiscountCode] = useState<string>('');
  const [appliedDiscountAmount, setAppliedDiscountAmount] = useState<number>(0);
  const [discountMessage, setDiscountMessage] = useState<string>('');

  // Map focus & Modal
  const [isDistanceFocused, setIsDistanceFocused] = useState<boolean>(false);
  const [showMapModal, setShowMapModal] = useState<boolean>(false);

  // Minimalist Suggestion Form input (only textbox message)
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

  // Handle promo code apply
  const handleApplyDiscount = () => {
    const code = discountCode.trim().toUpperCase();
    if (!code) {
      setAppliedDiscountAmount(0);
      setDiscountMessage('');
      return;
    }
    if (code === 'JAMANOT10' || code === 'FIRST10') {
      setAppliedDiscountAmount(10);
      setDiscountMessage('৳১০ ডিসকাউন্ট এপ্লাই করা হয়েছে! 🎉');
    } else if (code === 'FREE20') {
      setAppliedDiscountAmount(20);
      setDiscountMessage('৳২০ ডিসকাউন্ট এপ্লাই করা হয়েছে! 🎉');
    } else {
      setAppliedDiscountAmount(0);
      setDiscountMessage('অকার্যকর ডিসকাউন্ট কোড।');
    }
  };

  // Perform Fee Calculation
  const calculation = calculateEstimatedFee(
    {
      distanceKm: parseFloat(distanceKm) || 0,
      weightKg: parseFloat(weightKg) || 0,
      isReturnRequested,
      productPrice: parseFloat(productPrice) || 0,
      discountAmount: appliedDiscountAmount,
    },
    pricingSettings
  );

  // Handle Minimalist Suggestion Submission
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
      {/* Sleek Header */}
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

      {/* ── MINIMALIST FEE CALCULATOR ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Distance Input */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
              <span className="flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <span>দূরত্ব (KM)</span>
              </span>
              <span className="text-[10px] text-gray-400 font-normal">৳{calculation.perKmRate}/km</span>
            </label>
            <div className="flex items-center space-x-1.5">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={distanceKm}
                  onFocus={() => setIsDistanceFocused(true)}
                  onBlur={() => setTimeout(() => setIsDistanceFocused(false), 200)}
                  onChange={(e) => setDistanceKm(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
                  placeholder="0.0"
                />
                <span className="absolute right-2.5 top-2 text-[11px] font-semibold text-gray-400">km</span>
              </div>
              {isDistanceFocused && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowMapModal(true)}
                  className="px-2.5 py-2 bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200 transition-all shrink-0 animate-fade-in"
                >
                  ম্যাপ
                </button>
              )}
            </div>
          </div>

          {/* Product Weight Input */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
              <span className="flex items-center space-x-1">
                <Scale className="w-3.5 h-3.5 text-emerald-600" />
                <span>পণ্যের ওজন (KG)</span>
              </span>
              <span className="text-[10px] text-gray-400 font-normal">৳{calculation.perKgRate}/kg</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                min="0"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
                placeholder="0"
              />
              <span className="absolute right-2.5 top-2 text-[11px] font-semibold text-gray-400">kg</span>
            </div>
          </div>
        </div>

        {/* Product Price & Processing Fee Input (Avoided/Hidden if empty or processing fee not set) */}
        {typeof pricingSettings.feeCalculatorProcessingFee === 'number' && pricingSettings.feeCalculatorProcessingFee > 0 && (
          <div className="space-y-1.5 p-3 rounded-xl bg-purple-50/50 border border-purple-100">
            <label className="text-xs font-bold text-purple-900 flex items-center justify-between">
              <span className="flex items-center space-x-1">
                <ShoppingBag className="w-3.5 h-3.5 text-purple-600" />
                <span>মোট পণ্যের দাম (৳)</span>
              </span>
              <span className="text-[10px] text-purple-700 font-medium">
                প্রসেসিং ফি: {pricingSettings.feeCalculatorProcessingFeeType === 'percent' ? `${pricingSettings.feeCalculatorProcessingFee}%` : `৳${pricingSettings.feeCalculatorProcessingFee}`}
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-white border border-purple-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-purple-500 transition-all"
                placeholder="0 (ঐচ্ছিক)"
              />
              <span className="absolute right-2.5 top-2 text-[11px] font-semibold text-gray-400">৳</span>
            </div>
            {calculation.processingFee > 0 && (
              <div className="flex items-center justify-between text-[11px] font-bold text-purple-800 pt-0.5 px-1">
                <span>যোগকৃত প্রসেসিং ফি:</span>
                <span>+৳{calculation.processingFee}</span>
              </div>
            )}
          </div>
        )}

        {/* Return Product Option (Avoided/Hidden if return fee/percent is configured empty or 0 by admin) */}
        {((pricingSettings.feeCalculatorReturnPercent ?? 20) > 0 || (pricingSettings.feeCalculatorReturnFee ?? 15) > 0) && (
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <RotateCcw className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold text-gray-800">
                পণ্য আবার ফেরত/রিটার্ন চার্জ (+{pricingSettings.feeCalculatorReturnPercent ?? 20}%)
              </span>
            </div>
            <input
              type="checkbox"
              checked={isReturnRequested}
              onChange={(e) => setIsReturnRequested(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
            />
          </div>
        )}

        {/* Promo / Discount Code */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 uppercase focus:outline-none focus:border-emerald-500"
              placeholder="প্রমো কোড (e.g. JAMANOT10)"
            />
            <Tag className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2" />
          </div>
          <button
            type="button"
            onClick={handleApplyDiscount}
            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all shrink-0"
          >
            এপ্লাই
          </button>
        </div>
        {discountMessage && (
          <p className={`text-[11px] font-bold ${appliedDiscountAmount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {discountMessage}
          </p>
        )}

        {/* Minimalist Price Summary Box (Only calculation lines and total amount) */}
        <div className="p-4 rounded-2xl bg-emerald-950 text-white space-y-3 shadow-md">
          <div className="space-y-1.5 text-xs text-emerald-100 border-b border-emerald-900/80 pb-2.5">
            <div className="flex items-center justify-between">
              <span>ডেলিভারি ফি (বেস + দূরত্ব + ওজন):</span>
              <span className="font-bold">৳{calculation.deliverySubtotal}</span>
            </div>
            {calculation.returnFee > 0 && (
              <div className="flex items-center justify-between text-emerald-300">
                <span>রিটার্ন চার্জ (+{calculation.returnPercent}%):</span>
                <span className="font-bold">+৳{calculation.returnFee}</span>
              </div>
            )}
            {calculation.processingFee > 0 && (
              <div className="flex items-center justify-between text-purple-200">
                <span>প্রসেসিং ফি:</span>
                <span className="font-bold">+৳{calculation.processingFee}</span>
              </div>
            )}
            {calculation.discount > 0 && (
              <div className="flex items-center justify-between text-amber-300">
                <span>ডিসকাউন্ট:</span>
                <span className="font-bold">-৳{calculation.discount}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-0.5">
            <div>
              <span className="text-[11px] text-emerald-300 font-medium block">সর্বমোট চার্জ:</span>
              <span className="text-[10px] text-emerald-400 font-mono">(সর্বনিম্ন ৳{calculation.minFee})</span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-400">৳{calculation.totalFee}</span>
            </div>
          </div>

          {/* Admin Price Limitation Alert Message */}
          {calculation.totalFee > (pricingSettings.feeCalculatorMaxLimit ?? 70) && (
            <div className="mt-2 p-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-semibold leading-relaxed flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                {pricingSettings.feeCalculatorMaxLimitMessage ||
                  `মোট ডেলিভারি ফি ৳${pricingSettings.feeCalculatorMaxLimit ?? 70}-এর বেশি। বিস্তারিত ও নিশ্চিতকরণের জন্য আমাদের সাথে যোগাযোগ করুন।`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── MINIMALIST POLICY INFO ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-2">
        <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs">
          <Info className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>ফি সংক্রান্ত বিস্তারিত</span>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed font-medium whitespace-pre-line bg-gray-50/80 p-3 rounded-xl border border-gray-100">
          {pricingSettings.feeCalculatorCompanyDetails ||
            'কোম্পানির পক্ষ থেকে সব সময় দূরত্ব ও কাজের পরিমাণের ভিত্তিতে যৌক্তিক ডেলিভারি ফি নির্ধারিত হয়।'}
        </p>
      </div>

      {/* ── MINIMALIST SUGGESTION FORM (TEXTBOX & SUBMIT BUTTON ONLY) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-3">
        <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs">
          <MessageSquare className="w-4 h-4 text-purple-600 shrink-0" />
          <span>সার্ভিস ফি সংক্রান্ত আপনার মতামত বা সাজেশন</span>
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
            placeholder="ফি কমানো/ বাড়ানো বা অন্য যেকোনো মতামত এখানে লিখুন..."
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs shadow-sm transition-all disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'জমা হচ্ছে...' : 'মতামত জমা দিন (Submit)'}</span>
          </button>
        </form>
      </div>

      {/* Map Location Distance Picker Modal */}
      {showMapModal && (
        <DistanceCalculatorMapModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          onSelectDistance={(km) => {
            setDistanceKm(km.toString());
            setShowMapModal(false);
          }}
        />
      )}
    </div>
  );
};
