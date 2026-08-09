import React, { useState, useEffect } from 'react';
import { Order } from '@/types';
import { Clock, Sparkles } from 'lucide-react';
import { getElapsedTime } from '@/lib/timeUtils';

interface HelperRequestCardProps {
  order: Order;
  onAccept: (orderId: string) => void;
  onViewDetails: (orderId: string) => void;
  activeOrdersCount: number;
  activeOrderLimit: number;
  isNew?: boolean;
}

export const HelperRequestCard: React.FC<HelperRequestCardProps> = ({
  order,
  onAccept,
  onViewDetails,
  activeOrdersCount,
  activeOrderLimit,
  isNew = false,
}) => {
  const isCapReached = activeOrdersCount >= activeOrderLimit;
  const [elapsed, setElapsed] = useState(() => getElapsedTime(order.createdAt));

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(getElapsedTime(order.createdAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [order.createdAt]);

  const itemsSummary = order.items?.length
    ? order.items.map((i) => `${i.name}${i.qty && Number(i.qty) > 1 ? ` ×${i.qty}` : ''}`).join(', ')
    : 'No items listed';

  return (
    <div className={`rounded-3xl border p-4 space-y-3 transition-all duration-300 ${
      isNew
        ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300 shadow-md shadow-emerald-100 ring-2 ring-emerald-200'
        : 'bg-white border-gray-100 shadow-soft'
    }`}>
      {/* Service Needed & Timer Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <h4 className="font-bold text-gray-900 text-sm leading-snug truncate">
            {order.service || order.title || 'Service Needed'}
          </h4>
          {isNew && (
            <span className="inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold animate-pulse shadow-sm shrink-0">
              <Sparkles className="w-2.5 h-2.5" />
              <span>NEW</span>
            </span>
          )}
        </div>
        <span className="text-xs font-black text-red-800 bg-red-50 px-2.5 py-1 rounded-lg inline-flex items-center space-x-1 shrink-0 border border-red-100">
          <Clock className="w-4 h-4 text-red-600 animate-spin-slow" />
          <span className="font-mono">{elapsed}</span>
        </span>
      </div>

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
          className={`flex-1 py-2.5 rounded-2xl font-extrabold text-xs shadow-md transition-all ${
            isCapReached
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
