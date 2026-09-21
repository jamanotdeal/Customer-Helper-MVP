'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Order, OrderFeedback } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { Check, X, ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react';
import { AsyncButton } from './ui/AsyncButton';

interface OrderFeedbackModalProps {
  order: Order;
  onClose: () => void;
  onSubmitted?: () => void;
}

export const OrderFeedbackModal: React.FC<OrderFeedbackModalProps> = ({
  order,
  onClose,
  onSubmitted,
}) => {
  const [thumbsUp, setThumbsUp] = useState<boolean | null>(null);
  const [improvementComment, setImprovementComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Safety guard: only allow feedback for completed (DELIVERED) orders
  if (!order || order.status !== 'DELIVERED' || typeof document === 'undefined') {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (thumbsUp === null) return; // must pick one
    try {
      setSubmitting(true);
      const feedbackData: OrderFeedback = {
        id: `fb-${order.id}-${Date.now()}`,
        orderId: order.id,
        customerId: order.customerId,
        customerName: order.customerName,
        helperId: order.helperId,
        helperName: order.helperName,
        riderRating: thumbsUp ? 5 : 1,
        serviceRating: thumbsUp ? 5 : 1,
        shopRating: thumbsUp ? 5 : 1,
        thumbsUp,
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

  const isNegative = thumbsUp === false;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ animation: 'fadeInOverlay 0.2s ease' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes fadeInOverlay { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUpCard { from { opacity: 0; transform: translateY(24px) scale(0.96) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes thumbPop { 0% { transform: scale(1) } 30% { transform: scale(1.35) rotate(-8deg) } 60% { transform: scale(0.95) rotate(4deg) } 100% { transform: scale(1) rotate(0deg) } }
        @keyframes textareaSlide { from { opacity: 0; max-height: 0; transform: translateY(-8px) } to { opacity: 1; max-height: 200px; transform: translateY(0) } }
        .thumb-pop { animation: thumbPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .textarea-slide { animation: textareaSlide 0.3s ease forwards; }
        .card-slide { animation: slideUpCard 0.25s cubic-bezier(0.34, 1.2, 0.64, 1) forwards; }
        .thumbs-btn {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 20px 16px;
          border-radius: 20px;
          border: 2.5px solid transparent;
          transition: all 0.2s cubic-bezier(0.34, 1.2, 0.64, 1);
          cursor: pointer;
          font-weight: 800;
          font-size: 13px;
          outline: none;
        }
        .thumbs-btn:active { transform: scale(0.94); }
        .thumbs-up-btn {
          background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
          border-color: #86efac;
          color: #15803d;
        }
        .thumbs-up-btn:hover:not(.selected-up) {
          background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
          border-color: #4ade80;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(34, 197, 94, 0.2);
        }
        .thumbs-up-btn.selected-up {
          background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
          border-color: #16a34a;
          color: #fff;
          box-shadow: 0 8px 32px rgba(22, 163, 74, 0.45);
          transform: translateY(-2px) scale(1.03);
        }
        .thumbs-down-btn {
          background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%);
          border-color: #fca5a5;
          color: #b91c1c;
        }
        .thumbs-down-btn:hover:not(.selected-down) {
          background: linear-gradient(135deg, #ffe4e6 0%, #fecdd3 100%);
          border-color: #f87171;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(239, 68, 68, 0.2);
        }
        .thumbs-down-btn.selected-down {
          background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
          border-color: #dc2626;
          color: #fff;
          box-shadow: 0 8px 32px rgba(220, 38, 38, 0.45);
          transform: translateY(-2px) scale(1.03);
        }
        .thumbs-icon {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .thumbs-up-icon { background: rgba(255,255,255,0.35); }
        .selected-up .thumbs-up-icon { background: rgba(255,255,255,0.25); }
        .thumbs-down-icon { background: rgba(255,255,255,0.35); }
        .selected-down .thumbs-down-icon { background: rgba(255,255,255,0.25); }
      `}</style>

      <div
        className="card-slide w-full max-w-sm bg-white rounded-3xl shadow-2xl p-5 relative max-h-[90vh] overflow-y-auto border border-gray-100"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-5 pr-6">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0 shadow-md">
            <span className="text-2xl">💬</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-extrabold text-gray-900 leading-tight">
              আপনার মতামত জানান
            </h3>
          </div>
        </div>

        {/* Question */}
        <div className="text-center mb-4">
          <p className="text-sm font-extrabold text-gray-800">
            এই অর্ডারটি কেমন ছিল?
          </p>
          <p className="text-[11px] text-emerald-600 italic mt-1">
            "{order.service || order.title || 'N/A'}"
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Thumbs Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {/* Thumbs Up */}
            <button
              type="button"
              className={`thumbs-btn thumbs-up-btn${thumbsUp === true ? ' selected-up' : ''}`}
              onClick={() => setThumbsUp(true)}
            >
              <div className={`thumbs-icon thumbs-up-icon${thumbsUp === true ? ' thumb-pop' : ''}`}>
                <ThumbsUp className="w-7 h-7" strokeWidth={thumbsUp === true ? 2.5 : 2} />
              </div>
              <div>
                <div className="text-lg">😄</div>
                <div className="text-xs mt-0.5">ভালো ছিল!</div>
              </div>
            </button>

            {/* Thumbs Down */}
            <button
              type="button"
              className={`thumbs-btn thumbs-down-btn${thumbsUp === false ? ' selected-down' : ''}`}
              onClick={() => setThumbsUp(false)}
            >
              <div className={`thumbs-icon thumbs-down-icon${thumbsUp === false ? ' thumb-pop' : ''}`}>
                <ThumbsDown className="w-7 h-7" strokeWidth={thumbsUp === false ? 2.5 : 2} />
              </div>
              <div>
                <div className="text-lg">😞</div>
                <div className="text-xs mt-0.5">ভালো না</div>
              </div>
            </button>
          </div>

          {/* Negative feedback textarea — slides in only when thumbs-down selected */}
          {isNegative && (
            <div className="textarea-slide overflow-hidden">
              <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 space-y-2.5">
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] font-bold text-red-800 leading-relaxed">
                    আপনার Feedback-ই একমাত্র মাধ্যম, যার মাধ্যমে আমরা বুঝতে পারি আমাদের Service কোথায় Improve করা উচিত।
                  </p>
                </div>
                <textarea
                  value={improvementComment}
                  onChange={(e) => setImprovementComment(e.target.value)}
                  placeholder="কোথায় সমস্যা হয়েছে? আমাদের জানান..."
                  rows={3}
                  autoFocus
                  className="w-full p-3 rounded-xl border border-red-200 focus:border-red-400 bg-white outline-none text-xs font-medium text-gray-900 placeholder:text-gray-400 resize-none transition-colors"
                />
              </div>
            </div>
          )}

          {/* Optional positive comment area */}
          {thumbsUp === true && (
            <div className="textarea-slide overflow-hidden">
              <textarea
                value={improvementComment}
                onChange={(e) => setImprovementComment(e.target.value)}
                placeholder="কোনো বিশেষ মন্তব্য থাকলে লিখুন... (ঐচ্ছিক)"
                rows={2}
                className="w-full p-3 rounded-xl border border-emerald-200 focus:border-emerald-400 bg-emerald-50/50 outline-none text-xs font-medium text-gray-900 placeholder:text-gray-400 resize-none transition-colors"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-600 border border-gray-200 font-bold text-xs transition-all"
            >
              পরে
            </button>
            <AsyncButton
              type="submit"
              disabled={thumbsUp === null}
              isLoading={submitting}
              icon={<Check className="w-4 h-4" />}
              className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
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
