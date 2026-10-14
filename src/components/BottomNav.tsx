'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { fallbackStore } from '@/lib/firebase';
import { ShoppingBag, Bike, Wallet, Compass, HeartHandshake, Calculator, ClipboardList, Plus, Tag } from 'lucide-react';
import { hapticFeedback } from '@/lib/native';
import { CustomRequestModal } from './CustomRequestModal';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onHomeClick?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab, onHomeClick }) => {
  const { user, activeMode, openAuthModal } = useAuth();
  const { cartItems, openCartDrawer } = useCart();
  const [exploreCount, setExploreCount] = useState(0);
  const [runningOrdersCount, setRunningOrdersCount] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const updateCounts = () => {
      if (!user) {
        setExploreCount(0);
        setRunningOrdersCount(0);
        return;
      }

      const allOrders = Array.from(fallbackStore.orders.values());

      // Helper explore count
      if ((user.isHelper || user.role === 'helper') && activeMode === 'helper') {
        const pendingCount = allOrders.filter(
          (o) =>
            o.status === 'PENDING' &&
            (!o.helperId || o.helperId.trim() === '') &&
            !['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED', 'DELIVERED', 'CANCELED'].includes(o.status) &&
            o.cancellationRequest?.status !== 'APPROVED'
        ).length;
        setExploreCount(pendingCount);
      } else {
        setExploreCount(0);
      }

      // Customer running orders count
      const isStoreUser = Boolean(user.isStoreApproved || user.role === 'store');
      const isHelperUser = Boolean((user.isHelper || user.role === 'helper' || activeMode === 'helper') && !isStoreUser);
      const isCustomerUser = !isStoreUser && !isHelperUser;

      if (isCustomerUser) {
        const running = allOrders.filter(
          (o) =>
            (o.customerId === user.uid ||
              (user.phoneNumber && o.customerPhone === user.phoneNumber) ||
              (user.alternativePhone && o.customerPhone === user.alternativePhone)) &&
            o.status !== 'DELIVERED' &&
            (o.status as string) !== 'COMPLETED' &&
            o.status !== 'CANCELED' &&
            (o.status as string) !== 'CANCELLED' &&
            o.cancellationRequest?.status !== 'APPROVED'
        ).length;
        setRunningOrdersCount(running);
      } else {
        setRunningOrdersCount(0);
      }
    };

    updateCounts();
    if (user?.uid) {
      fallbackStore.fetchCustomerOrders(user.uid).catch(() => {});
    }
    const unsub = fallbackStore.subscribe(updateCounts);
    return () => unsub();
  }, [user, activeMode]);

  if (!user) return null;

  const isAdmin = Boolean(user.isAdmin || user.role === 'admin' || activeMode === 'admin');
  if (isAdmin) return null;

  const isStore = Boolean(
    user.isStoreApproved ||
    user.role === 'store' ||
    user.isStore ||
    Boolean(user.storeId) ||
    activeMode === 'store'
  );
  const isHelper = Boolean((user.isHelper || user.role === 'helper' || activeMode === 'helper') && !isStore);
  const isDedicatedHelper = isHelper && user.helperType === 'dedicated';
  const isCustomer = !isStore && !isHelper;

  const handleTabChange = (tab: string) => {
    hapticFeedback('selection');
    if (tab === 'request') {
      onHomeClick?.();
    }
    if (tab !== activeTab) {
      setActiveTab(tab);
    }
  };

  const tabClass = (isActive: boolean, color: 'emerald' | 'purple' = 'emerald') =>
    [
      'relative flex flex-col items-center space-y-1 py-1 px-3 rounded-2xl transition-all duration-200 tap-spring cursor-pointer touch-manipulation select-none',
      'min-w-[48px]',
      isActive
        ? color === 'purple'
          ? 'text-purple-700 font-bold scale-105'
          : 'text-emerald-700 font-bold scale-105'
        : 'text-gray-400 hover:text-gray-600 active:scale-95',
    ].join(' ');

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 w-full z-40 bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-xl"
        style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
      >
        <div className="content-container flex items-center justify-around px-2 pt-2">

          {/* ── STORE NAVIGATION ── */}
          {isStore && (
            <>
              <button
                id="nav-tab-store-orders"
                type="button"
                onClick={() => handleTabChange('request')}
                className={tabClass(activeTab === 'request')}
                aria-label="Store Orders"
              >
                <ShoppingBag className="w-5 h-5 pointer-events-none" />
                <span className="text-[11px] pointer-events-none">Orders</span>
                {activeTab === 'request' && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600 pointer-events-none" />}
              </button>
              <button
                id="nav-tab-store-products"
                type="button"
                onClick={() => handleTabChange('store_products')}
                className={tabClass(activeTab === 'store_products')}
                aria-label="Products"
              >
                <Tag className="w-5 h-5 pointer-events-none" />
                <span className="text-[11px] pointer-events-none">Products</span>
                {activeTab === 'store_products' && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600 pointer-events-none" />}
              </button>
              <button
                id="nav-tab-store-wallet"
                type="button"
                onClick={() => handleTabChange('wallet')}
                className={tabClass(activeTab === 'wallet')}
                aria-label="Store Wallet"
              >
                <Wallet className="w-5 h-5 pointer-events-none" />
                <span className="text-[11px] pointer-events-none">Wallet</span>
                {activeTab === 'wallet' && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600 pointer-events-none" />}
              </button>
            </>
          )}

          {/* ── HELPER NAVIGATION ── */}
          {isHelper && (
            <>
              <button id="nav-tab-helper-tasks" onClick={() => handleTabChange('helper_tasks')} className={tabClass(activeTab === 'helper_tasks' || activeTab === 'request')} aria-label="Requests">
                <Bike className="w-5 h-5" />
                <span className="text-[11px]">Requests</span>
                {(activeTab === 'helper_tasks' || activeTab === 'request') && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />}
              </button>

              {isDedicatedHelper && (
                <button id="nav-tab-explore" onClick={() => handleTabChange('explore')} className={tabClass(activeTab === 'explore')} aria-label="Explore">
                  <div className="relative">
                    <Compass className="w-5 h-5" />
                    {exploreCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[18px] h-[18px] flex items-center justify-center shadow-md animate-pulse">
                        {exploreCount > 99 ? '99+' : exploreCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px]">Explore</span>
                  {activeTab === 'explore' && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />}
                </button>
              )}

              <button id="nav-tab-helper-wallet" onClick={() => handleTabChange('wallet')} className={tabClass(activeTab === 'wallet')} aria-label="Wallet">
                <Wallet className="w-5 h-5" />
                <span className="text-[11px]">Wallet</span>
                {activeTab === 'wallet' && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />}
              </button>

              <button id="nav-tab-fee-details" onClick={() => handleTabChange('fee_details')} className={tabClass(activeTab === 'fee_details')} aria-label="Fee Calculator">
                <Calculator className="w-5 h-5" />
                <span className="text-[11px] whitespace-nowrap">Fee</span>
                {activeTab === 'fee_details' && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />}
              </button>
            </>
          )}

          {/* ── CUSTOMER NAVIGATION ── */}
          {isCustomer && (
            <>
              {/* Home */}
              <button id="nav-tab-request" onClick={() => handleTabChange('request')} className={tabClass(activeTab === 'request')} aria-label="Home">
                <ShoppingBag className="w-5 h-5" />
                <span className="text-[11px]">Home</span>
                {activeTab === 'request' && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />}
              </button>

              {/* My Orders */}
              <button id="nav-tab-my-orders" onClick={() => handleTabChange('my_orders')} className={tabClass(activeTab === 'my_orders')} aria-label="My Orders">
                <div className="relative">
                  <ClipboardList className="w-5 h-5" />
                  {runningOrdersCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-yellow-400 text-yellow-950 text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] h-[18px] flex items-center justify-center shadow-md animate-pulse ring-2 ring-white">
                      {runningOrdersCount > 99 ? '99+' : runningOrdersCount}
                    </span>
                  )}
                </div>
                <span className="text-[11px]">Orders</span>
                {activeTab === 'my_orders' && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />}
              </button>

              {/* ─── CENTER ADD BUTTON (protruding above nav bar) ─── */}
              <div className="relative flex flex-col items-center" style={{ marginTop: '-28px' }}>
                {/* Outer ring pulse */}
                <span className="absolute top-0 w-16 h-16 rounded-full bg-emerald-400/30 animate-ping pointer-events-none" />
                <button
                  id="nav-add-request"
                  type="button"
                  aria-label="New Request"
                  onClick={() => {
                    hapticFeedback('selection');
                    if (cartItems.length > 0) {
                      openCartDrawer(true);
                      return;
                    }
                    if (!user) { openAuthModal(); return; }
                    setShowAddModal(true);
                  }}
                  className="relative w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-2xl shadow-emerald-600/50 flex items-center justify-center border-4 border-white active:scale-95 transition-transform cursor-pointer"
                >
                  <Plus className="w-8 h-8 text-white stroke-[3]" />
                </button>
              </div>

              {/* Help Center */}
              <button id="nav-tab-helper-center" onClick={() => handleTabChange('helper_center')} className={tabClass(activeTab === 'helper_center')} aria-label="Help Center">
                <HeartHandshake className="w-5 h-5" />
                <span className="text-[11px]">Help</span>
                {activeTab === 'helper_center' && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />}
              </button>

              {/* Fee */}
              <button id="nav-tab-fee-details" onClick={() => handleTabChange('fee_details')} className={tabClass(activeTab === 'fee_details')} aria-label="Fee Calculator">
                <Calculator className="w-5 h-5" />
                <span className="text-[11px]">Fee</span>
                {activeTab === 'fee_details' && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />}
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Custom Request Modal triggered by ADD button */}
      {isCustomer && (
        <CustomRequestModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onOrderCreated={() => setShowAddModal(false)}
        />
      )}
    </>
  );
};
