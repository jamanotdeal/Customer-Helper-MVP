'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useModal } from './CustomModal';
import { OrderItem, LocationData, Order } from '@/types';
import { fallbackStore, saveCustomerSavedAddressToFirestore, saveCustomerPickupAddressToFirestore, initFcmMessaging } from '@/lib/firebase';
import { DEFAULT_INPUT_PLACEHOLDERS, DEFAULT_SERVICES, getServiceDescriptionHint, isOrderTimingOpen, calculateEstimatedFee, calculateDistanceKm } from '@/lib/pricing';
import { saveAltPhone, saveDefaultDeliveryLocation, getSavedAltPhone, getSavedDefaultDeliveryLocation, getServicePickupLocation, saveServicePickupLocation, getSavedDeliveryAddresses, addSavedDeliveryAddress, getSavedPickupAddresses, addSavedPickupAddress } from '@/lib/storage';
import { MapPin, Navigation, Phone, ArrowRight, ChevronDown, Check, Clock, AlertTriangle, AlertCircle, Coins, Sparkles, Gift, X } from 'lucide-react';
import { updateSEOMetadataClient } from '@/lib/seo';
import { formatShortAddress } from '@/utils/mapMarkerUtils';
import { MapPickerModal } from './MapPickerModal';
import { SavedAddressPicker } from './SavedAddressPicker';
import { AsyncButton } from './ui/AsyncButton';
import { requestNativePushPermission } from '@/lib/native';

interface RequestComposerProps {
  onOrderCreated: (order: Order) => void;
}

export const RequestComposer: React.FC<RequestComposerProps> = ({ onOrderCreated }) => {
  const { user, openAuthModal, updateCustomerPreferences } = useAuth();
  const { showAlert, showConfirm } = useModal();

  const [isExpanded, setIsExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Main description ("Ki korte hobe?")
  const [description, setDescription] = useState('');

  // Optional pickup / source location
  const [pickupNote, setPickupNote] = useState('');

  // WhatsApp number — pre-filled if saved
  const [altPhone, setAltPhone] = useState('');

  // Delivery Location state — pre-filled if saved
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(undefined);
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(undefined);

  // Pickup Location state
  const [pickupLat, setPickupLat] = useState<number | undefined>(undefined);
  const [pickupLng, setPickupLng] = useState<number | undefined>(undefined);

  // Map Picker Modal States
  const [showPickupMapPicker, setShowPickupMapPicker] = useState(false);
  const [showDeliveryMapPicker, setShowDeliveryMapPicker] = useState(false);
  const [mapHasError, setMapHasError] = useState(false);

  // Saved address picker state
  const [showSavedAddressPicker, setShowSavedAddressPicker] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<LocationData[]>([]);

  // Pickup saved-address picker state (service-scoped)
  const [showPickupAddressPicker, setShowPickupAddressPicker] = useState(false);
  const [savedPickupAddresses, setSavedPickupAddresses] = useState<LocationData[]>([]);

  // Previous unpaid due payment state
  const [unpaidDue, setUnpaidDue] = useState<{ totalAmount: number; notes: string[]; sourceOrderIds: string[] } | null>(null);

  // Free delivery / Discount via Coins state
  const [useFreeDelivery, setUseFreeDelivery] = useState(false);
  const [showInsufficientCoinsModal, setShowInsufficientCoinsModal] = useState(false);

  // Service selection state
  const [service, setService] = useState('');
  const [services, setServices] = useState<string[]>(
    fallbackStore.pricingSettings.services || DEFAULT_SERVICES
  );
  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);

  // Field validation errors
  const [errors, setErrors] = useState<{
    service?: string;
    description?: string;
    deliveryAddress?: string;
    altPhone?: string;
  }>({});

  // Close service dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (serviceDropdownRef.current && !serviceDropdownRef.current.contains(event.target as Node)) {
        setIsServiceDropdownOpen(false);
      }
    };
    if (isServiceDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isServiceDropdownOpen]);

  // Check whether a service is in the no-save list
  const isNoSavePickupService = (svc: string): boolean => {
    const noSaveList = fallbackStore.pricingSettings.noSavePickupLocationServices || [];
    const lowerSvc = svc.trim().toLowerCase();
    return noSaveList.some((n) => n.trim().toLowerCase() === lowerSvc);
  };

  // When service changes, pre-fill pickup from saved location (if allowed)
  const handleServiceChange = (newService: string) => {
    setService(newService);
    setErrors((prev) => ({ ...prev, service: undefined }));
    if (!isNoSavePickupService(newService)) {
      const saved = getServicePickupLocation(newService, user?.uid);
      const userPickupList = user?.uid ? getSavedPickupAddresses(user.uid) : [];
      if (saved?.address) {
        setPickupNote(saved.address);
        if (saved.lat) setPickupLat(saved.lat);
        if (saved.lng) setPickupLng(saved.lng);
        setSavedPickupAddresses(userPickupList.length > 0 ? userPickupList : [saved]);
      } else if (userPickupList.length > 0) {
        setSavedPickupAddresses(userPickupList);
      } else {
        setPickupNote('');
        setPickupLat(undefined);
        setPickupLng(undefined);
        setSavedPickupAddresses([]);
      }
    } else {
      setPickupNote('');
      setPickupLat(undefined);
      setPickupLng(undefined);
      setSavedPickupAddresses([]);
    }
  };

  // Cycling placeholders synced from admin panel
  const [placeholders, setPlaceholders] = useState<string[]>(
    fallbackStore.pricingSettings.inputPlaceholders || DEFAULT_INPUT_PLACEHOLDERS
  );
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Pre-fill service from URL query param if present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const serviceParam = params.get('service');
      if (serviceParam) {
        setService(serviceParam);
        setIsExpanded(true);
      }
    }
  }, []);

  // Update SEO metadata dynamically when selected service changes
  useEffect(() => {
    updateSEOMetadataClient(service);
  }, [service]);

  // Sync admin placeholders and services from store
  useEffect(() => {
    const syncPlaceholders = () => {
      const custom = fallbackStore.pricingSettings.inputPlaceholders;
      if (custom && custom.length > 0) {
        setPlaceholders(custom);
      }
      const customServices = fallbackStore.pricingSettings.services;
      if (customServices && customServices.length > 0) {
        setServices(customServices);
      }
    };
    syncPlaceholders();
    const unsub = fallbackStore.subscribe(syncPlaceholders);
    return () => unsub();
  }, []);

  // Pre-fill phone and delivery location if available
  useEffect(() => {
    if (user) {
      const savedPhone = getSavedAltPhone() || user.alternativePhone || '';
      if (savedPhone) setAltPhone(savedPhone);

      const savedLoc = getSavedDefaultDeliveryLocation() || user.defaultDeliveryLocation;
      if (savedLoc?.address) {
        setDeliveryAddress(formatShortAddress(savedLoc.address));
        if (savedLoc.lat) setDeliveryLat(savedLoc.lat);
        if (savedLoc.lng) setDeliveryLng(savedLoc.lng);
      }

      // Load saved delivery addresses from localStorage (populated from Firestore on login)
      const addresses = getSavedDeliveryAddresses(user.uid);
      setSavedAddresses(addresses);

      // Load saved pickup addresses from localStorage (populated from Firestore on login)
      const pickupAddresses = getSavedPickupAddresses(user.uid);
      if (pickupAddresses.length > 0) {
        setSavedPickupAddresses(pickupAddresses);
      }
    }
  }, [user]);

  // Sync customer's unpaid due payments from previous completed orders
  useEffect(() => {
    if (!user?.uid) {
      setUnpaidDue(null);
      return;
    }
    const syncDue = () => {
      const due = fallbackStore.getCustomerUnpaidDuePayments(user.uid);
      setUnpaidDue(due);
    };
    syncDue();
    const unsub = fallbackStore.subscribe(syncDue);
    return () => unsub();
  }, [user?.uid]);

  // Rotate placeholder every 2.8 s
  useEffect(() => {
    if (placeholders.length <= 1) return;
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [placeholders]);

  const currentPlaceholder = placeholders[placeholderIndex] || 'কী করতে হবে? যেমন: বাজার করতে হবে, ওষুধ আনতে হবে...';

  // Handle focus / click on main input (Guard unauthenticated users)
  const handleInputInteract = () => {
    if (!user || !user.uid || (user as any).displayName === '?' || (!user.email && !user.displayName)) {
      openAuthModal();
      return;
    }
    setIsExpanded(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !user.uid || (user as any).displayName === '?' || (!user.email && !user.displayName)) {
      openAuthModal();
      return;
    }

    const newErrors: typeof errors = {};

    if (!service || !service.trim()) {
      newErrors.service = 'সার্ভিস সিলেক্ট করা বাধ্যতামূলক';
    }

    if (!description.trim()) {
      newErrors.description = 'কী করতে হবে তার বিবরণ লিখুন';
    }

    if (!deliveryAddress.trim()) {
      newErrors.deliveryAddress = 'ডেলিভারি ঠিকানা সিলেক্ট করুন';
    }

    if (!altPhone.trim()) {
      newErrors.altPhone = 'হোয়াটসঅ্যাপ নম্বর দিন';
    } else if (!/^01[3-9]\d{8}$/.test(altPhone.trim())) {
      newErrors.altPhone = 'সঠিক ১১ ডিজিটের মোবাইল নম্বর লিখুন (যেমন: 01712345678)';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    const isConfirmed = await showConfirm(
      'Confirm Your Request',
      'আপনি কি নিশ্চিতভাবে এই অনুরোধটি সাবমিট করতে চান? ভুলবশত বা টেস্ট করার জন্য হলে বাতিল করুন।',
      'Yes, Submit Request',
      'Cancel'
    );

    if (!isConfirmed) {
      return;
    }

    setSubmitting(true);

    // Save preferences
    saveAltPhone(altPhone);
    const finalDelivLoc: LocationData = {
      address: deliveryAddress.trim(),
      lat: deliveryLat,
      lng: deliveryLng,
    };
    saveDefaultDeliveryLocation(finalDelivLoc);
    updateCustomerPreferences(altPhone, finalDelivLoc, undefined);

    // Build a single-item list from the description
    const singleItem: OrderItem = {
      id: 'item-1',
      name: description.trim(),
      qty: '1',
    };

    // Calculate initial estimated delivery fee
    const distKm = (pickupLat && pickupLng && deliveryLat && deliveryLng)
      ? calculateDistanceKm(pickupLat, pickupLng, deliveryLat, deliveryLng)
      : 0;
    const estdFee = calculateEstimatedFee({
      distanceKm: Math.ceil(distKm),
      weightKg: 0,
      isReturnRequested: false,
      productPrice: 0,
    }, fallbackStore.pricingSettings).totalFee;
    const initialFee = Math.max(estdFee, fallbackStore.pricingSettings.feeCalculatorMinFee ?? 20);

    const reqCoins = fallbackStore.pricingSettings.freeDeliveryRequiredCoins ?? 50;
    const isFree = useFreeDelivery && (user.coins || 0) >= reqCoins;
    const discountPct = fallbackStore.pricingSettings.freeDeliveryDiscountPercent ?? 100;
    const finalDeliveryFee = isFree
      ? (discountPct === 100 ? 0 : Math.round(initialFee * (100 - discountPct) / 100))
      : initialFee;

    // Generate zero-padded 5-digit order ID
    const orderNum = Math.floor(Math.random() * 90000) + 10000;
    const newOrder: Order = {
      id: `${orderNum}`,
      customerId: user.uid,
      customerName: user.displayName || 'Customer',
      customerPhone: altPhone,
      alternativePhone: altPhone,
      title: service,
      service: service,
      items: [singleItem],
      missingItemPreference: undefined,
      pickupLocation: pickupNote.trim()
        ? { address: pickupNote.trim(), lat: pickupLat, lng: pickupLng }
        : undefined,
      deliveryLocation: finalDelivLoc,
      additionalNote: undefined,
      status: 'PENDING',
      deliveryFee: finalDeliveryFee,
      originalDeliveryFee: initialFee,
      isFreeDelivery: isFree,
      deliveryDiscountPercent: isFree ? discountPct : undefined,
      coinsRedeemedForDelivery: isFree ? reqCoins : undefined,
      appliedDuePayment: (unpaidDue && unpaidDue.totalAmount > 0)
        ? {
            amount: unpaidDue.totalAmount,
            note: unpaidDue.notes.join('; ') || 'পূর্বের বকেয়া বাকি',
            sourceOrderIds: unpaidDue.sourceOrderIds,
          }
        : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusHistory: [
        {
          id: `sh-${Date.now()}`,
          status: 'PENDING',
          timestamp: new Date().toISOString(),
          actor: 'Customer',
          note: isFree ? `Request created (Free Delivery via ${reqCoins} Coins)` : 'Request created',
        },
      ],
    };

    await fallbackStore.addOrder(newOrder);

    // Reset form
    setDescription('');
    setService('');
    setIsServiceDropdownOpen(false);
    setPickupNote('');
    setPickupLat(undefined);
    setPickupLng(undefined);
    setIsExpanded(false);
    // Prompt notification permission on order submit so customer receives live helper updates
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
      try {
        const granted = await requestNativePushPermission();
        if (granted && user?.uid) {
          initFcmMessaging(user.uid).catch(() => {});
        }
      } catch (_) {}
    }

    // Show admin-configured confirmation message
    const confirmMsg =
      fallbackStore.pricingSettings.orderConfirmationMessage ||
      'আমরা আপনার অনুরোধটি পেয়েছি। শীঘ্রই একজন হেলপার গ্রহণ করবেন।';
    await showAlert('ধন্যবাদ!', confirmMsg, 'success');

    onOrderCreated(newOrder);
  };

  const timingStatus = isOrderTimingOpen(fallbackStore.pricingSettings);

  const handleDeliveryAddressClick = () => {
    if (mapHasError) return;
    if (savedAddresses.length > 0) {
      setShowSavedAddressPicker(true);
    } else {
      setShowDeliveryMapPicker(true);
    }
  };

  const handlePickupAddressClick = () => {
    if (mapHasError) return;
    if (savedPickupAddresses.length > 0) {
      setShowPickupAddressPicker(true);
    } else {
      setShowPickupMapPicker(true);
    }
  };

  return (
    <div className="w-full bg-white rounded-3xl shadow-xl shadow-emerald-950/5 border border-emerald-100 p-4 sm:p-6 transition-all duration-300">
      {user && !timingStatus.isOpen ? (
        <div className="text-center py-6 px-4 space-y-4 animate-in fade-in duration-300">
          <div className="inline-flex p-4 rounded-3xl bg-amber-50 border border-amber-200 text-amber-800 shadow-xs">
            <Clock className="w-8 h-8 animate-pulse text-amber-700" />
          </div>
          <div className="space-y-2">
            <h3 className="font-extrabold text-base text-gray-900">অনুরোধ গ্রহণ সাময়িকভাবে বন্ধ আছে</h3>
            <p className="text-xs font-semibold text-emerald-800 bg-emerald-50/80 border border-emerald-100 px-4 py-2 rounded-2xl inline-block leading-relaxed">
              {timingStatus.message}
            </p>
          </div>
          <p className="text-[11px] text-gray-400 font-medium">
            পরবর্তীতে পুনরায় চেষ্টা করার জন্য অনুরোধ করা হলো। ধন্যবাদ!
          </p>
        </div>
      ) : (
        <>
          {/* Header */}
          <button
            type="button"
            onClick={handleInputInteract}
            className="w-full text-center mb-4 group outline-none"
          >
            <h2 className="font-extrabold text-lg text-gray-900 mb-1">কী করতে হবে?</h2>
            <p
              key={placeholderIndex}
              className="text-sm font-semibold text-emerald-600 animate-in fade-in duration-500 min-h-[1.25rem] mt-1"
            >
              {currentPlaceholder}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">আপনার কাজটি বলুন — আমরা বাকিটা সামলে নেব।</p>
          </button>

          <form onSubmit={handleSubmit} className="space-y-3">

            {/* Expanded Form Fields */}
            {isExpanded && user && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">

                {/* Custom Service Selection Dropdown */}
                <div className={`relative ${isServiceDropdownOpen ? 'z-50' : 'z-10'}`} ref={serviceDropdownRef}>
                  {/* Full body dark backdrop overlay */}
                  {isServiceDropdownOpen && (
                    <div
                      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 animate-in fade-in duration-200"
                      onClick={() => setIsServiceDropdownOpen(false)}
                      aria-hidden="true"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => setIsServiceDropdownOpen((prev) => !prev)}
                    className={`w-full px-4 py-3.5 rounded-2xl border text-left flex items-center justify-between text-sm transition-all duration-200 cursor-pointer select-none relative ${
                      isServiceDropdownOpen
                        ? 'border-emerald-500 ring-4 ring-emerald-500/20 bg-white shadow-xl z-50'
                        : errors.service
                        ? 'border-red-400 bg-red-50/20 ring-2 ring-red-100'
                        : 'border-gray-200 bg-white hover:border-emerald-300'
                    }`}
                    aria-haspopup="listbox"
                    aria-expanded={isServiceDropdownOpen}
                  >
                    <span className={service ? 'text-gray-900 font-bold truncate' : 'text-gray-400 font-medium'}>
                      {service || 'সার্ভিস সিলেক্ট করুন *'}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 shrink-0 ml-2 ${
                        isServiceDropdownOpen ? 'rotate-180 text-emerald-600' : 'text-gray-400'
                      }`}
                    />
                  </button>

                  {errors.service && !isServiceDropdownOpen && (
                    <p className="text-[11px] font-semibold text-red-500 mt-1 pl-1 flex items-center gap-1 animate-in fade-in duration-150">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.service}</span>
                    </p>
                  )}

                  {/* Dropdown Options Menu */}
                  {isServiceDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-3xl shadow-2xl shadow-black/25 border border-emerald-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                      <div className="max-h-[520px] overflow-y-auto overscroll-contain divide-y divide-gray-100">
                        {services.map((srv) => {
                          const isSelected = service === srv;
                          return (
                            <button
                              key={srv}
                              type="button"
                              onClick={() => {
                                handleServiceChange(srv);
                                setIsServiceDropdownOpen(false);
                              }}
                              className={`w-full px-4 py-3.5 text-left text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer group ${
                                isSelected
                                  ? 'bg-emerald-50/90 text-emerald-950 font-extrabold'
                                  : 'text-gray-700 font-semibold hover:bg-emerald-50/40 hover:text-emerald-900 active:bg-gray-100'
                              }`}
                            >
                              <span className="truncate pr-2">{srv}</span>
                              {isSelected ? (
                                <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-xs ring-2 ring-emerald-500/30">
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-gray-200 group-hover:border-emerald-400 shrink-0 transition-colors" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Description box */}
                <div className="relative">
                  <textarea
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
                    }}
                    placeholder={getServiceDescriptionHint(service, fallbackStore.pricingSettings)}
                    className={`w-full px-4 py-3 rounded-2xl border outline-none text-sm text-gray-900 resize-none h-28 placeholder-gray-400 transition-colors ${
                      errors.description
                        ? 'border-red-400 bg-red-50/20 ring-2 ring-red-100 focus:border-red-500'
                        : 'border-emerald-200 bg-emerald-50/40 focus:border-emerald-500'
                    }`}
                  />
                  {errors.description && (
                    <p className="text-[11px] font-semibold text-red-500 mt-1 pl-1 flex items-center gap-1 animate-in fade-in duration-150">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.description}</span>
                    </p>
                  )}
                </div>

                {/* Pickup / Source Location (optional) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">কোথা থেকে আনতে হবে বা করতে হবে?</label>
                  <div className="relative group">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600 pointer-events-none" />
                    <input
                      type="text"
                      value={pickupNote}
                      onChange={(e) => setPickupNote(e.target.value)}
                      onClick={handlePickupAddressClick}
                      placeholder="কোথা থেকে নিতে হবে? (ক্লিক করে সিলেক্ট করুন)"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-sm text-gray-900 placeholder-gray-400 font-medium transition-colors cursor-pointer"
                      readOnly
                    />
                  </div>
                </div>

                {/* Delivery Address — clicks open saved address picker first, or map if none saved */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">ডেলিভারি ঠিকানা *</label>
                  <div className="relative group">
                    <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600 pointer-events-none" />
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => {
                        setDeliveryAddress(e.target.value);
                        if (errors.deliveryAddress) setErrors((prev) => ({ ...prev, deliveryAddress: undefined }));
                      }}
                      onClick={handleDeliveryAddressClick}
                      placeholder="ডেলিভারি ঠিকানা (ক্লিক করে সিলেক্ট করুন) *"
                      className={`w-full pl-10 pr-4 py-3 rounded-2xl border outline-none text-sm text-gray-900 placeholder-gray-400 font-medium transition-colors cursor-pointer ${
                        errors.deliveryAddress
                          ? 'border-red-400 bg-red-50/20 ring-2 ring-red-100 focus:border-red-500'
                          : 'border-gray-200 bg-white focus:border-emerald-500'
                      }`}
                      readOnly
                    />
                  </div>
                  {errors.deliveryAddress && (
                    <p className="text-[11px] font-semibold text-red-500 mt-1 pl-1 flex items-center gap-1 animate-in fade-in duration-150">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.deliveryAddress}</span>
                    </p>
                  )}
                </div>

                {/* WhatsApp Number */}
                <div className="relative">
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="tel"
                      value={altPhone}
                      onChange={(e) => {
                        setAltPhone(e.target.value);
                        if (errors.altPhone) setErrors((prev) => ({ ...prev, altPhone: undefined }));
                      }}
                      placeholder="হোয়াটসঅ্যাপ নম্বর *"
                      className={`w-full pl-10 pr-4 py-3 rounded-2xl border outline-none text-sm text-gray-900 placeholder-gray-400 transition-colors ${
                        errors.altPhone
                          ? 'border-red-400 bg-red-50/20 ring-2 ring-red-100 focus:border-red-500'
                          : 'border-gray-200 bg-white focus:border-emerald-500'
                      }`}
                    />
                  </div>
                  {errors.altPhone && (
                    <p className="text-[11px] font-semibold text-red-500 mt-1 pl-1 flex items-center gap-1 animate-in fade-in duration-150">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.altPhone}</span>
                    </p>
                  )}
                </div>

                {/* Free Delivery / Coins Discount Checkbox Card */}
                {(() => {
                  const reqCoins = fallbackStore.pricingSettings.freeDeliveryRequiredCoins ?? 50;
                  const userCoins = user?.coins || 0;
                  const hasEnough = userCoins >= reqCoins;

                  return (
                    <div
                      onClick={() => {
                        if (!user) {
                          openAuthModal();
                          return;
                        }
                        if (!hasEnough) {
                          setShowInsufficientCoinsModal(true);
                          return;
                        }
                        setUseFreeDelivery(!useFreeDelivery);
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                        useFreeDelivery
                          ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20 shadow-xs'
                          : 'bg-gradient-to-r from-amber-50/50 via-yellow-50/30 to-amber-50/50 border-amber-200/70 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={useFreeDelivery}
                          onChange={() => {}} // Handled by container click
                          className="w-4 h-4 accent-amber-600 rounded cursor-pointer shrink-0 pointer-events-none"
                        />
                        <span className="text-xs sm:text-sm font-bold text-gray-900">
                          Get Free Delivery
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Previous Unpaid Due Payment Card */}
                {unpaidDue && unpaidDue.totalAmount > 0 && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1 text-xs">
                    <div className="flex items-center justify-between font-bold text-amber-900">
                      <span className="flex items-center space-x-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>পূর্বের বাকি পেমেন্ট (Previous Due Payment)</span>
                      </span>
                      <span className="font-extrabold text-sm text-red-600">+৳{unpaidDue.totalAmount}</span>
                    </div>
                    {unpaidDue.notes.length > 0 && (
                      <p className="text-[11px] text-amber-800 font-medium pl-5.5">
                        <strong>নোট:</strong> {unpaidDue.notes.join('; ')}
                      </p>
                    )}
                    <p className="text-[10px] text-amber-700 italic pl-5.5 pt-0.5">
                      * এই বাকি পরিমাণটি আপনার নতুন অর্ডারের মোট বিলে যুক্ত থাকবে।
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* CTA / Submit Button */}
            {!isExpanded ? (
              <AsyncButton
                type="button"
                onClick={handleInputInteract}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2"
              >
                <span>Submit Your Request</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </AsyncButton>
            ) : (
              <AsyncButton
                type={user ? 'submit' : 'button'}
                onClick={!user ? handleInputInteract : undefined}
                isLoading={submitting}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-60"
              >
                <span>{user ? 'Submit' : 'Login to Submit'}</span>
                {!submitting && <ArrowRight className="w-4 h-4 ml-2" />}
              </AsyncButton>
            )}
          </form>
        </>
      )}

      {/* Pickup Saved Address Picker — shown first when pickup field clicked and a saved location exists */}
      <SavedAddressPicker
        isOpen={showPickupAddressPicker}
        onClose={() => setShowPickupAddressPicker(false)}
        savedAddresses={savedPickupAddresses}
        selectedAddress={{ address: pickupNote, lat: pickupLat, lng: pickupLng }}
        title="সেভ করা স্থান"
        subtitle="লোকেশন  সিলেক্ট করুন, না হলে নিচের বাটনে ক্লিক করে নতুন Address সেট করুন।"
        openMapLabel="No, অন্য ঠিকানা হবে!"
        onSelectAddress={(loc) => {
          const cleanAddr = formatShortAddress(loc.address);
          setPickupNote(cleanAddr);
          if (loc.lat) setPickupLat(loc.lat);
          if (loc.lng) setPickupLng(loc.lng);
        }}
        onOpenMap={() => setShowPickupMapPicker(true)}
      />

      {/* Saved Address Picker — shown first when delivery address field is clicked */}
      <SavedAddressPicker
        isOpen={showSavedAddressPicker}
        onClose={() => setShowSavedAddressPicker(false)}
        savedAddresses={savedAddresses}
        selectedAddress={{ address: deliveryAddress, lat: deliveryLat, lng: deliveryLng }}
        onSelectAddress={(loc) => {
          const cleanAddr = formatShortAddress(loc.address);
          setDeliveryAddress(cleanAddr);
          setErrors((prev) => ({ ...prev, deliveryAddress: undefined }));
          if (loc.lat) setDeliveryLat(loc.lat);
          if (loc.lng) setDeliveryLng(loc.lng);
        }}
        onOpenMap={() => setShowDeliveryMapPicker(true)}
      />

      {/* Map Picker Modals */}
      <MapPickerModal
        isOpen={showPickupMapPicker}
        onClose={() => setShowPickupMapPicker(false)}
        title="কোথা থেকে আনতে হবে বা করতে হবে?"
        modalType="pickup"
        initialLocation={{
          address: pickupNote,
          lat: pickupLat,
          lng: pickupLng,
        }}
        addressLabel="এখানে দোকানের, মার্কেটের বা এলাকার নাম লিখুন।"
        addressPlaceholder="Arif store, Ashulia bazar."
        onMapError={() => setMapHasError(true)}
        onSelectLocation={(loc) => {
          const cleanAddr = formatShortAddress(loc.address);
          setPickupNote(cleanAddr);
          if (loc.lat) setPickupLat(loc.lat);
          if (loc.lng) setPickupLng(loc.lng);
          const locToSave = { ...loc, address: cleanAddr };
          // Save per-category if service is not in no-save list
          if (service && !isNoSavePickupService(service)) {
            saveServicePickupLocation(service, locToSave, user?.uid);
          }
          if (user?.uid) {
            const updated = addSavedPickupAddress(user.uid, locToSave);
            setSavedPickupAddresses(updated);
            saveCustomerPickupAddressToFirestore(user.uid, locToSave, service).catch(() => {});
          }
        }}
      />

      <MapPickerModal
        isOpen={showDeliveryMapPicker}
        onClose={() => setShowDeliveryMapPicker(false)}
        title="ডেলিভারি ঠিকানা সিলেক্ট করুন"
        modalType="delivery"
        initialLocation={{
          address: deliveryAddress,
          lat: deliveryLat,
          lng: deliveryLng,
        }}
        addressLabel="আপনার বাসার নাম বা ঠিকানা লিখুন"
        addressPlaceholder="4A, Rahman vila, Model town."
        onMapError={() => setMapHasError(true)}
        onSelectLocation={(loc) => {
          const cleanAddr = formatShortAddress(loc.address);
          setDeliveryAddress(cleanAddr);
          setErrors((prev) => ({ ...prev, deliveryAddress: undefined }));
          if (loc.lat) setDeliveryLat(loc.lat);
          if (loc.lng) setDeliveryLng(loc.lng);
          // Auto-save new delivery address to localStorage + Firestore
          if (user && cleanAddr.trim()) {
            const locToSave = { ...loc, address: cleanAddr };
            const updated = addSavedDeliveryAddress(user.uid, locToSave);
            setSavedAddresses(updated);
            // Push to Firestore in background (non-blocking)
            saveCustomerSavedAddressToFirestore(user.uid, locToSave).catch(() => {});
          }
        }}
      />

      {/* Minimalist Insufficient Coins Custom Modal */}
      {showInsufficientCoinsModal && (
        <div
          className="fixed inset-0 z-[999999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowInsufficientCoinsModal(false)}
        >
          <div
            className="w-full max-w-[340px] bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 relative animate-in zoom-in-95 duration-150 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowInsufficientCoinsModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="pt-2 px-1">
              <h3 className="font-extrabold text-base text-gray-900 tracking-tight leading-snug">
                {fallbackStore.pricingSettings.insufficientCoinsTitle || 'Get Free Delivery'}
              </h3>
              <p className="mt-2.5 text-xs sm:text-[13px] text-gray-600 font-medium leading-relaxed whitespace-pre-line">
                {fallbackStore.pricingSettings.insufficientCoinsMessage || 'আপনার অ্যাকাউন্টে পর্যাপ্ত কয়েন নেই! ফ্রি ডেলিভারি পেতে আরও অর্ডার সম্পন্ন করে কয়েন অর্জন করুন।'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowInsufficientCoinsModal(false)}
              className="mt-5 w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
