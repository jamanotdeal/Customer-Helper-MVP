'use client';

import React, { useEffect, useState } from 'react';
import { Order, OrderStatus } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from './CustomModal';
import { ArrowLeft, Check, Clock, MapPin, Phone, AlertTriangle, ShieldCheck, Truck, ShoppingBag, XCircle, UserCheck, MessageSquare } from 'lucide-react';
import { getStatusBadgeInfo } from './OrderCard';
import { formatPlacedDateTime } from '@/lib/timeUtils';

interface OrderDetailsViewProps {
  orderId: string;
  onBack: () => void;
}

export const OrderDetailsView: React.FC<OrderDetailsViewProps> = ({ orderId, onBack }) => {
  const { showConfirm } = useModal();
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    const syncOrder = () => {
      const current = fallbackStore.orders.get(orderId);
      if (current) {
        setOrder({ ...current });
      }
    };
    syncOrder();
    const unsub = fallbackStore.subscribe(syncOrder);
    return () => {
      unsub();
    };
  }, [orderId]);

  if (!order) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Order not found.</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl">
          Back
        </button>
      </div>
    );
  }

  const badge = getStatusBadgeInfo(order.status);

  // Assigned Helper details
  const helperInfo = order.helperId ? fallbackStore.users.get(order.helperId) : null;
  const helperName = order.helperName || helperInfo?.displayName || 'Assigned Helper';
  const helperPhone = order.helperPhone || helperInfo?.alternativePhone || null;

  const getWhatsAppUrl = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formatted = cleanPhone.startsWith('0') ? `880${cleanPhone.slice(1)}` : cleanPhone;
    return `https://wa.me/${formatted}`;
  };

  // Status timeline steps
  const steps: { status: OrderStatus; label: string }[] = [
    { status: 'PENDING', label: 'Request Submitted' },
    { status: 'ACCEPTED', label: 'Helper Accepted' },
    { status: 'PURCHASED_EXECUTED', label: 'Purchased / Executed' },
    { status: 'ON_THE_WAY', label: 'On The Way' },
    { status: 'ARRIVED', label: 'Arrived' },
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

  const handleApproveFeeAdjustment = async () => {
    if (!order.feeAdjustment) return;
    const confirmed = await showConfirm(
      'ফি অ্যাডজাস্টমেন্ট অনুমোদন',
      `আপনি কি হেলপারের ডেলিভারি ফি ৫${order.feeAdjustment.amount} টাকা অনুমোদন করতে চান? মূল ফি ছিল ৫${order.originalDeliveryFee} টাকা।`,
      'হ্যাঁ, Approve করুন',
      'বাতিল'
    );
    if (!confirmed) return;
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
          actor: 'Customer',
          note: `Approved fee adjustment to ৳${o.feeAdjustment!.amount}`,
        },
      ],
    }));
  };

  const handleRejectFeeAdjustment = async () => {
    if (!order.feeAdjustment) return;
    const confirmed = await showConfirm(
      'ফি অ্যাডজাস্টমেন্ট প্রত্যাখ্যান',
      `আপনি কি ডেলিভারি ফি ড্রিকুয়েস্ট প্রত্যাখ্যান করতে চান? মূল ফি ৫${order.originalDeliveryFee} বরাবর থাকবে।`,
      'হ্যাঁ, Reject করুন',
      'বাতিল'
    );
    if (!confirmed) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      feeAdjustment: { ...o.feeAdjustment!, status: 'REJECTED' },
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Customer',
          note: 'Rejected fee adjustment',
        },
      ],
    }));
  };

  const handleCancelOrder = async () => {
    const confirmed = await showConfirm(
      'অর্ডার বাতিল',
      'আপনি কি সত্যিই অর্ডারি বাতিল করতে চান?',
      'হ্যাঁ, বাতিল করুন',
      'ফিরে যান'
    );
    if (!confirmed) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      status: 'CANCELED',
      cancelledAt: new Date().toISOString(),
      cancellationReason: 'Cancelled by customer before purchase',
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: 'CANCELED',
          timestamp: new Date().toISOString(),
          actor: 'Customer',
          note: 'Cancelled by customer',
        },
      ],
    }));
  };

  const canCustomerCancel = order.status === 'PENDING' || order.status === 'ACCEPTED';

  return (
    <div className="w-full bg-white min-h-screen pb-20 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="sticky top-14 z-20 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-2 rounded-2xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex items-center space-x-1"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-xs font-bold">Back</span>
        </button>
        <span className="font-extrabold text-sm text-gray-800">Order #{order.id}</span>
        <div className="w-8" />
      </div>

      <div className="max-w-md mx-auto p-4 space-y-5">
        {/* Main Status Header Card */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-floating">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Live Status</span>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/20 backdrop-blur-md">
              {badge.label}
            </span>
          </div>
          <h2 className="text-xl font-black mb-1">{order.title}</h2>
          <p className="text-xs text-emerald-100">
            Created At: {formatPlacedDateTime(order.createdAt)}
          </p>
        </div>

        {/* Assigned Helper Details & WhatsApp Contact Box */}
        {order.helperId ? (
          <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/50 rounded-3xl border border-emerald-200/80 p-4 shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-base shadow-md shrink-0">
                  {helperName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 block">
                    Assigned Helper
                  </span>
                  <h4 className="font-black text-sm text-gray-900 leading-tight">{helperName}</h4>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white font-extrabold text-[10px] shadow-xs flex items-center space-x-1 shrink-0">
                <UserCheck className="w-3 h-3" />
                <span>Helper Assigned</span>
              </span>
            </div>

            {helperPhone ? (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs bg-white/80 p-2.5 rounded-2xl border border-emerald-100/80 font-semibold text-gray-800">
                  <span className="text-gray-500">WhatsApp / Contact:</span>
                  <span className="font-extrabold text-emerald-950">{helperPhone}</span>
                </div>

                <div className="flex space-x-2">
                  {/* Call Phone Button */}
                  <a
                    href={`tel:${helperPhone}`}
                    className="flex-1 py-2.5 px-3 rounded-2xl bg-white border border-emerald-200 text-emerald-900 font-extrabold text-xs flex items-center justify-center space-x-1.5 hover:bg-emerald-50 active:scale-95 transition-all shadow-xs"
                  >
                    <Phone className="w-4 h-4 text-emerald-600" />
                    <span>Direct Call</span>
                  </a>

                  {/* WhatsApp Direct Chat Button */}
                  <a
                    href={getWhatsAppUrl(helperPhone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow-md"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>WhatsApp Chat</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-2xl bg-white/70 border border-emerald-100 text-xs text-gray-600 text-center font-medium">
                WhatsApp / phone number not provided by helper.
              </div>
            )}
          </div>
        ) : (
          <div className="bg-amber-50/90 rounded-3xl border border-amber-200/80 p-4 text-center space-y-1 shadow-soft">
            <p className="font-extrabold text-xs text-amber-900 flex items-center justify-center space-x-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Waiting for Helper Assignment</span>
            </p>
            <p className="text-[11px] text-amber-700 font-medium">
              A nearby helper will accept your order soon. Once assigned, their name and WhatsApp contact details will appear here.
            </p>
          </div>
        )}

        {/* Live Status Flow Timeline */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
            Live Order Progress
          </h3>
          <div className="space-y-4 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
            {steps.map((st, i) => {
              const state = getStepState(st.status);
              return (
                <div key={st.status} className="flex items-center space-x-3 relative z-10">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-all ${
                      state === 'COMPLETED'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : state === 'CURRENT'
                        ? 'bg-emerald-500 text-white ring-4 ring-emerald-100 animate-bounce'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {state === 'COMPLETED' ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      state === 'CURRENT'
                        ? 'text-emerald-700'
                        : state === 'COMPLETED'
                        ? 'text-gray-900'
                        : 'text-gray-400 font-normal'
                    }`}
                  >
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Fee Adjustment Alert (If requested by Helper) */}
        {order.feeAdjustment && (
          <div
            className={`p-4 rounded-3xl border ${
              order.feeAdjustment.status === 'PENDING'
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : order.feeAdjustment.status === 'APPROVED'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <div className="flex items-center space-x-2 font-bold text-sm mb-1">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>Helper Fee Adjustment Request</span>
            </div>
            <p className="text-xs mb-2">
              Normal Fee: ৳{order.originalDeliveryFee} → Requested Fee: <strong>৳{order.feeAdjustment.amount}</strong>
            </p>
            <p className="text-xs italic bg-white/60 p-2.5 rounded-xl border border-amber-200/50 mb-3">
              "{order.feeAdjustment.reason}"
            </p>

            {order.feeAdjustment.status === 'PENDING' ? (
              <div className="flex space-x-2">
                <button
                  onClick={handleApproveFeeAdjustment}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md"
                >
                  Approve (৳{order.feeAdjustment.amount})
                </button>
                <button
                  onClick={handleRejectFeeAdjustment}
                  className="flex-1 py-2.5 rounded-xl bg-gray-200 text-gray-800 font-bold text-xs"
                >
                  Reject
                </button>
              </div>
            ) : (
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white inline-block">
                Status: {order.feeAdjustment.status}
              </span>
            )}
          </div>
        )}

        {/* Items List */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Requested Items
          </h3>
          <div className="space-y-2">
            {order.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 text-xs">
                <span className="font-semibold text-gray-800">{it.name}</span>
                <span className="font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-lg border border-gray-200">
                  {it.qty}
                </span>
              </div>
            ))}
          </div>

          {order.additionalNote && (
            <div className="mt-3 p-3 rounded-2xl bg-amber-50/70 border border-amber-100 text-xs text-amber-900">
              <span className="font-bold block mb-0.5">Special Instructions:</span>
              <span>{order.additionalNote}</span>
            </div>
          )}
        </div>

        {/* Pricing Breakdown */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft space-y-2 text-xs">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Price Breakdown
          </h3>
          <div className="flex justify-between py-1 text-gray-600">
            <span>Product Cost:</span>
            <span className="font-bold text-gray-900">
              {order.productCost ? `৳${order.productCost}` : 'Not available yet (Waiting for Helper)'}
            </span>
          </div>
          <div className="flex justify-between py-1 text-gray-600">
            <span>Delivery Fee:</span>
            <span className="font-bold text-emerald-700">
              {order.deliveryFee > 0
                ? `৳${order.deliveryFee}`
                : 'Not available yet (Calculated after product cost)'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-t border-gray-100 text-sm font-extrabold text-gray-900">
            <span>Total Payable:</span>
            <span className="text-emerald-700">
              {order.deliveryFee > 0 || order.productCost
                ? `৳${(order.productCost || 0) + order.deliveryFee}`
                : 'Calculating...'}
            </span>
          </div>
        </div>

        {/* Customer Actions / Cancel */}
        {canCustomerCancel && (
          <button
            onClick={handleCancelOrder}
            className="w-full py-3.5 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 font-extrabold text-xs transition-colors flex items-center justify-center space-x-1.5"
          >
            <XCircle className="w-4 h-4" />
            <span>Cancel Request</span>
          </button>
        )}
      </div>
    </div>
  );
};
