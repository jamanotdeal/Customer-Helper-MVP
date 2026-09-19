'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Map, X, Navigation, Maximize2, Minimize2, Check, MapPin, Sparkles, ShoppingBag, Store, Search, Phone, ChevronUp, ChevronDown, PlusCircle } from 'lucide-react';
import { Order, LocationData, Shop, ShopOrder, AllowedAreaPolygon } from '@/types';
import { fetchRoadRoute } from '@/lib/routeUtils';
import { fallbackStore } from '@/lib/firebase';
import { getSpiderfiedCoordinates, setupMarkerHoverElevation } from '@/utils/mapMarkerUtils';

const calcDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

interface HelperOrderMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  helperLocation?: LocationData & { updatedAt?: string };
  shops?: Shop[];
  shopOrders?: ShopOrder[];
  onSelectShop?: (shop: Shop) => void;
  onAccept?: (orderId: string) => void;
}

export const HelperOrderMapModal: React.FC<HelperOrderMapModalProps> = ({
  isOpen,
  onClose,
  order,
  helperLocation,
  shops,
  shopOrders,
  onSelectShop,
  onAccept,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const areaLayersRef = useRef<any[]>([]);

  const [mapError, setMapError] = useState(false);
  const [currentHelperLoc, setCurrentHelperLoc] = useState<LocationData | null>(null);
  const [leafletLib, setLeafletLib] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStoreTray, setShowStoreTray] = useState(false);
  const [storeSearchQuery, setStoreSearchQuery] = useState('');
  const hasFitBoundsRef = useRef(false);

  // Invalidate map size on fullscreen toggle
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const timer = setTimeout(() => {
      try {
        mapInstanceRef.current.invalidateSize();
      } catch (e) {}
    }, 150);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // Reset state and ref when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      hasFitBoundsRef.current = false;
      setIsFullscreen(false);
      setShowStoreTray(false);
      setStoreSearchQuery('');
      if (helperLocation?.lat && helperLocation?.lng) {
        setCurrentHelperLoc({
          address: 'You',
          lat: helperLocation.lat,
          lng: helperLocation.lng,
        });
      } else {
        setCurrentHelperLoc(null);
      }
    } else {
      setCurrentHelperLoc(null);
      hasFitBoundsRef.current = false;
    }
  }, [isOpen]);

  // Track helper position via GPS if not provided in props
  useEffect(() => {
    if (!isOpen) return;

    if (!currentHelperLoc && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentHelperLoc({
            address: 'You',
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => {
          console.warn('[HelperOrderMapModal] Geolocation failed:', err);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, [isOpen, currentHelperLoc]);

  // Initialize Map Instance once
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const initMapInstance = async () => {
      try {
        if (!mapContainerRef.current) return;

        const L = await import('leaflet');
        if (!isMounted) return;
        setLeafletLib(L);

        // Inject Leaflet CSS if missing
        if (!document.getElementById('leaflet-css-picker')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-picker';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.remove();
          } catch (e) {}
          mapInstanceRef.current = null;
        }

        const map = L.map(mapContainerRef.current, {
          zoomControl: true,
        }).setView([23.8759, 90.3795], 14);

        mapInstanceRef.current = map;

        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps Satellite',
          maxZoom: 20,
        }).addTo(map);

        setMapError(false);
      } catch (err) {
        console.error('[HelperOrderMapModal] Init error:', err);
        setMapError(true);
      }
    };

    const timer = setTimeout(() => {
      initMapInstance();
    }, 60);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {}
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen]);

  // Determine available shops
  const allAvailableShops: Shop[] = (shops && shops.length > 0)
    ? shops
    : Array.from(fallbackStore.shops.values());

  const requestedShopIds = useMemo(() => new Set(
    (shopOrders || [])
      .filter((so) => so.shopId && so.shopId !== 'myself')
      .map((so) => so.shopId)
  ), [shopOrders]);

  const isDone =
    order.status === 'DELIVERED' ||
    (order.status as string) === 'COMPLETED' ||
    order.status === 'CANCELED' ||
    (order.status as string) === 'CANCELLED' ||
    order.cancellationRequest?.status === 'APPROVED';

  // Render Markers, Routes, and Shops
  useEffect(() => {
    if (!isOpen || !leafletLib || !mapInstanceRef.current) return;

    const L = leafletLib;
    const map = mapInstanceRef.current;

    // Clear previous layers
    layersRef.current.forEach((layer) => {
      try {
        map.removeLayer(layer);
      } catch (e) {}
    });
    layersRef.current = [];

    const boundsPoints: [number, number][] = [];

    // 1. Pickup Location Marker
    const pLat = order.pickupLocation?.lat;
    const pLng = order.pickupLocation?.lng;

    if (pLat && pLng) {
      const pickupHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: 110px; height: 50px; pointer-events: none;">
          <div style="background: #eab308; color: #713f12; font-size: 10px; font-weight: 900; padding: 3px 6px; border-radius: 8px; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.4); white-space: nowrap;">
            📦 Pickup Point
          </div>
          <div style="width: 2px; height: 10px; background: #eab308;"></div>
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #eab308; border: 2.5px solid white; box-shadow: 0 0 8px #eab308;"></div>
        </div>
      `;
      const pickupMarker = L.marker([pLat, pLng], {
        icon: L.divIcon({
          className: 'pickup-loc-marker',
          html: pickupHtml,
          iconSize: [110, 50],
          iconAnchor: [55, 48],
        }),
      }).addTo(map);
      layersRef.current.push(pickupMarker);
      boundsPoints.push([pLat, pLng]);
    }

    // 2. Delivery Location Marker
    const dLat = order.deliveryLocation?.lat;
    const dLng = order.deliveryLocation?.lng;

    if (dLat && dLng) {
      const deliveryHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: 110px; height: 50px; pointer-events: none;">
          <div style="background: #10b981; color: white; font-size: 10px; font-weight: 900; padding: 3px 6px; border-radius: 8px; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.4); white-space: nowrap;">
            🏠 Delivery Point
          </div>
          <div style="width: 2px; height: 10px; background: #10b981;"></div>
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #10b981; border: 2.5px solid white; box-shadow: 0 0 8px #10b981;"></div>
        </div>
      `;
      const deliveryMarker = L.marker([dLat, dLng], {
        icon: L.divIcon({
          className: 'delivery-loc-marker',
          html: deliveryHtml,
          iconSize: [110, 50],
          iconAnchor: [55, 48],
        }),
      }).addTo(map);
      layersRef.current.push(deliveryMarker);
      boundsPoints.push([dLat, dLng]);
    }

    // 3. Draw Road Route Polyline (Pickup → Delivery)
    const hasPickup = !!(pLat && pLng);
    const hasDelivery = !!(dLat && dLng);

    if (hasPickup && hasDelivery) {
      fetchRoadRoute([{ lat: pLat!, lng: pLng! }, { lat: dLat!, lng: dLng! }]).then((coords) => {
        if (coords.length > 0) {
          const poly = L.polyline(coords, {
            color: '#10b981', // green
            weight: 4,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map);
          layersRef.current.push(poly);
        }
      });
    }

    // 5. Render Registered Stores & Shop Markers
    const requestedShopIds = new Set(
      (shopOrders || [])
        .filter((so) => so.shopId && so.shopId !== 'myself')
        .map((so) => so.shopId)
    );

    if (allAvailableShops && allAvailableShops.length > 0) {
      const validShops = allAvailableShops.filter(
        (s) => s.location?.lat && s.location?.lng
      );

      const spiderfiedShops = getSpiderfiedCoordinates(
        validShops,
        (s) => s.location?.lat,
        (s) => s.location?.lng
      );

      spiderfiedShops.forEach((entry) => {
        const { item: shop, displayLat: sLat, displayLng: sLng, overlapCount, overlapIndex } = entry;
        const isRequested = requestedShopIds.has(shop.id);
        const hasOverlap = overlapCount > 1;

        // Draw dashed line from pickup/delivery to requested shop
        if (isRequested) {
          const originLat = pLat || dLat;
          const originLng = pLng || dLng;
          if (originLat && originLng) {
            const line = L.polyline([[originLat, originLng], [sLat, sLng]], {
              color: '#8b5cf6', // purple
              weight: 3,
              opacity: 0.85,
              dashArray: '5, 5',
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map);
            layersRef.current.push(line);
          }
        }

        const overlapBadgeHtml = hasOverlap
          ? `<span style="background:#f59e0b;color:#000;font-size:8px;font-weight:900;padding:1px 3px;border-radius:4px;margin-left:2px;">${overlapIndex}/${overlapCount}</span>`
          : '';

        const requestedBadgeHtml = isRequested
          ? `<span style="background:#10b981;color:#fff;font-size:8px;font-weight:900;padding:1px 4px;border-radius:4px;margin-left:3px;">Ordered</span>`
          : '';

        const borderColor = isRequested ? '#7c3aed' : (hasOverlap ? '#f59e0b' : '#8b5cf6');
        const bgHeaderColor = isRequested ? '#f5f3ff' : '#ffffff';

        const shopHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: 145px; height: 55px; box-sizing: border-box; cursor: pointer;">
            <div style="height: 30px; display: flex; align-items: center; justify-content: center; gap: 4px; background: ${bgHeaderColor}; color: #581c87; border: 2.5px solid ${borderColor}; padding: 3px 7px; border-radius: 10px; font-family: sans-serif; font-size: 11px; font-weight: 800; box-shadow: 0 4px 10px rgba(0,0,0,0.35); white-space: nowrap; line-height: 1; box-sizing: border-box;">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${borderColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span style="max-width: 82px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${shop.name}</span>
              ${overlapBadgeHtml}
              ${requestedBadgeHtml}
            </div>
            <div style="width: 2px; height: 12px; background: ${borderColor};"></div>
            <div style="width: 10px; height: 10px; border-radius: 50%; background: ${isRequested ? '#7c3aed' : '#a78bfa'}; border: 2px solid white; margin-top: -4px; box-shadow: 0 2px 5px rgba(0,0,0,0.4); box-sizing: border-box;"></div>
          </div>
        `;

        const shopMarker = L.marker([sLat, sLng], {
          icon: L.divIcon({
            className: `custom-shop-marker-${shop.id}`,
            html: shopHtml,
            iconSize: [145, 55],
            iconAnchor: [72, 49],
          }),
        });

        setupMarkerHoverElevation(shopMarker);

        // Click handler to trigger shop placement modal
        shopMarker.on('click', () => {
          if (isDone) {
            if (typeof window !== 'undefined' && (window as any).showCustomAlert) {
              (window as any).showCustomAlert(
                'অর্ডার সম্পন্ন/বাতিল',
                'এই অর্ডারটি ইতিমধ্যে সম্পন্ন/বাতিল হয়ে গেছে। এখান থেকে নতুন দোকানে অর্ডার পাঠানোর সুবিধা বন্ধ রয়েছে।',
                'warning'
              );
            } else {
              alert('এই অর্ডারটি ইতিমধ্যে সম্পন্ন/বাতিল হয়ে গেছে। এখান থেকে নতুন দোকানে অর্ডার পাঠানোর সুবিধা বন্ধ রয়েছে।');
            }
            return;
          }
          if (onSelectShop) {
            onSelectShop(shop);
          }
        });

        shopMarker.addTo(map);
        layersRef.current.push(shopMarker);
        if (isRequested) {
          boundsPoints.push([sLat, sLng]);
        }
      });
    }

    // 6. Render service area overlays (soft green zones)
    const serviceAreas: AllowedAreaPolygon[] = fallbackStore.pricingSettings.allowedDeliveryAreas || [];
    serviceAreas.forEach((area) => {
      if (!area.coordinates || area.coordinates.length < 3) return;
      const latLngs = area.coordinates.map((p: { lat: number; lng: number }) => [p.lat, p.lng] as [number, number]);
      const poly = L.polygon(latLngs, {
        color: '#059669',
        fillColor: '#10b981',
        fillOpacity: 0.18,
        weight: 2,
        dashArray: '5, 5',
        interactive: false,
      }).addTo(map);
      const label = L.tooltip({
        permanent: true,
        direction: 'center',
        className: 'helper-area-badge bg-white/90 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded-xl border border-emerald-300 shadow-sm pointer-events-none',
      });
      label.setContent(`📍 ${area.name}`);
      poly.bindTooltip(label);
      areaLayersRef.current.push(poly);
      layersRef.current.push(poly);
    });

    // Initial fit bounds
    if (!hasFitBoundsRef.current && boundsPoints.length > 0) {
      hasFitBoundsRef.current = true;
      if (boundsPoints.length > 1) {
        map.fitBounds(boundsPoints, { padding: [60, 60], maxZoom: 16 });
      } else {
        map.setView(boundsPoints[0], 15);
      }
    }
  }, [isOpen, leafletLib, order, allAvailableShops, shopOrders, onSelectShop, isDone]);

  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const pLat = order.pickupLocation?.lat;
    const pLng = order.pickupLocation?.lng;
    const dLat = order.deliveryLocation?.lat;
    const dLng = order.deliveryLocation?.lng;

    const points: [number, number][] = [];
    if (pLat && pLng) points.push([pLat, pLng]);
    if (dLat && dLng) points.push([dLat, dLng]);

    if (points.length > 1) {
      map.fitBounds(points, { padding: [50, 50] });
    } else if (points.length === 1) {
      map.setView(points[0], 16);
    }
  };

  const handleFocusShopOnMap = (shop: Shop) => {
    if (!mapInstanceRef.current || !shop.location?.lat || !shop.location?.lng) return;
    mapInstanceRef.current.setView([shop.location.lat, shop.location.lng], 17, { animate: true });
  };

  // Filter nearby shops for the drawer / list view
  const refLat = order.pickupLocation?.lat || order.deliveryLocation?.lat;
  const refLng = order.pickupLocation?.lng || order.deliveryLocation?.lng;

  const filteredShopsList = allAvailableShops
    .filter((s) => {
      if (!storeSearchQuery.trim()) return true;
      const q = storeSearchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.type && s.type.toLowerCase().includes(q)) ||
        (s.contactPerson && s.contactPerson.toLowerCase().includes(q))
      );
    })
    .map((s) => {
      let dist = -1;
      if (refLat && refLng && s.location?.lat && s.location?.lng) {
        dist = parseFloat(calcDistanceKm(refLat, refLng, s.location.lat, s.location.lng).toFixed(2));
      }
      return { shop: s, dist };
    })
    .sort((a, b) => {
      if (a.dist >= 0 && b.dist >= 0) return a.dist - b.dist;
      return 0;
    });

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-xs transition-all ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-4'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative flex flex-col bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${
          isFullscreen
            ? 'w-screen h-screen max-w-none max-h-none rounded-none'
            : 'w-full h-[88dvh] sm:h-[90dvh] sm:max-h-[880px] sm:max-w-[850px] rounded-3xl'
        }`}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-xs z-20">
          <div className="flex items-center space-x-2 text-gray-900 font-extrabold text-sm min-w-0">
            <Map className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate">Order Route & Earth Map</span>
            <span className="bg-slate-900 text-white font-mono text-[10px] px-2 py-0.5 rounded-md shrink-0">
              #{order.id}
            </span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Quick Stores Drawer Toggle */}
            <button
              type="button"
              onClick={() => setShowStoreTray((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                showStoreTray
                  ? 'bg-purple-600 text-white border-purple-700 shadow-md'
                  : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200'
              }`}
            >
              <Store className="w-3.5 h-3.5 shrink-0" />
              <span>Stores ({allAvailableShops.length})</span>
              {showStoreTray ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>

            {/* Fullscreen Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="p-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Full Screen Map'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-all border border-red-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Route Legend Strip */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-slate-50 border-b border-gray-100 text-[10px] font-bold overflow-x-auto">
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-gray-500 shrink-0">Route:</span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="inline-block w-5 h-0.5 bg-emerald-500 rounded-full" />
              <span className="text-emerald-700">📦→🏠 Pickup → Delivery</span>
            </span>
            <span className="flex items-center gap-1 shrink-0 text-purple-700">
              <Store className="w-3 h-3 text-purple-600 inline" />
              <span>🏪 Stores (Click to Order)</span>
            </span>
          </div>
          <span className="text-[10px] text-gray-400 shrink-0 hidden sm:inline">
            ম্যাপের দোকানে ক্লিক করে সরাসরি অর্ডার পাঠান
          </span>
        </div>

        {/* Map Body */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative bg-slate-900">
          {mapError ? (
            <div className="p-8 text-center bg-amber-50 flex flex-col items-center justify-center space-y-3 h-full">
              <Map className="w-8 h-8 text-amber-600" />
              <h4 className="font-extrabold text-gray-900 text-sm">Could not load map</h4>
              <p className="text-xs text-gray-600">Please check your internet or GPS settings.</p>
            </div>
          ) : (
            <div className="relative w-full flex-1 h-full">
              {/* Leaflet map container */}
              <div ref={mapContainerRef} className="w-full h-full z-10" />

              {/* Floating Map Controls */}
              <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setIsFullscreen((prev) => !prev)}
                  className="p-2.5 bg-slate-900/90 hover:bg-slate-800 text-white rounded-2xl border border-slate-700 shadow-xl backdrop-blur-md transition-all active:scale-95"
                  title={isFullscreen ? 'Exit Fullscreen' : 'Full Screen Map'}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>

              {/* GPS Recenter button */}
              <button
                type="button"
                onClick={handleRecenter}
                className="absolute bottom-20 sm:bottom-20 right-3 z-20 p-2.5 bg-white border border-emerald-200 rounded-2xl shadow-xl text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all"
                title="Recenter Route"
              >
                <Navigation className="w-5 h-5" />
              </button>

              {/* Floating Stores Bottom/Side Tray */}
              {showStoreTray && (
                <div className="absolute inset-x-2 bottom-2 sm:bottom-4 sm:left-4 sm:right-auto sm:w-80 max-h-[60%] sm:max-h-[70%] z-30 bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-purple-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
                  {/* Tray Header */}
                  <div className="p-3 bg-purple-50/90 border-b border-purple-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-2 text-purple-950 font-black text-xs">
                      <Store className="w-4 h-4 text-purple-600" />
                      <span>Registered Stores ({filteredShopsList.length})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowStoreTray(false)}
                      className="p-1 rounded-full text-purple-400 hover:text-purple-700 hover:bg-purple-100 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Search input */}
                  <div className="p-2.5 border-b border-gray-100 bg-white shrink-0">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={storeSearchQuery}
                        onChange={(e) => setStoreSearchQuery(e.target.value)}
                        placeholder="Search store by name or type..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  {/* Store items list */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 divide-y divide-gray-50">
                    {filteredShopsList.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-400">
                        No stores match your search.
                      </div>
                    ) : (
                      filteredShopsList.map(({ shop, dist }) => {
                        const isRequested = requestedShopIds.has(shop.id);
                        return (
                          <div
                            key={shop.id}
                            className="p-2.5 rounded-2xl hover:bg-purple-50/50 transition-colors flex items-center justify-between gap-2 pt-2 first:pt-0"
                          >
                            <div
                              className="min-w-0 flex-1 cursor-pointer"
                              onClick={() => handleFocusShopOnMap(shop)}
                            >
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-extrabold text-xs text-gray-900 hover:text-purple-700">
                                  {shop.name}
                                </span>
                                {shop.type && (
                                  <span className="text-[8px] font-black bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded-full uppercase">
                                    {shop.type}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-gray-500 truncate flex items-center gap-2 mt-0.5">
                                {dist >= 0 && <span>📍 ~{dist} km</span>}
                                {shop.contactPerson && <span>👤 {shop.contactPerson}</span>}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                if (isDone) {
                                  alert('এই অর্ডারটি ইতিমধ্যে সম্পন্ন/বাতিল হয়ে গেছে।');
                                  return;
                                }
                                if (onSelectShop) {
                                  onSelectShop(shop);
                                }
                              }}
                              className={`px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold flex items-center gap-1 shrink-0 shadow-xs transition-all active:scale-95 cursor-pointer ${
                                isRequested
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300'
                                  : 'bg-purple-600 hover:bg-purple-700 text-white'
                              }`}
                            >
                              <PlusCircle className="w-3 h-3" />
                              <span>{isRequested ? 'Order Again' : 'Place Order'}</span>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Bottom Action Banner (especially useful when previewing pending order before acceptance) */}
        {order.status === 'PENDING' && (
          <div className="shrink-0 p-3.5 sm:p-4 bg-white border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg z-20">
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-800 font-black text-sm shrink-0">
                ৳{order.deliveryFee}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-xs text-gray-900 truncate">
                  {order.title || order.service || 'Service Needed'}
                </div>
                <div className="text-[11px] text-gray-500 truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>{order.deliveryLocation?.address || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-extrabold text-xs hover:bg-gray-100 transition-colors"
              >
                ম্যাপ বন্ধ করুন
              </button>
              {onAccept && (
                <button
                  type="button"
                  onClick={() => {
                    onAccept(order.id);
                    onClose();
                  }}
                  className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>Accept Request (অর্ডার গ্রহণ)</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
