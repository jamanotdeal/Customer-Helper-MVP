import React, { useState } from 'react';
import { Order, OrderStatus } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { calculateHelperCommission } from '@/lib/pricing';
import { useModal } from '../CustomModal';
import { formatCreatedAt, getElapsedTime, getDeliveryDurationText } from '@/lib/timeUtils';
import {
  X,
  User,
  Phone,
  Bike,
  MapPin,
  ShoppingBag,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  UserCheck,
  ShieldAlert,
  Edit2,
  PackageCheck,
  Truck,
  Ban,
} from 'lucide-react';
import { AssignHelperModal } from './AssignHelperModal';

interface AdminOrderDetailsModalProps {
  orderId: string;
  onClose: () => void;
}

export const AdminOrderDetailsModal: React.FC<AdminOrderDetailsModalProps> = ({
  orderId,
  onClose,
}) => {
  const { showAlert, showConfirm } = useModal();
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Admin edit modals
  const [showAdminFeeModal, setShowAdminFeeModal] = useState(false);
  const [adminFeeInput, setAdminFeeInput] = useState('');
  const [adminFeeReason, setAdminFeeReason] = useState('');
  const [showAdminCostModal, setShowAdminCostModal] = useState(false);
  const [adminCostInput, setAdminCostInput] = useState('');

  const order = fallbackStore.orders.get(orderId);
  if (!order) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white p-6 rounded-3xl max-w-sm w-full text-center space-y-3">
          <p className="text-sm font-bold text-gray-700">Order not found.</p>
          <button onClick={onClose} className="py-2 px-4 bg-purple-900 text-white rounded-xl text-xs font-bold">
            Close
          </button>
        </div>
      </div>
    );
  }

  const isDone = order.status === 'DELIVERED' || order.status === 'CANCELED';
  const endTimestamp = order.deliveredAt || order.cancelledAt || order.updatedAt;
  const durationText = isDone
    ? getDeliveryDurationText(order.createdAt, endTimestamp)
    : getElapsedTime(order.createdAt);

  // Customer statistics
  const customerOrdersCount = Array.from(fallbackStore.orders.values()).filter(
    (o) => o.customerId === order.customerId
  ).length;

  // Helper info
  const helperInfo = order.helperId ? fallbackStore.users.get(order.helperId) : null;

  // Commission calculation
  const pricingSettings = fallbackStore.pricingSettings;
  const helperCommissionAmount = calculateHelperCommission(order.deliveryFee, pricingSettings);
  const platformRevenue = order.deliveryFee - helperCommissionAmount;

  // Timeline steps
  const steps: { status: OrderStatus; label: string }[] = [
    { status: 'PENDING', label: 'Request Submitted' },
    { status: 'ACCEPTED', label: 'Accepted / Assigned' },
    { status: 'PURCHASED_EXECUTED', label: 'Purchased / Executed' },
    { status: 'ON_THE_WAY', label: 'On The Way' },
    { status: 'ARRIVED', label: 'Arrived at Location' },
    { status: 'DELIVERED', label: 'Delivered' },
  ];

  const getStepState = (stepStatus: OrderStatus) => {
    const orderIndex = steps.findIndex((s) => s.status === order.status);
    const stepIndex = steps.findIndex((s) => s.status === stepStatus);

    if (order.status === 'CANCELED') return 'CANCELED';
    if (stepIndex < orderIndex) return 'COMPLETED';
    if (stepIndex === orderIndex) return 'CURRENT';
    return 'UPCOMING';
  };

  const handleApproveCancellation = () => {
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      status: 'CANCELED',
      cancelledAt: new Date().toISOString(),
      cancellationRequest: o.cancellationRequest
        ? { ...o.cancellationRequest, status: 'APPROVED' }
        : undefined,
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: 'CANCELED',
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: 'Cancellation approved by Admin',
        },
      ],
    }));
    showAlert('ক্যানসেলেশন মঞ্জুর', 'অর্ডার ক্যানসেলেশন মনঞ্জুর করা হয়েছে।', 'info');
  };

  const handleRejectCancellation = () => {
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      cancellationRequest: o.cancellationRequest
        ? { ...o.cancellationRequest, status: 'REJECTED' }
        : undefined,
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: 'Cancellation request rejected by Admin',
        },
      ],
    }));
    showAlert('রিকোয়েস্ট অগ্রাহ্য', 'ক্যানসেলেশন রিকোয়েস্ট রিজেক্ট করা হয়েছে।', 'info');
  };

  const handleApproveFeeAdjustment = () => {
    if (!order.feeAdjustment) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      deliveryFee: o.feeAdjustment!.amount,
      feeAdjustment: { ...o.feeAdjustment!, status: 'APPROVED' },
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: `Approved fee adjustment to ৳${o.feeAdjustment!.amount}`,
        },
      ],
    }));
    showAlert('ফি সমন্বয় অনুমোদিত', 'ডেলিভারি ফি আপডেট করা হয়েছে।', 'success');
  };

  const handleRejectFeeAdjustment = () => {
    if (!order.feeAdjustment) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      feeAdjustment: { ...o.feeAdjustment!, status: 'REJECTED' },
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: 'Rejected fee adjustment',
        },
      ],
    }));
    showAlert('ফি সমন্বয় বাতিল', 'ডেলিভারি ফি সমন্বয় বাতিল করা হয়েছে।', 'info');
  };

  const handleForceStatusChange = async (targetStatus: OrderStatus) => {
    const confirmed = await showConfirm(
      'স্ট্যাটাস পরিবর্তন',
      `আপনি কি অর্ডারের স্ট্যাটাস '${targetStatus}'-এ পরিবর্তন করতে চান?`,
      'হ্যাঁ, পরিবর্তন করুন',
      'বাতিল'
    );
    if (!confirmed) return;

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      status: targetStatus,
      updatedAt: new Date().toISOString(),
      deliveredAt: targetStatus === 'DELIVERED' ? new Date().toISOString() : o.deliveredAt,
      cancelledAt: targetStatus === 'CANCELED' ? new Date().toISOString() : o.cancelledAt,
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: targetStatus,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: `Status forcefully set to ${targetStatus} by Admin`,
        },
      ],
    }));
    showAlert('আপডেট সম্পন্ন', `অর্ডারের স্ট্যাটাস '${targetStatus}' এ সেট করা হয়েছে।`, 'success');
  };

  const handleAdminDirectCancel = async () => {
    const confirmed = await showConfirm(
      'অর্ডার বাতিল',
      'আপনি কি এই অর্ডারটি সরাসরি বাতিল করতে চান? এটি এখনই কার্যকর হবে।',
      'হ্যাঁ, বাতিল করুন',
      'না'
    );
    if (!confirmed) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      status: 'CANCELED',
      cancelledAt: new Date().toISOString(),
      cancellationRequest: o.cancellationRequest
        ? { ...o.cancellationRequest, status: 'APPROVED' }
        : { requestedBy: 'helper', reason: 'Cancelled by Admin', status: 'APPROVED', createdAt: new Date().toISOString() },
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: 'CANCELED' as OrderStatus,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: 'Order cancelled directly by Admin',
        },
      ],
    }));
    showAlert('অর্ডার বাতিল', 'অর্ডারটি সফলভাবে বাতিল করা হয়েছে।', 'info');
  };

  const handleAdminSaveFee = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(adminFeeInput);
    if (isNaN(val) || val < 0) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      deliveryFee: val,
      feeAdjustment: {
        amount: val,
        reason: adminFeeReason.trim() || 'Admin manual fee override',
        status: 'APPROVED',
        requestedAt: new Date().toISOString(),
      },
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: `Delivery fee updated to ৳${val} by Admin${adminFeeReason.trim() ? `: ${adminFeeReason.trim()}` : ''}`,
        },
      ],
    }));
    setShowAdminFeeModal(false);
    setAdminFeeInput('');
    setAdminFeeReason('');
    showAlert('ফি আপডেট', `ডেলিভারি ফি ৳${val} এ আপডেট করা হয়েছে।`, 'success');
  };

  const handleAdminSaveCost = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(adminCostInput);
    if (isNaN(val) || val < 0) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      productCost: val,
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: `Product cost/budget updated to ৳${val} by Admin`,
        },
      ],
    }));
    setShowAdminCostModal(false);
    setAdminCostInput('');
    showAlert('বাজেট আপডেট', `পণ্যের খরচ/বাজেট ৳${val} এ আপডেট করা হয়েছে।`, 'success');
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-purple-950 via-indigo-900 to-purple-900 text-white flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20">
                <ShoppingBag className="w-6 h-6 text-purple-200" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-extrabold text-lg">Order #{order.id}</h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      order.status === 'DELIVERED'
                        ? 'bg-emerald-400 text-emerald-950'
                        : order.status === 'CANCELED'
                        ? 'bg-red-400 text-red-950'
                        : 'bg-amber-400 text-amber-950'
                    }`}
                  >
                    {order.status}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white text-[10px] font-bold flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-purple-300" />
                    <span>{isDone ? `Delivered in: ${durationText}` : `Elapsed: ${durationText}`}</span>
                  </span>
                </div>
                <p className="text-xs text-purple-200 font-medium mt-0.5">
                  {formatCreatedAt(order.createdAt)}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Content Body */}
          <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
            {/* 1. Customer & Helper Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customer Box */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-slate-800 font-extrabold text-xs">
                  <span className="flex items-center space-x-1.5">
                    <User className="w-4 h-4 text-purple-700" />
                    <span>Customer Details (Who Ordered)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 text-[10px]">
                    {customerOrdersCount} orders placed
                  </span>
                </div>
                <div className="space-y-1 text-slate-700 font-medium">
                  <p className="text-sm font-black text-slate-900">{order.customerName}</p>
                  <p className="flex items-center space-x-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>Primary Phone: <strong className="text-slate-900">{order.customerPhone || 'N/A'}</strong></span>
                  </p>
                  {order.alternativePhone && (
                    <p className="flex items-center space-x-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Alt Phone: <strong>{order.alternativePhone}</strong></span>
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">Customer ID: {order.customerId}</p>
                </div>
              </div>

              {/* Helper Box */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-slate-800 font-extrabold text-xs">
                  <span className="flex items-center space-x-1.5">
                    <Bike className="w-4 h-4 text-indigo-700" />
                    <span>Assigned Helper (Who Accepted)</span>
                  </span>
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="px-2.5 py-1 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-[10px] shadow-sm transition-all"
                  >
                    {order.helperId ? 'Reassign Helper' : 'Assign Helper'}
                  </button>
                </div>
                {order.helperId ? (
                  <div className="space-y-1 text-slate-700 font-medium">
                    <p className="text-sm font-black text-slate-900">{order.helperName || 'Helper'}</p>
                    <p className="flex items-center space-x-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Contact: <strong>{helperInfo?.alternativePhone || 'N/A'}</strong></span>
                    </p>
                    <p className="text-[11px] text-slate-400">Helper ID: {order.helperId}</p>
                    {order.acceptedAt && (
                      <p className="text-[11px] text-indigo-700 font-semibold">
                        Accepted At: {new Date(order.acceptedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-center text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="font-extrabold text-xs flex items-center justify-center space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>No Helper Assigned Yet</span>
                    </div>
                    <p className="text-[11px]">Click "Assign Helper" above to assign an active helper anytime.</p>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Order Items & Instructions */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider flex items-center space-x-1.5">
                <FileText className="w-4 h-4 text-purple-700" />
                <span>Order Content & Instructions</span>
              </h4>
              <p className="font-black text-sm text-gray-900">{order.title}</p>
              
              <div className="space-y-1.5">
                <span className="text-gray-500 font-bold block text-[11px]">Requested Items List:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {order.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-100 font-medium">
                      <span className="text-gray-800 font-bold">{it.name}</span>
                      <span className="px-2 py-0.5 rounded-lg bg-purple-100 text-purple-900 font-extrabold text-[11px]">
                        {it.qty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {order.missingItemPreference && (
                <div className="text-[11px]">
                  <span className="text-gray-500 font-semibold">Missing Item Preference: </span>
                  <span className="font-extrabold text-purple-900 px-2 py-0.5 rounded-md bg-purple-50 border border-purple-100">
                    {order.missingItemPreference}
                  </span>
                </div>
              )}

              {/* Locations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                {order.pickupLocation && (
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-1">
                    <span className="font-extrabold text-[11px] text-gray-700 flex items-center space-x-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-600" />
                      <span>Pickup Location:</span>
                    </span>
                    <p className="text-gray-900 font-medium">{order.pickupLocation.address}</p>
                  </div>
                )}
                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 space-y-1">
                  <span className="font-extrabold text-[11px] text-emerald-900 flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Delivery Location:</span>
                  </span>
                  <p className="text-gray-900 font-medium">{order.deliveryLocation.address}</p>
                </div>
              </div>

              {order.additionalNote && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 font-medium">
                  <span className="font-black text-amber-900 block mb-0.5">Customer Additional Note:</span>
                  <p>{order.additionalNote}</p>
                </div>
              )}
            </div>

            {/* 3. Pricing, Fees & Revenue Breakdown */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider flex items-center space-x-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span>Financial & Revenue Breakdown</span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Product Cost</span>
                  <span className="text-base font-black text-gray-900">
                    {order.productCost !== undefined ? `৳${order.productCost}` : 'Pending'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Delivery Fee</span>
                  <span className="text-base font-black text-emerald-700">৳{order.deliveryFee}</span>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase block">Helper Payout ({pricingSettings.helperCommissionPercent}%)</span>
                  <span className="text-base font-black text-indigo-900">৳{helperCommissionAmount}</span>
                </div>
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-100">
                  <span className="text-[10px] font-bold text-purple-700 uppercase block">Platform Revenue ({100 - pricingSettings.helperCommissionPercent}%)</span>
                  <span className="text-base font-black text-purple-950">৳{platformRevenue}</span>
                </div>
              </div>
            </div>

            {/* 4. Cancellation / Fee Adjustment Alert Banners */}
            {order.cancellationRequest && (
              <div className="p-4 rounded-2xl border border-red-200 bg-red-50 text-red-950 space-y-2">
                <div className="flex items-center justify-between font-extrabold">
                  <span className="flex items-center space-x-1.5 text-red-700">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Cancellation Requested by {order.cancellationRequest.requestedBy}</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-red-200 text-red-900 text-[10px]">
                    Status: {order.cancellationRequest.status}
                  </span>
                </div>
                <p className="italic bg-white/70 p-2.5 rounded-xl border border-red-100">
                  Reason: "{order.cancellationRequest.reason}"
                </p>

                {order.cancellationRequest.status === 'PENDING' && (
                  <div className="flex space-x-2 pt-1">
                    <button
                      onClick={handleApproveCancellation}
                      className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold shadow-sm transition-all"
                    >
                      Approve Order Cancellation
                    </button>
                    <button
                      onClick={handleRejectCancellation}
                      className="flex-1 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold transition-all"
                    >
                      Reject Cancellation
                    </button>
                  </div>
                )}
              </div>
            )}

            {order.feeAdjustment && (
              <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 space-y-2">
                <div className="flex items-center justify-between font-extrabold">
                  <span className="flex items-center space-x-1.5 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Helper Delivery Fee Adjustment Request</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px]">
                    Status: {order.feeAdjustment.status}
                  </span>
                </div>
                <p className="text-xs">
                  Original Fee: ৳{order.originalDeliveryFee} → Requested Fee: <strong>৳{order.feeAdjustment.amount}</strong>
                </p>
                <p className="italic bg-white/70 p-2 rounded-xl border border-amber-100">
                  Reason: "{order.feeAdjustment.reason}"
                </p>

                {order.feeAdjustment.status === 'PENDING' && (
                  <div className="flex space-x-2 pt-1">
                    <button
                      onClick={handleApproveFeeAdjustment}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-sm transition-all"
                    >
                      Approve Fee (৳{order.feeAdjustment.amount})
                    </button>
                    <button
                      onClick={handleRejectFeeAdjustment}
                      className="flex-1 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold transition-all"
                    >
                      Reject Fee Adjustment
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 5. Live Status Timeline & History Audit Log */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-purple-700" />
                <span>Status Timeline & History Audit Log</span>
              </h4>

              <div className="space-y-2 relative pl-4 border-l-2 border-purple-100">
                {order.statusHistory.map((h, i) => (
                  <div key={h.id || i} className="relative space-y-0.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-600 absolute -left-[21px] top-1 border-2 border-white" />
                    <div className="flex items-center justify-between">
                      <span className="font-black text-gray-900">{h.status}</span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {new Date(h.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-gray-600 font-medium">
                      By: <strong className="text-purple-900">{h.actor}</strong> {h.note ? `• ${h.note}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 6. Admin Force Action Buttons */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">
                Admin Override & Edit Actions:
              </span>

              {/* Status Progression Buttons */}
              {order.status !== 'DELIVERED' && order.status !== 'CANCELED' && (
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mb-1.5">Force Status Change:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setShowAssignModal(true)}
                      className="py-2 px-3 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Assign / Reassign Helper</span>
                    </button>
                    {order.status !== 'ACCEPTED' && (
                      <button
                        onClick={() => handleForceStatusChange('ACCEPTED')}
                        className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-sm transition-all"
                      >
                        → ACCEPTED
                      </button>
                    )}
                    {order.status !== 'PURCHASED_EXECUTED' && (
                      <button
                        onClick={() => handleForceStatusChange('PURCHASED_EXECUTED')}
                        className="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>→ PURCHASED</span>
                      </button>
                    )}
                    {order.status !== 'ON_THE_WAY' && (
                      <button
                        onClick={() => handleForceStatusChange('ON_THE_WAY')}
                        className="py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>→ ON THE WAY</span>
                      </button>
                    )}
                    {order.status !== 'ARRIVED' && (
                      <button
                        onClick={() => handleForceStatusChange('ARRIVED')}
                        className="py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>→ ARRIVED</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleForceStatusChange('DELIVERED')}
                      className="py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>→ DELIVERED</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Edit Fee & Budget */}
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1.5">Edit Fee & Budget:</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setAdminFeeInput(String(order.deliveryFee)); setAdminFeeReason(''); setShowAdminFeeModal(true); }}
                    className="py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Update Delivery Fee (৳{order.deliveryFee})</span>
                  </button>
                  <button
                    onClick={() => { setAdminCostInput(order.productCost !== undefined ? String(order.productCost) : ''); setShowAdminCostModal(true); }}
                    className="py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Update Product Cost{order.productCost !== undefined ? ` (৳${order.productCost})` : ''}</span>
                  </button>
                </div>
              </div>

              {/* Direct Cancel (always visible unless already done) */}
              {order.status !== 'DELIVERED' && order.status !== 'CANCELED' && (
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mb-1.5">Danger Zone:</p>
                  <button
                    onClick={handleAdminDirectCancel}
                    className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1.5"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Cancel This Order Immediately</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
            <button
              onClick={onClose}
              className="py-2.5 px-6 rounded-2xl bg-gray-200 hover:bg-gray-300 font-extrabold text-xs text-gray-800 transition-colors"
            >
              Close Details
            </button>
          </div>
        </div>
      </div>

      {/* Helper Assignment Modal */}
      {showAssignModal && (
        <AssignHelperModal
          order={order}
          onClose={() => setShowAssignModal(false)}
          onAssigned={() => setShowAssignModal(false)}
        />
      )}

      {/* Admin: Edit Delivery Fee Modal */}
      {showAdminFeeModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2">
                <Edit2 className="w-5 h-5 text-amber-600" />
                <span>Admin: Update Delivery Fee</span>
              </h3>
              <button onClick={() => setShowAdminFeeModal(false)} className="p-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500">Current fee: <strong>৳{order.deliveryFee}</strong>. This update will be applied immediately and marked as Admin approved.</p>
            <form onSubmit={handleAdminSaveFee} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">New Delivery Fee (৳)</label>
                <input
                  type="number"
                  step="1"
                  value={adminFeeInput}
                  onChange={(e) => setAdminFeeInput(e.target.value)}
                  placeholder="e.g. 80"
                  className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm outline-none focus:border-amber-500"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Reason / Note (Optional)</label>
                <textarea
                  value={adminFeeReason}
                  onChange={(e) => setAdminFeeReason(e.target.value)}
                  placeholder="e.g. Adjusted due to long distance..."
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs h-16 outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex space-x-2 pt-1">
                <button type="button" onClick={() => setShowAdminFeeModal(false)} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-xs">Cancel</button>
                <button type="submit" className="flex-1 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md">Save Fee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin: Edit Product Cost / Budget Modal */}
      {showAdminCostModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-purple-600" />
                <span>Admin: Update Product Cost</span>
              </h3>
              <button onClick={() => setShowAdminCostModal(false)} className="p-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500">Current product cost: <strong>{order.productCost !== undefined ? `৳${order.productCost}` : 'Not set'}</strong>.</p>
            <form onSubmit={handleAdminSaveCost} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Product Cost / Budget (৳)</label>
                <input
                  type="number"
                  step="0.01"
                  value={adminCostInput}
                  onChange={(e) => setAdminCostInput(e.target.value)}
                  placeholder="e.g. 450"
                  className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm outline-none focus:border-purple-500"
                  required
                  autoFocus
                />
              </div>
              <div className="flex space-x-2 pt-1">
                <button type="button" onClick={() => setShowAdminCostModal(false)} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-xs">Cancel</button>
                <button type="submit" className="flex-1 py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md">Save Cost</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
