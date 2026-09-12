'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Order, LocationData, Shop } from '@/types';
import { MapPin, Navigation, Clock, Package, Eye, CheckCircle, Globe, X, Store, Phone, User, ExternalLink } from 'lucide-react';
import { fetchRoadRoute } from '@/lib/routeUtils';
import { getElapsedTime, getOrderEffectiveElapsedMs } from '@/lib/timeUtils';
import { useSecondTick } from '@/hooks/useSecondTick';
import { fallbackStore } from '@/lib/firebase';
import { usePullToRefreshLock } from '@/hooks/usePullToRefreshLock';
import { getSpiderfiedCoordinates, setupMarkerHoverElevation } from '@/utils/mapMarkerUtils';

interface DedicatedHelperMapViewProps {
  orders: Order[];
  activeOrders: Order[];
  helperLocation?: LocationData & { updatedAt?: string };
  onSelectOrder: (order: Order) => void;
  onAcceptOrder?: (order: Order) => void;
  onToggleViewMode?: () => void;
}

// Deterministic coordinate offset function based on string hash
const getDeterministicOffset = (id: string, seed: number) => {
  let hash = 0;
  const str = id + seed;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const norm = (Math.abs(hash) % 1000) / 1000;
  return (norm - 0.5) * 0.012;
};

// Check if Leaflet map instance is fully initialized, loaded, and has valid DOM containers
const isMapAlive = (map: any) => {
  return (
    map &&
    map._loaded &&
    typeof map.getPane === 'function' &&
    map.getPane('mapPane') !== undefined &&
    map.getContainer() !== null
  );
};

export const DedicatedHelperMapView: React.FC<DedicatedHelperMapViewProps> = ({
  orders,
  activeOrders,
  helperLocation,
  onSelectOrder,
  onAcceptOrder,
}) => {
  // Leaflet consumes the drag itself, so the native pull gesture must be
  // disarmed while this map is on screen.
  usePullToRefreshLock();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const routePolylinesRef = useRef<any[]>([]);

  const hasFittedBoundsRef = useRef(false);
  const lastOrdersHashRef = useRef<string>('');

  const [selectedOrder, setSelectedOrderState] = useState<Order | null>(null);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState(false);
  // Live elapsed-time clock, shared with every other card and map on
  // screen and paused while the app is hidden — see useSecondTick.
  const timerTick = useSecondTick();
  // CSS-based fullscreen state (no native fullscreen API — avoids mobile browser lock)
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Shop listing and filter states for map loading fallback
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopSearch, setShopSearch] = useState('');
  const [shopSort, setShopSort] = useState<'name-asc' | 'name-desc' | 'type' | 'newest'>('newest');
  const [shopPage, setShopPage] = useState(1);

  // Sync shops
  useEffect(() => {
    const syncShops = () => {
      setShops(Array.from(fallbackStore.shops.values()));
    };
    syncShops();
    const unsub = fallbackStore.subscribe(syncShops);
    return () => unsub();
  }, []);

  // ResizeObserver & staggered size invalidation for smooth, exact Leaflet map resizing
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const invalidate = () => {
      if (isMapAlive(mapInstanceRef.current)) {
        mapInstanceRef.current.invalidateSize();
      }
    };

    invalidate();
    const t1 = setTimeout(invalidate, 50);
    const t2 = setTimeout(invalidate, 150);
    const t3 = setTimeout(invalidate, 300);
    const t4 = setTimeout(invalidate, 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (isMapAlive(mapInstanceRef.current)) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Live map display - strictly for active running orders
  const visibleOrders = activeOrders;

  // Load Leaflet dynamically & initialize live map (Real Earth Satellite Mode)
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let isMounted = true;

    const timeout = setTimeout(() => {
      if (!mapReady && isMounted) {
        console.warn('Map initialization timed out after 5s. Setting load error fallback.');
        setMapLoadError(true);
      }
    }, 5000);

    const initMap = async () => {
      try {
        const L = await import('leaflet');
        if (!isMounted || !mapContainerRef.current) return;

        // Inject Leaflet CSS if not present
        if (!document.getElementById('leaflet-css-picker')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-picker';
          link.rel = 'stylesheet';
          link.href = '/vendor/leaflet/leaflet.css';
          document.head.appendChild(link);
        }

        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.remove();
          } catch (e) {
            console.warn('[Leaflet] cleanup notice:', e);
          }
          mapInstanceRef.current = null;
        }

        const helperLat = helperLocation?.lat || 23.8759;
        const helperLng = helperLocation?.lng || 90.3795;

        const map = L.map(mapContainerRef.current, {
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: true,
        }).setView([helperLat, helperLng], 14);
        mapInstanceRef.current = map;

        // Map Tile URL: Google Hybrid Real Earth Map (Satellite View)
        const tileUrl = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
        const tileAttribution = '&copy; Google Maps Satellite';

        const tileLayer = L.tileLayer(tileUrl, {
          attribution: tileAttribution,
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        }).addTo(map);

        tileLayerRef.current = tileLayer;
        if (isMounted) {
          setMapReady(true);
          clearTimeout(timeout);
        }
      } catch (err) {
        console.error('Failed to load map:', err);
        if (isMounted) {
          setMapLoadError(true);
          clearTimeout(timeout);
        }
      }
    };

    initMap();

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      setMapReady(false);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('[Leaflet] cleanup notice:', e);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers & Accurate Road Polylines safely
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;

    let isCancelled = false;

    const renderMapElements = async () => {
      const L = await import('leaflet');
      if (isCancelled) return;
      const map = mapInstanceRef.current;
      if (!isMapAlive(map)) return;

      const helperLat = helperLocation?.lat || 23.8759;
      const helperLng = helperLocation?.lng || 90.3795;
      const helperPoint = { lat: helperLat, lng: helperLng };

      // 1. Delivery Helper Location Marker
      const helperIconHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: 70px; height: 80px;">
          <div style="position: relative; width: 44px; height: 44px;">
            <div style="position: absolute; inset: -4px; border-radius: 50%; background: rgba(16, 185, 129, 0.4); animation: pulse 1.5s infinite;"></div>
            <div style="position: relative; width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #10b981, #059669); border: 3px solid white; box-shadow: 0 6px 20px rgba(16,185,129,0.8); display: flex; flex-direction: column; align-items: center; justify-content: center; color: white;">
              <span style="font-size: 11px; font-weight: 950; line-height: 1; margin-bottom: 1px;">Me</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"></path>
                <path d="M18.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"></path>
                <path d="M15 6h2.5l1.5 4-3.5 1"></path>
                <path d="M9 14l2-4h4.5"></path>
                <path d="M5.5 12H9l3-7h3"></path>
                <path d="M12 9v5"></path>
              </svg>
            </div>
          </div>
          <div style="width: 2px; height: 10px; background: #10b981; margin-top: 2px;"></div>
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #10b981; border: 2.5px solid white; box-shadow: 0 0 10px #10b981;"></div>
        </div>
      `;

      const helperIcon = L.divIcon({
        className: 'helper-location-marker',
        html: helperIconHtml,
        iconSize: [70, 80],
        iconAnchor: [35, 80],
        popupAnchor: [0, -80],
      });

      let helperMarker = markersRef.current.get('helper');
      if (helperMarker) {
        helperMarker.setLatLng([helperLat, helperLng]);
        helperMarker.setIcon(helperIcon);
      } else {
        if (isCancelled || !isMapAlive(map)) return;
        helperMarker = L.marker([helperLat, helperLng], { icon: helperIcon })
          .addTo(map)
          .bindPopup('<b>আপনার বর্তমান অবস্থান (Me)</b>');
        markersRef.current.set('helper', helperMarker);
      }

      // Render Shop Markers — show Store Name + Type label
      const registeredShops = Array.from(fallbackStore.shops.values());

      // Remove stale shop markers (shops that no longer exist)
      const shopIds = new Set(registeredShops.map((s) => `shop-${s.id}`));
      markersRef.current.forEach((_, key) => {
        if (key.startsWith('shop-') && !shopIds.has(key)) {
          try { markersRef.current.get(key)?.remove(); } catch (e) { }
          markersRef.current.delete(key);
        }
      });

      const spiderfiedShops = getSpiderfiedCoordinates(
        registeredShops,
        (s) => s.location?.lat,
        (s) => s.location?.lng
      );

      for (const entry of spiderfiedShops) {
        const { item: shop, displayLat, displayLng, overlapCount, overlapIndex } = entry;
        const shopMarkerKey = `shop-${shop.id}`;
        const shortName = shop.name.length > 14 ? shop.name.slice(0, 12) + '…' : shop.name;
        const shortType = shop.type.length > 14 ? shop.type.slice(0, 12) + '…' : shop.type;
        const hasOverlap = overlapCount > 1;

        const overlapBadgeHtml = hasOverlap
          ? `<span style="background:#f59e0b;color:#000;font-size:8.5px;font-weight:900;padding:1px 3px;border-radius:6px;margin-left:2px;">${overlapIndex}/${overlapCount}</span>`
          : '';

        const shopIconHtml = `
          <div style="display: inline-flex; align-items: center; gap: 5px; cursor: pointer; background: rgba(15, 23, 42, 0.92); border: 1.5px solid ${hasOverlap ? '#f59e0b' : '#c084fc'}; border-radius: 10px; padding: 4px 7px 4px 4px; box-shadow: 0 4px 14px rgba(147,51,234,0.55); white-space: nowrap;">
            <div style="width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg, #9333ea, #6b21a8); border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </div>
            <div style="display: flex; flex-direction: column; line-height: 1.2;">
              <span style="color: #e9d5ff; font-size: 10px; font-weight: 800; display: flex; align-items: center;">${shortName} ${overlapBadgeHtml}</span>
              <span style="color: #a78bfa; font-size: 8.5px; font-weight: 600;">${shortType}</span>
            </div>
          </div>
        `;
        const shopIcon = L.divIcon({
          className: `shop-marker-${shop.id}`,
          html: shopIconHtml,
          iconSize: [130, 36],
          iconAnchor: [65, 36],
          popupAnchor: [0, -36],
        });
        let sMarker = markersRef.current.get(shopMarkerKey);
        if (sMarker) {
          sMarker.setLatLng([displayLat, displayLng]);
          sMarker.setIcon(shopIcon);
        } else {
          sMarker = L.marker([displayLat, displayLng], { icon: shopIcon }).addTo(map);
          setupMarkerHoverElevation(sMarker);
          // Click opens the Store Details Modal (React state), not just a Leaflet popup
          sMarker.on('click', () => {
            setSelectedShop(shop);
            setSelectedOrderState(null); // close order drawer if open
          });
          markersRef.current.set(shopMarkerKey, sMarker);
        }
      }

      const allBoundsPoints: [number, number][] = [[helperLat, helperLng]];

      // Sort active running orders by elapsed duration (longest wait / highest duration order first)
      const sortedOrders = [...visibleOrders].sort((a, b) => {
        return getOrderEffectiveElapsedMs(b) - getOrderEffectiveElapsedMs(a);
      });

      const orderRankMap = new Map<string, number>();
      sortedOrders.forEach((ord, idx) => {
        orderRankMap.set(ord.id, idx + 1);
      });

      // Hash route data to decide if route lines need to be re-fetched
      const routesHash = sortedOrders
        .map((o) => `${o.id}:${o.deliveryLocation?.lat},${o.deliveryLocation?.lng}`)
        .join(';') + `;${helperLat},${helperLng}`;

      const routesChanged = routesHash !== lastOrdersHashRef.current;

      if (routesChanged) {
        routePolylinesRef.current.forEach((poly) => {
          try { poly.remove(); } catch (e) { }
        });
        routePolylinesRef.current = [];
      }

      // Remove stale markers for orders that are no longer active
      const currentOrderIds = new Set(visibleOrders.map((o) => o.id));
      currentOrderIds.add('helper');
      markersRef.current.forEach((marker, id) => {
        if (!id.startsWith('shop-') && !currentOrderIds.has(id)) {
          try { marker.remove(); } catch (e) { }
          markersRef.current.delete(id);
        }
      });

      // Spiderfy visible orders
      const spiderfiedOrders = getSpiderfiedCoordinates(
        visibleOrders,
        (o) => o.deliveryLocation?.lat || helperLat + getDeterministicOffset(o.id, 1),
        (o) => o.deliveryLocation?.lng || helperLng + getDeterministicOffset(o.id, 2)
      );

      // 2. Process each visible active order
      for (const entry of spiderfiedOrders) {
        const { item: order, displayLat, displayLng, overlapCount, overlapIndex } = entry;
        if (displayLat && displayLng) {
          allBoundsPoints.push([displayLat, displayLng]);
        }

        const elapsedStr = getElapsedTime(order.createdAt);
        const orderTitle = order.title || order.service || 'অর্ডার';

        const totalOrders = sortedOrders.length;
        const rank = orderRankMap.get(order.id) || 1;

        // Color coding based on duration priority rank:
        // Rank 1 (Most duration) -> Red
        // Rank 2 (or middle range) -> Yellow
        // Rank 3+ (Low / new) -> Soft Green
        const isRed = rank === 1;
        const isYellow = rank === 2 || (totalOrders >= 4 && rank <= Math.floor(totalOrders / 2));
        
        const badgeColor = isRed ? '#ef4444' : isYellow ? '#eab308' : '#10b981';
        const badgeGradient = isRed
          ? 'linear-gradient(135deg, #ef4444, #dc2626)'
          : isYellow
          ? 'linear-gradient(135deg, #eab308, #ca8a04)'
          : 'linear-gradient(135deg, #10b981, #059669)';
        const badgeBorder = isRed ? '#fca5a5' : isYellow ? '#fef08a' : '#a7f3d0';

        const hasOverlap = overlapCount > 1;
        const overlapBadgeHtml = hasOverlap
          ? `<span style="background:#ffffff;color:#000;font-size:9px;font-weight:900;padding:1px 4px;border-radius:6px;margin-left:3px;">${overlapIndex}/${overlapCount}</span>`
          : '';

        // Collect connected stores for this order (both via selectedShopIds and pickupLocation)
        const connectedShops: { id?: string; name: string; lat: number; lng: number }[] = [];
        if (order.selectedShopIds && order.selectedShopIds.length > 0) {
          order.selectedShopIds.forEach((shopId) => {
            const shop = fallbackStore.shops.get(shopId);
            if (shop && shop.location?.lat && shop.location?.lng) {
              connectedShops.push({
                id: shop.id,
                name: shop.name,
                lat: shop.location.lat,
                lng: shop.location.lng,
              });
            }
          });
        }
        if (connectedShops.length === 0 && order.pickupLocation?.lat && order.pickupLocation?.lng) {
          connectedShops.push({
            name: order.pickupLocation.name || order.pickupLocation.address || 'পিকআপ স্টোর',
            lat: order.pickupLocation.lat,
            lng: order.pickupLocation.lng,
          });
        }

        const connectedShopNamesStr = connectedShops.map((s) => s.name).join(', ');
        const hasConnectedShops = connectedShops.length > 0;
        const iconHeight = hasConnectedShops ? 96 : 80;

        const orderIconHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; width: 165px; height: ${iconHeight}px;">
            <div style="background: ${badgeGradient}; color: white; padding: 6px 9px 5px 9px; border-radius: 13px; border: 2px solid ${badgeBorder}; box-shadow: 0 6px 20px ${isRed ? 'rgba(239,68,68,0.5)' : isYellow ? 'rgba(234,179,8,0.5)' : 'rgba(16,185,129,0.5)'}; display: flex; flex-direction: column; width: 155px; text-align: left;">
              <!-- Single Line: Order ID & Timer -->
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; font-weight: 900; font-family: monospace; border-bottom: 1px dashed rgba(255,255,255,0.4); padding-bottom: 3px; margin-bottom: 3px;">
                <span>#${order.id.slice(-6).toUpperCase()}</span>
                <span style="display: flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 800; background: rgba(0,0,0,0.3); padding: 1px 5px; border-radius: 4px; color: #ffffff;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  ${elapsedStr}
                </span>
              </div>
              <!-- Customer Name -->
              <div style="font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; color: #ffffff;">
                ${order.customerName || 'গ্রাহক'}
              </div>
              <!-- Service Request Type -->
              <div style="font-size: 10px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; color: rgba(255,255,255,0.9); margin-top: 1px;">
                ${orderTitle} ${overlapBadgeHtml}
              </div>
              ${hasConnectedShops ? `
                <div style="font-size: 9px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; color: #f3e8ff; background: rgba(147, 51, 234, 0.55); padding: 2px 5px; border-radius: 5px; margin-top: 3px; border: 1px solid rgba(192, 132, 252, 0.6); display: flex; align-items: center; gap: 3px;">
                  <span>🏬</span> ${connectedShopNamesStr}
                </div>
              ` : ''}
            </div>
            <div style="width: 2.5px; height: 8px; background: ${badgeColor}; margin-top: -1px;"></div>
            <div style="position: relative; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; margin-top: -1px;">
              <div style="position: absolute; inset: -3px; border-radius: 50%; background: ${badgeColor}; opacity: 0.5; animation: pulse 1.5s infinite;"></div>
              <div style="position: relative; width: 12px; height: 12px; border-radius: 50%; background: ${badgeColor}; border: 2px solid white; box-shadow: 0 0 8px ${badgeColor}; display: flex; align-items: center; justify-content: center;">
                <div style="width: 3px; height: 3px; border-radius: 50%; background: white;"></div>
              </div>
            </div>
          </div>
        `;

        const orderIcon = L.divIcon({
          className: `order-marker-${order.id}`,
          html: orderIconHtml,
          iconSize: [165, iconHeight],
          iconAnchor: [82, iconHeight],
          popupAnchor: [0, -iconHeight],
        });

        let existingMarker = markersRef.current.get(order.id);
        if (existingMarker) {
          existingMarker.setLatLng([displayLat, displayLng]);
          existingMarker.setIcon(orderIcon);
        } else {
          if (isCancelled || !isMapAlive(map)) return;
          existingMarker = L.marker([displayLat, displayLng], { icon: orderIcon }).addTo(map);
          setupMarkerHoverElevation(existingMarker);
          existingMarker.on('click', () => {
            setSelectedOrderState(order);
            setSelectedShop(null); // close shop modal if open
            onSelectOrder(order);
          });
          markersRef.current.set(order.id, existingMarker);
        }
      }

      // Draw high-visibility sequential delivery route lines following order duration priority
      if (routesChanged) {
        // Build ordered route waypoints sequence: Helper -> Stop 1 (Shop(s) then Delivery) -> Stop 2 -> Stop 3...
        const waypointsSequence: { lat: number; lng: number; label: string; orderId?: string }[] = [
          { lat: helperLat, lng: helperLng, label: 'Helper Location', orderId: 'helper' },
        ];

        for (const order of sortedOrders) {
          // If order has connected stores/shops
          if (order.selectedShopIds && order.selectedShopIds.length > 0) {
            order.selectedShopIds.forEach((shopId) => {
              const shop = fallbackStore.shops.get(shopId);
              if (shop && shop.location?.lat && shop.location?.lng) {
                waypointsSequence.push({
                  lat: shop.location.lat,
                  lng: shop.location.lng,
                  label: `Store: ${shop.name}`,
                  orderId: order.id,
                });
              }
            });
          }

          if (order.deliveryLocation?.lat && order.deliveryLocation?.lng) {
            waypointsSequence.push({
              lat: order.deliveryLocation.lat,
              lng: order.deliveryLocation.lng,
              label: `Delivery: ${order.customerName}`,
              orderId: order.id,
            });
          }
        }

        // 1. Draw individual route legs with green color highlighted path
        for (let i = 0; i < waypointsSequence.length - 1; i++) {
          const startPt = waypointsSequence[i];
          const endPt = waypointsSequence[i + 1];

          // Highlighted green route path scheme
          const glowColor = '#22c55e';
          const mainColor = '#16a34a';

          let legRouteCoords = await fetchRoadRoute([
            { lat: startPt.lat, lng: startPt.lng },
            { lat: endPt.lat, lng: endPt.lng },
          ]);

          if (isCancelled || !isMapAlive(map)) return;

          if (legRouteCoords.length > 0) {
            // High visibility glowing green polyline
            const glowPolyline = L.polyline(legRouteCoords, {
              color: glowColor,
              weight: 10,
              opacity: 0.5,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map);

            // Solid inner main road polyline
            const mainPolyline = L.polyline(legRouteCoords, {
              color: mainColor,
              weight: 5,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map);

            // Dashed direction indicator line
            const dashPolyline = L.polyline(legRouteCoords, {
              color: '#ffffff',
              weight: 2,
              opacity: 0.9,
              dashArray: '6, 12',
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map);

            // Step Waypoint Circle Indicator on Destination
            const destCircle = L.circleMarker([endPt.lat, endPt.lng], {
              radius: 8,
              color: '#ffffff',
              weight: 2.5,
              fillColor: mainColor,
              fillOpacity: 1,
            }).addTo(map);

            routePolylinesRef.current.push(glowPolyline, mainPolyline, dashPolyline, destCircle);
          }
        }

        // 2. Draw explicit Store-to-Order direct connection lines (in purple/violet scheme)
        for (const order of sortedOrders) {
          if (!order.deliveryLocation?.lat || !order.deliveryLocation?.lng) continue;
          const delLat = order.deliveryLocation.lat;
          const delLng = order.deliveryLocation.lng;

          const orderShops: { name: string; lat: number; lng: number }[] = [];
          if (order.selectedShopIds && order.selectedShopIds.length > 0) {
            order.selectedShopIds.forEach((sId) => {
              const shop = fallbackStore.shops.get(sId);
              if (shop && shop.location?.lat && shop.location?.lng) {
                orderShops.push({ name: shop.name, lat: shop.location.lat, lng: shop.location.lng });
              }
            });
          }
          if (orderShops.length === 0 && order.pickupLocation?.lat && order.pickupLocation?.lng) {
            orderShops.push({
              name: order.pickupLocation.name || order.pickupLocation.address || 'পিকআপ স্টোর',
              lat: order.pickupLocation.lat,
              lng: order.pickupLocation.lng,
            });
          }

          for (const shopLoc of orderShops) {
            let shopOrderRouteCoords = await fetchRoadRoute([
              { lat: shopLoc.lat, lng: shopLoc.lng },
              { lat: delLat, lng: delLng },
            ]);

            if (isCancelled || !isMapAlive(map)) return;

            if (shopOrderRouteCoords.length > 0) {
              // High-visibility glowing purple store connection line
              const storeGlowPoly = L.polyline(shopOrderRouteCoords, {
                color: '#c084fc',
                weight: 8,
                opacity: 0.65,
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map);

              const storeMainPoly = L.polyline(shopOrderRouteCoords, {
                color: '#9333ea',
                weight: 4,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map);

              const storeDashPoly = L.polyline(shopOrderRouteCoords, {
                color: '#f3e8ff',
                weight: 2,
                opacity: 1,
                dashArray: '5, 10',
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map);

              // Popup on store-order connection line explaining the link
              const connectionPopupText = `<div style="font-size:11px;font-weight:800;font-family:sans-serif;color:#6b21a8;padding:2px;">🏬 <b>${shopLoc.name}</b> ➔ 📦 <b>অর্ডার #${order.id.slice(-6).toUpperCase()}</b> (${order.customerName})</div>`;
              storeGlowPoly.bindPopup(connectionPopupText);
              storeMainPoly.bindPopup(connectionPopupText);

              routePolylinesRef.current.push(storeGlowPoly, storeMainPoly, storeDashPoly);
            }
          }
        }
      }

      if (routesChanged) {
        lastOrdersHashRef.current = routesHash;
        if (!hasFittedBoundsRef.current && isMapAlive(map)) {
          if (allBoundsPoints.length > 1) {
            const bounds = L.latLngBounds(allBoundsPoints);
            map.fitBounds(bounds, { padding: [60, 60] });
          } else {
            map.setView([helperLat, helperLng], 15);
          }
          hasFittedBoundsRef.current = true;
        }
      }
    };

    renderMapElements();

    return () => {
      isCancelled = true;
    };
  }, [visibleOrders, helperLocation?.lat, helperLocation?.lng, mapReady, timerTick]);

  // Manual re-center helper function
  const handleRecenter = async () => {
    if (!isMapAlive(mapInstanceRef.current)) return;
    const L = await import('leaflet');
    const helperLat = helperLocation?.lat || 23.8759;
    const helperLng = helperLocation?.lng || 90.3795;
    const allPoints: [number, number][] = [[helperLat, helperLng]];

    visibleOrders.forEach((o) => {
      if (o.deliveryLocation?.lat && o.deliveryLocation?.lng) {
        allPoints.push([o.deliveryLocation.lat, o.deliveryLocation.lng]);
      }
    });

    if (allPoints.length > 1) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(allPoints), { padding: [60, 60] });
    } else {
      mapInstanceRef.current.setView([helperLat, helperLng], 15);
    }
  };

  // Filtered and Sorted Shops
  const filteredShops = shops.filter((s) => {
    const term = shopSearch.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      s.type.toLowerCase().includes(term) ||
      (s.location?.address || '').toLowerCase().includes(term)
    );
  });

  const sortedShops = [...filteredShops].sort((a, b) => {
    if (shopSort === 'name-asc') {
      return a.name.localeCompare(b.name);
    }
    if (shopSort === 'name-desc') {
      return b.name.localeCompare(a.name);
    }
    if (shopSort === 'type') {
      return a.type.localeCompare(b.type);
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const SHOPS_PER_PAGE = 5;
  const totalShopPages = Math.max(1, Math.ceil(sortedShops.length / SHOPS_PER_PAGE));
  const paginatedShops = sortedShops.slice(
    (shopPage - 1) * SHOPS_PER_PAGE,
    shopPage * SHOPS_PER_PAGE
  );

  if (mapLoadError) {
    return (
      <div className="w-full bg-slate-50 border border-slate-200 rounded-3xl p-5 shadow-lg space-y-4">
        {/* Map Area Placeholder showing it didn't load */}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center space-y-2 animate-in fade-in duration-350">
          <Globe className="w-10 h-10 text-red-500 mx-auto animate-pulse" />
          <h4 className="font-extrabold text-sm text-red-900">ম্যাপ লোড করা যায়নি (Map failed to load)</h4>
          <p className="text-xs text-red-700">জিপিএস ও ইন্টারনেট সংযোগ সক্রিয় আছে কিনা যাচাই করুন। নিচে নিবন্ধিত দোকানগুলোর তালিকা দেওয়া হলো।</p>
        </div>

        {/* Shop List Section */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
              <Store className="w-4 h-4 text-emerald-600" />
              <span>নিবন্ধিত দোকানসমূহ ({filteredShops.length})</span>
            </h3>

            {/* Filter and Sort Options */}
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <input
                type="text"
                placeholder="খুঁজুন (Search name, type, address)..."
                value={shopSearch}
                onChange={(e) => {
                  setShopSearch(e.target.value);
                  setShopPage(1);
                }}
                className="flex-1 min-w-[150px] px-3 py-1.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
              />
              <select
                value={shopSort}
                onChange={(e) => {
                  setShopSort(e.target.value as any);
                  setShopPage(1);
                }}
                className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none bg-white font-semibold text-gray-700 cursor-pointer"
              >
                <option value="newest">সর্বশেষ যুক্ত</option>
                <option value="name-asc">নাম (A-Z)</option>
                <option value="name-desc">নাম (Z-A)</option>
                <option value="type">ক্যাটাগরি</option>
              </select>
            </div>
          </div>

          {/* Shop List Cards */}
          {paginatedShops.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-xs">
              কোনো দোকান পাওয়া যায়নি।
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedShops.map((shop) => (
                <div key={shop.id} className="p-3.5 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-all flex flex-col gap-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h4 className="font-extrabold text-sm text-gray-900 leading-tight">{shop.name}</h4>
                      <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-100">
                        {shop.type}
                      </span>
                    </div>
                    {shop.location.lat && shop.location.lng && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${shop.location.lat},${shop.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>ম্যাপে দেখুন</span>
                      </a>
                    )}
                  </div>

                  <div className="text-xs text-gray-600 space-y-1">
                    <p className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="font-semibold text-gray-500">যোগাযোগ:</span>
                      <span className="font-bold">{shop.contactPerson}</span>
                    </p>
                    <p className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{shop.location.address}</span>
                    </p>
                  </div>

                  <div className="flex gap-2 pt-1.5 border-t border-gray-100">
                    <a
                      href={`tel:${shop.whatsapp}`}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs text-center shadow-xs flex items-center justify-center gap-1 transition-all"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>কল করুন</span>
                    </a>
                    <a
                      href={`https://wa.me/${shop.whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-extrabold text-xs text-center rounded-xl shadow-xs flex items-center justify-center gap-1 transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {totalShopPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs font-bold text-gray-700 font-sans">
              <button
                type="button"
                onClick={() => setShopPage((p) => Math.max(1, p - 1))}
                disabled={shopPage === 1}
                className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 transition-all"
              >
                পূর্ববর্তী
              </button>
              <span>পৃষ্ঠা {shopPage} / {totalShopPages}</span>
              <button
                type="button"
                onClick={() => setShopPage((p) => Math.min(totalShopPages, p + 1))}
                disabled={shopPage === totalShopPages}
                className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 transition-all"
              >
                পরবর্তী
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full bg-slate-900 transition-all duration-300 flex flex-col ${isFullscreen
          ? 'z-[99999]'
          : 'h-[650px] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-20'
        }`}
      style={
        isFullscreen
          ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh' }
          : undefined
      }
    >

      {/* Top Right Controls */}
      <div className="absolute top-4 right-4 z-[10001] pointer-events-auto flex items-center gap-2">
        {/* Fullscreen / Close Button */}
        <button
          type="button"
          onClick={() => setIsFullscreen((prev) => !prev)}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-extrabold shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer ${isFullscreen
              ? 'bg-red-600 hover:bg-red-700 text-white border border-red-400'
              : 'bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-white border border-slate-700/80'
            }`}
          title={isFullscreen ? 'ম্যাপ বন্ধ করুন' : 'Full Screen Map'}
        >
          {isFullscreen ? (
            <>
              <X className="w-4 h-4 text-white" />
              <span>ম্যাপ বন্ধ করুন</span>
            </>
          ) : (
            <>
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>ফুল স্ক্রিন</span>
            </>
          )}
        </button>
      </div>

      {/* Leaflet Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Bottom Left Controls: Re-center Button & Live Route Map Label */}
      <div
        className={`absolute z-[10001] pointer-events-auto flex flex-col items-start gap-2 transition-all duration-300 ${selectedOrder ? 'bottom-[205px] left-4' : 'bottom-4 left-4'
          }`}
      >
        <button
          type="button"
          onClick={handleRecenter}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-white rounded-2xl text-xs font-bold border border-slate-700/80 shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
          title="Re-center map"
        >
          <Navigation className="w-3.5 h-3.5 text-cyan-400" />
          <span>কেন্দ্রবিন্দু</span>
        </button>

        {!selectedOrder && !selectedShop && (
          <div className="flex flex-col gap-1.5 bg-slate-900/90 backdrop-blur-md px-3.5 py-2.5 rounded-2xl border border-slate-700/80 shadow-xl">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="text-xs font-extrabold text-white">
                রানিং লাইভ রুট ম্যাপ ({visibleOrders.length}টি অর্ডার)
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-300 font-bold border-t border-slate-700/60 pt-1.5">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-300 inline-block"></span>
                <span>ডেলিভারি রুট</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 border border-purple-300 inline-block"></span>
                <span>দোকান সংযোগ</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Store Details Modal (shown when a shop marker is clicked) ── */}
      {selectedShop && (
        <div className="absolute inset-0 z-[10002] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-purple-200 shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-700 to-violet-800 text-white">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/20 rounded-xl">
                  <Store className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="font-extrabold text-sm leading-tight">{selectedShop.name}</div>
                  <div className="text-[10px] text-purple-200 font-semibold">{selectedShop.type}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedShop(null)}
                className="p-1.5 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3 space-y-2.5 text-xs text-gray-700">
              {/* Description */}
              <div className="space-y-1">
                <span className="font-bold text-gray-600 block">যা যা পাওয়া যায় (What's Available):</span>
                <p className="bg-purple-50 text-purple-950 p-2.5 rounded-xl border border-purple-100 italic leading-snug">
                  {selectedShop.description || 'কোনো বিবরণ নেই (No description)'}
                </p>
              </div>

              {/* Owner Info */}
              <div className="space-y-1">
                <span className="font-bold text-gray-600 block">মালিকের নাম ও যোগাযোগ (Owner Name & Contact):</span>
                <div className="flex items-center gap-1.5 font-medium">
                  <User className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span className="font-bold text-purple-950">{selectedShop.contactPerson}</span>
                  <span className="text-gray-500 font-mono text-[11px]">({selectedShop.whatsapp})</span>
                </div>
              </div>

              {/* Manager Info */}
              <div className="space-y-1">
                <span className="font-bold text-gray-600 block">ম্যানেজারের নাম ও যোগাযোগ (Manager Name & Contact):</span>
                {selectedShop.managerName ? (
                  <div className="flex items-center gap-1.5 font-medium">
                    <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="font-bold text-indigo-950">{selectedShop.managerName}</span>
                    <span className="text-gray-500 font-mono text-[11px]">({selectedShop.managerWhatsapp || 'নেই'})</span>
                  </div>
                ) : (
                  <span className="text-gray-400 italic">ম্যানেজার তথ্য নেই (No manager details)</span>
                )}
              </div>

              {/* Address */}
              <div className="flex items-start gap-1.5 pt-1.5 border-t border-gray-100">
                <MapPin className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
                <span className="font-medium leading-snug">{selectedShop.location.address}</span>
              </div>

              {/* Added By */}
              {selectedShop.addedByHelperName && (
                <div className="flex items-center gap-2 text-[10px] text-gray-400 pt-0.5">
                  <span>Added by:</span>
                  <span className="font-semibold text-gray-500">{selectedShop.addedByHelperName}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                <a
                  href={`tel:${selectedShop.whatsapp}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-extrabold shadow-sm transition-all active:scale-95"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>কল করুন</span>
                </a>
                <a
                  href={`https://wa.me/${selectedShop.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-2xl text-xs font-extrabold shadow-sm transition-all active:scale-95"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </a>
                {selectedShop.location.lat && selectedShop.location.lng && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedShop.location.lat},${selectedShop.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-extrabold shadow-sm transition-all active:scale-95"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Directions</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Selected Order Drawer / Popover */}
      {selectedOrder && !selectedShop && (
        <div className="absolute bottom-4 left-4 right-4 z-[10001] bg-slate-900/95 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl animate-slideUp text-white">
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-cyan-400">
              <Globe className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>রানিং লাইভ রুট ম্যাপ ({visibleOrders.length}টি অর্ডার)</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedOrderState(null)}
              className="text-[11px] font-bold text-slate-400 hover:text-white px-2 py-0.5 rounded-lg bg-slate-800"
            >
              বন্ধ করুন
            </button>
          </div>

          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-cyan-400">
                  {selectedOrder.service || selectedOrder.title || 'অর্ডার'}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedOrder.status === 'PENDING'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    }`}
                >
                  {selectedOrder.status}
                </span>
              </div>
              <span className="inline-block mt-1 bg-slate-800 text-cyan-300 font-black font-mono text-[10px] px-2 py-0.5 rounded-md border border-slate-700">
                #{selectedOrder.id}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-extrabold text-red-500 bg-red-950/60 px-3 py-1.5 rounded-xl border border-red-500/40 shrink-0 shadow-sm">
              <Clock className="w-4 h-4 text-red-500 animate-pulse" />
              <span>{getElapsedTime(selectedOrder.createdAt)}</span>
            </div>
          </div>

          {/* Details Snippet */}
          <div className="text-xs text-slate-300 space-y-1 mb-3 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="line-clamp-1">
                {selectedOrder.items.map((i) => i.name).join(', ')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="line-clamp-1">{selectedOrder.deliveryLocation.address}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectOrder(selectedOrder)}
              className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
            >
              <Eye className="w-4 h-4 text-cyan-400" />
              <span>বিস্তারিত দেখুন</span>
            </button>

            {selectedOrder.status === 'PENDING' && onAcceptOrder && (
              <button
                type="button"
                onClick={() => {
                  onAcceptOrder(selectedOrder);
                  setSelectedOrderState(null);
                }}
                className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-md transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                <span>গ্রহণ করুন</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
