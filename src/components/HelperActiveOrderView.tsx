import React, { useState, useEffect } from 'react';
import { Order, OrderStatus, LocationData, Shop } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { calculateHelperCommission, calculateDistanceKm, calculateEstimatedFee } from '@/lib/pricing';
import { CheckCircle2, Truck, MapPin, PackageCheck, AlertOctagon, Phone, ArrowLeft, DollarSign, Clock, HelpCircle, FileText, ShoppingBag, FileEdit, AlertTriangle, X, Sparkles, Navigation, RotateCcw, CalendarClock, Map, Check, UserCheck, Package, Percent } from 'lucide-react';
import { getStatusBadgeInfo } from './OrderCard';
import { getElapsedTime, getDeliveryDurationText, getHelperUrgencyBgClass } from '@/lib/timeUtils';
import { useModal } from './CustomModal';
import { MapPickerModal } from './MapPickerModal';
import { HelperOrderMapModal } from './HelperOrderMapModal';
import { HelperRetailerMapModal } from './HelperRetailerMapModal';
import { HelperRetailerDetailsModal } from './HelperRetailerDetailsModal';


interface HelperActiveOrderViewProps {
  order: Order;
  helperLocation?: LocationData & { updatedAt?: string };
  onBack: () => void;
  onAccept?: (orderId: string) => void;
  activeOrdersCount?: number;
  activeOrderLimit?: number;
}

export const HelperActiveOrderView: React.FC<HelperActiveOrderViewProps> = ({
  order,
  helperLocation,
  onBack,
  onAccept,
  activeOrdersCount,
  activeOrderLimit,
}) => {
  const [productCostInput, setProductCostInput] = useState(order.productCost !== undefined ? String(order.productCost) : '');
  const [showCostModal, setShowCostModal] = useState(false);
  const [feeInput, setFeeInput] = useState(order.deliveryFee ? String(order.deliveryFee) : '');
  const [feeReason, setFeeReason] = useState('');
  const [showFeeModal, setShowFeeModal] = useState(false);
  const { showConfirm, showAlert } = useModal();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  // Helper Private Note state
  const [helperNoteInput, setHelperNoteInput] = useState(order.helperNote || '');
  const [noteSavedAlert, setNoteSavedAlert] = useState(false);

  // Custom Celebratory Completion Modal state
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [earnedAmount, setEarnedAmount] = useState(0);

  // Need Delivery Back state
  const [showDeliveryBackModal, setShowDeliveryBackModal] = useState(false);
  const [deliveryBackTimeInput, setDeliveryBackTimeInput] = useState(
    order.deliveryBackTime
      ? order.deliveryBackTime.substring(0, 16)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          return d.toISOString().substring(0, 16);
        })()
  );

  const [weightInput, setWeightInput] = useState(order.weightKg !== undefined ? String(order.weightKg) : '0');

  useEffect(() => {
    if (order.productCost !== undefined) setProductCostInput(String(order.productCost));
    if (order.weightKg !== undefined) setWeightInput(String(order.weightKg));
  }, [order.productCost, order.weightKg]);

  const [activeMapPicker, setActiveMapPicker] = useState<'pickup' | 'delivery' | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [returnWhen, setReturnWhen] = useState<'now' | 'schedule'>('schedule');

  // Retailer map & details state
  const [showRetailerMap, setShowRetailerMap] = useState(false);
  const [retailerDetailsShop, setRetailerDetailsShop] = useState<Shop | null>(null);
  const [searchShopQuery, setSearchShopQuery] = useState('');

  const selectedShopIds = order.selectedShopIds || [];
  const selectedShops = Array.from(fallbackStore.shops.values()).filter((s) => selectedShopIds.includes(s.id));

  // Filter and sort nearby shops
  const allShops = Array.from(fallbackStore.shops.values());
  const maxDistance = fallbackStore.pricingSettings.helperRadiusKm ?? 3.5;

  const nearbyShops = allShops.filter((shop) => {
    if (!shop.location?.lat || !shop.location?.lng) return true; // Show as fallback if coordinates missing

    const distToPickup = (order.pickupLocation?.lat && order.pickupLocation?.lng)
      ? calculateDistanceKm(shop.location.lat, shop.location.lng, order.pickupLocation.lat, order.pickupLocation.lng)
      : null;

    const distToDelivery = (order.deliveryLocation?.lat && order.deliveryLocation?.lng)
      ? calculateDistanceKm(shop.location.lat, shop.location.lng, order.deliveryLocation.lat, order.deliveryLocation.lng)
      : null;

    const distToHelper = (helperLocation?.lat && helperLocation?.lng)
      ? calculateDistanceKm(shop.location.lat, shop.location.lng, helperLocation.lat, helperLocation.lng)
      : null;

    const minDistance = Math.min(
      ...([distToPickup, distToDelivery, distToHelper].filter((d) => d !== null) as number[])
    );

    if (minDistance === Infinity) return true;
    return minDistance <= maxDistance;
  });

  const filteredShops = nearbyShops.filter((shop) => {
    const q = searchShopQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      shop.name.toLowerCase().includes(q) ||
      shop.type.toLowerCase().includes(q) ||
      (shop.contactPerson && shop.contactPerson.toLowerCase().includes(q)) ||
      (shop.whatsapp && shop.whatsapp.toLowerCase().includes(q)) ||
      (shop.location?.address && shop.location.address.toLowerCase().includes(q))
    );
  });

  const handleToggleShopSelection = (shopId: string) => {
    const isSelected = selectedShopIds.includes(shopId);
    const newIds = isSelected
      ? selectedShopIds.filter((id) => id !== shopId)
      : [...selectedShopIds, shopId];

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      selectedShopIds: newIds,
    }));
  };

  const handleDeselectShop = (shopId: string) => {
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      selectedShopIds: (o.selectedShopIds || []).filter((id) => id !== shopId),
    }));
  };

  const handleSaveEditedAddress = (type: 'pickup' | 'delivery', loc: LocationData) => {
    fallbackStore.updateOrder(order.id, (o) => {
      const changes = [];
      const oldVal = type === 'pickup' ? (o.pickupLocation?.address || 'N/A') : (o.deliveryLocation?.address || 'N/A');
      changes.push({
        field: type === 'pickup' ? 'Pickup Address' : 'Delivery Address',
        oldValue: oldVal,
        newValue: loc.address,
      });

      const updatedOrder = {
        ...o,
        pickupLocation: type === 'pickup' ? loc : o.pickupLocation,
        deliveryLocation: type === 'delivery' ? loc : o.deliveryLocation,
        lastEditedBy: 'helper' as const,
        lastEditedAt: new Date().toISOString(),
        updatedByCustomer: false,
        editHistory: [
          ...(o.editHistory || []),
          {
            id: `eh-${Date.now()}`,
            timestamp: new Date().toISOString(),
            editedBy: 'helper' as const,
            editedByName: o.helperName || 'Helper',
            changes,
          },
        ],
        statusHistory: [
          ...(o.statusHistory || []),
          {
            id: `sh-${Date.now()}`,
            status: o.status,
            timestamp: new Date().toISOString(),
            actor: `Helper (${o.helperName || 'Helper'})`,
            note: `${type === 'pickup' ? 'Pickup' : 'Delivery'} address updated to: ${loc.address}`,
          },
        ],
      };
      return updatedOrder;
    });
    showAlert('ঠিকানা আপডেট করা হয়েছে', 'ঠিকানা সফলভাবে পরিবর্তন করা হয়েছে এবং কাস্টমারকে জানানো হয়েছে।', 'success');
  };

  const customerProfile = fallbackStore.users.get(order.customerId);
  const customerLabels = customerProfile?.labels || [];

  const distanceKm = (order.pickupLocation?.lat && order.pickupLocation?.lng && order.deliveryLocation?.lat && order.deliveryLocation?.lng)
    ? parseFloat(calculateDistanceKm(order.pickupLocation.lat, order.pickupLocation.lng, order.deliveryLocation.lat, order.deliveryLocation.lng).toFixed(2))
    : 0;

  const estdPricing = calculateEstimatedFee({
    distanceKm: Math.ceil(distanceKm),
    weightKg: Math.ceil(order.weightKg || 0),
    isReturnRequested: !!order.needReturnItems && !order.needDeliveryBack,
    productPrice: order.productCost || 0,
  }, fallbackStore.pricingSettings);

  // Validation: helper must enter product cost (which auto-sets delivery fee) before advancing
  const hasCostAndFee = order.productCost !== undefined;

  const badge = getStatusBadgeInfo(order.status);

  const isDone = order.status === 'DELIVERED' || order.status === 'CANCELED';
  const endTimestamp = order.deliveredAt || order.cancelledAt || order.updatedAt;
  const urgency = getHelperUrgencyBgClass(order.createdAt, isDone);

  const [elapsed, setElapsed] = useState(() =>
    isDone
      ? getDeliveryDurationText(order.createdAt, endTimestamp)
      : getElapsedTime(order.createdAt)
  );

  useEffect(() => {
    if (isDone) return;
    // Pause live timer only if Two-Way AND scheduled (not instant)
    if (order.needDeliveryBack && order.deliveryBackTime) return;
    const timer = setInterval(() => {
      setElapsed(getElapsedTime(order.createdAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [order.createdAt, isDone, order.needDeliveryBack, order.deliveryBackTime]);

  const handleUpdateStatus = (newStatus: OrderStatus, note?: string) => {
    fallbackStore.updateOrder(order.id, (o) => {
      const updatedHistory = [
        ...(o.statusHistory || []),
        {
          id: `sh-${Date.now()}`,
          status: newStatus,
          timestamp: new Date().toISOString(),
          actor: `Helper (${o.helperName || 'Helper'})`,
          note: note || `Status updated to ${newStatus}`,
        },
      ];

      const updateData: Partial<Order> = {
        status: newStatus,
        statusHistory: updatedHistory,
      };

      if (newStatus === 'PURCHASED_EXECUTED') updateData.purchasedAt = new Date().toISOString();
      if (newStatus === 'ON_THE_WAY') updateData.onTheWayAt = new Date().toISOString();
      if (newStatus === 'ARRIVED') updateData.arrivedAt = new Date().toISOString();
      if (newStatus === 'DELIVERED') updateData.deliveredAt = new Date().toISOString();

      return { ...o, ...updateData };
    });
  };

  const toggleItemPurchased = (itemId: string) => {
    if (isDone) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      items: o.items.map((i) => (i.id === itemId ? { ...i, purchased: !i.purchased } : i)),
    }));
  };

  const [showUncheckedModal, setShowUncheckedModal] = useState(false);
  const [pendingNextStatus, setPendingNextStatus] = useState<OrderStatus | null>(null);
  const [uncheckedNote, setUncheckedNote] = useState('');
  const [uncheckedError, setUncheckedError] = useState('');

  const handleUpdateStatusWithCheck = (newStatus: OrderStatus, note?: string) => {
    // Guard: product cost must be entered before advancing past ACCEPTED
    if (order.productCost === undefined) {
      showAlert(
        'Product Cost Required',
        'You must enter the total product cost first. This auto-calculates the delivery fee. You cannot proceed without completing this step.',
        'warning'
      );
      return;
    }

    const allChecked = (order.items || []).every((i) => i.purchased);
    if (!allChecked && !note) {
      setPendingNextStatus(newStatus);
      setUncheckedNote('');
      setUncheckedError('');
      setShowUncheckedModal(true);
      return;
    }

    handleUpdateStatus(newStatus, note);
  };

  const handleConfirmUncheckedSubmission = (e: React.FormEvent) => {
    e.preventDefault();
    // Guard: product cost must still be set even after bypassing unchecked items
    if (order.productCost === undefined) {
      showAlert(
        'Product Cost Required',
        'You must enter the total product cost first before proceeding.',
        'warning'
      );
      setShowUncheckedModal(false);
      return;
    }
    if (!uncheckedNote.trim()) {
      setUncheckedError('অগ্রসর হতে হলে একটি নোট/কারণ লিখুন।');
      return;
    }
    if (pendingNextStatus) {
      handleUpdateStatus(pendingNextStatus, uncheckedNote.trim());
      setShowUncheckedModal(false);
      setPendingNextStatus(null);
      setUncheckedNote('');
    }
  };

  const handleSaveProductCost = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(productCostInput);
    if (isNaN(val) || val < 0) return;

    const currentWeight = parseFloat(weightInput) || 0;
    const settings = fallbackStore.pricingSettings;
    
    const estdBase = calculateEstimatedFee({
      distanceKm: Math.ceil(distanceKm),
      weightKg: 0,
      isReturnRequested: !!order.needReturnItems && !order.needDeliveryBack,
      productPrice: 0,
    }, settings);

    const perKgRate = settings.feeCalculatorPerKgRate ?? 5;
    const weightFee = Math.ceil(currentWeight) * perKgRate;

    let finalFee = 0;
    if (order.needDeliveryBack) {
      finalFee = estdBase.totalFee * 2 + weightFee;
    } else {
      const estd = calculateEstimatedFee({
        distanceKm: Math.ceil(distanceKm),
        weightKg: Math.ceil(currentWeight),
        isReturnRequested: !!order.needReturnItems,
        productPrice: 0,
      }, settings);
      finalFee = estd.totalFee;
    }

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      productCost: val,
      deliveryFee: finalFee,
      originalDeliveryFee: finalFee,
    }));
    setShowCostModal(false);
  };

  const updateEstdPricing = (newCost: number, newWeight: number) => {
    const settings = fallbackStore.pricingSettings;
    
    const estdBase = calculateEstimatedFee({
      distanceKm: Math.ceil(distanceKm),
      weightKg: 0,
      isReturnRequested: !!order.needReturnItems && !order.needDeliveryBack,
      productPrice: 0,
    }, settings);

    const perKgRate = settings.feeCalculatorPerKgRate ?? 5;
    const weightFee = Math.ceil(newWeight) * perKgRate;

    let finalFee = 0;
    if (order.needDeliveryBack) {
      finalFee = estdBase.totalFee * 2 + weightFee;
    } else {
      const estd = calculateEstimatedFee({
        distanceKm: Math.ceil(distanceKm),
        weightKg: Math.ceil(newWeight),
        isReturnRequested: !!order.needReturnItems,
        productPrice: 0,
      }, settings);
      finalFee = estd.totalFee;
    }

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      productCost: newCost,
      weightKg: newWeight,
      deliveryFee: finalFee,
      originalDeliveryFee: finalFee,
    }));
  };

  const handleSaveDeliveryFee = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(feeInput);
    if (isNaN(val) || val < 0) return;

    fallbackStore.updateOrder(order.id, (o) => {
      const updatedHistory = [
        ...(o.statusHistory || []),
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: `Helper (${o.helperName || 'Helper'})`,
          note: `Delivery fee adjusted to ৳${val}${feeReason.trim() ? `: ${feeReason.trim()}` : ''}`,
        },
      ];

      return {
        ...o,
        deliveryFee: val,
        feeAdjustment: feeReason.trim()
          ? {
               amount: val,
              reason: feeReason.trim(),
              status: 'APPROVED',
              requestedAt: new Date().toISOString(),
            }
          : o.feeAdjustment,
        statusHistory: updatedHistory,
      };
    });
    setShowFeeModal(false);
  };

  const handleRequestCancellation = () => {
    setCancelReason('');
    setCancelError('');
    setShowCancelModal(true);
  };

  const handleConfirmCancellationRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      setCancelError('বাতিলের কারণ অনুগ্রহ করে উল্লেখ করুন।');
      return;
    }
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      cancellationRequest: {
        requestedBy: 'helper',
        reason: cancelReason.trim(),
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      },
      statusHistory: [
        ...(o.statusHistory || []),
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: `Helper (${o.helperName || 'Helper'})`,
          note: `Requested order cancellation. Reason: ${cancelReason.trim()}`,
        },
      ],
    }));
    setShowCancelModal(false);
  };

  const handleSaveHelperNote = (e: React.FormEvent) => {
    e.preventDefault();
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      helperNote: helperNoteInput.trim(),
    }));
    setNoteSavedAlert(true);
    setTimeout(() => setNoteSavedAlert(false), 2500);
  };

  const getDirectionsUrl = () => {
    const deliveryDest = order.deliveryLocation.lat && order.deliveryLocation.lng
      ? `${order.deliveryLocation.lat},${order.deliveryLocation.lng}`
      : encodeURIComponent(order.deliveryLocation.address);

    if (order.pickupLocation?.address) {
      const pickupWaypoint = order.pickupLocation.lat && order.pickupLocation.lng
        ? `${order.pickupLocation.lat},${order.pickupLocation.lng}`
        : encodeURIComponent(order.pickupLocation.address);

      return `https://www.google.com/maps/dir/?api=1&destination=${deliveryDest}&waypoints=${pickupWaypoint}`;
    }

    return `https://www.google.com/maps/dir/?api=1&destination=${deliveryDest}`;
  };

  const handleConfirmDeliveryWithModal = () => {
    const earned = calculateHelperCommission(order.deliveryFee, fallbackStore.pricingSettings);
    setEarnedAmount(earned);
    handleUpdateStatus('DELIVERED');
    setShowCompletionModal(true);
  };

  return (
    <div className="w-full bg-white min-h-screen pb-20 animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="sticky top-14 z-20 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-2 rounded-2xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex items-center space-x-1"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-xs font-bold">Back</span>
        </button>
        <div className="flex items-center gap-2 flex-1 justify-center min-w-0 px-1">
          <span className="font-extrabold text-sm text-gray-800 truncate min-w-0">{order.service || order.title || 'Helper Order'}</span>
          <span className="text-[10px] font-black font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200 shrink-0">#{order.id}</span>
        </div>
        <div className="w-8" />
      </div>

      <div className="max-w-md mx-auto p-4 space-y-5">
        {/* DYNAMIC URGENCIES TIMER BLOCK */}
        <div className={`relative w-full rounded-2xl py-3 px-4 flex flex-col items-center justify-center transition-all ${
          urgency.urgencyLevel === 'red'
            ? 'bg-gradient-to-br from-red-100 via-rose-50 to-red-100 border-2 border-red-400 shadow-md shadow-red-100'
            : urgency.urgencyLevel === 'yellow'
            ? 'bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-100 border-2 border-amber-400 shadow-sm shadow-amber-100'
            : 'bg-red-50/10 border border-red-500'
        }`}>
          {customerLabels.length > 0 && (
            <div className="absolute top-2 right-2 flex flex-wrap gap-1 max-w-[50%] justify-end">
              {customerLabels.map((lbl, idx) => (
                <span
                  key={idx}
                  className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-[9px] font-black px-2 py-0.5 rounded-full border border-white/20 shadow-xs uppercase tracking-wider"
                >
                  {lbl}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center space-x-2.5">
            <Clock className={`w-5 h-5 ${
              urgency.urgencyLevel === 'red'
                ? 'text-red-700 animate-spin'
                : urgency.urgencyLevel === 'yellow'
                ? 'text-amber-700 animate-spin-slow'
                : 'text-red-600 animate-pulse'
            }`} />
            <span className={`text-xs font-black uppercase tracking-wider ${
              urgency.urgencyLevel === 'red' ? 'text-red-950' : urgency.urgencyLevel === 'yellow' ? 'text-amber-950' : 'text-red-600'
            }`}>
              {isDone ? 'Duration:' : 'Live:'}
            </span>
            <span className={`text-xl font-black font-mono ${
              urgency.urgencyLevel === 'red' ? 'text-red-950' : urgency.urgencyLevel === 'yellow' ? 'text-amber-950' : 'text-red-600'
            }`}>
              {elapsed}
            </span>
          </div>

          {!isDone && urgency.urgencyLevel === 'red' && (
            <p className="mt-1.5 text-[11px] font-black text-red-700 bg-red-200/80 px-3 py-1 rounded-full border border-red-300 text-center animate-pulse">
              🚨 55+ মিনিট অতিক্রান্ত! দ্রুত ডেলিভারি সম্পন্ন করুন!
            </p>
          )}

          {!isDone && urgency.urgencyLevel === 'yellow' && (
            <p className="mt-1.5 text-[11px] font-black text-amber-900 bg-amber-200/80 px-3 py-1 rounded-full border border-amber-300 text-center">
              ⚠️ 40+ মিনিট অতিক্রান্ত! দ্রুত পৌঁছানোর চেষ্টা করুন।
            </p>
          )}

          {order.needDeliveryBack && order.deliveryBackTime && (
            <div className="mt-2 flex items-center space-x-1.5 bg-indigo-100/70 px-3 py-1.5 rounded-full border border-indigo-200/60 w-full justify-center">
              <CalendarClock className="w-3 h-3 text-indigo-600 shrink-0" />
              <span className="text-[10px] font-extrabold text-indigo-800 text-center">
                ⏸ Two-Way • ফিরবেন: {new Date(order.deliveryBackTime).toLocaleString('en-BD', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>
          )}
        </div>

        {/* Horizontal Status Tracker */}
        {order.status !== 'CANCELED' && (
          <div className="w-full bg-white rounded-2xl border border-gray-100 px-3 py-3 shadow-soft">
            <div className="flex items-start">
              {(['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'SCHEDULED', 'ARRIVED', 'DELIVERED'] as const).map((statusKey, idx, arr) => {
                const labels: Record<string, string> = {
                  ACCEPTED: 'Accepted',
                  PURCHASED_EXECUTED: 'Processing',
                  ON_THE_WAY: 'On-Way',
                  SCHEDULED: 'scheduled',
                  ARRIVED: 'Arrived',
                  DELIVERED: 'Delivered',
                };
                const statusOrder = ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'SCHEDULED', 'ARRIVED', 'DELIVERED'];
                let currentIdx = statusOrder.indexOf(order.status);
                if (order.status === 'ARRIVED') {
                  currentIdx = 4;
                } else if (order.status === 'DELIVERED') {
                  currentIdx = 5;
                }
                const isCompleted = idx < currentIdx;
                const isCurrent = idx === currentIdx;
                const isLast = idx === arr.length - 1;
                return (
                  <React.Fragment key={statusKey}>
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={`w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                        isCompleted
                          ? 'bg-emerald-500 border-emerald-500 shadow-sm shadow-emerald-200'
                          : isCurrent
                          ? 'bg-amber-400 border-amber-400 animate-pulse shadow-sm shadow-amber-200'
                          : 'bg-white border-gray-300'
                      }`}>
                        {isCompleted && (
                          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {isCurrent && !isCompleted && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                      <span className={`text-[9px] font-black text-center leading-tight whitespace-nowrap ${
                        isCompleted ? 'text-emerald-700' : isCurrent ? 'text-amber-700' : 'text-gray-400'
                      }`}>{labels[statusKey]}</span>
                    </div>
                    {!isLast && (
                      <div className={`flex-1 h-0.5 mt-2.5 mx-0.5 rounded-full transition-all ${
                        isCompleted ? 'bg-emerald-400' : 'bg-gray-200'
                      }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* CUSTOMER EDIT ALERT BANNER */}
        {order.updatedByCustomer && (
          <div className="p-4 rounded-3xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg space-y-2.5 animate-in slide-in-from-top duration-300">
            <div className="flex items-center justify-between font-black text-xs">
              <div className="flex items-center space-x-1.5">
                <FileEdit className="w-4 h-4 text-amber-100" />
                <span>গ্রাহক অর্ডার তথ্য আপডেট করেছেন</span>
              </div>
              <button
                onClick={() => {
                  fallbackStore.updateOrder(order.id, (o) => ({ ...o, updatedByCustomer: false }));
                }}
                className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded-full text-[10px] font-extrabold transition-all"
              >
                ঠিক আছে
              </button>
            </div>
            <p className="text-[11px] text-amber-100 font-medium leading-relaxed">
              কাস্টমার অর্ডারের তথ্য/বিবরণ আপডেট করেছেন। নিচে পরিবর্তিত বিষয়গুলো দেখুন:
            </p>
            {order.editHistory && order.editHistory.length > 0 && (
              <div className="bg-black/15 rounded-2xl p-3 text-[11px] space-y-1 border border-white/20">
                {order.editHistory[order.editHistory.length - 1].changes.map((c, idx) => (
                  <div key={idx} className="flex flex-wrap justify-between gap-1 text-white">
                    <span className="font-bold text-amber-100">{c.field}:</span>
                    <span className="font-semibold text-right">
                      <span className="line-through text-white/60 mr-1">{c.oldValue}</span>
                      <strong className="text-white bg-white/20 px-1.5 py-0.5 rounded">{c.newValue}</strong>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ORDER DETAILS IN EXACT REQUESTED SEQUENCE */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft space-y-4">
          {/* PENDING ORDER: Show minimal info only — full details revealed after acceptance */}
          {order.status === 'PENDING' && (
            <div className="space-y-3">
              {/* Order type / service */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1.5">
                  <HelpCircle className="w-4 h-4 text-emerald-600" />
                  <span>Request Type</span>
                </h4>
                <p className="text-sm font-bold text-gray-900 bg-emerald-50/60 border border-emerald-100 p-3 rounded-2xl">
                  {order.service || order.title || 'Service Needed'}
                </p>
              </div>

              {/* Order ID */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Order ID</h4>
                <span className="font-black font-mono text-sm text-slate-800 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 inline-block">#{order.id}</span>
              </div>

              {/* Order Details / Items */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1.5">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>Order Details</span>
                </h4>
                <div className="space-y-1.5">
                   {(order.items || []).map((i) => (
                    <p key={i.id} className="text-xs font-semibold text-white bg-[#19a24c] border-[#19a24c] p-2.5 rounded-xl">
                      {i.name}{i.qty && Number(i.qty) > 1 ? ` ×${i.qty}` : ''}
                    </p>
                  ))}
                </div>
                {order.additionalNote && (
                  <p className="mt-2 text-xs text-amber-900 bg-amber-50/70 border border-amber-100 p-2.5 rounded-xl font-medium">
                    <span className="font-bold">Note: </span>{order.additionalNote}
                  </p>
                )}
              </div>

              {/* Customer Details */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1.5">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  <span>Customer Details</span>
                </h4>
                <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-gray-900 text-sm">{order.customerName}</span>
                    {customerLabels.map((lbl, idx) => (
                      <span key={idx} className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-xs uppercase tracking-wider">
                        {lbl}
                      </span>
                    ))}
                  </div>
                  <span className="text-[11px] text-gray-500 mt-0.5 block">
                    {order.alternativePhone || order.customerPhone ? '📞 Contact visible after acceptance' : 'No contact provided'}
                  </span>
                </div>
              </div>

              {/* Delivery Details */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1.5">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <span>Delivery Details</span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <p className="p-3 rounded-2xl bg-emerald-50/50 text-emerald-950 font-bold border border-emerald-100">
                    {order.deliveryLocation?.address || 'N/A'}
                  </p>
                  {order.pickupLocation?.address && (
                    <p className="p-2.5 rounded-xl bg-gray-50 text-gray-700 font-medium border border-gray-100">
                      <span className="font-semibold text-gray-900">Pickup: </span>{order.pickupLocation.address}
                    </p>
                  )}
                </div>
              </div>

              {/* Privacy notice */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-[11px] text-gray-400 font-medium text-center bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                  🔒 Customer phone number and full order details visible only after accepting
                </p>
              </div>
            </div>
          )}

          {/* ACCEPTED+ ORDER: Show full details */}
          {order.status !== 'PENDING' && (
            <>
          {/* 1. ITEMS (Interactive Checklist) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1">
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                <span>Items Checklist</span>
              </h4>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">
                {(order.items || []).filter((i) => i.purchased).length}/{(order.items || []).length} Checked
              </span>
            </div>
            <div className="space-y-1.5">
              {(order.items || []).map((i) => (
                <div
                  key={i.id}
                  onClick={() => !isDone && toggleItemPurchased(i.id)}
                  className={`flex items-center justify-between text-xs p-2.5 rounded-xl border transition-all select-none bg-[#19a24c] border-[#19a24c] text-white ${
                    isDone
                      ? 'cursor-default opacity-65'
                      : 'cursor-pointer hover:brightness-105 active:scale-[0.99]'
                  } ${
                    i.purchased ? 'opacity-85 font-medium' : 'font-bold'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={!!i.purchased}
                      disabled={isDone}
                      onChange={() => {}} // Handled by parent container onClick
                      className="w-3.5 h-3.5 accent-white rounded cursor-pointer disabled:cursor-default disabled:opacity-50"
                    />
                    <span className={i.purchased ? 'line-through text-white/80' : ''}>
                      {i.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Two-Way Delivery Toggle */}
          {!isDone && (
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-3.5 space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-start space-x-2">
                  <RotateCcw className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">কাস্টমারের কাছে আবার ফিরে আসতে হবে।</span>
                    {order.needDeliveryBack && (
                      <span className="text-[11px] text-gray-700 font-semibold block mt-1">
                        Return mode: {order.deliveryBackTime
                          ? `Scheduled (${new Date(order.deliveryBackTime).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' })})`
                          : 'Return Now'}
                        <button
                          type="button"
                          onClick={() => {
                            setReturnWhen(order.deliveryBackTime ? 'schedule' : 'now');
                            setDeliveryBackTimeInput(
                              order.deliveryBackTime
                                ? order.deliveryBackTime.substring(0, 16)
                                : (() => {
                                    const d = new Date();
                                    d.setDate(d.getDate() + 1);
                                    return d.toISOString().substring(0, 16);
                                  })()
                            );
                            setShowDeliveryBackModal(true);
                          }}
                          className="ml-2 text-indigo-600 hover:text-indigo-800 font-bold underline text-[10px]"
                        >
                          (Edit)
                        </button>
                      </span>
                    )}
                  </div>
                </div>
                {/* Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!order.needDeliveryBack}
                  onClick={() => {
                    if (!order.needDeliveryBack) {
                      setReturnWhen('schedule');
                      setDeliveryBackTimeInput(
                        order.deliveryBackTime
                          ? order.deliveryBackTime.substring(0, 16)
                          : (() => {
                              const d = new Date();
                              d.setDate(d.getDate() + 1);
                              return d.toISOString().substring(0, 16);
                            })()
                      );
                      setShowDeliveryBackModal(true);
                    } else {
                      const baseFee = calculateEstimatedFee({
                        distanceKm: Math.ceil(distanceKm),
                        weightKg: Math.ceil(order.weightKg || 0),
                        isReturnRequested: false,
                        productPrice: 0,
                      }, fallbackStore.pricingSettings).totalFee;
                      fallbackStore.updateOrder(order.id, (o) => ({
                        ...o,
                        needDeliveryBack: false,
                        needReturnItems: false,
                        deliveryBackTime: undefined,
                        deliveryFee: baseFee,
                        originalDeliveryFee: baseFee,
                      }));
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none shrink-0 ${
                    order.needDeliveryBack ? 'bg-indigo-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                      order.needDeliveryBack ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* 5. CUSTOMER CONTACT NUMBER */}
          <div className="pt-2 border-t border-gray-100">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Customer Contact</span>
            </h4>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-900 text-xs">
                  {order.alternativePhone || order.customerPhone || 'Not provided'}
                </span>
                {/* Customer labels — prominent inline pills */}
                {customerLabels.length > 0 && customerLabels.map((lbl, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm border border-amber-300/30 uppercase tracking-wider shrink-0"
                  >
                    ⭐ {lbl}
                  </span>
                ))}
              </div>
              <div className="shrink-0 ml-1">
                <span className="text-[10px] text-gray-500 block text-right">{order.customerName}</span>
              </div>
              {(order.alternativePhone || order.customerPhone) && (
                <div className="flex items-center space-x-1.5">
                  <a
                    href={`tel:${order.alternativePhone || order.customerPhone}`}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center space-x-1 shadow-sm"
                  >
                    <Phone className="w-3 h-3" />
                    <span>Call</span>
                  </a>
                  <a
                    href={`https://wa.me/880${(order.alternativePhone || order.customerPhone || '').replace(/^0/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-[10px] flex items-center space-x-1 shadow-sm"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    <span>WhatsApp</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* 6. COMBINED ADDRESSES BLOCK */}
          <div className="pt-2 border-t border-gray-100">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              <span>Addresses</span>
            </h4>
            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-2.5 text-xs animate-in fade-in">
              {order.pickupLocation?.address && (
                <>
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="leading-relaxed flex-1 text-[11px] text-gray-700 min-w-0">
                      <strong className="text-gray-900 font-extrabold block text-[10px] uppercase tracking-wider text-emerald-800">Pickup:</strong>
                      <span className="block truncate" title={order.pickupLocation.address}>
                        {order.pickupLocation.address}
                      </span>
                    </div>
                    {!isDone && (
                      <button
                        onClick={() => setActiveMapPicker('pickup')}
                        className="p-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 transition-colors shrink-0"
                        title="পিকআপ ঠিকানা পরিবর্তন"
                      >
                        <FileEdit className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <hr className="border-gray-200 my-1.5" />
                </>
              )}
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="leading-relaxed flex-1 text-[11px] text-gray-700 min-w-0">
                  <strong className="text-gray-900 font-extrabold block text-[10px] uppercase tracking-wider text-emerald-850">Delivery:</strong>
                  <span className="block truncate" title={order.deliveryLocation?.address || 'N/A'}>
                    {order.deliveryLocation?.address || 'N/A'}
                  </span>
                </div>
                {!isDone && (
                  <button
                    onClick={() => setActiveMapPicker('delivery')}
                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors shrink-0 border border-emerald-100"
                    title="ডেলিভারি ঠিকানা পরিবর্তন"
                  >
                    <FileEdit className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Shops Selection Input Container */}
              <div className="mt-2.5 pt-2.5 border-t border-gray-200">
                <strong className="text-gray-900 font-extrabold block text-[10px] uppercase tracking-wider text-purple-800 mb-1">Select Shops:</strong>
                <div
                  onClick={() => !isDone && setShowRetailerMap(true)}
                  className={`w-full min-h-[38px] p-2 rounded-xl border border-gray-200 bg-white flex flex-wrap gap-1.5 items-center ${!isDone ? 'cursor-pointer hover:border-purple-300 hover:bg-purple-50/30 transition-colors' : 'cursor-default bg-gray-50'}`}
                >
                  {selectedShops.length === 0 ? (
                    <span className="text-gray-400 text-xs font-semibold pl-1 flex items-center gap-1.5">
                      <Map className="w-3.5 h-3.5 text-purple-400" />
                      ম্যাপে দোকান দেখুন ও বেছে নিন...
                    </span>
                  ) : (
                    selectedShops.map((shop) => (
                      <span
                        key={shop.id}
                        className="inline-flex items-center gap-1 bg-purple-50 text-purple-900 font-bold text-[10px] px-2 py-1 rounded-lg border border-purple-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isDone) setRetailerDetailsShop(shop);
                        }}
                      >
                        {shop.name}
                        {shop.commissionPercent !== undefined && (
                          <span className="text-[9px] text-purple-500 font-extrabold">·{shop.commissionPercent}%</span>
                        )}
                        {!isDone && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeselectShop(shop.id);
                            }}
                            className="text-purple-500 hover:text-purple-700 font-black p-0.5 rounded-full hover:bg-purple-100"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-1.5">
                <button
                  type="button"
                  onClick={() => setShowMapModal(true)}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all active:scale-95"
                >
                  <Map className="w-3.5 h-3.5" />
                  <span>View in map</span>
                </button>
              </div>
            </div>
          </div>

          {/* Product Cost & Pricing Calculation Summary */}
          <div className="pt-2 border-t border-gray-100">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>Calculation Summary</span>
            </h4>
            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-2.5 text-xs font-semibold text-gray-700 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-bold">Product cost</span>
                <div className="flex items-center space-x-1.5">
                  <span className="text-sm font-black text-gray-900">
                    ৳{order.productCost !== undefined ? order.productCost : 0}
                  </span>
                  {!isDone && (
                    <button
                      onClick={() => {
                        setProductCostInput(order.productCost !== undefined ? String(order.productCost) : '');
                        setShowCostModal(true);
                      }}
                      className="p-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
                      title="Edit Product Cost"
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-bold">Distance ({Math.ceil(distanceKm)} km)</span>
                <span className="font-bold text-gray-900">৳{(estdPricing.basePrice + estdPricing.distanceFee) * (order.needDeliveryBack ? 2 : 1)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-bold">Weight (kg)</span>
                <div className="flex items-center space-x-1.5">
                  {!isDone ? (
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={weightInput}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setWeightInput(e.target.value);
                        updateEstdPricing(order.productCost || 0, val);
                      }}
                      className="w-16 p-1 border border-gray-300 rounded text-center font-bold text-xs outline-none focus:border-emerald-500 bg-white"
                    />
                  ) : (
                    <span className="font-bold text-gray-900">{Math.ceil(order.weightKg || 0)} kg</span>
                  )}
                  {estdPricing.weightFee > 0 && (
                    <span className="text-[10px] text-gray-500">(+৳{estdPricing.weightFee})</span>
                  )}
                </div>
              </div>

              {estdPricing.processingFee > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-bold">Processing Fee</span>
                  <span className="font-bold text-gray-900">৳{estdPricing.processingFee}</span>
                </div>
              )}

              {estdPricing.returnFee > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-bold">Return Fee</span>
                  <span className="font-bold text-gray-900">৳{estdPricing.returnFee * (order.needDeliveryBack ? 2 : 1)}</span>
                </div>
              )}

              {/* Retailer Commission — only shown when shops with commission are selected */}
              {(() => {
                const totalRetailerCommission = selectedShops.reduce((sum, shop) => {
                  if (shop.commissionPercent !== undefined && order.productCost !== undefined) {
                    return sum + Math.round((shop.commissionPercent / 100) * order.productCost);
                  }
                  return sum;
                }, 0);
                if (selectedShops.length === 0 || totalRetailerCommission === 0) return null;
                return (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50 border border-amber-200 -mx-0.5">
                    <div className="flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <div>
                        <span className="text-amber-800 font-extrabold text-xs block">Retailer Commission</span>
                        <span className="text-[9px] text-amber-600 font-medium">
                          {selectedShops.filter(s => s.commissionPercent !== undefined).map(s => `${s.name} (${s.commissionPercent}%)`).join(', ')}
                        </span>
                      </div>
                    </div>
                    <span className="font-extrabold text-amber-800 text-sm">৳{totalRetailerCommission}</span>
                  </div>
                );
              })()}

              <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
                <span className="font-bold text-gray-800 text-sm">Delivery Fee</span>
                <div className="flex items-center space-x-1.5">
                  <span className="text-base font-black text-emerald-850">৳{order.deliveryFee}</span>
                  {!isDone && (
                    <button
                      onClick={() => {
                        setFeeInput(String(order.deliveryFee));
                        setShowFeeModal(true);
                      }}
                      className="p-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 transition-colors"
                      title="Override Fee"
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-2.5 flex items-center justify-between bg-emerald-50/50 -mx-3.5 px-3.5 py-1.5 mt-1 rounded-b-2xl">
                <span className="font-bold text-gray-900 text-sm">Total to Collect (মোট বিল)</span>
                <span className="text-base font-black text-emerald-800">
                  ৳{(order.productCost || 0) + (order.deliveryFee || 0) + (estdPricing.processingFee || 0)}
                </span>
              </div>

              {/* Retailer commission info note */}
              {(() => {
                const totalRetailerCommission = selectedShops.reduce((sum, shop) => {
                  if (shop.commissionPercent !== undefined && order.productCost !== undefined) {
                    return sum + Math.round((shop.commissionPercent / 100) * order.productCost);
                  }
                  return sum;
                }, 0);
                if (selectedShops.length === 0 || totalRetailerCommission === 0) return null;
                return (
                  <p className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-3 py-2 rounded-xl border border-amber-100 leading-relaxed">
                    💡 ৳{totalRetailerCommission} রিটেইলার কমিশন কোম্পানিতে যাবে এবং আপনার পেব্যাক থেকে সমন্বয় করা হবে।
                  </p>
                );
              })()}
              {order.deliveryFee > (fallbackStore.pricingSettings.feeCalculatorMaxLimit ?? 70) && (
                <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-850 font-bold leading-relaxed animate-in fade-in duration-200">
                  ⚠️ {fallbackStore.pricingSettings.feeCalculatorMaxLimitMessage || `মোট ডেলিভারি ফি ৳${fallbackStore.pricingSettings.feeCalculatorMaxLimit ?? 70}-এর বেশি। বিস্তারিত ও নিশ্চিতকরণের জন্য আমাদের সাথে যোগাযোগ করুন।`}
                </div>
              )}
            </div>
          </div>

          {/* 7. PRIVATE NOTE SECTION (Customer cannot see this) */}
          <div className="pt-2 border-t border-gray-100 space-y-1.5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1 text-purple-950 font-extrabold text-[10px]">
                <FileText className="w-3.5 h-3.5 text-purple-700" />
                <span>Private Note</span>
              </div>
              <span className="text-[9px] font-black bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                🔒 কাস্টমার দেখবে না
              </span>
            </div>
            <form onSubmit={handleSaveHelperNote} className="space-y-1.5">
              <textarea
                value={helperNoteInput}
                onChange={(e) => setHelperNoteInput(e.target.value)}
                placeholder="গোপন নোট লিখুন..."
                className="w-full p-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-xs font-semibold text-gray-900 outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 h-16 resize-none"
              />
              <div className="flex items-center justify-between pt-0.5">
                {noteSavedAlert ? (
                  <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-lg border border-emerald-200 animate-in fade-in">
                    ✓ নোট সংরক্ষিত হয়েছে!
                  </span>
                ) : (
                  <span className="text-[9px] text-purple-700 font-medium"> </span>
                )}
                <button
                  type="submit"
                  className="px-2.5 py-1.5 bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-[10px] rounded-lg shadow-sm transition-all active:scale-95 flex items-center space-x-1"
                >
                  <FileText className="w-3 h-3" />
                  <span>সেভ করুন</span>
                </button>
              </div>
            </form>
          </div>
            </>
          )}
        </div>



        {/* Two-Way Delivery Schedule Modal */}
        {showDeliveryBackModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative border border-indigo-100">
              <button
                type="button"
                onClick={() => setShowDeliveryBackModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-indigo-100">
                  <RotateCcw className="w-5 h-5 text-indigo-700" />
                </div>
                <div>
                  <h3 className="font-black text-base text-gray-900 leading-tight">Two-Way Delivery</h3>
                  <p className="text-[11px] text-indigo-700 font-bold">কখন ফিরবেন? (When will you return?)</p>
                </div>
              </div>

              {/* Return option selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReturnWhen('now')}
                  className={`p-3 rounded-2xl border-2 text-left transition-all ${
                    returnWhen === 'now'
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 bg-gray-50 hover:border-indigo-200'
                  }`}
                >
                  <span className="text-sm">⚡</span>
                  <span className="text-xs font-extrabold text-gray-900 block mt-0.5">এখনই ফিরব</span>
                  <span className="text-[9px] text-gray-500 font-medium leading-tight block">ডেলিভারি দিয়ে সাথে সাথে ফিরব</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReturnWhen('schedule')}
                  className={`p-3 rounded-2xl border-2 text-left transition-all ${
                    returnWhen === 'schedule'
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 bg-gray-50 hover:border-indigo-200'
                  }`}
                >
                  <span className="text-sm">📅</span>
                  <span className="text-xs font-extrabold text-gray-900 block mt-0.5">সময় নির্ধারণ</span>
                  <span className="text-[9px] text-gray-500 font-medium leading-tight block">নির্দিষ্ট সময়ে ফিরব</span>
                </button>
              </div>

              {returnWhen === 'schedule' && (
                <div className="animate-in slide-in-from-top duration-200">
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">Return Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={deliveryBackTimeInput}
                    onChange={(e) => setDeliveryBackTimeInput(e.target.value)}
                    className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-gray-900"
                    required
                  />
                </div>
              )}

              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDeliveryBackModal(false)}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (returnWhen === 'schedule' && !deliveryBackTimeInput) return;
                    const baseOrigFee = order.needDeliveryBack
                      ? (order.originalDeliveryFee || order.deliveryFee)
                      : order.deliveryFee;
                    const doubledFee = baseOrigFee * 2;
                    fallbackStore.updateOrder(order.id, (o) => ({
                      ...o,
                      needDeliveryBack: true,
                      needReturnItems: true,
                      deliveryBackTime: returnWhen === 'schedule' ? new Date(deliveryBackTimeInput).toISOString() : undefined,
                      originalDeliveryFee: o.originalDeliveryFee || o.deliveryFee,
                      deliveryFee: doubledFee,
                    }));
                    setShowDeliveryBackModal(false);
                  }}
                  className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-600/20 transition-all"
                >
                  Confirm &amp; Double Fee
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status Progression Action Buttons */}
        {order.status !== 'DELIVERED' && order.status !== 'CANCELED' && (
          <div className="space-y-3">
            {/* PENDING → ACCEPTED */}
            {order.status === 'PENDING' && onAccept && (
              <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 space-y-3 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-center space-x-2 text-emerald-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="font-extrabold text-sm">Accept This Request</span>
                </div>
                <p className="text-xs text-emerald-700/80 font-medium">
                  Ready to assist this customer? Accept the request to assign yourself as the helper.
                </p>
                <button
                  onClick={() => onAccept(order.id)}
                  disabled={activeOrdersCount !== undefined && activeOrderLimit !== undefined && activeOrdersCount >= activeOrderLimit}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center space-x-2 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{activeOrdersCount !== undefined && activeOrderLimit !== undefined && activeOrdersCount >= activeOrderLimit ? `Limit Reached (${activeOrderLimit} Max)` : 'Accept Request'}</span>
                </button>
              </div>
            )}
            {/* Fee/Cost Validation Warning Banner */}
            {!hasCostAndFee && order.status === 'ACCEPTED' && (
              <div className="p-4 rounded-3xl bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-300 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-center justify-center space-x-2.5 py-1">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <span className="font-bold text-sm text-orange-950">অর্ডারের মোট বিলটি Add করুন।</span>
                </div>
              </div>
            )}

            {/* ACTIVE ACTIONS SECTION WITH BIDIRECTIONAL NAVIGATION */}
            {['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED'].includes(order.status) && (
              <div className="space-y-3">
                {/* Main Action (Forward) */}
                {order.status === 'ACCEPTED' && (
                  hasCostAndFee ? (
                    <button
                      onClick={() => handleUpdateStatusWithCheck('PURCHASED_EXECUTED')}
                      className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-indigo-600/25 transition-all flex items-center justify-center space-x-2"
                    >
                      <PackageCheck className="w-5 h-5" />
                      <span>Mark as Purchased / Executed</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      onClick={() => showAlert('Product Cost Required', 'Please enter the product cost first to auto-calculate the delivery fee.', 'warning')}
                      className="w-full py-3.5 rounded-2xl bg-gray-200 text-gray-400 font-extrabold text-sm cursor-not-allowed flex items-center justify-center space-x-2 border-2 border-dashed border-gray-300"
                    >
                      <PackageCheck className="w-5 h-5" />
                      <span>Mark as Purchased / Executed</span>
                    </button>
                  )
                )}

                {order.status === 'PURCHASED_EXECUTED' && (
                  <button
                    onClick={() => handleUpdateStatus('ON_THE_WAY')}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center space-x-2"
                  >
                    <Truck className="w-5 h-5" />
                    <span>I'm On The Way!</span>
                  </button>
                )}

                {order.status === 'ON_THE_WAY' && (
                  <button
                    onClick={() => handleUpdateStatus('ARRIVED')}
                    className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-teal-600/25 transition-all flex items-center justify-center space-x-2"
                  >
                    <MapPin className="w-5 h-5" />
                    <span>I've Arrived at Location!</span>
                  </button>
                )}

                {order.status === 'ARRIVED' && (
                  <button
                    onClick={handleConfirmDeliveryWithModal}
                    className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center space-x-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Confirm Order Delivered!</span>
                  </button>
                )}

                {/* Back Navigation Button */}
                {order.status !== 'ACCEPTED' && (
                  <button
                    type="button"
                    onClick={() => {
                      const prevStatusMap: Record<string, OrderStatus> = {
                        PURCHASED_EXECUTED: 'ACCEPTED',
                        ON_THE_WAY: 'PURCHASED_EXECUTED',
                        ARRIVED: 'ON_THE_WAY',
                      };
                      const prev = prevStatusMap[order.status];
                      if (prev) {
                        handleUpdateStatus(prev, `Status reverted back to ${prev}`);
                      }
                    }}
                    className="w-full py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <span>← Go Back to Previous Status</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Request Cancellation Trigger */}
        {order.status !== 'DELIVERED' && order.status !== 'CANCELED' && (
          <div className="pt-2">
            {order.cancellationRequest ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold text-center">
                Cancellation Request Pending Admin Review.
              </div>
            ) : (
              <button
                onClick={handleRequestCancellation}
                className="w-full py-3.5 rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-xs transition-colors flex items-center justify-center space-x-1.5"
              >
                <AlertOctagon className="w-4 h-4" />
                <span>Request Order Cancellation</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Enter Product Cost Modal */}
      {showCostModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 relative">
            <button
              type="button"
              onClick={() => setShowCostModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-base text-gray-900">Enter Product Cost</h3>
            <form onSubmit={handleSaveProductCost} className="space-y-3">
              <input
                type="number"
                step="0.01"
                value={productCostInput}
                onChange={(e) => setProductCostInput(e.target.value)}
                placeholder="যেমন: 450"
                className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm outline-none focus:border-emerald-500"
                required
              />
              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCostModal(false)}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xs shadow-md"
                >
                  Save Cost
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Delivery Fee Modal */}
      {showFeeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative">
            <button
              type="button"
              onClick={() => setShowFeeModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-base text-gray-900">Edit Delivery Fee</h3>
            <p className="text-xs text-gray-600">
              Set or adjust the delivery fee for this order. Current fee: ৳{order.deliveryFee}.
            </p>
            <form onSubmit={handleSaveDeliveryFee} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Delivery Fee (৳)</label>
                <input
                  type="number"
                  step="1"
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  placeholder="যেমন: 50"
                  className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Reason / Note for Customer <span className="text-red-500">*</span></label>
                <textarea
                  value={feeReason}
                  onChange={(e) => setFeeReason(e.target.value)}
                  placeholder="যেমন: মালামাল ভারী অথবা পিকআপ স্পট অতিরিক্ত দূরে..."
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs h-20 outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFeeModal(false)}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md"
                >
                  Save Fee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unchecked Items Note Custom Modal */}
      {showUncheckedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-amber-100 animate-in zoom-in-95 duration-200 relative">
            <button
              type="button"
              onClick={() => { setShowUncheckedModal(false); setPendingNextStatus(null); }}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center space-x-3 text-amber-800">
              <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-700">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-gray-900 leading-tight">অসম্পূর্ণ আইটেম নোট</h3>
                <span className="text-[11px] text-amber-700 font-bold">
                  {order.items.filter((i) => !i.purchased).length}টি আইটেম এখনো চেক করা হয়নি
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed font-medium">
              সব আইটেম টিক না দিয়ে সামনে এগোতে হলে অনুগ্রহ করে গ্রাহক ও এডমিনের জন্য একটি নোট লিখুন (যেমন: দোকানে স্টক ছিল না):
            </p>

            <form onSubmit={handleConfirmUncheckedSubmission} className="space-y-3">
              <textarea
                value={uncheckedNote}
                onChange={(e) => {
                  setUncheckedNote(e.target.value);
                  if (e.target.value.trim()) setUncheckedError('');
                }}
                placeholder="নোট বা কারণ লিখুন..."
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs h-24 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-gray-900 font-medium"
                required
              />

              {uncheckedError && (
                <p className="text-[11px] text-red-600 font-bold bg-red-50 p-2 rounded-xl border border-red-100">
                  {uncheckedError}
                </p>
              )}

              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowUncheckedModal(false);
                    setPendingNextStatus(null);
                  }}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
                >
                  ফিরে যান
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all"
                >
                  নোটসহ জমা দিন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Helper Cancellation Request Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative border border-red-100">
            <button
              type="button"
              onClick={() => setShowCancelModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="flex items-center space-x-3 text-red-800">
              <div className="p-2.5 rounded-2xl bg-red-100 text-red-650 flex items-center justify-center">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-gray-900 leading-tight">অর্ডার বাতিলের অনুরোধ</h3>
                <span className="text-[11px] text-red-700 font-bold">এডমিন এবং কাস্টমার রিভিউ করবেন</span>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed font-medium">
              হেলপার সরাসরি অর্ডার বাতিল করতে পারে না। অনুগ্রহ করে বাতিলের কারণটি বিশদভাবে লিখুন, যাতে এডমিন সেটি দেখে অনুমোদন করতে পারেন:
            </p>

            <form onSubmit={handleConfirmCancellationRequest} className="space-y-3">
              <textarea
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  if (e.target.value.trim()) setCancelError('');
                }}
                placeholder="যেমন: বাইক নষ্ট হয়ে গেছে, কাস্টমার ফোন ধরছেন না, কাস্টমারের অনুরোধ ইত্যাদি..."
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs h-24 outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 text-gray-900 font-semibold"
                required
              />

              {cancelError && (
                <p className="text-[11px] text-red-600 font-bold bg-red-50 p-2 rounded-xl border border-red-100">
                  {cancelError}
                </p>
              )}

              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
                >
                  ফিরে যান
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-md shadow-red-600/25 transition-all"
                >
                  অনুরোধ পাঠান
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONGRATULATIONS EARNINGS CUSTOM MODAL */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-5 border border-emerald-100 text-center animate-in zoom-in-95 duration-200 relative overflow-hidden">
            {/* Decorative glows */}
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-emerald-400/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-amber-400/20 rounded-full blur-2xl pointer-events-none" />

            {/* Celebratory Icon */}
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce">
              <Sparkles className="w-10 h-10" />
            </div>

            {(() => {
              const commissionPercent = fallbackStore.pricingSettings?.helperCommissionPercent || 80;
              const platformPercent = 100 - commissionPercent;
              const netEarned = calculateHelperCommission(order.deliveryFee, fallbackStore.pricingSettings);
              const platformCommissionFee = Math.max(0, (order.deliveryFee || 0) - netEarned);

              return (
                <div className="space-y-3">
                  <span className="inline-flex items-center space-x-1 text-xs font-black uppercase tracking-widest text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    🎉 Order Completed!
                  </span>
                  <h3 className="text-2xl font-black text-gray-900 leading-tight">
                    Congratulations!
                  </h3>
                  <div className="bg-emerald-50/90 py-3.5 px-4 rounded-2xl border border-emerald-200 shadow-xs space-y-1.5">
                    <p className="text-sm font-extrabold text-emerald-950">
                      You earned <span className="text-emerald-700 text-2xl font-black">{netEarned} BDT</span>
                    </p>
                    <p className="text-[11px] text-emerald-800 font-bold bg-emerald-100/70 py-1 px-2.5 rounded-xl border border-emerald-200/80 inline-block">
                      (ডেলিভারি ফি ৳{order.deliveryFee} হতে {platformPercent}% প্ল্যাটফর্ম কমিশন ৳{platformCommissionFee} বাদে নিট আয়)
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 font-semibold pt-1">
                    অর্ডার #{order.id} সফলভাবে সম্পন্ন করার জন্য আপনাকে ধন্যবাদ! এই অর্থ আপনার ওয়ালেটে জমা হয়েছে।
                  </p>
                </div>
              );
            })()}

            <button
              onClick={() => {
                setShowCompletionModal(false);
                onBack();
              }}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:scale-95 text-white font-extrabold text-sm shadow-md shadow-emerald-600/30 transition-all"
            >
              Great! Back to Orders
            </button>
          </div>
        </div>
      )}
      {/* Address Edit Map Picker Modal */}
      {activeMapPicker && (
        <MapPickerModal
          isOpen={activeMapPicker !== null}
          onClose={() => setActiveMapPicker(null)}
          title={activeMapPicker === 'pickup' ? 'পিকআপ ঠিকানা পরিবর্তন' : 'ডেলিভারি ঠিকানা পরিবর্তন'}
          initialLocation={activeMapPicker === 'pickup' ? order.pickupLocation : order.deliveryLocation}
          modalType={activeMapPicker}
          onSelectLocation={(loc) => handleSaveEditedAddress(activeMapPicker, loc)}
        />
      )}
      {showMapModal && (
        <HelperOrderMapModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          order={order}
          helperLocation={helperLocation}
        />
      )}

      {/* Retailer Map Modal */}
      {showRetailerMap && (
        <HelperRetailerMapModal
          isOpen={showRetailerMap}
          onClose={() => setShowRetailerMap(false)}
          shops={nearbyShops}
          selectedShopIds={selectedShopIds}
          orderPickupLocation={order.pickupLocation}
          orderDeliveryLocation={order.deliveryLocation}
          helperLocation={helperLocation}
          radiusKm={fallbackStore.pricingSettings.retailerCommissionRadius ?? fallbackStore.pricingSettings.helperRadiusKm ?? 5}
          onShopMarkerClick={(shop) => {
            setRetailerDetailsShop(shop);
          }}
        />
      )}

      {/* Retailer Details Modal */}
      {retailerDetailsShop && (
        <HelperRetailerDetailsModal
          shop={retailerDetailsShop}
          isSelected={selectedShopIds.includes(retailerDetailsShop.id)}
          productCost={order.productCost}
          onClose={() => setRetailerDetailsShop(null)}
          onSelect={(shopId) => {
            handleToggleShopSelection(shopId);
            setRetailerDetailsShop(null);
          }}
          onDeselect={(shopId) => {
            handleDeselectShop(shopId);
            setRetailerDetailsShop(null);
          }}
        />
      )}
    </div>
  );
};
