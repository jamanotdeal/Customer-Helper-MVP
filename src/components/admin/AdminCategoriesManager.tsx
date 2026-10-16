'use client';

import React, { useState, useMemo } from 'react';
import { ProductCategoryConfig } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { getProductCategories, parseStoreTypes } from '@/lib/pricing';
import { useModal } from '../CustomModal';
import {
  Tag, Plus, Edit, Trash2, Search, Filter, Store,
  Check, X, AlertCircle, Layers, CheckSquare, Square
} from 'lucide-react';

interface AdminCategoriesManagerProps {
  onCategoryCountChange?: () => void;
}

export const AdminCategoriesManager: React.FC<AdminCategoriesManagerProps> = ({ onCategoryCountChange }) => {
  const { showAlert, showConfirm } = useModal();

  const [categories, setCategories] = useState<ProductCategoryConfig[]>(() =>
    getProductCategories(fallbackStore.pricingSettings)
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [storeTypeFilter, setStoreTypeFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategoryConfig | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [selectedStoreTypes, setSelectedStoreTypes] = useState<string[]>(['ALL']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Store types configured in pricing settings
  const availableStoreTypes = useMemo(() => {
    return parseStoreTypes(fallbackStore.pricingSettings.storeTypes);
  }, []);

  // Products from fallbackStore to show usage count
  const allProducts = Array.from(fallbackStore.storeProducts.values());

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

  // Open modal for add
  const handleOpenAdd = () => {
    setEditingCategory(null);
    setCategoryName('');
    setSelectedStoreTypes(['ALL']);
    setFormError('');
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEdit = (cat: ProductCategoryConfig) => {
    setEditingCategory(cat);
    setCategoryName(cat.name);
    setSelectedStoreTypes(cat.storeTypes && cat.storeTypes.length > 0 ? cat.storeTypes : ['ALL']);
    setFormError('');
    setIsModalOpen(true);
  };

  // Toggle store type selection
  const handleToggleStoreType = (type: string) => {
    if (type === 'ALL') {
      if (selectedStoreTypes.includes('ALL')) {
        setSelectedStoreTypes([]);
      } else {
        setSelectedStoreTypes(['ALL']);
      }
      return;
    }

    let next = selectedStoreTypes.filter((t) => t !== 'ALL');
    if (next.includes(type)) {
      next = next.filter((t) => t !== type);
    } else {
      next.push(type);
    }

    if (next.length === 0) {
      next = ['ALL'];
    }
    setSelectedStoreTypes(next);
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
                storeTypes: selectedStoreTypes.length > 0 ? selectedStoreTypes : ['ALL'],
                updatedAt: now,
              }
            : c
        );
      } else {
        const newCat: ProductCategoryConfig = {
          id: `cat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: trimmed,
          storeTypes: selectedStoreTypes.length > 0 ? selectedStoreTypes : ['ALL'],
          createdAt: now,
          updatedAt: now,
        };
        updatedList = [newCat, ...categories];
      }

      setCategories(updatedList);
      await fallbackStore.savePricingSettings({
        ...fallbackStore.pricingSettings,
        productCategories: updatedList,
      });

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

  // Delete category
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
        await fallbackStore.savePricingSettings({
          ...fallbackStore.pricingSettings,
          productCategories: updatedList,
        });
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

          <button
            type="button"
            onClick={handleOpenAdd}
            className="py-2.5 px-4 rounded-xl bg-purple-900 hover:bg-purple-800 text-white font-extrabold text-xs shadow-md shadow-purple-900/20 inline-flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>নতুন ক্যাটাগরি যোগ করুন</span>
          </button>
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
                  <th className="py-3 px-3.5 w-12 text-center">#</th>
                  <th className="py-3 px-3.5">ক্যাটাগরির নাম</th>
                  <th className="py-3 px-3.5">অনুমোদিত স্টোর টাইপ (Store Types)</th>
                  <th className="py-3 px-3.5 text-center">মোট পণ্য</th>
                  <th className="py-3 px-3.5 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredCategories.map((cat, idx) => {
                  const usageCount = productCountPerCategory[cat.name] || 0;
                  const isAll = cat.storeTypes.includes('ALL') || cat.storeTypes.includes('all');

                  return (
                    <tr key={cat.id} className="hover:bg-purple-50/20 transition-colors">
                      <td className="py-3 px-3.5 text-center text-[11px] font-bold text-gray-400">
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
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="যেমন: চাল ও ডাল, ওষুধ ও ফার্স্ট এইড, পানীয়..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none text-xs font-semibold"
                  autoFocus
                />
              </div>

              {/* Store Types Assignment */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-purple-700" />
                    <span>কোন স্টোর টাইপে দেখাবে (Assign to Store Types):</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedStoreTypes.includes('ALL')) {
                        setSelectedStoreTypes([]);
                      } else {
                        setSelectedStoreTypes(['ALL']);
                      }
                    }}
                    className="text-[10px] font-extrabold text-purple-700 hover:underline cursor-pointer"
                  >
                    {selectedStoreTypes.includes('ALL') ? 'নির্দিষ্ট দোকান বেছে নিন' : 'সকল দোকানে দেখান'}
                  </button>
                </div>

                {/* All types shortcut toggle */}
                <div
                  onClick={() => handleToggleStoreType('ALL')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedStoreTypes.includes('ALL')
                      ? 'bg-purple-50/70 border-purple-300 text-purple-900'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {selectedStoreTypes.includes('ALL') ? (
                      <CheckSquare className="w-4 h-4 text-purple-700" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="font-extrabold text-xs">🌐 সকল ধরনের দোকানে সক্রিয় (All Store Types)</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">যেকোনো দোকান দেখতে পাবে</span>
                </div>

                {/* Store Type Checkboxes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-56 overflow-y-auto pr-1">
                  {availableStoreTypes.map((type) => {
                    const isChecked = selectedStoreTypes.includes('ALL') || selectedStoreTypes.includes(type);
                    return (
                      <div
                        key={type}
                        onClick={() => handleToggleStoreType(type)}
                        className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
                          isChecked
                            ? 'bg-purple-50/50 border-purple-200 text-purple-900 shadow-2xs'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-purple-700 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400 shrink-0" />
                        )}
                        <span className="truncate">{type}</span>
                      </div>
                    );
                  })}
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
