'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useModal } from './CustomModal';
import { fallbackStore, saveCustomerSavedAddressToFirestore } from '@/lib/firebase';
import { Order, OrderItem, LocationData } from '@/types';
import { calculateEstimatedFee, calculateDistanceKm, isOrderTimingOpen } from '@/lib/pricing';
import { fetchRoadDistanceKm } from '@/lib/routeUtils';
import { hapticFeedback } from '@/lib/native';
import { AddCustomItemModal } from './AddCustomItemModal';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { isShopOpenNow } from './StoreGrid';
import {
  saveAltPhone,
  saveDefaultDeliveryLocation,
  getSavedDeliveryAddresses,
  addSavedDeliveryAddress,
  getPreviousCustomerContact,
} from '@/lib/storage';
import { saveScheduledOrder } from '@/utils/scheduledOrders';

import {
  X,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  Package,
  AlertCircle,
  AlertTriangle,
  Phone,
  Receipt,
  Scale,
  MapPin,
  Navigation,
  Send,
  Check,
  Edit2,
} from 'lucide-react';

interface CartSummaryDrawerProps {
  onOrderCreated?: (order: Order) => void;
}

export const CartSummaryDrawer: React.FC<CartSummaryDrawerProps> = ({
  onOrderCreated,
}) => {
  const {
    cartItems,
    cartShop,
    isCartDrawerOpen,
    highlightCustomItem,
    customItemInitialText,
    closeCartDrawer,
    updateQuantity,
    removeFromCart,
    clearCart,
    addCustomItem,
    addCustomItems,
    replaceCartItem,
    totalCartCount,
    subtotal,
  } = useCart();

  const { user, openAuthModal, updateCustomerPreferences } = useAuth();
  const { showAlert, showConfirm } = useModal();

  const savedContact = useMemo(() => {
    return getPreviousCustomerContact(
      user,
      typeof window !== 'undefined' ? Array.from(fallbackStore.orders.values()) : []
    );
  }, [user?.uid, isCartDrawerOpen]);

  const savedAddresses = useMemo(() => {
    if (!user?.uid) return [];
    return getSavedDeliveryAddresses(user.uid).map(
      (a) => fallbackStore.resolveLocation(a) || a
    );
  }, [user?.uid]);

  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [editingCustomItem, setEditingCustomItem] = useState<OrderItem | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState(
    savedContact.location?.address || user?.defaultDeliveryLocation?.address || ''
  );
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(
    savedContact.location?.lat ?? user?.defaultDeliveryLocation?.lat
  );
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(
    savedContact.location?.lng ?? user?.defaultDeliveryLocation?.lng
  );
  const [customerPhone, setCustomerPhone] = useState(
    savedContact.phone || user?.alternativePhone || user?.phoneNumber || ''
  );
  const [orderNotes, setOrderNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [formError, setFormError] = useState('');
  const [useFreeDelivery, setUseFreeDelivery] = useState(false);
  const [showInsufficientCoinsModal, setShowInsufficientCoinsModal] = useState(false);

  // Check if store or items' stores are closed
  const closedStoreNames = useMemo(() => {
    const list: string[] = [];
    if (cartShop && !isShopOpenNow(cartShop)) {
      list.push(cartShop.name);
    }
    cartItems.forEach((it) => {
      if (it.storeId) {
        const sh = fallbackStore.shops.get(it.storeId);
        if (sh && !isShopOpenNow(sh) && !list.includes(sh.name)) {
          list.push(sh.name);
        }
      }
    });
    return list;
  }, [cartShop, cartItems]);

  const customItemBtnRef = useRef<HTMLButtonElement | null>(null);

  // Sync previous saved delivery address and phone when drawer opens or user loads
  useEffect(() => {
    if (isCartDrawerOpen) {
      const contact = getPreviousCustomerContact(
        user,
        Array.from(fallbackStore.orders.values())
      );
      if (!deliveryAddress.trim() && contact.location?.address) {
        setDeliveryAddress(contact.location.address);
        setDeliveryLat(contact.location.lat);
        setDeliveryLng(contact.location.lng);
      }
      if (!customerPhone.trim() && contact.phone) {
        setCustomerPhone(contact.phone);
      }
    }
  }, [isCartDrawerOpen, user]);

  // Highlight and auto-scroll to custom item button when requested
  useEffect(() => {
    if (isCartDrawerOpen && highlightCustomItem) {
      const timer = setTimeout(() => {
        if (customItemBtnRef.current) {
          customItemBtnRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isCartDrawerOpen, highlightCustomItem]);

  // Auto route-based distance calculation
  const [routeDistanceKm, setRouteDistanceKm] = useState<number>(0);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);

  // Fallback straight line distance
  const rawDistanceKm = useMemo(() => {
    if (cartShop?.location?.lat && cartShop?.location?.lng && deliveryLat && deliveryLng) {
      return calculateDistanceKm(
        cartShop.location.lat,
        cartShop.location.lng,
        deliveryLat,
        deliveryLng
      );
    }
    return 0;
  }, [cartShop?.location?.lat, cartShop?.location?.lng, deliveryLat, deliveryLng]);

  // Compute route distance automatically based on actual roads
  useEffect(() => {
    let cancelled = false;

    const computeRouteDistance = async () => {
      const shopLat = cartShop?.location?.lat;
      const shopLng = cartShop?.location?.lng;

      if (shopLat && shopLng && deliveryLat && deliveryLng) {
        setIsCalculatingDistance(true);
        try {
          const distKm = await fetchRoadDistanceKm(
            { lat: shopLat, lng: shopLng },
            { lat: deliveryLat, lng: deliveryLng }
          );
          if (!cancelled) {
            setRouteDistanceKm(distKm);
          }
        } catch (e) {
          console.warn('[CartSummaryDrawer] Error calculating route distance:', e);
          if (!cancelled) {
            const straight = calculateDistanceKm(shopLat, shopLng, deliveryLat, deliveryLng);
            setRouteDistanceKm(Math.round(straight * 1.25 * 10) / 10);
          }
        } finally {
          if (!cancelled) {
            setIsCalculatingDistance(false);
          }
        }
      } else {
        setRouteDistanceKm(0);
        setIsCalculatingDistance(false);
      }
    };

    computeRouteDistance();

    return () => {
      cancelled = true;
    };
  }, [cartShop?.location?.lat, cartShop?.location?.lng, deliveryLat, deliveryLng]);

  const effectiveDistanceKm = useMemo(() => {
    if (routeDistanceKm > 0) return routeDistanceKm;
    if (rawDistanceKm > 0) return Math.round(rawDistanceKm * 1.25 * 10) / 10;
    return 1;
  }, [routeDistanceKm, rawDistanceKm]);

  // Pricing calculations: Weight is decided by helper, so base delivery fee uses weight 0
  const pricingSettings = fallbackStore.pricingSettings;
  const feeEst = useMemo(() => {
    const effectiveDist = Math.max(1, Math.ceil(effectiveDistanceKm));
    return calculateEstimatedFee(
      {
        distanceKm: effectiveDist,
        weightKg: 0,
        isReturnRequested: false,
        productPrice: subtotal,
      },
      pricingSettings
    );
  }, [effectiveDistanceKm, subtotal, pricingSettings]);

  if (!isCartDrawerOpen) return null;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      openAuthModal();
      return;
    }

    if (cartItems.length === 0) {
      setFormError('আপনার কার্টে কোনো পণ্য নেই।');
      return;
    }

    if (!deliveryAddress.trim()) {
      setFormError('অনুগ্রহ করে ডেলিভারি ঠিকানা উল্লেখ করুন।');
      return;
    }


    const totalPayable = subtotal + feeEst.deliverySubtotal + feeEst.processingFee;
    const confirmed = await showConfirm(
      'অর্ডার নিশ্চিতকরণ',
      `${cartShop?.name || 'স্টোর'} থেকে মোট ৳${totalPayable} টাকার অর্ডারটি সম্পন্ন করতে আপনি কি নিশ্চিত?`,
      'হ্যাঁ, নিশ্চিত করুন',
      'বাতিল'
    );
    if (!confirmed) {
      return;
    }

    setSubmittingOrder(true);
    setFormError('');

    try {
      const reqCoins = fallbackStore.pricingSettings?.freeDeliveryRequiredCoins ?? 50;
      const isFree = useFreeDelivery && (user?.coins || 0) >= reqCoins;
      const discountPct = fallbackStore.pricingSettings?.freeDeliveryDiscountPercent ?? 100;
      const rawDeliveryFee = feeEst.deliverySubtotal;
      const deliveryFee = isFree
        ? (discountPct === 100 ? 0 : Math.round(rawDeliveryFee * (100 - discountPct) / 100))
        : rawDeliveryFee;
      const processingFee = feeEst.processingFee;

      let orderNum = Math.floor(Math.random() * 90000) + 10000;
      while (fallbackStore.orders.has(`${orderNum}`)) {
        orderNum = Math.floor(Math.random() * 900000) + 100000;
      }

      const now = new Date().toISOString();
      const delivLoc: LocationData = {
        address: deliveryAddress.trim(),
        lat: deliveryLat,
        lng: deliveryLng,
      };

      const shopName = cartShop?.name || 'স্টোর';
      const isStoreCurrentlyClosed = closedStoreNames.length > 0;

      // Always include the store address even when closed — helpers need to know the intended source
      const pickupLoc: LocationData = {
        address: cartShop?.location?.address || shopName,
        name: shopName,
        lat: cartShop?.location?.lat,
        lng: cartShop?.location?.lng,
      };

      // If store was closed, append a helper-facing note so they know to source from any available store
      const baseNote = orderNotes.trim();
      const closedStoreNote = isStoreCurrentlyClosed
        ? `⚠️ দোকান বন্ধ ছিল: ${closedStoreNames.join(', ')} — অন্য যেকোনো দোকান থেকে পণ্য সংগ্রহ করুন।`
        : '';
      const finalNote = [closedStoreNote, baseNote].filter(Boolean).join('\n');

      const finalItems = (cartItems || []).map(item => {
        const itemShop = item.storeId ? fallbackStore.shops.get(item.storeId) : cartShop;
        const isShopClosed = itemShop ? (itemShop.isOpen === false || itemShop.isBlocked === true) : false;
        if (isShopClosed || isStoreCurrentlyClosed) {
          // Mark as custom and clear price — helper will determine the actual price
          return {
            ...item,
            isCustom: true,
            price: undefined,
          };
        }
        return item;
      });

      const newOrder: Order = {
        id: `${orderNum}`,
        customerId: user.uid,
        customerName: user.displayName || 'Customer',
        customerPhone: customerPhone || user.phoneNumber || '',
        alternativePhone: customerPhone || undefined,
        title: `${shopName} থেকে অর্ডার`,
        service: 'বাজার-সদাই করে দিন',
        shopId: cartShop?.id,
        selectedShopIds: cartShop?.id ? [cartShop.id] : [],
        isStoreOrder: true,
        creatorRole: 'customer',
        isStoreClosedAtOrder: isStoreCurrentlyClosed || undefined,
        items: finalItems,
        pickupLocation: pickupLoc,
        deliveryLocation: delivLoc,
        additionalNote: finalNote || undefined,
        status: 'PENDING',
        deliveryFee,
        originalDeliveryFee: rawDeliveryFee,
        isFreeDelivery: isFree || undefined,
        deliveryDiscountPercent: isFree ? discountPct : undefined,
        coinsRedeemedForDelivery: isFree ? reqCoins : undefined,
        processingFee: processingFee > 0 ? processingFee : undefined,
        weightKg: undefined, // Weight decided by helper upon pickup/purchase
        productCost: subtotal > 0 ? subtotal : undefined,
        createdAt: now,
        updatedAt: now,
        statusHistory: [
          {
            id: `sh-${Date.now()}`,
            status: 'PENDING',
            timestamp: now,
            actor: 'Customer',
            note: isStoreCurrentlyClosed
              ? `${shopName} বন্ধ ছিল — ${totalCartCount}টি পণ্যের রিকোয়েস্ট তৈরি হয়েছে (অন্য দোকান থেকে সংগ্রহযোগ্য)`
              : `${shopName} থেকে ${totalCartCount}টি পণ্যের রিকোয়েস্ট তৈরি করা হয়েছে`,
          },
        ],
      };
      // Check if platform service is currently open
      const serviceTiming = isOrderTimingOpen(fallbackStore.pricingSettings);
      if (!serviceTiming.isOpen) {
        const scheduledOrder: Order = {
          ...newOrder,
          status: 'SCHEDULED' as any,
          isScheduled: true,
          scheduledAt: new Date().toISOString(),
          scheduledNote: serviceTiming.message || undefined,
        };
        saveScheduledOrder(scheduledOrder);
        if (customerPhone.trim()) saveAltPhone(customerPhone.trim());
        if (delivLoc.address) {
          saveDefaultDeliveryLocation(delivLoc);
          if (user.uid) {
            addSavedDeliveryAddress(user.uid, delivLoc);
            saveCustomerSavedAddressToFirestore(user.uid, delivLoc).catch(() => { });
          }
        }
        updateCustomerPreferences(customerPhone.trim() || undefined, delivLoc, undefined);
        hapticFeedback('medium');
        showAlert(
          'রিকোয়েস্ট শিডিউল হয়েছে!',
          (serviceTiming.message || 'এখন সার্ভিস বন্ধ আছে।') +
          ' সার্ভিস সময় শুরু হলে এই রিকোয়েস্ট স্বয়ংক্রিয়ভাবে হেলপারদের কাছে পাঠানো হবে।',
          'info'
        );
        clearCart();
        closeCartDrawer();
        if (onOrderCreated) onOrderCreated(scheduledOrder as Order);
        return;
      }

      await fallbackStore.addOrder(newOrder);

      // Save customer phone and delivery location so they are remembered for future orders
      if (customerPhone.trim()) {
        saveAltPhone(customerPhone.trim());
      }
      if (delivLoc.address) {
        saveDefaultDeliveryLocation(delivLoc);
        if (user.uid) {
          addSavedDeliveryAddress(user.uid, delivLoc);
          saveCustomerSavedAddressToFirestore(user.uid, delivLoc).catch(() => { });
        }
      }
      updateCustomerPreferences(customerPhone.trim() || undefined, delivLoc, undefined);

      hapticFeedback('medium');
      showAlert(
        'অর্ডার সফল হয়েছে!',
        `${shopName} থেকে আপনার অর্ডার রিকোয়েস্ট সফলভাবে তৈরি হয়েছে। হেলপার খুব শীঘ্রই অর্ডারটি গ্রহণ করবে।`,
        'success'
      );

      clearCart();
      closeCartDrawer();

      if (onOrderCreated) {
        onOrderCreated(newOrder);
      }
    } catch (err) {
      console.error('Failed to place store order:', err);
      setFormError('অর্ডার সম্পন্ন করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeCartDrawer();
        }}
      >
        <div className="bg-white rounded-t-3xl w-full max-h-[92vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
          {/* Drawer Header */}
          <div className="flex items-center justify-between p-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-gray-900 leading-tight">
                  Cart Summary
                </h2>
                <p className="text-[11px] text-gray-500 font-medium">
                  {cartShop?.name || 'স্টোর'} • {totalCartCount}টি পণ্য
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closeCartDrawer}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain">
            {formError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Closed Store Notice */}
            {closedStoreNames.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300/90 shadow-xs flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-md">
                      দোকান বন্ধ
                    </span>
                    <span className="text-sm font-black text-amber-950">
                      {closedStoreNames.join(', ')}
                    </span>
                  </div>
                  <p className="text-xs sm:text-[13px] font-bold text-amber-900 leading-snug">
                    দোকান বন্ধ থাকায় হেলপার অন্য দোকান থেকে সংগ্রহ করবে। মূল্য পরিবর্তন হতে পারে।
                  </p>
                </div>
              </div>
            )}

            {/* Items List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm sm:text-base font-black text-gray-900 tracking-tight">
                  নির্বাচিত পণ্যের তালিকা
                </h3>
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = await showConfirm(
                        'কার্ট খালি করুন',
                        'আপনি কি কার্টের সকল পণ্য মুছে ফেলতে চান?',
                        'হ্যাঁ, মুছে ফেলুন',
                        'বাতিল'
                      );
                      if (confirmed) {
                        clearCart();
                      }
                    }}
                    className="text-[11px] text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>সব মুছুন</span>
                  </button>
                )}
              </div>

              {cartItems.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <Package className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                  <p className="font-bold text-gray-600">কার্টে কোনো পণ্য নেই</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">দোকান থেকে পণ্য নির্বাচন করুন অথবা কাস্টম পণ্য যোগ করুন</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cartItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100"
                    >
                      {/* Item image or icon on left */}
                      <div className="w-12 h-12 rounded-xl bg-white border border-gray-200/80 shrink-0 overflow-hidden flex items-center justify-center shadow-2xs">
                        {item.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.photoUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : item.isCustom ? (
                          <div className="w-full h-full bg-amber-50 flex items-center justify-center text-amber-600">
                            <Sparkles className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="w-full h-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <Package className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-sm sm:text-[15px] text-gray-900 leading-snug truncate">
                            {item.name}
                          </span>
                          {item.isCustom && (
                            <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0">
                              কাস্টম
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                          {item.unit && <span>{item.unit}</span>}
                          {item.price !== undefined ? (
                            <span className="font-extrabold text-emerald-700">
                              ৳{item.price} × {item.quantity || 1} = ৳
                              {(item.price || 0) * (item.quantity || 1)}
                            </span>
                          ) : (
                            <span className="text-amber-700 font-semibold">
                              {item.qty} • মূল্য হেলপার যাচাই করবে
                            </span>
                          )}
                        </div>
                        {item.buyFrom && (
                          <p className="text-[10px] text-gray-400 truncate">
                            উৎস: {item.buyFrom}
                          </p>
                        )}
                      </div>

                      {/* Quantity Counter or Delete */}
                      <div className="flex items-center gap-2 shrink-0">
                        {!item.isCustom ? (
                          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-0.5">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, -1)}
                              className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-all cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-black px-1 text-gray-800">
                              {item.quantity || 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, 1)}
                              className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-all cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-gray-600 bg-white border border-gray-200 px-2 py-1 rounded-xl">
                              {item.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCustomItem(item);
                                setShowAddCustomModal(true);
                              }}
                              className="p-1 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                              title="কাস্টম তথ্য পরিবর্তন করুন"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          className="p-1.5 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── ADD CUSTOM ITEM OPTION (Highlighted with attention animation) ── */}
            <div className="relative">
              {highlightCustomItem && (
                <div className="mb-1.5 flex items-center justify-center gap-1 text-[10px] font-black text-amber-800 bg-amber-100/90 px-2.5 py-0.5 rounded-full animate-bounce">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  <span>মিসিং পণ্য বা অন্য কোনো সেবা যোগ করতে এখানে ক্লিক করুন</span>
                </div>
              )}

              <button
                ref={customItemBtnRef}
                type="button"
                id="cart-summary-add-custom-item-btn"
                onClick={() => {
                  setEditingCustomItem(null);
                  setShowAddCustomModal(true);
                }}
                className={`w-full py-2 px-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-center gap-2 text-xs font-black shadow-sm animate-pulse ${highlightCustomItem
                    ? 'border-amber-500 bg-amber-100 text-amber-950 ring-4 ring-amber-400/70 shadow-lg shadow-amber-300/40 scale-[1.01]'
                    : 'border-amber-400 bg-gradient-to-r from-amber-50 via-orange-50/70 to-amber-50 hover:bg-amber-100/90 text-amber-950 hover:border-amber-500 ring-2 ring-amber-400/60 shadow-md shadow-amber-200/40 active:scale-[0.98]'
                  }`}
              >
                <span className="w-5 h-5 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Plus className="w-3 h-3 stroke-[3]" />
                </span>
                <span className="leading-snug">প্ল্যাটফর্মে নেই এমন কাস্টম পণ্য বা সার্ভিস যোগ করুন</span>
                {highlightCustomItem ? (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-600 text-white text-[9px] font-black uppercase">
                    HERE
                  </span>
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0 animate-pulse" />
                )}
              </button>
            </div>

            {/* Delivery & Contact Information */}
            {cartItems.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <h3 className="text-xs sm:text-sm font-black text-gray-900 uppercase tracking-wide flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  ডেলিভারির তথ্য
                </h3>

                {/* Delivery Address Autocomplete */}
                <div>
                  <label className="text-[11px] font-bold text-gray-700 block mb-1">
                    আপনার ডেলিভারি ঠিকানা <span className="text-rose-500">*</span>
                  </label>
                  <AddressAutocompleteInput
                    value={deliveryAddress}
                    onChange={(val, loc) => {
                      setDeliveryAddress(val);
                      if (loc?.lat !== undefined) setDeliveryLat(loc.lat);
                      if (loc?.lng !== undefined) setDeliveryLng(loc.lng);
                    }}
                    savedLocalAddresses={savedAddresses}
                    placeholder="যেমন: বাসা #৪, রোড #২,  Model Twon..."
                    inputClassName="!text-xs !py-2 !rounded-xl !text-gray-800 placeholder:!text-[11px]"
                  />
                </div>

                {/* Contact phone */}
                <div>
                  <label className="text-[11px] font-bold text-gray-700 block mb-1">
                    Whatsapp Number
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-800 outline-none focus:border-emerald-600 placeholder:text-[11px]"
                    />
                  </div>
                </div>

                {/* Optional note */}
                <div>
                  <label className="text-[11px] font-bold text-gray-700 block mb-1">
                    বিশেষ নির্দেশনা (যদি থাকে)
                  </label>
                  <textarea
                    rows={2}
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="যেমন: ৩য় তলা, বেল বাজাবেন, বা দ্রুত পাঠাবেন..."
                    className="w-full p-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-800 outline-none focus:border-emerald-600 placeholder:text-[11px]"
                  />
                </div>

                {/* Pricing / Calculation Summary */}
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-gray-700">
                    <span className="flex items-center gap-1">
                      <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                      পণ্য / সেবামূল্য (Subtotal):
                    </span>
                    <span className="font-black text-gray-900">
                      ৳{subtotal}
                      {cartItems.some((i) => i.isCustom) && ' + কাস্টম মূল্য'}
                    </span>
                  </div>

                  {/* Delivery Distance with per-km rate and cost */}
                  <div className="flex items-center justify-between text-gray-600 text-[11px]">
                    <span className="flex items-center gap-1">
                      <Navigation className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ডেলিভারি দূরত্ব (৳{feeEst.perKmRate}/কিমি):
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isCalculatingDistance ? (
                        <span className="text-gray-400 font-semibold animate-pulse text-[10px]">
                          হিসেব হচ্ছে...
                        </span>
                      ) : (
                        <>
                          <span className="text-[10px] text-gray-500 font-semibold">
                            {effectiveDistanceKm > 0 ? `${effectiveDistanceKm.toFixed(1)} কিমি` : '১ কিমি'}
                          </span>
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-1 rounded uppercase">
                            Auto
                          </span>
                          <span className="font-black text-emerald-800">৳{feeEst.deliverySubtotal}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Weight with per-kg rate */}
                  <div className="flex items-center justify-between text-gray-600 text-[11px]">
                    <span className="flex items-center gap-1">
                      <Scale className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      পণ্য ওজন (৳{feeEst.perKgRate}/কেজি):
                    </span>
                    <span className="font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded text-[10px]">
                      Unknown
                    </span>
                  </div>



                  {feeEst.processingFee > 0 && (
                    <div className="flex items-center justify-between text-gray-500 text-[11px]">
                      <span>প্রসেসিং ফি:</span>
                      <span className="font-bold">৳{feeEst.processingFee}</span>
                    </div>
                  )}

                  {/* Free Delivery Coin Claim Toggle */}
                  {(() => {
                    const reqCoins = fallbackStore.pricingSettings?.freeDeliveryRequiredCoins ?? 50;
                    const userCoins = user?.coins || 0;
                    const hasEnough = userCoins >= reqCoins;
                    return (
                      <div
                        onClick={() => {
                          if (!user || !hasEnough) {
                            setShowInsufficientCoinsModal(true);
                            return;
                          }
                          setUseFreeDelivery((prev) => !prev);
                        }}
                        className={`mt-1 p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${useFreeDelivery
                            ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/20'
                            : 'bg-gradient-to-r from-amber-50/50 to-yellow-50/30 border-amber-200/70 hover:border-amber-300'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={useFreeDelivery}
                            readOnly
                            className="w-3.5 h-3.5 accent-amber-600 rounded pointer-events-none"
                          />
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-[11px] font-bold text-gray-900">ফ্রি ডেলিভারি ক্লেম করুন!</span>
                        </div>
                        <span className="text-[10px] text-amber-700 font-extrabold">
                          {userCoins}/{reqCoins} Coins
                        </span>
                      </div>
                    );
                  })()}

                  <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between font-black text-emerald-950 text-sm">
                    <span>Total</span>
                    <span className="text-base text-emerald-700 font-black">
                      {useFreeDelivery ? (
                        <>
                          <span className="line-through text-gray-400 text-xs mr-1">৳{subtotal + feeEst.deliverySubtotal + feeEst.processingFee}</span>
                          <span>৳{subtotal + feeEst.processingFee}</span>
                          <span className="text-emerald-600 text-[10px] ml-1">(ফ্রি ডেলিভারি)</span>
                        </>
                      ) : (
                        <>৳{subtotal + feeEst.deliverySubtotal + feeEst.processingFee}</>
                      )}
                      {cartItems.some((i) => i.isCustom) && (
                        <span className="text-[10px] text-amber-700 ml-1 font-bold">
                          (+কাস্টম)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer Actions */}
          <div className="p-4 border-t border-gray-100 bg-white space-y-2">
            {cartItems.length > 0 ? (
              <button
                type="button"
                onClick={handleSubmitOrder}
                disabled={submittingOrder}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {submittingOrder ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>অর্ডার তৈরি হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit Request (৳{subtotal + feeEst.deliverySubtotal + feeEst.processingFee})</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={closeCartDrawer}
                className="w-full py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
              >
                পণ্য দেখতে ফিরে যান
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Custom Item Modal */}
      <AddCustomItemModal
        isOpen={showAddCustomModal}
        onClose={() => {
          setShowAddCustomModal(false);
          setEditingCustomItem(null);
        }}
        isEditing={editingCustomItem !== null}
        defaultBuyFrom={editingCustomItem?.buyFrom || cartShop?.name}
        defaultDescription={editingCustomItem?.name || customItemInitialText}
        defaultQuantity={editingCustomItem?.qty}
        onAddItems={(items) => {
          if (editingCustomItem) {
            replaceCartItem(editingCustomItem.id, items);
          } else {
            addCustomItems(items, cartShop || undefined);
          }
          setEditingCustomItem(null);
          setShowAddCustomModal(false);
        }}
        onAddItem={(item) => {
          if (editingCustomItem) {
            replaceCartItem(editingCustomItem.id, [item]);
          } else {
            addCustomItems([item], cartShop || undefined);
          }
          setEditingCustomItem(null);
          setShowAddCustomModal(false);
        }}
      />


      {/* Insufficient Coins Modal */}
      {showInsufficientCoinsModal && (
        <div
          className="fixed inset-0 z-[100002] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setShowInsufficientCoinsModal(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shadow-sm">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-extrabold text-base text-gray-900">
                {fallbackStore.pricingSettings?.insufficientCoinsTitle || 'ফ্রি ডেলিভারি'}
              </h3>
              <p className="text-xs text-gray-600 font-medium leading-relaxed">
                {fallbackStore.pricingSettings?.insufficientCoinsMessage || 'আপনার অ্যাকাউন্টে পর্যাপ্ত কয়েন নেই। ফ্রি ডেলিভারি পেতে আরও অর্ডার সম্পন্ন করে কয়েন অর্জন করুন।'}
              </p>
              <div className="mt-2 py-2 px-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs font-semibold text-amber-900 flex items-center justify-between">
                <span>প্রয়োজন: <strong>{fallbackStore.pricingSettings?.freeDeliveryRequiredCoins ?? 50} Coins</strong></span>
                <span>আপনার আছে: <strong className="text-emerald-700">{user?.coins || 0} Coins</strong></span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowInsufficientCoinsModal(false)}
              className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs cursor-pointer transition-colors shadow-sm"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}
    </>
  );
};
