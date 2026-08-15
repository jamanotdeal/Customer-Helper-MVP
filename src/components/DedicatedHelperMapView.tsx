'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Order, LocationData } from '@/types';
import { MapPin, Navigation, Clock, Package, Eye, CheckCircle, Globe, Maximize2, Minimize2, X } from 'lucide-react';
import { fetchRoadRoute } from '@/lib/routeUtils';
import { getElapsedTime } from '@/lib/timeUtils';

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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const routePolylinesRef = useRef<any[]>([]);

  const hasFittedBoundsRef = useRef(false);
  const lastOrdersHashRef = useRef<string>('');

  const [selectedOrder, setSelectedOrderState] = useState<Order | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [timerTick, setTimerTick] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Live timer tick every second for real-time countdown/elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Synchronize document fullscreen state changes (e.g., ESC key or browser back)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isDocFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );
      setIsFullscreen(isDocFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Fullscreen toggle handler with native API fallback
  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    if (next) {
      if (mapContainerRef.current?.requestFullscreen) {
        mapContainerRef.current.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

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

    const initMap = async () => {
      const L = await import('leaflet');
      if (!isMounted || !mapContainerRef.current) return;

      // Inject Leaflet CSS if not present
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
        } catch (e) {
          console.warn('[Leaflet] cleanup notice:', e);
        }
        mapInstanceRef.current = null;
      }

      const helperLat = helperLocation?.lat || 23.8759;
      const helperLng = helperLocation?.lng || 90.3795;

      const map = L.map(mapContainerRef.current).setView([helperLat, helperLng], 14);
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
      if (isMounted) setMapReady(true);
    };

    initMap();

    return () => {
      isMounted = false;
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
            <div style="position: relative; width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #10b981, #059669); border: 3px solid white; box-shadow: 0 6px 20px rgba(16,185,129,0.8); display: flex; align-items: center; justify-content: center; color: white;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"></path>
                <path d="M18.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"></path>
                <path d="M15 6h2.5l1.5 4-3.5 1"></path>
                <path d="M9 14l2-4h4.5"></path>
                <path d="M5.5 12H9l3-7h3"></path>
                <path d="M12 9v5"></path>
              </svg>
            </div>
          </div>
          <div style="margin-top: 3px; background: rgba(15, 23, 42, 0.95); color: #34d399; font-size: 11px; font-weight: 900; padding: 2px 8px; border-radius: 8px; border: 1.5px solid #10b981; box-shadow: 0 4px 10px rgba(0,0,0,0.5); white-space: nowrap; display: flex; align-items: center; gap: 3px;">
            <span>🛵 You</span>
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
          .bindPopup('<b>আপনার বর্তমান অবস্থান (You)</b>');
        markersRef.current.set('helper', helperMarker);
      }

      const allBoundsPoints: [number, number][] = [[helperLat, helperLng]];

      // Hash route data to decide if route lines need to be re-fetched
      const routesHash = visibleOrders
        .map((o) => `${o.id}:${o.deliveryLocation?.lat},${o.deliveryLocation?.lng}`)
        .sort()
        .join(';') + `;${helperLat},${helperLng}`;

      const routesChanged = routesHash !== lastOrdersHashRef.current;

      if (routesChanged) {
        routePolylinesRef.current.forEach((poly) => {
          try {
            poly.remove();
          } catch (e) {}
        });
        routePolylinesRef.current = [];
      }

      // Remove stale markers for orders that are no longer active
      const currentOrderIds = new Set(visibleOrders.map((o) => o.id));
      currentOrderIds.add('helper');
      markersRef.current.forEach((marker, id) => {
        if (!currentOrderIds.has(id)) {
          try {
            marker.remove();
          } catch (e) {}
          markersRef.current.delete(id);
        }
      });

      // 2. Process each visible active order
      for (const order of visibleOrders) {
        const orderTitle = order.service || order.title || `অর্ডার #${order.id.slice(-4)}`;
        const elapsedStr = getElapsedTime(order.createdAt);

        const deliveryLat =
          order.deliveryLocation?.lat || helperLat + getDeterministicOffset(order.id, 1);
        const deliveryLng =
          order.deliveryLocation?.lng || helperLng + getDeterministicOffset(order.id, 2);
        const deliveryPoint = { lat: deliveryLat, lng: deliveryLng };
        allBoundsPoints.push([deliveryLat, deliveryLng]);

        const isPending = order.status === 'PENDING';
        const badgeColor = isPending ? '#f59e0b' : '#2563eb';
        const badgeBorderColor = isPending ? '#d97706' : '#1d4ed8';

        // Timer text: Bold Red Color & Increased Text Size (13px)
        const orderIconHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; width: 190px; height: 82px;">
            <div style="background: linear-gradient(135deg, ${badgeColor}, ${badgeBorderColor}); color: white; padding: 6px 10px; border-radius: 14px; border: 2px solid white; box-shadow: 0 8px 24px rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; width: 170px; text-align: center;">
              <div style="font-size: 12px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 155px; line-height: 1.2;">
                ${orderTitle}
              </div>
              <div style="display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.45); padding: 3px 8px; border-radius: 8px; font-size: 13px; font-weight: 800; margin-top: 3px; color: #ef4444;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span>${elapsedStr}</span>
              </div>
            </div>
            <div style="width: 3px; height: 16px; background: ${badgeColor}; border-left: 1px solid rgba(255,255,255,0.9); border-right: 1px solid rgba(255,255,255,0.9); margin-top: -1px;"></div>
            <div style="position: relative; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; margin-top: -1px;">
              <div style="position: absolute; inset: -4px; border-radius: 50%; background: ${badgeColor}; opacity: 0.5; animation: pulse 1.5s infinite;"></div>
              <div style="position: relative; width: 16px; height: 16px; border-radius: 50%; background: ${badgeColor}; border: 2.5px solid white; box-shadow: 0 0 10px ${badgeColor}, 0 4px 12px rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;">
                <div style="width: 4px; height: 4px; border-radius: 50%; background: white;"></div>
              </div>
            </div>
          </div>
        `;

        const orderIcon = L.divIcon({
          className: `order-marker-${order.id}`,
          html: orderIconHtml,
          iconSize: [190, 82],
          iconAnchor: [95, 82],
          popupAnchor: [0, -82],
        });

        let existingMarker = markersRef.current.get(order.id);
        if (existingMarker) {
          existingMarker.setLatLng([deliveryLat, deliveryLng]);
          existingMarker.setIcon(orderIcon);
        } else {
          if (isCancelled || !isMapAlive(map)) return;
          existingMarker = L.marker([deliveryLat, deliveryLng], { icon: orderIcon }).addTo(map);
          existingMarker.on('click', () => {
            setSelectedOrderState(order);
            onSelectOrder(order);
          });
          markersRef.current.set(order.id, existingMarker);
        }

        // Draw green road polylines only when order structure or coordinates change
        if (routesChanged) {
          let deliveryRouteCoords = await fetchRoadRoute([helperPoint, deliveryPoint]);

          if (isCancelled || !isMapAlive(map)) return;

          if (deliveryRouteCoords.length > 0) {
            const firstPt = deliveryRouteCoords[0];
            const lastPt = deliveryRouteCoords[deliveryRouteCoords.length - 1];

            if (firstPt[0] !== helperLat || firstPt[1] !== helperLng) {
              deliveryRouteCoords = [[helperLat, helperLng], ...deliveryRouteCoords];
            }
            if (lastPt[0] !== deliveryLat || lastPt[1] !== deliveryLng) {
              deliveryRouteCoords = [...deliveryRouteCoords, [deliveryLat, deliveryLng]];
            }

            const glowPolyline = L.polyline(deliveryRouteCoords, {
              color: '#15803d',
              weight: 8,
              opacity: 0.4,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map);

            const roadPolyline = L.polyline(deliveryRouteCoords, {
              color: '#22c55e',
              weight: 4,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map);

            const destCircle = L.circleMarker([deliveryLat, deliveryLng], {
              radius: 8,
              color: '#ffffff',
              weight: 2,
              fillColor: '#22c55e',
              fillOpacity: 0.9,
            }).addTo(map);

            routePolylinesRef.current.push(glowPolyline, roadPolyline, destCircle);
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

  return (
    <div
      className={`relative w-full bg-slate-900 transition-all duration-300 flex flex-col ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] h-screen w-screen rounded-none border-none shadow-none'
          : 'h-[650px] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden'
      }`}
    >
      {/* Top Right Control: Fullscreen Toggle */}
      <div className="absolute top-4 right-4 z-20 pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={toggleFullscreen}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-extrabold shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer ${
            isFullscreen
              ? 'bg-red-600 hover:bg-red-700 text-white border border-red-400 z-[10000]'
              : 'bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-white border border-slate-700/80'
          }`}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
        >
          {isFullscreen ? (
            <>
              <X className="w-4 h-4 text-white" />
              <span>ফুল স্ক্রিন বন্ধ করুন</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>ফুল স্ক্রিন</span>
            </>
          )}
        </button>
      </div>

      {/* Leaflet Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Bottom Left Controls: "কেন্দ্রবিন্দু" Button & Live Route Map Label */}
      <div
        className={`absolute z-20 pointer-events-auto flex flex-col items-start gap-2 transition-all duration-300 ${
          selectedOrder ? 'bottom-[205px] left-4' : 'bottom-4 left-4'
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

        {!selectedOrder && (
          <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-700/80 shadow-xl">
            <Globe className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-xs font-extrabold text-white">
              রানিং লাইভ রুট ম্যাপ ({visibleOrders.length}টি অর্ডার)
            </span>
          </div>
        )}
      </div>

      {/* Floating Selected Order Drawer / Popover */}
      {selectedOrder && (
        <div className="absolute bottom-4 left-4 right-4 z-20 bg-slate-900/95 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl animate-slideUp text-white">
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
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    selectedOrder.status === 'PENDING'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  }`}
                >
                  {selectedOrder.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 font-medium">
                অর্ডার ID: #{selectedOrder.id}
              </p>
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

