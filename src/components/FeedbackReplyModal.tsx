'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { OrderFeedback } from '@/types';
import { MessageSquare, X, CheckCircle2 } from 'lucide-react';

interface FeedbackReplyModalProps {
  feedback: OrderFeedback;
  onClose: () => void;
}

export const FeedbackReplyModal: React.FC<FeedbackReplyModalProps> = ({ feedback, onClose }) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99998] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ animation: 'frm-fadeIn 0.25s ease' }}
    >
      <style>{`
        @keyframes frm-fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes frm-slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        .frm-card { animation: frm-slideUp 0.3s cubic-bezier(0.34, 1.2, 0.64, 1) forwards; }
        @keyframes frm-pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); }
          70% { box-shadow: 0 0 0 12px rgba(79, 70, 229, 0); }
          100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
        }
        .frm-icon { animation: frm-pulse-ring 2s ease infinite; }
      `}</style>

      <div className="frm-card w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-indigo-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 pt-5 pb-5 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="frm-icon w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-white font-extrabold text-base leading-tight">Jamanot Replied</h3>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 pt-4 pb-5 space-y-3">
          {/* Customer's original comment */}
          {feedback.improvementComment && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p className="text-[11px] font-bold text-amber-700 mb-1">You said:</p>
              <p className="text-sm text-amber-900 font-medium">"{feedback.improvementComment}"</p>
            </div>
          )}

          {/* Admin reply */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Jamanot Respond</span>
            </div>
            <p className="text-sm font-semibold text-gray-800 leading-relaxed">
              {feedback.adminReply}
            </p>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 active:scale-95 text-white font-extrabold text-sm shadow-lg shadow-indigo-500/25 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
