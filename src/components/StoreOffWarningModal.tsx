'use client';

import React from 'react';
import { AlertTriangle, Store, Check, X, ArrowRight } from 'lucide-react';

interface StoreOffWarningModalProps {
  isOpen: boolean;
  closedStoreNames: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export const StoreOffWarningModal: React.FC<StoreOffWarningModalProps> = ({
  isOpen,
  closedStoreNames,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const storeNamesText = closedStoreNames.length > 0
    ? closedStoreNames.join(', ')
    : 'নির্বাচিত দোকান';

  return (
    <div className="fixed inset-0 z-[99999] bg-black/55 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-amber-200/80 space-y-4 animate-in zoom-in-95 duration-150">
        {/* Warning Icon Badge */}
        <div className="w-14 h-14 mx-auto rounded-3xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-sm">
          <Store className="w-7 h-7 text-amber-600" />
        </div>

        {/* Title */}
        <div className="text-center space-y-1.5">
          <h3 className="font-extrabold text-base sm:text-lg text-gray-900 leading-snug">
            দোকানটি বর্তমানে বন্ধ রয়েছে (Store is Closed)
          </h3>
          <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-xl inline-block">
            {storeNamesText}
          </p>
        </div>

        {/* Message */}
        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2 text-xs text-gray-700 leading-relaxed">
          <p>
            আপনার অর্ডারের নির্বাচিত দোকানটি বর্তমানে <strong>অফলাইনে / বন্ধ</strong> আছে।
          </p>
          <p className="text-gray-600">
            তবুও আপনি অর্ডার সম্পন্ন করতে পারেন! আমাদের ডেডিকেটেড হেলপার <strong>অন্য কোনো বিশ্বস্ত দোকান</strong> থেকে আপনার প্রয়োজনীয় পণ্যগুলো সংগ্রহ করে পৌঁছে দেবে।
          </p>
          <div className="pt-1 text-[11px] text-amber-800 font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>অন্য দোকানের বিক্রয়মূল্য অনুযায়ী পণ্যের মূল্যে পরিবর্তন হতে পারে।</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs transition-colors cursor-pointer text-center"
          >
            ফিরে যান (Cancel)
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-1.5 cursor-pointer text-center"
          >
            <span>সম্মত আছি, অর্ডার করুন</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
};
