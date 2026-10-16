'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fallbackStore } from '@/lib/firebase';
import { Shop, StoreProduct } from '@/types';
import { useCart } from '@/context/CartContext';
import { DEFAULT_SERVICES } from '@/lib/pricing';
import { hapticFeedback } from '@/lib/native';
import { isShopOpenNow } from './StoreGrid';
import {
  Search,
  X,
  Sparkles,
  Store,
  Package,
  ArrowRight,
  Plus,
  Check,
} from 'lucide-react';

interface HomeSearchBoxProps {
  onOpenCustomRequest: (searchQuery?: string) => void;
  onStoreClick?: (shop: Shop) => void;
}

// Target 5-7 best match items at a time to keep UI fast, lag-free and compact
const MAX_SUGGESTIONS = 6;

// ─── Relevance Scoring Functions ──────────────────────────────────────────────
function scoreProduct(prod: StoreProduct, query: string): number {
  if (!query || !prod.name) return 0;
  const q = query.trim().toLowerCase();
  const name = prod.name.trim().toLowerCase();
  const store = (prod.storeName || '').trim().toLowerCase();
  const category = (prod.category || '').trim().toLowerCase();
  const unit = (prod.unit || '').trim().toLowerCase();

  let score = 0;

  // 1. Direct name match
  if (name === q) {
    score += 120;
  } else if (name.startsWith(q)) {
    score += 95;
  } else {
    const words = name.split(/\s+/);
    if (words.some((w) => w.startsWith(q))) {
      score += 80;
    } else if (name.includes(q)) {
      score += 55;
    }
  }

  // 2. Secondary matches (category, store, unit)
  if (category.startsWith(q)) score += 30;
  else if (category.includes(q)) score += 20;

  if (store.startsWith(q)) score += 25;
  else if (store.includes(q)) score += 15;

  if (unit.includes(q)) score += 10;

  if (score === 0) return 0;

  // 3. Stock preference
  if (prod.inStock !== false) {
    score += 12;
  } else {
    score -= 25;
  }

  // 4. Image presence bonus
  if (prod.photoUrl) score += 3;

  // 5. Discount bonus
  if (prod.discountRate && prod.discountRate > 0) score += 2;

  // 6. Compactness bonus (shorter name closer to query gets slight boost)
  const lengthDiff = Math.abs(name.length - q.length);
  score += Math.max(0, 10 - Math.min(10, Math.floor(lengthDiff / 2)));

  return score;
}

function scoreShop(shop: Shop, query: string): number {
  if (!query || !shop.name) return 0;
  const q = query.trim().toLowerCase();
  const name = shop.name.trim().toLowerCase();
  const type = (shop.type || '').trim().toLowerCase();
  const desc = (shop.description || '').trim().toLowerCase();

  let score = 0;

  if (name === q) {
    score += 120;
  } else if (name.startsWith(q)) {
    score += 95;
  } else {
    const words = name.split(/\s+/);
    if (words.some((w) => w.startsWith(q))) {
      score += 80;
    } else if (name.includes(q)) {
      score += 55;
    }
  }

  if (type.startsWith(q)) score += 35;
  else if (type.includes(q)) score += 20;

  if (desc.includes(q)) score += 10;

  if (score === 0) return 0;

  if (isShopOpenNow(shop)) score += 10;
  if (shop.isFeatured) score += 25;
  if (shop.photoUrl) score += 3;

  const lengthDiff = Math.abs(name.length - q.length);
  score += Math.max(0, 10 - Math.min(10, Math.floor(lengthDiff / 2)));

  return score;
}

function scoreService(service: string, query: string): number {
  if (!query || !service) return 0;
  const q = query.trim().toLowerCase();
  const s = service.trim().toLowerCase();

  let score = 0;
  if (s === q) score += 110;
  else if (s.startsWith(q)) score += 85;
  else {
    const words = s.split(/\s+/);
    if (words.some((w) => w.startsWith(q))) score += 70;
    else if (s.includes(q)) score += 45;
  }

  if (score === 0) return 0;

  const lengthDiff = Math.abs(s.length - q.length);
  score += Math.max(0, 8 - Math.min(8, Math.floor(lengthDiff / 2)));

  return score;
}

export const HomeSearchBox: React.FC<HomeSearchBoxProps> = ({
  onOpenCustomRequest,
  onStoreClick,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { addToCart } = useCart();

  // Stores & Products state from fallbackStore
  const [allProducts, setAllProducts] = useState<StoreProduct[]>([]);
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [servicesList, setServicesList] = useState<string[]>(() => {
    const adminServices = fallbackStore.pricingSettings?.services;
    if (adminServices && adminServices.length > 0) return adminServices;
    const adminPlaceholders = fallbackStore.pricingSettings?.inputPlaceholders;
    if (adminPlaceholders && adminPlaceholders.length > 0) return adminPlaceholders;
    return DEFAULT_SERVICES;
  });
  const [serviceIndex, setServiceIndex] = useState(0);
  const [fadeAnim, setFadeAnim] = useState(true);
  const [adminNotFoundMsg, setAdminNotFoundMsg] = useState('');

  useEffect(() => {
    const sync = () => {
      const unblockedShops = Array.from(fallbackStore.shops.values()).filter(
        (s) => !s.isBlocked && s.status !== 'Rejected' && s.status !== 'REJECTED' && (!s.status || s.status === 'Approved' || s.status === 'APPROVED')
      );
      const validShopIds = new Set(unblockedShops.map((s) => s.id));
      setAllShops(unblockedShops);
      setAllProducts(
        Array.from(fallbackStore.storeProducts.values()).filter(
          (p) => !p.storeId || validShopIds.has(p.storeId)
        )
      );
      const adminServices = fallbackStore.pricingSettings?.services;
      if (adminServices && adminServices.length > 0) {
        setServicesList(adminServices);
      } else if (fallbackStore.pricingSettings?.inputPlaceholders?.length) {
        setServicesList(fallbackStore.pricingSettings.inputPlaceholders);
      } else {
        setServicesList(DEFAULT_SERVICES);
      }
      setAdminNotFoundMsg(
        fallbackStore.pricingSettings?.searchNotFoundMessage || ''
      );
    };
    sync();
    fallbackStore.loadStoreProducts();
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, []);

  // Smooth automatic placeholder rotation through service types
  useEffect(() => {
    if (servicesList.length <= 1) return;
    const interval = setInterval(() => {
      setFadeAnim(false);
      setTimeout(() => {
        setServiceIndex((prev) => (prev + 1) % servicesList.length);
        setFadeAnim(true);
      }, 350);
    }, 2800);
    return () => clearInterval(interval);
  }, [servicesList]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clean Query
  const cleanQuery = query.trim().toLowerCase();

  // ─── Best Match Selection (Top 5-7 items total) ───────────────────────────
  const { topItems, totalMatches } = useMemo(() => {
    if (!cleanQuery) {
      return { topItems: [], totalMatches: 0 };
    }

    type SuggestionCandidate =
      | { kind: 'service'; score: number; service: string }
      | { kind: 'product'; score: number; product: StoreProduct }
      | { kind: 'shop'; score: number; shop: Shop };

    const candidates: SuggestionCandidate[] = [];

    // 1. Score matching services
    for (const svc of servicesList) {
      const score = scoreService(svc, cleanQuery);
      if (score > 0) {
        candidates.push({ kind: 'service', score, service: svc });
      }
    }

    // 2. Score matching products
    for (const prod of allProducts) {
      const score = scoreProduct(prod, cleanQuery);
      if (score > 0) {
        candidates.push({ kind: 'product', score, product: prod });
      }
    }

    // 3. Score matching shops
    for (const shop of allShops) {
      const score = scoreShop(shop, cleanQuery);
      if (score > 0) {
        candidates.push({ kind: 'shop', score, shop });
      }
    }

    // Sort descending by match score for best relevance
    candidates.sort((a, b) => b.score - a.score);

    return {
      topItems: candidates.slice(0, MAX_SUGGESTIONS),
      totalMatches: candidates.length,
    };
  }, [cleanQuery, servicesList, allProducts, allShops]);

  // Group top best-matched items for clean layout
  const matchingServices = useMemo(
    () => topItems.filter((i) => i.kind === 'service').map((i) => (i as { service: string }).service),
    [topItems]
  );
  const matchingProducts = useMemo(
    () => topItems.filter((i) => i.kind === 'product').map((i) => (i as { product: StoreProduct }).product),
    [topItems]
  );
  const matchingShops = useMemo(
    () => topItems.filter((i) => i.kind === 'shop').map((i) => (i as { shop: Shop }).shop),
    [topItems]
  );

  const hasAnyResults = topItems.length > 0;

  const notFoundMessage =
    adminNotFoundMsg ||
    'কিছু খুঁজে পাননি? কোনো সমস্যা নেই! আপনার যা প্রয়োজন কাস্টম রিকোয়েস্ট তৈরি করুন, আমরা ব্যবস্থা করে দেবো।';

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
  };

  const handleCustomRequestClick = () => {
    hapticFeedback('selection');
    setIsOpen(false);
    onOpenCustomRequest(query.trim());
  };

  const handleSelectProduct = (product: StoreProduct) => {
    hapticFeedback('selection');
    const shop = allShops.find((s) => s.id === product.storeId) || fallbackStore.shops.get(product.storeId);
    if (shop) {
      const hasDiscount = Boolean(product.discountRate && product.discountRate > 0);
      const effectivePrice = hasDiscount
        ? Math.round(product.price * (1 - (product.discountRate || 0) / 100))
        : product.price;

      addToCart(
        {
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
        },
        shop
      );

      setAddedProductId(product.id);
      setTimeout(() => {
        setAddedProductId(null);
      }, 1500);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${isOpen && cleanQuery.length > 0 ? 'z-40' : 'z-20'}`}>
      {/* ── Search Input Box ── */}
      <div className="relative flex items-center bg-white rounded-2xl border border-gray-200/90 shadow-xs hover:border-emerald-500 focus-within:border-emerald-600 focus-within:ring-3 focus-within:ring-emerald-500/10 transition-all">
        <div className="pl-3.5 pr-2 py-3 flex items-center pointer-events-none text-emerald-600">
          <Search className="w-4 h-4" />
        </div>

        <div className="relative flex-1 flex items-center min-w-0">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (query.trim().length > 0) setIsOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (query.trim().length > 0) setIsOpen(true);
              }
            }}
            className="w-full py-2.5 pr-3 bg-transparent text-xs sm:text-sm font-medium text-gray-900 outline-none z-10"
            aria-label="পণ্য বা সার্ভিস খুঁজুন"
          />

          {!query && (
            <div className="absolute inset-0 flex items-center pointer-events-none overflow-hidden select-none pr-3">
              <div
                className={`flex items-center gap-1.5 text-xs sm:text-sm text-gray-400 truncate transition-all duration-350 ease-out transform ${
                  fadeAnim ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
                }`}
              >
                <span className="text-gray-400 shrink-0">খুঁজুন:</span>
                <span className="font-semibold text-emerald-700/90 truncate">
                  &ldquo;{servicesList[serviceIndex] || 'সার্ভিস'}&rdquo;
                </span>
                <span className="text-gray-400/80 hidden sm:inline font-normal shrink-0">বা পণ্য...</span>
              </div>
            </div>
          )}
        </div>

        {query.trim().length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer mr-1 z-20"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (query.trim().length > 0) setIsOpen(true);
          }}
          className="mr-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0 z-20"
        >
          খুঁজুন
        </button>
      </div>

      {/* ── Search Results Dropdown (Clean, fast & max 5-7 best-matched items) ── */}
      {isOpen && cleanQuery.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden max-h-[60vh] sm:max-h-[420px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          {hasAnyResults ? (
            <div className="p-3 space-y-3 divide-y divide-gray-100">
              {/* 1. Services Matching */}
              {matchingServices.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 px-1">
                    সার্ভিস ক্যাটাগরি
                  </span>
                  <div className="space-y-1">
                    {matchingServices.map((svc, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          onOpenCustomRequest(svc);
                        }}
                        className="w-full text-left p-2.5 rounded-xl hover:bg-emerald-50/70 transition-colors flex items-center justify-between group cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="text-xs font-bold text-gray-800 group-hover:text-emerald-900">
                            {svc}
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                          রিকোয়েস্ট <ArrowRight className="w-3 h-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Products Matching */}
              {matchingProducts.length > 0 && (
                <div className="pt-2.5 space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 px-1">
                    পণ্যসমূহ
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {matchingProducts.map((prod) => {
                      const shop = allShops.find((s) => s.id === prod.storeId) || fallbackStore.shops.get(prod.storeId);
                      const hasDiscount = Boolean(prod.discountRate && prod.discountRate > 0);
                      const effectivePrice = hasDiscount
                        ? Math.round(prod.price * (1 - (prod.discountRate || 0) / 100))
                        : prod.price;
                      const isOutOfStock = prod.inStock === false;
                      const isJustAdded = addedProductId === prod.id;

                      return (
                        <div
                          key={prod.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl bg-gray-50/70 border border-gray-100 hover:bg-emerald-50/50 transition-colors"
                        >
                          <div
                            onClick={() => {
                              if (shop && onStoreClick) {
                                setIsOpen(false);
                                onStoreClick(shop);
                              }
                            }}
                            className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                          >
                            <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 shrink-0 overflow-hidden flex items-center justify-center">
                              {prod.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={prod.photoUrl}
                                  alt={prod.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <Package className="w-4 h-4 text-emerald-600" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-gray-900 truncate">
                                {prod.name}
                              </p>
                              <p className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                                <span className="truncate">{prod.storeName || shop?.name}</span>
                                <span>•</span>
                                {hasDiscount && (
                                  <span className="line-through text-gray-400 text-[9px]">
                                    ৳{prod.price}
                                  </span>
                                )}
                                <span className="font-semibold text-gray-800">৳{effectivePrice}</span>
                                {prod.unit && <span className="text-gray-400">({prod.unit})</span>}
                              </p>
                            </div>
                          </div>

                          {isOutOfStock ? (
                            <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-400 text-[10px] font-bold shrink-0">
                              স্টক শেষ
                            </span>
                          ) : isJustAdded ? (
                            <span className="px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white text-[10px] font-extrabold shrink-0 flex items-center gap-1 shadow-xs animate-in zoom-in-95 duration-150">
                              <Check className="w-3 h-3 text-emerald-200" />
                              <span>যোগ হয়েছে</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSelectProduct(prod)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[11px] font-bold shrink-0 flex items-center gap-1 cursor-pointer shadow-xs transition-all"
                            >
                              <Plus className="w-3 h-3" />
                              <span>যোগ</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Shops Matching */}
              {matchingShops.length > 0 && (
                <div className="pt-2.5 space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 px-1">
                    দোকানসমূহ
                  </span>
                  <div className="space-y-1">
                    {matchingShops.map((shop) => (
                      <button
                        key={shop.id}
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          if (onStoreClick) onStoreClick(shop);
                        }}
                        className="w-full text-left p-2.5 rounded-xl hover:bg-emerald-50/70 border border-transparent hover:border-emerald-100 transition-colors flex items-center justify-between group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center shrink-0 overflow-hidden">
                            {shop.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={shop.photoUrl} alt={shop.name} className="w-full h-full object-cover" />
                            ) : (
                              <Store className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 group-hover:text-emerald-900 truncate">
                              {shop.name}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">
                              {shop.type || 'দোকান'} {isShopOpenNow(shop) ? '• খোলা' : '• বন্ধ'}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-purple-700 flex items-center gap-1 shrink-0">
                          দোকান দেখুন <ArrowRight className="w-3 h-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Total Matches Summary Footer (If more than MAX_SUGGESTIONS available) */}
              {totalMatches > MAX_SUGGESTIONS && (
                <div className="pt-2.5 pb-0.5 px-1 flex items-center justify-between text-[11px] text-gray-500 border-t border-gray-100">
                  <span className="truncate">
                    সেরা {topItems.length}টি ফলাফল (মোট {totalMatches}টির মধ্যে)
                  </span>
                  <button
                    type="button"
                    onClick={handleCustomRequestClick}
                    className="text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer shrink-0 ml-2"
                  >
                    <span>কাস্টম রিকোয়েস্ট</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── Search Not Found: Show Admin Message + Custom Request Button ── */
            <div className="p-5 text-center space-y-3 bg-gradient-to-b from-white to-gray-50/80">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 mx-auto flex items-center justify-center shadow-xs">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>

              <div className="space-y-1 max-w-sm mx-auto">
                <p className="text-xs sm:text-sm font-bold text-gray-800 leading-relaxed">
                  {notFoundMessage}
                </p>
                <p className="text-[11px] text-gray-500">
                  &ldquo;<span className="font-semibold text-gray-700">{query.trim()}</span>&rdquo; সংক্রান্ত রিকোয়েস্ট পাঠিয়ে দিন
                </p>
              </div>

              <button
                type="button"
                onClick={handleCustomRequestClick}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-extrabold shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>কাস্টম রিকোয়েস্ট তৈরি করুন</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

