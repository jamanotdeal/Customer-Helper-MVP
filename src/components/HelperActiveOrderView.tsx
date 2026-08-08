import React, { useState, useEffect } from 'react';
import { Order, OrderStatus } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { calculateDeliveryFee } from '@/lib/pricing';
import { CheckCircle2, Truck, MapPin, PackageCheck, AlertOctagon, Phone, ArrowLeft, DollarSign, Clock, HelpCircle, FileText, ShoppingBag, FileEdit, AlertTriangle } from 'lucide-react';
import { getStatusBadgeInfo } from './OrderCard';
import { formatCreatedAt, getElapsedTime, getDeliveryDurationText } from '@/lib/timeUtils';
import { useModal } from './CustomModal';

interface HelperActiveOrderViewProps {
  order: Order;
  onBack: () => void;
}

export const HelperActiveOrderView: React.FC<HelperActiveOrderViewProps> = ({ order, onBack }) => {
  const [productCostInput, setProductCostInput] = useState(order.productCost !== undefined ? String(order.productCost) : '');
  const [showCostModal, setShowCostModal] = useState(false);
  const [feeInput, setFeeInput] = useState(order.deliveryFee ? String(order.deliveryFee) : '');
  const [feeReason, setFeeReason] = useState('');
  const [showFeeModal, setShowFeeModal] = useState(false);
  const { showConfirm, showAlert } = useModal();

  // Validation: helper must enter product cost (which auto-sets delivery fee) before advancing
  const hasCostAndFee = order.productCost !== undefined;

  const badge = getStatusBadgeInfo(order.status);

  const isDone = order.status === 'DELIVERED' || order.status === 'CANCELED';
  const endTimestamp = order.deliveredAt || order.cancelledAt || order.updatedAt;

  const [elapsed, setElapsed] = useState(() =>
    isDone
      ? getDeliveryDurationText(order.createdAt, endTimestamp)
      : getElapsedTime(order.createdAt)
  );

  useEffect(() => {
    if (isDone) return;
    const timer = setInterval(() => {
      setElapsed(getElapsedTime(order.createdAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [order.createdAt, isDone]);

  const handleUpdateStatus = (newStatus: OrderStatus, note?: string) => {
    fallbackStore.updateOrder(order.id, (o) => {
      const updatedHistory = [
        ...o.statusHistory,
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

    const allChecked = order.items.every((i) => i.purchased);
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

    const calculatedFee = calculateDeliveryFee(val, fallbackStore.pricingSettings);

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      productCost: val,
      deliveryFee: calculatedFee,
      originalDeliveryFee: calculatedFee,
    }));
    setShowCostModal(false);
  };

  const handleSaveDeliveryFee = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(feeInput);
    if (isNaN(val) || val < 0) return;

    fallbackStore.updateOrder(order.id, (o) => {
      const updatedHistory = [
        ...o.statusHistory,
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

  const handleRequestCancellation = async () => {
    const confirmed = await showConfirm(
      'অর্ডার বাতিলের অনুরোধ',
      'আপনি কি এই অর্ডারটি বাতিলের অনুরোধ পাঠাতে চান? প্রশাসন এবং গ্রাহক রিভিউ করবেন। হেলপার সরাসরি অর্ডার বাতিল করতে পারে না।',
      'হ্যাঁ, অনুরোধ পাঠান',
      'ফিরে যান'
    );
    if (!confirmed) return;

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      cancellationRequest: {
        requestedBy: 'helper',
        reason: 'Cancellation requested by helper',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      },
    }));
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
        <span className="font-extrabold text-sm text-gray-800">Helper Order #{order.id}</span>
        <div className="w-8" />
      </div>

      <div className="max-w-md mx-auto p-4 space-y-5">
        {/* 1. ORDER TITLE & EYE-CATCHING BIG COUNTERUP TIMER HEADER */}
        <div className="p-5 rounded-3xl bg-gray-900 text-white shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Order Title</span>
            <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${badge.color}`}>
              {badge.label} (৳{order.deliveryFee})
            </span>
          </div>
          <h3 className="text-lg font-black text-white">{`Order-#${order.id}`}</h3>
          
          {/* Prominent Eye-Catching Counterup Timer Card */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950 via-gray-900 to-teal-950 border border-emerald-500/40 flex items-center justify-between shadow-inner">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Clock className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold text-emerald-400/90 uppercase tracking-widest block">
                  {isDone ? 'Total Delivery Duration' : 'Live Counterup Timer'}
                </span>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-emerald-300 font-mono">
                  {elapsed}
                </span>
              </div>
            </div>
            <span className="text-[10px] text-gray-400 font-medium self-end">
              {formatCreatedAt(order.createdAt)}
            </span>
          </div>
        </div>

        {/* ORDER DETAILS IN EXACT REQUESTED SEQUENCE */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft space-y-4">
          {/* 1. ITEMS (Interactive Checklist) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1.5">
                <ShoppingBag className="w-4 h-4 text-emerald-600" />
                <span>Items Checklist</span>
              </h4>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">
                {order.items.filter((i) => i.purchased).length}/{order.items.length} Checked
              </span>
            </div>
            <div className="space-y-2">
              {order.items.map((i) => (
                <div
                  key={i.id}
                  onClick={() => toggleItemPurchased(i.id)}
                  className={`flex items-center justify-between text-xs p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                    i.purchased
                      ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold shadow-xs'
                      : 'bg-gray-50 border-gray-200 text-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <input
                      type="checkbox"
                      checked={!!i.purchased}
                      onChange={() => {}} // Handled by parent container onClick
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className={i.purchased ? 'line-through text-emerald-800' : 'font-semibold'}>
                      {i.name}
                    </span>
                  </div>
                  <span className={`font-bold px-2 py-0.5 rounded-md border text-[11px] ${
                    i.purchased
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                      : 'bg-white text-gray-700 border-gray-200'
                  }`}>
                    {i.qty}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. ALTERNATIVES (If anything is missing) */}
          <div className="pt-2 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <HelpCircle className="w-4 h-4 text-emerald-600" />
              <span>Alternatives (If anything is missing)</span>
            </h4>
            <p className="p-3 rounded-2xl bg-gray-50 text-xs text-gray-800 font-semibold border border-gray-200">
              {order.missingItemPreference === 'SKIP' && 'Skip missing item(s)'}
              {order.missingItemPreference === 'SIMILAR' && 'Purchase similar alternative'}
              {order.missingItemPreference === 'CALL' && 'Call customer for instructions'}
              {!order.missingItemPreference && 'Skip missing item(s)'}
            </p>
          </div>

          {/* 3. ADDITIONAL NOTES */}
          <div className="pt-2 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>Additional Notes</span>
            </h4>
            <p className="p-3 rounded-2xl bg-amber-50/70 border border-amber-100 text-xs text-amber-950 font-medium">
              {order.additionalNote || 'No additional notes specified.'}
            </p>
          </div>

          {/* 4. PRODUCT COST BLOCK */}
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1.5 mb-0.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>Product Cost</span>
                </h4>
                <span className="text-base font-black text-gray-900">
                  {order.productCost !== undefined ? `৳${order.productCost}` : 'Not Entered Yet'}
                </span>
              </div>
              <button
                onClick={() => {
                  setProductCostInput(order.productCost !== undefined ? String(order.productCost) : '');
                  setShowCostModal(true);
                }}
                className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all"
              >
                {order.productCost !== undefined ? 'Edit Cost' : '+ Enter Cost'}
              </button>
            </div>

            {/* Fee Editing Option - Appears below product cost block once product cost is set */}
            {order.productCost !== undefined && (
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between animate-in fade-in duration-200">
                <div>
                  <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center space-x-1.5 mb-0.5">
                    <FileEdit className="w-4 h-4 text-amber-600" />
                    <span>Delivery Fee</span>
                  </h4>
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-black text-amber-950">৳{order.deliveryFee}</span>
                    {order.feeAdjustment && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                        {order.feeAdjustment.status === 'PENDING' ? 'Adjustment Pending' : `Fee: ${order.feeAdjustment.status}`}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFeeInput(String(order.deliveryFee));
                    setShowFeeModal(true);
                  }}
                  className="py-2 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all flex items-center space-x-1"
                >
                  <FileEdit className="w-3.5 h-3.5" />
                  <span>Edit Fee</span>
                </button>
              </div>
            )}
          </div>

          {/* 5. CUSTOMER CONTACT NUMBER */}
          <div className="pt-2 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <Phone className="w-4 h-4 text-emerald-600" />
              <span>Customer Contact Number</span>
            </h4>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100">
              <div>
                <span className="font-bold text-gray-900 text-sm block">
                  {order.alternativePhone || order.customerPhone || 'Not provided'}
                </span>
                <span className="text-[11px] text-gray-500">{order.customerName} — Number given in request form</span>
              </div>
              {(order.alternativePhone || order.customerPhone) && (
                <div className="flex items-center space-x-2">
                  <a
                    href={`tel:${order.alternativePhone || order.customerPhone}`}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1 shadow-sm"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </a>
                  <a
                    href={`https://wa.me/880${(order.alternativePhone || order.customerPhone || '').replace(/^0/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-xs flex items-center space-x-1 shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    <span>WhatsApp</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* 6. DELIVERY ADDRESS */}
          <div className="pt-2 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <span>Delivery Address</span>
            </h4>
            <div className="space-y-2 text-xs">
              <p className="p-3 rounded-2xl bg-emerald-50/50 text-emerald-950 font-bold border border-emerald-100">
                {order.deliveryLocation.address}
              </p>
              {order.pickupLocation?.address && (
                <p className="p-2.5 rounded-xl bg-gray-50 text-gray-700 font-medium border border-gray-100">
                  <span className="font-semibold text-gray-900">Pickup Shop/Location:</span> {order.pickupLocation.address}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Status Progression Action Buttons */}
        {order.status !== 'DELIVERED' && order.status !== 'CANCELED' && (
          <div className="space-y-3">
            {/* Fee/Cost Validation Warning Banner */}
            {!hasCostAndFee && order.status === 'ACCEPTED' && (
              <div className="p-4 rounded-3xl bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-300 space-y-2.5 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-2xl bg-orange-100 text-orange-700 flex-shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-orange-900">Product Cost Required</h4>
                    <p className="text-[11px] text-orange-700 font-semibold mt-0.5">
                      Enter the total product cost above to auto-calculate & confirm the delivery fee before proceeding.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2 text-[11px] text-orange-800 font-medium bg-orange-100/60 p-3 rounded-2xl border border-orange-200">
                  <span className="font-black text-orange-600 text-base leading-none">1.</span>
                  <span>Enter <strong>Product Cost</strong> in the section above — this auto-calculates the delivery fee.</span>
                </div>
                <div className="flex items-start space-x-2 text-[11px] text-orange-800 font-medium bg-orange-100/60 p-3 rounded-2xl border border-orange-200">
                  <span className="font-black text-orange-600 text-base leading-none">2.</span>
                  <span>Optionally adjust the <strong>Delivery Fee</strong> if needed (requires admin approval).</span>
                </div>
                <p className="text-[10px] text-orange-600 font-bold text-center pt-1">
                  You cannot mark this order as Purchased/Executed without completing this step.
                </p>
              </div>
            )}

            {/* ACCEPTED → PURCHASED_EXECUTED */}
            {order.status === 'ACCEPTED' && (
              hasCostAndFee ? (
                <div className="p-4 rounded-3xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 space-y-3 shadow-sm animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2 text-indigo-800">
                    <PackageCheck className="w-5 h-5 text-indigo-600" />
                    <span className="font-extrabold text-sm">Next Step: Mark as Purchased / Executed</span>
                  </div>
                  <p className="text-xs text-indigo-700/80 font-medium">
                    Once you've purchased/executed all required items from the shop, tap below to proceed.
                  </p>
                  <button
                    onClick={() => handleUpdateStatusWithCheck('PURCHASED_EXECUTED')}
                    className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-indigo-600/25 transition-all flex items-center justify-center space-x-2"
                  >
                    <PackageCheck className="w-5 h-5" />
                    <span>Mark as Purchased / Executed</span>
                  </button>
                </div>
              ) : (
                <button
                  disabled
                  onClick={() => showAlert('Product Cost Required', 'Please enter the product cost first to auto-calculate the delivery fee. You cannot proceed without completing this step.', 'warning')}
                  className="w-full py-3.5 rounded-2xl bg-gray-200 text-gray-400 font-extrabold text-sm cursor-not-allowed flex items-center justify-center space-x-2 border-2 border-dashed border-gray-300"
                >
                  <PackageCheck className="w-5 h-5" />
                  <span>Mark as Purchased / Executed</span>
                </button>
              )
            )}

            {/* PURCHASED_EXECUTED → ON_THE_WAY */}
            {order.status === 'PURCHASED_EXECUTED' && (
              <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 space-y-3 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-center space-x-2 text-emerald-800">
                  <Truck className="w-5 h-5 text-emerald-600 animate-pulse" />
                  <span className="font-extrabold text-sm">Next Step: Start Delivery</span>
                </div>
                <p className="text-xs text-emerald-700/80 font-medium">
                  Heading to the customer's delivery address? Tap below to let them know you're on the way.
                </p>
                <button
                  onClick={() => handleUpdateStatus('ON_THE_WAY')}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center space-x-2"
                >
                  <Truck className="w-5 h-5" />
                  <span>I'm On The Way!</span>
                </button>
              </div>
            )}

            {/* ON_THE_WAY → ARRIVED */}
            {order.status === 'ON_THE_WAY' && (
              <div className="p-4 rounded-3xl bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 space-y-3 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-center space-x-2 text-teal-800">
                  <MapPin className="w-5 h-5 text-teal-600" />
                  <span className="font-extrabold text-sm">Next Step: Arrived at Location</span>
                </div>
                <p className="text-xs text-teal-700/80 font-medium">
                  Have you reached the customer's delivery location? Mark your arrival below.
                </p>
                <button
                  onClick={() => handleUpdateStatus('ARRIVED')}
                  className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-teal-600/25 transition-all flex items-center justify-center space-x-2"
                >
                  <MapPin className="w-5 h-5" />
                  <span>I've Arrived at Location!</span>
                </button>
              </div>
            )}

            {/* ARRIVED → DELIVERED */}
            {order.status === 'ARRIVED' && (
              <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 border border-emerald-700 space-y-3 shadow-lg animate-in fade-in duration-200">
                <div className="flex items-center space-x-2 text-white">
                  <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                  <span className="font-extrabold text-sm text-white">Final Step: Mark as Delivered!</span>
                </div>
                <p className="text-xs text-emerald-100/90 font-medium">
                  Hand over the order to the customer and confirm delivery below to complete this order.
                </p>
                <button
                  onClick={() => handleUpdateStatus('DELIVERED')}
                  className="w-full py-4 rounded-2xl bg-white hover:bg-emerald-50 active:scale-98 text-emerald-800 font-extrabold text-sm shadow-md transition-all flex items-center justify-center space-x-2"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Confirm Order Delivered!</span>
                </button>
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
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4">
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
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
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
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-amber-100 animate-in zoom-in-95 duration-200">
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
    </div>
  );
};
