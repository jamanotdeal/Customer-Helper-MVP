import React, { useState } from 'react';
import { Order, OrderStatus, LocationData } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { MapPickerModal } from '../MapPickerModal';
import { calculateHelperCommission, calculateEstimatedFee } from '@/lib/pricing';
import { useModal } from '../CustomModal';
import { useAuth } from '@/context/AuthContext';
import { formatCreatedAt, getElapsedTime, getDeliveryDurationText, getOrderAcceptanceDurationText } from '@/lib/timeUtils';
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
  Trash2,
  Calculator,
  Repeat,
  CalendarClock,
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
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.isSuperAdmin ?? false;
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Admin edit modals
  const [showAdminFeeModal, setShowAdminFeeModal] = useState(false);
  const [adminFeeInput, setAdminFeeInput] = useState('');
  const [adminFeeReason, setAdminFeeReason] = useState('');
  const [showAdminCostModal, setShowAdminCostModal] = useState(false);
  const [adminCostInput, setAdminCostInput] = useState('');
  const [showAdminItemsModal, setShowAdminItemsModal] = useState(false);
  const [editItemsInput, setEditItemsInput] = useState('');

  // Admin Two-Way Delivery state
  const [showAdminTwoWayModal, setShowAdminTwoWayModal] = useState(false);
  const [adminTwoWayEnabled, setAdminTwoWayEnabled] = useState(false);
  const [adminReturnWhen, setAdminReturnWhen] = useState<'now' | 'schedule'>('now');
  const [adminDeliveryBackTimeInput, setAdminDeliveryBackTimeInput] = useState('');

  const openTwoWayModal = () => {
    const currentOrder = fallbackStore.orders.get(orderId);
    const isTwoWay = !!currentOrder?.needDeliveryBack;
    setAdminTwoWayEnabled(isTwoWay);
    setAdminReturnWhen(currentOrder?.deliveryBackTime ? 'schedule' : 'now');
    setAdminDeliveryBackTimeInput(
      currentOrder?.deliveryBackTime
        ? currentOrder.deliveryBackTime.substring(0, 16)
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            return d.toISOString().substring(0, 16);
          })()
    );
    setShowAdminTwoWayModal(true);
  };

  const handleAdminSaveTwoWay = (e: React.FormEvent) => {
    e.preventDefault();
    const currentOrder = fallbackStore.orders.get(orderId);
    if (!currentOrder) return;

    if (adminTwoWayEnabled && adminReturnWhen === 'schedule' && !adminDeliveryBackTimeInput) {
      showAlert('সময় দিন', 'শিডিউল রিটার্নের জন্য তারিখ ও সময় নির্বাচন করুন।', 'warning');
      return;
    }

    const newDeliveryBackTime = adminTwoWayEnabled && adminReturnWhen === 'schedule' && adminDeliveryBackTimeInput
      ? new Date(adminDeliveryBackTimeInput).toISOString()
      : undefined;

    // Calculate updated delivery fee based on two-way status change
    let updatedFee = currentOrder.deliveryFee;
    const rawDist = (() => {
      const p = currentOrder.pickupLocation;
      const d = currentOrder.deliveryLocation;
      if (p?.lat && p?.lng && d?.lat && d?.lng) {
        const R = 6371;
        const dLat = ((d.lat - p.lat) * Math.PI) / 180;
        const dLon = ((d.lng - p.lng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((p.lat * Math.PI) / 180) * Math.cos((d.lat * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
      }
      return 0;
    })();

    const estd = calculateEstimatedFee({
      distanceKm: Math.ceil(rawDist),
      weightKg: Math.ceil(currentOrder.weightKg || 0),
      isReturnRequested: adminTwoWayEnabled,
      productPrice: currentOrder.productCost || 0,
    }, fallbackStore.pricingSettings);

    if (adminTwoWayEnabled !== !!currentOrder.needDeliveryBack) {
      updatedFee = estd.totalFee;
    }

    const oldModeText = currentOrder.needDeliveryBack
      ? (currentOrder.deliveryBackTime ? `Scheduled (${new Date(currentOrder.deliveryBackTime).toLocaleString()})` : 'Return Now')
      : 'One-Way (No Return)';
    const newModeText = adminTwoWayEnabled
      ? (newDeliveryBackTime ? `Scheduled (${new Date(newDeliveryBackTime).toLocaleString()})` : 'Return Now')
      : 'One-Way (No Return)';

    fallbackStore.updateOrder(orderId, (o) => ({
      ...o,
      needDeliveryBack: adminTwoWayEnabled,
      needReturnItems: adminTwoWayEnabled,
      deliveryBackTime: newDeliveryBackTime,
      deliveryFee: updatedFee,
      originalDeliveryFee: updatedFee,
      lastEditedBy: 'admin' as const,
      lastEditedAt: new Date().toISOString(),
      editHistory: [
        ...(o.editHistory || []),
        {
          id: `eh-${Date.now()}`,
          timestamp: new Date().toISOString(),
          editedBy: 'admin' as const,
          editedByName: 'Admin',
          changes: [
            {
              field: 'Two-Way Delivery',
              oldValue: oldModeText,
              newValue: newModeText,
            },
          ],
        },
      ],
      statusHistory: [
        ...(o.statusHistory || []),
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: adminTwoWayEnabled
            ? `Two-Way delivery set by Admin (${newDeliveryBackTime ? `Scheduled: ${new Date(newDeliveryBackTime).toLocaleString()}` : 'Return Now'})`
            : 'Order changed to One-Way by Admin',
        },
      ],
    }));

    setShowAdminTwoWayModal(false);
    showAlert(
      'টু-ওয়ে সার্ভিস আপডেট সম্পন্ন',
      adminTwoWayEnabled
        ? `অর্ডারটি সফলভাবে টু-ওয়ে (${newDeliveryBackTime ? 'শিডিউলড রিটার্ন' : 'তাত্ক্ষণিক ফেরত'}) এ রূপান্তর করা হয়েছে।`
        : 'অর্ডারটি ওয়ান-ওয়ে (একমুখী) ডেলিভারিতে রূপান্তর করা হয়েছে।',
      'success'
    );
  };

  const handleAdminSaveItems = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = editItemsInput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    const newItems = lines.map((line, idx) => {
      // Check for (x2) or x2 at the end
      const match = line.match(/\(x(\d+)\)$/i) || line.match(/x(\d+)$/i);
      let qty = '1';
      let name = line;
      if (match) {
        qty = match[1];
        name = line.replace(/\(x\d+\)$/i, '').replace(/x\d+$/i, '').trim();
      }
      return {
        id: `item-${Date.now()}-${idx}`,
        name: name || line,
        qty,
      };
    });

    const currentOrder = fallbackStore.orders.get(orderId);
    if (!currentOrder) return;
    const oldItemsText = (currentOrder.items || []).map((it) => `${it.name}${it.qty ? ` (x${it.qty})` : ''}`).join(', ') || 'Empty';
    const newItemsText = newItems.map((it) => `${it.name}${it.qty ? ` (x${it.qty})` : ''}`).join(', ');

    fallbackStore.updateOrder(orderId, (o) => ({
      ...o,
      items: newItems,
      title: newItems[0]?.name || o.title,
      lastEditedBy: 'admin' as const,
      lastEditedAt: new Date().toISOString(),
      editHistory: [
        ...(o.editHistory || []),
        {
          id: `eh-${Date.now()}`,
          timestamp: new Date().toISOString(),
          editedBy: 'admin' as const,
          editedByName: 'Admin',
          changes: [
            {
              field: 'Order Items',
              oldValue: oldItemsText,
              newValue: newItemsText,
            },
          ],
        },
      ],
      statusHistory: [
        ...(o.statusHistory || []),
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: `Order items updated by Admin to: ${newItemsText}`,
        },
      ],
    }));

    setShowAdminItemsModal(false);
    showAlert('অর্ডার আইটেম আপডেট সম্পন্ন', 'অর্ডারের আইটেম বিস্তারিত সফলভাবে পরিবর্তন করা হয়েছে।', 'success');
  };
  
  const [activeMapPicker, setActiveMapPicker] = useState<'pickup' | 'delivery' | null>(null);

  const handleAdminSaveAddress = (type: 'pickup' | 'delivery', loc: LocationData) => {
    fallbackStore.updateOrder(orderId, (o) => {
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
        lastEditedBy: 'admin' as const,
        lastEditedAt: new Date().toISOString(),
        editHistory: [
          ...(o.editHistory || []),
          {
            id: `eh-${Date.now()}`,
            timestamp: new Date().toISOString(),
            editedBy: 'admin' as const,
            editedByName: 'Admin',
            changes,
          },
        ],
        statusHistory: [
          ...(o.statusHistory || []),
          {
            id: `sh-${Date.now()}`,
            status: o.status,
            timestamp: new Date().toISOString(),
            actor: 'Admin',
            note: `${type === 'pickup' ? 'Pickup' : 'Delivery'} address updated to: ${loc.address}`,
          },
        ],
      };
      return updatedOrder;
    });
    showAlert('ঠিকানা আপডেট করা হয়েছে', 'ঠিকানা সফলভাবে পরিবর্তন করা হয়েছে এবং কাস্টমারকে জানানো হয়েছে।', 'success');
  };

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
  const durationText = isDone
    ? getDeliveryDurationText(order)
    : getElapsedTime(order);

  // Customer statistics
  const customerOrdersCount = Array.from(fallbackStore.orders.values()).filter(
    (o) => o.customerId === order.customerId
  ).length;

  // Helper info
  const helperInfo = order.helperId ? fallbackStore.users.get(order.helperId) : null;

  // Commission calculation
  const pricingSettings = fallbackStore.pricingSettings;
  const minFee = pricingSettings.feeCalculatorMinFee ?? 20;
  const effectiveFee = Math.max(order.deliveryFee || 0, minFee);
  const helperCommissionAmount = calculateHelperCommission(effectiveFee, pricingSettings);
  const platformRevenue = effectiveFee - helperCommissionAmount;

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
        ...(o.statusHistory || []),
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
        ...(o.statusHistory || []),
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
        ...(o.statusHistory || []),
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
        ...(o.statusHistory || []),
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
        ...(o.statusHistory || []),
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
        ...(o.statusHistory || []),
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
        ...(o.statusHistory || []),
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
        ...(o.statusHistory || []),
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
                  <h3 className="font-extrabold text-lg">Order-#{order.id}</h3>
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
                  {order.needDeliveryBack && (
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-400 text-indigo-950 text-[10px] font-extrabold uppercase flex items-center gap-1">
                      🔁 Return
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white text-[10px] font-bold flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-purple-300" />
                    <span>{order.status === 'DELIVERED' ? `delivered in: ${getDeliveryDurationText(order)}` : order.status === 'CANCELED' ? `cancelled in: ${getDeliveryDurationText(order)}` : `Running: ${getElapsedTime(order)}`}</span>
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-black text-slate-900">{order.customerName}</span>
                    {(() => {
                      const custUser = fallbackStore.users.get(order.customerId);
                      if (!custUser?.labels || custUser.labels.length === 0) return null;
                      return custUser.labels.map((lbl) => (
                        <span key={lbl} className="px-2 py-0.5 rounded-md bg-amber-100 text-purple-950 font-extrabold text-[10px] border border-amber-200">
                          🏷️ {lbl}
                        </span>
                      ));
                    })()}
                  </div>
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-black text-slate-900">{order.helperName || 'Helper'}</span>
                      {helperInfo?.labels && helperInfo.labels.length > 0 && helperInfo.labels.map((lbl) => (
                        <span key={lbl} className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-950 font-extrabold text-[10px] border border-indigo-200">
                          🏷️ {lbl}
                        </span>
                      ))}
                    </div>
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
                    {getOrderAcceptanceDurationText(order) && (
                      <div className="mt-2 text-[11px] font-extrabold text-indigo-900 bg-indigo-100/80 px-3 py-1.5 rounded-xl border border-indigo-200 flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Accepted in: <strong className="text-indigo-950 font-black">{getOrderAcceptanceDurationText(order)}</strong> after creation</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-center text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="font-extrabold text-xs flex items-center justify-center space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>No Helper Assigned Yet</span>
                    </div>
                    <p className="text-[11px]">Click "Assign Helper" above to assign an active helper anytime.</p>
                    <p className="text-[10px] text-amber-800 font-bold mt-1">Elapsed: {getElapsedTime(order)}</p>
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
              <p className="font-black text-sm text-gray-900">{`Order-#${order.id}`}</p>
              
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-bold block text-[11px]">Requested Items List:</span>
                  <button
                    onClick={() => {
                      setEditItemsInput(
                        (order.items || []).map((it) => `${it.name}${it.qty ? ` (x${it.qty})` : ''}`).join('\n')
                      );
                      setShowAdminItemsModal(true);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 font-extrabold text-[10px] flex items-center space-x-1 transition-all"
                    title="Edit Customer Order Items"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit Order Items</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(order.items || []).map((it) => (
                    <div key={it.id} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-100 font-medium">
                      <span className="text-gray-800 font-bold">{it.name}</span>
                      {it.qty && <span className="text-xs text-gray-500 font-bold">Qty: {it.qty}</span>}
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
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[11px] text-gray-700 flex items-center space-x-1">
                        <MapPin className="w-3.5 h-3.5 text-amber-600" />
                        <span>Pickup Location:</span>
                      </span>
                      <button
                        onClick={() => setActiveMapPicker('pickup')}
                        className="p-1 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 transition-colors shrink-0"
                        title="Edit Pickup Location"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-gray-900 font-medium leading-relaxed">{order.pickupLocation.address}</p>
                  </div>
                )}
                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[11px] text-emerald-900 flex items-center space-x-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Delivery Location:</span>
                    </span>
                    <button
                      onClick={() => setActiveMapPicker('delivery')}
                      className="p-1 rounded-lg bg-emerald-200 hover:bg-emerald-300 text-emerald-800 transition-colors shrink-0"
                      title="Edit Delivery Location"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-gray-900 font-medium leading-relaxed">{order.deliveryLocation?.address || 'N/A'}</p>
                </div>
              </div>

              {order.additionalNote && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 font-medium">
                  <span className="font-black text-amber-900 block mb-0.5">Customer Additional Note:</span>
                  <p>{order.additionalNote}</p>
                </div>
              )}

              {order.helperNote && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 font-medium">
                  <span className="font-black text-purple-900 block mb-0.5 flex items-center space-x-1">
                    <FileText className="w-3.5 h-3.5 text-purple-700" />
                    <span>Helper Private Note (🔒 Customer hidden):</span>
                  </span>
                  <p className="text-xs text-purple-950 font-semibold">{order.helperNote}</p>
                </div>
              )}

              {/* Two-Way / Return Delivery Settings Card */}
              <div className={`p-4 rounded-2xl border transition-all ${
                order.needDeliveryBack
                  ? 'bg-indigo-50/90 border-indigo-300 text-indigo-950 shadow-sm'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2.5">
                    <div className={`p-2.5 rounded-xl ${order.needDeliveryBack ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      <Repeat className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-extrabold text-xs">Two-Way / Return Service (দ্বিমুখী ডেলিভারি)</h4>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          order.needDeliveryBack ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {order.needDeliveryBack ? '🔁 Two-Way' : 'One-Way'}
                        </span>
                      </div>
                      {order.needDeliveryBack ? (
                        <p className="text-xs font-bold text-indigo-900 mt-0.5">
                          Return Option:{' '}
                          <strong className="text-indigo-950">
                            {order.deliveryBackTime
                              ? `⏰ Scheduled Return (${new Date(order.deliveryBackTime).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' })})`
                              : '⚡ Return Now (তাত্ক্ষণিক ফেরত)'}
                          </strong>
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          Standard single delivery. Click button to convert this order into a 2-Way return order.
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={openTwoWayModal}
                    className={`py-2 px-3.5 rounded-xl font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1.5 ${
                      order.needDeliveryBack
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        : 'bg-purple-900 hover:bg-purple-950 text-white'
                    }`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>{order.needDeliveryBack ? 'Edit Two-Way / Option & Times' : 'Make Two-Way Order'}</span>
                  </button>
                </div>
              </div>
            {/* 2b. Helper Shop Orders (Store Requests) */}
            {(() => {
              const shopOrders = fallbackStore.getShopOrdersForOrder(order.id);
              if (shopOrders.length === 0) return null;
              return (
                <div className="bg-purple-50/60 rounded-2xl border border-purple-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-xs text-purple-950 uppercase tracking-wider flex items-center space-x-1.5">
                      <ShoppingBag className="w-4 h-4 text-purple-700" />
                      <span>Helper Store Requests (নিবন্ধিত দোকানে হেলপারের পাঠানো অর্ডার)</span>
                    </h4>
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-200 text-purple-900 font-extrabold text-[10px]">
                      {shopOrders.length} Shop Order{shopOrders.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {shopOrders.map((so) => {
                      const shop = fallbackStore.shops.get(so.shopId);
                      return (
                        <div key={so.id} className="bg-white rounded-xl p-3 border border-purple-100 shadow-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="font-black text-gray-900 text-xs">{so.shopName}</span>
                              {shop?.type && (
                                <span className="text-[9px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-black uppercase">
                                  {shop.type}
                                </span>
                              )}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              so.status === 'HANDOVER' || so.status === 'READY'
                                ? 'bg-emerald-100 text-emerald-800'
                                : so.status === 'CANCELED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {so.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 font-semibold bg-gray-50 p-2 rounded-lg border border-gray-100">
                            {so.requestText}
                          </p>
                          <div className="flex items-center justify-between text-[11px] pt-0.5 text-gray-600">
                            <span>Set Price: <strong className="text-purple-900">{so.price !== undefined ? `৳${so.price}` : 'Not set'}</strong></span>
                            {shop?.whatsapp && <span>Shop Phone: <strong className="text-gray-900">{shop.whatsapp}</strong></span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            </div>

            {/* 3. Pricing Calculation Summary */}
            {(() => {
              // Calculate breakdown using the fee calculator settings
              // Raw distance (for display)
              const rawDistanceKm = (() => {
                const p = order.pickupLocation;
                const d = order.deliveryLocation;
                if (p?.lat && p?.lng && d?.lat && d?.lng) {
                  const R = 6371;
                  const dLat = ((d.lat - p.lat) * Math.PI) / 180;
                  const dLon = ((d.lng - p.lng) * Math.PI) / 180;
                  const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(p.lat*Math.PI/180)*Math.cos(d.lat*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
                  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10;
                }
                return 0;
              })();
              // Ceil to nearest whole number for pricing (1.2km → 2km, 1.6kg → 2kg)
              const distanceKm = rawDistanceKm > 0 ? Math.ceil(rawDistanceKm) : 0;
              const rawWeightKg = order.weightKg ?? 0;
              const weightKg = rawWeightKg > 0 ? Math.ceil(rawWeightKg) : 0;
              const productCost = order.productCost ?? 0;
              const isReturn = order.needDeliveryBack ?? false;
              const est = calculateEstimatedFee(
                { distanceKm, weightKg, isReturnRequested: isReturn, productPrice: productCost },
                pricingSettings
              );
              const shopPrices = fallbackStore.getShopOrdersForOrder(order.id);
              const shopTotal = shopPrices.filter(so => so.status !== 'CANCELED').reduce((sum, so) => sum + (so.price ?? 0), 0);
              const processingFeeValue = est.processingFee;
              const platformRevenueTotal = platformRevenue + processingFeeValue;
              const totalCollectable = order.deliveryFee + productCost + processingFeeValue;
              const feeRows: { label: string; value: string | number; sub?: string; color?: string; bold?: boolean }[] = [
                { label: 'Product Cost (পণ্যের দাম)', value: productCost > 0 ? `৳${productCost}` : 'Not set', sub: 'Entered by store/helper', color: 'text-gray-800' },
                ...(shopTotal > 0 ? [{ label: 'Shop Orders Total', value: `৳${shopTotal}`, sub: 'Sum of store prices', color: 'text-purple-800' }] : []),
                { label: `Distance Fee (${rawDistanceKm} km → ${distanceKm} km × ৳${est.perKmRate}/km)`, value: distanceKm > 0 ? `৳${est.distanceFee}` : 'No GPS data', sub: 'Rounded up to nearest whole km for pricing', color: 'text-blue-700' },
                { label: `Weight Fee (${rawWeightKg} kg → ${weightKg} kg × ৳${est.perKgRate}/kg)`, value: weightKg > 0 ? `৳${est.weightFee}` : '৳0 (no weight set)', sub: 'Rounded up to nearest whole kg for pricing', color: 'text-teal-700' },
                { label: `Delivery Sub-total (min ৳${est.minFee})`, value: `৳${est.deliverySubtotal}`, sub: 'Distance + weight; min fee applied', color: 'text-slate-700' },
                ...(isReturn ? [{ label: `Return/Two-Way Fee (+${est.returnPercent}%)`, value: `৳${est.returnFee}`, sub: 'Return delivery surcharge', color: 'text-indigo-700' }] : []),
                ...(est.processingFee > 0 ? [{ label: `Processing Fee (${pricingSettings.feeCalculatorProcessingFeeType === 'percent' ? pricingSettings.feeCalculatorProcessingFee + '%' : '৳' + pricingSettings.feeCalculatorProcessingFee})`, value: `৳${est.processingFee}`, sub: 'Applied when product cost is set', color: 'text-orange-700' }] : []),
              ];

              return (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
                  <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider flex items-center space-x-1.5">
                    <Calculator className="w-4 h-4 text-emerald-600" />
                    <span>Pricing Calculation Summary</span>
                  </h4>

                  {/* Charge Breakdown Table */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Charge Breakdown</p>
                    <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                      {feeRows.map((row, idx) => (
                        <div key={idx} className="flex items-center justify-between px-3 py-2 bg-white hover:bg-gray-50/80 transition-colors">
                          <div>
                            <span className="text-xs font-semibold text-gray-700">{row.label}</span>
                            {row.sub && <p className="text-[10px] text-gray-400">{row.sub}</p>}
                          </div>
                          <span className={`text-xs font-black ${row.color || 'text-gray-900'}`}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Final Summary Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase block">Delivery Fee</span>
                      <span className="text-sm font-black text-emerald-900">৳{order.deliveryFee}</span>
                      <p className="text-[9px] text-emerald-600 mt-0.5">Charged to customer</p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase block">Product Cost</span>
                      <span className="text-sm font-black text-gray-900">{productCost > 0 ? `৳${productCost}` : '—'}</span>
                      <p className="text-[9px] text-gray-400 mt-0.5">Collected from customer</p>
                    </div>
                    <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-center">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase block">Helper Payout ({pricingSettings.helperCommissionPercent}%)</span>
                      <span className="text-sm font-black text-indigo-900">৳{helperCommissionAmount}</span>
                      <p className="text-[9px] text-indigo-600 mt-0.5">of delivery fee</p>
                    </div>
                    <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-center">
                      <span className="text-[10px] font-bold text-purple-700 uppercase block">Platform Revenue</span>
                      <span className="text-sm font-black text-purple-950">৳{platformRevenueTotal}</span>
                      <p className="text-[9px] text-purple-600 mt-0.5">
                        {100 - pricingSettings.helperCommissionPercent}% fee{processingFeeValue > 0 ? ` + ৳${processingFeeValue} processing` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Total Collectable */}
                  <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 p-4 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-emerald-100 uppercase tracking-wide">Total Collected / Collectable</p>
                        <p className="text-[10px] text-emerald-200 mt-0.5">
                          Delivery Fee + Product Cost{processingFeeValue > 0 ? ' + Processing Fee' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black">৳{totalCollectable}</span>
                        <p className="text-[10px] text-emerald-200">
                          ({order.deliveryFee} fee + {productCost > 0 ? productCost : 0} products{processingFeeValue > 0 ? ` + ${processingFeeValue} processing` : ''})
                        </p>
                      </div>
                    </div>
                    {order.status !== 'DELIVERED' && (
                      <p className="text-[10px] text-emerald-200 mt-2 italic">
                        ⚠ Order not yet delivered — amount is collectable but not yet confirmed
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

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
              <div className={`p-4 rounded-2xl border space-y-2 text-xs ${
                order.feeAdjustment.status === 'APPROVED'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                  : 'border-amber-200 bg-amber-50 text-amber-950'
              }`}>
                <div className="flex items-center justify-between font-extrabold">
                  <span className="flex items-center space-x-1.5">
                    <AlertTriangle className={`w-4 h-4 ${order.feeAdjustment.status === 'APPROVED' ? 'text-emerald-600' : 'text-amber-600'}`} />
                    <span>Helper Delivery Fee Adjustment</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    order.feeAdjustment.status === 'APPROVED'
                      ? 'bg-emerald-200 text-emerald-900'
                      : 'bg-amber-200 text-amber-900'
                  }`}>
                    {order.feeAdjustment.status}
                  </span>
                </div>
                <p>
                  Original Fee: ৳{order.originalDeliveryFee} → Updated Fee: <strong>৳{order.feeAdjustment.amount}</strong>
                </p>
                {order.feeAdjustment.reason && (
                  <p className="italic bg-white/70 p-2 rounded-xl border border-current/10">
                    Note: &quot;{order.feeAdjustment.reason}&quot;
                  </p>
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
                {(order.statusHistory || []).map((h, i) => (
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

            {/* 5b. Customer & Order Edit History Diffs */}
            {order.editHistory && order.editHistory.length > 0 && (
              <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-amber-950 uppercase tracking-wider flex items-center space-x-1.5">
                    <Edit2 className="w-4 h-4 text-amber-700" />
                    <span>Customer Edit History &amp; Change Logs (পরিবর্তনের ইতিহাস)</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-extrabold text-[10px]">
                    {order.editHistory.length} Edit{order.editHistory.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-3">
                  {order.editHistory.map((item, idx) => (
                    <div key={item.id || idx} className="bg-white rounded-xl p-3 border border-amber-200/80 shadow-xs space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-extrabold text-amber-900">
                          Edited by {item.editedByName || item.editedBy} ({item.editedBy.toUpperCase()})
                        </span>
                        <span className="text-gray-400 font-medium">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="space-y-1 pt-1 border-t border-gray-100">
                        {(item.changes || []).map((change, cIdx) => (
                          <div key={cIdx} className="text-xs flex flex-wrap items-baseline justify-between gap-2 p-1.5 rounded-lg bg-gray-50">
                            <span className="font-bold text-gray-700">{change.field}:</span>
                            <span className="font-medium text-right">
                              <span className="line-through text-red-600 mr-1.5">{change.oldValue}</span>
                              <span className="text-emerald-700 font-bold">→ {change.newValue}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. Admin Force Action Buttons */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">
                Admin Override & Edit Actions:
              </span>

              {/* Status Progression Buttons — available for ALL orders including CANCELED */}
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
                  {order.status !== 'PENDING' && (
                    <button
                      onClick={() => handleForceStatusChange('PENDING')}
                      className="py-2 px-3 rounded-xl bg-gray-500 hover:bg-gray-600 text-white font-extrabold text-xs shadow-sm transition-all"
                    >
                      ← PENDING
                    </button>
                  )}
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
                  {order.status !== 'DELIVERED' && (
                    <button
                      onClick={() => handleForceStatusChange('DELIVERED')}
                      className="py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>→ DELIVERED</span>
                    </button>
                  )}
                </div>
              </div>

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

              {/* Direct Cancel (always visible unless already canceled) */}
              {order.status !== 'CANCELED' && (
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

              {/* Super Admin Only: Delete Order Permanently */}
              {isSuperAdmin && (
                <div className="pt-2 border-t border-red-100">
                  <p className="text-[10px] text-red-700 font-extrabold uppercase mb-1.5 flex items-center space-x-1">
                    <ShieldAlert className="w-3 h-3" />
                    <span>Super Admin Only — Permanent Delete:</span>
                  </p>
                  <button
                    onClick={async () => {
                      const confirmed = await showConfirm(
                        '⚠️ Permanently Delete Order',
                        `Are you sure you want to PERMANENTLY DELETE Order #${order.id}? This cannot be undone. This is intended only for removing test/dummy orders.`,
                        'Yes, Delete Permanently',
                        'Cancel'
                      );
                      if (!confirmed) return;
                      await fallbackStore.deleteOrder(order.id);
                      showAlert('অর্ডার মুছে ফেলা হয়েছে', `Order #${order.id} permanently deleted.`, 'info');
                      onClose();
                    }}
                    className="py-2 px-4 rounded-xl bg-red-950 hover:bg-black text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1.5 border border-red-800"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>🗑 Permanently Delete This Order</span>
                  </button>
                  <p className="text-[10px] text-red-600 mt-1">Only use this to remove test orders. Actual order history should not be deleted.</p>
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

      {/* Admin: Edit Order Items Modal */}
      {showAdminItemsModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2">
                <Edit2 className="w-5 h-5 text-purple-600" />
                <span>Admin: Edit Order Items</span>
              </h3>
              <button onClick={() => setShowAdminItemsModal(false)} className="p-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Enter items (one per line). Format example: <strong>চাল (x2 kg)</strong> or <strong>দুধ (x1 L)</strong>.
            </p>
            <form onSubmit={handleAdminSaveItems} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Items List (One item per line)</label>
                <textarea
                  rows={5}
                  value={editItemsInput}
                  onChange={(e) => setEditItemsInput(e.target.value)}
                  placeholder="Item 1 (x2)&#10;Item 2"
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-500 leading-relaxed"
                  required
                  autoFocus
                />
              </div>
              <div className="flex space-x-2 pt-1">
                <button type="button" onClick={() => setShowAdminItemsModal(false)} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-xs">Cancel</button>
                <button type="submit" className="flex-1 py-3 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-bold text-xs shadow-md">Save Items</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Admin: Two-Way / Return Delivery Settings Modal */}
      {showAdminTwoWayModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2">
                <Repeat className="w-5 h-5 text-indigo-600" />
                <span>Admin: Two-Way Delivery & Return Options</span>
              </h3>
              <button onClick={() => setShowAdminTwoWayModal(false)} className="p-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Configure whether this order requires a return trip (Two-Way) and specify the return selection option or scheduled timing.
            </p>

            <form onSubmit={handleAdminSaveTwoWay} className="space-y-4">
              {/* Toggle Switch */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-indigo-950 block">Two-Way Delivery (দ্বিমুখী অর্ডার)</span>
                  <span className="text-[11px] text-indigo-700 font-medium">হেলপার পার্সেল নিয়ে ফেরত আসবেন</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={adminTwoWayEnabled}
                  onClick={() => setAdminTwoWayEnabled(!adminTwoWayEnabled)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none shrink-0 ${
                    adminTwoWayEnabled ? 'bg-indigo-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                      adminTwoWayEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Two Way Options & Time Picker */}
              {adminTwoWayEnabled && (
                <div className="space-y-3 p-3.5 rounded-2xl bg-gray-50 border border-gray-200 animate-in fade-in duration-150">
                  <label className="text-xs font-extrabold text-gray-800 block">Return Selection Option (ফেরতের সময়সূচী অপশন)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdminReturnWhen('now')}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        adminReturnWhen === 'now'
                          ? 'bg-indigo-600 border-indigo-600 text-white font-extrabold shadow-sm'
                          : 'bg-white border-gray-200 text-gray-700 font-bold hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-xs flex items-center gap-1">⚡ Return Now</span>
                      <span className={`text-[10px] mt-1 ${adminReturnWhen === 'now' ? 'text-indigo-100' : 'text-gray-400'}`}>
                        তাত্ক্ষণিক ফেরত আসবেন
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAdminReturnWhen('schedule')}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        adminReturnWhen === 'schedule'
                          ? 'bg-indigo-600 border-indigo-600 text-white font-extrabold shadow-sm'
                          : 'bg-white border-gray-200 text-gray-700 font-bold hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-xs flex items-center gap-1">⏰ Scheduled Return</span>
                      <span className={`text-[10px] mt-1 ${adminReturnWhen === 'schedule' ? 'text-indigo-100' : 'text-gray-400'}`}>
                        নির্দিষ্ট সময়ে ফেরত
                      </span>
                    </button>
                  </div>

                  {adminReturnWhen === 'schedule' && (
                    <div className="space-y-1.5 pt-1 animate-in fade-in duration-150">
                      <label className="text-xs font-bold text-gray-700 flex items-center space-x-1">
                        <CalendarClock className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Scheduled Return Date & Time (ফেরতের তারিখ ও সময়)</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={adminDeliveryBackTimeInput}
                        onChange={(e) => setAdminDeliveryBackTimeInput(e.target.value)}
                        className="w-full p-3 rounded-xl border border-gray-200 font-bold text-xs outline-none focus:border-indigo-600 bg-white"
                        required
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex space-x-2 pt-1">
                <button type="button" onClick={() => setShowAdminTwoWayModal(false)} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-xs">
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md">
                  Save Two-Way Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin: Address Edit Map Picker Modal */}
      {activeMapPicker && (
        <MapPickerModal
          isOpen={activeMapPicker !== null}
          onClose={() => setActiveMapPicker(null)}
          title={activeMapPicker === 'pickup' ? 'Edit Pickup Location' : 'Edit Delivery Location'}
          initialLocation={activeMapPicker === 'pickup' ? order.pickupLocation : order.deliveryLocation}
          modalType={activeMapPicker}
          onSelectLocation={(loc) => handleAdminSaveAddress(activeMapPicker, loc)}
        />
      )}
    </>
  );
};
