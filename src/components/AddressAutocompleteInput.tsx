'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LocationData, ServerAddress } from '@/types';
import { MapPin, Clock, X, ChevronDown, Check, Sparkles } from 'lucide-react';
import { fallbackStore } from '@/lib/firebase';

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
}

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
  className = '',
  inputClassName = '',
  maxLength = 250,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dynamic server search results (only queried when user types)
  const [serverSearchResults, setServerSearchResults] = useState<ServerAddress[]>([]);

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

  // Normalize string for fuzzy/substring matching
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

  // Debounced server address search — ONLY runs when user types something
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
      } catch (_) {}
    }, 80);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [value]);

  // Compute suggestions based on query and service category
  const suggestions = useMemo(() => {
    const q = normalize(value || '');
    const list: UnifiedSuggestion[] = [];
    const seenTexts = new Set<string>();

    // 1. Add Local Saved Addresses
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

    // 2. Add Server Addresses (ONLY when user is actively searching)
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

    // When input is empty: show only top local saved addresses (by default server addresses do not load)
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
          // Token-by-token matching for multi-word queries (e.g. "মিরপুর ১০")
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

        // If NO match was found at all, score is 0
        if (baseScore === 0) {
          return { item, score: 0 };
        }

        // Only add bonus points if the query matched
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
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[selectedIndex]);
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
    inputRef.current?.focus();
    setIsOpen(true);
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
          className={`w-full ${icon ? 'pl-10' : 'pl-4'} pr-10 py-3 rounded-2xl border outline-none text-sm text-gray-900 placeholder-gray-400 font-medium transition-all ${
            error
              ? 'border-red-400 bg-red-50/20 ring-2 ring-red-100 focus:border-red-500'
              : 'border-gray-200 bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
          } ${inputClassName}`}
        />

        {/* Action icons right (Clear or Dropdown arrow) */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
          {value ? (
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
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-emerald-100/80 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 bg-gradient-to-r from-emerald-50/60 to-slate-50 border-b border-emerald-100/50 flex items-center justify-between text-[11px] font-bold text-emerald-900">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              <span>{value ? 'প্রস্তাবিত ঠিকানা' : 'সেভ করা ঠিকানা'}</span>
            </span>
            <span className="text-[10px] text-gray-400 font-normal">ক্লিক করে বেছে নিন</span>
          </div>

          <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
            {suggestions.map((item, idx) => {
              const isCurrentExact = normalize(item.address) === normalize(value);
              const isKeySelected = idx === selectedIndex;
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
                  className={`w-full px-3.5 py-2.5 text-left flex items-center gap-2.5 transition-colors group cursor-pointer ${
                    isKeySelected
                      ? 'bg-emerald-100/80'
                      : isCurrentExact
                      ? 'bg-emerald-50/90'
                      : 'hover:bg-emerald-50/70'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      item.isRecent
                        ? 'bg-amber-100/80 text-amber-700'
                        : item.isServerSaved
                        ? 'bg-blue-50 text-blue-600 border border-blue-100'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                    }`}
                  >
                    {item.isRecent ? (
                      <Clock className="w-3.5 h-3.5" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 leading-snug group-hover:text-emerald-800 transition-colors">
                      {item.address}
                    </p>
                    {item.shortName && (
                      <p className="text-[11px] text-emerald-700 font-semibold truncate mt-0.5 flex items-center gap-1">
                        <span className="text-[10px] text-gray-400 font-normal">📍</span>
                        <span>{item.shortName}</span>
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
      )}
    </div>
  );
};
