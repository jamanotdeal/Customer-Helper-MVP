'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { OrderDetailsView } from './OrderDetailsView';
import { ServiceTickerHeader } from './ServiceTickerHeader';
import { StoreGrid } from './StoreGrid';
import { AddCustomItemModal } from './AddCustomItemModal';
import { CustomRequestModal } from './CustomRequestModal';
import { StorePage } from './StorePage';
import { OrderItem, Shop, Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { DEFAULT_SERVICES, isOrderTimingOpen } from '@/lib/pricing';
import { Sparkles, ShoppingBag, Clock } from 'lucide-react';
import { hapticFeedback } from '@/lib/native';
import { HomeSearchBox } from './HomeSearchBox';
import { useCart } from '@/context/CartContext';
import { CartSummaryDrawer } from './CartSummaryDrawer';

interface CustomerHomeProps {
  initialSelectedOrderId?: string | null;
  onClearInitialOrder?: () => void;
  resetTrigger?: number;
}

export const CustomerHome: React.FC<CustomerHomeProps> = ({
  initialSelectedOrderId,
  onClearInitialOrder,
  resetTrigger,
}) => {
  const { user, loginWithGoogle, openAuthModal } = useAuth();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    initialSelectedOrderId && user ? initialSelectedOrderId : null
  );
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [showCustomRequestModal, setShowCustomRequestModal] = useState(false);
  const [customRequestInitialHint, setCustomRequestInitialHint] = useState('');
  const [customRequestInitialDesc, setCustomRequestInitialDesc] = useState('');
  const { cartItems, cartShop, openCartDrawer, totalCartCount, subtotal, addCustomItem } = useCart();

  // Out of service timing status with client-mount safety (prevents Next.js hydration mismatch)
  const [isMounted, setIsMounted] = useState(false);
  const [timingStatus, setTimingStatus] = useState(() => isOrderTimingOpen(fallbackStore.pricingSettings));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Admin saved services list for placeholder rotation
  const [servicesList, setServicesList] = useState<string[]>(() => {
    const adminServices = fallbackStore.pricingSettings?.services;
    if (adminServices && adminServices.length > 0) return adminServices;
    const adminPlaceholders = fallbackStore.pricingSettings?.inputPlaceholders;
    if (adminPlaceholders && adminPlaceholders.length > 0) return adminPlaceholders;
    return DEFAULT_SERVICES;
  });
  const [serviceIndex, setServiceIndex] = useState(0);

  // Restore saved service selection from localStorage on first mount
  useEffect(() => {
    try {
      const savedService = localStorage.getItem('customer_selected_service');
      if (savedService) {
        setSelectedService(savedService);
      }
    } catch (e) {
      console.warn('Failed to read customer_selected_service from localStorage:', e);
    }
  }, []);

  const handleSelectService = (svc: string) => {
    setSelectedService(svc);
    try {
      if (svc) {
        localStorage.setItem('customer_selected_service', svc);
      } else {
        localStorage.removeItem('customer_selected_service');
      }
    } catch (e) {
      console.warn('Failed to save customer_selected_service to localStorage:', e);
    }
  };

  // Sync timing status in real time and every 30 seconds
  useEffect(() => {
    const syncTiming = () => {
      setTimingStatus(isOrderTimingOpen(fallbackStore.pricingSettings));
    };
    syncTiming();
    const unsub = fallbackStore.subscribe(syncTiming);
    const interval = setInterval(syncTiming, 30000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  // Listen for resetTrigger to return back to top-level home view
  useEffect(() => {
    if (resetTrigger !== undefined && resetTrigger > 0) {
      setSelectedOrderId(null);
      setSelectedShop(null);
      // Selected service is preserved so customer doesn't have to re-select on home tap
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [resetTrigger]);

  // If currently selected shop is blocked, clear it immediately
  useEffect(() => {
    if (!selectedShop) return;
    const checkBlocked = () => {
      const live = fallbackStore.shops.get(selectedShop.id);
      if (live && (live.isBlocked || live.status === 'Rejected' || live.status === 'REJECTED')) {
        setSelectedShop(null);
      }
    };
    checkBlocked();
    const unsub = fallbackStore.subscribe(checkBlocked);
    return () => unsub();
  }, [selectedShop]);

  // Sync admin services in real time from store
  useEffect(() => {
    const sync = () => {
      const adminServices = fallbackStore.pricingSettings?.services;
      if (adminServices && adminServices.length > 0) {
        setServicesList(adminServices);
      } else if (fallbackStore.pricingSettings?.inputPlaceholders?.length) {
        setServicesList(fallbackStore.pricingSettings.inputPlaceholders);
      } else {
        setServicesList(DEFAULT_SERVICES);
      }
    };
    sync();
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, []);

  // Rotate placeholder every 2.5s through all admin-saved services
  useEffect(() => {
    if (servicesList.length <= 1) return;
    const timer = setInterval(() => {
      setServiceIndex((prev) => (prev + 1) % servicesList.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [servicesList]);

  // Open custom request modal after successful login if triggered from the home input or hero CTA
  useEffect(() => {
    if (user && typeof window !== 'undefined') {
      const pendingOpen = sessionStorage.getItem('open_custom_request_after_login');
      if (pendingOpen) {
        sessionStorage.removeItem('open_custom_request_after_login');
        const pendingHint = sessionStorage.getItem('custom_request_pending_hint') || '';
        sessionStorage.removeItem('custom_request_pending_hint');
        const pendingDesc = sessionStorage.getItem('custom_request_pending_desc') || '';
        sessionStorage.removeItem('custom_request_pending_desc');

        if (cartItems.length > 0) {
          openCartDrawer(true, pendingDesc || pendingHint);
          return;
        }

        if (pendingHint) {
          setCustomRequestInitialHint(pendingHint);
        }
        if (pendingDesc) {
          setCustomRequestInitialDesc(pendingDesc);
        }
        setShowCustomRequestModal(true);
      }
    }
  }, [user, cartItems, openCartDrawer]);

  const handleOpenCustomRequest = (textToPass?: string) => {
    hapticFeedback('selection');
    const isServiceMatch = Boolean(
      textToPass &&
      (servicesList.includes(textToPass) ||
       ['বাজার-সদাই করে দিন', 'ফার্মেসি থেকে ওষুধ এনে দিন', 'খাবার আনানো', 'মেডিসিন এনে দিন', 'খাবার এনে দিন', 'কাপড় আয়রনে দেওয়া বা আনা', 'পার্সেল পাঠানো বা আনা'].includes(textToPass))
    );
    const selectedSvc = isServiceMatch ? (textToPass as string) : '';
    const desc = (!isServiceMatch && typeof textToPass === 'string') ? textToPass : '';

    // If items are available in cart, open Cart Summary highlighting custom option
    if (cartItems.length > 0) {
      openCartDrawer(true, desc || selectedSvc);
      return;
    }

    if (!user) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('open_custom_request_after_login', 'true');
        if (selectedSvc) {
          sessionStorage.setItem('custom_request_pending_hint', selectedSvc);
        } else {
          sessionStorage.removeItem('custom_request_pending_hint');
        }
        if (desc) {
          sessionStorage.setItem('custom_request_pending_desc', desc);
        } else {
          sessionStorage.removeItem('custom_request_pending_desc');
        }
      }
      openAuthModal();
      return;
    }

    setCustomRequestInitialHint(selectedSvc);
    setCustomRequestInitialDesc(desc || '');
    setShowCustomRequestModal(true);
  };

  const handleAddItem = (item: OrderItem) => {
    addCustomItem(item);
  };

  if (selectedOrderId) {
    return (
      <OrderDetailsView
        key={selectedOrderId}
        orderId={selectedOrderId}
        onBack={() => {
          setSelectedOrderId(null);
          onClearInitialOrder?.();
        }}
      />
    );
  }

  // When customer clicked on a store, open dedicated Store Page
  if (selectedShop) {
    return (
      <StorePage
        shop={selectedShop}
        onBack={() => setSelectedShop(null)}
        onOrderCreated={(order) => {
          setSelectedShop(null);
          setSelectedOrderId(order.id);
        }}
      />
    );
  }

  return (
    <div className="space-y-4 pb-28 relative">
      {/* ── 0. Out of Service Hours Admin Message Banner (Right Before Slide) ── */}
      {isMounted && !timingStatus.isOpen && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-400/80 shadow-md shadow-amber-500/10 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/30">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <p className="text-xs sm:text-sm text-amber-950 font-bold leading-relaxed flex-1 min-w-0">
              {timingStatus.message || fallbackStore.pricingSettings?.orderTimingMessage || 'অনুরোধ গ্রহণ সাময়িকভাবে বন্ধ আছে। পরে আবার চেষ্টা করুন।'}
            </p>
          </div>
        </div>
      )}

      {/* ── 1. Full Banner Image Slider ── */}
      <ServiceTickerHeader
        onOpenCustomRequest={(hint) => handleOpenCustomRequest(hint)}
      />

      {/* ── 2. Searchbox Right After Slider ── */}
      <HomeSearchBox
        onOpenCustomRequest={(q) => handleOpenCustomRequest(q)}
        onStoreClick={(shop) => setSelectedShop(shop)}
      />

      {/* ── 3. Store Grid with "Select Service" Filter & Infinite Scroll ── */}
      <StoreGrid
        selectedService={selectedService}
        onSelectService={handleSelectService}
        resetTrigger={resetTrigger}
        onStoreClick={(shop) => setSelectedShop(shop)}
        onOpenCustomRequest={(hint) => handleOpenCustomRequest(hint)}
      />

      {/* Modals */}
      <AddCustomItemModal
        isOpen={showCustomItemModal}
        onClose={() => setShowCustomItemModal(false)}
        onAddItem={handleAddItem}
      />
      <CustomRequestModal
        isOpen={showCustomRequestModal}
        onClose={() => {
          setShowCustomRequestModal(false);
          setCustomRequestInitialHint('');
          setCustomRequestInitialDesc('');
        }}
        initialService={customRequestInitialHint}
        initialDescription={customRequestInitialDesc}
        onOrderCreated={(order) => {
          setShowCustomRequestModal(false);
          setCustomRequestInitialHint('');
          setCustomRequestInitialDesc('');
          setSelectedOrderId(order.id);
        }}
      />
    </div>
  );
};
