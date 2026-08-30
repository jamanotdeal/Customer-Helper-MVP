'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Order, LocationData } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { getOrderMinDistanceKm, calculateDistanceKm } from '@/lib/pricing';
import { getElapsedTime } from '@/lib/timeUtils';
import { fetchRoadRoute } from '@/lib/routeUtils';
import { HelperActiveOrderView } from './HelperActiveOrderView';
import { useModal } from './CustomModal';
import { Compass, Map as MapIcon, Layers, Clock, MapPin, Bike, Navigation, RefreshCw, AlertTriangle } from 'lucide-react';
import { usePullToRefreshLock } from '@/hooks/usePullToRefreshLock';

export const ExploreHelperView: React.FC = () => {
  // Leaflet consumes the drag itself, so the native pull gesture must be
  // disarmed while this map is on screen.
  usePullToRefreshLock();
  const { user } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [viewMode, setViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [unacceptedOrders, setUnacceptedOrders] = useState<Order[]>([]);
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [timerTick, setTimerTick] = useState(0);
  const [mapVersion, setMapVersion] = useState(0);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const routePolylinesRef = useRef<any[]>([]);
  const hasFittedBoundsRef = useRef(false);

  const activeOrderLimit = fallbackStore.pricingSettings.helperActiveOrderLimit ?? 5;

  // Live timer tick for real-time countdown / elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync unaccepted orders (PENDING status, no helperId)
  useEffect(() => {
    const syncOrders = () => {
      if (user) {
        const all = Array.from(fallbackStore.orders.values());
        
        // Unaccepted (pending, unassigned) orders
        const pending = all.filter((o) => o.status === 'PENDING' && !o.helperId);
        
        // Active orders count for the helper
        const activeCount = all.filter(
          (o) =>
            o.helperId === user.uid &&
            ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED'].includes(o.status)
        ).length;

        // Sort: nearby to far + oldest to recent
        const sorted = [...pending].sort((a, b) => {
          if (!user.helperLocation?.lat || !user.helperLocation?.lng) {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }
          const distA = getOrderMinDistanceKm(user.helperLocation, a) ?? Infinity;
          const distB = getOrderMinDistanceKm(user.helperLocation, b) ?? Infinity;

          if (Math.abs(distA - distB) > 0.01) {
            return distA - distB;
          }
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

        setUnacceptedOrders(sorted);
        setActiveOrdersCount(activeCount);
      }
    };

    syncOrders();
    const unsub = fallbackStore.subscribe(syncOrders);
    return () => unsub();
  }, [user]);

  const handleAcceptOrder = async (orderId: string) => {
    if (!user) return;
    
    // Check if the order is still pending/unassigned
    const freshOrder = fallbackStore.orders.get(orderId);
    if (!freshOrder || freshOrder.status !== 'PENDING' || freshOrder.helperId) {
      await showAlert(
        'অর্ডারটি ইতিমধ্যে গৃহীত',
        'অর্ডারটি ইতিমধ্যে অন্য একজন হেলপার গ্রহণ করেছেন।',
        'warning'
      );
      return;
    }

    if (activeOrdersCount >= activeOrderLimit) {
      await showAlert(
        'অর্ডার সীমা পূর্ণ',
        `আপনি সর্বোচ্চ ${activeOrderLimit}টি অ্যাক্টিভ অর্ডার সম্পন্ন করার পর নতুন অর্ডার নিতে পারবেন।`,
        'warning'
      );
      return;
    }

    const confirmed = await showConfirm(
      'রিকুয়েস্ট গ্রহণ করুন',
      'আপনি কি এই রিকুয়েস্টটি গ্রহণ করতে চান? গ্রহণ করার পর আপনি অর্ডারটি ডেলিভারি করতে বাধ্য থাকবেন।',
      'হ্যাঁ, Accept করুন',
      'বাতিল'
    );
    if (!confirmed) return;

    // Double-check right before updating to handle any confirmation delay
    const doubleCheck = fallbackStore.orders.get(orderId);
    if (!doubleCheck || doubleCheck.status !== 'PENDING' || doubleCheck.helperId) {
      await showAlert(
        'অর্ডারটি ইতিমধ্যে গৃহীত',
        'অর্ডারটি ইতিমধ্যে অন্য একজন হেলপার গ্রহণ করেছেন।',
        'warning'
      );
      return;
    }

    fallbackStore.updateOrder(orderId, (o) => ({
      ...o,
      status: 'ACCEPTED',
      helperId: user.uid,
      helperName: user.displayName,
      helperPhone: user.alternativePhone,
      acceptedAt: new Date().toISOString(),
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: 'ACCEPTED',
          timestamp: new Date().toISOString(),
          actor: `Helper (${user.displayName})`,
          note: 'Accepted request via Explore',
        },
      ],
    }));

    setSelectedOrderId(orderId);
  };

  // Map elements rendering
  const orderIdsStr = unacceptedOrders.map((o) => o.id).join(',');

  useEffect(() => {
    if (viewMode !== 'MAP' || !mapContainerRef.current) {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('[Leaflet] cleanup error:', e);
        }
        mapInstanceRef.current = null;
        hasFittedBoundsRef.current = false;
      }
      return;
    }

    let isCancelled = false;

    const initMapAndRender = async () => {
      const L = await import('leaflet');
      if (isCancelled) return;

      // Inject Leaflet CSS if not present
      if (!document.getElementById('leaflet-css-picker')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css-picker';
        link.rel = 'stylesheet';
        link.href = '/vendor/leaflet/leaflet.css';
        document.head.appendChild(link);
      }

      const container = mapContainerRef.current;
      if (!container) return;

      const helperLat = user?.helperLocation?.lat || 23.8759;
      const helperLng = user?.helperLocation?.lng || 90.3795;

      let map = mapInstanceRef.current;
      if (!map) {
        map = L.map(container).setView([helperLat, helperLng], 14);
        mapInstanceRef.current = map;

        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps Satellite',
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        }).addTo(map);

        // Render Helper Marker (only once on load)
        const helperIconHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: 70px; height: 80px;">
            <div style="position: relative; width: 44px; height: 44px;">
              <div style="position: absolute; inset: -4px; border-radius: 50%; background: rgba(16, 185, 129, 0.4); animation: pulse 1.5s infinite;"></div>
              <div style="relative; width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #10b981, #059669); border: 3px solid white; box-shadow: 0 6px 20px rgba(16,185,129,0.8); display: flex; flex-direction: column; align-items: center; justify-content: center; color: white;">
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
          </div>
        `;

        L.marker([helperLat, helperLng], {
          icon: L.divIcon({
            className: 'helper-marker',
            html: helperIconHtml,
            iconSize: [70, 80],
            iconAnchor: [35, 80],
          })
        }).addTo(map).bindPopup('<b>আপনার বর্তমান অবস্থান (Me)</b>');
      }

      // Clear existing markers from previous draw
      markersRef.current.forEach((m) => {
        try { m.remove(); } catch (e) {}
      });
      markersRef.current.clear();

      // Clear existing polylines
      routePolylinesRef.current.forEach((p) => {
        try { p.remove(); } catch (e) {}
      });
      routePolylinesRef.current = [];

      const allBoundsPoints: [number, number][] = [[helperLat, helperLng]];

      for (const order of unacceptedOrders) {
        const pickupLat = order.pickupLocation?.lat || helperLat + 0.002;
        const pickupLng = order.pickupLocation?.lng || helperLng + 0.002;
        const deliveryLat = order.deliveryLocation.lat || helperLat - 0.002;
        const deliveryLng = order.deliveryLocation.lng || helperLng - 0.002;

        allBoundsPoints.push([pickupLat, pickupLng]);
        allBoundsPoints.push([deliveryLat, deliveryLng]);

        const orderTitle = order.service || order.title || 'errand';
        const elapsedStr = getElapsedTime(order.createdAt);

        // Pickup: Yellow point block showing "Order type and timers"
        const pickupIconHtml = `
          <div style="background-color: #fef08a; color: #854d0e; padding: 6px 10px; border-radius: 12px; border: 2px solid #eab308; box-shadow: 0 4px 10px rgba(234,179,8,0.5); font-weight: 850; font-size: 11px; text-align: center; white-space: nowrap; cursor: pointer;">
            <div>${orderTitle}</div>
            <div style="color: #ca8a04; font-size: 9.5px; font-weight: 900; margin-top: 1px;">⏱️ ${elapsedStr}</div>
          </div>
        `;

        const pickupMarker = L.marker([pickupLat, pickupLng], {
          icon: L.divIcon({
            className: `pickup-marker-${order.id}`,
            html: pickupIconHtml,
            iconSize: [140, 50],
            iconAnchor: [70, 25],
          })
        }).addTo(map);

        pickupMarker.on('click', () => {
          setSelectedOrderId(order.id);
        });

        markersRef.current.set(`pickup-${order.id}`, pickupMarker);

        // Delivery: Green circle with delivery icon
        const deliveryIconHtml = `
          <div style="width: 30px; height: 30px; border-radius: 50%; background-color: #22c55e; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(34,197,94,0.5); display: flex; align-items: center; justify-content: center; color: white;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 10 16 12 10 10 4 12"></polyline>
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
            </svg>
          </div>
        `;

        const deliveryMarker = L.circleMarker([deliveryLat, deliveryLng], {
          radius: 15,
          fillColor: '#22c55e',
          fillOpacity: 0.9,
          color: '#ffffff',
          weight: 2,
        }).addTo(map);

        // We also want to support custom delivery icon inside circle marker
        const deliveryIconMarker = L.marker([deliveryLat, deliveryLng], {
          icon: L.divIcon({
            className: `delivery-icon-${order.id}`,
            html: deliveryIconHtml,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          })
        }).addTo(map);

        markersRef.current.set(`delivery-${order.id}`, deliveryMarker);
        markersRef.current.set(`delivery-icon-${order.id}`, deliveryIconMarker);

        // Fetch & Draw Road Route (green line from pickup to delivery)
        const waypoints = [
          { lat: pickupLat, lng: pickupLng },
          { lat: deliveryLat, lng: deliveryLng },
        ];
        
        fetchRoadRoute(waypoints).then((coords) => {
          if (isCancelled || !mapInstanceRef.current) return;
          if (coords.length > 0) {
            const glowPoly = L.polyline(coords, {
              color: '#15803d',
              weight: 8,
              opacity: 0.35,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map);

            const roadPoly = L.polyline(coords, {
              color: '#22c55e',
              weight: 4,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map);

            routePolylinesRef.current.push(glowPoly, roadPoly);
          }
        });
      }

      if (allBoundsPoints.length > 1 && !hasFittedBoundsRef.current) {
        map.fitBounds(L.latLngBounds(allBoundsPoints), { padding: [50, 50] });
        hasFittedBoundsRef.current = true;
      }
    };

    initMapAndRender();

    return () => {
      isCancelled = true;
    };
  }, [viewMode, orderIdsStr, mapVersion]);

  // Handle map cleanup only when component unmounts
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (e) {}
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const handleRecenter = () => {
    if (!mapInstanceRef.current || !user?.helperLocation) return;
    mapInstanceRef.current.setView([user.helperLocation.lat, user.helperLocation.lng], 15);
  };

  if (selectedOrderId) {
    const targetOrder = fallbackStore.orders.get(selectedOrderId);
    if (targetOrder) {
      // Check if order is already accepted by someone else
      if (targetOrder.helperId && targetOrder.helperId !== user?.uid) {
        return (
          <div className="w-full bg-white min-h-screen flex flex-col items-center justify-center p-6 text-center">
            <AlertTriangle className="w-16 h-16 text-amber-500 mb-4 animate-bounce" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">অর্ডারটি ইতিমধ্যে অন্য একজন হেলপার গ্রহণ করেছেন</h2>
            <p className="text-gray-500 text-sm mb-6">This order is already accepted by another helper.</p>
            <button
              onClick={() => setSelectedOrderId(null)}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold transition-all active:scale-95 shadow-md"
            >
              Back to Explore
            </button>
          </div>
        );
      }
      return (
        <HelperActiveOrderView
          order={targetOrder}
          helperLocation={user?.helperLocation}
          onBack={() => setSelectedOrderId(null)}
          onAccept={targetOrder.status === 'PENDING' ? handleAcceptOrder : undefined}
          activeOrdersCount={activeOrdersCount}
          activeOrderLimit={activeOrderLimit}
        />
      );
    }
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Header / Mode Switcher */}
      <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-gray-100 shadow-soft">
        <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
          <Compass className="w-4 h-4 text-emerald-600 animate-spin-slow" />
          <span>Explore Requests ({unacceptedOrders.length})</span>
        </span>
        <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              viewMode === 'LIST'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Normal View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('MAP')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              viewMode === 'MAP'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Map View</span>
          </button>
        </div>
      </div>

      {/* View Content */}
      {viewMode === 'LIST' ? (
        <div className="space-y-3">
          {unacceptedOrders.length === 0 ? (
            <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <h4 className="font-bold text-gray-900 text-sm mb-1">
                এখন আশেপাশে কোনো নতুন request নেই
              </h4>
              <p className="text-xs text-gray-500">
                নতুন রিকুয়েস্ট এলে নোটিফিকেশন পাবেন।
              </p>
            </div>
          ) : (
            unacceptedOrders.map((order) => {
              const distanceKm = getOrderMinDistanceKm(user?.helperLocation, order);
              const elapsed = getElapsedTime(order.createdAt);
              return (
                <div
                  key={order.id}
                  className="rounded-3xl border border-gray-100 p-4 bg-white shadow-soft hover:shadow-md transition-all duration-300 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="bg-slate-900 text-white font-black font-mono text-[10px] px-2 py-0.5 rounded-md">
                      #{order.id}
                    </span>
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      {distanceKm !== null && (
                        <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5 text-indigo-600" />
                          <span>{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away</span>
                        </span>
                      )}
                      <span className="text-xs font-black text-red-800 bg-red-50 px-2.5 py-1 rounded-lg inline-flex items-center space-x-1 border border-red-100">
                        <Clock className="w-4 h-4 text-red-600" />
                        <span className="font-mono">{elapsed}</span>
                      </span>
                    </div>
                  </div>

                  <h4 className="font-extrabold text-gray-900 text-sm leading-snug">
                    {order.service || order.title || 'Errand'}
                  </h4>

                  <div className="pt-1 flex space-x-2">
                    <button
                      onClick={() => setSelectedOrderId(order.id)}
                      className="flex-1 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-extrabold text-xs transition-all"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => handleAcceptOrder(order.id)}
                      disabled={activeOrdersCount >= activeOrderLimit}
                      className={`flex-1 py-2.5 rounded-2xl font-extrabold text-xs shadow-md transition-all ${
                        activeOrdersCount >= activeOrderLimit
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-98'
                      }`}
                    >
                      {activeOrdersCount >= activeOrderLimit ? `Limit (${activeOrderLimit})` : 'Accept Request'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="relative w-full h-[550px] rounded-3xl border border-gray-100 shadow-2xl overflow-hidden bg-slate-900">
          <div ref={mapContainerRef} className="w-full h-full z-10" />
          <div className="absolute bottom-4 left-4 z-[10001] flex items-center gap-2">
            <button
              type="button"
              onClick={handleRecenter}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-white rounded-2xl text-xs font-bold border border-slate-700/80 shadow-xl transition-all active:scale-95"
            >
              <Navigation className="w-3.5 h-3.5 text-cyan-400" />
              <span>কেন্দ্রবিন্দু</span>
            </button>
            <button
              type="button"
              onClick={() => setMapVersion((prev) => prev + 1)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-white rounded-2xl text-xs font-bold border border-slate-700/80 shadow-xl transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Reload</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
