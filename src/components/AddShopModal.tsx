'use client';

import React, { useState } from 'react';
import { Shop, LocationData } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { MapPickerModal } from './MapPickerModal';
import { X, Store, MapPin, Phone, User, Check, AlertCircle } from 'lucide-react';

interface AddShopModalProps {
  shopToEdit?: Shop | null;
  onClose: () => void;
  onSaved?: () => void;
}

const STORE_TYPES = [
  'Grocery & Supermarket',
  'Pharmacy & Medicine',
  'Restaurant & Fast Food',
  'Meat & Fish Market',
  'Fruits & Vegetables',
  'Electronics & Gadgets',
  'Stationery & Books',
  'Clothing & Fashion',
  'Laundry & Dry Cleaning',
  'Other',
];

export const AddShopModal: React.FC<AddShopModalProps> = ({ shopToEdit, onClose, onSaved }) => {
  const { user } = useAuth();
  const storeTypes = fallbackStore.pricingSettings.storeTypes || STORE_TYPES;
  const [name, setName] = useState(shopToEdit?.name || '');
  const [type, setType] = useState(shopToEdit?.type || storeTypes[0] || 'Grocery & Supermarket');
  const [contactPerson, setContactPerson] = useState(shopToEdit?.contactPerson || '');
  const [whatsapp, setWhatsapp] = useState(shopToEdit?.whatsapp || '');
  const [location, setLocation] = useState<LocationData>(
    shopToEdit?.location || { address: '', lat: 23.8103, lng: 90.4125 }
  );

  const [showMapPicker, setShowMapPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contactPerson.trim() || !whatsapp.trim()) {
      setError('দোকানের নাম, যোগাযোগকারীর নাম এবং হোয়াটসঅ্যাপ নম্বর অবশ্যই পূরণ করুন।');
      return;
    }
    if (!location.address.trim()) {
      setError('অনুগ্রহ করে মানচিত্রে পিন করে অথবা টাইপ করে সঠিক ঠিকানা নির্বাচন করুন।');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const shopData: Shop = {
        id: shopToEdit?.id || `shop-${Date.now()}`,
        name: name.trim(),
        type: type.trim(),
        contactPerson: contactPerson.trim(),
        whatsapp: whatsapp.trim(),
        location,
        addedByHelperId: shopToEdit?.addedByHelperId || user?.uid,
        addedByHelperName: shopToEdit?.addedByHelperName || user?.displayName,
        createdAt: shopToEdit?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await fallbackStore.saveShop(shopData);
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      setError('দোকানের তথ্য সংরক্ষণ করা সম্ভব হয়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-700">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">
                {shopToEdit ? 'Edit Shop / Store Details' : 'Add New Shop / Store'}
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                ম্যাপে পিন সহ দোকানের বিস্তারিত তথ্য যোগ করুন
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-xs font-semibold flex items-center space-x-2 mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                Store / Shop Name (দোকানের নাম)*
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="যেমন: আলম কসমেটিকস & জেনারেল স্টোর"
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-emerald-500 outline-none text-sm font-semibold"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                Store Type (দোকানের ধরন)*
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-emerald-500 outline-none text-sm font-semibold bg-white"
              >
                {storeTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Contact Person*
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="মালিকের নাম"
                    className="w-full pl-9 pr-3 py-3 rounded-2xl border border-gray-200 focus:border-emerald-500 outline-none text-xs font-semibold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  WhatsApp Number*
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full pl-9 pr-3 py-3 rounded-2xl border border-gray-200 focus:border-emerald-500 outline-none text-xs font-semibold"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Location Section */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-700 block">
                Exact Store Location (পিন অবস্থান)*
              </label>

              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={location.address}
                  onChange={(e) => setLocation({ ...location, address: e.target.value })}
                  placeholder="দোকানের ঠিকানা..."
                  className="flex-1 p-3 rounded-2xl border border-gray-200 text-xs font-semibold outline-none focus:border-emerald-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  className="px-3.5 py-3 rounded-2xl bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-black flex items-center space-x-1 shrink-0"
                >
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <span>Pin Map</span>
                </button>
              </div>

              {location.lat && location.lng && (
                <p className="text-[10px] text-gray-400 font-mono">
                  Coordinates: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </p>
              )}
            </div>

            <div className="flex space-x-2 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-xs"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <Check className="w-4 h-4" />
                <span>{shopToEdit ? 'Update Shop' : 'Save Shop'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <MapPickerModal
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        title="দোকানের অবস্থান পিন করুন"
        initialLocation={location}
        onSelectLocation={(loc) => {
          setLocation({
            address: loc.address || location.address || 'Selected Store Location',
            lat: loc.lat,
            lng: loc.lng,
          });
          setShowMapPicker(false);
        }}
      />
    </>
  );
};
