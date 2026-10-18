'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ProductCategoryConfig, PricingSettings } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { getProductCategories, parseStoreTypes, DEFAULT_PRODUCT_CATEGORIES } from '@/lib/pricing';
import { useModal } from '../CustomModal';
import {
  Tag, Plus, Edit, Trash2, Search, Filter, Store,
  Check, X, AlertCircle, Layers, CheckSquare, Square, ChevronDown
} from 'lucide-react';

interface AdminCategoriesManagerProps {
  onCategoryCountChange?: () => void;
  adminCategories?: string[];
  pricingSettings?: PricingSettings;
  onPricingChange?: (newSettings: PricingSettings) => void;
}

export const AdminCategoriesManager: React.FC<AdminCategoriesManagerProps> = ({
  onCategoryCountChange,
  adminCategories,
  pricingSettings,
  onPricingChange,
}) => {
  const { showAlert, showConfirm } = useModal();

  const [categories, setCategories] = useState<ProductCategoryConfig[]>(() =>
    getProductCategories(pricingSettings || fallbackStore.pricingSettings)
  );

  // Sync categories if pricingSettings changes
  useEffect(() => {
    const cats = getProductCategories(pricingSettings || fallbackStore.pricingSettings);
    setCategories(cats);
  }, [pricingSettings]);

  const [searchQuery, setSearchQuery] = useState('');
  const [storeTypeFilter, setStoreTypeFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategoryConfig | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [selectedStoreTypes, setSelectedStoreTypes] = useState<string[]>(['ALL']);
  const [isStoreTypeDropdownOpen, setIsStoreTypeDropdownOpen] = useState(false);
  const storeTypeDropdownRef = useRef<HTMLDivElement>(null);
  const [storeTypeSearch, setStoreTypeSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Close store type dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        storeTypeDropdownRef.current &&
        !storeTypeDropdownRef.current.contains(e.target as Node)
      ) {
        setIsStoreTypeDropdownOpen(false);
      }
    };
    if (isStoreTypeDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isStoreTypeDropdownOpen]);

  // Store categories dynamically coming from admin updated categories & settings
  const availableStoreTypes = useMemo(() => {
    const list: string[] = [];
    if (adminCategories && adminCategories.length > 0) {
      list.push(...adminCategories);
    }
    const currentTypes = pricingSettings?.storeTypes || fallbackStore.pricingSettings.storeTypes;
    list.push(...parseStoreTypes(currentTypes));

    // Also include any types from shops
    Array.from(fallbackStore.shops.values()).forEach((s) => {
      if (s.type && s.type.trim()) list.push(s.type.trim());
      if (s.category && s.category.trim()) list.push(s.category.trim());
    });

    const set = new Set<string>();
    list.forEach((t) => {
      const trimmed = t.trim();
      if (trimmed && trimmed.toUpperCase() !== 'ALL') set.add(trimmed);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [adminCategories, pricingSettings]);

  // Products from fallbackStore to show usage count
  const allProducts = Array.from(fallbackStore.storeProducts.values());

  // Suggested category names for quick auto-complete
  const suggestedCategoryNames = useMemo(() => {
    const set = new Set<string>();
    DEFAULT_PRODUCT_CATEGORIES.forEach((c) => set.add(c.name));
    allProducts.forEach((p) => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    categories.forEach((c) => {
      if (c.name && c.name.trim()) set.add(c.name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allProducts, categories]);

  // Count products per category
  const productCountPerCategory = useMemo(() => {
    const map: Record<string, number> = {};
    allProducts.forEach((p) => {
      const cat = p.category?.trim();
      if (cat) {
        map[cat] = (map[cat] || 0) + 1;
      }
    });
    return map;
  }, [allProducts]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      // Store type filter
      if (storeTypeFilter !== 'ALL') {
        const hasAll = c.storeTypes.includes('ALL') || c.storeTypes.includes('all');
        const hasType = c.storeTypes.includes(storeTypeFilter);
        if (!hasAll && !hasType) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesType = c.storeTypes.some((t) => t.toLowerCase().includes(q));
        return matchesName || matchesType;
      }
      return true;
    });
  }, [categories, storeTypeFilter, searchQuery]);

  // Display label for the store type dropdown trigger button
  const storeTypeDisplayLabel = useMemo(() => {
    if (
      selectedStoreTypes.length === 0 ||
      selectedStoreTypes.includes('ALL') ||
      selectedStoreTypes.includes('all')
    ) {
      return '🌐 সকল ধরনের দোকান (All Store Types)';
    }
    if (selectedStoreTypes.length === 1) {
      return selectedStoreTypes[0];
    }
    return `${selectedStoreTypes.length} টি স্টোর টাইপ (${selectedStoreTypes.join(', ')})`;
  }, [selectedStoreTypes]);

  // Open modal for add
  const handleOpenAdd = () => {
    setEditingCategory(null);
    setCategoryName('');
    setSelectedStoreTypes(['ALL']);
    setStoreTypeSearch('');
    setIsStoreTypeDropdownOpen(false);
    setFormError('');
    setIsModalOpen(true);
  };

  // Open modal for edit: pre-select saved store type(s) by default
  const handleOpenEdit = (cat: ProductCategoryConfig) => {
    setEditingCategory(cat);
    setCategoryName(cat.name);
    // Already select the store type(s) saved on this category by default
    const existing =
      cat.storeTypes && cat.storeTypes.length > 0
        ? [...cat.storeTypes]
        : ['ALL'];
    setSelectedStoreTypes(existing);
    setStoreTypeSearch('');
    setIsStoreTypeDropdownOpen(false);
    setFormError('');
    setIsModalOpen(true);
  };

  // Toggle individual store category in dropdown
  const handleToggleStoreType = (type: string) => {
    if (type === 'ALL') {
      setSelectedStoreTypes(['ALL']);
      return;
    }

    setSelectedStoreTypes((prev) => {
      const clean = prev.filter((t) => t !== 'ALL' && t !== 'all');
      if (clean.includes(type)) {
        const next = clean.filter((t) => t !== type);
        return next.length === 0 ? ['ALL'] : next;
      } else {
        return [...clean, type];
      }
    });
  };

  // Save category (add or edit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = categoryName.trim();
    if (!trimmed) {
      setFormError('ক্যাটাগরির নাম অবশ্যই লিখতে হবে।');
      return;
    }

    // Check duplicate
    const duplicate = categories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase() && c.id !== editingCategory?.id
    );
    if (duplicate) {
      setFormError(`"${trimmed}" নামের একটি ক্যাটাগরি ইতিমধ্যে রয়েছে।`);
      return;
    }

    // Determine final store types
    let finalStoreTypes: string[];
    if (
      selectedStoreTypes.length === 0 ||
      selectedStoreTypes.includes('ALL') ||
      selectedStoreTypes.includes('all')
    ) {
      finalStoreTypes = ['ALL'];
    } else {
      const selected = selectedStoreTypes.filter((t) => t !== 'ALL' && t !== 'all');
      finalStoreTypes =
        availableStoreTypes.length > 0 && selected.length === availableStoreTypes.length
          ? ['ALL']
          : selected;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const now = new Date().toISOString();
      let updatedList: ProductCategoryConfig[];

      if (editingCategory) {
        updatedList = categories.map((c) =>
          c.id === editingCategory.id
            ? {
                ...c,
                name: trimmed,
                storeTypes: finalStoreTypes,
                updatedAt: now,
              }
            : c
        );
      } else {
        const newCat: ProductCategoryConfig = {
          id: `cat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: trimmed,
          storeTypes: finalStoreTypes,
          createdAt: now,
          updatedAt: now,
        };
        updatedList = [newCat, ...categories];
      }

      setCategories(updatedList);
      const newPricing: PricingSettings = {
        ...fallbackStore.pricingSettings,
        ...(pricingSettings || {}),
        productCategories: updatedList,
      };
      await fallbackStore.savePricingSettings(newPricing);
      onPricingChange?.(newPricing);

      setIsModalOpen(false);
      showAlert(
        'সফল হয়েছে!',
        editingCategory ? 'ক্যাটাগরি আপডেট করা হয়েছে।' : 'নতুন ক্যাটাগরি তৈরি করা হয়েছে।',
        'success'
      );
      onCategoryCountChange?.();
    } catch (err) {
      console.error('Failed to save category:', err);
      setFormError('ক্যাটাগরি সংরক্ষণ করতে সমস্যা হয়েছে।');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Table row multiple selection state
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  // Toggle single category row selection
  const handleToggleSelectRow = (id: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Toggle select all filtered rows
  const isAllFilteredSelected =
    filteredCategories.length > 0 &&
    filteredCategories.every((c) => selectedCategoryIds.includes(c.id));

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const filteredIds = new Set(filteredCategories.map((c) => c.id));
      setSelectedCategoryIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const merged = new Set([...selectedCategoryIds, ...filteredCategories.map((c) => c.id)]);
      setSelectedCategoryIds(Array.from(merged));
    }
  };

  // Delete multiple categories at once
  const handleDeleteMultiple = async () => {
    if (selectedCategoryIds.length === 0) return;

    const selectedCats = categories.filter((c) => selectedCategoryIds.includes(c.id));
    const totalUsage = selectedCats.reduce(
      (sum, c) => sum + (productCountPerCategory[c.name] || 0),
      0
    );

    const message =
      totalUsage > 0
        ? `আপনি কি নির্বাচিত ${selectedCategoryIds.length} টি ক্যাটাগরি মুছে ফেলতে চান?\n\nসতর্কতা: এর মধ্যে মোট ${totalUsage} টি পণ্যে এই ক্যাটাগরিগুলো ব্যবহার হচ্ছে। ক্যাটাগরি মুছে ফেললে সংশ্লিষ্ট পণ্যগুলোর ক্যাটাগরি থাকবে না।`
        : `আপনি কি নির্বাচিত ${selectedCategoryIds.length} টি ক্যাটাগরি মুছে ফেলতে নিশ্চিত?`;

    const confirmed = await showConfirm(
      'একাধিক ক্যাটাগরি মুছে ফেলবেন?',
      message,
      `হ্যাঁ, ${selectedCategoryIds.length} টি মুছুন`,
      'বাতিল'
    );

    if (confirmed) {
      try {
        const updatedList = categories.filter((c) => !selectedCategoryIds.includes(c.id));
        setCategories(updatedList);
        setSelectedCategoryIds([]);
        const newPricing: PricingSettings = {
          ...fallbackStore.pricingSettings,
          ...(pricingSettings || {}),
          productCategories: updatedList,
        };
        await fallbackStore.savePricingSettings(newPricing);
        onPricingChange?.(newPricing);
        showAlert(
          'মুছে ফেলা হয়েছে!',
          `নির্বাচিত ${selectedCats.length} টি ক্যাটাগরি সফলভাবে মুছে ফেলা হয়েছে।`,
          'success'
        );
        onCategoryCountChange?.();
      } catch (err) {
        console.error('Failed to delete multiple categories:', err);
        showAlert('সমস্যা হয়েছে', 'ক্যাটাগরিগুলো মুছতে সমস্যা হয়েছে।', 'error');
      }
    }
  };

  // Delete single category
  const handleDelete = async (cat: ProductCategoryConfig) => {
    const usageCount = productCountPerCategory[cat.name] || 0;
    const confirmed = await showConfirm(
      'ক্যাটাগরি মুছে ফেলতে চান?',
      usageCount > 0
        ? `"${cat.name}" ক্যাটাগরিটি ${usageCount} টি পণ্যে ব্যবহার হচ্ছে। মুছে ফেললে পণ্যগুলোতে ক্যাটাগরি থাকবে না। আপনি কি নিশ্চিত?`
        : `"${cat.name}" ক্যাটাগরিটি মুছে ফেলা হবে। আপনি কি নিশ্চিত?`,
      'হ্যাঁ, মুছুন',
      'বাতিল'
    );

    if (confirmed) {
      try {
        const updatedList = categories.filter((c) => c.id !== cat.id);
        setCategories(updatedList);
        setSelectedCategoryIds((prev) => prev.filter((id) => id !== cat.id));
        const newPricing: PricingSettings = {
          ...fallbackStore.pricingSettings,
          ...(pricingSettings || {}),
          productCategories: updatedList,
        };
        await fallbackStore.savePricingSettings(newPricing);
        onPricingChange?.(newPricing);
        showAlert('মুছে ফেলা হয়েছে', `"${cat.name}" ক্যাটাগরিটি সফলভাবে মুছে ফেলা হয়েছে।`, 'info');
        onCategoryCountChange?.();
      } catch (err) {
        console.error('Failed to delete category:', err);
        showAlert('সমস্যা হয়েছে', 'ক্যাটাগরি মুছতে ব্যর্থ হয়েছে।', 'error');
      }
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* ── Header & Action ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                <span>পণ্য ক্যাটাগরি নিয়ন্ত্রণ (Item Categories Control)</span>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black">
                  {categories.length} টি ক্যাটাগরি
                </span>
              </h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                ক্যাটাগরি তৈরি, আপডেট ও মুছুন এবং নির্দিষ্ট স্টোর টাইপ (দোকানের ধরন)-এ অ্যাসাইন করুন
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {selectedCategoryIds.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteMultiple}
                className="py-2.5 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/20 inline-flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95 animate-in fade-in"
              >
                <Trash2 className="w-4 h-4" />
                <span>মুছুন ({selectedCategoryIds.length} টি)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenAdd}
              className="py-2.5 px-4 rounded-xl bg-purple-900 hover:bg-purple-800 text-white font-extrabold text-xs shadow-md shadow-purple-900/20 inline-flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>নতুন ক্যাটাগরি যোগ করুন</span>
            </button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ক্যাটাগরি খুঁজুন..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-purple-600 outline-none transition-all font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Store Type Filter */}
          <div className="flex items-center space-x-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
            <Store className="w-3.5 h-3.5 text-purple-700 shrink-0" />
            <span className="text-gray-500 text-[11px] font-bold">স্টোর টাইপ:</span>
            <select
              value={storeTypeFilter}
              onChange={(e) => setStoreTypeFilter(e.target.value)}
              className="bg-transparent text-gray-900 font-extrabold text-xs outline-none cursor-pointer max-w-[170px] truncate"
            >
              <option value="ALL">সকল স্টোর টাইপ ({categories.length})</option>
              {availableStoreTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {(searchQuery || storeTypeFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStoreTypeFilter('ALL');
              }}
              className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-650 text-xs font-bold transition-all cursor-pointer"
            >
              ফিল্টার মুছুন
            </button>
          )}
        </div>
      </div>

      {/* ── Categories Table / Cards ────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
        {/* Bulk Action Header Bar */}
        {selectedCategoryIds.length > 0 && (
          <div className="bg-purple-900 text-white px-5 py-3 flex items-center justify-between flex-wrap gap-2.5 animate-in fade-in duration-150 border-b border-purple-800">
            <div className="flex items-center space-x-2.5">
              <span className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center text-xs font-black">
                {selectedCategoryIds.length}
              </span>
              <span className="text-xs font-bold">
                টি ক্যাটাগরি নির্বাচিত হয়েছে (মোট {categories.length} টির মধ্যে)
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setSelectedCategoryIds([])}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-purple-100 text-xs font-bold transition-all cursor-pointer"
              >
                নির্বাচন বাতিল
              </button>
              <button
                type="button"
                onClick={handleDeleteMultiple}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-sm inline-flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>নির্বাচিত ক্যাটাগরি মুছুন ({selectedCategoryIds.length})</span>
              </button>
            </div>
          </div>
        )}

        {filteredCategories.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Tag className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="text-xs font-bold text-gray-600">কোনো ক্যাটাগরি পাওয়া যায়নি</p>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="text-xs font-extrabold text-purple-700 hover:underline cursor-pointer"
            >
              + নতুন ক্যাটাগরি তৈরি করুন
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600 min-w-[650px]">
              <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100 select-none">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="p-1 rounded-md hover:bg-gray-200 text-gray-500 hover:text-purple-700 transition-colors cursor-pointer inline-flex items-center justify-center"
                      title={isAllFilteredSelected ? "সব নির্বাচন বাতিল করুন" : "সবগুলো নির্বাচন করুন"}
                      aria-label="Select All"
                    >
                      {isAllFilteredSelected ? (
                        <CheckSquare className="w-4 h-4 text-purple-700" />
                      ) : selectedCategoryIds.length > 0 ? (
                        <div className="w-3.5 h-3.5 rounded bg-purple-700 text-white flex items-center justify-center text-[10px] font-black leading-none">
                          -
                        </div>
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-2 w-10 text-center">#</th>
                  <th className="py-3 px-3.5">ক্যাটাগরির নাম</th>
                  <th className="py-3 px-3.5">অনুমোদিত স্টোর টাইপ (Store Types)</th>
                  <th className="py-3 px-3.5 text-center">মোট পণ্য</th>
                  <th className="py-3 px-3.5 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredCategories.map((cat, idx) => {
                  const isSelected = selectedCategoryIds.includes(cat.id);
                  const usageCount = productCountPerCategory[cat.name] || 0;
                  const isAll = cat.storeTypes.includes('ALL') || cat.storeTypes.includes('all');

                  return (
                    <tr
                      key={cat.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-purple-50/70 hover:bg-purple-100/50'
                          : 'hover:bg-purple-50/20'
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectRow(cat.id)}
                          className="p-1 rounded-md hover:bg-purple-100 transition-colors cursor-pointer inline-flex items-center justify-center"
                          aria-label={`Select ${cat.name}`}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-purple-700" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-300 hover:text-gray-400" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-2 text-center text-[11px] font-bold text-gray-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3.5 font-extrabold text-gray-900 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span>{cat.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap max-w-md">
                          {isAll ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold">
                              🌐 সকল ধরনের দোকান (All Types)
                            </span>
                          ) : (
                            cat.storeTypes.map((st) => (
                              <span
                                key={st}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200/80 text-[10px] font-bold"
                              >
                                {st}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          usageCount > 0
                            ? 'bg-indigo-100 text-indigo-900'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {usageCount} টি পণ্য
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(cat)}
                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer"
                            title="সম্পাদনা করুন"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(cat)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm sm:text-base">
                    {editingCategory ? 'ক্যাটাগরি সম্পাদনা করুন' : 'নতুন ক্যাটাগরি তৈরি করুন'}
                  </h4>
                  <p className="text-[11px] text-purple-200">
                    নাম দিন এবং কোন ধরনের দোকান এই ক্যাটাগরি ব্যবহার করতে পারবে তা নির্বাচন করুন
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Category Name */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  ক্যাটাগরির নাম <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  list="category-name-suggestions"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="যেমন: চাল ও ডাল, ওষুধ ও ফার্স্ট এইড, পানীয়..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none text-xs font-semibold"
                  autoFocus
                />
                <datalist id="category-name-suggestions">
                  {suggestedCategoryNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              {/* Store Type Dropdown Component */}
              <div className="space-y-1.5" ref={storeTypeDropdownRef}>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-purple-700" />
                    <span>দোকানের ধরন (Store Type) <span className="text-rose-500">*</span></span>
                  </label>
                  {!selectedStoreTypes.includes('ALL') && selectedStoreTypes.length > 0 && (
                    <span className="text-[10px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-full">
                      {selectedStoreTypes.length} টি নির্বাচিত
                    </span>
                  )}
                </div>

                {/* Dropdown Trigger Button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsStoreTypeDropdownOpen((prev) => !prev)}
                    className={`w-full px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer bg-white ${
                      isStoreTypeDropdownOpen
                        ? 'border-purple-600 ring-2 ring-purple-100 shadow-sm'
                        : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate pr-2">
                      <Store className="w-4 h-4 text-purple-600 shrink-0" />
                      <span className="truncate text-gray-900 font-bold">
                        {storeTypeDisplayLabel}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${
                        isStoreTypeDropdownOpen ? 'rotate-180 text-purple-700' : ''
                      }`}
                    />
                  </button>

                  {/* Dropdown Menu Panel (In-flow layout so it never gets cropped by modal boundaries) */}
                  {isStoreTypeDropdownOpen && (
                    <div className="mt-2 bg-purple-50/50 rounded-2xl border border-purple-200/90 shadow-sm p-3 space-y-2.5 animate-in fade-in duration-150 flex flex-col">
                      {/* Search box inside dropdown */}
                      {availableStoreTypes.length > 4 && (
                        <div className="relative shrink-0">
                          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={storeTypeSearch}
                            onChange={(e) => setStoreTypeSearch(e.target.value)}
                            placeholder="স্টোর টাইপ খুঁজুন..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white border border-gray-200 focus:border-purple-600 outline-none font-medium"
                            autoFocus
                          />
                        </div>
                      )}

                      {/* Options List */}
                      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                        {/* Option: All Store Types */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStoreTypes(['ALL']);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-left text-xs font-extrabold flex items-center justify-between transition-colors cursor-pointer ${
                            selectedStoreTypes.includes('ALL')
                              ? 'bg-purple-100 text-purple-950 font-black border border-purple-300/80 shadow-2xs'
                              : 'hover:bg-white text-gray-800 bg-white/80 border border-gray-200/60'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            {selectedStoreTypes.includes('ALL') ? (
                              <CheckSquare className="w-4 h-4 text-purple-700 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400 shrink-0" />
                            )}
                            <span>🌐 সকল ধরনের দোকান (All Store Types)</span>
                          </div>
                          {selectedStoreTypes.includes('ALL') && (
                            <span className="text-[10px] text-purple-700 font-bold bg-white px-1.5 py-0.5 rounded-md border border-purple-200">
                              নির্বাচিত
                            </span>
                          )}
                        </button>

                        <div className="border-t border-purple-100 my-1" />

                        {/* Individual Store Types */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {availableStoreTypes
                            .filter((t) =>
                              !storeTypeSearch.trim() ||
                              t.toLowerCase().includes(storeTypeSearch.toLowerCase().trim())
                            )
                            .map((type) => {
                              const isChecked =
                                !selectedStoreTypes.includes('ALL') &&
                                selectedStoreTypes.includes(type);
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => handleToggleStoreType(type)}
                                  className={`px-2.5 py-2 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                                    isChecked
                                      ? 'bg-purple-100/90 text-purple-950 font-bold border border-purple-300 shadow-2xs'
                                      : 'bg-white hover:bg-purple-50/60 text-gray-700 border border-gray-200/80'
                                  }`}
                                >
                                  <div className="flex items-center space-x-2 truncate pr-1">
                                    {isChecked ? (
                                      <CheckSquare className="w-4 h-4 text-purple-700 shrink-0" />
                                    ) : (
                                      <Square className="w-4 h-4 text-gray-300 shrink-0" />
                                    )}
                                    <span className="truncate">{type}</span>
                                  </div>
                                  {isChecked && <Check className="w-3.5 h-3.5 text-purple-700 shrink-0 ml-1" />}
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      {/* Dropdown Footer Actions */}
                      <div className="pt-2 border-t border-purple-100 flex items-center justify-between shrink-0 gap-2">
                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedStoreTypes([...availableStoreTypes])}
                            className="text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-white px-2 py-1 rounded-lg border border-purple-200 transition-colors cursor-pointer"
                          >
                            সব নির্বাচন
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedStoreTypes(['ALL'])}
                            className="text-[10px] font-bold text-gray-600 hover:text-gray-900 bg-white px-2 py-1 rounded-lg border border-gray-200 transition-colors cursor-pointer"
                          >
                            রিসেট (সকল)
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsStoreTypeDropdownOpen(false)}
                          className="px-3 py-1 rounded-lg bg-purple-900 text-white text-[11px] font-bold hover:bg-purple-800 transition-colors cursor-pointer shadow-xs"
                        >
                          সম্পন্ন
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-gray-100 flex items-center space-x-2">
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
                  className="flex-1 py-2.5 rounded-xl bg-purple-900 hover:bg-purple-800 text-white font-extrabold text-xs shadow-md shadow-purple-900/20 transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <span>সংরক্ষণ হচ্ছে...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{editingCategory ? 'আপডেট করুন' : 'তৈরি করুন'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
