'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { Sparkles } from 'lucide-react';
import { hapticFeedback } from '@/lib/native';

interface MissingItemFloatingButtonProps {
  onOpenCustomRequest: (hint?: string) => void;
}

export const MissingItemFloatingButton: React.FC<MissingItemFloatingButtonProps> = ({
  onOpenCustomRequest,
}) => {
  const { user, activeMode } = useAuth();
  const { totalCartCount, openCartDrawer } = useCart();

  // Only display for customer view
  const isCustomerMode =
    !activeMode ||
    activeMode === 'customer' ||
    (!user?.isAdmin &&
      user?.role !== 'admin' &&
      !user?.isHelper &&
      user?.role !== 'helper' &&
      !user?.isStore &&
      user?.role !== 'store');

  if (!isCustomerMode) return null;

  return (
    <div
      id="missing-item-floating-button"
      className={`fixed ${
        user ? 'bottom-20' : 'bottom-5 sm:bottom-6'
      } left-1/2 -translate-x-1/2 z-30 max-w-[95vw] pointer-events-auto transition-all`}
    >
      <button
        type="button"
        onClick={() => {
          hapticFeedback('selection');
          if (totalCartCount > 0) {
            openCartDrawer(true);
          } else {
            onOpenCustomRequest();
          }
        }}
        className="flex items-center gap-2.5 px-5 py-3 rounded-full bg-gray-950/95 hover:bg-black text-white shadow-2xl shadow-black/35 backdrop-blur-md border border-white/25 active:scale-95 transition-all cursor-pointer whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 select-none"
      >
        <Sparkles className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
        <span className="text-xs sm:text-sm font-extrabold tracking-wide">
          কিছু মিসিং বা অন্যকিছু করাতে চাইলে ক্লিক করুন
        </span>
      </button>
    </div>
  );
};
