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
  Sparkles,
  Navigation,
  FileText,
  HelpCircle,
  ShoppingBag,
  ArrowRight,
  Store,
  ListPlus,
  Tag,
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

  const [firstItemName, setFirstItemName] = useState('');
  // Guaranteed minimum 1 item in item details list
  const [items, setItems] = useState<OrderItem[]>([
    { id: 'item-1', name: '', qty: '1' },
  ]);
  const [missingPref, setMissingPref] = useState<MissingItemPref>('SKIP');
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

    if (user?.missingItemPreference) {
      setMissingPref(user.missingItemPreference);
    } else {
      setMissingPref(getSavedMissingItemPref());
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

  // Sync typing with expansion check
  const handleFirstItemChange = (val: string) => {
    if (!user) {
      loginWithGoogle();
      return;
    }
    setFirstItemName(val);
    if (!isExpanded && val.trim().length > 0) {
      setIsExpanded(true);
    }
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

    // Determine primary item text
    const primaryText = firstItemName.trim();

    if (!primaryText) {
      await showAlert('প্রয়োজনীয় তথ্য খালি', 'অনুগ্রহ করে আপনার রিকোয়েস্টের শিরোনাম/মূল বিষয় বক্সে লিখুন।', 'warning');
      return;
    }

    // Validate Item rows (Name & Qty are mandatory for each item row)
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const itemName = item.name.trim() || (idx === 0 ? primaryText : '');
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
        'হোয়াটসঅ্যাপ নম্বর প্রয়োজন',
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

    const allItemsList: OrderItem[] = items.map((it, idx) => ({
      ...it,
      name: it.name.trim() || (idx === 0 ? primaryText : `Item #${idx + 1}`),
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
    const titleText = primaryText;

    const newOrder: Order = {
      id: `ord-${Date.now().toString().slice(-5)}`,
      customerId: user.uid,
      customerName: user.displayName || 'Customer',
      customerPhone: user.email || '01800000000',
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
    setFirstItemName('');
    setItems([{ id: `item-${Date.now()}`, name: '', qty: '1' }]);
    setAdditionalNote('');
    setIsExpanded(false);
    setSubmitting(false);

    onOrderCreated(newOrder);
  };

  return (
    <div className="w-full bg-white rounded-3xl shadow-xl shadow-emerald-950/5 border border-emerald-100 p-4 sm:p-6 transition-all duration-300">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Main Item Input (Title) */}
        <div>
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <label className="text-xs font-bold text-gray-900 flex items-center space-x-1.5">
              <Tag className="w-4 h-4 text-emerald-600" />
              <span>What do you need? *</span>
            </label>
          </div>

          <div className="relative">
            <input
              type="text"
              value={firstItemName}
              onChange={(e) => handleFirstItemChange(e.target.value)}
              onFocus={handleInputInteract}
              onClick={handleInputInteract}
              placeholder={currentPlaceholder}
              className="w-full py-3.5 px-4 rounded-2xl bg-gray-50/80 border border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-gray-900 placeholder-gray-400 font-medium text-sm transition-all outline-none"
              required
            />
            {(!isExpanded || !user) && (
              <button
                type="button"
                onClick={handleInputInteract}
                className="absolute right-2.5 top-2.5 bg-emerald-600 text-white p-2 rounded-xl hover:bg-emerald-700 transition-all shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Expanded Form Fields (Only visible when user is authenticated and form expanded) */}
        {isExpanded && user && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200 pt-2 border-t border-gray-100">
            {/* 2. Items / Order Details List */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-900 flex items-center space-x-1.5">
                <ListPlus className="w-4 h-4 text-emerald-600" />
                <span>Items *</span>
              </label>

              {items.map((item, idx) => (
                <div key={item.id} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                    placeholder={`Item #${idx + 1} *`}
                    className="flex-1 p-2.5 rounded-xl border border-gray-200 text-xs focus:border-emerald-500 outline-none text-gray-900"
                    required
                  />
                  <input
                    type="text"
                    value={item.qty}
                    onChange={(e) => handleUpdateItem(item.id, 'qty', e.target.value)}
                    placeholder="Qty *"
                    className="w-20 p-2.5 rounded-xl border border-gray-200 text-xs text-center focus:border-emerald-500 outline-none text-gray-900"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    title={items.length > 1 ? "Remove Item" : "Clear Item"}
                    className="p-2.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddItem}
                className="w-full py-2.5 px-3 rounded-xl bg-gray-50 border border-dashed border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold text-xs flex items-center justify-center space-x-1.5 transition-all mt-1"
              >
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>+ Add item</span>
              </button>
            </div>

            {/* 3. If anything is missing (Missing Item Preference) */}
            <div className="pt-1">
              <label className="text-xs font-bold text-gray-900 flex items-center space-x-1.5 mb-1.5">
                <HelpCircle className="w-4 h-4 text-emerald-600" />
                <span>If anything is missing: *</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setMissingPref('SKIP')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${
                    missingPref === 'SKIP'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-xs font-bold'
                      : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                  }`}
                >
                  Skip missing items
                </button>

                <button
                  type="button"
                  onClick={() => setMissingPref('SIMILAR')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${
                    missingPref === 'SIMILAR'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-xs font-bold'
                      : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                  }`}
                >
                  Buy similar alternative
                </button>

                <button
                  type="button"
                  onClick={() => setMissingPref('CALL')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${
                    missingPref === 'CALL'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-xs font-bold'
                      : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                  }`}
                >
                  Call me for instruction
                </button>
              </div>
            </div>

            {/* 4. From where? (optional) */}
            <div className="pt-1">
              <label className="text-xs font-bold text-gray-900 flex items-center space-x-1.5 mb-1">
                <Store className="w-4 h-4 text-emerald-600" />
                <span>From where? (optional)</span>
              </label>
              <input
                type="text"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder="Shop or market location"
                className="w-full p-2.5 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none text-xs text-gray-900"
              />
            </div>

            {/* 5. Delivery Address */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-gray-900 flex items-center space-x-1.5">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>Delivery Address *</span>
              </label>

              <div className="relative">
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Enter full delivery address..."
                  className="w-full py-3 pl-3 pr-10 rounded-2xl border border-gray-200 focus:border-emerald-500 outline-none text-xs text-gray-900 font-medium"
                  required
                />
                <button
                  type="button"
                  onClick={() => handleDetectLocation(false)}
                  disabled={isLocating}
                  title="Detect Location"
                  className="absolute right-2 top-2 p-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* 6. Whatsapp Number (For Contact) */}
            <div className="pt-1">
              <label className="text-xs font-bold text-gray-900 flex items-center space-x-1.5 mb-1">
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>Whatsapp Number (For Contact) *</span>
              </label>
              <input
                type="tel"
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full p-2.5 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none text-xs text-gray-900"
                required
              />
            </div>

            {/* 7. Additional Notes */}
            <div className="pt-1">
              <label className="text-xs font-bold text-gray-900 flex items-center space-x-1.5 mb-1">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>Additional Notes (optional)</span>
              </label>
              <textarea
                value={additionalNote}
                onChange={(e) => setAdditionalNote(e.target.value)}
                placeholder="Specific instructions, flat number, door code, brand preference..."
                className="w-full p-2.5 rounded-2xl border border-gray-200 text-xs focus:border-emerald-500 outline-none h-16 resize-none text-gray-900"
              />
            </div>
          </div>
        )}

        {/* Submit Button */}
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
              <span>{user ? 'Submit Order' : 'Login to Submit Order'}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};

