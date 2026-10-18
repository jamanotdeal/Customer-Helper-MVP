'use client';

import React, { useMemo } from 'react';
import { Store, Calendar, ArrowRight, X, Clock, ShoppingCart, Sparkles, AlertCircle } from 'lucide-react';
import { Shop, PricingSettings } from '@/types';
import { getNextStoreOpeningTime } from '@/utils/scheduledOrders';

interface StoreOffWarningModalProps {
  isOpen: boolean;
  closedStoreNames: string[];
  shop?: Shop | null;
  pricingSettings?: PricingSettings;
  onSchedule: (targetDate: Date, noteText: string) => void;
  onOrderNowAnyStore: () => void;
  onCancel: () => void;
}

export const StoreOffWarningModal: React.FC<StoreOffWarningModalProps> = ({
  isOpen,
  closedStoreNames,
  shop,
  pricingSettings,
  onSchedule,
  onOrderNowAnyStore,
  onCancel,
}) => {
  if (!isOpen) return null;

  const storeNamesText = closedStoreNames.length > 0
    ? closedStoreNames.join(', ')
    : shop?.name || 'নির্বাচিত দোকান';

  const nextOpening = useMemo(() => {
    return getNextStoreOpeningTime(shop, pricingSettings);
  }, [shop, pricingSettings]);

  const handleConfirmSchedule = () => {
    const note = `দোকান খোলার সময় (${nextOpening.timeLabel}) এর জন্য শিডিউল করা হয়েছে`;
    onSchedule(nextOpening.targetDate, note);
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-purple-200/80 space-y-4 animate-in zoom-in-95 duration-150 relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
          title="বাতিল করুন"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Warning Icon Badge */}
        <div className="w-14 h-14 mx-auto rounded-3xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shadow-sm">
          <Store className="w-7 h-7 text-purple-600" />
        </div>

        {/* Title & Store Info */}
        <div className="text-center space-y-1.5">
          <h3 className="font-extrabold text-base sm:text-lg text-gray-900 leading-snug">
            দোকানটি বর্তমানে বন্ধ আছে
          </h3>
          <p className="text-xs font-bold text-purple-900 bg-purple-50 border border-purple-200/80 px-3 py-1.5 rounded-xl inline-block max-w-[90%] truncate">
            {storeNamesText}
          </p>
        </div>

        {/* Schedule Highlight Box */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200/80 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-xs space-y-0.5">
            <p className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">
              দোকান খোলার সম্ভাব্য সময়
            </p>
            <p className="font-extrabold text-sm text-purple-950">
              {nextOpening.formattedTime}
            </p>
          </div>
        </div>

        {/* Description / Question */}
        <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 space-y-2 text-xs text-gray-700 leading-relaxed">
          <p className="font-bold text-gray-900 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span>আপনি কি দোকান খোলার সময়ের জন্য শিডিউল করতে চান?</span>
          </p>
          <p className="text-gray-600 text-[11px] leading-relaxed">
            শিডিউল করলে নির্ধারিত সময়ে আপনার অর্ডারটি স্বয়ংক্রিয়ভাবে সক্রিয় হয়ে সার্ভারে পাঠানো হবে এবং হেলপারদের অ্যাসাইন করা হবে। এমনকি অ্যাপ থেকে বের হয়ে গেলেও সঠিক সময়ে অর্ডার কার্যকর হবে।
          </p>
        </div>

        {/* Action Buttons */}
        <div className="pt-1 space-y-2">
          {/* Primary Option: Schedule for Opening Time */}
          <button
            type="button"
            onClick={handleConfirmSchedule}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:scale-[0.98] text-white font-extrabold text-xs sm:text-sm shadow-md shadow-purple-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
            <span>হ্যাঁ, শিডিউল করুন ({nextOpening.timeLabel})</span>
          </button>

          {/* Secondary Option: Order Now from Any Store */}
          <button
            type="button"
            onClick={onOrderNowAnyStore}
            className="w-full py-2.5 px-4 rounded-2xl bg-gray-100 hover:bg-amber-50 text-gray-700 hover:text-amber-900 border border-transparent hover:border-amber-200 font-bold text-xs transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5"
          >
            <ShoppingCart className="w-3.5 h-3.5 text-amber-600" />
            <span>না, এখনই অন্য দোকান থেকে অর্ডার করুন</span>
          </button>

          {/* Cancel Option */}
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 text-gray-500 hover:text-gray-700 font-semibold text-xs transition-colors cursor-pointer text-center"
          >
            ফিরে যান (Cancel)
          </button>
        </div>
      </div>
    </div>
  );
};
