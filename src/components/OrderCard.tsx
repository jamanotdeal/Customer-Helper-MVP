import React, { useState, useEffect } from 'react';
import { Order, OrderStatus } from '@/types';
import { MapPin, ArrowRight, Clock, Calendar, CheckCircle2, XCircle, Truck, PackageCheck, AlertCircle, UserCheck, ShoppingBag, Eye } from 'lucide-react';
import { formatCreatedAt, formatPlacedDateTime, getElapsedTime, getDeliveryDurationText } from '@/lib/timeUtils';

interface OrderCardProps {
  order: Order;
  onClick: () => void;
  showDuration?: boolean;
  /** When true, card shows a "New" badge and timer; clicking marks as viewed */
  isNew?: boolean;
  /** When true, shows customer-optimised layout (no delivery location, created time, View Details button) */
  customerView?: boolean;
  /** When true, shows concise helper layout with only: what's needed, timer, status, and view details */
  helperActiveView?: boolean;
}

export const getStatusBadgeInfo = (status: OrderStatus) => {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending Helper', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock };
    case 'ACCEPTED':
      return { label: 'Helper Assigned', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: CheckCircle2 };
    case 'PURCHASED_EXECUTED':
      return { label: 'Purchased / Executed', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: PackageCheck };
    case 'ON_THE_WAY':
      return { label: 'On The Way', color: 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse', icon: Truck };
    case 'ARRIVED':
      return { label: 'Arrived at Location', color: 'bg-emerald-500 text-white border-emerald-600', icon: MapPin };
    case 'DELIVERED':
      return { label: 'Completed', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: CheckCircle2 };
    case 'CANCELED':
      return { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle };
    default:
      return { label: status, color: 'bg-gray-100 text-gray-800', icon: Clock };
  }
};

// Each status gets a unique card accent to make orders feel visually distinct
const getCardAccent = (status: OrderStatus) => {
  switch (status) {
    case 'PENDING':
      return {
        border: 'border-amber-200',
        bar: 'bg-amber-400',
        bg: 'bg-gradient-to-br from-white to-amber-50/40',
        locationBg: 'bg-amber-50/60 border-amber-100',
      };
    case 'ACCEPTED':
      return {
        border: 'border-blue-200',
        bar: 'bg-blue-400',
        bg: 'bg-gradient-to-br from-white to-blue-50/40',
        locationBg: 'bg-blue-50/60 border-blue-100',
      };
    case 'PURCHASED_EXECUTED':
      return {
        border: 'border-indigo-200',
        bar: 'bg-indigo-400',
        bg: 'bg-gradient-to-br from-white to-indigo-50/40',
        locationBg: 'bg-indigo-50/50 border-indigo-100',
      };
    case 'ON_THE_WAY':
      return {
        border: 'border-emerald-300',
        bar: 'bg-emerald-500',
        bg: 'bg-gradient-to-br from-white to-emerald-50/50',
        locationBg: 'bg-emerald-50/70 border-emerald-100',
      };
    case 'ARRIVED':
      return {
        border: 'border-teal-300',
        bar: 'bg-teal-500',
        bg: 'bg-gradient-to-br from-white to-teal-50/50',
        locationBg: 'bg-teal-50/70 border-teal-100',
      };
    case 'DELIVERED':
      return {
        border: 'border-gray-200',
        bar: 'bg-gray-300',
        bg: 'bg-white',
        locationBg: 'bg-gray-50/70 border-gray-100',
      };
    case 'CANCELED':
      return {
        border: 'border-red-200',
        bar: 'bg-red-400',
        bg: 'bg-gradient-to-br from-white to-red-50/30',
        locationBg: 'bg-red-50/50 border-red-100',
      };
    default:
      return {
        border: 'border-gray-100',
        bar: 'bg-gray-200',
        bg: 'bg-white',
        locationBg: 'bg-gray-50/70 border-gray-100',
      };
  }
};

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  onClick,
  showDuration = false,
  isNew = false,
  customerView = false,
  helperActiveView = false,
}) => {
  const badge = getStatusBadgeInfo(order.status);
  const accent = getCardAccent(order.status);
  const BadgeIcon = badge.icon;
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

  // Brief items summary (truncated via CSS)
  const itemsSummary = order.items?.length
    ? order.items.map((i) => `${i.name}${i.qty && Number(i.qty) > 1 ? ` ×${i.qty}` : ''}`).join(', ')
    : 'No items listed';

  if (helperActiveView) {
    return (
      <div
        onClick={onClick}
        className={`rounded-3xl border shadow-soft hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.99] overflow-hidden ${
          isNew
            ? 'border-blue-300 bg-gradient-to-br from-white to-blue-50/50 ring-2 ring-blue-200'
            : `${accent.border} ${accent.bg}`
        }`}
      >
        {/* Status accent bar at top */}
        <div className={`h-1.5 w-full ${isNew ? 'bg-blue-500' : accent.bar}`} />

        <div className="p-4 space-y-3">
          {/* Header row: Service needed & Timer/Status */}
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <h3 className="font-extrabold text-gray-900 text-sm leading-tight truncate">
                {order.service || order.title || 'Service Needed'}
              </h3>
            </div>
            <div className="flex items-center space-x-1.5 shrink-0">
              {/* Timer */}
              <span className="text-xs font-black text-red-800 bg-red-50 px-2.5 py-1 rounded-lg inline-flex items-center space-x-1 border border-red-100 shrink-0">
                <Clock className="w-4 h-4 text-red-600 animate-spin-slow" />
                <span className="font-mono">{elapsed}</span>
              </span>

              {/* Status */}
              <span className={`flex items-center space-x-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${badge.color}`}>
                <BadgeIcon className="w-2.5 h-2.5" />
                <span>{badge.label}</span>
              </span>
            </div>
          </div>

          {/* View Details action */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold text-xs flex items-center justify-center space-x-2 transition-all shadow-sm"
          >
            <span>View Details</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (customerView) {
    return (
      <div
        onClick={onClick}
        className={`rounded-3xl border shadow-soft hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.99] overflow-hidden ${accent.border} ${accent.bg}`}
      >
        {/* Status accent bar at top */}
        <div className={`h-1.5 w-full ${accent.bar}`} />

        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0 flex-1 pr-3">
              <h3 className="font-extrabold text-gray-900 text-base leading-tight line-clamp-2">
                {order.title || 'Request'}
              </h3>
              <p className="text-[11px] font-semibold text-gray-400 mt-1.5 flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span>{formatCreatedAt(order.createdAt)}</span>
              </p>
            </div>

            {order.status !== 'PENDING' && (
              <div className="shrink-0">
                <span
                  className={`flex items-center space-x-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${badge.color}`}
                >
                  <BadgeIcon className="w-3 h-3" />
                  <span>{badge.label}</span>
                </span>
              </div>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold text-sm flex items-center justify-center space-x-2 transition-all shadow-sm"
          >
            <span>View Details</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-3xl border shadow-soft hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.99] overflow-hidden ${
        isNew
          ? 'border-blue-300 bg-gradient-to-br from-white to-blue-50/50 ring-2 ring-blue-200'
          : `${accent.border} ${accent.bg}`
      }`}
    >
      {/* Status accent bar at top */}
      <div className={`h-1.5 w-full ${isNew ? 'bg-blue-500' : accent.bar}`} />

      <div className="p-5">
        {/* Header row: customer name + new badge (right) */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1 pr-3">
            <h3 className="font-extrabold text-gray-900 text-base leading-tight line-clamp-1">
              {order.customerName || 'Customer'}
            </h3>
            <p className="text-[11px] font-semibold text-gray-400 mt-0.5 font-mono">
              #{order.id}
            </p>
          </div>

          <div className="flex flex-col items-end space-y-1.5 shrink-0">
            {/* Status badge */}
            <span
              className={`flex items-center space-x-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${badge.color}`}
            >
              <BadgeIcon className="w-3 h-3" />
              <span>{badge.label}</span>
            </span>

            {/* New badge for helper unviewed orders */}
            {isNew && (
              <span className="flex items-center space-x-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-blue-500 text-white animate-pulse shadow-sm">
                <Eye className="w-3 h-3" />
                <span>New</span>
              </span>
            )}
          </div>
        </div>

        {/* Created time + elapsed timer row */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-100">
            <Calendar className="w-3 h-3 text-gray-400" />
            <span>{formatPlacedDateTime(order.createdAt)}</span>
          </div>

          {(showDuration || isNew) && (
            <div className={`flex items-center space-x-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-xl ${
              isNew
                ? 'text-blue-700 bg-blue-50 border border-blue-100'
                : 'text-emerald-800 bg-emerald-50/80 border border-emerald-100'
            }`}>
              <Clock className={`w-3 h-3 ${isNew ? 'text-blue-500' : 'text-emerald-600 animate-spin-slow'}`} />
              <span>{isDone ? `Done in: ${elapsed}` : elapsed}</span>
            </div>
          )}

          {order.helperId && (
            <div className="flex items-center space-x-1 text-[11px] font-bold text-teal-800 bg-teal-50 px-2.5 py-1.5 rounded-xl border border-teal-100">
              <UserCheck className="w-3.5 h-3.5 text-teal-600" />
              <span>{order.helperName || 'Assigned'}</span>
            </div>
          )}
        </div>

        {/* Items brief summary */}
        <div className="flex items-start space-x-2 mb-3 bg-gray-50/80 border border-gray-100 rounded-2xl px-3 py-2.5">
          <ShoppingBag className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-[12px] font-semibold text-gray-700 truncate leading-relaxed">
            {itemsSummary}
          </p>
        </div>

        {/* Locations Flow */}
        <div className={`flex items-center text-xs text-gray-600 space-x-2 py-2.5 px-3 rounded-2xl ${accent.locationBg} border mb-2`}>
          <div className="flex items-center space-x-1 min-w-0 flex-1">
            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">{order.pickupLocation?.address || 'Local Helper Area'}</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <div className="flex items-center space-x-1 min-w-0 flex-1">
            <span className="truncate font-semibold text-gray-900">{order.deliveryLocation.address}</span>
          </div>
        </div>

        {/* Bottom row: fee / fee pending */}
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-gray-400 font-medium text-[11px]">
            {order.items?.length ? `${order.items.length} item${order.items.length !== 1 ? 's' : ''}` : ''}
          </span>
          <div className="flex items-center space-x-2">
            {order.feeAdjustment && order.feeAdjustment.status === 'PENDING' && (
              <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-200 font-bold flex items-center space-x-1">
                <AlertCircle className="w-3 h-3" />
                <span>Fee Adjustment</span>
              </span>
            )}
            <span className="font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl text-[12px]">
              {order.feeAdjustment?.status === 'APPROVED'
                ? `৳${order.feeAdjustment.amount} fee`
                : order.deliveryFee > 0
                ? `৳${order.deliveryFee} fee`
                : 'Fee Pending'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
