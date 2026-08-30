'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Shop } from '@/types';
import {
  Store,
  Globe,
  Maximize2,
  X,
  Navigation,
  Search,
  Filter,
  MapPin,
  Plus,
} from 'lucide-react';
import { usePullToRefreshLock } from '@/hooks/usePullToRefreshLock';

interface AdminShopMapViewProps {
  shops: Shop[];
  onSelectShop: (shop: Shop) => void;
  onAddShop?: () => void;
}

// Check if Leaflet map instance is fully initialized and loaded
const isMapAlive = (map: any) => {
  return (
    map &&
    map._loaded &&
    typeof map.getPane === 'function' &&
    map.getPane('mapPane') !== undefined &&
    map.getContainer() !== null
  );
};

export const AdminShopMapView: React.FC<AdminShopMapViewProps> = ({
  shops,
  onSelectShop,
  onAddShop,
}) => {
  // Leaflet consumes the drag itself, so the native pull gesture must be
  // disarmed while this map is on screen.
  usePullToRefreshLock();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  const hasFittedBoundsRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Collect unique store types for filter dropdown
  const availableTypes = Array.from(
    new Set(shops.map((s) => s.type).filter(Boolean))
  );

  // Listen to fullscreen changes
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

  // Invalidate Leaflet map size on fullscreen toggle or window resize
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const invalidate = () => {
      if (isMapAlive(mapInstanceRef.current)) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    invalidate();
    const t1 = setTimeout(invalidate, 100);
    const t2 = setTimeout(invalidate, 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
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

  // Filter shops based on search query & selected store type
  const filteredShops = shops.filter((s) => {
    if (selectedType !== 'ALL' && s.type !== selectedType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.type || '').toLowerCase().includes(q) ||
        (s.contactPerson || '').toLowerCase().includes(q) ||
        (s.whatsapp && s.whatsapp.includes(q)) ||
        (s.location?.address || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Initialize Earth Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let isMounted = true;

    const initMap = async () => {
      const L = await import('leaflet');
      if (!isMounted || !mapContainerRef.current) return;

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
        } catch (e) {}
        mapInstanceRef.current = null;
      }

      // Default central center (Dhaka / Campus area default)
      const defaultLat = 23.8759;
      const defaultLng = 90.3795;

      const map = L.map(mapContainerRef.current).setView([defaultLat, defaultLng], 13);
      mapInstanceRef.current = map;

      // Google Hybrid Earth Satellite View
      const tileUrl = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
      const tileAttribution = '&copy; Google Maps Earth Satellite';

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
        } catch (e) {}
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Render Shop Markers on Map
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    let isCancelled = false;

    const renderShopsOnMap = async () => {
      const L = await import('leaflet');
      if (isCancelled) return;
      const map = mapInstanceRef.current;
      if (!isMapAlive(map)) return;

      const allPoints: [number, number][] = [];
      const currentShopIds = new Set(filteredShops.map((s) => s.id));

      // Remove markers for shops no longer in filtered list
      markersRef.current.forEach((marker, id) => {
        if (!currentShopIds.has(id)) {
          try {
            marker.remove();
          } catch (e) {}
          markersRef.current.delete(id);
        }
      });

      for (const shop of filteredShops) {
        if (!shop.location?.lat || !shop.location?.lng) continue;

        const lat = shop.location.lat;
        const lng = shop.location.lng;
        allPoints.push([lat, lng]);

        /**
         * Custom Marker Design as specified:
         * - Purple color box containing: Store name, type + retail icon
         * - A dark line connecting the purple box to the exact address point on map
         */
        const markerHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; transform: translate(0, 0);">
            <!-- Purple Color Box (Store name, type + retail icon) -->
            <div style="background: linear-gradient(135deg, #6b21a8, #4c1d95); color: white; padding: 7px 12px; border-radius: 14px; border: 2.5px solid #c084fc; box-shadow: 0 8px 24px rgba(107, 33, 168, 0.6); display: flex; align-items: center; gap: 8px; font-family: sans-serif; white-space: nowrap; max-width: 220px; transition: transform 0.2s ease;">
              <!-- Retail Icon -->
              <div style="width: 28px; height: 28px; border-radius: 9px; background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3); display: flex; align-items: center; justify-content: center; shrink: 0; color: #f3e8ff;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </div>
              <!-- Store Details -->
              <div style="display: flex; flex-direction: column; min-width: 0; text-align: left;">
                <div style="font-size: 12px; font-weight: 900; color: #ffffff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; line-height: 1.2;">
                  ${shop.name}
                </div>
                <div style="font-size: 10px; font-weight: 700; color: #e9d5ff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; margin-top: 1px;">
                  ${shop.type}
                </div>
              </div>
            </div>

            <!-- Dark Connecting Line to Exact Address -->
            <div style="width: 3px; height: 18px; background: #0f172a; margin-top: -1px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>

            <!-- Pin Point Dot on Exact Location -->
            <div style="position: relative; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; margin-top: -1px;">
              <div style="position: absolute; inset: -3px; border-radius: 50%; background: #a855f7; opacity: 0.5; animation: pulse 1.8s infinite;"></div>
              <div style="width: 12px; height: 12px; border-radius: 50%; background: #0f172a; border: 2.5px solid #c084fc; box-shadow: 0 0 8px rgba(168, 85, 247, 0.8);"></div>
            </div>
          </div>
        `;

        const shopIcon = L.divIcon({
          className: `admin-shop-marker-${shop.id}`,
          html: markerHtml,
          iconSize: [220, 75],
          iconAnchor: [110, 75],
          popupAnchor: [0, -75],
        });

        let existingMarker = markersRef.current.get(shop.id);
        if (existingMarker) {
          existingMarker.setLatLng([lat, lng]);
          existingMarker.setIcon(shopIcon);
        } else {
          if (isCancelled || !isMapAlive(map)) return;
          existingMarker = L.marker([lat, lng], { icon: shopIcon }).addTo(map);

          // Click on marker opens shop details modal
          existingMarker.on('click', () => {
            onSelectShop(shop);
          });

          markersRef.current.set(shop.id, existingMarker);
        }
      }

      // Auto-fit bounds on initial load if points exist
      if (!hasFittedBoundsRef.current && allPoints.length > 0 && isMapAlive(map)) {
        if (allPoints.length > 1) {
          map.fitBounds(L.latLngBounds(allPoints), { padding: [60, 60] });
        } else {
          map.setView(allPoints[0], 15);
        }
        hasFittedBoundsRef.current = true;
      }
    };

    renderShopsOnMap();

    return () => {
      isCancelled = true;
    };
  }, [filteredShops, mapReady]);

  // Recenter map button handler
  const handleRecenter = async () => {
    if (!isMapAlive(mapInstanceRef.current)) return;
    const L = await import('leaflet');
    const points: [number, number][] = [];

    filteredShops.forEach((s) => {
      if (s.location?.lat && s.location?.lng) {
        points.push([s.location.lat, s.location.lng]);
      }
    });

    if (points.length > 1) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(points), { padding: [60, 60] });
    } else if (points.length === 1) {
      mapInstanceRef.current.setView(points[0], 15);
    } else {
      mapInstanceRef.current.setView([23.8759, 90.3795], 13);
    }
  };

  return (
    <div
      className={`relative w-full bg-slate-950 transition-all duration-300 flex flex-col ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] h-screen w-screen rounded-none border-none shadow-none'
          : 'h-[650px] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden'
      }`}
    >
      {/* Top Filter & Search Controls Overlay */}
      <div className="absolute top-4 left-4 right-4 z-20 pointer-events-auto flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 backdrop-blur-md p-3 rounded-2xl border border-slate-800 shadow-2xl">
        {/* Search & Type Filter */}
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search store name, location, contact..."
              className="w-full pl-9 pr-3 py-2 bg-slate-800/90 text-white rounded-xl text-xs font-semibold border border-slate-700 focus:outline-none focus:border-purple-500 placeholder-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {availableTypes.length > 0 && (
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="py-2 px-3 bg-slate-800 text-purple-200 font-bold text-xs rounded-xl border border-slate-700 focus:outline-none focus:border-purple-500"
            >
              <option value="ALL">All Store Types</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-purple-950/80 text-purple-300 border border-purple-800/60 hidden sm:inline-block">
            🏪 {filteredShops.length} Stores Registered
          </span>

          {onAddShop && (
            <button
              type="button"
              onClick={onAddShop}
              className="py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Shop</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              isFullscreen
                ? 'bg-red-600 hover:bg-red-700 text-white border border-red-400'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
            }`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
          >
            {isFullscreen ? (
              <>
                <X className="w-3.5 h-3.5 text-white" />
                <span className="hidden sm:inline">Close Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-purple-300" />
                <span className="hidden sm:inline">Fullscreen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Leaflet Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Bottom Control Overlay */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={handleRecenter}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-white rounded-2xl text-xs font-bold border border-slate-700 shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Navigation className="w-3.5 h-3.5 text-purple-400" />
          <span>Re-center (All Stores)</span>
        </button>

        <div className="hidden sm:flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-700 shadow-xl">
          <Globe className="w-4 h-4 text-purple-400 animate-pulse" />
          <span className="text-xs font-extrabold text-white">
            Shop Locations Earth Map
          </span>
        </div>
      </div>
    </div>
  );
};
