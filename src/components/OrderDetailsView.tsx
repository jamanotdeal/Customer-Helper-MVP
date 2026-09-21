'use client';

import React, { useEffect, useState } from 'react';
import { Order, OrderStatus, OrderEditChange, OrderEditHistoryItem, ShopOrder, Shop } from '@/types';
import { fallbackStore, db } from '@/lib/firebase';
import { collection, doc, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import {
  ArrowLeft, CheckCircle2, Clock, MapPin, Phone, XCircle,
  UserCheck, MessageSquare, Package, Truck, Navigation,
  AlertTriangle, Check, ChevronRight, Edit2, X, ChevronDown,
  Star, Sparkles, FileText, ShieldCheck, DollarSign, Trash2, Plus,
  ShoppingBag, Store,
} from 'lucide-react';
import { DEFAULT_SERVICES, getServiceDescriptionHint, calculateDistanceKm, calculateEstimatedFee } from '@/lib/pricing';
import { getStatusBadgeInfo } from './OrderCard';
import { formatPlacedDateTime } from '@/lib/timeUtils';
import { MapPickerModal } from './MapPickerModal';
import { OrderFeedbackModal } from './OrderFeedbackModal';

interface OrderDetailsViewProps {
  orderId: string;
  onBack: () => void;
}

export const OrderDetailsView: React.FC<OrderDetailsViewProps> = ({ orderId, onBack }) => {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  // Whether to show the "Admin Accepted" reassurance banner (customer-only, PENDING + no helper + N minutes passed)
  const [showAdminAccepted, setShowAdminAccepted] = useState(false);
  const calculationSummaryRef = React.useRef<HTMLDivElement>(null);

  const scrollToCalculationSummary = () => {
    calculationSummaryRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editService, setEditService] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPickup, setEditPickup] = useState('');
  const [editPickupLat, setEditPickupLat] = useState<number | undefined>(undefined);
  const [editPickupLng, setEditPickupLng] = useState<number | undefined>(undefined);
  const [editAddress, setEditAddress] = useState('');
  const [editDeliveryLat, setEditDeliveryLat] = useState<number | undefined>(undefined);
  const [editDeliveryLng, setEditDeliveryLng] = useState<number | undefined>(undefined);
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState('');

  // Map Picker Modal States
  const [showPickupMapPicker, setShowPickupMapPicker] = useState(false);
  const [showDeliveryMapPicker, setShowDeliveryMapPicker] = useState(false);
  const [mapHasError, setMapHasError] = useState(false);

  // Services list synced from admin panel
  const [editServices, setEditServices] = useState<string[]>(
    fallbackStore.pricingSettings.services || DEFAULT_SERVICES
  );

  useEffect(() => {
    const sync = () => {
      const s = fallbackStore.pricingSettings.services;
      if (s && s.length > 0) setEditServices(s);
    };
    sync();
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, []);

  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  // Due Payment modal state
  const [showDueModal, setShowDueModal] = useState(false);
  const [dueAmountInput, setDueAmountInput] = useState('');
  const [dueNoteInput, setDueNoteInput] = useState('');

  const openDueModal = () => {
    if (order?.duePayment) {
      setDueAmountInput(order.duePayment.amount.toString());
      setDueNoteInput(order.duePayment.note || '');
    } else {
      setDueAmountInput('');
      setDueNoteInput('');
    }
    setShowDueModal(true);
  };

  const handleSaveDuePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    const amount = parseFloat(dueAmountInput);
    if (isNaN(amount) || amount <= 0) {
      alert('সঠিক টাকা পরিমাণ লিখুন');
      return;
    }
    if (!dueNoteInput.trim()) {
      alert('বাকি পেমেন্টের কারণ বা নোট লিখুন');
      return;
    }

    const isHelper = user?.role === 'helper' || user?.lastActiveMode === 'helper' || user?.isHelper;
    const isAdmin = user?.role === 'admin' || user?.lastActiveMode === 'admin' || user?.isAdmin;

    const addedByRole = isAdmin ? ('admin' as const) : ('helper' as const);
    const addedByName = user?.displayName || (isAdmin ? 'Admin' : 'Helper');

    await fallbackStore.updateOrder(order.id, (prev) => ({
      ...prev,
      duePayment: {
        amount,
        note: dueNoteInput.trim(),
        addedBy: addedByRole,
        addedByName,
        addedAt: prev.duePayment?.addedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: prev.duePayment?.status || 'UNPAID',
      },
    }));

    setShowDueModal(false);
  };

  const handleRemoveDuePayment = async () => {
    if (!order) return;
    if (!confirm('আপনি কি নিশ্চিতভাবে এই বাকি পেমেন্ট রেকর্ডটি মুছে ফেলতে চান?')) return;

    await fallbackStore.updateOrder(order.id, (prev) => {
      const next = { ...prev };
      delete next.duePayment;
      return next;
    });

    setShowDueModal(false);
  };

  useEffect(() => {
    const syncOrder = () => {
      const current = fallbackStore.orders.get(orderId);
      if (current) setOrder({ ...current });
    };
    syncOrder();
    const unsub = fallbackStore.subscribe(syncOrder);

    // Direct realtime document listener for immediate status update (e.g. Delivered by Helper/Admin)
    let unsubDoc: (() => void) | undefined;
    if (orderId && db) {
      try {
        unsubDoc = onSnapshot(
          doc(db, 'orders', orderId),
          (docSnap) => {
            if (docSnap.exists()) {
              const updated = docSnap.data() as Order;
              if (updated && updated.id) {
                fallbackStore.orders.set(orderId, updated);
                setOrder({ ...updated });
              }
            }
          },
          (err) => console.warn('[OrderDetailsView] live order doc listener note:', err)
        );
      } catch (e) {
        console.warn('[OrderDetailsView] live order doc listener setup error:', e);
      }
    }

    return () => {
      unsub();
      if (unsubDoc) unsubDoc();
    };
  }, [orderId]);

  const [shopOrders, setShopOrders] = useState<ShopOrder[]>([]);

  useEffect(() => {
    setShopOrders(fallbackStore.getShopOrdersForOrder(orderId));
    const sync = () => setShopOrders(fallbackStore.getShopOrdersForOrder(orderId));
    const unsubStore = fallbackStore.subscribe(sync);

    // Preload shops if not yet cached
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

  const estdPricing = order ? calculateEstimatedFee({
    distanceKm: Math.ceil(distanceKm),
    weightKg: Math.ceil(order.weightKg || 0),
    isReturnRequested: !!order.needReturnItems || !!order.needDeliveryBack,
    productPrice: order.productCost || 0,
  }, fallbackStore.pricingSettings) : null;

  // Timer: check every 30s if the customer should see "Admin Accepted" banner
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
  }, [orderId]);

  if (!order) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Order not found.</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl">Back</button>
      </div>
    );
  }

  if (order.status === 'CANCELED' || order.cancellationRequest?.status === 'APPROVED') {
    return (
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors py-2 font-bold text-sm"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>ফিরে যান (Back)</span>
        </button>

        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 p-8 text-center bg-white rounded-3xl border border-red-100 shadow-sm my-4">
          <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shadow-inner">
            <XCircle className="w-10 h-10" />
          </div>
          <h3 className="font-extrabold text-gray-900 text-lg">অর্ডারটি বাতিল করা হয়েছে (Order Cancelled)</h3>
          <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
            এই অর্ডারটি কাস্টমার অথবা অ্যাডমিন দ্বারা বাতিল করা হয়েছে। আপনি এই অর্ডারের বিবরণ দেখতে পারবেন না।
          </p>
          <button
            onClick={onBack}
            className="mt-4 px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold shadow-md transition-all active:scale-95"
          >
            ফিরে যান
          </button>
        </div>
      </div>
    );
  }

  const badge = getStatusBadgeInfo(order.status);
  const BadgeIcon = badge.icon;

  // Helper contact info
  const helperInfo = order.helperId ? fallbackStore.users.get(order.helperId) : null;
  const helperName = order.helperName || helperInfo?.displayName || 'Your Helper';
  const helperAppEntry = order.helperId
    ? Array.from(fallbackStore.helperApplications.values()).find((a) => a.userId === order.helperId && a.status === 'APPROVED')
    : null;
  const helperPhone = order.helperPhone || helperInfo?.alternativePhone || helperAppEntry?.whatsapp || null;

  const getWhatsAppUrl = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formatted = cleanPhone.startsWith('0') ? `880${cleanPhone.slice(1)}` : cleanPhone;
    return `https://wa.me/${formatted}`;
  };

  // Simplified progress steps
  const steps: { status: OrderStatus; label: string; icon: React.ElementType; desc: string }[] = [
    { status: 'PENDING', label: 'Order Placed', icon: Check, desc: 'Order Placed Successfully' },
    {
      status: 'ACCEPTED',
      label: showAdminAccepted ? 'Admin Accepted' : 'Helper Assigned',
      icon: UserCheck,
      desc: showAdminAccepted ? 'Admin finding helper for you...' : 'Helper is heading to pickup'
    },
    { status: 'PURCHASED_EXECUTED', label: 'Proccessing...', icon: Package, desc: 'Items collected from shop' },
    { status: 'ON_THE_WAY', label: 'On The Way', icon: Truck, desc: 'Coming to your location' },
    { status: 'ARRIVED', label: 'Arrived', icon: Navigation, desc: 'Helper is at your door' },
    { status: 'DELIVERED', label: 'Delivered!', icon: CheckCircle2, desc: 'All done. Enjoy!' },
  ];

  const getStepState = (stepStatus: OrderStatus) => {
    if (order.status === 'CANCELED') return 'CANCELED';
    
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
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      status: 'CANCELED',
      cancelledAt: new Date().toISOString(),
      cancellationRequest: {
        requestedBy: 'customer',
        reason: cancelReason.trim(),
        status: 'APPROVED',
        createdAt: new Date().toISOString(),
      },
      statusHistory: [
        ...(o.statusHistory || []),
        {
          id: `sh-${Date.now()}`,
          status: 'CANCELED',
          timestamp: new Date().toISOString(),
          actor: 'Customer',
          note: `Cancelled by customer. Reason: ${cancelReason.trim()}`,
        },
      ],
    }));
    setShowCancelModal(false);
  };

  // Open edit modal pre-filled with current order data
  const openEditModal = () => {
    if (order.status === 'ARRIVED' || order.status === 'DELIVERED' || order.status === 'CANCELED') return;
    setEditService(order.service || order.title || '');
    // The description is stored in items[0].name (single-item format used by the order form)
    setEditDescription(order.items[0]?.name || '');
    setEditPickup(order.pickupLocation?.address || '');
    setEditPickupLat(order.pickupLocation?.lat);
    setEditPickupLng(order.pickupLocation?.lng);
    setEditAddress(order.deliveryLocation.address);
    setEditDeliveryLat(order.deliveryLocation.lat);
    setEditDeliveryLng(order.deliveryLocation.lng);
    setEditPhone(order.alternativePhone || order.customerPhone || '');
    setEditError('');
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editService.trim()) { setEditError('অনুগ্রহ করে একটি সার্ভিস সিলেক্ট করুন।'); return; }
    if (!editDescription.trim()) { setEditError('অনুগ্রহ করে কী করতে হবে তা লিখুন।'); return; }
    if (!editAddress.trim()) { setEditError('ডেলিভারি ঠিকানা খালি রাখা যাবে না।'); return; }
    if (!editPhone.trim()) { setEditError('অনুগ্রহ করে হোয়াটসঅ্যাপ নম্বর দিন।'); return; }
    if (!/^01[3-9]\d{8}$/.test(editPhone.trim())) {
      setEditError('অনুগ্রহ করে ১১ ডিজিটের সঠিক মোবাইল নম্বর দিন (যেমন: 01712345678)।');
      return;
    }

    // Compute diffs
    const diffs: OrderEditChange[] = [];
    const oldService = order.service || order.title || '';
    if (oldService !== editService.trim()) {
      diffs.push({ field: 'Service', oldValue: oldService, newValue: editService.trim() });
    }
    const oldDesc = order.items[0]?.name || '';
    if (oldDesc !== editDescription.trim()) {
      diffs.push({ field: 'Details / Items', oldValue: oldDesc, newValue: editDescription.trim() });
    }
    const oldPickup = order.pickupLocation?.address || '';
    if (oldPickup !== editPickup.trim()) {
      diffs.push({ field: 'Pickup Location', oldValue: oldPickup || 'None', newValue: editPickup.trim() || 'None' });
    }
    const oldDelivery = order.deliveryLocation?.address || '';
    if (oldDelivery !== editAddress.trim()) {
      diffs.push({ field: 'Delivery Address', oldValue: oldDelivery, newValue: editAddress.trim() });
    }
    const oldPhone = order.alternativePhone || order.customerPhone || '';
    if (oldPhone !== editPhone.trim()) {
      diffs.push({ field: 'Contact Phone', oldValue: oldPhone, newValue: editPhone.trim() });
    }

    const nowIso = new Date().toISOString();
    const editItem: OrderEditHistoryItem = {
      id: `ed-${Date.now()}`,
      timestamp: nowIso,
      editedBy: 'customer',
      editedByName: order.customerName || 'Customer',
      changes: diffs.length > 0 ? diffs : [{ field: 'Details', oldValue: 'Previous Details', newValue: 'Updated Details' }],
    };

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      service: editService.trim(),
      title: editService.trim(),
      items: [{ id: o.items[0]?.id || 'item-1', name: editDescription.trim(), qty: '1' }],
      pickupLocation: editPickup.trim()
        ? { address: editPickup.trim(), lat: editPickupLat, lng: editPickupLng }
        : undefined,
      deliveryLocation: {
        ...o.deliveryLocation,
        address: editAddress.trim(),
        lat: editDeliveryLat,
        lng: editDeliveryLng,
      },
      alternativePhone: editPhone.trim(),
      customerPhone: editPhone.trim(),
      updatedByCustomer: true,
      lastEditedAt: nowIso,
      lastEditedBy: 'customer',
      editHistory: [...(o.editHistory || []), editItem],
      updatedAt: nowIso,
      statusHistory: [
        ...(o.statusHistory || []),
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: nowIso,
          actor: 'Customer',
          note: `Order details updated by customer (${diffs.map((d) => d.field).join(', ') || 'Updated'})`,
        },
      ],
    }));
    setShowEditModal(false);
  };

  const canCancel = (order.status === 'PENDING' || order.status === 'ACCEPTED') && user?.uid === order.customerId;
  const canEdit = order.status !== 'ARRIVED' && order.status !== 'DELIVERED' && (order.status as string) !== 'CANCELED';
  const isDelivered = order.status === 'DELIVERED';
  const isArrivedOrDelivered = order.status === 'ARRIVED' || order.status === 'DELIVERED';
  const isCanceled = (order.status as string) === 'CANCELED';

  const validShopOrders = shopOrders.filter(so => so.status !== 'CANCELED');
  const totalShopOrdersCost = validShopOrders.reduce((sum, so) => sum + (so.price || 0), 0);
  const effectiveProductCost = totalShopOrdersCost > 0 ? totalShopOrdersCost : (order.productCost || 0);
  const effectiveDeliveryFee = order.isFreeDelivery ? 0 : Math.max(order.deliveryFee || 0, estdPricing?.minFee || 0);
  const effectiveProcessingFee = ((fallbackStore.pricingSettings.feeCalculatorProcessingFee ?? 0) > 0 && estdPricing) ? estdPricing.processingFee : 0;
  const effectiveReturnFee = (estdPricing && estdPricing.returnFee > 0) ? estdPricing.returnFee : 0;
  const effectiveDuePayment = order.appliedDuePayment?.amount || 0;
  const grandTotalPayable = effectiveProductCost + effectiveDeliveryFee + effectiveProcessingFee + effectiveReturnFee + effectiveDuePayment;

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
        <div className={`rounded-3xl p-5 text-white shadow-lg ${
          isDelivered
            ? 'bg-gradient-to-br from-emerald-600 to-teal-700'
            : isCanceled
            ? 'bg-gradient-to-br from-red-600 to-red-700'
            : 'bg-gradient-to-br from-gray-900 to-gray-800'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">Your Order</span>
            {order.status !== 'PENDING' && (
              <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full flex items-center space-x-1 ${
                isDelivered ? 'bg-white/20 text-white' : isCanceled ? 'bg-red-300/30 text-red-100' : badge.color
              }`}>
                <BadgeIcon className="w-3 h-3" />
                <span>{badge.label}</span>
              </span>
            )}
          </div>
          <h2 className="text-xl font-black mb-1">Order-#{order.id}</h2>
          <p className="text-xs text-white/60 flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>Placed: {formatPlacedDateTime(order.createdAt)}</span>
          </p>

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
          <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-950 shadow-sm space-y-2 animate-in slide-in-from-top duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Edit2 className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-extrabold text-xs text-amber-950">গ্রাহক অর্ডার তথ্য আপডেট করেছেন</span>
              </div>
              <button
                onClick={() => {
                  fallbackStore.updateOrder(order.id, (o) => ({ ...o, updatedByCustomer: false }));
                }}
                className="px-2.5 py-1 bg-amber-200/80 hover:bg-amber-300 text-amber-950 rounded-xl text-[10px] font-extrabold border border-amber-300/80 transition-all active:scale-95 shrink-0"
              >
                ঠিক আছে (Dismiss)
              </button>
            </div>

            {order.editHistory && order.editHistory.length > 0 && (
              <div className="bg-amber-100/60 rounded-xl p-2.5 text-xs space-y-1.5 border border-amber-200/70">
                {order.editHistory[order.editHistory.length - 1].changes.map((c, idx) => (
                  <div key={idx} className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                    <span className="font-bold text-amber-900">{c.field}:</span>
                    <div className="font-medium text-right">
                      <span className="line-through text-amber-700/60 mr-1.5 text-[10px]">{c.oldValue || 'None'}</span>
                      <span className="text-amber-950 font-black bg-white border border-amber-300 px-2 py-0.5 rounded-md inline-block">
                        {c.newValue}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {isCanceled && (
          <div className="p-4 rounded-3xl bg-red-50 border border-red-200 flex items-center space-x-3">
            <XCircle className="w-8 h-8 text-red-500 shrink-0" />
            <div>
              <p className="font-extrabold text-red-900 text-sm">Order Cancelled</p>
              <p className="text-xs text-red-600 font-medium mt-0.5">This order has been cancelled.</p>
            </div>
          </div>
        )}

        {/* ── PROGRESS TRACKER (not shown for cancelled) ── */}
        {!isCanceled && (
          <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft">
            <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-4">Order Progress</h3>
            <div className="space-y-3">
              {steps.map((step, i) => {
                const state = getStepState(step.status);
                const StepIcon = step.icon;
                return (
                  <div key={step.status} className="flex items-center space-x-3">
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                      state === 'COMPLETED'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : state === 'CURRENT'
                        ? 'bg-emerald-500 text-white ring-4 ring-emerald-100 shadow-md'
                        : 'bg-gray-100 text-gray-300'
                    }`}>
                      {state === 'COMPLETED'
                        ? <Check className="w-4 h-4" />
                        : <StepIcon className={`w-4 h-4 ${state === 'CURRENT' ? 'animate-bounce' : ''}`} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold leading-tight ${
                        state === 'CURRENT' ? 'text-emerald-700' : state === 'COMPLETED' ? 'text-gray-900' : 'text-gray-300'
                      }`}>
                        {step.label}
                      </p>
                      {state === 'CURRENT' && (
                        <p className="text-[11px] text-emerald-600 font-medium mt-0.5">{step.desc}</p>
                      )}
                    </div>
                    {state === 'CURRENT' && (
                      <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── HELPER OR ADMIN CONTACT (shown when helper is assigned OR admin accepted) ── */}
        {(order.helperId || showAdminAccepted) && (
          <div className="bg-white rounded-3xl border border-emerald-100 p-4 shadow-soft space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-lg shadow-md shrink-0">
                {order.helperId ? helperName.charAt(0).toUpperCase() : 'A'}
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                  {order.helperId ? 'Your Helper' : 'Admin Support'}
                </p>
                <h4 className="font-black text-base text-gray-900 leading-tight">
                  {order.helperId ? helperName : 'Jamanot Admin'}
                </h4>
                {(helperPhone || (!order.helperId && (fallbackStore.pricingSettings.helperCenterPhone1 || fallbackStore.pricingSettings.helperCenterPhone2))) && (
                  <p className="text-xs font-bold text-gray-500 mt-0.5">
                    {order.helperId ? helperPhone : (fallbackStore.pricingSettings.helperCenterPhone1 || fallbackStore.pricingSettings.helperCenterPhone2)}
                  </p>
                )}
              </div>
              <span className={`ml-auto px-2.5 py-1 rounded-full text-white font-extrabold text-[10px] flex items-center space-x-1 shrink-0 ${order.helperId ? 'bg-emerald-600' : 'bg-purple-600'}`}>
                {order.helperId ? <UserCheck className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                <span>{order.helperId ? 'Active' : 'Admin Accepted'}</span>
              </span>
            </div>

            {(helperPhone || (!order.helperId && (fallbackStore.pricingSettings.helperCenterPhone1 || fallbackStore.pricingSettings.helperCenterPhone2))) ? (
              <div className="flex space-x-2">
                <a
                  href={`tel:${order.helperId ? helperPhone : (fallbackStore.pricingSettings.helperCenterPhone1 || fallbackStore.pricingSettings.helperCenterPhone2)}`}
                  className="flex-1 py-2.5 px-3 rounded-2xl bg-gray-100 text-gray-900 font-extrabold text-xs flex items-center justify-center space-x-1.5 hover:bg-gray-200 active:scale-95 transition-all"
                >
                  <Phone className="w-4 h-4 text-gray-600" />
                  <span>Call</span>
                </a>
                <a
                  href={getWhatsAppUrl(order.helperId ? helperPhone! : (fallbackStore.pricingSettings.helperCenterPhone1 || fallbackStore.pricingSettings.helperCenterPhone2 || ''))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 px-3 rounded-2xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow-md"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>WhatsApp</span>
                </a>
              </div>
            ) : (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-2xl p-3 text-center font-medium">Contact info not provided.</p>
            )}
          </div>
        )}





        {/* ── ORDER ITEMS ── */}
        <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">
              Items Ordered ({(order.items || []).length})
            </h3>
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
            {(order.items || []).map((it) => (
              <div key={it.id} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100 text-xs">
                <span className="font-semibold text-gray-800">{it.name}</span>
              </div>
            ))}
          </div>
          {order.additionalNote && (
            <div className="mt-3 p-3 rounded-2xl bg-amber-50/70 border border-amber-100 text-xs text-amber-900">
              <span className="font-extrabold block mb-0.5">Your Note:</span>
              <span>{order.additionalNote}</span>
            </div>
          )}
          {(order.alternativePhone || order.customerPhone) && (
            <div className="mt-2 p-3 rounded-2xl bg-gray-50 border border-gray-100 text-xs text-gray-700 flex items-center space-x-2">
              <Phone className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <span className="font-semibold">Contact: <span className="font-bold text-gray-900">{order.alternativePhone || order.customerPhone}</span></span>
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

        {/* ── MINIMALIST ORDER EDIT HISTORY LOG ── */}
        {order.editHistory && order.editHistory.length > 0 && (
          <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span>Order Update History</span>
              </h3>
              <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                {order.editHistory.length} edit{order.editHistory.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-2">
              {order.editHistory.slice().reverse().map((historyItem) => (
                <div key={historyItem.id} className="p-3 rounded-2xl bg-gray-50/80 border border-gray-100 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 font-semibold border-b border-gray-200/60 pb-1">
                    <span>Updated on {formatPlacedDateTime(historyItem.timestamp)}</span>
                    <span className="font-bold text-gray-700">{historyItem.editedByName || historyItem.editedBy}</span>
                  </div>
                  <div className="space-y-1 pt-0.5">
                    {historyItem.changes.map((c, idx) => (
                      <div key={idx} className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                        <span className="font-semibold text-gray-600">{c.field}:</span>
                        <div className="text-right font-medium">
                          <span className="line-through text-gray-400 text-[10px] mr-1.5">{c.oldValue || 'None'}</span>
                          <span className="text-gray-900 font-bold bg-white border border-gray-200 px-2 py-0.5 rounded-lg inline-block text-[11px]">
                            {c.newValue}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ADDRESSES ── */}
        <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft space-y-3">
          <div>
            <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-2">Pickup Location</h3>
            <div className="flex items-start space-x-2.5 p-3 rounded-2xl bg-gray-50 border border-gray-100">
              <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-gray-900">{order.pickupLocation?.address || 'Local Helper Area (No specific pickup set)'}</p>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-2">Delivery Address</h3>
            <div className="flex items-start space-x-2.5 p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-gray-900">{order.deliveryLocation?.address || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* ── CALCULATION SUMMARY ── */}
        {estdPricing && (
          <div ref={calculationSummaryRef} className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft space-y-3 animate-in fade-in duration-200">
            <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider flex items-center space-x-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>Calculation Summary</span>
            </h3>
            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-2.5 text-xs font-semibold text-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-bold">Product cost</span>
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

              {(fallbackStore.pricingSettings.feeCalculatorProcessingFee ?? 0) > 0 && estdPricing.processingFee > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-bold">Processing Fee</span>
                  <span className="font-bold text-gray-900">৳{estdPricing.processingFee}</span>
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
                <span className="font-bold text-gray-900 text-sm">Total Payable Amount (মোট বিল)</span>
                <span className="text-base font-black text-emerald-800">
                  ৳{grandTotalPayable}
                </span>
              </div>
            </div>
          </div>
        )}

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
                            {isMyself && (
                              <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded-md border border-purple-200 inline-block mt-0.5">
                                Custom Cost (কাস্টম খরচ)
                              </span>
                            )}
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

                      {/* Store Numbers (Manager + Owner or Custom Seller) */}
                      {(ownerNum || managerNum || customSellerNum) && (
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

                          {customSellerNum && (
                            <a
                              href={`tel:${customSellerNum}`}
                              className="text-[10px] font-bold text-purple-800 hover:text-purple-900 flex items-center gap-1 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded-lg border border-purple-200/80 transition-all active:scale-95 shadow-2xs"
                              title="কল করুন"
                            >
                              <Phone className="w-2.5 h-2.5 text-purple-600 shrink-0" />
                              <span className="font-mono font-black">{customSellerNum}</span>
                            </a>
                          )}
                        </div>
                      )}

                      {/* Item Details */}
                      {so.requestText && (
                        <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 text-xs shadow-2xs">
                          <p className="text-gray-800 font-semibold leading-relaxed">
                            {so.requestText}
                          </p>
                        </div>
                      )}
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
                          <p className="text-gray-800 font-semibold leading-relaxed">
                            {order.items && order.items.length > 0
                              ? order.items.map((it) => it.name).join(', ')
                              : (order.additionalNote || 'ক্রয়কৃত পণ্যের মোট বিল')}
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
                        <p className="text-gray-800 font-semibold leading-relaxed">
                          {order.items && order.items.length > 0
                            ? order.items.map((it) => it.name).join(', ')
                            : (order.additionalNote || 'ক্রয়কৃত পণ্যের মোট বিল')}
                        </p>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* ── COMPLETED ORDER DUE PAYMENT MANAGEMENT (ADMIN & HELPER) OR DISPLAY (CUSTOMER) ── */}
        {isDelivered && (order.duePayment || user?.role === 'admin' || user?.role === 'helper' || user?.isAdmin || user?.isHelper || user?.lastActiveMode === 'admin' || user?.lastActiveMode === 'helper') && (
          <div className="bg-white rounded-3xl border border-purple-100 p-4 shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-purple-600" />
                <div>
                  <h3 className="font-extrabold text-sm text-gray-900">বাকি পেমেন্ট (Due Payment)</h3>
                  <p className="text-[11px] text-gray-500 font-medium">
                    {order.duePayment
                      ? 'এই অর্ডারের বকেয়া বাকি পেমেন্টের বিবরণ'
                      : 'পরবর্তী অর্ডারে যুক্ত করার জন্য কাস্টমারের বাকি পেমেন্ট রেকর্ড'}
                  </p>
                </div>
              </div>
              {(user?.role === 'admin' || user?.role === 'helper' || user?.isAdmin || user?.isHelper || user?.lastActiveMode === 'admin' || user?.lastActiveMode === 'helper') && (
                <button
                  onClick={openDueModal}
                  className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs border border-purple-200 transition-all active:scale-95 flex items-center space-x-1"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>{order.duePayment ? 'এডিট করুন' : '+ বাকি যোগ করুন'}</span>
                </button>
              )}
            </div>

            {order.duePayment ? (
              <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-200/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-purple-900">বাকি পরিমাণ:</span>
                  <span className="text-base font-black text-purple-950">৳{order.duePayment.amount}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-600 font-semibold">স্ট্যাটাস:</span>
                  <span className={`px-2 py-0.5 rounded-md font-extrabold text-[10px] ${order.duePayment.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                    {order.duePayment.status === 'PAID' ? '✓ পরিশোধিত (PAID)' : '⚠️ বকেয়া (UNPAID)'}
                  </span>
                </div>
                {order.duePayment.note && (
                  <div className="text-[11px] text-purple-950 font-medium pt-1 border-t border-purple-200/60">
                    <strong>কারণ/নোট:</strong> {order.duePayment.note}
                  </div>
                )}
                {order.duePayment.addedByName && (
                  <div className="text-[10px] text-gray-500 italic">
                    যোগ করেছেন: {order.duePayment.addedByName} ({order.duePayment.addedBy})
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 font-medium italic bg-gray-50 p-3 rounded-2xl text-center">
                এই অর্ডারে কোনো বাকি পেমেন্ট যোগ করা নেই।
              </p>
            )}
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

      {/* ── EDIT ORDER MODAL ── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-emerald-100 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="font-black text-base text-gray-900">Edit Order</h3>
                <p className="text-[11px] text-gray-500 font-medium mt-0.5">Changes saved before helper picks up</p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Service Selection */}
              <div>
                <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider block mb-2">সার্ভিস *</label>
                <div className="relative">
                  <select
                    value={editService}
                    onChange={(e) => { setEditService(e.target.value); setEditError(''); }}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-sm text-gray-900 appearance-none pr-10 font-semibold"
                  >
                    <option value="" disabled>সার্ভিস সিলেক্ট করুন *</option>
                    {editServices.map((srv) => (
                      <option key={srv} value={srv}>{srv}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider block mb-2">Details</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => { setEditDescription(e.target.value); setEditError(''); }}
                  placeholder={getServiceDescriptionHint(editService, fallbackStore.pricingSettings)}
                  className="w-full px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 focus:border-emerald-500 outline-none text-sm text-gray-900 resize-none h-28 placeholder-gray-400"
                />
              </div>

              {/* Pickup / Source Location (optional) */}
              <div>
                <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider block mb-2">কোথা থেকে নিতে হবে?</label>
                <div className="relative group">
                  <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600 pointer-events-none" />
                  <input
                    type="text"
                    value={editPickup}
                    onChange={(e) => setEditPickup(e.target.value)}
                    onClick={() => {
                      if (!mapHasError) setShowPickupMapPicker(true);
                    }}
                    placeholder="কোথা থেকে নিতে হবে? (ম্যাপ সিলেক্ট করতে ক্লিক করুন)"
                    className="w-full pl-10 pr-10 py-3 rounded-2xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-sm text-gray-900 placeholder-gray-400 font-medium transition-colors cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPickupMapPicker(true)}
                    title="ম্যাপ থেকে স্থান নির্বাচন করুন"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-emerald-600 hover:bg-emerald-50 active:scale-95 transition-all"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Delivery Address */}
              <div>
                <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider block mb-2">ডেলিভারি ঠিকানা *</label>
                <div className="relative group">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600 pointer-events-none" />
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => { setEditAddress(e.target.value); setEditError(''); }}
                    onClick={() => {
                      if (!mapHasError) setShowDeliveryMapPicker(true);
                    }}
                    placeholder="ডেলিভারি ঠিকানা (ম্যাপ সিলেক্ট করতে ক্লিক করুন) *"
                    className="w-full pl-10 pr-10 py-3 rounded-2xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-sm text-gray-900 placeholder-gray-400 font-medium transition-colors cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeliveryMapPicker(true)}
                    title="ম্যাপ থেকে ঠিকানা নির্বাচন করুন"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-emerald-600 hover:bg-emerald-50 active:scale-95 transition-all"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* WhatsApp Number */}
              <div>
                <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider block mb-2">হোয়াটসঅ্যাপ নম্বর *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => { setEditPhone(e.target.value); setEditError(''); }}
                    placeholder="হোয়াটসঅ্যাপ নম্বর *"
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-sm text-gray-900 placeholder-gray-400"
                  />
                </div>
              </div>

              {editError && (
                <p className="text-[11px] text-red-600 font-bold bg-red-50 px-3 py-2 rounded-xl border border-red-100">
                  {editError}
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 pb-5 pt-3 border-t border-gray-100 shrink-0 flex space-x-2">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="flex-1 py-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs transition-all"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/25 transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Map Picker Modals */}
      <MapPickerModal
        isOpen={showPickupMapPicker}
        onClose={() => setShowPickupMapPicker(false)}
        title="কোথা থেকে আনতে হবে বা করতে হবে?"
        initialLocation={{
          address: editPickup,
          lat: editPickupLat,
          lng: editPickupLng,
        }}
        addressLabel="Name of Store, Market or Area"
        addressPlaceholder="Name of Store, Market or Area"
        onMapError={() => setMapHasError(true)}
        onSelectLocation={(loc) => {
          setEditPickup(loc.address);
          if (loc.lat) setEditPickupLat(loc.lat);
          if (loc.lng) setEditPickupLng(loc.lng);
        }}
      />

      <MapPickerModal
        isOpen={showDeliveryMapPicker}
        onClose={() => setShowDeliveryMapPicker(false)}
        title="ডেলিভারি ঠিকানা সিলেক্ট করুন"
        initialLocation={{
          address: editAddress,
          lat: editDeliveryLat,
          lng: editDeliveryLng,
        }}
        addressLabel="Your Building name & flat no"
        addressPlaceholder="Your Building name & flat no"
        onMapError={() => setMapHasError(true)}
        onSelectLocation={(loc) => {
          setEditAddress(loc.address);
          if (loc.lat) setEditDeliveryLat(loc.lat);
          if (loc.lng) setEditDeliveryLng(loc.lng);
        }}
      />

      {/* ── DUE PAYMENT ADD/EDIT MODAL ── */}
      {showDueModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-100">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-purple-600" />
                <h3 className="font-extrabold text-base text-gray-900">
                  {order.duePayment ? 'বাকি পেমেন্ট এডিট করুন' : 'নতুন বাকি পেমেন্ট যোগ করুন'}
                </h3>
              </div>
              <button
                onClick={() => setShowDueModal(false)}
                className="p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDuePayment} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-gray-700 mb-1">
                  বাকি টাকার পরিমাণ (৳) *
                </label>
                <input
                  type="number"
                  value={dueAmountInput}
                  onChange={(e) => setDueAmountInput(e.target.value)}
                  placeholder="যেমন: ৫০"
                  min="1"
                  step="any"
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-sm font-bold text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-gray-700 mb-1">
                  কারণ / নোট (Note for Customer) *
                </label>
                <textarea
                  value={dueNoteInput}
                  onChange={(e) => setDueNoteInput(e.target.value)}
                  placeholder="যেমন: পণ্য ক্রয়ে দোকানে ৫০ টাকা বাকি ছিলো..."
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-sm text-gray-900 resize-none h-24"
                  required
                />
              </div>

              <p className="text-[11px] text-gray-500 leading-relaxed">
                * এই বাকি পেমেন্টটি কাস্টমারের পরবর্তী যেকোনো নতুন অর্ডারের সাথে স্বয়ংক্রিয়ভাবে যোগ হবে এবং কাস্টমার বিলের সামারিতে এর বিস্তারিত নোট দেখতে পারবেন।
              </p>

              <div className="flex items-center space-x-3 pt-2">
                {order.duePayment && (
                  <button
                    type="button"
                    onClick={handleRemoveDuePayment}
                    className="px-4 py-3 rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-xs transition-all flex items-center space-x-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>ডিলিট</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDueModal(false)}
                  className="flex-1 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-extrabold text-xs transition-all active:scale-95"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs shadow-md transition-all active:scale-95"
                >
                  সংরক্ষণ করুন
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
    </div>
  );
};
