'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Wallet, WithdrawalRequest, Order, ShopOrder } from '@/types';
import { fallbackStore, db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, startAfter, doc } from 'firebase/firestore';
import { getDocs, getDoc, onSnapshot } from '@/lib/firestoreMetered';
import { getItemQuantityNum } from '@/lib/itemUtils';
import { useModal } from './CustomModal';
import {
  Wallet as WalletIcon,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  CheckCircle2,
  Clock,
  X,
  ArrowRight,
  Search,
  ShoppingBag,
  Package,
  User as UserIcon,
  Building,
  Send,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface WalletOrderBreakdownItem {
  id: string;
  parentOrderId: string;
  orderNumber: string;
  createdAt: string;
  deliveredAt?: string;
  status: 'DELIVERED' | 'ACTIVE' | 'CANCELED';
  rawStatus: string;
  grossSales: number;
  commissionRate: number;
  commission: number;
  netSales: number;
  itemsText: string;
  itemsWithPrice?: { name: string; unit?: string; price?: number }[];
  helperName?: string;
  helperPhone?: string;
  customerName?: string;
  note?: string;
  isPaid?: boolean;
}

export const StoreWallet: React.FC = () => {
  const { user } = useAuth();
  const { showAlert } = useModal();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [storeShopOrders, setStoreShopOrders] = useState<ShopOrder[]>([]);
  const [completedShopOrders, setCompletedShopOrders] = useState<ShopOrder[]>([]);
  const [completedParentOrders, setCompletedParentOrders] = useState<Record<string, Order>>({});
  const [completedLastVisible, setCompletedLastVisible] = useState<any>(null);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedHasMore, setCompletedHasMore] = useState(true);

  // Orders Breakdown Modal State
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [breakdownType, setBreakdownType] = useState<'TODAY' | 'RANGE'>('TODAY');
  const [breakdownFilter, setBreakdownFilter] = useState<'ALL' | 'DISBURSED' | 'DUE' | 'DELIVERED' | 'ACTIVE' | 'CANCELED'>('ALL');
  const [breakdownSearch, setBreakdownSearch] = useState('');

  const storeId = useMemo(() => {
    if (user?.storeId && fallbackStore.shops.has(user.storeId)) return user.storeId;
    const foundShop = Array.from(fallbackStore.shops.values()).find(
      (s) => s.ownerUserId === user?.uid || (s.assignedUserIds && s.assignedUserIds.includes(user?.uid || '')) || s.id === `store-${user?.uid}`
    );
    return foundShop?.id || (user?.isStoreApproved ? user?.storeId : undefined);
  }, [user]);

  const shopDoc = useMemo(() => {
    if (!storeId && !user?.uid) return null;
    if (storeId && fallbackStore.shops.has(storeId)) {
      return fallbackStore.shops.get(storeId) || null;
    }
    return Array.from(fallbackStore.shops.values()).find(
      (s) => (storeId && s.id === storeId) || (user?.uid && s.ownerUserId === user.uid) || (user?.uid && s.assignedUserIds?.includes(user.uid)) || (user?.uid && s.id === `store-${user.uid}`)
    ) || null;
  }, [storeId, user]);

  const commissionRate = useMemo(() => {
    const rate = Number(shopDoc?.commissionPercent);
    if (!isNaN(rate) && rate > 0) return rate;
    const app = Array.from(fallbackStore.storeApplications.values()).find(
      (a) => (user?.uid && a.userId === user.uid) || (shopDoc?.applicationId && a.id === shopDoc.applicationId)
    );
    const appRate = Number(app?.commissionPercent);
    if (!isNaN(appRate) && appRate > 0) return appRate;
    return 0;
  }, [shopDoc, user]);

  // Local YYYY-MM-DD Helper
  const getLocalYYYYMMDD = (d: Date = new Date()): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTodayStr = () => getLocalYYYYMMDD(new Date());

  // Date Range Filtering State (Default: ALL_TIME so 1st block is Today's and 2nd is Total)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activePreset, setActivePreset] = useState<'ALL_TIME' | 'TODAY' | 'LAST_7' | 'THIS_MONTH' | 'CUSTOM'>('ALL_TIME');
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const getDaysAgoStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return getLocalYYYYMMDD(d);
  };
  const getStartOfMonthStr = () => {
    const d = new Date();
    d.setDate(1);
    return getLocalYYYYMMDD(d);
  };

  const handlePresetSelect = (preset: 'ALL_TIME' | 'TODAY' | 'LAST_7' | 'THIS_MONTH' | 'CUSTOM') => {
    setActivePreset(preset);
    if (preset === 'CUSTOM') {
      return;
    }
    if (preset === 'ALL_TIME') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      setStartDate(getTodayStr());
      setEndDate(getTodayStr());
    } else if (preset === 'LAST_7') {
      setStartDate(getDaysAgoStr(7));
      setEndDate(getTodayStr());
    } else if (preset === 'THIS_MONTH') {
      setStartDate(getStartOfMonthStr());
      setEndDate(getTodayStr());
    }
  };

  const formatExactDateTime = (dateStr: string | number) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleOutsideClick = () => setDropdownOpen(false);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [dropdownOpen]);

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDropdownOpen(!dropdownOpen);
  };

  const fetchCompletedPage = async (isFirstPage: boolean) => {
    const effectiveShopId = shopDoc?.id || storeId;
    if (!effectiveShopId || completedLoading || (!completedHasMore && !isFirstPage)) return;
    setCompletedLoading(true);
    try {
      let q = query(
        collection(db, 'shopOrders'),
        where('shopId', '==', effectiveShopId),
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

  useEffect(() => {
    const effectiveShopId = shopDoc?.id || storeId;
    if (!effectiveShopId) return;

    fetchCompletedPage(true);

    const idsToQuery = new Set<string>();
    if (user?.uid) {
      idsToQuery.add(user.uid);
      idsToQuery.add(`store-${user.uid}`);
    }
    if (storeId) {
      idsToQuery.add(storeId);
      if (storeId.startsWith('store-')) idsToQuery.add(storeId.replace('store-', ''));
    }
    if (shopDoc?.id) {
      idsToQuery.add(shopDoc.id);
      if (shopDoc.id.startsWith('store-')) idsToQuery.add(shopDoc.id.replace('store-', ''));
    }
    if (shopDoc?.ownerUserId) {
      idsToQuery.add(shopDoc.ownerUserId);
      idsToQuery.add(`store-${shopDoc.ownerUserId}`);
    }

    const idList = Array.from(idsToQuery).filter(Boolean);
    if (idList.length === 0) return;

    const unsubs: (() => void)[] = [];

    idList.forEach((id) => {
      try {
        const qHelper = query(collection(db, 'withdrawals'), where('helperId', '==', id), limit(50));
        const unsubHelper = onSnapshot(qHelper, (snap) => {
          snap.docs.forEach((d) => {
            fallbackStore.withdrawals.set(d.id, d.data() as WithdrawalRequest);
          });
          fallbackStore.notify();
        });
        unsubs.push(unsubHelper);

        const qShop = query(collection(db, 'withdrawals'), where('shopId', '==', id), limit(50));
        const unsubShop = onSnapshot(qShop, (snap) => {
          snap.docs.forEach((d) => {
            fallbackStore.withdrawals.set(d.id, d.data() as WithdrawalRequest);
          });
          fallbackStore.notify();
        });
        unsubs.push(unsubShop);
      } catch (err) {
        console.warn('Error listening to store withdrawals for id', id, err);
      }
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [storeId, shopDoc, user]);

  useEffect(() => {
    const syncWallet = () => {
      if (user) {
        const effectiveShopId = shopDoc?.id || storeId || `store-${user.uid}`;
        const w = fallbackStore.getStoreWallet(user.uid, effectiveShopId, completedParentOrders, completedShopOrders);
        
        const isStoreWithdrawal = (item: WithdrawalRequest) => {
          if (item.helperId === user.uid) return true;
          if (effectiveShopId && item.helperId === effectiveShopId) return true;
          if (storeId && item.helperId === storeId) return true;
          if (shopDoc?.id && item.helperId === shopDoc.id) return true;
          if (shopDoc?.ownerUserId && item.helperId === shopDoc.ownerUserId) return true;
          if (user.uid && (item.helperId === `store-${user.uid}` || (item.helperId.startsWith('store-') && item.helperId.replace('store-', '') === user.uid))) return true;
          if (item.userType === 'store') {
            if (shopDoc?.name && item.helperName === shopDoc.name) return true;
            if (effectiveShopId && (item.helperId === effectiveShopId || item.shopId === effectiveShopId)) return true;
            if (user.uid && (item.helperId === user.uid || item.shopId === user.uid)) return true;
            if (storeId && (item.helperId === storeId || item.shopId === storeId)) return true;
          }
          return false;
        };

        const wds = Array.from(fallbackStore.withdrawals.values())
          .filter(isStoreWithdrawal)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        const shopOrders = Array.from(fallbackStore.shopOrders.values()).filter((so) => {
          const matches = so.shopId === effectiveShopId || so.shopId === storeId || so.shopId === `store-${user.uid}`;
          return matches;
        });

        setWallet({ ...w });
        setWithdrawals([...wds]);
        setStoreShopOrders(shopOrders);
      }
    };

    syncWallet();
    const unsub = fallbackStore.subscribe(syncWallet);
    return () => {
      unsub();
    };
  }, [user, storeId, shopDoc, completedParentOrders, completedShopOrders]);

  // Combine active storeShopOrders and completed completedShopOrders
  const combinedShopOrdersList = useMemo(() => {
    const combined = [...storeShopOrders, ...completedShopOrders];
    const seen = new Set<string>();
    return combined.filter((so) => {
      if (seen.has(so.id)) return false;
      seen.add(so.id);
      return true;
    });
  }, [storeShopOrders, completedShopOrders]);

  // Construct detailed order breakdown items for modal inspection & metrics
  const allOrderBreakdownItems = useMemo(() => {
    const list: WalletOrderBreakdownItem[] = [];
    const seenParentIds = new Set<string>();
    const effectiveShopId = shopDoc?.id || storeId || (user?.uid ? `store-${user.uid}` : '');
    const ownerUserId = shopDoc?.ownerUserId || user?.uid || '';
    const storeName = shopDoc?.name || '';

    combinedShopOrdersList.forEach((so) => {
      seenParentIds.add(so.parentOrderId);
      const parentOrder = fallbackStore.orders.get(so.parentOrderId) || completedParentOrders[so.parentOrderId];
      const isCanceled = so.status === 'CANCELED' || (so.status as string) === 'CANCELLED' || parentOrder?.status === 'CANCELED' || (parentOrder?.status as string) === 'CANCELLED';
      const isDelivered = parentOrder?.status === 'DELIVERED' || (parentOrder?.status as string) === 'COMPLETED' || so.status === 'DELIVERED' || so.status === 'HANDOVER';
      
      let breakdownStatus: 'DELIVERED' | 'ACTIVE' | 'CANCELED' = 'ACTIVE';
      if (isCanceled) {
        breakdownStatus = 'CANCELED';
      } else if (isDelivered) {
        breakdownStatus = 'DELIVERED';
      }

      // Compute gross sales with the same priority as firebase.ts getStoreFinancials:
      // 1. so.price (if set and > 0)
      // 2. sum of so.itemsWithPrice (per-item prices)
      // 3. store-filtered items from parentOrder.items
      // 4. parentOrder.productCost only if this order belongs to this shop
      let grossSales = 0;
      if (so.price && Number(so.price) > 0) {
        grossSales = Number(so.price);
      } else if (so.itemsWithPrice && so.itemsWithPrice.length > 0) {
        grossSales = so.itemsWithPrice.reduce((sum, it) => sum + ((Number(it.price) || 0) * getItemQuantityNum(it)), 0);
      } else if (parentOrder?.items && parentOrder.items.length > 0) {
        const storeItems = parentOrder.items.filter(
          (it) => it.storeId === effectiveShopId || it.storeId === storeId || it.storeId === ownerUserId || (storeName && it.storeName === storeName)
        );
        if (storeItems.length > 0) {
          grossSales = storeItems.reduce((sum, it) => sum + ((Number(it.price) || 0) * getItemQuantityNum(it)), 0);
        } else if (parentOrder.shopId === effectiveShopId || parentOrder.shopId === storeId || parentOrder.shopId === ownerUserId) {
          grossSales = parentOrder.productCost || 0;
        }
      } else if (parentOrder && (parentOrder.shopId === effectiveShopId || parentOrder.shopId === storeId || parentOrder.shopId === ownerUserId)) {
        grossSales = parentOrder.productCost || 0;
      }
      const commission = breakdownStatus === 'CANCELED' ? 0 : Math.round(grossSales * (commissionRate / 100));
      const netSales = breakdownStatus === 'CANCELED' ? 0 : Math.max(0, grossSales - commission);
      const orderDate = parentOrder?.deliveredAt || so.updatedAt || so.createdAt;

      list.push({
        id: so.id,
        parentOrderId: so.parentOrderId,
        orderNumber: so.parentOrderId.slice(-4),
        createdAt: orderDate,
        deliveredAt: parentOrder?.deliveredAt,
        status: breakdownStatus,
        rawStatus: so.status || parentOrder?.status || 'PENDING',
        grossSales,
        commissionRate,
        commission,
        netSales,
        itemsText: so.requestText || parentOrder?.items?.map(i => `${i.name} (${i.qty})`).join(', ') || 'Order Items',
        itemsWithPrice: so.itemsWithPrice,
        helperName: so.helperName || parentOrder?.helperName,
        helperPhone: parentOrder?.helperPhone,
        customerName: parentOrder?.customerName,
        note: so.note || so.helperNote,
        isPaid: Boolean(so.isPaid || parentOrder?.isStorePaid || parentOrder?.isPaid),
      });
    });

    // Also check main orders directly matched to this shop without separate shopOrder doc
    Array.from(fallbackStore.orders.values()).forEach((mo) => {
      const matches =
        mo.shopId === effectiveShopId ||
        mo.shopId === storeId ||
        mo.shopId === ownerUserId ||
        mo.selectedShopIds?.includes(effectiveShopId) ||
        (storeId && mo.selectedShopIds?.includes(storeId)) ||
        (ownerUserId && mo.selectedShopIds?.includes(ownerUserId));

      if (matches && !seenParentIds.has(mo.id)) {
        const isCanceled = mo.status === 'CANCELED' || (mo.status as string) === 'CANCELLED';
        const isDelivered = mo.status === 'DELIVERED' || (mo.status as string) === 'COMPLETED';
        
        let breakdownStatus: 'DELIVERED' | 'ACTIVE' | 'CANCELED' = 'ACTIVE';
        if (isCanceled) {
          breakdownStatus = 'CANCELED';
        } else if (isDelivered) {
          breakdownStatus = 'DELIVERED';
        }

        let grossSales = 0;
        if (mo.items && mo.items.length > 0) {
          const storeItems = mo.items.filter(
            (it) => it.storeId === effectiveShopId || it.storeId === storeId || it.storeId === ownerUserId || (storeName && it.storeName === storeName)
          );
          if (storeItems.length > 0) {
            grossSales = storeItems.reduce((sum, it) => sum + ((Number(it.price) || 0) * getItemQuantityNum(it)), 0);
          } else if (mo.shopId === effectiveShopId || mo.shopId === storeId || mo.shopId === ownerUserId) {
            grossSales = mo.productCost || 0;
          }
        } else if (mo.shopId === effectiveShopId || mo.shopId === storeId || mo.shopId === ownerUserId) {
          grossSales = mo.productCost || 0;
        }

        // If grossSales is 0 and shop doesn't own this order, skip it (unrelated multi-shop selection)
        if (grossSales <= 0 && mo.shopId !== effectiveShopId && mo.shopId !== storeId && mo.shopId !== ownerUserId) {
          return;
        }

        const commission = breakdownStatus === 'CANCELED' ? 0 : Math.round(grossSales * (commissionRate / 100));
        const netSales = breakdownStatus === 'CANCELED' ? 0 : Math.max(0, grossSales - commission);
        const orderDate = mo.deliveredAt || mo.createdAt;

        list.push({
          id: mo.id,
          parentOrderId: mo.id,
          orderNumber: mo.id.slice(-4),
          createdAt: orderDate,
          deliveredAt: mo.deliveredAt,
          status: breakdownStatus,
          rawStatus: mo.status,
          grossSales,
          commissionRate,
          commission,
          netSales,
          itemsText: mo.items?.map(i => `${i.name} (${i.qty})`).join(', ') || 'Order Items',
          helperName: mo.helperName,
          helperPhone: mo.helperPhone,
          customerName: mo.customerName,
          note: mo.additionalNote,
          isPaid: Boolean(mo.isStorePaid || mo.isPaid),
        });
      }
    });

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [combinedShopOrdersList, completedParentOrders, shopDoc, storeId, user, commissionRate]);

  // Today's Detailed Metrics
  const todayMetrics = useMemo(() => {
    const todayStr = getTodayStr(); // Local YYYY-MM-DD
    let salesToday = 0; // Net delivered sales
    let grossSalesToday = 0;
    let activeSalesToday = 0;
    let activeGrossSalesToday = 0;
    let deliveredCount = 0;
    let activeCount = 0;
    let canceledCount = 0;

    allOrderBreakdownItems.forEach((item) => {
      const orderLocalStr = getLocalYYYYMMDD(new Date(item.createdAt));
      if (orderLocalStr === todayStr) {
        if (item.status === 'DELIVERED') {
          salesToday += item.netSales;
          grossSalesToday += item.grossSales;
          deliveredCount++;
        } else if (item.status === 'ACTIVE') {
          activeSalesToday += item.netSales;
          activeGrossSalesToday += item.grossSales;
          activeCount++;
        } else if (item.status === 'CANCELED') {
          canceledCount++;
        }
      }
    });

    return {
      salesToday,
      grossSalesToday,
      activeSalesToday,
      activeGrossSalesToday,
      deliveredCount,
      activeCount,
      canceledCount,
      totalTodayOrders: deliveredCount + activeCount + canceledCount,
    };
  }, [allOrderBreakdownItems]);

  // Range Order Breakdown Items
  const rangeOrderBreakdownItems = useMemo(() => {
    return allOrderBreakdownItems.filter((item) => {
      const t = new Date(item.createdAt).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [allOrderBreakdownItems, startDate, endDate]);

  // Range Metrics (Gross sales, Net sales, Commission, Disbursed vs Due)
  const rangeMetrics = useMemo(() => {
    let totalGrossSales = 0;
    let totalNetSales = 0;
    let commissionDue = 0;
    let canceledAmount = 0;
    let disbursedGrossSales = 0;
    let disbursedNetSales = 0;
    let disbursedCommission = 0;
    let unpaidGrossSales = 0;
    let unpaidNetSales = 0;
    let unpaidCommission = 0;
    let deliveredCount = 0;
    let disbursedCount = 0;
    let unpaidCount = 0;

    rangeOrderBreakdownItems.forEach((item) => {
      if (item.status === 'CANCELED') {
        canceledAmount += item.grossSales;
      } else if (item.status === 'DELIVERED') {
        totalGrossSales += item.grossSales;
        commissionDue += item.commission;
        totalNetSales += item.netSales;
        deliveredCount++;

        if (item.isPaid) {
          disbursedGrossSales += item.grossSales;
          disbursedNetSales += item.netSales;
          disbursedCommission += item.commission;
          disbursedCount++;
        } else {
          unpaidGrossSales += item.grossSales;
          unpaidNetSales += item.netSales;
          unpaidCommission += item.commission;
          unpaidCount++;
        }
      }
    });

    return {
      totalGrossSales,
      totalNetSales,
      commissionDue,
      canceledAmount,
      disbursedGrossSales,
      disbursedNetSales,
      disbursedCommission,
      unpaidGrossSales,
      unpaidNetSales,
      unpaidCommission,
      deliveredCount,
      disbursedCount,
      unpaidCount,
    };
  }, [rangeOrderBreakdownItems]);

  // Approved Payouts (Fund Transfers from Admin)
  const approvedPayouts = useMemo(() => {
    return withdrawals.filter((w) => w.status === 'APPROVED');
  }, [withdrawals]);

  // Financials calculated dynamically based on order statuses "disbursed" or not:
  const allTimeDeliveredNetSales = useMemo(() => {
    return allOrderBreakdownItems
      .filter((item) => item.status === 'DELIVERED')
      .reduce((sum, item) => sum + item.netSales, 0);
  }, [allOrderBreakdownItems]);

  const totalDisbursedFromOrders = useMemo(() => {
    return allOrderBreakdownItems
      .filter((item) => item.status === 'DELIVERED' && item.isPaid)
      .reduce((sum, item) => sum + item.netSales, 0);
  }, [allOrderBreakdownItems]);

  const unpaidBalanceFromOrders = useMemo(() => {
    return allOrderBreakdownItems
      .filter((item) => item.status === 'DELIVERED' && !item.isPaid)
      .reduce((sum, item) => sum + item.netSales, 0);
  }, [allOrderBreakdownItems]);

  const allTimeDisbursedCommission = useMemo(() => {
    return allOrderBreakdownItems
      .filter((item) => item.status === 'DELIVERED' && item.isPaid)
      .reduce((sum, item) => sum + item.commission, 0);
  }, [allOrderBreakdownItems]);

  const allTimeUnpaidCommission = useMemo(() => {
    return allOrderBreakdownItems
      .filter((item) => item.status === 'DELIVERED' && !item.isPaid)
      .reduce((sum, item) => sum + item.commission, 0);
  }, [allOrderBreakdownItems]);

  const allTimeDeliveredCommission = useMemo(() => {
    return allOrderBreakdownItems
      .filter((item) => item.status === 'DELIVERED')
      .reduce((sum, item) => sum + item.commission, 0);
  }, [allOrderBreakdownItems]);

  const totalDisbursedFunds = useMemo(() => {
    const fromWithdrawals = approvedPayouts.reduce((sum, w) => sum + w.amount, 0);
    // Calculated dynamically based on order statuses "disbursed" or not
    return (allOrderBreakdownItems.length > 0 || totalDisbursedFromOrders > 0)
      ? totalDisbursedFromOrders
      : fromWithdrawals;
  }, [totalDisbursedFromOrders, approvedPayouts, allOrderBreakdownItems.length]);

  const unpaidBalance = unpaidBalanceFromOrders;
  const availableBalance = unpaidBalanceFromOrders;



  const presetLabels = {
    ALL_TIME: 'All Time',
    TODAY: 'Today',
    LAST_7: 'Last 7 Days',
    THIS_MONTH: 'This Month',
    CUSTOM: 'Custom'
  };

  const openBreakdown = (type: 'TODAY' | 'RANGE') => {
    setBreakdownType(type);
    setBreakdownFilter('ALL');
    setBreakdownSearch('');
    setShowBreakdownModal(true);
  };

  // Active items for the modal
  const activeBreakdownItems = useMemo(() => {
    const sourceList = breakdownType === 'TODAY'
      ? allOrderBreakdownItems.filter((item) => getLocalYYYYMMDD(new Date(item.createdAt)) === getTodayStr())
      : rangeOrderBreakdownItems;

    return sourceList.filter((item) => {
      if (breakdownFilter === 'DELIVERED' && item.status !== 'DELIVERED') return false;
      if (breakdownFilter === 'DISBURSED' && (!item.isPaid || item.status !== 'DELIVERED')) return false;
      if (breakdownFilter === 'DUE' && (item.isPaid || item.status !== 'DELIVERED')) return false;
      if (breakdownFilter === 'ACTIVE' && item.status !== 'ACTIVE') return false;
      if (breakdownFilter === 'CANCELED' && item.status !== 'CANCELED') return false;

      if (breakdownSearch.trim()) {
        const q = breakdownSearch.toLowerCase();
        const matchesId = item.parentOrderId.toLowerCase().includes(q) || item.orderNumber.includes(q);
        const matchesItems = item.itemsText.toLowerCase().includes(q);
        const matchesHelper = item.helperName?.toLowerCase().includes(q) || item.helperPhone?.includes(q);
        const matchesCustomer = item.customerName?.toLowerCase().includes(q);
        if (!matchesId && !matchesItems && !matchesHelper && !matchesCustomer) return false;
      }

      return true;
    });
  }, [breakdownType, allOrderBreakdownItems, rangeOrderBreakdownItems, breakdownFilter, breakdownSearch]);

  // Disbursement History State & 5-Item Pagination
  const [selectedDisbursement, setSelectedDisbursement] = useState<WithdrawalRequest | null>(null);
  const [disbursementPage, setDisbursementPage] = useState<number>(1);
  const DISBURSEMENT_PAGE_SIZE = 5;

  // Reset page to 1 when date presets or dates change
  useEffect(() => {
    setDisbursementPage(1);
  }, [startDate, endDate, activePreset]);

  // Filtered Disbursements List (respects active wallet date filter)
  const filteredDisbursements = useMemo(() => {
    return withdrawals.filter((w) => {
      // Date Range Filtering based on active wallet preset / date filter
      if (startDate || endDate) {
        const dStr = (w.processedAt || w.createdAt || '').slice(0, 10);
        if (dStr) {
          if (startDate && dStr < startDate) return false;
          if (endDate && dStr > endDate) return false;
        }
      }
      return true;
    });
  }, [withdrawals, startDate, endDate]);

  const totalDisbursementPages = Math.max(1, Math.ceil(filteredDisbursements.length / DISBURSEMENT_PAGE_SIZE));
  const paginatedDisbursements = useMemo(() => {
    const startIdx = (disbursementPage - 1) * DISBURSEMENT_PAGE_SIZE;
    return filteredDisbursements.slice(startIdx, startIdx + DISBURSEMENT_PAGE_SIZE);
  }, [filteredDisbursements, disbursementPage]);


  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-200">
      {/* Primary Store Wallet Card */}
      <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-emerald-950 rounded-3xl p-6 text-white shadow-floating relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-2xl bg-white/20 backdrop-blur-xs">
              <WalletIcon className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-100 block">
                Store Wallet
              </span>
              <span className="text-[10px] text-emerald-300/80 font-medium">
                {shopDoc?.name || 'My Store'}
              </span>
            </div>
          </div>

          {/* Filter Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={toggleDropdown}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all text-xs font-bold border border-white/10"
            >
              <span>{presetLabels[activePreset]}</span>
              <ChevronDown className="w-3.5 h-3.5 text-white/80" />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-slate-900 border border-white/10 rounded-2xl shadow-xl z-30 py-1 text-xs">
                {Object.entries(presetLabels).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      handlePresetSelect(preset as any);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-white/10 transition-colors ${
                      activePreset === preset ? 'text-emerald-300 font-extrabold' : 'text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Custom Date Pickers */}
        {activePreset === 'CUSTOM' && (
          <div className="grid grid-cols-2 gap-2 text-[11px] font-bold mb-4 p-3 bg-white/5 border border-white/10 rounded-2xl animate-in fade-in duration-200">
            <div className="flex flex-col bg-slate-900/50 border border-white/10 rounded-xl px-2.5 py-1">
              <span className="text-white/50 text-[8px] uppercase font-extrabold">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset('CUSTOM');
                }}
                className="bg-transparent text-white font-extrabold focus:outline-none text-[11px] w-full"
              />
            </div>
            <div className="flex flex-col bg-slate-900/50 border border-white/10 rounded-xl px-2.5 py-1">
              <span className="text-white/50 text-[8px] uppercase font-extrabold">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset('CUSTOM');
                }}
                className="bg-transparent text-white font-extrabold focus:outline-none text-[11px] w-full"
              />
            </div>
          </div>
        )}

        {/* SINGLE ROW: Today's Net Sales & Total Net Sales */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Left: Today's Net Sales */}
          <div
            onClick={() => openBreakdown('TODAY')}
            className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.99] transition-all cursor-pointer border border-white/10 group select-none flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-emerald-200 font-semibold">Today's Sales</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-300 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
                ৳{todayMetrics.salesToday}
              </h3>
            </div>

            <div className="mt-2.5 pt-2 border-t border-white/10 text-[10px] text-emerald-300/90 font-medium flex items-center justify-between">
              <span>Gross: ৳{todayMetrics.grossSalesToday + todayMetrics.activeGrossSalesToday}</span>
              <span className="text-white/70 font-semibold">{todayMetrics.totalTodayOrders} orders</span>
            </div>
          </div>

          {/* Right: Total Net Sales */}
          <div
            onClick={() => openBreakdown('RANGE')}
            className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.99] transition-all cursor-pointer border border-white/10 group select-none flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-emerald-200 font-semibold">
                  {activePreset === 'ALL_TIME' ? 'Total Sales' : `Total Sales (${presetLabels[activePreset]})`}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-300 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
                ৳{rangeMetrics.totalNetSales}
              </h3>
            </div>

            <div className="mt-2.5 pt-2 border-t border-white/10 text-[10px] text-emerald-300/90 font-medium">
              <span>Gross: ৳{rangeMetrics.totalGrossSales}</span>
              <span className="block text-white/60 text-[9px] mt-0.5">Click to view orders</span>
            </div>
          </div>
        </div>

        {/* 3-WAY FINANCIAL OVERVIEW: Unpaid Balance, Total Disbursed, Commission */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {/* Unpaid Balance / Advance */}
          {(() => {
            const displayBal = activePreset === 'ALL_TIME' ? unpaidBalance : rangeMetrics.unpaidNetSales;
            const dueCount = activePreset === 'ALL_TIME'
              ? allOrderBreakdownItems.filter((i) => i.status === 'DELIVERED' && !i.isPaid).length
              : rangeMetrics.unpaidCount;
            const isNegative = displayBal < 0;
            return (
              <div className={`p-2.5 sm:p-3 rounded-2xl space-y-0.5 backdrop-blur-xs border ${
                isNegative ? 'bg-amber-500/25 border-amber-400/50' : 'bg-emerald-500/20 border-emerald-400/40'
              }`}>
                <span className={`text-[9px] sm:text-[10px] font-extrabold block uppercase tracking-wider ${
                  isNegative ? 'text-amber-200' : 'text-emerald-200'
                }`}>
                  {isNegative ? 'Advance Balance' : 'Unpaid Balance'}
                </span>
                <span className={`text-base sm:text-lg font-black block font-mono ${
                  isNegative ? 'text-amber-300' : 'text-white'
                }`}>
                  {isNegative ? `-৳${Math.abs(displayBal).toLocaleString('en-US')}` : `৳${displayBal.toLocaleString('en-US')}`}
                </span>
                <span className={`text-[8px] sm:text-[9px] font-semibold block ${
                  isNegative ? 'text-amber-200/90' : 'text-emerald-300/90'
                }`}>
                  {isNegative ? 'Advance received from Platform' : `${dueCount} orders due`}
                </span>
              </div>
            );
          })()}

          {/* Total Disbursed */}
          {(() => {
            const displayDisbursed = activePreset === 'ALL_TIME' ? totalDisbursedFunds : rangeMetrics.disbursedNetSales;
            const paidCount = activePreset === 'ALL_TIME'
              ? allOrderBreakdownItems.filter((i) => i.status === 'DELIVERED' && i.isPaid).length
              : rangeMetrics.disbursedCount;
            return (
              <div className="bg-white/10 border border-white/10 p-2.5 sm:p-3 rounded-2xl space-y-0.5 backdrop-blur-xs">
                <span className="text-[9px] sm:text-[10px] text-emerald-200/90 font-bold block uppercase tracking-wider">
                  Total Disbursed
                </span>
                <span className="text-base sm:text-lg font-black text-white block font-mono">
                  ৳{displayDisbursed.toLocaleString('en-US')}
                </span>
                <span className="text-[8px] sm:text-[9px] text-white/70 font-medium block">
                  {paidCount > 0 ? `${paidCount} orders paid` : 'Paid by Admin'}
                </span>
              </div>
            );
          })()}

          {/* Total Commission */}
          {(() => {
            const displayComm = activePreset === 'ALL_TIME' ? allTimeDeliveredCommission : rangeMetrics.commissionDue;
            const settledComm = activePreset === 'ALL_TIME' ? allTimeDisbursedCommission : rangeMetrics.disbursedCommission;
            const dueComm = activePreset === 'ALL_TIME' ? allTimeUnpaidCommission : rangeMetrics.unpaidCommission;
            return (
              <div className="bg-white/10 border border-white/10 p-2.5 sm:p-3 rounded-2xl space-y-0.5 backdrop-blur-xs">
                <span className="text-[9px] sm:text-[10px] text-emerald-200/90 font-bold block uppercase tracking-wider">
                  Commission ({commissionRate}%)
                </span>
                <span className="text-base sm:text-lg font-black text-emerald-300 block font-mono">
                  ৳{displayComm.toLocaleString('en-US')}
                </span>
                <div className="text-[8px] sm:text-[9px] text-white/70 font-medium leading-tight">
                  <span className="block">Settled: ৳{settledComm.toLocaleString('en-US')}</span>
                  {dueComm > 0 && (
                    <span className="block text-amber-200/90 font-semibold">Due: ৳{dueComm.toLocaleString('en-US')}</span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Admin Fund Transfers & Disbursement Histories */}
      <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-700">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Disbursement History ({filteredDisbursements.length})
              </h3>
              <p className="text-[10px] text-gray-400 font-medium">
                {activePreset === 'ALL_TIME' ? 'All-time payouts' : `${presetLabels[activePreset]} payouts`} transferred by Admin
              </p>
            </div>
          </div>
        </div>

        {/* Disbursements List */}
        {paginatedDisbursements.length === 0 ? (
          <div className="py-8 text-center text-gray-400 space-y-1.5 bg-gray-50/50 rounded-2xl border border-gray-100">
            <Building className="w-8 h-8 mx-auto text-gray-300" />
            <p className="text-xs font-semibold">
              {filteredDisbursements.length === 0
                ? 'No fund transfers found for the selected period/filter.'
                : 'No disbursements match your search.'}
            </p>
            <p className="text-[10px] text-gray-400">
              Admin transfers sales payouts directly to your payment account.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {paginatedDisbursements.map((w) => (
              <div
                key={w.id}
                onClick={() => setSelectedDisbursement(w)}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50/80 border border-gray-100 text-xs hover:border-emerald-300 hover:bg-emerald-50/20 cursor-pointer active:scale-[0.99] transition-all group"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-sm text-gray-900">৳{w.amount}</span>
                    <span className="px-2 py-0.5 rounded-md bg-white border border-gray-200 text-[10px] font-bold text-gray-700">
                      {w.paymentMethod || 'Fund Transfer'}
                    </span>
                  </div>
                  {w.accountNumber && (
                    <span className="text-[11px] font-semibold text-gray-600 block">
                      Ref: {w.accountNumber}
                    </span>
                  )}
                  <span className="text-[10px] font-medium text-gray-400 block">
                    {formatExactDateTime(w.processedAt || w.createdAt)}
                  </span>
                </div>

                <div className="text-right space-y-1">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold inline-block ${
                      w.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : w.status === 'REJECTED'
                        ? 'bg-red-100 text-red-800 border border-red-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {w.status === 'APPROVED' ? 'Transferred' : w.status === 'REJECTED' ? 'Rejected' : 'Processing'}
                  </span>
                  <span className="text-[9px] text-emerald-600 font-bold block group-hover:underline">
                    View Receipt &rarr;
                  </span>
                </div>
              </div>
            ))}

            {/* 5-Item Pagination Controls */}
            {totalDisbursementPages > 1 && (
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="text-gray-500 font-medium text-[11px]">
                  Showing {(disbursementPage - 1) * DISBURSEMENT_PAGE_SIZE + 1} -{' '}
                  {Math.min(disbursementPage * DISBURSEMENT_PAGE_SIZE, filteredDisbursements.length)} of{' '}
                  {filteredDisbursements.length}
                </span>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    disabled={disbursementPage <= 1}
                    onClick={() => setDisbursementPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2.5 py-1 text-xs font-bold text-gray-800 bg-gray-100 rounded-lg">
                    {disbursementPage} / {totalDisbursementPages}
                  </span>
                  <button
                    type="button"
                    disabled={disbursementPage >= totalDisbursementPages}
                    onClick={() => setDisbursementPage((p) => Math.min(totalDisbursementPages, p + 1))}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Disbursement Receipt Details Modal */}
      {selectedDisbursement && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-900 via-slate-900 to-emerald-950 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-base sm:text-lg flex items-center gap-2">
                  <Send className="w-5 h-5 text-emerald-400" />
                  Disbursement Receipt
                </h3>
                <p className="text-[11px] text-emerald-200/80 font-semibold mt-0.5">
                  Admin payout transfer details
                </p>
              </div>
              <button
                onClick={() => setSelectedDisbursement(null)}
                className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white active:scale-95 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Receipt Body */}
            <div className="p-5 space-y-4">
              {/* Amount Banner */}
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-emerald-700 tracking-wider">
                  Amount Transferred
                </span>
                <h2 className="text-3xl font-black text-emerald-900">
                  ৳{selectedDisbursement.amount}
                </h2>
                <div className="pt-1">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-extrabold inline-block ${
                      selectedDisbursement.status === 'APPROVED'
                        ? 'bg-emerald-600 text-white'
                        : selectedDisbursement.status === 'REJECTED'
                        ? 'bg-red-600 text-white'
                        : 'bg-amber-500 text-white'
                    }`}
                  >
                    {selectedDisbursement.status === 'APPROVED'
                      ? '✓ Successfully Disbursed'
                      : selectedDisbursement.status === 'REJECTED'
                      ? '✕ Disbursement Rejected'
                      : '⏳ Processing'}
                  </span>
                </div>
              </div>

              {/* Transaction Metadata Grid */}
              <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100 space-y-2.5 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200/80">
                  <span className="text-gray-500 font-semibold">Payment Method</span>
                  <span className="font-extrabold text-gray-900">
                    {selectedDisbursement.paymentMethod || 'Bank Transfer'}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-gray-200/80">
                  <span className="text-gray-500 font-semibold">Reference / Note</span>
                  <span className="font-extrabold text-gray-900 text-right max-w-[200px] truncate">
                    {selectedDisbursement.accountNumber || 'Admin Store Disbursement'}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-gray-200/80">
                  <span className="text-gray-500 font-semibold">Store Account</span>
                  <span className="font-extrabold text-gray-900">
                    {shopDoc?.name || selectedDisbursement.helperName || 'Store'}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-gray-200/80">
                  <span className="text-gray-500 font-semibold">Disbursement Date</span>
                  <span className="font-extrabold text-gray-900">
                    {formatExactDateTime(selectedDisbursement.processedAt || selectedDisbursement.createdAt)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-semibold">Transaction ID</span>
                  <span className="font-mono text-[11px] text-gray-600 font-bold">
                    {selectedDisbursement.id}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDisbursement(null)}
                className="px-6 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-extrabold text-xs active:scale-95 transition-all shadow-xs"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Orders Breakdown Modal */}
      {showBreakdownModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-900 via-slate-900 to-emerald-950 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-base sm:text-lg flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-emerald-400" />
                  {breakdownType === 'TODAY'
                    ? "Today's Orders"
                    : `Orders Breakdown (${presetLabels[activePreset]})`}
                </h3>
                <p className="text-[11px] text-emerald-200/80 font-semibold mt-0.5">
                  Orders contributing to these sales amounts
                </p>
              </div>
              <button
                onClick={() => setShowBreakdownModal(false)}
                className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white active:scale-95 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="p-3 bg-gray-50 border-b border-gray-100 space-y-2.5">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by order ID, items, rider, customer..."
                  value={breakdownSearch}
                  onChange={(e) => setBreakdownSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-extrabold no-scrollbar">
                {(['ALL', 'DISBURSED', 'DUE', 'DELIVERED', 'ACTIVE', 'CANCELED'] as const).map((filter) => {
                  const labelMap = {
                    ALL: 'All',
                    DISBURSED: 'ডিসবার্সড (Disbursed)',
                    DUE: 'অপরিশোধিত (Due)',
                    DELIVERED: 'Delivered',
                    ACTIVE: 'In Progress',
                    CANCELED: 'Canceled',
                  };
                  const active = breakdownFilter === filter;
                  return (
                    <button
                      key={filter}
                      onClick={() => setBreakdownFilter(filter)}
                      className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${
                        active
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {labelMap[filter]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Orders List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeBreakdownItems.length === 0 ? (
                <div className="py-12 text-center text-gray-400 space-y-2">
                  <Package className="w-10 h-10 mx-auto text-gray-300" />
                  <p className="text-xs font-bold">No orders found</p>
                </div>
              ) : (
                activeBreakdownItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-white border border-gray-200/90 shadow-soft hover:border-emerald-300 transition-all space-y-2.5"
                  >
                    {/* Order Header: ID, Status, Date */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-gray-900">
                          #{item.orderNumber}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            item.status === 'DELIVERED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : item.status === 'ACTIVE'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {item.status === 'DELIVERED'
                            ? 'Delivered'
                            : item.status === 'ACTIVE'
                            ? (item.rawStatus ? item.rawStatus.replace(/_/g, ' ') : 'In Progress')
                            : 'Canceled'}
                        </span>
                        {item.status === 'DELIVERED' && (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                              item.isPaid
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {item.isPaid ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>ডিসবার্সড (Disbursed)</span>
                              </>
                            ) : (
                              <span>অপরিশোধিত (Due)</span>
                            )}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-gray-400">
                        {formatExactDateTime(item.createdAt)}
                      </span>
                    </div>

                    {/* Rider & Customer Info */}
                    <div className="text-[11px] text-gray-600 space-y-0.5 bg-gray-50/80 p-2.5 rounded-xl border border-gray-100">
                      {item.helperName && (
                        <div className="flex items-center gap-1.5 font-semibold">
                          <UserIcon className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Rider: {item.helperName}</span>
                          {item.helperPhone && (
                            <span className="text-gray-400">({item.helperPhone})</span>
                          )}
                        </div>
                      )}
                      {item.customerName && (
                        <div className="text-[10px] text-gray-500 font-medium pl-5">
                          Customer: {item.customerName}
                        </div>
                      )}
                    </div>

                    {/* Items Breakdown */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                        Order Items:
                      </span>
                      {item.itemsWithPrice && item.itemsWithPrice.length > 0 ? (
                        <div className="bg-emerald-50/40 rounded-xl p-2.5 border border-emerald-100/60 space-y-1">
                          {item.itemsWithPrice.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-gray-800">
                                {it.name} {it.unit ? `(${it.unit})` : ''}
                              </span>
                              <span className="font-extrabold text-emerald-800">
                                {it.price !== undefined ? `৳${it.price}` : '৳0'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs font-semibold text-gray-800 bg-gray-50 p-2.5 rounded-xl border border-gray-100 leading-relaxed">
                          {item.itemsText}
                        </p>
                      )}
                    </div>

                    {/* Note if any */}
                    {item.note && (
                      <p className="text-[11px] text-gray-500 italic bg-amber-50/50 p-2 rounded-xl border border-amber-100">
                        Note: {item.note}
                      </p>
                    )}

                    {/* Financial Summary Box */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-gray-400 block font-bold">Gross Sales</span>
                        <span className="font-black text-gray-900">৳{item.grossSales}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-[10px] text-rose-500 block font-bold">Commission ({item.commissionRate}%)</span>
                        <span className="font-black text-rose-600">-৳{item.commission}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-emerald-600 block font-bold">Net Sales</span>
                        <span className="font-black text-emerald-700 text-sm">৳{item.netSales}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowBreakdownModal(false)}
                className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-extrabold text-xs active:scale-95 transition-all shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
