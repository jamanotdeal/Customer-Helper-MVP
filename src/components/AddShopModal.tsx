'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Shop, LocationData } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { MapPickerModal } from './MapPickerModal';
import {
  X, Store, MapPin, Check, AlertCircle, Navigation, Search, AlertTriangle,
} from 'lucide-react';
import { AsyncButton } from './ui/AsyncButton';

interface AddShopModalProps {
  shopToEdit?: Shop | null;
  onClose: () => void;
  onSaved?: () => void;
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

export const AddShopModal: React.FC<AddShopModalProps> = ({ shopToEdit, onClose, onSaved }) => {
  const { user } = useAuth();

  const storeTypes = fallbackStore.pricingSettings.storeTypes?.length
    ? fallbackStore.pricingSettings.storeTypes
    : STORE_TYPES_DEFAULT;

  const ph = fallbackStore.pricingSettings.storeFormPlaceholders || {};

  // ── Form fields (mirror of StoreApplicationModal) ──────────────────────────
  const [storeName, setStoreName] = useState(shopToEdit?.name || '');
  const [storeType, setStoreType] = useState(shopToEdit?.type || storeTypes[0] || '');
  const [ownerName, setOwnerName] = useState(shopToEdit?.contactPerson || '');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(shopToEdit?.whatsapp || '');
  const [managerName, setManagerName] = useState(shopToEdit?.managerName || '');
  const [managerWhatsapp, setManagerWhatsapp] = useState(shopToEdit?.managerWhatsapp || '');
  const [commissionPercent, setCommissionPercent] = useState(
    shopToEdit?.commissionPercent !== undefined ? String(shopToEdit.commissionPercent) : ''
  );
  const [storeDescription, setStoreDescription] = useState(shopToEdit?.description || '');
  const [location, setLocation] = useState<LocationData>(
    shopToEdit?.location || { address: '', lat: 23.8103, lng: 90.4125 }
  );
  const [photoUrl, setPhotoUrl] = useState(shopToEdit?.photoUrl || '');

  // ── Inline map state ───────────────────────────────────────────────────────
  const inlineMapRef = useRef<HTMLDivElement>(null);
  const inlineMapInstanceRef = useRef<any>(null);
  const [inlineMapAddress, setInlineMapAddress] = useState(shopToEdit?.location?.address || '');
  const [inlineSearchQuery, setInlineSearchQuery] = useState('');
  const [inlineIsGeocoding, setInlineIsGeocoding] = useState(false);
  const [inlineIsLocating, setInlineIsLocating] = useState(false);
  const [inlineMapError, setInlineMapError] = useState(false);
  const [inlineMapReady, setInlineMapReady] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const validatePhone = (phone: string) => /^01[3-9]\d{8}$/.test(phone.trim());

  // Reverse geocode helper for inline map
  const inlineReverseGeocode = useCallback(async (latVal: number, lngVal: number) => {
    setInlineIsGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latVal}&lon=${lngVal}&accept-language=bn,en`
      );
      if (res.ok) {
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          const data = JSON.parse(text);
          const displayName = data.display_name || '';
          if (displayName) setInlineMapAddress(displayName);
          setLocation((prev) => ({ ...prev, address: displayName, lat: latVal, lng: lngVal }));
        }
      }
    } catch { /* silent */ } finally {
      setInlineIsGeocoding(false);
    }
  }, []);

  // Initialize inline map once the DOM node is available
  useEffect(() => {
    if (inlineMapReady || !inlineMapRef.current || inlineMapError) return;

    const initInlineMap = async () => {
      try {
        const L = await import('leaflet');
        if (!document.getElementById('leaflet-css-addshop')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-addshop';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }
        if (!inlineMapRef.current) return;

        const initialLat = shopToEdit?.location?.lat ?? 23.8103;
        const initialLng = shopToEdit?.location?.lng ?? 90.4125;

        const map = L.map(inlineMapRef.current, {
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: false,
          zoomControl: false,
        }).setView([initialLat, initialLng], 14);
        inlineMapInstanceRef.current = map;

        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps',
          maxZoom: 20,
        }).addTo(map);

        const updateFromCenter = () => {
          const c = map.getCenter();
          setLocation((prev) => ({ ...prev, lat: c.lat, lng: c.lng }));
          inlineReverseGeocode(c.lat, c.lng);
        };

        map.on('dragend', updateFromCenter);
        map.on('click', (e: any) => {
          map.setView([e.latlng.lat, e.latlng.lng], 18, { animate: true });
          map.once('moveend', updateFromCenter);
        });

        setInlineMapReady(true);

        // If editing an existing shop with known coords, show them; else auto-locate
        if (shopToEdit?.location?.lat && shopToEdit.location.lng) {
          map.setView([shopToEdit.location.lat, shopToEdit.location.lng], 17, { animate: false });
          setInlineMapAddress(shopToEdit.location.address || '');
        } else if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude: lat, longitude: lng } = pos.coords;
              map.setView([lat, lng], 17, { animate: true });
              map.once('moveend', () => inlineReverseGeocode(lat, lng));
            },
            () => { inlineReverseGeocode(23.8103, 90.4125); },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
          );
        } else {
          inlineReverseGeocode(23.8103, 90.4125);
        }
      } catch {
        setInlineMapError(true);
      }
    };

    const t = setTimeout(initInlineMap, 80);
    return () => {
      clearTimeout(t);
      if (inlineMapInstanceRef.current) {
        inlineMapInstanceRef.current.remove();
        inlineMapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInlineSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineSearchQuery.trim() || !inlineMapInstanceRef.current) return;
    setInlineIsGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(inlineSearchQuery)}&limit=1&accept-language=bn,en&countrycodes=bd`
      );
      if (res.ok) {
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          const data = JSON.parse(text);
          if (data && data.length > 0) {
            const newLat = parseFloat(data[0].lat);
            const newLng = parseFloat(data[0].lon);
            inlineMapInstanceRef.current.setView([newLat, newLng], 18, { animate: true });
            inlineMapInstanceRef.current.once('moveend', () => inlineReverseGeocode(newLat, newLng));
          }
        }
      }
    } catch { /* silent */ } finally {
      setInlineIsGeocoding(false);
    }
  };

  const handleInlineCurrentLocation = () => {
    if (!navigator.geolocation || !inlineMapInstanceRef.current) return;
    setInlineIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        inlineMapInstanceRef.current.setView([lat, lng], 18, { animate: true });
        inlineMapInstanceRef.current.once('moveend', () => inlineReverseGeocode(lat, lng));
        setInlineIsLocating(false);
      },
      () => setInlineIsLocating(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  // Is the location properly pinned (different from the default fallback)?
  const isLocationPinned = !!(
    location.lat &&
    location.lng &&
    !(location.lat === 23.8103 && location.lng === 90.4125)
  );

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
    if (!isLocationPinned && !shopToEdit) {
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
      const shopData: Shop = {
        id: shopToEdit?.id || `shop-${Date.now()}`,
        name: storeName.trim(),
        type: storeType.trim(),
        description: storeDescription.trim() || undefined,
        contactPerson: ownerName.trim(),
        whatsapp: ownerWhatsapp.trim(),
        managerName: managerName.trim(),
        managerWhatsapp: managerWhatsapp.trim(),
        location,
        addedByHelperId: shopToEdit?.addedByHelperId || user?.uid,
        addedByHelperName: shopToEdit?.addedByHelperName || user?.displayName,
        ownerUserId: shopToEdit?.ownerUserId,
        ownerUserEmail: shopToEdit?.ownerUserEmail,
        applicationId: shopToEdit?.applicationId,
        createdAt: shopToEdit?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        photoUrl: photoUrl.trim() || undefined,
        commissionPercent: commPercent,
      };

      await fallbackStore.saveShop(shopData);
      if (onSaved) onSaved();
      onClose();
    } catch {
      setError('দোকানের তথ্য সংরক্ষণ করা সম্ভব হয়নি।');
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

          {/* Header */}
          <div className="flex items-center space-x-3 mb-5">
            <div className="p-3 rounded-2xl bg-purple-100">
              <Store className="w-6 h-6 text-purple-700" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">
                {shopToEdit ? 'দোকানের তথ্য সম্পাদনা' : 'নতুন দোকান যুক্ত করুন'}
              </h3>
              <p className="text-xs text-purple-600 font-semibold">
                {shopToEdit ? 'তথ্য সম্পাদনা করে সংরক্ষণ করুন' : 'দোকানের বিস্তারিত তথ্য পূরণ করুন'}
              </p>
            </div>
          </div>

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
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm font-semibold"
                required
              />
            </div>

            {/* 2. দোকানের ধরন */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">দোকানের ধরন *</label>
              <select
                value={storeType}
                onChange={(e) => setStoreType(e.target.value)}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-sm font-semibold bg-white"
              >
                {storeTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                {storeType && !storeTypes.includes(storeType) && (
                  <option value={storeType}>{storeType}</option>
                )}
              </select>
            </div>

            {/* 3. মালিকের তথ্য */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">মালিকের তথ্য *</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder={ph.ownerName || 'মালিকের পুরো নাম'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm"
                required
              />
              <input
                type="tel"
                value={ownerWhatsapp}
                onChange={(e) => setOwnerWhatsapp(e.target.value)}
                placeholder={ph.ownerPhone || 'মালিকের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm"
                required
              />
            </div>

            {/* 4. ম্যানেজারের তথ্য */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">ম্যানেজারের তথ্য বা যিনি সবসময় Active থাকবেন *</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder={ph.managerName || 'ম্যানেজারের পুরো নাম'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm"
                required
              />
              <input
                type="tel"
                value={managerWhatsapp}
                onChange={(e) => setManagerWhatsapp(e.target.value)}
                placeholder={ph.managerPhone || 'ম্যানেজারের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm"
                required
              />
            </div>

            {/* 5. কমিশন */}
            <div className="space-y-1 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">
                প্রতি অর্ডারে কত শতাংশ কমিশন? *
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
                  className="w-full p-3 pr-10 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-sm font-semibold"
                  required
                />
                <span className="absolute right-4 top-3.5 text-sm font-black text-gray-400">%</span>
              </div>
              <p className="text-[10px] text-gray-400">সর্বনিম্ন ২% কমিশন প্রয়োজন।</p>
            </div>

            {/* 6. পণ্য/সেবা */}
            <div className="space-y-1 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">দোকানে কী কী পণ্য/সেবা পাওয়া যায়?</label>
              <textarea
                value={storeDescription}
                onChange={(e) => setStoreDescription(e.target.value)}
                placeholder={ph.storeDescription || 'যেমন: চাল, ডাল, তেল, শ্যাম্পু, সাবান, টুথপেস্ট, বিভিন্ন গৃহস্থালী পণ্য...'}
                rows={3}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm leading-relaxed resize-none"
              />
            </div>

            {/* 7. দোকানের সঠিক অবস্থান — inline map */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">দোকানের সঠিক অবস্থান *</label>
              <p className="text-[10px] text-gray-400">ম্যাপে স্ক্রোল বা ড্র্যাগ করে দোকানের সঠিক স্থানে পিন রাখুন</p>

              {/* Inline map container */}
              <div className="relative w-full rounded-2xl overflow-hidden border-2 border-purple-200" style={{ height: '220px' }}>
                {inlineMapError ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-amber-50 text-amber-900 gap-2 px-4 text-center">
                    <AlertTriangle className="w-7 h-7 text-amber-600" />
                    <p className="text-xs font-semibold">ম্যাপ লোড হতে সমস্যা হয়েছে।<br/>ইন্টারনেট সংযোগ পরীক্ষা করুন।</p>
                    <button
                      type="button"
                      onClick={() => setShowMapPicker(true)}
                      className="mt-2 px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold"
                    >
                      ম্যাপ পিকার খুলুন
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Search bar floating top of map */}
                    <form
                      onSubmit={handleInlineSearch}
                      className="absolute top-2 left-2 right-2 z-20 flex gap-1 p-1 bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-purple-100"
                    >
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="এলাকা বা দোকানের নাম খুঁজুন..."
                          value={inlineSearchQuery}
                          onChange={(e) => setInlineSearchQuery(e.target.value)}
                          className="w-full pl-7 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-purple-400 text-gray-900 placeholder-gray-400 font-medium"
                        />
                        <Search className="w-3.5 h-3.5 text-purple-500 absolute left-2 top-2" />
                      </div>
                      <button
                        type="submit"
                        disabled={inlineIsGeocoding}
                        className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 shrink-0"
                      >
                        {inlineIsGeocoding ? '...' : 'খুঁজুন'}
                      </button>
                    </form>

                    {/* Map canvas */}
                    <div ref={inlineMapRef} className="w-full h-full z-10" />

                    {/* Center pin */}
                    <div
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(100%-6px)] z-20 pointer-events-none flex flex-col items-center"
                      style={{ marginTop: '-16px' }}
                    >
                      <div className="bg-black text-lime-300 px-2 py-0.5 rounded-full text-[8px] font-extrabold whitespace-nowrap mb-0.5 animate-bounce" style={{ boxShadow: '0 0 8px 2px rgba(163,230,53,0.7)', border: '1px solid rgba(163,230,53,0.6)' }}>
                        এখানে পিন করুন
                      </div>
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center border-[3px] border-black"
                        style={{ background: 'linear-gradient(135deg, #a3e635 0%, #65a30d 100%)', boxShadow: '0 0 0 3px rgba(0,0,0,0.8), 0 0 12px 4px rgba(163,230,53,0.8)' }}
                      >
                        <MapPin className="w-5 h-5 text-black fill-lime-200" />
                      </div>
                      <div className="w-1 h-3 rounded-b-full" style={{ background: 'linear-gradient(to bottom, #1a1a1a, #000000)' }} />
                      <div className="w-3 h-1.5 rounded-full blur-[2px]" style={{ background: 'rgba(163,230,53,0.45)' }} />
                    </div>

                    {/* Current location button */}
                    <button
                      type="button"
                      onClick={handleInlineCurrentLocation}
                      disabled={inlineIsLocating}
                      className="absolute bottom-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-white transition-all active:scale-95 disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg, #a3e635 0%, #65a30d 100%)', boxShadow: '0 0 10px 2px rgba(163,230,53,0.5)' }}
                    >
                      <Navigation className={`w-3.5 h-3.5 ${inlineIsLocating ? 'animate-spin' : ''}`} />
                      <span>{inlineIsLocating ? 'খোঁজা হচ্ছে...' : 'বর্তমান পজিশন'}</span>
                    </button>
                  </>
                )}
              </div>

              {/* Address display below map */}
              {isLocationPinned && (
                <div className="flex items-start gap-1.5 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-emerald-700 font-semibold leading-snug">
                      {inlineMapAddress || location.address || `${location.lat?.toFixed(5)}, ${location.lng?.toFixed(5)}`}
                    </p>
                    <p className="text-[9px] text-emerald-500 font-mono mt-0.5">
                      📍 {location.lat?.toFixed(5)}, {location.lng?.toFixed(5)}
                    </p>
                  </div>
                </div>
              )}

              {/* Editing existing shop: also allow manual address edit */}
              {shopToEdit && (
                <input
                  type="text"
                  value={location.address}
                  onChange={(e) => setLocation({ ...location, address: e.target.value })}
                  placeholder="বা ঠিকানা সরাসরি টাইপ করুন..."
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-semibold outline-none focus:border-purple-500"
                />
              )}
            </div>

            {/* 8. ছবির URL (optional) */}
            <div className="space-y-1 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-700 block">
                দোকানের ছবির URL <span className="text-gray-400 font-medium">(ঐচ্ছিক)</span>
              </label>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://example.com/shop-photo.jpg"
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-xs font-semibold"
              />
              {photoUrl && (
                <div className="mt-2 rounded-2xl overflow-hidden border border-gray-200 h-28 bg-gray-50">
                  <img
                    src={photoUrl}
                    alt="Shop preview"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex space-x-2 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-xs"
              >
                বাতিল
              </button>
              <AsyncButton
                type="submit"
                isLoading={submitting}
                icon={<Check className="w-4 h-4" />}
                className="flex-1 py-3.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <span>{shopToEdit ? 'আপডেট করুন' : 'দোকান সংরক্ষণ করুন'}</span>
              </AsyncButton>
            </div>
          </form>
        </div>
      </div>

      {showMapPicker && (
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
            setInlineMapAddress(loc.address || '');
            setShowMapPicker(false);
          }}
        />
      )}
    </>
  );
};
