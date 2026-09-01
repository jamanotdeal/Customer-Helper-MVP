'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Store, Check, AlertCircle, Trash2, Clock, XCircle, MapPin, Navigation, Search, AlertTriangle } from 'lucide-react';
import { fallbackStore } from '@/lib/firebase';
import { StoreApplication, LocationData } from '@/types';
import { usePullToRefreshLock } from '@/hooks/usePullToRefreshLock';

interface StoreApplicationModalProps {
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

export const StoreApplicationModal: React.FC<StoreApplicationModalProps> = ({ onClose }) => {
  // Leaflet consumes the drag itself, so the native pull gesture must be
  // disarmed while this map is on screen.
  usePullToRefreshLock();
  const { user, submitStoreApplication, cancelStoreApplication } = useAuth();

  const storeTypes = fallbackStore.pricingSettings.storeTypes?.length
    ? fallbackStore.pricingSettings.storeTypes
    : STORE_TYPES_DEFAULT;

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
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Form fields
  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState(storeTypes[0] || '');
  const [storeDescription, setStoreDescription] = useState('');
  const [ownerName, setOwnerName] = useState(user?.displayName || '');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(user?.alternativePhone || '');
  const [managerName, setManagerName] = useState('');
  const [managerWhatsapp, setManagerWhatsapp] = useState('');
  const [location, setLocation] = useState<LocationData>({ address: '', lat: 23.8103, lng: 90.4125 });
  const [commissionPercent, setCommissionPercent] = useState('');

  // Inline map state
  const inlineMapRef = useRef<HTMLDivElement>(null);
  const inlineMapInstanceRef = useRef<any>(null);
  const [inlineMapAddress, setInlineMapAddress] = useState('');
  const [inlineSearchQuery, setInlineSearchQuery] = useState('');
  const [inlineIsGeocoding, setInlineIsGeocoding] = useState(false);
  const [inlineIsLocating, setInlineIsLocating] = useState(false);
  const [inlineMapError, setInlineMapError] = useState(false);
  const [inlineMapReady, setInlineMapReady] = useState(false);


  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const isPending = latestApp?.status === 'PENDING';
  const isRejected = latestApp?.status === 'REJECTED' || latestApp?.status === 'CANCELED';
  const canApply = !latestApp || isRejected;

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
        if (!document.getElementById('leaflet-css-store')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-store';
          link.rel = 'stylesheet';
          link.href = '/vendor/leaflet/leaflet.css';
          document.head.appendChild(link);
        }
        if (!inlineMapRef.current) return;
        const map = L.map(inlineMapRef.current, {
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: false,
          zoomControl: false,
        }).setView([23.8103, 90.4125], 14);
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

        // Auto-locate
        if (navigator.geolocation) {
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

  // Check if location has been properly pinned on the map
  const isLocationPinned = !!(
    location.lat &&
    location.lng &&
    location.lat !== 23.8103 &&
    location.lng !== 90.4125
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
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
          <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
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

            {/* 7. দোকানের সঠিক অবস্থান — inline map */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">দোকানের সঠিক অবস্থান *</label>
              <p className="text-[10px] text-gray-400">ম্যাপে স্ক্রোল বা ড্র্যাগ করে দোকানের সঠিক স্থানে পিন রাখুন (বাধ্যতামূলক)</p>

              {/* Inline map container */}
              <div className="relative w-full rounded-2xl overflow-hidden border-2 border-orange-200" style={{ height: '220px' }}>
                {inlineMapError ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-amber-50 text-amber-900 gap-2 px-4 text-center">
                    <AlertTriangle className="w-7 h-7 text-amber-600" />
                    <p className="text-xs font-semibold">ম্যাপ লোড হতে সমস্যা হয়েছে।<br/>ইন্টারনেট সংযোগ পরীক্ষা করুন।</p>
                  </div>
                ) : (
                  <>
                    {/* Search bar floating top of map */}
                    <form
                      onSubmit={handleInlineSearch}
                      className="absolute top-2 left-2 right-2 z-20 flex gap-1 p-1 bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-orange-100"
                    >
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="এলাকা বা দোকানের নাম খুঁজুন..."
                          value={inlineSearchQuery}
                          onChange={(e) => setInlineSearchQuery(e.target.value)}
                          className="w-full pl-7 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-orange-400 text-gray-900 placeholder-gray-400 font-medium"
                        />
                        <Search className="w-3.5 h-3.5 text-orange-500 absolute left-2 top-2" />
                      </div>
                      <button
                        type="submit"
                        disabled={inlineIsGeocoding}
                        className="px-2.5 py-1.5 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 shrink-0"
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
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-extrabold text-sm shadow-lg shadow-orange-500/25 active:scale-98 transition-all flex items-center justify-center space-x-2"
              >
                <Store className="w-5 h-5" />
                <span>{submitting ? 'জমা হচ্ছে...' : 'আবেদন জমা দিন'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

    </>
  );
};
