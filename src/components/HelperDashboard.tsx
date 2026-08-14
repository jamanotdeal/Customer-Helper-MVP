'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { HelperRequestCard } from './HelperRequestCard';
import { HelperActiveOrderView } from './HelperActiveOrderView';
import { OrderCard } from './OrderCard';
import { useModal } from './CustomModal';
import { Bike, CheckCircle2, Clock, Layers, Bell, Zap, ChevronDown, ChevronLeft, ChevronRight, MapPin, ShoppingBag, Package, FileText, Phone, X } from 'lucide-react';

export const HelperDashboard: React.FC = () => {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [activeTab, setActiveTab] = useState<'NEW' | 'ACTIVE' | 'COMPLETED'>('NEW');
  const [rejectedOrderIds] = useState<Set<string>>(new Set());
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [firstOrderIds, setFirstOrderIds] = useState<Set<string>>(new Set());
  const [activeOrderLimit, setActiveOrderLimit] = useState<number>(
    fallbackStore.pricingSettings.helperActiveOrderLimit ?? 5
  );

  // Track new available orders (not yet seen when they first appeared)
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [seenOrderIds, setSeenOrderIds] = useState<Set<string>>(new Set());
  const seenOrderIdsRef = useRef<Set<string>>(new Set());

  // Alarm state for sound/vibration loop
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);

  useEffect(() => {
    if (newOrderIds.size > 0) {
      setIsAlarmPlaying(true);
    } else {
      setIsAlarmPlaying(false);
    }
  }, [newOrderIds]);

  // Audio Context and Vibration looping
  useEffect(() => {
    if (!isAlarmPlaying) return;

    let active = true;
    let audioCtx: AudioContext | null = null;
    let intervalId: any = null;

    const startAlarm = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
        }
      } catch (e) {
        console.warn('AudioContext init failed:', e);
      }

      const triggerAlert = () => {
        if (!active) return;

        // Vibrate: heavy pulse pattern
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([500, 250, 500, 250, 500]);
        }

        // Sound: loud dual tone beep
        if (audioCtx) {
          try {
            if (audioCtx.state === 'suspended') {
              audioCtx.resume();
            }
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(440, audioCtx.currentTime); // A4

            gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);

            osc1.start();
            osc2.start();
            osc1.stop(audioCtx.currentTime + 0.8);
            osc2.stop(audioCtx.currentTime + 0.8);
          } catch (e) {
            console.warn('Oscillator failed:', e);
          }
        }
      };

      // Initial fire
      triggerAlert();

      // Repeat alert every 1.5 seconds
      intervalId = setInterval(triggerAlert, 1500);
    };

    startAlarm();

    // Auto stop after 60 seconds (to avoid battery drainage if they left their phone)
    const timeoutId = setTimeout(() => {
      setIsAlarmPlaying(false);
    }, 60000);

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [isAlarmPlaying]);

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

        // Compute which orders are each customer's very first
        const earliest: Record<string, string> = {};
        const fid: Record<string, string> = {};
        all.forEach((o) => {
          if (!earliest[o.customerId] || o.createdAt < earliest[o.customerId]) {
            earliest[o.customerId] = o.createdAt;
            fid[o.customerId] = o.id;
          }
        });
        setFirstOrderIds(new Set(Object.values(fid)));
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
                  isFirstOrder={firstOrderIds.has(ord.id)}
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

      {/* Premium New Order Alert Overlay — Swipeable Multi-Order */}
      {isAlarmPlaying && newOrderIds.size > 0 && (
        <NewOrderAlertOverlay
          newOrderIds={newOrderIds}
          onAccept={async (orderId) => {
            setIsAlarmPlaying(false);
            setNewOrderIds(new Set());
            await handleAcceptOrder(orderId);
          }}
          onDismissOne={(orderId) => {
            setNewOrderIds((prev) => {
              const updated = new Set(prev);
              updated.delete(orderId);
              return updated;
            });
            setSeenOrderIds((prev) => {
              const updated = new Set(prev);
              updated.add(orderId);
              return updated;
            });
            if (newOrderIds.size <= 1) setIsAlarmPlaying(false);
          }}
          onDismissAll={() => {
            setIsAlarmPlaying(false);
            setNewOrderIds(new Set());
          }}
        />
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   NewOrderAlertOverlay — swipeable multi-order alert popup
───────────────────────────────────────────────────────────────────────────── */

interface NewOrderAlertOverlayProps {
  newOrderIds: Set<string>;
  onAccept: (orderId: string) => Promise<void>;
  onDismissOne: (orderId: string) => void;
  onDismissAll: () => void;
}

const NewOrderAlertOverlay: React.FC<NewOrderAlertOverlayProps> = ({
  newOrderIds,
  onAccept,
  onDismissOne,
  onDismissAll,
}) => {
  const orderIdList = Array.from(newOrderIds);
  const [currentIdx, setCurrentIdx] = useState(orderIdList.length - 1); // latest first
  const [accepting, setAccepting] = useState(false);

  // Keep currentIdx in bounds when orders are dismissed
  const safeIdx = Math.min(currentIdx, orderIdList.length - 1);
  const orderId = orderIdList[safeIdx];
  const order = orderId ? fallbackStore.orders.get(orderId) : null;

  const goNext = () => setCurrentIdx((i) => Math.min(i + 1, orderIdList.length - 1));
  const goPrev = () => setCurrentIdx((i) => Math.max(i - 1, 0));

  const handleAccept = async () => {
    if (!order || accepting) return;
    setAccepting(true);
    await onAccept(order.id);
    setAccepting(false);
  };

  const handleDismissThis = () => {
    if (!order) return;
    onDismissOne(order.id);
    // After dismiss, shift index if needed
    setCurrentIdx((i) => Math.max(0, Math.min(i, orderIdList.length - 2)));
  };

  if (!order) return null;

  const itemsSummary = order.items?.length
    ? order.items.map((i) => `${i.name}${i.qty && Number(i.qty) > 1 ? ` ×${i.qty}` : ''}`).join(', ')
    : null;

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      className="z-[9999] bg-red-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-300"
    >
      {/* Pulsing background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-red-500/20 animate-ping" />
      </div>

      {/* Header row: dismiss all button */}
      <div className="w-full max-w-sm flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-red-500/30 rounded-full flex items-center justify-center animate-bounce">
            <Bell className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-black text-sm">🚨 নতুন অর্ডার এসেছে!</span>
        </div>
        <button
          onClick={onDismissAll}
          className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-all"
        >
          <X className="w-3.5 h-3.5" />
          <span>মিউট</span>
        </button>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border-2 border-red-400 relative overflow-hidden animate-in zoom-in-95 duration-300 z-10">
        {/* Animated top stripe */}
        <div className="h-1.5 bg-gradient-to-r from-red-500 via-orange-400 to-red-500 animate-pulse" />

        {/* Counter badge */}
        {orderIdList.length > 1 && (
          <div className="absolute top-3 right-3 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-md">
            {safeIdx + 1} / {orderIdList.length}
          </div>
        )}

        <div className="p-5 space-y-4">
          {/* Order ID & Fee row */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
              Order #{order.id.slice(-6).toUpperCase()}
            </span>
            <div className="flex items-center space-x-2">
              {order.productCost && order.productCost > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-extrabold">
                  পণ্য ৳{order.productCost}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black shadow-sm">
                Fee ৳{order.deliveryFee}
              </span>
            </div>
          </div>

          {/* Service type */}
          <div className="flex items-start space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 shrink-0 mt-0.5">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">সার্ভিস / অর্ডার</p>
              <p className="font-black text-gray-900 text-sm leading-snug">
                {order.service || order.title || 'Service Request'}
              </p>
            </div>
          </div>

          {/* Items */}
          {itemsSummary && (
            <div className="flex items-start space-x-2.5">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600 shrink-0 mt-0.5">
                <Package className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">আইটেমসমূহ</p>
                <p className="text-sm text-gray-800 font-semibold leading-snug line-clamp-2">{itemsSummary}</p>
              </div>
            </div>
          )}

          {/* Pickup location */}
          {order.pickupLocation?.address && (
            <div className="flex items-start space-x-2.5">
              <div className="p-2 rounded-xl bg-orange-50 text-orange-500 shrink-0 mt-0.5">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">পিকআপ লোকেশন</p>
                <p className="text-sm text-gray-800 font-semibold leading-snug line-clamp-2">
                  {order.pickupLocation.address}
                </p>
              </div>
            </div>
          )}

          {/* Delivery location */}
          <div className="flex items-start space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0 mt-0.5">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">ডেলিভারি লোকেশন</p>
              <p className="text-sm text-gray-800 font-semibold leading-snug line-clamp-2">
                {order.deliveryLocation.address}
              </p>
            </div>
          </div>

          {/* Additional note */}
          {order.additionalNote && (
            <div className="flex items-start space-x-2.5">
              <div className="p-2 rounded-xl bg-gray-50 text-gray-500 shrink-0 mt-0.5">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">নোট</p>
                <p className="text-sm text-gray-700 font-medium leading-snug line-clamp-3">{order.additionalNote}</p>
              </div>
            </div>
          )}

          {/* Customer phone */}
          {order.customerPhone && (
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-teal-50 text-teal-600 shrink-0">
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">কাস্টমার</p>
                <p className="text-sm text-gray-800 font-semibold">{order.customerName}</p>
              </div>
            </div>
          )}
        </div>

        {/* Slide navigation + dot indicators (only if multiple) */}
        {orderIdList.length > 1 && (
          <div className="px-5 pb-2">
            <div className="flex items-center justify-between">
              <button
                onClick={goPrev}
                disabled={safeIdx === 0}
                className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-4 h-4 text-gray-700" />
              </button>
              <div className="flex items-center space-x-1.5">
                {orderIdList.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentIdx(i)}
                    className={`rounded-full transition-all ${
                      i === safeIdx
                        ? 'w-5 h-2 bg-red-500'
                        : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={goNext}
                disabled={safeIdx === orderIdList.length - 1}
                className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-4 h-4 text-gray-700" />
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-400 font-medium mt-1">
              স্লাইড করে অন্য অর্ডার দেখুন
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-5 pb-5 pt-1 space-y-2">
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl font-black text-sm shadow-lg active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {accepting ? 'গ্রহণ করা হচ্ছে…' : '✅ Accept করুন (অর্ডার নিন)'}
          </button>
          <button
            onClick={handleDismissThis}
            className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-2xl font-bold text-xs transition-all"
          >
            ❌ এই অর্ডার বাতিল করুন
          </button>
        </div>
      </div>

      {/* Hint text */}
      <p className="mt-4 text-white/60 text-[11px] font-medium text-center relative z-10">
        {orderIdList.length > 1
          ? `${orderIdList.length}টি নতুন অর্ডার পেন্ডিং আছে — স্লাইড করে দেখুন`
          : 'নতুন রিকুয়েস্ট আপনার জন্য অপেক্ষা করছে!'}
      </p>
    </div>
  );
};
