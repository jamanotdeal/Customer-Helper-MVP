'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useModal } from './CustomModal';
import { OrderItem, LocationData, MissingItemPref, Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { calculateDeliveryFee, DEFAULT_INPUT_PLACEHOLDERS } from '@/lib/pricing';
import {
  getSavedAltPhone,
  saveAltPhone,
  getSavedMissingItemPref,
  saveMissingItemPref,
  getSavedDefaultDeliveryLocation,
  saveDefaultDeliveryLocation,
} from '@/lib/storage';
import {
  Plus,
  Trash2,
  MapPin,
  Phone,
  Navigation,
  FileText,
  HelpCircle,
  ArrowRight,
  Store,
  ListPlus,
} from 'lucide-react';

interface RequestComposerProps {
  onOrderCreated: (order: Order) => void;
}

export const RequestComposer: React.FC<RequestComposerProps> = ({ onOrderCreated }) => {
  const { user, loginWithGoogle, updateCustomerPreferences } = useAuth();
  const { showAlert } = useModal();

  const [isExpanded, setIsExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Dynamic Cycling Placeholders State (Synced with Admin Settings)
  const [placeholders, setPlaceholders] = useState<string[]>(
    fallbackStore.pricingSettings.inputPlaceholders || DEFAULT_INPUT_PLACEHOLDERS
  );
  const [placeholderIndex, setPlaceholderIndex] = useState(0);


  // Guaranteed minimum 1 item in item details list
  const [items, setItems] = useState<OrderItem[]>([
    { id: 'item-1', name: '', qty: '1' },
  ]);
  const [missingPref, setMissingPref] = useState<MissingItemPref | ''>('');
  const [altPhone, setAltPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');

  // Delivery Location state
  const [deliveryType, setDeliveryType] = useState<'HOME' | 'OTHER'>('HOME');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(undefined);
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(undefined);
  const [isLocating, setIsLocating] = useState(false);

  // Additional Note field
  const [additionalNote, setAdditionalNote] = useState('');

  // Sync admin placeholders from store
  useEffect(() => {
    const syncPlaceholders = () => {
      const custom = fallbackStore.pricingSettings.inputPlaceholders;
      if (custom && custom.length > 0) {
        setPlaceholders(custom);
      }
    };
    syncPlaceholders();
    const unsub = fallbackStore.subscribe(syncPlaceholders);
    return () => unsub();
  }, []);

  // Automatic rotating timer for input placeholders
  useEffect(() => {
    if (placeholders.length <= 1) return;
    const timer = setInterval(() => {
      setPlaceholderIndex((prevIndex) => (prevIndex + 1) % placeholders.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [placeholders]);

  const currentPlaceholder = placeholders[placeholderIndex] || 'আপনার রিকোয়েস্টের মূল বিষয়বস্তু লিখুন...';

  // Load saved preferences and auto-collect location on mount or user login
  useEffect(() => {
    if (user?.alternativePhone) {
      setAltPhone(user.alternativePhone);
    } else {
      setAltPhone(getSavedAltPhone());
    }

    if (user?.defaultDeliveryLocation?.address) {
      setDeliveryAddress(user.defaultDeliveryLocation.address);
      setDeliveryLat(user.defaultDeliveryLocation.lat);
      setDeliveryLng(user.defaultDeliveryLocation.lng);
    } else {
      const savedLoc = getSavedDefaultDeliveryLocation();
      if (savedLoc && savedLoc.address) {
        setDeliveryAddress(savedLoc.address);
        setDeliveryLat(savedLoc.lat);
        setDeliveryLng(savedLoc.lng);
      } else {
        // Auto-collect device location on initial load if no saved location
        handleDetectLocation(true);
      }
    }
  }, [user]);

  // Handle focus / click on main input (Guard unauthenticated users)
  const handleInputInteract = () => {
    if (!user) {
      loginWithGoogle();
      return;
    }
    setIsExpanded(true);
  };



  const handleAddItem = () => {
    if (!user) {
      loginWithGoogle();
      return;
    }
    setItems([...items, { id: `item-${Date.now()}-${Math.random()}`, name: '', qty: '1' }]);
  };

  const handleUpdateItem = (id: string, field: 'name' | 'qty', value: string) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const handleRemoveItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((i) => i.id !== id));
    } else {
      // Keep at least 1 item row present in the form, just clear its values
      setItems(items.map((i) => (i.id === id ? { ...i, name: '', qty: '1' } : i)));
    }
  };

  // Requirement 7: Device Location Collection API & Refresh
  const handleDetectLocation = (isSilent = false) => {
    if (!navigator.geolocation) {
      if (!isSilent) {
        showAlert('সতর্কতা', 'আপনার ব্রাউজারে লোকেশন সার্ভিস সাপোর্ট করছে না।', 'warning');
      }
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setDeliveryLat(latitude);
        setDeliveryLng(longitude);
        const detectedText = `Mirpur, Dhaka (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
        setDeliveryAddress(detectedText);
        setIsLocating(false);
        saveDefaultDeliveryLocation({ address: detectedText, lat: latitude, lng: longitude });
      },
      (err) => {
        setIsLocating(false);
        if (!isSilent) {
          showAlert(
            'লোকেশন পাওয়া যায়নি',
            'আপনার ডিভাইসের লোকেশন সার্ভিস অন করুন অথবা ম্যানুয়ালি আপনার ঠিকানা লিখুন।',
            'warning'
          );
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Requirement 3: Pre-submission Form Validation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      loginWithGoogle();
      return;
    }

    // Determine primary item text from first item
    const primaryText = items[0]?.name.trim() || '';

    // Validate Item rows (Name & Qty are mandatory for each item row)
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const itemName = item.name.trim();
      if (!itemName) {
        await showAlert('আইটেমের নাম প্রয়োজন', `অনুগ্রহ করে Item #${idx + 1}-এর নাম লিখুন।`, 'warning');
        return;
      }
      if (!item.qty.trim()) {
        await showAlert('আইটেমের পরিমাণ প্রয়োজন', `অনুগ্রহ করে Item #${idx + 1}-এর পরিমাণ (Qty) লিখুন।`, 'warning');
        return;
      }
    }

    if (!deliveryAddress.trim()) {
      await showAlert('ডেলিভারি ঠিকানা প্রয়োজন', 'অনুগ্রহ করে আপনার সঠিক ডেলিভারি ঠিকানা দিন।', 'warning');
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

    if (!missingPref) {
      await showAlert(
        'Missing Item Preference Required',
        'Please select what we should do if any item is missing or there is a problem.',
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

    const allItemsList: OrderItem[] = items.map((it, idx) => ({
      ...it,
      name: it.name.trim() || `Item #${idx + 1}`,
      qty: it.qty.trim() || '1',
    }));

    setSubmitting(true);

    // Save preferences
    saveAltPhone(altPhone);
    saveMissingItemPref(missingPref);
    const finalDelivLoc: LocationData = {
      address: deliveryAddress.trim(),
      lat: deliveryLat,
      lng: deliveryLng,
    };
    saveDefaultDeliveryLocation(finalDelivLoc);
    updateCustomerPreferences(altPhone, finalDelivLoc, missingPref);

    const deliveryFee = 0;
    const titleText = primaryText || items.map(i => i.name.trim()).filter(Boolean).join(', ') || 'Order';

    const newOrder: Order = {
      id: `ord-${Date.now().toString().slice(-5)}`,
      customerId: user.uid,
      customerName: user.displayName || 'Customer',
      customerPhone: altPhone,
      alternativePhone: altPhone,
      title: titleText,
      items: allItemsList,
      missingItemPreference: missingPref,
      pickupLocation: pickupAddress.trim() ? { address: pickupAddress.trim() } : undefined,
      deliveryLocation: finalDelivLoc,
      additionalNote: additionalNote.trim() || undefined,
      status: 'PENDING',
      deliveryFee: deliveryFee,
      originalDeliveryFee: deliveryFee,
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
    setItems([{ id: `item-${Date.now()}`, name: '', qty: '1' }]);
    setAdditionalNote('');
    setIsExpanded(false);
    setSubmitting(false);

    onOrderCreated(newOrder);
  };

  return (
    <div className="w-full bg-white rounded-3xl shadow-xl shadow-emerald-950/5 border border-emerald-100 p-4 sm:p-6 transition-all duration-300">
      {/* Centered heading — cycling placeholder as animated tagline */}
      <button
        type="button"
        onClick={handleInputInteract}
        className="w-full text-center mb-4 group outline-none"
      >
        <h2 className="font-extrabold text-lg text-gray-900 mb-1">What do you need?</h2>
        <p
          key={placeholderIndex}
          className="text-sm font-semibold text-emerald-600 animate-in fade-in duration-500 min-h-[1.25rem]"
        >
          {currentPlaceholder}
        </p>
        <p className="text-[11px] text-gray-400 mt-1">Tell us whatever you need — we&apos;ll handle the rest.</p>
      </button>

      <form onSubmit={handleSubmit} className="space-y-3">

        {/* Expanded Form Fields (Only visible when user is authenticated and form expanded) */}
        {isExpanded && user && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">

            {/* ── BLOCK 1: Order Details ── */}
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3 space-y-2">
              <p className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider pb-0.5">Order Details</p>

              {/* Items List */}
              {items.map((item, idx) => (
                <div key={item.id} className="flex items-center space-x-1.5">
                  <div className="relative flex-1">
                    <ListPlus className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500 pointer-events-none" />
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                      placeholder={`Item #${idx + 1}`}
                      className="w-full pl-8 pr-2 py-2.5 rounded-xl border border-gray-200 text-xs focus:border-emerald-500 outline-none text-gray-900 bg-white"
                      required
                    />
                  </div>
                  <input
                    type="text"
                    value={item.qty}
                    onChange={(e) => handleUpdateItem(item.id, 'qty', e.target.value)}
                    placeholder="Qty"
                    className="w-14 py-2.5 px-2 rounded-xl border border-gray-200 text-xs text-center focus:border-emerald-500 outline-none text-gray-900 bg-white"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    title={items.length > 1 ? "Remove" : "Clear"}
                    className="p-2.5 rounded-xl bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddItem}
                className="w-full py-1.5 px-3 rounded-xl bg-white border border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-bold text-xs flex items-center justify-center space-x-1 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add another item</span>
              </button>

              {/* Missing Pref Dropdown */}
              <div className="relative">
                <HelpCircle className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500 pointer-events-none z-10" />
                <select
                  value={missingPref}
                  onChange={(e) => setMissingPref(e.target.value as any)}
                  required
                  className={`w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-medium transition-all cursor-pointer appearance-none ${missingPref === '' ? 'text-gray-400' : 'text-gray-700'}`}
                >
                  <option value="">If any item is missing or any problem then what should we do?</option>
                  <option value="SKIP">If any item is missing or any problem then: Skip the item</option>
                  <option value="SIMILAR">If any item is missing or any problem then: Buy a similar alternative</option>
                  <option value="CALL">If any item is missing or any problem then: Call me for instructions</option>
                </select>
              </div>
            </div>

            {/* ── BLOCK 2: Delivery & Contact ── */}
            <div className="bg-gray-50/80 border border-gray-200 rounded-2xl p-3 space-y-2">
              <p className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider pb-0.5">Delivery & Contact</p>

              {/* Pickup Address */}
              <div className="relative">
                <Store className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="From where should buy or get it? (Optional)"
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-xs text-gray-900"
                />
              </div>

              {/* Delivery Address */}
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Delivery address *"
                  className="w-full pl-8 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-xs text-gray-900"
                  required
                />
                <button
                  type="button"
                  onClick={() => handleDetectLocation(false)}
                  disabled={isLocating}
                  title="Detect my location"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                >
                  <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* WhatsApp Number */}
              <div className="relative">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="tel"
                  value={altPhone}
                  onChange={(e) => setAltPhone(e.target.value)}
                  placeholder="WhatsApp number *"
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-emerald-500 outline-none text-xs text-gray-900"
                  required
                />
              </div>

              {/* Additional Notes */}
              <div className="relative">
                <FileText className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <textarea
                  value={additionalNote}
                  onChange={(e) => setAdditionalNote(e.target.value)}
                  placeholder="Additional notes — flat no., brand preference... (optional)"
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-xs focus:border-emerald-500 outline-none h-14 resize-none text-gray-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* CTA or Submit Button */}
        {!isExpanded ? (
          <button
            type="button"
            onClick={handleInputInteract}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2"
          >
            <span>Tell Us Your Needs</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type={user ? 'submit' : 'button'}
            onClick={!user ? handleInputInteract : undefined}
            disabled={submitting}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2"
          >
            {submitting ? (
              <span>Submitting...</span>
            ) : (
              <>
                <span>{user ? 'Submit Order' : 'Login to Submit'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        )}
      </form>
    </div>
  );
};

