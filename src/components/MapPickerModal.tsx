'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LocationData } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { MapPin, X, Navigation, Check, Search, AlertTriangle } from 'lucide-react';

import { useModal } from '@/components/CustomModal';
import { getMapGuideShowCount, incrementMapGuideShowCount } from '@/lib/storage';
import { isLocationInAllowedAreas } from '@/lib/geofenceUtils';

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
  const leafletRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const [lat, setLat] = useState<number | undefined>(initialLocation?.lat);
  const [lng, setLng] = useState<number | undefined>(initialLocation?.lng);
  const [hasSelected, setHasSelected] = useState<boolean>(
    typeof initialLocation?.lat === 'number' && typeof initialLocation?.lng === 'number'
  );

  const [mapAddress, setMapAddress] = useState<string>('');
  const [detailAddress, setDetailAddress] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapError, setMapError] = useState<boolean>(false);

  // Guide overlay state
  const [showGuide, setShowGuide] = useState<boolean>(false);

  // Helper to place/update pin marker and option to zoom
  const setLocationAndPin = (targetLat: number, targetLng: number, zoomLevel?: number) => {
    setLat(targetLat);
    setLng(targetLng);
    setHasSelected(true);

    const map = mapInstanceRef.current;
    const L = leafletRef.current;

    if (map && L) {
      const pinIcon = L.divIcon({
        className: 'custom-map-picker-pin',
        html: `
          <div style="display:flex; flex-direction:column; align-items:center; transform: translate(-50%, -100%); cursor:pointer;">
            <div style="background:#000; color:#a3e635; padding:2px 8px; border-radius:9999px; font-size:10px; font-weight:800; white-space:nowrap; margin-bottom:4px; box-shadow:0 0 8px 2px rgba(163,230,53,0.7); border:1px solid rgba(163,230,53,0.6);">
              সিলেক্ট করা লোকেশন
            </div>
            <div style="width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid #000; background:linear-gradient(135deg, #a3e635 0%, #65a30d 100%); box-shadow:0 0 12px 4px rgba(163,230,53,0.8), 0 6px 20px rgba(0,0,0,0.6);">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#d9f99d" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div style="width:5px; height:12px; background:linear-gradient(to bottom, #1a1a1a, #000000); border-bottom-left-radius:9999px; border-bottom-right-radius:9999px;"></div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      if (markerRef.current) {
        markerRef.current.setLatLng([targetLat, targetLng]);
      } else {
        markerRef.current = L.marker([targetLat, targetLng], { icon: pinIcon }).addTo(map);
      }

      if (zoomLevel) {
        map.setView([targetLat, targetLng], zoomLevel, { animate: true });
      }
    }

    reverseGeocode(targetLat, targetLng);
  };

  // Load Leaflet dynamically & initialize map when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // Reset or initialize values when modal opens
    const initialLat = initialLocation?.lat || 23.9013;
    const initialLng = initialLocation?.lng || 90.2699;
    const hasInitCoords = typeof initialLocation?.lat === 'number' && typeof initialLocation?.lng === 'number';

    setLat(initialLocation?.lat);
    setLng(initialLocation?.lng);
    setHasSelected(hasInitCoords);
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

    const initMap = async () => {
      try {
        if (!mapContainerRef.current) return;

        // Import Leaflet dynamically to avoid SSR issues
        const L = await import('leaflet');
        leafletRef.current = L;

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
          markerRef.current = null;
        }

        const map = L.map(mapContainerRef.current, {
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: true,
          zoomControl: false,
        }).setView([initialLat, initialLng], hasInitCoords ? 18 : 15);
        mapInstanceRef.current = map;

        // Earth / Satellite Hybrid Tile Layer (Google Maps style)
        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps',
          maxZoom: 20,
        }).addTo(map);

        // Pre-place pin if initialLocation had valid coordinates
        if (hasInitCoords && initialLocation?.lat && initialLocation?.lng) {
          const pinIcon = L.divIcon({
            className: 'custom-map-picker-pin',
            html: `
              <div style="display:flex; flex-direction:column; align-items:center; transform: translate(-50%, -100%); cursor:pointer;">
                <div style="background:#000; color:#a3e635; padding:2px 8px; border-radius:9999px; font-size:10px; font-weight:800; white-space:nowrap; margin-bottom:4px; box-shadow:0 0 8px 2px rgba(163,230,53,0.7); border:1px solid rgba(163,230,53,0.6);">
                  সিলেক্ট করা লোকেশন
                </div>
                <div style="width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid #000; background:linear-gradient(135deg, #a3e635 0%, #65a30d 100%); box-shadow:0 0 12px 4px rgba(163,230,53,0.8), 0 6px 20px rgba(0,0,0,0.6);">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#d9f99d" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div style="width:5px; height:12px; background:linear-gradient(to bottom, #1a1a1a, #000000); border-bottom-left-radius:9999px; border-bottom-right-radius:9999px;"></div>
              </div>
            `,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });
          markerRef.current = L.marker([initialLocation.lat, initialLocation.lng], { icon: pinIcon }).addTo(map);
          reverseGeocode(initialLocation.lat, initialLocation.lng);
        }

        // Handle map click: place pin, set selected location, and zoom in
        map.on('click', (e: any) => {
          const { lat: clickLat, lng: clickLng } = e.latlng;
          setLocationAndPin(clickLat, clickLng, 18);
        });

        // Auto-locate to user's GPS position whenever the map opens
        // Centers map at user location initially (without auto-zooming or selecting unless clicked)
        if (navigator.geolocation && !hasInitCoords) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const userLat = pos.coords.latitude;
              const userLng = pos.coords.longitude;
              const pSet = fallbackStore.pricingSettings;
              const isAllowed = isLocationInAllowedAreas(
                { lat: userLat, lng: userLng },
                pSet.allowedDeliveryAreasEnabled,
                pSet.allowedDeliveryAreas
              );
              if (!isAllowed) return;

              if (mapInstanceRef.current) {
                mapInstanceRef.current.setView([userLat, userLng], 15, { animate: true });
              }
            },
            () => {
              // GPS denied/unavailable — keep fallback initial view
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
          );
        }

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
        markerRef.current = null;
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
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          const data = JSON.parse(text);
          const displayName = data.display_name || '';
          if (displayName) {
            setMapAddress(displayName);
          }
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

    if (mapError || !mapInstanceRef.current) {
      setMapAddress(searchQuery.trim());
      return;
    }

    setIsGeocoding(true);

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
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          const data = JSON.parse(text);
          if (data && data.length > 0) {
            const newLat = parseFloat(data[0].lat);
            const newLng = parseFloat(data[0].lon);

            setLocationAndPin(newLat, newLng, 18);
          } else {
            showAlert('কোনো স্থান পাওয়া যায়নি', 'কোনো স্থান খুঁজে পাওয়া যায়নি। দয়া করে আবার চেষ্টা করুন।', 'warning');
          }
        }
      }
    } catch (err) {
      console.warn('[MapPicker] Search note:', err);
    } finally {
      setIsGeocoding(false);
    }
  };

  const { showPermissionModal, showAlert } = useModal();

  // Device GPS Location
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      showAlert('লোকেশন অসমর্থিত', 'আপনার ব্রাউজার জিপিএস লোকেশন সাপোর্ট করে না।', 'error');
      return;
    }
    setIsLocating(true);

    const applyPosition = (pos: GeolocationPosition) => {
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;

      setLocationAndPin(userLat, userLng, 18);
      setIsLocating(false);
    };

    navigator.geolocation.getCurrentPosition(
      applyPosition,
      (err) => {
        console.warn('[MapPicker] Geolocation error:', err);
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
        navigator.geolocation.getCurrentPosition(
          applyPosition,
          (fallbackErr) => {
            console.warn('[MapPicker] Fallback geolocation error:', fallbackErr);
            showAlert('লোকেশন পাওয়া যায়নি', 'জিপিএস লোকেশন পাওয়া যায়নি। অনুগ্রহ করে ম্যাপে ক্লিক করে স্থানটি সিলেক্ট করুন।', 'warning');
            setIsLocating(false);
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  const handleConfirm = () => {
    if (!hasSelected || typeof lat !== 'number' || typeof lng !== 'number') {
      showAlert('লোকেশন সিলেক্ট করুন', 'অনুগ্রহ করে ম্যাপে নির্দিষ্ট ঠিকানার ওপর ক্লিক করে লোকেশন পিনটি সিলেক্ট করুন।', 'warning');
      return;
    }

    const finalDetail = detailAddress.trim();
    const finalMap = mapAddress.trim();

    if (!finalDetail) {
      showAlert('ঠিকানা আবশ্যক!', 'অনুগ্রহ করে নিচের বাক্সে বিস্তারিত ঠিকানা ম্যানুয়ালি লিখুন। এটি একটি বাধ্যতামূলক ফিল্ড।', 'warning');
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
      combinedAddress = finalDetail;
    }

    // Validate location against allowed serving area polygons if enabled
    const pSettings = fallbackStore.pricingSettings;
    if (!mapError && typeof lat === 'number' && typeof lng === 'number') {
      const allowed = isLocationInAllowedAreas(
        { lat, lng },
        pSettings.allowedDeliveryAreasEnabled,
        pSettings.allowedDeliveryAreas
      );
      if (!allowed) {
        const areaNames = (pSettings.allowedDeliveryAreas || []).map((a) => a.name).join(', ');
        const customMsg = pSettings.outOfServiceAreaMessage?.trim();
        const alertBody = customMsg
          ? `${customMsg}\n\n📍 অনুমোদিত সেবা এলাকা: ${areaNames || 'নির্দিষ্ট সার্ভিস এলাকা'}`
          : `দুঃখিত, আপনার নির্বাচন করা লোকেশনটি আমাদের সার্ভিস এরিয়ার বাইরে। আমরা বর্তমানে শুধুমাত্র নিম্নোক্ত এলাকায় সার্ভিস প্রদান করছি:\n\n📍 ${areaNames || 'নির্দিষ্ট সার্ভিস এলাকা'}\n\nঅনুগ্রহ করে সার্ভিস এরিয়ার ভেতরে লোকেশন নির্বাচন করুন।`;

        showAlert('সার্ভিস এরিয়ার বাইরে!', alertBody, 'warning');
        return;
      }
    }

    onSelectLocation({
      address: combinedAddress,
      lat: mapError ? undefined : lat,
      lng: mapError ? undefined : lng,
    });
    onClose();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const p = fallbackStore.pricingSettings;
  const guideText = modalType === 'delivery'
    ? (p.mapPickerDeliveryGuideText || p.mapPickerGuideText || 'আপনার বাসা বা ডেলিভারি পাওয়ার স্থানে ম্যাপে ক্লিক করে পিন বসান। নিচের box-এ বাসার নাম বা ফ্ল্যাট নম্বর যোগ করুন।')
    : (p.mapPickerPickupGuideText || p.mapPickerGuideText || 'যে দোকান বা স্থান থেকে আনতে হবে, সেই স্থানে ম্যাপে ক্লিক করে পিন বসান। দোকানের নাম বা বিস্তারিত ঠিকানা নিচের input box-এ লিখুন।');
  const guideOkText = p.mapPickerGuideOkText || 'ঠিক আছে';

  const inputPlaceholder = modalType === 'delivery'
    ? (p.mapPickerDeliveryPlaceholder || p.mapPickerPlaceholder || addressPlaceholder || 'যেমন: ৪এ, রহমান ভিলা, মডেল টাউন.')
    : (p.mapPickerPickupPlaceholder || p.mapPickerPlaceholder || addressPlaceholder || 'যেমন: আরিফ স্টোর, আশুলিয়া বাজার.');

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full h-[85dvh] sm:h-[90dvh] sm:max-h-[850px] sm:max-w-[760px] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* ── Sticky Top Bar with prominent close button ── */}
        <div
          className="shrink-0 flex items-center justify-between px-4 py-3.5 bg-white border-b border-gray-100 shadow-sm"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 active:scale-95 text-red-600 text-xs font-bold transition-all border border-red-200"
          >
            <X className="w-3.5 h-3.5" />
            <span>Close</span>
          </button>
        </div>

        {/* ── Content Body (No scroll, map fills area) ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
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
              className="relative w-full bg-emerald-50/20 flex-1 min-h-0"
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

              {/* Floating hint pill when no location selected yet */}
              {!hasSelected && (
                <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-black/85 backdrop-blur-md text-lime-300 border border-lime-400/50 text-[11px] font-extrabold px-3 py-1.5 rounded-full shadow-xl flex items-center gap-1.5 animate-pulse max-w-[90%] text-center">
                  <MapPin className="w-3.5 h-3.5 text-lime-400 shrink-0" />
                  <span>ম্যাপে যেকোনো স্থানে ক্লিক করে লোকেশন সিলেক্ট করুন</span>
                </div>
              )}

              {/* Map Canvas */}
              <div ref={mapContainerRef} className="w-full h-full z-10 cursor-pointer" />

              {/* Detail Address Overlay - bottom of the map */}
              <div className="absolute bottom-[3px] left-0 right-0 z-20 flex items-center py-3.5 px-3 bg-white rounded-t-2xl shadow-xl border-t border-emerald-100">
                <input
                  type="text"
                  value={detailAddress}
                  onChange={(e) => setDetailAddress(e.target.value)}
                  placeholder={inputPlaceholder}
                  className="w-full bg-transparent outline-none text-xs text-gray-900 placeholder-gray-400 font-semibold px-1"
                  required
                />
              </div>

              <button
                type="button"
                onClick={handleCurrentLocation}
                disabled={isLocating}
                title="আপনার বর্তমান লোকেশনে যান"
                className="absolute bottom-16 right-2.5 z-20 flex items-center gap-2 px-3 py-2 active:scale-95 rounded-2xl text-[10px] font-bold transition-all disabled:opacity-60 text-white"
                style={{ background: 'linear-gradient(135deg, #a3e635 0%, #65a30d 100%)', border: '1px solid rgba(163,230,53,0.5)', boxShadow: '0 0 12px 3px rgba(163,230,53,0.55), 0 4px 16px rgba(101,163,13,0.4)' }}
              >
                <Navigation className={`w-4 h-4 text-white shrink-0 ${isLocating ? 'animate-spin' : ''}`} />
                <span className="leading-tight text-left text-white">
                  {isLocating ? 'খোঁজা হচ্ছে...' : 'বর্তমান পজিশনে আনুন'}
                </span>
              </button>

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
    </div>,
    document.body
  );
};
