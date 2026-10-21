'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StoreProduct, ProductPriceOption } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from './CustomModal';
import { getCategoriesForStoreType } from '@/lib/pricing';
import {
  Plus, Search, Edit3, Trash2, Package, Check, X,
  Image as ImageIcon, Upload, Tag, AlertCircle,
  ChevronDown, RefreshCw, Layers,
} from 'lucide-react';

interface StoreProductManagerProps {
  storeId: string;
  storeName?: string;
  hideFloatingFab?: boolean;
}

// Client-side image compression helper
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 500;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(e.target?.result as string); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const StoreProductManager: React.FC<StoreProductManagerProps> = ({ storeId, storeName, hideFloatingFab = false }) => {
  const { showAlert, showConfirm } = useModal();

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [pricingSettings, setPricingSettings] = useState(() => fallbackStore.pricingSettings);

  // Add/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
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

  // Multiple Pricing Options State
  interface PriceOptionDraft {
    id?: string;
    name: string;
    price: string;
    unit: string;
  }
  const [hasMultiplePrices, setHasMultiplePrices] = useState(false);
  const [priceOptions, setPriceOptions] = useState<PriceOptionDraft[]>([]);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    const sync = () => {
      const shopObj = fallbackStore.shops.get(storeId);
      const all = Array.from(fallbackStore.storeProducts.values()).filter(
        (p) => p.storeId === storeId || (shopObj?.ownerUserId && p.storeId === shopObj.ownerUserId)
      );
      all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setProducts(all);
      setPricingSettings({ ...fallbackStore.pricingSettings });
    };
    sync();
    const unsub = fallbackStore.subscribe(sync);
    fallbackStore.loadStoreProducts();
    return () => unsub();
  }, [storeId]);

  const storeType = useMemo(() => {
    const shopObj = fallbackStore.shops.get(storeId);
    return shopObj?.type || shopObj?.category || '';
  }, [storeId]);

  const configuredCategories = useMemo(() => {
    const adminCats = getCategoriesForStoreType(storeType, pricingSettings);
    const existing = products.map((p) => p.category?.trim()).filter(Boolean) as string[];
    return Array.from(new Set([...adminCats, ...existing]));
  }, [storeType, products, pricingSettings]);

  const { categoriesWithCount, uncategorizedCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    let uncat = 0;
    products.forEach((p) => {
      const cat = p.category?.trim();
      if (cat) counts[cat] = (counts[cat] || 0) + 1; else uncat++;
    });
    return { categoriesWithCount: Object.entries(counts).map(([n, c]) => ({ name: n, count: c })), uncategorizedCount: uncat };
  }, [products]);

  const filteredProducts = useMemo(() => products.filter((p) => {
    if (categoryFilter !== 'ALL') {
      if (categoryFilter === '__UNCATEGORIZED__') { if (p.category?.trim()) return false; }
      else if ((p.category || '').trim() !== categoryFilter) return false;
    }
    if (stockFilter === 'IN_STOCK' && !p.inStock) return false;
    if (stockFilter === 'OUT_OF_STOCK' && p.inStock) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.unit || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
    }
    return true;
  }), [products, categoryFilter, stockFilter, searchQuery]);

  const inStockCount = products.filter((p) => p.inStock).length;
  const outOfStockCount = products.filter((p) => !p.inStock).length;

  const toEnglishDigits = (str: string) => String(str || '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));

  const resetForm = () => {
    setName(''); setUnit('১ কেজি'); setCategory(''); setIsCustomCategory(false);
    setPrice(''); setDiscountRate(''); setInStock(true); setPhotoUrl(''); setFormError('');
    setHasMultiplePrices(false); setPriceOptions([]);
  };

  const handleOpenAdd = () => {
    setEditingProduct(null);
    resetForm();
    const initialCat = categoryFilter !== 'ALL' && categoryFilter !== '__UNCATEGORIZED__' ? categoryFilter : '';
    setCategory(initialCat);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: StoreProduct) => {
    setEditingProduct(p);
    setName(p.name); setUnit(p.unit || '১ কেজি');
    const cat = p.category || '';
    setCategory(cat);
    setIsCustomCategory(Boolean(cat && !configuredCategories.includes(cat)));
    setPrice(String(p.price || ''));
    setDiscountRate(p.discountRate && p.discountRate > 0 ? String(p.discountRate) : '');
    setInStock(p.inStock !== false);
    setPhotoUrl(p.photoUrl || '');
    if (p.priceOptions && p.priceOptions.length > 0) {
      setHasMultiplePrices(true);
      setPriceOptions(p.priceOptions.map((po) => ({
        id: po.id,
        name: po.name || '',
        price: String(po.price || ''),
        unit: po.unit || '',
      })));
    } else {
      setHasMultiplePrices(false);
      setPriceOptions([]);
    }
    setFormError('');
    setIsModalOpen(true);
  };

  const handleToggleMultiplePrices = () => {
    if (!hasMultiplePrices) {
      setHasMultiplePrices(true);
      if (priceOptions.length === 0) {
        setPriceOptions([
          { name: 'Small', price: price ? String(price) : '', unit: unit || '' },
          { name: 'Medium', price: '', unit: unit || '' },
          { name: 'Large', price: '', unit: unit || '' },
        ]);
      }
    } else {
      setHasMultiplePrices(false);
    }
  };

  const addPriceOptionRow = () => {
    setPriceOptions((prev) => [
      ...prev,
      { name: '', price: '', unit: unit || '' },
    ]);
  };

  const updatePriceOptionRow = (index: number, field: 'name' | 'price' | 'unit', value: string) => {
    setPriceOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, [field]: value } : opt))
    );
  };

  const removePriceOptionRow = (index: number) => {
    setPriceOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setFormError('অনুগ্রহ করে একটি ছবি ফাইল নির্বাচন করুন।'); return; }
    try { setPhotoUrl(await compressImage(file)); setFormError(''); }
    catch { setFormError('ছবি প্রসেস করতে ব্যর্থ হয়েছে।'); }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setFormError('পণ্যের নাম অবশ্যই দিতে হবে।'); return; }

    let validOptions: ProductPriceOption[] | undefined = undefined;
    if (hasMultiplePrices) {
      if (priceOptions.length < 2) {
        setFormError('একাধিক মূল্যের জন্য কমপক্ষে ২টি সাইজ/ভ্যারিয়েন্ট যোগ করুন।');
        return;
      }
      const parsedOpts: ProductPriceOption[] = [];
      for (let i = 0; i < priceOptions.length; i++) {
        const opt = priceOptions[i];
        const optName = opt.name.trim();
        const optPriceClean = toEnglishDigits(opt.price).replace(/[৳,]/g, '').trim();
        const optPriceNum = optPriceClean ? parseFloat(optPriceClean) : NaN;
        if (!optName) {
          setFormError(`সাইজ #${i + 1} এর নাম লিখুন (যেমন: Small / Medium / Large)`);
          return;
        }
        if (isNaN(optPriceNum) || optPriceNum < 0) {
          setFormError(`"${optName}" সাইজের সঠিক বিক্রয়মূল্য উল্লেখ করুন।`);
          return;
        }
        parsedOpts.push({
          id: opt.id || `opt_${Date.now()}_${i}`,
          name: optName,
          price: optPriceNum,
          unit: opt.unit.trim() || undefined,
        });
      }
      validOptions = parsedOpts;
    }

    const cleanPrice = toEnglishDigits(price).replace(/[৳,]/g, '').trim();
    let numPrice = cleanPrice ? parseFloat(cleanPrice) : NaN;
    if (hasMultiplePrices && validOptions && validOptions.length > 0 && (isNaN(numPrice) || numPrice <= 0)) {
      numPrice = Math.min(...validOptions.map((o) => o.price));
    } else if (isNaN(numPrice) || numPrice < 0) {
      setFormError('সঠিক বিক্রয়মূল্য উল্লেখ করুন।');
      return;
    }

    const cleanDiscount = toEnglishDigits(discountRate).replace(/%/g, '').trim();
    const numDiscount = cleanDiscount ? parseFloat(cleanDiscount) : 0;
    if (cleanDiscount && (isNaN(numDiscount) || numDiscount < 0 || numDiscount > 100)) {
      setFormError('ছাড়ের হার ০ থেকে ১০০ এর মধ্যে হতে হবে।'); return;
    }
    setIsSubmitting(true); setFormError('');
    try {
      const now = new Date().toISOString();
      if (editingProduct) {
        await fallbackStore.saveStoreProduct({
          ...editingProduct,
          name: name.trim(),
          unit: unit.trim() || '১ পিস',
          price: numPrice,
          priceOptions: hasMultiplePrices && validOptions && validOptions.length > 0 ? validOptions : undefined,
          discountRate: numDiscount > 0 ? numDiscount : undefined,
          category: category.trim() || undefined,
          inStock,
          photoUrl: photoUrl || undefined,
          updatedAt: now,
        });
        showAlert('সফল হয়েছে!', 'পণ্যটির তথ্য আপডেট করা হয়েছে।', 'success');
      } else {
        const newId = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await fallbackStore.saveStoreProduct({
          id: newId,
          storeId,
          storeName: storeName || '',
          name: name.trim(),
          unit: unit.trim() || '১ পিস',
          price: numPrice,
          priceOptions: hasMultiplePrices && validOptions && validOptions.length > 0 ? validOptions : undefined,
          discountRate: numDiscount > 0 ? numDiscount : undefined,
          category: category.trim() || undefined,
          inStock,
          photoUrl: photoUrl || undefined,
          createdAt: now,
          updatedAt: now,
        });
        showAlert('সফল হয়েছে!', 'নতুন পণ্যটি যোগ করা হয়েছে।', 'success');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Failed to save product:', err);
      setFormError('পণ্য সংরক্ষণ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally { setIsSubmitting(false); }
  };

  const handleDelete = async (p: StoreProduct) => {
    const confirmed = await showConfirm(
      'পণ্যটি সরিয়ে ফেলতে চান?',
      `"${p.name}" এই দোকান থেকে সরিয়ে ফেলা হবে।`,
      'হ্যাঁ, সরিয়ে দিন', 'বাতিল'
    );
    if (confirmed) {
      try { await fallbackStore.deleteStoreProduct(p.id); showAlert('সরিয়ে ফেলা হয়েছে', 'পণ্যটি সরানো হয়েছে।', 'info'); }
      catch { showAlert('সমস্যা হয়েছে', 'পণ্যটি সরাতে ব্যর্থ হয়েছে।', 'error'); }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = await showConfirm(
      `${selectedIds.size} টি পণ্য সরাবেন?`,
      `নির্বাচিত ${selectedIds.size} টি পণ্য এই দোকান থেকে মুছে ফেলা হবে। এটি পূর্বাবস্থায় ফেরানো যাবে না।`,
      'হ্যাঁ, মুছে ফেলুন', 'বাতিল'
    );
    if (!confirmed) return;
    setBulkDeleting(true);
    try {
      for (const id of Array.from(selectedIds)) {
        await fallbackStore.deleteStoreProduct(id);
      }
      setSelectedIds(new Set());
      showAlert('সফল হয়েছে!', `${selectedIds.size} টি পণ্য সরানো হয়েছে।`, 'success');
    } catch (err) {
      console.error(err);
      showAlert('সমস্যা হয়েছে', 'কিছু পণ্য সরাতে ব্যর্থ হয়েছে।', 'error');
    } finally { setBulkDeleting(false); }
  };

  const handleToggleStock = async (p: StoreProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await fallbackStore.toggleProductStock(p.id, !p.inStock); } catch (err) { console.error(err); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allPageSelected = filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id));

  return (
    <div className="space-y-4 animate-in fade-in duration-200 pb-32">

      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-extrabold text-gray-900 text-base">{storeName ? `${storeName} — পণ্য তালিকা` : 'পণ্য তালিকা'}</h2>
          <p className="text-[11px] text-gray-500 font-medium mt-0.5">
            {products.length} টি পণ্য · <span className="text-emerald-700 font-bold">{inStockCount} স্টকে</span> · <span className="text-rose-600 font-bold">{outOfStockCount} শেষ</span>
          </p>
        </div>
        <button type="button" onClick={handleOpenAdd} className="px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md inline-flex items-center space-x-1.5 transition-all cursor-pointer">
          <Plus className="w-4 h-4" /><span>নতুন পণ্য যোগ</span>
        </button>
      </div>

      {/* Search + Stock Filter */}
      <div className="bg-white p-2.5 rounded-2xl border border-gray-100 shadow-xs flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="পণ্য খুঁজুন..." className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 p-0.5"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <div className="flex items-center space-x-1 text-xs shrink-0 bg-gray-50 p-1 rounded-xl border border-gray-200/60">
          {(['ALL', 'IN_STOCK', 'OUT_OF_STOCK'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setStockFilter(f)}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${stockFilter === f ? (f === 'ALL' ? 'bg-white text-gray-900 shadow-2xs' : f === 'IN_STOCK' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'text-gray-500 hover:text-gray-800'}`}>
              {f === 'ALL' ? `সকল (${products.length})` : f === 'IN_STOCK' ? `স্টকে (${inStockCount})` : `শেষ (${outOfStockCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Category filter */}
      {(categoriesWithCount.length > 0 || uncategorizedCount > 0) && (
        <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-xs">
          <div className="relative flex-1">
            <Tag className="w-4 h-4 text-indigo-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full pl-9 pr-8 py-2 text-xs font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 outline-none cursor-pointer appearance-none">
              <option value="ALL">📂 সকল ক্যাটাগরি ({products.length} টি)</option>
              {categoriesWithCount.map((cat) => <option key={cat.name} value={cat.name}>🏷️ {cat.name} ({cat.count})</option>)}
              {uncategorizedCount > 0 && categoriesWithCount.length > 0 && <option value="__UNCATEGORIZED__">📦 অন্যান্য ({uncategorizedCount})</option>}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          {categoryFilter !== 'ALL' && (
            <button type="button" onClick={() => setCategoryFilter('ALL')} className="shrink-0 p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          )}
        </div>
      )}

      {/* Bulk select bar */}
      {filteredProducts.length > 0 && (
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-3 py-2 shadow-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allPageSelected}
              onChange={(e) => {
                const next = new Set(selectedIds);
                if (e.target.checked) filteredProducts.forEach((p) => next.add(p.id));
                else filteredProducts.forEach((p) => next.delete(p.id));
                setSelectedIds(next);
              }}
              className="w-4 h-4 rounded border-gray-300 accent-indigo-600 cursor-pointer"
            />
            <span className="text-xs font-bold text-gray-700">
              {selectedIds.size > 0 ? `${selectedIds.size} টি নির্বাচিত` : 'সব নির্বাচন করুন'}
            </span>
          </label>
          {selectedIds.size > 0 && (
            <button
              type="button"
              disabled={bulkDeleting}
              onClick={handleBulkDelete}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs cursor-pointer transition-all active:scale-95 disabled:opacity-60"
            >
              {bulkDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>{bulkDeleting ? 'মুছছে...' : `${selectedIds.size} টি মুছুন`}</span>
            </button>
          )}
          {selectedIds.size > 0 && (
            <button type="button" onClick={() => setSelectedIds(new Set())} className="p-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Product Cards */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-3xl p-8 text-center shadow-soft">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h4 className="font-extrabold text-sm text-gray-900 mb-1">{products.length === 0 ? 'কোনো পণ্য যোগ করা হয়নি' : 'কোনো পণ্য খুঁজে পাওয়া যায়নি'}</h4>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">{products.length === 0 ? 'নতুন পণ্য যোগ করুন।' : 'অন্য নাম বা ফিল্টার দিয়ে চেষ্টা করুন।'}</p>
          {products.length === 0 && (
            <button type="button" onClick={handleOpenAdd} className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-4 h-4" /><span>নতুন পণ্য যোগ করুন</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredProducts.map((p) => {
            const hasDiscount = Boolean(p.discountRate && p.discountRate > 0);
            const discountedPrice = hasDiscount ? Math.round(p.price * (1 - (p.discountRate || 0) / 100)) : p.price;
            const isSelected = selectedIds.has(p.id);
            return (
              <div key={p.id} className={`bg-white rounded-2xl border p-3.5 transition-all shadow-xs flex flex-col justify-between ${isSelected ? 'border-indigo-400 ring-2 ring-indigo-400/20 bg-indigo-50/30' : p.inStock ? 'border-gray-100 hover:border-emerald-200' : 'border-rose-100/80 bg-rose-50/20 opacity-85'}`}>
                <div className="flex items-start space-x-3">
                  {/* Checkbox */}
                  <div className="pt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(p.id)}
                      className="w-4 h-4 rounded border-gray-300 accent-indigo-600 cursor-pointer"
                    />
                  </div>
                  {/* Photo */}
                  <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center relative">
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-gray-300 flex flex-col items-center justify-center p-1 text-[9px] text-center"><ImageIcon className="w-5 h-5 mb-0.5 text-gray-300" /><span>ছবি নেই</span></div>
                    )}
                    {hasDiscount && <span className="absolute top-1 left-1 bg-rose-500 text-white text-[9px] font-extrabold px-1 rounded-sm">-{p.discountRate}%</span>}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-extrabold text-gray-900 text-sm truncate leading-tight">{p.name}</h4>
                    <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-semibold text-[10px]">{p.unit}</span>
                      {p.category && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200/70 font-bold text-[10px] max-w-[140px] truncate">
                          <Tag className="w-2.5 h-2.5 shrink-0" /><span className="truncate">{p.category}</span>
                        </span>
                      )}
                    </div>
                    {p.priceOptions && p.priceOptions.length > 0 ? (
                      <div className="mt-1.5 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-emerald-700 font-extrabold text-sm">
                            ৳{Math.min(...p.priceOptions.map((o) => o.price))} - ৳{Math.max(...p.priceOptions.map((o) => o.price))}
                          </span>
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold">
                            <Layers className="w-2.5 h-2.5" />
                            <span>{p.priceOptions.length}টি সাইজ</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {p.priceOptions.map((opt, idx) => (
                            <span key={idx} className="text-[10px] bg-gray-100 text-gray-700 font-medium px-1.5 py-0.5 rounded">
                              {opt.name}: ৳{opt.price}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1.5 flex items-baseline gap-1.5">
                        <span className="text-emerald-700 font-extrabold text-sm">৳{discountedPrice}</span>
                        {hasDiscount && <span className="text-gray-400 line-through text-[11px]">৳{p.price}</span>}
                      </div>
                    )}
                  </div>
                </div>
                {/* Actions */}
                <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <button type="button" onClick={(e) => handleToggleStock(p, e)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${p.inStock ? 'bg-emerald-600' : 'bg-gray-300'}`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ${p.inStock ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <span className={`text-[11px] font-bold ${p.inStock ? 'text-emerald-700' : 'text-rose-600'}`}>{p.inStock ? 'স্টকে আছে' : 'স্টক শেষ'}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button type="button" onClick={() => handleOpenEdit(p)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer" title="সম্পাদনা"><Edit3 className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => handleDelete(p)} className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer" title="সরিয়ে দিন"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ADD/EDIT MODAL ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100000] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center"><Package className="w-4 h-4" /></div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-gray-900">{editingProduct ? 'পণ্য সম্পাদনা করুন' : 'নতুন পণ্য যোগ করুন'}</h3>
                  <p className="text-[10px] text-gray-500">{editingProduct ? 'তথ্য পরিবর্তন করুন' : 'এই দোকানে নতুন পণ্য যোগ হবে'}</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            {formError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" /><span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-3.5 text-xs">
              {/* Photo */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">পণ্যের ছবি (Photo)</label>
                <div className="flex items-center space-x-3">
                  <div className="w-20 h-20 rounded-2xl bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center relative group">
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl} alt="preview" className="w-full h-full object-cover" />
                    ) : <ImageIcon className="w-8 h-8 text-gray-300" />}
                    {photoUrl && <button type="button" onClick={() => setPhotoUrl('')} className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                  <div>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"><Upload className="w-3.5 h-3.5" /><span>{photoUrl ? 'পরিবর্তন' : 'আপলোড'}</span></button>
                  </div>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">পণ্যের নাম <span className="text-rose-500">*</span></label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: মিনিকেট চাল, নাপা এক্সট্রা" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-xs" />
              </div>

              {/* Unit */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">একক (Unit) <span className="text-rose-500">*</span></label>
                <input type="text" required value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="যেমন: ১ কেজি, ১ পিস" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-xs" />
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1"><Tag className="w-3.5 h-3.5 text-indigo-600" /><span>ক্যাটাগরি</span></label>
                  {category && <button type="button" onClick={() => { setCategory(''); setIsCustomCategory(false); }} className="text-[10px] text-rose-500 hover:underline font-semibold cursor-pointer">ক্লিয়ার</button>}
                </div>
                <div className="relative">
                  <select value={isCustomCategory ? '__CUSTOM__' : category} onChange={(e) => { if (e.target.value === '__CUSTOM__') setIsCustomCategory(true); else { setIsCustomCategory(false); setCategory(e.target.value); } }} className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none text-xs font-semibold bg-white cursor-pointer appearance-none">
                    <option value="">-- ক্যাটাগরি নির্বাচন করুন (ঐচ্ছিক) --</option>
                    {configuredCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    <option value="__CUSTOM__">➕ নতুন ক্যাটাগরি লিখুন...</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {isCustomCategory && (
                  <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="যেমন: মশলাপাতি, অর্গানিক ফল..." autoFocus className="mt-2 w-full px-3 py-2 rounded-xl border border-indigo-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-indigo-50/20" />
                )}
              </div>

              {/* Price + Discount */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    {hasMultiplePrices ? 'শুরুর / ডিফল্ট মূল্য (৳)' : 'বিক্রয়মূল্য (৳)'} {!hasMultiplePrices && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required={!hasMultiplePrices}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={hasMultiplePrices ? 'স্বয়ংক্রিয়ভাবে যুক্ত হবে' : 'যেমন: 75'}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-xs font-bold"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-gray-700">ছাড় (%)</label>
                    {discountRate && parseFloat(toEnglishDigits(discountRate)) > 0 && <button type="button" onClick={() => setDiscountRate('')} className="text-[10px] text-rose-600 font-extrabold hover:underline cursor-pointer">সরান</button>}
                  </div>
                  <input type="number" min="0" max="100" step="any" value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} placeholder="যেমন: 5" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-xs font-bold" />
                </div>
              </div>

              {/* Multiple Sizes & Pricing Section */}
              <div className="p-3 rounded-2xl bg-indigo-50/40 border border-indigo-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <div>
                      <h5 className="font-extrabold text-gray-900 text-xs">একাধিক সাইজ / মূল্য (Multiple Sizes)</h5>
                      <p className="text-[10px] text-gray-500">যেমন: Small, Medium, Large বা হাফ/ফুল প্লেট</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleMultiplePrices}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${hasMultiplePrices ? 'bg-indigo-600' : 'bg-gray-300'}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ${hasMultiplePrices ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>

                {hasMultiplePrices && (
                  <div className="space-y-2 pt-1 border-t border-indigo-100">
                    <div className="grid grid-cols-12 gap-1.5 text-[10px] font-bold text-gray-600 px-1">
                      <span className="col-span-5">সাইজের নাম (Size) *</span>
                      <span className="col-span-4">বিক্রয়মূল্য (৳) *</span>
                      <span className="col-span-2">একক (Unit)</span>
                      <span className="col-span-1"></span>
                    </div>

                    {priceOptions.map((opt, index) => (
                      <div key={index} className="grid grid-cols-12 gap-1.5 items-center bg-white p-1.5 rounded-xl border border-indigo-100 shadow-2xs">
                        <input
                          type="text"
                          required
                          placeholder="যেমন: Small"
                          value={opt.name}
                          onChange={(e) => updatePriceOptionRow(index, 'name', e.target.value)}
                          className="col-span-5 px-2 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-500 text-xs font-semibold outline-none"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          placeholder="মূল্য ৳"
                          value={opt.price}
                          onChange={(e) => updatePriceOptionRow(index, 'price', e.target.value)}
                          className="col-span-4 px-2 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-500 text-xs font-bold text-emerald-700 outline-none"
                        />
                        <input
                          type="text"
                          placeholder={unit || '১ পিস'}
                          value={opt.unit}
                          onChange={(e) => updatePriceOptionRow(index, 'unit', e.target.value)}
                          className="col-span-2 px-1.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-500 text-[11px] outline-none"
                        />
                        <div className="col-span-1 flex justify-center">
                          {priceOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removePriceOptionRow(index)}
                              className="p-1 text-gray-400 hover:text-rose-600 rounded cursor-pointer"
                              title="মুছুন"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={addPriceOptionRow}
                      className="w-full py-1.5 px-3 rounded-xl border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>নতুন সাইজ ও মূল্য যোগ করুন</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Stock toggle */}
              <div className="p-3 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
                <div><h5 className="font-extrabold text-gray-900 text-xs">স্টক স্ট্যাটাস</h5><p className="text-[10px] text-gray-500">স্টক শেষ হলে সুইচ অফ করুন</p></div>
                <button type="button" onClick={() => setInStock(!inStock)} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${inStock ? 'bg-emerald-600' : 'bg-gray-300'}`}>
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ${inStock ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="pt-2 flex items-center space-x-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs cursor-pointer">বাতিল</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60">
                  {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : <><Check className="w-4 h-4" /><span>{editingProduct ? 'আপডেট করুন' : 'পণ্য যোগ করুন'}</span></>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Floating FAB ── */}
      {!hideFloatingFab && (
        <div className="fixed right-4 z-50" style={{ bottom: 'calc(max(8px, env(safe-area-inset-bottom)) + 72px)' }}>
          <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping pointer-events-none" />
          <button type="button" id="store-fab-add-product" onClick={handleOpenAdd} aria-label="নতুন পণ্য যোগ করুন" className="relative w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xl shadow-emerald-600/40 flex items-center justify-center border-4 border-white active:scale-95 transition-transform cursor-pointer">
            <Plus className="w-7 h-7 text-white stroke-[2.5]" />
          </button>
        </div>
      )}
    </div>
  );
};
