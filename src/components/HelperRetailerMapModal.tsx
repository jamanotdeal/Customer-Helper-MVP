'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Shop, LocationData } from '@/types';
import { X, Navigation, Store, Filter, Check } from 'lucide-react';
import { usePullToRefreshLock } from '@/hooks/usePullToRefreshLock';
import { getSpiderfiedCoordinates, setupMarkerHoverElevation } from '@/utils/mapMarkerUtils';

interface HelperRetailerMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  shops: Shop[];
  selectedShopIds: string[];
  orderPickupLocation?: LocationData;
  orderDeliveryLocation?: LocationData;
  helperLocation?: LocationData;
  radiusKm?: number;
  onShopMarkerClick: (shop: Shop) => void;
}

const isMapAlive = (map: any) =>
  map &&
  map._loaded &&
  typeof map.getPane === 'function' &&
  map.getPane('mapPane') !== undefined &&
  map.getContainer() !== null;

export const HelperRetailerMapModal: React.FC<HelperRetailerMapModalProps> = ({
  isOpen,
  onClose,
  shops,
  selectedShopIds,
  orderPickupLocation,
  orderDeliveryLocation,
  helperLocation,
  radiusKm = 5,
  onShopMarkerClick,
}) => {
  // Leaflet consumes the drag itself, so the native pull gesture must be
  // disarmed while this map is on screen. Passing `isOpen` matters: these modals
  // stay mounted and toggle visibility, so an unconditional lock would disable
  // pull-to-refresh permanently (RequestComposer mounts two of these at once).
  usePullToRefreshLock(isOpen);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const hasFittedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  // Category filter state (multi-select)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Compute all available categories from the shops
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    shops.forEach((s) => {
      if (s.type && s.type.trim()) cats.add(s.type.trim());
    });
    return Array.from(cats).sort();
  }, [shops]);

  // Filtered shops based on selected categories
  const filteredShops = useMemo(() => {
    if (selectedCategories.length === 0) return shops;
    return shops.filter((s) => s.type && selectedCategories.includes(s.type.trim()));
  }, [shops, selectedCategories]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const clearCategories = () => {
    setSelectedCategories([]);
  };

  // Initialize map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;
    let isMounted = true;

    const initMap = async () => {
      const L = await import('leaflet');
      if (!isMounted || !mapContainerRef.current) return;

      if (!document.getElementById('leaflet-css-retailer')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css-retailer';
        link.rel = 'stylesheet';
        link.href = '/vendor/leaflet/leaflet.css';
        document.head.appendChild(link);
      }

      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (e) {}
        mapInstanceRef.current = null;
      }

      // Center: prefer pickup location → delivery → helper → default Dhaka
      let centerLat = 23.8103;
      let centerLng = 90.4125;
      if (orderPickupLocation?.lat && orderPickupLocation?.lng) {
        centerLat = orderPickupLocation.lat;
        centerLng = orderPickupLocation.lng;
      } else if (orderDeliveryLocation?.lat && orderDeliveryLocation?.lng) {
        centerLat = orderDeliveryLocation.lat;
        centerLng = orderDeliveryLocation.lng;
      } else if (helperLocation?.lat && helperLocation?.lng) {
        centerLat = helperLocation.lat;
        centerLng = helperLocation.lng;
      }

      const map = L.map(mapContainerRef.current).setView([centerLat, centerLng], 15);
      mapInstanceRef.current = map;

      // Google hybrid satellite tiles
      L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '© Google Maps',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      }).addTo(map);

      // Add delivery/pickup point markers
      const addOrderMarker = (loc: LocationData, color: string, label: string) => {
        if (!loc?.lat || !loc?.lng) return;
        const html = `
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="background:${color};color:white;font-size:10px;font-weight:900;padding:4px 10px;border-radius:20px;border:2px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4);white-space:nowrap;">${label}</div>
            <div style="width:2px;height:12px;background:#0f172a;"></div>
            <div style="width:10px;height:10px;border-radius:50%;background:#0f172a;border:2px solid white;"></div>
          </div>`;
        L.marker([loc.lat, loc.lng], {
          icon: L.divIcon({ className: '', html, iconSize: [80, 44], iconAnchor: [40, 44] }),
        }).addTo(map);
      };

      if (orderPickupLocation?.lat && orderPickupLocation?.lng)
        addOrderMarker(orderPickupLocation, '#f59e0b', '📦 Pickup');
      if (orderDeliveryLocation?.lat && orderDeliveryLocation?.lng)
        addOrderMarker(orderDeliveryLocation, '#10b981', '🏠 Delivery');
      if (helperLocation?.lat && helperLocation?.lng)
        addOrderMarker(helperLocation, '#3b82f6', '🏍 You');

      if (isMounted) setMapReady(true);
    };

    initMap();

    return () => {
      isMounted = false;
      setMapReady(false);
      hasFittedRef.current = false;
      markersRef.current.clear();
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (e) {}
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen]);

  // Render shop markers
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    let cancelled = false;

    const render = async () => {
      const L = await import('leaflet');
      if (cancelled) return;
      const map = mapInstanceRef.current;
      if (!isMapAlive(map)) return;

      const allPoints: [number, number][] = [];
      const currentIds = new Set(filteredShops.map((s) => s.id));

      markersRef.current.forEach((marker, id) => {
        if (!currentIds.has(id)) {
          try { marker.remove(); } catch (e) {}
          markersRef.current.delete(id);
        }
      });

      const spiderfiedShops = getSpiderfiedCoordinates(
        filteredShops,
        (s) => s.location?.lat,
        (s) => s.location?.lng
      );

      for (const entry of spiderfiedShops) {
        const { item: shop, originalLat, originalLng, displayLat, displayLng, overlapCount, overlapIndex } = entry;
        allPoints.push([originalLat, originalLng]);
        const isSelected = selectedShopIds.includes(shop.id);
        const hasCommission = shop.commissionPercent !== undefined;
        const hasOverlap = overlapCount > 1;

        const overlapBadgeHtml = hasOverlap
          ? `<span style="background:#f59e0b;color:#000;font-size:9px;font-weight:900;padding:1px 4px;border-radius:8px;margin-left:3px;">${overlapIndex}/${overlapCount}</span>`
          : '';

        const markerHtml = `
          <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
            <div style="background:${isSelected ? 'linear-gradient(135deg,#059669,#065f46)' : 'linear-gradient(135deg,#6b21a8,#4c1d95)'};color:white;padding:6px 11px;border-radius:14px;border:2.5px solid ${isSelected ? '#34d399' : hasOverlap ? '#f59e0b' : '#c084fc'};box-shadow:0 6px 20px rgba(${isSelected ? '5,150,105' : '107,33,168'},0.55);display:flex;align-items:center;gap:7px;font-family:sans-serif;white-space:nowrap;max-width:220px;">
              <div style="width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
              <div style="display:flex;flex-direction:column;min-width:0;text-align:left;">
                <div style="font-size:11px;font-weight:900;color:#fff;overflow:hidden;text-overflow:ellipsis;line-height:1.2;display:flex;align-items:center;">
                  ${shop.name} ${overlapBadgeHtml}
                </div>
                <div style="font-size:9px;font-weight:700;color:${isSelected ? '#a7f3d0' : '#e9d5ff'};overflow:hidden;text-overflow:ellipsis;">${shop.type}${hasCommission ? ` · ${shop.commissionPercent}% comm.` : ''}</div>
              </div>
              ${isSelected ? '<div style="width:16px;height:16px;border-radius:50%;background:#34d399;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' : ''}
            </div>
            <div style="width:3px;height:16px;background:#0f172a;margin-top:-1px;"></div>
            <div style="width:12px;height:12px;border-radius:50%;background:#0f172a;border:2.5px solid ${isSelected ? '#34d399' : hasOverlap ? '#f59e0b' : '#c084fc'};box-shadow:0 0 8px rgba(${isSelected ? '52,211,153' : '168,85,247'},0.8);"></div>
          </div>`;

        const icon = L.divIcon({
          className: `retailer-marker-${shop.id}`,
          html: markerHtml,
          iconSize: [220, 70],
          iconAnchor: [110, 70],
        });

        let existing = markersRef.current.get(shop.id);
        if (existing) {
          existing.setLatLng([displayLat, displayLng]);
          existing.setIcon(icon);
        } else {
          if (cancelled || !isMapAlive(map)) return;
          existing = L.marker([displayLat, displayLng], { icon }).addTo(map);
          setupMarkerHoverElevation(existing);
          existing.on('click', () => onShopMarkerClick(shop));
          markersRef.current.set(shop.id, existing);
        }
      }

      if (!hasFittedRef.current && allPoints.length > 0 && isMapAlive(map)) {
        if (allPoints.length > 1) {
          map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50] });
        } else {
          map.setView(allPoints[0], 16);
        }
        hasFittedRef.current = true;
      }
    };

    render();
    return () => { cancelled = true; };
  }, [filteredShops, mapReady, selectedShopIds]);

  const handleRecenter = async () => {
    if (!isMapAlive(mapInstanceRef.current)) return;
    const L = await import('leaflet');
    const pts: [number, number][] = filteredShops
      .filter((s) => s.location?.lat && s.location?.lng)
      .map((s) => [s.location.lat!, s.location.lng!]);

    if (orderPickupLocation?.lat && orderPickupLocation?.lng)
      pts.push([orderPickupLocation.lat, orderPickupLocation.lng]);
    if (orderDeliveryLocation?.lat && orderDeliveryLocation?.lng)
      pts.push([orderDeliveryLocation.lat, orderDeliveryLocation.lng]);

    if (pts.length > 1) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(pts), { padding: [50, 50] });
    } else if (pts.length === 1) {
      mapInstanceRef.current.setView(pts[0], 16);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-purple-900/60 border border-purple-700/50">
            <Store className="w-4 h-4 text-purple-300" />
          </div>
          <div>
            <h3 className="font-black text-sm text-white leading-tight">নিকটবর্তী দোকান বেছে নিন</h3>
            <p className="text-[10px] text-slate-400 font-medium">
              {filteredShops.length} of {shops.length} store{shops.length !== 1 ? 's' : ''} showing within {radiusKm}km · Tap a pin to view & select
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-rose-100 border border-rose-800/50 transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Category Multi-Select Filter Bar */}
      {availableCategories.length > 0 && (
        <div className="px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 flex items-center gap-2 overflow-x-auto shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-purple-300 shrink-0 mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>ফিল্টার:</span>
          </div>

          <button
            type="button"
            onClick={clearCategories}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              selectedCategories.length === 0
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
            }`}
          >
            {selectedCategories.length === 0 && <Check className="w-3.5 h-3.5" />}
            <span>সব দোকান ({shops.length})</span>
          </button>

          {availableCategories.map((cat) => {
            const isSelected = selectedCategories.includes(cat);
            const count = shops.filter((s) => s.type && s.type.trim() === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400/40'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 hover:text-white'
                }`}
              >
                {isSelected && <Check className="w-3 h-3" />}
                <span>{cat}</span>
                <span
                  className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                    isSelected ? 'bg-emerald-800 text-white' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Map Legend */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/90 border-b border-slate-800 overflow-x-auto shrink-0">
        <span className="text-[10px] text-slate-400 font-bold shrink-0">Legend:</span>
        {[
          { color: '#6b21a8', label: 'Retailer' },
          { color: '#059669', label: 'Selected' },
          { color: '#f59e0b', label: 'Pickup' },
          { color: '#10b981', label: 'Delivery' },
          { color: '#3b82f6', label: 'You' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full border border-white/30" style={{ background: item.color }} />
            <span className="text-[10px] text-slate-300 font-semibold">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Map Canvas */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Recenter button */}
        <div className="absolute bottom-4 left-4 z-20 pointer-events-auto">
          <button
            type="button"
            onClick={handleRecenter}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900/95 hover:bg-slate-800 backdrop-blur-md text-white rounded-2xl text-xs font-bold border border-slate-700 shadow-xl transition-all hover:scale-105 active:scale-95"
          >
            <Navigation className="w-3.5 h-3.5 text-purple-400" />
            <span>Re-center</span>
          </button>
        </div>

        {filteredShops.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur-md text-white text-sm font-bold px-6 py-4 rounded-2xl border border-slate-700 text-center">
              <Store className="w-8 h-8 text-purple-400 mx-auto mb-2" />
              <p>এই ক্যাটাগরিতে কোনো দোকান পাওয়া যায়নি</p>
              <p className="text-[10px] text-slate-400 font-medium mt-1">
                {selectedCategories.length > 0
                  ? 'Try selecting different categories or clear the filter'
                  : `No registered retailers within ${radiusKm}km`}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
