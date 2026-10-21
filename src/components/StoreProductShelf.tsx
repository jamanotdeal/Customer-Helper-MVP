'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Shop, StoreProduct, OrderItem } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { ProductVariantSelectorModal } from './ProductVariantSelectorModal';
import {
  Store, Package, Plus, Minus, Check, AlertTriangle,
  Search, Tag, Sparkles, ShoppingBag, ChevronRight, Layers,
} from 'lucide-react';

interface StoreProductShelfProps {
  selectedItems: OrderItem[];
  onAddItem: (item: OrderItem) => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateQty?: (itemId: string, qty: string) => void;
  onOpenCustomItemModal: () => void;
}

export const StoreProductShelf: React.FC<StoreProductShelfProps> = ({
  selectedItems,
  onAddItem,
  onRemoveItem,
  onOpenCustomItemModal,
}) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShopFilter, setSelectedShopFilter] = useState<string>('ALL');
  const [variantModalProduct, setVariantModalProduct] = useState<StoreProduct | null>(null);

  useEffect(() => {
    const sync = () => {
      // Only approved & unblocked shops
      const allShops = Array.from(fallbackStore.shops.values()).filter(
        (s) => !s.isBlocked && s.status !== 'Rejected' && (!s.status || s.status === 'Approved' || s.status === 'APPROVED')
      );
      setShops(allShops);

      const approvedShopIds = new Set(allShops.map((s) => s.id));
      const allProds = Array.from(fallbackStore.storeProducts.values()).filter(
        (p) => !p.storeId || approvedShopIds.has(p.storeId)
      );
      setProducts(allProds);
    };

    sync();
    const unsub = fallbackStore.subscribe(sync);
    fallbackStore.loadStoreProducts();
    return () => unsub();
  }, []);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedShopFilter !== 'ALL' && p.storeId !== selectedShopFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesUnit = p.unit?.toLowerCase().includes(q);
        const matchesCategory = p.category?.toLowerCase().includes(q);
        const matchesStore = p.storeName?.toLowerCase().includes(q);
        return matchesName || matchesUnit || matchesCategory || matchesStore;
      }
      return true;
    });
  }, [products, selectedShopFilter, searchQuery]);

  // Check if an item is already in selectedItems
  const getItemCount = (p: StoreProduct) => {
    if (p.priceOptions && p.priceOptions.length > 0) {
      return selectedItems
        .filter((it) => it.id === p.id || it.id === `prod-${p.id}` || it.id.startsWith(`prod-${p.id}_`))
        .reduce((sum, it) => sum + (parseInt(it.qty || '1', 10) || 1), 0);
    }
    const item = selectedItems.find((it) => it.id === p.id || it.id === `prod-${p.id}`);
    return item ? parseInt(item.qty || '1', 10) || 1 : 0;
  };

  const handleAddProduct = (p: StoreProduct) => {
    if (p.priceOptions && p.priceOptions.length > 0) {
      setVariantModalProduct(p);
      return;
    }
    const shop = fallbackStore.shops.get(p.storeId);
    const hasDiscount = Boolean(p.discountRate && p.discountRate > 0);
    const finalPrice = hasDiscount
      ? Math.round(p.price * (1 - (p.discountRate || 0) / 100))
      : p.price;

    const newItem: OrderItem = {
      id: `prod-${p.id}`,
      name: p.name,
      qty: '1',
      price: finalPrice,
      unit: p.unit,
      storeId: p.storeId,
      storeName: shop?.name || p.storeName || 'Store',
      photoUrl: p.photoUrl,
      discountRate: p.discountRate,
      isCustom: false,
    };
    onAddItem(newItem);
  };

  if (shops.length === 0 && products.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* ── Shelf Header ── */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-soft">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-gray-900 leading-tight">
                দোকানের পণ্যসমূহ (Store Items)
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">
                পছন্দের দোকান থেকে পণ্য নির্বাচন করে সহজে অর্ডার করুন
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full shrink-0">
            {products.length} টি পণ্য
          </span>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="পণ্য বা দোকান খুঁজুন..."
            className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-xs transition-all"
          />
        </div>

        {/* Store Chips / Filter */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => setSelectedShopFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold text-[11px] whitespace-nowrap transition-all cursor-pointer ${
              selectedShopFilter === 'ALL'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            সকল দোকান ({shops.length})
          </button>
          {shops.map((s) => {
            const isOpen = s.isOpen !== false;
            const isSelected = selectedShopFilter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedShopFilter(s.id)}
                className={`px-3 py-1.5 rounded-xl font-bold text-[11px] whitespace-nowrap flex items-center space-x-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span>{s.name}</span>
                {!isOpen && (
                  <span className="text-[9px] opacity-80">(বন্ধ)</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Product Grid ── */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 text-center shadow-soft space-y-3">
          <p className="text-xs text-gray-500 font-medium">
            কাঙ্ক্ষিত পণ্যটি তালিকায় খুঁজে পাচ্ছেন না?
          </p>
          <button
            type="button"
            onClick={onOpenCustomItemModal}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 inline-flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>কাস্টম আইটেম যোগ করুন (Add Custom Item)</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {filteredProducts.map((p) => {
            const shop = fallbackStore.shops.get(p.storeId);
            const isStoreOpen = shop ? shop.isOpen !== false : true;
            const hasDiscount = Boolean(p.discountRate && p.discountRate > 0);
            const discountedPrice = hasDiscount
              ? Math.round(p.price * (1 - (p.discountRate || 0) / 100))
              : p.price;
            const isAdded = getItemCount(p) > 0;
            const hasVariants = Boolean(p.priceOptions && p.priceOptions.length > 0);

            return (
              <div
                key={p.id}
                className={`bg-white rounded-2xl border p-3 flex flex-col justify-between transition-all shadow-xs relative ${
                  isAdded
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'border-gray-100 hover:border-emerald-200'
                }`}
              >
                {/* Top: Photo & Badges */}
                <div
                  className="relative w-full aspect-square rounded-xl bg-gray-50 overflow-hidden mb-2 flex items-center justify-center cursor-pointer"
                  onClick={() => {
                    if (p.inStock) {
                      if (hasVariants) setVariantModalProduct(p);
                      else handleAddProduct(p);
                    }
                  }}
                >
                  {p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.photoUrl}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-8 h-8 text-gray-300" />
                  )}

                  {/* Store Closed Badge Overlay */}
                  {!isStoreOpen && (
                    <span className="absolute top-1 left-1 bg-rose-600/90 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-xs backdrop-blur-2xs">
                      দোকান বন্ধ
                    </span>
                  )}

                  {/* Discount Badge */}
                  {hasDiscount && isStoreOpen && (
                    <span className="absolute top-1 left-1 bg-rose-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-xs">
                      -{p.discountRate}%
                    </span>
                  )}

                  {/* Stock Out Overlay */}
                  {!p.inStock && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center">
                      <span className="text-[10px] font-extrabold text-white bg-rose-600 px-2 py-0.5 rounded-md shadow-xs">
                        স্টক শেষ
                      </span>
                    </div>
                  )}
                </div>

                {/* Middle: Name & Unit */}
                <div className="space-y-0.5 mb-2">
                  <h4 className="font-extrabold text-gray-900 text-xs truncate leading-snug">
                    {p.name}
                  </h4>
                  <div className="text-[10px] text-gray-500 truncate flex items-center justify-between">
                    <span>{p.unit}</span>
                    {shop && (
                      <span className="text-[9px] text-gray-400 truncate max-w-[70px]">
                        {shop.name}
                      </span>
                    )}
                  </div>
                  {hasVariants ? (
                    <div className="space-y-0.5 pt-0.5">
                      <div className="flex items-baseline gap-1">
                        <span className="font-extrabold text-emerald-700 text-xs">
                          ৳{Math.min(...p.priceOptions!.map((o) => o.price))} - ৳{Math.max(...p.priceOptions!.map((o) => o.price))}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/80">
                        <Layers className="w-2.5 h-2.5" />
                        <span>{p.priceOptions!.length}টি সাইজ</span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1 pt-0.5">
                      <span className="font-extrabold text-emerald-700 text-xs">
                        ৳{discountedPrice}
                      </span>
                      {hasDiscount && (
                        <span className="text-[10px] text-gray-400 line-through">
                          ৳{p.price}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Action Button */}
                {!p.inStock ? (
                  <button
                    disabled
                    className="w-full py-1.5 rounded-xl bg-gray-100 text-gray-400 font-bold text-[10px] cursor-not-allowed"
                  >
                    অনুপলব্ধ (Out of Stock)
                  </button>
                ) : hasVariants ? (
                  !isAdded ? (
                    <button
                      type="button"
                      onClick={() => setVariantModalProduct(p)}
                      className="w-full py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-[11px] shadow-xs transition-all flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  ) : (
                    <div className="w-full flex items-center justify-between bg-emerald-600 text-white rounded-xl p-0.5 shadow-xs">
                      <button
                        type="button"
                        onClick={() => setVariantModalProduct(p)}
                        className="w-7 h-7 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3.5 h-3.5 stroke-[3]" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setVariantModalProduct(p)}
                        className="font-black text-xs px-2 text-white text-center select-none flex-1 py-0.5 cursor-pointer hover:bg-emerald-700/50 rounded transition-colors"
                      >
                        {getItemCount(p)}
                      </button>

                      <button
                        type="button"
                        onClick={() => setVariantModalProduct(p)}
                        className="w-7 h-7 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      </button>
                    </div>
                  )
                ) : isAdded ? (
                  <button
                    type="button"
                    onClick={() => onRemoveItem(`prod-${p.id}`)}
                    className="w-full py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-[11px] flex items-center justify-center space-x-1 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-all cursor-pointer group"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600 group-hover:hidden" />
                    <span className="group-hover:hidden">যোগ করা হয়েছে</span>
                    <span className="hidden group-hover:inline">বাদ দিন (Remove)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAddProduct(p)}
                    className="w-full py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-[11px] shadow-xs transition-all flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── PRODUCT VARIANT SELECTOR MODAL ── */}
      <ProductVariantSelectorModal
        isOpen={Boolean(variantModalProduct)}
        onClose={() => setVariantModalProduct(null)}
        product={variantModalProduct}
        shop={variantModalProduct?.storeId ? fallbackStore.shops.get(variantModalProduct.storeId) : undefined}
        customItems={selectedItems}
        onCustomAdd={onAddItem}
        onCustomRemove={onRemoveItem}
        onCustomUpdateQty={(itemId, delta) => {
          const it = selectedItems.find((i) => i.id === itemId);
          if (it) {
            const currentQty = parseInt(it.qty || '1', 10) || 1;
            const newQty = currentQty + delta;
            if (newQty <= 0) {
              onRemoveItem(itemId);
            } else if (onUpdateQty) {
              onUpdateQty(itemId, String(newQty));
            } else {
              onRemoveItem(itemId);
              onAddItem({ ...it, qty: String(newQty), quantity: newQty });
            }
          }
        }}
      />
    </div>
  );
};
