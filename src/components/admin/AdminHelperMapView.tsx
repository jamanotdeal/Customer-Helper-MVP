'use client';

import React, { useEffect, useRef, useState } from 'react';
import { UserProfile, Order, HelperApplication, LocationData } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { fetchRoadRoute } from '@/lib/routeUtils';
import { getElapsedTime } from '@/lib/timeUtils';
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
} from 'lucide-react';
import { DraggableTabsContainer } from './DraggableTabsContainer';
import { usePullToRefreshLock } from '@/hooks/usePullToRefreshLock';

interface AdminHelperMapViewProps {
  users: UserProfile[];
  orders: Order[];
  applications: HelperApplication[];
  onSelectHelper: (helper: { id: string; name: string }) => void;
  onSelectUser: (userId: string) => void;
  onUpdateHelperType?: (userId: string, newType: 'commuter' | 'dedicated') => Promise<void>;
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
  onSelectHelper,
  onSelectUser,
  onUpdateHelperType,
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
  const [selectedHelperId, setSelectedHelperId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'COMMUTER' | 'DEDICATED' | 'ON_DUTY'>('ALL');
  const [timerTick, setTimerTick] = useState(0);

  // Live timer tick every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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




      for (const helper of filteredHelpers) {
        const isDedicated = helper.helperType === 'dedicated';
        const activeAssigned = orders.filter(
          (o) => o.helperId === helper.uid && o.status !== 'DELIVERED' && o.status !== 'CANCELED'
        );
        const isOnDuty = activeAssigned.length > 0;

        // Coordinates resolution: explicit location -> active order location -> fallback offset
        let lat = helper.helperLocation?.lat;
        let lng = helper.helperLocation?.lng;

        if (typeof lat !== 'number' || typeof lng !== 'number') {
          if (isOnDuty && activeAssigned[0].deliveryLocation?.lat && activeAssigned[0].deliveryLocation?.lng) {
            lat = activeAssigned[0].deliveryLocation.lat;
            lng = activeAssigned[0].deliveryLocation.lng;
          } else {
            // Default center offset near campus/Dhaka
            lat = 23.8759 + getDeterministicOffset(helper.uid, 1);
            lng = 90.3795 + getDeterministicOffset(helper.uid, 2);
          }
        }

        allPoints.push([lat, lng]);

        // Theme colors
        // Dedicated Helper: Amber/Gold/Emerald gradient with ⚡ Rider badge
        // Commuter Helper: Purple/Indigo gradient with 🚲 Commuter badge
        const badgeBg = isDedicated
          ? 'linear-gradient(135deg, #f59e0b, #d97706)'
          : 'linear-gradient(135deg, #6366f1, #4f46e5)';
        const borderGlow = isDedicated ? '#f59e0b' : '#818cf8';
        const typeLabel = isDedicated ? '⚡ Dedicated Rider' : '🚲 Commuter Helper';

        const markerHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; width: 170px; height: 75px;">
            <div style="background: ${badgeBg}; color: white; padding: 5px 10px; border-radius: 14px; border: 2px solid white; box-shadow: 0 8px 20px rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; width: 155px; text-align: center;">
              <div style="font-size: 11px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; line-height: 1.2;">
                ${helper.displayName || 'Helper'}
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
          iconSize: [170, 75],
          iconAnchor: [85, 75],
          popupAnchor: [0, -75],
        });

        let existingMarker = markersRef.current.get(helper.uid);
        if (existingMarker) {
          existingMarker.setLatLng([lat, lng]);
          existingMarker.setIcon(customIcon);
        } else {
          if (isCancelled || !isMapAlive(map)) return;
          existingMarker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
          existingMarker.on('click', () => {
            setSelectedHelperId(helper.uid);
          });
          markersRef.current.get(helper.uid) || markersRef.current.set(helper.uid, existingMarker);
        }

        // Draw road routing line if helper has active assigned orders
        if (isOnDuty) {
          for (const order of activeAssigned) {
            if (order.deliveryLocation?.lat && order.deliveryLocation?.lng) {
              const destLat = order.deliveryLocation.lat;
              const destLng = order.deliveryLocation.lng;

              let routeCoords = await fetchRoadRoute([
                { lat, lng },
                { lat: destLat, lng: destLng },
              ]);

              if (isCancelled || !isMapAlive(map)) return;

              if (routeCoords.length > 0) {
                const roadPolyline = L.polyline(routeCoords, {
                  color: isDedicated ? '#f59e0b' : '#6366f1',
                  weight: 4,
                  opacity: 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                  dashArray: '8, 8',
                }).addTo(map);

                const destMarker = L.circleMarker([destLat, destLng], {
                  radius: 7,
                  color: '#ffffff',
                  weight: 2,
                  fillColor: isDedicated ? '#f59e0b' : '#6366f1',
                  fillOpacity: 0.9,
                }).addTo(map);

                routePolylinesRef.current.push(roadPolyline, destMarker);
              }
            }
          }
        }
      }

      // Auto-fit bounds on initial load
      if (!hasFittedBoundsRef.current && allPoints.length > 0 && isMapAlive(map)) {
        if (allPoints.length > 1) {
          map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50] });
        } else {
          map.setView(allPoints[0], 14);
        }
        hasFittedBoundsRef.current = true;
      }
    };

    renderHelpersOnMap();

    return () => {
      isCancelled = true;
    };
  }, [filteredHelpers, orders, mapReady, timerTick]);

  // Recenter map button handler
  const handleRecenter = async () => {
    if (!isMapAlive(mapInstanceRef.current)) return;
    const L = await import('leaflet');
    const points: [number, number][] = [];

    filteredHelpers.forEach((h) => {
      if (h.helperLocation?.lat && h.helperLocation?.lng) {
        points.push([h.helperLocation.lat, h.helperLocation.lng]);
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

  const selectedHelper = filteredHelpers.find((h) => h.uid === selectedHelperId);
  const selectedHelperWallet = selectedHelper ? fallbackStore.getHelperWallet(selectedHelper.uid) : null;
  const selectedHelperActiveOrders = selectedHelper
    ? orders.filter((o) => o.helperId === selectedHelper.uid && o.status !== 'DELIVERED' && o.status !== 'CANCELED')
    : [];

  return (
    <div
      className={`relative w-full bg-slate-950 transition-all duration-300 flex flex-col ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] h-screen w-screen rounded-none border-none shadow-none'
          : 'h-[680px] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden'
      }`}
    >
      {/* Top Filter & Controls Overlay */}
      <div className="absolute top-4 left-4 right-4 z-20 pointer-events-auto flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 backdrop-blur-md p-2.5 rounded-2xl border border-slate-800 shadow-2xl">
        {/* Filter Buttons */}
        <DraggableTabsContainer
          showScrollButtons={false}
          containerClassName="bg-transparent border-none p-0"
          className="bg-transparent border-none p-0 gap-1.5"
          activeKey={typeFilter}
        >
          <button
            type="button"
            onClick={() => setTypeFilter('ALL')}
            data-active={typeFilter === 'ALL'}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shrink-0 ${
              typeFilter === 'ALL'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-purple-200 shrink-0" />
            <span>সকল হেলপার ({helperUsers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter('COMMUTER')}
            data-active={typeFilter === 'COMMUTER'}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shrink-0 ${
              typeFilter === 'COMMUTER'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Bike className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
            <span>🚲 Commuter ({commuterCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter('DEDICATED')}
            data-active={typeFilter === 'DEDICATED'}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shrink-0 ${
              typeFilter === 'DEDICATED'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>⚡ Dedicated ({dedicatedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter('ON_DUTY')}
            data-active={typeFilter === 'ON_DUTY'}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shrink-0 ${
              typeFilter === 'ON_DUTY'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>🔥 On Active Duty ({activeDutyCount})</span>
          </button>
        </DraggableTabsContainer>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              isFullscreen
                ? 'bg-red-600 hover:bg-red-700 text-white border border-red-400'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
            }`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
          >
            {isFullscreen ? (
              <>
                <X className="w-3.5 h-3.5 text-white" />
                <span className="hidden sm:inline">ফুল স্ক্রিন বন্ধ করুন</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">ফুল স্ক্রিন</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Leaflet Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Bottom Left Control: Re-center & Live Earth Badge */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={handleRecenter}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-white rounded-2xl text-xs font-bold border border-slate-700 shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Navigation className="w-3.5 h-3.5 text-cyan-400" />
          <span>কেন্দ্রবিন্দু (All Helpers)</span>
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
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Wallet Balance</span>
              <span className="font-extrabold text-purple-300 text-sm">
                ৳{selectedHelperWallet?.balance || 0}
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
