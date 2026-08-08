import React, { useState, useEffect } from 'react';
import { Order, OrderStatus } from '@/types';
import { MapPin, ArrowRight, Clock, Calendar, CheckCircle2, XCircle, Truck, PackageCheck, AlertCircle, UserCheck } from 'lucide-react';
import { formatCreatedAt, formatPlacedDateTime, getElapsedTime, getDeliveryDurationText } from '@/lib/timeUtils';

interface OrderCardProps {
  order: Order;
  onClick: () => void;
  showDuration?: boolean;
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

export const OrderCard: React.FC<OrderCardProps> = ({ order, onClick, showDuration = false }) => {
  const badge = getStatusBadgeInfo(order.status);
  const BadgeIcon = badge.icon;
  const isDone = order.status === 'DELIVERED' || order.status === 'CANCELED';
  const endTimestamp = order.deliveredAt || order.cancelledAt || order.updatedAt;

  const [elapsed, setElapsed] = useState(() =>
    isDone
      ? getDeliveryDurationText(order.createdAt, endTimestamp)
      : getElapsedTime(order.createdAt)
  );

  useEffect(() => {
    if (!showDuration || isDone) return;
    const timer = setInterval(() => {
      setElapsed(getElapsedTime(order.createdAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [order.createdAt, isDone, showDuration]);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-3xl border border-gray-100 shadow-soft hover:shadow-md p-4 transition-all duration-200 cursor-pointer active:scale-98"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-1 pr-2">
          {order.title}
        </h3>
        <span
          className={`flex items-center space-x-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${badge.color} shrink-0`}
        >
          <BadgeIcon className="w-3 h-3" />
          <span>{badge.label}</span>
        </span>
      </div>

      {/* Date & Time / Duration & Helper Badges */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="flex items-center space-x-2 text-[11px] font-semibold text-emerald-800 bg-emerald-50/80 px-2.5 py-1 rounded-xl w-fit">
          {showDuration ? (
            <>
              <Clock className="w-3 h-3 text-emerald-600 animate-spin-slow" />
              <span>{isDone ? `Delivered in: ${elapsed}` : `Duration: ${elapsed}`}</span>
            </>
          ) : (
            <>
              <Calendar className="w-3 h-3 text-emerald-600" />
              <span>Created At: {formatPlacedDateTime(order.createdAt)}</span>
            </>
          )}
        </div>

        {order.helperId && (
          <div className="flex items-center space-x-1 text-[11px] font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-xl border border-teal-100/80">
            <UserCheck className="w-3.5 h-3.5 text-teal-600" />
            <span>Helper: {order.helperName || 'Assigned'}</span>
          </div>
        )}
      </div>

      {/* Locations Flow */}
      <div className="flex items-center text-xs text-gray-600 space-x-2 my-2 py-2 px-3 rounded-2xl bg-gray-50/70 border border-gray-100">
        <div className="flex items-center space-x-1 min-w-0 flex-1">
          <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="truncate">{order.pickupLocation?.address || 'Local Helper Area'}</span>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <div className="flex items-center space-x-1 min-w-0 flex-1">
          <span className="truncate font-semibold text-gray-900">{order.deliveryLocation.address}</span>
        </div>
      </div>

      {/* Pricing & Time formatting */}
      <div className="flex items-center justify-between text-xs pt-1">
        <span className="text-gray-500 font-medium text-[11px]">
          {showDuration ? formatCreatedAt(order.createdAt) : ''}
        </span>
        <div className="flex items-center space-x-2">
          {order.feeAdjustment && order.feeAdjustment.status === 'PENDING' && (
            <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-200 font-bold flex items-center space-x-1">
              <AlertCircle className="w-3 h-3" />
              <span>Fee Adjustment</span>
            </span>
          )}
          <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl">
            {order.feeAdjustment?.status === 'APPROVED'
              ? `৳${order.feeAdjustment.amount} fee`
              : order.deliveryFee > 0
              ? `৳${order.deliveryFee} fee`
              : 'Fee Pending'}
          </span>
        </div>
      </div>
    </div>
  );
};
