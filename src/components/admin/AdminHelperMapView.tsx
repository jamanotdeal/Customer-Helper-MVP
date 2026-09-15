'use client';

import React, { useEffect, useRef, useState } from 'react';
import { UserProfile, Order, HelperApplication, LocationData, AllowedAreaPolygon } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { fetchRoadRoute } from '@/lib/routeUtils';
import { getElapsedTime } from '@/lib/timeUtils';
import { useSecondTick } from '@/hooks/useSecondTick';
import { getPolygonCenter } from '@/lib/geofenceUtils';
import {
  Bike,
  Zap,
  Navigation,
  Globe,
  Maximize2,
  X,
  User,
  Clock,
  Check,
  Phone,
  MapPin,
  Filter,
  ShieldCheck,
  Eye,
  Layers,
  Square,
  Plus,
} from 'lucide-react';
import { DraggableTabsContainer } from './DraggableTabsContainer';
import { usePullToRefreshLock } from '@/hooks/usePullToRefreshLock';
import { getSpiderfiedCoordinates, setupMarkerHoverElevation } from '@/utils/mapMarkerUtils';

interface AdminHelperMapViewProps {
  users: UserProfile[];
  orders: Order[];
  applications: HelperApplication[];
  allowedDeliveryAreas?: AllowedAreaPolygon[];
  onSelectHelper: (helper: { id: string; name: string }) => void;
  onSelectUser: (userId: string) => void;
  onUpdateHelperType?: (userId: string, newType: 'commuter' | 'dedicated') => Promise<void>;
  onEditArea?: (area: AllowedAreaPolygon) => void;
  onAddArea?: () => void;
}

// Deterministic coordinate offset function based on string hash for missing locations
const getDeterministicOffset = (id: string, seed: number) => {
  let hash = 0;
  const str = id + seed;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const norm = (Math.abs(hash) % 1000) / 1000;
  return (norm - 0.5) * 0.014;
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

export const AdminHelperMapView: React.FC<AdminHelperMapViewProps> = ({
  users,
  orders,
  applications,
  allowedDeliveryAreas = [],
  onSelectHelper,
  onSelectUser,
  onUpdateHelperType,
  onEditArea,
  onAddArea,
}) => {
  // Leaflet consumes the drag itself, so the native pull gesture must be
  // disarmed while this map is on screen.
  usePullToRefreshLock();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const routePolylinesRef = useRef<any[]>([]);
  const areaLayersRef = useRef<any[]>([]);

  const hasFittedBoundsRef = useRef(false);
  const [selectedHelperId, setSelectedHelperId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'COMMUTER' | 'DEDICATED' | 'ON_DUTY'>('ALL');
  const [showServiceAreas, setShowServiceAreas] = useState(true);
  // Live elapsed-time clock, shared with every other card and map on
  // screen and paused while the app is hidden — see useSecondTick.
  const timerTick = useSecondTick();

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

  // Aggregate helpers list from users and applications
  const helperUsers = users.filter((u) => u.isHelper || u.role === 'helper');
  
  // Ensure any approved applications are also represented
  applications.forEach((app) => {
    if (app.status === 'APPROVED' && !helperUsers.some((u) => u.uid === app.userId)) {
      const userObj = users.find((u) => u.uid === app.userId);
      if (userObj) {
        helperUsers.push({
          ...userObj,
          isHelper: true,
          helperType: app.applicationType === 'dedicated' ? 'dedicated' : userObj.helperType || 'commuter',
        });
      }
    }
  });

  // Filter helper users according to selected typeFilter
  const filteredHelpers = helperUsers.filter((h) => {
    const hType = h.helperType || 'commuter';
    const activeAssignedOrders = orders.filter(
      (o) => o.helperId === h.uid && o.status !== 'DELIVERED' && o.status !== 'CANCELED'
    );
    if (typeFilter === 'COMMUTER') return hType === 'commuter';
    if (typeFilter === 'DEDICATED') return hType === 'dedicated';
    if (typeFilter === 'ON_DUTY') return activeAssignedOrders.length > 0;
    return true;
  });

  // Stats calculation
  const commuterCount = helperUsers.filter((h) => (h.helperType || 'commuter') === 'commuter').length;
  const dedicatedCount = helperUsers.filter((h) => h.helperType === 'dedicated').length;
  const activeDutyCount = helperUsers.filter((h) =>
    orders.some((o) => o.helperId === h.uid && o.status !== 'DELIVERED' && o.status !== 'CANCELED')
  ).length;

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

  // Render Service Areas (Geofencing Sub-areas) with Soft Green Overlay & Borderline
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    if (!isMapAlive(map)) return;

    // Clear previous area layers
    areaLayersRef.current.forEach((layer) => {
      try {
        map.removeLayer(layer);
      } catch (e) {}
    });
    areaLayersRef.current = [];

    if (!showServiceAreas || !allowedDeliveryAreas || allowedDeliveryAreas.length === 0) {
      return;
    }

    import('leaflet').then((L) => {
      if (!isMapAlive(map)) return;

      allowedDeliveryAreas.forEach((area) => {
        if (!area.coordinates || area.coordinates.length < 3) return;

        const latLngs = area.coordinates.map((p) => [p.lat, p.lng] as [number, number]);

        // Soft green overlay with borderline
        const poly = L.polygon(latLngs, {
          color: '#059669', // Emerald 600 border
          fillColor: '#10b981', // Emerald 500 fill
          fillOpacity: 0.22, // Soft translucent overlay
          weight: 2.5,
          dashArray: '4, 4',
        }).addTo(map);

        // Calculate polygon centroid for centered label badge
        const center = getPolygonCenter(area.coordinates);
        const isAllHelpers = area.allHelpersAssigned !== false && (!area.assignedHelperIds || area.assignedHelperIds.length === 0);
        const assignedCount = isAllHelpers
          ? 'All Helpers'
          : `${area.assignedHelperIds?.length || 0} Helpers`;

        // Permanent clean label badge on polygon
        poly.bindTooltip(
          `
          <div style="font-family: inherit; text-align: center; line-height: 1.3; cursor: pointer;">
            <div style="font-size: 11px; font-weight: 900; color: #064e3b; display: flex; align-items: center; justify-content: center; gap: 3px;">
              <span>📍</span> <span>${area.name}</span>
            </div>
            <div style="font-size: 9.5px; font-weight: 800; color: #047857; margin-top: 1px;">
              👥 ${assignedCount}
            </div>
          </div>
          `,
          {
            permanent: true,
            direction: 'center',
            className: 'service-area-badge bg-white/95 text-emerald-950 px-2.5 py-1 rounded-xl border border-emerald-300 shadow-md font-sans pointer-events-none',
          }
        );

        poly.on('click', () => {
          if (onEditArea) {
            onEditArea(area);
          }
        });

        areaLayersRef.current.push(poly);
      });
    });
  }, [mapReady, showServiceAreas, allowedDeliveryAreas, onEditArea]);

  // Update Earth Map Markers and Route Polylines
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    let isCancelled = false;

    const renderHelpersOnMap = async () => {
      const L = await import('leaflet');
      if (isCancelled) return;
      const map = mapInstanceRef.current;
      if (!isMapAlive(map)) return;

      const allPoints: [number, number][] = [];
      const currentHelperIds = new Set(filteredHelpers.map((h) => h.uid));

      // Remove markers for helpers no longer in filter
      markersRef.current.forEach((marker, id) => {
        if (!currentHelperIds.has(id)) {
          try {
            marker.remove();
          } catch (e) {}
          markersRef.current.delete(id);
        }
      });

      // Clear existing road polylines
      routePolylinesRef.current.forEach((poly) => {
        try {
          poly.remove();
        } catch (e) {}
      });
      routePolylinesRef.current = [];

      const spiderfiedHelpers = getSpiderfiedCoordinates(
        filteredHelpers,
        (h) => {
          if (typeof h.helperLocation?.lat === 'number') return h.helperLocation.lat;
          const active = orders.filter((o) => o.helperId === h.uid && o.status !== 'DELIVERED' && o.status !== 'CANCELED');
          if (active[0]?.deliveryLocation?.lat) return active[0].deliveryLocation.lat;
          return 23.8759 + getDeterministicOffset(h.uid, 1);
        },
        (h) => {
          if (typeof h.helperLocation?.lng === 'number') return h.helperLocation.lng;
          const active = orders.filter((o) => o.helperId === h.uid && o.status !== 'DELIVERED' && o.status !== 'CANCELED');
          if (active[0]?.deliveryLocation?.lng) return active[0].deliveryLocation.lng;
          return 90.3795 + getDeterministicOffset(h.uid, 2);
        }
      );

      for (const entry of spiderfiedHelpers) {
        const { item: helper, originalLat: lat, originalLng: lng, displayLat, displayLng, overlapCount, overlapIndex } = entry;
        const isDedicated = helper.helperType === 'dedicated';
        const activeAssigned = orders.filter(
          (o) => o.helperId === helper.uid && o.status !== 'DELIVERED' && o.status !== 'CANCELED'
        );
        const isOnDuty = activeAssigned.length > 0;
        const hasOverlap = overlapCount > 1;

        allPoints.push([lat, lng]);

        const badgeBg = isDedicated
          ? 'linear-gradient(135deg, #f59e0b, #d97706)'
          : 'linear-gradient(135deg, #6366f1, #4f46e5)';
        const borderGlow = isDedicated ? '#f59e0b' : '#818cf8';
        const typeLabel = isDedicated ? '⚡ Dedicated Rider' : '🚲 Commuter Helper';

        const overlapBadgeHtml = hasOverlap
          ? `<span style="background:#f59e0b;color:#000;font-size:9px;font-weight:900;padding:1px 4px;border-radius:6px;margin-left:3px;">${overlapIndex}/${overlapCount}</span>`
          : '';

        const markerHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; width: 180px; height: 75px;">
            <div style="background: ${badgeBg}; color: white; padding: 5px 10px; border-radius: 14px; border: 2px solid ${hasOverlap ? '#f59e0b' : 'white'}; box-shadow: 0 8px 20px rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; width: 165px; text-align: center;">
              <div style="font-size: 11px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; line-height: 1.2; display: flex; align-items: center; justify-content: center;">
                ${helper.displayName || 'Helper'} ${overlapBadgeHtml}
              </div>
              <div style="display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.4); padding: 2px 6px; border-radius: 8px; font-size: 9.5px; font-weight: 800; margin-top: 2px;">
                <span>${typeLabel}</span>
                ${isOnDuty ? `<span style="background: #10b981; color: white; padding: 0 4px; border-radius: 4px; font-size: 9px;">${activeAssigned.length} Active</span>` : ''}
              </div>
            </div>
            <div style="width: 3px; height: 12px; background: ${borderGlow}; margin-top: -1px;"></div>
            <div style="position: relative; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; margin-top: -1px;">
              ${isOnDuty ? `<div style="position: absolute; inset: -4px; border-radius: 50%; background: ${borderGlow}; opacity: 0.6; animation: pulse 1.5s infinite;"></div>` : ''}
              <div style="position: relative; width: 16px; height: 16px; border-radius: 50%; background: ${borderGlow}; border: 2.5px solid white; box-shadow: 0 0 10px ${borderGlow};"></div>
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          className: `admin-helper-marker-${helper.uid}`,
          html: markerHtml,
          iconSize: [180, 75],
          iconAnchor: [90, 75],
          popupAnchor: [0, -75],
        });

        let existingMarker = markersRef.current.get(helper.uid);
        if (existingMarker) {
          existingMarker.setLatLng([displayLat, displayLng]);
          existingMarker.setIcon(customIcon);
        } else {
          if (isCancelled || !isMapAlive(map)) return;
          existingMarker = L.marker([displayLat, displayLng], { icon: customIcon }).addTo(map);
          setupMarkerHoverElevation(existingMarker);
          existingMarker.on('click', () => {
            setSelectedHelperId(helper.uid);
          });
          markersRef.current.set(helper.uid, existingMarker);
        }

        // Draw active order road route lines if helper has active order
        if (isOnDuty) {
          activeAssigned.forEach((order) => {
            const destLat = order.deliveryLocation?.lat;
            const destLng = order.deliveryLocation?.lng;

            if (typeof destLat === 'number' && typeof destLng === 'number') {
              fetchRoadRoute([{ lat, lng }, { lat: destLat, lng: destLng }]).then((routeCoords) => {
                if (isCancelled || !isMapAlive(map)) return;
                const polyline = L.polyline(routeCoords, {
                  color: isDedicated ? '#f59e0b' : '#38bdf8',
                  weight: 3.5,
                  opacity: 0.85,
                  dashArray: '6, 6',
                }).addTo(map);
                routePolylinesRef.current.push(polyline);
              });
            }
          });
        }
      }

      // Initial auto-fit once
      if (!hasFittedBoundsRef.current && (allPoints.length > 0 || (allowedDeliveryAreas && allowedDeliveryAreas.length > 0))) {
        hasFittedBoundsRef.current = true;
        const boundsPoints = [...allPoints];
        allowedDeliveryAreas.forEach((a) => {
          a.coordinates?.forEach((pt) => boundsPoints.push([pt.lat, pt.lng]));
        });
        if (boundsPoints.length > 0) {
          try {
            map.fitBounds(boundsPoints, { padding: [60, 60], maxZoom: 15 });
          } catch (e) {}
        }
      }
    };

    renderHelpersOnMap();

    return () => {
      isCancelled = true;
    };
  }, [mapReady, filteredHelpers, orders, allowedDeliveryAreas]);

  const handleRecenter = () => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    if (!isMapAlive(map)) return;

    const allPoints: [number, number][] = [];
    filteredHelpers.forEach((h) => {
      if (typeof h.helperLocation?.lat === 'number' && typeof h.helperLocation?.lng === 'number') {
        allPoints.push([h.helperLocation.lat, h.helperLocation.lng]);
      }
    });
    allowedDeliveryAreas.forEach((a) => {
      a.coordinates?.forEach((pt) => allPoints.push([pt.lat, pt.lng]));
    });

    if (allPoints.length > 0) {
      map.fitBounds(allPoints, { padding: [50, 50], maxZoom: 15 });
    } else {
      map.setView([23.8759, 90.3795], 14);
    }
  };

  const selectedHelper = users.find((u) => u.uid === selectedHelperId);
  const selectedHelperActiveOrders = selectedHelper
    ? orders.filter((o) => o.helperId === selectedHelper.uid && o.status !== 'DELIVERED' && o.status !== 'CANCELED')
    : [];
  const selectedHelperWallet = selectedHelper ? fallbackStore.wallets.get(selectedHelper.uid) : null;

  return (
    <div
      ref={mapContainerRef}
      className={`relative w-full rounded-3xl overflow-hidden border border-gray-200 bg-slate-950 shadow-soft transition-all ${
        isFullscreen ? 'fixed inset-0 z-[99999] rounded-none' : 'h-[650px] min-h-[500px]'
      }`}
    >
      {/* Top Floating Controls Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 pointer-events-none flex flex-wrap items-center justify-between gap-2.5">
        {/* Helper Filter Switchers */}
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-700 shadow-xl flex items-center gap-1 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all shrink-0 ${
              typeFilter === 'ALL'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            All Fleet ({helperUsers.length})
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter('COMMUTER')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shrink-0 ${
              typeFilter === 'COMMUTER'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Bike className="w-3.5 h-3.5 text-indigo-300" />
            <span>Commuter ({commuterCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter('DEDICATED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shrink-0 ${
              typeFilter === 'DEDICATED'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Dedicated ({dedicatedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter('ON_DUTY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shrink-0 ${
              typeFilter === 'ON_DUTY'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-emerald-300" />
            <span>On-Duty ({activeDutyCount})</span>
          </button>
        </div>

        {/* Right Side Map Actions */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Toggle Service Areas Overlay */}
          <button
            type="button"
            onClick={() => setShowServiceAreas((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-extrabold border backdrop-blur-md shadow-xl transition-all ${
              showServiceAreas
                ? 'bg-emerald-600/90 text-white border-emerald-400'
                : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
            title="সার্ভিস এরিয়া ওভারলে টগল করুন"
          >
            <Square className="w-3.5 h-3.5 text-emerald-300" />
            <span>সার্ভিস এলাকা ({allowedDeliveryAreas.length})</span>
          </button>

          {/* Add Sub-Area Action Button */}
          {onAddArea && (
            <button
              type="button"
              onClick={onAddArea}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-extrabold border border-emerald-400/50 shadow-xl transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>নতুন সাব-এরিয়া ড্র</span>
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-white rounded-2xl border border-slate-700 shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            <Maximize2 className="w-4 h-4 text-slate-200" />
          </button>
        </div>
      </div>

      {/* Bottom Center Bar */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={handleRecenter}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-white rounded-2xl text-xs font-bold border border-slate-700 shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Navigation className="w-3.5 h-3.5 text-cyan-400" />
          <span>কেন্দ্রবিন্দু (All Fleet)</span>
        </button>

        <div className="hidden sm:flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-700 shadow-xl">
          <Globe className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-xs font-extrabold text-white">
            Real Earth Map (Google Satellite)
          </span>
        </div>
      </div>

      {/* Selected Helper Floating Drawer */}
      {selectedHelper && (
        <div className="absolute bottom-4 left-4 right-4 z-20 bg-slate-900/95 backdrop-blur-md p-4 rounded-3xl border border-slate-700 shadow-2xl animate-in slide-in-from-bottom duration-200 text-white max-w-xl mx-auto">
          <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-purple-600/30 border border-purple-500/50 flex items-center justify-center font-extrabold text-purple-300 text-xs">
                {selectedHelper.displayName?.charAt(0) || 'H'}
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
                  <span>{selectedHelper.displayName}</span>
                  {selectedHelper.isEduVerified && (
                    <span className="text-[9px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded-full">
                      Edu Verified
                    </span>
                  )}
                </h4>
                <p className="text-xs text-slate-400 font-medium">
                  {selectedHelper.email} {selectedHelper.alternativePhone ? `• ${selectedHelper.alternativePhone}` : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedHelperId(null)}
              className="text-[11px] font-bold text-slate-400 hover:text-white px-2.5 py-1 rounded-xl bg-slate-800"
            >
              বন্ধ করুন
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
            <div className="bg-slate-800/80 p-2.5 rounded-2xl border border-slate-700/80">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Helper Type</span>
              {onUpdateHelperType ? (
                <select
                  value={selectedHelper.helperType || 'commuter'}
                  onChange={async (e) => {
                    const newType = e.target.value as 'commuter' | 'dedicated';
                    await onUpdateHelperType(selectedHelper.uid, newType);
                  }}
                  className="mt-1 bg-slate-900 text-amber-300 font-extrabold text-xs rounded-lg px-2 py-1 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 w-full"
                >
                  <option value="commuter">🚲 Commuter Helper</option>
                  <option value="dedicated">⚡ Dedicated Rider</option>
                </select>
              ) : (
                <span className="font-extrabold text-amber-300">
                  {selectedHelper.helperType === 'dedicated' ? '⚡ Dedicated Rider' : '🚲 Commuter Helper'}
                </span>
              )}
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-2xl border border-slate-700/80">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Active Orders</span>
              <span className="font-extrabold text-emerald-400 text-sm">
                {selectedHelperActiveOrders.length} active
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-2xl border border-slate-700/80">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Earned</span>
              <span className="font-extrabold text-indigo-300 text-sm">
                ৳{selectedHelperWallet?.totalEarned || 0}
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-2xl border border-slate-700/80">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Assigned Areas</span>
              <span className="font-extrabold text-purple-300 text-xs">
                {selectedHelper.serveAllAreas !== false
                  ? 'All Areas'
                  : `${selectedHelper.assignedAreaIds?.length || 0} zones`}
              </span>
            </div>
          </div>

          {/* Active Orders List if any */}
          {selectedHelperActiveOrders.length > 0 && (
            <div className="mb-3 bg-slate-800/60 p-2.5 rounded-2xl border border-slate-700">
              <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider block mb-1.5">
                Current Active Deliveries ({selectedHelperActiveOrders.length}):
              </span>
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                {selectedHelperActiveOrders.map((ord) => (
                  <div key={ord.id} className="flex items-center justify-between text-xs bg-slate-900/80 p-2 rounded-xl border border-slate-700/60">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="font-bold text-slate-200 line-clamp-1">{ord.title || ord.service}</span>
                    </div>
                    <span className="font-extrabold text-emerald-400 text-[11px]">৳{ord.deliveryFee}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectUser(selectedHelper.uid)}
              className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-700"
            >
              View User Profile
            </button>
            <button
              type="button"
              onClick={() => onSelectHelper({ id: selectedHelper.uid, name: selectedHelper.displayName })}
              className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-extrabold transition-all shadow-md"
            >
              View Performance History
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
