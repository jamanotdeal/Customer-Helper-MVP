'use client';

import React, { useState, useEffect } from 'react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { hapticFeedback } from '@/lib/native';

export const FloatingCartBar: React.FC = () => {
  const { totalCartCount, subtotal, openCartDrawer } = useCart();
  const { user, activeMode } = useAuth();
  const [hasMissingButton, setHasMissingButton] = useState(false);

  // Detect whether the missing item popup/button is present on the current screen
  useEffect(() => {
    const checkMissing = () => {
      const el = document.getElementById('missing-item-floating-button');
      setHasMissingButton(Boolean(el));
    };

    checkMissing();
    const observer = new MutationObserver(checkMissing);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  // Only show when cart has items
  if (totalCartCount <= 0) return null;

  // Don't show in admin, helper, or store modes
  const isCustomer =
    !activeMode ||
    activeMode === 'customer' ||
    (!user?.isAdmin &&
      user?.role !== 'admin' &&
      !user?.isHelper &&
      user?.role !== 'helper' &&
      !user?.isStore &&
      user?.role !== 'store');

  if (!isCustomer) return null;

  const hasBottomNav = Boolean(user);

  // Position: When the missing item button is present on the screen,
  // the cart floating bar is positioned BEFORE (above) it with comfortable clearance.
  // When no missing item button exists, it docks directly above the bottom nav (or screen bottom).
  const bottomPositionClass = hasMissingButton
    ? hasBottomNav
      ? 'bottom-36'
      : 'bottom-20'
    : hasBottomNav
    ? 'bottom-20'
    : 'bottom-5';

  return (
    <div
      className={`fixed ${bottomPositionClass} left-1/2 -translate-x-1/2 z-40 max-w-[92vw] pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200 select-none transition-all`}
    >
      <div className="flex items-center gap-1.5 p-1 bg-gray-950/95 text-white rounded-2xl shadow-2xl border border-white/20 backdrop-blur-xl">
        {/* Cart Button with badge & subtotal */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            hapticFeedback('selection');
            openCartDrawer();
          }}
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all cursor-pointer text-left"
          aria-label="View cart"
        >
          <div className="relative">
            <ShoppingBag className="w-4 h-4 text-emerald-400" />
            <span className="absolute -top-1.5 -right-2 bg-emerald-500 text-white text-[9px] font-black rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
              {totalCartCount}
            </span>
          </div>
          <span className="text-xs sm:text-sm font-black text-white">৳{subtotal}</span>
        </button>

        {/* Beside Cart Button: Submit / Send Request Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            hapticFeedback('selection');
            openCartDrawer();
          }}
          className="flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-950/40 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
        >
          <span>Send Request</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
