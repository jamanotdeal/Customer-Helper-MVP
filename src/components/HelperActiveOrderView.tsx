import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Order, OrderStatus, LocationData, Shop, ShopOrder, ShopOrderStatus, ShopOrderItemPrice, OrderEditChange, OrderEditHistoryItem, OrderItem } from '@/types';
import { fallbackStore, ShopOrderError } from '@/lib/firebase';
import { useAuth, isUserAuthenticated } from '@/context/AuthContext';
import { calculateHelperCommission, calculateDistanceKm, calculateEstimatedFee, calculateCustomStoreFee } from '@/lib/pricing';
import { ServiceIcon } from './ServiceIcon';
import { CheckCircle2, Truck, MapPin, PackageCheck, AlertOctagon, Phone, ArrowLeft, DollarSign, Clock, HelpCircle, FileText, ShoppingBag, FileEdit, AlertTriangle, X, Sparkles, Navigation, RotateCcw, CalendarClock, Map as MapIcon, Check, UserCheck, Package, Percent, Send, Store, User, Trash2, Maximize2, Plus, PlusCircle, Wallet, ChevronDown, Info, ShoppingCart, ExternalLink, Search } from 'lucide-react';
import { getStatusBadgeInfo } from './OrderCard';
import { getElapsedTime, getDeliveryDurationText, getHelperUrgencyBgClass, formatPlacedDateTime, isOrderTimerPaused } from '@/lib/timeUtils';
import { useSecondTick } from '@/hooks/useSecondTick';
import { fetchRoadRoute } from '@/lib/routeUtils';
import { useModal } from './CustomModal';
import { MapPickerModal } from './MapPickerModal';
import { HelperOrderMapModal } from './HelperOrderMapModal';
import { HelperRetailerMapModal } from './HelperRetailerMapModal';
import { HelperRetailerDetailsModal } from './HelperRetailerDetailsModal';
import { formatItemQuantityUnit, calculateOrderProductCost } from '@/lib/itemUtils';
import { EditOrderDetailsModal } from './EditOrderDetailsModal';


interface HelperActiveOrderViewProps {
  order: Order;
  helperLocation?: LocationData & { updatedAt?: string };
  onBack: () => void;
  onAccept?: (orderId: string) => void;
  activeOrdersCount?: number;
  activeOrderLimit?: number;
}

export const HelperActiveOrderView: React.FC<HelperActiveOrderViewProps> = ({
  order: rawOrder,
  helperLocation,
  onBack,
  onAccept,
  activeOrdersCount,
  activeOrderLimit,
}) => {
  const [liveOrder, setLiveOrder] = useState<Order>(() => fallbackStore.resolveOrderLocations(rawOrder));

  useEffect(() => {
    const sync = () => {
      const current = fallbackStore.orders.get(rawOrder.id);
      if (current) {
        setLiveOrder(fallbackStore.resolveOrderLocations(current));
      } else {
        setLiveOrder(fallbackStore.resolveOrderLocations(rawOrder));
      }
    };
    sync();
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, [rawOrder.id, rawOrder]);

  const order = liveOrder;
  const { user, openAuthModal } = useAuth();
  const isAcceptedByThisHelper = !!order.helperId && user?.uid === order.helperId;
  const [productCostInput, setProductCostInput] = useState(order.productCost !== undefined ? String(order.productCost) : '');
  const [showCostModal, setShowCostModal] = useState(false);
  const [feeInput, setFeeInput] = useState(order.deliveryFee ? String(order.deliveryFee) : '');
  const [feeReason, setFeeReason] = useState('');
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [customerAgreed, setCustomerAgreed] = useState(false);
  const { showConfirm, showAlert } = useModal();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  // Helper Private Note state
  const [helperNoteInput, setHelperNoteInput] = useState(order.helperNote || '');
  const [noteSavedAlert, setNoteSavedAlert] = useState(false);

  // Custom Celebratory Completion Modal state
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [earnedAmount, setEarnedAmount] = useState(0);


  // Delivery confirmation modal
  const [showDeliveryConfirmModal, setShowDeliveryConfirmModal] = useState(false);

  // Need Delivery Back state
  const [showDeliveryBackModal, setShowDeliveryBackModal] = useState(false);
  const [deliveryBackTimeInput, setDeliveryBackTimeInput] = useState(
    order.deliveryBackTime
      ? order.deliveryBackTime.substring(0, 16)
      : (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().substring(0, 16);
      })()
  );

  const [weightInput, setWeightInput] = useState(order.weightKg !== undefined ? String(order.weightKg) : '0');

  useEffect(() => {
    if (order.productCost !== undefined) setProductCostInput(String(order.productCost));
    if (order.weightKg !== undefined) setWeightInput(String(order.weightKg));
  }, [order.productCost, order.weightKg]);

  const [activeMapPicker, setActiveMapPicker] = useState<'pickup' | 'delivery' | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [returnWhen, setReturnWhen] = useState<'now' | 'schedule'>('schedule');

  const pendingMapContainerRef = React.useRef<HTMLDivElement>(null);
  const pendingMapInstanceRef = React.useRef<any>(null);

  useEffect(() => {
    if (order.status !== 'PENDING' || !pendingMapContainerRef.current) {
      if (pendingMapInstanceRef.current) {
        try {
          pendingMapInstanceRef.current.remove();
        } catch (e) {
          console.warn('[Leaflet] cleanup error:', e);
        }
        pendingMapInstanceRef.current = null;
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
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const container = pendingMapContainerRef.current;
      if (!container) return;

      if (pendingMapInstanceRef.current) {
        try {
          pendingMapInstanceRef.current.remove();
        } catch (e) {
          console.warn('[Leaflet] cleanup error:', e);
        }
        pendingMapInstanceRef.current = null;
      }

      const defaultLat = 23.8759;
      const defaultLng = 90.3795;
      const map = L.map(container, {
        dragging: true,
        touchZoom: true,
        scrollWheelZoom: false,
      }).setView([defaultLat, defaultLng], 14);
      pendingMapInstanceRef.current = map;

      L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps Satellite',
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 20,
      }).addTo(map);

      // Force size invalidation once container is painted
      setTimeout(() => {
        try { map.invalidateSize(); } catch (_) { }
      }, 200);

      const boundsPoints: [number, number][] = [];

      const pLat = order.pickupLocation?.lat;
      const pLng = order.pickupLocation?.lng;
      const hasPickup = typeof pLat === 'number' && typeof pLng === 'number';

      const dLat = order.deliveryLocation?.lat;
      const dLng = order.deliveryLocation?.lng;
      const hasDelivery = typeof dLat === 'number' && typeof dLng === 'number';

      const createCustomMarker = (
        lat: number,
        lng: number,
        label: string,
        iconSvg: string,
        badgeBg: string,
        badgeText: string,
        borderColor: string,
        dotColor: string,
        width: number = 130
      ) => {
        const html = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: ${width}px; height: 55px; pointer-events: none; box-sizing: border-box;">
            <div style="height: 28px; display: flex; align-items: center; justify-content: center; gap: 4px; background: ${badgeBg}; color: ${badgeText}; border: 2px solid ${borderColor}; padding: 4px 8px; border-radius: 8px; font-family: sans-serif; font-size: 11px; font-weight: 900; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap; line-height: 1; box-sizing: border-box;">
              ${iconSvg}
              <span>${label}</span>
            </div>
            <div style="width: 2px; height: 16px; background: #000000;"></div>
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; border: 2px solid #000000; margin-top: -5px; box-shadow: 0 1px 2px rgba(0,0,0,0.3); box-sizing: border-box;"></div>
          </div>
        `;
        return L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'custom-route-marker',
            html,
            iconSize: [width, 55],
            iconAnchor: [width / 2, 47],
          }),
        });
      };

      if (hasPickup && pLat && pLng) {
        createCustomMarker(
          pLat,
          pLng,
          'Pickup',
          `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
          '#fef08a',
          '#854d0e',
          '#ca8a04',
          '#eab308',
          90
        ).addTo(map);
        boundsPoints.push([pLat, pLng]);
      }

      if (hasDelivery && dLat && dLng) {
        createCustomMarker(
          dLat,
          dLng,
          'Delivery',
          `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
          '#dcfce7',
          '#166534',
          '#16a34a',
          '#22c55e',
          90
        ).addTo(map);
        boundsPoints.push([dLat, dLng]);
      }

      if (hasPickup && pLat && pLng && hasDelivery && dLat && dLng) {
        const routeCoords = await fetchRoadRoute([
          { lat: pLat, lng: pLng },
          { lat: dLat, lng: dLng },
        ]);
        if (isCancelled) return;
        if (routeCoords.length > 0) {
          L.polyline(routeCoords, {
            color: '#22c55e',
            weight: 4,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map);
        }
      }

      if (boundsPoints.length > 1) {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [40, 40] });
      } else if (boundsPoints.length === 1) {
        map.setView(boundsPoints[0], 15);
      }

      setTimeout(() => {
        try { map.invalidateSize(); } catch (_) { }
      }, 500);
    };

    initMapAndRender();

    return () => {
      isCancelled = true;
    };
  }, [order.id, order.status, order.pickupLocation, order.deliveryLocation]);

  useEffect(() => {
    return () => {
      if (pendingMapInstanceRef.current) {
        try {
          pendingMapInstanceRef.current.remove();
        } catch (e) { }
        pendingMapInstanceRef.current = null;
      }
    };
  }, []);

  // Retailer map state
  const [showRetailerMap, setShowRetailerMap] = useState(false);
  const [searchShopQuery, setSearchShopQuery] = useState('');
  const [retailerDetailsShop, setRetailerDetailsShop] = useState<Shop | null>(null);

  // Shop order placement state
  const [placeOrderShop, setPlaceOrderShop] = useState<Shop | null>(null);
  const [viewRequestDetails, setViewRequestDetails] = useState<ShopOrder | null>(null);
  const [orderText, setOrderText] = useState('');
  const [orderTextError, setOrderTextError] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  // One id per request being drafted. Pressing Send again after an error then
  // retries the same request instead of creating a second one, which matters
  // because the first attempt may still reach the store on its own.
  const shopOrderDraftIdRef = useRef<string | null>(null);
  const customCostDraftIdRef = useRef<string | null>(null);
  const [shopOrders, setShopOrders] = useState<ShopOrder[]>(() =>
    fallbackStore.getShopOrdersForOrder(order.id)
  );

  const [showCustomCostModal, setShowCustomCostModal] = useState(false);
  const [customSellerName, setCustomSellerName] = useState('');
  const [customSellerPhone, setCustomSellerPhone] = useState('');
  const [isSubmittingCustomCost, setIsSubmittingCustomCost] = useState(false);
  const [checkedNoteItems, setCheckedNoteItems] = useState<Record<number, boolean>>({});
  const [checkedSubItems, setCheckedSubItems] = useState<Record<string, boolean>>({});

  // Store price confirm modal state (for store-connected items — no retailer selection needed)
  const [storePriceModalShopId, setStorePriceModalShopId] = useState<string | null>(null);
  const [storePriceItems, setStorePriceItems] = useState<{ id: string; originalId: string; name: string; qty?: string | number; price: string; photoUrl?: string }[]>([]);
  const [isSubmittingStorePrice, setIsSubmittingStorePrice] = useState(false);

  // Store info drawer
  const [storeInfoShopId, setStoreInfoShopId] = useState<string | null>(null);

  // Order Now sending state per store group (storeId → loading bool)
  const [orderNowLoading, setOrderNowLoading] = useState<Record<string, boolean>>({});

  interface SelectedItemEntry {
    id: string;
    originalId: string;
    name: string;
    qty?: string | number;
    unit?: string;
    price?: string;
    isChecked: boolean;
    isNote: boolean;
    noteIdx?: number;
  }

  const [customCostItems, setCustomCostItems] = useState<SelectedItemEntry[]>([]);
  const [shopOrderItems, setShopOrderItems] = useState<SelectedItemEntry[]>([]);
  const [customShopItemName, setCustomShopItemName] = useState('');
  const [customShopItemUnit, setCustomShopItemUnit] = useState('');
  const [customShopItemPrice, setCustomShopItemPrice] = useState('');
  const [showAddCustomShopItem, setShowAddCustomShopItem] = useState(false);
  const [viewRequestItems, setViewRequestItems] = useState<SelectedItemEntry[]>([]);
  const [storeInstructionNote, setStoreInstructionNote] = useState('');

  // Selected custom items for actions (Request To Store / Custom Cost)
  const [selectedCustomItemIds, setSelectedCustomItemIds] = useState<string[]>([]);
  const [showStorePickerForCustom, setShowStorePickerForCustom] = useState(false);
  const [storePickerSearch, setStorePickerSearch] = useState('');
  const [storePickerCategory, setStorePickerCategory] = useState('ALL');
  const [cancellingShopOrderId, setCancellingShopOrderId] = useState<string | null>(null);
  const [convertConfirmTarget, setConvertConfirmTarget] = useState<{ sid: string; storeName: string; itemCount: number } | null>(null);
  const [orderNowConfirmTarget, setOrderNowConfirmTarget] = useState<{
    sid: string;
    storeName: string;
    storeAddress?: string;
    items: any[];
    totalOrdered: number;
    itemsText: string;
  } | null>(null);
  const [cancelShopOrderConfirmTarget, setCancelShopOrderConfirmTarget] = useState<{
    shopOrderId: string;
    storeName: string;
  } | null>(null);
  // Modal shown when helper tries to interact with a store item before store has accepted
  const [storeOrderRequiredTarget, setStoreOrderRequiredTarget] = useState<{
    sid: string;
    storeName: string;
    storeAddress?: string;
    items: any[];
    totalOrdered: number;
    itemsText: string;
  } | null>(null);
  // Edit history accordion (collapsed by default)
  const [showEditHistory, setShowEditHistory] = useState(false);

  const handleCancelShopOrder = async (shopOrderId: string) => {
    setCancellingShopOrderId(shopOrderId);
    try {
      await fallbackStore.updateShopOrder(
        shopOrderId,
        (so) => ({
          ...so,
          status: 'CANCELED',
          statusHistory: [
            ...(so.statusHistory || []),
            {
              status: 'CANCELED',
              timestamp: new Date().toISOString(),
              actor: order.helperName || 'Helper',
              note: 'হেলপার রিকোয়েস্ট বাতিল করেছেন',
            },
          ],
        }),
        'helper'
      );
      showAlert('রিকোয়েস্ট বাতিল', 'দোকানের রিকোয়েস্ট বাতিল করা হয়েছে।', 'info');
    } catch (err: any) {
      showAlert('ত্রুটি', 'রিকোয়েস্ট বাতিল করা যায়নি: ' + (err?.message || err), 'error');
    } finally {
      setCancellingShopOrderId(null);
    }
  };

  const handleConvertStoreToCustom = async (sid: string, storeName: string) => {
    try {
      const activeSOs = shopOrders.filter(
        (so) => so.shopId === sid && so.parentOrderId === order.id && so.status !== 'CANCELED' && (so.status as string) !== 'CANCELLED'
      );
      for (const so of activeSOs) {
        await fallbackStore.updateShopOrder(
          so.id,
          (prev) => ({
            ...prev,
            status: 'CANCELED',
            statusHistory: [
              ...(prev.statusHistory || []),
              {
                status: 'CANCELED',
                timestamp: new Date().toISOString(),
                actor: order.helperName || 'Helper',
                note: 'হেলপার পণ্যগুলো কাস্টমে রূপান্তর করেছেন',
              },
            ],
          }),
          'helper'
        );
      }

      const updatedItems = (order.items || []).map((it) => {
        if (it.storeId === sid) {
          return {
            ...it,
            isCustom: true,
            buyFrom: it.storeName || storeName || it.buyFrom,
            storeId: undefined,
            storeName: undefined,
          };
        }
        return it;
      });

      await fallbackStore.updateOrder(order.id, (o) => ({
        ...o,
        items: updatedItems,
        updatedAt: new Date().toISOString(),
      }));

      showAlert('কাস্টম আইটেমে রূপান্তর সফল', `${storeName}-এর পণ্যগুলো কাস্টম আইটেমে যুক্ত করা হয়েছে। আপনি এখন যেকোনো দোকান থেকে কিনতে পারবেন।`, 'success');
    } catch (err: any) {
      showAlert('ত্রুটি', 'রূপান্তর করতে সমস্যা হয়েছে: ' + (err?.message || err), 'error');
    }
  };

  const handleToggleCustomItemSelection = (itemId: string) => {
    setSelectedCustomItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleAddCustomCostForSelected = () => {
    const allItems = order.items || [];
    const customItems = allItems.filter(it => it.isCustom || !it.storeId || !!order.isStoreClosedAtOrder);
    const selectedEntries: SelectedItemEntry[] = customItems
      .filter((it) => selectedCustomItemIds.includes(it.id))
      .map((it) => ({
        id: it.id,
        originalId: it.id,
        name: it.name,
        qty: it.qty,
        price: it.price ? String(it.price) : '',
        isChecked: true,
        isNote: false,
      }));

    setCustomCostItems(selectedEntries.length > 0 ? selectedEntries : getInitialSelectedItemList());
    const existingSO = shopOrders.find(
      (so) => so.shopId === 'myself' && so.status !== 'CANCELED' && (so.status as string) !== 'CANCELLED'
    );
    setCustomSellerName(existingSO?.sellerName || '');
    setCustomSellerPhone(existingSO?.sellerPhone || '');
    setShowCustomCostModal(true);
  };

  const handleRequestCustomItemsToStore = () => {
    if (selectedCustomItemIds.length === 0) return;
    setStorePickerSearch('');
    setStorePickerCategory('ALL');
    setShowStorePickerForCustom(true);
  };

  const handleSelectStoreForCustom = (shop: Shop) => {
    if (shop.isBlocked) {
      showAlert('দোকান সাময়িকভাবে স্থগিত', 'এই দোকানটি বর্তমানে স্থগিত রয়েছে। অনুগ্রহ করে অন্য দোকান নির্বাচন করুন।', 'error');
      return;
    }
    setShowStorePickerForCustom(false);

    const allItems = order.items || [];
    const customItems = allItems.filter(it => it.isCustom || !it.storeId || !!order.isStoreClosedAtOrder);
    const selectedEntries: SelectedItemEntry[] = customItems
      .filter((it) => selectedCustomItemIds.includes(it.id))
      .map((it) => ({
        id: it.id,
        originalId: it.id,
        name: it.name,
        qty: it.qty,
        unit: it.unit,
        price: it.price ? String(it.price) : '',
        isChecked: true,
        isNote: false,
      }));

    setShopOrderItems(selectedEntries);
    setCustomShopItemName('');
    setCustomShopItemPrice('');
    setShowAddCustomShopItem(false);
    setStoreInstructionNote('');
    setOrderTextError('');
    setPlaceOrderShop(shop);
  };

  // Helper Edit Order Items Modal State
  const [showHelperEditModal, setShowHelperEditModal] = useState(false);
  const [editMapPickerType, setEditMapPickerType] = useState<'pickup' | 'delivery' | null>(null);
  const [editPickup, setEditPickup] = useState('');
  const [editPickupLat, setEditPickupLat] = useState<number | undefined>(undefined);
  const [editPickupLng, setEditPickupLng] = useState<number | undefined>(undefined);
  const [editPickupAddressId, setEditPickupAddressId] = useState<string | undefined>(undefined);
  const [editAddress, setEditAddress] = useState('');
  const [editDeliveryLat, setEditDeliveryLat] = useState<number | undefined>(undefined);
  const [editDeliveryLng, setEditDeliveryLng] = useState<number | undefined>(undefined);
  const [editDeliveryAddressId, setEditDeliveryAddressId] = useState<string | undefined>(undefined);

  const normalizeItemName = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/\s*[×x]\s*\d+/g, '') // remove "x2", "×2"
      .replace(/\s*\(\s*[×x]?\s*\d+\s*\)/g, '') // remove "(x2)", "(2)"
      .trim();
  };

  const getItemConnectedOrder = (itemName: string, itemId?: string): ShopOrder | null => {
    const targetNorm = normalizeItemName(itemName);
    if (!targetNorm) return null;
    for (const so of shopOrders) {
      if (so.status === 'CANCELED' || (so.status as string) === 'CANCELLED') continue;

      // 1. Exact match in itemsWithPrice by itemId or normalized name
      if (so.itemsWithPrice && so.itemsWithPrice.length > 0) {
        if (so.itemsWithPrice.some((ip: any) => {
          if (itemId && (ip.itemId === itemId || ip.originalId === itemId)) return true;
          return normalizeItemName(ip.name) === targetNorm;
        })) {
          return so;
        }
      }

      // 2. Exact match in separated requestText parts
      const rawLines = (so.requestText || '').split(/\r?\n/).filter((l) => !l.startsWith('নোট:'));
      const parts: string[] = [];
      rawLines.forEach((line) => {
        line.split(/,/).forEach((p) => {
          const trimmed = normalizeItemName(p);
          if (trimmed) parts.push(trimmed);
        });
      });

      if (parts.some((p) => p === targetNorm)) {
        return so;
      }
    }
    return null;
  };

  const getItemIndividualPrice = (itemName: string, connectedOrder?: ShopOrder | null): number | undefined => {
    if (!connectedOrder) return undefined;
    const targetNorm = normalizeItemName(itemName);
    if (connectedOrder.itemsWithPrice && connectedOrder.itemsWithPrice.length > 0) {
      const match = connectedOrder.itemsWithPrice.find((ip) => normalizeItemName(ip.name) === targetNorm);
      if (match && match.price !== undefined) {
        return match.price;
      }
    }
    // If request has only 1 item and overall price is defined
    const rawLines = (connectedOrder.requestText || '').split(/\r?\n/).filter((l) => !l.startsWith('নোট:'));
    const parts: string[] = [];
    rawLines.forEach((line) => {
      line.split(/,/).forEach((p) => {
        const trimmed = normalizeItemName(p);
        if (trimmed) parts.push(trimmed);
      });
    });
    if (parts.length === 1 && connectedOrder.price !== undefined) {
      return connectedOrder.price;
    }
    return undefined;
  };

  const getItemQuantityNum = (item: { qty?: string | number; quantity?: number }): number => {
    if (typeof item.quantity === 'number' && item.quantity > 0) return item.quantity;
    if (typeof item.qty === 'number' && item.qty > 0) return item.qty;
    if (typeof item.qty === 'string') {
      const bengaliNormalized = item.qty.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
      const parsed = parseFloat(bengaliNormalized);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 1;
  };

  const getItemQtyDisplay = (item: { qty?: string | number; quantity?: number }): string => {
    const num = getItemQuantityNum(item);
    if (num > 1) {
      return ` ×${num}`;
    }
    if (typeof item.qty === 'string') {
      const trimmed = item.qty.trim();
      if (trimmed && trimmed !== '1' && trimmed !== '১' && trimmed !== '১টি') {
        const parsed = parseFloat(trimmed);
        if (!isNaN(parsed) && parsed > 1) {
          return ` ×${parsed}`;
        }
        return ` (${trimmed})`;
      }
    }
    return '';
  };

  const getItemPriceDetails = (item: OrderItem, itemPrice?: number) => {
    const unitPrice = itemPrice !== undefined ? itemPrice : item.price;
    if (unitPrice === undefined || isNaN(unitPrice)) return null;
    const qty = getItemQuantityNum(item);
    const totalPrice = unitPrice * qty;
    return { unitPrice, totalPrice, qty };
  };

  const parsedItems = useMemo(() => {
    if (!order.items || order.items.length === 0) {
      // Fallback for orders that have no structured items list, only additionalNote
      if (order.additionalNote) {
        const noteParts = order.additionalNote.split(/,|\r?\n/).map((p) => p.trim()).filter(Boolean);
        return noteParts.map((part, idx) => {
          const subId = `note-item-${idx}`;
          const isConnected = getItemConnectedOrder(part, subId) !== null;
          const isSubChecked = checkedSubItems[subId] !== undefined ? checkedSubItems[subId] : (isConnected ? true : false);
          return {
            id: subId,
            originalId: subId,
            name: part,
            qty: undefined,
            quantity: 1,
            purchased: isSubChecked,
          };
        });
      }
      return [];
    }

    const result: Array<{ id: string; originalId: string; name: string; qty?: string | number; unit?: string; quantity?: number; purchased: boolean }> = [];
    order.items.forEach((item) => {
      const parts = item.name.split(/,|\r?\n/).map((p) => p.trim()).filter(Boolean);
      const effectiveQty = getItemQuantityNum(item);
      if (parts.length > 1) {
        parts.forEach((part, index) => {
          const subId = `${item.id}-${index}`;
          const isConnected = getItemConnectedOrder(part, subId) !== null;
          const isSubChecked = checkedSubItems[subId] !== undefined ? checkedSubItems[subId] : (isConnected ? true : !!item.purchased);
          result.push({
            id: subId,
            originalId: item.id,
            name: part,
            qty: index === 0 ? item.qty : undefined,
            unit: index === 0 ? item.unit : undefined,
            quantity: index === 0 ? effectiveQty : 1,
            purchased: isSubChecked,
          });
        });
      } else {
        const isConnected = getItemConnectedOrder(item.name, item.id) !== null;
        const isSubChecked = checkedSubItems[item.id] !== undefined ? checkedSubItems[item.id] : (isConnected ? true : !!item.purchased);
        result.push({
          id: item.id,
          originalId: item.id,
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          quantity: effectiveQty,
          purchased: isSubChecked,
        });
      }
    });
    return result;
  }, [order.items, order.additionalNote, checkedSubItems, shopOrders]);

  const parsedNoteItems = useMemo<string[]>(() => {
    // If the order ALREADY has structured items, additionalNote is customer note/instructions, NOT separate items!
    // This prevents dual entries and random note sentences from cluttering the checklist.
    if (order.items && order.items.length > 0) return [];
    return [];
  }, [order.items]);

  const selectedParsedItems = useMemo(() => {
    return parsedItems.filter((i) => i.purchased);
  }, [parsedItems]);

  const pendingSelectedParsedItems = useMemo(() => {
    return parsedItems.filter((i) => i.purchased && !getItemConnectedOrder(i.name, i.id));
  }, [parsedItems, shopOrders]);

  const selectedNoteItems = useMemo(() => {
    return parsedNoteItems.filter((_, idx) => checkedNoteItems[idx]);
  }, [parsedNoteItems, checkedNoteItems]);

  const selectedItemsCount = pendingSelectedParsedItems.length + selectedNoteItems.length;

  const getInitialSelectedItemList = (): SelectedItemEntry[] => {
    if (pendingSelectedParsedItems.length > 0) {
      return pendingSelectedParsedItems.map((i) => ({
        id: i.id,
        originalId: i.originalId,
        name: i.name,
        qty: i.qty,
        unit: (i as any).unit,
        price: '',
        isChecked: true,
        isNote: false,
      }));
    }

    if (parsedNoteItems.length > 0) {
      const selectedNotes = parsedNoteItems
        .map((note, idx) => ({
          id: `note-${idx}`,
          originalId: `note-${idx}`,
          name: note,
          qty: undefined,
          price: '',
          isChecked: !!checkedNoteItems[idx],
          isNote: true,
          noteIdx: idx,
        }))
        .filter((n) => n.isChecked);
      if (selectedNotes.length > 0) return selectedNotes;
    }

    // When no items were pre-selected on the card checklist, provide unconfirmed items with isChecked: false
    // so helper must explicitly choose what to add, preventing accidental bulk assignment
    return parsedItems
      .filter((i) => !getItemConnectedOrder(i.name, i.id))
      .map((i) => ({
        id: i.id,
        originalId: i.originalId,
        name: i.name,
        qty: i.qty,
        unit: (i as any).unit,
        price: '',
        isChecked: false,
        isNote: false,
      }));
  };

  const openCustomCostModal = () => {
    customCostDraftIdRef.current = null; // a fresh entry, not a retry
    setCustomCostItems(getInitialSelectedItemList());
    setCustomSellerName('');
    setCustomSellerPhone('');
    setShowCustomCostModal(true);
  };

  const openPlaceShopOrder = (shop: Shop) => {
    if (shop.isBlocked) {
      showAlert('দোকান সাময়িকভাবে স্থগিত', 'এই দোকানটি বর্তমানে স্থগিত রয়েছে। অনুগ্রহ করে অন্য দোকান নির্বাচন করুন।', 'error');
      return;
    }

    // Build item list: items connected to this specific store (by storeId) + custom/no-store items
    const allOrderItems = order.items || [];
    const storeMatchItems = allOrderItems.filter(
      (it) => it.storeId === shop.id && !it.isCustom
    );
    const customOrUnattachedItems = allOrderItems.filter(
      (it) => it.isCustom || !it.storeId
    );

    let initialItems: SelectedItemEntry[] = [];

    if (storeMatchItems.length > 0 || customOrUnattachedItems.length > 0) {
      storeMatchItems.forEach((it) => {
        const alreadyConnected = getItemConnectedOrder(it.name, it.id) !== null;
        if (!alreadyConnected) {
          initialItems.push({
            id: it.id,
            originalId: it.id,
            name: it.name,
            qty: it.qty,
            unit: it.unit,
            price: it.price ? String(it.price) : '',
            isChecked: true,
            isNote: false,
          });
        }
      });
      customOrUnattachedItems.forEach((it) => {
        const alreadyConnected = getItemConnectedOrder(it.name, it.id) !== null;
        if (!alreadyConnected) {
          initialItems.push({
            id: `custom-unattached-${it.id}`,
            originalId: it.id,
            name: it.name,
            qty: it.qty,
            unit: it.unit,
            price: it.price ? String(it.price) : '',
            isChecked: true,
            isNote: false,
          });
        }
      });
    }

    if (initialItems.length === 0) {
      initialItems = getInitialSelectedItemList();
    }

    setShopOrderItems(initialItems);
    setCustomShopItemName('');
    setCustomShopItemPrice('');
    setShowAddCustomShopItem(false);
    setStoreInstructionNote('');
    setOrderTextError('');
    shopOrderDraftIdRef.current = `so-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setPlaceOrderShop(shop);
  };

  // Tells the helper how a store request went; the request itself is never
  // lost — see fallbackStore.addShopOrder.
  const reportShopOrderResult = (result: 'sent' | 'queued') => {
    if (result === 'queued') {
      showAlert(
        'অনুরোধ পাঠানো হচ্ছে',
        'ইন্টারনেট সংযোগ ধীর, তাই অনুরোধটি এখনো দোকানে পৌঁছায়নি। সংযোগ পেলেই এটি স্বয়ংক্রিয়ভাবে পাঠানো হবে।',
        'warning'
      );
    }
  };

  const shopOrderErrorText = (err: unknown) =>
    err instanceof ShopOrderError
      ? err.message
      : 'অনুরোধটি পাঠানো যায়নি। ইন্টারনেট সংযোগ দেখে আবার "Send Request" চাপুন।';

  const handleAddCustomShopItem = () => {
    if (!customShopItemName.trim()) return;
    const newId = `custom-item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const parsedQty = getItemQuantityNum({ qty: customShopItemUnit });
    setShopOrderItems((prev) => [
      ...prev,
      {
        id: newId,
        originalId: newId,
        name: customShopItemName.trim(),
        qty: parsedQty > 1 ? parsedQty : '1',
        unit: customShopItemUnit.trim() || undefined,
        price: customShopItemPrice.trim() || '',
        isChecked: true,
        isNote: false,
      },
    ]);
    setCustomShopItemName('');
    setCustomShopItemUnit('');
    setCustomShopItemPrice('');
    setShowAddCustomShopItem(false);
    if (orderTextError) setOrderTextError('');
  };

  const handleRemoveShopOrderItem = (id: string) => {
    setShopOrderItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleToggleCustomCostItem = (id: string) => {
    setCustomCostItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextChecked = !item.isChecked;
          if (!nextChecked) {
            if (item.isNote && item.noteIdx !== undefined) {
              setCheckedNoteItems((nPrev) => ({ ...nPrev, [item.noteIdx!]: false }));
            } else {
              setCheckedSubItems((sPrev) => ({ ...sPrev, [item.id]: false }));
              fallbackStore.updateOrder(order.id, (o) => ({
                ...o,
                items: (o.items || []).map((it) => (it.id === item.originalId ? { ...it, purchased: false } : it)),
              }));
            }
          } else {
            if (item.isNote && item.noteIdx !== undefined) {
              setCheckedNoteItems((nPrev) => ({ ...nPrev, [item.noteIdx!]: true }));
            } else {
              setCheckedSubItems((sPrev) => ({ ...sPrev, [item.id]: true }));
            }
          }
          return { ...item, isChecked: nextChecked };
        }
        return item;
      })
    );
  };

  const handleToggleShopOrderItem = (id: string) => {
    setShopOrderItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextChecked = !item.isChecked;
          if (!nextChecked) {
            if (item.isNote && item.noteIdx !== undefined) {
              setCheckedNoteItems((nPrev) => ({ ...nPrev, [item.noteIdx!]: false }));
            } else {
              setCheckedSubItems((sPrev) => ({ ...sPrev, [item.id]: false }));
              fallbackStore.updateOrder(order.id, (o) => ({
                ...o,
                items: (o.items || []).map((it) => (it.id === item.originalId ? { ...it, purchased: false } : it)),
              }));
            }
          } else {
            if (item.isNote && item.noteIdx !== undefined) {
              setCheckedNoteItems((nPrev) => ({ ...nPrev, [item.noteIdx!]: true }));
            } else {
              setCheckedSubItems((sPrev) => ({ ...sPrev, [item.id]: true }));
            }
          }
          return { ...item, isChecked: nextChecked };
        }
        return item;
      })
    );
  };

  const handleCustomItemPriceChange = (id: string, priceStr: string) => {
    setCustomCostItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, price: priceStr } : item))
    );
  };

  const totalCustomCost = useMemo(() => {
    return customCostItems
      .filter((i) => i.isChecked)
      .reduce((sum, i) => sum + (parseFloat(i.price || '0') || 0) * getItemQuantityNum(i), 0);
  }, [customCostItems]);

  const handleShopOrderItemPriceChange = (id: string, priceStr: string) => {
    setShopOrderItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, price: priceStr } : item))
    );
  };

  const totalShopOrderCost = useMemo(() => {
    return shopOrderItems
      .filter((i) => i.isChecked)
      .reduce((sum, i) => sum + (parseFloat(i.price || '0') || 0) * getItemQuantityNum(i), 0);
  }, [shopOrderItems]);

  const openViewRequestDetails = (so: ShopOrder) => {
    let items: SelectedItemEntry[] = [];
    if (so.itemsWithPrice && so.itemsWithPrice.length > 0) {
      items = so.itemsWithPrice.map((it, idx) => ({
        id: `vri-${idx}`,
        originalId: `vri-${idx}`,
        name: it.name,
        qty: it.unit,
        price: it.price !== undefined ? String(it.price) : '',
        isChecked: true,
        isNote: false,
      }));
    } else {
      const rawLines = (so.requestText || '').split(/\r?\n/).filter((l) => !l.startsWith('নোট:'));
      const allParts: string[] = [];
      rawLines.forEach((line) => {
        line.split(/,/).forEach((p) => {
          const trimmed = p.trim();
          if (trimmed) allParts.push(trimmed);
        });
      });
      const perItemPrice = allParts.length === 1 && so.price !== undefined ? String(so.price) : '';
      items = allParts.map((part, idx) => ({
        id: `vri-${idx}`,
        originalId: `vri-${idx}`,
        name: part,
        qty: undefined,
        price: perItemPrice,
        isChecked: true,
        isNote: false,
      }));
    }
    setViewRequestItems(items);
    setViewRequestDetails(so);
  };

  const handleToggleViewRequestItem = (id: string) => {
    setViewRequestItems((prev) => {
      const next = prev.map((item) =>
        item.id === id ? { ...item, isChecked: !item.isChecked } : item
      );
      const total = next
        .filter((i) => i.isChecked)
        .reduce((sum, i) => sum + (parseFloat(i.price || '0') || 0), 0);
      setViewRequestDetails((so) => (so ? { ...so, price: total } : null));
      return next;
    });
  };

  const handleViewRequestItemPriceChange = (id: string, priceStr: string) => {
    setViewRequestItems((prev) => {
      const next = prev.map((item) =>
        item.id === id ? { ...item, price: priceStr } : item
      );
      const total = next
        .filter((i) => i.isChecked)
        .reduce((sum, i) => sum + (parseFloat(i.price || '0') || 0), 0);
      setViewRequestDetails((so) => (so ? { ...so, price: total } : null));
      return next;
    });
  };

  const getSelectedItemsText = () => {
    const names = [
      ...pendingSelectedParsedItems.map((i) => `${i.name}${getItemQtyDisplay(i)}`),
      ...selectedNoteItems,
    ];
    return names.join(', ');
  };

  useEffect(() => {
    const sync = () => setShopOrders(fallbackStore.getShopOrdersForOrder(order.id));
    sync();

    if (order.id) {
      fallbackStore.fetchShopOrdersForOrder(order.id, order.helperId, order.helperName);
    }

    return fallbackStore.subscribe(sync);
  }, [order.id, order.helperId, order.helperName]);

  const itemsProductCost = useMemo(() => {
    return (order.items || []).reduce((sum, it) => {
      let price: number | undefined = (typeof it.price === 'number' && !isNaN(it.price) && it.price > 0)
        ? it.price
        : undefined;

      if (price === undefined) {
        const targetNorm = normalizeItemName(it.name || '');
        for (const so of shopOrders) {
          if (so.status === 'CANCELED' || (so.status as string) === 'CANCELLED') continue;
          if (so.itemsWithPrice && so.itemsWithPrice.length > 0) {
            const match = so.itemsWithPrice.find((ip) => {
              if (it.id && (ip.itemId === it.id || ip.originalId === it.id)) return true;
              const ipNorm = normalizeItemName(ip.name || '');
              return ipNorm === targetNorm || targetNorm.includes(ipNorm) || ipNorm.includes(targetNorm);
            });
            if (match && typeof match.price === 'number' && !isNaN(match.price) && match.price > 0) {
              price = match.price;
              break;
            }
          }
        }
      }

      const qty = typeof it.quantity === 'number' && it.quantity > 0
        ? it.quantity
        : (parseInt(it.qty || '1', 10) || 1);

      return sum + (price ? price * qty : 0);
    }, 0);
  }, [order.items, shopOrders]);

  useEffect(() => {
    const calculatedProductCost = calculateOrderProductCost(order, shopOrders);
    if (calculatedProductCost > 0 && order.productCost !== calculatedProductCost) {
      fallbackStore.updateOrder(order.id, (o) => ({
        ...o,
        productCost: calculatedProductCost,
      }));
    }
  }, [shopOrders, order.id, order.items, order.productCost]);

  const selectedShopIds = order.selectedShopIds || [];
  const selectedShops = Array.from(fallbackStore.shops.values()).filter((s) => !s.isBlocked && selectedShopIds.includes(s.id));

  // Filter and sort nearby shops (excluding blocked shops)
  const allShops = Array.from(fallbackStore.shops.values()).filter((s) => !s.isBlocked);
  const maxDistance = fallbackStore.pricingSettings.helperRadiusKm ?? 3.5;

  const nearbyShops = allShops.filter((shop) => {
    if (!shop.location?.lat || !shop.location?.lng) return true; // Show as fallback if coordinates missing

    const distToPickup = (order.pickupLocation?.lat && order.pickupLocation?.lng)
      ? calculateDistanceKm(shop.location.lat, shop.location.lng, order.pickupLocation.lat, order.pickupLocation.lng)
      : null;

    const distToDelivery = (order.deliveryLocation?.lat && order.deliveryLocation?.lng)
      ? calculateDistanceKm(shop.location.lat, shop.location.lng, order.deliveryLocation.lat, order.deliveryLocation.lng)
      : null;

    const distToHelper = (helperLocation?.lat && helperLocation?.lng)
      ? calculateDistanceKm(shop.location.lat, shop.location.lng, helperLocation.lat, helperLocation.lng)
      : null;

    const minDistance = Math.min(
      ...([distToPickup, distToDelivery, distToHelper].filter((d) => d !== null) as number[])
    );

    if (minDistance === Infinity) return true;
    return minDistance <= maxDistance;
  });

  const filteredShops = nearbyShops.filter((shop) => {
    const q = searchShopQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      shop.name.toLowerCase().includes(q) ||
      shop.type.toLowerCase().includes(q) ||
      (shop.contactPerson && shop.contactPerson.toLowerCase().includes(q)) ||
      (shop.whatsapp && shop.whatsapp.toLowerCase().includes(q)) ||
      (shop.location?.address && shop.location.address.toLowerCase().includes(q))
    );
  });

  const handleToggleShopSelection = (shopId: string) => {
    const isSelected = selectedShopIds.includes(shopId);
    const newIds = isSelected
      ? selectedShopIds.filter((id) => id !== shopId)
      : [...selectedShopIds, shopId];

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      selectedShopIds: newIds,
    }));
  };

  const handleDeselectShop = (shopId: string) => {
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      selectedShopIds: (o.selectedShopIds || []).filter((id) => id !== shopId),
    }));
  };

  const handleSaveEditedAddress = async (type: 'pickup' | 'delivery', loc: LocationData) => {
    // Connect and save to server addresses catalog
    let effectiveAddressId = loc.addressId;
    try {
      const sa = await fallbackStore.recordOrUpsertServerAddress(loc.address, {
        lat: loc.lat,
        lng: loc.lng,
        shortName: loc.name,
        details: loc.details,
      });
      if (sa?.id) effectiveAddressId = sa.id;
    } catch (_) { }

    const locWithId: LocationData = {
      ...loc,
      addressId: effectiveAddressId,
    };

    fallbackStore.updateOrder(order.id, (o) => {
      const changes = [];
      const oldVal = type === 'pickup' ? (o.pickupLocation?.address || 'N/A') : (o.deliveryLocation?.address || 'N/A');
      changes.push({
        field: type === 'pickup' ? 'Pickup Address' : 'Delivery Address',
        oldValue: oldVal,
        newValue: locWithId.address,
      });

      const updatedOrder = {
        ...o,
        pickupLocation: type === 'pickup' ? locWithId : o.pickupLocation,
        deliveryLocation: type === 'delivery' ? locWithId : o.deliveryLocation,
        lastEditedBy: 'helper' as const,
        lastEditedAt: new Date().toISOString(),
        updatedByCustomer: false,
        editHistory: [
          ...(o.editHistory || []),
          {
            id: `eh-${Date.now()}`,
            timestamp: new Date().toISOString(),
            editedBy: 'helper' as const,
            editedByName: o.helperName || 'Helper',
            changes,
          },
        ],
        statusHistory: [
          ...(o.statusHistory || []),
          {
            id: `sh-${Date.now()}`,
            status: o.status,
            timestamp: new Date().toISOString(),
            actor: `Helper (${o.helperName || 'Helper'})`,
            note: `${type === 'pickup' ? 'Pickup' : 'Delivery'} address updated to: ${locWithId.address}`,
          },
        ],
      };
      return updatedOrder;
    });

    if (type === 'pickup') {
      showAlert(
        'পিকআপ ঠিকানা সংরক্ষণ হয়েছে',
        'পিকআপ ঠিকানা সফলভাবে সেট করা হয়েছে। নির্ভুল দূরত্ব ও ডেলিভারি চার্জ হিসাব করা হয়েছে এবং এই কাস্টমারের জন্য ঠিকানাটি পরবর্তীতে ব্যবহারের জন্য সংরক্ষণ করা হয়েছে।',
        'success'
      );
    } else {
      showAlert('ঠিকানা আপডেট করা হয়েছে', 'ঠিকানা সফলভাবে পরিবর্তন করা হয়েছে এবং কাস্টমারকে জানানো হয়েছে।', 'success');
    }
  };

  const openHelperEditModal = () => {
    if (isDone) return;
    setShowHelperEditModal(true);
  };

  const handlePlaceShopOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingOrder || !placeOrderShop) return;

    const checkedItems = shopOrderItems.filter((i) => i.isChecked);
    if (checkedItems.length === 0) {
      setOrderTextError('অনুগ্রহ করে অন্তত একটি আইটেম চেক করুন।');
      return;
    }

    const calculatedTotal = totalShopOrderCost;
    if (calculatedTotal <= 0) {
      setOrderTextError('পণ্যের সঠিক মূল্য/প্রাইস (৳) নির্ধারণ করা আবশ্যক।');
      return;
    }

    const hasInvalidPrice = checkedItems.some(
      (i) => !i.price || isNaN(parseFloat(i.price)) || parseFloat(i.price) <= 0
    );
    if (hasInvalidPrice) {
      setOrderTextError('নির্বাচিত প্রতিটি পণ্যের জন্য সঠিক মূল্য (৳) লিখুন।');
      return;
    }

    setIsSubmittingOrder(true);
    try {
      const itemsListText = checkedItems
        .map((i) => `${i.name}${getItemQtyDisplay(i)}`)
        .join(', ');

      const initialStatus: ShopOrderStatus = 'PENDING';
      const statusNote = 'Helper sent request to store';

      const newShopOrder: ShopOrder = {
        id: shopOrderDraftIdRef.current || `so-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        parentOrderId: order.id,
        shopId: placeOrderShop.id,
        shopName: placeOrderShop.name,
        helperId: order.helperId || '',
        helperName: order.helperName || 'Helper',
        requestText: itemsListText,
        helperNote: storeInstructionNote.trim() || undefined,
        status: initialStatus,
        viewedByStore: false,
        price: calculatedTotal,
        itemsWithPrice: checkedItems.map((i) => ({
          name: i.name,
          unit: formatItemQuantityUnit(getItemQuantityNum(i), i.unit, i.qty),
          price: parseFloat(i.price || '0') || undefined,
          itemId: i.id,
          originalId: i.originalId,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        statusHistory: [{ status: initialStatus, timestamp: new Date().toISOString(), actor: order.helperName || 'Helper', note: statusNote }],
      };
      shopOrderDraftIdRef.current = newShopOrder.id;
      const result = await fallbackStore.addShopOrder(newShopOrder);

      // Ensure all selected items are assigned to this store group
      const relatedItemIds = checkedItems.filter(i => !i.isNote).map(i => i.originalId);
      if (relatedItemIds.length > 0) {
        fallbackStore.updateOrder(order.id, (o) => ({
          ...o,
          items: (o.items || []).map(it =>
            relatedItemIds.includes(it.id)
              ? { ...it, storeId: placeOrderShop.id, storeName: placeOrderShop.name, isCustom: false }
              : it
          ),
        }));
      }

      shopOrderDraftIdRef.current = null;
      setPlaceOrderShop(null);
      setShopOrderItems([]);
      setSelectedCustomItemIds([]);
      setStoreInstructionNote('');
      setOrderTextError('');
      reportShopOrderResult(result);
    } catch (err) {
      // Used to fall through silently: no message, and the helper assumed the
      // request had gone. The modal stays open so Send can be pressed again.
      setOrderTextError(shopOrderErrorText(err));
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const orderStoresList = useMemo(() => {
    const storeMap = new Map<string, {
      id: string;
      name: string;
      address?: string;
      lat?: number;
      lng?: number;
      isClosed?: boolean;
      distanceKm?: number;
      source: 'item' | 'request';
    }>();

    const dLat = order.deliveryLocation?.lat;
    const dLng = order.deliveryLocation?.lng;
    const hasDelivery = typeof dLat === 'number' && typeof dLng === 'number';

    // 1. Direct items with storeId
    (order.items || []).forEach((it) => {
      if (it.storeId) {
        const shop = fallbackStore.shops.get(it.storeId);
        const name = shop?.name || it.storeName || it.storeId;
        const address = shop?.location?.address || (shop as any)?.address;
        const lat = shop?.location?.lat;
        const lng = shop?.location?.lng;
        const isClosed = !!order.isStoreClosedAtOrder || (!!shop && (shop.isOpen === false || shop.isBlocked === true));

        let dist: number | undefined = undefined;
        if (hasDelivery && typeof lat === 'number' && typeof lng === 'number') {
          dist = parseFloat(calculateDistanceKm(lat, lng, dLat!, dLng!).toFixed(2));
        }

        if (!storeMap.has(it.storeId)) {
          storeMap.set(it.storeId, {
            id: it.storeId,
            name,
            address,
            lat,
            lng,
            isClosed,
            distanceKm: dist,
            source: 'item',
          });
        }
      }
    });

    // 2. Active shop orders (store requests)
    shopOrders.forEach((so) => {
      if (
        so.parentOrderId === order.id &&
        so.shopId &&
        so.shopId !== 'myself' &&
        so.status !== 'CANCELED' &&
        (so.status as string) !== 'CANCELLED'
      ) {
        const shop = fallbackStore.shops.get(so.shopId);
        const name = shop?.name || so.shopName || so.shopId;
        const address = shop?.location?.address || (shop as any)?.address;
        const lat = shop?.location?.lat;
        const lng = shop?.location?.lng;
        const isClosed = !!shop && (shop.isOpen === false || shop.isBlocked === true);

        let dist: number | undefined = undefined;
        if (hasDelivery && typeof lat === 'number' && typeof lng === 'number') {
          dist = parseFloat(calculateDistanceKm(lat, lng, dLat!, dLng!).toFixed(2));
        }

        if (!storeMap.has(so.shopId)) {
          storeMap.set(so.shopId, {
            id: so.shopId,
            name,
            address,
            lat,
            lng,
            isClosed,
            distanceKm: dist,
            source: 'request',
          });
        } else {
          const existing = storeMap.get(so.shopId)!;
          if (existing.lat === undefined && lat !== undefined) existing.lat = lat;
          if (existing.lng === undefined && lng !== undefined) existing.lng = lng;
          if (!existing.address && address) existing.address = address;
          if (existing.distanceKm === undefined && dist !== undefined) existing.distanceKm = dist;
        }
      }
    });

    return Array.from(storeMap.values());
  }, [order.items, order.isStoreClosedAtOrder, order.deliveryLocation, shopOrders, fallbackStore.shops]);

  const basePickupDistance = useMemo(() => {
    if (order.pickupLocation?.lat && order.pickupLocation?.lng && order.deliveryLocation?.lat && order.deliveryLocation?.lng) {
      return parseFloat(calculateDistanceKm(order.pickupLocation.lat, order.pickupLocation.lng, order.deliveryLocation.lat, order.deliveryLocation.lng).toFixed(2));
    }
    return 0;
  }, [order.pickupLocation, order.deliveryLocation]);

  const furthestPickupInfo = useMemo(() => {
    let maxDist = basePickupDistance;
    let furthestStoreId: string | null = null;
    let furthestLabel = order.pickupLocation?.address || 'Pickup';

    orderStoresList.forEach((s) => {
      if (s.distanceKm !== undefined && s.distanceKm > maxDist) {
        maxDist = s.distanceKm;
        furthestStoreId = s.id;
        furthestLabel = `${s.name}${s.address ? ` (${s.address})` : ''}`;
      }
    });

    return { maxDist, furthestStoreId, furthestLabel };
  }, [basePickupDistance, orderStoresList, order.pickupLocation?.address]);

  // For distance calculation, count the most far / longest pickup address
  const distanceKm = furthestPickupInfo.maxDist;

  const handleOpenStoreDirection = (st: { lat?: number; lng?: number; address?: string; name: string }) => {
    let destStr = '';
    if (st.lat && st.lng) {
      destStr = `${st.lat},${st.lng}`;
    } else if (st.address) {
      destStr = encodeURIComponent(st.address);
    } else {
      destStr = encodeURIComponent(st.name);
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destStr}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const renderStoresAddressList = () => {
    if (orderStoresList.length === 0) return null;
    return (
      <div className="space-y-1.5 animate-in fade-in pb-1">
        <div className="flex items-center justify-between text-[10px] font-black uppercase text-gray-500 tracking-wider">
          <span className="flex items-center gap-1">
            <Store className="w-3.5 h-3.5 text-emerald-600" />
            <span>Stores & Pickup Addresses ({orderStoresList.length}):</span>
          </span>
          {distanceKm > 0 && (
            <span className="text-[9px] font-black text-emerald-800 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-200">
              Max: {distanceKm.toFixed(2)} km
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {orderStoresList.map((st) => {
            const isFurthest = st.id === furthestPickupInfo.furthestStoreId;
            return (
              <div
                key={st.id}
                className={`p-2.5 rounded-xl border space-y-1.5 transition-all ${
                  isFurthest
                    ? 'bg-emerald-50/80 border-emerald-300 ring-1 ring-emerald-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                {/* Top Row: Store Info & Top-Right Merged Distance / Direction Button */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                    <Store className={`w-3.5 h-3.5 shrink-0 ${isFurthest ? 'text-emerald-700' : 'text-gray-500'}`} />
                    <span className="font-extrabold text-xs text-gray-900 break-words">{st.name}</span>
                    {st.isClosed && (
                      <span className="text-[8px] font-black bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200 uppercase shrink-0">
                        বন্ধ
                      </span>
                    )}
                    {isFurthest && orderStoresList.length > 1 && (
                      <span className="text-[8px] font-black bg-emerald-600 text-white px-1.5 py-0.5 rounded-full shadow-2xs uppercase tracking-wider shrink-0">
                        Longest Pickup (গণনা করা হয়েছে)
                      </span>
                    )}
                  </div>

                  {/* Top-Right Merged Button (Distance + Direction) */}
                  <button
                    type="button"
                    onClick={() => handleOpenStoreDirection(st)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
                    title={`Google Maps Direction to ${st.name}${st.distanceKm ? ` (${st.distanceKm.toFixed(2)} km)` : ''}`}
                  >
                    <Navigation className="w-3 h-3" />
                    <span>
                      {st.distanceKm !== undefined && st.distanceKm > 0
                        ? `${st.distanceKm.toFixed(2)} km`
                        : 'Direction'}
                    </span>
                  </button>
                </div>

                {/* Bottom Row: Store Address */}
                <p className="text-[11px] text-gray-600 flex items-start gap-1 break-words">
                  <MapPin className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                  <span>{st.address || 'ঠিকানা দেওয়া নেই (Address not set)'}</span>
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleOpenGoogleMapsDirection = () => {
    const furthestStore = orderStoresList.find((s) => s.id === furthestPickupInfo.furthestStoreId);
    const pLat = furthestStore?.lat ?? order.pickupLocation?.lat;
    const pLng = furthestStore?.lng ?? order.pickupLocation?.lng;
    const pAddr = furthestStore?.address ?? order.pickupLocation?.address;
    const destLat = order.deliveryLocation?.lat;
    const destLng = order.deliveryLocation?.lng;

    let originStr = '';
    if (pLat && pLng) {
      originStr = `&origin=${pLat},${pLng}`;
    } else if (pAddr) {
      originStr = `&origin=${encodeURIComponent(pAddr)}`;
    }

    const destStr = destLat && destLng ? `${destLat},${destLng}` : encodeURIComponent(order.deliveryLocation?.address || '');

    const url = `https://www.google.com/maps/dir/?api=1${originStr}&destination=${destStr}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const customerProfile = fallbackStore.users.get(order.customerId);
  const customerLabels = customerProfile?.labels || [];

  const activeProductCost = useMemo(() => {
    return calculateOrderProductCost(order, shopOrders);
  }, [order, shopOrders]);

  const estdPricing = calculateEstimatedFee({
    distanceKm: Math.ceil(distanceKm),
    weightKg: Math.ceil(order.weightKg || 0),
    isReturnRequested: !!order.needReturnItems || !!order.needDeliveryBack,
    productPrice: activeProductCost,
  }, fallbackStore.pricingSettings);

  // Validation: helper must enter product cost (which auto-sets delivery fee) before advancing
  const hasCostAndFee = order.productCost !== undefined;

  const badge = getStatusBadgeInfo(order.status);

  const isDone = order.status === 'DELIVERED' || order.status === 'CANCELED';
  const urgency = getHelperUrgencyBgClass(order, isDone);
  const isPaused = isOrderTimerPaused(order);

  const [elapsed, setElapsed] = useState(() =>
    isDone
      ? getDeliveryDurationText(order)
      : getElapsedTime(order)
  );

  // Shared 1-second clock — see useSecondTick.
  const tick = useSecondTick(!isDone);

  useEffect(() => {
    setElapsed(isDone ? getDeliveryDurationText(order) : getElapsedTime(order));
  }, [order, isDone, tick]);

  const handleUpdateStatus = (newStatus: OrderStatus, note?: string) => {
    fallbackStore.updateOrder(order.id, (o) => {
      const updatedHistory = [
        ...(o.statusHistory || []),
        {
          id: `sh-${Date.now()}`,
          status: newStatus,
          timestamp: new Date().toISOString(),
          actor: `Helper (${o.helperName || 'Helper'})`,
          note: note || `Status updated to ${newStatus}`,
        },
      ];

      const updateData: Partial<Order> = {
        status: newStatus,
        statusHistory: updatedHistory,
      };

      if (newStatus === 'PURCHASED_EXECUTED') updateData.purchasedAt = new Date().toISOString();
      if (newStatus === 'ON_THE_WAY') updateData.onTheWayAt = new Date().toISOString();
      if (newStatus === 'ARRIVED') updateData.arrivedAt = new Date().toISOString();
      if (newStatus === 'DELIVERED') updateData.deliveredAt = new Date().toISOString();

      return { ...o, ...updateData };
    });
  };

  const toggleParsedItemPurchased = (subId: string, originalId: string, itemName?: string) => {
    if (isDone) return;
    const currentParsed = parsedItems.find((i) => i.id === subId);
    const currentlyChecked = checkedSubItems[subId] !== undefined
      ? !!checkedSubItems[subId]
      : (currentParsed ? currentParsed.purchased : false);
    const nextVal = !currentlyChecked;

    // Check store requirements: if trying to check a store item, helper must place request first and store must respond (accept or reject)
    if (nextVal) {
      const storeItem = (order.items || []).find(
        (it) => (it.id === originalId || it.id === subId) && !it.isCustom && it.storeId && !order.isStoreClosedAtOrder
      );
      if (storeItem && storeItem.storeId) {
        const storeOrders = shopOrders.filter(
          (so) => so.shopId === storeItem.storeId && so.shopId !== 'myself' && so.parentOrderId === order.id
        );
        const activeOrLatestSO =
          storeOrders.find((so) => so.status !== 'CANCELED' && (so.status as string) !== 'CANCELLED') ||
          storeOrders.sort(
            (a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
          )[0];

        if (!activeOrLatestSO) {
          showAlert(
            'দোকানে অর্ডার পাঠানো আবশ্যক',
            `এই পণ্যটি নির্দিষ্ট দোকানের। প্রথমে উপরে "Order Now" বাটনে ক্লিক করে দোকানে রিকোয়েস্ট পাঠান। দোকান একসেপ্ট বা রিজেক্ট করলে আপনি চেক করে এগিয়ে যেতে পারবেন।`,
            'info'
          );
          return;
        }
        if (activeOrLatestSO.status === 'PENDING') {
          showAlert(
            'দোকানের রেসপন্সের অপেক্ষা',
            `দোকানে রিকোয়েস্ট পাঠানো হয়েছে এবং বর্তমানে পেন্ডিং রয়েছে। দোকান অর্ডারটি একসেপ্ট বা রিজেক্ট করার পর আপনি চেক করে কাজ করতে পারবেন।`,
            'info'
          );
          return;
        }
      }
    }

    setCheckedSubItems((prev) => ({ ...prev, [subId]: nextVal }));

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      items: (o.items || []).map((it) => (it.id === originalId ? { ...it, purchased: nextVal } : it)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const [showUncheckedModal, setShowUncheckedModal] = useState(false);
  const [pendingNextStatus, setPendingNextStatus] = useState<OrderStatus | null>(null);
  const [uncheckedNote, setUncheckedNote] = useState('');
  const [uncheckedError, setUncheckedError] = useState('');

  const handleUpdateStatusWithCheck = (newStatus: OrderStatus, note?: string) => {
    // 1. Store items requirement check: helper must place request to store, and store must accept or reject before going ahead
    const storeItemGroups = (order.items || []).filter((it) => !it.isCustom && it.storeId && !order.isStoreClosedAtOrder);
    const uniqueStoreIds = Array.from(new Set(storeItemGroups.map((it) => it.storeId!)));

    const unrequestedStores: string[] = [];
    const pendingStores: string[] = [];

    uniqueStoreIds.forEach((sid) => {
      const storeOrders = shopOrders.filter(
        (so) => so.shopId === sid && so.shopId !== 'myself' && so.parentOrderId === order.id
      );
      const activeOrLatestSO =
        storeOrders.find((so) => so.status !== 'CANCELED' && (so.status as string) !== 'CANCELLED') ||
        storeOrders.sort(
          (a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
        )[0];

      const shopObj = fallbackStore.shops.get(sid);
      const sName = shopObj?.name || storeItemGroups.find((it) => it.storeId === sid)?.storeName || sid;

      if (!activeOrLatestSO) {
        unrequestedStores.push(sName);
      } else if (activeOrLatestSO.status === 'PENDING') {
        pendingStores.push(sName);
      }
    });

    if (unrequestedStores.length > 0) {
      showAlert(
        'দোকানে অর্ডার রিকোয়েস্ট পাঠান',
        `দোকানের পণ্য সংগ্রহের জন্য প্রথমে দোকানে "Order Now" দিয়ে রিকোয়েস্ট পাঠাতে হবে:\n• ${unrequestedStores.join('\n• ')}\n\nদোকান অর্ডারটি গ্রহণ (Accept) বা বাতিল (Reject) করলে আপনি পরবর্তী ধাপে যেতে পারবেন।`,
        'warning'
      );
      return;
    }

    if (pendingStores.length > 0) {
      showAlert(
        'দোকানের উত্তরের জন্য অপেক্ষা করুন',
        `নিম্নলিখিত দোকান এখনো রিকোয়েস্ট গ্রহণ বা বাতিল করেনি:\n• ${pendingStores.join('\n• ')}\n\nদোকান একসেপ্ট বা রিজেক্ট করার পর আপনি পরবর্তী ধাপে যেতে পারবেন।`,
        'warning'
      );
      return;
    }

    // Helper can freely transition to Processing (PURCHASED_EXECUTED) once store checks pass
    if (newStatus === 'PURCHASED_EXECUTED') {
      handleUpdateStatus(newStatus, note);
      return;
    }

    const activeShopOrders = shopOrders.filter(
      (so) => so.status !== 'CANCELED' && (so.status as string) !== 'CANCELLED'
    );
    const effectiveCost = calculateOrderProductCost(order, shopOrders);
    if (effectiveCost <= 0) {
      showAlert(
        'Product Cost Required',
        'অর্ডারের মোট বিল/প্রোডাক্ট কস্ট যোগ করতে হবে। অনুগ্রহ করে "Request to store" বা "+ Custom Cost" ব্যবহার করে প্রতিটি পণ্যের খরচ যুক্ত করুন। শুধুমাত্র আইটেম সিলেক্ট করা যথেষ্ট নয়।',
        'warning'
      );
      return;
    }

    // Block if any real-store orders are still pending acceptance
    const pendingStoreOrders = activeShopOrders.filter(
      so => so.shopId !== 'myself' && (so.status === 'PENDING' || so.status === 'PREPARING')
    );
    if (pendingStoreOrders.length > 0) {
      showAlert(
        'দোকানের অ্যাকসেপ্টেন্স বাকি',
        `${pendingStoreOrders.map(s => s.shopName).join(', ')} — দোকান এখনো অর্ডার অ্যাকসেপ্ট করেনি। দোকান অ্যাকসেপ্ট করলে আপনি পরবর্তী ধাপে যেতে পারবেন।`,
        'warning'
      );
      return;
    }

    // Check if any items are unconfirmed (do not have a connected store order or custom cost)
    const unconfirmedItems = parsedItems.filter((i) => !getItemConnectedOrder(i.name, i.id));
    if (unconfirmedItems.length > 0 && !note) {
      setPendingNextStatus(newStatus);
      setUncheckedNote('');
      setUncheckedError('');
      setShowUncheckedModal(true);
      return;
    }

    if (newStatus === 'DELIVERED') {
      handleConfirmDeliveryWithModal();
    } else {
      handleUpdateStatus(newStatus, note);
    }
  };

  const handleConfirmUncheckedSubmission = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCost = calculateOrderProductCost(order, shopOrders);
    if (effectiveCost <= 0) {
      showAlert(
        'Product Cost Required',
        'অর্ডারের মোট বিল/প্রোডাক্ট কস্ট যোগ করতে হবে।',
        'warning'
      );
      setShowUncheckedModal(false);
      return;
    }
    if (!uncheckedNote.trim()) {
      setUncheckedError('অগ্রসর হতে হলে একটি নোট/কারণ লিখুন।');
      return;
    }
    if (pendingNextStatus) {
      if (pendingNextStatus === 'DELIVERED') {
        handleConfirmDeliveryWithModal();
      } else {
        handleUpdateStatus(pendingNextStatus, uncheckedNote.trim());
      }
      setShowUncheckedModal(false);
      setPendingNextStatus(null);
      setUncheckedNote('');
    }
  };

  const handleStatusClick = (targetStatus: OrderStatus) => {
    if (isDone) return;

    const statusOrder = ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'SCHEDULED', 'ARRIVED', 'DELIVERED'];
    const currentIdx = statusOrder.indexOf(order.status);
    const targetIdx = statusOrder.indexOf(targetStatus);

    if (targetIdx === -1) return;
    if (targetStatus === order.status) return;

    if (targetIdx < currentIdx) {
      handleUpdateStatus(targetStatus, `Status reverted back to ${targetStatus}`);
      return;
    }

    if (targetStatus === 'PURCHASED_EXECUTED') {
      handleUpdateStatus(targetStatus);
      return;
    }

    handleUpdateStatusWithCheck(targetStatus);
  };

  const handleSaveProductCost = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(productCostInput);
    if (isNaN(val) || val < 0) return;

    const currentWeight = parseFloat(weightInput) || 0;
    const settings = fallbackStore.pricingSettings;

    const estdBase = calculateEstimatedFee({
      distanceKm: Math.ceil(distanceKm),
      weightKg: 0,
      isReturnRequested: !!order.needReturnItems || !!order.needDeliveryBack,
      productPrice: 0,
    }, settings);

    const perKgRate = settings.feeCalculatorPerKgRate ?? 5;
    const weightFee = Math.ceil(currentWeight) * perKgRate;

    const estd = calculateEstimatedFee({
      distanceKm: Math.ceil(distanceKm),
      weightKg: Math.ceil(currentWeight),
      isReturnRequested: !!order.needReturnItems || !!order.needDeliveryBack,
      productPrice: val,
    }, settings);
    const finalFee = estd.totalFee;

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      productCost: val,
      deliveryFee: o.isFreeDelivery ? 0 : finalFee,
      originalDeliveryFee: o.isFreeDelivery ? 0 : finalFee,
    }));
    setShowCostModal(false);
  };

  const updateEstdPricing = (newCost: number, newWeight: number) => {
    const settings = fallbackStore.pricingSettings;

    const estdBase = calculateEstimatedFee({
      distanceKm: Math.ceil(distanceKm),
      weightKg: 0,
      isReturnRequested: !!order.needReturnItems || !!order.needDeliveryBack,
      productPrice: newCost,
    }, settings);

    const perKgRate = settings.feeCalculatorPerKgRate ?? 5;
    const weightFee = Math.ceil(newWeight) * perKgRate;

    const estd = calculateEstimatedFee({
      distanceKm: Math.ceil(distanceKm),
      weightKg: Math.ceil(newWeight),
      isReturnRequested: !!order.needReturnItems || !!order.needDeliveryBack,
      productPrice: newCost,
    }, settings);
    const finalFee = estd.totalFee;

    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      productCost: newCost,
      weightKg: newWeight,
      deliveryFee: o.isFreeDelivery ? 0 : finalFee,
      originalDeliveryFee: o.isFreeDelivery ? 0 : finalFee,
    }));
  };

  const handleSaveDeliveryFee = (e: React.FormEvent) => {
    e.preventDefault();
    if (order.isFreeDelivery) {
      showAlert(
        'ফ্রি ডেলিভারি অর্ডার',
        'এই অর্ডারে গ্রাহক কয়েন ব্যবহার করে ফ্রি ডেলিভারি নিয়েছেন। ডেলিভারি ফি পরিবর্তন বা যোগ করা যাবে না।',
        'warning'
      );
      return;
    }

    const val = parseFloat(feeInput);
    if (isNaN(val) || val < 0) return;

    const limit = fallbackStore.pricingSettings.feeCalculatorMaxLimit || 0;
    if (val > limit && !customerAgreed) {
      showAlert(
        'কাস্টমার সম্মতি আবশ্যক',
        'ফি লিমিট অতিক্রম করায় অগ্রসর হতে কাস্টমারের সম্মতি নিশ্চিত করা আবশ্যক।',
        'warning'
      );
      return;
    }

    fallbackStore.updateOrder(order.id, (o) => {
      const updatedHistory = [
        ...(o.statusHistory || []),
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: `Helper (${o.helperName || 'Helper'})`,
          note: `Delivery fee adjusted to ৳${val}${feeReason.trim() ? `: ${feeReason.trim()}` : ''}`,
        },
      ];

      return {
        ...o,
        deliveryFee: val,
        feeAdjustment: feeReason.trim()
          ? {
            amount: val,
            reason: feeReason.trim(),
            status: 'APPROVED',
            requestedAt: new Date().toISOString(),
          }
          : o.feeAdjustment,
        statusHistory: updatedHistory,
      };
    });
    setShowFeeModal(false);
  };

  const handleRequestCancellation = () => {
    setCancelReason('');
    setCancelError('');
    setShowCancelModal(true);
  };

  const handleConfirmCancellationRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      setCancelError('বাতিলের কারণ অনুগ্রহ করে উল্লেখ করুন।');
      return;
    }
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      cancellationRequest: {
        requestedBy: 'helper',
        reason: cancelReason.trim(),
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      },
      statusHistory: [
        ...(o.statusHistory || []),
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: `Helper (${o.helperName || 'Helper'})`,
          note: `Requested order cancellation. Reason: ${cancelReason.trim()}`,
        },
      ],
    }));
    setShowCancelModal(false);
  };

  const handleSaveHelperNote = (e: React.FormEvent) => {
    e.preventDefault();
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      helperNote: helperNoteInput.trim(),
    }));
    setNoteSavedAlert(true);
    setTimeout(() => setNoteSavedAlert(false), 2500);
  };


  const handleConfirmDeliveryWithModal = () => {
    const effectiveFee = Math.max(order.deliveryFee || 0, estdPricing.minFee);
    const earned = calculateHelperCommission(effectiveFee, fallbackStore.pricingSettings);
    setEarnedAmount(earned);
    handleUpdateStatus('DELIVERED');
    setShowCompletionModal(true);
  };

  if (order.status === 'CANCELED' || order.cancellationRequest?.status === 'APPROVED') {
    return (
      <div className="w-full bg-white min-h-screen pb-20">
        <div className="sticky top-14 z-20 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <button
            onClick={onBack}
            className="p-2 rounded-2xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex items-center space-x-1"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-xs font-bold">Back</span>
          </button>
          <div className="flex items-center gap-2 flex-1 justify-center min-w-0 px-1">
            <span className="p-1.5 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0 flex items-center justify-center shadow-xs">
              <ServiceIcon service={order.service} className="w-5 h-5 text-emerald-700" />
            </span>
            <span className="font-extrabold text-sm text-gray-800 truncate min-w-0">{order.service || order.title || 'Helper Order'}</span>
            <span className="text-[10px] font-black font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200 shrink-0">#{order.id}</span>
          </div>
          <div className="w-8" />
        </div>

        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 p-8 text-center bg-white rounded-3xl border border-red-100 shadow-sm my-6 max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shadow-inner">
            <X className="w-10 h-10" />
          </div>
          <h3 className="font-extrabold text-gray-900 text-lg">Order Cancelled</h3>
          <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
            This order has been cancelled by customer or admin.
          </p>
          <button
            onClick={onBack}
            className="mt-4 px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold shadow-md transition-all active:scale-95"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white min-h-screen pb-20 animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="sticky top-14 z-20 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-2 rounded-2xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex items-center space-x-1"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-xs font-bold">Back</span>
        </button>
        <div className="flex items-center gap-2 flex-1 justify-center min-w-0 px-1">
          <span className="p-1.5 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0 flex items-center justify-center shadow-xs">
            <ServiceIcon service={order.service} className="w-5 h-5 text-emerald-700" />
          </span>
          <span className="font-extrabold text-sm text-gray-800 truncate min-w-0">{order.service || order.title || 'Helper Order'}</span>
          <span className="text-[10px] font-black font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200 shrink-0">#{order.id}</span>
        </div>
        <div className="w-8" />
      </div>

      <div className="max-w-md mx-auto p-4 space-y-5">
        {/* DYNAMIC URGENCIES TIMER BLOCK */}
        <div className={`relative w-full rounded-2xl py-3 px-4 flex flex-col items-center justify-center transition-all ${urgency.urgencyLevel === 'red'
          ? 'bg-gradient-to-br from-red-100 via-rose-50 to-red-100 border-2 border-red-400 shadow-md shadow-red-100'
          : urgency.urgencyLevel === 'yellow'
            ? 'bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-100 border-2 border-amber-400 shadow-sm shadow-amber-100'
            : 'bg-red-50/10 border border-red-500'
          }`}>
          {customerLabels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2 justify-center w-full">
              {customerLabels.map((lbl, idx) => (
                <span
                  key={idx}
                  className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-[9px] font-black px-2 py-0.5 rounded-full border border-white/20 shadow-xs uppercase tracking-wider"
                >
                  {lbl}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center space-x-2.5">
            <Clock className={`w-5 h-5 ${isPaused
              ? 'text-indigo-600'
              : urgency.urgencyLevel === 'red'
                ? 'text-red-700 animate-spin'
                : urgency.urgencyLevel === 'yellow'
                  ? 'text-amber-700 animate-spin-slow'
                  : 'text-red-600 animate-pulse'
              }`} />
            <span className={`text-xs font-black uppercase tracking-wider ${isPaused
              ? 'text-indigo-900'
              : urgency.urgencyLevel === 'red'
                ? 'text-red-950'
                : urgency.urgencyLevel === 'yellow'
                  ? 'text-amber-950'
                  : 'text-red-600'
              }`}>
              {isDone ? 'Duration:' : isPaused ? '⏸️ Paused (Stuck):' : 'Live:'}
            </span>
            <span className={`text-xl font-black font-mono ${isPaused
              ? 'text-indigo-950 font-bold'
              : urgency.urgencyLevel === 'red'
                ? 'text-red-950'
                : urgency.urgencyLevel === 'yellow'
                  ? 'text-amber-950'
                  : 'text-red-600'
              }`}>
              {elapsed}
            </span>
          </div>

          {!isDone && !isPaused && urgency.urgencyLevel === 'red' && (
            <p className="mt-1.5 text-[11px] font-black text-red-700 bg-red-200/80 px-3 py-1 rounded-full border border-red-300 text-center animate-pulse">
              🚨 55+ min elapsed! Please deliver urgently!
            </p>
          )}

          {!isDone && !isPaused && urgency.urgencyLevel === 'yellow' && (
            <p className="mt-1.5 text-[11px] font-black text-amber-900 bg-amber-200/80 px-3 py-1 rounded-full border border-amber-300 text-center">
              ⚠️ 40+ min elapsed! Please expedite delivery.
            </p>
          )}

          {order.needDeliveryBack && order.deliveryBackTime && (
            <div className={`mt-2 flex items-center space-x-1.5 px-3 py-1.5 rounded-full border w-full justify-center ${isPaused
              ? 'bg-indigo-100/90 border-indigo-300 text-indigo-900 shadow-xs'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}>
              <CalendarClock className={`w-3.5 h-3.5 shrink-0 ${isPaused ? 'text-indigo-700' : 'text-emerald-600'}`} />
              <span className="text-[10px] font-extrabold text-center">
                {isPaused
                  ? `⏸️ Timer Paused • Return at: ${new Date(order.deliveryBackTime).toLocaleString('en-BD', { dateStyle: 'short', timeStyle: 'short' })}`
                  : `▶️ Step 2 Running • Scheduled: ${new Date(order.deliveryBackTime).toLocaleString('en-BD', { dateStyle: 'short', timeStyle: 'short' })}`}
              </span>
            </div>
          )}
        </div>

        {/* Horizontal Status Tracker */}
        {(order.status as string) !== 'CANCELED' && (
          <div className="w-full bg-white rounded-2xl border border-gray-100 px-3 py-3 shadow-soft">
            <div className="flex items-start">
              {(['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'SCHEDULED', 'ARRIVED', 'DELIVERED'] as const).map((statusKey, idx, arr) => {
                const labels: Record<string, string> = {
                  ACCEPTED: 'Accepted',
                  PURCHASED_EXECUTED: 'Processing',
                  ON_THE_WAY: 'On-Way',
                  SCHEDULED: 'scheduled',
                  ARRIVED: 'Arrived',
                  DELIVERED: 'Delivered',
                };
                const statusOrder = ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'SCHEDULED', 'ARRIVED', 'DELIVERED'];
                let currentIdx = statusOrder.indexOf(order.status);
                if (order.status === 'ARRIVED') {
                  currentIdx = 4;
                } else if (order.status === 'DELIVERED') {
                  currentIdx = 5;
                }
                const isCompleted = idx < currentIdx;
                const isCurrent = idx === currentIdx;
                const isLast = idx === arr.length - 1;
                return (
                  <React.Fragment key={statusKey}>
                    <button
                      type="button"
                      disabled={isDone || statusKey === 'SCHEDULED'}
                      onClick={() => statusKey !== 'SCHEDULED' && handleStatusClick(statusKey as OrderStatus)}
                      className="flex flex-col items-center gap-1 flex-1 cursor-pointer disabled:cursor-default disabled:pointer-events-none hover:scale-105 active:scale-95 transition-all outline-none"
                    >
                      <div className={`w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-all ${isCompleted
                        ? 'bg-emerald-500 border-emerald-500 shadow-sm shadow-emerald-200'
                        : isCurrent
                          ? 'bg-amber-400 border-amber-400 animate-pulse shadow-sm shadow-amber-200'
                          : 'bg-white border-gray-300'
                        }`}>
                        {isCompleted && (
                          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {isCurrent && !isCompleted && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                      <span className={`text-[9px] font-black text-center leading-tight whitespace-nowrap ${isCompleted ? 'text-emerald-700' : isCurrent ? 'text-amber-700' : 'text-gray-400'
                        }`}>{labels[statusKey]}</span>
                    </button>
                    {!isLast && (
                      <div className={`flex-1 h-0.5 mt-2.5 mx-0.5 rounded-full transition-all ${isCompleted ? 'bg-emerald-400' : 'bg-gray-200'
                        }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* ORDER CANCELLED BANNER */}
        {((order.status as string) === 'CANCELED' || (order.cancellationRequest?.status as string) === 'APPROVED') && (
          <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-300 text-red-950 shadow-md space-y-1.5 animate-in slide-in-from-top duration-200">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-red-100 text-red-600 shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-xs text-red-900">Order Cancelled</h4>
                <p className="text-[11px] text-red-700 font-medium">
                  This order was cancelled by customer or admin.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOMER EDIT ALERT BANNER (MINIMALIST YELLOW THEME) */}
        {order.updatedByCustomer && (
          <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-950 shadow-sm flex items-center justify-between gap-2 animate-in slide-in-from-top duration-200">
            <div className="flex items-center space-x-1.5 min-w-0">
              <FileEdit className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-extrabold text-xs text-amber-950 truncate">Customer updated order info</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {order.editHistory && order.editHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowEditHistory((v) => !v)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-200/60 hover:bg-amber-200 text-amber-950 rounded-xl text-[10px] font-extrabold border border-amber-300/60 transition-all active:scale-95 cursor-pointer"
                >
                  <span>{showEditHistory ? 'Hide' : 'Details'}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showEditHistory ? 'rotate-180' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  fallbackStore.updateOrder(order.id, (o) => ({ ...o, updatedByCustomer: false }));
                }}
                className="px-2.5 py-1 bg-amber-200/80 hover:bg-amber-300 text-amber-950 rounded-xl text-[10px] font-extrabold border border-amber-300/80 transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ORDER DETAILS IN EXACT REQUESTED SEQUENCE */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft space-y-4">
          {/* PENDING ORDER: Show minimal info only — full details revealed after acceptance */}
          {order.status === 'PENDING' && (
            <div className="space-y-4">
              {/* Order Details / Items */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                  <FileText className="w-4.5 h-4.5 text-emerald-600" />
                  <span>Order Details</span>
                </h4>
                <div className="space-y-2">
                  {(() => {
                    const isItemCustom = (it: OrderItem) => {
                      if (it.isCustom) return true;
                      if (!it.storeId) return true;
                      if (order.isStoreClosedAtOrder) return true;
                      const s = fallbackStore.shops.get(it.storeId);
                      if (s && (s.isOpen === false || s.isBlocked === true)) return true;
                      return false;
                    };
                    const storeItems = (order.items || []).filter(it => !isItemCustom(it));
                    const customItems = (order.items || []).filter(it => isItemCustom(it));

                    // Group store items by storeId
                    const byStore: Record<string, typeof storeItems> = {};
                    storeItems.forEach(it => {
                      if (!byStore[it.storeId!]) byStore[it.storeId!] = [];
                      byStore[it.storeId!].push(it);
                    });

                    const hasGrouped = storeItems.length > 0 || customItems.length > 0;

                    if (!hasGrouped) {
                      // Fallback: display parsedItems as before
                      return parsedItems.map((i) => (
                        <p key={i.id} className="text-base font-extrabold text-white bg-[#19a24c] border-[#19a24c] p-3.5 rounded-2xl shadow-sm leading-snug">
                          {i.name}{getItemQtyDisplay(i)}
                        </p>
                      ));
                    }

                    return (
                      <>
                        {/* Store-connected item groups */}
                        {Object.entries(byStore).map(([sid, items]) => {
                          const storeName = items[0].storeName || sid;
                          return (
                            <div key={sid} className="rounded-2xl border border-purple-200 bg-purple-50/60 overflow-hidden shadow-sm">
                              {/* Store header */}
                              <div className="px-3 py-2 bg-purple-100/70 border-b border-purple-200">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setStoreInfoShopId(sid); }}
                                  className="w-full flex items-center gap-1.5 text-left hover:opacity-85 transition-opacity"
                                >
                                  <Store className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                                  <span className="text-[11px] font-black text-purple-900 uppercase tracking-wide hover:underline">{storeName}</span>
                                </button>
                              </div>
                              {/* Items */}
                              <div className="divide-y divide-purple-100">
                                {items.map(it => {
                                  const priceDetails = getItemPriceDetails(it);
                                  const shop = sid ? fallbackStore.shops.get(sid) : undefined;
                                  return (
                                    <div key={it.id} className="flex items-center justify-between px-3 py-2.5 gap-2">
                                      <div className="flex items-start gap-2 min-w-0 flex-1">
                                        <Package className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
                                        <div className="min-w-0 flex-1">
                                          <span className="text-sm font-extrabold text-gray-900 break-words block">
                                            {it.name}{getItemQtyDisplay(it)}
                                          </span>
                                          {priceDetails && (
                                            <p className="text-[11px] font-mono text-gray-500 font-semibold mt-0.5">
                                              {formatItemQuantityUnit(priceDetails.qty, it.unit, it.qty)} × ৳{priceDetails.unitPrice}
                                            </p>
                                          )}

                                        </div>
                                      </div>
                                      {priceDetails ? (
                                        <div className="text-right shrink-0">
                                          <span className="text-sm sm:text-base font-black text-emerald-700 font-mono">৳{priceDetails.totalPrice}</span>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        {/* Custom / closed-store items */}
                        {customItems.length > 0 && (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden shadow-sm">
                            {/* Header */}
                            <div className="px-3 py-2 bg-amber-100/70 border-b border-amber-200 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span className="text-[11px] font-black text-amber-900 uppercase tracking-wide">
                                  {order.isStoreClosedAtOrder ? 'দোকান বন্ধ ছিল / Custom' : 'Custom / Any Store'}
                                </span>
                              </div>
                              {order.pickupLocation?.address && (
                                <div className="flex items-start gap-1.5 pl-0.5">
                                  <MapPin className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                  <span className="text-[10px] font-bold text-amber-800 leading-snug break-words">
                                    {order.pickupLocation.address}
                                  </span>
                                </div>
                              )}
                            </div>
                            {/* Items */}
                            <div className="divide-y divide-amber-100">
                              {customItems.map(it => {
                                const priceDetails = getItemPriceDetails(it);
                                return (
                                  <div key={it.id} className="px-3 py-2 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                                        <Package className="w-3 h-3 text-amber-600 shrink-0" />
                                        <span className="text-sm font-extrabold text-gray-900 break-words">
                                          {it.name}{getItemQtyDisplay(it)}
                                        </span>
                                        <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0">
                                          Custom
                                        </span>
                                      </div>
                                      {priceDetails && priceDetails.totalPrice > 0 ? (
                                        <div className="text-right shrink-0">
                                          <span className="text-sm font-black text-amber-700 font-mono">৳{priceDetails.totalPrice}</span>
                                          {priceDetails.qty > 1 ? (
                                            <span className="block text-[10px] font-bold text-amber-800/70 font-mono">
                                              {priceDetails.qty} × ৳{priceDetails.unitPrice} = ৳{priceDetails.totalPrice}
                                            </span>
                                          ) : (
                                            <span className="block text-[10px] font-bold text-amber-800/60 font-mono">
                                              1 × ৳{priceDetails.unitPrice} = ৳{priceDetails.totalPrice}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="font-extrabold text-amber-800 font-mono bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 text-[10px] shrink-0">
                                          মূল্য বাকি
                                        </span>
                                      )}
                                    </div>
                                    {/* Buy from hint */}
                                    {it.buyFrom && (
                                      <p className="text-[10px] text-amber-700 font-semibold pl-5">
                                        যেকোনো দোকান অথবা: {it.buyFrom}
                                      </p>
                                    )}
                                    {/* Preferred delivery address */}
                                    <div className="flex items-start gap-1 pl-5">
                                      <MapPin className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                                      <p className="text-[10px] text-gray-500 font-medium leading-snug">
                                        {order.deliveryLocation?.address || 'None'}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                {order.additionalNote && (
                  <div className="mt-3 text-sm text-amber-950 bg-amber-50/90 border border-amber-200 p-3.5 rounded-2xl font-bold space-y-2">
                    <span className="font-black block text-amber-950 text-xs uppercase tracking-wider">Customer Note / Details:</span>
                    {parsedNoteItems.length > 1 ? (
                      <div className="space-y-1.5">
                        {parsedNoteItems.map((itemStr, idx) => (
                          <div key={idx} className="flex items-center space-x-2 bg-amber-100/70 p-2 rounded-xl border border-amber-200/60 text-sm">
                            <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0" />
                            <span className="font-extrabold text-amber-950">{itemStr}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="font-extrabold text-amber-950 text-sm leading-relaxed">{order.additionalNote}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Customer Edit History Log: Show Latest Updated Change for Pending Order */}
              {order.editHistory && order.editHistory.length > 0 && (() => {
                const latestHistoryItem = order.editHistory[order.editHistory.length - 1];
                if (!latestHistoryItem) return null;

                const getEditorLabel = () => {
                  const by = (latestHistoryItem.editedBy || '').toLowerCase();
                  const name = (latestHistoryItem.editedByName || '').toLowerCase();
                  if (by === order.helperId?.toLowerCase() || by === user?.uid?.toLowerCase() || by === 'helper' || name.includes('helper') || name === 'you') {
                    return 'Me';
                  }
                  if (by === order.customerId?.toLowerCase() || by === 'customer' || name.includes('customer')) {
                    return 'Customer';
                  }
                  if (by === 'admin' || name.includes('admin')) {
                    return 'Admin';
                  }
                  return 'Customer';
                };

                const editorLabel = getEditorLabel();

                return (
                  <div className="rounded-2xl bg-amber-50/90 border border-amber-200/80 overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setShowEditHistory((v) => !v)}
                      className="w-full p-3 flex items-center justify-between text-left hover:bg-amber-100/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileEdit className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider truncate">
                          Order Update History ({order.editHistory.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-200/60 hover:bg-amber-200 text-amber-950 rounded-lg text-[10px] font-extrabold border border-amber-300/60 transition-all shrink-0">
                        <span>{showEditHistory ? 'Hide' : 'Details'}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showEditHistory ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {showEditHistory && (
                      <div className="p-2.5 pt-0 text-xs space-y-2 animate-in slide-in-from-top-2 duration-150">
                        {[...order.editHistory].reverse().map((hItem, hIdx) => {
                          const getHistoryEditorLabel = (item: OrderEditHistoryItem) => {
                            const by = (item.editedBy || '').toLowerCase();
                            const name = (item.editedByName || '').toLowerCase();
                            if (by === order.helperId?.toLowerCase() || by === user?.uid?.toLowerCase() || by === 'helper' || name.includes('helper') || name === 'you') {
                              return 'Me';
                            }
                            if (by === order.customerId?.toLowerCase() || by === 'customer' || name.includes('customer')) {
                              return 'Customer';
                            }
                            if (by === 'admin' || name.includes('admin')) {
                              return 'Admin';
                            }
                            return 'Customer';
                          };
                          const label = getHistoryEditorLabel(hItem);

                          return (
                            <div key={hIdx} className="p-2.5 rounded-xl bg-white border border-amber-200/70 text-xs space-y-1.5 shadow-2xs">
                              <div className="border-b border-amber-100 pb-1 flex items-center justify-between">
                                <div className="text-[10px] font-bold text-amber-900">
                                  Update #{order.editHistory!.length - hIdx} ({label})
                                </div>
                                <div className="text-[9px] font-medium text-amber-700/80">
                                  {formatPlacedDateTime(hItem.timestamp)}
                                </div>
                              </div>
                              <div className="space-y-1.5 pt-0.5">
                                {hItem.changes.map((c, idx) => (
                                  <div key={idx} className="text-left space-y-1">
                                    {c.field && c.field !== 'Items / Details' && c.field !== 'Details / Items' && (
                                      <span className="font-extrabold text-amber-950 block text-[11px]">{c.field}:</span>
                                    )}
                                    <div className="text-left flex flex-wrap items-center gap-2">
                                      {c.oldValue && c.oldValue !== 'None' && c.oldValue !== 'Empty' && (
                                        <span className="line-through text-gray-400 text-xs">{c.oldValue}</span>
                                      )}
                                      <span className="text-emerald-950 font-bold bg-emerald-100/90 border border-emerald-200 px-2.5 py-1 rounded-xl inline-block text-xs">
                                        {c.newValue}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Addresses & Visual Map before Customer Details */}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <span>Addresses & Distance</span>
                  </h4>
                  {distanceKm > 0 && (
                    <span className="text-[11px] font-black text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-lg border border-emerald-200">
                      📍 {distanceKm.toFixed(2)} km {furthestPickupInfo.furthestStoreId ? '(Longest)' : ''}
                    </span>
                  )}
                </div>
                <div className="space-y-2 text-xs">
                  {renderStoresAddressList()}
                  {(!order.pickupLocation?.address || order.pickupLocation.address === 'Local Helper Area') ? (
                    <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 shadow-xs space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-extrabold text-amber-900 text-xs">Pickup Not Set</p>
                          <p className="text-[11px] text-amber-700 font-medium leading-relaxed mt-0.5">
                            Set pickup location for accurate distance calculation. Saved to customer profile.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveMapPicker('pickup')}
                        className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all active:scale-98 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>📍 Set Pickup Location</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {order.isStoreClosedAtOrder && (
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="font-extrabold text-amber-900 text-[11px]">⚠️ দোকান বন্ধ ছিল</p>
                            <p className="text-[10px] text-amber-700 font-medium leading-snug mt-0.5">
                              অর্ডারের সময় এই দোকানটি বন্ধ ছিল। নিচের ঠিকানা রেফারেন্স হিসেবে ব্যবহার করুন — <strong>যেকোনো কাছের দোকান</strong> থেকে পণ্য সংগ্রহ করতে পারবেন।
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="p-3 rounded-2xl bg-gray-50 text-gray-700 font-bold border border-gray-200 flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <strong className="font-extrabold text-emerald-800">Pickup: </strong>
                          <span className="break-words">{order.pickupLocation.address}</span>
                          {order.isStoreClosedAtOrder && (
                            <span className="ml-1.5 text-[9px] bg-amber-100 text-amber-700 font-black px-1.5 py-0.5 rounded-md border border-amber-200 uppercase">বন্ধ</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenStoreDirection({
                              lat: order.pickupLocation?.lat,
                              lng: order.pickupLocation?.lng,
                              address: order.pickupLocation?.address,
                              name: 'Pickup Location',
                            })}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] transition-all shadow-2xs active:scale-95 cursor-pointer"
                            title="Google Maps Direction"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Direction</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveMapPicker('pickup')}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-[10px] transition-all shrink-0 active:scale-95 cursor-pointer"
                            title="Edit pickup address"
                          >
                            <FileEdit className="w-3 h-3 text-gray-700" />
                            <span>Edit</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="p-3 rounded-2xl bg-emerald-50/50 text-emerald-950 font-bold border border-emerald-100 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <strong className="font-extrabold text-emerald-800">Delivery: </strong>
                      <span className="break-words">{order.deliveryLocation?.address || 'N/A'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const dLat = order.deliveryLocation?.lat;
                        const dLng = order.deliveryLocation?.lng;
                        const dAddr = order.deliveryLocation?.address;
                        const destStr = dLat && dLng ? `${dLat},${dLng}` : encodeURIComponent(dAddr || '');
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${destStr}&travelmode=driving`, '_blank');
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] transition-all shadow-2xs active:scale-95 cursor-pointer shrink-0"
                      title="Google Maps Direction"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>Direction</span>
                    </button>
                  </div>
                </div>
                {/* Visual Map */}
                <div className="mt-3 relative w-full h-[220px] rounded-2xl border border-gray-200 overflow-hidden bg-slate-100 shadow-inner group">
                  <div ref={pendingMapContainerRef} className="w-full h-full z-10" />
                  <button
                    type="button"
                    onClick={() => setShowMapModal(true)}
                    className="absolute top-2.5 right-2.5 z-20 flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900/90 hover:bg-slate-950 text-white rounded-xl text-xs font-extrabold backdrop-blur-md shadow-md transition-all active:scale-95 cursor-pointer border border-slate-700"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Full Map</span>
                  </button>
                </div>
              </div>

              {/* Customer Details */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1.5">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  <span>Customer Details</span>
                </h4>
                <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-gray-900 text-sm">{order.customerName}</span>
                    {customerLabels.map((lbl, idx) => (
                      <span key={idx} className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-xs uppercase tracking-wider">
                        {lbl}
                      </span>
                    ))}
                  </div>
                  <span className="text-[11px] text-gray-500 mt-0.5 block">
                    {order.alternativePhone || order.customerPhone ? '📞 Contact visible after acceptance' : 'No contact provided'}
                  </span>
                </div>
              </div>

              {/* Already Taken Banner — shown when someone else accepted while viewing */}
              {order.helperId && (
                <div className="pt-2 border-t border-gray-100 animate-in fade-in duration-300">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-red-100 via-rose-50 to-red-100 border-2 border-red-300 space-y-1.5 text-center">
                    <p className="text-sm font-black text-red-800">🚫 অর্ডারটি নেওয়া হয়ে গেছে!</p>
                    <p className="text-xs font-semibold text-red-600">এই অর্ডারটি অন্য একজন হেলপার গ্রহণ করেছেন। আর অ্যাক্সেপ্ট করা সম্ভব নয়।</p>
                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide">Accepted by another helper</p>
                  </div>
                </div>
              )}

              {/* Privacy notice — only show if not yet taken */}
              {!order.helperId && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[11px] text-gray-400 font-medium text-center bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                    🔒 Customer phone number and full order details visible only after accepting
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ACCEPTED+ ORDER: Show full details */}
          {order.status !== 'PENDING' && (
            <>
              {/* 1. ITEMS (Interactive Checklist) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1.5">
                    <ShoppingBag className="w-4 h-4 text-emerald-600" />
                    <span>Items</span>
                  </h4>
                  <div className="flex items-center gap-2">
                    {!isDone && (
                      <button
                        type="button"
                        onClick={openHelperEditModal}
                        className="p-1 px-2.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 text-[11px] font-extrabold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    )}
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">
                      {parsedItems.filter((i) => getItemConnectedOrder(i.name, i.id)).length}/{parsedItems.length} Cost Confirmed
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {(() => {
                    const allItems = order.items || [];
                    const byStore: Record<string, typeof allItems> = {};
                    const customItems: typeof allItems = [];

                    allItems.forEach((it) => {
                      const isCustom = it.isCustom || !it.storeId || !!order.isStoreClosedAtOrder;
                      if (isCustom) {
                        customItems.push(it);
                      } else {
                        const s = fallbackStore.shops.get(it.storeId!);
                        if (s && (s.isOpen === false || s.isBlocked === true)) {
                          customItems.push(it);
                        } else {
                          const sid = it.storeId!;
                          if (!byStore[sid]) byStore[sid] = [];
                          byStore[sid].push(it);
                        }
                      }
                    });

                    const getGroupShopOrder = (sid: string) => {
                      const storeOrders = shopOrders.filter(
                        so => so.shopId === sid && so.shopId !== 'myself' && so.parentOrderId === order.id
                      );
                      if (storeOrders.length === 0) return undefined;
                      const activeSO = storeOrders.find(
                        so => so.status !== 'CANCELED' && (so.status as string) !== 'CANCELLED'
                      );
                      if (activeSO) return activeSO;
                      return storeOrders.sort(
                        (a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
                      )[0];
                    };

                    const getBlockStyle = (status?: string | null) => {
                      if (isDone) {
                        return {
                          wrapBorder: 'border-gray-300',
                          hdrBg: 'bg-gray-200 border-b-gray-300',
                          hdrText: 'text-gray-700',
                          tagBg: 'bg-gray-300 text-gray-700',
                          bodyBg: 'bg-gray-100 divide-gray-200',
                        };
                      }
                      if (status === 'PENDING') {
                        return {
                          wrapBorder: 'border-amber-400 shadow-sm shadow-amber-100 ring-1 ring-amber-300',
                          hdrBg: 'bg-amber-100 border-b-amber-300',
                          hdrText: 'text-amber-950',
                          tagBg: 'bg-amber-200 text-amber-900 border border-amber-300',
                          bodyBg: 'bg-amber-50/50 divide-amber-200/80',
                        };
                      }
                      if (status === 'ACCEPTED' || status === 'PREPARING' || status === 'READY' || status === 'HANDOVER') {
                        return {
                          wrapBorder: 'border-emerald-400 shadow-sm shadow-emerald-100 ring-1 ring-emerald-300',
                          hdrBg: 'bg-emerald-100 border-b-emerald-300',
                          hdrText: 'text-emerald-950',
                          tagBg: 'bg-emerald-200 text-emerald-900 border border-emerald-300',
                          bodyBg: 'bg-emerald-50/50 divide-emerald-200/80',
                        };
                      }
                      if (status === 'CANCELED' || status === 'CANCELLED') {
                        return {
                          wrapBorder: 'border-rose-300 shadow-sm shadow-rose-100',
                          hdrBg: 'bg-rose-100 border-b-rose-200',
                          hdrText: 'text-rose-950',
                          tagBg: 'bg-rose-200 text-rose-900 border border-rose-300',
                          bodyBg: 'bg-rose-50/50 divide-rose-200/80',
                        };
                      }
                      return {
                        wrapBorder: 'border-slate-700',
                        hdrBg: 'bg-slate-900 border-b-slate-700',
                        hdrText: 'text-white',
                        tagBg: 'bg-slate-700 text-slate-200',
                        bodyBg: 'bg-slate-900 divide-slate-700',
                      };
                    };

                    const renderItem = (
                      it: typeof allItems[0],
                      key: string,
                      groupSO?: ShopOrder,
                      isCustomBlock: boolean = false,
                      isStoreBlock: boolean = false
                    ) => {
                      const parsed = parsedItems.find(p => p.originalId === it.id || p.id === it.id);
                      const connectedSO = parsed ? getItemConnectedOrder(parsed.name, parsed.id) : getItemConnectedOrder(it.name, it.id);
                      const effectiveSO = groupSO || connectedSO || undefined;
                      const isPurchased = parsed?.purchased ?? !!it.purchased;
                      const itemPrice = parsed ? getItemIndividualPrice(parsed.name, connectedSO) : (it.price || undefined);
                      const hasPhoto = !!it.photoUrl;
                      const soStatus = effectiveSO?.status;
                      const isSelected = selectedCustomItemIds.includes(it.id);
                      const priceDetails = getItemPriceDetails(it, itemPrice);

                      const targetShopId = (effectiveSO?.shopId && effectiveSO.shopId !== 'myself') ? effectiveSO.shopId : it.storeId;
                      const shop = targetShopId ? fallbackStore.shops.get(targetShopId) : undefined;
                      const sName = shop?.name || effectiveSO?.shopName || it.storeName;
                      const sAddr = shop?.location?.address;
                      const customPlace = effectiveSO?.shopId === 'myself' ? (effectiveSO.sellerName || it.buyFrom) : it.buyFrom;

                      const isClosedStore = !!order.isStoreClosedAtOrder || (!!shop && (shop.isOpen === false || shop.isBlocked === true));
                      const isCustomItem = it.isCustom || !it.storeId || isCustomBlock || !!order.isStoreClosedAtOrder;

                      const groupSOActive = groupSO && groupSO.status !== 'CANCELED' && (groupSO.status as string) !== 'CANCELLED';
                      const groupSOAccepted = groupSOActive && (groupSO.status === 'ACCEPTED' || groupSO.status === 'PREPARING' || groupSO.status === 'READY' || groupSO.status === 'HANDOVER');

                      const hasPrice = (priceDetails && priceDetails.totalPrice > 0) || (effectiveSO?.price && Number(effectiveSO.price) > 0) || (it.price && Number(it.price) > 0);

                      return (
                        <div
                          key={key}
                          onClick={() => {
                            if (isDone) return;
                            if (isCustomBlock) {
                              if (connectedSO) {
                                openViewRequestDetails(connectedSO);
                              } else {
                                handleToggleCustomItemSelection(it.id);
                              }
                            } else if (isStoreBlock) {
                              // Store block: only allow purchased toggle if store has accepted
                              if (groupSOAccepted) {
                                if (parsed) toggleParsedItemPurchased(parsed.id, parsed.originalId, parsed.name);
                              } else {
                                // No active/accepted store order — show the mandatory modal
                                const sid = it.storeId || groupSO?.shopId || '';
                                const storeName = groupSO?.shopName || it.storeName || sid;
                                const storeAddress = fallbackStore.shops.get(sid)?.location?.address;
                                const storeItems = (order.items || []).filter(i => i.storeId === sid);
                                const totalOrdered = storeItems.reduce((sum, i) => sum + ((Number(i.price) || 0) * (typeof i.quantity === 'number' ? i.quantity : parseFloat(String(i.qty || '1')) || 1)), 0);
                                const itemsText = storeItems.map(i => `${i.name}`).join(', ');
                                setStoreOrderRequiredTarget({ sid, storeName, storeAddress, items: storeItems, totalOrdered, itemsText });
                              }
                            } else if (connectedSO && !isStoreBlock) {
                              openViewRequestDetails(connectedSO);
                            } else {
                              if (parsed) toggleParsedItemPurchased(parsed.id, parsed.originalId, parsed.name);
                            }
                          }}
                          className={`flex items-center gap-3 p-3 rounded-2xl border transition-all select-none ${isSelected
                              ? 'bg-amber-100/90 border-amber-400 ring-2 ring-amber-300'
                              : 'bg-white/95 border-gray-200/80 hover:border-gray-300'
                            } ${isDone ? 'cursor-default' : 'cursor-pointer active:scale-[0.99]'}`}
                        >
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border overflow-hidden bg-gray-100 border-gray-200 text-gray-700">
                            {hasPhoto ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.photoUrl!} alt={it.name} className="w-full h-full object-cover" />
                            ) : isCustomItem ? (
                              <Sparkles className="w-4.5 h-4.5 text-amber-600" />
                            ) : isPurchased ? (
                              <Check className="w-4.5 h-4.5 text-emerald-600" />
                            ) : (
                              <ServiceIcon service={order.service} className="w-6 h-6 text-emerald-600" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-black text-sm ${isPurchased ? 'line-through opacity-50' : ''} text-gray-900`}>
                                {it.name}{getItemQtyDisplay(it)}
                              </span>
                              {isCustomItem && (
                                <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0">Custom</span>
                              )}
                            </div>

                            {priceDetails && (
                              <p className="text-[11px] font-mono text-gray-500 font-semibold mt-0.5">
                                {formatItemQuantityUnit(priceDetails.qty, it.unit, it.qty)} × ৳{priceDetails.unitPrice}
                              </p>
                            )}

                            {/* Under each custom order item if helper requested to store or add custom cost then the store name should show */}
                            {isCustomItem ? (
                              connectedSO?.shopId && connectedSO.shopId !== 'myself' ? (
                                <div className="flex items-center gap-1 text-[11px] text-purple-700 font-bold mt-0.5 flex-wrap">
                                  <Store className="w-3 h-3 text-purple-600 shrink-0" />
                                  <span>দোকান: {shop?.name || connectedSO.shopName || connectedSO.shopId}</span>
                                  {sAddr && <span className="text-gray-400 font-normal truncate">({sAddr})</span>}
                                </div>
                              ) : (connectedSO?.shopId === 'myself' || (customPlace && customPlace !== 'Custom Cost')) ? (
                                <div className="flex items-center gap-1 text-[11px] text-amber-800 font-bold mt-0.5 flex-wrap">
                                  <Store className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>দোকান: {connectedSO?.sellerName || customPlace || 'Custom Seller'}</span>
                                </div>
                              ) : it.buyFrom ? (
                                <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5 flex-wrap">
                                  <Store className="w-2.5 h-2.5 text-gray-400 shrink-0" />
                                  <span>পছন্দের দোকান: {it.buyFrom}</span>
                                </div>
                              ) : null
                            ) : (!isStoreBlock && !isClosedStore && (sName || sAddr)) ? (
                              <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5 flex-wrap">
                                <MapPin className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                {sName && <span className="font-bold text-gray-700">দোকান: {sName}</span>}
                                {sAddr && <span className="text-gray-400 truncate">({sAddr})</span>}
                              </div>
                            ) : (!isStoreBlock && !isClosedStore && customPlace) ? (
                              <div className="flex items-center gap-1 text-[10px] text-amber-700 mt-0.5">
                                <Store className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                <span>কোথা থেকে: {customPlace}</span>
                              </div>
                            ) : null}

                            {/* Saved on this phone but not yet confirmed by the server: the store can't see it yet. */}
                            {effectiveSO && effectiveSO.shopId !== 'myself' && fallbackStore.isShopOrderUnsent(effectiveSO.id) && (
                              <div className="mt-1">
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full inline-block border bg-orange-100 text-orange-800 border-orange-250 animate-pulse">
                                  পাঠানো হচ্ছে…
                                </span>
                              </div>
                            )}

                            {soStatus && (
                              <div className="mt-1">
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full inline-block ${soStatus === 'PENDING'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                    : soStatus === 'ACCEPTED' || soStatus === 'PREPARING' || soStatus === 'READY'
                                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                      : 'bg-rose-100 text-rose-900 border border-rose-200'
                                  }`}>
                                  {soStatus === 'PENDING' ? '⏳ Pending' :
                                    soStatus === 'ACCEPTED' ? '✓ Accepted' :
                                      soStatus === 'PREPARING' ? '🍳 Preparing' :
                                        soStatus === 'READY' ? '✅ Ready' :
                                          soStatus === 'CANCELED' || (soStatus as string) === 'CANCELLED' ? '✕ Cancelled' :
                                            soStatus}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            {hasPrice ? (
                              <div className="text-right">
                                <span className="font-mono font-black text-gray-900 text-sm sm:text-base block">
                                  ৳{priceDetails?.totalPrice ?? (effectiveSO?.price ? Number(effectiveSO.price) : (Number(it.price) * getItemQuantityNum(it)))}
                                </span>
                              </div>
                            ) : isCustomItem ? (
                              <span className="font-extrabold text-amber-800 font-mono bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 text-[10px] shrink-0">
                                মূল্য বাকি
                              </span>
                            ) : null}

                            <div onClick={(e) => e.stopPropagation()}>
                              {isPurchased ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isDone && parsed) toggleParsedItemPurchased(parsed.id, parsed.originalId, parsed.name);
                                  }}
                                  title="আনচেক করতে ক্লিক করুন (Click to uncheck)"
                                  className="w-6 h-6 rounded-full bg-emerald-500/20 hover:bg-rose-500/20 border border-emerald-500/40 hover:border-rose-400 flex items-center justify-center transition-all cursor-pointer group/uncheck"
                                >
                                  <Check className="w-3.5 h-3.5 text-emerald-600 group-hover/uncheck:hidden" />
                                  <X className="w-3.5 h-3.5 text-rose-600 hidden group-hover/uncheck:block" />
                                </button>
                              ) : isStoreBlock && !isDone ? (
                                // Store block: show check button only if store accepted; else show a locked icon
                                groupSOAccepted ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (parsed) toggleParsedItemPurchased(parsed.id, parsed.originalId, parsed.name);
                                    }}
                                    title="চেক করতে ক্লিক করুন (Click to check)"
                                    className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-emerald-50 border border-gray-300 hover:border-emerald-400 flex items-center justify-center transition-all cursor-pointer"
                                  >
                                    <Check className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
                                  </button>
                                ) : (
                                  <span
                                    title="দোকানের অর্ডার আগে পাঠান / Accept হওয়ার পর চেক করা যাবে"
                                    className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-300 flex items-center justify-center"
                                  >
                                    <Clock className="w-3 h-3 text-amber-500" />
                                  </span>
                                )
                              ) : !isDone && !isCustomBlock ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (parsed) toggleParsedItemPurchased(parsed.id, parsed.originalId, parsed.name);
                                  }}
                                  title="চেক করতে ক্লিক করুন (Click to check)"
                                  className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-emerald-50 border border-gray-300 hover:border-emerald-400 flex items-center justify-center transition-all cursor-pointer"
                                >
                                  <Check className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
                                </button>
                              ) : isCustomBlock && !isDone && !connectedSO ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleCustomItemSelection(it.id)}
                                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                                />
                              ) : isCustomBlock && !isDone && connectedSO ? (
                                <button
                                  type="button"
                                  onClick={() => openViewRequestDetails(connectedSO)}
                                  className="p-1 px-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold border border-gray-300 transition-all cursor-pointer"
                                >
                                  Details
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    };

                    if (Object.keys(byStore).length === 0 && customItems.length === 0) {
                      return parsedItems.map(parsed => {
                        const fakeItem = { id: parsed.id, name: parsed.name, qty: parsed.qty, quantity: parsed.quantity, isCustom: false, storeId: undefined, purchased: parsed.purchased } as any;
                        return renderItem(fakeItem, parsed.id);
                      });
                    }

                    return (
                      <>
                        {Object.entries(byStore).map(([sid, items]) => {
                          const shop = fallbackStore.shops.get(sid);
                          const groupSO = getGroupShopOrder(sid);
                          const storeName = shop?.name || groupSO?.shopName || items.find(i => i.storeName)?.storeName || sid;
                          const storeAddress = shop?.location?.address || (shop as any)?.address;
                          const groupStatus = groupSO?.status;
                          const isLoading = !!orderNowLoading[sid];
                          const isAcceptedGroup = groupStatus === 'ACCEPTED' || groupStatus === 'PREPARING';
                          const isCancelledGroup = groupStatus === 'CANCELED' || (groupStatus as string) === 'CANCELLED';
                          const style = getBlockStyle(groupStatus);

                          return (
                            <div key={sid} className={`rounded-2xl border overflow-hidden ${style.wrapBorder}`}>
                              <div className={`px-3 py-2.5 border-b space-y-1.5 ${style.hdrBg}`}>
                                {/* Row 1: Store name & Order button on the same line */}
                                <div className="flex items-center justify-between gap-2">
                                  {/* 1. Store name click opens info popup (no separate info button) */}
                                  <div className="min-w-0 flex-1">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setStoreInfoShopId(sid); }}
                                      className="flex items-center gap-1.5 group/store hover:opacity-80 transition-opacity text-left cursor-pointer min-w-0"
                                      title="দোকানের তথ্য ও যোগাযোগের নম্বর দেখতে ক্লিক করুন"
                                    >
                                      <Store className="w-4 h-4 shrink-0 opacity-80" />
                                      <span className={`text-xs font-black uppercase tracking-wide break-words underline-offset-2 group-hover/store:underline ${style.hdrText}`}>
                                        {storeName}
                                      </span>
                                    </button>
                                    {storeAddress && (
                                      <div className={`flex items-center gap-1 text-[10px] ${style.hdrText} opacity-85 pl-5.5 mt-0.5`}>
                                        <MapPin className="w-2.5 h-2.5 shrink-0 text-emerald-500" />
                                        <span className="truncate">{storeAddress}</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Right side: Order Now button or status action */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {/* 2. Order Now button: when not yet sent or cancelled */}
                                    {!isDone && (!groupSO || isCancelledGroup) && (
                                      <button
                                        type="button"
                                        disabled={isLoading}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const totalOrdered = items.reduce((sum, i) => sum + ((Number(i.price) || 0) * getItemQuantityNum(i)), 0);
                                          const itemsText = items.map(i => `${i.name}${getItemQtyDisplay(i)}`).join(', ');
                                          setOrderNowConfirmTarget({
                                            sid,
                                            storeName,
                                            storeAddress,
                                            items,
                                            totalOrdered,
                                            itemsText,
                                          });
                                        }}
                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white rounded-lg text-[10px] font-extrabold transition-all active:scale-95 shadow-xs cursor-pointer"
                                      >
                                        {isLoading ? <span className="animate-pulse">...</span> : <><ShoppingCart className="w-3 h-3" /><span>Order Now</span></>}
                                      </button>
                                    )}

                                    {/* 2. Pending status + cancel icon button */}
                                    {!isDone && groupStatus === 'PENDING' && (
                                      <div className="flex items-center gap-1">
                                        <span className="flex items-center gap-1 px-2 py-1 bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-[10px] font-extrabold">
                                          <Clock className="w-3 h-3 text-amber-700 animate-spin" />
                                          <span>Pending...</span>
                                        </span>
                                        <button
                                          type="button"
                                          disabled={cancellingShopOrderId === groupSO?.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (groupSO) {
                                              setCancelShopOrderConfirmTarget({
                                                shopOrderId: groupSO.id,
                                                storeName,
                                              });
                                            }
                                          }}
                                          title="রিকোয়েস্ট বাতিল করুন (Cancel Request)"
                                          className="w-6 h-6 rounded-lg bg-rose-100 hover:bg-rose-200 border border-rose-300 text-rose-700 flex items-center justify-center transition-all active:scale-90 cursor-pointer"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}

                                    {/* 2. Accepted status */}
                                    {!isDone && isAcceptedGroup && (
                                      <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-extrabold shadow-xs">
                                        <Check className="w-3 h-3" /><span>Accepted</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Row 2: Underneath Store Name - Make Custom button + Store status */}
                                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                  {/* 5. Convert button: "Make Custom" */}
                                  {!isDone && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConvertConfirmTarget({ sid, storeName, itemCount: items.length });
                                      }}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-black text-white text-[10px] font-bold transition-all active:scale-95 border border-slate-700 shadow-xs cursor-pointer"
                                      title="এই দোকানের পণ্যগুলোকে কাস্টম আইটেমে রূপান্তর করুন"
                                    >
                                      <Sparkles className="w-3 h-3 text-amber-400" />
                                      <span className="text-white underline underline-offset-2">Make Custom</span>
                                    </button>
                                  )}

                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${style.tagBg}`}>
                                    STORE
                                  </span>

                                  {groupStatus && (
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${groupStatus === 'PENDING' ? 'bg-amber-200 text-amber-900 border border-amber-300' :
                                        isAcceptedGroup ? 'bg-emerald-200 text-emerald-900 border border-emerald-300' :
                                          isCancelledGroup ? 'bg-rose-200 text-rose-900 border border-rose-300' :
                                            'bg-gray-200 text-gray-700'
                                      }`}>
                                      {groupStatus === 'PENDING' ? '⏳ Pending' :
                                        groupStatus === 'ACCEPTED' ? '✓ Accepted' :
                                          groupStatus === 'PREPARING' ? '🍳 Preparing' :
                                            isCancelledGroup ? '✕ Cancelled' :
                                              groupStatus}
                                    </span>
                                  )}

                                  {(() => {
                                    const s = fallbackStore.shops.get(sid);
                                    if (s?.isOpen === false) {
                                      return (
                                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-200 text-rose-900 border border-rose-300 shrink-0">
                                          বন্ধ (Closed)
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              </div>
                              <div className={`divide-y px-2 py-1 ${style.bodyBg}`}>
                                {items.map(it => renderItem(it, it.id, groupSO || undefined, false, true))}
                              </div>
                            </div>
                          );
                        })}

                        {/* Custom Items Block */}
                        {customItems.length > 0 && (() => {
                          const customItemsWithSO = customItems.map(it => {
                            const parsed = parsedItems.find(p => p.originalId === it.id || p.id === it.id);
                            return parsed ? getItemConnectedOrder(parsed.name, parsed.id) : null;
                          });
                          const allAccepted = customItemsWithSO.length > 0 && customItemsWithSO.every(so => so && (so.status === 'ACCEPTED' || so.status === 'PREPARING' || so.status === 'READY' || so.status === 'HANDOVER'));
                          const hasPending = customItemsWithSO.some(so => so && so.status === 'PENDING');
                          const hasCancelled = customItemsWithSO.some(so => so && (so.status === 'CANCELED' || (so.status as string) === 'CANCELLED'));
                          const customBlockStatus = hasPending ? 'PENDING' : allAccepted ? 'ACCEPTED' : hasCancelled ? 'CANCELLED' : null;
                          const customStyle = getBlockStyle(customBlockStatus);

                          const unconfirmedCustomItems = customItems.filter(it => {
                            const parsed = parsedItems.find(p => p.originalId === it.id || p.id === it.id);
                            return parsed ? !getItemConnectedOrder(parsed.name, parsed.id) : true;
                          });

                          const allSelected = unconfirmedCustomItems.length > 0 && unconfirmedCustomItems.every(it => selectedCustomItemIds.includes(it.id));

                          const toggleSelectAll = (e: React.MouseEvent) => {
                            e.stopPropagation();
                            if (allSelected) {
                              setSelectedCustomItemIds(prev => prev.filter(id => !unconfirmedCustomItems.some(it => it.id === id)));
                            } else {
                              setSelectedCustomItemIds(prev => Array.from(new Set([...prev, ...unconfirmedCustomItems.map(it => it.id)])));
                            }
                          };

                          return (
                            <div className={`rounded-2xl border overflow-hidden ${customStyle.wrapBorder}`}>
                              <div className={`flex items-center justify-between gap-2 px-3 py-2 border-b ${customStyle.hdrBg}`}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span className={`text-[11px] font-black uppercase tracking-wide ${customStyle.hdrText}`}>
                                    {order.isStoreClosedAtOrder ? 'দোকান বন্ধ ছিল / Custom' : 'Custom / Any Store'}
                                  </span>
                                  {customBlockStatus && (
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${customBlockStatus === 'PENDING' ? 'bg-amber-200 text-amber-900 border border-amber-300' :
                                        customBlockStatus === 'ACCEPTED' ? 'bg-emerald-200 text-emerald-900 border border-emerald-300' :
                                          'bg-rose-200 text-rose-900 border border-rose-300'
                                      }`}>
                                      {customBlockStatus === 'PENDING' ? '⏳ Pending' : customBlockStatus === 'ACCEPTED' ? '✓ Accepted' : '✕ Cancelled'}
                                    </span>
                                  )}
                                </div>

                                {!isDone && unconfirmedCustomItems.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={toggleSelectAll}
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/10 hover:bg-black/20 transition-all border border-black/10"
                                  >
                                    {allSelected ? 'Deselect All' : 'Select All'}
                                  </button>
                                )}
                              </div>

                              <div className={`divide-y px-2 py-1 ${customStyle.bodyBg}`}>
                                {customItems.map(it => renderItem(it, it.id, undefined, true, false))}
                              </div>

                              {/* 3. Underneath Selected Custom Items: 2 Action Buttons */}
                              {!isDone && selectedCustomItemIds.length > 0 && (
                                <div className="p-2.5 bg-slate-900 border-t border-slate-700 flex flex-col sm:flex-row items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleRequestCustomItemsToStore()}
                                    className="w-full sm:flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                                  >
                                    <Store className="w-3.5 h-3.5" />
                                    <span>Request To Store ({selectedCustomItemIds.length})</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAddCustomCostForSelected()}
                                    className="w-full sm:flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Custom Cost ({selectedCustomItemIds.length})</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                </div>

                {/* Description Checklist */}
                {parsedNoteItems.length > 0 && (
                  <div className="mt-3 p-3 rounded-2xl bg-amber-50/90 border border-amber-200/80 space-y-2">
                    <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1">
                      📝 Description Checklist ({parsedNoteItems.filter((_, idx) => checkedNoteItems[idx]).length}/{parsedNoteItems.length})
                    </span>
                    <div className="space-y-1.5">
                      {parsedNoteItems.map((itemStr, idx) => {
                        const connectedShopOrder = getItemConnectedOrder(itemStr);
                        const isChecked = !!checkedNoteItems[idx] || !!connectedShopOrder;
                        const itemPrice = getItemIndividualPrice(itemStr, connectedShopOrder);
                        return (
                          <div
                            key={idx}
                            onClick={() => { if (isDone) return; if (connectedShopOrder) { openViewRequestDetails(connectedShopOrder); } else { setCheckedNoteItems(prev => ({ ...prev, [idx]: !prev[idx] })); } }}
                            className={`flex flex-col text-xs p-2.5 rounded-xl border transition-all cursor-pointer select-none ${isChecked ? 'bg-amber-200/90 border-amber-300 text-amber-950 font-bold' : 'bg-white border-amber-200 text-amber-950 font-bold hover:bg-amber-100/60'}`}
                          >
                            <div className="flex items-center space-x-2">
                              <input type="checkbox" checked={isChecked} onChange={() => { }} className="w-3.5 h-3.5 accent-amber-700 rounded cursor-pointer" />
                              <span className={`flex-1 ${isChecked ? 'line-through text-amber-900' : ''}`}>{itemStr}</span>
                            </div>
                            {connectedShopOrder && (
                              <div className="mt-1.5 pt-1.5 border-t border-amber-300/60 flex items-center justify-between text-[10px] font-bold">
                                <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">{connectedShopOrder.shopId === 'myself' ? 'Custom Cost' : connectedShopOrder.shopName}</span>
                                {itemPrice !== undefined && <span className="font-extrabold text-amber-950 font-mono bg-amber-100 px-1.5 py-0.5 rounded">৳{itemPrice}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Fallback Custom Cost button for unstructured orders */}
                {!isDone && !(order.items && order.items.length > 0) && selectedNoteItems.length > 0 && (
                  <div className="mt-3">
                    <button type="button" onClick={openCustomCostModal}
                      className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white border border-amber-700 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]">
                      <Plus className="w-3.5 h-3.5" /><span>+ Custom Cost</span>
                    </button>
                  </div>
                )}

                {/* Customer Edit History: Show Latest Updated Change for Active Order */}
                {order.editHistory && order.editHistory.length > 0 && (
                  <div className="mt-3 rounded-2xl bg-amber-50/90 border border-amber-200/80 overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setShowEditHistory((v) => !v)}
                      className="w-full p-3 flex items-center justify-between text-left hover:bg-amber-100/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileEdit className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider truncate">
                          Order Update History ({order.editHistory.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-200/60 hover:bg-amber-200 text-amber-950 rounded-lg text-[10px] font-extrabold border border-amber-300/60 transition-all shrink-0">
                        <span>{showEditHistory ? 'Hide' : 'Details'}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showEditHistory ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {showEditHistory && (
                      <div className="p-2.5 pt-0 text-xs space-y-2 animate-in slide-in-from-top-2 duration-150">
                        {[...order.editHistory].reverse().map((hItem, hIdx) => {
                          const getHistoryEditorLabel = (item: OrderEditHistoryItem) => {
                            const by = (item.editedBy || '').toLowerCase();
                            const name = (item.editedByName || '').toLowerCase();
                            if (by === order.helperId?.toLowerCase() || by === user?.uid?.toLowerCase() || by === 'helper' || name.includes('helper') || name === 'you') {
                              return 'Me';
                            }
                            if (by === order.customerId?.toLowerCase() || by === 'customer' || name.includes('customer')) {
                              return 'Customer';
                            }
                            if (by === 'admin' || name.includes('admin')) {
                              return 'Admin';
                            }
                            return 'Customer';
                          };
                          const label = getHistoryEditorLabel(hItem);

                          return (
                            <div key={hIdx} className="p-2.5 rounded-xl bg-white border border-amber-200/70 text-xs space-y-1.5 shadow-2xs">
                              <div className="border-b border-amber-100 pb-1 flex items-center justify-between">
                                <div className="text-[10px] font-bold text-amber-900">
                                  Update #{order.editHistory!.length - hIdx} ({label})
                                </div>
                                <div className="text-[9px] font-medium text-amber-700/80">
                                  {formatPlacedDateTime(hItem.timestamp)}
                                </div>
                              </div>
                              <div className="space-y-1.5 pt-0.5">
                                {hItem.changes.map((c, idx) => (
                                  <div key={idx} className="text-left space-y-1">
                                    {c.field && c.field !== 'Items / Details' && c.field !== 'Details / Items' && (
                                      <span className="font-extrabold text-amber-950 block text-[11px]">{c.field}:</span>
                                    )}
                                    <div className="text-left flex flex-wrap items-center gap-2">
                                      {c.oldValue && c.oldValue !== 'None' && c.oldValue !== 'Empty' && (
                                        <span className="line-through text-gray-400 text-xs">{c.oldValue}</span>
                                      )}
                                      <span className="text-emerald-950 font-bold bg-emerald-100/90 border border-emerald-200 px-2.5 py-1 rounded-xl inline-block text-xs">
                                        {c.newValue}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Two-Way Delivery Toggle */}
              {!isDone && (
                <div className="bg-indigo-50/30 py-2 px-3 rounded-2xl space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    {/* Toggle Switch on Left */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!order.needDeliveryBack}
                      onClick={() => {
                        if (!order.needDeliveryBack) {
                          setReturnWhen('schedule');
                          setDeliveryBackTimeInput(
                            order.deliveryBackTime
                              ? order.deliveryBackTime.substring(0, 16)
                              : (() => {
                                const d = new Date();
                                d.setDate(d.getDate() + 1);
                                return d.toISOString().substring(0, 16);
                              })()
                          );
                          setShowDeliveryBackModal(true);
                        } else {
                          const baseFee = calculateEstimatedFee({
                            distanceKm: Math.ceil(distanceKm),
                            weightKg: Math.ceil(order.weightKg || 0),
                            isReturnRequested: false,
                            productPrice: 0,
                          }, fallbackStore.pricingSettings).totalFee;
                          fallbackStore.updateOrder(order.id, (o) => ({
                            ...o,
                            needDeliveryBack: false,
                            needReturnItems: false,
                            deliveryBackTime: undefined,
                            deliveryBackSetAt: undefined,
                            deliveryFee: o.isFreeDelivery ? 0 : baseFee,
                            originalDeliveryFee: o.isFreeDelivery ? 0 : baseFee,
                          }));
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none shrink-0 ${order.needDeliveryBack ? 'bg-indigo-600' : 'bg-gray-300'
                        }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${order.needDeliveryBack ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider block">Two-Way Delivery</span>
                      {order.needDeliveryBack && (
                        <span className="text-[11px] text-gray-700 font-semibold block mt-0.5">
                          Return mode: {order.deliveryBackTime
                            ? `Scheduled (${new Date(order.deliveryBackTime).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' })})`
                            : 'Return Now'}
                          <button
                            type="button"
                            onClick={() => {
                              setReturnWhen(order.deliveryBackTime ? 'schedule' : 'now');
                              setDeliveryBackTimeInput(
                                order.deliveryBackTime
                                  ? order.deliveryBackTime.substring(0, 16)
                                  : (() => {
                                    const d = new Date();
                                    d.setDate(d.getDate() + 1);
                                    return d.toISOString().substring(0, 16);
                                  })()
                              );
                              setShowDeliveryBackModal(true);
                            }}
                            className="ml-2 text-indigo-600 hover:text-indigo-800 font-bold underline text-[10px]"
                          >
                            (Edit)
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 5. CUSTOMER CONTACT NUMBER */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Customer Contact</span>
                </h4>
                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Line 1: Phone number + label badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-gray-900 text-xs font-mono tracking-wide">
                        {order.alternativePhone || order.customerPhone || 'Not provided'}
                      </span>
                      {customerLabels.length > 0 && customerLabels.map((lbl, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm border border-amber-300/30 uppercase tracking-wider shrink-0"
                        >
                          ⭐ {lbl}
                        </span>
                      ))}
                    </div>
                    {/* Line 2: Customer name */}
                    <p className="text-[11px] text-gray-650 font-bold mt-0.5">{order.customerName}</p>
                  </div>
                  {/* Call / WhatsApp buttons */}
                  {(order.alternativePhone || order.customerPhone) && (
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <a
                        href={`tel:${order.alternativePhone || order.customerPhone}`}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center space-x-1 shadow-sm transition-all active:scale-95"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </a>
                      <a
                        href={`https://wa.me/880${(order.alternativePhone || order.customerPhone || '').replace(/^0/, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-[10px] flex items-center space-x-1 shadow-sm transition-all active:scale-95"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* 6. COMBINED ADDRESSES BLOCK — inline Pickup/Delivery format */}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Addresses & Distance</span>
                  </h4>
                  {distanceKm > 0 && (
                    <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200">
                      📍 {distanceKm.toFixed(2)} km {furthestPickupInfo.furthestStoreId ? '(Longest)' : ''}
                    </span>
                  )}
                </div>
                <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-2 text-xs animate-in fade-in">
                  {renderStoresAddressList()}
                  {(!order.pickupLocation?.address || order.pickupLocation.address === 'Local Helper Area') ? (
                    <div className="flex items-center justify-between gap-2 min-w-0 bg-amber-50/90 p-2.5 rounded-xl border border-amber-200">
                      <div className="flex items-center space-x-1.5 min-w-0 flex-1 text-[11px] text-amber-900 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="truncate">Pickup Location Not Set</span>
                      </div>
                      {!isDone && (
                        <button
                          onClick={() => setActiveMapPicker('pickup')}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[10px] transition-all shrink-0 active:scale-95 shadow-xs cursor-pointer"
                          title="Set pickup address"
                        >
                          <MapPin className="w-3 h-3 text-white" />
                          <span>+ Set Pickup</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {order.isStoreClosedAtOrder && (
                        <div className="flex items-start gap-1.5 bg-amber-50 px-2.5 py-2 rounded-xl border border-amber-300">
                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-amber-800 font-semibold leading-snug">
                            ⚠️ দোকান বন্ধ ছিল — <strong>যেকোনো কাছের দোকান</strong> থেকে পণ্য সংগ্রহ করুন।
                          </p>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <p className="text-[11px] text-gray-700 flex-1 min-w-0 whitespace-normal break-words" title={order.pickupLocation?.address || 'Local Helper Area'}>
                          <strong className="font-extrabold text-emerald-800">Pickup: </strong>
                          <span>{order.pickupLocation.address}</span>
                          {order.isStoreClosedAtOrder && (
                            <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 font-black px-1 py-0.5 rounded border border-amber-200 uppercase">বন্ধ</span>
                          )}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenStoreDirection({
                              lat: order.pickupLocation?.lat,
                              lng: order.pickupLocation?.lng,
                              address: order.pickupLocation?.address,
                              name: 'Pickup Location',
                            })}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] transition-all shadow-2xs active:scale-95 cursor-pointer"
                            title="Direction to pickup location"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Direction</span>
                          </button>
                          {!isDone && (
                            <button
                              onClick={() => setActiveMapPicker('pickup')}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-[10px] transition-all shrink-0 active:scale-95 cursor-pointer"
                              title="Edit pickup address"
                            >
                              <FileEdit className="w-3 h-3 text-gray-700" />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <p className="text-[11px] text-gray-700 flex-1 min-w-0 whitespace-normal break-words" title={order.deliveryLocation?.address || 'N/A'}>
                      <strong className="font-extrabold text-emerald-800">Delivery: </strong>
                      <span>{order.deliveryLocation?.address || 'N/A'}</span>
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const dLat = order.deliveryLocation?.lat;
                          const dLng = order.deliveryLocation?.lng;
                          const dAddr = order.deliveryLocation?.address;
                          const destStr = dLat && dLng ? `${dLat},${dLng}` : encodeURIComponent(dAddr || '');
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${destStr}&travelmode=driving`, '_blank');
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] transition-all shadow-2xs active:scale-95 cursor-pointer"
                        title="Direction to delivery"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Direction</span>
                      </button>
                      {!isDone && (
                        <button
                          onClick={() => setActiveMapPicker('delivery')}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-extrabold text-[10px] transition-all shrink-0 border border-emerald-300 shadow-2xs active:scale-95 cursor-pointer"
                          title="Edit delivery address"
                        >
                          <FileEdit className="w-3 h-3 text-emerald-700" />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleOpenGoogleMapsDirection}
                      className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                      title="Google Map Direction"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Direction</span>
                    </button>
                  </div>
                </div>
              </div>


              {/* Product Cost & Pricing Calculation Summary */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Calculation Summary</span>
                </h4>
                <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-2.5 text-xs font-semibold text-gray-700 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-bold">Product Cost</span>
                    <span className="text-xs sm:text-sm font-bold text-gray-900 font-mono">
                      ৳{activeProductCost}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    {distanceKm > 0 ? (
                      <>
                        <span className="text-gray-500 font-bold">Distance ({distanceKm.toFixed(1)} km)</span>
                        <span className="text-xs sm:text-sm font-bold text-gray-900 font-mono">৳{estdPricing.distanceFee}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-amber-700 font-bold flex items-center gap-1">
                          <span>Distance (Pickup not set)</span>
                        </span>
                        {!isDone ? (
                          <button
                            type="button"
                            onClick={() => setActiveMapPicker('pickup')}
                            className="text-[11px] text-amber-700 underline font-extrabold hover:text-amber-800 cursor-pointer"
                          >
                            + Set Location
                          </button>
                        ) : (
                          <span className="text-xs sm:text-sm font-bold text-gray-400 font-mono">৳0</span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-bold">Approximate Weight (kg)</span>
                    <div className="flex items-center space-x-1.5">
                      {!isDone ? (
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={weightInput}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setWeightInput(e.target.value);
                            updateEstdPricing(activeProductCost, val);
                          }}
                          className="w-16 p-1 border border-gray-300 rounded text-center font-bold text-xs outline-none focus:border-emerald-500 bg-white"
                        />
                      ) : (
                        <span className="text-xs sm:text-sm font-bold text-gray-900">{Math.ceil(order.weightKg || 0)} kg</span>
                      )}
                      {estdPricing.weightFee > 0 && (
                        <span className="text-[10px] text-gray-500">(+৳{estdPricing.weightFee})</span>
                      )}
                    </div>
                  </div>

                  {(((fallbackStore.pricingSettings.feeCalculatorProcessingFee ?? 0) > 0 && estdPricing.processingFee > 0) || (order.processingFee || 0) > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 font-bold">Processing Fee</span>
                      <span className="text-xs sm:text-sm font-bold text-gray-900 font-mono">৳{estdPricing.processingFee || order.processingFee || 0}</span>
                    </div>
                  )}

                  {estdPricing.returnFee > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 font-bold">
                        {order.needDeliveryBack ? 'Two-Way Fee' : 'Return Fee'} ({estdPricing.returnPercent}%)
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-gray-900 font-mono">৳{estdPricing.returnFee}</span>
                    </div>
                  )}

                  {/* Custom Store Fee (shown if helper bought from outside stores) */}
                  {(() => {
                    const customStorePricing = calculateCustomStoreFee(order, shopOrders, fallbackStore.pricingSettings);
                    if (customStorePricing.totalFee <= 0) return null;
                    return (
                      <div className="flex items-center justify-between text-indigo-900 font-bold">
                        <span className="flex items-center space-x-1">
                          <Store className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>
                            Custom Store Fee ({customStorePricing.count} {customStorePricing.count > 1 ? 'items' : 'item'} × ৳{customStorePricing.unitFee})
                          </span>
                        </span>
                        <span className="text-xs sm:text-sm font-extrabold text-indigo-700 font-mono">
                          +৳{customStorePricing.totalFee}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Previous Order Due Payment Line Item */}
                  {order.appliedDuePayment && order.appliedDuePayment.amount > 0 && (
                    <div className="border-t border-amber-200 pt-2 space-y-1">
                      <div className="flex items-center justify-between text-amber-950 font-bold">
                        <span className="flex items-center space-x-1 text-amber-900">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Previous Order Due</span>
                        </span>
                        <span className="font-extrabold text-sm text-red-600 font-mono">+৳{order.appliedDuePayment.amount}</span>
                      </div>
                      {order.appliedDuePayment.note && (
                        <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200/70 text-[11px] text-amber-950 font-medium leading-relaxed">
                          <strong>Due Note:</strong> {order.appliedDuePayment.note}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-gray-800 text-sm">Delivery Fee</span>
                      {order.isFreeDelivery && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          🎁 Free Delivery (Reward Claimed)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs sm:text-sm font-bold text-emerald-850 font-mono">
                        ৳{order.isFreeDelivery ? 0 : Math.max(order.deliveryFee, estdPricing.minFee)}
                      </span>
                      {!isDone && !order.isFreeDelivery && (
                        <button
                          onClick={() => {
                            setFeeInput(String(order.deliveryFee));
                            setCustomerAgreed(false);
                            setShowFeeModal(true);
                          }}
                          className="p-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 transition-colors"
                          title="Override Fee"
                        >
                          <FileEdit className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-2.5 flex items-center justify-between bg-emerald-50/50 -mx-3.5 px-3.5 py-2 mt-1 rounded-b-2xl">
                    <span className="font-bold text-gray-900 text-sm">Total to Collect</span>
                    <span className="text-sm sm:text-base font-extrabold text-emerald-850 font-mono">
                      ৳{activeProductCost + (order.isFreeDelivery ? 0 : Math.max(order.deliveryFee || 0, estdPricing.minFee)) + ((((fallbackStore.pricingSettings.feeCalculatorProcessingFee ?? 0) > 0 && estdPricing.processingFee > 0) ? estdPricing.processingFee : (order.processingFee || 0))) + (estdPricing.returnFee > 0 ? estdPricing.returnFee : 0) + (order.appliedDuePayment?.amount || 0) + (calculateCustomStoreFee(order, shopOrders, fallbackStore.pricingSettings).totalFee)}
                    </span>
                  </div>



                  {order.deliveryFee > (fallbackStore.pricingSettings.feeCalculatorMaxLimit ?? 70) && (
                    <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-850 font-bold leading-relaxed animate-in fade-in duration-200">
                      ⚠️ {fallbackStore.pricingSettings.feeCalculatorMaxLimitMessage || `Delivery fee exceeds ৳${fallbackStore.pricingSettings.feeCalculatorMaxLimit ?? 70}.`}
                      <div className="mt-1 text-[11px] font-black text-amber-900">
                        👉 Call customer to agree on a fair delivery fee.
                      </div>
                    </div>
                  )}
                </div>
              </div>


              {/* 8. PRIVATE NOTE SECTION (Customer cannot see this) */}
              <div className="pt-2 border-t border-gray-100 space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1 text-purple-950 font-extrabold text-[10px]">
                    <FileText className="w-3.5 h-3.5 text-purple-700" />
                    <span>Private Note</span>
                  </div>
                  <span className="text-[9px] font-black bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                    🔒 কাস্টমার দেখবে না
                  </span>
                </div>
                <form onSubmit={handleSaveHelperNote} className="space-y-1.5">
                  <textarea
                    value={helperNoteInput}
                    onChange={(e) => setHelperNoteInput(e.target.value)}
                    placeholder="গোপন নোট লিখুন..."
                    className="w-full p-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-xs font-semibold text-gray-900 outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 h-16 resize-none"
                  />
                  <div className="flex items-center justify-between pt-0.5">
                    {noteSavedAlert ? (
                      <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-lg border border-emerald-200 animate-in fade-in">
                        ✓ নোট সংরক্ষিত হয়েছে!
                      </span>
                    ) : (
                      <span className="text-[9px] text-purple-700 font-medium"> </span>
                    )}
                    <button
                      type="submit"
                      className="px-2.5 py-1.5 bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-[10px] rounded-lg shadow-sm transition-all active:scale-95 flex items-center space-x-1"
                    >
                      <FileText className="w-3 h-3" />
                      <span>সেভ করুন</span>
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>



        {/* Two-Way Delivery Schedule Modal */}
        {showDeliveryBackModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative border border-indigo-100">
              <button
                type="button"
                onClick={() => setShowDeliveryBackModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-indigo-100">
                  <RotateCcw className="w-5 h-5 text-indigo-700" />
                </div>
                <div>
                  <h3 className="font-black text-base text-gray-900 leading-tight">Two-Way Delivery</h3>
                  <p className="text-[11px] text-indigo-700 font-bold">কখন ফিরবেন? (When will you return?)</p>
                </div>
              </div>

              {/* Return option selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReturnWhen('now')}
                  className={`p-3 rounded-2xl border-2 text-left transition-all ${returnWhen === 'now'
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-200 bg-gray-50 hover:border-indigo-200'
                    }`}
                >
                  <span className="text-sm">⚡</span>
                  <span className="text-xs font-extrabold text-gray-900 block mt-0.5">এখনই ফিরব</span>
                  <span className="text-[9px] text-gray-500 font-medium leading-tight block">ডেলিভারি দিয়ে সাথে সাথে ফিরব</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReturnWhen('schedule')}
                  className={`p-3 rounded-2xl border-2 text-left transition-all ${returnWhen === 'schedule'
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-200 bg-gray-50 hover:border-indigo-200'
                    }`}
                >
                  <span className="text-sm">📅</span>
                  <span className="text-xs font-extrabold text-gray-900 block mt-0.5">সময় নির্ধারণ</span>
                  <span className="text-[9px] text-gray-500 font-medium leading-tight block">নির্দিষ্ট সময়ে ফিরব</span>
                </button>
              </div>

              {returnWhen === 'schedule' && (
                <div className="animate-in slide-in-from-top duration-200">
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">Return Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={deliveryBackTimeInput}
                    onChange={(e) => setDeliveryBackTimeInput(e.target.value)}
                    className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-gray-900"
                    required
                  />
                </div>
              )}

              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDeliveryBackModal(false)}
                  className="flex-1 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (returnWhen === 'schedule' && !deliveryBackTimeInput) return;
                    const estd = calculateEstimatedFee({
                      distanceKm: Math.ceil(distanceKm),
                      weightKg: Math.ceil(order.weightKg || 0),
                      isReturnRequested: true,
                      productPrice: 0,
                    }, fallbackStore.pricingSettings);
                    const targetFee = estd.totalFee;
                    fallbackStore.updateOrder(order.id, (o) => ({
                      ...o,
                      needDeliveryBack: true,
                      needReturnItems: true,
                      deliveryBackTime: returnWhen === 'schedule' ? new Date(deliveryBackTimeInput).toISOString() : undefined,
                      deliveryBackSetAt: returnWhen === 'schedule' ? (o.deliveryBackSetAt || new Date().toISOString()) : undefined,
                      originalDeliveryFee: o.isFreeDelivery ? 0 : (o.originalDeliveryFee || o.deliveryFee),
                      deliveryFee: o.isFreeDelivery ? 0 : targetFee,
                    }));
                    setShowDeliveryBackModal(false);
                  }}
                  className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-600/20 transition-all"
                >
                  Confirm Two-Way Delivery
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status Progression Action Buttons */}
        {order.status !== 'DELIVERED' && (order.status as string) !== 'CANCELED' && (
          <div className="space-y-3">
            {/* PENDING → ACCEPTED */}
            {order.status === 'PENDING' && onAccept && !order.helperId && (
              <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 space-y-3 shadow-sm animate-in fade-in duration-200">
                <button
                  onClick={() => {
                    if (!isUserAuthenticated(user)) {
                      openAuthModal();
                      return;
                    }
                    onAccept(order.id);
                  }}
                  disabled={activeOrdersCount !== undefined && activeOrderLimit !== undefined && activeOrdersCount >= activeOrderLimit}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center space-x-2 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{activeOrdersCount !== undefined && activeOrderLimit !== undefined && activeOrdersCount >= activeOrderLimit ? `Limit Reached (${activeOrderLimit} Max)` : 'Accept Request'}</span>
                </button>
              </div>
            )}
            {/* Fee/Cost Validation Warning Banner */}
            {!hasCostAndFee && order.status === 'PURCHASED_EXECUTED' && (
              <div className="p-4 rounded-3xl bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-300 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-center justify-center space-x-2.5 py-1">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <span className="font-bold text-sm text-orange-950">অর্ডারের মোট বিলটি Add করুন।</span>
                </div>
              </div>
            )}

            {/* ACTIVE ACTIONS SECTION WITH BIDIRECTIONAL NAVIGATION */}
            {(['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED'].includes(order.status) || (order.status === 'PENDING' && isAcceptedByThisHelper)) && (
              <div className="space-y-3">
                {/* Main Action (Forward) */}
                {(order.status === 'ACCEPTED' || (order.status === 'PENDING' && isAcceptedByThisHelper)) && (
                  <button
                    onClick={() => handleUpdateStatusWithCheck('PURCHASED_EXECUTED')}
                    className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-indigo-600/25 transition-all flex items-center justify-center space-x-2"
                  >
                    <PackageCheck className="w-5 h-5" />
                    <span>Mark as Processing</span>
                  </button>
                )}

                {order.status === 'PURCHASED_EXECUTED' && (
                  <button
                    onClick={() => handleUpdateStatusWithCheck('ON_THE_WAY')}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center space-x-2"
                  >
                    <Truck className="w-5 h-5" />
                    <span>I'm On The Way!</span>
                  </button>
                )}

                {order.status === 'ON_THE_WAY' && (
                  <button
                    onClick={() => handleUpdateStatusWithCheck('ARRIVED')}
                    className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-teal-600/25 transition-all flex items-center justify-center space-x-2"
                  >
                    <MapPin className="w-5 h-5" />
                    <span>I've Arrived at Location!</span>
                  </button>
                )}

                {order.status === 'ARRIVED' && (
                  <button
                    onClick={() => setShowDeliveryConfirmModal(true)}
                    className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center space-x-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Confirm Order Delivered!</span>
                  </button>
                )}

                {/* Back Navigation Button */}
                {order.status !== 'ACCEPTED' && (
                  <button
                    type="button"
                    onClick={() => {
                      const prevStatusMap: Record<string, OrderStatus> = {
                        PURCHASED_EXECUTED: 'ACCEPTED',
                        ON_THE_WAY: 'PURCHASED_EXECUTED',
                        ARRIVED: 'ON_THE_WAY',
                      };
                      const prev = prevStatusMap[order.status];
                      if (prev) {
                        handleUpdateStatus(prev, `Status reverted back to ${prev}`);
                      }
                    }}
                    className="w-full py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <span>← Go Back to Previous Status</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Request Cancellation Trigger */}
        {order.status !== 'DELIVERED' && (order.status as string) !== 'CANCELED' && isAcceptedByThisHelper && (
          <div className="pt-2">
            {order.cancellationRequest ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold text-center">
                Cancellation Request Pending Admin Review.
              </div>
            ) : (
              <button
                onClick={handleRequestCancellation}
                className="w-full py-3.5 rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-xs transition-colors flex items-center justify-center space-x-1.5"
              >
                <AlertOctagon className="w-4 h-4" />
                <span>Request Order Cancellation</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Enter Product Cost Modal */}
      {showCostModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 relative">
            <button
              type="button"
              onClick={() => setShowCostModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-base text-gray-900">Enter Product Cost</h3>
            <form onSubmit={handleSaveProductCost} className="space-y-3">
              <input
                type="number"
                step="0.01"
                value={productCostInput}
                onChange={(e) => setProductCostInput(e.target.value)}
                placeholder="যেমন: 450"
                className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm outline-none focus:border-emerald-500"
                required
              />
              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCostModal(false)}
                  className="flex-1 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xs shadow-md"
                >
                  Save Cost
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── HELPER EDIT ORDER DETAILS MODAL ── */}
      <EditOrderDetailsModal
        isOpen={showHelperEditModal}
        onClose={() => setShowHelperEditModal(false)}
        order={order}
        editorRole="helper"
      />


      {/* Edit Delivery Fee Modal */}
      {showFeeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative">
            <button
              type="button"
              onClick={() => setShowFeeModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-base text-gray-900">Edit Delivery Fee</h3>
            <p className="text-xs text-gray-600">
              Set or adjust the delivery fee for this order. Current fee: ৳{order.deliveryFee}.
            </p>
            <form onSubmit={handleSaveDeliveryFee} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Delivery Fee (৳)</label>
                <input
                  type="number"
                  step="1"
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  placeholder="যেমন: 50"
                  className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm outline-none focus:border-amber-500"
                  required
                />
              </div>

              {((parseFloat(feeInput) || 0) > (fallbackStore.pricingSettings.feeCalculatorMaxLimit || 0)) && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-[11px] text-red-700 font-bold space-y-2">
                  <p>{fallbackStore.pricingSettings.feeCalculatorMaxLimitMessage || "ডেলিভারি ফি সর্বোচ্চ লিমিট অতিক্রম করেছে।"}</p>
                  <div className="flex items-center space-x-2 bg-white p-2.5 rounded-xl border border-red-200">
                    <input
                      type="checkbox"
                      id="customerAgreed"
                      checked={customerAgreed}
                      onChange={(e) => setCustomerAgreed(e.target.checked)}
                      className="w-4 h-4 text-amber-650 border-gray-300 rounded focus:ring-amber-500 cursor-pointer"
                      required
                    />
                    <label htmlFor="customerAgreed" className="text-xs font-bold text-gray-700 cursor-pointer select-none">
                      Customer Agreed (কাস্টমার সম্মত হয়েছেন) <span className="text-red-500">*</span>
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Reason / Note for Customer <span className="text-red-500">*</span></label>
                <textarea
                  value={feeReason}
                  onChange={(e) => setFeeReason(e.target.value)}
                  placeholder="যেমন: মালামাল ভারী অথবা পিকআপ স্পট অতিরিক্ত দূরে..."
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs h-20 outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFeeModal(false)}
                  className="flex-1 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md"
                >
                  Save Fee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unchecked Items Note Custom Modal */}
      {showUncheckedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-amber-100 animate-in zoom-in-95 duration-200 relative">
            <button
              type="button"
              onClick={() => { setShowUncheckedModal(false); setPendingNextStatus(null); }}
              className="absolute top-4 right-4 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center space-x-3 text-amber-800">
              <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-700">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-gray-900 leading-tight">অসম্পূর্ণ আইটেম নোট</h3>
                <span className="text-[11px] text-amber-700 font-bold">
                  {(parsedItems.length > 0 ? parsedItems : (order.items || [])).filter((i) => !i.purchased).length}টি আইটেম এখনো চেক করা হয়নি
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed font-medium">
              সব আইটেম টিক না দিয়ে সামনে এগোতে হলে অনুগ্রহ করে গ্রাহক ও এডমিনের জন্য একটি নোট লিখুন (যেমন: দোকানে স্টক ছিল না):
            </p>

            <form onSubmit={handleConfirmUncheckedSubmission} className="space-y-3">
              <textarea
                value={uncheckedNote}
                onChange={(e) => {
                  setUncheckedNote(e.target.value);
                  if (e.target.value.trim()) setUncheckedError('');
                }}
                placeholder="নোট বা কারণ লিখুন..."
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs h-24 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-gray-900 font-medium"
                required
              />

              {uncheckedError && (
                <p className="text-[11px] text-red-600 font-bold bg-red-50 p-2 rounded-xl border border-red-100">
                  {uncheckedError}
                </p>
              )}

              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowUncheckedModal(false);
                    setPendingNextStatus(null);
                  }}
                  className="flex-1 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs transition-colors"
                >
                  ফিরে যান
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all"
                >
                  নোটসহ জমা দিন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Helper Cancellation Request Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative border border-red-100">
            <button
              type="button"
              onClick={() => setShowCancelModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3 text-red-800">
              <div className="p-2.5 rounded-2xl bg-red-100 text-red-650 flex items-center justify-center">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-gray-900 leading-tight">অর্ডার বাতিলের অনুরোধ</h3>
                <span className="text-[11px] text-red-700 font-bold">এডমিন এবং কাস্টমার রিভিউ করবেন</span>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed font-medium">
              হেলপার সরাসরি অর্ডার বাতিল করতে পারে না। অনুগ্রহ করে বাতিলের কারণটি বিশদভাবে লিখুন, যাতে এডমিন সেটি দেখে অনুমোদন করতে পারেন:
            </p>

            <form onSubmit={handleConfirmCancellationRequest} className="space-y-3">
              <textarea
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  if (e.target.value.trim()) setCancelError('');
                }}
                placeholder="যেমন: বাইক নষ্ট হয়ে গেছে, কাস্টমার ফোন ধরছেন না, কাস্টমারের অনুরোধ ইত্যাদি..."
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs h-24 outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 text-gray-900 font-semibold"
                required
              />

              {cancelError && (
                <p className="text-[11px] text-red-600 font-bold bg-red-50 p-2 rounded-xl border border-red-100">
                  {cancelError}
                </p>
              )}

              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs transition-colors"
                >
                  ফিরে যান
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-md shadow-red-600/25 transition-all"
                >
                  অনুরোধ পাঠান
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONGRATULATIONS EARNINGS CUSTOM MODAL */}
      {/* Delivery Confirmation Modal */}
      {showDeliveryConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 pt-6 pb-5 text-white text-center">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 border-2 border-white/30">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-lg font-black">Confirm Delivery?</h2>
              <p className="text-sm text-emerald-100 font-medium mt-1">Have you successfully delivered this order to the customer?</p>
            </div>

            {/* Order Info */}
            <div className="px-6 py-4 bg-emerald-50/50 border-b border-gray-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 font-bold uppercase tracking-wide">Order</span>
                <span className="font-black text-gray-900 font-mono">#{order.id}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1.5">
                <span className="text-gray-500 font-bold uppercase tracking-wide">Customer</span>
                <span className="font-bold text-gray-800">{order.customerName}</span>
              </div>
              {order.deliveryFee !== undefined && (
                <div className="flex items-center justify-between text-xs mt-1.5">
                  <span className="text-gray-500 font-bold uppercase tracking-wide">Delivery Fee</span>
                  <span className="font-extrabold text-emerald-700">
                    {order.isFreeDelivery ? '৳0 (Reward Claimed)' : `৳${Math.max(order.deliveryFee || 0, estdPricing.minFee)}`}
                  </span>
                </div>
              )}
            </div>

            {/* Warning note */}
            <div className="px-6 py-3">
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 text-center font-semibold">
                ⚠️ This action cannot be undone. The order status will be permanently marked as <strong>Delivered</strong>.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowDeliveryConfirmModal(false)}
                className="flex-1 py-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-extrabold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeliveryConfirmModal(false);
                  handleConfirmDeliveryWithModal();
                }}
                className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Yes, Delivered!</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompletionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-emerald-100 text-center animate-in zoom-in-95 duration-200 relative overflow-hidden">
            {/* Decorative glows */}
            <div className="absolute -top-12 -left-12 w-28 h-28 bg-emerald-400/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -right-12 w-28 h-28 bg-teal-400/20 rounded-full blur-2xl pointer-events-none" />

            {/* Celebratory Icon */}
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Sparkles className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-black text-gray-900">
                Congratulations! 🎉
              </h3>
              <p className="text-xs text-gray-500 font-bold mt-0.5">Order Completed</p>
            </div>

            <button
              onClick={() => {
                setShowCompletionModal(false);
                onBack();
              }}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:scale-95 text-white font-extrabold text-sm shadow-md shadow-emerald-600/30 transition-all"
            >
              Back to Orders
            </button>
          </div>
        </div>
      )}
      {/* Address Edit Map Picker Modal */}
      {(activeMapPicker || editMapPickerType) && (
        <MapPickerModal
          isOpen={activeMapPicker !== null || editMapPickerType !== null}
          onClose={() => {
            setActiveMapPicker(null);
            setEditMapPickerType(null);
          }}
          title={
            (activeMapPicker || editMapPickerType) === 'pickup'
              ? 'পিকআপ ঠিকানা পরিবর্তন'
              : 'ডেলিভারি ঠিকানা পরিবর্তন'
          }
          initialLocation={
            (activeMapPicker || editMapPickerType) === 'pickup'
              ? (editMapPickerType ? (editPickupLat && editPickupLng ? { address: editPickup, lat: editPickupLat, lng: editPickupLng, addressId: editPickupAddressId } : order.pickupLocation) : order.pickupLocation)
              : (editMapPickerType ? (editDeliveryLat && editDeliveryLng ? { address: editAddress, lat: editDeliveryLat, lng: editDeliveryLng, addressId: editDeliveryAddressId } : order.deliveryLocation) : order.deliveryLocation)
          }
          modalType={(activeMapPicker || editMapPickerType)!}
          onSelectLocation={(loc) => {
            if (editMapPickerType === 'pickup') {
              setEditPickup(loc.address);
              setEditPickupLat(loc.lat);
              setEditPickupLng(loc.lng);
              setEditPickupAddressId(loc.addressId);
              setEditMapPickerType(null);
            } else if (editMapPickerType === 'delivery') {
              setEditAddress(loc.address);
              setEditDeliveryLat(loc.lat);
              setEditDeliveryLng(loc.lng);
              setEditDeliveryAddressId(loc.addressId);
              setEditMapPickerType(null);
            } else if (activeMapPicker) {
              handleSaveEditedAddress(activeMapPicker, loc);
              setActiveMapPicker(null);
            }
          }}
        />
      )}
      {showMapModal && (
        <HelperOrderMapModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          order={order}
          helperLocation={helperLocation}
          onAccept={order.status === 'PENDING' ? onAccept : undefined}
          shops={Array.from(fallbackStore.shops.values()).filter((s) => !s.isBlocked)}
          shopOrders={shopOrders}
          onSelectShop={(shop) => {
            if (shop.isBlocked) {
              showAlert('দোকান সাময়িকভাবে স্থগিত', 'এই দোকানটি বর্তমানে স্থগিত রয়েছে। অনুগ্রহ করে অন্য দোকান নির্বাচন করুন।', 'error');
              return;
            }
            if (isDone) {
              showAlert('অর্ডার সম্পন্ন/বাতিল', 'এই অর্ডারটি ইতিমধ্যে সম্পন্ন/বাতিল হয়ে গেছে। এখান থেকে নতুন দোকানে অর্ডার পাঠানোর সুবিধা বন্ধ রয়েছে।', 'warning');
              return;
            }
            setShowMapModal(false);
            openPlaceShopOrder(shop);
          }}
        />
      )}

      {/* Convert to Custom Confirmation Modal */}
      {convertConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative border border-amber-200">
            <button
              type="button"
              onClick={() => setConvertConfirmTarget(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-base text-gray-900 leading-tight">Make Custom নিশ্চিতকরণ</h3>
                <span className="text-[11px] text-amber-700 font-bold">দোকান পরিবর্তন / যেকোনো দোকান</span>
              </div>
            </div>

            <div className="bg-amber-50/80 p-3.5 rounded-2xl border border-amber-200/80 space-y-2">
              <div className="flex items-start gap-2">
                <Store className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider block">দোকানের নাম:</span>
                  <span className="text-sm font-black text-gray-900 break-words block leading-snug">
                    {convertConfirmTarget.storeName}
                  </span>
                </div>
              </div>
              <div className="text-[11px] font-semibold text-amber-900/90 leading-relaxed pt-1.5 border-t border-amber-200/60">
                এই দোকানের <strong className="font-black text-amber-950">{convertConfirmTarget.itemCount} টি পণ্য</strong> কাস্টম আইটেমে রূপান্তর হবে। আপনি যেকোনো দোকান থেকে এগুলো কিনতে পারবেন এবং আগের দোকান রিকোয়েস্ট বাতিল হবে।
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed font-medium">
              আপনি কি নিশ্চিতভাবে এই পণ্যগুলোকে কাস্টম আইটেমে রূপান্তর করতে চান?
            </p>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setConvertConfirmTarget(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 active:scale-95 font-bold text-xs transition-colors cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = convertConfirmTarget;
                  setConvertConfirmTarget(null);
                  if (target) {
                    await handleConvertStoreToCustom(target.sid, target.storeName);
                  }
                }}
                className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-amber-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>হ্যাঁ, Make Custom করুন</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Order Now Confirmation Custom Modal ── */}
      {orderNowConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative border border-emerald-200">
            <button
              type="button"
              onClick={() => setOrderNowConfirmTarget(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <ShoppingCart className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-base text-gray-900 leading-tight">দোকানে অর্ডার নিশ্চিতকরণ</h3>
                <span className="text-[11px] text-emerald-700 font-bold">দোকানে সরাসরি রিকোয়েস্ট পাঠান</span>
              </div>
            </div>

            <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200/80 space-y-2">
              <div className="flex items-start gap-2">
                <Store className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">দোকানের নাম:</span>
                  <span className="text-sm font-black text-gray-900 break-words block leading-snug">
                    {orderNowConfirmTarget.storeName}
                  </span>
                  {orderNowConfirmTarget.storeAddress && (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-800/80 mt-0.5">
                      <MapPin className="w-2.5 h-2.5 shrink-0 text-emerald-600" />
                      <span className="truncate">{orderNowConfirmTarget.storeAddress}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items preview */}
              <div className="pt-2 border-t border-emerald-200/60 space-y-1 max-h-36 overflow-y-auto">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">আইটেম তালিকা ({orderNowConfirmTarget.items.length} টি):</span>
                {orderNowConfirmTarget.items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs font-semibold text-gray-800">
                    <span className="truncate mr-2">• {it.name}{getItemQtyDisplay(it)}</span>
                    {it.price ? <span className="font-mono text-emerald-800 shrink-0">৳{(Number(it.price) || 0) * getItemQuantityNum(it)}</span> : null}
                  </div>
                ))}
              </div>

              {orderNowConfirmTarget.totalOrdered > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-emerald-200 text-xs font-black text-gray-900">
                  <span>মোট প্রাক্কলিত মূল্য:</span>
                  <span className="font-mono text-base text-emerald-700">৳{orderNowConfirmTarget.totalOrdered}</span>
                </div>
              )}
            </div>

            <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-900 font-semibold leading-relaxed">
                দোকান এই অর্ডারটি গ্রহণ (Accept) বা বাতিল (Reject) করার পর আপনি পরবর্তী ধাপে যেতে পারবেন।
              </p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setOrderNowConfirmTarget(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 active:scale-95 font-bold text-xs transition-colors cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = orderNowConfirmTarget;
                  setOrderNowConfirmTarget(null);
                  if (!target) return;
                  setOrderNowLoading((prev) => ({ ...prev, [target.sid]: true }));
                  try {
                    const newSO: ShopOrder = {
                      id: `so-${target.sid}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                      parentOrderId: order.id,
                      shopId: target.sid,
                      shopName: target.storeName,
                      helperId: order.helperId || '',
                      helperName: order.helperName || 'Helper',
                      requestText: target.itemsText,
                      sellerName: target.storeName,
                      status: 'PENDING',
                      viewedByStore: false,
                      price: target.totalOrdered,
                      itemsWithPrice: target.items.map((i) => ({
                        name: i.name,
                        unit: formatItemQuantityUnit(getItemQuantityNum(i), i.unit, i.qty),
                        itemId: i.id,
                        originalId: i.id,
                        price: i.price ? Number(i.price) : undefined,
                      })),
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      statusHistory: [{ status: 'PENDING', timestamp: new Date().toISOString(), actor: order.helperName || 'Helper' }],
                    };
                    await fallbackStore.addShopOrder(newSO);
                    showAlert('অর্ডার পাঠানো হয়েছে', `"${target.storeName}" দোকানে সফলভাবে অর্ডার পাঠানো হয়েছে। দোকান একসেপ্ট করলে আপনাকে জানানো হবে।`, 'success');
                  } finally {
                    setOrderNowLoading((prev) => ({ ...prev, [target.sid]: false }));
                  }
                }}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>হ্যাঁ, অর্ডার পাঠান</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Store Order Required Modal ── */}
      {storeOrderRequiredTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative border border-amber-200">
            <button
              type="button"
              onClick={() => setStoreOrderRequiredTarget(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-base text-gray-900 leading-tight">দোকানের অর্ডার প্রয়োজন</h3>
                <span className="text-[11px] text-amber-700 font-bold">Store Order Required</span>
              </div>
            </div>

            <div className="bg-amber-50/80 p-3.5 rounded-2xl border border-amber-200/80 space-y-2">
              <div className="flex items-start gap-2">
                <Store className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider block">দোকানের নাম:</span>
                  <span className="text-sm font-black text-gray-900 break-words block leading-snug">
                    {storeOrderRequiredTarget.storeName}
                  </span>
                  {storeOrderRequiredTarget.storeAddress && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-800/80 mt-0.5">
                      <MapPin className="w-2.5 h-2.5 shrink-0 text-amber-600" />
                      <span className="truncate">{storeOrderRequiredTarget.storeAddress}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-[12px] text-rose-900 font-semibold leading-relaxed">
                এই আইটেমগুলো মার্ক করতে হলে আগে দোকানে অর্ডার পাঠাতে হবে এবং দোকানকে সেটি <strong>Accept</strong> করতে হবে।
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-[12px] text-blue-900 font-semibold leading-relaxed">
                অর্ডার পাঠানোর পর দোকান Accept করলে আপনি আইটেমগুলো চেক করতে পারবেন।
              </p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setStoreOrderRequiredTarget(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 active:scale-95 font-bold text-xs transition-colors cursor-pointer"
              >
                অপেক্ষা করুন
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = storeOrderRequiredTarget;
                  setStoreOrderRequiredTarget(null);
                  if (!target) return;
                  // Pre-fill and open the Order Now confirm modal
                  setOrderNowConfirmTarget({
                    sid: target.sid,
                    storeName: target.storeName,
                    storeAddress: target.storeAddress,
                    items: target.items,
                    totalOrdered: target.totalOrdered,
                    itemsText: target.itemsText,
                  });
                }}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>অর্ডার পাঠান</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Shop Order Confirmation Custom Modal ── */}
      {cancelShopOrderConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative border border-rose-200">
            <button
              type="button"
              onClick={() => setCancelShopOrderConfirmTarget(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-base text-gray-900 leading-tight">রিকোয়েস্ট বাতিল নিশ্চিতকরণ</h3>
                <span className="text-[11px] text-rose-600 font-bold">দোকান অর্ডার প্রত্যাহার</span>
              </div>
            </div>

            <div className="bg-rose-50/80 p-3.5 rounded-2xl border border-rose-200/80 space-y-2">
              <div className="flex items-start gap-2">
                <Store className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-black text-rose-800 uppercase tracking-wider block">দোকানের নাম:</span>
                  <span className="text-sm font-black text-gray-900 break-words block leading-snug">
                    {cancelShopOrderConfirmTarget.storeName}
                  </span>
                </div>
              </div>
              <div className="text-[11px] font-semibold text-rose-900/90 leading-relaxed pt-1.5 border-t border-rose-200/60">
                আপনি কি নিশ্চিতভাবে এই দোকানে পাঠানো অর্ডার রিকোয়েস্টটি বাতিল করতে চান? বাতিল করার পর আপনি আবার নতুন করে রিকোয়েস্ট পাঠাতে পারবেন।
              </div>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setCancelShopOrderConfirmTarget(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 active:scale-95 font-bold text-xs transition-colors cursor-pointer"
              >
                না, ফিরে যান
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = cancelShopOrderConfirmTarget;
                  setCancelShopOrderConfirmTarget(null);
                  if (target) {
                    await handleCancelShopOrder(target.shopOrderId);
                  }
                }}
                className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-rose-600/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>হ্যাঁ, বাতিল করুন</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Items: Store Picker Modal */}
      {showStorePickerForCustom && (() => {
        const pickerShops = allShops.filter((shop) => {
          if (shop.isBlocked) return false;
          const q = storePickerSearch.toLowerCase().trim();
          const matchCat = storePickerCategory === 'ALL' || shop.type?.toLowerCase() === storePickerCategory.toLowerCase();
          if (!matchCat) return false;
          if (!q) return true;
          return (
            shop.name.toLowerCase().includes(q) ||
            shop.type?.toLowerCase().includes(q) ||
            (shop.contactPerson && shop.contactPerson.toLowerCase().includes(q)) ||
            (shop.whatsapp && shop.whatsapp.toLowerCase().includes(q)) ||
            (shop.location?.address && shop.location.address.toLowerCase().includes(q))
          );
        });

        const availableCategories = ['ALL', ...Array.from(new Set(allShops.map((s) => s.type).filter(Boolean)))];

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150 relative border border-purple-100">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-gray-900 leading-tight">দোকান নির্বাচন করুন</h3>
                    <span className="text-[11px] text-purple-700 font-bold">
                      {selectedCustomItemIds.length} টি কাস্টম আইটেম পাঠানোর জন্য দোকান বেছে নিন
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStorePickerForCustom(false)}
                  className="p-2 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search & Filter */}
              <div className="pt-3 pb-2 space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={storePickerSearch}
                    onChange={(e) => setStorePickerSearch(e.target.value)}
                    placeholder="দোকানের নাম, ধরন বা এলাকা দিয়ে খুঁজুন..."
                    className="w-full pl-9 pr-8 py-2.5 rounded-2xl border border-gray-200 text-xs font-semibold focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 bg-gray-50 focus:bg-white transition-all"
                  />
                  {storePickerSearch && (
                    <button
                      type="button"
                      onClick={() => setStorePickerSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {availableCategories.length > 2 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                    {availableCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setStorePickerCategory(cat)}
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 transition-all ${storePickerCategory === cat
                            ? 'bg-purple-700 text-white shadow-xs'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                      >
                        {cat === 'ALL' ? 'সব' : cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Shops List */}
              <div className="flex-1 overflow-y-auto space-y-2 py-1 pr-1 min-h-[200px]">
                {pickerShops.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-xs font-medium space-y-1">
                    <Store className="w-8 h-8 mx-auto opacity-40 text-gray-400" />
                    <p>কোনো দোকান পাওয়া যায়নি</p>
                  </div>
                ) : (
                  pickerShops.map((shop) => (
                    <div
                      key={shop.id}
                      onClick={() => handleSelectStoreForCustom(shop)}
                      className="p-3 rounded-2xl border border-gray-150 hover:border-purple-300 hover:bg-purple-50/40 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <Store className="w-5 h-5 text-purple-700" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-black text-xs text-gray-900 truncate group-hover:text-purple-700 transition-colors">
                              {shop.name}
                            </h4>
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800">
                              {shop.type}
                            </span>
                            {shop.isOpen === false && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                                বন্ধ
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">
                            {shop.location?.address || shop.whatsapp || 'ঠিকানা দেওয়া নেই'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectStoreForCustom(shop);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-[11px] shrink-0 shadow-xs transition-all active:scale-95 cursor-pointer"
                      >
                        বাছাই করুন
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowStorePickerForCustom(false)}
                  className="w-full py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
                >
                  বাতিল করুন
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 1. Shop Order Request Modal */}
      {placeOrderShop && (() => {
        const gMapUrl = placeOrderShop.location?.lat && placeOrderShop.location?.lng
          ? `https://www.google.com/maps/dir/?api=1&destination=${placeOrderShop.location.lat},${placeOrderShop.location.lng}&travelmode=driving`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeOrderShop.location?.address || placeOrderShop.name)}`;
        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative border border-purple-100 max-h-[90vh] overflow-y-auto">
              <div className="absolute top-4 right-4 flex items-center gap-1.5 z-10">
                <a
                  href={gMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm transition-all active:scale-95 border border-emerald-400/40 cursor-pointer"
                  title="Google Maps Direction"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Map</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPlaceOrderShop(null)}
                  className="p-1.5 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center space-x-3 pr-24">
                <div className="p-2.5 rounded-2xl bg-purple-100 text-purple-700">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-base text-gray-900 leading-tight">{placeOrderShop.name}</h3>
                  <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">{placeOrderShop.type}</span>
                </div>
              </div>

              <div className="bg-purple-50/70 p-3 rounded-2xl border border-purple-100 space-y-1">
                <span className="text-[10px] font-black text-purple-900 uppercase tracking-wider block">
                  দোকানে কী কী পণ্য/সেবা পাওয়া যায়?
                </span>
                <p className="text-xs text-purple-950 leading-relaxed font-semibold">
                  {placeOrderShop.description || 'পণ্য/সেবার কোনো অতিরিক্ত বিবরণ যুক্ত করা হয়নি।'}
                </p>
              </div>

              <div className="space-y-3 bg-gray-50 p-3 rounded-2xl border border-gray-100 text-xs">
                {/* Owner Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-150 pb-2 last:border-b-0 last:pb-0">
                  <div>
                    <span className="font-bold text-gray-500 block text-[10px] uppercase">Owner / Contact</span>
                    <span className="font-black text-gray-900">{placeOrderShop.contactPerson}</span>
                    <span className="text-gray-600 block font-bold font-mono text-[11px]">{placeOrderShop.whatsapp}</span>
                  </div>
                  <div className="flex space-x-2 shrink-0">
                    <a
                      href={`tel:${placeOrderShop.whatsapp}`}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] flex items-center space-x-1 shadow-sm transition-all active:scale-95"
                    >
                      <Phone className="w-3 h-3" />
                      <span>Call</span>
                    </a>
                    <a
                      href={`https://wa.me/880${placeOrderShop.whatsapp.replace(/^0/, '').replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-extrabold text-[11px] flex items-center space-x-1 shadow-sm transition-all active:scale-95"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>

                {/* Manager Row */}
                {placeOrderShop.managerName && placeOrderShop.managerWhatsapp && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-gray-150 pt-2">
                    <div>
                      <span className="font-bold text-gray-500 block text-[10px] uppercase">Manager</span>
                      <span className="font-black text-gray-900">{placeOrderShop.managerName}</span>
                      <span className="text-gray-600 block font-bold font-mono text-[11px]">{placeOrderShop.managerWhatsapp}</span>
                    </div>
                    <div className="flex space-x-2 shrink-0">
                      <a
                        href={`tel:${placeOrderShop.managerWhatsapp}`}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] flex items-center space-x-1 shadow-sm transition-all active:scale-95"
                      >
                        <Phone className="w-3 h-3" />
                        <span>Call</span>
                      </a>
                      <a
                        href={`https://wa.me/880${placeOrderShop.managerWhatsapp.replace(/^0/, '').replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-extrabold text-[11px] flex items-center space-x-1 shadow-sm transition-all active:scale-95"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handlePlaceShopOrder} className="space-y-3">
                {/* Items List (tap to toggle check, enter item price) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-700 block">
                      Items to Request ({shopOrderItems.filter((i) => i.isChecked).length}/{shopOrderItems.length}) *
                    </label>
                    <span className="text-[10px] text-gray-400 font-medium">Uncheck to remove</span>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                    {shopOrderItems.map((item) => {
                      const isCustomUnattached = item.id.startsWith('custom-unattached-');
                      const isManuallyAdded = item.id.startsWith('custom-item-');
                      return (
                        <div
                          key={item.id}
                          className={`p-2.5 rounded-xl border text-xs transition-all ${item.isChecked
                            ? isCustomUnattached
                              ? 'bg-amber-50/80 border-amber-200 text-amber-950 font-bold'
                              : 'bg-purple-50/80 border-purple-200 text-purple-950 font-bold'
                            : 'bg-gray-50 border-gray-200 text-gray-400 opacity-60'
                            }`}
                        >
                          {/* Badge for custom/unattached items */}
                          {isCustomUnattached && item.isChecked && (
                            <div className="flex items-center gap-1 mb-1.5">
                              <Sparkles className="w-3 h-3 text-amber-600" />
                              <span className="text-[9px] font-black text-amber-700 uppercase tracking-wide">কাস্টম / যেকোনো দোকান — মূল্য এডিট করুন</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <div
                              onClick={() => handleToggleShopOrderItem(item.id)}
                              className="flex items-center space-x-2 cursor-pointer select-none flex-1 min-w-0"
                            >
                              <input
                                type="checkbox"
                                checked={item.isChecked}
                                onChange={() => { }} // handled by parent onClick
                                className={`w-4 h-4 rounded cursor-pointer shrink-0 ${isCustomUnattached ? 'accent-amber-600' : 'accent-purple-600'}`}
                              />
                              <span className={`break-words ${item.isChecked ? '' : 'line-through'}`}>
                                {item.name}{getItemQtyDisplay(item)}
                              </span>
                            </div>
                            {item.isChecked && (
                              <div className="flex flex-col items-end gap-0.5 shrink-0">
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-gray-500 font-bold">৳</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={item.price || ''}
                                    onChange={(e) => {
                                      handleShopOrderItemPriceChange(item.id, e.target.value);
                                      if (orderTextError) setOrderTextError('');
                                    }}
                                    placeholder="একক মূল্য"
                                    required
                                    className={`w-20 p-1.5 rounded-lg border bg-white text-xs font-bold text-gray-900 outline-none text-right ${isCustomUnattached ? 'border-amber-300 focus:border-amber-500' : 'border-purple-300 focus:border-purple-500'}`}
                                  />
                                  {(isManuallyAdded || isCustomUnattached) && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveShopOrderItem(item.id)}
                                      className="p-1 rounded-md text-red-500 hover:bg-red-50"
                                      title="Remove"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                {Boolean(item.price && getItemQuantityNum(item) > 1) && (
                                  <span className="text-[10px] text-purple-700 font-bold font-mono">
                                    {getItemQuantityNum(item)} × ৳{item.price} = ৳{(getItemQuantityNum(item) * (parseFloat(item.price || '0') || 0)).toFixed(2).replace(/\.00$/, '')}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {shopOrderItems.length === 0 && (
                      <p className="text-xs text-gray-400 italic p-2 bg-gray-50 rounded-xl text-center">
                        কোনো আইটেম পাওয়া যায়নি।
                      </p>
                    )}
                  </div>


                </div>

                {/* Cost Calculation Summary Card */}
                {(() => {
                  const commPct = placeOrderShop.commissionPercent;
                  const hasComm = commPct && commPct > 0 && totalShopOrderCost > 0;
                  const commAmt = hasComm ? Math.round(totalShopOrderCost * (commPct! / 100)) : 0;
                  const payable = hasComm ? Math.max(0, totalShopOrderCost - commAmt) : totalShopOrderCost;
                  return (
                    <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-emerald-50 overflow-hidden shadow-sm">
                      {/* Card header */}
                      <div className="px-3.5 pt-3 pb-1 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-purple-600" />
                        <span className="text-[10px] font-black text-purple-800 uppercase tracking-widest">Calculation Summary</span>
                      </div>
                      {/* Rows */}
                      <div className="px-3.5 pb-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-600">মোট পণ্যের মূল্য</span>
                          <span className="font-mono font-black text-xs text-gray-900">৳{totalShopOrderCost.toFixed(2).replace(/\.00$/, '')}</span>
                        </div>
                        {hasComm && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-rose-600">কমিশন ({commPct}%)</span>
                            <span className="font-mono font-bold text-xs text-rose-600">− ৳{commAmt}</span>
                          </div>
                        )}
                      </div>
                      {/* Payable highlight */}
                      <div className="mx-2 mb-2.5 bg-emerald-600 rounded-xl px-3.5 py-2.5 flex items-center justify-between shadow-md">
                        <span className="text-[10px] font-black text-emerald-100 uppercase tracking-wider">পরিশোধযোগ্য</span>
                        <span className="font-mono font-black text-lg text-white drop-shadow">৳{payable.toFixed(2).replace(/\.00$/, '')}</span>
                      </div>
                    </div>
                  );
                })()}



                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    দোকানের জন্য বিশেষ নোট / নির্দেশনা (ঐচ্ছিক)
                  </label>
                  <textarea
                    value={storeInstructionNote}
                    onChange={(e) => setStoreInstructionNote(e.target.value)}
                    placeholder="যেমন: ১ কেজি ওজনের দুটি প্যাকেট দিন..."
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:border-purple-500 outline-none text-gray-800 resize-none h-14"
                  />
                </div>

                {orderTextError && (
                  <p className="text-[11px] text-red-600 font-bold bg-red-50 p-2 rounded-xl border border-red-100">
                    {orderTextError}
                  </p>
                )}

                <div className="flex space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPlaceOrderShop(null)}
                    className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingOrder || shopOrderItems.filter((i) => i.isChecked).length === 0}
                    className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all active:scale-95 disabled:bg-gray-200 disabled:opacity-50"
                  >
                    {isSubmittingOrder
                      ? 'সংরক্ষণ হচ্ছে...'
                      : (placeOrderShop.canReceiveOrders === false ? 'Add Cost (খরচ যুক্ত করুন)' : 'Send Request')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* 2. Shop Request Details Modal */}
      {viewRequestDetails && (() => {
        const isMyself = viewRequestDetails.shopId === 'myself';
        const shop = !isMyself ? fallbackStore.shops.get(viewRequestDetails.shopId) : null;
        const contactNum = isMyself
          ? (viewRequestDetails.sellerPhone || '')
          : (shop?.whatsapp || shop?.managerWhatsapp || '');
        const totalItemsPrice = viewRequestItems
          .filter((i) => i.isChecked)
          .reduce((sum, i) => sum + (parseFloat(i.price || '0') || 0) * getItemQuantityNum(i), 0);
        const displayTotal = totalItemsPrice > 0 ? totalItemsPrice : (viewRequestDetails.price || 0);

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative border border-purple-100 max-h-[90vh] overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  setViewRequestDetails(null);
                  setViewRequestItems([]);
                }}
                className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-purple-100 text-purple-700">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-base text-gray-900 leading-tight">
                    {isMyself ? (viewRequestDetails.sellerName || 'Custom Cost / নিজের কেনা') : viewRequestDetails.shopName}
                  </h3>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                      {isMyself ? 'Direct Purchase' : (shop?.type || 'Store')}
                    </span>
                    {!isMyself && viewRequestDetails.status && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${viewRequestDetails.status === 'PENDING' ? 'bg-amber-100 text-amber-800 border-amber-250' :
                        viewRequestDetails.status === 'ACCEPTED' ? 'bg-blue-100 text-blue-800 border-blue-250' :
                          viewRequestDetails.status === 'PREPARING' ? 'bg-purple-100 text-purple-800 border-purple-250' :
                            viewRequestDetails.status === 'READY' ? 'bg-teal-100 text-teal-800 border-teal-250' :
                              viewRequestDetails.status === 'HANDOVER' ? 'bg-emerald-100 text-emerald-800 border-emerald-250' :
                                viewRequestDetails.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800 border-emerald-250' :
                                  viewRequestDetails.status === 'CANCELED' || (viewRequestDetails.status as string) === 'CANCELLED' ? 'bg-rose-100 text-rose-800 border-rose-250' :
                                    'bg-gray-100 text-gray-700 border-gray-250'
                        }`}>
                        {viewRequestDetails.status === 'PREPARING' ? 'Processing' : viewRequestDetails.status === 'ACCEPTED' ? 'Approved' : viewRequestDetails.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!isMyself && shop?.description && (
                <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-xl border border-gray-100 leading-relaxed font-medium">
                  {shop.description}
                </p>
              )}

              {/* Separated Items List (Non-editable item names, check/uncheck + per-item price) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">
                    Items ({viewRequestItems.filter((i) => i.isChecked).length}/{viewRequestItems.length})
                  </span>
                  {!isDone && (
                    <span className="text-[10px] text-gray-400 font-medium">Uncheck to remove</span>
                  )}
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                  {viewRequestItems.map((item) => (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-xl border text-xs transition-all ${item.isChecked
                        ? (isMyself ? 'bg-amber-50/70 border-amber-200 text-amber-950 font-bold' : 'bg-purple-50/70 border-purple-200 text-purple-950 font-bold')
                        : 'bg-gray-50 border-gray-200 text-gray-400 opacity-60'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div
                          onClick={() => !isDone && handleToggleViewRequestItem(item.id)}
                          className={`flex items-center space-x-2 flex-1 min-w-0 ${!isDone ? 'cursor-pointer select-none' : 'cursor-default'}`}
                        >
                          <input
                            type="checkbox"
                            checked={item.isChecked}
                            disabled={isDone}
                            onChange={() => { }} // handled by parent div onClick
                            className={`w-4 h-4 rounded shrink-0 ${isMyself ? 'accent-amber-600' : 'accent-purple-600'} ${!isDone ? 'cursor-pointer' : 'cursor-default'}`}
                          />
                          <span className={`break-words ${item.isChecked ? '' : 'line-through'}`}>
                            {item.name}{getItemQtyDisplay(item)}
                          </span>
                        </div>
                        {item.isChecked && (
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <div className="flex items-center space-x-1">
                              <span className="text-gray-500 font-bold">৳</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                disabled={isDone}
                                value={item.price !== undefined ? String(item.price) : ''}
                                onChange={(e) => handleViewRequestItemPriceChange(item.id, e.target.value)}
                                placeholder="একক মূল্য"
                                className={`w-20 p-1.5 rounded-lg border bg-white text-xs font-bold text-gray-900 outline-none disabled:bg-gray-100 ${isMyself
                                  ? 'border-amber-300 focus:border-amber-500'
                                  : 'border-purple-300 focus:border-purple-500'
                                  }`}
                              />
                            </div>
                            {Boolean(item.price && getItemQuantityNum(item) > 1) && (
                              <span className="text-[10px] text-purple-700 font-bold font-mono">
                                {getItemQuantityNum(item)} × ৳{item.price} = ৳{(getItemQuantityNum(item) * (Number(item.price) || 0)).toFixed(2).replace(/\.00$/, '')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {viewRequestItems.length === 0 && (
                    <p className="text-xs text-gray-400 italic p-2 bg-gray-50 rounded-xl text-center">
                      কোনো আইটেম পাওয়া যায়নি।
                    </p>
                  )}
                </div>
              </div>

              {/* Helper instruction note if present */}
              {(() => {
                const helperNoteText = viewRequestDetails.helperNote || (() => {
                  const m = (viewRequestDetails.requestText || '').match(/(?:^|\n|,)\s*(?:নোট|Note|নোটঃ|Note:)\s*[:：]?\s*([\s\S]+)$/i);
                  return m ? m[1].trim() : '';
                })();
                if (!helperNoteText) return null;
                return (
                  <div className="bg-amber-50 rounded-2xl border border-amber-200/80 p-3 space-y-1">
                    <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">Instruction Note (নোট):</span>
                    <p className="text-xs text-amber-950 font-medium whitespace-pre-wrap">{helperNoteText}</p>
                  </div>
                );
              })()}

              {/* Cost Calculation Summary */}
              {(() => {
                const total = totalItemsPrice > 0 ? totalItemsPrice : (viewRequestDetails.price || 0);
                const commPct = !isMyself ? shop?.commissionPercent : undefined;
                const hasComm = commPct && commPct > 0 && total > 0;
                const commAmt = hasComm ? Math.round(total * (commPct! / 100)) : 0;
                const payable = hasComm ? Math.max(0, total - commAmt) : total;
                return (
                  <div className={`rounded-2xl border overflow-hidden bg-gradient-to-br ${isMyself
                    ? 'border-amber-200 from-amber-50 to-amber-50/30'
                    : 'border-purple-200 from-purple-50 to-emerald-50'
                    }`}>
                    <div className="px-3 pt-2.5 pb-1.5 space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-600">
                        <span>Total Cost</span>
                        <span className={`font-mono ${isMyself ? 'text-amber-900' : 'text-gray-900'}`}>
                          ৳{Number(total).toFixed(2).replace(/\.00$/, '')}
                        </span>
                      </div>
                      {hasComm && (
                        <div className="flex items-center justify-between text-xs font-bold text-rose-600">
                          <span>কমিশন ({commPct}%)</span>
                          <span className="font-mono">− ৳{commAmt}</span>
                        </div>
                      )}
                    </div>
                    <div className={`mx-2 mb-2 rounded-xl px-3 py-2 flex items-center justify-between shadow-sm ${isMyself ? 'bg-amber-600' : 'bg-emerald-600'
                      }`}>
                      <span className="text-[10px] font-black text-white/80 uppercase tracking-wider">
                        {isMyself ? 'Total Spent' : 'পরিশোধযোগ্য'}
                      </span>
                      <span className="font-mono font-black text-base text-white">৳{payable.toFixed(2).replace(/\.00$/, '')}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Contact Details */}
              {!isMyself && shop && (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2">
                  <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">Store Contact</span>
                  <div className="text-xs font-bold text-gray-800">
                    {shop.contactPerson && <p className="text-gray-700">{shop.contactPerson}{shop.managerName && shop.managerName !== shop.contactPerson ? ` / ${shop.managerName}` : ''}</p>}
                    {(shop.whatsapp || shop.managerWhatsapp) && (
                      <p className="font-mono text-gray-900 mt-0.5">{shop.whatsapp || shop.managerWhatsapp}</p>
                    )}
                    {shop.location?.address && (
                      <p className="text-gray-500 font-medium text-[11px] mt-0.5">{shop.location.address}</p>
                    )}
                  </div>
                  {(shop.whatsapp || shop.managerWhatsapp) && (
                    <div className="flex items-center space-x-2">
                      <a
                        href={`tel:${shop.whatsapp || shop.managerWhatsapp}`}
                        className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all active:scale-95"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call Store</span>
                      </a>
                      <a
                        href={`https://wa.me/880${(shop.whatsapp || shop.managerWhatsapp || '').replace(/^0/, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all active:scale-95"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              )}
              {isMyself && contactNum && (
                <div className="flex items-center space-x-2">
                  <a
                    href={`tel:${contactNum}`}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all active:scale-95"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call Seller</span>
                  </a>
                  <a
                    href={`https://wa.me/880${contactNum.replace(/^0/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all active:scale-95"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                    <span>WhatsApp</span>
                  </a>
                </div>
              )}

              {!isDone && (
                <div className="flex space-x-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmDel = await showConfirm("Confirm removal", "Are you sure you want to remove this request?");
                      if (confirmDel) {
                        const itemNames = (viewRequestItems.length > 0 ? viewRequestItems : (viewRequestDetails.itemsWithPrice || []))
                          .map((i) => i.name.toLowerCase().trim())
                          .concat(
                            viewRequestDetails.requestText
                              .split(/,|\r?\n/)
                              .map((p) => p.trim().toLowerCase())
                              .filter((p) => p && !p.startsWith('নোট:'))
                          );

                        // Uncheck in order items
                        fallbackStore.updateOrder(order.id, (o) => ({
                          ...o,
                          items: (o.items || []).map((it) => {
                            const itName = it.name.toLowerCase().trim();
                            const isMatched = itemNames.some((rn) => itName.includes(rn) || rn.includes(itName));
                            return isMatched ? { ...it, purchased: false } : it;
                          }),
                        }));

                        // Reset local sub-item and note states
                        setCheckedSubItems((prev) => {
                          const updated = { ...prev };
                          parsedItems.forEach((pi) => {
                            const piName = pi.name.toLowerCase().trim();
                            if (itemNames.some((rn) => piName.includes(rn) || rn.includes(piName))) {
                              delete updated[pi.id];
                            }
                          });
                          return updated;
                        });

                        setCheckedNoteItems((prev) => {
                          const updated = { ...prev };
                          parsedNoteItems.forEach((note, idx) => {
                            const nName = note.toLowerCase().trim();
                            if (itemNames.some((rn) => nName.includes(rn) || rn.includes(nName))) {
                              updated[idx] = false;
                            }
                          });
                          return updated;
                        });

                        await fallbackStore.deleteShopOrder(viewRequestDetails.id);
                        setViewRequestDetails(null);
                        setViewRequestItems([]);
                      }
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-705 font-extrabold text-xs transition-colors"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const checkedItems = viewRequestItems.filter((i) => i.isChecked);
                      if (checkedItems.length === 0) {
                        showAlert('পণ্য নির্বাচন করুন', 'অনুগ্রহ করে অন্তত একটি আইটেম চেক রাখুন অথবা অর্ডারটি রিমুভ করুন।', 'warning');
                        return;
                      }

                      const itemsListText = checkedItems
                        .map((i) => i.name)
                        .join(', ');

                      const calculatedTotal = checkedItems.reduce(
                        (sum, i) => sum + (parseFloat(i.price || '0') || 0),
                        0
                      );

                      if (isMyself) {
                        const updatedItemsWithPrice: ShopOrderItemPrice[] = checkedItems.map((i) => ({
                          name: i.name,
                          price: parseFloat(i.price || '0') || 0,
                        }));

                        await fallbackStore.updateShopOrder(
                          viewRequestDetails.id,
                          (so) => ({
                            ...so,
                            requestText: itemsListText,
                            price: calculatedTotal > 0 ? calculatedTotal : viewRequestDetails.price,
                            itemsWithPrice: updatedItemsWithPrice,
                            sellerName: viewRequestDetails.sellerName?.trim() || undefined,
                            sellerPhone: viewRequestDetails.sellerPhone?.trim() || undefined,
                          }),
                          'helper'
                        );
                      } else {
                        const updatedItemsWithPrice: ShopOrderItemPrice[] = checkedItems.map((i) => {
                          const p = i.price !== undefined && i.price !== '' ? (parseFloat(i.price) || 0) : undefined;
                          return {
                            name: i.name,
                            ...(p !== undefined ? { price: p } : {}),
                          };
                        });

                        const hasSomePrices = updatedItemsWithPrice.some((it) => it.price !== undefined && it.price > 0);
                        const newTotal = hasSomePrices ? calculatedTotal : viewRequestDetails.price;

                        await fallbackStore.updateShopOrder(
                          viewRequestDetails.id,
                          (so) => ({
                            ...so,
                            requestText: itemsListText,
                            price: newTotal,
                            itemsWithPrice: updatedItemsWithPrice.length > 0 ? updatedItemsWithPrice : so.itemsWithPrice,
                          }),
                          'helper'
                        );
                      }

                      // Sync updated item prices into parent order items so customer side stays completely in sync
                      const editPriceMap: Record<string, number> = {};
                      checkedItems.forEach((ci) => {
                        const p = parseFloat(ci.price || '0');
                        if (!isNaN(p) && p >= 0) {
                          if (ci.originalId) editPriceMap[ci.originalId] = p;
                          if (ci.id) editPriceMap[ci.id] = p;
                          editPriceMap[ci.name.toLowerCase().trim()] = p;
                        }
                      });

                      if (Object.keys(editPriceMap).length > 0) {
                        fallbackStore.updateOrder(order.id, (o) => ({
                          ...o,
                          items: (o.items || []).map((it) => {
                            const itNorm = it.name.toLowerCase().trim();
                            const newPrice = editPriceMap[it.id] ?? editPriceMap[itNorm];
                            if (newPrice !== undefined) {
                              return {
                                ...it,
                                price: newPrice,
                                ...(isMyself ? { buyFrom: viewRequestDetails.sellerName?.trim() || it.buyFrom } : {}),
                              };
                            }
                            return it;
                          }),
                          updatedAt: new Date().toISOString(),
                        }));
                      }

                      // If some items were unchecked in this modal, uncheck them in parent order
                      const uncheckedItemNames = viewRequestItems
                        .filter((i) => !i.isChecked)
                        .map((i) => i.name.toLowerCase().trim());
                      if (uncheckedItemNames.length > 0) {
                        fallbackStore.updateOrder(order.id, (o) => ({
                          ...o,
                          items: (o.items || []).map((it) => {
                            const itName = it.name.toLowerCase().trim();
                            const isUnchecked = uncheckedItemNames.some((rn) => itName.includes(rn) || rn.includes(itName));
                            return isUnchecked ? { ...it, purchased: false } : it;
                          }),
                        }));

                        setCheckedSubItems((prev) => {
                          const updated = { ...prev };
                          parsedItems.forEach((pi) => {
                            const piName = pi.name.toLowerCase().trim();
                            if (uncheckedItemNames.some((rn) => piName.includes(rn) || rn.includes(piName))) {
                              delete updated[pi.id];
                            }
                          });
                          return updated;
                        });

                        setCheckedNoteItems((prev) => {
                          const updated = { ...prev };
                          parsedNoteItems.forEach((note, idx) => {
                            const nName = note.toLowerCase().trim();
                            if (uncheckedItemNames.some((rn) => nName.includes(rn) || rn.includes(nName))) {
                              updated[idx] = false;
                            }
                          });
                          return updated;
                        });
                      }

                      setViewRequestDetails(null);
                      setViewRequestItems([]);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs shadow-sm transition-all"
                  >
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}


      {/* Store Info Drawer */}
      {storeInfoShopId !== null && (() => {
        const shopObj = fallbackStore.shops.get(storeInfoShopId);
        const fallbackItem = (order.items || []).find(it => it.storeId === storeInfoShopId);
        const name = shopObj?.name || fallbackItem?.storeName || storeInfoShopId;
        const storePhone = shopObj?.whatsapp || shopObj?.contactPerson || '';
        const ownerOrContactLabel = shopObj?.contactPerson && shopObj?.whatsapp
          ? shopObj.contactPerson
          : 'Store';
        const managerName = shopObj?.managerName || '';
        const managerPhone = shopObj?.managerWhatsapp || '';
        const address = shopObj?.location?.address || '';
        const lat = shopObj?.location?.lat;
        const lng = shopObj?.location?.lng;
        const category = shopObj?.category || shopObj?.type || '';
        const description = shopObj?.description || '';
        const openTime = shopObj?.openingTime || '';
        const closeTime = shopObj?.closingTime || '';

        const mapsUrl = lat && lng
          ? `https://www.google.com/maps?q=${lat},${lng}`
          : address
            ? `https://www.google.com/maps/search/${encodeURIComponent(address)}`
            : null;

        const ContactRow = ({ label, numLabel, phone }: { label: string; numLabel: string; phone: string }) => (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-gray-200 border border-gray-300 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide">{label}</p>
              <p className="text-sm font-black text-gray-900 leading-tight">{numLabel}</p>
              <p className="text-xs text-gray-500 font-medium">{phone}</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <a
                href={`https://wa.me/${phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors active:scale-90"
                title="WhatsApp"
              >
                <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
              </a>
              <a
                href={`tel:${phone}`}
                className="w-8 h-8 rounded-lg bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-colors active:scale-90"
                title="Call"
              >
                <Phone className="w-4 h-4 text-white" />
              </a>
            </div>
          </div>
        );

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center" onClick={() => setStoreInfoShopId(null)}>
            <div className="w-full max-w-sm bg-white rounded-t-3xl p-5 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5 text-purple-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900 leading-tight">{name}</h3>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {category && <span className="text-[9px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full uppercase">{category}</span>}
                      {(openTime || closeTime) && (
                        <span className="text-[9px] text-gray-500 font-medium flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />{openTime}{openTime && closeTime ? '–' : ''}{closeTime}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => setStoreInfoShopId(null)}
                  className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {description && (
                <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 leading-relaxed">{description}</p>
              )}

              <div className="space-y-2">
                {/* Location — tap to open Google Maps */}
                {address && (
                  <a
                    href={mapsUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100 active:bg-blue-100 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-blue-700 uppercase tracking-wide mb-0.5">Location · Tap for Maps</p>
                      <p className="text-xs text-blue-900 font-semibold leading-snug">{address}</p>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-1" />
                  </a>
                )}

                {/* Store owner / contact */}
                {storePhone && (
                  <ContactRow
                    label="Owner / Store Contact"
                    numLabel={ownerOrContactLabel}
                    phone={storePhone}
                  />
                )}

                {/* Manager */}
                {managerPhone && (
                  <ContactRow
                    label="Manager"
                    numLabel={managerName || 'Manager'}
                    phone={managerPhone}
                  />
                )}

                {/* Manager name only (no phone) */}
                {managerName && !managerPhone && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="w-8 h-8 rounded-lg bg-gray-200 border border-gray-300 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide">Manager</p>
                      <p className="text-sm font-black text-gray-900">{managerName}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}


      {/* Store Price Confirm Modal — for store-connected items, no retailer selection needed */}
      {storePriceModalShopId !== null && storePriceItems.length > 0 && (() => {
        const shop = fallbackStore.shops.get(storePriceModalShopId);
        const shopName = shop?.name || (order.items || []).find(it => it.storeId === storePriceModalShopId)?.storeName || storePriceModalShopId;
        const totalStoreCost = storePriceItems.reduce((sum, i) => sum + (parseFloat(i.price || '0') || 0), 0);
        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 relative max-h-[90vh] overflow-y-auto">
              <button
                type="button"
                onClick={() => { setStorePriceModalShopId(null); setStorePriceItems([]); }}
                className="absolute top-4 right-4 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Store className="w-4.5 h-4.5 text-purple-700" />
                  <h3 className="text-base font-black text-gray-900">Confirm Prices</h3>
                </div>
                <p className="text-[11px] text-gray-500 font-medium">{shopName} — Enter the actual price for each item</p>
              </div>

              <div className="space-y-2.5">
                {storePriceItems.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100">
                    {/* Photo or icon */}
                    <div className="w-11 h-11 rounded-xl border border-gray-200 shrink-0 overflow-hidden bg-white flex items-center justify-center">
                      {item.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-5 h-5 text-emerald-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-xs text-gray-900 truncate">{item.name}{getItemQtyDisplay(item)}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-bold text-gray-500">৳</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder="Price"
                          value={item.price}
                          onChange={(e) => {
                            setStorePriceItems(prev => prev.map((p, i) => i === idx ? { ...p, price: e.target.value } : p));
                          }}
                          className="w-full text-xs font-extrabold text-gray-900 bg-white border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/15"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {totalStoreCost > 0 && (
                <div className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
                  <span className="text-xs font-extrabold text-purple-900">Total</span>
                  <span className="text-sm font-black text-purple-900 font-mono">৳{totalStoreCost}</span>
                </div>
              )}

              <button
                type="button"
                disabled={isSubmittingStorePrice || totalStoreCost <= 0}
                onClick={async () => {
                  if (totalStoreCost <= 0) {
                    showAlert('Price Required', 'Please enter the price for at least one item.', 'warning');
                    return;
                  }
                  setIsSubmittingStorePrice(true);
                  try {
                    const itemsText = storePriceItems.map(i => i.name).join(', ');
                    const newShopOrder: ShopOrder = {
                      id: `so-store-${storePriceModalShopId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                      parentOrderId: order.id,
                      shopId: storePriceModalShopId,
                      shopName,
                      helperId: order.helperId || '',
                      helperName: order.helperName || 'Helper',
                      requestText: itemsText,
                      sellerName: shopName,
                      status: 'ACCEPTED',
                      price: totalStoreCost,
                      itemsWithPrice: storePriceItems.map(i => ({
                        name: i.name,
                        unit: formatItemQuantityUnit(getItemQuantityNum(i), (i as any).unit, i.qty),
                        price: parseFloat(i.price || '0') || 0,
                        itemId: i.id,
                        originalId: i.originalId,
                      })),
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      statusHistory: [{ status: 'ACCEPTED', timestamp: new Date().toISOString(), actor: order.helperName || 'Helper' }],
                    };
                    await fallbackStore.addShopOrder(newShopOrder);
                    // Mark items as purchased
                    const relatedIds = storePriceItems.map(i => i.originalId);
                    if (relatedIds.length > 0) {
                      fallbackStore.updateOrder(order.id, (o) => ({
                        ...o,
                        items: (o.items || []).map(it => relatedIds.includes(it.id) ? { ...it, purchased: true } : it),
                      }));
                    }
                    setStorePriceModalShopId(null);
                    setStorePriceItems([]);
                  } finally {
                    setIsSubmittingStorePrice(false);
                  }
                }}
                className="w-full py-3 bg-purple-700 hover:bg-purple-800 active:bg-purple-900 disabled:opacity-60 text-white font-extrabold text-sm rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-98 shadow-sm"
              >
                {isSubmittingStorePrice ? (
                  <span className="animate-pulse">Saving...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm ৳{totalStoreCost} — {shopName}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Enter Custom Cost Modal */}
      {showCustomCostModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowCustomCostModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-gray-900">Add Custom Cost</h3>
                <p className="text-[11px] text-gray-500 font-medium">Helper purchased item cost and seller details</p>
              </div>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSubmittingCustomCost) return;

                const checkedItems = customCostItems.filter((i) => i.isChecked);
                if (checkedItems.length === 0) {
                  showAlert('পণ্য নির্বাচন করুন', 'অনুগ্রহ করে অন্তত একটি আইটেম চেক করুন।', 'warning');
                  return;
                }

                const hasInvalidPrice = checkedItems.some(
                  (i) => !i.price || isNaN(parseFloat(i.price)) || parseFloat(i.price) <= 0
                );
                if (hasInvalidPrice) {
                  showAlert('মূল্য আবশ্যক', 'নির্বাচিত প্রতিটি পণ্যের জন্য সঠিক মূল্য (৳) লিখুন।', 'warning');
                  return;
                }

                if (!customSellerName.trim()) {
                  showAlert('Seller Name Required', 'Please enter the seller or store name.', 'warning');
                  return;
                }
                if (!customSellerPhone.trim()) {
                  showAlert('Seller Phone Required', 'Please enter seller mobile phone number for customer verification.', 'warning');
                  return;
                }
                setIsSubmittingCustomCost(true);
                try {
                  const itemsListText = checkedItems
                    .map((i) => i.name)
                    .join(', ');

                  if (!customCostDraftIdRef.current) {
                    customCostDraftIdRef.current = `so-myself-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                  }
                  const newShopOrder: ShopOrder = {
                    id: customCostDraftIdRef.current,
                    parentOrderId: order.id,
                    shopId: 'myself',
                    shopName: 'MySelf',
                    helperId: order.helperId || '',
                    helperName: order.helperName || 'Helper',
                    requestText: itemsListText,
                    sellerName: customSellerName.trim(),
                    sellerPhone: customSellerPhone.trim(),
                    status: 'ACCEPTED',
                    price: totalCustomCost,
                    itemsWithPrice: checkedItems.map((i) => ({
                      name: i.name,
                      unit: formatItemQuantityUnit(getItemQuantityNum(i), i.unit, i.qty),
                      price: parseFloat(i.price || '0') || 0,
                      itemId: i.id,
                      originalId: i.originalId,
                    })),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    statusHistory: [{ status: 'ACCEPTED', timestamp: new Date().toISOString(), actor: order.helperName || 'Helper' }],
                  };
                  const result = await fallbackStore.addShopOrder(newShopOrder);

                  // Ensure all checked items have their unit price and purchased status updated on customer & helper sides
                  const itemPriceMap: Record<string, number> = {};
                  checkedItems.filter((i) => !i.isNote).forEach((i) => {
                    const p = parseFloat(i.price || '0');
                    if (!isNaN(p) && p >= 0) {
                      if (i.originalId) itemPriceMap[i.originalId] = p;
                      if (i.id) itemPriceMap[i.id] = p;
                      itemPriceMap[i.name.toLowerCase().trim()] = p;
                    }
                  });

                  if (Object.keys(itemPriceMap).length > 0) {
                    fallbackStore.updateOrder(order.id, (o) => {
                      const updatedItems = (o.items || []).map((it) => {
                        const itNorm = it.name.toLowerCase().trim();
                        const newPrice = itemPriceMap[it.id] ?? itemPriceMap[itNorm];
                        if (newPrice !== undefined) {
                          return {
                            ...it,
                            price: newPrice,
                            purchased: true,
                            buyFrom: customSellerName.trim() || it.buyFrom,
                          };
                        }
                        return it;
                      });

                      const totalCost = updatedItems.reduce((acc, it) => {
                        const qty = typeof it.quantity === 'number' && it.quantity > 0
                          ? it.quantity
                          : (parseFloat(it.qty || '1') || 1);
                        const p = typeof it.price === 'number' ? it.price : 0;
                        return acc + (p * qty);
                      }, 0);

                      const isCustomPricingOn = fallbackStore.pricingSettings.customStorePricingEnabled;
                      const customUnit = Number(fallbackStore.pricingSettings.customStorePricingAmount ?? 15) || 0;
                      const newMyselfCount = checkedItems.length;
                      const addedCustomFee = isCustomPricingOn ? newMyselfCount * customUnit : 0;

                      return {
                        ...o,
                        items: updatedItems,
                        productCost: totalCost > 0 ? totalCost : o.productCost,
                        customStoreFee: addedCustomFee > 0 ? Math.max(o.customStoreFee || 0, addedCustomFee) : o.customStoreFee,
                        updatedAt: new Date().toISOString(),
                      };
                    });
                  }

                  customCostDraftIdRef.current = null;
                  setShowCustomCostModal(false);
                  setCustomCostItems([]);
                  setCustomSellerName('');
                  setCustomSellerPhone('');
                  reportShopOrderResult(result);
                } catch (err) {
                  showAlert('খরচ যুক্ত করা যায়নি', shopOrderErrorText(err), 'error');
                } finally {
                  setIsSubmittingCustomCost(false);
                }
              }}
              className="space-y-3"
            >
              {fallbackStore.pricingSettings.customStorePricingEnabled && (
                <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950">
                  <div className="font-bold flex items-center justify-between text-indigo-900 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-indigo-600" />
                      Custom Store Pricing Active
                    </span>
                    <span className="font-extrabold text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                      +৳{fallbackStore.pricingSettings.customStorePricingAmount ?? 15}/পণ্য
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    লিস্টেড স্টোর ছাড়া অন্য দোকান থেকে কেনা পণ্যের জন্য কাস্টমার ও হেলপার সামারিতে প্রতি পণ্যে <strong>৳{fallbackStore.pricingSettings.customStorePricingAmount ?? 15}</strong> কাস্টম স্টোর চার্জ যুক্ত হবে।
                  </p>
                </div>
              )}

              {/* Items with Per-Item Price Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700 block">
                    Selected Items ({customCostItems.filter((i) => i.isChecked).length}/{customCostItems.length}) *
                  </label>
                  <span className="text-[10px] text-gray-400 font-medium">Uncheck to remove</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                  {customCostItems.map((item) => (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-xl border text-xs transition-all ${item.isChecked
                        ? 'bg-amber-50/70 border-amber-200 text-amber-950 font-bold'
                        : 'bg-gray-50 border-gray-200 text-gray-400 opacity-60'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div
                          onClick={() => handleToggleCustomCostItem(item.id)}
                          className="flex items-center space-x-2 cursor-pointer select-none flex-1 min-w-0"
                        >
                          <input
                            type="checkbox"
                            checked={item.isChecked}
                            onChange={() => { }} // Handled by parent div onClick
                            className="w-4 h-4 accent-amber-600 rounded cursor-pointer shrink-0"
                          />
                          <span className={`break-words ${item.isChecked ? '' : 'line-through'}`}>
                            {item.name}{getItemQtyDisplay(item)}
                          </span>
                        </div>
                        {item.isChecked && (
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <div className="flex items-center space-x-1">
                              <span className="text-gray-500 font-bold">৳</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.price || ''}
                                onChange={(e) => handleCustomItemPriceChange(item.id, e.target.value)}
                                placeholder="মূল্য"
                                required
                                className="w-20 p-1.5 rounded-lg border border-amber-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-amber-500 font-mono"
                              />
                            </div>
                            {Boolean(item.price && getItemQuantityNum(item) > 1) && (
                              <span className="text-[10px] text-amber-900 font-bold font-mono">
                                {getItemQuantityNum(item)} × ৳{item.price} = ৳{(getItemQuantityNum(item) * (Number(item.price) || 0)).toFixed(2).replace(/\.00$/, '')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {customCostItems.length === 0 && (
                    <p className="text-xs text-gray-400 italic p-2 bg-gray-50 rounded-xl text-center">
                      কোনো আইটেম পাওয়া যায়নি।
                    </p>
                  )}
                </div>
              </div>

              {/* Total Cost Display */}
              <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100 flex items-center justify-between">
                <span className="text-xs font-black text-purple-900 uppercase tracking-wider">Total Product Cost:</span>
                <span className="font-mono font-black text-sm text-purple-950">৳{totalCustomCost.toFixed(2).replace(/\.00$/, '')}</span>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Seller / Shop Name *</label>
                <input
                  type="text"
                  value={customSellerName}
                  onChange={(e) => setCustomSellerName(e.target.value)}
                  placeholder="e.g. Bhai Bhai Store or Karim"
                  className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm outline-none focus:border-purple-500 bg-white"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Seller Phone Number *</label>
                <input
                  type="tel"
                  value={customSellerPhone}
                  onChange={(e) => setCustomSellerPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm outline-none focus:border-purple-500 bg-white"
                  required
                />
              </div>
              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomCostModal(false)}
                  disabled={isSubmittingCustomCost}
                  className="flex-1 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCustomCost || customCostItems.filter((i) => i.isChecked).length === 0}
                  className="flex-1 py-3 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-md disabled:opacity-50 flex items-center justify-center space-x-1"
                >
                  {isSubmittingCustomCost ? <span>Saving...</span> : <span>Save Cost</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Retailer Map Modal */}
      {showRetailerMap && (
        <HelperRetailerMapModal
          isOpen={showRetailerMap}
          onClose={() => setShowRetailerMap(false)}
          shops={nearbyShops}
          selectedShopIds={selectedShopIds}
          orderPickupLocation={order.pickupLocation}
          orderDeliveryLocation={order.deliveryLocation}
          helperLocation={helperLocation}
          radiusKm={fallbackStore.pricingSettings.retailerCommissionRadius ?? fallbackStore.pricingSettings.helperRadiusKm ?? 5}
          onShopMarkerClick={(shop) => {
            setRetailerDetailsShop(shop);
          }}
        />
      )}

      {/* Retailer Details Modal */}
      {retailerDetailsShop && (
        <HelperRetailerDetailsModal
          shop={retailerDetailsShop}
          isSelected={selectedShopIds.includes(retailerDetailsShop.id)}
          productCost={order.productCost}
          onClose={() => setRetailerDetailsShop(null)}
          onSelect={(shopId: string) => {
            handleToggleShopSelection(shopId);
            setRetailerDetailsShop(null);
          }}
          onDeselect={(shopId: string) => {
            handleDeselectShop(shopId);
            setRetailerDetailsShop(null);
          }}
        />
      )}
    </div>
  );
};
