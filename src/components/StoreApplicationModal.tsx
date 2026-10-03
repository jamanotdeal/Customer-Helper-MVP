'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Store, Check, AlertCircle, Trash2, Clock, XCircle, MapPin, AlertTriangle, FileEdit } from 'lucide-react';
import { fallbackStore } from '@/lib/firebase';
import { StoreApplication, LocationData } from '@/types';
import { AsyncButton } from './ui/AsyncButton';
import { MapPickerModal } from './MapPickerModal';

interface StoreApplicationModalProps {
  onClose: () => void;
}

import { DEFAULT_STORE_TYPES, parseStoreTypes } from '@/lib/pricing';

export const StoreApplicationModal: React.FC<StoreApplicationModalProps> = ({ onClose }) => {
  const { user, submitStoreApplication, cancelStoreApplication } = useAuth();

  const [storeTypes, setStoreTypes] = useState<string[]>(() =>
    parseStoreTypes(fallbackStore.pricingSettings.storeTypes)
  );

  // Admin-configurable placeholders with defaults
  const ph = fallbackStore.pricingSettings.storeFormPlaceholders || {};

  // Find latest app for this user
  const getLatestApp = (): StoreApplication | undefined => {
    if (!user) return undefined;
    const apps = Array.from(fallbackStore.storeApplications.values())
      .filter((a) => a.userId === user.uid)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return apps[0];
  };

  const [latestApp, setLatestApp] = useState<StoreApplication | undefined>(getLatestApp);

  useEffect(() => {
    const unsub = fallbackStore.subscribe(() => {
      setLatestApp(getLatestApp());
      const currentTypes = parseStoreTypes(fallbackStore.pricingSettings.storeTypes);
      setStoreTypes(currentTypes);
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Form fields
  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState(() => {
    const types = parseStoreTypes(fallbackStore.pricingSettings.storeTypes);
    return types[0] || '';
  });
  const [storeDescription, setStoreDescription] = useState('');
  const [ownerName, setOwnerName] = useState(user?.displayName || '');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(user?.alternativePhone || '');
  const [managerName, setManagerName] = useState('');
  const [managerWhatsapp, setManagerWhatsapp] = useState('');
  const [location, setLocation] = useState<LocationData>({ address: '', lat: undefined, lng: undefined });
  const [commissionPercent, setCommissionPercent] = useState('');
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const isPending = latestApp?.status === 'PENDING';
  const isRejected = latestApp?.status === 'REJECTED' || latestApp?.status === 'CANCELED';
  const canApply = !latestApp || isRejected;

  const validatePhone = (phone: string) => /^01[3-9]\d{8}$/.test(phone.trim());

  // Check if location has been properly selected
  const isLocationPinned = !!(
    location.address &&
    location.address.trim().length > 0 &&
    typeof location.lat === 'number' &&
    typeof location.lng === 'number'
  );

  const isHelperUser = Boolean(user && (user.isHelper || user.role === 'helper'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isHelperUser) {
      setError('হেলপার ইউজার কখনো স্টোর মোডের আবেদন করতে পারবেন না।');
      return;
    }
    if (!storeName.trim() || !storeDescription.trim() || !ownerName.trim() || !ownerWhatsapp.trim() || !managerName.trim() || !managerWhatsapp.trim()) {
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
    if (!isLocationPinned) {
      setError('অনুগ্রহ করে মানচিত্রে দোকানের সঠিক অবস্থান পিন করুন।');
      return;
    }
    const commPercent = commissionPercent ? parseFloat(commissionPercent) : 0;
    if (!commissionPercent || isNaN(commPercent) || commPercent < 2 || commPercent > 100) {
      setError('প্রতি অর্ডারে কমিশন শতাংশ কমপক্ষে ২% হতে হবে।');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await submitStoreApplication({
        storeName: storeName.trim(),
        storeType,
        storeDescription: storeDescription.trim(),
        ownerName: ownerName.trim(),
        ownerWhatsapp: ownerWhatsapp.trim(),
        managerName: managerName.trim(),
        managerWhatsapp: managerWhatsapp.trim(),
        location,
        commissionPercent: commPercent,
      });
      setSubmitted(true);
    } catch {
      setError('আবেদন জমা দেওয়া যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!latestApp) return;
    try {
      setCancelSubmitting(true);
      await cancelStoreApplication(latestApp.id);
    } catch {
      setError('আবেদন বাতিল করা যায়নি।');
    } finally {
      setCancelSubmitting(false);
    }
  };

  // ─── Pending Status View ───────────────────────────────────────────────────
  if (isPending && !submitted) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200">
          <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors">
            <X className="w-5 h-5" />
          </button>

          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-amber-600 animate-pulse" />
            </div>
            <h3 className="text-xl font-extrabold text-gray-900 mb-1">আবেদন পর্যালোচনাধীন</h3>
            <p className="text-sm text-gray-500 mb-5">
              আপনার দোকান নিবন্ধনের আবেদন অ্যাডমিনের কাছে পর্যালোচনার জন্য রয়েছে।
              অনুমোদন পেলে আপনাকে স্বয়ংক্রিয়ভাবে স্টোর মোডে নিয়ে যাওয়া হবে।
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left space-y-2 mb-6">
              <p className="text-xs font-bold text-amber-900">আবেদনের তথ্য:</p>
              <p className="text-xs text-amber-800"><span className="font-semibold">দোকানের নাম:</span> {latestApp.storeName}</p>
              <p className="text-xs text-amber-800"><span className="font-semibold">ধরন:</span> {latestApp.storeType}</p>
              <p className="text-xs text-amber-800"><span className="font-semibold">মালিক:</span> {latestApp.ownerName} — {latestApp.ownerWhatsapp}</p>
              <p className="text-xs text-amber-800"><span className="font-semibold">আবেদনের তারিখ:</span> {new Date(latestApp.createdAt).toLocaleDateString('bn-BD')}</p>
            </div>

            {error && (
              <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-xs font-semibold flex items-center space-x-2 mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={cancelSubmitting}
                className="flex-1 py-3 rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-sm flex items-center justify-center gap-2 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>{cancelSubmitting ? 'বাতিল হচ্ছে...' : 'আবেদন বাতিল করুন'}</span>
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm transition-all"
              >
                ঠিক আছে
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Submitted Success View ───────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200">
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-extrabold text-gray-900 mb-2">আবেদন সফলভাবে জমা হয়েছে!</h3>
            <p className="text-sm text-gray-500 mb-6">
              আপনার দোকানের আবেদন অ্যাডমিনের কাছে পাঠানো হয়েছে। অনুমোদনের পরে আপনাকে স্টোর মোডে নিয়ে যাওয়া হবে।
            </p>
            <button onClick={onClose} className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold shadow-md hover:bg-emerald-700 transition-all">
              ঠিক আছে
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Application Form ─────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors">
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center space-x-3 mb-5">
            <div className="p-3 rounded-2xl bg-orange-100">
              <Store className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">Become a Store</h3>
              <p className="text-xs text-orange-600 font-semibold">
                {isRejected ? 'আপনার আগের আবেদন প্রত্যাখ্যাত হয়েছে। পুনরায় আবেদন করুন।' : 'আপনার দোকান নিবন্ধন করুন'}
              </p>
            </div>
          </div>

          {isRejected && latestApp?.reviewNote && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs font-medium space-y-1 mb-4">
              <div className="flex items-center gap-1.5 font-bold text-red-950">
                <XCircle className="w-4 h-4 text-red-600" />
                <span>প্রত্যাখ্যানের কারণ</span>
              </div>
              <p>{latestApp.reviewNote}</p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-xs font-semibold flex items-center space-x-2 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 1. দোকানের নাম */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">দোকানের নাম *</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder={ph.storeName || 'যেমন: আলম জেনারেল স্টোর'}
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
                {storeType && !storeTypes.includes(storeType) && (
                  <option value={storeType}>{storeType}</option>
                )}
              </select>
            </div>

            {/* 3. মালিকের নাম + হোয়াটসঅ্যাপ */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">মালিকের তথ্য *</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder={ph.ownerName || 'মালিকের পুরো নাম'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none text-sm"
                required
              />
              <input
                type="tel"
                value={ownerWhatsapp}
                onChange={(e) => setOwnerWhatsapp(e.target.value)}
                placeholder={ph.ownerPhone || 'মালিকের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none text-sm"
                required
              />
            </div>

            {/* 4. ম্যানেজারের নাম + হোয়াটসঅ্যাপ */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">ম্যানেজারের তথ্য বা যিনি সবসময় Active থাকবেন *</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder={ph.managerName || 'ম্যানেজারের পুরো নাম'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none text-sm"
                required
              />
              <input
                type="tel"
                value={managerWhatsapp}
                onChange={(e) => setManagerWhatsapp(e.target.value)}
                placeholder={ph.managerPhone || 'ম্যানেজারের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none text-sm"
                required
              />
            </div>

            {/* 5. প্রতি অর্ডারে কমিশন (mandatory, min 2) */}
            <div className="space-y-1 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">
                প্রতি অর্ডারে কত শতাংশ কমিশন দিতে চান? *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="2"
                  max="100"
                  step="0.5"
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(e.target.value)}
                  placeholder={ph.commissionPercent || 'যেমন: ৫'}
                  className="w-full p-3 pr-10 rounded-2xl border border-gray-200 focus:border-orange-500 outline-none text-sm font-semibold"
                  required
                />
                <span className="absolute right-4 top-3.5 text-sm font-black text-gray-400">%</span>
              </div>
              <p className="text-[10px] text-gray-400">সর্বনিম্ন ২% কমিশন প্রয়োজন।</p>
            </div>

            {/* 6. দোকানে কী কী পণ্য পাওয়া যায় (description) */}
            <div className="space-y-1 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">দোকানে কী কী পণ্য/সেবা পাওয়া যায়? *</label>
              <textarea
                value={storeDescription}
                onChange={(e) => setStoreDescription(e.target.value)}
                placeholder={ph.storeDescription || 'যেমন: চাল, ডাল, তেল, শ্যাম্পু, সাবান, টুথপেস্ট, বিভিন্ন গৃহস্থালী পণ্য...'}
                rows={3}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none text-sm leading-relaxed resize-none"
                required
              />
            </div>

            {/* 7. দোকানের সঠিক অবস্থান — Clickable Address Field */}
            <div className="space-y-1.5 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700 block">দোকানের সঠিক অবস্থান *</label>
                {isLocationPinned && (
                  <button
                    type="button"
                    onClick={() => setShowMapPicker(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-800 font-extrabold text-[10px] transition-all cursor-pointer active:scale-95"
                  >
                    <FileEdit className="w-3 h-3" />
                    <span>পরিবর্তন</span>
                  </button>
                )}
              </div>

              {/* Clickable Address Input Field */}
              <div
                onClick={() => setShowMapPicker(true)}
                className={`w-full p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                  isLocationPinned
                    ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300'
                    : 'border-dashed border-gray-300 hover:border-orange-400 bg-gray-50 hover:bg-orange-50/30'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${isLocationPinned ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500 group-hover:bg-orange-100 group-hover:text-orange-600'}`}>
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {isLocationPinned ? (
                      <>
                        <p className="text-xs font-extrabold text-gray-900 leading-snug break-words">
                          {location.address}
                        </p>
                        {location.lat && location.lng && (
                          <p className="text-[10px] text-emerald-700 font-mono mt-0.5">
                            📍 {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-bold text-gray-500 group-hover:text-orange-700">
                          {(ph as any).storeAddress || 'ম্যাপ থেকে দোকানের ঠিকানা নির্বাচন করতে এখানে ক্লিক করুন...'}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          ট্যাপ করে ম্যাপে লোকেশন পিন করুন (বাধ্যতামূলক)
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="shrink-0">
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all shadow-xs ${
                    isLocationPinned
                      ? 'bg-emerald-600 text-white group-hover:bg-emerald-700'
                      : 'bg-orange-500 text-white group-hover:bg-orange-600'
                  }`}>
                    {isLocationPinned ? 'বদলান' : 'ম্যাপ খুলুন'}
                  </span>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <AsyncButton
                type="submit"
                isLoading={submitting}
                icon={<Store className="w-5 h-5" />}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-extrabold text-sm shadow-lg shadow-orange-500/25 active:scale-98 transition-all flex items-center justify-center space-x-2"
              >
                <span>আবেদন জমা দিন</span>
              </AsyncButton>
            </div>
          </form>
        </div>
      </div>

      {/* Fullscreen / Interactive Map Picker Modal */}
      {showMapPicker && (
        <MapPickerModal
          isOpen={showMapPicker}
          onClose={() => setShowMapPicker(false)}
          title="দোকানের অবস্থান নির্বাচন করুন"
          initialLocation={location}
          modalType="pickup"
          addressLabel="দোকানের ঠিকানা"
          addressPlaceholder="যেমন: আলম জেনারেল স্টোর, আশুলিয়া বাজার"
          onSelectLocation={(loc) => {
            setLocation(loc);
            setShowMapPicker(false);
          }}
        />
      )}
    </>
  );
};
