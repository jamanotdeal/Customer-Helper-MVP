'use client';

import React, { useState } from 'react';
import { Order, OrderFeedback } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { Star, MessageSquare, Check, X, Sparkles } from 'lucide-react';

interface OrderFeedbackModalProps {
  order: Order;
  onClose: () => void;
  onSubmitted?: () => void;
}

// Rating options from 1 (Khub Kharap) to 5 (Khub Valo)
const RATING_OPTIONS = [
  { value: 1, label: 'খুব খারাপ', emoji: '😡', color: 'border-red-300 bg-red-50 text-red-700' },
  { value: 2, label: 'খারাপ', emoji: '😟', color: 'border-orange-300 bg-orange-50 text-orange-700' },
  { value: 3, label: 'মাঝারি', emoji: '😐', color: 'border-amber-300 bg-amber-50 text-amber-700' },
  { value: 4, label: 'ভালো', emoji: '🙂', color: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 5, label: 'খুব ভালো', emoji: '😍', color: 'border-emerald-400 bg-emerald-100 text-emerald-800' },
];

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
  if (!order || order.status !== 'DELIVERED') {
    return null;
  }

  // If any feedback given in medium (3) or low (1, 2), show improvement feedback text box
  const needsComment = riderRating <= 3 || serviceRating <= 3;

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

  const renderRangeRating = (
    value: number,
    onChange: (val: number) => void,
    title: string,
    subtitle: string
  ) => {
    const selectedOption = RATING_OPTIONS.find((opt) => opt.value === value) || RATING_OPTIONS[4];

    return (
      <div className="space-y-2 bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200/80">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-black text-gray-900 block">{title}</label>
            <p className="text-[10px] text-gray-500 font-medium">{subtitle}</p>
          </div>
          <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${selectedOption.color} flex items-center space-x-1 shrink-0`}>
            <span>{selectedOption.emoji}</span>
            <span>{selectedOption.label}</span>
          </span>
        </div>

        {/* Range Label Track Header */}
        <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 px-1 pt-1">
          <span className="text-red-600">খুব খারাপ</span>
          <span className="text-emerald-600">খুব ভালো</span>
        </div>

        {/* Range Buttons Grid */}
        <div className="grid grid-cols-5 gap-1.5 pt-0.5">
          {RATING_OPTIONS.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all active:scale-95 ${
                  isSelected
                    ? 'bg-amber-400/20 border-amber-500 ring-2 ring-amber-400/30 text-gray-900 shadow-xs font-black'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-100/60'
                }`}
              >
                <span className="text-xl leading-none">{option.emoji}</span>
                <div className="flex items-center space-x-0.5">
                  <Star
                    className={`w-3 h-3 ${
                      isSelected
                        ? 'text-amber-500 fill-amber-400'
                        : 'text-gray-300'
                    }`}
                  />
                  <span className="text-[10px] font-bold">{option.value}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-1 mb-5">
          <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 mx-auto flex items-center justify-center text-2xl shadow-inner">
            <Sparkles className="w-7 h-7 text-amber-500" />
          </div>
          <h3 className="text-lg font-extrabold text-gray-900">
            অর্ডার ডেলিভারি সম্পর্কে মতামত দিন
          </h3>
          <p className="text-xs text-gray-500 font-medium">
            অর্ডার #{order.id} • আপনার মতামত আমাদের সার্ভিস মান উন্নত করতে সাহায্য করবে।
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Helper Feedback */}
          {renderRangeRating(
            riderRating,
            setRiderRating,
            '১. হেল্পার (Helper)',
            'হেল্পারের ব্যবহার ও কাজ কেমন ছিল?'
          )}

          {/* 2. Overall Feedback */}
          {renderRangeRating(
            serviceRating,
            setServiceRating,
            '২. সার্বিক (Overall)',
            'সার্বিক সার্ভিস অভিজ্ঞতা কেমন ছিল?'
          )}

          {/* Conditional Improvement Comment Textarea for Low/Medium Ratings */}
          {needsComment && (
            <div className="space-y-1.5 pt-2 animate-in fade-in duration-200">
              <label className="text-xs font-bold text-amber-800 flex items-center space-x-1">
                <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                <span>মতামত বা পরামর্শ:</span>
              </label>
              <textarea
                value={improvementComment}
                onChange={(e) => setImprovementComment(e.target.value)}
                placeholder="আমরা কী করলে আপনার জন্য ভালো হবে?"
                rows={3}
                className="w-full p-3.5 rounded-2xl border border-amber-300 focus:border-amber-500 bg-amber-50/50 outline-none text-xs font-medium text-gray-900 placeholder:text-amber-700/60"
              />
            </div>
          )}

          <div className="flex space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
            >
              পরে দিব
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>মতামত জমা দিন</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

