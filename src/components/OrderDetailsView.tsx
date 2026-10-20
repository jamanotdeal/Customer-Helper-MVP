'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Order, OrderItem, OrderStatus, OrderEditChange, OrderEditHistoryItem, ShopOrder, Shop } from '@/types';
import { fallbackStore, db } from '@/lib/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { onSnapshot, getDocs } from '@/lib/firestoreMetered';
import { useAuth } from '@/context/AuthContext';
import {
  ArrowLeft, CheckCircle2, Clock, MapPin, Phone, XCircle,
  UserCheck, MessageSquare, Package, Truck, Navigation,
  AlertTriangle, Check, ChevronRight, Edit2, X, ChevronDown,
  Star, Sparkles, FileText, ShieldCheck, DollarSign, Trash2, Plus,
  ShoppingBag, Store, AlertCircle,
} from 'lucide-react';
import { DEFAULT_SERVICES, getServiceDescriptionHint, calculateDistanceKm, calculateEstimatedFee, calculateCustomStoreFee } from '@/lib/pricing';
import { ServiceIcon } from './ServiceIcon';
import { getStatusBadgeInfo } from './OrderCard';
import { formatPlacedDateTime } from '@/lib/timeUtils';
import { OrderFeedbackModal } from './OrderFeedbackModal';
import { EditOrderDetailsModal } from './EditOrderDetailsModal';
import { CustomerOrderItemModal } from './CustomerOrderItemModal';
import { formatItemQuantityUnit, calculateOrderProductCost, getItemUnitPrice } from '@/lib/itemUtils';
import { formatScheduledTime, removeScheduledOrder } from '@/utils/scheduledOrders';

interface OrderDetailsViewProps {
  orderId: string;
  onBack: () => void;
}

export const OrderDetailsView: React.FC<OrderDetailsViewProps> = ({ orderId, onBack }) => {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(() => {
    const cached = fallbackStore.orders.get(orderId);
    return cached ? fallbackStore.resolveOrderLocations({ ...cached }) : null;
  });
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(() => !fallbackStore.orders.get(orderId));
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  // Whether to show the "Admin Accepted" reassurance banner (customer-only, PENDING + no helper + N minutes passed)
  const [showAdminAccepted, setShowAdminAccepted] = useState(false);
  const calculationSummaryRef = React.useRef<HTMLDivElement>(null);

  const scrollToCalculationSummary = () => {
    calculationSummaryRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);

  // Edit history accordion (collapsed by default)
  const [showEditHistory, setShowEditHistory] = useState(false);

  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  // Item details modal state (customer can click an item to see cost, store name & phone numbers)
  const [selectedItemForModal, setSelectedItemForModal] = useState<OrderItem | null>(null);



  useEffect(() => {
    let isCancelled = false;
    const syncOrder = () => {
      const current = fallbackStore.orders.get(orderId);
      if (current) {
        setOrder(fallbackStore.resolveOrderLocations({ ...current }));
        setIsInitialLoading(false);
      }
    };
    syncOrder();
    const unsub = fallbackStore.subscribe(syncOrder);

    // If not in cache, actively trigger fallback getOrder
    if (!fallbackStore.orders.get(orderId)) {
      fallbackStore.getOrder(orderId).then((ord) => {
        if (!isCancelled) {
          if (ord) setOrder(fallbackStore.resolveOrderLocations({ ...ord }));
          setIsInitialLoading(false);
        }
      }).catch(() => {
        if (!isCancelled) setIsInitialLoading(false);
      });
    }

    // Direct realtime document listener for immediate status update (e.g. Delivered by Helper/Admin)
    let unsubDoc: (() => void) | undefined;
    if (orderId && db) {
      try {
        unsubDoc = onSnapshot(
          doc(db, 'orders', orderId),
          (docSnap) => {
            if (isCancelled) return;
            setIsInitialLoading(false);
            if (docSnap.exists()) {
              const updated = docSnap.data() as Order;
              if (updated && updated.id) {
                const resolved = fallbackStore.resolveOrderLocations(updated);
                fallbackStore.orders.set(orderId, resolved);
                setOrder({ ...resolved });
              }
            } else {
              setOrder(null);
            }
          },
          (err) => {
            console.warn('[OrderDetailsView] live order doc listener note:', err);
            if (!isCancelled) setIsInitialLoading(false);
          }
        );
      } catch (e) {
        console.warn('[OrderDetailsView] live order doc listener setup error:', e);
        if (!isCancelled) setIsInitialLoading(false);
      }
    }

    return () => {
      isCancelled = true;
      unsub();
      if (unsubDoc) unsubDoc();
    };
  }, [orderId]);

  const [shopOrders, setShopOrders] = useState<ShopOrder[]>([]);

  useEffect(() => {
    setShopOrders(fallbackStore.getShopOrdersForOrder(orderId));
    const sync = () => setShopOrders(fallbackStore.getShopOrdersForOrder(orderId));
    const unsubStore = fallbackStore.subscribe(sync);

    // Preload store products and shops if not yet cached
    if (fallbackStore.storeProducts.size === 0) {
      fallbackStore.loadStoreProducts();
    }
    if (fallbackStore.shops.size === 0 && db) {
      getDocs(collection(db, 'shops'))
        .then((snap) => {
          snap.forEach((docSnap) => {
            fallbackStore.shops.set(docSnap.id, docSnap.data() as Shop);
          });
          setShopOrders(fallbackStore.getShopOrdersForOrder(orderId));
        })
        .catch((e) => console.warn('[OrderDetailsView] load shops note:', e));
    }

    let unsubFirestore: (() => void) | undefined;
    if (orderId && db) {
      try {
        const q = query(collection(db, 'shopOrders'), where('parentOrderId', '==', orderId));
        unsubFirestore = onSnapshot(
          q,
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                fallbackStore.shopOrders.delete(change.doc.id);
              } else {
                const so = change.doc.data() as ShopOrder;
                fallbackStore.shopOrders.set(so.id, so);
              }
            });
            setShopOrders(fallbackStore.getShopOrdersForOrder(orderId));
          },
          (err) => console.warn('[Firestore] ShopOrders realtime sync note:', err)
        );
      } catch (e) {
        console.warn('[Firestore] ShopOrders listener setup error:', e);
      }
      fallbackStore.fetchShopOrdersForOrder(orderId, order?.helperId, order?.helperName);
    }

    return () => {
      unsubStore();
      if (unsubFirestore) unsubFirestore();
    };
  }, [orderId, order?.helperId, order?.helperName]);

  const distanceKm = (order?.pickupLocation?.lat && order?.pickupLocation?.lng && order?.deliveryLocation?.lat && order?.deliveryLocation?.lng)
    ? parseFloat(calculateDistanceKm(order.pickupLocation.lat, order.pickupLocation.lng, order.deliveryLocation.lat, order.deliveryLocation.lng).toFixed(2))
    : 0;

  const validShopOrders = shopOrders.filter(so => (!orderId || so.parentOrderId === orderId) && so.status !== 'CANCELED' && (so.status as string) !== 'CANCELLED');
  const effectiveProductCost = order ? calculateOrderProductCost(order, validShopOrders) : 0;
  const customStorePricing = calculateCustomStoreFee(order, validShopOrders, fallbackStore.pricingSettings);
  const effectiveCustomStoreFee = customStorePricing.totalFee;
  const unpricedItems = useMemo(() => {
    if (!order?.items) return [];
    return order.items.filter((it) => {
      const p = getItemUnitPrice(it, validShopOrders, orderId);
      return p === undefined || p <= 0;
    });
  }, [order?.items, validShopOrders, orderId]);

  const estdPricing = order ? calculateEstimatedFee({
    distanceKm: Math.ceil(distanceKm),
    weightKg: Math.ceil(order.weightKg || 0),
    isReturnRequested: !!order.needReturnItems || !!order.needDeliveryBack,
    productPrice: effectiveProductCost,
  }, fallbackStore.pricingSettings) : null;

  // Auto-sync productCost in the database if item prices or quantities updated
  useEffect(() => {
    if (!order?.id || effectiveProductCost <= 0) return;
    const hasOnlyOwnShopOrders = validShopOrders.every((so) => so.parentOrderId === order.id);
    if (!hasOnlyOwnShopOrders) return;
    if (order.productCost !== effectiveProductCost) {
      fallbackStore.updateOrder(order.id, (o) => ({
        ...o,
        productCost: effectiveProductCost,
      }));
    }
  }, [order?.id, order?.productCost, effectiveProductCost, validShopOrders]);

  // Timer: check every 30s if the customer should see "Admin Accepted" banner.
  // Also re-checked the moment the order changes: a helper accepting it used to
  // leave "Admin finding helper for you..." up until the next tick.
  useEffect(() => {
    const checkAdminAccepted = () => {
      const current = fallbackStore.orders.get(orderId);
      if (!current || current.helperId || current.status !== 'PENDING') {
        setShowAdminAccepted(false);
        return;
      }
      const delayMins = fallbackStore.pricingSettings.adminAcceptedDelayMinutes ?? 5;
      if (delayMins === 0) { setShowAdminAccepted(false); return; }
      const minutesPending = (Date.now() - new Date(current.createdAt).getTime()) / 60000;
      setShowAdminAccepted(minutesPending >= delayMins);
    };
    checkAdminAccepted(); // run immediately
    const interval = setInterval(checkAdminAccepted, 30000);
    return () => clearInterval(interval);
  }, [orderId, order?.status, order?.helperId]);

  // If user is not logged in or logs out, automatically close all modals and exit details view
  useEffect(() => {
    if (!user) {
      setShowEditModal(false);
      setShowCancelModal(false);
      setShowFeedbackModal(false);
      onBack();
    }
  }, [user, onBack]);

  if (!user) {
    return null;
  }

  if (isInitialLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 p-8 text-center bg-white rounded-3xl border border-gray-100 shadow-sm my-4">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <h3 className="font-extrabold text-gray-700 text-base">অর্ডারের বিবরণ লোড করা হচ্ছে...</h3>
        <p className="text-xs text-gray-400">অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করুন</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Order not found.</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl">Back</button>
      </div>
    );
  }

  const isOwnerCustomer = Boolean(user && order && user.uid === order.customerId);
  const isAdminUser = Boolean(user && (user.isAdmin || user.role === 'admin' || user.email?.toLowerCase().includes('admin') || user.email === 'ajnasim72@gmail.com' || user.email === 'contact.jamanot@gmail.com'));
  const isAssignedHelper = Boolean(user && order && order.helperId && user.uid === order.helperId);
  const isPendingHelper = Boolean(user && order && !order.helperId && (user.isHelper || user.role === 'helper'));

  // If logged in as customer/helper but not owner/assigned/admin, disallow view
  if (!isOwnerCustomer && !isAdminUser && !isAssignedHelper && !isPendingHelper) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors py-2 font-bold text-sm"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>ফিরে যান (Back)</span>
        </button>

        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 p-8 text-center bg-white rounded-3xl border border-amber-100 shadow-sm my-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-inner">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <h3 className="font-extrabold text-gray-900 text-lg">অ্যাক্সেস অনুমোদিত নয় (Access Denied)</h3>
          <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
            আপনি এই অর্ডারের বিবরণ দেখার জন্য অনুমোদিত নন।
          </p>
          <button
            onClick={onBack}
            className="mt-4 px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold shadow-md transition-all active:scale-95"
          >
            হোমে ফিরে যান
          </button>
        </div>
      </div>
    );
  }

  const isCanceled =
    (order.status as string) === 'CANCELED' ||
    (order.status as string) === 'CANCELLED' ||
    order.cancellationRequest?.status === 'APPROVED';

  const badge = isCanceled
    ? { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle }
    : getStatusBadgeInfo(order.status);
  const BadgeIcon = badge.icon;

  // Helper contact info
  const helperInfo = order.helperId ? fallbackStore.users.get(order.helperId) : null;
  const helperAppEntry = order.helperId
    ? Array.from(fallbackStore.helperApplications.values()).find((a) => a.userId === order.helperId && a.status === 'APPROVED')
    : null;
  const helperName = helperInfo?.displayName || helperAppEntry?.legalName || order.helperName || 'Your Helper';
  const helperPhone = helperInfo?.alternativePhone || helperInfo?.phoneNumber || helperAppEntry?.whatsapp || order.helperPhone || null;

  const getWhatsAppUrl = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formatted = cleanPhone.startsWith('0') ? `880${cleanPhone.slice(1)}` : cleanPhone;
    return `https://wa.me/${formatted}`;
  };

  const isHelperAssigned = Boolean(order.helperId || order.helperName);

  // Simplified progress steps
  const steps: { status: OrderStatus; label: string; icon: React.ElementType; desc: string }[] = [
    {
      status: 'PENDING',
      label: order.status === 'SCHEDULED' ? 'Scheduled' : 'Order Placed',
      icon: order.status === 'SCHEDULED' ? Clock : Check,
      desc: order.status === 'SCHEDULED'
        ? `Will activate at ${formatScheduledTime(order.scheduledAt)}`
        : 'Order Placed Successfully',
    },
    {
      status: 'ACCEPTED',
      label: showAdminAccepted ? 'Admin Accepted' : 'Helper Assigned',
      icon: UserCheck,
      desc: showAdminAccepted ? 'Admin finding helper for you...' : 'Helper is heading to pickup'
    },
    { status: 'PURCHASED_EXECUTED', label: 'Processing', icon: Package, desc: 'Items collected from shop' },
    { status: 'ON_THE_WAY', label: 'On The Way', icon: Truck, desc: 'Coming to your location' },
    { status: 'ARRIVED', label: 'Arrived', icon: Navigation, desc: 'Helper is at your door' },
    { status: 'DELIVERED', label: 'Delivered!', icon: CheckCircle2, desc: 'All done. Enjoy!' },
  ];

  const getStepState = (stepStatus: OrderStatus) => {
    if (isCanceled) return 'CANCELED';

    // When admin accepted (but order status is still PENDING without helper assigned), step ACCEPTED is active current step
    if (showAdminAccepted && order.status === 'PENDING') {
      if (stepStatus === 'PENDING') return 'COMPLETED';
      if (stepStatus === 'ACCEPTED') return 'CURRENT';
      return 'UPCOMING';
    }

    const orderIndex = steps.findIndex((s) => s.status === order.status);
    const stepIndex = steps.findIndex((s) => s.status === stepStatus);
    if (stepIndex < orderIndex) return 'COMPLETED';
    if (stepIndex === orderIndex) return 'CURRENT';
    return 'UPCOMING';
  };

  const handleCancelOrder = () => {
    if (!canCancel) return;
    setCancelReason('');
    setCancelError('');
    setShowCancelModal(true);
  };

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      setCancelError('অর্ডারটি বাতিল করার কারণ অনুগ্রহ করে উল্লেখ করুন।');
      return;
    }
    const reasonText = cancelReason.trim();
    const cancelHistoryEntry = {
      id: `sh-${Date.now()}`,
      status: 'CANCELED' as const,
      timestamp: new Date().toISOString(),
      actor: user?.role === 'store' || user?.isStoreApproved ? 'Store' : 'Customer',
      note: `Cancelled. Reason: ${reasonText}`,
    };

    // Optimistically update view state immediately
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            status: 'CANCELED',
            cancelledAt: new Date().toISOString(),
            cancellationRequest: {
              requestedBy: 'customer',
              reason: reasonText,
              status: 'APPROVED',
              createdAt: new Date().toISOString(),
            },
            statusHistory: [...(prev.statusHistory || []), cancelHistoryEntry],
          }
        : null
    );

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      status: 'CANCELED',
      cancelledAt: new Date().toISOString(),
      cancellationRequest: {
        requestedBy: 'customer',
        reason: reasonText,
        status: 'APPROVED',
        createdAt: new Date().toISOString(),
      },
      statusHistory: [
        ...(o.statusHistory || []),
        cancelHistoryEntry,
      ],
    }));
    removeScheduledOrder(order.id);
    setShowCancelModal(false);
  };

  // Open edit modal
  const openEditModal = () => {
    if (!canEdit) return;
    if (
      order.status === 'ON_THE_WAY' ||
      order.status === 'ARRIVED' ||
      order.status === 'DELIVERED' ||
      (order.status as string) === 'CANCELED'
    )
      return;
    setShowEditModal(true);
  };

  const canCancel = Boolean(
    user &&
    (order.status === 'PENDING' || order.status === 'ACCEPTED' || order.status === 'SCHEDULED') &&
    user.uid === order.customerId &&
    !isCanceled
  );
  const canEdit = Boolean(
    user &&
    (isOwnerCustomer || isAdminUser) &&
    order.status !== 'ON_THE_WAY' &&
    order.status !== 'ARRIVED' &&
    order.status !== 'DELIVERED' &&
    !isCanceled
  );
  const isDelivered = order.status === 'DELIVERED';
  const isArrivedOrDelivered = order.status === 'ARRIVED' || order.status === 'DELIVERED';

  const effectiveDeliveryFee = order.isFreeDelivery ? 0 : Math.max(order.deliveryFee || 0, estdPricing?.minFee || 0);
  const effectiveProcessingFee = ((fallbackStore.pricingSettings.feeCalculatorProcessingFee ?? 0) > 0 && estdPricing) ? estdPricing.processingFee : (order?.processingFee || 0);
  const effectiveReturnFee = (estdPricing && estdPricing.returnFee > 0) ? estdPricing.returnFee : 0;
  const effectiveDuePayment = order.appliedDuePayment?.amount || 0;
  const grandTotalPayable = effectiveProductCost + effectiveDeliveryFee + effectiveProcessingFee + effectiveReturnFee + effectiveDuePayment + effectiveCustomStoreFee;

  return (
    <div className="w-full bg-gray-50 min-h-screen pb-24 animate-in fade-in duration-200">

      {/* Sticky Top Bar */}
      <div className="sticky top-14 z-20 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-xs">
        <button
          onClick={onBack}
          className="p-2 rounded-2xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex items-center space-x-1"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-xs font-bold">Back</span>
        </button>
        <span className="font-extrabold text-sm text-gray-800">Order-#{order.id}</span>
        {canEdit ? (
          <button
            onClick={openEditModal}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit Order</span>
          </button>
        ) : (
          <div className="w-12" />
        )}
      </div>

      <div className="w-full mx-auto px-4 pt-5 space-y-4">

        {/* ── HERO STATUS CARD ── */}
        <div className={`rounded-3xl p-5 text-white shadow-lg ${isDelivered
            ? 'bg-gradient-to-br from-emerald-600 to-teal-700'
            : isCanceled
              ? 'bg-gradient-to-br from-red-600 to-red-700'
              : 'bg-gradient-to-br from-gray-900 to-gray-800'
          }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-white/20 shrink-0 flex items-center justify-center shadow-xs">
                <ServiceIcon service={order.service} className="w-6 h-6 text-white" />
              </span>
              <h2 className="text-lg font-black">{order.service || order.title || 'Your Order'}</h2>
            </div>
            {(order.status !== 'PENDING' || isCanceled) && (
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center space-x-1 ${isDelivered ? 'bg-white/20 text-white' : isCanceled ? 'bg-red-300/30 text-red-100' : badge.color
                }`}>
                <BadgeIcon className="w-2.5 h-2.5" />
                <span>{badge.label}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-white/70 mb-3">
            <span className="flex items-center space-x-1">
              <Clock className="w-3 h-3 text-white/60" />
              <span>Placed: {formatPlacedDateTime(order.createdAt)}</span>
            </span>
          </div>

          {/* Quick cost summary */}
          {(effectiveProductCost > 0 || order.deliveryFee > 0 || order.isFreeDelivery) && (
            <div className="mt-4 flex items-center space-x-3">
              {effectiveProductCost > 0 && (
                <div
                  onClick={scrollToCalculationSummary}
                  className="bg-white/10 rounded-2xl px-3 py-2 text-center cursor-pointer hover:bg-white/20 transition-all"
                >
                  <p className="text-[10px] text-white/60 font-semibold">Product</p>
                  <p className="text-sm font-black">৳{effectiveProductCost}</p>
                </div>
              )}
              {order.isFreeDelivery ? (
                <div
                  onClick={scrollToCalculationSummary}
                  className="bg-amber-400/20 border border-amber-300/40 rounded-2xl px-3 py-2 text-center cursor-pointer hover:bg-amber-400/30 transition-all"
                >
                  <p className="text-[10px] text-amber-200 font-semibold">Delivery</p>
                  <p className="text-sm font-black text-amber-300">Free (🎁)</p>
                </div>
              ) : order.deliveryFee > 0 ? (
                <div
                  onClick={scrollToCalculationSummary}
                  className="bg-white/10 rounded-2xl px-3 py-2 text-center cursor-pointer hover:bg-white/20 transition-all"
                >
                  <p className="text-[10px] text-white/60 font-semibold">Delivery</p>
                  <p className="text-sm font-black">৳{order.deliveryFee}</p>
                </div>
              ) : null}
              {grandTotalPayable > 0 && (
                <div
                  onClick={scrollToCalculationSummary}
                  className="bg-white/20 border border-white/30 rounded-2xl px-3 py-2 text-center cursor-pointer hover:bg-white/30 transition-all"
                >
                  <p className="text-[10px] text-white/70 font-semibold">Total</p>
                  <p className="text-sm font-black">৳{grandTotalPayable}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── CUSTOMER EDIT ALERT BANNER (HELPER / ADMIN ONLY - MINIMALIST YELLOW THEME) ── */}
        {order.updatedByCustomer && (user?.role === 'helper' || user?.lastActiveMode === 'helper' || user?.isAdmin) && (
          <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-950 shadow-sm flex items-center justify-between gap-2 animate-in slide-in-from-top duration-200">
            <div className="flex items-center space-x-1.5 min-w-0">
              <Edit2 className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-extrabold text-xs text-amber-950 truncate">গ্রাহক অর্ডার তথ্য আপডেট করেছেন</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {order.editHistory && order.editHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowEditHistory((v) => !v)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-200/60 hover:bg-amber-200 text-amber-950 rounded-xl text-[10px] font-extrabold border border-amber-300/60 transition-all active:scale-95 cursor-pointer"
                >
                  <span>{showEditHistory ? 'লুকান' : 'বিবরণ'}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showEditHistory ? 'rotate-180' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  fallbackStore.updateOrder(order.id, (o) => ({ ...o, updatedByCustomer: false }));
                }}
                className="px-2.5 py-1 bg-amber-200/80 hover:bg-amber-300 text-amber-950 rounded-xl text-[10px] font-extrabold border border-amber-300/80 transition-all active:scale-95 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── SCHEDULED ORDER BANNER ── */}
        {order.status === 'SCHEDULED' && !isCanceled && (
          <div className="p-4 rounded-3xl bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border border-purple-200 shadow-xs space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-600 text-white shadow-xs">
                    শিডিউল অর্ডার (Scheduled)
                  </span>
                </div>
                <h4 className="font-extrabold text-sm text-purple-950 mt-1">
                  নির্ধারিত সময়: {formatScheduledTime(order.scheduledAt)}
                </h4>
              </div>
            </div>
            <div className="text-xs text-purple-900 bg-white/80 p-3 rounded-2xl border border-purple-100/80 leading-relaxed space-y-1">
              <p className="font-medium">
                {order.scheduledNote || 'দোকান বা সার্ভিস খোলার সময়ে এই অর্ডারটি স্বয়ংক্রিয়ভাবে সার্ভার থেকে সক্রিয় হবে।'}
              </p>
              <p className="text-[11px] text-purple-700 font-semibold">
                ✓ আপনার উপস্থিতি বা অ্যাপ খোলা রাখার প্রয়োজন নেই — সঠিক সময়ে সার্ভার থেকে অর্ডারটি কার্যকর হবে।
              </p>
            </div>
          </div>
        )}

        {isCanceled && (
          <div className="p-4 rounded-3xl bg-red-50 border border-red-200 flex items-start space-x-3">
            <XCircle className="w-7 h-7 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-extrabold text-red-900 text-sm">Order Cancelled</p>
              <p className="text-xs text-red-600 font-medium mt-0.5">This order has been cancelled.</p>
              {(order.cancellationReason || order.cancellationRequest?.reason) && (
                <div className="mt-2.5 p-2.5 rounded-xl bg-red-100/70 border border-red-200/80 text-xs text-red-800">
                  <span className="font-bold">Reason: </span>
                  <span>{order.cancellationReason || order.cancellationRequest?.reason}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PROGRESS TRACKER (not shown for cancelled) ── */}
        {!isCanceled && (() => {
          const helperStepState = getStepState('ACCEPTED');
          const showHelperDetails = (helperStepState === 'CURRENT' || helperStepState === 'COMPLETED') && Boolean(order.helperId || order.helperName || showAdminAccepted);

          return (
            <div className="bg-white rounded-3xl border border-gray-100 px-2.5 sm:px-4 py-3 shadow-soft">
              {/* Inline step bar */}
              <div className="flex items-start justify-between relative">
                {steps.map((step, idx) => {
                  const state = getStepState(step.status);
                  const StepIcon = step.icon;
                  const isLast = idx === steps.length - 1;
                  return (
                    <div key={step.status} className="flex-1 flex flex-col items-center relative min-w-0">
                      {/* Connector line behind status icons */}
                      {!isLast && (
                        <div className={`absolute top-[13px] left-[50%] w-full h-[2px] transition-all ${
                          state === 'COMPLETED'
                            ? 'bg-emerald-500'
                            : 'bg-gray-200'
                        }`} />
                      )}

                      {/* Step circle */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center relative z-10 ring-2 ring-white transition-all ${
                        state === 'COMPLETED'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : state === 'CURRENT'
                            ? 'bg-emerald-500 text-white ring-2 ring-emerald-200 shadow-md'
                            : 'bg-gray-100 text-gray-400 border border-gray-200'
                      }`}>
                        {state === 'COMPLETED'
                          ? <Check className="w-3.5 h-3.5" />
                          : <StepIcon className={`w-3.5 h-3.5 ${state === 'CURRENT' ? 'animate-pulse' : ''}`} />
                        }
                      </div>

                      {/* Step label */}
                      <p className={`text-[8.5px] sm:text-[9px] font-bold mt-1.5 text-center leading-tight break-normal w-full px-0.5 ${
                        state === 'CURRENT' ? 'text-emerald-600' : state === 'COMPLETED' ? 'text-gray-700' : 'text-gray-400'
                      }`}>
                        {step.label}
                      </p>

                      {/* Indicator pointing towards helper info */}
                      {step.status === 'ACCEPTED' && showHelperDetails && (
                        <div className="flex items-center justify-center mt-0.5 text-emerald-600">
                          <ChevronDown className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Helper detail card (shown when helper assigned) */}
              {showHelperDetails && (
                <div className="mt-2.5 relative">
                  {/* Indicator caret pointing to Helper Assigned step */}
                  <div className="absolute -top-1.5 left-[25%] -translate-x-1/2 w-3 h-3 bg-gray-50 border-t border-l border-gray-200/80 rotate-45 z-10" />

                  <div className="flex-1 min-w-0 p-2.5 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between gap-2.5 relative z-0 animate-in fade-in duration-150">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      {order.helperId && helperInfo?.photoURL ? (
                        <img
                          src={helperInfo.photoURL}
                          alt={helperName}
                          className="w-8 h-8 rounded-full object-cover shrink-0 border border-emerald-200 shadow-2xs"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
                          {order.helperId ? helperName.charAt(0).toUpperCase() : 'A'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider leading-none mb-1">
                          Your Helper
                        </p>
                        <p className="font-extrabold text-xs text-gray-900 truncate leading-tight">
                          {order.helperId ? helperName : 'Jamanot Admin'}
                        </p>
                        {(helperPhone || (!order.helperId && (fallbackStore.pricingSettings.helperCenterPhone1 || fallbackStore.pricingSettings.helperCenterPhone2))) && (
                          <p className="text-[11px] text-gray-500 truncate font-medium">
                            {order.helperId ? helperPhone : (fallbackStore.pricingSettings.helperCenterPhone1 || fallbackStore.pricingSettings.helperCenterPhone2)}
                          </p>
                        )}
                      </div>
                    </div>
                    {(helperPhone || (!order.helperId && (fallbackStore.pricingSettings.helperCenterPhone1 || fallbackStore.pricingSettings.helperCenterPhone2))) && (
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <a
                          href={`tel:${order.helperId ? helperPhone : (fallbackStore.pricingSettings.helperCenterPhone1 || fallbackStore.pricingSettings.helperCenterPhone2)}`}
                          aria-label="Call"
                          className="p-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 active:scale-95 transition-all shadow-2xs flex items-center justify-center"
                          title="Call"
                        >
                          <Phone className="w-3.5 h-3.5 text-gray-700" />
                        </a>
                        <a
                          href={getWhatsAppUrl(order.helperId ? helperPhone! : (fallbackStore.pricingSettings.helperCenterPhone1 || fallbackStore.pricingSettings.helperCenterPhone2 || ''))}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="WhatsApp"
                          className="p-2 rounded-xl bg-[#25D366] text-white hover:bg-[#1ebe5d] active:scale-95 transition-all shadow-2xs flex items-center justify-center"
                          title="WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── ORDER EDIT HISTORY ACCORDION (CUSTOMER & HELPER GENERAL) ── */}
        {order.editHistory && order.editHistory.length > 0 && (
          <div className="rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-950 shadow-2xs overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setShowEditHistory((v) => !v)}
              className="w-full p-3 flex items-center justify-between text-left hover:bg-amber-100/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2 min-w-0">
                <Edit2 className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="font-extrabold text-xs text-amber-950 truncate">
                  অর্ডারের পরিবর্তনের ইতিহাস ({order.editHistory.length})
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 bg-amber-200/60 hover:bg-amber-200 text-amber-950 rounded-xl text-[10px] font-extrabold border border-amber-300/60 transition-all">
                <span>{showEditHistory ? 'লুকান' : 'বিবরণ'}</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showEditHistory ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {showEditHistory && (
              <div className="p-3 pt-0 border-t border-amber-200/60 space-y-2 animate-in slide-in-from-top-2 duration-150">
                {[...order.editHistory].reverse().map((item, hIdx) => (
                  <div key={hIdx} className="bg-amber-100/60 rounded-xl p-2.5 text-xs space-y-1.5 border border-amber-200/70">
                    <div className="flex items-center justify-between border-b border-amber-200/60 pb-1 text-[10px] text-amber-800 font-bold">
                      <span>আপডেট #{order.editHistory!.length - hIdx}</span>
                      {item.timestamp && <span>{formatPlacedDateTime(item.timestamp)}</span>}
                    </div>
                    {item.changes.map((c, idx) => (
                      <div key={idx} className="text-left space-y-1 text-[11px]">
                        {c.field && c.field !== 'Items / Details' && c.field !== 'Details / Items' && (
                          <span className="font-bold text-amber-900 block">{c.field}:</span>
                        )}
                        <div className="text-left flex flex-wrap items-center gap-2">
                          {c.oldValue && c.oldValue !== 'None' && (
                            <span className="line-through text-amber-700/60 text-[10px]">{c.oldValue}</span>
                          )}
                          <span className="text-amber-950 font-black bg-white border border-amber-300 px-2 py-0.5 rounded-md inline-block">
                            {c.newValue}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ORDER ITEMS ── */}
        <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">
                Items Ordered ({(order.items || []).length})
              </h3>
              <p className="text-[10px] text-gray-400 font-medium">
                পণ্যের দাম ও দোকানের তথ্য দেখতে আইটেমে ক্লিক করুন
              </p>
            </div>
            {canEdit && (
              <button
                onClick={openEditModal}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] border border-emerald-200 transition-all active:scale-95"
              >
                <Edit2 className="w-3 h-3" />
                <span>Edit Order</span>
              </button>
            )}
          </div>

          <div className="space-y-2">
            {(order.items || []).map((it) => {
                  const unitPrice = getItemUnitPrice(it, validShopOrders);
                  const isCalculatedInTotal = unitPrice !== undefined && unitPrice > 0;

                  const itemPhoto = (() => {
                    if (it.photoUrl) return it.photoUrl;
                    if (it.id) {
                      const p = fallbackStore.storeProducts.get(it.id);
                      if (p?.photoUrl) return p.photoUrl;
                    }
                    const clean = (it.name || '').toLowerCase().trim();
                    const allProds = Array.from(fallbackStore.storeProducts.values());
                    const found = allProds.find((p) => {
                      if (!p.photoUrl) return false;
                      if ((p.name || '').toLowerCase().trim() === clean) {
                        return !it.storeId || p.storeId === it.storeId;
                      }
                      return false;
                    });
                    return found?.photoUrl;
                  })();

                  const costBreakdown = (() => {
                    if (!isCalculatedInTotal || unitPrice === undefined) return null;

                    let qtyNum = 1;
                    if (typeof it.quantity === 'number' && it.quantity > 0) {
                      qtyNum = it.quantity;
                    } else if (it.qty) {
                      const parsed = parseFloat(String(it.qty).replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))));
                      if (!isNaN(parsed) && parsed > 0) {
                        qtyNum = parsed;
                      }
                    }

                    const totalPrice = Math.round((unitPrice * qtyNum) * 100) / 100;
                    const unitDisplay = formatItemQuantityUnit(qtyNum, it.unit, it.qty);

                    return {
                      unitPrice,
                      qtyNum,
                      unitDisplay,
                      totalPrice,
                    };
                  })();

                  const isUnpriced = !isCalculatedInTotal;

                  return (
                    <div
                      key={it.id}
                      onClick={() => setSelectedItemForModal({ ...it, photoUrl: itemPhoto || it.photoUrl })}
                      className={`flex items-center justify-between p-3 rounded-2xl text-xs cursor-pointer transition-all active:scale-[0.99] group shadow-2xs gap-3 border ${
                        isUnpriced
                          ? 'bg-rose-50/80 hover:bg-rose-100/80 border-rose-200 hover:border-rose-300 ring-1 ring-rose-200/60'
                          : 'bg-gray-50 hover:bg-emerald-50/50 hover:border-emerald-200/80 border-gray-100'
                      }`}
                      title="আইটেমের দাম ও দোকানের তথ্য দেখতে ক্লিক করুন"
                    >
                      {/* Product Image Thumbnail */}
                      <div className={`w-12 h-12 rounded-xl bg-white border shrink-0 overflow-hidden flex items-center justify-center shadow-2xs transition-colors ${
                        isUnpriced
                          ? 'border-rose-200 group-hover:border-rose-300'
                          : 'border-gray-200/90 group-hover:border-emerald-300'
                      }`}>
                        {itemPhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={itemPhoto}
                            alt={it.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center ${
                            isUnpriced ? 'bg-rose-100/60 text-rose-500' : 'bg-emerald-50/70 text-emerald-600'
                          }`}>
                            <ServiceIcon service={order.service} className="w-6 h-6 opacity-100" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-semibold transition-colors break-words ${
                            isUnpriced ? 'text-rose-950 group-hover:text-rose-900' : 'text-gray-800 group-hover:text-emerald-950'
                          }`}>
                            {it.name}
                          </span>
                          {isUnpriced && it.qty && (
                            <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-bold">
                              {it.qty}
                            </span>
                          )}
                          {!isUnpriced && it.qty && (
                            <span className="text-[10px] bg-gray-200/80 group-hover:bg-emerald-100 group-hover:text-emerald-800 text-gray-700 px-1.5 py-0.5 rounded font-bold transition-colors">
                              {it.qty}
                            </span>
                          )}
                          {it.isCustom && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-extrabold">
                              Custom Item
                            </span>
                          )}
                        </div>
                        {costBreakdown && (
                          <p className="text-[11px] font-mono text-gray-500 font-semibold mt-0.5">
                            {costBreakdown.unitDisplay} × ৳{costBreakdown.unitPrice}
                          </p>
                        )}

                        {it.storeName && (
                          <p className={`text-[10px] font-medium mt-0.5 ${isUnpriced ? 'text-rose-700' : 'text-emerald-700'}`}>
                            দোকান: {it.storeName}
                          </p>
                        )}

                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {costBreakdown ? (
                          <div className="text-right">
                            <span className="font-mono font-black text-gray-900 group-hover:text-emerald-700 transition-colors text-sm sm:text-base">
                              ৳{costBreakdown.totalPrice}
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-rose-700 text-[10px] sm:text-[11px] bg-white px-2 py-0.5 rounded-lg border border-rose-200 shadow-2xs shrink-0 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-rose-500" />
                            <span>মূল্য বাকি</span>
                          </span>
                        )}
                        <ChevronRight className={`w-3.5 h-3.5 transition-colors ${
                          isUnpriced ? 'text-rose-400 group-hover:text-rose-600' : 'text-gray-400 group-hover:text-emerald-600'
                        }`} />
                      </div>
                    </div>
                  );
                })}

          </div>

          {order.additionalNote && (
            <div className="mt-3 p-3 rounded-2xl bg-amber-50/70 border border-amber-100 text-xs text-amber-900">
              <span className="font-extrabold block mb-0.5">Your Note:</span>
              <span>{order.additionalNote}</span>
            </div>
          )}
          {order.helperNote && (user?.role === 'helper' || user?.role === 'admin' || user?.lastActiveMode === 'helper' || user?.lastActiveMode === 'admin' || user?.isAdmin) && (
            <div className="mt-3 p-3 rounded-2xl bg-purple-50 border border-purple-200 text-xs text-purple-950 space-y-1">
              <span className="font-extrabold flex items-center space-x-1.5 text-purple-900">
                <FileText className="w-3.5 h-3.5 text-purple-700" />
                <span>Helper Private Note (🔒 Hidden from customer):</span>
              </span>
              <p className="font-semibold text-purple-950 leading-relaxed">{order.helperNote}</p>
            </div>
          )}
        </div>

        {/* ── CALCULATION SUMMARY ── */}
        {estdPricing && (
          <div ref={calculationSummaryRef} className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft space-y-3 animate-in fade-in duration-200">
            <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider flex items-center space-x-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>Calculation Summary</span>
            </h3>
            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-2.5 text-xs font-semibold text-gray-700">
              {unpricedItems.length > 0 && (
                <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-extrabold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{unpricedItems.length} টি পণ্যের মূল্য এখনো অন্তর্ভুক্ত করা হয়নি</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-snug">
                    হেলপার দোকান থেকে কেনার সময় এই পণ্যগুলোর ({unpricedItems.map((i: OrderItem) => i.name).slice(0, 3).join(', ')}{unpricedItems.length > 3 ? '...' : ''}) সঠিক মূল্য যোগ করবেন। বর্তমান মোট বিলে এগুলোর দাম এখনো ধরা হয়নি।
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-gray-500 font-bold">Product cost</span>
                  {unpricedItems.length > 0 && (
                    <span className="block text-[10px] text-amber-700 font-bold">
                      ({(order.items || []).length - unpricedItems.length}/{(order.items || []).length} items priced)
                    </span>
                  )}
                </div>
                <span className="text-sm font-black text-gray-900">
                  ৳{effectiveProductCost}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-bold">Distance ({Math.ceil(distanceKm)} km)</span>
                <span className="font-bold text-gray-900">৳{estdPricing.distanceFee}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-bold">Approximate Weight (kg)</span>
                <span className="font-bold text-gray-900">{Math.ceil(order.weightKg || 0)} kg</span>
              </div>

              {effectiveProcessingFee > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-bold">Processing Fee</span>
                  <span className="font-bold text-gray-900">৳{effectiveProcessingFee}</span>
                </div>
              )}


              {estdPricing.returnFee > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-bold">
                    {order.needDeliveryBack ? 'Two-Way Fee' : 'Return Fee'} ({estdPricing.returnPercent}%)
                  </span>
                  <span className="font-bold text-gray-900">৳{estdPricing.returnFee}</span>
                </div>
              )}

              {effectiveCustomStoreFee > 0 && (
                <div className="flex items-center justify-between text-indigo-900 font-bold">
                  <span className="flex items-center space-x-1">
                    <Store className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>
                      Custom Store Fee ({customStorePricing.count} {customStorePricing.count > 1 ? 'items' : 'item'} × ৳{customStorePricing.unitFee})
                    </span>
                  </span>
                  <span className="font-extrabold text-sm text-indigo-700 font-mono">+৳{effectiveCustomStoreFee}</span>
                </div>
              )}

              {/* Previous Order Due Payment Line Item */}
              {order.appliedDuePayment && order.appliedDuePayment.amount > 0 && (
                <div className="border-t border-amber-200 pt-2 space-y-1">
                  <div className="flex items-center justify-between text-amber-950 font-bold">
                    <span className="flex items-center space-x-1 text-amber-900">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Previous Order Due (পূর্বের বাকি)</span>
                    </span>
                    <span className="font-extrabold text-sm text-red-600">+৳{order.appliedDuePayment.amount}</span>
                  </div>
                  {order.appliedDuePayment.note && (
                    <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200/70 text-[11px] text-amber-950 font-medium leading-relaxed">
                      <strong>বাকি নোট:</strong> {order.appliedDuePayment.note}
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-gray-800 text-sm">Delivery Fee</span>
                  {order.isFreeDelivery && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      🎁 ফ্রি ডেলিভারি (Reward Claimed)
                    </span>
                  )}
                </div>
                <span className="text-base font-black text-emerald-850">
                  ৳{effectiveDeliveryFee}
                </span>
              </div>

              <div className="border-t border-gray-200 pt-2.5 flex items-center justify-between bg-emerald-50/50 -mx-3.5 px-3.5 py-1.5 mt-1 rounded-b-2xl">
                <div>
                  <span className="font-bold text-gray-900 text-sm block">Total Payable Amount (মোট বিল)</span>
                  {unpricedItems.length > 0 && (
                    <span className="text-[10px] text-amber-800 font-semibold block">
                      * বাকি {unpricedItems.length} টি পণ্যের মূল্য ডেলিভারির সময় যোগ হবে
                    </span>
                  )}
                </div>
                <span className="text-base font-black text-emerald-800">
                  ৳{grandTotalPayable}
                </span>
              </div>
            </div>
          </div>
        )}


        {/* ── ADDRESSES & LOCATION ── */}
        <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft space-y-3">
          <div>
            <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-gray-50 border border-gray-100 min-w-0">
              <Store className="w-4 h-4 text-gray-500 shrink-0" />
              <p className="text-sm font-bold text-gray-900 truncate flex-1 min-w-0" title={order.pickupLocation?.address || 'Local Helper Area (No specific pickup set)'}>
                {order.pickupLocation?.address || 'Local Helper Area (No specific pickup set)'}
              </p>
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100 min-w-0">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="text-sm font-bold text-gray-900 truncate flex-1 min-w-0" title={order.deliveryLocation?.address || 'N/A'}>
                {order.deliveryLocation?.address || 'N/A'}
              </p>
            </div>
          </div>
          {(order.alternativePhone || order.customerPhone) && (
            <div>
              <div className="p-3 rounded-2xl bg-gray-50 border border-gray-100 text-xs text-gray-700 flex items-center justify-between">
                <div className="flex items-center space-x-2 min-w-0">
                  <Phone className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  <span className="font-semibold truncate">
                    Contact: <span className="font-bold text-gray-900 font-mono">{order.alternativePhone || order.customerPhone}</span>
                  </span>
                </div>
                <div className="flex items-center space-x-1.5 shrink-0">
                  <a
                    href={`tel:${order.alternativePhone || order.customerPhone}`}
                    className="p-1.5 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors shadow-2xs flex items-center justify-center"
                    title="Call"
                  >
                    <Phone className="w-3 h-3 text-gray-700" />
                  </a>
                  <a
                    href={getWhatsAppUrl(order.alternativePhone || order.customerPhone || '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-xl bg-[#25D366] text-white hover:bg-[#1ebe5d] transition-colors shadow-2xs flex items-center justify-center"
                    title="WhatsApp"
                  >
                    <MessageSquare className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── PURCHASED ITEMS & STORE COST DETAILS (FROM ARRIVED STATUS ONWARDS) ── */}
        {isArrivedOrDelivered && (validShopOrders.length > 0 || effectiveProductCost > 0 || (order.selectedShopIds && order.selectedShopIds.length > 0)) && (
          <div className="bg-white rounded-3xl border border-gray-150 p-4 shadow-soft space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-wider flex items-center space-x-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-purple-600" />
                <span>খরচের Details</span>
              </h3>
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200">
                মোট ৳{effectiveProductCost}
              </span>
            </div>

            <div className="space-y-2.5">
              {validShopOrders.length > 0 ? (
                validShopOrders.map((so) => {
                  const isMyself = so.shopId === 'myself';
                  const shop = !isMyself ? fallbackStore.shops.get(so.shopId) : null;
                  const storeDisplayName = isMyself
                    ? (so.sellerName || 'সরাসরি ক্রয় / নিজস্ব কেনাকাটা')
                    : (so.shopName || shop?.name || so.sellerName || 'দোকান');

                  const ownerNum = !isMyself ? (shop?.whatsapp || '') : '';
                  const ownerName = shop?.contactPerson;

                  const managerNum = !isMyself ? (shop?.managerWhatsapp || '') : '';
                  const managerName = shop?.managerName;

                  const customSellerNum = isMyself ? (so.sellerPhone || '') : (!ownerNum && !managerNum ? (so.sellerPhone || '') : '');

                  return (
                    <div
                      key={so.id}
                      className="p-3.5 rounded-2xl bg-gray-50/90 border border-gray-200/90 space-y-2.5"
                    >
                      {/* Store / Seller Name & Product Cost */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                          <div className="p-1.5 rounded-xl bg-purple-100 text-purple-700 shrink-0">
                            <Store className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-extrabold text-xs text-gray-900 leading-tight block">
                              {storeDisplayName}
                            </span>
                            {isMyself && so.sellerPhone ? (
                              <a
                                href={`tel:${so.sellerPhone}`}
                                className="text-[10px] font-bold text-purple-800 hover:text-purple-950 bg-purple-50 hover:bg-purple-100 px-1.5 py-0.5 rounded-md border border-purple-200 inline-flex items-center gap-1 mt-0.5 font-mono transition-colors"
                              >
                                <Phone className="w-2.5 h-2.5 text-purple-600 shrink-0" />
                                <span>{so.sellerPhone}</span>
                              </a>
                            ) : null}
                            {!isMyself && shop?.type && (
                              <span className="text-[9px] font-bold text-gray-600 bg-gray-150 px-1.5 py-0.2 rounded-md border border-gray-200 inline-block mt-0.5">
                                {shop.type}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-gray-900 bg-white px-2.5 py-1 rounded-xl border border-gray-200 shadow-xs inline-block">
                            ৳{so.price || 0}
                          </span>
                        </div>
                      </div>

                      {/* Store Numbers (Manager + Owner for Store) */}
                      {!isMyself && (ownerNum || managerNum) && (
                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                          {ownerNum && (
                            <a
                              href={`tel:${ownerNum}`}
                              className="text-[10px] font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200/80 transition-all active:scale-95 shadow-2xs"
                              title="কল করুন"
                            >
                              <Phone className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                              <span className="font-mono font-black">{ownerNum}</span>
                            </a>
                          )}

                          {managerNum && (
                            <a
                              href={`tel:${managerNum}`}
                              className="text-[10px] font-bold text-blue-800 hover:text-blue-900 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200/80 transition-all active:scale-95 shadow-2xs"
                              title="কল করুন"
                            >
                              <Phone className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                              <span className="font-mono font-black">{managerNum}</span>
                            </a>
                          )}
                        </div>
                      )}

                      {/* Item Details */}
                      {so.itemsWithPrice && so.itemsWithPrice.length > 0 ? (
                        <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 text-xs shadow-2xs space-y-1.5">
                          {so.itemsWithPrice.map((it, iIdx) => {
                            const soItemPhoto = (() => {
                              if (it.itemId) {
                                const prod = fallbackStore.storeProducts.get(it.itemId);
                                if (prod?.photoUrl) return prod.photoUrl;
                              }
                              const clean = (it.name || '').toLowerCase().trim();
                              const allProds = Array.from(fallbackStore.storeProducts.values());
                              const found = allProds.find((p) => p.photoUrl && (p.name || '').toLowerCase().trim() === clean);
                              return found?.photoUrl;
                            })();

                            const matchingOrderItem = (order.items || []).find((oi) => {
                              if (it.itemId && oi.id === it.itemId) return true;
                              if (it.originalId && oi.id === it.originalId) return true;
                              const n1 = (oi.name || '').toLowerCase().replace(/\s*[×x]\s*\d+/g, '').trim();
                              const n2 = (it.name || '').toLowerCase().replace(/\s*[×x]\s*\d+/g, '').trim();
                              return n1 === n2 || n1.includes(n2) || n2.includes(n1);
                            });

                            const soCostInfo = (() => {
                              if (it.price === undefined || isNaN(Number(it.price))) return null;
                              const unitPrice = Number(it.price);
                              let qtyNum = 1;
                              let unitSuffix = '';

                              if (matchingOrderItem) {
                                if (typeof matchingOrderItem.quantity === 'number' && matchingOrderItem.quantity > 0) {
                                  qtyNum = matchingOrderItem.quantity;
                                } else if (matchingOrderItem.qty) {
                                  const parsed = parseFloat(String(matchingOrderItem.qty).replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))));
                                  if (!isNaN(parsed) && parsed > 0) qtyNum = parsed;
                                }
                              } else if (it.unit) {
                                const parsed = parseFloat(String(it.unit).replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))));
                                if (!isNaN(parsed) && parsed > 0) qtyNum = parsed;
                              }

                              const unitDisplay = formatItemQuantityUnit(
                                qtyNum,
                                matchingOrderItem?.unit || it.unit,
                                matchingOrderItem?.qty || it.unit
                              );
                              const totalPrice = Math.round((unitPrice * qtyNum) * 100) / 100;
                              return { unitPrice, qtyNum, unitDisplay, totalPrice };
                            })();

                            return (
                              <div
                                key={iIdx}
                                onClick={() => {
                                  setSelectedItemForModal(matchingOrderItem || {
                                    id: it.itemId || it.originalId || `so-it-${iIdx}`,
                                    name: it.name,
                                    qty: it.unit || '1',
                                    price: it.price,
                                    photoUrl: soItemPhoto,
                                    storeId: so.shopId !== 'myself' ? so.shopId : undefined,
                                    storeName: so.shopId !== 'myself' ? so.shopName : so.sellerName,
                                  });
                                }}
                                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-purple-50/70 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors group gap-2"
                                title="আইটেমের বিস্তারিত দেখতে ক্লিক করুন"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {soItemPhoto ? (
                                    <div className="w-7 h-7 rounded-lg overflow-hidden bg-white border border-gray-200 shrink-0">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={soItemPhoto} alt={it.name} className="w-full h-full object-cover" />
                                    </div>
                                  ) : (
                                    <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                                      <Package className="w-3.5 h-3.5" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <span className="text-gray-800 font-semibold group-hover:text-purple-900 transition-colors truncate block">
                                      {it.name}
                                    </span>
                                    {soCostInfo && (
                                      <p className="text-[10px] font-mono text-gray-500 font-medium">
                                        {soCostInfo.unitDisplay} × ৳{soCostInfo.unitPrice}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {soCostInfo ? (
                                    <span className="font-mono font-black text-gray-900 group-hover:text-purple-950 transition-colors text-xs">
                                      ৳{soCostInfo.totalPrice}
                                    </span>
                                  ) : (
                                    <span className="font-mono font-bold text-gray-900 text-xs">৳{it.price ?? 0}</span>
                                  )}
                                  <ChevronRight className="w-3 h-3 text-gray-400 group-hover:text-purple-600 transition-colors" />
                                </div>
                              </div>
                            );
                          })}
                          <div className="flex items-center justify-between pt-1 font-black text-xs text-gray-900 border-t border-gray-200">
                            <span>মোট পণ্যের দাম (Total):</span>
                            <span className="font-mono text-emerald-800">৳{so.price ?? 0}</span>
                          </div>
                        </div>
                      ) : so.requestText ? (
                        <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 text-xs shadow-2xs">
                          <p className="text-gray-800 font-semibold leading-relaxed">
                            {so.requestText}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                /* Fallback if productCost exists but no shopOrders breakdown */
                (() => {
                  const shopList = (order.selectedShopIds && order.selectedShopIds.length > 0)
                    ? order.selectedShopIds.map(id => fallbackStore.shops.get(id) || { id, name: id, whatsapp: '', managerWhatsapp: '', type: '' } as any)
                    : [];

                  if (shopList.length > 0) {
                    return shopList.map((shop, idx) => (
                      <div key={shop.id || idx} className="p-3.5 rounded-2xl bg-gray-50/90 border border-gray-200/90 space-y-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                            <div className="p-1.5 rounded-xl bg-purple-100 text-purple-700 shrink-0">
                              <Store className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="font-extrabold text-xs text-gray-900 leading-tight block">
                                {shop.name}
                              </span>
                              {shop.type && (
                                <span className="text-[9px] font-bold text-gray-600 bg-gray-150 px-1.5 py-0.2 rounded-md border border-gray-200 inline-block mt-0.5">
                                  {shop.type}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-gray-900 bg-white px-2.5 py-1 rounded-xl border border-gray-200 shadow-xs inline-block">
                              ৳{effectiveProductCost}
                            </span>
                          </div>
                        </div>

                        {(shop.whatsapp || shop.managerWhatsapp) && (
                          <div className="flex items-center gap-2 flex-wrap pt-0.5">
                            {shop.whatsapp && (
                              <a
                                href={`tel:${shop.whatsapp}`}
                                className="text-[10px] font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200/80 transition-all active:scale-95 shadow-2xs"
                                title="কল করুন"
                              >
                                <Phone className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                <span className="font-mono font-black">{shop.whatsapp}</span>
                              </a>
                            )}
                            {shop.managerWhatsapp && (
                              <a
                                href={`tel:${shop.managerWhatsapp}`}
                                className="text-[10px] font-bold text-blue-800 hover:text-blue-900 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200/80 transition-all active:scale-95 shadow-2xs"
                                title="কল করুন"
                              >
                                <Phone className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                <span className="font-mono font-black">{shop.managerWhatsapp}</span>
                              </a>
                            )}
                          </div>
                        )}

                        <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 text-xs shadow-2xs">
                          <p className="text-gray-700 font-semibold leading-relaxed">
                            {effectiveProductCost > 0
                              ? 'ক্রয়কৃত পণ্যের মোট মূল্য (হেলপার দ্বারা সংগ্রহ করা হবে)'
                              : (order.additionalNote || 'পণ্য ক্রয়ের পর মোট বিল চূড়ান্ত করা হবে')}
                          </p>
                        </div>
                      </div>
                    ));
                  }

                  return (
                    <div className="p-3.5 rounded-2xl bg-gray-50/90 border border-gray-200/90 space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                          <div className="p-1.5 rounded-xl bg-purple-100 text-purple-700 shrink-0">
                            <Store className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-extrabold text-xs text-gray-900 leading-tight block">
                              {order.pickupLocation?.address || 'দোকান / বিক্রেতা'}
                            </span>
                            <span className="text-[9px] font-bold text-gray-500 bg-gray-150 px-1.5 py-0.2 rounded-md border border-gray-200 inline-block mt-0.5">
                              বিক্রেতা / দোকান
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-gray-900 bg-white px-2.5 py-1 rounded-xl border border-gray-200 shadow-xs inline-block">
                            ৳{effectiveProductCost}
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 text-xs shadow-2xs">
                        <p className="text-gray-700 font-semibold leading-relaxed">
                          {effectiveProductCost > 0
                            ? 'ক্রয়কৃত পণ্যের মোট মূল্য (হেলপার দ্বারা সংগ্রহ করা হবে)'
                            : (order.additionalNote || 'পণ্য ক্রয়ের পর মোট বিল চূড়ান্ত করা হবে')}
                        </p>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}


        {/* ── FEE UPDATED NOTICE ── */}
        {order.feeAdjustment?.status === 'APPROVED' && (
          <div className="p-4 rounded-3xl border border-amber-200 bg-amber-50 text-amber-900 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold text-sm mb-0.5">Delivery Fee Updated</p>
              <p className="text-xs font-medium">
                Original: ৳{order.originalDeliveryFee} → New: <strong>৳{order.feeAdjustment.amount}</strong>
              </p>
              {order.feeAdjustment.reason && (
                <p className="text-[11px] italic mt-1 text-amber-700">"{order.feeAdjustment.reason}"</p>
              )}
            </div>
          </div>
        )}

        {/* ── CUSTOMER FEEDBACK SECTION (ONLY FOR DELIVERED ORDERS) ── */}
        {isDelivered && (
          <div className="bg-white rounded-3xl border border-amber-200 p-4 shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="font-extrabold text-sm text-gray-900">Customer Feedback</h3>
              </div>
              {order.feedback ? (
                <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  ✓ Submitted
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  Pending Feedback
                </span>
              )}
            </div>

            {order.feedback ? (
              <div className="bg-amber-50/60 p-3 rounded-2xl border border-amber-100/80 space-y-2 text-xs">
                {order.feedback.thumbsUp === true ? (
                  <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold pb-1">
                    <span className="text-sm">👍</span>
                    <span>ভালো ছিল!</span>
                  </div>
                ) : order.feedback.thumbsUp === false ? (
                  <div className="space-y-1 pb-1">
                    <div className="flex items-center gap-1.5 text-red-800 font-extrabold">
                      <span className="text-sm">👎</span>
                      <span>ভালো না</span>
                    </div>
                    {order.feedback.badReason && (
                      <div className="text-[11px] font-black text-red-700 bg-red-100/80 px-2 py-0.5 rounded-md w-fit">
                        সমস্যা: {order.feedback.badReason === 'RIDER' ? '🚴 রাইডার' : order.feedback.badReason === 'PRODUCT' ? '🛍️ প্রোডাক্ট' : '🚴 রাইডার + 🛍️ প্রোডাক্ট'}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 font-semibold">Helper Rating:</span>
                      <div className="flex items-center space-x-1 font-bold text-amber-700">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                        <span>{order.feedback.riderRating} / 5</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 font-semibold">Overall Service:</span>
                      <div className="flex items-center space-x-1 font-bold text-amber-700">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                        <span>{order.feedback.serviceRating} / 5</span>
                      </div>
                    </div>
                  </>
                )}
                {order.feedback.improvementComment && (
                  <div className="pt-1.5 border-t border-amber-200/60">
                    <p className="text-[11px] text-amber-900 font-medium italic">
                      "{order.feedback.improvementComment}"
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-600 font-medium mb-3">
                  অর্ডারটি সফলভাবে ডেলিভারি হয়েছে! আমাদের সার্ভিস মান উন্নত করতে আপনার মতামত অত্যন্ত মূল্যবান।
                </p>
                {user?.uid === order.customerId && (
                  <button
                    onClick={() => setShowFeedbackModal(true)}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5 active:scale-95"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>মতামত দিন (Give Feedback)</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── DANGER ZONE / CANCEL BUTTON ── */}
        {canCancel && (
          <div className="pt-4 mt-2">
            <div className="flex items-center space-x-3 mb-3">
              <div className="flex-1 h-px bg-red-100" />
              <span className="text-[10px] font-extrabold text-red-400 uppercase tracking-widest whitespace-nowrap">Danger Zone</span>
              <div className="flex-1 h-px bg-red-100" />
            </div>
            <p className="text-[11px] text-gray-400 text-center font-medium mb-3">
              This action cannot be undone. The helper will be notified.
            </p>
            <button
              onClick={handleCancelOrder}
              className="w-full py-3.5 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 font-extrabold text-xs transition-colors flex items-center justify-center space-x-1.5 border border-red-200"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel This Order</span>
            </button>
          </div>
        )}
      </div>

      {/* ── EDIT ORDER DETAILS MODAL ── */}
      <EditOrderDetailsModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        order={order}
        onOrderUpdated={(updated) => {
          setOrder(updated);
        }}
      />

      {/* ── CANCELLATION REASON MODAL ── */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-red-100 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="font-black text-base text-gray-900">অর্ডার বাতিল করুন</h3>
                <p className="text-[11px] text-gray-500 font-medium mt-0.5">অনুগ্রহ করে অর্ডারটি বাতিলের কারণ জানান</p>
              </div>
              <button
                onClick={() => setShowCancelModal(false)}
                className="p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmCancel} className="flex flex-col flex-1">
              <div className="px-5 py-4 space-y-4">
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-100 flex items-start space-x-2.5">
                  <AlertTriangle className="w-5 h-5 text-red-650 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-800 font-medium leading-relaxed">
                    অর্ডারটি বাতিল করার পর পুনরায় চালু করা যাবে না। যদি কোনো হেলপার ইতিমধ্যেই কোনো খরচ বা পরিশ্রম করে থাকেন, তবে তার সাথে যোগাযোগ করার অনুরোধ রইল।
                  </p>
                </div>

                <div>
                  <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider block mb-2">বাতিলের কারণ / ফিডব্যাক</label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => {
                      setCancelReason(e.target.value);
                      if (e.target.value.trim()) setCancelError('');
                    }}
                    placeholder="যেমন: আর প্রয়োজন নেই, ভুল অর্ডার করেছি, অন্য ঠিকানা ইত্যাদি..."
                    className="w-full px-3.5 py-3.5 rounded-2xl border border-gray-200 text-xs font-semibold text-gray-900 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10 resize-none h-28"
                    required
                  />
                </div>

                {cancelError && (
                  <p className="text-[11px] text-red-600 font-bold bg-red-50 px-3 py-2 rounded-xl border border-red-100">
                    {cancelError}
                  </p>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-5 pb-5 pt-3 border-t border-gray-100 shrink-0 flex space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 py-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs transition-all"
                >
                  ফিরে যান
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-md shadow-red-600/25 transition-all"
                >
                  অর্ডার বাতিল করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {showFeedbackModal && (
        <OrderFeedbackModal
          order={order}
          onClose={() => setShowFeedbackModal(false)}
          onSubmitted={() => setShowFeedbackModal(false)}
        />
      )}

      {selectedItemForModal && (
        <CustomerOrderItemModal
          isOpen={!!selectedItemForModal}
          onClose={() => setSelectedItemForModal(null)}
          item={selectedItemForModal}
          order={order}
          validShopOrders={validShopOrders}
        />
      )}
    </div>
  );
};
