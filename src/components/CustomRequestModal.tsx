'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, isUserAuthenticated } from '@/context/AuthContext';
import { useModal } from './CustomModal';
import { Order, OrderItem, LocationData } from '@/types';
import { fallbackStore, saveCustomerSavedAddressToFirestore } from '@/lib/firebase';
import { DEFAULT_SERVICES, calculateEstimatedFee, getServiceDescriptionHint, isOrderTimingOpen } from '@/lib/pricing';
import {
  X, Sparkles, Send, MapPin, Phone, ArrowRight,
  ShoppingBag, Pill, Utensils, Shirt, Package, AlertCircle, Check, ChevronDown
} from 'lucide-react';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { PlatformClosedScheduleModal } from './PlatformClosedScheduleModal';
import {
  saveAltPhone,
  saveDefaultDeliveryLocation,
  getSavedDeliveryAddresses,
  addSavedDeliveryAddress,
  getPreviousCustomerContact,
} from '@/lib/storage';
import { saveScheduledOrder, getNextPlatformOpeningTime, formatScheduledTime } from '@/utils/scheduledOrders';

interface CustomRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialService?: string;
  initialDescription?: string;
  onOrderCreated?: (order: Order) => void;
}

const getServiceIcon = (svcName: string) => {
  const lower = svcName.toLowerCase();
  if (lower.includes('বাজার') || lower.includes('bazar')) return <ShoppingBag className="w-4 h-4 text-emerald-600" />;
  if (lower.includes('ওষুধ') || lower.includes('মেডিসিন') || lower.includes('medicine')) return <Pill className="w-4 h-4 text-rose-500" />;
  if (lower.includes('খাবার') || lower.includes('food') || lower.includes('khabar')) return <Utensils className="w-4 h-4 text-amber-500" />;
  if (lower.includes('কাপড়') || lower.includes('আয়রন') || lower.includes('laundry')) return <Shirt className="w-4 h-4 text-indigo-500" />;
  if (lower.includes('পার্সেল') || lower.includes('parcel')) return <Package className="w-4 h-4 text-sky-500" />;
  return <Sparkles className="w-4 h-4 text-emerald-600" />;
};

export const CustomRequestModal: React.FC<CustomRequestModalProps> = ({
  isOpen,
  onClose,
  initialService,
  initialDescription,
  onOrderCreated,
}) => {
  const { user, openAuthModal, updateCustomerPreferences } = useAuth();
  const { showAlert, showConfirm } = useModal();

  const [services, setServices] = useState<string[]>(() => {
    return fallbackStore.pricingSettings.services || DEFAULT_SERVICES;
  });
  const [selectedService, setSelectedService] = useState(initialService || '');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const [description, setDescription] = useState(initialDescription || '');
  const [pickupNote, setPickupNote] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [altPhone, setAltPhone] = useState(user?.phoneNumber || '');
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(undefined);
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(undefined);
  const [pickupLat, setPickupLat] = useState<number | undefined>(undefined);
  const [pickupLng, setPickupLng] = useState<number | undefined>(undefined);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [useFreeDelivery, setUseFreeDelivery] = useState(false);
  const [showInsufficientCoinsModal, setShowInsufficientCoinsModal] = useState(false);
  const [showPlatformClosedModal, setShowPlatformClosedModal] = useState(false);

  // Sync services from settings
  useEffect(() => {
    const sync = () => {
      const svcs = fallbackStore.pricingSettings.services;
      if (svcs && svcs.length > 0) {
        setServices(svcs);
      } else {
        setServices(DEFAULT_SERVICES);
      }
    };
    sync();
    return fallbackStore.subscribe(sync);
  }, []);

  const savedAddresses = React.useMemo(() => {
    if (!user?.uid) return [];
    return getSavedDeliveryAddresses(user.uid).map(
      (a) => fallbackStore.resolveLocation(a) || a
    );
  }, [user?.uid]);

  const allServiceOptions = React.useMemo(() => {
    const list = [...services];
    if (selectedService && !list.includes(selectedService)) {
      return [selectedService, ...list];
    }
    return list;
  }, [services, selectedService]);

  useEffect(() => {
    if (initialService !== undefined) {
      setSelectedService(initialService);
    }
  }, [initialService]);

  useEffect(() => {
    if (initialDescription !== undefined) {
      setDescription(initialDescription);
    }
  }, [initialDescription]);

  // Pre-fill previous saved number and delivery address whenever modal opens or user loads
  useEffect(() => {
    if (isOpen) {
      setIsDropdownOpen(false);
      if (initialService !== undefined) {
        setSelectedService(initialService);
      }
      if (initialDescription !== undefined) {
        setDescription(initialDescription);
      }
      const contact = getPreviousCustomerContact(
        user,
        Array.from(fallbackStore.orders.values())
      );
      if (!deliveryAddress.trim() && contact.location?.address) {
        setDeliveryAddress(contact.location.address);
        setDeliveryLat(contact.location.lat);
        setDeliveryLng(contact.location.lng);
      }
      if (!altPhone.trim() && contact.phone) {
        setAltPhone(contact.phone);
      }
      setError('');
    }
  }, [isOpen, initialService, initialDescription, user?.uid]);

  if (!isOpen) return null;

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    }
    setIsDropdownOpen(true);
  };

  const handleSubmit = async (
    e?: React.FormEvent,
    scheduledOptions?: { isScheduled?: boolean; scheduledDate?: Date; scheduledNote?: string }
  ) => {
    if (e) e.preventDefault();
    if (!isUserAuthenticated(user)) {
      openAuthModal();
      return;
    }

    if (!selectedService || !selectedService.trim()) {
      setError('সার্ভিস নির্বাচন করা বাধ্যতামূলক। অনুগ্রহ করে একটি সার্ভিস বেছে নিন।');
      setIsDropdownOpen(true);
      return;
    }

    if (!description.trim()) {
      setError('কী কাজ করতে হবে বা কী লাগবে তা বিস্তারিত লিখুন।');
      return;
    }

    if (!deliveryAddress.trim()) {
      setError('ডেলিভারি ঠিকানা উল্লেখ করুন।');
      return;
    }

    // Check platform timing (Order Timing & Form Controls)
    const serviceTiming = isOrderTimingOpen(fallbackStore.pricingSettings);
    if (!serviceTiming.isOpen && !scheduledOptions?.isScheduled) {
      setShowPlatformClosedModal(true);
      return;
    }

    if (!scheduledOptions?.isScheduled) {
      const confirmed = await showConfirm(
        'রিকোয়েস্ট নিশ্চিতকরণ',
        `আপনি কি "${selectedService}" এর রিকোয়েস্টটি নিশ্চিত করতে চান?`,
        'হ্যাঁ, রিকোয়েস্ট পাঠান',
        'বাতিল'
      );
      if (!confirmed) {
        return;
      }
    }

    // Close the modal immediately so customers see the order is being processed
    // and can't accidentally interact with the form inputs during submission
    onClose();
    setSubmitting(true);
    setError('');

    try {
      const rawNames = description
        .split(/[\n\r,၊，]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const itemsToCreate: OrderItem[] = (rawNames.length > 0 ? rawNames : [description.trim()]).map((name, idx) => ({
        id: `custom-req-${Date.now()}-${idx}`,
        name,
        qty: '১',
        isCustom: true,
        buyFrom: pickupNote.trim() || undefined,
      }));

      const delivLoc: LocationData = {
        address: deliveryAddress.trim(),
        lat: deliveryLat,
        lng: deliveryLng,
      };

      const pickupLoc: LocationData | undefined = pickupNote.trim()
        ? {
          address: pickupNote.trim(),
          lat: pickupLat,
          lng: pickupLng,
        }
        : undefined;

      const reqCoins = fallbackStore.pricingSettings?.freeDeliveryRequiredCoins ?? 50;
      const isFree = useFreeDelivery && (user?.coins || 0) >= reqCoins;
      const discountPct = fallbackStore.pricingSettings?.freeDeliveryDiscountPercent ?? 100;
      const rawFee = fallbackStore.pricingSettings?.feeCalculatorMinFee ?? 20;
      const baseFee = isFree
        ? (discountPct === 100 ? 0 : Math.round(rawFee * (100 - discountPct) / 100))
        : rawFee;

      let orderNum = Math.floor(Math.random() * 90000) + 10000;
      while (fallbackStore.orders.has(`${orderNum}`)) {
        orderNum = Math.floor(Math.random() * 900000) + 100000;
      }

      const now = new Date().toISOString();
      const newOrder: Order = {
        id: `${orderNum}`,
        customerId: user.uid,
        customerName: user.displayName || 'Customer',
        customerPhone: altPhone || user.phoneNumber || '',
        alternativePhone: altPhone || undefined,
        title: selectedService,
        service: selectedService,
        items: itemsToCreate,
        pickupLocation: pickupLoc,
        deliveryLocation: delivLoc,
        status: 'PENDING',
        deliveryFee: baseFee,
        originalDeliveryFee: rawFee,
        isFreeDelivery: isFree || undefined,
        deliveryDiscountPercent: isFree ? discountPct : undefined,
        coinsRedeemedForDelivery: isFree ? reqCoins : undefined,
        createdAt: now,
        updatedAt: now,
        statusHistory: [
          {
            id: `sh-${Date.now()}`,
            status: 'PENDING',
            timestamp: now,
            actor: 'Customer',
            note: isFree ? 'Custom request submitted (free delivery claimed)' : 'Custom request submitted',
          },
        ],
      };
      // Check if scheduled via platform closed modal
      if (scheduledOptions?.isScheduled) {
        const scheduledOrder: Order = {
          ...newOrder,
          status: 'SCHEDULED' as any,
          isScheduled: true,
          scheduledAt: scheduledOptions.scheduledDate?.toISOString() || new Date().toISOString(),
          scheduledNote: scheduledOptions.scheduledNote || serviceTiming.message || undefined,
        };
        await fallbackStore.addOrder(scheduledOrder);
        saveScheduledOrder(scheduledOrder);
        if (altPhone.trim()) saveAltPhone(altPhone.trim());
        if (delivLoc.address) {
          saveDefaultDeliveryLocation(delivLoc);
          if (user.uid) {
            addSavedDeliveryAddress(user.uid, delivLoc);
            saveCustomerSavedAddressToFirestore(user.uid, delivLoc).catch(() => { });
          }
        }
        updateCustomerPreferences(altPhone.trim() || undefined, delivLoc, undefined);
        showAlert(
          'রিকোয়েস্ট শিডিউল হয়েছে!',
          (serviceTiming.message || 'এখন সার্ভিস বন্ধ আছে।') +
            ` সার্ভিস শুরু হওয়ার সময় (${formatScheduledTime(scheduledOrder.scheduledAt)}) এই রিকোয়েস্ট স্বয়ংক্রিয়ভাবে সার্ভার থেকে হেলপারদের কাছে পাঠানো হবে। এমনকি অ্যাপ বন্ধ থাকলেও নির্ধারিত সময়ে কার্যকর হবে।`,
          'info'
        );
        if (onOrderCreated) onOrderCreated(scheduledOrder as Order);
        return;
      }

      await fallbackStore.addOrder(newOrder);

      // Save phone and delivery address to persistence
      if (altPhone.trim()) {
        saveAltPhone(altPhone.trim());
      }
      if (delivLoc.address) {
        saveDefaultDeliveryLocation(delivLoc);
        if (user.uid) {
          addSavedDeliveryAddress(user.uid, delivLoc);
          saveCustomerSavedAddressToFirestore(user.uid, delivLoc).catch(() => { });
        }
      }
      updateCustomerPreferences(altPhone.trim() || undefined, delivLoc, undefined);

      showAlert('রিকোয়েস্ট জমা হয়েছে!', 'আপনার রিকোয়েস্ট সফলভাবে তৈরি হয়েছে। নিকটস্থ হেলপার শীঘ্রই যোগাযোগ করবে।', 'success');
      onClose();
      if (onOrderCreated) {
        onOrderCreated(newOrder);
      }
    } catch (err: any) {
      console.error('Failed to submit custom request:', err);
      setError('রিকোয়েস্ট জমা দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-black/55 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        minHeight: '100vh',
        margin: 0,
      }}
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto space-y-4">
        {/* Header with Mascot */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 overflow-hidden shrink-0 flex items-center justify-center p-0.5 shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/mascot.png"
                alt="Jamanot Mascot"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-gray-900 leading-tight">
                কী কাজ করাতে চান? Just জানান!
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">
                জামানত হেলপার দায়িত্ব নিয়ে কাজটি করে দেবে
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Custom Styled Service Dropdown */}
          <div className="relative z-50">
            <label className="block text-[11px] font-bold text-gray-700 mb-1">
              সার্ভিস বেছে নিন <span className="text-rose-500">*</span>
            </label>
            <button
              ref={triggerRef}
              type="button"
              id="custom-request-service-dropdown-trigger"
              onClick={() => {
                if (isDropdownOpen) {
                  setIsDropdownOpen(false);
                } else {
                  openDropdown();
                }
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl border transition-all cursor-pointer text-left ${!selectedService && error
                ? 'border-rose-400 bg-rose-50/20 ring-2 ring-rose-200'
                : isDropdownOpen
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white shadow-xs'
                  : 'border-gray-200 bg-white hover:border-gray-300 shadow-2xs'
                }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${selectedService
                  ? 'bg-emerald-50 border border-emerald-100 text-emerald-600'
                  : 'bg-gray-50 border border-gray-100 text-gray-400'
                  }`}>
                  {selectedService ? (
                    getServiceIcon(selectedService)
                  ) : (
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                  )}
                </div>
                <div className="truncate">
                  {selectedService ? (
                    <span className="text-xs font-bold text-gray-900 block truncate">
                      {selectedService}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-gray-400 block truncate">
                      সার্ভিস নির্বাচন করুন (বাধ্যতামূলক)
                    </span>
                  )}
                </div>
              </div>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform duration-200 shrink-0 ${isDropdownOpen
                  ? 'rotate-180 text-emerald-600 bg-emerald-50'
                  : 'text-gray-400'
                  }`}
              >
                <ChevronDown className="w-4 h-4" />
              </div>
            </button>

            {/* Portal-rendered dropdown panel — escapes overflow-y-auto clipping */}
            {isDropdownOpen && typeof window !== 'undefined' && createPortal(
              <>
                {/* Transparent backdrop to close on outside click */}
                <div
                  className="fixed inset-0 z-[99998]"
                  onClick={() => setIsDropdownOpen(false)}
                />
                <div
                  role="listbox"
                  style={{
                    position: 'fixed',
                    top: dropdownPos.top,
                    left: dropdownPos.left,
                    width: dropdownPos.width,
                    zIndex: 99999,
                  }}
                  className="bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  <div className="px-3 py-1.5 border-b border-gray-50 flex items-center justify-between bg-gray-50/60">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      সার্ভিস তালিকা
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold">
                      {allServiceOptions.length}টি সেবা উপলব্ধ
                    </span>
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                    {allServiceOptions.map((svc) => {
                      const isSelected = svc === selectedService;
                      return (
                        <button
                          key={svc}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setSelectedService(svc);
                            setIsDropdownOpen(false);
                            if (error) setError('');
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-colors cursor-pointer group ${isSelected
                            ? 'bg-emerald-50/80 text-emerald-950 font-black'
                            : 'hover:bg-gray-50 text-gray-800 font-semibold'
                            }`}
                        >
                          <div className="flex items-center space-x-2.5 truncate">
                            <div
                              className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isSelected
                                ? 'bg-white shadow-2xs border border-emerald-200'
                                : 'bg-gray-50 group-hover:bg-white border border-transparent group-hover:border-gray-200'
                                }`}
                            >
                              {getServiceIcon(svc)}
                            </div>
                            <span className="text-xs truncate">{svc}</span>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 ml-2 shadow-2xs">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>,
              document.body
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">
              কী করতে হবে? (বিস্তারিত লিখুন) <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (error) setError('');
              }}
              placeholder={
                selectedService
                  ? getServiceDescriptionHint(selectedService, fallbackStore.pricingSettings)
                  : "যেমন: কাঁচাবাজার থেকে ২ কেজি আলু, ১ কেজি পেঁয়াজ ও আধা কেজি কাঁচামরিচ লাগবে..."
              }
              className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-xs resize-none"
            />
          </div>

          {/* Pickup Source Location (Optional) */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">
              কোথা থেকে নিতে হবে? (Option)
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={pickupNote}
                onChange={(e) => setPickupNote(e.target.value)}
                placeholder="যেমন: Dottopara, Khagan বা নির্দিষ্ট যেকোনো দোকান"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-xs"
              />
            </div>
          </div>

          {/* Delivery Location */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">
              কোথায় পৌঁছে দিতে হবে? (Delivery Address) <span className="text-rose-500">*</span>
            </label>
            <AddressAutocompleteInput
              value={deliveryAddress}
              onChange={(addr, locationData) => {
                setDeliveryAddress(addr);
                setDeliveryLat(locationData?.lat);
                setDeliveryLng(locationData?.lng);
                if (error) setError('');
              }}
              savedLocalAddresses={savedAddresses}
              placeholder="আপনার বাড়ি বা ডেলিভারি নেওয়ার ঠিকানা..."
              required
            />
          </div>

          {/* Contact WhatsApp */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">
              যোগাযোগের নম্বর / WhatsApp
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-xs"
              />
            </div>
          </div>

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
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${useFreeDelivery
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

          {/* Submit CTA */}
          <div className="pt-2 flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-60"
            >
              {submitting ? (
                <span>জমা হচ্ছে...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{user ? 'রিকোয়েস্ট সাবমিট করুন' : 'লগইন করে রিকোয়েস্ট করুন'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Insufficient Coins Modal */}
      {showInsufficientCoinsModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowInsufficientCoinsModal(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600">
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
              className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs cursor-pointer transition-colors"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}
      {/* Platform Closed Schedule Modal */}
      <PlatformClosedScheduleModal
        isOpen={showPlatformClosedModal}
        pricingSettings={fallbackStore.pricingSettings}
        onSchedule={(targetDate, noteText) => {
          setShowPlatformClosedModal(false);
          handleSubmit(undefined, {
            isScheduled: true,
            scheduledDate: targetDate,
            scheduledNote: noteText,
          });
        }}
        onCancel={() => setShowPlatformClosedModal(false)}
      />

    </div>,
    document.body
  );
};
