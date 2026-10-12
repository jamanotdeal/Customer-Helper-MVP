'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, isUserAuthenticated } from '@/context/AuthContext';
import { useModal } from './CustomModal';
import { OrderItem, LocationData, Order, ServerAddress } from '@/types';
import { fallbackStore, saveCustomerSavedAddressToFirestore, saveCustomerPickupAddressToFirestore, initFcmMessaging } from '@/lib/firebase';
import { DEFAULT_INPUT_PLACEHOLDERS, DEFAULT_SERVICES, getServiceDescriptionHint, isOrderTimingOpen, calculateEstimatedFee, calculateDistanceKm } from '@/lib/pricing';
import { saveAltPhone, saveDefaultDeliveryLocation, getSavedAltPhone, getSavedDefaultDeliveryLocation, getServicePickupLocation, saveServicePickupLocation, getServiceDeliveryLocation, saveServiceDeliveryLocation, getSavedDeliveryAddresses, addSavedDeliveryAddress, getSavedPickupAddresses, addSavedPickupAddress, getPreviousCustomerContact } from '@/lib/storage';
import { MapPin, Navigation, Phone, ArrowRight, ChevronDown, Check, Clock, AlertTriangle, AlertCircle, Coins, Sparkles, Gift, X, Receipt, Plus, ShoppingBag } from 'lucide-react';
import { updateSEOMetadataClient } from '@/lib/seo';
import { formatShortAddress } from '@/utils/mapMarkerUtils';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { AsyncButton } from './ui/AsyncButton';
import { requestNativePushPermission } from '@/lib/native';
import { BlockedUserModal } from './BlockedUserModal';
import { StoreOffWarningModal } from './StoreOffWarningModal';
import { isShopOpenNow } from './StoreGrid';

interface RequestComposerProps {
  onOrderCreated: (order: Order) => void;
  selectedItems?: OrderItem[];
  onAddItem?: (item: OrderItem) => void;
  onRemoveItem?: (itemId: string) => void;
  onOpenCustomItemModal?: () => void;
}


/**
 * Whether `text` still names the place whose coordinates were picked for
 * `source`: the same address with details added or a word corrected, rather
 * than a different address typed over it. Most of the source's words must
 * still be there (a word typed halfway still counts).
 */
function describesSamePlace(source: string, text: string): boolean {
  const words = (s: string) => s.toLowerCase().split(/[\s,.\-/।#()]+/).filter((w) => w.length >= 2);
  const from = words(source);
  if (from.length === 0) return false;
  const now = words(text);
  const kept = from.filter((w) =>
    now.some((t) => t === w || (t.length >= 3 && w.startsWith(t)) || (w.length >= 3 && t.startsWith(w)))
  ).length;
  return kept / from.length >= 0.6;
}

export const RequestComposer: React.FC<RequestComposerProps> = ({
  onOrderCreated,
  selectedItems,
  onAddItem,
  onRemoveItem,
  onOpenCustomItemModal,
}) => {
  const { user, openAuthModal, updateCustomerPreferences, activeMode } = useAuth();
  const { showAlert, showConfirm } = useModal();

  const [isExpanded, setIsExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showStoreOffModal, setShowStoreOffModal] = useState(false);
  const [closedStoreNames, setClosedStoreNames] = useState<string[]>([]);
  const isStoreWarningAcceptedRef = useRef(false);

  // Auto-expand when items are added from store or custom item
  useEffect(() => {
    if (selectedItems && selectedItems.length > 0 && !isExpanded) {
      setIsExpanded(true);
    }
  }, [selectedItems, isExpanded]);

  // Main description ("Ki korte hobe?")
  const [description, setDescription] = useState('');


  // Optional pickup / source location
  const [pickupNote, setPickupNote] = useState('');

  // WhatsApp number — pre-filled if saved
  const [altPhone, setAltPhone] = useState('');

  // Delivery Location state — pre-filled if saved
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(undefined);
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(undefined);
  const [deliveryAddressId, setDeliveryAddressId] = useState<string | undefined>(undefined);

  // Pickup Location state
  const [pickupLat, setPickupLat] = useState<number | undefined>(undefined);
  const [pickupLng, setPickupLng] = useState<number | undefined>(undefined);
  const [pickupAddressId, setPickupAddressId] = useState<string | undefined>(undefined);

  // The address text each pair of coordinates was set for. Typing in the
  // address box changes only the text, so a customer who types a new address
  // over the pre-filled one kept the old place's coordinates: orders went out
  // pinned at the old spot, alerting helpers there instead of near the real
  // address, and that wrong pin was saved back under the new address text.
  // handleSubmit compares against these to drop coordinates that no longer fit.
  const deliveryCoordsTextRef = useRef('');
  const pickupCoordsTextRef = useRef('');
  // Every place that sets coordinates sets the matching text in the same update.
  useEffect(() => {
    if (deliveryLat !== undefined && deliveryLng !== undefined) deliveryCoordsTextRef.current = deliveryAddress;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryLat, deliveryLng]);
  useEffect(() => {
    if (pickupLat !== undefined && pickupLng !== undefined) pickupCoordsTextRef.current = pickupNote;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupLat, pickupLng]);

  // Saved address states (from localStorage & Firestore)
  const [savedAddresses, setSavedAddresses] = useState<LocationData[]>([]);
  const [savedPickupAddresses, setSavedPickupAddresses] = useState<LocationData[]>([]);

  // Previous unpaid due payment state
  const [unpaidDue, setUnpaidDue] = useState<{ totalAmount: number; notes: string[]; sourceOrderIds: string[] } | null>(null);

  // Free delivery / Discount via Coins state
  const [useFreeDelivery, setUseFreeDelivery] = useState(false);
  const [showInsufficientCoinsModal, setShowInsufficientCoinsModal] = useState(false);

  // Service selection state
  const [service, setService] = useState('');
  const [services, setServices] = useState<string[]>(
    fallbackStore.pricingSettings.services || DEFAULT_SERVICES
  );
  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);

  // Field validation errors
  const [errors, setErrors] = useState<{
    service?: string;
    description?: string;
    deliveryAddress?: string;
    altPhone?: string;
  }>({});

  // Close service modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isServiceDropdownOpen) {
        setIsServiceDropdownOpen(false);
      }
    };
    if (isServiceDropdownOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isServiceDropdownOpen]);

  // Check whether a service is in the no-save list
  const isNoSavePickupService = (svc: string): boolean => {
    const noSaveList = fallbackStore.pricingSettings.noSavePickupLocationServices || [];
    const lowerSvc = svc.trim().toLowerCase();
    return noSaveList.some((n) => n.trim().toLowerCase() === lowerSvc);
  };

  const userInitRef = useRef<string | null>(null);

  // When service changes, pre-fill pickup & delivery from previous used locations for this category
  const handleServiceChange = (newService: string) => {
    setService(newService);
    setErrors((prev) => ({ ...prev, service: undefined }));

    // 1. Pre-fill Pickup Address for this service category
    if (!isNoSavePickupService(newService)) {
      const rawPickup = getServicePickupLocation(newService, user?.uid);
      const savedPickup = fallbackStore.resolveLocation(rawPickup || undefined);
      const userPickupList = (user?.uid ? getSavedPickupAddresses(user.uid) : [])
        .map((p) => fallbackStore.resolveLocation(p) || p);
      if (savedPickup?.address) {
        setPickupNote(savedPickup.address.trim());
        setPickupLat(savedPickup.lat);
        setPickupLng(savedPickup.lng);
        setPickupAddressId(savedPickup.addressId);
        setSavedPickupAddresses(userPickupList.length > 0 ? userPickupList : [savedPickup]);
      } else if (userPickupList.length > 0) {
        setSavedPickupAddresses(userPickupList);
      } else {
        setPickupNote('');
        setPickupLat(undefined);
        setPickupLng(undefined);
        setPickupAddressId(undefined);
        setSavedPickupAddresses([]);
      }
    } else {
      setPickupNote('');
      setPickupLat(undefined);
      setPickupLng(undefined);
      setPickupAddressId(undefined);
      setSavedPickupAddresses([]);
    }

    // 2. Pre-fill Delivery Address for this service category (or fallback to default delivery address)
    const rawDelivery = getServiceDeliveryLocation(newService, user?.uid);
    const savedDelivery = fallbackStore.resolveLocation(rawDelivery || undefined);
    if (savedDelivery?.address) {
      setDeliveryAddress(savedDelivery.address.trim());
      setDeliveryLat(savedDelivery.lat);
      setDeliveryLng(savedDelivery.lng);
      setDeliveryAddressId(savedDelivery.addressId);
    } else {
      const rawDefaultLoc = getSavedDefaultDeliveryLocation() || user?.defaultDeliveryLocation;
      const defaultLoc = fallbackStore.resolveLocation(rawDefaultLoc);
      if (defaultLoc?.address) {
        setDeliveryAddress(defaultLoc.address.trim());
        setDeliveryLat(defaultLoc.lat);
        setDeliveryLng(defaultLoc.lng);
        setDeliveryAddressId(defaultLoc.addressId);
      }
    }
  };

  // Cycling placeholders synced from admin panel
  const [placeholders, setPlaceholders] = useState<string[]>(
    fallbackStore.pricingSettings.inputPlaceholders || DEFAULT_INPUT_PLACEHOLDERS
  );
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Pre-fill service from URL query param if present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const serviceParam = params.get('service');
      if (serviceParam) {
        handleServiceChange(serviceParam);
        setIsExpanded(true);
      }
    }
  }, [user?.uid]);

  // Update SEO metadata dynamically when selected service changes
  useEffect(() => {
    updateSEOMetadataClient(service);
  }, [service]);

  // Sync admin placeholders and services from store
  useEffect(() => {
    const syncPlaceholders = () => {
      const custom = fallbackStore.pricingSettings.inputPlaceholders;
      if (custom && custom.length > 0) {
        setPlaceholders(custom);
      }
      const customServices = fallbackStore.pricingSettings.services;
      if (customServices && customServices.length > 0) {
        setServices(customServices);
      }
    };
    syncPlaceholders();
    const unsub = fallbackStore.subscribe(syncPlaceholders);
    return () => unsub();
  }, []);

  // Pre-fill phone and delivery location once on login / initial mount
  useEffect(() => {
    if (user?.uid && userInitRef.current !== user.uid) {
      userInitRef.current = user.uid;
      const contact = getPreviousCustomerContact(
        user,
        Array.from(fallbackStore.orders.values())
      );
      if (contact.phone) setAltPhone(contact.phone);

      const rawDefaultLoc = contact.location || getSavedDefaultDeliveryLocation() || user.defaultDeliveryLocation;
      const savedLoc = fallbackStore.resolveLocation(rawDefaultLoc);
      if (savedLoc?.address) {
        setDeliveryAddress(savedLoc.address.trim());
        if (savedLoc.lat) setDeliveryLat(savedLoc.lat);
        if (savedLoc.lng) setDeliveryLng(savedLoc.lng);
        if (savedLoc.addressId) setDeliveryAddressId(savedLoc.addressId);
      }

      // Load saved delivery addresses from localStorage (populated from Firestore on login)
      const addresses = getSavedDeliveryAddresses(user.uid)
        .map((a) => fallbackStore.resolveLocation(a) || a);
      setSavedAddresses(addresses);

      // Load saved pickup addresses from localStorage (populated from Firestore on login)
      const pickupAddresses = getSavedPickupAddresses(user.uid)
        .map((p) => fallbackStore.resolveLocation(p) || p);
      if (pickupAddresses.length > 0) {
        setSavedPickupAddresses(pickupAddresses);
      }
    }
  }, [user?.uid]);

  // Sync customer's unpaid due payments from previous completed orders
  useEffect(() => {
    if (!user?.uid) {
      setUnpaidDue(null);
      return;
    }
    const syncDue = () => {
      const due = fallbackStore.getCustomerUnpaidDuePayments(user.uid);
      setUnpaidDue(due);
    };
    syncDue();
    const unsub = fallbackStore.subscribe(syncDue);
    return () => unsub();
  }, [user?.uid]);

  // Live auto-update pre-filled address and suggestions when server addresses change
  useEffect(() => {
    const syncServerAddresses = () => {
      // 1. If delivery address was set from an address with ID or matches a server address
      if (deliveryAddressId && fallbackStore.serverAddresses.has(deliveryAddressId)) {
        const sa = fallbackStore.serverAddresses.get(deliveryAddressId)!;
        if (sa.address && sa.address !== deliveryAddress) {
          setDeliveryAddress(sa.address);
        }
        if (typeof sa.lat === 'number' && sa.lat !== deliveryLat) {
          setDeliveryLat(sa.lat);
        }
        if (typeof sa.lng === 'number' && sa.lng !== deliveryLng) {
          setDeliveryLng(sa.lng);
        }
      } else if (deliveryAddress) {
        const norm = deliveryAddress.trim().toLowerCase();
        const matched = Array.from(fallbackStore.serverAddresses.values()).find(
          (s) => s.address && s.address.trim().toLowerCase() === norm
        );
        if (matched) {
          if (matched.address !== deliveryAddress) setDeliveryAddress(matched.address);
          if (matched.id !== deliveryAddressId) setDeliveryAddressId(matched.id);
          if (typeof matched.lat === 'number' && matched.lat !== deliveryLat) setDeliveryLat(matched.lat);
          if (typeof matched.lng === 'number' && matched.lng !== deliveryLng) setDeliveryLng(matched.lng);
        }
      }

      // 2. If pickup address was set from an address with ID or matches a server address
      if (pickupAddressId && fallbackStore.serverAddresses.has(pickupAddressId)) {
        const sa = fallbackStore.serverAddresses.get(pickupAddressId)!;
        if (sa.address && sa.address !== pickupNote) {
          setPickupNote(sa.address);
        }
        if (typeof sa.lat === 'number' && sa.lat !== pickupLat) {
          setPickupLat(sa.lat);
        }
        if (typeof sa.lng === 'number' && sa.lng !== pickupLng) {
          setPickupLng(sa.lng);
        }
      } else if (pickupNote) {
        const norm = pickupNote.trim().toLowerCase();
        const matched = Array.from(fallbackStore.serverAddresses.values()).find(
          (s) => s.address && s.address.trim().toLowerCase() === norm
        );
        if (matched) {
          if (matched.address !== pickupNote) setPickupNote(matched.address);
          if (matched.id !== pickupAddressId) setPickupAddressId(matched.id);
          if (typeof matched.lat === 'number' && matched.lat !== pickupLat) setPickupLat(matched.lat);
          if (typeof matched.lng === 'number' && matched.lng !== pickupLng) setPickupLng(matched.lng);
        }
      }

      // 3. Update saved delivery / pickup address lists with resolved values
      if (user?.uid) {
        const updatedDelivery = getSavedDeliveryAddresses(user.uid)
          .map((a) => fallbackStore.resolveLocation(a) || a);
        setSavedAddresses(updatedDelivery);

        const updatedPickup = getSavedPickupAddresses(user.uid)
          .map((p) => fallbackStore.resolveLocation(p) || p);
        if (updatedPickup.length > 0) {
          setSavedPickupAddresses(updatedPickup);
        }
      }
    };

    const unsub = fallbackStore.subscribe(syncServerAddresses);
    return () => unsub();
  }, [deliveryAddressId, deliveryAddress, deliveryLat, deliveryLng, pickupAddressId, pickupNote, pickupLat, pickupLng, user?.uid]);

  const pendingExpandAfterLogin = useRef(false);

  useEffect(() => {
    if (isUserAuthenticated(user) && pendingExpandAfterLogin.current) {
      pendingExpandAfterLogin.current = false;
      setIsExpanded(true);
    }
  }, [user]);

  // Rotate placeholder every 2.8 s
  useEffect(() => {
    if (placeholders.length <= 1) return;
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [placeholders]);

  const rawPlaceholder = placeholders[placeholderIndex] || 'আপনাকে কীভাবে Help করতে পারি? যেমন: বাজার করতে হবে, ওষুধ আনতে হবে';
  const currentPlaceholder = rawPlaceholder.replace(/(\.{2,}|…)$/, '').trim();

  // Handle focus / click on main input (Guard unauthenticated users & blocked users)
  const handleInputInteract = () => {
    if (!isUserAuthenticated(user)) {
      pendingExpandAfterLogin.current = true;
      openAuthModal();
      return;
    }
    if (user.isBlocked) {
      setShowBlockedModal(true);
      return;
    }
    setIsExpanded(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isUserAuthenticated(user)) {
      openAuthModal();
      return;
    }

    if (user.isBlocked) {
      setShowBlockedModal(true);
      return;
    }

    const activeItems = (selectedItems && selectedItems.length > 0) ? selectedItems : [];
    const effectiveService = service || (activeItems.length > 0 ? 'বাজার-সদাই করে দিন' : '');

    const newErrors: typeof errors = {};

    if (!effectiveService || !effectiveService.trim()) {
      newErrors.service = 'সার্ভিস সিলেক্ট করা বাধ্যতামূলক';
    }

    if (!description.trim() && activeItems.length === 0) {
      newErrors.description = 'কী করতে হবে তার বিবরণ লিখুন অথবা পণ্য যোগ করুন';
    }

    if (!deliveryAddress.trim()) {
      newErrors.deliveryAddress = 'ডেলিভারি ঠিকানা সিলেক্ট করুন';
    }

    if (!altPhone.trim()) {
      newErrors.altPhone = 'হোয়াটসঅ্যাপ নম্বর দিন';
    } else if (!/^01[3-9]\d{8}$/.test(altPhone.trim())) {
      newErrors.altPhone = 'সঠিক ১১ ডিজিটের মোবাইল নম্বর লিখুন (যেমন: 01712345678)';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Requirement 3: Check if any item belongs to a store that is off/closed
    if (!isStoreWarningAcceptedRef.current && activeItems.length > 0) {
      const closedStores: string[] = [];
      for (const it of activeItems) {
        if (it.storeId) {
          const sh = fallbackStore.shops.get(it.storeId);
          if (sh && !isShopOpenNow(sh)) {
            if (!closedStores.includes(sh.name)) {
              closedStores.push(sh.name);
            }
          }
        }
      }
      if (closedStores.length > 0) {
        setClosedStoreNames(closedStores);
        setShowStoreOffModal(true);
        return;
      }
    }
    isStoreWarningAcceptedRef.current = false;

    setErrors({});

    const isConfirmed = await showConfirm(
      'Confirm Your Request',
      'আপনি কি নিশ্চিতভাবে এই অনুরোধটি সাবমিট করতে চান?',
      'Yes, Submit Request',
      'Cancel'
    );

    if (!isConfirmed) {
      return;
    }


    setSubmitting(true);

    try {
      // Save preferences
      saveAltPhone(altPhone);

      // 0. Coordinates left over from an address the customer has since typed
      //    over describe the old place, not this one. Send the order without
      //    them (and without the old address id) rather than pinned there.
      const deliveryCoordsFit = deliveryLat !== undefined && deliveryLng !== undefined
        && describesSamePlace(deliveryCoordsTextRef.current, deliveryAddress);
      const orderDeliveryLat = deliveryCoordsFit ? deliveryLat : undefined;
      const orderDeliveryLng = deliveryCoordsFit ? deliveryLng : undefined;
      const pickupCoordsFit = pickupLat !== undefined && pickupLng !== undefined
        && describesSamePlace(pickupCoordsTextRef.current, pickupNote);
      const orderPickupLat = pickupCoordsFit ? pickupLat : undefined;
      const orderPickupLng = pickupCoordsFit ? pickupLng : undefined;

      // 1. Resolve delivery + pickup addresses IN PARALLEL (no need to do them sequentially)
      let finalDeliveryAddressText = deliveryAddress.trim();
      let effectiveDelivAddressId = deliveryCoordsFit ? deliveryAddressId : undefined;
      let finalPickupAddressText = pickupNote.trim();
      let effectivePickupAddressId = pickupCoordsFit ? pickupAddressId : undefined;

      const [delivResult, pickResult] = await Promise.allSettled([
        finalDeliveryAddressText
          ? fallbackStore.recordOrUpsertServerAddress(finalDeliveryAddressText, { lat: orderDeliveryLat, lng: orderDeliveryLng })
          : Promise.resolve(null),
        finalPickupAddressText
          ? fallbackStore.recordOrUpsertServerAddress(finalPickupAddressText, { lat: orderPickupLat, lng: orderPickupLng })
          : Promise.resolve(null),
      ]);

      if (delivResult.status === 'fulfilled' && delivResult.value?.id) {
        effectiveDelivAddressId = delivResult.value.id;
        finalDeliveryAddressText = delivResult.value.address;
      }
      if (pickResult.status === 'fulfilled' && pickResult.value?.id) {
        effectivePickupAddressId = pickResult.value.id;
        finalPickupAddressText = pickResult.value.address;
      }

      const finalDelivLoc: LocationData = {
        address: finalDeliveryAddressText,
        lat: orderDeliveryLat,
        lng: orderDeliveryLng,
        addressId: effectiveDelivAddressId,
      };
      saveDefaultDeliveryLocation(finalDelivLoc);
      if (service) {
        saveServiceDeliveryLocation(service, finalDelivLoc, user?.uid);
      }
      updateCustomerPreferences(altPhone, finalDelivLoc, undefined);

      if (user?.uid && finalDeliveryAddressText) {
        const updated = addSavedDeliveryAddress(user.uid, finalDelivLoc);
        setSavedAddresses(updated);
        saveCustomerSavedAddressToFirestore(user.uid, finalDelivLoc).catch(() => {});
      }

      let pickupLoc: LocationData | undefined = undefined;
      if (finalPickupAddressText) {
        pickupLoc = {
          address: finalPickupAddressText,
          lat: orderPickupLat,
          lng: orderPickupLng,
          addressId: effectivePickupAddressId,
        };

        if (service && !isNoSavePickupService(service)) {
          saveServicePickupLocation(service, pickupLoc, user?.uid);
        }
        if (user?.uid) {
          const updated = addSavedPickupAddress(user.uid, pickupLoc);
          setSavedPickupAddresses(updated);
          saveCustomerPickupAddressToFirestore(user.uid, pickupLoc, service).catch(() => {});
        }
      }

      // Build final items from selected items or description
      const finalItems: OrderItem[] = activeItems.length > 0
        ? activeItems
        : [{
            id: 'item-1',
            name: description.trim(),
            qty: '1',
          }];

      const targetShopIds = Array.from(new Set(finalItems.map((it) => it.storeId).filter(Boolean))) as string[];
      const pricedTotal = finalItems.reduce(
        (acc, it) => acc + (it.price ? it.price * (parseInt(it.qty || '1', 10) || 1) : 0),
        0
      );

      // Calculate initial estimated delivery fee
      const distKm = (orderPickupLat && orderPickupLng && orderDeliveryLat && orderDeliveryLng)
        ? calculateDistanceKm(orderPickupLat, orderPickupLng, orderDeliveryLat, orderDeliveryLng)
        : 0;
      const estdFee = calculateEstimatedFee({
        distanceKm: Math.ceil(distKm),
        weightKg: 0,
        isReturnRequested: false,
        productPrice: pricedTotal,
      }, fallbackStore.pricingSettings).totalFee;
      const initialFee = Math.max(estdFee, fallbackStore.pricingSettings.feeCalculatorMinFee ?? 20);

      const reqCoins = fallbackStore.pricingSettings.freeDeliveryRequiredCoins ?? 50;
      const isFree = useFreeDelivery && (user.coins || 0) >= reqCoins;
      const discountPct = fallbackStore.pricingSettings.freeDeliveryDiscountPercent ?? 100;
      const finalDeliveryFee = isFree
        ? (discountPct === 100 ? 0 : Math.round(initialFee * (100 - discountPct) / 100))
        : initialFee;

      const isStoreUser = Boolean(
        user.isStoreApproved ||
        user.role === 'store' ||
        Boolean(user.storeId) ||
        (activeMode as string) === 'store'
      );

      // Generate unique order ID
      let orderNum = Math.floor(Math.random() * 90000) + 10000;
      while (fallbackStore.orders.has(`${orderNum}`)) {
        orderNum = Math.floor(Math.random() * 900000) + 100000;
      }
      const newOrder: Order = {
        id: `${orderNum}`,
        customerId: user.uid,
        customerName: user.displayName || 'Customer',
        customerPhone: altPhone,
        alternativePhone: altPhone,
        title: effectiveService || (finalItems.length === 1 ? finalItems[0].name : `${finalItems[0].name} ইত্যাদি`),
        service: effectiveService,
        items: finalItems,
        productCost: pricedTotal > 0 ? pricedTotal : undefined,
        shopId: targetShopIds[0] || undefined,
        selectedShopIds: targetShopIds.length > 0 ? targetShopIds : undefined,
        missingItemPreference: undefined,
        pickupLocation: pickupLoc,
        deliveryLocation: finalDelivLoc,
        additionalNote: undefined,
        status: 'PENDING',

        deliveryFee: finalDeliveryFee,
        originalDeliveryFee: initialFee,
        isFreeDelivery: isFree,
        deliveryDiscountPercent: isFree ? discountPct : undefined,
        coinsRedeemedForDelivery: isFree ? reqCoins : undefined,
        isStoreOrder: isStoreUser,
        creatorRole: isStoreUser ? 'store' : (user.isHelper ? 'helper' : 'customer'),
        appliedDuePayment: (unpaidDue && unpaidDue.totalAmount > 0)
          ? {
              amount: unpaidDue.totalAmount,
              note: unpaidDue.notes.join('; ') || 'পূর্বের বকেয়া বাকি',
              sourceOrderIds: unpaidDue.sourceOrderIds,
            }
          : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        statusHistory: [
          {
            id: `sh-${Date.now()}`,
            status: 'PENDING',
            timestamp: new Date().toISOString(),
            actor: isStoreUser ? 'Store' : 'Customer',
            note: isFree ? `Request created (Free Delivery via ${reqCoins} Coins)` : 'Request created',
          },
        ],
      };

      // Save to server first (awaited — order must be confirmed on Firestore before proceeding)
      await fallbackStore.addOrder(newOrder);

      // Reset form fields
      setDescription('');
      setService('');
      setIsServiceDropdownOpen(false);
      setPickupNote('');
      setPickupLat(undefined);
      setPickupLng(undefined);
      setPickupAddressId(undefined);
      setDeliveryAddressId(undefined);
      setIsExpanded(false);
      setSubmitting(false);

      // Prompt notification permission in background — must NOT block submit flow
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
        requestNativePushPermission()
          .then((granted) => {
            if (granted && user?.uid) {
              initFcmMessaging(user.uid).catch(() => {});
            }
          })
          .catch(() => {});
      }

      // Show admin-configured confirmation message modal
      const confirmMsg =
        fallbackStore.pricingSettings.orderConfirmationMessage ||
        'আমরা আপনার অনুরোধটি পেয়েছি। শীঘ্রই একজন হেলপার গ্রহণ করবেন।';
      await showAlert('ধন্যবাদ!', confirmMsg, 'success');

      // Redirect user to order details page when they click the modal button
      onOrderCreated(newOrder);
    } catch (err: any) {
      console.error('[RequestComposer] Order creation failed:', err);
      await showAlert('ত্রুটি', err?.message || 'রিকোয়েস্ট সাবমিট করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const timingStatus = isOrderTimingOpen(fallbackStore.pricingSettings);

  return (
    <div className="w-full bg-white rounded-3xl shadow-xl shadow-emerald-950/5 border border-emerald-100 p-4 sm:p-6 transition-all duration-300">
      {user?.isBlocked && (
        <div
          onClick={() => setShowBlockedModal(true)}
          className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 flex items-start space-x-3 cursor-pointer hover:bg-red-100/70 transition-colors shadow-xs"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-extrabold text-xs sm:text-sm text-red-950">আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত করা হয়েছে</h4>
            <p className="text-[11px] text-red-800 font-medium">
              নিরাপত্তা বা নীতিমালার কারণে নতুন রিকোয়েস্ট তৈরি করা সাময়িকভাবে বন্ধ আছে। বিস্তারিত জানতে ক্লিক করুন।
            </p>
          </div>
        </div>
      )}

      {user && !timingStatus.isOpen ? (
        <div className="text-center py-6 px-4 space-y-4 animate-in fade-in duration-300">
          <div className="inline-flex p-4 rounded-3xl bg-amber-50 border border-amber-200 text-amber-800 shadow-xs">
            <Clock className="w-8 h-8 animate-pulse text-amber-700" />
          </div>
          <div className="space-y-2">
            <h3 className="font-extrabold text-base text-gray-900">অনুরোধ গ্রহণ সাময়িকভাবে বন্ধ আছে</h3>
            <p className="text-xs font-semibold text-emerald-800 bg-emerald-50/80 border border-emerald-100 px-4 py-2 rounded-2xl inline-block leading-relaxed">
              {timingStatus.message}
            </p>
          </div>
          <p className="text-[11px] text-gray-400 font-medium">
            পরবর্তীতে পুনরায় চেষ্টা করার জন্য অনুরোধ করা হলো। ধন্যবাদ!
          </p>
        </div>
      ) : (
        <>
          {/* Header */}
          <button
            type="button"
            onClick={handleInputInteract}
            className="w-full text-center mb-4 group outline-none"
          >
            <h2 className="font-extrabold text-lg text-gray-900 mb-1">আপনাকে কীভাবে Help করতে পারি?</h2>
            <div className="min-h-[2.75rem] sm:min-h-[2.5rem] flex items-center justify-center my-1.5 relative select-none w-full px-2 max-w-xl mx-auto transition-all duration-300">
              <p
                key={placeholderIndex}
                className="text-[15px] sm:text-base font-bold text-emerald-600 animate-slide-up-fade px-2 text-center break-words whitespace-normal leading-relaxed w-full"
              >
                {currentPlaceholder}
              </p>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">আপনার কাজটি বলুন — আমরা বাকিটা সামলে নেব।</p>
          </button>

          <form onSubmit={handleSubmit} className="space-y-3">

            {/* Expanded Form Fields */}
            {isExpanded && user && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">

                {/* Service Selection Trigger Button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsServiceDropdownOpen(true)}
                    className={`w-full px-4 py-3.5 rounded-2xl border text-left flex items-center justify-between text-sm sm:text-base transition-all duration-200 cursor-pointer select-none ${
                      isServiceDropdownOpen
                        ? 'border-emerald-500 ring-4 ring-emerald-500/20 bg-white shadow-xl'
                        : errors.service
                        ? 'border-red-400 bg-red-50/20 ring-2 ring-red-100'
                        : 'border-gray-200 bg-white hover:border-emerald-300'
                    }`}
                    aria-haspopup="dialog"
                    aria-expanded={isServiceDropdownOpen}
                  >
                    <div className="flex items-start sm:items-center gap-2.5 flex-1 min-w-0 pr-2">
                      <Sparkles className={`w-4 h-4 shrink-0 mt-0.5 sm:mt-0 ${service ? 'text-emerald-600' : 'text-gray-400'}`} />
                      <span className={`text-left leading-snug break-words ${service ? 'text-gray-900 font-bold' : 'text-gray-400 font-medium'}`}>
                        {service || 'সার্ভিস সিলেক্ট করুন *'}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 shrink-0 ml-2 ${
                        isServiceDropdownOpen ? 'rotate-180 text-emerald-600' : 'text-gray-400'
                      }`}
                    />
                  </button>

                  {errors.service && !isServiceDropdownOpen && (
                    <p className="text-[11px] font-semibold text-red-500 mt-1 pl-1 flex items-center gap-1 animate-in fade-in duration-150">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.service}</span>
                    </p>
                  )}
                </div>

                {/* Selected Items Card (Store Products & Custom Items) */}
                {selectedItems && selectedItems.length > 0 && (
                  <div className="bg-white rounded-2xl border border-emerald-200/90 p-3.5 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-gray-900 flex items-center gap-1.5">
                        <ShoppingBag className="w-4 h-4 text-emerald-600" />
                        <span>নির্বাচিত পণ্যসমূহ ({selectedItems.length})</span>
                      </span>
                      {onOpenCustomItemModal && (
                        <button
                          type="button"
                          onClick={onOpenCustomItemModal}
                          className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100"
                        >
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          <span>+ কাস্টম আইটেম যোগ করুন</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {selectedItems.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50/80 border border-gray-100 text-xs"
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-gray-900 truncate">
                                {it.name}
                              </span>
                              {it.qty && (
                                <span className="text-[10px] bg-gray-200/80 text-gray-700 px-1.5 py-0.2 rounded font-bold">
                                  {it.qty}
                                </span>
                              )}
                              {it.isCustom && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-extrabold">
                                  Custom Item
                                </span>
                              )}
                            </div>
                            {it.buyFrom && (
                              <p className="text-[10px] text-gray-500 truncate mt-0.5">
                                কোথা থেকে: {it.buyFrom}
                              </p>
                            )}
                            {it.storeName && (
                              <p className="text-[10px] text-emerald-700 font-medium truncate mt-0.5">
                                দোকান: {it.storeName}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            {it.isCustom ? (
                              <span className="font-extrabold text-amber-800 font-mono bg-amber-100 px-2 py-0.5 rounded-md text-[11px]">
                                N/A
                              </span>
                            ) : it.price !== undefined ? (
                              <span className="font-bold text-gray-900 font-mono bg-white px-2 py-0.5 rounded-md border border-gray-200 text-xs">
                                ৳{it.price}
                              </span>
                            ) : null}
                            {onRemoveItem && (
                              <button
                                type="button"
                                onClick={() => onRemoveItem(it.id)}
                                className="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                title="বাদ দিন"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description box */}
                <div className="relative">

                  <textarea
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
                    }}
                    placeholder={getServiceDescriptionHint(service, fallbackStore.pricingSettings)}
                    className={`w-full px-4 py-3 rounded-2xl border outline-none text-sm text-gray-900 resize-none h-28 placeholder-gray-400 transition-colors ${
                      errors.description
                        ? 'border-red-400 bg-red-50/20 ring-2 ring-red-100 focus:border-red-500'
                        : 'border-emerald-200 bg-emerald-50/40 focus:border-emerald-500'
                    }`}
                  />
                  {errors.description && (
                    <p className="text-[11px] font-semibold text-red-500 mt-1 pl-1 flex items-center gap-1 animate-in fade-in duration-150">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.description}</span>
                    </p>
                  )}
                </div>

                {/* Pickup / Source Location (optional) */}
                <div>
                  <AddressAutocompleteInput
                    id="pickup-address-input"
                    label="কোথা থেকে আনতে হবে বা করতে হবে? (ঐচ্ছিক)"
                    value={pickupNote}
                    userLocation={
                      pickupLat && pickupLng
                        ? { lat: pickupLat, lng: pickupLng }
                        : deliveryLat && deliveryLng
                        ? { lat: deliveryLat, lng: deliveryLng }
                        : user?.defaultDeliveryLocation?.lat && user?.defaultDeliveryLocation?.lng
                        ? { lat: user.defaultDeliveryLocation.lat, lng: user.defaultDeliveryLocation.lng }
                        : undefined
                    }
                    onChange={(val, loc) => {
                      setPickupNote(val);
                      if (loc) {
                        setPickupLat(loc.lat);
                        setPickupLng(loc.lng);
                        setPickupAddressId(loc.addressId);
                      } else if (!val.trim()) {
                        setPickupLat(undefined);
                        setPickupLng(undefined);
                        setPickupAddressId(undefined);
                      }
                    }}
                    onSelectSuggestion={(loc) => {
                      setPickupNote(loc.address);
                      setPickupLat(loc.lat);
                      setPickupLng(loc.lng);
                      setPickupAddressId(loc.addressId);
                    }}
                    placeholder="কোথা থেকে নিতে হবে? (যেমন: আরিফ স্টোর, আশুলিয়া বাজার)"
                    icon={<MapPin className="w-4 h-4" />}
                    serviceCategory={service}
                    savedLocalAddresses={savedPickupAddresses}
                  />
                </div>

                {/* Delivery Address */}
                <div>
                  <AddressAutocompleteInput
                    id="delivery-address-input"
                    label="ডেলিভারি ঠিকানা"
                    required
                    value={deliveryAddress}
                    userLocation={
                      deliveryLat && deliveryLng
                        ? { lat: deliveryLat, lng: deliveryLng }
                        : pickupLat && pickupLng
                        ? { lat: pickupLat, lng: pickupLng }
                        : user?.defaultDeliveryLocation?.lat && user?.defaultDeliveryLocation?.lng
                        ? { lat: user.defaultDeliveryLocation.lat, lng: user.defaultDeliveryLocation.lng }
                        : undefined
                    }
                    onChange={(val, loc) => {
                      setDeliveryAddress(val);
                      if (errors.deliveryAddress) setErrors((prev) => ({ ...prev, deliveryAddress: undefined }));
                      if (loc) {
                        setDeliveryLat(loc.lat);
                        setDeliveryLng(loc.lng);
                        setDeliveryAddressId(loc.addressId);
                      } else if (!val.trim()) {
                        setDeliveryLat(undefined);
                        setDeliveryLng(undefined);
                        setDeliveryAddressId(undefined);
                      }
                    }}
                    onSelectSuggestion={(loc) => {
                      setDeliveryAddress(loc.address);
                      if (errors.deliveryAddress) setErrors((prev) => ({ ...prev, deliveryAddress: undefined }));
                      setDeliveryLat(loc.lat);
                      setDeliveryLng(loc.lng);
                      setDeliveryAddressId(loc.addressId);
                    }}
                    placeholder="আপনার বাসার ঠিকানা (যেমন: ৪এ, রহমান ভিলা, মডেল টাউন) *"
                    icon={<Navigation className="w-4 h-4" />}
                    error={errors.deliveryAddress}
                    serviceCategory={service}
                    savedLocalAddresses={savedAddresses}
                  />
                  {errors.deliveryAddress && (
                    <p className="text-[11px] font-semibold text-red-500 mt-1 pl-1 flex items-center gap-1 animate-in fade-in duration-150">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.deliveryAddress}</span>
                    </p>
                  )}
                </div>

                {/* WhatsApp Number */}
                <div className="relative">
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="tel"
                      value={altPhone}
                      onChange={(e) => {
                        setAltPhone(e.target.value);
                        if (errors.altPhone) setErrors((prev) => ({ ...prev, altPhone: undefined }));
                      }}
                      placeholder="হোয়াটসঅ্যাপ নম্বর *"
                      className={`w-full pl-10 pr-4 py-3 rounded-2xl border outline-none text-sm text-gray-900 placeholder-gray-400 transition-colors ${
                        errors.altPhone
                          ? 'border-red-400 bg-red-50/20 ring-2 ring-red-100 focus:border-red-500'
                          : 'border-gray-200 bg-white focus:border-emerald-500'
                      }`}
                    />
                  </div>
                  {errors.altPhone && (
                    <p className="text-[11px] font-semibold text-red-500 mt-1 pl-1 flex items-center gap-1 animate-in fade-in duration-150">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.altPhone}</span>
                    </p>
                  )}
                </div>

                {/* Free Delivery / Coins Discount Checkbox Card */}
                {(() => {
                  const reqCoins = fallbackStore.pricingSettings.freeDeliveryRequiredCoins ?? 50;
                  const userCoins = user?.coins || 0;
                  const hasEnough = userCoins >= reqCoins;

                  return (
                    <div
                      onClick={() => {
                        if (!isUserAuthenticated(user)) {
                          openAuthModal();
                          return;
                        }
                        if (!hasEnough) {
                          setShowInsufficientCoinsModal(true);
                          return;
                        }
                        setUseFreeDelivery(!useFreeDelivery);
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                        useFreeDelivery
                          ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20 shadow-xs'
                          : 'bg-gradient-to-r from-amber-50/50 via-yellow-50/30 to-amber-50/50 border-amber-200/70 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={useFreeDelivery}
                          onChange={() => {}} // Handled by container click
                          className="w-4 h-4 accent-amber-600 rounded cursor-pointer shrink-0 pointer-events-none"
                        />
                        <span className="text-xs sm:text-sm font-bold text-gray-900">
                          Get Free Delivery!
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Previous Unpaid Due Payment Card */}
                {unpaidDue && unpaidDue.totalAmount > 0 && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1 text-xs">
                    <div className="flex items-center justify-between font-bold text-amber-900">
                      <span className="flex items-center space-x-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>পূর্বের বাকি পেমেন্ট (Previous Due Payment)</span>
                      </span>
                      <span className="font-extrabold text-sm text-red-600">+৳{unpaidDue.totalAmount}</span>
                    </div>
                    {unpaidDue.notes.length > 0 && (
                      <p className="text-[11px] text-amber-800 font-medium pl-5.5">
                        <strong>নোট:</strong> {unpaidDue.notes.join('; ')}
                      </p>
                    )}
                    <p className="text-[10px] text-amber-700 italic pl-5.5 pt-0.5">
                      * এই বাকি পরিমাণটি আপনার নতুন অর্ডারের মোট বিলে যুক্ত থাকবে।
                    </p>
                  </div>
                )}

                {/* Floating/Quick Custom Item Shortcut (Requirement 2: before order submit screen) */}
                {onOpenCustomItemModal && (
                  <button
                    type="button"
                    onClick={onOpenCustomItemModal}
                    className="w-full py-2.5 px-3 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50/60 hover:bg-emerald-50 active:scale-98 text-emerald-800 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-4 h-4 text-emerald-600" />
                    <span>খুঁজে পাচ্ছেন না? কাস্টম আইটেম যোগ করুন (Add Custom Item)</span>
                  </button>
                )}

                {/* Cost Summary Breakdown Card (Requirement 2: Custom item cost summary should be N/A) */}
                {(selectedItems && selectedItems.length > 0) && (() => {
                  const summaryItems = selectedItems;
                  const pricedTotal = summaryItems.reduce((acc: number, it: OrderItem) => {
                    if (!it.isCustom && typeof it.price === 'number' && it.price > 0) {
                      return acc + (it.price * (it.quantity || 1));
                    }
                    return acc;
                  }, 0);
                  const hasCustom = summaryItems.some((it: OrderItem) => it.isCustom || !it.price);
                  const estDelivery = useFreeDelivery ? 0 : (fallbackStore.pricingSettings.feeCalculatorMinFee ?? 20);
                  const dueAmount = unpaidDue?.totalAmount || 0;

                  return (
                    <div className="p-3.5 rounded-2xl bg-gray-50/90 border border-gray-200 space-y-2 text-xs text-gray-700">
                      <div className="flex items-center justify-between pb-1.5 border-b border-gray-200">
                        <span className="font-extrabold text-gray-900 text-xs sm:text-sm flex items-center gap-1.5">
                          <Receipt className="w-4 h-4 text-emerald-600" />
                          <span>খরচের বিবরণী (Cost Summary)</span>
                        </span>
                        <span className="text-[11px] text-gray-500 font-semibold">{summaryItems.length} টি আইটেম</span>
                      </div>

                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">পণ্যের আনুমানিক মূল্য:</span>
                          <span className="font-bold text-gray-900">
                            {hasCustom ? (
                              pricedTotal > 0 ? (
                                <span>৳{pricedTotal} <span className="text-amber-600 font-extrabold">+ N/A</span></span>
                              ) : (
                                <span className="text-amber-600 font-extrabold px-1.5 py-0.5 rounded bg-amber-100">N/A</span>
                              )
                            ) : (
                              <span>৳{pricedTotal}</span>
                            )}
                          </span>
                        </div>

                        {hasCustom && (
                          <p className="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded-lg border border-amber-200/60 leading-tight">
                            * কাস্টম আইটেম কেনার পর দোকানের রসিদ অনুযায়ী সঠিক মূল্য নির্ধারণ হবে (Custom item cost is N/A until purchased).
                          </p>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">ডেলিভারি চার্জ:</span>
                          <span className="font-bold text-gray-900">
                            {useFreeDelivery ? (
                              <span className="text-emerald-600 font-extrabold">০ ৳ (ফ্রি)</span>
                            ) : (
                              <span>৳{estDelivery}</span>
                            )}
                          </span>
                        </div>

                        {dueAmount > 0 && (
                          <div className="flex items-center justify-between text-amber-900">
                            <span>পূর্বের বাকি পেমেন্ট:</span>
                            <span className="font-bold text-red-600">+৳{dueAmount}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-gray-200 flex items-center justify-between font-extrabold text-sm text-gray-950">
                        <span>সম্ভাব্য মোট বিল:</span>
                        <span className="text-emerald-700 text-base font-black">
                          {hasCustom ? (
                            <span>৳{pricedTotal + estDelivery + dueAmount} <span className="text-amber-600 text-xs font-semibold">+ N/A</span></span>
                          ) : (
                            <span>৳{pricedTotal + estDelivery + dueAmount}</span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* CTA / Submit Button */}
            {!isExpanded ? (
              <AsyncButton
                type="button"
                onClick={handleInputInteract}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2"
              >
                <span>Submit Your Request</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </AsyncButton>
            ) : (
              <AsyncButton
                type={user ? 'submit' : 'button'}
                onClick={!user ? handleInputInteract : undefined}
                isLoading={submitting}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-60"
              >
                <span>{user ? 'Submit' : 'Login to Submit'}</span>
                {!submitting && <ArrowRight className="w-4 h-4 ml-2" />}
              </AsyncButton>
            )}
          </form>
        </>
      )}

      {/* Minimalist Insufficient Coins Custom Modal */}
      {showInsufficientCoinsModal && (
        <div
          className="fixed inset-0 z-[999999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowInsufficientCoinsModal(false)}
        >
          <div
            className="w-full max-w-[340px] bg-white rounded-3xl p-5 shadow-2xl border border-gray-100 relative animate-in zoom-in-95 duration-150 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowInsufficientCoinsModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="pt-2 px-1">
              <div className="w-11 h-11 mx-auto mb-2.5 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shadow-2xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-gray-900 tracking-tight leading-snug">
                {fallbackStore.pricingSettings.insufficientCoinsTitle || 'ফ্রি ডেলিভারি'}
              </h3>
              <p className="mt-2 text-xs sm:text-[13px] text-gray-600 font-medium leading-relaxed">
                {fallbackStore.pricingSettings.insufficientCoinsMessage || 'আপনার অ্যাকাউন্টে পর্যাপ্ত কয়েন নেই। ফ্রি ডেলিভারি পেতে আরও অর্ডার সম্পন্ন করে কয়েন অর্জন করুন।'}
              </p>
              <div className="mt-3 py-2 px-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs font-semibold text-amber-900 flex items-center justify-between">
                <span>প্রয়োজন: <strong>{fallbackStore.pricingSettings.freeDeliveryRequiredCoins ?? 50} Coins</strong></span>
                <span>আপনার আছে: <strong className="text-emerald-700">{user?.coins || 0} Coins</strong></span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowInsufficientCoinsModal(false)}
              className="mt-4 w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs shadow-xs transition-all cursor-pointer"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}

      {/* Service Selection Modal (Centered, 80vh height, scrollable) */}
      {isServiceDropdownOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[99990] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          style={{ backgroundColor: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsServiceDropdownOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg md:max-w-xl h-[80vh] max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-emerald-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0 bg-white">
              <h3 className="font-extrabold text-base sm:text-lg text-gray-900">সার্ভিস সিলেক্ট করুন</h3>
              <button
                type="button"
                onClick={() => setIsServiceDropdownOpen(false)}
                className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-700 border border-rose-200/60 active:scale-95 transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable List of Services */}
            <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-gray-100 p-2 sm:p-3">
              {services.map((srv) => {
                const isSelected = service === srv;
                return (
                  <button
                    key={srv}
                    type="button"
                    onClick={() => {
                      handleServiceChange(srv);
                      setIsServiceDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-3.5 rounded-2xl text-left text-sm sm:text-base flex items-center justify-between transition-all cursor-pointer group mb-1.5 gap-3 ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-950 font-extrabold ring-1 ring-emerald-300 shadow-xs'
                        : 'text-gray-700 font-semibold hover:bg-emerald-50/50 hover:text-emerald-900 active:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 sm:mt-1 ${
                          isSelected
                            ? 'bg-emerald-600 ring-4 ring-emerald-100'
                            : 'bg-gray-300 group-hover:bg-emerald-400'
                        } transition-colors`}
                      />
                      <span className="leading-snug break-words text-left flex-1">{srv}</span>
                    </div>
                    {isSelected ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-xs ring-2 ring-emerald-500/30 ml-1">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-200 group-hover:border-emerald-400 shrink-0 transition-colors ml-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Blocked User Custom Modal */}
      {showBlockedModal && (
        <BlockedUserModal
          onClose={() => setShowBlockedModal(false)}
          targetRole="customer"
        />
      )}

      {/* Store Off Warning Modal */}
      {showStoreOffModal && (
        <StoreOffWarningModal
          isOpen={showStoreOffModal}
          closedStoreNames={closedStoreNames}
          onConfirm={() => {
            setShowStoreOffModal(false);
            isStoreWarningAcceptedRef.current = true;
            const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
            handleSubmit(fakeEvent);
          }}
          onCancel={() => {
            setShowStoreOffModal(false);
            isStoreWarningAcceptedRef.current = false;
          }}
        />
      )}
    </div>
  );
};
