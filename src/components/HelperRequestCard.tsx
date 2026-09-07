import React, { useState, useEffect } from 'react';
import { Order } from '@/types';
import { Clock, Sparkles, MapPin, Edit2 } from 'lucide-react';
import { getDeliveryDurationText, getElapsedTime, getHelperUrgencyBgClass } from '@/lib/timeUtils';
import { getOrderMinDistanceKm } from '@/lib/pricing';
import { fallbackStore } from '@/lib/firebase';

interface HelperRequestCardProps {
  order: Order;
  onAccept: (orderId: string) => void;
  onViewDetails: (orderId: string) => void;
  activeOrdersCount: number;
  activeOrderLimit: number;
  isNew?: boolean;
  isFirstOrder?: boolean;
  helperLocation?: { lat?: number; lng?: number };
}

export const HelperRequestCard: React.FC<HelperRequestCardProps> = ({
  order,
  onAccept,
  onViewDetails,
  activeOrdersCount,
  activeOrderLimit,
  isNew = false,
  isFirstOrder = false,
  helperLocation,
}) => {
  const isCapReached = activeOrdersCount >= activeOrderLimit;
  const isDone = order.status === 'DELIVERED' || order.status === 'CANCELED';
  const [elapsed, setElapsed] = useState(() => isDone ? getDeliveryDurationText(order) : getElapsedTime(order));
  const urgency = getHelperUrgencyBgClass(order.createdAt, isDone);

  useEffect(() => {
    if (isDone) {
      setElapsed(getDeliveryDurationText(order));
      return;
    }
    setElapsed(getElapsedTime(order));
    const timer = setInterval(() => {
      setElapsed(getElapsedTime(order));
    }, 1000);
    return () => clearInterval(timer);
  }, [order, isDone]);

  const itemsSummary = order.items?.length
    ? order.items.map((i) => `${i.name}${i.qty && Number(i.qty) > 1 ? ` ×${i.qty}` : ''}`).join(', ')
    : 'No items listed';

  const distanceKm = getOrderMinDistanceKm(helperLocation, order);

  const getContainerBg = () => {
    if (urgency.urgencyLevel === 'red') {
      return 'bg-gradient-to-br from-red-100/95 via-rose-50 to-red-100/95 border-2 border-red-400 shadow-md shadow-red-100/70 ring-2 ring-red-300';
    }
    if (urgency.urgencyLevel === 'yellow') {
      return 'bg-gradient-to-br from-amber-100/95 via-yellow-50 to-amber-100/95 border-2 border-amber-400 shadow-sm shadow-amber-100/70 ring-2 ring-amber-300';
    }
    if (isNew) {
      return 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300 shadow-md shadow-emerald-100 ring-2 ring-emerald-200';
    }
    if (order.updatedByCustomer) {
      return 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300 shadow-md shadow-amber-100 ring-2 ring-amber-200';
    }
    return 'bg-white border-gray-100 shadow-soft';
  };

  return (
    <div className={`rounded-3xl border p-4 space-y-3 transition-all duration-300 ${getContainerBg()}`}>
      {/* Top metadata row: Order ID badge (top-left) & Badges/Timer (top-right) */}
      <div className="flex items-center justify-between gap-2">
        <span className="bg-slate-900 text-white font-black font-mono text-[10px] px-2 py-0.5 rounded-md shrink-0 shadow-xs">
          #{order.id}
        </span>
        <div className="flex items-center space-x-1.5 shrink-0 flex-wrap gap-y-1 justify-end">
          {distanceKm !== null && (
            <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0">
              <MapPin className="w-2.5 h-2.5 text-indigo-600" />
              <span>{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away</span>
            </span>
          )}
          {isNew && (
            <span className="inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold animate-pulse shadow-sm shrink-0">
              <Sparkles className="w-2.5 h-2.5" />
              <span>NEW</span>
            </span>
          )}
          {order.updatedByCustomer && (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold animate-bounce shadow-sm shrink-0">
              <Edit2 className="w-2.5 h-2.5" />
              <span>Updated</span>
            </span>
          )}
          {isFirstOrder && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[9px] font-black uppercase tracking-wide shadow-sm shrink-0">
              🥇 1st Order
            </span>
          )}
          {fallbackStore.pricingSettings.allowedHelperTypes !== 'dedicated_only' && (
            <span className="text-xs font-black text-red-800 bg-red-50 px-2.5 py-1 rounded-lg inline-flex items-center space-x-1 shrink-0 border border-red-100">
              <Clock className="w-4 h-4 text-red-600 animate-spin-slow" />
              <span className="font-mono">{elapsed}</span>
            </span>
          )}
        </div>
      </div>

      {/* Service Needed Title - FULL WIDTH */}
      <h4 className="font-extrabold text-gray-900 text-sm leading-snug line-clamp-2">
        {order.service || order.title || 'Service Needed'}
      </h4>

      {/* Action Buttons */}
      <div className="pt-1 flex space-x-2">
        <button
          onClick={() => onViewDetails(order.id)}
          className="flex-1 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-extrabold text-xs transition-all flex items-center justify-center"
        >
          View Details
        </button>
        <button
          onClick={() => onAccept(order.id)}
          disabled={isCapReached}
          className={`flex-1 py-2.5 rounded-2xl font-extrabold text-xs shadow-md transition-all ${isCapReached
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-98'
            }`}
        >
          {isCapReached ? `Limit (${activeOrderLimit})` : 'Accept Request'}
        </button>
      </div>
    </div>
  );
};
