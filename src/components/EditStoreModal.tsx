'use client';

import React, { useState } from 'react';
import { X, Store, Check, AlertCircle, MapPin, Edit } from 'lucide-react';
import { fallbackStore } from '@/lib/firebase';
import { Shop, LocationData } from '@/types';
import { MapPickerModal } from './MapPickerModal';

interface EditStoreModalProps {
  shop: Shop;
  onClose: () => void;
}

const STORE_TYPES_DEFAULT = [
  'মুদিখানা ও সুপারশপ',
  'ফার্মেসি ও ওষুধ',
  'রেস্টুরেন্ট ও ফাস্টফুড',
  'মাংস ও মাছ বাজার',
  'ফল ও সবজির দোকান',
  'ইলেকট্রনিক্স ও গ্যাজেট',
  'স্টেশনারি ও বই',
  'পোশাক ও ফ্যাশন',
  'লন্ড্রি ও ড্রাই ক্লিনিং',
  'অন্যান্য',
];

export const EditStoreModal: React.FC<EditStoreModalProps> = ({ shop, onClose }) => {
  const storeTypes = fallbackStore.pricingSettings.storeTypes?.length
    ? fallbackStore.pricingSettings.storeTypes
    : STORE_TYPES_DEFAULT;

  // Form fields
  const [storeName, setStoreName] = useState(shop.name);
  const [storeType, setStoreType] = useState(shop.type || storeTypes[0] || '');
  const [storeDescription, setStoreDescription] = useState(shop.description || '');
  const [ownerName, setOwnerName] = useState(shop.contactPerson || '');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(shop.whatsapp || '');
  const [managerName, setManagerName] = useState(shop.managerName || '');
  const [managerWhatsapp, setManagerWhatsapp] = useState(shop.managerWhatsapp || '');
  const [location, setLocation] = useState<LocationData>(shop.location || { address: '', lat: 23.8103, lng: 90.4125 });
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const validatePhone = (phone: string) => /^01[3-9]\d{8}$/.test(phone.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !ownerName.trim() || !ownerWhatsapp.trim() || !managerName.trim() || !managerWhatsapp.trim()) {
      setError('সকল তারকাচিহ্নিত (*) ঘর পূরণ করুন।');
      return;
    }
    if (!validatePhone(ownerWhatsapp)) {
      setError('মালিকের হোয়াটসঅ্যাপ নম্বর ১১ ডিজিটের সঠিক নম্বর হতে হবে (যেমন: 01712345678)।');
      return;
    }
    if (!validatePhone(managerWhatsapp)) {
      setError('ম্যানেজারের হোয়াটসঅ্যাপ নম্বর ১১ ডিজিটের সঠিক নম্বর হতে হবে।');
      return;
    }
    if (!location.address.trim()) {
      setError('দোকানের সঠিক অবস্থান সিলেক্ট করুন।');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const updatedShop: Shop = {
        ...shop,
        name: storeName.trim(),
        type: storeType,
        description: storeDescription.trim(),
        contactPerson: ownerName.trim(),
        whatsapp: ownerWhatsapp.trim(),
        managerName: managerName.trim(),
        managerWhatsapp: managerWhatsapp.trim(),
        location,
        updatedAt: new Date().toISOString(),
      };

      await fallbackStore.saveShop(updatedShop);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      setError('তথ্য আপডেট করা সম্ভব হয়নি। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[10015] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center space-x-3 mb-5">
            <div className="p-3 rounded-2xl bg-orange-100">
              <Store className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">Edit Store Information</h3>
              <p className="text-xs text-orange-600 font-semibold">আপনার দোকানের তথ্য পরিবর্তন করুন</p>
            </div>
          </div>

          {success ? (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="font-extrabold text-gray-950">সফলভাবে আপডেট করা হয়েছে!</h4>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-xs font-semibold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 1. দোকানের নাম */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">দোকানের নাম *</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none text-sm font-semibold"
                  required
                />
              </div>

              {/* 2. দোকানের ধরন */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">দোকানের ধরন *</label>
                <select
                  value={storeType}
                  onChange={(e) => setStoreType(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 outline-none text-sm font-semibold bg-white"
                >
                  {storeTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* 3. মালিকের নাম + হোয়াটসঅ্যাপ */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-600 block">মালিকের তথ্য *</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="মালিকের পুরো নাম"
                  className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none text-sm"
                  required
                />
                <input
                  type="tel"
                  value={ownerWhatsapp}
                  onChange={(e) => setOwnerWhatsapp(e.target.value)}
                  placeholder="মালিকের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)"
                  className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none text-sm"
                  required
                />
              </div>

              {/* 4. ম্যানেজারের নাম + হোয়াটসঅ্যাপ */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-600 block">ম্যানেজারের তথ্য *</label>
                <input
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="ম্যানেজারের পুরো নাম"
                  className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none text-sm"
                  required
                />
                <input
                  type="tel"
                  value={managerWhatsapp}
                  onChange={(e) => setManagerWhatsapp(e.target.value)}
                  placeholder="ম্যানেজারের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)"
                  className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none text-sm"
                  required
                />
              </div>

              {/* 5. দোকানে কী কী পণ্য পাওয়া যায় (description) */}
              <div className="space-y-1 pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-600 block">দোকানে কী কী পণ্য/সেবা পাওয়া যায়?</label>
                <textarea
                  value={storeDescription}
                  onChange={(e) => setStoreDescription(e.target.value)}
                  placeholder="যেমন: চাল, ডাল, তেল, শ্যাম্পু..."
                  rows={3}
                  className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none text-sm leading-relaxed resize-none"
                />
              </div>

              {/* 6. দোকানের সঠিক অবস্থান */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-600 block">দোকানের সঠিক অবস্থান *</label>
                <button
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  className="w-full p-3 rounded-2xl border border-dashed border-orange-300 bg-orange-50 text-orange-950 font-bold text-xs flex items-center justify-center gap-2 hover:bg-orange-100 transition-colors"
                >
                  <MapPin className="w-4 h-4 text-orange-600" />
                  <span>{location.address ? 'চেঞ্জ করুন (Change Location)' : 'ম্যাপ পিন করুন (Pin on Map)'}</span>
                </button>

                {location.address && (
                  <div className="flex items-start gap-1.5 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-emerald-700 font-semibold leading-snug">
                        {location.address}
                      </p>
                      {location.lat && location.lng && (
                        <p className="text-[9px] text-emerald-500 font-mono mt-0.5">
                          📍 {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 7. কমিশন (Read-only) */}
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mt-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">💰 প্রতি অর্ডারে কমিশন (এডমিন নির্ধারিত)</label>
                <div className="text-lg font-black text-gray-800 mt-1">
                  {shop.commissionPercent !== undefined ? `${shop.commissionPercent}%` : 'N/A'}
                </div>
              </div>

              {/* Submit */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-extrabold text-sm shadow-lg shadow-orange-500/25 active:scale-98 transition-all flex items-center justify-center space-x-2"
                >
                  <Check className="w-5 h-5" />
                  <span>{submitting ? 'সংরক্ষণ হচ্ছে...' : 'পরিবর্তন সংরক্ষণ করুন'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {showMapPicker && (
        <MapPickerModal
          isOpen={showMapPicker}
          onClose={() => setShowMapPicker(false)}
          title="দোকানের অবস্থান নির্ধারণ করুন"
          initialLocation={location}
          onSelectLocation={(loc) => setLocation(loc)}
          modalType="store_location"
        />
      )}
    </>
  );
};
