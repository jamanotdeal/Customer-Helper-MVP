import React, { useState, useEffect } from 'react';
import { Order } from '@/types';
import { MapPin, Navigation, ArrowRight, AlertCircle, Clock, XCircle } from 'lucide-react';
import { formatCreatedAt, getElapsedTime } from '@/lib/timeUtils';

interface HelperRequestCardProps {
  order: Order;
  onAccept: (orderId: string) => void;
  onReject: (orderId: string) => void;
  activeOrdersCount: number;
  activeOrderLimit: number;
}

export const HelperRequestCard: React.FC<HelperRequestCardProps> = ({
  order,
  onAccept,
  onReject,
  activeOrdersCount,
  activeOrderLimit,
}) => {
  const isCapReached = activeOrdersCount >= activeOrderLimit;
  const [elapsed, setElapsed] = useState(() => getElapsedTime(order.createdAt));

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(getElapsedTime(order.createdAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [order.createdAt]);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-soft p-4 space-y-3">
      {/* Title & Fee Header */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-bold text-gray-900 text-sm leading-snug">{order.title}</h4>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md inline-flex items-center space-x-1">
              <Clock className="w-3 h-3 text-emerald-600 animate-spin-slow" />
              <span>{elapsed}</span>
            </span>
            <span className="text-[10px] text-gray-400 font-medium">
              {formatCreatedAt(order.createdAt)}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="font-extrabold text-base text-emerald-700 block">৳{order.deliveryFee}</span>
          <span className="text-[10px] text-gray-400">Delivery Fee</span>
        </div>
      </div>

      {/* Pickup & Delivery details */}
      <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 text-xs space-y-1.5">
        <div className="flex items-start space-x-2 text-gray-600">
          <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span className="font-semibold text-gray-800 shrink-0">Pickup:</span>
          <span className={`truncate ${order.pickupLocation?.address ? 'text-gray-800 font-medium' : 'text-gray-400 italic'}`}>
            {order.pickupLocation?.address || 'N/A'}
          </span>
        </div>
        <div className="flex items-center space-x-2 text-gray-800">
          <Navigation className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="font-semibold">Delivery:</span>
          <span className="truncate font-bold">{order.deliveryLocation.address}</span>
        </div>
      </div>

      {/* Requested Items preview */}
      <div className="text-xs text-gray-600">
        <span className="font-bold text-gray-700">Items: </span>
        <span>{order.items.map((i) => `${i.name} (${i.qty})`).join(', ')}</span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2 pt-1">
        <button
          onClick={() => onReject(order.id)}
          className="py-3 px-3 rounded-2xl bg-red-50 text-red-700 hover:bg-red-100 font-bold text-xs border border-red-200 transition-all shrink-0 flex items-center space-x-1"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Reject</span>
        </button>

        <button
          onClick={() => onAccept(order.id)}
          disabled={isCapReached}
          className={`flex-1 py-3 rounded-2xl font-extrabold text-xs shadow-md transition-all ${
            isCapReached
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-98'
          }`}
        >
          {isCapReached ? `Limit Reached (${activeOrderLimit} Max)` : 'Accept Request'}
        </button>
      </div>
    </div>
  );
};
