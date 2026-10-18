'use client';

import React, { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fallbackStore } from '@/lib/firebase';
import { Shop } from '@/types';
import { Store, CheckCircle2, MapPin, ChevronRight, X } from 'lucide-react';

interface StorePickerModalProps {
  onClose?: () => void;
  /** When true, renders inline (no close button, forced selection) */
  forceSelect?: boolean;
}

export const StorePickerModal: React.FC<StorePickerModalProps> = ({ onClose, forceSelect = false }) => {
  const { user, activeStoreId, setActiveStoreId, setShowStorePicker } = useAuth();

  const accessibleStores = useMemo<Shop[]>(() => {
    if (!user) return [];
    const storeIds = user.storeIds || (user.storeId ? [user.storeId] : []);
    const stores: Shop[] = [];
    for (const id of storeIds) {
      const shop = fallbackStore.shops.get(id);
      if (shop) {
        stores.push(shop);
      }
    }
    // Also search by ownerUserId or assignedUserIds in case storeIds not yet synced
    for (const shop of Array.from(fallbackStore.shops.values())) {
      if (!stores.find((s) => s.id === shop.id)) {
        if (shop.ownerUserId === user.uid || shop.assignedUserIds?.includes(user.uid)) {
          stores.push(shop);
        }
      }
    }
    return stores;
  }, [user]);

  const handleSelect = (storeId: string) => {
    setActiveStoreId(storeId);
    if (onClose) onClose();
  };

  const handleClose = () => {
    setShowStorePicker(false);
    if (onClose) onClose();
  };

  if (accessibleStores.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={forceSelect ? undefined : handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header gradient */}
        <div className="relative bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 px-6 pt-6 pb-8">
          {/* Close button */}
          {!forceSelect && (
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          )}

          <div className="flex items-center gap-3 mb-1">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <Store className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                আপনার দোকান বেছে নিন
              </h2>
              <p className="text-orange-100 text-xs font-medium mt-0.5">
                Select Your Store
              </p>
            </div>
          </div>

          <p className="text-orange-100/90 text-sm mt-3 leading-relaxed">
            আপনার একাধিক দোকানে অ্যাক্সেস আছে। কোন দোকানটি পরিচালনা করতে চান সেটি বেছে নিন।
          </p>

          {/* Decorative circles */}
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-8 -left-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
        </div>

        {/* Store List */}
        <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
          {accessibleStores.map((shop, index) => {
            const isActive = activeStoreId === shop.id;
            const isOpen = shop.isOpen !== false;
            const isBlocked = Boolean(shop.isBlocked);

            return (
              <button
                key={shop.id}
                onClick={() => handleSelect(shop.id)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left group relative overflow-hidden ${
                  isActive
                    ? 'border-orange-500 bg-orange-50 shadow-md shadow-orange-100'
                    : 'border-gray-100 hover:border-orange-200 hover:bg-orange-50/50 bg-white'
                }`}
              >
                {/* Store photo or icon */}
                <div className={`w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden shadow-sm ${
                  isActive ? 'bg-orange-100' : 'bg-gray-100'
                }`}>
                  {shop.photoUrl ? (
                    <img
                      src={shop.photoUrl}
                      alt={shop.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Store className={`w-5 h-5 ${isActive ? 'text-orange-600' : 'text-gray-500'}`} />
                  )}
                </div>

                {/* Store info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-bold text-sm leading-tight truncate ${isActive ? 'text-orange-900' : 'text-gray-800'}`}>
                      {shop.name}
                    </span>
                    {index === 0 && (
                      <span className="text-[9px] font-extrabold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full border border-orange-200 flex-shrink-0">
                        PRIMARY
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium ${
                      isBlocked ? 'text-red-500' : isOpen ? 'text-emerald-600' : 'text-gray-400'
                    }`}>
                      {isBlocked ? '⛔ Blocked' : isOpen ? '🟢 Open' : '🔴 Closed'}
                    </span>
                    {shop.type && (
                      <span className="text-[10px] text-gray-400 font-medium truncate">• {shop.type}</span>
                    )}
                  </div>
                  {shop.location?.address && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
                      <span className="text-[10px] text-gray-400 truncate">{shop.location.address}</span>
                    </div>
                  )}
                </div>

                {/* Right side: check or arrow */}
                {isActive ? (
                  <CheckCircle2 className="w-5 h-5 text-orange-500 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 transition-colors flex-shrink-0" />
                )}

                {/* Selected glow */}
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none rounded-2xl" />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-6 pb-5 pt-2">
          <p className="text-center text-[11px] text-gray-400 font-medium">
            পরে সাইডবার থেকেও দোকান পরিবর্তন করা যাবে
          </p>
        </div>
      </div>
    </div>
  );
};
