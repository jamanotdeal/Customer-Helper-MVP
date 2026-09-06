'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Order } from '@/types';
import { fallbackStore, db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, startAfter, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { RequestComposer } from './RequestComposer';
import { OrderCard } from './OrderCard';
import { OrderSuccessPwaModal } from './PWAInstallModal';
import { StoreWallet } from './StoreWallet';
import {
  Store, PlusCircle, Package, ShoppingBag,
  AlertCircle, CheckCircle, ArrowRight, ArrowLeft, ShieldAlert, Check, X, Edit3, Calendar, Filter, Clock, Phone, AlertTriangle, ArrowUpDown, MessageSquare, CheckCircle2, Bell
} from 'lucide-react';
import { ShopOrder, ShopOrderStatus } from '@/types';
import { OrderDetailsView } from './OrderDetailsView';
import { useModal } from './CustomModal';


// Timer component to display live elapsed time
const OrderTimer: React.FC<{ createdAt: string; className?: string; hideIcon?: boolean }> = ({ createdAt, className, hideIcon }) => {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      const diffMs = Date.now() - new Date(createdAt).getTime();
      const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) {
        setElapsed('Just now');
      } else if (diffHours < 1) {
        setElapsed(`${diffMins}m ago`);
      } else {
        const remainingMins = diffMins % 60;
        setElapsed(`${diffHours}h ${remainingMins}m ago`);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 30000);
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
}

export const StoreDashboard: React.FC<StoreDashboardProps> = ({
  activeTab: parentActiveTab,
  setActiveTab: parentSetActiveTab,
}) => {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [localActiveTab, setLocalActiveTab] = useState<'ORDERS' | 'MY_REQUESTS'>('ORDERS');
  const [ordersSubTab, setOrdersSubTab] = useState<'NEW' | 'RUNNING' | 'COMPLETED'>('NEW');
  
  const [showRequestComposer, setShowRequestComposer] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedShopOrderId, setSelectedShopOrderId] = useState<string | null>(null);
  
  const [storeOrders, setStoreOrders] = useState<Order[]>([]);
  const [myRequests, setMyRequests] = useState<Order[]>([]);
  const [storeShopOrders, setStoreShopOrders] = useState<ShopOrder[]>([]);
  const [createdOrderForModal, setCreatedOrderForModal] = useState<Order | null>(null);

  // Incoming Orders (Store Shop Orders) Filters & Pagination
  const [storeStatusFilter, setStoreStatusFilter] = useState<string>('ALL');
  const [storeDateFilter, setStoreDateFilter] = useState<'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH'>('ALL');
  const [storeSortOrder, setStoreSortOrder] = useState<'NEWEST' | 'OLDEST'>('NEWEST');
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
  const [updatingCost, setUpdatingCost] = useState(false);

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
    if (user?.storeId) return user.storeId;
    const foundShop = Array.from(fallbackStore.shops.values()).find(
      (s) => s.ownerUserId === user?.uid
    );
    return foundShop?.id || (user?.uid ? `store-${user.uid}` : undefined);
  }, [user]);

  // Track viewed shop order IDs in local state and sync with fallbackStore
  const [unviewedShopOrderIds, setUnviewedShopOrderIds] = useState<Set<string>>(new Set());
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);

  // Audio Context & Sound/Vibration alarm loop for Store
  useEffect(() => {
    if (unviewedShopOrderIds.size > 0) {
      setIsAlarmPlaying(true);
    } else {
      setIsAlarmPlaying(false);
    }
  }, [unviewedShopOrderIds]);

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
        audioCtx.close().catch(() => {});
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
    if (localActiveTab === 'ORDERS' && ordersSubTab === 'COMPLETED') {
      fetchCompletedPage(true);
    }
  }, [localActiveTab, ordersSubTab, storeId]);

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
    const syncOrders = () => {
      if (!user) return;
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
      setCostInput(currentShopOrder.price !== undefined && currentShopOrder.price !== null ? String(currentShopOrder.price) : '');
      setNoteInput(currentShopOrder.note || '');
    } else {
      setCostInput('');
      setNoteInput('');
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

  // Categorize shop orders based on tabs
  const categorizedShopOrders = useMemo(() => {
    return allAvailableShopOrders.filter((so) => {
      const parentStatus = getParentOrderStatus(so.parentOrderId);
      
      const isCanceled = so.status === 'CANCELED' || parentStatus === 'CANCELED';
      const isDelivered = parentStatus === 'DELIVERED' || so.status === 'DELIVERED';

      const isFinished = isDelivered || isCanceled;

      if (ordersSubTab === 'NEW') {
        return so.status === 'PENDING' && !isFinished;
      }
      if (ordersSubTab === 'RUNNING') {
        return ['ACCEPTED', 'PREPARING', 'READY', 'HANDOVER'].includes(so.status) && !isFinished;
      }
      if (ordersSubTab === 'COMPLETED') {
        return isFinished;
      }
      return false;
    });
  }, [allAvailableShopOrders, ordersSubTab, completedParentOrders]);

  // Calculate sub-tab counts matching exact tab list filters
  const subTabCounts = useMemo(() => {
    const counts = { NEW: 0, RUNNING: 0, COMPLETED: 0 };
    allAvailableShopOrders.forEach((so) => {
      const parentStatus = getParentOrderStatus(so.parentOrderId);
      const isCanceled = so.status === 'CANCELED' || parentStatus === 'CANCELED';
      const isDelivered = parentStatus === 'DELIVERED' || so.status === 'DELIVERED';

      const isFinished = isDelivered || isCanceled;

      if (isFinished) {
        counts.COMPLETED++;
      } else if (so.status === 'PENDING') {
        counts.NEW++;
      } else if (['ACCEPTED', 'PREPARING', 'READY', 'HANDOVER'].includes(so.status)) {
        counts.RUNNING++;
      }
    });
    return counts;
  }, [allAvailableShopOrders, completedParentOrders]);

  // Apply filters: Status, Date, Sort
  const filteredShopOrders = useMemo(() => {
    let result = [...categorizedShopOrders];

    // Status Filter
    if (storeStatusFilter !== 'ALL') {
      result = result.filter((so) => so.status === storeStatusFilter);
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

    // Sort Order
    result.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return storeSortOrder === 'NEWEST' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [categorizedShopOrders, storeStatusFilter, storeDateFilter, storeSortOrder]);

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
          const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          return orderTime >= firstOfMonth;
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



  // Pricing Alert Modal State
  const [showPriceAlertModal, setShowPriceAlertModal] = useState(false);

  // Handle operations
  const handleUpdateStatus = async (soId: string, newStatus: ShopOrderStatus, actorNote?: string) => {
    if (newStatus === 'DELIVERED') {
      showAlert('সতর্কতা', 'দোকানদার সরাসরি ডেলিভার্ড স্ট্যাটাস সেট করতে পারবেন না। মূল অর্ডারটি সম্পন্ন হলে এটি স্বয়ংক্রিয়ভাবে Delivered হবে।', 'warning');
      return;
    }

    const targetSo = storeShopOrders.find((so) => so.id === soId) || completedShopOrders.find((so) => so.id === soId);
    if (targetSo) {
      const parentStatus = getParentOrderStatus(targetSo.parentOrderId);
      if (parentStatus === 'DELIVERED' || targetSo.status === 'HANDOVER' || targetSo.status === 'CANCELED') {
        if (newStatus !== 'CANCELED') {
          showAlert('অর্ডার হ্যান্ডওভার সম্পন্ন', 'অর্ডারটি ইতিমধ্যে হেল্পারকে হ্যান্ডওভার বা সম্পন্ন করা হয়েছে। মূল অর্ডার ডেলিভারি হওয়া পর্যন্ত স্ট্যাটাস হ্যান্ডওভার থাকবে।', 'warning');
          return;
        }
      }
    }

    // Automatically save price & note when status moves
    const currentPrice = costInput ? parseFloat(costInput) : undefined;
    const currentNote = noteInput.trim() || undefined;

    await fallbackStore.updateShopOrder(soId, (prev) => ({
      ...prev,
      status: newStatus,
      price: currentPrice !== undefined ? currentPrice : prev.price,
      note: actorNote !== undefined ? actorNote : (currentNote || prev.note),
      statusHistory: [
        ...prev.statusHistory,
        {
          status: newStatus,
          timestamp: new Date().toISOString(),
          actor: user?.displayName || 'Store',
          note: actorNote,
        },
      ],
    }), 'store');
  };

  const handleUpdateCostAndNote = async (soId: string) => {
    const targetSo = storeShopOrders.find((so) => so.id === soId) || completedShopOrders.find((so) => so.id === soId);
    if (targetSo) {
      const parentStatus = getParentOrderStatus(targetSo.parentOrderId);
      if (parentStatus === 'DELIVERED' || targetSo.status === 'HANDOVER' || targetSo.status === 'CANCELED') {
        showAlert('অর্ডার সম্পন্ন', 'অর্ডারটি ইতিমধ্যে সম্পন্ন/ডেলিভার্ড হয়েছে, আর তথ্য বা দাম পরিবর্তন করা যাবে না।', 'warning');
        return;
      }
    }

    setUpdatingCost(true);
    await fallbackStore.updateShopOrder(soId, (prev) => ({
      ...prev,
      price: costInput ? parseFloat(costInput) : undefined,
      note: noteInput.trim() || undefined,
    }), 'store');
    setUpdatingCost(false);
  };

  const handleCancelOrderClick = (soId: string) => {
    setCancelTargetId(soId);
    setStoreCancelReason('');
    setStoreCancelError('');
    setShowStoreCancelModal(true);
  };

  const handleConfirmStoreCancel = () => {
    if (!storeCancelReason.trim()) {
      setStoreCancelError('বাতিল করার কারণ অনুগ্রহ করে উল্লেখ করুন।');
      return;
    }
    if (cancelTargetId) {
      handleUpdateStatus(cancelTargetId, 'CANCELED', storeCancelReason.trim());
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
              setCreatedOrderForModal(newOrder);
              setShowRequestComposer(false);
            }}
          />
          {createdOrderForModal && (
            <OrderSuccessPwaModal
              isOpen
              onClose={() => setCreatedOrderForModal(null)}
              orderId={createdOrderForModal.id}
              orderTitle={createdOrderForModal.title}
              onViewOrderDetails={() => {
                const id = createdOrderForModal.id;
                setCreatedOrderForModal(null);
                setSelectedOrderId(id);
              }}
            />
          )}
        </div>
      );
    }

    if (currentShopOrder) {
      const parentStatus = getParentOrderStatus(currentShopOrder.parentOrderId);
      const isCanceled = currentShopOrder.status === 'CANCELED' || parentStatus === 'CANCELED';
      const isDelivered = parentStatus === 'DELIVERED' || currentShopOrder.status === 'DELIVERED';
      
      const shopOrderSteps: { status: ShopOrderStatus; label: string; icon: React.ElementType; desc: string }[] = [
        { status: 'ACCEPTED', label: 'Accepted', icon: Check, desc: 'Store accepted the request' },
        { status: 'PREPARING', label: 'Processing', icon: Package, desc: 'Store is preparing the items' },
        { status: 'READY', label: 'Ready', icon: CheckCircle, desc: 'Items are ready for pickup' },
        { status: 'HANDOVER', label: 'Handed Over', icon: ArrowRight, desc: 'Handed over to helper' },
        { status: 'DELIVERED', label: 'Delivered', icon: CheckCircle2, desc: 'Order delivered to customer' },
      ];

      const effectiveStatus: ShopOrderStatus = isCanceled ? 'CANCELED' : isDelivered ? 'DELIVERED' : currentShopOrder.status;

      const getShopOrderStepState = (stepStatus: ShopOrderStatus) => {
        if (isCanceled) return 'CANCELED';
        const orderIndex = shopOrderSteps.findIndex((s) => s.status === effectiveStatus);
        const stepIndex = shopOrderSteps.findIndex((s) => s.status === stepStatus);
        if (stepIndex < orderIndex) return 'COMPLETED';
        if (stepIndex === orderIndex) return 'CURRENT';
        return 'UPCOMING';
      };

      return (
        <div className="w-full bg-gray-50 min-h-screen pb-24 animate-in fade-in duration-200">
          {/* Sticky Top Bar */}
          <div className="sticky top-14 z-20 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-xs">
            <button
              onClick={() => setSelectedShopOrderId(null)}
              className="p-2 rounded-2xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex items-center space-x-1"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-xs font-bold">Back</span>
            </button>
            <span className="font-extrabold text-sm text-gray-800 text-center">
              Order id: #{currentShopOrder.parentOrderId.slice(-6).toUpperCase()}
            </span>
            <div className="w-8" />
          </div>

          <div className="max-w-md mx-auto p-4 space-y-5">
            {/* DYNAMIC URGENCIES TIMER BLOCK */}
            <div className="bg-gradient-to-br from-red-100 via-rose-50 to-red-100 border-2 border-red-400 shadow-md shadow-red-100 rounded-2xl py-3 px-4 flex flex-col items-center justify-center space-y-1 transition-all text-center">
              <div className="flex items-center justify-center space-x-2 flex-wrap">
                <Clock className="w-4 h-4 text-red-600 animate-pulse shrink-0" />
                <span className="text-xs font-black uppercase tracking-wider text-red-950">
                  Requested:
                </span>
                <span className="text-sm font-extrabold text-red-950">
                  {formatOrderDateTime(currentShopOrder.createdAt)}
                </span>
              </div>
              <div className="text-xs font-black text-red-700 flex items-center justify-center">
                <span>(</span>
                <OrderTimer createdAt={currentShopOrder.createdAt} className="text-red-700 text-xs font-black" hideIcon />
                <span>)</span>
              </div>
            </div>

            {currentShopOrder.status === 'PENDING' ? (
              <>
                {/* Service Type (Order details) */}
                <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">
                      {getParentOrder(currentShopOrder.parentOrderId)?.service || 'Request Details'}
                    </h3>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm text-gray-800 leading-relaxed font-semibold whitespace-pre-wrap">
                    {currentShopOrder.requestText
                      ? currentShopOrder.requestText
                          .replace(/^["'\s]+|["'\s]+$/g, '')
                          .trim()
                          .replace(/[ \t]+/g, ' ')
                          .replace(/\n\s*\n+/g, '\n')
                      : ''}
                  </div>
                </div>

                {/* Helper Contact Details */}
                <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-lg shadow-md shrink-0">
                      {currentShopOrder.helperName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Helper Contact Details</p>
                      <h4 className="font-black text-base text-gray-900 leading-tight">{currentShopOrder.helperName}</h4>
                      {getParentOrderHelperPhone(currentShopOrder.parentOrderId) && (
                        <p className="text-xs text-gray-500 font-bold mt-0.5">{getParentOrderHelperPhone(currentShopOrder.parentOrderId)}</p>
                      )}
                    </div>
                  </div>
                  {getParentOrderHelperPhone(currentShopOrder.parentOrderId) && (
                    <div className="flex space-x-2 pt-2">
                      <a
                        href={`tel:${getParentOrderHelperPhone(currentShopOrder.parentOrderId)}`}
                        className="flex-1 py-2.5 px-3 rounded-2xl bg-gray-100 text-gray-900 font-extrabold text-xs flex items-center justify-center space-x-1.5 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200"
                      >
                        <Phone className="w-4 h-4 text-gray-600" />
                        <span>Call</span>
                      </a>
                      <a
                        href={`https://wa.me/880${getParentOrderHelperPhone(currentShopOrder.parentOrderId)!.replace(/^0/, '').replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2.5 px-3 rounded-2xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow-md"
                      >
                        <MessageSquare className="w-4 h-4 text-white" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* 3 Buttons Side by Side (Left: দেখতেছি [30%], Middle: Accept [flex-1], Right: Cancel [30%]) */}
                <div className="flex space-x-1.5 pt-2">
                  <button
                    onClick={() => {
                      fallbackStore.markShopOrderViewed(currentShopOrder.id);
                      setSelectedShopOrderId(null);
                    }}
                    className="w-[30%] py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-extrabold shadow-md transition-all active:scale-95 text-center shrink-0"
                  >
                    দেখতেছি
                  </button>
                  <button
                    onClick={async () => {
                      const confirmed = await showConfirm(
                        'অর্ডার গ্রহণ করুন',
                        'আপনি কি এই অর্ডারটি গ্রহণ করতে চান? গ্রহণ করার পর অর্ডারটির কাজ শুরু হবে।',
                        'হ্যাঁ, Accept করুন',
                        'বাতিল'
                      );
                      if (!confirmed) return;
                      fallbackStore.markShopOrderViewed(currentShopOrder.id);
                      handleUpdateStatus(currentShopOrder.id, 'ACCEPTED');
                      setSelectedShopOrderId(null);
                    }}
                    className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-extrabold shadow-md transition-all active:scale-95 text-center"
                  >
                    Accept Request
                  </button>
                  <button
                    onClick={() => {
                      fallbackStore.markShopOrderViewed(currentShopOrder.id);
                      handleCancelOrderClick(currentShopOrder.id);
                    }}
                    className="w-[30%] py-3.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-2xl text-xs font-extrabold border border-red-100 transition-all active:scale-95 text-center shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Shop Order Status Progress Tracker */}
                {!isCanceled && (
                  <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft space-y-4">
                    <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Order Progress</h3>
                    
                    <div className="relative flex items-center justify-between w-full px-2 pt-2 pb-4">
                      {/* Background Line */}
                      <div className="absolute left-6 right-6 top-6 h-0.5 bg-gray-100 -translate-y-1/2 z-0" />
                      
                      {/* Active Progress Line */}
                      <div 
                        className="absolute left-6 top-6 h-0.5 bg-emerald-500 -translate-y-1/2 z-0 transition-all duration-300"
                        style={{ width: `calc(${(shopOrderSteps.findIndex((s) => s.status === currentShopOrder.status) / (shopOrderSteps.length - 1)) * 100}% - 8px)` }}
                      />
                      
                      {shopOrderSteps.map((step) => {
                        const state = getShopOrderStepState(step.status);
                        const StepIcon = step.icon;
                        const isHandover = currentShopOrder.status === 'HANDOVER';
                        const canChangeStatus = !isHandover && !isCanceled && !isDelivered && step.status !== 'DELIVERED';

                        return (
                          <div 
                            key={step.status} 
                            onClick={() => {
                              if (canChangeStatus) {
                                if (step.status === 'PREPARING' && (!costInput || parseFloat(costInput) <= 0)) {
                                  setShowPriceAlertModal(true);
                                  return;
                                }
                                handleUpdateStatus(currentShopOrder.id, step.status);
                              }
                            }}
                            className={`flex flex-col items-center relative z-10 flex-1 ${canChangeStatus ? 'cursor-pointer group' : ''}`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                              state === 'COMPLETED'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : state === 'CURRENT'
                                ? 'bg-emerald-500 text-white ring-4 ring-emerald-100 shadow-md'
                                : 'bg-gray-100 text-gray-400 border border-gray-200'
                            } ${canChangeStatus ? 'group-hover:scale-110 transition-transform' : ''}`}>
                              {state === 'COMPLETED' ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <StepIcon className={`w-3.5 h-3.5 ${state === 'CURRENT' ? 'animate-bounce text-white' : 'text-gray-400'}`} />
                              )}
                            </div>
                            <span className={`text-[10px] font-extrabold mt-2 text-center leading-tight ${
                              state === 'CURRENT' ? 'text-emerald-700' : state === 'COMPLETED' ? 'text-gray-850' : 'text-gray-300'
                            }`}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom action inside progress tracker */}
                    {!isDelivered && (
                      <div className="pt-3 border-t border-gray-100">
                        {currentShopOrder.status === 'ACCEPTED' ? (
                          <button
                            onClick={() => {
                              if (!costInput || parseFloat(costInput) <= 0) {
                                setShowPriceAlertModal(true);
                                  return;
                              }
                              handleUpdateStatus(currentShopOrder.id, 'PREPARING');
                            }}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold shadow-md transition-all active:scale-95 text-center"
                          >
                            অর্ডার রেডি করছেন...
                          </button>
                        ) : currentShopOrder.status === 'PREPARING' ? (
                          <button
                            onClick={() => handleUpdateStatus(currentShopOrder.id, 'READY')}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold shadow-md transition-all active:scale-95 text-center"
                          >
                            রেডি হয়ে গেছে
                          </button>
                        ) : currentShopOrder.status === 'READY' ? (
                          <button
                            onClick={() => handleUpdateStatus(currentShopOrder.id, 'HANDOVER')}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-bold shadow-md transition-all active:scale-95 text-center"
                          >
                            হেল্পারকে দিয়ে দিয়েছি
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                {/* Service Type Card including Pricing */}
                <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">
                      {getParentOrder(currentShopOrder.parentOrderId)?.service || 'Request Details'}
                    </h3>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm text-gray-800 leading-relaxed font-semibold whitespace-pre-wrap">
                    {currentShopOrder.requestText
                      ? currentShopOrder.requestText
                          .replace(/^["'\s]+|["'\s]+$/g, '')
                          .trim()
                          .replace(/[ \t]+/g, ' ')
                          .replace(/\n\s*\n+/g, '\n')
                      : ''}
                  </div>

                  {/* Product Cost Forms & Store Private Note inside Request Details block */}
                  <div className="space-y-4 border-t border-gray-100 pt-3">
                    {/* Price input line */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Product Price (৳)</label>
                        {isDelivered && (
                          <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            Completed Order Pricing
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base font-bold">৳</span>
                        <input
                          type="number"
                          placeholder="দামের পরিমাণ..."
                          value={costInput}
                          disabled={isCanceled || isDelivered}
                          onChange={(e) => setCostInput(e.target.value)}
                          className="w-full pl-7 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-lg font-black outline-none focus:border-emerald-500 disabled:opacity-70"
                        />
                      </div>
                    </div>

                    {/* Private Store Note Box */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-purple-800 uppercase tracking-wider flex items-center space-x-1">
                          <span>🔒 Store Private Note (দোকানের ব্যক্তিগত নোট)</span>
                        </label>
                        <span className="text-[9px] font-bold text-gray-400">হেলপার দেখতে পাবে না</span>
                      </div>
                      <textarea
                        placeholder="দোকানের নিজস্ব হিসাব বা সুবিধার্থে গোপনীয় নোট লিখে রাখুন..."
                        value={noteInput}
                        disabled={isCanceled || isDelivered}
                        onChange={(e) => setNoteInput(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 bg-purple-50/40 border border-purple-200/80 rounded-xl text-xs outline-none focus:border-purple-500 font-semibold resize-none text-purple-950 disabled:opacity-70"
                      />
                    </div>

                    {/* Single update button */}
                    {!isCanceled && !isDelivered && (
                      <button
                        onClick={() => handleUpdateCostAndNote(currentShopOrder.id)}
                        disabled={updatingCost}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
                      >
                        {updatingCost ? 'Saving...' : 'Update Note & Price'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Helper Contact Details (right after Request Details block) */}
                <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-lg shadow-md shrink-0">
                      {currentShopOrder.helperName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Helper Contact Details</p>
                      <h4 className="font-black text-base text-gray-900 leading-tight">{currentShopOrder.helperName}</h4>
                      {getParentOrderHelperPhone(currentShopOrder.parentOrderId) && (
                        <p className="text-xs text-gray-500 font-bold mt-0.5">{getParentOrderHelperPhone(currentShopOrder.parentOrderId)}</p>
                      )}
                    </div>
                  </div>
                  {getParentOrderHelperPhone(currentShopOrder.parentOrderId) && (
                    <div className="flex space-x-2 pt-2">
                      <a
                        href={`tel:${getParentOrderHelperPhone(currentShopOrder.parentOrderId)}`}
                        className="flex-1 py-2.5 px-3 rounded-2xl bg-gray-100 text-gray-900 font-extrabold text-xs flex items-center justify-center space-x-1.5 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200"
                      >
                        <Phone className="w-4 h-4 text-gray-600" />
                        <span>Call</span>
                      </a>
                      <a
                        href={`https://wa.me/880${getParentOrderHelperPhone(currentShopOrder.parentOrderId)!.replace(/^0/, '').replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2.5 px-3 rounded-2xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow-md"
                      >
                        <MessageSquare className="w-4 h-4 text-white" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* Bottom Actions based on status (Status history removed, cancel / delivered here) */}
                <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-soft">
                  {isDelivered ? (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
                      <p className="text-xs font-bold text-emerald-800">
                        🎉 This order has been successfully delivered by the helper!
                      </p>
                    </div>
                  ) : isCanceled ? (
                    <div className="p-3.5 bg-red-50 border border-red-100 rounded-2xl text-center">
                      <p className="text-xs font-bold text-red-800">
                        ❌ This order has been canceled.
                      </p>
                      {currentShopOrder.note && (
                        <p className="text-[11px] text-red-700 mt-1 font-semibold">Reason: {currentShopOrder.note}</p>
                      )}
                    </div>
                  ) : (
                    /* Cancel button */
                    <button
                      onClick={() => handleCancelOrderClick(currentShopOrder.id)}
                      className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-2xl text-xs font-bold border border-red-100 transition-all text-center block active:scale-95"
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5 pb-24 animate-in fade-in duration-200">


        {/* ─── Tab Bar in Emerald Green ──────────────────────────────────────────────────────── */}
        <div className="flex space-x-1.5 bg-gray-100 p-1.5 rounded-2xl">
          <button
            onClick={() => { setLocalActiveTab('ORDERS'); }}
            className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
              localActiveTab === 'ORDERS'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Incoming Orders{storeShopOrders.length > 0 && ` (${storeShopOrders.length})`}</span>
          </button>

          <button
            onClick={() => { setLocalActiveTab('MY_REQUESTS'); setMyRequestsVisibleCount(PAGE_SIZE); }}
            className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
              localActiveTab === 'MY_REQUESTS'
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
            const isHandover = so.status === 'HANDOVER';
            const isFinished = isDelivered || isCanceled || isHandover;
            return ['ACCEPTED', 'PREPARING', 'READY'].includes(so.status) && !isFinished;
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
                    দ্রুত প্রস্তুত করুন এবং হেল্পারকে হ্যান্ডওভার করুন।
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setLocalActiveTab('ORDERS'); setOrdersSubTab('RUNNING'); setStoreStatusFilter('ALL'); }}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-extrabold shadow-sm transition-all active:scale-95 shrink-0 ml-2"
              >
                দেখুন
              </button>
            </div>
          );
        })()}

        {/* ─── INCOMING ORDERS TAB ───────────────────────────────────────────────────── */}
        {localActiveTab === 'ORDERS' && (
          <div className="space-y-4">
            {/* Sub-tabs: New, Running, Completed */}
            <div className="flex bg-gray-100 p-1.5 rounded-xl border border-gray-200">
              {(['NEW', 'RUNNING', 'COMPLETED'] as const).map((tab) => {
                const count = subTabCounts[tab];

                const isRunningWithCount = tab === 'RUNNING' && count > 0;
                let tabStyle = '';
                if (isRunningWithCount) {
                  tabStyle = ordersSubTab === 'RUNNING'
                    ? 'bg-yellow-400 text-yellow-950 font-black shadow-sm ring-2 ring-yellow-300'
                    : 'bg-yellow-100 text-yellow-800 font-bold border border-yellow-250 animate-pulse';
                } else {
                  tabStyle = ordersSubTab === tab
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700';
                }

                return (
                  <button
                    key={tab}
                    onClick={() => {
                      setOrdersSubTab(tab);
                      setStoreStatusFilter('ALL');
                    }}
                    className={`flex-1 py-2 px-1 rounded-lg text-[11px] font-bold transition-all ${tabStyle}`}
                  >
                    <span>
                      {tab === 'NEW' ? 'New' : tab === 'RUNNING' ? 'Running' : 'Finished'}
                      {count > 0 && ` (${count})`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap gap-2 items-center justify-between text-xs">
              <div className="flex flex-wrap gap-1.5">
                {/* Date Filter */}
                <div className="flex items-center space-x-1 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200">
                  <Calendar className="w-3 h-3 text-emerald-600" />
                  <select
                    value={storeDateFilter}
                    onChange={(e) => setStoreDateFilter(e.target.value as any)}
                    className="bg-transparent font-bold text-gray-700 outline-none text-[11px]"
                  >
                    <option value="ALL">All Time</option>
                    <option value="TODAY">Today</option>
                    <option value="LAST_7_DAYS">Last 7 Days</option>
                    <option value="THIS_MONTH">This Month</option>
                  </select>
                </div>

                {/* Status Filter (contextual) */}
                {ordersSubTab === 'RUNNING' && (
                  <div className="flex items-center space-x-1 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200">
                    <Filter className="w-3 h-3 text-emerald-600" />
                    <select
                      value={storeStatusFilter}
                      onChange={(e) => setStoreStatusFilter(e.target.value)}
                      className="bg-transparent font-bold text-gray-700 outline-none text-[11px]"
                    >
                      <option value="ALL">All Running</option>
                      <option value="ACCEPTED">Accepted</option>
                      <option value="PREPARING">Processing</option>
                      <option value="READY">Ready</option>
                      <option value="HANDOVER">Handover</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Sort Toggle */}
              <button
                onClick={() => setStoreSortOrder(prev => prev === 'NEWEST' ? 'OLDEST' : 'NEWEST')}
                className="flex items-center space-x-1 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200 font-bold text-gray-700"
              >
                <ArrowUpDown className="w-3 h-3 text-emerald-600" />
                <span>{storeSortOrder === 'NEWEST' ? 'Newest' : 'Oldest'}</span>
              </button>
            </div>

            {/* List display */}
            <div className="space-y-3">
              {filteredShopOrders.length === 0 ? (
                <div className="py-14 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
                  <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h4 className="font-bold text-gray-900 text-sm mb-1">কোনো অর্ডার নেই</h4>
                  <p className="text-xs text-gray-500 font-semibold">বর্তমানে কোনো অর্ডার পাওয়া যায়নি।</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(ordersSubTab === 'COMPLETED' ? filteredShopOrders : filteredShopOrders.slice(0, storeVisibleCount)).map((so) => {
                    const parentStatus = getParentOrderStatus(so.parentOrderId);
                    const parentOrder = getParentOrder(so.parentOrderId);
                    const serviceName = parentOrder?.service || parentOrder?.title;
                    const isCanceled = so.status === 'CANCELED' || parentStatus === 'CANCELED';
                    const isDelivered = parentStatus === 'DELIVERED' || so.status === 'DELIVERED';

                    return (
                      <div
                        key={so.id}
                        onClick={() => {
                          fallbackStore.markShopOrderViewed(so.id);
                          setSelectedShopOrderId(so.id);
                        }}
                        className="bg-white rounded-3xl border border-gray-100 p-4 shadow-sm space-y-3 hover:shadow-md transition-all cursor-pointer"
                      >
                        {/* Header: ID | Requested Time | Timer | Status */}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <h4 className="font-mono text-emerald-800 font-black text-sm">
                              #{so.parentOrderId.slice(-6).toUpperCase()}
                            </h4>
                            <span className="text-xs font-semibold text-gray-400">|</span>
                            <span className="text-xs font-bold text-gray-600">
                              {formatOrderDateTime(so.createdAt)}
                            </span>
                            <span className="text-xs font-semibold text-gray-400">|</span>
                            <OrderTimer createdAt={so.createdAt} className="text-red-600 text-xs font-black" hideIcon />
                          </div>
                          <div className="text-right">
                            {isCanceled ? (
                              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">
                                Canceled
                              </span>
                            ) : isDelivered ? (
                              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Finished
                              </span>
                            ) : (
                              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                {so.status}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Service/Order Type Title and Truncated Details */}
                        <div className="space-y-0.5 min-w-0">
                          <h5 className="font-extrabold text-sm text-gray-900 truncate">
                            {serviceName || 'Store Order'}
                          </h5>
                          <p className="text-xs text-gray-600 font-medium truncate">
                            {so.requestText}
                          </p>
                        </div>

                        {/* Actions: 3 In-Line Buttons (দেখতেছি: 30%, Accept: middle flex-1, Cancel: 30%) */}
                        <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-gray-100 mt-1">
                          {so.status === 'PENDING' && !isCanceled && !isDelivered ? (
                            <div className="flex gap-1.5 w-full">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  fallbackStore.markShopOrderViewed(so.id);
                                  setSelectedShopOrderId(so.id);
                                }}
                                className="w-[30%] py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm shrink-0 text-center"
                              >
                                দেখতেছি
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const confirmed = await showConfirm(
                                    'অর্ডার গ্রহণ করুন',
                                    'আপনি কি এই অর্ডারটি গ্রহণ করতে চান? গ্রহণ করার পর অর্ডারটির কাজ শুরু হবে।',
                                    'হ্যাঁ, Accept করুন',
                                    'বাতিল'
                                  );
                                  if (!confirmed) return;
                                  fallbackStore.markShopOrderViewed(so.id);
                                  handleUpdateStatus(so.id, 'ACCEPTED');
                                }}
                                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm text-center"
                              >
                                Accept
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  fallbackStore.markShopOrderViewed(so.id);
                                  handleCancelOrderClick(so.id);
                                }}
                                className="w-[30%] py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-extrabold transition-all border border-red-100 shrink-0 text-center"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedShopOrderId(so.id);
                              }}
                              className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1"
                            >
                              <span>View Details</span>
                              <ArrowRight className="w-3.5 h-3.5 text-gray-600" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {ordersSubTab === 'COMPLETED' ? (
                    completedHasMore && (
                      <button
                        onClick={() => fetchCompletedPage(false)}
                        disabled={completedLoading}
                        className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs rounded-2xl transition-all text-center mt-2 disabled:opacity-50"
                      >
                        {completedLoading ? 'Loading...' : 'Load More'}
                      </button>
                    )
                  ) : (
                    filteredShopOrders.length > storeVisibleCount && (
                      <button
                        onClick={() => setStoreVisibleCount(prev => prev + PAGE_SIZE)}
                        className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs rounded-2xl transition-all text-center mt-2"
                      >
                        Load More
                      </button>
                    )
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
                className="p-2 rounded-full bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
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
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all"
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

      {/* ── Custom Pricing Required Theme Modal ── */}
      {showPriceAlertModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-amber-100 animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
                <AlertTriangle className="w-7 h-7 animate-bounce" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-black text-gray-900">পণ্যের দাম আবশ্যক</h3>
                <p className="text-xs text-gray-600 font-semibold leading-relaxed">
                  দোকানের পণ্যের দাম (Product Price) যোগ করা ছাড়া Processing স্ট্যাটাসে যাওয়া যাবে না। অনুগ্রহ করে আগে দামটি ইনপুট দিন।
                </p>
              </div>
              <button
                onClick={() => setShowPriceAlertModal(false)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
              >
                ঠিক আছে, বুঝতে পেরেছি
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
            const confirmed = await showConfirm(
              'অর্ডার গ্রহণ করুন',
              'আপনি কি এই অর্ডারটি গ্রহণ করতে চান? গ্রহণ করার পর অর্ডারটির কাজ শুরু হবে।',
              'হ্যাঁ, Accept করুন',
              'বাতিল'
            );
            if (!confirmed) return;

            await handleUpdateStatus(soId, 'ACCEPTED');
            fallbackStore.markShopOrderViewed(soId);
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
          onViewOne={(soId) => {
            fallbackStore.markShopOrderViewed(soId);
            setUnviewedShopOrderIds((prev) => {
              const updated = new Set(prev);
              updated.delete(soId);
              return updated;
            });
            setLocalActiveTab('ORDERS');
            setOrdersSubTab('NEW');
            setSelectedShopOrderId(soId);
            if (unviewedShopOrderIds.size <= 1) setIsAlarmPlaying(false);
          }}
          onDismissAll={() => {
            setIsAlarmPlaying(false);
          }}
        />
      )}
    </>
  );
};

interface StoreNewOrderAlertOverlayProps {
  unviewedShopOrderIds: Set<string>;
  onAccept: (soId: string) => Promise<void>;
  onCancel: (soId: string) => void;
  onViewOne: (soId: string) => void;
  onDismissAll: () => void;
}

const StoreNewOrderAlertOverlay: React.FC<StoreNewOrderAlertOverlayProps> = ({
  unviewedShopOrderIds,
  onAccept,
  onCancel,
  onViewOne,
  onDismissAll,
}) => {
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
    setProcessing(true);
    await onAccept(shopOrder.id);
    setProcessing(false);
  };

  if (!shopOrder) return null;

  const helperPhone = parentOrder?.helperPhone || parentOrder?.customerPhone || '';

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

            {/* Request text */}
            <div className="bg-red-50/60 border border-red-100 rounded-2xl p-3.5">
              <p className="text-[10px] text-red-800 font-bold uppercase tracking-wide mb-1">অর্ডার / প্রোডাক্ট বিবরণ</p>
              <p className="text-sm text-gray-900 font-bold leading-relaxed whitespace-pre-wrap">
                {shopOrder.requestText}
              </p>
            </div>

            {/* Helper Info with Phone Number */}
            <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-2xl border border-gray-100">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-base shadow-sm shrink-0">
                {shopOrder.helperName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-wide">Helper Details</p>
                <p className="text-xs font-black text-gray-900 truncate">{shopOrder.helperName}</p>
                {helperPhone && (
                  <p className="text-xs font-bold text-gray-600 flex items-center space-x-1 mt-0.5">
                    <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>{helperPhone}</span>
                  </p>
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
                      className={`rounded-full transition-all ${
                        i === safeIdx
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

          {/* Action buttons (3 In-Line Buttons: দেখতেছি [30%], Accept [flex-1], Cancel [30%]) */}
          <div className="px-5 pb-5 pt-2">
            <div className="flex space-x-1.5 w-full">
              <button
                onClick={() => onViewOne(shopOrder.id)}
                className="w-[30%] py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-extrabold text-xs shadow-md transition-all active:scale-95 text-center shrink-0"
              >
                দেখতেছি
              </button>
              <button
                onClick={handleAcceptClick}
                disabled={processing}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs shadow-lg transition-all active:scale-[0.98] disabled:opacity-60 text-center"
              >
                {processing ? 'Accpet...' : '✅ Accept'}
              </button>
              <button
                onClick={() => onCancel(shopOrder.id)}
                className="w-[30%] py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-2xl font-extrabold text-xs transition-all active:scale-95 shrink-0 text-center"
              >
                Cancel
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
          : 'কাস্টমার/হেলপারের রিকুয়েস্ট চেক করুন'}
      </p>
    </div>
  );
};

