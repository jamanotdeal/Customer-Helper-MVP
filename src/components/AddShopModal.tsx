'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shop, LocationData, UserProfile } from '@/types';
import { fallbackStore, db } from '@/lib/firebase';
import { doc, setDoc, getDocs, deleteDoc, query, collection, where } from 'firebase/firestore';
import { parseStoreTypes } from '@/lib/pricing';
import { useAuth } from '@/context/AuthContext';
import { MapPickerModal } from './MapPickerModal';
import {
  X, Store, MapPin, Check, AlertCircle, Navigation, Search, AlertTriangle, ChevronDown, User as UserIcon,
} from 'lucide-react';
import { usePullToRefreshLock } from '@/hooks/usePullToRefreshLock';
import { AsyncButton } from './ui/AsyncButton';

interface AddShopModalProps {
  shopToEdit?: Shop | null;
  onClose: () => void;
  onSaved?: () => void;
}

export const AddShopModal: React.FC<AddShopModalProps> = ({ shopToEdit, onClose, onSaved }) => {
  // Leaflet consumes the drag itself, so the native pull gesture must be
  // disarmed while this map is on screen.
  usePullToRefreshLock();
  const { user } = useAuth();

  const storeTypes = parseStoreTypes(fallbackStore.pricingSettings.storeTypes);

  const ph = fallbackStore.pricingSettings.storeFormPlaceholders || {};

  // ── Form fields (mirror of StoreApplicationModal) ──────────────────────────
  const [storeName, setStoreName] = useState(shopToEdit?.name || '');
  const [storeType, setStoreType] = useState(shopToEdit?.type || storeTypes[0] || '');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  // Multi-user assignment: all assigned user IDs (first = primary owner)
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>(() => {
    if (shopToEdit?.assignedUserIds && shopToEdit.assignedUserIds.length > 0) {
      return shopToEdit.assignedUserIds;
    }
    if (shopToEdit?.ownerUserId) return [shopToEdit.ownerUserId];
    return [];
  });
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const [ownerName, setOwnerName] = useState(shopToEdit?.contactPerson || '');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(shopToEdit?.whatsapp || '');
  const [managerName, setManagerName] = useState(shopToEdit?.managerName || '');
  const [managerWhatsapp, setManagerWhatsapp] = useState(shopToEdit?.managerWhatsapp || '');
  const [commissionPercent, setCommissionPercent] = useState(
    shopToEdit?.commissionPercent !== undefined ? String(shopToEdit.commissionPercent) : ''
  );
  const [canReceiveOrders, setCanReceiveOrders] = useState<boolean>(
    shopToEdit?.canReceiveOrders !== undefined ? shopToEdit.canReceiveOrders : true
  );
  const [storeDescription, setStoreDescription] = useState(shopToEdit?.description || '');
  const [location, setLocation] = useState<LocationData>(
    shopToEdit?.location || { address: '', lat: 23.8103, lng: 90.4125 }
  );
  const [photoUrl, setPhotoUrl] = useState(shopToEdit?.photoUrl || '');

  // Eligible users: not admin, not helper, not assigned to a DIFFERENT shop
  const allUsersList = Array.from(fallbackStore.users.values());
  const eligibleUsers = allUsersList.filter((u) => {
    if (u.isAdmin || u.role === 'admin' || (u.email && u.email.endsWith('@admin.com'))) return false;
    if (u.isHelper || u.role === 'helper') return false;
    // Allow users already in this shop's assignedUserIds
    if (assignedUserIds.includes(u.uid)) return true;
    if (u.storeId && u.storeId !== shopToEdit?.id) return false;
    if (u.isStoreApproved && u.storeId !== shopToEdit?.id) return false;
    return true;
  });

  // ── Inline map state ───────────────────────────────────────────────────────
  const inlineMapRef = useRef<HTMLDivElement>(null);
  const inlineMapInstanceRef = useRef<any>(null);
  const [inlineMapAddress, setInlineMapAddress] = useState(shopToEdit?.location?.address || '');
  const [inlineSearchQuery, setInlineSearchQuery] = useState('');
  const [inlineIsGeocoding, setInlineIsGeocoding] = useState(false);
  const [inlineIsLocating, setInlineIsLocating] = useState(false);
  const [inlineMapError, setInlineMapError] = useState(false);
  const [inlineMapReady, setInlineMapReady] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const validatePhone = (phone: string) => /^01[3-9]\d{8}$/.test(phone.trim());

  // Reverse geocode helper for inline map
  const inlineReverseGeocode = useCallback(async (latVal: number, lngVal: number) => {
    setInlineIsGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latVal}&lon=${lngVal}&accept-language=bn,en`
      );
      if (res.ok) {
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          const data = JSON.parse(text);
          const displayName = data.display_name || '';
          if (displayName) setInlineMapAddress(displayName);
          setLocation((prev) => ({ ...prev, address: displayName, lat: latVal, lng: lngVal }));
        }
      }
    } catch { /* silent */ } finally {
      setInlineIsGeocoding(false);
    }
  }, []);

  // Initialize inline map once the DOM node is available
  useEffect(() => {
    if (inlineMapReady || !inlineMapRef.current || inlineMapError) return;

    const initInlineMap = async () => {
      try {
        const L = await import('leaflet');
        if (!document.getElementById('leaflet-css-addshop')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-addshop';
          link.rel = 'stylesheet';
          link.href = '/vendor/leaflet/leaflet.css';
          document.head.appendChild(link);
        }
        if (!inlineMapRef.current) return;

        const initialLat = shopToEdit?.location?.lat ?? 23.8103;
        const initialLng = shopToEdit?.location?.lng ?? 90.4125;

        const map = L.map(inlineMapRef.current, {
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: false,
          zoomControl: false,
        }).setView([initialLat, initialLng], 14);
        inlineMapInstanceRef.current = map;

        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps',
          maxZoom: 20,
        }).addTo(map);

        const updateFromCenter = () => {
          const c = map.getCenter();
          setLocation((prev) => ({ ...prev, lat: c.lat, lng: c.lng }));
          inlineReverseGeocode(c.lat, c.lng);
        };

        map.on('dragend', updateFromCenter);
        map.on('click', (e: any) => {
          map.setView([e.latlng.lat, e.latlng.lng], 18, { animate: true });
          map.once('moveend', updateFromCenter);
        });

        setInlineMapReady(true);

        // If editing an existing shop with known coords, show them; else auto-locate
        if (shopToEdit?.location?.lat && shopToEdit.location.lng) {
          map.setView([shopToEdit.location.lat, shopToEdit.location.lng], 17, { animate: false });
          setInlineMapAddress(shopToEdit.location.address || '');
        } else if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude: lat, longitude: lng } = pos.coords;
              map.setView([lat, lng], 17, { animate: true });
              map.once('moveend', () => inlineReverseGeocode(lat, lng));
            },
            () => { inlineReverseGeocode(23.8103, 90.4125); },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
          );
        } else {
          inlineReverseGeocode(23.8103, 90.4125);
        }
      } catch {
        setInlineMapError(true);
      }
    };

    const t = setTimeout(initInlineMap, 80);
    return () => {
      clearTimeout(t);
      if (inlineMapInstanceRef.current) {
        inlineMapInstanceRef.current.remove();
        inlineMapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInlineSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineSearchQuery.trim() || !inlineMapInstanceRef.current) return;
    setInlineIsGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(inlineSearchQuery)}&limit=1&accept-language=bn,en&countrycodes=bd`
      );
      if (res.ok) {
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          const data = JSON.parse(text);
          if (data && data.length > 0) {
            const newLat = parseFloat(data[0].lat);
            const newLng = parseFloat(data[0].lon);
            inlineMapInstanceRef.current.setView([newLat, newLng], 18, { animate: true });
            inlineMapInstanceRef.current.once('moveend', () => inlineReverseGeocode(newLat, newLng));
          }
        }
      }
    } catch { /* silent */ } finally {
      setInlineIsGeocoding(false);
    }
  };

  const handleInlineCurrentLocation = () => {
    if (!navigator.geolocation || !inlineMapInstanceRef.current) return;
    setInlineIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        inlineMapInstanceRef.current.setView([lat, lng], 18, { animate: true });
        inlineMapInstanceRef.current.once('moveend', () => inlineReverseGeocode(lat, lng));
        setInlineIsLocating(false);
      },
      () => setInlineIsLocating(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  // Is the location properly pinned (different from the default fallback)?
  const isLocationPinned = !!(
    location.lat &&
    location.lng &&
    !(location.lat === 23.8103 && location.lng === 90.4125)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !ownerName.trim() || !ownerWhatsapp.trim() || !managerName.trim() || !managerWhatsapp.trim()) {
      setError('সকল তারকাচিহ্নিত (*) ঘর পূরণ করুন।');
      return;
    }
    if (!validatePhone(ownerWhatsapp)) {
      setError('মালিকের হোয়াটসঅ্যাপ নম্বর ১১ ডিজিটের সঠিক নম্বর হতে হবে (যেমন: 01712345678)।');
      return;
    }
    if (!validatePhone(managerWhatsapp)) {
      setError('ম্যানেজারের হোয়াটসঅ্যাপ নম্বর ১১ ডিজিটের সঠিক নম্বর হতে হবে।');
      return;
    }
    if (!isLocationPinned && !shopToEdit) {
      setError('অনুগ্রহ করে মানচিত্রে দোকানের সঠিক অবস্থান পিন করুন।');
      return;
    }
    const commPercent = commissionPercent !== '' ? parseFloat(commissionPercent) : 0;
    if (commissionPercent === '' || isNaN(commPercent) || commPercent < 0 || commPercent > 100) {
      setError('প্রতি অর্ডারে কমিশন শতাংশ ০% থেকে ১০০% এর মধ্যে হতে হবে।');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      // Build list of previous user IDs associated with this shop
      const prevAssignedIdsSet = new Set<string>();
      if (shopToEdit?.ownerUserId) prevAssignedIdsSet.add(shopToEdit.ownerUserId);
      if (shopToEdit?.assignedUserIds && Array.isArray(shopToEdit.assignedUserIds)) {
        shopToEdit.assignedUserIds.forEach((id) => {
          if (id) prevAssignedIdsSet.add(id);
        });
      }
      const prevAssignedIds = Array.from(prevAssignedIdsSet);

      // Primary owner = first in assignedUserIds
      let primaryOwner: UserProfile | null = null;
      if (assignedUserIds.length > 0) {
        primaryOwner = (await fallbackStore.getUserForUpdate(assignedUserIds[0])) || fallbackStore.users.get(assignedUserIds[0]) || null;
      }

      const shopData: Shop = {
        id: shopToEdit?.id || `shop-${Date.now()}`,
        name: storeName.trim(),
        type: storeType.trim(),
        description: storeDescription.trim() || undefined,
        contactPerson: ownerName.trim(),
        whatsapp: ownerWhatsapp.trim(),
        managerName: managerName.trim(),
        managerWhatsapp: managerWhatsapp.trim(),
        location,
        addedByHelperId: shopToEdit?.addedByHelperId || user?.uid,
        addedByHelperName: shopToEdit?.addedByHelperName || user?.displayName,
        ownerUserId: primaryOwner ? primaryOwner.uid : undefined,
        ownerUserEmail: primaryOwner ? (primaryOwner.email || primaryOwner.alternativePhone || '') : undefined,
        assignedUserIds: assignedUserIds.length > 0 ? [...assignedUserIds] : undefined,
        applicationId: shopToEdit?.applicationId,
        createdAt: shopToEdit?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        photoUrl: photoUrl.trim() || undefined,
        commissionPercent: commPercent,
        canReceiveOrders,
      };

      await fallbackStore.saveShop(shopData);

      // Grant store role to all newly assigned users
      for (const uid of assignedUserIds) {
        const assignedUser = (await fallbackStore.getUserForUpdate(uid)) || fallbackStore.users.get(uid);
        if (assignedUser) {
          const updatedUser: UserProfile = {
            ...assignedUser,
            isStore: true,
            isStoreApproved: true,
            storeId: shopData.id,
            role: 'store',
            lastActiveMode: 'store',
          };
          fallbackStore.users.set(uid, updatedUser);
          await fallbackStore.saveUser(updatedUser);
        }
      }

      // Revert users who were previously assigned but no longer in the list
      for (const prevUid of prevAssignedIds) {
        if (!assignedUserIds.includes(prevUid)) {
          // Check if user is assigned to any OTHER active shop
          const allOtherShops = Array.from(fallbackStore.shops.values()).filter((s) => s.id !== shopData.id);
          const otherShop = allOtherShops.find(
            (s) => s.ownerUserId === prevUid || (s.assignedUserIds && s.assignedUserIds.includes(prevUid))
          );

          const prevUser = (await fallbackStore.getUserForUpdate(prevUid)) || fallbackStore.users.get(prevUid);

          if (otherShop) {
            // User still has another shop assigned — point storeId to that shop
            if (prevUser) {
              const updatedUser: UserProfile = {
                ...prevUser,
                storeId: otherShop.id,
                isStore: true,
                isStoreApproved: true,
                role: 'store',
              };
              fallbackStore.users.set(prevUid, updatedUser);
              await fallbackStore.saveUser(updatedUser);
            }
          } else {
            // User has no other shop — completely revoke store permissions
            const resetUser: UserProfile = prevUser
              ? {
                  ...prevUser,
                  isStore: false,
                  isStoreApproved: false,
                  storeId: undefined,
                  role: prevUser.role === 'store' ? 'customer' : prevUser.role,
                  lastActiveMode: prevUser.lastActiveMode === 'store' ? 'customer' : prevUser.lastActiveMode,
                }
              : {
                  uid: prevUid,
                  displayName: 'User',
                  email: '',
                  role: 'customer',
                  isHelper: false,
                  isStore: false,
                  isStoreApproved: false,
                  storeId: undefined,
                  lastActiveMode: 'customer',
                  createdAt: new Date().toISOString(),
                };

            fallbackStore.users.set(prevUid, resetUser);
            await fallbackStore.saveUser(resetUser);

            // Directly clean Firestore document with null storeId and false flags
            try {
              await setDoc(
                doc(db, 'users', prevUid),
                {
                  isStore: false,
                  isStoreApproved: false,
                  storeId: null,
                  role: resetUser.role,
                  lastActiveMode: resetUser.lastActiveMode,
                },
                { merge: true }
              );
            } catch (_) {}

            // Clean up any lingering store applications for this user
            try {
              const appSnap = await getDocs(
                query(collection(db, 'storeApplications'), where('userId', '==', prevUid))
              );
              appSnap.forEach((d: any) => {
                fallbackStore.storeApplications.delete(d.id);
                deleteDoc(doc(db, 'storeApplications', d.id)).catch(() => {});
              });
            } catch (_) {}
          }
        }
      }

      fallbackStore.notify();

      if (onSaved) onSaved();
      onClose();
    } catch {
      setError('দোকানের তথ্য সংরক্ষণ করা সম্ভব হয়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center space-x-3 mb-5">
            <div className="p-3 rounded-2xl bg-purple-100">
              <Store className="w-6 h-6 text-purple-700" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">
                {shopToEdit ? 'দোকানের তথ্য সম্পাদনা' : 'নতুন দোকান যুক্ত করুন'}
              </h3>
              <p className="text-xs text-purple-600 font-semibold">
                {shopToEdit ? 'তথ্য সম্পাদনা করে সংরক্ষণ করুন' : 'দোকানের বিস্তারিত তথ্য পূরণ করুন'}
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-xs font-semibold flex items-center space-x-2 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 1. দোকানের নাম */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">দোকানের নাম *</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder={ph.storeName || 'যেমন: আলম জেনারেল স্টোর'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm font-semibold"
                required
              />
            </div>

            {/* 2. দোকানের ধরন (Custom Selector) */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">দোকানের ধরন *</label>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(true)}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-sm font-semibold bg-white flex items-center justify-between text-left"
              >
                <span className={storeType ? "text-gray-800" : "text-gray-400"}>{storeType || "দোকানের ধরন বেছে নিন"}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
            </div>

            {/* 2.1 অ্যাসাইনকৃত স্টোর ইউজার অ্যাকাউন্ট (Admin Shop Assignment) */}
            <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-purple-700" />
                  <span>স্টোর ইউজার অ্যাকাউন্ট অ্যাসাইন করুন</span>
                </label>
                <span className="text-[10px] font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                  {assignedUserIds.length} Assigned
                </span>
              </div>
              <p className="text-[11px] text-purple-800 leading-tight">
                নির্বাচিত ইউজাররা লগইন করলে সরাসরি এই দোকানের স্টোর মোড দেখতে পাবেন। একাধিক ইউজার একসাথে কাজ করতে পারবেন।
              </p>

              {/* Assigned users chips */}
              {assignedUserIds.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {assignedUserIds.map((uid, idx) => {
                    const assignedUser = allUsersList.find((u) => u.uid === uid);
                    if (!assignedUser) return null;
                    const initials = (assignedUser.displayName || 'U').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
                    return (
                      <div key={uid} className="flex items-center gap-2.5 p-2.5 bg-white rounded-xl border border-purple-200 shadow-xs">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs shrink-0">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-extrabold text-gray-900 truncate">{assignedUser.displayName}</p>
                          <p className="text-[10px] text-gray-500 font-mono truncate">
                            {assignedUser.email || assignedUser.alternativePhone || assignedUser.uid.slice(0, 10)}
                          </p>
                        </div>
                        {idx === 0 && (
                          <span className="text-[9px] font-black text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-full border border-indigo-200 uppercase shrink-0">Primary</span>
                        )}
                        <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full border border-emerald-200 uppercase shrink-0">Assigned</span>
                        <button
                          type="button"
                          onClick={() => setAssignedUserIds((prev) => prev.filter((id) => id !== uid))}
                          className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 transition-colors shrink-0"
                          title="Remove assignment"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder={assignedUserIds.length > 0 ? 'আরো ইউজার যোগ করুন...' : 'ইউজার নাম বা ইমেইল খুঁজুন...'}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-purple-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-xs font-semibold bg-white text-gray-800 placeholder-purple-300"
                />
              </div>

              {/* Filtered user list */}
              {userSearchQuery.trim() && (() => {
                const q = userSearchQuery.toLowerCase().trim();
                const filtered = eligibleUsers.filter((u) =>
                  !assignedUserIds.includes(u.uid) && (
                    u.displayName?.toLowerCase().includes(q) ||
                    u.email?.toLowerCase().includes(q) ||
                    u.alternativePhone?.includes(q) ||
                    u.uid.toLowerCase().includes(q)
                  )
                ).slice(0, 6);
                return (
                  <div className="border border-purple-200 rounded-xl overflow-hidden bg-white shadow-md max-h-48 overflow-y-auto">
                    {filtered.length === 0 ? (
                      <div className="p-3 text-center text-xs text-gray-400 font-medium">কোনো ইউজার পাওয়া যায়নি</div>
                    ) : (
                      filtered.map((u) => {
                        const initials = (u.displayName || 'U').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
                        return (
                          <button
                            key={u.uid}
                            type="button"
                            onClick={() => {
                              setAssignedUserIds((prev) => [...prev, u.uid]);
                              setUserSearchQuery('');
                              if (!ownerName.trim()) setOwnerName(u.displayName);
                              if (!ownerWhatsapp.trim() && u.alternativePhone) setOwnerWhatsapp(u.alternativePhone);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all border-b border-gray-50 last:border-0 hover:bg-purple-50/50"
                          >
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-[10px] shrink-0 bg-gradient-to-br from-gray-400 to-gray-500">
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-extrabold truncate text-gray-800">{u.displayName}</p>
                              <p className="text-[10px] text-gray-400 font-mono truncate">
                                {u.email || u.alternativePhone || u.uid.slice(0, 12)}
                              </p>
                            </div>
                            <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200 shrink-0">+ Add</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                );
              })()}

              {assignedUserIds.length === 0 && !userSearchQuery.trim() && (
                <p className="text-center text-[11px] text-purple-400 font-medium py-1">
                  কোনো ইউজার অ্যাসাইন করা হয়নি (Unassigned)
                </p>
              )}
            </div>


            {/* 3. মালিকের তথ্য */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">মালিকের তথ্য *</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder={ph.ownerName || 'মালিকের পুরো নাম'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm"
                required
              />
              <input
                type="tel"
                value={ownerWhatsapp}
                onChange={(e) => setOwnerWhatsapp(e.target.value)}
                placeholder={ph.ownerPhone || 'মালিকের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm"
                required
              />
            </div>

            {/* 4. ম্যানেজারের তথ্য */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">ম্যানেজারের তথ্য বা যিনি সবসময় Active থাকবেন *</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder={ph.managerName || 'ম্যানেজারের পুরো নাম'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm"
                required
              />
              <input
                type="tel"
                value={managerWhatsapp}
                onChange={(e) => setManagerWhatsapp(e.target.value)}
                placeholder={ph.managerPhone || 'ম্যানেজারের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)'}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm"
                required
              />
            </div>

            {/* 5. কমিশন */}
            <div className="space-y-1 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">
                প্রতি অর্ডারে কত শতাংশ কমিশন? *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(e.target.value)}
                  placeholder={ph.commissionPercent || 'যেমন: ৫'}
                  className="w-full p-3 pr-10 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-sm font-semibold"
                  required
                />
                <span className="absolute right-4 top-3.5 text-sm font-black text-gray-400">%</span>
              </div>
              <p className="text-[10px] text-gray-400">০% থেকে ১০০% পর্যন্ত কমিশন নির্ধারণ করা যাবে।</p>
            </div>

            {/* 5b. Order Receiving Capability Toggle */}
            <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-extrabold text-purple-950 block">অর্ডার গ্রহণ করার ক্ষমতা (Receive Order)</span>
                  <span className="text-[10px] font-semibold text-purple-800 block">
                    {canReceiveOrders ? 'হ্যাঁ - স্টোর অ্যাপের মাধ্যমে সরাসরি অর্ডার প্রসেস করতে পারবে' : 'না - এডমিন দ্বারা যুক্ত, হেলপার ম্যানুয়ালি স্ট্যাটাস ও প্রাইস পরিবর্তন করবে'}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={canReceiveOrders}
                  onClick={() => setCanReceiveOrders(!canReceiveOrders)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none shrink-0 ${
                    canReceiveOrders ? 'bg-purple-700' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                      canReceiveOrders ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* 6. পণ্য/সেবা */}
            <div className="space-y-1 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">দোকানে কী কী পণ্য/সেবা পাওয়া যায়?</label>
              <textarea
                value={storeDescription}
                onChange={(e) => setStoreDescription(e.target.value)}
                placeholder={ph.storeDescription || 'যেমন: চাল, ডাল, তেল, শ্যাম্পু, সাবান, টুথপেস্ট, বিভিন্ন গৃহস্থালী পণ্য...'}
                rows={3}
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm leading-relaxed resize-none"
              />
            </div>

            {/* 7. দোকানের সঠিক অবস্থান — inline map */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-600 block">দোকানের সঠিক অবস্থান *</label>
              <p className="text-[10px] text-gray-400">ম্যাপে স্ক্রোল বা ড্র্যাগ করে দোকানের সঠিক স্থানে পিন রাখুন</p>

              {/* Inline map container */}
              <div className="relative w-full rounded-2xl overflow-hidden border-2 border-purple-200" style={{ height: '220px' }}>
                {inlineMapError ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-amber-50 text-amber-900 gap-2 px-4 text-center">
                    <AlertTriangle className="w-7 h-7 text-amber-600" />
                    <p className="text-xs font-semibold">ম্যাপ লোড হতে সমস্যা হয়েছে।<br/>ইন্টারনেট সংযোগ পরীক্ষা করুন।</p>
                    <button
                      type="button"
                      onClick={() => setShowMapPicker(true)}
                      className="mt-2 px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold"
                    >
                      ম্যাপ পিকার খুলুন
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Search bar floating top of map */}
                    <form
                      onSubmit={handleInlineSearch}
                      className="absolute top-2 left-2 right-2 z-20 flex gap-1 p-1 bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-purple-100"
                    >
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="এলাকা বা দোকানের নাম খুঁজুন..."
                          value={inlineSearchQuery}
                          onChange={(e) => setInlineSearchQuery(e.target.value)}
                          className="w-full pl-7 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-purple-400 text-gray-900 placeholder-gray-400 font-medium"
                        />
                        <Search className="w-3.5 h-3.5 text-purple-500 absolute left-2 top-2" />
                      </div>
                      <button
                        type="submit"
                        disabled={inlineIsGeocoding}
                        className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 shrink-0"
                      >
                        {inlineIsGeocoding ? '...' : 'খুঁজুন'}
                      </button>
                    </form>

                    {/* Map canvas */}
                    <div ref={inlineMapRef} className="w-full h-full z-10" />

                    {/* Center pin */}
                    <div
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(100%-6px)] z-20 pointer-events-none flex flex-col items-center"
                      style={{ marginTop: '-16px' }}
                    >
                      <div className="bg-black text-lime-300 px-2 py-0.5 rounded-full text-[8px] font-extrabold whitespace-nowrap mb-0.5 animate-bounce" style={{ boxShadow: '0 0 8px 2px rgba(163,230,53,0.7)', border: '1px solid rgba(163,230,53,0.6)' }}>
                        এখানে পিন করুন
                      </div>
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center border-[3px] border-black"
                        style={{ background: 'linear-gradient(135deg, #a3e635 0%, #65a30d 100%)', boxShadow: '0 0 0 3px rgba(0,0,0,0.8), 0 0 12px 4px rgba(163,230,53,0.8)' }}
                      >
                        <MapPin className="w-5 h-5 text-black fill-lime-200" />
                      </div>
                      <div className="w-1 h-3 rounded-b-full" style={{ background: 'linear-gradient(to bottom, #1a1a1a, #000000)' }} />
                      <div className="w-3 h-1.5 rounded-full blur-[2px]" style={{ background: 'rgba(163,230,53,0.45)' }} />
                    </div>

                    {/* Current location button */}
                    <button
                      type="button"
                      onClick={handleInlineCurrentLocation}
                      disabled={inlineIsLocating}
                      className="absolute bottom-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-white transition-all active:scale-95 disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg, #a3e635 0%, #65a30d 100%)', boxShadow: '0 0 10px 2px rgba(163,230,53,0.5)' }}
                    >
                      <Navigation className={`w-3.5 h-3.5 ${inlineIsLocating ? 'animate-spin' : ''}`} />
                      <span>{inlineIsLocating ? 'খোঁজা হচ্ছে...' : 'বর্তমান পজিশন'}</span>
                    </button>
                  </>
                )}
              </div>

              {/* Address display below map */}
              {isLocationPinned && (
                <div className="flex items-start gap-1.5 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-emerald-700 font-semibold leading-snug">
                      {inlineMapAddress || location.address || `${location.lat?.toFixed(5)}, ${location.lng?.toFixed(5)}`}
                    </p>
                    <p className="text-[9px] text-emerald-500 font-mono mt-0.5">
                      📍 {location.lat?.toFixed(5)}, {location.lng?.toFixed(5)}
                    </p>
                  </div>
                </div>
              )}

              {/* Editing existing shop: also allow manual address edit */}
              {shopToEdit && (
                <input
                  type="text"
                  value={location.address}
                  onChange={(e) => setLocation({ ...location, address: e.target.value })}
                  placeholder="বা ঠিকানা সরাসরি টাইপ করুন..."
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-semibold outline-none focus:border-purple-500"
                />
              )}
            </div>

            {/* 8. ছবির URL (optional) */}
            <div className="space-y-1 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-700 block">
                দোকানের ছবির URL <span className="text-gray-400 font-medium">(ঐচ্ছিক)</span>
              </label>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://example.com/shop-photo.jpg"
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-xs font-semibold"
              />
              {photoUrl && (
                <div className="mt-2 rounded-2xl overflow-hidden border border-gray-200 h-28 bg-gray-50">
                  <img
                    src={photoUrl}
                    alt="Shop preview"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex space-x-2 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs transition-all"
              >
                বাতিল
              </button>
              <AsyncButton
                type="submit"
                isLoading={submitting}
                icon={<Check className="w-4 h-4" />}
                className="flex-1 py-3.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <span>{shopToEdit ? 'আপডেট করুন' : 'দোকান সংরক্ষণ করুন'}</span>
              </AsyncButton>
            </div>
          </form>
        </div>
      </div>

      {showMapPicker && (
        <MapPickerModal
          isOpen={showMapPicker}
          onClose={() => setShowMapPicker(false)}
          title="দোকানের অবস্থান পিন করুন"
          initialLocation={location}
          onSelectLocation={(loc) => {
            setLocation({
              address: loc.address || location.address || 'Selected Store Location',
              lat: loc.lat,
              lng: loc.lng,
            });
            setInlineMapAddress(loc.address || '');
            setShowMapPicker(false);
          }}
        />
      )}

      {/* Store Category Selection Modal (Matching Homepage service type dropdown) */}
      {isCategoryModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCategoryModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg md:max-w-xl h-[80vh] max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-purple-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0 bg-white">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-gray-900">দোকানের ধরন নির্বাচন করুন</h3>
                  <p className="text-[11px] text-gray-500 font-medium">দোকানের উপযুক্ত ক্যাটাগরি বেছে নিন</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-700 border border-rose-200/60 active:scale-95 transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search filter if many categories */}
            {storeTypes.length > 6 && (
              <div className="p-3 border-b border-gray-100 bg-gray-50/50">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                    placeholder="ক্যাটাগরি খুঁজুন..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:border-purple-500 outline-none text-xs font-semibold bg-white"
                  />
                </div>
              </div>
            )}

            {/* Scrollable List of Categories */}
            <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-gray-100 p-2 sm:p-3">
              {storeTypes
                .filter((t) => !categorySearchQuery.trim() || t.toLowerCase().includes(categorySearchQuery.toLowerCase().trim()))
                .map((t) => {
                  const isSelected = storeType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setStoreType(t);
                        setIsCategoryModalOpen(false);
                      }}
                      className={`w-full px-4 py-3.5 rounded-2xl text-left text-sm sm:text-base flex items-center justify-between transition-all cursor-pointer group mb-1.5 gap-3 ${
                        isSelected
                          ? 'bg-purple-50 text-purple-950 font-extrabold ring-1 ring-purple-300 shadow-xs'
                          : 'text-gray-700 font-semibold hover:bg-purple-50/50 hover:text-purple-900 active:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 sm:mt-1 ${
                            isSelected
                              ? 'bg-purple-600 ring-4 ring-purple-100'
                              : 'bg-gray-300 group-hover:bg-purple-400'
                          } transition-colors`}
                        />
                        <span className="leading-snug break-words text-left flex-1">{t}</span>
                      </div>
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white shrink-0 shadow-xs ring-2 ring-purple-500/30 ml-1">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-200 group-hover:border-purple-400 shrink-0 transition-colors ml-1" />
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
