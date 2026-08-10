'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useModal } from './CustomModal';
import { OrderItem, LocationData, Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { DEFAULT_INPUT_PLACEHOLDERS, DEFAULT_SERVICES } from '@/lib/pricing';
import { saveAltPhone, saveDefaultDeliveryLocation, getSavedAltPhone, getSavedDefaultDeliveryLocation } from '@/lib/storage';
import { MapPin, Navigation, Phone, ArrowRight, ChevronDown } from 'lucide-react';
import { updateSEOMetadataClient } from '@/lib/seo';

interface RequestComposerProps {
  onOrderCreated: (order: Order) => void;
}

export const RequestComposer: React.FC<RequestComposerProps> = ({ onOrderCreated }) => {
  const { user, loginWithGoogle, updateCustomerPreferences } = useAuth();
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
  const [deliveryLat] = useState<number | undefined>(undefined);
  const [deliveryLng] = useState<number | undefined>(undefined);

  // Service selection state
  const [service, setService] = useState('');
  const [services, setServices] = useState<string[]>(
    fallbackStore.pricingSettings.services || DEFAULT_SERVICES
  );

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
        setDeliveryAddress(savedLoc.address);
      }
    }
  }, [user]);

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
    if (!user) {
      loginWithGoogle();
      return;
    }
    setIsExpanded(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      loginWithGoogle();
      return;
    }

    if (!service) {
      await showAlert('সার্ভিস প্রয়োজন', 'অনুগ্রহ করে একটি সার্ভিস সিলেক্ট করুন।', 'warning');
      return;
    }

    if (!description.trim()) {
      await showAlert('বিবরণ প্রয়োজন', 'অনুগ্রহ করে কী করতে হবে তা লিখুন।', 'warning');
      return;
    }

    if (!deliveryAddress.trim()) {
      await showAlert('ডেলিভারি ঠিকানা প্রয়োজন', 'অনুগ্রহ করে আপনার সঠিক ডেলিভারি ঠিকানা দিন।', 'warning');
      return;
    }

    if (!altPhone.trim()) {
      await showAlert(
        'হোয়াটসঅ্যাপ নম্বর প্রয়োজন',
        'অনুগ্রহ করে যোগাযোগের জন্য সচল হোয়াটসঅ্যাপ নম্বর লিখুন।',
        'warning'
      );
      return;
    }

    if (!/^01[3-9]\d{8}$/.test(altPhone.trim())) {
      await showAlert(
        'ভুল ফোন নম্বর',
        'অনুগ্রহ করে ১১ ডিজিটের সঠিক সচল মোবাইল নম্বর (যেমন: 01712345678) লিখুন।',
        'error'
      );
      return;
    }

    const isConfirmed = await showConfirm(
      'অর্ডার নিশ্চিত করুন',
      'আপনি কি নিশ্চিতভাবে এই অনুরোধটি সাবমিট করতে চান? ভুলবশত বা টেস্ট করার জন্য হলে বাতিল করুন।',
      'হ্যাঁ, সাবমিট করুন',
      'বাতিল'
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
      pickupLocation: pickupNote.trim() ? { address: pickupNote.trim() } : undefined,
      deliveryLocation: finalDelivLoc,
      additionalNote: undefined,
      status: 'PENDING',
      deliveryFee: 0,
      originalDeliveryFee: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusHistory: [
        {
          id: `sh-${Date.now()}`,
          status: 'PENDING',
          timestamp: new Date().toISOString(),
          actor: 'Customer',
          note: 'Request created',
        },
      ],
    };

    await fallbackStore.addOrder(newOrder);

    // Reset form
    setDescription('');
    setService('');
    setPickupNote('');
    setIsExpanded(false);
    setSubmitting(false);

    // Show admin-configured confirmation message
    const confirmMsg =
      fallbackStore.pricingSettings.orderConfirmationMessage ||
      'আমরা আপনার অনুরোধটি পেয়েছি। শীঘ্রই একজন হেলপার গ্রহণ করবেন।';
    await showAlert('ধন্যবাদ!', confirmMsg, 'success');

    onOrderCreated(newOrder);
  };

  return (
    <div className="w-full bg-white rounded-3xl shadow-xl shadow-emerald-950/5 border border-emerald-100 p-4 sm:p-6 transition-all duration-300">
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

            {/* Service Selection Dropdown */}
            <div className="relative">
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-sm text-gray-900 appearance-none pr-10 font-semibold"
                required
              >
                <option value="" disabled>সার্ভিস সিলেক্ট করুন *</option>
                {services.map((srv) => (
                  <option key={srv} value={srv}>
                    {srv}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Description box */}
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="কী লাগবে বা করতে হবে তা এখানে বিস্তারিত লিখুন...."
                className="w-full px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 focus:border-emerald-500 outline-none text-sm text-gray-900 resize-none h-28 placeholder-gray-400"
                required
              />
            </div>

            {/* Pickup / Source Location (optional) */}
            <div className="relative">
              <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={pickupNote}
                onChange={(e) => setPickupNote(e.target.value)}
                placeholder="কোথা থেকে নিতে হবে? (optional)"
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-sm text-gray-900 placeholder-gray-400"
              />
            </div>

            {/* Delivery Address */}
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="ডেলিভারি ঠিকানা *"
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-sm text-gray-900 placeholder-gray-400"
                required
              />
            </div>

            {/* WhatsApp Number */}
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="tel"
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                placeholder="হোয়াটসঅ্যাপ নম্বর *"
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-sm text-gray-900 placeholder-gray-400"
                required
              />
            </div>
          </div>
        )}

        {/* CTA / Submit Button */}
        {!isExpanded ? (
          <button
            type="button"
            onClick={handleInputInteract}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2"
          >
            <span>অর্ডার করুন</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type={user ? 'submit' : 'button'}
            onClick={!user ? handleInputInteract : undefined}
            disabled={submitting}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-60"
          >
            {submitting ? (
              <span>Submitting...</span>
            ) : (
              <>
                <span>{user ? 'Submit' : 'Login to Submit'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        )}
      </form>
    </div>
  );
};
