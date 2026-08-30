'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, X, Navigation, Check, Search, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { calculateDistanceKm } from '@/lib/pricing';
import { LocationData } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { usePullToRefreshLock } from '@/hooks/usePullToRefreshLock';

interface DistanceCalculatorMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDistance: (distanceKm: number) => void;
}

export const DistanceCalculatorMapModal: React.FC<DistanceCalculatorMapModalProps> = ({
  isOpen,
  onClose,
  onSelectDistance,
}) => {
  // Leaflet consumes the drag itself, so the native pull gesture must be
  // disarmed while this map is on screen.
  usePullToRefreshLock();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const deliveryMarkerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);

  const [activePinType, setActivePinType] = useState<'pickup' | 'delivery'>('pickup');
  const [pickupLoc, setPickupLoc] = useState<LocationData | null>(null);
  const [deliveryLoc, setDeliveryLoc] = useState<LocationData | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [mapError, setMapError] = useState<boolean>(false);

  // Computed distance
  const calculatedKm =
    pickupLoc?.lat && pickupLoc?.lng && deliveryLoc?.lat && deliveryLoc?.lng
      ? parseFloat(
          calculateDistanceKm(pickupLoc.lat, pickupLoc.lng, deliveryLoc.lat, deliveryLoc.lng).toFixed(1)
        )
      : null;

  useEffect(() => {
    if (!isOpen) return;

    // Reset local states
    setPickupLoc(null);
    setDeliveryLoc(null);
    setActivePinType('pickup');
    setSearchQuery('');
    setMapError(false);

    let L: any = null;

    const initMap = async () => {
      try {
        if (!mapContainerRef.current) return;

        L = await import('leaflet');

        // Inject Leaflet CSS if missing
        if (!document.getElementById('leaflet-css-picker')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-picker';
          link.rel = 'stylesheet';
          link.href = '/vendor/leaflet/leaflet.css';
          document.head.appendChild(link);
        }

        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        const initialLat = 23.9013;
        const initialLng = 90.2699;

        const map = L.map(mapContainerRef.current, {
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: true,
          zoomControl: false,
        }).setView([initialLat, initialLng], 14);

        mapInstanceRef.current = map;

        // Satellite Hybrid Tiles
        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps',
          maxZoom: 20,
        }).addTo(map);

        // Handle Map Click
        map.on('click', (e: any) => {
          const { lat, lng } = e.latlng;
          handleMapClickAt(lat, lng, L);
        });

        // Try getting current GPS to center map initially
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.setView([pos.coords.latitude, pos.coords.longitude], 15);
              }
            },
            () => {},
            { enableHighAccuracy: true, timeout: 5000 }
          );
        }
      } catch (err) {
        console.warn('[DistanceMapModal] Leaflet error:', err);
        setMapError(true);
      }
    };

    const timer = setTimeout(() => {
      initMap();
    }, 60);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const updateMarkersAndLine = (
    newPickup: LocationData | null,
    newDelivery: LocationData | null,
    L: any
  ) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const leaflet = L || (window as any).L;
    if (!leaflet) return;

    // 1. Pickup Marker
    if (newPickup?.lat && newPickup?.lng) {
      if (pickupMarkerRef.current) {
        pickupMarkerRef.current.setLatLng([newPickup.lat, newPickup.lng]);
      } else {
        const greenIcon = leaflet.divIcon({
          className: 'custom-leaflet-marker',
          html: `<div style="background:#10b981;color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;border:2px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,0.3)">A</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        pickupMarkerRef.current = leaflet.marker([newPickup.lat, newPickup.lng], {
          icon: greenIcon,
        }).addTo(map);
      }
    } else if (pickupMarkerRef.current) {
      map.removeLayer(pickupMarkerRef.current);
      pickupMarkerRef.current = null;
    }

    // 2. Delivery Marker
    if (newDelivery?.lat && newDelivery?.lng) {
      if (deliveryMarkerRef.current) {
        deliveryMarkerRef.current.setLatLng([newDelivery.lat, newDelivery.lng]);
      } else {
        const blueIcon = leaflet.divIcon({
          className: 'custom-leaflet-marker',
          html: `<div style="background:#3b82f6;color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;border:2px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,0.3)">B</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        deliveryMarkerRef.current = leaflet.marker([newDelivery.lat, newDelivery.lng], {
          icon: blueIcon,
        }).addTo(map);
      }
    } else if (deliveryMarkerRef.current) {
      map.removeLayer(deliveryMarkerRef.current);
      deliveryMarkerRef.current = null;
    }

    // 3. Draw Connecting Line between A and B
    if (newPickup?.lat && newPickup?.lng && newDelivery?.lat && newDelivery?.lng) {
      const latlngs = [
        [newPickup.lat, newPickup.lng],
        [newDelivery.lat, newDelivery.lng],
      ];
      if (polylineRef.current) {
        polylineRef.current.setLatLngs(latlngs);
      } else {
        polylineRef.current = leaflet.polyline(latlngs, {
          color: '#10b981',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.9,
        }).addTo(map);
      }
      map.fitBounds(latlngs, { padding: [50, 50] });
    } else if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }
  };

  const handleMapClickAt = (lat: number, lng: number, L?: any) => {
    if (activePinType === 'pickup') {
      const updatedPickup: LocationData = { address: `পিকআপ পয়েন্ট (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng };
      setPickupLoc(updatedPickup);
      updateMarkersAndLine(updatedPickup, deliveryLoc, L);
      // Auto switch to delivery pin selection if delivery not set yet
      if (!deliveryLoc) {
        setActivePinType('delivery');
      }
    } else {
      const updatedDelivery: LocationData = { address: `ডেলিভারি পয়েন্ট (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng };
      setDeliveryLoc(updatedDelivery);
      updateMarkersAndLine(pickupLoc, updatedDelivery, L);
    }
  };

  // Search using Nominatim
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !mapInstanceRef.current) return;
    setIsGeocoding(true);

    const mapPref = fallbackStore.pricingSettings.mapLocationPreference || 'BD';
    const customCode = fallbackStore.pricingSettings.customCountryCode || 'bd';

    let countryParam = '';
    if (mapPref === 'BD') countryParam = '&countrycodes=bd';
    else if (mapPref === 'CUSTOM' && customCode) countryParam = `&countrycodes=${encodeURIComponent(customCode.trim())}`;

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&accept-language=bn,en${countryParam}`
      );
      if (res.ok) {
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          const data = JSON.parse(text);
          if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            mapInstanceRef.current.setView([lat, lng], 16);
            handleMapClickAt(lat, lng);
          } else {
            if (typeof window !== 'undefined' && (window as any).showCustomAlert) {
              (window as any).showCustomAlert('স্থান পাওয়া যায়নি', 'কোনো স্থান পাওয়া যায়নি। আবার চেষ্টা করুন।', 'warning');
            } else {
              alert('কোনো স্থান পাওয়া যায়নি। আবার চেষ্টা করুন।');
            }
          }
        }
      }
    } catch (err) {
      console.warn('[DistanceMapModal] Search error:', err);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleCurrentGPS = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], 17);
        }
        handleMapClickAt(lat, lng);
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        if (typeof window !== 'undefined' && (window as any).showCustomAlert) {
          (window as any).showCustomAlert('লোকেশন পাওয়া যায়নি', 'জিপিএস লোকেশন পাওয়া যায়নি।', 'warning');
        } else {
          alert('জিপিএস লোকেশন পাওয়া যায়নি।');
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleConfirm = () => {
    if (!calculatedKm || calculatedKm <= 0) {
      if (typeof window !== 'undefined' && (window as any).showCustomAlert) {
        (window as any).showCustomAlert('স্থান নির্বাচন করুন', 'দয়া করে ম্যাপে পিকআপ ও ডেলিভারি দুইটি স্থান সিলেক্ট করুন।', 'warning');
      } else {
        alert('দয়া করে ম্যাপে পিকআপ ও ডেলিভারি দুইটি স্থান সিলেক্ট করুন।');
      }
      return;
    }
    onSelectDistance(calculatedKm);
    onClose();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full h-[85dvh] sm:h-[90dvh] sm:max-h-[850px] sm:max-w-[760px] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm z-20">
          <div className="flex items-center space-x-2 text-gray-900 font-extrabold text-sm">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>ম্যাপে দূরত্ব নির্ণয় করুন (Pick Distance)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-all border border-red-200"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>

        {/* Pin selector tabs */}
        <div className="shrink-0 bg-emerald-50/60 p-2 border-b border-emerald-100 flex items-center justify-center gap-2 z-20">
          <button
            type="button"
            onClick={() => setActivePinType('pickup')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-2xl text-xs font-bold transition-all ${
              activePinType === 'pickup'
                ? 'bg-emerald-600 text-white shadow-md scale-102'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">A</span>
            <span>১. পিকআপ স্থান {pickupLoc ? '✓' : ''}</span>
          </button>

          <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />

          <button
            type="button"
            onClick={() => setActivePinType('delivery')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-2xl text-xs font-bold transition-all ${
              activePinType === 'delivery'
                ? 'bg-blue-600 text-white shadow-md scale-102'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">B</span>
            <span>২. ডেলিভারি স্থান {deliveryLoc ? '✓' : ''}</span>
          </button>
        </div>

        {/* Map Body */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
          {mapError ? (
            <div className="p-8 text-center bg-amber-50 flex flex-col items-center justify-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-amber-600" />
              <h4 className="font-extrabold text-gray-900 text-sm">ম্যাপ লোড করা সম্ভব হয়নি</h4>
              <p className="text-xs text-gray-600">আপনি সরাসরি ইনপুট বক্সে দূরত্ব (km) লিখে দিতে পারেন।</p>
            </div>
          ) : (
            <div className="relative w-full flex-1 h-full">
              {/* Floating search form */}
              <form
                onSubmit={handleSearch}
                className="absolute top-2.5 left-2.5 right-2.5 z-20 flex gap-1.5 p-1 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-emerald-100"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder={
                      activePinType === 'pickup'
                        ? 'পিকআপ স্থান খুঁজুন...'
                        : 'ডেলিভারি স্থান খুঁজুন...'
                    }
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

              {/* Leaflet map container */}
              <div ref={mapContainerRef} className="w-full h-full z-10" />

              {/* Floating instruction pill */}
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg backdrop-blur-md border border-slate-700 pointer-events-none text-center">
                {activePinType === 'pickup'
                  ? 'ম্যাপে ট্যাপ করে পিকআপ পিন A বসান'
                  : 'ম্যাপে ট্যাপ করে ডেলিভারি পিন B বসান'}
              </div>

              {/* GPS button */}
              <button
                type="button"
                onClick={handleCurrentGPS}
                disabled={isLocating}
                className="absolute bottom-4 right-3 z-20 p-2.5 bg-white border border-emerald-200 rounded-2xl shadow-lg text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all"
                title="বর্তমান লোকেশন"
              >
                <Navigation className={`w-5 h-5 ${isLocating ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* Footer info & confirm */}
        <div className="shrink-0 p-3.5 bg-slate-900 text-white flex items-center justify-between gap-3 z-20">
          <div>
            <span className="text-[10px] text-gray-400 font-medium block">আনুমানিক দূরত্ব (Calculated Distance):</span>
            <span className="text-lg font-black text-emerald-400">
              {calculatedKm !== null ? `${calculatedKm} km` : 'সিলেক্ট করুন'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-gray-300 transition-colors"
            >
              বাতিল
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!calculatedKm}
              className="flex items-center space-x-1 px-4 py-2 rounded-xl text-xs font-extrabold bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-40 transition-all active:scale-95 shadow-md shadow-emerald-500/20"
            >
              <Check className="w-4 h-4" />
              <span>দূরত্ব বসান</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
