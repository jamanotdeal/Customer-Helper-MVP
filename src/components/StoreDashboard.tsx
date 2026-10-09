'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Order } from '@/types';
import { fallbackStore, db, versionOf, createChangeGate } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, startAfter, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { RequestComposer } from './RequestComposer';
import { OrderCard } from './OrderCard';
import { StoreWallet } from './StoreWallet';
import {
  Store, PlusCircle, Package, ShoppingBag,
  AlertCircle, CheckCircle, ArrowRight, ArrowLeft, ShieldAlert, Check, X, Edit3, Calendar, Filter, Clock, Phone, AlertTriangle, ArrowUpDown, MessageSquare, CheckCircle2, Bell, Loader2
} from 'lucide-react';
import { ShopOrder, ShopOrderStatus, ShopOrderItemPrice } from '@/types';
import { OrderDetailsView } from './OrderDetailsView';
import { useModal } from './CustomModal';
import { getLiveElapsedTimeHMS } from '@/lib/timeUtils';
import { BlockedUserModal } from './BlockedUserModal';


// Helper to suppress "বাজার-সদাই করে দিন" service label in Store Mode
const formatServiceName = (name?: string) => {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed === 'বাজার-সদাই করে দিন' || trimmed.includes('বাজার-সদাই করে দিন') || trimmed === 'বাজার-সদাই') {
    return '';
  }
  return trimmed;
};

// Helper to detect if an item text is a note
const isNoteItem = (name: string) => {
  const trimmed = name.trim();
  return /^(?:নোট|note|নোটঃ)\s*[:：]/i.test(trimmed) || /^(?:নোট|note)\s+/i.test(trimmed);
};

// Helper to cleanly extract items text and helper note from a ShopOrder
export const extractShopOrderNoteAndItems = (shopOrder: ShopOrder | null) => {
  if (!shopOrder) return { itemsText: '', helperNote: '' };

  let helperNote = (shopOrder.helperNote || '').trim();
  let requestText = (shopOrder.requestText || '').trim();

  // If itemsWithPrice contains a note item mistakenly saved in past
  if (shopOrder.itemsWithPrice && shopOrder.itemsWithPrice.length > 0) {
    const noteItem = shopOrder.itemsWithPrice.find((it) => isNoteItem(it.name));
    if (noteItem && !helperNote) {
      helperNote = noteItem.name.replace(/^(?:নোট|note|নোটঃ)\s*[:：]?\s*/i, '').trim();
    }
  }

  // If helperNote is still empty, extract note from requestText if present
  if (!helperNote && requestText) {
    const notePattern = /(?:^|\n|,)\s*(?:নোট|Note|নোটঃ|Note:)\s*[:：]?\s*([\s\S]+)$/i;
    const match = requestText.match(notePattern);
    if (match) {
      helperNote = match[1].trim();
      requestText = requestText.substring(0, match.index).replace(/[, \t]+$/, '').trim();
    }
  }

  return { itemsText: requestText, helperNote };
};

// Helper to divide request text by comma or extract saved items with price
const parseShopOrderItems = (shopOrder: ShopOrder | null): { name: string; unit: string; price: string }[] => {
  if (!shopOrder) return [];
  if (shopOrder.itemsWithPrice && shopOrder.itemsWithPrice.length > 0) {
    return shopOrder.itemsWithPrice
      .filter((item) => !isNoteItem(item.name))
      .map((item) => ({
        name: item.name,
        unit: item.unit || '',
        price: item.price !== undefined && item.price !== null ? String(item.price) : '',
      }));
  }
  const { itemsText } = extractShopOrderNoteAndItems(shopOrder);
  if (!itemsText) return [];
  const splitItems = itemsText
    .split(/,|\n/)
    .map((s) => s.replace(/^["'\s]+|["'\s]+$/g, '').trim())
    .filter((s) => Boolean(s) && !isNoteItem(s));

  if (splitItems.length > 0) {
    return splitItems.map((name) => ({
      name,
      unit: '',
      price: '',
    }));
  }
  return [];
};

// Live counterup timer component matching format "1h 16m 03s"
const OrderTimer: React.FC<{ createdAt: string; className?: string; hideIcon?: boolean }> = ({ createdAt, className, hideIcon }) => {
  const [elapsed, setElapsed] = useState(() => getLiveElapsedTimeHMS(createdAt));

  useEffect(() => {
    setElapsed(getLiveElapsedTimeHMS(createdAt));
    const interval = setInterval(() => {
      setElapsed(getLiveElapsedTimeHMS(createdAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return (
    <span className={`inline-flex items-center space-x-1 ${className || 'text-gray-500'}`}>
      {!hideIcon && <Clock className="w-3.5 h-3.5" />}
      <span className="font-semibold">{elapsed}</span>
    </span>
  );
};

const formatOrderDateTime = (isoString?: string) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};


interface StoreDashboardProps {
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  initialSelectedOrderId?: string | null;
  onClearInitialOrder?: () => void;
}

export const StoreDashboard: React.FC<StoreDashboardProps> = ({
  activeTab: parentActiveTab,
  setActiveTab: parentSetActiveTab,
  initialSelectedOrderId,
  onClearInitialOrder,
}) => {
  const { user, setActiveMode } = useAuth();
  const { showAlert, showConfirm, showPermissionModal } = useModal();
  const [localActiveTab, setLocalActiveTab] = useState<'ORDERS' | 'MY_REQUESTS'>('ORDERS');

  // Permission prompts on store load (Notification, Location, Display Over)
  useEffect(() => {
    if (!user) return;
    const checkPermissions = async () => {
      const p = fallbackStore.pricingSettings;

      // 1. Display Over Permission (Store only)
      const displayOverPrompted = typeof localStorage !== 'undefined' && localStorage.getItem('display_over_permission_prompted') === 'true';
      if (!displayOverPrompted) {
        await showPermissionModal({
          permissionType: 'display_over',
          title: p.displayOverPermissionModalTitle || 'ডিসপ্লে ওভার পারমিশন আবশ্যক (Display Over Other Apps)',
          message: p.displayOverPermissionModalBody || 'নতুন কাস্টমার অর্ডার আসলে স্ক্রিনের উপর সাথে সাথে রিয়েল-টাইম পপআপ অ্যালার্ম পেতে ডিসপ্লে ওভার পারমিশন এলাউ করুন।',
          allowText: 'Allow Display Over',
        });
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('display_over_permission_prompted', 'true');
        }
      }

      // 2. Notification Permission
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
        const notifPrompted = typeof localStorage !== 'undefined' && localStorage.getItem('notification_permission_prompted') === 'true';
        if (!notifPrompted) {
          await showPermissionModal({
            permissionType: 'notification',
            title: p.notificationPermissionModalTitle || 'নোটিফিকেশন পারমিশন আবশ্যক (Notification Required)',
            message: p.notificationPermissionModalBody || 'জরুরি আপডেট ও নতুন অর্ডারের নোটিফিকেশন পাওয়ার জন্য নোটিফিকেশন পারমিশন দেওয়া আবশ্যক।',
            allowText: 'Allow Notification',
          });
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('notification_permission_prompted', 'true');
          }
        }
      }

      // 3. Location Permission
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        const locPrompted = typeof localStorage !== 'undefined' && localStorage.getItem('location_permission_prompted') === 'true';
        if (!locPrompted) {
          navigator.geolocation.getCurrentPosition(
            () => {
              if (typeof localStorage !== 'undefined') localStorage.setItem('location_permission_prompted', 'true');
            },
            () => {
              if (typeof localStorage !== 'undefined') localStorage.setItem('location_permission_prompted', 'true');
            },
            { timeout: 8000 }
          );
        }
      }
    };

    checkPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const [showRequestComposer, setShowRequestComposer] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedShopOrderId, setSelectedShopOrderId] = useState<string | null>(null);

  const [storeOrders, setStoreOrders] = useState<Order[]>([]);
  const [myRequests, setMyRequests] = useState<Order[]>([]);
  const [storeShopOrders, setStoreShopOrders] = useState<ShopOrder[]>([]);

  // Incoming Orders (Store Shop Orders) Filters & Pagination
  const [storeStatusFilter, setStoreStatusFilter] = useState<string>('ALL');
  const [storeDateFilter, setStoreDateFilter] = useState<'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH'>('ALL');
  const [storeSortOrder, setStoreSortOrder] = useState<'ACTIVE_FIRST' | 'NEWEST' | 'OLDEST'>('ACTIVE_FIRST');
  const [storeVisibleCount, setStoreVisibleCount] = useState(10);

  // My Requests Filters & Pagination
  const [myReqStatusFilter, setMyReqStatusFilter] = useState<string>('ALL');
  const [myReqDateFilter, setMyReqDateFilter] = useState<'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH'>('ALL');
  const [myReqSortOrder, setMyReqSortOrder] = useState<'NEWEST' | 'OLDEST'>('NEWEST');
  const [myRequestsVisibleCount, setMyRequestsVisibleCount] = useState(10);

  // Rejection/Cancel Custom Modal State
  const [showStoreCancelModal, setShowStoreCancelModal] = useState(false);
  const [storeCancelReason, setStoreCancelReason] = useState('');
  const [storeCancelError, setStoreCancelError] = useState('');
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);

  // Pricing & note state inside details view
  const [costInput, setCostInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [itemPrices, setItemPrices] = useState<{ name: string; unit: string; price: string }[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLoadedShopOrderIdRef = useRef<string | null>(null);
  const [updatingCost, setUpdatingCost] = useState(false);
  const [updatingNote, setUpdatingNote] = useState(false);

  // Completed/Finished shop orders paginated loading state
  const [completedShopOrders, setCompletedShopOrders] = useState<ShopOrder[]>([]);
  const [completedParentOrders, setCompletedParentOrders] = useState<Record<string, Order>>({});
  const [completedLastVisible, setCompletedLastVisible] = useState<any>(null);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedHasMore, setCompletedHasMore] = useState(true);

  // Completed/Finished customer requests paginated loading state
  const [completedRequests, setCompletedRequests] = useState<Order[]>([]);
  const [completedReqLastVisible, setCompletedReqLastVisible] = useState<any>(null);
  const [completedReqLoading, setCompletedReqLoading] = useState(false);
  const [completedReqHasMore, setCompletedReqHasMore] = useState(true);

  const storeId = useMemo(() => {
    if (user?.storeId && fallbackStore.shops.has(user.storeId)) return user.storeId;
    const foundShop = Array.from(fallbackStore.shops.values()).find(
      (s) => s.ownerUserId === user?.uid || (s.assignedUserIds && s.assignedUserIds.includes(user?.uid || ''))
    );
    return foundShop?.id || (user?.isStoreApproved ? user?.storeId : undefined);
  }, [user]);

  // If user is not an approved store or has no shop, switch back to customer mode
  useEffect(() => {
    const isStore = Boolean(user?.isStoreApproved || user?.isStore || user?.role === 'store');
    if (user && !isStore) {
      setActiveMode('customer');
    }
  }, [user, setActiveMode]);

  const isStoreBlocked = Boolean(
    user?.isBlocked ||
    (storeId ? fallbackStore.shops.get(storeId)?.isBlocked : false)
  );
  const [showBlockedModal, setShowBlockedModal] = useState(false);

  // Track viewed shop order IDs in local state and sync with fallbackStore
  const [unviewedShopOrderIds, setUnviewedShopOrderIds] = useState<Set<string>>(new Set());
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);

  // Audio Context & Sound/Vibration alarm loop for Store
  useEffect(() => {
    if (unviewedShopOrderIds.size > 0 && !isStoreBlocked) {
      setIsAlarmPlaying(true);
    } else {
      setIsAlarmPlaying(false);
    }
  }, [unviewedShopOrderIds, isStoreBlocked]);

  useEffect(() => {
    if (!user) {
      setSelectedOrderId(null);
      setSelectedShopOrderId(null);
      setShowRequestComposer(false);
    }
  }, [user]);

  // Handle incoming order query param / notification deep-link
  useEffect(() => {
    if (initialSelectedOrderId) {
      // 1. Check direct shopOrder match or parentOrderId match
      let targetShopOrder = fallbackStore.shopOrders.get(initialSelectedOrderId);
      if (!targetShopOrder) {
        targetShopOrder = Array.from(fallbackStore.shopOrders.values()).find(
          (so) => so.parentOrderId === initialSelectedOrderId || so.id === initialSelectedOrderId
        );
      }

      if (targetShopOrder) {
        if (targetShopOrder.status === 'PENDING') {
          // New request for store: show custom new order modal alert!
          setLocalActiveTab('ORDERS');
          setStoreStatusFilter('PENDING');
          setUnviewedShopOrderIds((prev) => {
            const updated = new Set(prev);
            updated.add(targetShopOrder!.id);
            return updated;
          });
          setIsAlarmPlaying(true);
        } else {
          // Already accepted / running / completed: open details
          setLocalActiveTab('ORDERS');
          if (targetShopOrder.status === 'ACCEPTED') {
            setStoreStatusFilter('ACCEPTED');
          }
          setSelectedShopOrderId(targetShopOrder.id);
        }
      } else {
        const ord = fallbackStore.orders.get(initialSelectedOrderId);
        if (ord && ord.customerId === user?.uid) {
          setLocalActiveTab('MY_REQUESTS');
          setSelectedOrderId(ord.id);
        }
      }

      if (onClearInitialOrder) {
        onClearInitialOrder();
      }
    }
  }, [initialSelectedOrderId, onClearInitialOrder, user]);

  useEffect(() => {
    if (!isAlarmPlaying) return;

    let active = true;
    let audioCtx: AudioContext | null = null;
    let intervalId: any = null;

    const startAlarm = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
        }
      } catch (e) {
        console.warn('AudioContext init failed:', e);
      }

      const triggerAlert = () => {
        if (!active) return;

        // Vibrate: heavy pulse pattern for store
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([500, 250, 500, 250, 500]);
        }

        // Sound: store high double chime tone
        if (audioCtx) {
          try {
            if (audioCtx.state === 'suspended') {
              audioCtx.resume();
            }
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(1046.5, audioCtx.currentTime); // C6
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5

            gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.9);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);

            osc1.start();
            osc2.start();
            osc1.stop(audioCtx.currentTime + 0.9);
            osc2.stop(audioCtx.currentTime + 0.9);
          } catch (e) {
            console.warn('Oscillator failed:', e);
          }
        }
      };

      triggerAlert();
      intervalId = setInterval(triggerAlert, 1500);
    };

    startAlarm();

    const timeoutId = setTimeout(() => {
      setIsAlarmPlaying(false);
    }, 60000);

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (audioCtx) {
        audioCtx.close().catch(() => { });
      }
    };
  }, [isAlarmPlaying]);

  // Real-time Firestore listener for all shop orders for this store
  useEffect(() => {
    if (!storeId) return;
    const q = query(
      collection(db, 'shopOrders'),
      where('shopId', '==', storeId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ShopOrder[] = [];
        const unviewedSet = new Set<string>();
        snap.docs.forEach((d) => {
          const so = d.data() as ShopOrder;
          list.push(so);
          fallbackStore.shopOrders.set(so.id, so);
          if (so.status === 'PENDING' && !so.viewedByStore) {
            unviewedSet.add(so.id);
          }
        });
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setStoreShopOrders(list);
        setUnviewedShopOrderIds(unviewedSet);
      },
      (err) => console.warn('[StoreDashboard] shopOrders listener error:', err)
    );
    return () => unsub();
  }, [storeId]);

  const fetchCompletedPage = async (isFirstPage: boolean) => {
    if (!storeId || completedLoading || (!completedHasMore && !isFirstPage)) return;
    setCompletedLoading(true);
    try {
      let q = query(
        collection(db, 'shopOrders'),
        where('shopId', '==', storeId),
        orderBy('createdAt', 'desc'),
        limit(15)
      );

      if (!isFirstPage && completedLastVisible) {
        q = query(q, startAfter(completedLastVisible));
      }
      const snap = await getDocs(q);
      const newShopOrders: ShopOrder[] = [];
      const parentOrderFetchPromises: Promise<void>[] = [];
      const newParentOrders: Record<string, Order> = {};

      snap.docs.forEach((docSnap) => {
        const so = docSnap.data() as ShopOrder;

        // Fetch parent order if not cached
        if (!newParentOrders[so.parentOrderId] && !fallbackStore.orders.has(so.parentOrderId)) {
          parentOrderFetchPromises.push(
            getDoc(doc(db, 'orders', so.parentOrderId)).then((pSnap) => {
              if (pSnap.exists()) {
                newParentOrders[so.parentOrderId] = pSnap.data() as Order;
              }
            })
          );
        }
        newShopOrders.push(so);
      });

      await Promise.all(parentOrderFetchPromises);

      setCompletedParentOrders(prev => ({ ...prev, ...newParentOrders }));
      setCompletedShopOrders(prev => isFirstPage ? newShopOrders : [...prev, ...newShopOrders]);
      setCompletedLastVisible(snap.docs[snap.docs.length - 1] || null);
      setCompletedHasMore(snap.docs.length === 15);
    } catch (err) {
      console.error('Error fetching completed shop orders:', err);
    } finally {
      setCompletedLoading(false);
    }
  };

  const fetchCompletedRequestsPage = async (isFirstPage: boolean) => {
    if (completedReqLoading || (!completedReqHasMore && !isFirstPage)) return;
    setCompletedReqLoading(true);
    try {
      let q = query(
        collection(db, 'orders'),
        where('customerId', '==', user?.uid),
        where('status', 'in', ['DELIVERED', 'CANCELED']),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      if (!isFirstPage && completedReqLastVisible) {
        q = query(q, startAfter(completedReqLastVisible));
      }
      const snap = await getDocs(q);
      const newOrders = snap.docs.map(d => d.data() as Order);
      setCompletedRequests(prev => isFirstPage ? newOrders : [...prev, ...newOrders]);
      setCompletedReqLastVisible(snap.docs[snap.docs.length - 1] || null);
      setCompletedReqHasMore(snap.docs.length === 10);
    } catch (err) {
      console.error('Error fetching completed requests:', err);
    } finally {
      setCompletedReqLoading(false);
    }
  };

  // Trigger paginated fetches when tabs change
  useEffect(() => {
    if (localActiveTab === 'ORDERS') {
      fetchCompletedPage(true);
    }
  }, [localActiveTab, storeId]);

  useEffect(() => {
    if (localActiveTab === 'MY_REQUESTS') {
      fetchCompletedRequestsPage(true);
    }
  }, [localActiveTab, user?.uid]);

  // Pagination
  const PAGE_SIZE = 10;
  const storeLoaderRef = useRef<HTMLDivElement | null>(null);
  const myRequestsLoaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Skip the re-filter when a snapshot touched neither collection read here.
    const ordersChanged = createChangeGate();
    const syncOrders = () => {
      if (!user) return;
      if (!ordersChanged(versionOf(fallbackStore.orders), versionOf(fallbackStore.shopOrders))) return;
      const all = Array.from(fallbackStore.orders.values());

      // Store Orders: orders that involve this shop (via selectedShopIds)
      const shopOrders = storeId
        ? all.filter(
          (o) =>
            o.selectedShopIds?.includes(storeId) &&
            !['CANCELED'].includes(o.status)
        ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : [];

      // My Requests: orders where store user is the customer
      const myReqs = all
        .filter((o) => o.customerId === user.uid)
        .sort((a, b) => {
          const ta = new Date(a.deliveredAt || a.updatedAt || a.createdAt).getTime();
          const tb = new Date(b.deliveredAt || b.updatedAt || b.createdAt).getTime();
          return tb - ta;
        });

      setStoreOrders(shopOrders);
      setMyRequests(myReqs);

      // Helper Shop Orders placed specifically to this store (fallback if onSnapshot not triggered)
      if (storeId && fallbackStore.getShopOrdersForStore(storeId).length > 0) {
        setStoreShopOrders((prev) => prev.length > 0 ? prev : fallbackStore.getShopOrdersForStore(storeId));
      }
    };
    syncOrders();
    const unsub = fallbackStore.subscribe(syncOrders);
    return () => unsub();
  }, [user, storeId]);

  // Handle selected shop order updates
  const currentShopOrder = useMemo(() => {
    if (!selectedShopOrderId) return null;
    return storeShopOrders.find((so) => so.id === selectedShopOrderId) || completedShopOrders.find((so) => so.id === selectedShopOrderId) || null;
  }, [selectedShopOrderId, storeShopOrders, completedShopOrders]);

  // Reset inputs when selected shop order changes
  useEffect(() => {
    if (currentShopOrder) {
      if (lastLoadedShopOrderIdRef.current !== currentShopOrder.id) {
        lastLoadedShopOrderIdRef.current = currentShopOrder.id;
        setCostInput(currentShopOrder.price !== undefined && currentShopOrder.price !== null ? String(currentShopOrder.price) : '');
        setNoteInput(currentShopOrder.note || '');
        setItemPrices(parseShopOrderItems(currentShopOrder));
        setAutoSaveStatus('idle');
      }
    } else {
      lastLoadedShopOrderIdRef.current = null;
      setCostInput('');
      setNoteInput('');
      setItemPrices([]);
      setAutoSaveStatus('idle');
    }
  }, [currentShopOrder]);

  // Helpers to check parent order status
  const getParentOrder = (parentOrderId: string) => {
    return fallbackStore.orders.get(parentOrderId) || completedParentOrders[parentOrderId];
  };

  const getParentOrderStatus = (parentOrderId: string) => {
    const parent = getParentOrder(parentOrderId);
    return parent ? parent.status : undefined;
  };

  const getParentOrderHelperPhone = (parentOrderId: string) => {
    const parent = getParentOrder(parentOrderId);
    return parent ? parent.helperPhone || parent.customerPhone : '';
  };

  // Real-time listeners & direct fetch for parent orders so main order delivery/cancellation dynamically moves shop orders to finished tab
  useEffect(() => {
    const parentIds = new Set<string>();
    [...storeShopOrders, ...completedShopOrders].forEach((so) => {
      if (so.parentOrderId) {
        parentIds.add(so.parentOrderId);
      }
    });

    if (parentIds.size === 0) return;

    // Immediately fetch parent orders from Firestore to populate completedParentOrders & fallbackStore.orders
    const fetchParentOrders = async () => {
      const missing = Array.from(parentIds).filter(pId => !fallbackStore.orders.has(pId) && !completedParentOrders[pId]);
      if (missing.length === 0) return;
      const newFetched: Record<string, Order> = {};
      await Promise.all(
        missing.map(async (pId) => {
          try {
            const snap = await getDoc(doc(db, 'orders', pId));
            if (snap.exists()) {
              const ord = snap.data() as Order;
              newFetched[pId] = ord;
              fallbackStore.orders.set(pId, ord);
            }
          } catch (e) {
            console.error('[Firestore] Error fetching parent order:', pId, e);
          }
        })
      );
      if (Object.keys(newFetched).length > 0) {
        setCompletedParentOrders((prev) => ({ ...prev, ...newFetched }));
        fallbackStore.notify();
      }
    };
    fetchParentOrders();

    // Subscribe to real-time updates for all parent orders
    const unsubs: (() => void)[] = [];
    parentIds.forEach((pId) => {
      unsubs.push(
        onSnapshot(
          doc(db, 'orders', pId),
          (docSnap) => {
            if (docSnap.exists()) {
              const updatedParent = docSnap.data() as Order;
              setCompletedParentOrders((prev) => ({
                ...prev,
                [pId]: updatedParent,
              }));
              fallbackStore.orders.set(pId, updatedParent);
              fallbackStore.notify();
            }
          },
          (err) => console.warn('[Firestore] Realtime parent order sync error:', err)
        )
      );
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [storeShopOrders, completedShopOrders]);

  // Auto-sync shop order status when main order is DELIVERED or CANCELED
  useEffect(() => {
    [...storeShopOrders, ...completedShopOrders].forEach((so) => {
      const parent = getParentOrder(so.parentOrderId);
      if (parent) {
        if (parent.status === 'DELIVERED' && so.status !== 'DELIVERED' && so.status !== 'CANCELED') {
          fallbackStore.updateShopOrder(so.id, (prev) => ({
            ...prev,
            status: 'DELIVERED',
            statusHistory: [
              ...prev.statusHistory,
              {
                status: 'DELIVERED',
                timestamp: new Date().toISOString(),
                actor: 'System',
                note: 'Main order delivered.',
              },
            ],
          }), 'store');
        } else if (parent.status === 'CANCELED' && so.status !== 'CANCELED') {
          fallbackStore.updateShopOrder(so.id, (prev) => ({
            ...prev,
            status: 'CANCELED',
            statusHistory: [
              ...prev.statusHistory,
              {
                status: 'CANCELED',
                timestamp: new Date().toISOString(),
                actor: 'System',
                note: 'Main order canceled.',
              },
            ],
          }), 'store');
        }
      }
    });
  }, [storeShopOrders, completedShopOrders, completedParentOrders]);

  // Combine and deduplicate storeShopOrders and completedShopOrders
  const allAvailableShopOrders = useMemo(() => {
    const map = new Map<string, ShopOrder>();
    storeShopOrders.forEach((so) => map.set(so.id, so));
    completedShopOrders.forEach((so) => map.set(so.id, so));
    return Array.from(map.values());
  }, [storeShopOrders, completedShopOrders]);

  // Apply filters: Status, Date, Sort directly over all available shop orders
  const filteredShopOrders = useMemo(() => {
    let result = [...allAvailableShopOrders];

    // Status Filter
    if (storeStatusFilter !== 'ALL') {
      result = result.filter((so) => {
        const parentStatus = getParentOrderStatus(so.parentOrderId);
        const isCanceled = so.status === 'CANCELED' || parentStatus === 'CANCELED';
        const isDelivered = parentStatus === 'DELIVERED' || so.status === 'DELIVERED';
        const isActive = !isCanceled && !isDelivered;

        if (storeStatusFilter === 'ACTIVE') return isActive;
        if (storeStatusFilter === 'PENDING') return so.status === 'PENDING' && isActive;
        if (storeStatusFilter === 'ACCEPTED') return so.status === 'ACCEPTED' && isActive;
        if (storeStatusFilter === 'DELIVERED') return isDelivered;
        if (storeStatusFilter === 'CANCELED') return isCanceled;
        return so.status === storeStatusFilter;
      });
    }

    // Date Filter
    if (storeDateFilter !== 'ALL') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      result = result.filter((so) => {
        const orderTime = new Date(so.createdAt).getTime();
        if (storeDateFilter === 'TODAY') {
          return orderTime >= startOfDay;
        }
        if (storeDateFilter === 'LAST_7_DAYS') {
          const sevenDaysAgo = startOfDay - 7 * 24 * 60 * 60 * 1000;
          return orderTime >= sevenDaysAgo;
        }
        if (storeDateFilter === 'THIS_MONTH') {
          const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          return orderTime >= firstOfMonth;
        }
        return true;
      });
    }

    // Sort Order (Default: Active & Recent orders first)
    result.sort((a, b) => {
      const parentStatusA = getParentOrderStatus(a.parentOrderId);
      const parentStatusB = getParentOrderStatus(b.parentOrderId);
      const isFinishedA = a.status === 'CANCELED' || parentStatusA === 'CANCELED' || parentStatusA === 'DELIVERED' || a.status === 'DELIVERED';
      const isFinishedB = b.status === 'CANCELED' || parentStatusB === 'CANCELED' || parentStatusB === 'DELIVERED' || b.status === 'DELIVERED';

      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();

      if (storeSortOrder === 'OLDEST') {
        return timeA - timeB;
      }
      if (storeSortOrder === 'NEWEST') {
        return timeB - timeA;
      }

      // Default: ACTIVE_FIRST (Active orders first, with PENDING prioritized, then newest date)
      if (!isFinishedA && isFinishedB) return -1;
      if (isFinishedA && !isFinishedB) return 1;

      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;

      return timeB - timeA;
    });

    return result;
  }, [allAvailableShopOrders, storeStatusFilter, storeDateFilter, storeSortOrder, completedParentOrders]);

  const filteredMyRequests = useMemo(() => {
    let result = [...myRequests, ...completedRequests];
    const seen = new Set<string>();
    result = result.filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });

    // Status Filter
    if (myReqStatusFilter !== 'ALL') {
      result = result.filter((o) => o.status === myReqStatusFilter);
    }

    // Date Filter
    if (myReqDateFilter !== 'ALL') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      result = result.filter((o) => {
        const orderTime = new Date(o.createdAt).getTime();
        if (myReqDateFilter === 'TODAY') {
          return orderTime >= startOfDay;
        }
        if (myReqDateFilter === 'LAST_7_DAYS') {
          const sevenDaysAgo = startOfDay - 7 * 24 * 60 * 60 * 1000;
          return orderTime >= sevenDaysAgo;
        }
        if (myReqDateFilter === 'THIS_MONTH') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          return orderTime >= startOfMonth;
        }
        return true;
      });
    }

    // Sort Order
    result.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return myReqSortOrder === 'NEWEST' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [myRequests, completedRequests, myReqStatusFilter, myReqDateFilter, myReqSortOrder]);

  const handleConfirmStoreOrder = async (soId: string) => {
    if (isStoreBlocked) {
      setShowBlockedModal(true);
      return;
    }
    const targetSo = storeShopOrders.find((so) => so.id === soId) || completedShopOrders.find((so) => so.id === soId);
    const confirmed = await showConfirm(
      'অর্ডার নিশ্চিতকরণ (Confirm Order)',
      `আপনি কি এই অর্ডারটি গ্রহণ ও নিশ্চিত (Yes) করতে চান? মোট মূল্য: ৳${targetSo?.price || 0}`,
      'হ্যাঁ (Yes)',
      'বাতিল'
    );
    if (!confirmed) return;

    fallbackStore.markShopOrderViewed(soId);
    await fallbackStore.updateShopOrder(soId, (prev) => ({
      ...prev,
      status: 'ACCEPTED',
      statusHistory: [
        ...prev.statusHistory,
        {
          status: 'ACCEPTED',
          timestamp: new Date().toISOString(),
          actor: user?.displayName || 'Store',
          note: 'Store confirmed the order.',
        },
      ],
    }), 'store');
  };

  const handleCancelOrderClick = (soId: string) => {
    if (isStoreBlocked) {
      setShowBlockedModal(true);
      return;
    }
    setCancelTargetId(soId);
    setStoreCancelReason('');
    setStoreCancelError('');
    setShowStoreCancelModal(true);
  };

  const handleConfirmStoreCancel = async () => {
    if (!storeCancelReason.trim()) {
      setStoreCancelError('বাতিল করার কারণ অনুগ্রহ করে উল্লেখ করুন।');
      return;
    }
    if (cancelTargetId) {
      fallbackStore.markShopOrderViewed(cancelTargetId);
      await fallbackStore.updateShopOrder(cancelTargetId, (prev) => ({
        ...prev,
        status: 'CANCELED',
        note: storeCancelReason.trim(),
        statusHistory: [
          ...prev.statusHistory,
          {
            status: 'CANCELED',
            timestamp: new Date().toISOString(),
            actor: user?.displayName || 'Store',
            note: storeCancelReason.trim(),
          },
        ],
      }), 'store');
    }
    setShowStoreCancelModal(false);
    setSelectedShopOrderId(null);
  };

  // Wallet routing intercept (Moved here after all Hooks to satisfy rules of hooks)
  if (parentActiveTab === 'wallet') {
    return <StoreWallet />;
  }

  if (selectedOrderId) {
    return (
      <OrderDetailsView
        orderId={selectedOrderId}
        onBack={() => setSelectedOrderId(null)}
      />
    );
  }

  const renderMainContent = () => {
    if (showRequestComposer) {
      return (
        <div className="space-y-4 pb-24">
          <button
            onClick={() => setShowRequestComposer(false)}
            className="flex items-center space-x-2 text-sm font-bold text-emerald-600 hover:text-emerald-900 transition-colors"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>ড্যাশবোর্ডে ফিরুন</span>
          </button>
          <RequestComposer
            onOrderCreated={(newOrder) => {
              setSelectedOrderId(newOrder.id);
              setShowRequestComposer(false);
            }}
          />
        </div>
      );
    }

    return (
      <div className="space-y-5 pb-24 animate-in fade-in duration-200">
        {/* ── Blocked Store Alert Banner ── */}
        {isStoreBlocked && (
          <div className="bg-red-50 border-2 border-red-300 rounded-3xl p-4 shadow-sm flex items-center justify-between gap-3 animate-in fade-in duration-300">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-red-100 text-red-600 shrink-0">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="font-extrabold text-xs text-red-900">
                  দোকান সাময়িকভাবে স্থগিত (Store Blocked)
                </h4>
                <p className="text-[11px] text-red-700 font-medium leading-relaxed">
                  আপনার স্টোর অ্যাকাউন্টটি অ্যাডমিন কর্তৃক স্থগিত করা হয়েছে। নতুন অর্ডার গ্রহণ বা রিকোয়েস্ট তৈরি সাময়িকভাবে বন্ধ আছে।
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowBlockedModal(true)}
              className="px-3.5 py-2 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-extrabold shadow-sm transition-all shrink-0"
            >
              বিস্তারিত
            </button>
          </div>
        )}

        {/* ─── Tab Bar in Emerald Green ──────────────────────────────────────────────────────── */}
        <div className="flex space-x-1.5 bg-gray-100 p-1.5 rounded-2xl">
          <button
            onClick={() => { setLocalActiveTab('ORDERS'); }}
            className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${localActiveTab === 'ORDERS'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Incoming Orders{storeShopOrders.length > 0 && ` (${storeShopOrders.length})`}</span>
          </button>

          <button
            onClick={() => { setLocalActiveTab('MY_REQUESTS'); setMyRequestsVisibleCount(PAGE_SIZE); }}
            className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${localActiveTab === 'MY_REQUESTS'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>My Requests{myRequests.length > 0 && ` (${myRequests.length})`}</span>
          </button>
        </div>

        {/* ─── Running Orders Reminder Alert ─────────────────────────────────────────── */}
        {(() => {
          const runningCount = storeShopOrders.filter((so) => {
            const parentStatus = getParentOrderStatus(so.parentOrderId);
            const isCanceled = so.status === 'CANCELED' || parentStatus === 'CANCELED';
            const isDelivered = parentStatus === 'DELIVERED' || so.status === 'DELIVERED';
            const isFinished = isDelivered || isCanceled;
            return so.status === 'ACCEPTED' && !isFinished;
          }).length;
          if (runningCount === 0) return null;
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 shadow-sm flex items-center justify-between animate-in fade-in duration-300">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="relative flex h-3 w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-xs text-amber-900">
                    {runningCount} order{runningCount > 1 ? 's' : ''} currently running!
                  </h4>
                  <p className="text-[10px] text-amber-700 font-medium">
                    অর্ডারটি প্রস্তুত রাখুন, হেলপার ডেলিভারি সম্পন্ন করলে ওয়ালেটে যোগ হবে।
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setLocalActiveTab('ORDERS'); setStoreStatusFilter('ACCEPTED'); }}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-extrabold shadow-sm transition-all active:scale-95 shrink-0 ml-2"
              >
                দেখুন
              </button>
            </div>
          );
        })()}

        {/* ─── INCOMING ORDERS TAB ───────────────────────────────────────────────────── */}
        {localActiveTab === 'ORDERS' && (
          <div className="space-y-3">
            {/* Filters Bar (Guaranteed Single Line) */}
            <div className="bg-white p-2 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-3 gap-1.5 text-xs">
              {/* Status Filter */}
              <div className="flex items-center space-x-1 bg-gray-50 px-2 py-1.5 rounded-xl border border-gray-200/80 min-w-0">
                <Filter className="w-3 h-3 text-emerald-600 shrink-0" />
                <select
                  value={storeStatusFilter}
                  onChange={(e) => setStoreStatusFilter(e.target.value)}
                  className="bg-transparent font-bold text-gray-700 outline-none text-[11px] w-full truncate cursor-pointer"
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PENDING">Pending</option>
                  <option value="ACCEPTED">Confirmed</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="CANCELED">Canceled</option>
                </select>
              </div>

              {/* Date Filter */}
              <div className="flex items-center space-x-1 bg-gray-50 px-2 py-1.5 rounded-xl border border-gray-200/80 min-w-0">
                <Calendar className="w-3 h-3 text-emerald-600 shrink-0" />
                <select
                  value={storeDateFilter}
                  onChange={(e) => setStoreDateFilter(e.target.value as any)}
                  className="bg-transparent font-bold text-gray-700 outline-none text-[11px] w-full truncate cursor-pointer"
                >
                  <option value="ALL">All Time</option>
                  <option value="TODAY">Today</option>
                  <option value="LAST_7_DAYS">Last 7 Days</option>
                  <option value="THIS_MONTH">This Month</option>
                </select>
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center space-x-1 bg-gray-50 px-2 py-1.5 rounded-xl border border-gray-200/80 min-w-0">
                <ArrowUpDown className="w-3 h-3 text-emerald-600 shrink-0" />
                <select
                  value={storeSortOrder}
                  onChange={(e) => setStoreSortOrder(e.target.value as any)}
                  className="bg-transparent font-bold text-gray-700 outline-none text-[11px] w-full truncate cursor-pointer"
                >
                  <option value="ACTIVE_FIRST">Active First</option>
                  <option value="NEWEST">Newest</option>
                  <option value="OLDEST">Oldest</option>
                </select>
              </div>
            </div>

            {/* List display */}
            <div className="space-y-3">
              {filteredShopOrders.length === 0 ? (
                <div className="py-12 bg-white rounded-2xl border border-gray-100 text-center p-5 shadow-soft">
                  <Package className="w-9 h-9 text-gray-300 mx-auto mb-2" />
                  <h4 className="font-bold text-gray-900 text-xs mb-0.5">No orders found</h4>
                  <p className="text-[11px] text-gray-500 font-medium">No incoming orders match your filter criteria.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredShopOrders.slice(0, storeVisibleCount).map((so) => {
                    const parentStatus = getParentOrderStatus(so.parentOrderId);
                    const isCanceled = so.status === 'CANCELED' || parentStatus === 'CANCELED';
                    const isDelivered = parentStatus === 'DELIVERED' || so.status === 'DELIVERED';
                    const isActive = !isCanceled && !isDelivered;
                    const { itemsText, helperNote } = extractShopOrderNoteAndItems(so);
                    const parsedItems = parseShopOrderItems(so);
                    const helperPhone = getParentOrderHelperPhone(so.parentOrderId);

                    // Card color coding: Active (soft greenish), Finished (gray), Canceled (red)
                    let cardContainerStyle = 'bg-emerald-50/40 border-emerald-200/90 shadow-xs';
                    if (isDelivered) {
                      cardContainerStyle = 'bg-gray-50/70 border-gray-200 shadow-xs';
                    } else if (isCanceled) {
                      cardContainerStyle = 'bg-rose-50/50 border-rose-200 shadow-xs';
                    }

                    return (
                      <div
                        key={so.id}
                        className={`rounded-2xl border p-3.5 sm:p-4 space-y-3 transition-all ${cardContainerStyle}`}
                      >
                        {/* Header: ID | Time | Timer | Status Badge */}
                        <div className="flex items-center justify-between gap-2 border-b border-black/5 pb-2.5">
                          <div className="flex items-center space-x-2 flex-wrap text-xs">
                            <span className="font-mono text-emerald-900 font-extrabold">
                              #{so.parentOrderId.slice(-6).toUpperCase()}
                            </span>
                            <span className="text-gray-300 font-bold">•</span>
                            <span className="text-[11px] font-semibold text-gray-500">
                              {formatOrderDateTime(so.createdAt)}
                            </span>
                            {isActive && (
                              <>
                                <span className="text-gray-300 font-bold">•</span>
                                <OrderTimer createdAt={so.createdAt} className="text-rose-600 text-[11px] font-black" hideIcon />
                              </>
                            )}
                          </div>
                          <div className="shrink-0">
                            {isCanceled ? (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                                Canceled
                              </span>
                            ) : isDelivered ? (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 border border-gray-300">
                                Delivered
                              </span>
                            ) : so.status === 'ACCEPTED' ? (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Confirmed
                              </span>
                            ) : (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                                Pending Action
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Minimalist Items Box */}
                        <div className="bg-white/90 rounded-xl p-2.5 border border-black/5 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-extrabold text-gray-500 pb-1 border-b border-gray-100">
                            <span>ITEMS</span>
                            {(() => {
                              const shopForCard = fallbackStore.shops.get(so.shopId);
                              const commPct = shopForCard?.commissionPercent;
                              const total = so.price || 0;
                              if (commPct && commPct > 0 && total > 0) {
                                const commAmt = Math.round(total * (commPct / 100));
                                const payable = Math.max(0, total - commAmt);
                                return (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-gray-400 line-through font-semibold">৳{total}</span>
                                    <span className="text-emerald-700 font-black">৳{payable}</span>
                                    <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">-{commPct}%</span>
                                  </div>
                                );
                              }
                              return <span className="text-emerald-700 font-bold">Total: ৳{total}</span>;
                            })()}
                          </div>

                          {parsedItems.length > 0 ? (
                            <div className="space-y-1">
                              {parsedItems.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                                  <div className="flex items-center space-x-1.5 min-w-0 pr-2">
                                    <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
                                    <span className="font-bold text-gray-800 break-words">{item.name}</span>
                                    {item.unit && <span className="text-[10px] text-gray-400 font-medium">({item.unit})</span>}
                                  </div>
                                  {item.price && (
                                    <span className="font-extrabold font-mono text-gray-900 text-xs shrink-0">
                                      ৳{item.price}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-800 font-medium whitespace-pre-wrap py-0.5">
                              {itemsText || so.requestText}
                            </p>
                          )}
                        </div>

                        {/* Helper's Note (if any) */}
                        {helperNote && (
                          <div className="p-2 rounded-xl bg-amber-50/90 border border-amber-200/80 text-xs text-amber-950 font-medium flex items-start gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <p className="leading-snug break-words">
                              <span className="font-extrabold text-amber-900">Note: </span>
                              {helperNote}
                            </p>
                          </div>
                        )}

                        {/* Helper Contact Bar */}
                        <div className="flex items-center justify-between bg-white/70 px-3 py-2 rounded-xl border border-black/5 gap-2">
                          <div className="flex items-center space-x-2 min-w-0">
                            <div className="w-6 h-6 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-extrabold text-[10px] shrink-0">
                              {so.helperName ? so.helperName.charAt(0).toUpperCase() : 'H'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-900 truncate">{so.helperName || 'Helper'}</p>
                            </div>
                          </div>
                          {helperPhone && (
                            <div className="flex items-center space-x-1.5 shrink-0">
                              <a
                                href={`tel:${helperPhone}`}
                                className="py-1 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[11px] flex items-center space-x-1 transition-all"
                              >
                                <Phone className="w-3 h-3 text-gray-600" />
                                <span>Call</span>
                              </a>
                              <a
                                href={`https://wa.me/880${helperPhone.replace(/^0/, '').replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="py-1 px-2.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-[11px] flex items-center space-x-1 transition-all shadow-xs"
                              >
                                <MessageSquare className="w-3 h-3 text-white" />
                                <span>WhatsApp</span>
                              </a>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        {so.status === 'PENDING' && !isCanceled && !isDelivered ? (
                          <div className="flex space-x-2 pt-1">
                            <button
                              onClick={() => handleConfirmStoreOrder(so.id)}
                              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition-all active:scale-95 text-center flex items-center justify-center space-x-1.5"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Accept (হ্যাঁ)</span>
                            </button>
                            <button
                              onClick={() => handleCancelOrderClick(so.id)}
                              className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all active:scale-95 text-center flex items-center justify-center space-x-1.5"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Decline (না)</span>
                            </button>
                          </div>
                        ) : so.status === 'ACCEPTED' && !isCanceled && !isDelivered ? (
                          <div className="flex items-center justify-between px-3 py-2 bg-emerald-100/50 rounded-xl border border-emerald-200/80">
                            <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-900">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Order Confirmed</span>
                            </div>
                            <button
                              onClick={() => handleCancelOrderClick(so.id)}
                              className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                            >
                              Cancel Order
                            </button>
                          </div>
                        ) : isCanceled && so.note ? (
                          <div className="py-1.5 px-3 bg-rose-100/70 rounded-xl border border-rose-200 text-center">
                            <p className="text-[11px] font-bold text-rose-800">
                              Cancel Note: {so.note}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {(filteredShopOrders.length > storeVisibleCount || completedHasMore) && (
                    <button
                      onClick={async () => {
                        if (completedHasMore) {
                          await fetchCompletedPage(false);
                        }
                        setStoreVisibleCount((prev) => prev + PAGE_SIZE);
                      }}
                      disabled={completedLoading}
                      className="w-full py-3 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 font-extrabold text-xs rounded-2xl transition-all text-center mt-2 shadow-xs disabled:opacity-50"
                    >
                      {completedLoading ? 'লোড হচ্ছে...' : 'আরও দেখুন (Load More)'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── MY REQUESTS TAB ──────────────────────────────────────────────── */}
        {localActiveTab === 'MY_REQUESTS' && (
          <div className="space-y-3">
            {/* Create Request Button inside My Request Tab */}
            <button
              onClick={() => setShowRequestComposer(true)}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border-2 border-dashed border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all group shadow-sm mb-1"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-emerald-100 group-hover:bg-emerald-200 transition-all">
                  <PlusCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-extrabold text-gray-900">Create Request</p>
                  <p className="text-[11px] text-gray-500">কাস্টমারের মতো রিকুয়েস্ট করুন</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* My Requests Filters Bar */}
            <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap gap-2 items-center justify-between text-xs mb-3">
              <div className="flex flex-wrap gap-1.5">
                {/* Date Filter */}
                <div className="flex items-center space-x-1 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200">
                  <Calendar className="w-3 h-3 text-emerald-600" />
                  <select
                    value={myReqDateFilter}
                    onChange={(e) => setMyReqDateFilter(e.target.value as any)}
                    className="bg-transparent font-bold text-gray-700 outline-none text-[11px]"
                  >
                    <option value="ALL">All Time</option>
                    <option value="TODAY">Today</option>
                    <option value="LAST_7_DAYS">Last 7 Days</option>
                    <option value="THIS_MONTH">This Month</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center space-x-1 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200">
                  <Filter className="w-3 h-3 text-emerald-600" />
                  <select
                    value={myReqStatusFilter}
                    onChange={(e) => setMyReqStatusFilter(e.target.value)}
                    className="bg-transparent font-bold text-gray-700 outline-none text-[11px]"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="ON_THE_WAY">On The Way</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="CANCELED">Canceled</option>
                  </select>
                </div>
              </div>

              {/* Sort Toggle */}
              <button
                onClick={() => setMyReqSortOrder(prev => prev === 'NEWEST' ? 'OLDEST' : 'NEWEST')}
                className="flex items-center space-x-1 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200 font-bold text-gray-700"
              >
                <ArrowUpDown className="w-3 h-3 text-emerald-600" />
                <span>{myReqSortOrder === 'NEWEST' ? 'Newest' : 'Oldest'}</span>
              </button>
            </div>

            {filteredMyRequests.length === 0 ? (
              <div className="py-14 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
                <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h4 className="font-bold text-gray-900 text-sm mb-1">কোনো রিকুয়েস্ট নেই</h4>
                <p className="text-xs text-gray-500 mb-4">উপরের "Create Request" বাটনে ক্লিক করে রিকুয়েস্ট করুন।</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMyRequests.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onClick={() => setSelectedOrderId(order.id)}
                    customerView
                  />
                ))}

                {completedReqHasMore && (
                  <button
                    onClick={() => fetchCompletedRequestsPage(false)}
                    disabled={completedReqLoading}
                    className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs rounded-2xl transition-all text-center mt-3 disabled:opacity-50"
                  >
                    {completedReqLoading ? 'Loading...' : 'Load More'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {renderMainContent()}

      {/* ── Store Cancel/Rejection Custom Confirmation Modal ── */}
      {showStoreCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-red-100 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="font-black text-base text-gray-900 font-sans">অর্ডার বাতিল / প্রত্যাখ্যান করুন</h3>
                <p className="text-[11px] text-gray-500 font-semibold mt-0.5">অর্ডারটি বাতিলের সঠিক কারণ উল্লেখ করুন</p>
              </div>
              <button
                onClick={() => setShowStoreCancelModal(false)}
                className="p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="p-3.5 rounded-2xl bg-red-50 border border-red-100 flex items-start space-x-2.5">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-800 font-semibold leading-relaxed">
                  এই দোকান অর্ডারটি বাতিল করলে সংশ্লিষ্ট হেলপারকে তাৎক্ষণিকভাবে নোটিফিকেশন পাঠানো হবে।
                </p>
              </div>
              <div>
                <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider block mb-2">বাতিলের কারণ *</label>
                <textarea
                  value={storeCancelReason}
                  onChange={(e) => {
                    setStoreCancelReason(e.target.value);
                    if (e.target.value.trim()) setStoreCancelError('');
                  }}
                  placeholder="যেমন: পণ্য স্টকে নেই, দোকান সাময়িকভাবে বন্ধ, ভুল অর্ডার এসেছে ইত্যাদি..."
                  className="w-full px-3.5 py-3.5 rounded-2xl border border-gray-200 text-xs font-semibold text-gray-900 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10 resize-none h-28"
                  required
                />
              </div>
              {storeCancelError && (
                <p className="text-[11px] text-red-600 font-bold bg-red-50 px-3 py-2 rounded-xl border border-red-100">
                  {storeCancelError}
                </p>
              )}
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-gray-100 shrink-0 flex space-x-2">
              <button
                type="button"
                onClick={() => setShowStoreCancelModal(false)}
                className="flex-1 py-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs transition-all"
              >
                ফিরে যান
              </button>
              <button
                type="button"
                onClick={handleConfirmStoreCancel}
                className="flex-1 py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-md shadow-red-600/25 transition-all"
              >
                নিশ্চিত করুন
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── Store New Order Alert Fullscreen Overlay with Carousel ── */}
      {isAlarmPlaying && unviewedShopOrderIds.size > 0 && (
        <StoreNewOrderAlertOverlay
          unviewedShopOrderIds={unviewedShopOrderIds}
          onAccept={async (soId) => {
            fallbackStore.markShopOrderViewed(soId);
            await fallbackStore.updateShopOrder(soId, (prev) => ({
              ...prev,
              status: 'ACCEPTED',
              statusHistory: [
                ...prev.statusHistory,
                {
                  status: 'ACCEPTED',
                  timestamp: new Date().toISOString(),
                  actor: user?.displayName || 'Store',
                  note: 'Store confirmed the order.',
                },
              ],
            }), 'store');

            setUnviewedShopOrderIds((prev) => {
              const updated = new Set(prev);
              updated.delete(soId);
              return updated;
            });
            if (unviewedShopOrderIds.size <= 1) setIsAlarmPlaying(false);
          }}
          onCancel={(soId) => {
            handleCancelOrderClick(soId);
            fallbackStore.markShopOrderViewed(soId);
            setUnviewedShopOrderIds((prev) => {
              const updated = new Set(prev);
              updated.delete(soId);
              return updated;
            });
            if (unviewedShopOrderIds.size <= 1) setIsAlarmPlaying(false);
          }}
          onDismissAll={() => {
            setIsAlarmPlaying(false);
          }}
        />
      )}

      {/* Blocked User / Store Modal */}
      {showBlockedModal && (
        <BlockedUserModal
          onClose={() => setShowBlockedModal(false)}
          targetRole="store"
        />
      )}
    </>
  );
};

interface StoreNewOrderAlertOverlayProps {
  unviewedShopOrderIds: Set<string>;
  onAccept: (soId: string) => Promise<void>;
  onCancel: (soId: string) => void;
  onDismissAll: () => void;
}

const StoreNewOrderAlertOverlay: React.FC<StoreNewOrderAlertOverlayProps> = ({
  unviewedShopOrderIds,
  onAccept,
  onCancel,
  onDismissAll,
}) => {
  const { showConfirm } = useModal();
  const shopOrderIdList = Array.from(unviewedShopOrderIds);
  const [currentIdx, setCurrentIdx] = useState(shopOrderIdList.length - 1);
  const [processing, setProcessing] = useState(false);

  const safeIdx = Math.min(currentIdx, shopOrderIdList.length - 1);
  const soId = shopOrderIdList[safeIdx];
  const shopOrder = soId ? fallbackStore.shopOrders.get(soId) : null;
  const parentOrder = shopOrder ? fallbackStore.orders.get(shopOrder.parentOrderId) : null;

  const goNext = () => setCurrentIdx((i) => Math.min(i + 1, shopOrderIdList.length - 1));
  const goPrev = () => setCurrentIdx((i) => Math.max(i - 1, 0));

  const handleAcceptClick = async () => {
    if (!shopOrder || processing) return;
    const confirmed = await showConfirm(
      'অর্ডার নিশ্চিতকরণ (Confirm Order)',
      `আপনি কি এই অর্ডারটি গ্রহণ ও নিশ্চিত (Yes) করতে চান? মোট মূল্য: ৳${shopOrder.price || 0}`,
      'হ্যাঁ (Yes)',
      'বাতিল'
    );
    if (!confirmed) return;
    setProcessing(true);
    await onAccept(shopOrder.id);
    setProcessing(false);
  };

  const handleCancelClick = () => {
    if (!shopOrder || processing) return;
    onCancel(shopOrder.id);
  };

  if (!shopOrder) return null;

  const helperPhone = parentOrder?.helperPhone || parentOrder?.customerPhone || '';
  const parsedItems = parseShopOrderItems(shopOrder);

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      className="z-[9999] bg-red-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-300"
    >
      {/* Pulsing glow background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-red-500/20 animate-ping" />
      </div>

      {/* Top Header */}
      <div className="w-full max-w-sm flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-red-500/30 rounded-full flex items-center justify-center animate-bounce">
            <Bell className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-black text-sm">🚨 নতুন অর্ডার এসেছে!</span>
        </div>
        <button
          onClick={onDismissAll}
          className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-all"
        >
          <X className="w-3.5 h-3.5" />
          <span>মিউট</span>
        </button>
      </div>

      <div className="relative w-full max-w-sm flex items-center justify-center z-10">
        {/* Left Navigation Arrow */}
        {shopOrderIdList.length > 1 && (
          <button
            onClick={goPrev}
            disabled={safeIdx === 0}
            className="absolute -left-6 md:-left-16 z-20 w-11 h-11 rounded-full bg-white hover:bg-red-50 text-red-600 shadow-2xl border border-red-200 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-all hover:scale-110 active:scale-95 shrink-0"
          >
            <ArrowLeft className="w-6 h-6 stroke-[3px]" />
          </button>
        )}

        {/* Card */}
        <div className="w-full bg-white rounded-3xl shadow-2xl border-2 border-red-400 relative overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="h-1.5 bg-gradient-to-r from-red-500 via-orange-400 to-red-500 animate-pulse" />

          {shopOrderIdList.length > 1 && (
            <div className="absolute top-3 right-3 bg-red-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-md">
              {safeIdx + 1} / {shopOrderIdList.length}
            </div>
          )}

          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="bg-slate-900 text-white font-black font-mono text-[10px] px-2.5 py-0.5 rounded-md shadow-xs">
                #{shopOrder.parentOrderId.slice(-6).toUpperCase()}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black">
                {shopOrder.status}
              </span>
            </div>

            {/* Request text & Helper note */}
            {(() => {
              const { itemsText, helperNote } = extractShopOrderNoteAndItems(shopOrder);
              return (
                <div className="space-y-2">
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3.5 space-y-2">
                    <p className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wide">অর্ডার আইটেম ও মূল্য</p>
                    {parsedItems.length > 0 ? (
                      <div className="divide-y divide-gray-100">
                        {parsedItems.map((it, idx) => (
                          <div key={idx} className="py-1.5 flex items-center justify-between text-xs">
                            <span className="font-extrabold text-gray-800">{it.name}</span>
                            {it.price ? (
                              <span className="font-mono font-bold text-emerald-700">৳{it.price}</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-900 font-bold leading-relaxed whitespace-pre-wrap">
                        {itemsText || shopOrder.requestText}
                      </p>
                    )}

                    {/* Total Cost & Commission Summary */}
                    {(() => {
                      const shopForDetail = fallbackStore.shops.get(shopOrder.shopId);
                      const commPct = shopForDetail?.commissionPercent;
                      const total = shopOrder.price || 0;
                      const hasComm = commPct && commPct > 0 && total > 0;
                      const commAmt = hasComm ? Math.round(total * (commPct! / 100)) : 0;
                      const payable = hasComm ? Math.max(0, total - commAmt) : total;
                      return (
                        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-gray-50 to-emerald-50 overflow-hidden">
                          <div className="px-3 pt-2.5 pb-1.5 space-y-1">
                            <div className="flex items-center justify-between text-xs font-bold text-gray-600">
                              <span>মোট পণ্যের মূল্য (Total Cost)</span>
                              <span className="font-mono text-gray-900">৳{total}</span>
                            </div>
                            {hasComm && (
                              <div className="flex items-center justify-between text-xs font-bold text-rose-600">
                                <span>কমিশন ({commPct}%)</span>
                                <span className="font-mono">− ৳{commAmt}</span>
                              </div>
                            )}
                          </div>
                          <div className="mx-2 mb-2 bg-emerald-600 rounded-xl px-3 py-2 flex items-center justify-between shadow-sm">
                            <span className="text-[10px] font-black text-emerald-100 uppercase tracking-wider">পরিশোধযোগ্য</span>
                            <span className="font-mono font-black text-base text-white">৳{payable}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {helperNote && (
                    <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3">
                      <p className="text-[10px] text-amber-800 font-bold uppercase tracking-wide mb-0.5">হেলপারের বিশেষ নোট (Helper's Note)</p>
                      <p className="text-xs text-amber-950 font-bold leading-relaxed whitespace-pre-wrap">
                        {helperNote}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Helper Info with Phone Number */}
            <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-2xl border border-gray-100">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-base shadow-sm shrink-0">
                {shopOrder.helperName ? shopOrder.helperName.charAt(0).toUpperCase() : 'H'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-wide">Helper Details</p>
                <p className="text-xs font-black text-gray-900 truncate">{shopOrder.helperName}</p>
                {helperPhone && (
                  <div className="flex items-center space-x-2 mt-1">
                    <a
                      href={`tel:${helperPhone}`}
                      className="text-xs font-bold text-emerald-700 flex items-center space-x-1 hover:underline"
                    >
                      <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span>{helperPhone}</span>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Timing */}
            <div className="flex items-center justify-between text-xs text-gray-500 font-semibold px-1">
              <span>অনুরোধের সময়:</span>
              <OrderTimer createdAt={shopOrder.createdAt} className="text-red-600 font-black text-xs" />
            </div>
          </div>

          {/* Slide navigation indicators */}
          {shopOrderIdList.length > 1 && (
            <div className="px-5 pb-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={goPrev}
                  disabled={safeIdx === 0}
                  className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-all"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-700" />
                </button>
                <div className="flex items-center space-x-1.5">
                  {shopOrderIdList.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentIdx(i)}
                      className={`rounded-full transition-all ${i === safeIdx
                        ? 'w-5 h-2 bg-red-500'
                        : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
                        }`}
                    />
                  ))}
                </div>
                <button
                  onClick={goNext}
                  disabled={safeIdx === shopOrderIdList.length - 1}
                  className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-all"
                >
                  <ArrowRight className="w-4 h-4 text-gray-700" />
                </button>
              </div>
              <p className="text-center text-[10px] text-gray-400 font-medium mt-1">
                স্লাইড করে অন্যান্য দোকান অর্ডার দেখুন
              </p>
            </div>
          )}

          {/* Action buttons (Two Buttons: Yes & No with confirmation) */}
          <div className="px-5 pb-5 pt-2">
            <div className="flex space-x-2 w-full">
              <button
                onClick={handleAcceptClick}
                disabled={processing}
                className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-60 text-center flex items-center justify-center space-x-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{processing ? 'Processing...' : 'Yes (হ্যাঁ)'}</span>
              </button>
              <button
                onClick={handleCancelClick}
                disabled={processing}
                className="flex-1 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl font-extrabold text-xs transition-all active:scale-[0.98] text-center flex items-center justify-center space-x-1.5"
              >
                <X className="w-4 h-4" />
                <span>No (না)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Navigation Arrow */}
        {shopOrderIdList.length > 1 && (
          <button
            onClick={goNext}
            disabled={safeIdx === shopOrderIdList.length - 1}
            className="absolute -right-6 md:-right-16 z-20 w-11 h-11 rounded-full bg-white hover:bg-red-50 text-red-600 shadow-2xl border border-red-200 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-all hover:scale-110 active:scale-95 shrink-0"
          >
            <ArrowRight className="w-6 h-6 stroke-[3px]" />
          </button>
        )}
      </div>

      <p className="mt-4 text-white/70 text-[11px] font-medium text-center relative z-10">
        {shopOrderIdList.length > 1
          ? `${shopOrderIdList.length}টি দোকান অর্ডার আপনার অনুমোদনের অপেক্ষায়`
          : 'কাস্টমার/হেলপারের রিকুয়েস্ট চেক করে নিশ্চিত করুন'}
      </p>
    </div>
  );
};

