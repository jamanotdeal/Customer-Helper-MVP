'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Shop } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { MapPin, Store } from 'lucide-react';
import { ShopPhoto } from './ShopPhoto';

interface StorePickupInputProps {
  value: string;
  onChange: (value: string, selectedShop?: Shop) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export const StorePickupInput: React.FC<StorePickupInputProps> = ({
  value,
  onChange,
  placeholder,
  required = false,
  className = '',
}) => {
  const [shops, setShops] = useState<Shop[]>(() =>
    Array.from(fallbackStore.shops.values()).filter(
      (s) =>
        !s.isBlocked &&
        s.status !== 'Rejected' &&
        s.status !== 'REJECTED' &&
        (!s.status || s.status === 'Approved' || s.status === 'APPROVED')
    )
  );
  const [isFocused, setIsFocused] = useState(false);
  const [justSelected, setJustSelected] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = () => {
      setShops(
        Array.from(fallbackStore.shops.values()).filter(
          (s) =>
            !s.isBlocked &&
            s.status !== 'Rejected' &&
            s.status !== 'REJECTED' &&
            (!s.status || s.status === 'Approved' || s.status === 'APPROVED')
        )
      );
    };
    sync();
    if (fallbackStore.shops.size === 0) {
      fallbackStore.loadShops();
    }
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];

    // Deduplicate shops by normalized name + phone
    const seenNames = new Set<string>();
    const scored: { shop: Shop; score: number }[] = [];

    for (const shop of shops) {
      const name = (shop.name || '').trim();
      if (!name) continue;
      const normName = name.replace(/\s+/g, '').toLowerCase();
      if (seenNames.has(normName)) continue;

      const lowerName = name.toLowerCase();
      const lowerType = (shop.type || '').toLowerCase();
      const lowerAddr = (shop.location?.address || '').toLowerCase();

      let score = 0;
      if (lowerName === q) score = 100;
      else if (lowerName.startsWith(q)) score = 80;
      else if (lowerName.includes(q)) score = 60;
      else if (lowerType.includes(q)) score = 40;
      else if (lowerAddr.includes(q)) score = 20;

      if (score > 0) {
        seenNames.add(normName);
        scored.push({ shop, score });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.shop.name.localeCompare(b.shop.name));
    return scored.slice(0, 6).map((s) => s.shop);
  }, [value, shops]);

  const showDropdown = isFocused && !justSelected && suggestions.length > 0;

  const handleSelectShop = (shop: Shop) => {
    setJustSelected(true);
    setIsFocused(false);
    onChange(shop.name, shop);
  };

  return (
    <div ref={containerRef} className="relative">
      <MapPin className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
      <input
        type="text"
        required={required}
        value={value}
        onFocus={() => {
          setIsFocused(true);
          setJustSelected(false);
        }}
        onChange={(e) => {
          setJustSelected(false);
          setIsFocused(true);
          onChange(e.target.value, undefined);
        }}
        placeholder={placeholder}
        className={`w-full pl-9 pr-3.5 py-2.5 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-xs ${className}`}
        autoComplete="off"
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl border border-emerald-200 shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-1.5 bg-emerald-50/80 border-b border-emerald-100 text-[10px] font-bold text-emerald-800 flex items-center gap-1">
            <Store className="w-3 h-3 text-emerald-600" />
            <span>দোকান সিলেক্ট করুন</span>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
            {suggestions.map((shop) => (
              <button
                key={shop.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectShop(shop);
                }}
                onClick={() => handleSelectShop(shop)}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-left hover:bg-emerald-50/60 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 overflow-hidden shrink-0 flex items-center justify-center">
                  <ShopPhoto
                    src={shop.photoUrl}
                    alt={shop.name}
                    className="w-full h-full object-cover"
                    fallback={<Store className="w-4 h-4 text-emerald-600" />}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-gray-900 truncate">
                    {shop.name}
                  </p>
                  {(shop.type || shop.location?.address) && (
                    <p className="text-[10px] text-gray-500 truncate">
                      {[shop.type, shop.location?.address].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
