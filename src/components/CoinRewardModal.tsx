'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Coins, Gift, ArrowRight, X } from 'lucide-react';

interface CoinRewardModalProps {
  earnedCoins: number;
  onClose: () => void;
  onContinueToFeedback: () => void;
}

export const CoinRewardModal: React.FC<CoinRewardModalProps> = ({
  earnedCoins,
  onClose,
  onContinueToFeedback,
}) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-amber-200/80 text-center overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top celebratory background glow */}
        <div className="absolute -top-16 -left-16 w-48 h-48 bg-amber-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-yellow-400/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Floating Animated Coin Icon */}
        <div className="relative mx-auto mt-2 mb-4 w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 animate-ping opacity-25" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/30 border-2 border-yellow-200">
            <Coins className="w-10 h-10 text-amber-950 animate-bounce" />
          </div>
          <Sparkles className="absolute -top-1 -right-1 w-6 h-6 text-amber-500 animate-spin" style={{ animationDuration: '4s' }} />
        </div>

        {/* Heading */}
        <div className="space-y-1 mb-3">
          <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300/60">
            <Gift className="w-3.5 h-3.5 text-amber-700" />
            <span>অর্ডার সম্পন্ন হয়েছে!</span>
          </span>
          <h2 className="text-xl font-extrabold text-gray-900 font-sans tracking-tight">
            অভিনন্দন! আপনি কয়েন পেয়েছেন
          </h2>
        </div>

        {/* Coin Card */}
        <div className="my-4 p-4 rounded-2xl bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100/60 border border-amber-200/80 shadow-xs">
          <div className="flex items-center justify-center space-x-2 text-3xl font-black text-amber-700 tracking-tight">
            <span>+{earnedCoins}</span>
            <span className="text-lg font-bold text-amber-800">Coins</span>
          </div>
        </div>

        {/* Action Button: Chains to Feedback Popup */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={onContinueToFeedback}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
          >
            <span>মতামত ও রেটিং দিন</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 text-xs text-gray-500 hover:text-gray-700 font-semibold cursor-pointer"
          >
            পরে মতামত দেব
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
