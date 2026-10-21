'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Shop, StoreProduct, OrderItem, Order, LocationData } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useAuth, isUserAuthenticated } from '@/context/AuthContext';
import { useModal } from './CustomModal';
import { isShopOpenNow } from './StoreGrid';
import { AddCustomItemModal } from './AddCustomItemModal';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { hapticFeedback } from '@/lib/native';
import { calculateEstimatedFee, calculateDistanceKm } from '@/lib/pricing';
import { useCart } from '@/context/CartContext';
import { CartSummaryDrawer } from './CartSummaryDrawer';
import {
  ArrowLeft,
  Store,
  Plus,
  Minus,
  ShoppingBag,
  Search,
  X,
  Trash2,
  Sparkles,
  GripVertical,
  Send,
  Check,
  Package,
  AlertCircle,
  Phone,
  Receipt,
  ArrowRight,
  Scale,
  MapPin,
  Calculator,
  Tag,
  ChevronDown,
} from 'lucide-react';

interface StorePageProps {
  shop: Shop;
  onBack: () => void;
  onOrderCreated?: (order: Order) => void;
}

export const StorePage: React.FC<StorePageProps> = ({
  shop,
  onBack,
  onOrderCreated,
}) => {
  const { user, openAuthModal } = useAuth();
  const { showAlert } = useModal();

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Close category dropdown when clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCategoryDropdownOpen(false);
      }
    };
    if (isCategoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCategoryDropdownOpen]);

  // Cart state from CartContext (synced to localStorage)
  const {
    cartItems,
    cartShop,
    addToCart,
    updateQuantity,
    removeFromCart,
    addCustomItem,
    openCartDrawer,
    totalCartCount,
    subtotal,
  } = useCart();
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);

  const isOpen = isShopOpenNow(shop);

  // Guard against blocked shops
  useEffect(() => {
    const checkBlocked = () => {
      const live = fallbackStore.shops.get(shop.id) || shop;
      if (live.isBlocked || live.status === 'Rejected' || live.status === 'REJECTED') {
        showAlert('দোকানটি পাওয়া যায়নি', 'এই দোকানটি বর্তমানে বন্ধ বা অনুপলব্ধ রয়েছে।', 'error');
        onBack();
      }
    };
    checkBlocked();
    const unsub = fallbackStore.subscribe(checkBlocked);
    return () => unsub();
  }, [shop, onBack, showAlert]);

  // Sync products for this store
  useEffect(() => {
    const sync = () => {
      const all = Array.from(fallbackStore.storeProducts.values()).filter(
        (p) => p.storeId === shop.id
      );
      setProducts(all);
      setIsLoading(false);
    };
    sync();
    fallbackStore.loadStoreProducts();
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, [shop.id]);

  // Extract categories with item counts
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

  // Filtered categories for custom dropdown search
  const filteredDropdownCategories = useMemo(() => {
    if (!categorySearchQuery.trim()) return categoriesWithCount;
    const q = categorySearchQuery.toLowerCase();
    return categoriesWithCount.filter((c) => c.name.toLowerCase().includes(q));
  }, [categoriesWithCount, categorySearchQuery]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory !== 'all') {
        if (selectedCategory === '__uncategorized__') {
          if (p.category && p.category.trim()) return false;
        } else {
          if ((p.category || '').trim() !== selectedCategory) return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.unit?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [products, selectedCategory, searchQuery]);

  // Quantity in cart helper
  const getItemQty = (productId: string): number => {
    const found = cartItems.find((item) => item.id === productId);
    return found?.quantity || 0;
  };

  // Add / increase product in cart
  const handleIncrease = (product: StoreProduct) => {
    hapticFeedback('selection');
    const hasDiscount = Boolean(product.discountRate && product.discountRate > 0);
    const effectivePrice = hasDiscount
      ? Math.round(product.price * (1 - (product.discountRate || 0) / 100))
      : product.price;

    const newItem: OrderItem = {
      id: product.id,
      name: product.name,
      unit: product.unit,
      price: effectivePrice,
      photoUrl: product.photoUrl,
      quantity: 1,
      qty: '1',
      storeId: shop.id,
      storeName: shop.name,
      discountRate: product.discountRate,
    };
    addToCart(newItem, shop);
  };

  // Decrease / remove product in cart
  const handleDecrease = (productId: string) => {
    hapticFeedback('selection');
    updateQuantity(productId, -1);
  };

  // Remove single item completely
  const handleRemoveItem = (itemId: string) => {
    hapticFeedback('selection');
    removeFromCart(itemId);
  };

  // Add custom item
  const handleAddCustomItem = (customItem: OrderItem) => {
    hapticFeedback('medium');
    const enrichedItem: OrderItem = {
      ...customItem,
      storeId: shop.id,
      storeName: shop.name,
      buyFrom: customItem.buyFrom || shop.name,
    };
    addCustomItem(enrichedItem, shop);
  };

  return (
    <div className="min-h-screen pb-36 animate-in fade-in duration-200">
      {/* ── Top Bar with Back Navigation & Store Name ── */}
      <div className="bg-white border border-gray-100 rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2 shadow-xs mb-3">
        {/* Left: Back button */}
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-emerald-700 bg-gray-100 hover:bg-gray-200/80 px-3 py-1.5 rounded-full transition-all cursor-pointer tap-spring shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {/* Middle: Store name */}
        <div className="flex-1 text-center min-w-0 px-1">
          <h1 className="text-sm sm:text-base font-black text-gray-900 truncate">
            {shop.name}
          </h1>
        </div>

        {/* Right: Cart or placeholder spacer to keep middle centered */}
        <div className="flex items-center justify-end shrink-0 min-w-[70px]">
          {totalCartCount > 0 ? (
            <button
              type="button"
              onClick={() => openCartDrawer()}
              className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-xs px-3 py-1.5 rounded-full hover:bg-emerald-100 transition-all cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>{totalCartCount}</span>
              <span className="text-[10px] text-emerald-600">৳{subtotal}</span>
            </button>
          ) : (
            <div className="w-[70px]" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Notice if store is closed */}
      {!isOpen && (
        <div className="mb-3 p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300/90 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1 text-amber-900">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-md">
                দোকান বন্ধ
              </span>
              <p className="text-sm font-black text-amber-950">{shop.name}</p>
            </div>
            <p className="text-xs sm:text-[13px] font-bold text-amber-800 leading-snug">
              পছন্দের পণ্য কার্টে যোগ করে এখনই অর্ডার করতে পারেন — হেলপার অন্য কোনো বিশ্বস্ত দোকান থেকে পণ্যগুলো সংগ্রহ করে পৌঁছে দেবে।
            </p>
          </div>
        </div>
      )}

      {/* Notice if cart has items from another shop */}
      {cartShop && cartShop.id !== shop.id && cartItems.length > 0 && (
        <div className="mb-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingBag className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="text-amber-900 font-bold truncate">
              কার্টে {cartShop.name}-এর {totalCartCount}টি পণ্য আছে
            </span>
          </div>
          <button
            type="button"
            onClick={() => openCartDrawer()}
            className="px-2.5 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-[11px] shrink-0 cursor-pointer shadow-xs"
          >
            কার্ট দেখুন
          </button>
        </div>
      )}

      {/* ── Search & Category Filter ── */}
      <div className="space-y-3 px-1">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`${shop.name}-এর পণ্য খুঁজুন...`}
            className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm rounded-2xl bg-white border border-gray-200/90 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Custom Category Dropdown */}
        {(categoriesWithCount.length > 0 || uncategorizedCount > 0) && (
          <div className="relative" ref={categoryDropdownRef}>
            {/* Trigger Button */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsCategoryDropdownOpen((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsCategoryDropdownOpen((prev) => !prev);
                }
              }}
              className={`w-full px-3.5 py-2.5 rounded-2xl border transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs select-none ${
                isCategoryDropdownOpen
                  ? 'bg-emerald-50/40 border-emerald-500 ring-2 ring-emerald-500/20'
                  : selectedCategory !== 'all'
                  ? 'bg-emerald-50/30 border-emerald-400'
                  : 'bg-white border-gray-200/90 hover:border-gray-300'
              }`}
            >
              {/* Left Side: Icon & Selected Label */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    selectedCategory !== 'all'
                      ? 'bg-emerald-500 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-600'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-gray-400 shrink-0 hidden sm:inline">
                    ক্যাটাগরি:
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-gray-900 truncate">
                    {selectedCategory === 'all'
                      ? 'সকল ক্যাটাগরি'
                      : selectedCategory === '__uncategorized__'
                      ? 'অন্যান্য / আনক্যাটাগরাইজড'
                      : selectedCategory}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black bg-emerald-100/80 text-emerald-800 shrink-0">
                    {selectedCategory === 'all'
                      ? `${products.length} টি`
                      : selectedCategory === '__uncategorized__'
                      ? `${uncategorizedCount} টি`
                      : `${categoriesWithCount.find((c) => c.name === selectedCategory)?.count || 0} টি`}
                  </span>
                </div>
              </div>

              {/* Right Side: Clear Button & Animated Chevron */}
              <div className="flex items-center gap-1 shrink-0">
                {selectedCategory !== 'all' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      hapticFeedback('selection');
                      setSelectedCategory('all');
                      setIsCategoryDropdownOpen(false);
                    }}
                    className="p-1 rounded-full text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                    title="ক্যাটাগরি রিসেট করুন"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <div
                  className={`transition-transform duration-200 text-gray-400 ${
                    isCategoryDropdownOpen ? 'rotate-180 text-emerald-600' : ''
                  }`}
                >
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Dropdown Menu */}
            {isCategoryDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white/95 backdrop-blur-md rounded-2xl border border-gray-100 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-2 space-y-1.5">
                {/* Search in dropdown if more than 5 categories */}
                {categoriesWithCount.length > 5 && (
                  <div className="relative px-1 pt-1 pb-1">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={categorySearchQuery}
                      onChange={(e) => setCategorySearchQuery(e.target.value)}
                      placeholder="ক্যাটাগরি খুঁজুন..."
                      autoFocus
                      className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    />
                    {categorySearchQuery && (
                      <button
                        type="button"
                        onClick={() => setCategorySearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                <div className="max-h-64 overflow-y-auto space-y-1 overscroll-contain pr-0.5">
                  {/* Option: All Categories */}
                  <button
                    type="button"
                    onClick={() => {
                      hapticFeedback('selection');
                      setSelectedCategory('all');
                      setIsCategoryDropdownOpen(false);
                      setCategorySearchQuery('');
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl text-left text-xs sm:text-sm font-bold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                      selectedCategory === 'all'
                        ? 'bg-emerald-50 text-emerald-900 font-black shadow-2xs'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm">📂</span>
                      <span className="truncate">সকল ক্যাটাগরি</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          selectedCategory === 'all'
                            ? 'bg-emerald-200/80 text-emerald-900'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {products.length}
                      </span>
                      {selectedCategory === 'all' && (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                    </div>
                  </button>

                  <div className="border-t border-gray-100 my-1" />

                  {/* Option list: Categories */}
                  {filteredDropdownCategories.length === 0 && categorySearchQuery ? (
                    <div className="py-4 text-center text-xs text-gray-400">
                      কোনো ক্যাটাগরি পাওয়া যায়নি
                    </div>
                  ) : (
                    filteredDropdownCategories.map((cat) => {
                      const isSelected = selectedCategory === cat.name;
                      return (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => {
                            hapticFeedback('selection');
                            setSelectedCategory(cat.name);
                            setIsCategoryDropdownOpen(false);
                            setCategorySearchQuery('');
                          }}
                          className={`w-full px-3 py-2.5 rounded-xl text-left text-xs sm:text-sm font-bold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50 text-emerald-900 font-black shadow-2xs'
                              : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm">🏷️</span>
                            <span className="truncate">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                isSelected
                                  ? 'bg-emerald-200/80 text-emerald-900'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {cat.count}
                            </span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}

                  {/* Option: Uncategorized */}
                  {uncategorizedCount > 0 &&
                    (!categorySearchQuery ||
                      'অন্যান্য আনক্যাটাগরাইজড'.includes(categorySearchQuery.toLowerCase())) && (
                      <button
                        type="button"
                        onClick={() => {
                          hapticFeedback('selection');
                          setSelectedCategory('__uncategorized__');
                          setIsCategoryDropdownOpen(false);
                          setCategorySearchQuery('');
                        }}
                        className={`w-full px-3 py-2.5 rounded-xl text-left text-xs sm:text-sm font-bold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                          selectedCategory === '__uncategorized__'
                            ? 'bg-emerald-50 text-emerald-900 font-black shadow-2xs'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">📦</span>
                          <span className="truncate">অন্যান্য / আনক্যাটাগরাইজড</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              selectedCategory === '__uncategorized__'
                                ? 'bg-emerald-200/80 text-emerald-900'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {uncategorizedCount}
                          </span>
                          {selectedCategory === '__uncategorized__' && (
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                          )}
                        </div>
                      </button>
                    )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Product Items Grid ── */}
      <div className="mt-4 px-1">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-3 border border-gray-100 space-y-2.5 animate-pulse"
              >
                <div className="w-full aspect-square bg-gray-100 rounded-xl" />
                <div className="h-3.5 bg-gray-200 rounded-md w-3/4" />
                <div className="h-3 bg-gray-100 rounded-md w-1/2" />
                <div className="h-8 bg-gray-100 rounded-xl w-full" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-8 text-center space-y-3 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto text-emerald-400">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <p className="font-extrabold text-sm text-gray-800">
                {products.length === 0
                  ? 'এই দোকানে কোনো পণ্য তালিকাভুক্ত নেই'
                  : 'কোনো পণ্য পাওয়া যায়নি'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {products.length === 0
                  ? 'তালিকায় না থাকলেও কাস্টম আইটেম হিসেবে রিকোয়েস্ট করতে পারেন।'
                  : 'অন্য কোনো নাম লিখে খুঁজে দেখুন।'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddCustomModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>কাস্টম আইটেম যোগ করুন</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredProducts.map((product) => {
              const qty = getItemQty(product.id);
              const hasDiscount = Boolean(product.discountRate && product.discountRate > 0);
              const discountedPrice = hasDiscount
                ? Math.round(product.price * (1 - (product.discountRate || 0) / 100))
                : product.price;
              const isOutOfStock = !product.inStock;
              const isStoreClosed = !isOpen;

              return (
                <div
                  key={product.id}
                  className={`bg-white rounded-2xl border p-2.5 sm:p-3 flex flex-col justify-between transition-all duration-200 shadow-2xs hover:shadow-md ${
                    qty > 0
                      ? 'border-emerald-500 ring-2 ring-emerald-500/10'
                      : 'border-gray-100 hover:border-emerald-200'
                  } ${isOutOfStock ? 'opacity-60' : ''}`}
                >
                  {/* Photo & Badges */}
                  <div className="relative w-full aspect-square rounded-xl bg-gray-50 overflow-hidden mb-2 flex items-center justify-center">
                    {product.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.photoUrl}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    ) : (
                      <Package className="w-8 h-8 text-gray-300" />
                    )}

                    {/* Discount badge */}
                    {hasDiscount && !isOutOfStock && (
                      <span className="absolute top-1.5 left-1.5 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-xs">
                        -{product.discountRate}%
                      </span>
                    )}

                    {/* Store Closed Badge Overlay (Allows ordering from other store) */}
                    {isStoreClosed && !isOutOfStock && (
                      <span className="absolute bottom-1.5 left-1.5 bg-amber-600/90 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-xs backdrop-blur-2xs">
                        দোকান বন্ধ
                      </span>
                    )}

                    {/* Out of Stock overlay */}
                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-2xs flex items-center justify-center">
                        <span className="text-[10px] font-extrabold text-white bg-rose-600 px-2 py-0.5 rounded-md shadow-xs">
                          স্টক শেষ
                        </span>
                      </div>
                    )}

                  </div>

                  {/* Title & Unit & Price */}
                  <div className="space-y-0.5 mb-2">
                    <p className="text-[9px] font-semibold text-emerald-700/80 truncate flex items-center gap-1">
                      <Store className="w-2.5 h-2.5 text-emerald-600/80 shrink-0" />
                      <span className="truncate">{shop.name}</span>
                    </p>
                    <h3 className="font-extrabold text-gray-900 text-xs sm:text-sm line-clamp-2 leading-tight">
                      {product.name}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      {product.unit && (
                        <span className="text-[10px] text-gray-500 font-semibold bg-gray-100 px-1.5 py-0.5 rounded">
                          {product.unit}
                        </span>
                      )}
                      {product.category && (
                        <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded truncate max-w-[130px]" title={product.category}>
                          {product.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1.5 pt-0.5">
                      <span className="font-black text-emerald-700 text-xs sm:text-sm">
                        ৳{discountedPrice}
                      </span>
                      {hasDiscount && (
                        <span className="text-[10px] text-gray-400 line-through">
                          ৳{product.price}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right after pricing: "+ Buy" or Increment/Decrement */}
                  <div>
                    {isOutOfStock ? (
                      <button
                        type="button"
                        disabled
                        className="w-full py-2 rounded-xl bg-gray-100 text-gray-400 font-extrabold text-[11px] cursor-not-allowed"
                      >
                        অনুপলব্ধ (স্টক শেষ)
                      </button>
                    ) : qty === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleIncrease(product)}
                        className="w-full py-2 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-600/20"
                      >
                        <Plus className="w-4 h-4 stroke-[3]" />
                        <span>Buy</span>
                      </button>
                    ) : (
                      <div className="w-full flex items-center justify-between bg-emerald-600 text-white rounded-xl p-0.5 shadow-md">
                        <button
                          type="button"
                          onClick={() => handleDecrease(product.id)}
                          className="w-8 h-8 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-4 h-4 stroke-[3]" />
                        </button>

                        <span className="font-black text-xs sm:text-sm px-2 text-white text-center select-none flex-1">
                          {qty}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleIncrease(product)}
                          className="w-8 h-8 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-4 h-4 stroke-[3]" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ADD CUSTOM ITEM MODAL ── */}
      <AddCustomItemModal
        isOpen={showAddCustomModal}
        onClose={() => setShowAddCustomModal(false)}
        onAddItem={handleAddCustomItem}
        defaultBuyFrom={shop.name}
      />
    </div>
  );
};
