import React, { useState, useEffect } from 'react';
import { Order } from '@/types';
import { MapPin, Navigation, ArrowRight, DollarSign, AlertCircle, Clock } from 'lucide-react';
import { formatCreatedAt, getElapsedTime } from '@/lib/timeUtils';

interface HelperRequestCardProps {
  order: Order;
  onAccept: (orderId: string) => void;
  onRequestFeeAdjustment: (orderId: string, amount: number, reason: string) => void;
  activeOrdersCount: number;
}

export const HelperRequestCard: React.FC<HelperRequestCardProps> = ({
  order,
  onAccept,
  onRequestFeeAdjustment,
  activeOrdersCount,
}) => {
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [adjustedFee, setAdjustedFee] = useState(order.deliveryFee + 10);
  const [reason, setReason] = useState('Heavy items and pickup location distance.');

  const isCapReached = activeOrdersCount >= 5;
  const [elapsed, setElapsed] = useState(() => getElapsedTime(order.createdAt));

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(getElapsedTime(order.createdAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [order.createdAt]);

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRequestFeeAdjustment(order.id, adjustedFee, reason);
    setShowFeeModal(false);
  };

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
        <div className="flex items-center space-x-2 text-gray-600">
          <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="font-semibold text-gray-800">Pickup:</span>
          <span className="truncate">{order.pickupLocation?.address || 'Local Helper Market'}</span>
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
          onClick={() => setShowFeeModal(true)}
          className="py-3 px-3 rounded-2xl bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold text-xs border border-amber-200 transition-all shrink-0"
        >
          Adjust Fee
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
          {isCapReached ? 'Limit Reached (5 Max)' : 'Accept Request'}
        </button>
      </div>

      {/* Fee Adjustment Modal */}
      {showFeeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-gray-900">Request Fee Adjustment</h3>
            <p className="text-xs text-gray-600">
              Normal Delivery Fee is ৳{order.deliveryFee}. Please state your requested fee and reason for the customer.
            </p>

            <form onSubmit={handleAdjustSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Requested Delivery Fee (৳)</label>
                <input
                  type="number"
                  value={adjustedFee}
                  onChange={(e) => setAdjustedFee(Number(e.target.value))}
                  className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Reason for Customer</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="যেমন: পিকআপ লোকেশন অনেক দূরে এবং মালামাল বেশি ভারী..."
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs h-20 outline-none focus:border-emerald-500"
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
                  className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xs shadow-md"
                >
                  Submit & Accept
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
