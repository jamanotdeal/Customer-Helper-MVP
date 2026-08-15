'use client';

import React, { useEffect, useRef, useState } from 'react';
import { LocationData } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { MapPin, X, Navigation, Check, Search, AlertCircle, AlertTriangle } from 'lucide-react';

import { useModal } from '@/components/CustomModal';

interface MapPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialLocation?: LocationData;
  onSelectLocation: (loc: LocationData) => void;
  addressLabel?: string;
  addressPlaceholder?: string;
  onMapError?: () => void;
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
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);

  const [lat, setLat] = useState<number>(initialLocation?.lat || 23.8759); // Default Dhaka / DIU area
  const [lng, setLng] = useState<number>(initialLocation?.lng || 90.3795);
  const [mapAddress, setMapAddress] = useState<string>('');
  const [detailAddress, setDetailAddress] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapError, setMapError] = useState<boolean>(false);

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

        const map = L.map(mapContainerRef.current).setView([initialLat, initialLng], 15);
        mapInstanceRef.current = map;

        // OSM Tile Layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        // Custom Green Pin Icon (White & Green site theme)
        const customIcon = L.divIcon({
          className: 'custom-leaflet-marker',
          html: `
            <div style="background-color: #059669; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 3px solid white; box-shadow: 0 4px 12px rgba(5,150,105,0.4); transform: translate(-50%, -50%);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
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
          alert('কোনো স্থান খুঁজে পাওয়া যায়নি। দয়া করে আবার চেষ্টা করুন।');
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
            message: p.locationPermissionModalBody || 'ম্যাপে আপনার বর্তমান অবস্থান ব্যবহার করতে ডিভাইসের জিপিএস পারমিশন দেওয়া আবশ্যক।',
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
            alert('জিপিএস লোকেশন পাওয়া যায়নি। অনুগ্রহ করে ম্যাপে স্থানটি সিলেক্ট করুন।');
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
      alert('দয়া করে ঠিকানার বিবরণ লিখুন বা ম্যাপে পিন সিলেক্ট করুন।');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-emerald-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-100 bg-emerald-50/50">
          <div className="flex items-center gap-2.5 text-gray-900 font-extrabold text-base sm:text-lg">
            <MapPin className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-emerald-100/80 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {/* Leaflet Map Container or Fallback */}
          {mapError ? (
            <div className="w-full py-6 px-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 flex flex-col items-center justify-center text-center space-y-2">
              <AlertTriangle className="w-7 h-7 text-amber-600" />
              <h4 className="font-extrabold text-sm">ম্যাপ লোড হতে সমস্যা হয়েছে</h4>
              <p className="text-xs text-amber-800">
                ইন্টারনেট সমস্যা বা সার্ভার ব্যস্ত থাকার কারণে ম্যাপ শুরু করা যায়নি। আপনি সরাসরি নিচে আপনার সঠিক ঠিকানাটি লিখুন।
              </p>
            </div>
          ) : (
            <div className="relative w-full h-72 sm:h-88 rounded-2xl overflow-hidden border border-emerald-200 bg-emerald-50/20 shadow-inner">
              {/* 1. Area Search Form FLOATING OVER THE MAP */}
              <form
                onSubmit={handleSearch}
                className="absolute top-3 left-3 right-3 z-20 flex gap-2 p-1.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-emerald-100/90"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="এলাকা বা স্থান খুঁজুন (যেমন: DIU Smart City, Savar)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-gray-50/80 border border-gray-200/80 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-emerald-500 text-gray-900 placeholder-gray-400 font-medium"
                  />
                  <Search className="w-4 h-4 text-emerald-600 absolute left-3 top-2.5" />
                </div>
                <button
                  type="submit"
                  disabled={isGeocoding}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-extrabold transition-all disabled:opacity-50 shadow-md shadow-emerald-600/20 shrink-0"
                >
                  {isGeocoding ? 'খোঁজা...' : 'খুঁজুন'}
                </button>
              </form>

              {/* Map Canvas */}
              <div ref={mapContainerRef} className="w-full h-full z-10" />

              {/* Helpful Map Instruction Badge */}
              <div className="absolute bottom-3 left-3 z-20 hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-md text-[11px] font-bold text-emerald-800 rounded-xl border border-emerald-200/80 shadow-md max-w-[200px]">
                <AlertCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">ম্যাপে পিন টেনে অবস্থান বসান</span>
              </div>

              {/* Current Geolocation Floating Highlighted Button */}
              <button
                type="button"
                onClick={handleCurrentLocation}
                disabled={isLocating}
                className="absolute bottom-3 right-3 z-20 flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white border border-emerald-500/50 rounded-2xl shadow-lg shadow-emerald-700/30 text-xs sm:text-sm font-extrabold transition-all disabled:opacity-60"
              >
                <Navigation className={`w-4 h-4 text-white ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isLocating ? 'জিপিএস খোঁজা হচ্ছে...' : 'আমার বর্তমান অবস্থান'}</span>
              </button>
            </div>
          )}

          {/* Founded location from map (ONLY location box UNDER the map, label removed) */}
          {!mapError && (
            <div className="w-full p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl text-xs font-semibold text-emerald-950 flex items-start gap-2.5 min-h-[44px]">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="flex-1 break-words">
                {isGeocoding ? (
                  <span className="text-emerald-600 font-medium italic animate-pulse">
                    ম্যাপের অবস্থান থেকে ঠিকানা খোঁজা হচ্ছে...
                  </span>
                ) : (
                  mapAddress || 'ম্যাপে স্থান নির্বাচন করুন'
                )}
              </span>
            </div>
          )}

          {/* Detail Address Input */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-gray-700">
              {addressLabel || 'ঠিকানার বিস্তারিত'}
            </label>
            <input
              type="text"
              value={detailAddress}
              onChange={(e) => setDetailAddress(e.target.value)}
              placeholder={addressPlaceholder || 'আপনার নির্দিষ্ট ঠিকানা লিখুন'}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 focus:outline-none focus:border-emerald-500 font-medium placeholder-gray-400"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-emerald-100 bg-emerald-50/30 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-2xl transition-colors"
          >
            বাতিল
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-2xl shadow-md shadow-emerald-600/20 transition-all active:scale-98"
          >
            <Check className="w-4 h-4" />
            <span>ঠিকানা নিশ্চিত করুন</span>
          </button>
        </div>
      </div>
    </div>
  );
};
