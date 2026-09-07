'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Order, OrderFeedback } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { Star, Check, X, Sparkles } from 'lucide-react';
import { AsyncButton } from './ui/AsyncButton';

interface OrderFeedbackModalProps {
  order: Order;
  onClose: () => void;
  onSubmitted?: () => void;
}

// Rating labels mapping for ratings 1-5
const RATING_LABELS: Record<number, { label: string; emoji: string; textClass: string }> = {
  1: { label: 'খুব খারাপ', emoji: '😡', textClass: 'text-red-600 bg-red-50 border-red-200' },
  2: { label: 'খারাপ', emoji: '😟', textClass: 'text-orange-600 bg-orange-50 border-orange-200' },
  3: { label: 'মাঝারি', emoji: '😐', textClass: 'text-amber-600 bg-amber-50 border-amber-200' },
  4: { label: 'ভালো', emoji: '🙂', textClass: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  5: { label: 'খুব ভালো', emoji: '😍', textClass: 'text-emerald-700 bg-emerald-100/80 border-emerald-300' },
};

export const OrderFeedbackModal: React.FC<OrderFeedbackModalProps> = ({
  order,
  onClose,
  onSubmitted,
}) => {
  const [riderRating, setRiderRating] = useState<number>(5);
  const [serviceRating, setServiceRating] = useState<number>(5);
  const [improvementComment, setImprovementComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Safety guard: only allow feedback for completed (DELIVERED) orders
  if (!order || order.status !== 'DELIVERED' || typeof document === 'undefined') {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const feedbackData: OrderFeedback = {
        id: `fb-${order.id}-${Date.now()}`,
        orderId: order.id,
        customerId: order.customerId,
        customerName: order.customerName,
        helperId: order.helperId,
        helperName: order.helperName,
        riderRating,
        serviceRating,
        shopRating: serviceRating, // Defaults to overall service rating for schema compatibility
        improvementComment: improvementComment.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      await fallbackStore.submitOrderFeedback(feedbackData);
      if (onSubmitted) onSubmitted();
      onClose();
    } catch (err) {
      console.error('Failed to submit order feedback:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStarRatingRow = (
    value: number,
    onChange: (val: number) => void,
    title: string
  ) => {
    const activeInfo = RATING_LABELS[value] || RATING_LABELS[5];

    return (
      <div className="space-y-2 bg-gray-50/70 p-3.5 rounded-2xl border border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-800">{title}</span>
          <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border flex items-center space-x-1 shrink-0 ${activeInfo.textClass}`}>
            <span>{activeInfo.emoji}</span>
            <span>{activeInfo.label}</span>
          </span>
        </div>

        {/* Minimalist 5-Star Row */}
        <div className="flex items-center justify-between pt-1 px-1">
          {[1, 2, 3, 4, 5].map((starVal) => {
            const isFilled = starVal <= value;
            return (
              <button
                key={starVal}
                type="button"
                onClick={() => onChange(starVal)}
                className="p-1.5 rounded-xl hover:bg-amber-100/50 active:scale-90 transition-all cursor-pointer focus:outline-none"
                aria-label={`Rate ${starVal} star`}
              >
                <Star
                  className={`w-7 h-7 transition-all ${
                    isFilled
                      ? 'text-amber-400 fill-amber-400 drop-shadow-xs scale-105'
                      : 'text-gray-200 fill-gray-100'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-5 relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 border border-gray-100">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Minimal Header */}
        <div className="flex items-center space-x-3 mb-4 pr-6">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-5 h-5 text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-extrabold text-gray-900 leading-tight">
              অর্ডার মতামত
            </h3>
            <div className="text-[11px] font-bold text-amber-800 truncate" title={order.service || order.title || 'N/A'}>
              সার্ভিস: {order.service || order.title || 'N/A'}
            </div>
            <div className="text-[10px] font-semibold text-gray-500 truncate" title={order.items?.map(it => it.name).join(', ')}>
              বিবরণ: {order.items?.map(it => it.name).join(', ') || 'N/A'}
            </div>
            <span className="text-[10px] font-semibold text-gray-400 block mt-0.5">
              Order #{order.id}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Helper Rating */}
          {renderStarRatingRow(
            riderRating,
            setRiderRating,
            '১. হেল্পার সার্ভিস'
          )}

          {/* Overall Rating */}
          {renderStarRatingRow(
            serviceRating,
            setServiceRating,
            '২. সার্বিক অভিজ্ঞতা'
          )}

          {/* Optional Comment Input */}
          <div className="pt-1">
            <label className="text-[11px] font-bold text-gray-500 block mb-1">
              পরামর্শ বা মতামত (ঐচ্ছিক)
            </label>
            <textarea
              value={improvementComment}
              onChange={(e) => setImprovementComment(e.target.value)}
              placeholder="সার্ভিস আরও উন্নত করতে আপনার কোনো পরামর্শ থাকলে লিখুন..."
              rows={2}
              className="w-full p-3 rounded-2xl border border-gray-200 focus:border-amber-400 bg-gray-50/50 outline-none text-xs font-medium text-gray-900 placeholder:text-gray-400 resize-none transition-colors"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-600 font-bold text-xs transition-all"
            >
              পরে
            </button>
            <AsyncButton
              type="submit"
              isLoading={submitting}
              icon={<Check className="w-4 h-4" />}
              className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              <span>জমা দিন</span>
            </AsyncButton>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};


