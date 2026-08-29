'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Map, X, Navigation } from 'lucide-react';
import { Order, LocationData, Shop, ShopOrder } from '@/types';
import { fetchRoadRoute } from '@/lib/routeUtils';

interface HelperOrderMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  helperLocation?: LocationData & { updatedAt?: string };
  shops?: Shop[];
  shopOrders?: ShopOrder[];
  onSelectShop?: (shop: Shop) => void;
}

export const HelperOrderMapModal: React.FC<HelperOrderMapModalProps> = ({
  isOpen,
  onClose,
  order,
  helperLocation,
  shops,
  shopOrders,
  onSelectShop,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);

  const [mapError, setMapError] = useState(false);
  const [currentHelperLoc, setCurrentHelperLoc] = useState<LocationData | null>(null);
  const [leafletLib, setLeafletLib] = useState<any>(null);
  const hasFitBoundsRef = useRef(false);

  // Reset state and ref when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      hasFitBoundsRef.current = false;
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

        // Cleanup existing map instance
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        // Default center (Dhaka) if no locations are available
        const defaultLat = 23.8759;
        const defaultLng = 90.3795;

        const map = L.map(mapContainerRef.current, {
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: true,
          zoomControl: true,
        }).setView([defaultLat, defaultLng], 14);

        mapInstanceRef.current = map;

        // Satellite Hybrid Tiles Layer (Google Maps style)
        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps Satellite',
          maxZoom: 20,
        }).addTo(map);

      } catch (err) {
        console.error('[HelperOrderMapModal] Init error:', err);
        setMapError(true);
      }
    };

    const timer = setTimeout(() => {
      initMapInstance();
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      setLeafletLib(null);
    };
  }, [isOpen]);

  // Draw and Update Layers dynamically without recreating the map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = leafletLib;
    if (!isOpen || !map || !L) return;

    let isMounted = true;

    // Clear existing layers
    layersRef.current.forEach((layer) => {
      map.removeLayer(layer);
    });
    layersRef.current = [];

    const drawLayers = async () => {
      try {
        // Helper function to build the custom label marker connected by a thin line
        const createCustomMarker = (
          lat: number,
          lng: number,
          label: string,
          iconSvg: string,
          badgeBg: string,
          badgeText: string,
          borderColor: string,
          dotColor: string,
          width: number = 180
        ) => {
          const html = `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: ${width}px; height: 65px; pointer-events: none; box-sizing: border-box;">
              <div style="height: 34px; display: flex; align-items: center; justify-content: center; gap: 6px; background: ${badgeBg}; color: ${badgeText}; border: 2.5px solid ${borderColor}; padding: 5px 12px; border-radius: 10px; font-family: sans-serif; font-size: 13px; font-weight: 900; box-shadow: 0 3px 8px rgba(0,0,0,0.35); white-space: nowrap; line-height: 1; box-sizing: border-box;">
                ${iconSvg}
                <span>${label}</span>
              </div>
              <div style="width: 3px; height: 22px; background: #000000;"></div>
              <div style="width: 12px; height: 12px; border-radius: 50%; background: ${dotColor}; border: 2.5px solid #000000; margin-top: -6px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); box-sizing: border-box;"></div>
            </div>
          `;
          return L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'custom-route-marker',
              html,
              iconSize: [width, 65],
              iconAnchor: [width / 2, 56],
            }),
          });
        };

        const localCalcDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
          const R = 6371; // Earth's radius in km
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

        const boundsPoints: [number, number][] = [];

        // 1. Rider (Helper) Point
        const rLat = currentHelperLoc?.lat || helperLocation?.lat;
        const rLng = currentHelperLoc?.lng || helperLocation?.lng;
        const hasRider = typeof rLat === 'number' && typeof rLng === 'number';

        const pLat = order.pickupLocation?.lat;
        const pLng = order.pickupLocation?.lng;
        const hasPickup = typeof pLat === 'number' && typeof pLng === 'number';

        const dLat = order.deliveryLocation?.lat;
        const dLng = order.deliveryLocation?.lng;
        const hasDelivery = typeof dLat === 'number' && typeof dLng === 'number';

        let riderLabel = 'You';
        let riderWidth = 110;
        if (hasRider && rLat && rLng) {
          if (hasPickup && pLat && pLng && hasDelivery && dLat && dLng) {
            const dist = localCalcDistanceKm(pLat, pLng, dLat, dLng);
            riderLabel = `You (Pickup to delivery = ${dist.toFixed(1)} km)`;
            riderWidth = 270;
          } else if (hasDelivery && dLat && dLng) {
            const dist = localCalcDistanceKm(rLat, rLng, dLat, dLng);
            riderLabel = `You (To delivery = ${dist.toFixed(1)} km)`;
            riderWidth = 210;
          }
        }

        if (hasRider && rLat && rLng) {
          const riderMarker = createCustomMarker(
            rLat,
            rLng,
            riderLabel,
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
            '#dbeafe', // light blue
            '#1e40af', // dark blue text
            '#2563eb', // blue border
            '#3b82f6',  // blue dot
            riderWidth
          ).addTo(map);
          layersRef.current.push(riderMarker);
          boundsPoints.push([rLat, rLng]);
        }

        // 2. Pickup Point (Buy / Do)
        if (hasPickup && pLat && pLng) {
          const pickupMarker = createCustomMarker(
            pLat,
            pLng,
            'Buy / Do',
            `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
            '#fef08a', // light yellow
            '#854d0e', // dark yellow text
            '#ca8a04', // yellow border
            '#eab308',  // yellow dot
            135
          ).addTo(map);
          layersRef.current.push(pickupMarker);
          boundsPoints.push([pLat, pLng]);
        }

        // 3. Delivery Point (Delivery Here)
        if (hasDelivery && dLat && dLng) {
          const deliveryMarker = createCustomMarker(
            dLat,
            dLng,
            'Delivery Here',
            `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
            '#dcfce7', // light green
            '#166534', // dark green text
            '#16a34a', // green border
            '#22c55e',  // green dot
            160
          ).addTo(map);
          layersRef.current.push(deliveryMarker);
          boundsPoints.push([dLat, dLng]);
        }

        // 4. Draw Route Polylines
        if (hasRider && rLat && rLng) {
          if (hasPickup && pLat && pLng && hasDelivery && dLat && dLng) {
            // Draw Route 1: Rider -> Pickup (Yellow Line)
            const route1Coords = await fetchRoadRoute([
              { lat: rLat, lng: rLng },
              { lat: pLat, lng: pLng },
            ]);
            if (isMounted && route1Coords.length > 0) {
              const roadPolyline1 = L.polyline(route1Coords, {
                color: '#eab308', // yellow
                weight: 5,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map);
              layersRef.current.push(roadPolyline1);
            }

            // Draw Route 2: Pickup -> Delivery (Green Line)
            const route2Coords = await fetchRoadRoute([
              { lat: pLat, lng: pLng },
              { lat: dLat, lng: dLng },
            ]);
            if (isMounted && route2Coords.length > 0) {
              const roadPolyline2 = L.polyline(route2Coords, {
                color: '#22c55e', // green
                weight: 5,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map);
              layersRef.current.push(roadPolyline2);
            }
          } else if (hasDelivery && dLat && dLng) {
            // Draw direct Route: Rider -> Delivery (Green Line)
            const routeCoords = await fetchRoadRoute([
              { lat: rLat, lng: rLng },
              { lat: dLat, lng: dLng },
            ]);
            if (isMounted && routeCoords.length > 0) {
              const roadPolyline = L.polyline(routeCoords, {
                color: '#22c55e',
                weight: 5,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map);
              layersRef.current.push(roadPolyline);
            }
          }
        } else if (hasPickup && pLat && pLng && hasDelivery && dLat && dLng) {
          // If Rider is missing, draw direct Pickup -> Delivery (Green Line)
          const routeCoords = await fetchRoadRoute([
            { lat: pLat, lng: pLng },
            { lat: dLat, lng: dLng },
          ]);
          if (isMounted && routeCoords.length > 0) {
            const roadPolyline = L.polyline(routeCoords, {
              color: '#22c55e',
              weight: 5,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
              dashArray: '5, 5',
            }).addTo(map);
            layersRef.current.push(roadPolyline);
          }
        }

        // 5. Draw Nearby Registered Shops (within 3km of pickup or delivery)
        const requestedShopIds = new Set(
          (shopOrders || [])
            .filter((so) => so.shopId && so.shopId !== 'myself')
            .map((so) => so.shopId)
        );

        if (shops && shops.length > 0) {
          const shopRadiusKm = 3;
          const shopsToShow = shops.filter((shop) => {
            if (!shop.location?.lat || !shop.location?.lng) return false;
            if (requestedShopIds.has(shop.id)) return true;
            let distToPickup = Infinity;
            let distToDelivery = Infinity;
            if (pLat && pLng) {
              distToPickup = localCalcDistanceKm(shop.location.lat, shop.location.lng, pLat, pLng);
            }
            if (dLat && dLng) {
              distToDelivery = localCalcDistanceKm(shop.location.lat, shop.location.lng, dLat, dLng);
            }
            return distToPickup <= shopRadiusKm || distToDelivery <= shopRadiusKm;
          });

          shopsToShow.forEach((shop) => {
            if (!shop.location?.lat || !shop.location?.lng) return;
            const sLat = shop.location.lat;
            const sLng = shop.location.lng;

            // Draw a thin line (2.5px) connecting the pickup point to the requested shop
            if (hasPickup && pLat && pLng && requestedShopIds.has(shop.id)) {
              const line = L.polyline([[pLat, pLng], [sLat, sLng]], {
                color: '#8b5cf6', // purple color matching the shop theme
                weight: 2.5,
                opacity: 0.85,
                lineCap: 'round',
                lineJoin: 'round'
              }).addTo(map);
              layersRef.current.push(line);
            }

            const shopHtml = `
              <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: 140px; height: 55px; box-sizing: border-box; cursor: pointer;">
                <div style="height: 28px; display: flex; align-items: center; justify-content: center; gap: 4px; background: #f3e8ff; color: #6b21a8; border: 2.5px solid #8b5cf6; padding: 4px 8px; border-radius: 8px; font-family: sans-serif; font-size: 11px; font-weight: 800; box-shadow: 0 2px 6px rgba(0,0,0,0.25); white-space: nowrap; line-height: 1; box-sizing: border-box;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  <span>${shop.name}</span>
                </div>
                <div style="width: 2px; height: 16px; background: #8b5cf6;"></div>
                <div style="width: 10px; height: 10px; border-radius: 50%; background: #a78bfa; border: 2px solid #8b5cf6; margin-top: -6px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); box-sizing: border-box;"></div>
              </div>
            `;

            const shopMarker = L.marker([sLat, sLng], {
              icon: L.divIcon({
                className: `custom-shop-marker-${shop.id}`,
                html: shopHtml,
                iconSize: [140, 55],
                iconAnchor: [70, 47],
              }),
            });

            shopMarker.on('click', () => {
              if (onSelectShop) {
                onSelectShop(shop);
              }
            });

            shopMarker.addTo(map);
            layersRef.current.push(shopMarker);
            if (requestedShopIds.has(shop.id)) {
              boundsPoints.push([sLat, sLng]);
            }
          });
        }

        // Fit Bounds only if not done yet
        if (!hasFitBoundsRef.current && isMounted) {
          if (boundsPoints.length > 1) {
            map.fitBounds(L.latLngBounds(boundsPoints), { padding: [50, 50] });
            hasFitBoundsRef.current = true;
          } else if (boundsPoints.length === 1) {
            map.setView(boundsPoints[0], 15);
            hasFitBoundsRef.current = true;
          }
        }
      } catch (err) {
        console.error('[HelperOrderMapModal] Drawing layers error:', err);
      }
    };

    drawLayers();

    return () => {
      isMounted = false;
    };
  }, [isOpen, leafletLib, currentHelperLoc, order.pickupLocation, order.deliveryLocation, helperLocation, shops, shopOrders, onSelectShop]);

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
            <Map className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Order Route Map</span>
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

        {/* Map Body */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
          {mapError ? (
            <div className="p-8 text-center bg-amber-50 flex flex-col items-center justify-center space-y-3">
              <Map className="w-8 h-8 text-amber-600" />
              <h4 className="font-extrabold text-gray-900 text-sm">Could not load map</h4>
              <p className="text-xs text-gray-600">Please check your internet or GPS settings.</p>
            </div>
          ) : (
            <div className="relative w-full flex-1 h-full">
              {/* Leaflet map container */}
              <div ref={mapContainerRef} className="w-full h-full z-10" />

              {/* GPS Recenter button */}
              <button
                type="button"
                onClick={handleRecenter}
                className="absolute bottom-4 right-3 z-20 p-2.5 bg-white border border-emerald-200 rounded-2xl shadow-lg text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all"
                title="Recenter Route"
              >
                <Navigation className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
