'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { RequestComposer } from './RequestComposer';
import { OrderCard } from './OrderCard';
import { OrderDetailsView } from './OrderDetailsView';
import { Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { Sparkles, Zap, HeartHandshake, CheckCircle, Shield, ChevronDown, ShoppingBag, Pill, Utensils, Shirt, Package } from 'lucide-react';
import Link from 'next/link';


const isOrderActive = (o: Order): boolean => {
  if (!o) return false;
  if (o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED') return false;
  if (o.status === 'CANCELED' || (o.status as string) === 'CANCELLED' || o.cancellationRequest?.status === 'APPROVED') return false;
  return ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED', 'SCHEDULED'].includes(o.status);
};

const isOrderPending = (o: Order): boolean => {
  if (!o) return false;
  if (o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED' || o.status === 'CANCELED' || (o.status as string) === 'CANCELLED' || o.cancellationRequest?.status === 'APPROVED') return false;
  return o.status === 'PENDING';
};

const isOrderCompleted = (o: Order): boolean => {
  if (!o) return false;
  return o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED';
};

const isOrderCancelled = (o: Order): boolean => {
  if (!o) return false;
  return o.status === 'CANCELED' || (o.status as string) === 'CANCELLED' || o.cancellationRequest?.status === 'APPROVED';
};

interface CustomerHomeProps {
  initialSelectedOrderId?: string | null;
  onClearInitialOrder?: () => void;
}

export const CustomerHome: React.FC<CustomerHomeProps> = ({
  initialSelectedOrderId,
  onClearInitialOrder,
}) => {
  const { user, openAuthModal } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    if (initialSelectedOrderId) {
      setSelectedOrderId(initialSelectedOrderId);
      if (onClearInitialOrder) {
        onClearInitialOrder();
      }
    }
  }, [initialSelectedOrderId, onClearInitialOrder]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncOrders = () => {
      if (user) {
        const all = Array.from(fallbackStore.orders.values()).filter(
          (o) => o.customerId === user.uid
        );
        all.sort((a, b) => {
          const timeA = new Date(a.deliveredAt || a.updatedAt || a.createdAt).getTime();
          const timeB = new Date(b.deliveredAt || b.updatedAt || b.createdAt).getTime();
          return timeB - timeA;
        });
        setOrders(all);
      } else {
        setOrders([]);
      }
    };
    syncOrders();
    const unsub = fallbackStore.subscribe(syncOrders);
    return () => {
      unsub();
    };
  }, [user]);

  // Real-time synchronization when active orders exist or when app returns to foreground
  useEffect(() => {
    if (!user) return;

    const refreshOrders = () => {
      fallbackStore.fetchCustomerOrders(user.uid).catch(() => {});
    };

    // Initial fetch from Firestore to ensure immediate freshness
    refreshOrders();

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshOrders();
      }
    };

    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refreshOrders);

    // If customer has any running/active orders, poll every 8 seconds to catch status updates immediately
    const hasRunning = orders.some(isOrderActive);
    let interval: NodeJS.Timeout | null = null;
    if (hasRunning) {
      interval = setInterval(refreshOrders, 8000);
    }

    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refreshOrders);
      if (interval) clearInterval(interval);
    };
  }, [user, orders]);

  // Filter logic
  const filteredOrders = orders.filter((o) => {
    if (selectedFilter === 'ACTIVE') return isOrderActive(o);
    if (selectedFilter === 'PENDING') return isOrderPending(o);
    if (selectedFilter === 'COMPLETED') return isOrderCompleted(o);
    if (selectedFilter === 'CANCELLED') return isOrderCancelled(o);
    return true;
  });

  // Infinite Scroll logic
  const visibleOrders = filteredOrders.slice(0, visibleCount);
  const hasMore = filteredOrders.length > visibleCount;

  useEffect(() => {
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => prev + 10);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }
    return () => observer.disconnect();
  }, [hasMore, visibleOrders.length]);

  if (selectedOrderId) {
    return (
      <OrderDetailsView
        orderId={selectedOrderId}
        onBack={() => setSelectedOrderId(null)}
      />
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Primary Request Composer */}
      <RequestComposer
        onOrderCreated={(newOrder) => {
          if (!user) {
            openAuthModal();
          } else {
            setSelectedOrderId(newOrder.id);
          }
        }}
      />

      {/* Logged Out Content: Services, How Jamanot Works & Why Jamanot */}
      {!user && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* Services Available / যেসব কাজ করাতে পারবেন */}
          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-soft">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="font-extrabold text-sm md:text-base text-gray-900 flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>যেসব কাজ করাতে পারবেন</span>
              </h3>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100/60">
                সকল সার্ভিস
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-gray-50/80 hover:bg-emerald-50/40 border border-gray-100 hover:border-emerald-200 transition-all flex flex-col space-y-1">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-1">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-gray-900 text-xs sm:text-sm">বাজার-সদাই</span>
                <span className="text-[11px] text-gray-500 leading-tight">কাঁচাবাজার, মাছ-মাংস, গ্যাস বা নিত্য সদাই</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/80 hover:bg-blue-50/40 border border-gray-100 hover:border-blue-200 transition-all flex flex-col space-y-1">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-1">
                  <Pill className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-gray-900 text-xs sm:text-sm">মেডিসিন আনানো</span>
                <span className="text-[11px] text-gray-500 leading-tight">ফার্মেসি থেকে প্রেসক্রিপশন অনুযায়ী ওষুধ</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/80 hover:bg-amber-50/40 border border-gray-100 hover:border-amber-200 transition-all flex flex-col space-y-1">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-1">
                  <Utensils className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-gray-900 text-xs sm:text-sm">খাবার আনানো</span>
                <span className="text-[11px] text-gray-500 leading-tight">পছন্দের রেস্তোরাঁ বা দোকান থেকে খাবার</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/80 hover:bg-purple-50/40 border border-gray-100 hover:border-purple-200 transition-all flex flex-col space-y-1">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-1">
                  <Shirt className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-gray-900 text-xs sm:text-sm">কাপড় আয়রনে পাঠানো বা আনানো</span>
                <span className="text-[11px] text-gray-500 leading-tight">লন্ড্রি থেকে কাপড় ইস্ত্রি, ওয়াশ ও আনা-নেওয়া</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/80 hover:bg-teal-50/40 border border-gray-100 hover:border-teal-200 transition-all flex flex-col space-y-1">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center mb-1">
                  <Package className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-gray-900 text-xs sm:text-sm">কোনো কিছু কাউকে পাঠানো</span>
                <span className="text-[11px] text-gray-500 leading-tight">পার্সেল, ফাইল বা প্রয়োজনীয় জিনিস পৌঁছে দেওয়া ও আনা</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/80 hover:bg-rose-50/40 border border-gray-100 hover:border-rose-200 transition-all flex flex-col space-y-1">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mb-1">
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-gray-900 text-xs sm:text-sm">অন্য যেকোনো কাজ</span>
                <span className="text-[11px] text-gray-500 leading-tight">যা আপনাকে ঘরের বাইরে গিয়ে করতে হবে</span>
              </div>
            </div>
          </div>

          {/* How Jamanot Works */}
          <div className="bg-emerald-50/80 border border-emerald-100 rounded-3xl p-5 text-emerald-950 shadow-soft">
            <h3 className="font-extrabold text-base mb-3 text-emerald-900 flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <span>How Jamanot Works</span>
            </h3>
            <div className="space-y-3 text-xs font-semibold">
              <div className="flex items-center space-x-3 bg-white p-3.5 rounded-2xl shadow-xs border border-emerald-100/50">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                  1
                </span>
                <span className="text-gray-900 font-extrabold text-sm">Just Submit Request</span>
              </div>
              <div className="flex items-center space-x-3 bg-white p-3.5 rounded-2xl shadow-xs border border-emerald-100/50">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                  2
                </span>
                <span className="text-gray-900 font-extrabold text-sm">Than Relax করুন</span>
              </div>
              <div className="flex items-center space-x-3 bg-white p-3.5 rounded-2xl shadow-xs border border-emerald-100/50">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                  3
                </span>
                <span className="text-gray-900 font-extrabold text-sm">আপনার Helper বাকিটা সামলে নেবে।</span>
              </div>
            </div>
          </div>

          {/* Why Jamanot? */}
          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-soft">
            <h3 className="font-extrabold text-sm text-gray-900 mb-3">Why Jamanot?</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col space-y-1">
                <Zap className="w-5 h-5 text-emerald-600 mb-1" />
                <span className="font-extrabold text-gray-900 text-xs">Nearby Help</span>
                <span className="text-[11px] text-gray-500">Fast local delivery around you</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col space-y-1">
                <HeartHandshake className="w-5 h-5 text-emerald-600 mb-1" />
                <span className="font-extrabold text-gray-900 text-xs">Easy Requests</span>
                <span className="text-[11px] text-gray-500">No complicated ordering form</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col space-y-1">
                <Shield className="w-5 h-5 text-emerald-600 mb-1" />
                <span className="font-extrabold text-gray-900 text-xs">Real People</span>
                <span className="text-[11px] text-gray-500">Trusted verified helpers</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col space-y-1">
                <CheckCircle className="w-5 h-5 text-emerald-600 mb-1" />
                <span className="font-extrabold text-gray-900 text-xs">Live Tracking</span>
                <span className="text-[11px] text-gray-500">Realtime order progress</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logged In Customer: My Requests Section */}
      {user && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-base text-gray-900">My Requests</h3>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              {filteredOrders.length} Requests
            </span>
          </div>

          {/* Horizontal Scrollable Filter Chips */}
          <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1">
            {(['ALL', 'ACTIVE', 'PENDING', 'COMPLETED', 'CANCELLED'] as const).map((filter) => {
              const activeCount = orders.filter(isOrderActive).length;
              const isActiveChip = filter === 'ACTIVE';
              const hasActiveOrders = activeCount > 0 && isActiveChip;
              return (
                <button
                  key={filter}
                  onClick={() => { setSelectedFilter(filter); setVisibleCount(10); }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all relative ${selectedFilter === filter
                    ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300'
                    : hasActiveOrders
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                >
                  {filter === 'ALL' && 'All'}
                  {filter === 'ACTIVE' && `Active${activeCount > 0 ? ` (${activeCount})` : ''}`}
                  {filter === 'PENDING' && 'Pending'}
                  {filter === 'COMPLETED' && 'Completed'}
                  {filter === 'CANCELLED' && 'Cancelled'}
                  {hasActiveOrders && selectedFilter !== filter && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse border-2 border-white" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Orders List */}
          {filteredOrders.length === 0 ? (
            <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 text-sm mb-1">এখনও কোনো request নেই</h4>
              <p className="text-xs text-gray-500 mb-4">আপনার যা দরকার, শুধু বলুন।</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onClick={() => setSelectedOrderId(order.id)}
                  customerView
                />
              ))}

              {/* Infinite Scroll Loader Sentinel */}
              {hasMore && (
                <div ref={loaderRef} className="py-4 text-center flex items-center justify-center space-x-2 text-xs font-semibold text-emerald-700 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                  <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  <span>Loading more requests... ({filteredOrders.length - visibleCount} remaining)</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}





      {/* Customer Bottom Footer Links */}
      <footer className="-mx-4 px-4 pt-6 border-t border-gray-100 text-center text-xs text-gray-400 space-y-2">
        <div className="flex items-center justify-center space-x-4 font-semibold text-gray-500">
          <Link href="/terms" className="hover:text-emerald-600 transition-colors">
            Terms of Service
          </Link>
          <span>•</span>
          <Link href="/privacy" className="hover:text-emerald-600 transition-colors">
            Privacy Policy
          </Link>
        </div>
        <p className="text-[11px] text-gray-400">© {new Date().getFullYear()} Jamanot. Ask. Relax. Done.</p>
      </footer>
    </div>
  );
};
