'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Map, X, Navigation, Maximize2, Minimize2, Check, MapPin, Sparkles, ShoppingBag } from 'lucide-react';
import { Order, LocationData, Shop, ShopOrder, AllowedAreaPolygon } from '@/types';
import { fetchRoadRoute } from '@/lib/routeUtils';
import { fallbackStore } from '@/lib/firebase';
import { getSpiderfiedCoordinates, setupMarkerHoverElevation } from '@/utils/mapMarkerUtils';

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

    // 1. Helper Location Marker
    const rLat = currentHelperLoc?.lat || helperLocation?.lat;
    const rLng = currentHelperLoc?.lng || helperLocation?.lng;

    if (rLat && rLng) {
      const helperHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: 100px; height: 50px; pointer-events: none;">
          <div style="background: #3b82f6; color: white; font-size: 10px; font-weight: 900; padding: 3px 6px; border-radius: 8px; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.4); white-space: nowrap;">
            🛵 You (Helper)
          </div>
          <div style="width: 2px; height: 10px; background: #3b82f6;"></div>
          <div style="width: 14px; height: 14px; border-radius: 50%; background: #3b82f6; border: 2.5px solid white; box-shadow: 0 0 10px #3b82f6; animation: pulse 1.5s infinite;"></div>
        </div>
      `;
      const helperMarker = L.marker([rLat, rLng], {
        icon: L.divIcon({
          className: 'helper-loc-marker',
          html: helperHtml,
          iconSize: [100, 50],
          iconAnchor: [50, 48],
        }),
      }).addTo(map);
      layersRef.current.push(helperMarker);
      boundsPoints.push([rLat, rLng]);
    }

    // 2. Pickup Location Marker
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

    // 3. Delivery Location Marker
    const dLat = order.deliveryLocation?.lat;
    const dLng = order.deliveryLocation?.lng;

    if (dLat && dLng) {
      const deliveryHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: 110px; height: 50px; pointer-events: none;">
          <div style="background: #10b981; color: white; font-size: 10px; font-weight: 900; padding: 3px 6px; border-radius: 8px; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.4); white-space: nowrap;">
            📍 Destination
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

    // 4. Draw Road Route Polylines
    const routePoints: { lat: number; lng: number }[] = [];
    if (rLat && rLng) routePoints.push({ lat: rLat, lng: rLng });
    if (pLat && pLng) routePoints.push({ lat: pLat, lng: pLng });
    if (dLat && dLng) routePoints.push({ lat: dLat, lng: dLng });

    if (routePoints.length >= 2) {
      fetchRoadRoute(routePoints).then((coords) => {
        if (coords.length > 0) {
          const polyline = L.polyline(coords, {
            color: '#10b981',
            weight: 4,
            opacity: 0.9,
            dashArray: '6, 6',
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map);
          layersRef.current.push(polyline);
        }
      });
    }

    // Render service area overlays (soft green zones)
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
  }, [isOpen, leafletLib, order, currentHelperLoc, helperLocation]);

  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const rLat = currentHelperLoc?.lat || helperLocation?.lat;
    const rLng = currentHelperLoc?.lng || helperLocation?.lng;
    const pLat = order.pickupLocation?.lat;
    const pLng = order.pickupLocation?.lng;
    const dLat = order.deliveryLocation?.lat;
    const dLng = order.deliveryLocation?.lng;

    const points: [number, number][] = [];
    if (rLat && rLng) points.push([rLat, rLng]);
    if (pLat && pLng) points.push([pLat, pLng]);
    if (dLat && dLng) points.push([dLat, dLng]);

    if (points.length > 1) {
      map.fitBounds(points, { padding: [50, 50] });
    } else if (points.length === 1) {
      map.setView(points[0], 16);
    }
  };

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
          <div className="flex items-center space-x-2 text-gray-900 font-extrabold text-sm">
            <Map className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Order Route & Earth Map</span>
            <span className="bg-slate-900 text-white font-mono text-[10px] px-2 py-0.5 rounded-md">
              #{order.id}
            </span>
          </div>

          <div className="flex items-center space-x-2">
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

              {/* Floating Map Fullscreen Toggle */}
              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                className="absolute top-3 right-3 z-20 p-2.5 bg-slate-900/90 hover:bg-slate-800 text-white rounded-2xl border border-slate-700 shadow-xl backdrop-blur-md transition-all active:scale-95"
                title={isFullscreen ? 'Exit Fullscreen' : 'Full Screen Map'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              {/* GPS Recenter button */}
              <button
                type="button"
                onClick={handleRecenter}
                className="absolute bottom-20 sm:bottom-20 right-3 z-20 p-2.5 bg-white border border-emerald-200 rounded-2xl shadow-xl text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all"
                title="Recenter Route"
              >
                <Navigation className="w-5 h-5" />
              </button>
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
