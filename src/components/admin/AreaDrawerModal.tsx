'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AllowedAreaPolygon, UserProfile } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import {
  Globe,
  MapPin,
  Plus,
  Trash2,
  Check,
  X,
  Search,
  Users,
  Square,
  Pentagon,
  RotateCcw,
  CheckSquare,
  SquareDashedBottomCode,
  ShieldCheck,
  Bike,
  Info,
  Maximize2,
  Minimize2,
  Sparkles,
} from 'lucide-react';
import { useModal } from '../CustomModal';

interface AreaDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveArea: (area: AllowedAreaPolygon, assignedHelpers?: string[], allHelpers?: boolean) => void;
  areaToEdit?: AllowedAreaPolygon | null;
  existingAreas?: AllowedAreaPolygon[];
  helpers?: UserProfile[];
}

export const AreaDrawerModal: React.FC<AreaDrawerModalProps> = ({
  isOpen,
  onClose,
  onSaveArea,
  areaToEdit,
  existingAreas = [],
  helpers: propHelpers,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const polygonLayerRef = useRef<any>(null);
  const maskLayerRef = useRef<any>(null);
  const otherPolygonsRef = useRef<any[]>([]);
  const markersRef = useRef<any[]>([]);

  const [drawMode, setDrawMode] = useState<'RECTANGLE' | 'POLYGON'>('RECTANGLE');
  const [rectangleFirstCorner, setRectangleFirstCorner] = useState<{ lat: number; lng: number } | null>(null);

  const [areaName, setAreaName] = useState('');
  const [countryName, setCountryName] = useState('Bangladesh');
  const [points, setPoints] = useState<{ lat: number; lng: number }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Helper Assignment State
  const [allHelpersAllowed, setAllHelpersAllowed] = useState(true);
  const [selectedHelperIds, setSelectedHelperIds] = useState<string[]>([]);
  const [helperSearch, setHelperSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'MAP' | 'HELPERS'>('MAP');

  const { showAlert } = useModal();

  // All eligible helpers
  const allHelpers: UserProfile[] = (
    propHelpers && propHelpers.length > 0
      ? propHelpers
      : Array.from(fallbackStore.users.values())
  ).filter((u) => u.isHelper || u.role === 'helper');

  // Invalidate map size on fullscreen toggle
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const timer = setTimeout(() => {
      try {
        mapInstanceRef.current.invalidateSize();
      } catch (e) {}
    }, 150);
    return () => clearTimeout(timer);
  }, [isFullscreen, activeTab]);

  // Initialize state when modal opens or areaToEdit changes
  useEffect(() => {
    if (!isOpen) return;

    if (areaToEdit) {
      setAreaName(areaToEdit.name || '');
      setCountryName(areaToEdit.country || 'Bangladesh');
      setPoints(areaToEdit.coordinates || []);
      const isAll = areaToEdit.allHelpersAssigned !== false && (!areaToEdit.assignedHelperIds || areaToEdit.assignedHelperIds.length === 0);
      setAllHelpersAllowed(areaToEdit.allHelpersAssigned ?? isAll);
      setSelectedHelperIds(areaToEdit.assignedHelperIds || []);
      setDrawMode(areaToEdit.coordinates && areaToEdit.coordinates.length === 4 ? 'RECTANGLE' : 'POLYGON');
    } else {
      setAreaName('');
      setCountryName('Bangladesh');
      setPoints([]);
      setAllHelpersAllowed(true);
      setSelectedHelperIds([]);
      setDrawMode('RECTANGLE');
    }
    setRectangleFirstCorner(null);
    setActiveTab('MAP');
    setIsFullscreen(false);

    let isMounted = true;

    const initMap = async () => {
      try {
        if (!mapContainerRef.current) return;

        const L = await import('leaflet');
        if (!isMounted) return;

        if (!document.getElementById('leaflet-css-area-drawer')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-area-drawer';
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

        const initialLat = areaToEdit?.coordinates?.[0]?.lat || 23.8759; // Default Uttara
        const initialLng = areaToEdit?.coordinates?.[0]?.lng || 90.3795;

        const map = L.map(mapContainerRef.current, {
          zoomControl: true,
        }).setView([initialLat, initialLng], 14);

        mapInstanceRef.current = map;

        // Satellite/Hybrid layer
        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps',
          maxZoom: 20,
        }).addTo(map);

        // Draw existing other areas in subtle dashed outlines for visual reference
        otherPolygonsRef.current.forEach((p) => {
          try { map.removeLayer(p); } catch (e) {}
        });
        otherPolygonsRef.current = [];

        existingAreas
          .filter((a) => !areaToEdit || a.id !== areaToEdit.id)
          .forEach((otherArea) => {
            if (otherArea.coordinates && otherArea.coordinates.length >= 3) {
              const otherLatLngs = otherArea.coordinates.map((p) => [p.lat, p.lng] as [number, number]);
              const otherPoly = L.polygon(otherLatLngs, {
                color: '#eab308',
                fillColor: '#fde047',
                fillOpacity: 0.08,
                weight: 2.5,
                dashArray: '5, 4',
              }).addTo(map);
              otherPoly.bindTooltip(`📍 ${otherArea.name}`, { permanent: false, direction: 'center' });
              otherPolygonsRef.current.push(otherPoly);
            }
          });

        // Map Click Listener
        map.on('click', (e: any) => {
          const clickLat = e.latlng.lat;
          const clickLng = e.latlng.lng;

          // In RECTANGLE mode: Click 1 sets Corner 1, Click 2 sets Corner 2 and completes the 4-point rectangle
          if (drawModeRef.current === 'RECTANGLE') {
            const first = rectCornerRef.current;
            if (!first) {
              setRectangleFirstCorner({ lat: clickLat, lng: clickLng });
              setPoints([{ lat: clickLat, lng: clickLng }]);
            } else {
              // Calculate 4 corners of rectangle
              const minLat = Math.min(first.lat, clickLat);
              const maxLat = Math.max(first.lat, clickLat);
              const minLng = Math.min(first.lng, clickLng);
              const maxLng = Math.max(first.lng, clickLng);

              const rectPoints = [
                { lat: maxLat, lng: minLng }, // Top-Left
                { lat: maxLat, lng: maxLng }, // Top-Right
                { lat: minLat, lng: maxLng }, // Bottom-Right
                { lat: minLat, lng: minLng }, // Bottom-Left
              ];

              setPoints(rectPoints);
              setRectangleFirstCorner(null);
            }
          } else {
            // In POLYGON mode: Add points vertex by vertex
            setPoints((prev) => [...prev, { lat: clickLat, lng: clickLng }]);
          }
        });
      } catch (err) {
        console.warn('[AreaDrawerModal] Leaflet init error:', err);
      }
    };

    const timer = setTimeout(() => {
      initMap();
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
  }, [isOpen, areaToEdit]);

  // Keep refs for event listeners
  const drawModeRef = useRef(drawMode);
  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);

  const rectCornerRef = useRef(rectangleFirstCorner);
  useEffect(() => { rectCornerRef.current = rectangleFirstCorner; }, [rectangleFirstCorner]);

  // Update polygon overlay, dark outside mask, and vertex markers whenever points change
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    import('leaflet').then((L) => {
      // Clear existing markers
      markersRef.current.forEach((m) => {
        try { map.removeLayer(m); } catch (e) {}
      });
      markersRef.current = [];

      // Clear existing polygon layer
      if (polygonLayerRef.current) {
        try { map.removeLayer(polygonLayerRef.current); } catch (e) {}
        polygonLayerRef.current = null;
      }

      // Clear outside dimming mask layer
      if (maskLayerRef.current) {
        try { map.removeLayer(maskLayerRef.current); } catch (e) {}
        maskLayerRef.current = null;
      }

      if (points.length > 0) {
        // Draw markers for vertices with prominent styling
        points.forEach((pt, idx) => {
          const isCorner = drawMode === 'RECTANGLE' && points.length === 1;
          const marker = L.circleMarker([pt.lat, pt.lng], {
            radius: isCorner ? 9 : 7,
            color: isCorner ? '#d97706' : '#047857',
            fillColor: isCorner ? '#fbbf24' : '#10b981',
            fillOpacity: 1,
            weight: 3.5,
          }).addTo(map);

          if (isCorner) {
            marker.bindTooltip(`📌 Corner 1 (এখন বিপরীত কোণায় ক্লিক করুন)`, {
              permanent: true,
              direction: 'top',
              className: 'bg-amber-950 text-amber-200 text-xs px-2.5 py-1 rounded-xl shadow-xl font-bold border border-amber-500/50',
            });
          } else {
            marker.bindTooltip(`📍 কোণা ${idx + 1}`, { permanent: false });
          }

          markersRef.current.push(marker);
        });

        // If polygon has >= 3 points, apply Spotlight Inverted Dark Mask + Bold Glowing Border
        if (points.length >= 3) {
          const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);

          // Inverted outer world mask bounds: dims everything OUTSIDE the marked area
          const worldBounds: [number, number][] = [
            [85, -180],
            [85, 180],
            [-85, 180],
            [-85, -180],
          ];

          // Dark shade on outside area to make active zone pop prominently
          maskLayerRef.current = L.polygon([worldBounds, latLngs], {
            color: 'transparent',
            fillColor: '#000000',
            fillOpacity: 0.45, // Dim outside lighting
            weight: 0,
            interactive: false,
          }).addTo(map);

          // Active marked service area polygon with strong solid green border
          polygonLayerRef.current = L.polygon(latLngs, {
            color: '#16a34a', // Strong solid green border
            fillColor: '#22c55e',
            fillOpacity: 0.22,
            weight: 5, // Bold solid border
            dashArray: undefined, // Solid line (no dashes)
          }).addTo(map);

          polygonLayerRef.current.bindTooltip(
            `
            <div style="text-align: center; font-family: inherit; font-weight: 900; line-height: 1.3;">
              <div style="color: #064e3b; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                <span>✨</span> <span>${areaName.trim() || 'Marked Service Area'}</span>
              </div>
              <div style="color: #059669; font-size: 10px; font-weight: 800; margin-top: 1px;">
                চিহ্নিত সার্ভিস এলাকা (Active Zone)
              </div>
            </div>
            `,
            {
              permanent: false,
              direction: 'center',
              className: 'bg-white/95 text-emerald-950 px-3 py-1.5 rounded-2xl border-2 border-emerald-400 shadow-xl font-sans',
            }
          );
        } else if (points.length === 2) {
          const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);
          polygonLayerRef.current = L.polyline(latLngs, {
            color: '#10b981',
            weight: 3.5,
            dashArray: '4, 4',
          }).addTo(map);
        }
      }
    });
  }, [points, drawMode, areaName]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !mapInstanceRef.current) return;
    setIsGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=1&accept-language=bn,en`
      );
      if (res.ok) {
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          const data = JSON.parse(text);
          if (data && data.length > 0) {
            const newLat = parseFloat(data[0].lat);
            const newLng = parseFloat(data[0].lon);
            mapInstanceRef.current.setView([newLat, newLng], 15, { animate: true });
          } else {
            showAlert('স্থান পাওয়া যায়নি', 'কাঙ্ক্ষিত স্থান পাওয়া যায়নি।', 'warning');
          }
        }
      }
    } catch (err) {
      console.warn('[AreaDrawerModal] search error:', err);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleUndo = () => {
    setPoints((prev) => prev.slice(0, -1));
    setRectangleFirstCorner(null);
  };

  const handleClear = () => {
    setPoints([]);
    setRectangleFirstCorner(null);
  };

  const toggleHelperSelection = (helperId: string) => {
    setSelectedHelperIds((prev) =>
      prev.includes(helperId) ? prev.filter((id) => id !== helperId) : [...prev, helperId]
    );
  };

  const handleSelectAllHelpers = () => {
    setSelectedHelperIds(allHelpers.map((h) => h.uid));
  };

  const handleDeselectAllHelpers = () => {
    setSelectedHelperIds([]);
  };

  const handleSave = () => {
    if (!areaName.trim()) {
      showAlert('নাম আবশ্যক', 'অনুগ্রহ করে সাব-এরিয়া / এলাকার নাম লিখুন (যেমন: Uttara Sector 18 - Zone A)।', 'warning');
      return;
    }
    if (points.length < 3) {
      showAlert(
        'সীমানা অসম্পূর্ণ',
        drawMode === 'RECTANGLE'
          ? 'ম্যাপে ২টি বিপরীত কোণায় ক্লিক করে আয়তক্ষেত্র (Rectangle) তৈরি করুন।'
          : 'এলাকার সীমানা নির্ধারণের জন্য ম্যাপে অন্তত ৩টি পয়েন্ট ক্লিক করুন।',
        'warning'
      );
      return;
    }

    if (!allHelpersAllowed && selectedHelperIds.length === 0) {
      showAlert(
        'হেলপার নির্বাচন আবশ্যক',
        'আপনি "সকল হেলপার" বন্ধ রেখেছেন কিন্তু কোনো নির্দিষ্ট হেলপার নির্বাচন করেননি। অনুগ্রহ করে অন্তত ১ জন হেলপার নির্বাচন করুন অথবা "সকল হেলপার গ্রহণযোগ্য" চালু করুন।',
        'warning'
      );
      return;
    }

    const area: AllowedAreaPolygon = {
      id: areaToEdit?.id || `area-${Date.now()}`,
      name: areaName.trim(),
      country: countryName.trim() || 'Bangladesh',
      coordinates: points,
      assignedHelperIds: allHelpersAllowed ? [] : selectedHelperIds,
      allHelpersAssigned: allHelpersAllowed,
    };

    onSaveArea(area, selectedHelperIds, allHelpersAllowed);
    onClose();
  };

  const filteredHelpers = allHelpers.filter((h) => {
    if (!helperSearch.trim()) return true;
    const q = helperSearch.toLowerCase();
    return (
      (h.displayName || '').toLowerCase().includes(q) ||
      (h.phoneNumber || '').includes(q) ||
      (h.email || '').toLowerCase().includes(q)
    );
  });

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-xs transition-all ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-4'
      }`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`relative flex flex-col bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${
          isFullscreen
            ? 'w-screen h-screen max-w-none max-h-none rounded-none'
            : 'w-full h-[92dvh] max-h-[920px] max-w-[1020px] rounded-3xl'
        }`}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-white">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-800 shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-gray-900 flex items-center gap-2">
                <span>{areaToEdit ? 'সার্ভিস সাব-এরিয়া ও হেলপার পরিবর্তন' : 'নতুন সার্ভিস সাব-এরিয়া ড্র ও হেলপার নির্ধারণ'}</span>
                {points.length >= 3 && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>Active Highlight</span>
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                ম্যাপে আয়তক্ষেত্র বা পলিগন ড্র করুন (অন্যান্য অংশ স্বয়ংক্রিয়ভাবে ডিম্ব বা কম আলো থাকবে)।
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Fullscreen Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Make Map Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Inputs & Drawing Mode Toolbar */}
        <div className="p-3.5 bg-gray-50 border-b border-gray-100 flex flex-col gap-2.5 shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              placeholder="দেশের নাম (যেমন: Bangladesh)"
              value={countryName}
              onChange={(e) => setCountryName(e.target.value)}
              className="sm:w-1/4 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              placeholder="সাব-এরিয়ার নাম (যেমন: Uttara Sector 18, Block-A, Mirpur DOHS)"
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              className="flex-1 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-extrabold focus:outline-none focus:border-emerald-500 text-gray-900 shadow-xs"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-200/60">
            {/* Draw Mode Switcher */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 text-xs font-extrabold shadow-xs">
              <span className="text-[11px] text-gray-400 px-2 uppercase tracking-wider">ড্র মোড:</span>
              <button
                type="button"
                onClick={() => {
                  setDrawMode('RECTANGLE');
                  setRectangleFirstCorner(null);
                  if (points.length > 0 && points.length !== 4) setPoints([]);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                  drawMode === 'RECTANGLE'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Square className="w-3.5 h-3.5" />
                <span>📐 Rectangle (আয়তক্ষেত্র)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawMode('POLYGON');
                  setRectangleFirstCorner(null);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                  drawMode === 'POLYGON'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Pentagon className="w-3.5 h-3.5" />
                <span>✏️ Freehand Polygon</span>
              </button>
            </div>

            {/* View Tab Switcher */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 text-xs font-extrabold shadow-xs">
              <button
                type="button"
                onClick={() => setActiveTab('MAP')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                  activeTab === 'MAP'
                    ? 'bg-purple-950 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>ম্যাপ বাউন্ডারি ({points.length > 0 ? `${points.length} pts` : 'Empty'})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('HELPERS')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                  activeTab === 'HELPERS'
                    ? 'bg-purple-950 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  হেলপার অ্যাসাইন (
                  {allHelpersAllowed ? 'All' : `${selectedHelperIds.length}/${allHelpers.length}`})
                </span>
              </button>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={handleUndo}
                disabled={points.length === 0}
                className="px-2.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs rounded-xl border border-gray-200 transition-colors disabled:opacity-40 flex items-center space-x-1"
                title="Undo point"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Undo</span>
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={points.length === 0 && !rectangleFirstCorner}
                className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl border border-red-200 transition-colors disabled:opacity-40 flex items-center space-x-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Body: Map & Helper Assignment Panel */}
        <div className="relative flex-1 min-h-0 flex flex-col md:flex-row bg-slate-900 overflow-hidden">
          {/* MAP VIEW */}
          <div
            className={`relative flex-1 h-full min-h-0 ${
              activeTab === 'MAP' ? 'flex flex-col' : 'hidden md:flex md:flex-col'
            }`}
          >
            {/* Floating Search Bar */}
            <form
              onSubmit={handleSearch}
              className="absolute top-3 left-3 right-3 z-20 flex gap-2 p-1.5 bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-slate-700 max-w-sm"
            >
              <input
                type="text"
                placeholder="ম্যাপে এলাকা খুঁজুন..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-medium"
              />
              <button
                type="submit"
                disabled={isGeocoding}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shrink-0"
              >
                {isGeocoding ? '...' : 'Search'}
              </button>
            </form>

            {/* Floating Map Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="absolute top-3 right-3 z-20 p-2.5 bg-slate-900/90 hover:bg-slate-800 text-white rounded-2xl border border-slate-700 shadow-xl backdrop-blur-md transition-all active:scale-95"
              title={isFullscreen ? 'Exit Fullscreen' : 'Full Screen Map'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Leaflet Map */}
            <div ref={mapContainerRef} className="w-full h-full z-10" />

            {/* Floating Instructions Banner */}
            <div className="absolute bottom-3 left-3 right-3 sm:right-auto z-20 bg-slate-900/95 text-white px-3.5 py-2.5 rounded-2xl text-[11px] font-semibold backdrop-blur-md border border-slate-700 shadow-xl flex items-center space-x-2">
              <Info className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {drawMode === 'RECTANGLE'
                  ? rectangleFirstCorner
                    ? '📍 ১ম কোণা চিহ্নিত। এখন বিপরীত ২য় কোণায় ক্লিক করে আয়তক্ষেত্র সম্পন্ন করুন।'
                    : '💡 আয়তক্ষেত্র তৈরি করতে ম্যাপের যেকোনো ২টি বিপরীত কোণায় পর্যায়ক্রমে ক্লিক করুন।'
                  : `💡 ম্যাপের চারপাশে ক্লিক করে সীমানা চিহ্নিত করুন (${points.length} points added)`}
              </span>
            </div>
          </div>

          {/* HELPER ASSIGNMENT PANEL */}
          <div
            className={`w-full md:w-80 lg:w-96 h-full flex flex-col bg-white border-t md:border-t-0 md:border-l border-gray-200 z-20 shadow-lg md:shadow-none ${
              activeTab === 'HELPERS' ? 'flex' : 'hidden md:flex'
            }`}
          >
            {/* Helper Panel Header */}
            <div className="p-4 border-b border-gray-100 bg-gray-50/80 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Bike className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider">
                    হেলপার নির্ধারণ
                  </h4>
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {allHelpersAllowed ? 'All Fleet' : `${selectedHelperIds.length} Selected`}
                </span>
              </div>

              {/* All Helpers Toggle */}
              <label className="flex items-center space-x-2.5 p-2.5 bg-white rounded-xl border border-emerald-200 cursor-pointer shadow-xs hover:border-emerald-300 transition-colors">
                <input
                  type="checkbox"
                  checked={allHelpersAllowed}
                  onChange={(e) => {
                    setAllHelpersAllowed(e.target.checked);
                    if (e.target.checked) {
                      setSelectedHelperIds([]);
                    }
                  }}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300"
                />
                <span className="text-xs font-extrabold text-gray-900">
                  সকল হেলপার গ্রহণযোগ্য (Select All Helpers)
                </span>
              </label>

              {/* Search & Batch Actions */}
              {!allHelpersAllowed && (
                <div className="mt-2.5 space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="হেলপারের নাম / মোবাইল খুঁজুন..."
                      value={helperSearch}
                      onChange={(e) => setHelperSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-bold text-gray-600 px-1">
                    <button
                      type="button"
                      onClick={handleSelectAllHelpers}
                      className="text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                    >
                      সবাইকে সিলেক্ট করুন
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllHelpers}
                      className="text-gray-500 hover:text-gray-700 underline cursor-pointer"
                    >
                      আনসিলেক্ট করুন
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Helper List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {allHelpersAllowed ? (
                <div className="p-6 text-center text-xs text-gray-500 flex flex-col items-center justify-center space-y-2 h-full">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <p className="font-extrabold text-gray-900">সকল হেলপার এই এলাকা সার্ভ করতে পারবেন</p>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    এই সাব-এরিয়ায় কোনো সীমাবদ্ধতা নেই। সকল নিবন্ধিত হেলপারেরা এই এলাকার নতুন অর্ডারের নোটিফিকেশন পাবেন।
                  </p>
                </div>
              ) : filteredHelpers.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">কোনো হেলপার পাওয়া যায়নি।</div>
              ) : (
                filteredHelpers.map((h) => {
                  const isSelected = selectedHelperIds.includes(h.uid);
                  const isDedicated = h.helperType === 'dedicated';

                  return (
                    <div
                      key={h.uid}
                      onClick={() => toggleHelperSelection(h.uid)}
                      className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-emerald-50/80 border-emerald-300 shadow-xs'
                          : 'bg-white border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                            isSelected
                              ? 'bg-emerald-600 text-white'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {h.displayName?.charAt(0).toUpperCase() || 'H'}
                        </div>
                        <div className="min-w-0">
                          <div className="font-extrabold text-xs text-gray-900 truncate">
                            {h.displayName || 'Unnamed Helper'}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">
                            {h.phoneNumber || h.email}
                          </div>
                          <span
                            className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase mt-0.5 ${
                              isDedicated
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-blue-100 text-blue-900'
                            }`}
                          >
                            {isDedicated ? 'Dedicated Rider' : 'Commuter'}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 pl-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300 cursor-pointer"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 p-3.5 sm:p-4 border-t border-gray-100 bg-white flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-gray-600">
            {points.length >= 3 ? (
              <span className="text-emerald-700 flex items-center space-x-1">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>ম্যাপ বাউন্ডারি হাইলাইটেড ({points.length} points)</span>
              </span>
            ) : (
              <span className="text-amber-700">⚠️ ম্যাপে বাউন্ডারি নির্ধারণ করুন</span>
            )}
            <span className="text-gray-300">•</span>
            <span>
              {allHelpersAllowed
                ? 'সকল হেলপার অনুমোদিত'
                : `${selectedHelperIds.length} জন হেলপার সিলেক্টেড`}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl active:scale-95 transition-colors cursor-pointer"
            >
              বাতিল
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>সাব-এরিয়া ও হেলপার সেভ করুন</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
