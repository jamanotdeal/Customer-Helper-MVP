'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Shop, StoreProduct } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { Clock, Store, CircleDot, X, Package, ArrowLeft, Plus, Minus, Check, Search, ChevronDown, Sparkles, Layers } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { StoreProductManager } from './StoreProductManager';
import { DEFAULT_SERVICES, isShopMatchingService } from '@/lib/pricing';
import { hapticFeedback } from '@/lib/native';
import { sortShopsByFeedbackAndNew } from '@/utils/storeRanking';

interface StoreGridProps {
  onStoreClick?: (shop: Shop) => void;
  onOpenCustomRequest?: (serviceHint?: string) => void;
}

const INITIAL_COUNT = 8;
const LOAD_MORE = 8;

export type TimeFilter = 'all' | 'open' | 'closed';

/**
 * Helper to check if a shop is currently open based on isOpen flag and operating hours.
 */
export function isShopOpenNow(shop: Shop): boolean {
  if (shop.isOpen === false || shop.isActive === false) return false;

  if (shop.openingTime && shop.closingTime) {
    const parseTimeToMinutes = (tStr: string): number | null => {
      if (!tStr) return null;
      const clean = tStr
        .trim()
        .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
        .toUpperCase();
      const match12 = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
      if (match12) {
        let h = parseInt(match12[1], 10);
        const m = match12[2] ? parseInt(match12[2], 10) : 0;
        const ampm = match12[3];
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      }
      const match24 = clean.match(/^(\d{1,2}):(\d{2})$/);
      if (match24) {
        const h = parseInt(match24[1], 10);
        const m = parseInt(match24[2], 10);
        return h * 60 + m;
      }
      return null;
    };

    const startMinutes = parseTimeToMinutes(shop.openingTime);
    const endMinutes = parseTimeToMinutes(shop.closingTime);

    if (startMinutes !== null && endMinutes !== null) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      } else {
        // Overnight range (e.g. 8 PM to 2 AM)
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      }
    }
  }

  return true;
}

export const StoreGrid: React.FC<StoreGridProps> = ({ onStoreClick, onOpenCustomRequest }) => {
  const [shops, setShops] = useState<Shop[]>(() => {
    return Array.from(fallbackStore.shops.values()).filter(
      (s) => !s.isBlocked && s.status !== 'Rejected' && s.status !== 'REJECTED' && (!s.status || s.status === 'Approved' || s.status === 'APPROVED')
    );
  });
  const [isLoading, setIsLoading] = useState(() => fallbackStore.shops.size === 0);
  const [servicesList, setServicesList] = useState<string[]>(() => {
    return fallbackStore.pricingSettings?.services || DEFAULT_SERVICES;
  });
  const [serviceStoreTypeMap, setServiceStoreTypeMap] = useState<Record<string, string[]> | undefined>(() => {
    return fallbackStore.pricingSettings?.serviceStoreTypeMap;
  });
  // Default selected to first item in services list
  const [selectedService, setSelectedService] = useState<string>(() => {
    const svcs = fallbackStore.pricingSettings?.services || DEFAULT_SERVICES;
    return svcs[0] || '';
  });
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();

  // Close custom dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    const sync = () => {
      const all = Array.from(fallbackStore.shops.values()).filter(
        (s) => !s.isBlocked && s.status !== 'Rejected' && s.status !== 'REJECTED' && (!s.status || s.status === 'Approved' || s.status === 'APPROVED')
      );
      setShops(all);
      setIsLoading(false);
      const adminServices = fallbackStore.pricingSettings?.services;
      const svcs = adminServices && adminServices.length > 0 ? adminServices : DEFAULT_SERVICES;
      setServicesList(svcs);
      setServiceStoreTypeMap(fallbackStore.pricingSettings?.serviceStoreTypeMap);
      setSelectedService((prev) => {
        if (!prev || !svcs.includes(prev) || prev === 'Bazar-sodai korte hobe') {
          return svcs[0] || '';
        }
        return prev;
      });
    };
    sync();
    fallbackStore.loadShops();
    fallbackStore.getAllOrderFeedbacks().catch(() => { });
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, []);

  const filteredShops = useMemo(() => {
    const matched = shops.filter((s) =>
      isShopMatchingService(
        s,
        selectedService,
        serviceStoreTypeMap
      )
    );
    return sortShopsByFeedbackAndNew(
      matched,
      fallbackStore.orderFeedbacks,
      fallbackStore.orders
    );
  }, [shops, selectedService, serviceStoreTypeMap]);

  const visible = filteredShops.slice(0, visibleCount);
  const hasMore = filteredShops.length > visibleCount;

  // Infinite scroll
  useEffect(() => {
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleCount((p) => p + LOAD_MORE); },
      { threshold: 0.1, rootMargin: '120px' }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, visible.length]);

  const handleStoreClick = (shop: Shop) => {
    if (onStoreClick) {
      onStoreClick(shop);
    } else {
      setSelectedShop(shop);
    }
  };

  // Check if the current logged-in user is the owner of the selected shop
  const isOwnerOfSelectedShop = Boolean(
    selectedShop &&
    user &&
    (selectedShop.ownerUserId === user.uid ||
      selectedShop.assignedUserIds?.includes(user.uid) ||
      (user.isStoreApproved && user.storeId === selectedShop.id))
  );

  return (
    <>
      <div className="space-y-3">
        {/* Custom Service Selection Dropdown */}
        <div className={`relative w-full ${isDropdownOpen ? 'z-30' : 'z-10'}`} ref={dropdownRef}>
          <button
            type="button"
            onClick={() => {
              hapticFeedback('selection');
              setIsDropdownOpen((prev) => !prev);
            }}
            className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border transition-all cursor-pointer bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20 active:scale-[0.99] ${isDropdownOpen
                ? 'border-emerald-300 ring-4 ring-emerald-500/30 shadow-xl shadow-emerald-600/30'
                : 'border-emerald-500/80 hover:border-emerald-400 hover:shadow-lg'
              }`}
            aria-expanded={isDropdownOpen}
            aria-haspopup="listbox"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/25 text-white shadow-inner flex items-center justify-center shrink-0 backdrop-blur-xs relative">
                <span className="inline-block animate-bounce">
                  <Layers className="w-5 h-5 text-white" />
                </span>
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-80" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
                </span>
              </div>
              <div className="text-left min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-100">
                  সার্ভিস বেছে নিন
                </span>
                <span className="block text-xs sm:text-sm font-black text-white truncate">
                  {selectedService || 'সার্ভিস নির্বাচন করুন'}
                </span>
              </div>
            </div>

            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 shrink-0 ${isDropdownOpen
                  ? 'bg-white text-emerald-700 rotate-180 shadow-xs'
                  : 'bg-white/20 border border-white/25 text-white'
                }`}
            >
              <ChevronDown className="w-4 h-4 stroke-[2.5]" />
            </div>
          </button>

          {/* Custom Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border-2 border-emerald-200 shadow-2xl overflow-hidden py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                {servicesList.map((svc) => {
                  const isSelected = svc === selectedService;
                  return (
                    <button
                      key={svc}
                      type="button"
                      onClick={() => {
                        hapticFeedback('selection');
                        setSelectedService(svc);
                        setVisibleCount(INITIAL_COUNT);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors cursor-pointer ${isSelected
                          ? 'bg-emerald-50 text-emerald-950 font-black'
                          : 'hover:bg-gray-50 text-gray-800 font-bold'
                        }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSelected
                              ? 'bg-emerald-600 ring-4 ring-emerald-200'
                              : 'bg-gray-300'
                            }`}
                        />
                        <span className="text-xs sm:text-sm truncate">{svc}</span>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2 stroke-[3]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Loading skeleton or 2-column grid or empty state */}
        {isLoading && shops.length === 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm animate-pulse">
                <div className="w-full h-28 bg-emerald-50/50" />
                <div className="p-2.5 space-y-2">
                  <div className="h-3 bg-gray-100 rounded-md w-3/4" />
                  <div className="h-2.5 bg-gray-50 rounded-md w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="py-7 px-4 text-center bg-gray-50/80 rounded-2xl border border-dashed border-gray-200 space-y-2.5">
            <Store className="w-7 h-7 text-gray-400 mx-auto" />
            <p className="text-xs sm:text-sm font-bold text-gray-800 max-w-xs mx-auto leading-relaxed">
              Sorry! কোনো কিছু পাওয়া যায়নি, But আপনি Custom Request করলে আমরা Manage করে দেবো!
            </p>
            <div className="flex items-center justify-center pt-1">
              <button
                type="button"
                onClick={() => onOpenCustomRequest?.(selectedService)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Custom Request করুন</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visible.map((shop) => (
              <StoreCard
                key={shop.id}
                shop={shop}
                onClick={handleStoreClick}
              />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        {hasMore && (
          <div ref={loaderRef} className="py-3 text-center flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50/50 rounded-2xl border border-emerald-100">
            <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <span>আরও দোকান লোড হচ্ছে...</span>
          </div>
        )}
      </div>

      {/* Store Detail / Product Modal */}
      {selectedShop && (
        <StoreDetailModal
          shop={selectedShop}
          isOwner={isOwnerOfSelectedShop}
          onClose={() => setSelectedShop(null)}
        />
      )}
    </>
  );
};

interface StoreCardProps {
  shop: Shop;
  onClick?: (shop: Shop) => void;
}

const StoreCard: React.FC<StoreCardProps> = ({ shop, onClick }) => {
  const isOpen = isShopOpenNow(shop);

  return (
    <button
      type="button"
      onClick={() => onClick?.(shop)}
      className="relative bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md hover:border-emerald-200 active:scale-98 transition-all text-left group"
    >
      {/* Store Image */}
      <div className="w-full h-28 bg-gradient-to-br from-emerald-50 to-teal-50 overflow-hidden relative">
        {shop.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shop.photoUrl}
            alt={shop.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Store className="w-10 h-10 text-emerald-300" />
          </div>
        )}

        {/* Only show badge when store is CLOSED */}
        {!isOpen && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold border shadow-sm backdrop-blur-sm bg-gray-800/80 text-gray-200 border-gray-700">
            <CircleDot className="w-2.5 h-2.5" />
            Closed
          </div>
        )}
      </div>

      {/* Store Info */}
      <div className="p-2.5 space-y-1">
        <h4 className="font-extrabold text-xs text-gray-900 leading-tight line-clamp-2 group-hover:text-emerald-700 transition-colors">
          {shop.name}
        </h4>

        {/* Store hours if available */}
        {(shop.openingTime || shop.closingTime) && (
          <div className="flex items-center gap-1 text-[10px] text-gray-500 font-semibold">
            <Clock className="w-3 h-3 shrink-0 text-gray-400" />
            <span className="truncate">
              {shop.openingTime && shop.closingTime
                ? `${shop.openingTime} – ${shop.closingTime}`
                : shop.openingTime || shop.closingTime}
            </span>
          </div>
        )}

        {/* Category or type */}
        {(shop.category || shop.type) && (
          <p className="text-[10px] text-gray-400 truncate">
            {shop.category || shop.type}
          </p>
        )}
      </div>
    </button>
  );
};

// ─── Store Detail Modal ───────────────────────────────────────────────────────
interface StoreDetailModalProps {
  shop: Shop;
  isOwner: boolean;
  onClose: () => void;
}

const StoreDetailModal: React.FC<StoreDetailModalProps> = ({ shop, isOwner, onClose }) => {
  const isOpen = isShopOpenNow(shop);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'products' | 'manage'>('products');

  useEffect(() => {
    const sync = () => {
      const all = Array.from(fallbackStore.storeProducts.values()).filter(
        (p) => p.storeId === shop.id
      );
      setProducts(all);
    };
    sync();
    const unsub = fallbackStore.subscribe(sync);
    fallbackStore.loadStoreProducts();
    return () => unsub();
  }, [shop.id]);

  const filteredProducts = products.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.unit?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    );
  });

  // Group products by category
  const categories = Array.from(new Set(filteredProducts.map((p) => p.category || 'অন্যান্য')));

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex flex-col animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mt-auto bg-white rounded-t-3xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-start gap-3 p-4 pb-3 border-b border-gray-100">
          {shop.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shop.photoUrl}
              alt={shop.name}
              className="w-14 h-14 rounded-2xl object-cover shrink-0 border border-gray-100"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100">
              <Store className="w-7 h-7 text-emerald-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-extrabold text-base text-gray-900 truncate">{shop.name}</h2>
              {!isOpen && (
                <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-gray-100 text-gray-600 border border-gray-200">
                  <CircleDot className="w-2.5 h-2.5" /> বন্ধ
                </span>
              )}
            </div>
            {(shop.category || shop.type) && (
              <p className="text-xs text-gray-500 font-medium mt-0.5">{shop.category || shop.type}</p>
            )}
            {(shop.openingTime || shop.closingTime) && (
              <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {shop.openingTime && shop.closingTime
                  ? `${shop.openingTime} – ${shop.closingTime}`
                  : shop.openingTime || shop.closingTime}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Tabs — only visible to store owners */}
        {isOwner && (
          <div className="flex items-center gap-1 px-4 pt-3 pb-0">
            <button
              type="button"
              onClick={() => setActiveTab('products')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${activeTab === 'products'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              পণ্য তালিকা
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manage')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${activeTab === 'manage'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              পণ্য ব্যবস্থাপনা
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain">
          {/* Owner: Manage Tab */}
          {isOwner && activeTab === 'manage' ? (
            <StoreProductManager storeId={shop.id} storeName={shop.name} />
          ) : (
            /* Products display (all users + owner's Products tab) */
            <>
              {/* Search */}
              {products.length > 4 && (
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="পণ্য খুঁজুন..."
                    className="w-full pl-9 pr-4 py-2.5 text-xs rounded-2xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              )}

              {filteredProducts.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto">
                    <Package className="w-7 h-7 text-gray-300" />
                  </div>
                  <p className="text-sm font-extrabold text-gray-700">
                    {products.length === 0 ? 'এখনো কোনো পণ্য যোগ করা হয়নি' : 'কোনো পণ্য পাওয়া যায়নি'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {products.length === 0
                      ? 'শীঘ্রই পণ্যের তালিকা আসছে।'
                      : 'ভিন্ন শব্দ দিয়ে খুঁজুন।'}
                  </p>
                  {isOwner && products.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('manage')}
                      className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      পণ্য যোগ করুন
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {categories.map((cat) => {
                    const catProducts = filteredProducts.filter(
                      (p) => (p.category || 'অন্যান্য') === cat
                    );
                    if (catProducts.length === 0) return null;
                    return (
                      <div key={cat} className="space-y-2">
                        {categories.length > 1 && (
                          <h4 className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wide px-0.5">
                            {cat}
                          </h4>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {catProducts.map((p) => (
                            <ProductCard
                              key={p.id}
                              product={p}
                              isStoreOpen={isOpen}
                              shopName={shop.name}
                              shop={shop}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Product Card with + and Quantity Controls on Image ─────────────────────────
interface ProductCardProps {
  product: StoreProduct;
  isStoreOpen: boolean;
  shopName?: string;
  shop?: Shop;
}

const ProductCard: React.FC<ProductCardProps> = ({ product: p, isStoreOpen, shopName, shop }) => {
  const { cartItems, addToCart, updateQuantity } = useCart();
  const cartItem = cartItems.find((item) => item.id === p.id);
  const qty = cartItem?.quantity ?? 0;

  const hasDiscount = Boolean(p.discountRate && p.discountRate > 0);
  const discountedPrice = hasDiscount
    ? Math.round(p.price * (1 - (p.discountRate || 0) / 100))
    : p.price;
  const unavailable = !p.inStock;

  const handleIncrease = () => {
    hapticFeedback('selection');
    const storeObj = shop || (p.storeId ? fallbackStore.shops.get(p.storeId) : undefined) || ({
      id: p.storeId || 'unknown',
      name: shopName || p.storeName || 'Store',
      type: 'অন্যান্য',
      address: '',
      phone: '',
      photoUrl: '',
      status: 'Approved',
      isActive: true,
      isOpen: isStoreOpen,
      createdAt: new Date().toISOString(),
    } as unknown as Shop);

    addToCart(
      {
        id: p.id,
        name: p.name,
        unit: p.unit,
        price: discountedPrice,
        photoUrl: p.photoUrl,
        quantity: 1,
        qty: '1',
        storeId: storeObj.id,
        storeName: storeObj.name,
        discountRate: p.discountRate,
      },
      storeObj
    );
  };

  const handleDecrease = () => {
    hapticFeedback('selection');
    updateQuantity(p.id, -1);
  };

  return (
    <div
      className={`bg-white rounded-2xl border p-2.5 sm:p-3 flex flex-col justify-between transition-all shadow-xs ${qty > 0
          ? 'border-emerald-500 ring-2 ring-emerald-500/10'
          : unavailable
            ? 'opacity-60 border-gray-100'
            : 'border-gray-100 hover:border-emerald-200'
        }`}
    >
      {/* Photo & Badges */}
      <div className="relative w-full aspect-square rounded-xl bg-gray-50 overflow-hidden mb-2 flex items-center justify-center">
        {p.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
        ) : (
          <Package className="w-8 h-8 text-gray-300" />
        )}
        {/* Discount badge */}
        {hasDiscount && !unavailable && (
          <span className="absolute top-1 left-1 bg-rose-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-xs">
            -{p.discountRate}%
          </span>
        )}
        {/* Out of stock overlay */}
        {!p.inStock && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center">
            <span className="text-[10px] font-extrabold text-white bg-rose-600 px-2 py-0.5 rounded-md">
              স্টক শেষ
            </span>
          </div>
        )}
        {/* Store closed badge */}
        {p.inStock && !isStoreOpen && (
          <span className="absolute bottom-1.5 left-1.5 bg-amber-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-xs">
            দোকান বন্ধ
          </span>
        )}

      </div>

      {/* Info */}
      <div className="flex-1 space-y-0.5 mb-2">
        {(shopName || p.storeName) && (
          <p className="text-[9px] font-semibold text-emerald-700/80 truncate flex items-center gap-1">
            <Store className="w-2.5 h-2.5 text-emerald-600/80 shrink-0" />
            <span className="truncate">{shopName || p.storeName}</span>
          </p>
        )}
        <h4 className="font-extrabold text-gray-900 text-xs truncate">{p.name}</h4>
        <p className="text-[10px] text-gray-500">{p.unit}</p>
        <div className="flex items-baseline gap-1">
          <span className="font-extrabold text-emerald-700 text-xs">৳{discountedPrice}</span>
          {hasDiscount && (
            <span className="text-[10px] text-gray-400 line-through">৳{p.price}</span>
          )}
        </div>
      </div>

      {/* Right after pricing: "+ Buy" or Increment/Decrement */}
      <div>
        {unavailable ? (
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
            onClick={() => handleIncrease()}
            className="w-full py-2 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Buy</span>
          </button>
        ) : (
          <div className="w-full flex items-center justify-between bg-emerald-600 text-white rounded-xl p-0.5 shadow-md">
            <button
              type="button"
              onClick={() => handleDecrease()}
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
              onClick={() => handleIncrease()}
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
};
