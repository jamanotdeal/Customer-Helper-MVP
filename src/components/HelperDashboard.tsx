'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { HelperRequestCard } from './HelperRequestCard';
import { HelperActiveOrderView } from './HelperActiveOrderView';
import { OrderCard } from './OrderCard';
import { useModal } from './CustomModal';
import { Bike, CheckCircle2, Clock, Layers, Bell, Zap, ChevronDown } from 'lucide-react';

export const HelperDashboard: React.FC = () => {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [activeTab, setActiveTab] = useState<'NEW' | 'ACTIVE' | 'COMPLETED'>('NEW');
  const [rejectedOrderIds] = useState<Set<string>>(new Set());
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeOrderLimit, setActiveOrderLimit] = useState<number>(
    fallbackStore.pricingSettings.helperActiveOrderLimit ?? 5
  );

  // Track new available orders (not yet seen when they first appeared)
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [seenOrderIds, setSeenOrderIds] = useState<Set<string>>(new Set());
  const seenOrderIdsRef = useRef<Set<string>>(new Set());

  // Track which ACTIVE orders the helper has viewed (clicked on the card)
  const [viewedActiveOrderIds, setViewedActiveOrderIds] = useState<Set<string>>(new Set());

  // Keep ref in sync with state
  useEffect(() => { seenOrderIdsRef.current = seenOrderIds; }, [seenOrderIds]);

  // Per-tab "load more" visible count
  const PAGE_SIZE = 8;
  const [newVisibleCount, setNewVisibleCount] = useState(PAGE_SIZE);
  const [activeVisibleCount, setActiveVisibleCount] = useState(PAGE_SIZE);
  const [completedVisibleCount, setCompletedVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const syncOrders = () => {
      if (user) {
        const all = Array.from(fallbackStore.orders.values());

        // Available (New tab): status PENDING and no helper assigned
        const avail = all.filter((o) => o.status === 'PENDING' && !o.helperId);
        // Active: assigned to current helper and non-delivered/non-canceled
        const act = all.filter(
          (o) =>
            o.helperId === user.uid &&
            ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED'].includes(o.status)
        );
        // Completed: delivered orders by current helper
        const comp = all.filter((o) => o.helperId === user.uid && o.status === 'DELIVERED');

        // Track new available orders that haven't been seen
        setAvailableOrders((prev) => {
          const prevIds = new Set(prev.map((o) => o.id));
          const freshNewIds = avail
            .filter((o) => !prevIds.has(o.id))
            .map((o) => o.id);
          if (freshNewIds.length > 0) {
            setNewOrderIds((prevNew) => {
              const updated = new Set(prevNew);
              freshNewIds.forEach((id) => {
                if (!seenOrderIdsRef.current.has(id)) updated.add(id);
              });
              return updated;
            });
          }
          return avail;
        });
        setActiveOrders(act);
        setCompletedOrders(comp);
        setActiveOrderLimit(fallbackStore.pricingSettings.helperActiveOrderLimit ?? 5);
      }
    };

    syncOrders();
    const unsub = fallbackStore.subscribe(syncOrders);
    return () => {
      unsub();
    };
  }, [user]);

  const handleAcceptOrder = async (orderId: string) => {
    if (!user) return;
    if (activeOrders.length >= activeOrderLimit) {
      await showAlert(
        'অর্ডার সীমা পূর্ণ',
        `আপনি সর্বোচ্চ ${activeOrderLimit}টি অ্যাক্টিভ অর্ডার সম্পন্ন করার পর নতুন অর্ডার নিতে পারবেন।`,
        'warning'
      );
      return;
    }

    const confirmed = await showConfirm(
      'রিকুয়েস্ট গ্রহণ করুন',
      'আপনি কি এই রিকুয়েস্টটি গ্রহণ করতে চান? গ্রহণ করার পর আপনি অর্ডারটি ডেলিভারি করতে বাধ্য থাকবেন।',
      'হ্যাঁ, Accept করুন',
      'বাতিল'
    );
    if (!confirmed) return;

    fallbackStore.updateOrder(orderId, (o) => ({
      ...o,
      status: 'ACCEPTED',
      helperId: user.uid,
      helperName: user.displayName,
      helperPhone: user.alternativePhone,
      acceptedAt: new Date().toISOString(),
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: 'ACCEPTED',
          timestamp: new Date().toISOString(),
          actor: `Helper (${user.displayName})`,
          note: 'Accepted request',
        },
      ],
    }));

    // Auto open active order view
    setSelectedOrderId(orderId);
  };

  const handleViewOrderDetails = (orderId: string) => {
    setSeenOrderIds((prev) => {
      const updated = new Set(prev);
      updated.add(orderId);
      return updated;
    });
    setNewOrderIds((prev) => {
      const updated = new Set(prev);
      updated.delete(orderId);
      return updated;
    });
    setSelectedOrderId(orderId);
  };

  // Mark an active order as viewed and open the detail view
  const handleActiveOrderClick = (orderId: string) => {
    setViewedActiveOrderIds((prev) => {
      const updated = new Set(prev);
      updated.add(orderId);
      return updated;
    });
    setSelectedOrderId(orderId);
  };

  if (selectedOrderId) {
    const targetOrder = fallbackStore.orders.get(selectedOrderId);
    if (targetOrder) {
      return (
        <HelperActiveOrderView
          order={targetOrder}
          onBack={() => setSelectedOrderId(null)}
          onAccept={targetOrder.status === 'PENDING' ? handleAcceptOrder : undefined}
          activeOrdersCount={activeOrders.length}
          activeOrderLimit={activeOrderLimit}
        />
      );
    }
  }

  const visibleAvailable = availableOrders.filter((ord) => !rejectedOrderIds.has(ord.id));
  // Unviewed active orders = active orders whose IDs are NOT in viewedActiveOrderIds
  const unviewedActiveCount = activeOrders.filter((o) => !viewedActiveOrderIds.has(o.id)).length;

  return (
    <div className="space-y-5 pb-24">
      {/* Helper Workload Header Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-5 text-white shadow-floating flex items-center space-x-4">
        <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-xs shrink-0">
          <Bike className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-sm leading-snug">
            একসাথে {activeOrderLimit}টির বেশি অর্ডার অ্যাকসেপ্ট করতে পারবেন না।
          </h3>
          <p className="text-xs text-emerald-100 mt-1 font-medium">
            প্রতিটি অর্ডার আন্তরিকতার সাথে ডেলিভারি দিন।
          </p>
        </div>
      </div>

      {/* Running Order Reminder Banner */}
      {activeOrders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 shadow-sm flex items-center justify-between animate-in fade-in duration-300">
          <div className="flex items-center space-x-3">
            <div className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </div>
            <div>
              <h4 className="font-extrabold text-xs text-amber-900">
                আপনার {activeOrders.length}টি অর্ডার রানিং আছে!
              </h4>
              <p className="text-[10px] text-amber-700 font-medium">
                অর্ডারটি দ্রুত এবং সফলভাবে ডেলিভারি করার চেষ্টা করুন।
              </p>
            </div>
          </div>
          {activeTab !== 'ACTIVE' && (
            <button
              onClick={() => setActiveTab('ACTIVE')}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-extrabold shadow-sm transition-all active:scale-95 shrink-0"
            >
              দেখুন
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 bg-gray-100 p-1.5 rounded-2xl">
        <button
          onClick={() => {
            setActiveTab('NEW');
            setNewVisibleCount(PAGE_SIZE);
            setSeenOrderIds((prev) => {
              const updated = new Set(prev);
              newOrderIds.forEach((id) => updated.add(id));
              return updated;
            });
            setNewOrderIds(new Set());
          }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
            activeTab === 'NEW'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          New ({visibleAvailable.length})
          {newOrderIds.size > 0 && activeTab !== 'NEW' && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center animate-bounce shadow-md">
              {newOrderIds.size}
            </span>
          )}
        </button>

        <button
          onClick={() => { setActiveTab('ACTIVE'); setActiveVisibleCount(PAGE_SIZE); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all relative flex items-center justify-center space-x-1.5 ${
            activeTab === 'ACTIVE'
              ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300'
              : activeOrders.length > 0
              ? 'bg-amber-50 text-amber-800 border border-amber-200 animate-pulse'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {activeOrders.length > 0 && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
          )}
          <span>Running ({activeOrders.length})</span>
          {unviewedActiveCount > 0 && activeTab !== 'ACTIVE' && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-extrabold flex items-center justify-center animate-bounce shadow-md">
              {unviewedActiveCount}
            </span>
          )}
        </button>

        <button
          onClick={() => { setActiveTab('COMPLETED'); setCompletedVisibleCount(PAGE_SIZE); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'COMPLETED'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Completed ({completedOrders.length})
        </button>
      </div>

      {/* ── NEW TAB ── */}
      {activeTab === 'NEW' && (
        <div className="space-y-3">
          {/* New orders notification banner — only when there are unseen items */}
          {newOrderIds.size > 0 && (
            <div className="flex items-center space-x-2 p-3 rounded-2xl bg-red-50 border border-red-200 shadow-sm animate-in fade-in duration-300">
              <div className="p-1.5 rounded-xl bg-red-100 text-red-600 shrink-0">
                <Bell className="w-4 h-4 animate-bounce" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-extrabold text-red-800">{newOrderIds.size} new order{newOrderIds.size > 1 ? 's' : ''} just arrived!</p>
                <p className="text-[11px] text-red-600 font-medium">These are new requests not seen before.</p>
              </div>
              <Zap className="w-4 h-4 text-red-400 animate-pulse shrink-0" />
            </div>
          )}

          {visibleAvailable.length === 0 ? (
            <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <h4 className="font-bold text-gray-900 text-sm mb-1">এখন আশেপাশে কোনো নতুন request নেই</h4>
              <p className="text-xs text-gray-500">নতুন রিকুয়েস্ট এলে নোটিফিকেশন পাবেন।</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleAvailable.slice(0, newVisibleCount).map((ord) => (
                <HelperRequestCard
                  key={ord.id}
                  order={ord}
                  onAccept={handleAcceptOrder}
                  onViewDetails={handleViewOrderDetails}
                  activeOrdersCount={activeOrders.length}
                  activeOrderLimit={activeOrderLimit}
                  isNew={newOrderIds.has(ord.id)}
                />
              ))}
              {newVisibleCount < visibleAvailable.length && (
                <button
                  onClick={() => setNewVisibleCount((c) => c + PAGE_SIZE)}
                  className="w-full py-3.5 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 font-bold text-sm hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/40 transition-all flex items-center justify-center space-x-2"
                >
                  <ChevronDown className="w-4 h-4" />
                  <span>Load More ({visibleAvailable.length - newVisibleCount} remaining)</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ACTIVE TAB ── */}
      {activeTab === 'ACTIVE' && (
        <div className="space-y-3">
          {/* Banner for unviewed active orders */}
          {unviewedActiveCount > 0 && (
            <div className="flex items-center space-x-2 p-3 rounded-2xl bg-blue-50 border border-blue-200 shadow-sm animate-in fade-in duration-300">
              <div className="p-1.5 rounded-xl bg-blue-100 text-blue-600 shrink-0">
                <Bell className="w-4 h-4 animate-bounce" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-extrabold text-blue-800">{unviewedActiveCount} order{unviewedActiveCount > 1 ? 's' : ''} not yet viewed</p>
                <p className="text-[11px] text-blue-600 font-medium">Tap a card to see the details and mark as viewed.</p>
              </div>
            </div>
          )}

          {activeOrders.length === 0 ? (
            <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
              <CheckCircle2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <h4 className="font-bold text-gray-900 text-sm">কোনো রানিং অর্ডার নেই</h4>
            </div>
          ) : (
            <div className="space-y-3">
              {activeOrders.slice(0, activeVisibleCount).map((ord) => (
                <OrderCard
                  key={ord.id}
                  order={ord}
                  onClick={() => handleActiveOrderClick(ord.id)}
                  showDuration={true}
                  isNew={!viewedActiveOrderIds.has(ord.id)}
                  helperActiveView={true}
                />
              ))}
              {activeVisibleCount < activeOrders.length && (
                <button
                  onClick={() => setActiveVisibleCount((c) => c + PAGE_SIZE)}
                  className="w-full py-3.5 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 font-bold text-sm hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/40 transition-all flex items-center justify-center space-x-2"
                >
                  <ChevronDown className="w-4 h-4" />
                  <span>Load More ({activeOrders.length - activeVisibleCount} remaining)</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── COMPLETED TAB ── */}
      {activeTab === 'COMPLETED' && (
        <div className="space-y-3">
          {completedOrders.length === 0 ? (
            <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
              <Layers className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <h4 className="font-bold text-gray-900 text-sm">কোনো সম্পন্ন অর্ডার নেই</h4>
            </div>
          ) : (
            <div className="space-y-3">
              {completedOrders.slice(0, completedVisibleCount).map((ord) => (
                <OrderCard
                  key={ord.id}
                  order={ord}
                  onClick={() => setSelectedOrderId(ord.id)}
                  showDuration={true}
                  helperActiveView={true}
                />
              ))}
              {completedVisibleCount < completedOrders.length && (
                <button
                  onClick={() => setCompletedVisibleCount((c) => c + PAGE_SIZE)}
                  className="w-full py-3.5 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 font-bold text-sm hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/40 transition-all flex items-center justify-center space-x-2"
                >
                  <ChevronDown className="w-4 h-4" />
                  <span>Load More ({completedOrders.length - completedVisibleCount} remaining)</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
