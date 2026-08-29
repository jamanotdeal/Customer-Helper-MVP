'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { RequestComposer } from './RequestComposer';
import { OrderCard } from './OrderCard';
import { OrderDetailsView } from './OrderDetailsView';
import { Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { Sparkles, Zap, HeartHandshake, CheckCircle, Shield, ArrowRight, X, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { OrderSuccessPwaModal } from './PWAInstallModal';

interface CustomerHomeProps {
  initialSelectedOrderId?: string | null;
  onClearInitialOrder?: () => void;
}

export const CustomerHome: React.FC<CustomerHomeProps> = ({
  initialSelectedOrderId,
  onClearInitialOrder,
}) => {
  const { user, loginWithGoogle } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showAuthRequiredModal, setShowAuthRequiredModal] = useState(false);
  const [createdOrderForSuccessModal, setCreatedOrderForSuccessModal] = useState<Order | null>(null);
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

  // Filter logic
  const filteredOrders = orders.filter((o) => {
    if (selectedFilter === 'ACTIVE') return ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED'].includes(o.status);
    if (selectedFilter === 'PENDING') return o.status === 'PENDING';
    if (selectedFilter === 'COMPLETED') return o.status === 'DELIVERED';
    if (selectedFilter === 'CANCELLED') return o.status === 'CANCELED';
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
            setShowAuthRequiredModal(true);
          } else {
            setCreatedOrderForSuccessModal(newOrder);
          }
        }}
      />

      {/* Logged Out Content: How Jamanot Works & Why Jamanot */}
      {!user && (
        <div className="space-y-4 animate-in fade-in duration-300">
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
              const activeCount = orders.filter((o) => ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED'].includes(o.status)).length;
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

      {/* Auth Required Modal */}
      {showAuthRequiredModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4 text-center relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowAuthRequiredModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative w-12 h-12 rounded-none overflow-hidden shadow-sm border border-emerald-200 mx-auto mb-2 bg-emerald-50">
              <Image
                src="/Jamanot-Logo.png"
                alt="Jamanot Logo"
                fill
                className="object-cover"
                priority
              />
            </div>

            <h3 className="font-extrabold text-lg text-gray-900">Sign In Required</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              আপনার রিকোয়েস্টটি সেভ করতে এবং হেলপার খুঁজে পেতে আপনার Google অ্যাকাউন্ট দিয়ে লগইন করুন।
            </p>

            <button
              onClick={() => {
                setShowAuthRequiredModal(false);
                loginWithGoogle();
              }}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-floating flex items-center justify-center space-x-2 transition-all"
            >
              <span>Continue with Google</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-[11px] text-gray-500 text-center pt-1 leading-relaxed">
              By continuing, you agree to Jamanot&apos;s{' '}
              <Link
                href="/terms"
                onClick={() => setShowAuthRequiredModal(false)}
                className="text-emerald-600 font-bold underline hover:text-emerald-700"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                onClick={() => setShowAuthRequiredModal(false)}
                className="text-emerald-600 font-bold underline hover:text-emerald-700"
              >
                Privacy Policy
              </Link>.
            </p>
          </div>
        </div>
      )}

      {/* Order Success PWA Modal */}
      {createdOrderForSuccessModal && (
        <OrderSuccessPwaModal
          isOpen={Boolean(createdOrderForSuccessModal)}
          onClose={() => setCreatedOrderForSuccessModal(null)}
          orderId={createdOrderForSuccessModal.id}
          orderTitle={createdOrderForSuccessModal.title}
          onViewOrderDetails={() => {
            const ordId = createdOrderForSuccessModal.id;
            setCreatedOrderForSuccessModal(null);
            setSelectedOrderId(ordId);
          }}
        />
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
