'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Order, OrderItem, Shop, ShopOrder } from '@/types';
import { fallbackStore, db } from '@/lib/firebase';
import { doc } from 'firebase/firestore';
import { getDoc } from '@/lib/firestoreMetered';
import {
  X,
  Store,
  Phone,
  MessageSquare,
  MapPin,
  ShoppingBag,
  Tag,
  DollarSign,
  AlertCircle,
  Package,
  CheckCircle2,
  UserCheck,
  Building2,
  Clock,
  Sparkles,
  ExternalLink,
  ImageIcon,
} from 'lucide-react';
import { formatItemQuantityUnit } from '@/lib/itemUtils';

interface CustomerOrderItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: OrderItem | null;
  order: Order;
  validShopOrders?: ShopOrder[];
}

export const CustomerOrderItemModal: React.FC<CustomerOrderItemModalProps> = ({
  isOpen,
  onClose,
  item,
  order,
  validShopOrders = [],
}) => {
  const [fetchedShop, setFetchedShop] = useState<Shop | null>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scrolling while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Preload store products if not yet loaded
  useEffect(() => {
    if (fallbackStore.storeProducts.size === 0) {
      fallbackStore.loadStoreProducts();
    }
  }, []);

  const normalizeItemName = (name: string): string => {
    return (name || '')
      .toLowerCase()
      .replace(/\s*[×x]\s*\d+/g, '') // remove "x2", "×2"
      .replace(/\s*\(\s*[×x]?\s*\d+\s*\)/g, '') // remove "(x2)", "(2)"
      .trim();
  };

  // Find connected ShopOrder for this item
  const connectedShopOrder = useMemo<ShopOrder | null>(() => {
    if (!item) return null;
    const targetNorm = normalizeItemName(item.name);
    if (!targetNorm) return null;

    for (const so of validShopOrders) {
      if (so.status === 'CANCELED' || (so.status as string) === 'CANCELLED') continue;

      // 1. Check inside itemsWithPrice by itemId or name
      if (so.itemsWithPrice && so.itemsWithPrice.length > 0) {
        const found = so.itemsWithPrice.find((ip: any) => {
          if (item.id && (ip.itemId === item.id || ip.originalId === item.id)) return true;
          const ipNorm = normalizeItemName(ip.name || '');
          return ipNorm === targetNorm || targetNorm.includes(ipNorm) || ipNorm.includes(targetNorm);
        });
        if (found) return so;
      }

      // 2. Check in requestText
      if (so.requestText) {
        const rawLines = so.requestText.split(/\r?\n/).filter((l) => !l.startsWith('নোট:'));
        for (const line of rawLines) {
          const parts = line.split(/,/).map((p) => normalizeItemName(p)).filter(Boolean);
          if (parts.some((p) => p === targetNorm || targetNorm.includes(p) || p.includes(targetNorm))) {
            return so;
          }
        }
      }

      // 3. Check if shopId matches item.storeId
      if (item.storeId && so.shopId === item.storeId) {
        return so;
      }
    }

    return null;
  }, [item, validShopOrders]);

  // Determine target shop ID to fetch or look up
  const targetShopId = useMemo<string | null>(() => {
    if (!item) return null;
    if (connectedShopOrder && connectedShopOrder.shopId && connectedShopOrder.shopId !== 'myself') {
      return connectedShopOrder.shopId;
    }
    if (item.storeId && item.storeId !== 'myself') {
      return item.storeId;
    }
    if (order.shopId && order.shopId !== 'myself') {
      return order.shopId;
    }
    if (order.selectedShopIds && order.selectedShopIds.length > 0) {
      const first = order.selectedShopIds[0];
      if (first && first !== 'myself') return first;
    }
    return null;
  }, [item, connectedShopOrder, order]);

  // Fetch shop document if not in fallbackStore cache
  useEffect(() => {
    if (!isOpen || !targetShopId) {
      setFetchedShop(null);
      return;
    }

    const cached = fallbackStore.shops.get(targetShopId);
    if (cached) {
      setFetchedShop(cached);
      return;
    }

    let isMounted = true;
    if (db) {
      getDoc(doc(db, 'shops', targetShopId))
        .then((snap) => {
          if (!isMounted) return;
          if (snap.exists()) {
            const data = { ...snap.data(), id: snap.id } as Shop;
            fallbackStore.shops.set(snap.id, data);
            setFetchedShop(data);
          }
        })
        .catch((e) => {
          console.warn('[CustomerOrderItemModal] fetch shop error:', e);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, targetShopId]);

  // Compute resolved price, store info, contact numbers & product photo
  const details = useMemo(() => {
    if (!item) return null;

    const targetNorm = normalizeItemName(item.name);

    // 0. Resolve Product Photo
    let resolvedPhotoUrl = item.photoUrl;
    if (!resolvedPhotoUrl && item.id) {
      const prod = fallbackStore.storeProducts.get(item.id);
      if (prod?.photoUrl) resolvedPhotoUrl = prod.photoUrl;
    }
    if (!resolvedPhotoUrl && targetNorm) {
      const allStoreProducts = Array.from(fallbackStore.storeProducts.values());
      const exactMatch = allStoreProducts.find((prod) => {
        if (!prod.photoUrl) return false;
        if (item.storeId && prod.storeId !== item.storeId) return false;
        return normalizeItemName(prod.name) === targetNorm;
      });
      if (exactMatch?.photoUrl) {
        resolvedPhotoUrl = exactMatch.photoUrl;
      } else {
        const partialMatch = allStoreProducts.find((prod) => {
          if (!prod.photoUrl) return false;
          if (item.storeId && prod.storeId !== item.storeId) return false;
          const pNorm = normalizeItemName(prod.name);
          return pNorm.includes(targetNorm) || targetNorm.includes(pNorm);
        });
        if (partialMatch?.photoUrl) {
          resolvedPhotoUrl = partialMatch.photoUrl;
        }
      }
    }

    // 1. Resolve Price
    let resolvedPrice: number | undefined = undefined;
    let priceLabel = '';

    if (item.price !== undefined && !isNaN(Number(item.price)) && Number(item.price) > 0) {
      resolvedPrice = Number(item.price);
      priceLabel = 'তালিকাভুক্ত মূল্য (Catalog Price)';
    }

    if (connectedShopOrder) {
      if (connectedShopOrder.itemsWithPrice && connectedShopOrder.itemsWithPrice.length > 0) {
        const found = connectedShopOrder.itemsWithPrice.find((ip: any) => {
          if (item.id && (ip.itemId === item.id || ip.originalId === item.id)) return true;
          const ipNorm = normalizeItemName(ip.name || '');
          return ipNorm === targetNorm || targetNorm.includes(ipNorm) || ipNorm.includes(targetNorm);
        });
        if (found && found.price !== undefined && !isNaN(Number(found.price))) {
          resolvedPrice = Number(found.price);
          priceLabel = 'দোকান ও হেল্পার কর্তৃক নির্ধারিত মূল্য (Store Verified Price)';
        }
      } else if (connectedShopOrder.price !== undefined && !isNaN(Number(connectedShopOrder.price))) {
        // If single item shop order
        const partsCount = (connectedShopOrder.requestText || '').split(/\r?\n/).filter(Boolean).length;
        if (partsCount <= 1) {
          resolvedPrice = Number(connectedShopOrder.price);
          priceLabel = 'দোকান মূল্য (Store Cost)';
        }
      }
    }

    // 2. Resolve Store Info
    let storeName = '';
    let storeType: string | undefined = undefined;
    let storeAddress: string | undefined = undefined;
    let isMyself = false;

    interface PhoneItem {
      label: string;
      number: string;
      personName?: string;
      isManager?: boolean;
    }
    const phones: PhoneItem[] = [];

    const activeShop = fetchedShop || (targetShopId ? fallbackStore.shops.get(targetShopId) : null);

    if (connectedShopOrder) {
      if (connectedShopOrder.shopId === 'myself') {
        isMyself = true;
        storeName = connectedShopOrder.sellerName || item.storeName || item.buyFrom || 'সরাসরি ক্রয় / নিজস্ব কেনাকাটা';
        if (connectedShopOrder.sellerPhone) {
          phones.push({
            label: 'বিক্রেতা / দোকান',
            number: connectedShopOrder.sellerPhone,
            personName: connectedShopOrder.sellerName,
          });
        }
      } else {
        storeName = activeShop?.name || connectedShopOrder.shopName || item.storeName || 'দোকান';
        storeType = activeShop?.type || activeShop?.category;
        storeAddress = activeShop?.location?.address || activeShop?.location?.details;

        if (activeShop?.whatsapp) {
          phones.push({
            label: 'দোকানের প্রধান নম্বর (WhatsApp)',
            number: activeShop.whatsapp,
            personName: activeShop.contactPerson,
          });
        }
        if (activeShop?.managerWhatsapp && activeShop.managerWhatsapp !== activeShop.whatsapp) {
          phones.push({
            label: 'ম্যানেজার (Manager)',
            number: activeShop.managerWhatsapp,
            personName: activeShop.managerName,
            isManager: true,
          });
        }
        if (connectedShopOrder.sellerPhone && !phones.some((p) => p.number === connectedShopOrder.sellerPhone)) {
          phones.push({
            label: 'বিক্রেতা / দোকান',
            number: connectedShopOrder.sellerPhone,
            personName: connectedShopOrder.sellerName,
          });
        }
      }
    }

    // If still not resolved via connectedShopOrder, check activeShop
    if (!storeName && activeShop) {
      storeName = activeShop.name;
      storeType = activeShop.type || activeShop.category;
      storeAddress = activeShop.location?.address || activeShop.location?.details;
      if (activeShop.whatsapp) {
        phones.push({
          label: 'দোকানের প্রধান নম্বর (WhatsApp)',
          number: activeShop.whatsapp,
          personName: activeShop.contactPerson,
        });
      }
      if (activeShop.managerWhatsapp && activeShop.managerWhatsapp !== activeShop.whatsapp) {
        phones.push({
          label: 'ম্যানেজার (Manager)',
          number: activeShop.managerWhatsapp,
          personName: activeShop.managerName,
          isManager: true,
        });
      }
    }

    // Check item.storeName
    if (!storeName && item.storeName) {
      storeName = item.storeName;
    }

    // Check matching shop by name from fallbackStore if no phones yet
    if (phones.length === 0 && storeName) {
      const matchShop = Array.from(fallbackStore.shops.values()).find(
        (s) => s.name.toLowerCase().trim() === storeName.toLowerCase().trim()
      );
      if (matchShop) {
        storeType = matchShop.type || matchShop.category;
        storeAddress = matchShop.location?.address || matchShop.location?.details;
        if (matchShop.whatsapp) {
          phones.push({
            label: 'দোকানের প্রধান নম্বর (WhatsApp)',
            number: matchShop.whatsapp,
            personName: matchShop.contactPerson,
          });
        }
        if (matchShop.managerWhatsapp && matchShop.managerWhatsapp !== matchShop.whatsapp) {
          phones.push({
            label: 'ম্যানেজার (Manager)',
            number: matchShop.managerWhatsapp,
            personName: matchShop.managerName,
            isManager: true,
          });
        }
      }
    }

    // Check item.buyFrom if still empty
    if (!storeName && item.buyFrom) {
      storeName = item.buyFrom;
    }

    // Fallback if none found
    if (!storeName) {
      storeName = 'দোকান এখনো নির্দিষ্ট করা হয়নি';
    }

    // Parse numeric quantity & unit if available
    let quantityNum = 1;
    if (typeof item.quantity === 'number' && item.quantity > 0) {
      quantityNum = item.quantity;
    } else if (item.qty) {
      const parsed = parseFloat(String(item.qty).replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))));
      if (!isNaN(parsed) && parsed > 0) {
        quantityNum = parsed;
      }
    }

    const unitDisplay = formatItemQuantityUnit(quantityNum, item.unit, item.qty);
    const totalPrice = resolvedPrice !== undefined ? Math.round((resolvedPrice * quantityNum) * 100) / 100 : undefined;

    return {
      resolvedPhotoUrl,
      resolvedPrice,
      totalPrice,
      unitDisplay,
      priceLabel,
      storeName,
      storeType,
      storeAddress,
      isMyself,
      phones,
      quantityNum,
    };
  }, [item, connectedShopOrder, fetchedShop, targetShopId]);

  if (!isOpen || !item || typeof document === 'undefined') {
    return null;
  }

  const cleanPhoneForTel = (phone: string) => phone.replace(/[^\d+]/g, '');

  const cleanPhoneForWa = (phone: string) => {
    let clean = phone.replace(/[^\d]/g, '');
    if (clean.startsWith('01')) {
      clean = '880' + clean.slice(1);
    }
    return clean;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden relative max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-modal-title"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/70 via-white to-purple-50/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="item-modal-title" className="text-base font-extrabold text-gray-900 leading-tight truncate">
                আইটেমের বিস্তারিত
              </h3>
              <p className="text-[11px] font-semibold text-gray-500">
                অর্ডার #{order.id.slice(-6).toUpperCase()}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* ── PRODUCT IMAGE SHOWCASE ── */}
          {details?.resolvedPhotoUrl ? (
            <div className="w-full h-52 rounded-2xl bg-gray-50 border border-gray-200/90 overflow-hidden relative shadow-inner flex items-center justify-center group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={details.resolvedPhotoUrl}
                alt={item.name}
                className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                loading="eager"
              />
              <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-[10px] text-white font-extrabold flex items-center gap-1 shadow-sm">
                <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                <span>পণ্যের ছবি</span>
              </div>
            </div>
          ) : (
            <div className="w-full py-4 px-4 rounded-2xl bg-gray-50/80 border border-dashed border-gray-200 flex items-center justify-center gap-2 text-gray-400">
              <Package className="w-5 h-5 text-gray-400" />
              <span className="text-xs font-semibold">এই পণ্যের কোনো ছবি সংরক্ষিত নেই</span>
            </div>
          )}

          {/* Item Name & Primary Badges */}
          <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-200/80 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                  পণ্যের নাম (Item Name)
                </span>
                <h4 className="text-base sm:text-lg font-black text-gray-900 leading-snug break-words">
                  {item.name}
                </h4>
              </div>

              {/* Quantity Pill */}
              {item.qty && (
                <span className="shrink-0 text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-xl shadow-2xs">
                  {item.qty}
                </span>
              )}
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {item.isCustom ? (
                <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200/80 px-2 py-0.5 rounded-lg flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                  কাস্টম পণ্য (Custom Request)
                </span>
              ) : (
                <span className="text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200/80 px-2 py-0.5 rounded-lg flex items-center gap-1">
                  <Tag className="w-2.5 h-2.5 text-blue-500" />
                  রেগুলার আইটেম
                </span>
              )}

              {item.unit && (
                <span className="text-[10px] font-bold text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-lg">
                  একক: {item.unit}
                </span>
              )}
            </div>

            {/* Buy From Note if specified */}
            {item.buyFrom && (
              <div className="pt-2 border-t border-gray-200/60 text-xs text-gray-600">
                <span className="font-bold text-gray-700">কোথা থেকে কিনতে হবে:</span>{' '}
                <span className="italic">{item.buyFrom}</span>
              </div>
            )}
          </div>

          {/* ── 1. PRODUCT COST CARD ── */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-4 rounded-2xl shadow-md relative overflow-hidden">
            <div className="relative z-10 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-100 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  পণ্যের দাম (Product Cost)
                </span>
                {details?.resolvedPrice !== undefined && (
                  <span className="text-[10px] bg-white/20 backdrop-blur-xs px-2 py-0.5 rounded-full font-bold">
                    নির্ধারিত
                  </span>
                )}
              </div>

              {details?.resolvedPrice !== undefined && details.totalPrice !== undefined ? (
                <div className="pt-1 space-y-2">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-3xl font-black font-mono tracking-tight">
                      ৳{details.totalPrice}
                    </span>
                    <span className="text-xs bg-white/20 backdrop-blur-xs px-2.5 py-1 rounded-xl font-bold font-mono text-white shadow-2xs">
                      {details.unitDisplay} × ৳{details.resolvedPrice} = ৳{details.totalPrice}
                    </span>
                  </div>

                  {/* Explicit breakdown table / row */}
                  <div className="bg-black/10 backdrop-blur-xs p-2.5 rounded-xl text-xs grid grid-cols-3 gap-2 border border-white/10 font-mono text-center">
                    <div className="bg-white/10 rounded-lg p-1.5">
                      <span className="text-[10px] text-emerald-100 block font-sans">একক মূল্য (Price)</span>
                      <strong className="text-white text-xs">৳{details.resolvedPrice}</strong>
                    </div>
                    <div className="bg-white/10 rounded-lg p-1.5">
                      <span className="text-[10px] text-emerald-100 block font-sans">পরিমাণ (Unit)</span>
                      <strong className="text-white text-xs">{details.unitDisplay}</strong>
                    </div>
                    <div className="bg-white/10 rounded-lg p-1.5 border border-white/20">
                      <span className="text-[10px] text-emerald-100 block font-sans">মোট (Total)</span>
                      <strong className="text-white text-xs font-black">৳{details.totalPrice}</strong>
                    </div>
                  </div>

                  {details.priceLabel && (
                    <p className="text-[10px] text-emerald-100/90 font-medium">
                      {details.priceLabel}
                    </p>
                  )}
                </div>
              ) : (
                <div className="pt-2 pb-1 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-200 font-bold text-sm">
                    <Clock className="w-4 h-4" />
                    <span>মূল্য অপেক্ষমাণ (Pending)</span>
                  </div>
                  <p className="text-[11px] text-white/90 leading-relaxed">
                    হেল্পার দোকানে গিয়ে ক্রয় করার সময় এই পণ্যের সঠিক মূল্য যুক্ত করবেন।
                  </p>
                </div>
              )}
            </div>

            {/* Decorative background circle */}
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          </div>

          {/* ── 2. STORE NAME & LOCATION ── */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-purple-600" />
                দোকানের নাম (Store Name)
              </span>
              {details?.storeType && (
                <span className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md">
                  {details.storeType}
                </span>
              )}
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h5 className="font-extrabold text-sm sm:text-base text-gray-900 leading-snug break-words">
                  {details?.storeName}
                </h5>
                {details?.isMyself && (
                  <p className="text-[11px] text-purple-800 font-medium mt-0.5">
                    সরাসরি বাজার / নিজস্ব কেনাকাটা
                  </p>
                )}
                {details?.storeAddress && (
                  <div className="flex items-start gap-1.5 text-xs text-gray-500 mt-1.5">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                    <span className="leading-snug break-words">{details.storeAddress}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 3. STORE CONTACT NUMBERS ── */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                যোগাযোগের নম্বর (Contact Numbers)
              </span>
              {details?.phones && details.phones.length > 0 && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {details.phones.length}টি নম্বর
                </span>
              )}
            </div>

            {details?.phones && details.phones.length > 0 ? (
              <div className="space-y-2.5">
                {details.phones.map((p, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-gray-50 border border-gray-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-extrabold text-gray-700">
                          {p.label}
                        </span>
                        {p.personName && (
                          <span className="text-[11px] text-gray-500 font-medium truncate">
                            • {p.personName}
                          </span>
                        )}
                      </div>
                      <p className="font-mono font-black text-sm text-gray-900 mt-0.5">
                        {p.number}
                      </p>
                    </div>

                    {/* Action buttons: Call & WhatsApp */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={`tel:${cleanPhoneForTel(p.number)}`}
                        className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                        title="সরাসরি কল করুন"
                      >
                        <Phone className="w-3 h-3 shrink-0" />
                        <span>কল</span>
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhoneForWa(p.number)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                        title="WhatsApp এ বার্তা পাঠান"
                      >
                        <MessageSquare className="w-3 h-3 shrink-0" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>দোকানের সরাসরি নম্বর উপলব্ধ নেই</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  পণ্য সংগ্রহ বা যেকোনো বিষয়ে জানতে নিচের বাটনে আপনার অর্ডারের হেল্পারের সাথে যোগাযোগ করতে পারেন।
                </p>
              </div>
            )}
          </div>

          {/* ── 4. HELPER CONTACT (CONVENIENT SHORTCUT) ── */}
          {order.helperPhone && (
            <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-2xs">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                    অর্ডারের হেল্পার
                  </span>
                  <p className="font-extrabold text-gray-900 truncate">
                    {order.helperName || 'হেল্পার'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={`tel:${cleanPhoneForTel(order.helperPhone)}`}
                  className="p-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 transition-all shadow-2xs active:scale-95 flex items-center justify-center"
                  title="হেল্পারকে কল করুন"
                >
                  <Phone className="w-3.5 h-3.5" />
                </a>
                <a
                  href={`https://wa.me/${cleanPhoneForWa(order.helperPhone)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-[#25D366] text-white hover:bg-[#1ebe5d] transition-all shadow-2xs active:scale-95 flex items-center justify-center"
                  title="হেল্পারকে WhatsApp করুন"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-xs transition-colors"
          >
            বন্ধ করুন (Close)
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
