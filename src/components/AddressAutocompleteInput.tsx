'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LocationData, ServerAddress } from '@/types';
import { MapPin, Clock, X, ChevronDown, Check, Sparkles, Navigation, Loader2, Compass } from 'lucide-react';
import { fallbackStore } from '@/lib/firebase';
import { calculateDistanceKm } from '@/lib/pricing';
import { formatShortAddress } from '@/utils/mapMarkerUtils';

export interface AddressAutocompleteInputProps {
  id?: string;
  value: string;
  onChange: (val: string, locationData?: LocationData) => void;
  onSelectSuggestion?: (loc: LocationData) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  error?: string;
  icon?: React.ReactNode;
  serviceCategory?: string;
  savedLocalAddresses?: LocationData[];
  serverAddresses?: ServerAddress[];
  userLocation?: { lat: number; lng: number };
  className?: string;
  inputClassName?: string;
  maxLength?: number;
}

interface UnifiedSuggestion {
  key: string;
  address: string;
  shortName?: string;
  lat?: number;
  lng?: number;
  details?: string;
  addressId?: string;
  isServiceMatch?: boolean;
  isLocalSaved?: boolean;
  isServerSaved?: boolean;
  isRecent?: boolean;
  isDynamicMap?: boolean;
  distanceKm?: number;
}

// In-memory query cache for OSM Nominatim dynamic map results
const mapSearchCache = new Map<string, UnifiedSuggestion[]>();

export const AddressAutocompleteInput: React.FC<AddressAutocompleteInputProps> = ({
  id,
  value,
  onChange,
  onSelectSuggestion,
  placeholder = 'ঠিকানা লিখুন...',
  label,
  required = false,
  error,
  icon,
  serviceCategory,
  savedLocalAddresses = [],
  serverAddresses: propServerAddresses,
  userLocation,
  className = '',
  inputClassName = '',
  maxLength = 250,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dynamic server search results (from local DB/server table)
  const [serverSearchResults, setServerSearchResults] = useState<ServerAddress[]>([]);

  // Dynamic Map search results (from OSM Nominatim API)
  const [mapSearchResults, setMapSearchResults] = useState<UnifiedSuggestion[]>([]);
  const [isSearchingMap, setIsSearchingMap] = useState(false);

  // Device GPS coordinate fallback
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Keyboard navigation index
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Silently request device coordinates on mount if available
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation && !deviceCoords) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDeviceCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => { },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 600000 }
      );
    }
  }, []);

  // Normalize string for fuzzy/substring matching
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

  // Determine user's anchor location (priority: prop > device GPS > first saved address > default Uttara/Ashulia center)
  const effectiveUserCoords = useMemo(() => {
    if (userLocation?.lat && userLocation?.lng) {
      return { lat: userLocation.lat, lng: userLocation.lng };
    }
    if (deviceCoords?.lat && deviceCoords?.lng) {
      return deviceCoords;
    }
    const firstSavedWithCoords = savedLocalAddresses.find((a) => a.lat && a.lng);
    if (firstSavedWithCoords?.lat && firstSavedWithCoords?.lng) {
      return { lat: firstSavedWithCoords.lat, lng: firstSavedWithCoords.lng };
    }
    return { lat: 23.8759, lng: 90.3795 };
  }, [userLocation, deviceCoords, savedLocalAddresses]);

  // Debounced server address search
  useEffect(() => {
    const q = (value || '').trim();
    if (!q) {
      setServerSearchResults([]);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const results = await fallbackStore.searchServerAddresses(q, 6);
        if (isMounted) {
          setServerSearchResults(results);
        }
      } catch (_) { }
    }, 80);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [value]);

  // 1. Calculate Saved Address Suggestions (Local & Server)
  const savedSuggestions = useMemo(() => {
    const q = normalize(value || '');
    const list: UnifiedSuggestion[] = [];
    const seenTexts = new Set<string>();

    // Add Local Saved Addresses
    savedLocalAddresses.forEach((loc, index) => {
      if (!loc || !loc.address) return;
      const cleanAddr = loc.address.trim();
      const normalizedAddr = normalize(cleanAddr);
      if (!normalizedAddr || seenTexts.has(normalizedAddr)) return;

      seenTexts.add(normalizedAddr);
      list.push({
        key: `local-${index}-${normalizedAddr}`,
        address: cleanAddr,
        shortName: loc.name,
        lat: loc.lat,
        lng: loc.lng,
        details: loc.details,
        addressId: loc.addressId,
        isLocalSaved: true,
        isRecent: index === 0,
      });
    });

    // Add Server Addresses (ONLY when user is actively searching)
    const activeServerList = q
      ? (serverSearchResults.length > 0 ? serverSearchResults : (propServerAddresses || []))
      : [];

    activeServerList.forEach((sa) => {
      if (!sa || !sa.address) return;
      const cleanAddr = sa.address.trim();
      const normalizedAddr = normalize(cleanAddr);
      if (!normalizedAddr || seenTexts.has(normalizedAddr)) return;

      seenTexts.add(normalizedAddr);
      list.push({
        key: `server-${sa.id}`,
        address: cleanAddr,
        shortName: sa.shortName,
        lat: sa.lat,
        lng: sa.lng,
        details: sa.details,
        addressId: sa.id,
        isServerSaved: true,
      });
    });

    // When input is empty: show only top local saved addresses
    if (!q) {
      return list.filter((item) => item.isLocalSaved).slice(0, 4);
    }

    const queryTokens = q.split(/[\s,]+/).filter(Boolean);

    const matched = list
      .map((item) => {
        const itemText = normalize(item.address);
        const itemShort = normalize(item.shortName || '');
        const itemDetails = normalize(item.details || '');
        const fullSearchable = `${itemText} ${itemShort} ${itemDetails}`.trim();

        let baseScore = 0;

        // Exact match or prefix match on address
        if (itemText.startsWith(q)) {
          baseScore += 100;
        } else if (itemShort && itemShort.startsWith(q)) {
          baseScore += 90;
        } else if (itemText.includes(q)) {
          baseScore += 60;
        } else if (fullSearchable.includes(q)) {
          baseScore += 50;
        } else if (queryTokens.length > 0) {
          let tokenMatches = 0;
          for (const token of queryTokens) {
            if (fullSearchable.includes(token)) {
              tokenMatches++;
            }
          }
          if (tokenMatches > 0) {
            baseScore += (tokenMatches / queryTokens.length) * 40;
            if (tokenMatches === queryTokens.length) {
              baseScore += 25;
            }
          }
        }

        if (baseScore === 0) {
          return { item, score: 0 };
        }

        if (item.isRecent) baseScore += 5;
        if (item.isLocalSaved) baseScore += 3;
        if (item.lat && item.lng) baseScore += 2;

        return { item, score: baseScore };
      })
      .filter((res) => res.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((res) => res.item)
      .slice(0, 4);

    return matched;
  }, [value, savedLocalAddresses, serverSearchResults, propServerAddresses, serviceCategory]);

  // 2. Dynamic Map Search: Triggered when user typed an address and saved match is less than 1
  useEffect(() => {
    const q = (value || '').trim();

    // If query is empty or we already have matching saved addresses, no need to search map
    if (!q || q.length < 2 || savedSuggestions.length > 0) {
      setMapSearchResults([]);
      setIsSearchingMap(false);
      return;
    }

    // Check cache
    const cacheKey = `${q.toLowerCase()}_${effectiveUserCoords.lat.toFixed(3)}_${effectiveUserCoords.lng.toFixed(3)}`;
    if (mapSearchCache.has(cacheKey)) {
      setMapSearchResults(mapSearchCache.get(cacheKey) || []);
      setIsSearchingMap(false);
      return;
    }

    setIsSearchingMap(true);
    const abortController = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const uLat = effectiveUserCoords.lat;
        const uLng = effectiveUserCoords.lng;

        // Viewbox bounding box for ~3-5km radius around user (approx 0.040 deg lat, 0.045 deg lng)
        const minLng = (uLng - 0.045).toFixed(6);
        const maxLng = (uLng + 0.045).toFixed(6);
        const minLat = (uLat - 0.040).toFixed(6);
        const maxLat = (uLat + 0.040).toFixed(6);

        // OSM Nominatim query prioritizing user's nearby viewbox
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          q
        )}&viewbox=${minLng},${maxLat},${maxLng},${minLat}&bounded=0&limit=5&accept-language=bn,en&countrycodes=bd`;

        const res = await fetch(url, {
          signal: abortController.signal,
          headers: {
            'Accept': 'application/json',
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const mappedResults: UnifiedSuggestion[] = data.map((item: any, idx: number) => {
              const itemLat = parseFloat(item.lat);
              const itemLng = parseFloat(item.lon);
              const dist = !isNaN(itemLat) && !isNaN(itemLng)
                ? calculateDistanceKm(uLat, uLng, itemLat, itemLng)
                : undefined;

              const cleanFormatted = formatShortAddress(item.display_name || '');
              const placeTitle = item.name || cleanFormatted.split(',')[0] || cleanFormatted;

              return {
                key: `map-${item.place_id || idx}`,
                address: cleanFormatted || item.display_name,
                shortName: placeTitle,
                details: item.display_name,
                lat: itemLat,
                lng: itemLng,
                isDynamicMap: true,
                distanceKm: dist,
              };
            });

            // Sort map results by nearest distance to user
            mappedResults.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

            mapSearchCache.set(cacheKey, mappedResults);
            setMapSearchResults(mappedResults);
          } else {
            setMapSearchResults([]);
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('[AddressAutocompleteInput] Dynamic map search note:', err?.message || err);
        }
      } finally {
        setIsSearchingMap(false);
      }
    }, 280);

    return () => {
      abortController.abort();
      clearTimeout(timer);
    };
  }, [value, savedSuggestions.length, effectiveUserCoords]);

  // Combined suggestions:
  // 1. If saved addresses match query (>= 1), show saved address matches.
  // 2. If saved matches < 1, show dynamic map results.
  const activeSuggestions = useMemo(() => {
    if (savedSuggestions.length > 0) {
      return savedSuggestions;
    }
    return mapSearchResults;
  }, [savedSuggestions, mapSearchResults]);

  // Mode flag for UI headers
  const isSavedMode = savedSuggestions.length > 0;
  const isDynamicMapMode = !isSavedMode && (value || '').trim().length > 0;

  const handleSelect = (item: UnifiedSuggestion) => {
    const loc: LocationData = {
      address: item.address,
      lat: item.lat,
      lng: item.lng,
      name: item.shortName,
      details: item.details,
      addressId: item.addressId,
    };
    onChange(item.address, loc);
    if (onSelectSuggestion) {
      onSelectSuggestion(loc);
    }
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    onChange(newVal);
    setSelectedIndex(-1);
    if (!isOpen) setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || activeSuggestions.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < activeSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : activeSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < activeSuggestions.length) {
        e.preventDefault();
        handleSelect(activeSuggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  };

  const handleClear = () => {
    onChange('');
    setSelectedIndex(-1);
    setServerSearchResults([]);
    setMapSearchResults([]);
    setIsSearchingMap(false);
    inputRef.current?.focus();
    setIsOpen(true);
  };

  const formatDistanceLabel = (distKm?: number) => {
    if (distKm === undefined || isNaN(distKm)) return null;
    if (distKm < 1) {
      const meters = Math.round(distKm * 1000);
      return `${meters} মি. দূরে`;
    }
    return `${distKm.toFixed(1)} কিমি দূরে`;
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-gray-600 mb-1">
          {label} {required && <span className="text-emerald-600">*</span>}
        </label>
      )}

      <div className="relative group">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none flex items-center justify-center">
            {icon}
          </div>
        )}

        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          className={`w-full ${icon ? 'pl-10' : 'pl-4'} pr-10 py-3 rounded-2xl border outline-none text-sm text-gray-900 placeholder-gray-400 font-medium transition-all ${error
              ? 'border-red-400 bg-red-50/20 ring-2 ring-red-100 focus:border-red-500'
              : 'border-gray-200 bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
            } ${inputClassName}`}
        />

        {/* Action icons right (Loading, Clear or Dropdown arrow) */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
          {isSearchingMap ? (
            <div className="p-1.5 text-emerald-600 animate-spin">
              <Loader2 className="w-3.5 h-3.5" />
            </div>
          ) : value ? (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClear();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClear();
              }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              title="মুছে ফেলুন"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Suggestion Dropdown */}
      {isOpen && (
        <>
          {activeSuggestions.length > 0 ? (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-emerald-100/80 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-3 py-2 bg-gradient-to-r from-emerald-50/60 to-slate-50 border-b border-emerald-100/50 flex items-center justify-between text-[11px] font-bold text-emerald-900">
                <span className="flex items-center gap-1.5">
                  {isSavedMode ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{value ? 'সেভ করা প্রস্তাবিত ঠিকানা' : 'সেভ করা ঠিকানা'}</span>
                    </>
                  ) : (
                    <>
                      <Compass className="w-3.5 h-3.5 text-teal-600 animate-pulse" />
                      <span>ম্যাপের প্রস্তাবিত ঠিকানা (নিকটবর্তী ৩-৫ কিমি)</span>
                    </>
                  )}
                </span>
                <span className="text-[10px] text-gray-400 font-normal">ক্লিক করে বেছে নিন</span>
              </div>

              <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
                {activeSuggestions.map((item, idx) => {
                  const isCurrentExact = normalize(item.address) === normalize(value);
                  const isKeySelected = idx === selectedIndex;
                  const distanceLabel = formatDistanceLabel(item.distanceKm);

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSelect(item);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSelect(item);
                      }}
                      className={`w-full px-3.5 py-2.5 text-left flex items-center gap-2.5 transition-colors group cursor-pointer ${isKeySelected
                          ? 'bg-emerald-100/80'
                          : isCurrentExact
                            ? 'bg-emerald-50/90'
                            : 'hover:bg-emerald-50/70'
                        }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${item.isRecent
                            ? 'bg-amber-100/80 text-amber-700'
                            : item.isDynamicMap
                              ? 'bg-teal-50 text-teal-600 border border-teal-100'
                              : item.isServerSaved
                                ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          }`}
                      >
                        {item.isRecent ? (
                          <Clock className="w-3.5 h-3.5" />
                        ) : item.isDynamicMap ? (
                          <Navigation className="w-3.5 h-3.5" />
                        ) : (
                          <MapPin className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="text-xs font-bold text-gray-900 leading-snug group-hover:text-emerald-800 transition-colors truncate">
                            {item.shortName || item.address}
                          </p>
                          {distanceLabel && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0 border border-emerald-100">
                              {distanceLabel}
                            </span>
                          )}
                        </div>
                        {item.shortName && item.shortName !== item.address && (
                          <p className="text-[11px] text-gray-500 font-normal truncate mt-0.5 flex items-center gap-1">
                            <span className="text-[10px] text-gray-400">📍</span>
                            <span>{item.address}</span>
                          </p>
                        )}
                      </div>

                      {isCurrentExact && (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : isSearchingMap ? (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-emerald-100/80 p-3.5 text-center animate-in fade-in duration-150">
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>কাছাকাছি ম্যাপ থেকে ঠিকানা খোঁজা হচ্ছে...</span>
              </div>
            </div>
          ) : isDynamicMapMode && value.trim().length >= 2 ? (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 text-center animate-in fade-in duration-150">
              <p className="text-xs text-gray-500 font-medium">
                কাছাকাছি ম্যাপে নির্দিষ্ট কোনো স্থান মেলেনি। আপনি এই ঠিকানাই ব্যবহার করতে পারেন।
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
