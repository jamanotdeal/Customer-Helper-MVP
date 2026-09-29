'use client';

import React from 'react';
import { fallbackStore } from '@/lib/firebase';
import { ShieldAlert, ExternalLink, X, Lock } from 'lucide-react';
import { DEFAULT_PRICING_SETTINGS } from '@/lib/pricing';

interface BlockedUserModalProps {
  onClose: () => void;
  targetRole?: 'customer' | 'helper' | 'store' | 'user';
  customTitle?: string;
  customMessage?: string;
}

export const BlockedUserModal: React.FC<BlockedUserModalProps> = ({
  onClose,
  targetRole = 'user',
  customTitle,
  customMessage,
}) => {
  const settings = fallbackStore.pricingSettings || DEFAULT_PRICING_SETTINGS;

  const title =
    customTitle ||
    settings.blockedUserModalTitle ||
    DEFAULT_PRICING_SETTINGS.blockedUserModalTitle ||
    'অ্যাকাউন্ট সাময়িকভাবে স্থগিত (Account Suspended)';

  const subtitle =
    settings.blockedUserModalSubtitle ||
    DEFAULT_PRICING_SETTINGS.blockedUserModalSubtitle ||
    'আপনার অ্যাকাউন্টটি সাময়িকভাবে সীমাবদ্ধ করা হয়েছে';

  const message =
    customMessage ||
    settings.blockedUserModalMessage ||
    DEFAULT_PRICING_SETTINGS.blockedUserModalMessage ||
    'নিরাপত্তা বা নীতিমালা ভঙ্গের কারণে আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত করা হয়েছে। এই মুহূর্তে নতুন সার্ভিস রিকোয়েস্ট তৈরি বা নতুন অর্ডার গ্রহণ করা যাবে না। বিস্তারিত তথ্য বা সহায়তার জন্য অনুগ্রহ করে অ্যাডমিন বা সাপোর্টে যোগাযোগ করুন।';

  const buttonText =
    settings.blockedUserModalButtonText ||
    DEFAULT_PRICING_SETTINGS.blockedUserModalButtonText ||
    'সাপোর্টে যোগাযোগ করুন (Contact Support)';

  const contactUrl =
    settings.blockedUserModalContactUrl ||
    DEFAULT_PRICING_SETTINGS.blockedUserModalContactUrl ||
    'https://wa.me/8801800000000';

  const handleSupportClick = () => {
    if (contactUrl && contactUrl.trim()) {
      const url = contactUrl.trim();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        window.open(url, '_blank');
      } else if (url.startsWith('01') || url.startsWith('+88')) {
        const clean = url.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${clean.startsWith('88') ? clean : '88' + clean}`, '_blank');
      } else {
        window.location.href = url;
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200 border border-red-100 flex flex-col">
        {/* Top Gradient Banner with Lock/Alert */}
        <div className="bg-gradient-to-br from-rose-900 via-red-850 to-purple-950 p-6 text-white text-center relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all shadow-xs"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 mx-auto flex items-center justify-center mb-3 shadow-inner backdrop-blur-xs">
            <ShieldAlert className="w-8 h-8 text-rose-300" />
          </div>

          <h3 className="text-lg md:text-xl font-black text-white tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-rose-200 font-medium mt-1">
              {subtitle}
            </p>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-rose-50/80 border border-rose-100 flex items-start space-x-3">
            <Lock className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-950 leading-relaxed font-medium whitespace-pre-line">
              {message}
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleSupportClick}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-950 hover:to-indigo-950 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
            >
              <span>{buttonText}</span>
              <ExternalLink className="w-4 h-4 text-purple-200" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all text-center cursor-pointer"
            >
              ঠিক আছে, বন্ধ করুন (Understood)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
