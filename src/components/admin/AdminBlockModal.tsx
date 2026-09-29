'use client';

import React, { useState } from 'react';
import { Ban, Lock, X, AlertTriangle } from 'lucide-react';

interface AdminBlockModalProps {
  targetName: string;
  targetType: 'Customer' | 'Helper' | 'Store' | 'User';
  onConfirm: (note: string) => Promise<void> | void;
  onClose: () => void;
}

export const AdminBlockModal: React.FC<AdminBlockModalProps> = ({
  targetName,
  targetType,
  onConfirm,
  onClose,
}) => {
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      setError('ব্লক করার কারণ ও অ্যাডমিন নোট লেখা বাধ্যতামূলক');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await onConfirm(note.trim());
      onClose();
    } catch (err: any) {
      setError(err?.message || 'ব্লক সম্পন্ন করতে সমস্যা হয়েছে');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1001] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200 border border-red-200 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-700 via-rose-800 to-purple-900 text-white p-5 relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all shadow-xs"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Ban className="w-5 h-5 text-rose-200" />
            </div>
            <div>
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-rose-100 text-[10px] font-extrabold uppercase">
                {targetType} Restriction
              </span>
              <h3 className="font-extrabold text-base md:text-lg text-white mt-0.5">
                ব্লক নিশ্চিতকরণ ও অ্যাডমিন নোট
              </h3>
            </div>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-950">
                আপনি <span className="font-black underline text-red-700">{targetName}</span>-কে ব্লক করতে চলেছেন।
              </p>
              <p className="text-[11px] text-amber-800">
                ব্লক করা হলে ব্যবহারকারী নতুন কোনো রিকোয়েস্ট তৈরি বা অর্ডার গ্রহণ করতে পারবেন না।
              </p>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-purple-50 border border-purple-100 text-purple-900 flex items-start space-x-2">
            <Lock className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
            <p className="text-[11px] text-purple-800 font-medium leading-relaxed">
              🔒 <strong>অভ্যন্তরীণ অ্যাডমিন নোট:</strong> নিচে লেখা নোটটি শুধুমাত্র অ্যাডমিন প্যানেলে সংরক্ষিত থাকবে। ব্যবহারকারীর কাছে অ্যাডমিন সেটিংসের সাধারণ নোটিশ প্রদর্শিত হবে।
            </p>
          </div>

          <div>
            <label className="text-xs font-extrabold text-gray-800 block mb-1.5">
              ব্লকের কারণ ও নোট (Admin Note - Required) <span className="text-red-500">*</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (error) setError('');
              }}
              rows={3}
              placeholder="যেমন: বারবার মিথ্যা অর্ডার তৈরি করা / ফেক কল দেওয়া / কাস্টমারের সাথে অসদাচরণ..."
              className="w-full p-3 rounded-2xl border border-gray-300 text-xs font-medium text-gray-900 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/10 bg-white placeholder-gray-400"
              required
            />
            {error && <p className="text-[11px] font-bold text-red-600 mt-1">{error}</p>}
          </div>

          {/* Buttons */}
          <div className="flex items-center space-x-2 pt-2 border-t border-gray-100">
            <button
              type="submit"
              disabled={isSubmitting || !note.trim()}
              className="flex-1 py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-98"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'প্রক্রিয়াধীন...' : 'হ্যাঁ, ব্লক করুন (Confirm Block)'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-3 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all cursor-pointer"
            >
              বাতিল (Cancel)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
