'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { LocationData } from '@/types';
import { MapPin, X, Map, Clock } from 'lucide-react';

interface SavedAddressPickerProps {
  isOpen: boolean;
  onClose: () => void;
  savedAddresses: LocationData[];
  selectedAddress?: LocationData | null;
  onSelectAddress: (loc: LocationData) => void;
  onOpenMap: () => void;
  /** Override the sheet title (defaults to 'সেভ করা ঠিকানা') */
  title?: string;
  /** Override the sheet subtitle */
  subtitle?: string;
  /** Override the 'open map' button label */
  openMapLabel?: string;
}

export const SavedAddressPicker: React.FC<SavedAddressPickerProps> = ({
  isOpen,
  onClose,
  savedAddresses,
  selectedAddress,
  onSelectAddress,
  onOpenMap,
  title = 'সেভ করা ঠিকানা',
  subtitle = 'লোকেশন  সিলেক্ট করুন, না হলে নিচের বাটনে ক্লিক করে নতুন Address সেট করুন।',
  openMapLabel = 'No, অন্য ঠিকানা হবে!',
}) => {
  if (!isOpen || typeof document === 'undefined') return null;

  const handleSelect = (loc: LocationData) => {
    onSelectAddress(loc);
    onClose();
  };

  const handleOpenMap = () => {
    onClose();
    onOpenMap();
  };

  const isSelected = (addr: LocationData) => {
    if (!selectedAddress) return false;
    if (selectedAddress.address && addr.address && selectedAddress.address.trim() === addr.address.trim()) {
      return true;
    }
    if (selectedAddress.lat && selectedAddress.lng && addr.lat && addr.lng) {
      return selectedAddress.lat === addr.lat && selectedAddress.lng === addr.lng;
    }
    return false;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99990] flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-250 overflow-hidden"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-gray-900">{title}</h3>
              <p className="text-[10px] text-gray-400 font-medium">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Address List */}
        <div className="px-4 py-3 space-y-2 max-h-[50vh] overflow-y-auto">
          {savedAddresses.length === 0 ? (
            <div className="py-6 text-center text-gray-400">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-semibold">কোনো সেভ করা ঠিকানা নেই।</p>
              <p className="text-[10px] mt-0.5">নিচের বাটনে ক্লিক করে ম্যাপ থেকে ঠিকানা বেছে নিন।</p>
            </div>
          ) : (
            savedAddresses.map((addr, idx) => {
              const active = isSelected(addr);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelect(addr)}
                  className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border active:scale-[0.98] transition-all text-left group ${
                    active
                      ? 'bg-emerald-50 border-emerald-300 shadow-xs'
                      : 'bg-gray-50 hover:bg-emerald-50 border-gray-100 hover:border-emerald-200'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                      active
                        ? 'bg-emerald-100 border-emerald-400 text-emerald-700'
                        : 'bg-white border-gray-200 group-hover:border-emerald-300 group-hover:bg-emerald-50'
                    }`}
                  >
                    {idx === 0 ? (
                      <Clock className={`w-3.5 h-3.5 ${active ? 'text-emerald-700' : 'text-emerald-600'}`} />
                    ) : (
                      <MapPin
                        className={`w-3.5 h-3.5 ${
                          active ? 'text-emerald-700' : 'text-gray-400 group-hover:text-emerald-500 transition-colors'
                        }`}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 leading-snug line-clamp-2">{addr.address}</p>
                    {idx === 0 && (
                      <span className="inline-block mt-1 text-[9px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        সর্বশেষ ব্যবহৃত
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Open Map Button */}
        <div className="px-4 pt-2 pb-1">
          <button
            type="button"
            onClick={handleOpenMap}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold text-sm shadow-md shadow-emerald-600/25 transition-all"
          >
            <Map className="w-4 h-4" />
            <span>{openMapLabel}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
