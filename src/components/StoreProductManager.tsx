'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StoreProduct } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from './CustomModal';
import { getCategoriesForStoreType } from '@/lib/pricing';
import {
  Plus, Search, Edit3, Trash2, Package, Check, X,
  Image as ImageIcon, Upload, Tag, Percent, AlertCircle,
  ToggleLeft, ToggleRight, Sparkles, Filter, ChevronDown
} from 'lucide-react';

interface StoreProductManagerProps {
  storeId: string;
  storeName?: string;
  hideFloatingFab?: boolean;
}

// Client-side image compression helper to keep images fast and lightweight (~30-50KB)
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 500;
        const MAX_HEIGHT = 500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        // Use JPEG with 0.8 quality for fast loading
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const COMMON_CATEGORIES = [
  'চাল ও ডাল',
  'তেল ও মশলা',
  'শাকসবজি ও ফলমূল',
  'মাছ ও মাংস',
  'দুধ ও ডিম',
  'স্ন্যাক্স ও বেকারি',
  'পানীয় ও জুস',
  'ওষুধ ও ফার্স্ট এইড',
  'ব্যক্তিগত যত্ন',
  'পরিষ্কার ও গৃহস্থালি',
  'শিশু যত্ন',
  'চা ও কফি',
  'অন্যান্য',
];

export const StoreProductManager: React.FC<StoreProductManagerProps> = ({ storeId, storeName, hideFloatingFab = false }) => {
  const { showAlert, showConfirm } = useModal();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('১ কেজি');
  const [category, setCategory] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [price, setPrice] = useState('');
  const [discountRate, setDiscountRate] = useState('');
  const [inStock, setInStock] = useState(true);
  const [photoUrl, setPhotoUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync products from fallbackStore
  useEffect(() => {
    const sync = () => {
      const shopObj = fallbackStore.shops.get(storeId);
      const all = Array.from(fallbackStore.storeProducts.values()).filter(
        (p) => p.storeId === storeId || (shopObj?.ownerUserId && p.storeId === shopObj.ownerUserId)
      );
      // Sort newest first
      all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setProducts(all);
    };

    sync();
    const unsub = fallbackStore.subscribe(sync);
    // Ensure products are fetched
    fallbackStore.loadStoreProducts();
    return () => unsub();
  }, [storeId]);

  // Unique categories with counts
  const { categoriesWithCount, uncategorizedCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    let uncat = 0;
    products.forEach((p) => {
      const cat = p.category?.trim();
      if (cat) {
        counts[cat] = (counts[cat] || 0) + 1;
      } else {
        uncat++;
      }
    });
    return {
      categoriesWithCount: Object.entries(counts).map(([name, count]) => ({ name, count })),
      uncategorizedCount: uncat,
    };
  }, [products]);

  // Store type & Admin-configured categories for this store
  const configuredCategories = useMemo(() => {
    const shopObj = fallbackStore.shops.get(storeId);
    const storeType = shopObj?.type || shopObj?.category || '';
    const adminCats = getCategoriesForStoreType(storeType, fallbackStore.pricingSettings);
    // Combine with any categories existing products in this store already have
    const existing = products
      .map((p) => p.category?.trim())
      .filter(Boolean) as string[];
    const set = new Set<string>([...adminCats, ...existing]);
    return Array.from(set);
  }, [storeId, products]);

  // Combined suggestions for autocomplete (if needed)
  const categorySuggestions = useMemo(() => {
    return configuredCategories;
  }, [configuredCategories]);

  // Open modal for adding
  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setUnit('১ কেজি');
    const initialCat = categoryFilter !== 'ALL' && categoryFilter !== '__UNCATEGORIZED__' ? categoryFilter : '';
    setCategory(initialCat);
    setIsCustomCategory(Boolean(initialCat && !configuredCategories.includes(initialCat)));
    setPrice('');
    setDiscountRate('');
    setInStock(true);
    setPhotoUrl('');
    setFormError('');
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEdit = (p: StoreProduct) => {
    setEditingProduct(p);
    setName(p.name);
    setUnit(p.unit || '১ কেজি');
    const cat = p.category || '';
    setCategory(cat);
    setIsCustomCategory(Boolean(cat && !configuredCategories.includes(cat)));
    setPrice(String(p.price || ''));
    setDiscountRate(p.discountRate !== undefined ? String(p.discountRate) : '');
    setInStock(p.inStock !== false);
    setPhotoUrl(p.photoUrl || '');
    setFormError('');
    setIsModalOpen(true);
  };

  // Image file handler
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('অনুগ্রহ করে একটি ছবি ফাইল নির্বাচন করুন।');
      return;
    }

    try {
      const compressed = await compressImage(file);
      setPhotoUrl(compressed);
      setFormError('');
    } catch (err) {
      console.error('Image compression failed:', err);
      setFormError('ছবি প্রসেস করতে ব্যর্থ হয়েছে।');
    }
  };

  // Save product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('পণ্যের নাম অবশ্যই দিতে হবে।');
      return;
    }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      setFormError('সঠিক বিক্রয়মূল্য উল্লেখ করুন।');
      return;
    }

    const numDiscount = discountRate ? parseFloat(discountRate) : 0;
    if (discountRate && (isNaN(numDiscount) || numDiscount < 0 || numDiscount > 100)) {
      setFormError('ছাড়ের হার ০ থেকে ১০০ এর মধ্যে হতে হবে।');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const now = new Date().toISOString();
      const productData: StoreProduct = {
        id: editingProduct ? editingProduct.id : `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        storeId,
        storeName: storeName || '',
        name: name.trim(),
        unit: unit.trim() || '১ পিস',
        price: numPrice,
        discountRate: numDiscount > 0 ? numDiscount : undefined,
        category: category.trim() || undefined,
        inStock,
        photoUrl: photoUrl || undefined,
        createdAt: editingProduct ? editingProduct.createdAt : now,
        updatedAt: now,
      };

      await fallbackStore.saveStoreProduct(productData);
      setIsModalOpen(false);
      showAlert(
        'সফল হয়েছে!',
        editingProduct ? 'পণ্যটির তথ্য আপডেট করা হয়েছে।' : 'নতুন পণ্যটি যুক্ত করা হয়েছে।',
        'success'
      );
    } catch (err: any) {
      console.error('Failed to save product:', err);
      setFormError('পণ্য সংরক্ষণ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete product
  const handleDelete = async (p: StoreProduct) => {
    const confirmed = await showConfirm(
      'পণ্যটি মুছে ফেলতে চান?',
      `"${p.name}" তালিকা থেকে চিরতরে মুছে যাবে। আপনি কি নিশ্চিত?`,
      'হ্যাঁ, মুছুন',
      'বাতিল'
    );
    if (confirmed) {
      try {
        await fallbackStore.deleteStoreProduct(p.id);
        showAlert('মুছে ফেলা হয়েছে', 'পণ্যটি সফলভাবে মুছে ফেলা হয়েছে।', 'info');
      } catch (err) {
        showAlert('সমস্যা হয়েছে', 'পণ্যটি মুছতে ব্যর্থ হয়েছে।', 'error');
      }
    }
  };

  // Toggle stock switch
  const handleToggleStock = async (p: StoreProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fallbackStore.toggleProductStock(p.id, !p.inStock);
    } catch (err) {
      console.error('Failed to toggle stock:', err);
    }
  };

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Category filter
      if (categoryFilter !== 'ALL') {
        if (categoryFilter === '__UNCATEGORIZED__') {
          if (p.category && p.category.trim()) return false;
        } else {
          if ((p.category || '').trim() !== categoryFilter) return false;
        }
      }

      // Stock filter
      if (stockFilter === 'IN_STOCK' && !p.inStock) return false;
      if (stockFilter === 'OUT_OF_STOCK' && p.inStock) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesUnit = p.unit?.toLowerCase().includes(q);
        const matchesCategory = p.category?.toLowerCase().includes(q);
        return matchesName || matchesUnit || matchesCategory;
      }
      return true;
    });
  }, [products, categoryFilter, stockFilter, searchQuery]);

  const inStockCount = products.filter((p) => p.inStock).length;
  const outOfStockCount = products.filter((p) => !p.inStock).length;

  return (
    <div className="space-y-4 animate-in fade-in duration-200 pb-32">
      {/* ─── Page Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-extrabold text-gray-900 text-base">
            {storeName ? `${storeName} — পণ্য ও স্টক` : 'পণ্য ও স্টক'}
          </h2>
          <p className="text-[11px] text-gray-500 font-medium mt-0.5">
            {products.length} টি পণ্য · <span className="text-emerald-700 font-bold">{inStockCount} স্টকে</span> · <span className="text-rose-600 font-bold">{outOfStockCount} শেষ</span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 inline-flex items-center space-x-1.5 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>নতুন পণ্য যোগ করুন</span>
        </button>
      </div>

      {/* ─── Search and Quick Stock Filter Bar ──────────────────────────────────── */}
      <div className="bg-white p-2.5 rounded-2xl border border-gray-100 shadow-xs flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="পণ্য খুঁজুন (যেমন: চাল, তেল, নাপা)..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1 text-xs shrink-0 bg-gray-50 p-1 rounded-xl border border-gray-200/60">
          <button
            type="button"
            onClick={() => setStockFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
              stockFilter === 'ALL'
                ? 'bg-white text-gray-900 shadow-2xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            সকল ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setStockFilter('IN_STOCK')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
              stockFilter === 'IN_STOCK'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            স্টকে আছে ({inStockCount})
          </button>
          <button
            type="button"
            onClick={() => setStockFilter('OUT_OF_STOCK')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
              stockFilter === 'OUT_OF_STOCK'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            স্টক শেষ ({outOfStockCount})
          </button>
        </div>
      </div>

      {/* ─── Category Selection Box ────────────────────────────────────────────── */}
      {(categoriesWithCount.length > 0 || uncategorizedCount > 0) && (
        <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-xs">
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-600 flex items-center gap-1.5">
              <Tag className="w-4 h-4 shrink-0" />
              <span className="text-[11px] font-bold text-gray-500 hidden sm:inline">ক্যাটাগরি:</span>
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full pl-9 sm:pl-24 pr-8 py-2 text-xs font-bold text-gray-800 bg-gray-50 hover:bg-gray-100/70 border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all cursor-pointer appearance-none"
            >
              <option value="ALL">📂 সকল ক্যাটাগরি ({products.length} টি পণ্য)</option>
              {categoriesWithCount.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  🏷️ {cat.name} ({cat.count})
                </option>
              ))}
              {uncategorizedCount > 0 && categoriesWithCount.length > 0 && (
                <option value="__UNCATEGORIZED__">
                  📦 অন্যান্য / আনক্যাটাগরাইজড ({uncategorizedCount})
                </option>
              )}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {categoryFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className="shrink-0 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
              title="ক্যাটাগরি ফিল্টার রিসেট করুন"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ফিল্টার রিসেট</span>
            </button>
          )}
        </div>
      )}

      {/* ─── Product List / Cards ──────────────────────────────────────────────── */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-3xl p-8 text-center shadow-soft">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
            <Package className="w-7 h-7" />
          </div>
          <h4 className="font-extrabold text-sm text-gray-900 mb-1">
            {products.length === 0 ? 'কোনো পণ্য যোগ করা হয়নি' : 'কোনো পণ্য খুঁজে পাওয়া যায়নি'}
          </h4>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
            {products.length === 0
              ? 'আপনার দোকানের পণ্যসমূহ যোগ করুন যাতে গ্রাহক ও হেলপার সহজেই অর্ডার করতে পারে।'
              : 'অন্য কোনো নাম বা ফিল্টার দিয়ে চেষ্টা করুন।'}
          </p>
          {products.length === 0 && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 inline-flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>প্রথম পণ্যটি যোগ করুন</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredProducts.map((p) => {
            const hasDiscount = Boolean(p.discountRate && p.discountRate > 0);
            const discountedPrice = hasDiscount
              ? Math.round(p.price * (1 - (p.discountRate || 0) / 100))
              : p.price;

            return (
              <div
                key={p.id}
                className={`bg-white rounded-2xl border p-3.5 transition-all shadow-xs flex flex-col justify-between ${
                  p.inStock
                    ? 'border-gray-100 hover:border-emerald-200'
                    : 'border-rose-100/80 bg-rose-50/20 opacity-85'
                }`}
              >
                <div className="flex items-start space-x-3">
                  {/* Product Photo */}
                  <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center relative">
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photoUrl}
                        alt={p.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-gray-300 flex flex-col items-center justify-center p-1 text-[9px] text-center">
                        <ImageIcon className="w-6 h-6 mb-0.5 text-gray-300" />
                        <span>ছবি নেই</span>
                      </div>
                    )}
                    {hasDiscount && (
                      <span className="absolute top-1 left-1 bg-rose-500 text-white text-[9px] font-extrabold px-1 rounded-sm shadow-2xs">
                        -{p.discountRate}%
                      </span>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="font-extrabold text-gray-900 text-sm truncate leading-tight">
                        {p.name}
                      </h4>
                    </div>

                    <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-semibold text-[10px]">
                        {p.unit}
                      </span>
                      {p.category ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200/70 font-bold text-[10px] max-w-[150px] truncate" title={p.category}>
                          <Tag className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{p.category}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(p)}
                          className="text-[10px] text-indigo-600 hover:underline font-semibold"
                        >
                          + ক্যাটাগরি যোগ
                        </button>
                      )}
                    </div>

                    {/* Price with optional discount */}
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="text-emerald-700 font-extrabold text-sm">
                        ৳{discountedPrice}
                      </span>
                      {hasDiscount && (
                        <span className="text-gray-400 line-through text-[11px] font-semibold">
                          ৳{p.price}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Stock Switch Toggle & Edit/Delete Buttons */}
                <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
                  {/* Stock On/Off Switch Button */}
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={(e) => handleToggleStock(p, e)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        p.inStock ? 'bg-emerald-600' : 'bg-gray-300'
                      }`}
                      aria-label="Stock Toggle"
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          p.inStock ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span
                      className={`text-[11px] font-bold ${
                        p.inStock ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {p.inStock ? 'স্টকে আছে' : 'স্টক শেষ'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(p)}
                      className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                      title="সম্পাদনা করুন"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                      title="মুছে ফেলুন"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── ADD / EDIT PRODUCT MODAL ────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100000] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-gray-900">
                    {editingProduct ? 'পণ্য সম্পাদনা করুন' : 'নতুন পণ্য যোগ করুন'}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-medium">
                    পণ্যের বিবরণ ও মূল্য নির্ধারণ করুন
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-3.5 text-xs">
              {/* Photo Upload Area */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  পণ্যের ছবি (Photo)
                </label>
                <div className="flex items-center space-x-3">
                  <div className="w-20 h-20 rounded-2xl bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center relative group">
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl}
                        alt="Product preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-300" />
                    )}
                    {photoUrl && (
                      <button
                        type="button"
                        onClick={() => setPhotoUrl('')}
                        className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{photoUrl ? 'ছবি পরিবর্তন করুন' : 'ছবি আপলোড করুন'}</span>
                    </button>
                    <p className="text-[10px] text-gray-400 leading-tight">
                      ক্যামেরা বা গ্যালারি থেকে যেকোনো ছবি নির্বাচন করুন।
                    </p>
                  </div>
                </div>
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  পণ্যের নাম <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="যেমন: মিনিকেট চাল, খাঁটি গাওয়া ঘি, নাপা এক্সট্রা"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-xs"
                />
              </div>

              {/* Unit */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  একক / পরিমাণ (Unit) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="যেমন: ১ কেজি, ১ পিস, ১ লিটার"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-xs"
                />
              </div>

              {/* Category Selection Box */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-indigo-600" />
                    <span>পণ্যের ক্যাটাগরি (Category)</span>
                  </label>
                  {category && (
                    <button
                      type="button"
                      onClick={() => {
                        setCategory('');
                        setIsCustomCategory(false);
                      }}
                      className="text-[10px] text-rose-500 hover:underline font-semibold cursor-pointer"
                    >
                      ক্লিয়ার করুন
                    </button>
                  )}
                </div>

                <div className="relative">
                  <select
                    value={isCustomCategory ? '__CUSTOM__' : category}
                    onChange={(e) => {
                      if (e.target.value === '__CUSTOM__') {
                        setIsCustomCategory(true);
                      } else {
                        setIsCustomCategory(false);
                        setCategory(e.target.value);
                      }
                    }}
                    className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-xs font-semibold bg-white cursor-pointer appearance-none"
                  >
                    <option value="">-- ক্যাটাগরি নির্বাচন করুন (ঐচ্ছিক) --</option>
                    {configuredCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__CUSTOM__">➕ অন্য নতুন ক্যাটাগরি লিখুন (Custom)...</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {isCustomCategory && (
                  <div className="mt-2 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-500 font-bold">নতুন ক্যাটাগরির নাম লিখুন:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCategory(false);
                          setCategory('');
                        }}
                        className="text-[10px] text-indigo-600 hover:underline font-bold cursor-pointer"
                      >
                        তালিকা থেকে বাছুন
                      </button>
                    </div>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="যেমন: মশলাপাতি, অর্গানিক ফল..."
                      autoFocus
                      className="w-full px-3 py-2 rounded-xl border border-indigo-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-xs bg-indigo-50/20"
                    />
                  </div>
                )}
              </div>

              {/* Price & Discount Rate (2 cols) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    বিক্রয়মূল্য (৳ Price) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="যেমন: 75"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    ছাড়ের হার (% Discount)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={discountRate}
                    onChange={(e) => setDiscountRate(e.target.value)}
                    placeholder="যেমন: 5 (৫% ছাড়)"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-xs font-bold"
                  />
                </div>
              </div>

              {/* In Stock Switch */}
              <div className="p-3 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
                <div>
                  <h5 className="font-extrabold text-gray-900 text-xs">
                    স্টক স্ট্যাটাস (Stock Status)
                  </h5>
                  <p className="text-[10px] text-gray-500">
                    স্টক শেষ হলে সুইচ অফ করে রাখুন
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInStock(!inStock)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    inStock ? 'bg-emerald-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      inStock ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs transition-colors cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <span>সংরক্ষণ হচ্ছে...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{editingProduct ? 'আপডেট করুন' : 'পণ্য যোগ করুন'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ─── Floating Add FAB (bottom-right, above bottom nav) ─── */}
      {!hideFloatingFab && (
        <div
          className="fixed right-4 z-50"
          style={{ bottom: 'calc(max(8px, env(safe-area-inset-bottom)) + 72px)' }}
        >
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping pointer-events-none" />
          <button
            type="button"
            id="store-fab-add-product"
            onClick={handleOpenAdd}
            aria-label="নতুন পণ্য যোগ করুন"
            className="relative w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xl shadow-emerald-600/40 flex items-center justify-center border-4 border-white active:scale-95 transition-transform cursor-pointer"
          >
            <Plus className="w-7 h-7 text-white stroke-[2.5]" />
          </button>
        </div>
      )}
    </div>
  );
};
