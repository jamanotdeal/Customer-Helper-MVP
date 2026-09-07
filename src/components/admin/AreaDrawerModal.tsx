'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AllowedAreaPolygon } from '@/types';
import { MapPin, Plus, Trash2, Check, X, Search, Globe } from 'lucide-react';
import { useModal } from '../CustomModal';

interface AreaDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveArea: (area: AllowedAreaPolygon) => void;
  areaToEdit?: AllowedAreaPolygon | null;
}

export const AreaDrawerModal: React.FC<AreaDrawerModalProps> = ({
  isOpen,
  onClose,
  onSaveArea,
  areaToEdit,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const polygonLayerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const [areaName, setAreaName] = useState('');
  const [countryName, setCountryName] = useState('Bangladesh');
  const [points, setPoints] = useState<{ lat: number; lng: number }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);

  const { showAlert } = useModal();

  useEffect(() => {
    if (!isOpen) return;

    if (areaToEdit) {
      setAreaName(areaToEdit.name || '');
      setCountryName(areaToEdit.country || 'Bangladesh');
      setPoints(areaToEdit.coordinates || []);
    } else {
      setAreaName('');
      setCountryName('Bangladesh');
      setPoints([]);
    }

    let L: any = null;

    const initMap = async () => {
      try {
        if (!mapContainerRef.current) return;

        L = await import('leaflet');

        if (!document.getElementById('leaflet-css-area-drawer')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-area-drawer';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
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

        map.on('click', (e: any) => {
          const newPt = { lat: e.latlng.lat, lng: e.latlng.lng };
          setPoints((prev) => [...prev, newPt]);
        });
      } catch (err) {
        console.warn('[AreaDrawerModal] Leaflet init error:', err);
      }
    };

    const timer = setTimeout(() => {
      initMap();
    }, 50);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, areaToEdit]);

  // Update polygon overlay whenever points change
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    import('leaflet').then((L) => {
      // Clear existing markers
      markersRef.current.forEach((m) => map.removeLayer(m));
      markersRef.current = [];

      // Clear existing polygon layer
      if (polygonLayerRef.current) {
        map.removeLayer(polygonLayerRef.current);
        polygonLayerRef.current = null;
      }

      if (points.length > 0) {
        // Draw markers for vertices
        points.forEach((pt, idx) => {
          const marker = L.circleMarker([pt.lat, pt.lng], {
            radius: 6,
            color: '#10b981',
            fillColor: '#ffffff',
            fillOpacity: 1,
            weight: 3,
          }).addTo(map);
          marker.bindTooltip(`Pt ${idx + 1}`, { permanent: false });
          markersRef.current.push(marker);
        });

        // Draw polygon if >= 2 points
        if (points.length >= 2) {
          const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);
          polygonLayerRef.current = L.polygon(latLngs, {
            color: '#059669',
            fillColor: '#10b981',
            fillOpacity: 0.35,
            weight: 3,
            dashArray: '4, 4',
          }).addTo(map);
        }
      }
    });
  }, [points]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !mapInstanceRef.current) return;
    setIsGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&accept-language=bn,en`
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
  };

  const handleClear = () => {
    setPoints([]);
  };

  const handleSave = () => {
    if (!areaName.trim()) {
      showAlert('নাম আবশ্যক', 'অনুগ্রহ করে এলাকার নাম লিখুন (যেমন: Uttara Sector 18)।', 'warning');
      return;
    }
    if (points.length < 3) {
      showAlert('সীমানা অসম্পূর্ণ', 'এলাকার সীমানা নির্ধারণের জন্য ম্যাপে অন্তত ৩টি পয়েন্ট সিলেক্ট করুন।', 'warning');
      return;
    }

    const area: AllowedAreaPolygon = {
      id: areaToEdit?.id || `area-${Date.now()}`,
      name: areaName.trim(),
      country: countryName.trim() || 'Bangladesh',
      coordinates: points,
    };

    onSaveArea(area);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full h-[90dvh] max-h-[850px] max-w-[850px] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-2xl bg-emerald-100 text-emerald-800">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900">
                {areaToEdit ? 'সার্ভিস এলাকা পরিবর্তন করুন' : 'নতুন সার্ভিস এলাকা ড্র করুন (Specific Area)'}
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                ম্যাপে ক্লিক করে নির্দিষ্ট এলাকার সীমানা তৈরি করুন। গ্রাহকরা শুধুমাত্র এই এলাকাগুলোর ভেতরেই অর্ডার করতে পারবেন।
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs & Controls Bar */}
        <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              placeholder="দেশের নাম (যেমন: Bangladesh)"
              value={countryName}
              onChange={(e) => setCountryName(e.target.value)}
              className="w-1/3 min-w-[120px] px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              placeholder="এলাকার নাম (যেমন: Uttara 18, Ashulia Model Town)"
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:border-emerald-500 text-gray-900"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={points.length === 0}
              className="px-3 py-2 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs rounded-xl border border-gray-200 transition-colors disabled:opacity-40"
            >
              Undo Point ({points.length})
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={points.length === 0}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl border border-red-200 transition-colors disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Map Container */}
        <div className="relative flex-1 bg-emerald-50/20 min-h-0 overflow-hidden">
          {/* Floating Search Bar */}
          <form
            onSubmit={handleSearch}
            className="absolute top-3 left-3 right-3 z-20 flex gap-2 p-1.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-md border border-emerald-100 max-w-sm"
          >
            <input
              type="text"
              placeholder="ম্যাপে এলাকা খুঁজুন..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500 font-medium"
            />
            <button
              type="submit"
              disabled={isGeocoding}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shrink-0"
            >
              {isGeocoding ? '...' : 'Search'}
            </button>
          </form>

          {/* Leaflet Map */}
          <div ref={mapContainerRef} className="w-full h-full z-10" />

          {/* Floating Instructions */}
          <div className="absolute bottom-3 left-3 z-20 bg-slate-900/90 text-white px-3 py-2 rounded-2xl text-[11px] font-semibold backdrop-blur-md border border-slate-700/50 shadow-lg pointer-events-none">
            💡 ম্যাপের চারপাশে ক্লিক করে সীমানা চিহ্নিত করুন ({points.length} points added)
          </div>
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 p-4 border-t border-gray-100 bg-white flex items-center justify-between">
          <span className="text-xs text-gray-500 font-medium">
            {points.length >= 3 ? '✅ সীমানা প্রস্তুত' : '⚠️ অন্তত ৩টি পয়েন্ট সিলেক্ট করুন'}
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              বাতিল
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>এলাকা সংরক্ষণ করুন</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
