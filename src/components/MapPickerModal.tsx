'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

  const [lat, setLat] = useState<number>(initialLocation?.lat || 23.9013);
  const [lng, setLng] = useState<number>(initialLocation?.lng || 90.2699);
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
    const initialLat = initialLocation?.lat || 23.9013;
    const initialLng = initialLocation?.lng || 90.2699;
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
          zoomControl: false,
        }).setView([initialLat, initialLng], 15);
        mapInstanceRef.current = map;

        // Earth / Satellite Hybrid Tile Layer (Google Maps style)
        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps',
          maxZoom: 20,
        }).addTo(map);

        // Handle map drag/pan stop
        map.on('dragend', () => {
          const center = map.getCenter();
          setLat(center.lat);
          setLng(center.lng);
          map.setView(center, 19, { animate: true });
          map.once('moveend', () => {
            const finalCenter = map.getCenter();
            reverseGeocode(finalCenter.lat, finalCenter.lng);
          });
        });

        // Handle map click
        map.on('click', (e: any) => {
          const { lat: clickLat, lng: clickLng } = e.latlng;
          setLat(clickLat);
          setLng(clickLng);
          map.setView([clickLat, clickLng], 19, { animate: true });
          map.once('moveend', () => {
            reverseGeocode(clickLat, clickLng);
          });
        });

        // Trigger initial reverse geocode for the starting position
        reverseGeocode(initialLat, initialLng);

        // Auto-locate to user's GPS position whenever the map opens — even if an
        // initialLocation was provided. This ensures the map is always centered on
        // the customer's actual position. The address text field keeps the prefilled
        // value so the customer can confirm/keep their saved address if it's nearby.
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const userLat = pos.coords.latitude;
              const userLng = pos.coords.longitude;
              setLat(userLat);
              setLng(userLng);
              if (mapInstanceRef.current) {
                mapInstanceRef.current.setView([userLat, userLng], 17, { animate: true });
                mapInstanceRef.current.once('moveend', () => {
                  // Only reverse-geocode if no detail address was pre-filled
                  if (!initialLocation?.address) {
                    reverseGeocode(userLat, userLng);
                  }
                });
              }
            },
            () => {
              // GPS denied/unavailable — fall back to initialLocation already loaded above
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
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          const data = JSON.parse(text);
          if (data && data.length > 0) {
            const newLat = parseFloat(data[0].lat);
            const newLng = parseFloat(data[0].lon);
            const displayName = data[0].display_name || searchQuery;

            setLat(newLat);
            setLng(newLng);
            setMapAddress(displayName);

            if (mapInstanceRef.current) {
              mapInstanceRef.current.setView([newLat, newLng], 19, { animate: true });
              mapInstanceRef.current.once('moveend', () => {
                reverseGeocode(newLat, newLng);
              });
            }
          } else {
            alert('কোনো স্থান খুঁজে পাওয়া যায়নি। দয়া করে আবার চেষ্টা করুন।');
          }
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

      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([userLat, userLng], 19, { animate: true });
        mapInstanceRef.current.once('moveend', () => {
          reverseGeocode(userLat, userLng);
        });
      }

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

  if (!isOpen || typeof document === 'undefined') return null;

  const p = fallbackStore.pricingSettings;
  const guideText = modalType === 'delivery'
    ? (p.mapPickerDeliveryGuideText || p.mapPickerGuideText || 'আপনার বাসা বা ডেলিভারি পাওয়ার স্থানে পিন সরিয়ে নিন। নিচের box-এ বাসার নাম বা ফ্ল্যাট নম্বর যোগ করুন।')
    : (p.mapPickerPickupGuideText || p.mapPickerGuideText || 'যে দোকান বা স্থান থেকে আনতে হবে, সেই স্থানে পিন সরিয়ে নিয়ে যান অথবা ক্লিক করুন। দোকানের নাম বা বিস্তারিত ঠিকানা নিচের input box-এ লিখুন।');
  const guideOkText = p.mapPickerGuideOkText || 'ঠিক আছে';

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

              {/* Map Canvas */}
              <div ref={mapContainerRef} className="w-full h-full z-10" />

              {/* Central Pointer - static, overlayed on top of the map container in the dead center */}
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(100%-6px)] z-20 pointer-events-none flex flex-col items-center"
                style={{ marginTop: '-20px' }}
              >
                <div className="bg-black text-lime-300 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold whitespace-nowrap mb-1 animate-bounce" style={{ boxShadow: '0 0 8px 2px rgba(163,230,53,0.7), 0 0 2px 1px rgba(163,230,53,0.9)', border: '1px solid rgba(163,230,53,0.6)' }}>
                  এখানে পিন করুন
                </div>
                {/* Lime Green Pin Icon - highlighted with dark neon glow */}
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center border-[3px] border-black"
                  style={{ background: 'linear-gradient(135deg, #a3e635 0%, #65a30d 100%)', boxShadow: '0 0 0 3px rgba(0,0,0,0.8), 0 0 12px 4px rgba(163,230,53,0.8), 0 0 24px 8px rgba(101,163,13,0.5), 0 6px 20px rgba(0,0,0,0.6)' }}
                >
                  <MapPin className="w-6 h-6 text-black fill-lime-200" />
                </div>
                {/* Pointer stem - dark */}
                <div
                  className="w-1.5 h-5 rounded-b-full"
                  style={{ background: 'linear-gradient(to bottom, #1a1a1a, #000000)' }}
                />
                {/* Ground dot shadow */}
                <div className="w-4 h-2 rounded-full blur-[2px]" style={{ background: 'rgba(163,230,53,0.45)' }} />
              </div>

              {/* Combined Detail Address and Selected Address Overlay - bottom of the map */}
              <div className="absolute bottom-[3px] left-0 right-0 z-20 flex items-center gap-2 py-4 px-3 bg-white rounded-t-2xl shadow-xl border-t border-emerald-100">
                <input
                  type="text"
                  value={detailAddress}
                  onChange={(e) => setDetailAddress(e.target.value)}
                  placeholder={addressPlaceholder || 'Rahman Villa...'}
                  className="w-2/5 min-w-[120px] bg-transparent outline-none text-xs text-gray-900 placeholder-gray-400 font-semibold border-r border-gray-200 pr-2"
                />
                <span className="text-[9px] font-medium text-gray-600 truncate flex-1 leading-tight pl-1">
                  {isGeocoding ? (
                    <span className="text-emerald-600 italic">ঠিকানা খোঁজা হচ্ছে...</span>
                  ) : (
                    mapAddress || 'ম্যাপে স্থান নির্বাচন করুন'
                  )}
                </span>
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
