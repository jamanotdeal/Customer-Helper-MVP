'use client';

import React, { useState, useEffect } from 'react';
import { fallbackStore } from '@/lib/firebase';
import { OrderItem } from '@/types';
import {
  Bell,
  X,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Package,
  MapPin,
  FileText,
  Phone,
  Eye,
  CheckCircle2,
  VolumeX,
  Clock,
  Store,
  Sparkles,
} from 'lucide-react';
import { isOrderFromStore } from '@/utils/orderUtils';

export interface NewOrderAlertOverlayProps {
  newOrderIds: Set<string>;
  onAccept: (orderId: string) => Promise<void>;
  onView: (orderId: string) => void;
  onDismissOne: (orderId: string) => void;
  onDismissAll: () => void;
  autoDismissSeconds?: number;
}

export const NewOrderAlertOverlay: React.FC<NewOrderAlertOverlayProps> = ({
  newOrderIds,
  onAccept,
  onView,
  onDismissOne,
  onDismissAll,
  autoDismissSeconds = 20, // Guarantee at least 10s (default 20s)
}) => {
  const orderIdList = Array.from(newOrderIds);
  const [currentIdx, setCurrentIdx] = useState(orderIdList.length - 1); // latest first
  const [accepting, setAccepting] = useState(false);
  const [countdown, setCountdown] = useState(autoDismissSeconds);

  // Countdown timer: keeps modal visible for at least 10s (default 20s) unless interacted with
  useEffect(() => {
    setCountdown(autoDismissSeconds);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDismissAll();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoDismissSeconds, onDismissAll]);

  // Keep currentIdx in bounds when orders change or get dismissed
  const safeIdx = Math.min(currentIdx, Math.max(0, orderIdList.length - 1));
  const orderId = orderIdList[safeIdx];
  const order = orderId ? fallbackStore.orders.get(orderId) : null;

  const goNext = () => setCurrentIdx((i) => Math.min(i + 1, orderIdList.length - 1));
  const goPrev = () => setCurrentIdx((i) => Math.max(i - 1, 0));

  const handleAcceptClick = async () => {
    if (!order || accepting) return;
    setAccepting(true);
    await onAccept(order.id);
    setAccepting(false);
  };

  const handleViewClick = () => {
    if (!order) return;
    onView(order.id);
  };

  const handleDismissThis = () => {
    if (!order) return;
    onDismissOne(order.id);
    setCurrentIdx((i) => Math.max(0, Math.min(i, orderIdList.length - 2)));
  };

  const isStillValidPending = Boolean(order && order.status === 'PENDING' && (!order.helperId || order.helperId.trim() === ''));

  useEffect(() => {
    if (order && !isStillValidPending) {
      onDismissOne(order.id);
    }
  }, [order, isStillValidPending, onDismissOne]);

  if (!order || !isStillValidPending) return null;

  const itemsSummary = order.items?.length
    ? order.items
      .map((i) => {
        const qNum = typeof i.quantity === 'number' && i.quantity > 0
          ? i.quantity
          : (i.qty && !isNaN(Number(i.qty)) ? Number(i.qty) : undefined);
        const qStr = qNum && qNum > 1
          ? ` ×${qNum}`
          : (i.qty && isNaN(Number(i.qty)) && i.qty.trim() !== '১' && i.qty.trim() !== '১টি' && i.qty.trim() !== '1' ? ` (${i.qty})` : '');
        return `${i.name}${qStr}`;
      })
      .join(', ')
      .replace(/\r?\n/g, ', ')
    : null;

  // Categorise items: store-connected vs custom/closed-store
  const itemsWithStore = (order.items || []).filter((i: OrderItem) => i.storeId && !i.isCustom);
  const customOrClosedItems = (order.items || []).filter((i: OrderItem) => i.isCustom || !i.storeId);
  const hasSpecialItems = customOrClosedItems.length > 0;

  const progressPercent = Math.max(0, Math.min(100, (countdown / autoDismissSeconds) * 100));

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      className="z-[9999] bg-red-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-300"
    >
      {/* Pulsing background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-red-500/20 animate-ping" />
      </div>

      {/* Header Row: Title, Countdown Timer, Mute Button */}
      <div className="w-full max-w-sm flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-red-500/30 rounded-full flex items-center justify-center animate-bounce">
            <Bell className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-white font-black text-sm block">🚨 নতুন অর্ডার এসেছে!</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Timer pill */}
          <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-500/30 text-amber-200 border border-amber-400/40 text-[11px] font-black">
            <Clock className="w-3 h-3 text-amber-300 animate-spin" style={{ animationDuration: '4s' }} />
            <span>{countdown}s</span>
          </div>

          {/* Mute button */}
          <button
            onClick={onDismissAll}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all shadow-sm active:scale-95"
            title="মিউট করুন এবং বন্ধ করুন"
          >
            <VolumeX className="w-3.5 h-3.5" />
            <span>মিউট</span>
          </button>
        </div>
      </div>

      <div className="relative w-full max-w-sm flex items-center justify-center z-10">
        {/* Left Navigation Arrow */}
        {orderIdList.length > 1 && (
          <button
            onClick={goPrev}
            disabled={safeIdx === 0}
            className="absolute -left-6 md:-left-16 z-20 w-11 h-11 rounded-full bg-white hover:bg-red-50 text-red-600 shadow-2xl border border-red-200 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-all hover:scale-110 active:scale-95 shrink-0"
            aria-label="Previous order"
          >
            <ChevronLeft className="w-7 h-7 stroke-[3px]" />
          </button>
        )}

        {/* Card */}
        <div className="w-full bg-white rounded-3xl shadow-2xl border-2 border-red-400 relative overflow-hidden animate-in zoom-in-95 duration-300">
          {/* Animated top progress countdown bar */}
          <div className="h-1.5 w-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 transition-all duration-1000 ease-linear"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Counter badge if multiple orders */}
          {orderIdList.length > 1 && (
            <div className="absolute top-3 right-3 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-md">
              {safeIdx + 1} / {orderIdList.length}
            </div>
          )}

          <div className="p-5 space-y-4">
            {/* Order ID & Fee row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className="bg-slate-900 text-white font-black font-mono text-[10px] px-2.5 py-0.5 rounded-md shadow-xs">
                  #{order.id}
                </span>
                {isOrderFromStore(order) && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-black flex items-center gap-1 shadow-sm">
                    <Store className="w-3 h-3" />
                    <span>Store</span>
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {order.productCost && order.productCost > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-extrabold">
                    পণ্য ৳{order.productCost}
                  </span>
                ) : null}
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-black shadow-sm ${
                    order.isFreeDelivery
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {order.isFreeDelivery ? '🎁 Free Delivery (৳0)' : `Fee ৳${order.deliveryFee}`}
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

            {/* Items — rich card style (matching CartSummaryDrawer) */}
            {order.items && order.items.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">আইটেমসমূহ</p>

                {/* Store-grouped items */}
                {itemsWithStore.length > 0 && (() => {
                  const byStore: Record<string, OrderItem[]> = {};
                  itemsWithStore.forEach((it: OrderItem) => {
                    const key = it.storeId!;
                    if (!byStore[key]) byStore[key] = [];
                    byStore[key].push(it);
                  });
                  return Object.entries(byStore).map(([storeId, storeItems]) => {
                    const sn = storeItems[0].storeName || storeId;
                    const shopData = fallbackStore.shops.get(storeId);
                    const storeAddress = shopData?.location?.address;
                    return (
                      <div key={storeId} className="rounded-xl bg-purple-50 border border-purple-200 px-2 py-1.5 space-y-1">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <Store className="w-3 h-3 text-purple-600" />
                            <span className="text-[10px] font-black text-purple-800 uppercase tracking-wide">{sn}</span>
                          </div>
                          {storeAddress && (
                            <div className="flex items-start gap-1 pl-0.5">
                              <MapPin className="w-2.5 h-2.5 text-purple-400 shrink-0 mt-0.5" />
                              <span className="text-[9px] text-purple-600 font-medium leading-tight line-clamp-1">{storeAddress}</span>
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          {storeItems.map((it: OrderItem) => (
                            <div key={it.id} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-purple-100">
                              {/* Item image / icon */}
                              <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 shrink-0 overflow-hidden flex items-center justify-center">
                                {it.photoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={it.photoUrl} alt={it.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                    <Package className="w-3.5 h-3.5" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-black text-gray-900 truncate">{it.name}</p>
                                <p className="text-[10px] text-gray-500 flex items-center gap-1.5">
                                  {it.unit && <span>{it.unit}</span>}
                                  {(() => {
                                    const q = typeof it.quantity === 'number' && it.quantity > 0
                                      ? it.quantity
                                      : (it.qty && !isNaN(Number(it.qty)) ? Number(it.qty) : 1);
                                    const qStr = q > 1 ? `×${q}` : (it.qty && isNaN(Number(it.qty)) && it.qty.trim() !== '১' && it.qty.trim() !== '১টি' ? `(${it.qty})` : '');
                                    return qStr ? <span className="font-bold">{qStr}</span> : null;
                                  })()}
                                  {it.price !== undefined && (() => {
                                    const q = typeof it.quantity === 'number' && it.quantity > 0
                                      ? it.quantity
                                      : (it.qty && !isNaN(Number(it.qty)) ? Number(it.qty) : 1);
                                    const totalP = it.price * q;
                                    return (
                                      <span className="font-extrabold text-emerald-700">
                                        ৳{totalP}{q > 1 ? ` (৳${it.price}×${q})` : ''}
                                      </span>
                                    );
                                  })()}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}

                {/* Custom / closed-store items */}
                {customOrClosedItems.length > 0 && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-2 py-1.5 space-y-1">
                    <div className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      <span className="text-[10px] font-black text-amber-800 uppercase tracking-wide">Custom / Any Store</span>
                    </div>
                    <div className="space-y-1">
                      {customOrClosedItems.map((it: OrderItem) => (
                        <div key={it.id} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-amber-100">
                          {/* Item image / icon */}
                          <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 shrink-0 overflow-hidden flex items-center justify-center">
                            {it.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.photoUrl} alt={it.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-amber-50 flex items-center justify-center text-amber-600">
                                <Sparkles className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black text-gray-900 truncate">{it.name}</p>
                            <p className="text-[10px] text-gray-500 flex items-center gap-1.5">
                              {it.unit && <span>{it.unit}</span>}
                              {it.qty && <span className="font-bold">{it.qty}</span>}
                              {it.buyFrom && (
                                <span className="text-amber-700 font-semibold">({it.buyFrom})</span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fallback plain summary if no structured store data */}
                {itemsWithStore.length === 0 && customOrClosedItems.length === 0 && itemsSummary && (
                  <div className="flex items-start space-x-2.5">
                    <div className="p-2 rounded-xl bg-amber-50 text-amber-600 shrink-0 mt-0.5">
                      <Package className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 font-semibold leading-snug line-clamp-2">{itemsSummary}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fallback: no structured items but has summary text */}
            {(!order.items || order.items.length === 0) && itemsSummary && (
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



            {/* Delivery location */}
            <div className="flex items-start space-x-2.5">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0 mt-0.5">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">ডেলিভারি লোকেশন</p>
                <p className="text-sm text-gray-800 font-semibold leading-snug line-clamp-2">
                  {order.deliveryLocation?.address || 'N/A'}
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

            {/* Customer info */}
            {order.customerPhone && (
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-600 shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
                    {isOrderFromStore(order) ? 'স্টোর / কাস্টমার' : 'কাস্টমার'}
                  </p>
                  <p className="text-sm text-gray-800 font-semibold flex items-center gap-1.5">
                    <span>{order.customerName}</span>
                    {isOrderFromStore(order) && (
                      <span className="px-1.5 py-0.2 rounded bg-purple-600 text-white text-[9px] font-black tracking-wide">
                        STORE
                      </span>
                    )}
                  </p>
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
                        i === safeIdx ? 'w-5 h-2 bg-red-500' : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
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

          {/* Action buttons: Accept, View Details, Dismiss */}
          <div className="px-5 pb-5 pt-1 space-y-2">
            <button
              onClick={handleAcceptClick}
              disabled={accepting}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-2xl font-black text-sm shadow-lg active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center space-x-2"
            >
              {accepting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>গ্রহণ করা হচ্ছে…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>✅ Accept করুন (অর্ডার নিন)</span>
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleViewClick}
                className="py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-2xl font-extrabold text-xs transition-all flex items-center justify-center space-x-1.5 active:scale-95"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>বিস্তারিত দেখুন</span>
              </button>

              <button
                onClick={handleDismissThis}
                className="py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-2xl font-extrabold text-xs transition-all flex items-center justify-center space-x-1.5 active:scale-95"
              >
                <X className="w-3.5 h-3.5" />
                <span>সরিয়ে দিন</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Navigation Arrow */}
        {orderIdList.length > 1 && (
          <button
            onClick={goNext}
            disabled={safeIdx === orderIdList.length - 1}
            className="absolute -right-6 md:-right-16 z-20 w-11 h-11 rounded-full bg-white hover:bg-red-50 text-red-600 shadow-2xl border border-red-200 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-all hover:scale-110 active:scale-95 shrink-0"
            aria-label="Next order"
          >
            <ChevronRight className="w-7 h-7 stroke-[3px]" />
          </button>
        )}
      </div>

      {/* Footer hint */}
      <p className="mt-4 text-white/70 text-[11px] font-medium text-center relative z-10">
        {orderIdList.length > 1
          ? `${orderIdList.length}টি নতুন রিকোয়েস্ট আছে — স্লাইড বা মিউট করতে পারেন`
          : 'মিউট বা সময় শেষ হলে রিকোয়েস্টটি লিস্টে থাকবে'}
      </p>
    </div>
  );
};
