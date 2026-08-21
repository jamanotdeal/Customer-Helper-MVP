'use client';

import React, { useEffect, useRef, useState } from 'react';
import { LocationData } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { MapPin, X, Navigation, Check, Search, AlertTriangle } from 'lucide-react';

import { useModal } from '@/components/CustomModal';
import { getMapGuideShowCount, incrementMapGuideShowCount } from '@/lib/storage';

interface MapPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialLocation?: LocationData;
  onSelectLocation: (loc: LocationData) => void;
  addressLabel?: string;
  addressPlaceholder?: string;
  onMapError?: () => void;
  /** 'pickup' | 'delivery' — used to track guide overlay count separately */
  modalType?: string;
}

export const MapPickerModal: React.FC<MapPickerModalProps> = ({
  isOpen,
  onClose,
  title,
  initialLocation,
  onSelectLocation,
  addressLabel,
  addressPlaceholder,
  onMapError,
  modalType = 'pickup',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);

  const [lat, setLat] = useState<number>(initialLocation?.lat || 23.8759);
  const [lng, setLng] = useState<number>(initialLocation?.lng || 90.3795);
  const [mapAddress, setMapAddress] = useState<string>('');
  const [detailAddress, setDetailAddress] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapError, setMapError] = useState<boolean>(false);

  // Guide overlay state
  const [showGuide, setShowGuide] = useState<boolean>(false);

  // Load Leaflet dynamically & initialize map when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // Reset or initialize values when modal opens
    const initialLat = initialLocation?.lat || 23.8759;
    const initialLng = initialLocation?.lng || 90.3795;
    setLat(initialLat);
    setLng(initialLng);
    setDetailAddress(initialLocation?.address || '');
    setMapAddress('');
    setSearchQuery('');
    setMapError(false);

    // Determine if guide overlay should be shown
    const p = fallbackStore.pricingSettings;
    const maxCount = typeof p.mapPickerGuideShowCount === 'number' ? p.mapPickerGuideShowCount : 5;
    const currentCount = getMapGuideShowCount(modalType);
    if (currentCount < maxCount) {
      setShowGuide(true);
      incrementMapGuideShowCount(modalType);
    } else {
      setShowGuide(false);
    }

    let L: any = null;

    const initMap = async () => {
      try {
        if (!mapContainerRef.current) return;

        // Import Leaflet dynamically to avoid SSR issues
        L = await import('leaflet');

        // Inject Leaflet CSS if not present
        if (!document.getElementById('leaflet-css-picker')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-picker';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        // Cleanup existing map if any
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        const map = L.map(mapContainerRef.current, {
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: true,
          zoomControl: true,
        }).setView([initialLat, initialLng], 15);
        mapInstanceRef.current = map;

        // Earth / Satellite Hybrid Tile Layer (Google Maps style)
        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps',
          maxZoom: 20,
        }).addTo(map);

        // Custom Purple Pin Icon with guide text attached directly to location pin
        const customIcon = L.divIcon({
          className: 'custom-leaflet-marker',
          html: `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%); pointer-events: none;">
              <div style="background-color: #5b21b6; color: #ffffff; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; white-space: nowrap; margin-bottom: 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.3); border: 1.5px solid rgba(255,255,255,0.4); font-family: inherit;">
                লোকেশনে এই পিনটি সেট করুন বা লোকেশনের উপর ক্লিক করুন
              </div>
              <div style="background-color: #7c3aed; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 3px solid white; box-shadow: 0 4px 12px rgba(124,58,237,0.4);">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </div>
              <div style="width: 2px; height: 6px; background-color: #7c3aed; margin-top: -1px;"></div>
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const marker = L.marker([initialLat, initialLng], {
          draggable: true,
          icon: customIcon,
        }).addTo(map);

        markerInstanceRef.current = marker;

        // Handle marker drag
        marker.on('dragend', () => {
          const position = marker.getLatLng();
          setLat(position.lat);
          setLng(position.lng);
          reverseGeocode(position.lat, position.lng);
        });

        // Handle map click
        map.on('click', (e: any) => {
          const { lat: clickLat, lng: clickLng } = e.latlng;
          marker.setLatLng([clickLat, clickLng]);
          setLat(clickLat);
          setLng(clickLng);
          reverseGeocode(clickLat, clickLng);
        });

        // Trigger initial reverse geocode
        reverseGeocode(initialLat, initialLng);
      } catch (err) {
        console.warn('[MapPicker] Leaflet initialization error:', err);
        setMapError(true);
        onMapError?.();
      }
    };

    const timer = setTimeout(() => {
      initMap();
    }, 50);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen]);

  // Reverse Geocoding with OSM Nominatim API
  const reverseGeocode = async (latVal: number, lngVal: number) => {
    setIsGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latVal}&lon=${lngVal}&accept-language=bn,en`
      );
      if (res.ok) {
        const data = await res.json();
        const displayName = data.display_name || '';
        if (displayName) {
          setMapAddress(displayName);
        }
      }
    } catch (err) {
      console.warn('[MapPicker] Reverse geocode note:', err);
    } finally {
      setIsGeocoding(false);
    }
  };

  // Search location using OSM Nominatim Search API
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (mapError || !mapInstanceRef.current || !markerInstanceRef.current) {
      setMapAddress(searchQuery.trim());
      return;
    }

    setIsGeocoding(true);

    // Read location preference from admin settings (default BD / Bangladesh)
    const mapPref = fallbackStore.pricingSettings.mapLocationPreference || 'BD';
    const customCode = fallbackStore.pricingSettings.customCountryCode || 'bd';

    let countryQueryParam = '';
    if (mapPref === 'BD') {
      countryQueryParam = '&countrycodes=bd';
    } else if (mapPref === 'CUSTOM' && customCode) {
      countryQueryParam = `&countrycodes=${encodeURIComponent(customCode.toLowerCase().trim())}`;
    }

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&accept-language=bn,en${countryQueryParam}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const newLat = parseFloat(data[0].lat);
          const newLng = parseFloat(data[0].lon);
          const displayName = data[0].display_name || searchQuery;

          setLat(newLat);
          setLng(newLng);
          setMapAddress(displayName);

          if (mapInstanceRef.current && markerInstanceRef.current) {
            mapInstanceRef.current.setView([newLat, newLng], 16);
            markerInstanceRef.current.setLatLng([newLat, newLng]);
          }
        } else {
          alert('কোনো স্থান খুঁজে পাওয়া যায়নি। দয়া করে আবার চেষ্টা করুন।');
        }
      }
    } catch (err) {
      console.warn('[MapPicker] Search note:', err);
    } finally {
      setIsGeocoding(false);
    }
  };

  const { showPermissionModal } = useModal();

  // Device GPS Location with robust high-accuracy fallback
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('আপনার ব্রাউজার জিপিএস লোকেশন সাপোর্ট করে না।');
      return;
    }
    setIsLocating(true);

    const applyPosition = (pos: GeolocationPosition) => {
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;

      setLat(userLat);
      setLng(userLng);

      if (mapInstanceRef.current && markerInstanceRef.current) {
        mapInstanceRef.current.setView([userLat, userLng], 17);
        markerInstanceRef.current.setLatLng([userLat, userLng]);
      }

      reverseGeocode(userLat, userLng);
      setIsLocating(false);
    };

    // First attempt high accuracy with 8 sec timeout
    navigator.geolocation.getCurrentPosition(
      applyPosition,
      (err) => {
        console.warn('[MapPicker] High accuracy geolocation error, attempting low-accuracy fallback:', err);
        if (err.code === err.PERMISSION_DENIED) {
          setIsLocating(false);
          const p = fallbackStore.pricingSettings;
          showPermissionModal({
            permissionType: 'location',
            title: p.locationPermissionModalTitle || 'লোকেশন পারমিশন আবশ্যক',
            message: p.locationPermissionModalBody || 'ম্যাপে আপনার বর্তমান অবস্থান ব্যবহার করতে ডিভাইসের জিপিএস পারমিশন দেওয়া আবশ্যক।',
            onAllow: () => new Promise((resolve) => { handleCurrentLocation(); resolve(true); }),
            allowText: 'Allow Location',
          });
          return;
        }
        // Fallback: low accuracy (IP/Wi-Fi positioning), longer timeout
        navigator.geolocation.getCurrentPosition(
          applyPosition,
          (fallbackErr) => {
            console.warn('[MapPicker] Fallback geolocation error:', fallbackErr);
            alert('জিপিএস লোকেশন পাওয়া যায়নি। অনুগ্রহ করে ম্যাপে স্থানটি সিলেক্ট করুন।');
            setIsLocating(false);
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  const handleConfirm = () => {
    const finalDetail = detailAddress.trim();
    const finalMap = mapAddress.trim();

    if (!finalDetail && !finalMap) {
      alert('দয়া করে ঠিকানার বিবরণ লিখুন বা ম্যাপে পিন সিলেক্ট করুন।');
      return;
    }

    let combinedAddress = '';
    if (finalDetail && finalMap) {
      if (finalDetail.includes(finalMap)) {
        combinedAddress = finalDetail;
      } else {
        combinedAddress = `${finalDetail}, ${finalMap}`;
      }
    } else {
      combinedAddress = finalDetail || finalMap;
    }

    onSelectLocation({
      address: combinedAddress,
      lat: mapError ? undefined : lat,
      lng: mapError ? undefined : lng,
    });
    onClose();
  };

  if (!isOpen) return null;

  const p = fallbackStore.pricingSettings;
  const guideText = p.mapPickerGuideText || 'যে location select করতে চান, সেখান পিন (icon) টি নিয়ে বসান, বা ওই place-এ click করুন। তারপর specific ভাবে building, market-এর নাম add করুন map-এর নিচের যে input box টি আছে সেখানে।';
  const guideOkText = p.mapPickerGuideOkText || 'ঠিক আছে';

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="relative w-full flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ maxWidth: '720px', maxHeight: '80dvh' }}
      >
      {/* ── Sticky Top Bar with prominent close button ── */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm"
        style={{ position: 'relative', zIndex: 10000 }}
      >
        <div className="flex items-center gap-2 text-gray-900 font-extrabold text-sm">
          <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          id="map-picker-close-btn"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-extrabold shadow-lg transition-all"
        >
          <X className="w-4 h-4" />
          <span>বন্ধ করুন</span>
        </button>
      </div>

      {/* ── Scrollable Content Body ── */}
      <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
        {/* Map Area */}
        {mapError ? (
          <div className="w-full py-6 px-4 border-b border-amber-200 bg-amber-50 text-amber-900 flex flex-col items-center justify-center text-center space-y-2">
            <AlertTriangle className="w-7 h-7 text-amber-600" />
            <h4 className="font-extrabold text-sm">ম্যাপ লোড হতে সমস্যা হয়েছে</h4>
            <p className="text-xs text-amber-800">
              সরাসরি নিচে আপনার নির্দিষ্ট ঠিকানাটি লিখুন।
            </p>
          </div>
        ) : (
          <div
            className="relative w-full bg-emerald-50/20 shrink-0"
            style={{ height: '50dvh', minHeight: '260px' }}
          >
            {/* 1. Search Bar floating top of map */}
            <form
              onSubmit={handleSearch}
              className="absolute top-2.5 left-2.5 right-2.5 z-20 flex gap-1.5 p-1 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-emerald-100"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="এলাকা বা স্থান খুঁজুন..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 bg-gray-50/80 border border-gray-200/80 rounded-xl text-xs focus:outline-none focus:border-emerald-500 text-gray-900 placeholder-gray-400 font-medium"
                />
                <Search className="w-3.5 h-3.5 text-emerald-600 absolute left-2.5 top-2.5" />
              </div>
              <button
                type="submit"
                disabled={isGeocoding}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-extrabold transition-all disabled:opacity-50 shadow-sm shrink-0"
              >
                {isGeocoding ? '...' : 'খুঁজুন'}
              </button>
            </form>

            {/* Map Canvas */}
            <div ref={mapContainerRef} className="w-full h-full z-10" />

            {/* 2. Selected Location Overlay - bottom left over the map */}
            <div className="absolute bottom-2.5 left-2.5 z-20 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-emerald-200/80 shadow-md flex items-center gap-1.5 pointer-events-none max-w-[55%]">
              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-[10px] font-bold text-gray-800 truncate leading-tight">
                {isGeocoding ? (
                  <span className="text-emerald-600 italic">ঠিকানা খোঁজা হচ্ছে...</span>
                ) : (
                  mapAddress || 'ম্যাপে স্থান নির্বাচন করুন'
                )}
              </span>
            </div>

            {/* 3. GPS Locate Button - bottom right */}
            <div className="absolute bottom-2.5 right-2.5 z-20 flex flex-col items-end gap-1.5 pointer-events-none max-w-[42%]">
              <div className="bg-violet-950/95 backdrop-blur-md text-white text-[9px] font-medium px-2 py-1 rounded-xl shadow-lg border border-violet-800/60 leading-tight text-right pointer-events-auto">
                এখানে ক্লিক করলে আপনার বর্তমান পজিশনে নিয়ে আসবে
              </div>
              <button
                type="button"
                onClick={handleCurrentLocation}
                disabled={isLocating}
                title="আপনার বর্তমান লোকেশনে যান"
                className="p-2.5 bg-violet-600 hover:bg-violet-700 active:scale-95 text-white border border-violet-500/50 rounded-xl shadow-md text-xs font-extrabold transition-all disabled:opacity-60 flex items-center justify-center pointer-events-auto shrink-0"
              >
                <Navigation className={`w-4 h-4 text-white ${isLocating ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* ── Guide Overlay ── */}
            {showGuide && (
              <div
                className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.52)' }}
              >
                <div
                  className="w-full max-w-sm rounded-3xl p-6 flex flex-col items-center gap-5 shadow-2xl"
                  style={{ background: 'rgba(15, 30, 20, 0.93)', border: '1.5px solid rgba(52,211,153,0.25)' }}
                >
                  {/* Icon */}
                  <div className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-600/20 border-2 border-emerald-500/40">
                    <MapPin className="w-7 h-7 text-emerald-400" />
                  </div>
                  {/* Guide text */}
                  <p className="text-white text-center text-sm font-semibold leading-relaxed" style={{ fontFamily: 'inherit' }}>
                    {guideText}
                  </p>
                  {/* OK Button */}
                  <button
                    type="button"
                    onClick={() => setShowGuide(false)}
                    className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/30 transition-all"
                  >
                    {guideOkText}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Below Map: Detail Address Input */}
        <div className="p-3 bg-white border-t border-gray-100">
          {addressLabel && (
            <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 shrink-0"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              {addressLabel}
            </label>
          )}
          <input
            type="text"
            value={detailAddress}
            onChange={(e) => setDetailAddress(e.target.value)}
            placeholder={addressPlaceholder || 'আপনার নির্দিষ্ট ফ্লাট, বাসা বা ল্যান্ডমার্ক...'}
            className="w-full px-3.5 py-2.5 bg-white border-2 border-emerald-300 focus:border-emerald-500 focus:bg-emerald-50/30 rounded-2xl text-xs sm:text-sm text-gray-900 focus:outline-none font-medium placeholder-gray-400 transition-colors shadow-sm"
          />
        </div>
      </div>

      {/* ── Sticky Bottom Footer Actions ── */}
      <div
        className="shrink-0 p-3 px-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-2"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200/60 rounded-xl transition-colors"
        >
          বাতিল
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all active:scale-98"
        >
          <Check className="w-3.5 h-3.5" />
          <span>ঠিকানা নিশ্চিত করুন</span>
        </button>
      </div>
      </div>
    </div>
  );
};
