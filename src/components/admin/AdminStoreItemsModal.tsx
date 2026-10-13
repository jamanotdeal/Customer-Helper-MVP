'use client';

import React from 'react';
import { Shop } from '@/types';
import { StoreProductManager } from '../StoreProductManager';
import { X, Store, MapPin, Tag } from 'lucide-react';

interface AdminStoreItemsModalProps {
  shop: Shop;
  onClose: () => void;
}

export const AdminStoreItemsModal: React.FC<AdminStoreItemsModalProps> = ({ shop, onClose }) => {
  return (
    <div className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-800 text-white p-5 sm:p-6 relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-rose-500/80 hover:bg-rose-600 text-white transition-all shadow-sm cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start space-x-3.5 pr-8">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
              <Store className="w-6 h-6 text-purple-200" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-purple-500/30 border border-purple-300/30 text-purple-200 text-[10px] font-extrabold uppercase tracking-wider">
                  {shop.type}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-extrabold">
                  <Tag className="w-3 h-3" />
                  <span>Item & Catalog Management</span>
                </span>
              </div>
              <h3 className="text-xl font-black text-white leading-tight truncate">{shop.name}</h3>
              <p className="text-xs text-purple-200/90 font-medium mt-1 flex items-center gap-1.5 truncate">
                <MapPin className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                <span className="truncate">{shop.location?.address || 'No address registered'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 overscroll-contain">
          <StoreProductManager
            storeId={shop.id}
            storeName={shop.name}
            hideFloatingFab={true}
          />
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-gray-500 font-semibold px-2">
            অ্যাডমিন প্যানেল থেকে যেকোনো সময় পণ্যের মূল্য, ছাড় ও স্টক স্ট্যাটাস পরিবর্তন করতে পারেন।
          </div>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-2xl bg-gray-800 hover:bg-gray-900 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
          >
            সম্পন্ন (Done)
          </button>
        </div>
      </div>
    </div>
  );
};
