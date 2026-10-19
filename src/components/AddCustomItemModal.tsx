'use client';

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { OrderItem } from '@/types';
import { X, Plus, Sparkles, MapPin, AlertCircle, Check } from 'lucide-react';

export function parseCustomItemNames(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[\n\r,၊，]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface AddCustomItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem?: (item: OrderItem) => void;
  onAddItems?: (items: OrderItem[]) => void;
  defaultBuyFrom?: string;
  defaultDescription?: string;
  defaultQuantity?: string;
  defaultPrice?: string;
  isEditing?: boolean;
  /** If true, shows the price / estimated cost input. Only helpers should pass true. */
  allowCostInput?: boolean;
}

export const AddCustomItemModal: React.FC<AddCustomItemModalProps> = ({
  isOpen,
  onClose,
  onAddItem,
  onAddItems,
  defaultBuyFrom,
  defaultDescription,
  defaultQuantity,
  defaultPrice,
  isEditing = false,
  allowCostInput = false,
}) => {
  const [description, setDescription] = useState(defaultDescription || '');
  const [buyFrom, setBuyFrom] = useState(defaultBuyFrom || '');
  const [quantity, setQuantity] = useState(defaultQuantity || '১টি');
  const [price, setPrice] = useState(defaultPrice || '');
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setBuyFrom(defaultBuyFrom || '');
      setDescription(defaultDescription || '');
      setQuantity(defaultQuantity || '১টি');
      setPrice(defaultPrice || '');
      setError('');
    }
  }, [defaultBuyFrom, defaultDescription, defaultQuantity, defaultPrice, isOpen]);

  // Real-time parsed items preview
  const parsedItems = useMemo(() => {
    return parseCustomItemNames(description);
  }, [description]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedItems.length === 0) {
      setError('অনুগ্রহ করে পণ্য বা সেবার বিবরণ লিখুন।');
      return;
    }
    if (!buyFrom.trim()) {
      setError('কোথা থেকে সংগ্রহ বা কাজ করতে হবে উল্লেখ করুন (যেমন: নির্দিষ্ট দোকান, অফিস, ফার্মেসি বা এলাকা)।');
      return;
    }

    const parsedQty = parseInt(quantity, 10);
    const numQty = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1;
    const parsedPrice = allowCostInput && price.trim() ? parseFloat(price) : undefined;

    const createdItems: OrderItem[] = parsedItems.map((name, idx) => ({
      id: `custom-item-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
      name,
      qty: quantity.trim() || '১টি',
      quantity: numQty,
      isCustom: true,
      buyFrom: buyFrom.trim(),
      price: parsedPrice && !isNaN(parsedPrice) ? parsedPrice : undefined,
    }));

    if (onAddItems) {
      onAddItems(createdItems);
    } else if (onAddItem) {
      createdItems.forEach((item) => onAddItem(item));
    }

    setDescription('');
    setBuyFrom('');
    setQuantity('১টি');
    setPrice('');
    setError('');
    onClose();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        minHeight: '100vh',
        margin: 0,
      }}
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto space-y-4">
        {/* Header with Mascot */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            {/* Mascot Image */}
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 overflow-hidden shrink-0 flex items-center justify-center p-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/mascot.png"
                alt="Jamanot Mascot"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-gray-900 flex items-center gap-1.5">
                <span>{isEditing ? 'কাস্টম আইটেম এডিট করুন' : 'Add Custom Item'}</span>
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">
                {isEditing
                  ? 'পণ্য বা সার্ভিসের তথ্য সংশোধন করুন।'
                  : 'খুঁজে পাচ্ছেন না বা অন্য কোনো কাজ? লিখে দিন, হেলপার Manage করবে.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Item Description Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-gray-700">
                বিবরণ (পণ্য বা কাজের নাম) <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-gray-400 font-medium">
                কমা (,) বা লাইন ব্রেক দিয়ে আলাদা করুন
              </span>
            </div>
            <div className="relative">
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (error) setError('');
                }}
                placeholder="যেমন: নাপা এক্সট্রা ২ পাতা, প্যারাসিটামল ১০টি, ওআরএস ৫ প্যাকেট (কমা বা Enter দিয়ে লিখলে প্রতিটি আলাদা পণ্য হবে)..."
                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-xs resize-none"
              />
            </div>

            {/* Live preview for separated items */}
            {parsedItems.length > 1 && (
              <div className="mt-2 p-2.5 rounded-2xl bg-emerald-50/90 border border-emerald-200/80 space-y-1.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-emerald-800 font-bold text-[10px]">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{parsedItems.length}টি আলাদা পণ্য যুক্ত হবে:</span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9px] font-black">
                    স্বতন্ত্র আইটেম
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {parsedItems.map((item, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-lg bg-white border border-emerald-200 text-emerald-950 font-semibold text-[10px] shadow-2xs flex items-center gap-1"
                    >
                      <span className="text-emerald-600 font-black">{idx + 1}.</span>
                      <span className="truncate max-w-[160px]">{item}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Location / Source Input */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">
              স্থান / কোথা থেকে সংগ্রহ করতে হবে? <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={buyFrom}
                onChange={(e) => {
                  setBuyFrom(e.target.value);
                  if (error) setError('');
                }}
                placeholder="যেমন: নির্দিষ্ট দোকান, ফার্মেসি, কাঁচাবাজার, কুরিয়ার অফিস, বা যেকোনো ঠিকানা"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-xs"
              />
            </div>
          </div>


          {/* Price / Estimated Cost — only shown when helper is adding/editing */}
          {allowCostInput && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-gray-700">
                    আনুমানিক বা বাজেট মূল্য (টাকা, ঐচ্ছিক)
                  </label>
                  <span className="text-[10px] text-gray-400 font-medium">
                    জানা না থাকলে খালি রাখুন
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-extrabold text-xs">৳</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="যেমন: ৫০, ১৫০, ৫০০..."
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-xs"
                  />
                </div>
              </div>

              {/* Note about Price */}
              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-amber-900 space-y-1">
                <div className="flex items-center justify-between font-bold text-[11px]">
                  <span>আনুমানিক পণ্য/সার্ভিস খরচ:</span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 font-extrabold text-[10px]">
                    {price.trim() && !isNaN(Number(price)) ? `৳${price.trim()}` : 'N/A'}
                  </span>
                </div>
                <p className="text-[10px] text-amber-800 leading-relaxed">
                  * হেলপার উল্লেখিত স্থান থেকে কাজ সম্পন্ন বা আসল মেমো সহ প্রকৃত খরচ যাচাই করে চূড়ান্ত করবে।
                </p>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
            >
              বাতিল
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              {isEditing ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>পরিবর্তন সংরক্ষণ করুন</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>
                    {parsedItems.length > 1
                      ? `${parsedItems.length}টি পণ্য যোগ করুন`
                      : 'রিকোয়েস্ট যোগ করুন'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
