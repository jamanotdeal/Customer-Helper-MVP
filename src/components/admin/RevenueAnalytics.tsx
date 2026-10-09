'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Order, PricingSettings, Shop, UserProfile, OrderFeedback, ShopOrder } from '@/types';
import { calculateHelperCommission } from '@/lib/pricing';
import { fallbackStore } from '@/lib/firebase';
import { PaginationControl } from './PaginationControl';
import { OutstandingCommissionsModal } from './OutstandingCommissionsModal';
import { AdminStoreDisbursementModal } from './AdminStoreDisbursementModal';
import { GrowthAnalytics } from './GrowthAnalytics';
import {
  DollarSign,
  Calendar,
  TrendingUp,
  ShoppingBag,
  Bike,
  CheckCircle2,
  XCircle,
  Filter,
  ArrowUpRight,
  Sparkles,
  Store,
  ArrowUpDown,
  BarChart2,
  Search,
  Wallet,
  Receipt,
  ExternalLink,
  ChevronRight,
  CreditCard,
  Building2,
  Phone,
} from 'lucide-react';

interface RevenueAnalyticsProps {
  orders: Order[];
  pricing: PricingSettings;
  shops?: Shop[];
  users?: UserProfile[];
  feedbacks?: OrderFeedback[];
  serverTotalDeliveryFees?: number | null;
  serverTotalProductCosts?: number | null;
  serverTotalCollection?: number | null;
}

export const RevenueAnalytics: React.FC<RevenueAnalyticsProps> = ({
  orders,
  pricing,
  shops = [],
  users = [],
  feedbacks = [],
  serverTotalDeliveryFees = null,
  serverTotalProductCosts = null,
  serverTotalCollection = null,
}) => {
  const [analyticsSubView, setAnalyticsSubView] = useState<'FINANCIAL' | 'GROWTH'>('FINANCIAL');

  // Local Date Helper (YYYY-MM-DD in user's local timezone)
  const getLocalYYYYMMDD = (d: Date = new Date()): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTodayStr = () => getLocalYYYYMMDD(new Date());
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

  const getTimestampFromField = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const t = new Date(val).getTime();
      return isNaN(t) ? 0 : t;
    }
    if (typeof val === 'object' && val !== null && 'seconds' in val) {
      return (val as any).seconds * 1000;
    }
    return 0;
  };

  const getOrderCompletedTime = (o: Order): number => {
    return (
      getTimestampFromField(o.deliveredAt) ||
      getTimestampFromField(o.updatedAt) ||
      getTimestampFromField(o.createdAt) ||
      Date.now()
    );
  };

  const getOrderCanceledTime = (o: Order): number => {
    return (
      getTimestampFromField(o.cancelledAt) ||
      getTimestampFromField(o.updatedAt) ||
      getTimestampFromField(o.createdAt) ||
      Date.now()
    );
  };

  // Date Range state (Default to Last 7 Days)
  const [startDate, setStartDate] = useState<string>(getDaysAgoStr(7));
  const [endDate, setEndDate] = useState<string>(getTodayStr());
  const [activePreset, setActivePreset] = useState<'TODAY' | 'LAST_7' | 'THIS_MONTH' | 'ALL_TIME' | 'CUSTOM'>('LAST_7');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Store Commission Search & Pagination State
  const [storeSearchQuery, setStoreSearchQuery] = useState<string>('');
  const [storePage, setStorePage] = useState<number>(1);
  const [storePageSize, setStorePageSize] = useState<number>(10);

  // Modal State
  const [showOutstandingModal, setShowOutstandingModal] = useState<boolean>(false);
  const [selectedDisburseShop, setSelectedDisburseShop] = useState<Shop | null>(null);

  // Reset pages to 1 when date filter or search changes
  useEffect(() => {
    setCurrentPage(1);
    setStorePage(1);
  }, [startDate, endDate, storeSearchQuery]);

  // Quick Preset Handlers
  const handlePresetSelect = (preset: 'TODAY' | 'LAST_7' | 'THIS_MONTH' | 'ALL_TIME') => {
    setActivePreset(preset);
    if (preset === 'TODAY') {
      setStartDate(getTodayStr());
      setEndDate(getTodayStr());
    } else if (preset === 'LAST_7') {
      setStartDate(getDaysAgoStr(7));
      setEndDate(getTodayStr());
    } else if (preset === 'THIS_MONTH') {
      setStartDate(getStartOfMonthStr());
      setEndDate(getTodayStr());
    } else if (preset === 'ALL_TIME') {
      if (orders.length > 0) {
        const timestamps = orders.map((o) => getOrderCompletedTime(o));
        const minTime = Math.min(...timestamps);
        setStartDate(getLocalYYYYMMDD(new Date(minTime)));
      } else {
        setStartDate('2026-01-01');
      }
      setEndDate(getTodayStr());
    }
  };

  // Calculate Metrics in Range
  const analyticsData = useMemo(() => {
    const startMs = new Date(`${startDate}T00:00:00`).getTime();
    const endMs = new Date(`${endDate}T23:59:59.999`).getTime();

    // Delivered orders in range
    const deliveredInRange = orders.filter((o) => {
      if (o.status !== 'DELIVERED') return false;
      const t = getOrderCompletedTime(o);
      return t >= startMs && t <= endMs;
    });

    // Canceled orders in range
    const canceledInRange = orders.filter((o) => {
      if (o.status !== 'CANCELED') return false;
      const t = getOrderCanceledTime(o);
      return t >= startMs && t <= endMs;
    });

    // Get all withdrawals
    const allWithdrawals = Array.from(fallbackStore.withdrawals.values());
    const approvedWithdrawalsInRange = allWithdrawals.filter((w) => {
      if (w.status !== 'APPROVED') return false;
      const t = new Date(w.processedAt || w.createdAt).getTime();
      return t >= startMs && t <= endMs;
    });
    const pendingWithdrawals = allWithdrawals.filter((w) => w.status === 'PENDING');

    const totalApprovedPayouts = approvedWithdrawalsInRange.reduce((sum, w) => sum + w.amount, 0);
    const totalPendingPayouts = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);

    // Get total outstanding helper liability (wallet balances)
    const allUsersWithActivity = new Set([
      ...Array.from(fallbackStore.orders.values()).map((o) => o.helperId).filter(Boolean),
      ...Array.from(fallbackStore.withdrawals.values()).map((w) => w.helperId).filter(Boolean),
      ...Array.from(fallbackStore.wallets.keys()),
    ]) as Set<string>;

    const allWallets = Array.from(allUsersWithActivity).map((uid) => fallbackStore.getHelperWallet(uid));
    const totalOutstandingLiability = allWallets.reduce((sum, w) => sum + w.balance, 0);

    // Calculate all-time figures for the helper ledger
    const allDeliveredOrders = orders.filter((o) => o.status === 'DELIVERED');
    const localDeliveredFees = allDeliveredOrders.reduce((sum, o) => sum + o.deliveryFee, 0);
    const allTimeGrossDeliveryFees = serverTotalDeliveryFees !== null ? serverTotalDeliveryFees : localDeliveredFees;
    const allTimeApprovedPayouts = allWithdrawals
      .filter((w) => w.status === 'APPROVED')
      .reduce((sum, w) => sum + w.amount, 0);

    const minFee = pricing.feeCalculatorMinFee ?? 20;
    const allTimePlatformCommission = allDeliveredOrders.reduce((sum, o) => {
      const effectiveFee = Math.max(o.deliveryFee || 0, minFee);
      const helperPayout = calculateHelperCommission(effectiveFee, pricing);
      return sum + (effectiveFee - helperPayout);
    }, 0);

    const totalPlatformCommissionPaidBack = allWallets.reduce((sum, w) => sum + (w.totalPaidCommission || 0), 0);
    const totalPlatformCommissionOutstandingDue = Math.max(0, allTimePlatformCommission - totalPlatformCommissionPaidBack);

    // ── All Shops & Store Applications Map ──
    const allShopsList = shops.length > 0 ? shops : Array.from(fallbackStore.shops.values());
    const shopMap = new Map<string, Shop>();
    allShopsList.forEach((s) => shopMap.set(s.id, s));

    const storeAppsList = Array.from(fallbackStore.storeApplications.values());
    const getShopCommissionRate = (s?: Shop): number => {
      if (!s) return 0;
      const rate = Number(s.commissionPercent);
      if (!isNaN(rate) && s.commissionPercent !== undefined && s.commissionPercent !== null) return rate;
      const app = storeAppsList.find((a) => a.userId === s.ownerUserId || a.id === s.applicationId);
      return Number(app?.commissionPercent) || 0;
    };

    // Store Withdrawals / Disbursements
    const storeWithdrawals = allWithdrawals.filter(
      (w) =>
        w.userType === 'store' ||
        w.helperId?.startsWith('store-') ||
        Array.from(shopMap.keys()).includes(w.helperId || '') ||
        Array.from(shopMap.values()).some((s) => s.ownerUserId === w.helperId || s.id === w.helperId)
    );

    const storeWithdrawalsInRange = storeWithdrawals.filter((w) => {
      if (w.status !== 'APPROVED') return false;
      const t = new Date(w.processedAt || w.createdAt).getTime();
      return t >= startMs && t <= endMs;
    });

    const allShopOrdersList = Array.from(fallbackStore.shopOrders.values());
    const shopOrdersByParentMap = new Map<string, ShopOrder[]>();
    allShopOrdersList.forEach((so) => {
      const list = shopOrdersByParentMap.get(so.parentOrderId) || [];
      list.push(so);
      shopOrdersByParentMap.set(so.parentOrderId, list);
    });

    // ── Store Commission Map Construction ──
    interface StoreCommissionEntry {
      storeId: string;
      shop: Shop;
      storeName: string;
      ownerName: string;
      contactPhone: string;
      category: string;
      commissionPercent: number;
      ordersCount: number;
      totalProductCost: number;
      grossCommission: number;
      netSales: number;
      totalPaidInRange: number;
      allTimePaid: number;
      currentBalance: number;
      allTimeGrossSales: number;
      allTimeCommission: number;
    }

    const storeCommissionMap = new Map<string, StoreCommissionEntry>();

    // Initialize all existing shops into the map
    allShopsList.forEach((shop) => {
      const commPct = getShopCommissionRate(shop);
      const storeWallet = fallbackStore.getStoreWallet(shop.ownerUserId || shop.id, shop.id);
      storeCommissionMap.set(shop.id, {
        storeId: shop.id,
        shop,
        storeName: shop.name,
        ownerName: shop.contactPerson || 'Store Owner',
        contactPhone: shop.whatsapp || shop.managerWhatsapp || '—',
        category: shop.type || 'General',
        commissionPercent: commPct,
        ordersCount: 0,
        totalProductCost: 0,
        grossCommission: 0,
        netSales: 0,
        totalPaidInRange: 0,
        allTimePaid: storeWallet.totalWithdrawn || 0,
        currentBalance: storeWallet.balance || 0,
        allTimeGrossSales: storeWallet.totalEarned + (storeWallet.totalPaidCommission || 0),
        allTimeCommission: storeWallet.totalPaidCommission || 0,
      });
    });

    // Daily Aggregation Map: DateString -> Summary
    const dailyMap = new Map<
      string,
      {
        dateStr: string;
        completedCount: number;
        grossFees: number;
        productCosts: number;
        helperPayouts: number;
        storeCommission: number;
        netRevenue: number;
        approvedWithdrawals: number;
      }
    >();

    let grossDeliveryFees = 0;
    let totalProductCosts = 0;
    let totalHelperPayouts = 0;
    let totalStoreGrossCommission = 0;
    let totalStoreGrossSales = 0;
    let totalStoreNetSales = 0;

    // Process delivered orders in range
    deliveredInRange.forEach((o) => {
      const t = getOrderCompletedTime(o);
      const dateStr = getLocalYYYYMMDD(new Date(t));

      const fee = Math.max(o.deliveryFee || 0, minFee);
      const pCost = o.productCost || 0;
      const helperPayout = calculateHelperCommission(fee, pricing);
      const deliveryPlatformShare = fee - helperPayout;

      grossDeliveryFees += fee;
      totalProductCosts += pCost;
      totalHelperPayouts += helperPayout;

      // Calculate Store Commission for this order
      let orderStoreCommission = 0;
      let orderStoreGrossSales = 0;

      const attachedShopOrders = shopOrdersByParentMap.get(o.id) || [];
      const validShopOrders = attachedShopOrders.filter((so) => so.status !== 'CANCELED' && (so.status as string) !== 'CANCELLED');

      if (validShopOrders.length > 0) {
        validShopOrders.forEach((so) => {
          const shop = shopMap.get(so.shopId) || allShopsList.find((s) => s.id === so.shopId || s.ownerUserId === so.shopId);
          const commPct = getShopCommissionRate(shop);
          const sales = (so.price && so.price > 0) ? so.price : (pCost / validShopOrders.length);
          const comm = Math.round(sales * (commPct / 100));
          const net = Math.max(0, sales - comm);

          orderStoreGrossSales += sales;
          orderStoreCommission += comm;

          const shopKey = shop?.id || so.shopId;
          const entry = storeCommissionMap.get(shopKey) || {
            storeId: shopKey,
            shop: shop || ({ id: shopKey, name: so.shopName || 'Unknown Store', commissionPercent: commPct } as Shop),
            storeName: so.shopName || shop?.name || 'Unknown Store',
            ownerName: shop?.contactPerson || 'Store Owner',
            contactPhone: shop?.whatsapp || shop?.managerWhatsapp || '—',
            category: shop?.type || 'General',
            commissionPercent: commPct,
            ordersCount: 0,
            totalProductCost: 0,
            grossCommission: 0,
            netSales: 0,
            totalPaidInRange: 0,
            allTimePaid: 0,
            currentBalance: 0,
            allTimeGrossSales: 0,
            allTimeCommission: 0,
          };

          entry.ordersCount += 1;
          entry.totalProductCost += sales;
          entry.grossCommission += comm;
          entry.netSales += net;
          storeCommissionMap.set(shopKey, entry);
        });
      } else if (o.selectedShopIds && o.selectedShopIds.length > 0) {
        const costPerShop = pCost / o.selectedShopIds.length;
        o.selectedShopIds.forEach((shopId) => {
          const shop = shopMap.get(shopId) || allShopsList.find((s) => s.id === shopId);
          if (!shop) return;
          const commPct = getShopCommissionRate(shop);
          const comm = Math.round(costPerShop * (commPct / 100));
          const net = Math.max(0, costPerShop - comm);

          orderStoreGrossSales += costPerShop;
          orderStoreCommission += comm;

          const entry = storeCommissionMap.get(shopId) || {
            storeId: shopId,
            shop,
            storeName: shop.name,
            ownerName: shop.contactPerson || 'Store Owner',
            contactPhone: shop.whatsapp || shop.managerWhatsapp || '—',
            category: shop.type || 'General',
            commissionPercent: commPct,
            ordersCount: 0,
            totalProductCost: 0,
            grossCommission: 0,
            netSales: 0,
            totalPaidInRange: 0,
            allTimePaid: 0,
            currentBalance: 0,
            allTimeGrossSales: 0,
            allTimeCommission: 0,
          };

          entry.ordersCount += 1;
          entry.totalProductCost += costPerShop;
          entry.grossCommission += comm;
          entry.netSales += net;
          storeCommissionMap.set(shopId, entry);
        });
      }

      totalStoreGrossCommission += orderStoreCommission;
      totalStoreGrossSales += orderStoreGrossSales;
      totalStoreNetSales += (orderStoreGrossSales - orderStoreCommission);

      const netOrderPlatformRevenue = deliveryPlatformShare + orderStoreCommission;

      const existing = dailyMap.get(dateStr) || {
        dateStr,
        completedCount: 0,
        grossFees: 0,
        productCosts: 0,
        helperPayouts: 0,
        storeCommission: 0,
        netRevenue: 0,
        approvedWithdrawals: 0,
      };

      existing.completedCount += 1;
      existing.grossFees += fee;
      existing.productCosts += pCost;
      existing.helperPayouts += helperPayout;
      existing.storeCommission += orderStoreCommission;
      existing.netRevenue += netOrderPlatformRevenue;

      dailyMap.set(dateStr, existing);
    });

    // Populate store disbursements in range for each store entry
    storeWithdrawalsInRange.forEach((w) => {
      const matchShop = allShopsList.find(
        (s) =>
          s.id === w.helperId ||
          s.ownerUserId === w.helperId ||
          `store-${s.ownerUserId}` === w.helperId ||
          (w.userType === 'store' && (s.name === w.helperName || s.id === w.helperId))
      );
      if (matchShop) {
        const entry = storeCommissionMap.get(matchShop.id);
        if (entry) {
          entry.totalPaidInRange += w.amount;
        }
      }
    });

    // Add withdrawals into daily breakdown
    approvedWithdrawalsInRange.forEach((w) => {
      const t = new Date(w.processedAt || w.createdAt).getTime();
      const dateStr = getLocalYYYYMMDD(new Date(t));

      const existing = dailyMap.get(dateStr) || {
        dateStr,
        completedCount: 0,
        grossFees: 0,
        productCosts: 0,
        helperPayouts: 0,
        storeCommission: 0,
        netRevenue: 0,
        approvedWithdrawals: 0,
      };

      existing.approvedWithdrawals += w.amount;
      dailyMap.set(dateStr, existing);
    });

    const dailyBreakdown = Array.from(dailyMap.values()).sort(
      (a, b) => new Date(b.dateStr).getTime() - new Date(a.dateStr).getTime()
    );

    // Total Net Platform Revenue (Delivery Share + Store Commission)
    const deliveryPlatformShareOnly = grossDeliveryFees - totalHelperPayouts;
    const netPlatformRevenue = deliveryPlatformShareOnly + totalStoreGrossCommission;

    // Store commission lists & aggregates
    const storeCommissionData = Array.from(storeCommissionMap.values())
      .filter((d) => d.ordersCount > 0 || d.currentBalance > 0 || d.totalPaidInRange > 0 || d.allTimeCommission > 0)
      .sort((a, b) => (b.grossCommission || 0) - (a.grossCommission || 0) || (b.currentBalance || 0) - (a.currentBalance || 0));

    const totalStoreDisbursedInRange = storeWithdrawalsInRange.reduce((sum, w) => sum + w.amount, 0);
    const allTimeStoreDisbursed = storeWithdrawals
      .filter((w) => w.status === 'APPROVED')
      .reduce((sum, w) => sum + w.amount, 0);

    const allTimeStoreCommission = allShopsList.reduce((sum, s) => {
      const w = fallbackStore.getStoreWallet(s.ownerUserId || s.id, s.id);
      return sum + (w.totalPaidCommission || 0);
    }, 0);

    const allTimeStoreGrossSales = allShopsList.reduce((sum, s) => {
      const w = fallbackStore.getStoreWallet(s.ownerUserId || s.id, s.id);
      return sum + (w.totalEarned + (w.totalPaidCommission || 0));
    }, 0);

    const totalStoreOutstandingBalance = allShopsList.reduce((sum, s) => {
      const w = fallbackStore.getStoreWallet(s.ownerUserId || s.id, s.id);
      return sum + Math.max(0, w.balance || 0);
    }, 0);

    const storesWithBalanceCount = allShopsList.filter((s) => {
      const w = fallbackStore.getStoreWallet(s.ownerUserId || s.id, s.id);
      return (w.balance || 0) > 0;
    }).length;

    const totalStoreCommissionOrders = storeCommissionData.reduce((s, d) => s + d.ordersCount, 0);

    // Dynamic metrics in range
    const allOrdersInRange = orders.filter((o) => {
      const t = getTimestampFromField(o.createdAt);
      return t >= startMs && t <= endMs;
    });

    const totalOrdersCount = allOrdersInRange.length;
    const totalGoodsValueAllOrders = allOrdersInRange.reduce((sum, o) => sum + (o.productCost || 0), 0);
    const totalDeliveryFeesAllOrders = allOrdersInRange.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
    const totalOrderValueAllOrders = totalGoodsValueAllOrders + totalDeliveryFeesAllOrders;

    const successfulGoodsValue = deliveredInRange.reduce((sum, o) => sum + (o.productCost || 0), 0);
    const successfulDeliveryFees = deliveredInRange.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
    const successfulOrderValue = successfulGoodsValue + successfulDeliveryFees;

    const cancelledGoodsValue = canceledInRange.reduce((sum, o) => sum + (o.productCost || 0), 0);
    const cancelledDeliveryFees = canceledInRange.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
    const cancelledOrderValue = cancelledGoodsValue + cancelledDeliveryFees;

    const platformCommissionEarnedInRange = deliveredInRange.reduce((sum, o) => {
      const effectiveFee = Math.max(o.deliveryFee || 0, minFee);
      const helperPayout = calculateHelperCommission(effectiveFee, pricing);
      return sum + (effectiveFee - helperPayout);
    }, 0);

    const allTxs = Array.from(fallbackStore.walletTransactions.values()).flat();
    const paybacksInRangeTx = allTxs.filter((tx) => {
      if (tx.type !== 'PAYBACK') return false;
      const t = new Date(tx.createdAt).getTime();
      return t >= startMs && t <= endMs;
    });
    const platformCommissionPaidBackInRange = paybacksInRangeTx.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const platformCommissionOutstandingDueInRange = Math.max(0, platformCommissionEarnedInRange - platformCommissionPaidBackInRange);

    // Payback requests (withdrawals) stats in range
    const paybacksInRange = allWithdrawals.filter((w) => {
      const t = new Date(w.createdAt).getTime();
      return t >= startMs && t <= endMs;
    });
    const approvedPaybacksInRange = paybacksInRange.filter((w) => w.status === 'APPROVED');
    const pendingPaybacksInRange = paybacksInRange.filter((w) => w.status === 'PENDING');
    const rejectedPaybacksInRange = paybacksInRange.filter((w) => w.status === 'REJECTED');

    const approvedPaybacksAmountInRange = approvedPaybacksInRange.reduce((sum, w) => sum + w.amount, 0);
    const pendingPaybacksAmountInRange = pendingPaybacksInRange.reduce((sum, w) => sum + w.amount, 0);
    const rejectedPaybacksAmountInRange = rejectedPaybacksInRange.reduce((sum, w) => sum + w.amount, 0);

    const approvedPaybacksCountInRange = approvedPaybacksInRange.length;
    const pendingPaybacksCountInRange = pendingPaybacksInRange.length;
    const rejectedPaybacksCountInRange = rejectedPaybacksInRange.length;
    const totalPaybacksCountInRange = paybacksInRange.length;

    const allTimeApprovedPaybacksAmount = allWithdrawals
      .filter((w) => w.status === 'APPROVED')
      .reduce((sum, w) => sum + w.amount, 0);

    const helpersWithBalanceCount = allWallets.filter((w) => (w.balance || 0) > 0).length;
    const averageDuePerHelper = helpersWithBalanceCount > 0
      ? Math.round(totalOutstandingLiability / helpersWithBalanceCount)
      : 0;

    return {
      completedCount: deliveredInRange.length,
      canceledCount: canceledInRange.length,
      grossDeliveryFees,
      totalProductCosts,
      totalHelperPayouts,
      deliveryPlatformShareOnly,
      netPlatformRevenue,
      totalApprovedPayouts,
      totalPendingPayouts,
      totalOutstandingLiability,
      allTimeGrossDeliveryFees,
      allTimeApprovedPayouts,
      allTimePlatformCommission,
      totalPlatformCommissionPaidBack,
      totalPlatformCommissionOutstandingDue,

      // Order value breakdowns
      totalOrdersCount,
      totalGoodsValueAllOrders,
      totalDeliveryFeesAllOrders,
      totalOrderValueAllOrders,

      successfulGoodsValue,
      successfulDeliveryFees,
      successfulOrderValue,

      cancelledGoodsValue,
      cancelledDeliveryFees,
      cancelledOrderValue,

      // Payback request stats
      approvedPaybacksAmountInRange,
      pendingPaybacksAmountInRange,
      rejectedPaybacksAmountInRange,
      approvedPaybacksCountInRange,
      pendingPaybacksCountInRange,
      rejectedPaybacksCountInRange,
      totalPaybacksCountInRange,
      allTimeApprovedPaybacksAmount,

      // Outstanding commission stats
      helpersWithBalanceCount,
      averageDuePerHelper,

      platformCommissionEarnedInRange,
      platformCommissionPaidBackInRange,
      platformCommissionOutstandingDueInRange,
      dailyBreakdown,

      // Store commission & settlements
      storeCommissionData,
      totalStoreGrossCommission,
      allTimeStoreCommission,
      totalStoreGrossSales,
      allTimeStoreGrossSales,
      totalStoreNetSales,
      totalStoreDisbursedInRange,
      allTimeStoreDisbursed,
      totalStoreOutstandingBalance,
      storesWithBalanceCount,
      totalStoreCommissionOrders,
    };
  }, [orders, pricing, shops, startDate, endDate]);

  // Filtered store commission data by search
  const filteredStoreCommissionData = useMemo(() => {
    if (!storeSearchQuery.trim()) return analyticsData.storeCommissionData;
    const query = storeSearchQuery.toLowerCase().trim();
    return analyticsData.storeCommissionData.filter(
      (s) =>
        s.storeName.toLowerCase().includes(query) ||
        s.ownerName.toLowerCase().includes(query) ||
        s.contactPhone.toLowerCase().includes(query) ||
        s.category.toLowerCase().includes(query)
    );
  }, [analyticsData.storeCommissionData, storeSearchQuery]);

  const storeTotalPages = Math.ceil(filteredStoreCommissionData.length / storePageSize) || 1;
  const safeStorePage = Math.min(storePage, storeTotalPages);

  const paginatedStoreCommissionData = useMemo(() => {
    const start = (safeStorePage - 1) * storePageSize;
    return filteredStoreCommissionData.slice(start, start + storePageSize);
  }, [filteredStoreCommissionData, safeStorePage, storePageSize]);

  const totalPages = Math.ceil(analyticsData.dailyBreakdown.length / pageSize) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedDailyBreakdown = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return analyticsData.dailyBreakdown.slice(start, start + pageSize);
  }, [analyticsData.dailyBreakdown, safeCurrentPage, pageSize]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Analytics View Selector Sub-Tabs */}
      <div className="flex items-center space-x-2 bg-gray-100/80 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setAnalyticsSubView('FINANCIAL')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
            analyticsSubView === 'FINANCIAL'
              ? 'bg-white text-purple-950 shadow-md'
              : 'text-gray-600 hover:text-gray-900 font-semibold'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <span>Financial & Revenue Ledger</span>
        </button>

        <button
          onClick={() => setAnalyticsSubView('GROWTH')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
            analyticsSubView === 'GROWTH'
              ? 'bg-white text-purple-950 shadow-md'
              : 'text-gray-600 hover:text-gray-900 font-semibold'
          }`}
        >
          <BarChart2 className="w-4 h-4 text-indigo-600" />
          <span>Everyday Growth Rates & Charts</span>
        </button>
      </div>

      {analyticsSubView === 'GROWTH' ? (
        <GrowthAnalytics orders={orders} users={users} feedbacks={feedbacks} />
      ) : (
        <>
          {/* Date Range Selector Header Bar */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-soft flex flex-col lg:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-purple-700" />
                <h3 className="font-extrabold text-base text-gray-900">Revenue & Financial Analytics</h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                নির্দিষ্ট সময়কালের ভিত্তিতে প্লাটফর্ম রেভিনিউ, স্টোর কমিশন, ডেলিভারি ও সেটেলমেন্ট রিপোর্ট দেখুন।
              </p>
            </div>

            {/* Date Inputs & Presets */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              {/* Quick Filter Presets */}
              <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-2xl text-xs font-extrabold">
                <button
                  onClick={() => handlePresetSelect('TODAY')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    activePreset === 'TODAY'
                      ? 'bg-white text-purple-950 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => handlePresetSelect('LAST_7')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    activePreset === 'LAST_7'
                      ? 'bg-white text-purple-950 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Last 7 Days
                </button>
                <button
                  onClick={() => handlePresetSelect('THIS_MONTH')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    activePreset === 'THIS_MONTH'
                      ? 'bg-white text-purple-950 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  This Month
                </button>
                <button
                  onClick={() => handlePresetSelect('ALL_TIME')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    activePreset === 'ALL_TIME'
                      ? 'bg-white text-purple-950 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All Time
                </button>
              </div>

              {/* Date Picker Range Inputs */}
              <div className="flex items-center space-x-2 text-xs font-bold">
                <div className="flex items-center space-x-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
                  <span className="text-gray-400 text-[10px] uppercase">From:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setActivePreset('CUSTOM');
                    }}
                    className="bg-transparent text-gray-800 font-extrabold focus:outline-none"
                  />
                </div>
                <span className="text-gray-400 font-bold">-</span>
                <div className="flex items-center space-x-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
                  <span className="text-gray-400 text-[10px] uppercase">To:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setActivePreset('CUSTOM');
                    }}
                    className="bg-transparent text-gray-800 font-extrabold focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Core Revenue Cards Row (4-Card Grid with Store Commission Block) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Net Platform Revenue (Primary Combined Platform Earnings) */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-950 text-white shadow-xl border border-purple-800/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-purple-200 uppercase tracking-wider">
                    Net Platform Revenue
                  </span>
                  <div className="p-2 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-400/30">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black tracking-tight text-white mb-1">
                  ৳{analyticsData.netPlatformRevenue.toLocaleString()}
                </div>
                <p className="text-[11px] text-purple-200 font-medium">
                  Delivery Share + Store Commission
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-purple-800/50 flex items-center justify-between text-[11px] text-purple-200">
                <span>Delivery: <strong>৳{analyticsData.deliveryPlatformShareOnly}</strong></span>
                <span>•</span>
                <span>Stores: <strong>৳{analyticsData.totalStoreGrossCommission}</strong></span>
              </div>
            </div>

            {/* 2. STORE COMMISSION (New Dedicated Revenue Block) */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-500 via-orange-600 to-orange-700 text-white shadow-xl border border-orange-400/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-amber-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                    Store Commission
                  </span>
                  <div className="p-2 rounded-2xl bg-white/20 text-white backdrop-blur-xs border border-white/20">
                    <Store className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black tracking-tight text-white mb-1">
                  ৳{analyticsData.totalStoreGrossCommission.toLocaleString()}
                </div>
                <p className="text-[11px] text-amber-100 font-medium">
                  Earned from {analyticsData.totalStoreCommissionOrders} store orders
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-white/20 flex items-center justify-between text-[11px] text-amber-100">
                <span>Gross: ৳{analyticsData.totalStoreGrossSales.toLocaleString()}</span>
                <span>•</span>
                <span>All-time: ৳{analyticsData.allTimeStoreCommission.toLocaleString()}</span>
              </div>
            </div>

            {/* 3. Gross Delivery Fees */}
            <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                    Gross Delivery Fees
                  </span>
                  <div className="p-2 rounded-2xl bg-emerald-100 text-emerald-700">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-gray-900 mb-1">
                  ৳{analyticsData.grossDeliveryFees.toLocaleString()}
                </div>
                <p className="text-[11px] text-gray-500 font-medium">
                  From {analyticsData.completedCount} completed deliveries
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
                <span>Platform Share: <strong>৳{analyticsData.deliveryPlatformShareOnly}</strong></span>
              </div>
            </div>

            {/* 4. Helper Payouts */}
            <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                    Helper Earnings Payout
                  </span>
                  <div className="p-2 rounded-2xl bg-indigo-100 text-indigo-700">
                    <Bike className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-indigo-900 mb-1">
                  ৳{analyticsData.totalHelperPayouts.toLocaleString()}
                </div>
                <p className="text-[11px] text-indigo-700 font-semibold">
                  Helper share ({pricing.helperCommissionPercent}%)
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
                <span>Disbursed: ৳{analyticsData.totalApprovedPayouts.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* ── Average Order Size & Product Basket Size Hero Card ── */}
          <div className="bg-gradient-to-br from-blue-700 via-indigo-700 to-purple-800 rounded-3xl p-6 text-white shadow-xl border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-5">
              <div className="flex items-center space-x-3">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-3 shadow-inner">
                  <ShoppingBag className="w-7 h-7 text-white" />
                </div>
                <div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-blue-200 block">
                    Order Value & Basket Size Overview
                  </span>
                  <h3 className="text-xl font-black text-white">Average Order & Product Size</h3>
                  <p className="text-xs text-blue-200/80 font-medium">
                    Based on {analyticsData.totalOrdersCount} total orders ({analyticsData.completedCount} delivered) in selected period
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-white/15 text-xs font-bold text-blue-100">
                <span>Delivered: <strong className="text-white">{analyticsData.completedCount}</strong></span>
                <span className="opacity-40">•</span>
                <span>Canceled: <strong className="text-rose-200">{analyticsData.canceledCount}</strong></span>
              </div>
            </div>

            {/* Dual Primary Metrics: Products Only vs Total Order Spend */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
              {/* Card A: Average Products Cost (Basket Size) */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/15">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-blue-200">
                    Avg. Products Paid (Basket Size)
                  </span>
                  <span className="text-[10px] font-extrabold uppercase bg-emerald-400/20 text-emerald-200 px-2 py-0.5 rounded-full">
                    Products Only
                  </span>
                </div>
                <div className="text-4xl font-black text-white mt-2">
                  ৳{analyticsData.totalOrdersCount > 0
                    ? Math.round(analyticsData.totalGoodsValueAllOrders / analyticsData.totalOrdersCount).toLocaleString('en-US')
                    : '—'}
                </div>
                <p className="text-xs text-blue-200 font-semibold mt-1">
                  Average spent on products/goods per order
                </p>
                <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-xs">
                  <span className="text-blue-200 font-medium">Avg. for Delivered:</span>
                  <span className="font-extrabold text-white">
                    ৳{analyticsData.completedCount > 0
                      ? Math.round(analyticsData.successfulGoodsValue / analyticsData.completedCount).toLocaleString('en-US')
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Card B: Average Total Order Size (Products + Delivery Fee) */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/15">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-purple-200">
                    Avg. Total Order Spend
                  </span>
                  <span className="text-[10px] font-extrabold uppercase bg-purple-400/20 text-purple-200 px-2 py-0.5 rounded-full">
                    Goods + Delivery
                  </span>
                </div>
                <div className="text-4xl font-black text-white mt-2">
                  ৳{analyticsData.totalOrdersCount > 0
                    ? Math.round(analyticsData.totalOrderValueAllOrders / analyticsData.totalOrdersCount).toLocaleString('en-US')
                    : '—'}
                </div>
                <p className="text-xs text-purple-200 font-semibold mt-1">
                  Total customer payment per order (incl. fee)
                </p>
                <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-xs">
                  <span className="text-purple-200 font-medium">Avg. for Delivered:</span>
                  <span className="font-extrabold text-white">
                    ৳{analyticsData.completedCount > 0
                      ? Math.round(analyticsData.successfulOrderValue / analyticsData.completedCount).toLocaleString('en-US')
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Supporting Stats */}
            <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <span className="text-[10px] text-blue-200 font-bold uppercase block">Avg Delivery Fee</span>
                <span className="text-lg font-black text-white">
                  ৳{analyticsData.totalOrdersCount > 0
                    ? Math.round(analyticsData.totalDeliveryFeesAllOrders / analyticsData.totalOrdersCount).toLocaleString('en-US')
                    : '—'}
                </span>
                <span className="text-[10px] text-blue-300 font-medium block">per order</span>
              </div>
              <div>
                <span className="text-[10px] text-blue-200 font-bold uppercase block">Total Products Value</span>
                <span className="text-lg font-black text-white">
                  ৳{analyticsData.totalGoodsValueAllOrders.toLocaleString('en-US')}
                </span>
                <span className="text-[10px] text-blue-300 font-medium block">all orders in period</span>
              </div>
              <div>
                <span className="text-[10px] text-blue-200 font-bold uppercase block">Delivery Success Rate</span>
                <span className="text-lg font-black text-white">
                  {analyticsData.totalOrdersCount > 0
                    ? Math.round((analyticsData.completedCount / analyticsData.totalOrdersCount) * 100)
                    : 0}%
                </span>
                <span className="text-[10px] text-blue-300 font-medium block">{analyticsData.completedCount}/{analyticsData.totalOrdersCount} orders</span>
              </div>
              <div>
                <span className="text-[10px] text-blue-200 font-bold uppercase block">Total Order Gross</span>
                <span className="text-lg font-black text-white">
                  ৳{analyticsData.totalOrderValueAllOrders.toLocaleString('en-US')}
                </span>
                <span className="text-[10px] text-blue-300 font-medium block">goods + delivery fees</span>
              </div>
            </div>
          </div>

          {/* 3-Card Orders Overview Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Orders Overview */}
            <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                    Total Orders Value
                  </span>
                  <div className="p-2 rounded-2xl bg-purple-100 text-purple-700">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-gray-900 mb-1">
                  ৳{analyticsData.totalOrderValueAllOrders.toLocaleString()}
                </div>
                <p className="text-[11px] text-purple-950 font-bold mb-3">
                  Total {analyticsData.totalOrdersCount} orders created
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Goods Value:</span>
                  <span className="font-extrabold text-gray-900">৳{analyticsData.totalGoodsValueAllOrders.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fees:</span>
                  <span className="font-extrabold text-gray-900">৳{analyticsData.totalDeliveryFeesAllOrders.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Successful Orders Overview */}
            <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                    Successful Orders Value
                  </span>
                  <div className="p-2 rounded-2xl bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-emerald-800 mb-1">
                  ৳{analyticsData.successfulOrderValue.toLocaleString()}
                </div>
                <p className="text-[11px] text-emerald-700 font-bold mb-3">
                  {analyticsData.completedCount} orders completed
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Goods Value:</span>
                  <span className="font-extrabold text-gray-900">৳{analyticsData.successfulGoodsValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fees:</span>
                  <span className="font-extrabold text-gray-900">৳{analyticsData.successfulDeliveryFees.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Cancelled Orders Overview */}
            <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                    Cancelled Orders Value
                  </span>
                  <div className="p-2 rounded-2xl bg-red-100 text-red-700">
                    <XCircle className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-red-650 mb-1">
                  ৳{analyticsData.cancelledOrderValue.toLocaleString()}
                </div>
                <p className="text-[11px] text-red-650 font-bold mb-3">
                  {analyticsData.canceledCount} orders cancelled
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Goods Value:</span>
                  <span className="font-extrabold text-gray-900">৳{analyticsData.cancelledGoodsValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fees:</span>
                  <span className="font-extrabold text-gray-900">৳{analyticsData.cancelledDeliveryFees.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Paybacks & Outstanding Helper Liabilities Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-gray-100 pt-6">
            {/* Approved Commission Paybacks */}
            <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                    Approved Helper Paybacks
                  </span>
                  <div className="p-2 rounded-2xl bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-emerald-800 mb-1">
                  ৳{analyticsData.approvedPaybacksAmountInRange.toLocaleString()}
                </div>
                <p className="text-[11px] text-emerald-650 font-bold mb-3">
                  {analyticsData.approvedPaybacksCountInRange} payback requests approved
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>All-Time Approved:</span>
                  <span className="font-extrabold text-gray-900">৳{analyticsData.allTimeApprovedPaybacksAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Pending & Rejected Paybacks */}
            <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                    Pending & Cancelled Paybacks
                  </span>
                  <div className="p-2 rounded-2xl bg-amber-100 text-amber-700">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-amber-800 mb-1">
                  ৳{analyticsData.pendingPaybacksAmountInRange.toLocaleString()}
                </div>
                <p className="text-[11px] text-amber-650 font-bold mb-3">
                  {analyticsData.pendingPaybacksCountInRange} pending payback requests
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Cancelled/Rejected:</span>
                  <span className="font-extrabold text-red-650">{analyticsData.rejectedPaybacksCountInRange} requests (৳{analyticsData.rejectedPaybacksAmountInRange})</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Total Received:</span>
                  <span className="font-extrabold text-gray-900">{analyticsData.totalPaybacksCountInRange} requests</span>
                </div>
              </div>
            </div>

            {/* Outstanding Helper Wallets Commissions */}
            <div
              onClick={() => setShowOutstandingModal(true)}
              className="p-5 rounded-3xl bg-white border border-gray-100 hover:border-indigo-300 shadow-soft flex flex-col justify-between cursor-pointer transition-all hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                    Outstanding Helper Commissions
                  </span>
                  <div className="p-2 rounded-2xl bg-indigo-100 text-indigo-700">
                    <Bike className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-indigo-900 mb-1">
                  ৳{analyticsData.totalOutstandingLiability.toLocaleString()}
                </div>
                <p className="text-[11px] text-indigo-700 font-bold mb-3">
                  Remaining commissions on helper wallets
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Helpers with Balance:</span>
                  <span className="font-extrabold text-gray-900">{analyticsData.helpersWithBalanceCount} helpers</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Average Owed:</span>
                  <span className="font-extrabold text-gray-900">৳{analyticsData.averageDuePerHelper} / helper</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rider Cash Collection & Commission Ledger */}
          <div className="p-6 rounded-3xl bg-slate-900 text-white space-y-4 shadow-xl border border-slate-800">
            <div>
              <h4 className="font-extrabold text-sm text-indigo-300 uppercase tracking-wider flex items-center space-x-2">
                <Bike className="w-5 h-5 text-indigo-400" />
                <span>Rider Cash Collection & Commission Ledger (Selected Range)</span>
              </h4>
              <p className="text-[11px] text-slate-300 mt-1">
                যেহেতু হেলপার কাস্টমারের কাছ থেকে সরাসরি নগদ মূল্য (পণ্য ও ডেলিভারি ফি) সংগ্রহ করে, তাই হেলপারের কাছ থেকে প্লাটফর্ম কমিশন পাওনা থাকে।
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <span className="text-[10px] text-indigo-200 uppercase block font-bold">Commission Earned (Range)</span>
                <span className="text-2xl font-black text-white">৳{analyticsData.platformCommissionEarnedInRange.toLocaleString()}</span>
                <p className="text-[9px] text-slate-400 mt-1">All-time: ৳{analyticsData.allTimePlatformCommission.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <span className="text-[10px] text-indigo-200 uppercase block font-bold">Commission Paid Back (Range)</span>
                <span className="text-2xl font-black text-emerald-400">৳{analyticsData.platformCommissionPaidBackInRange.toLocaleString()}</span>
                <p className="text-[9px] text-slate-400 mt-1">All-time: ৳{analyticsData.totalPlatformCommissionPaidBack.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <span className="text-[10px] text-indigo-200 uppercase block font-bold">Outstanding Due (All-time)</span>
                <span className={`text-2xl font-black ${analyticsData.totalPlatformCommissionOutstandingDue > 0 ? 'text-red-400' : 'text-slate-300'}`}>৳{analyticsData.totalPlatformCommissionOutstandingDue.toLocaleString()}</span>
                <p className="text-[9px] text-slate-400 mt-1">Range Outstanding: ৳{analyticsData.platformCommissionOutstandingDueInRange.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* ── STORE COMMISSION & PARTNER SETTLEMENT OVERVIEW HERO BANNER ── */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-orange-950/40 to-slate-900 text-white space-y-4 shadow-xl border border-orange-500/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h4 className="font-extrabold text-sm text-orange-300 uppercase tracking-wider flex items-center space-x-2">
                  <Store className="w-5 h-5 text-orange-400" />
                  <span>Store Commission & Partner Settlement Overview</span>
                </h4>
                <p className="text-[11px] text-slate-300 mt-1">
                  দোকানে বিক্রিত পণ্যের মূল্যের উপর নির্ধারিত হারে প্লাটফর্ম যে কমিশন অর্জন করেছে এবং দোকানের ওয়ালেট সেটেলমেন্ট সামারি।
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-orange-500/20 text-orange-200 border border-orange-400/30 font-bold px-3 py-1 rounded-xl">
                  {analyticsData.storeCommissionData.length} Stores Active in Ledger
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Tile 1: Commission Earned */}
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <span className="text-[10px] text-orange-200 uppercase block font-bold">Store Commission (Range)</span>
                <span className="text-2xl font-black text-amber-300">৳{analyticsData.totalStoreGrossCommission.toLocaleString()}</span>
                <p className="text-[10px] text-slate-400 mt-1">All-time Earned: <strong>৳{analyticsData.allTimeStoreCommission.toLocaleString()}</strong></p>
              </div>

              {/* Tile 2: Total Goods Sales */}
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <span className="text-[10px] text-orange-200 uppercase block font-bold">Store Product Volume</span>
                <span className="text-2xl font-black text-white">৳{analyticsData.totalStoreGrossSales.toLocaleString()}</span>
                <p className="text-[10px] text-slate-400 mt-1">{analyticsData.totalStoreCommissionOrders} completed store orders</p>
              </div>

              {/* Tile 3: Disbursements Paid */}
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <span className="text-[10px] text-orange-200 uppercase block font-bold">Disbursed to Stores (Range)</span>
                <span className="text-2xl font-black text-emerald-400">৳{analyticsData.totalStoreDisbursedInRange.toLocaleString()}</span>
                <p className="text-[10px] text-slate-400 mt-1">All-time Disbursed: <strong>৳{analyticsData.allTimeStoreDisbursed.toLocaleString()}</strong></p>
              </div>

              {/* Tile 4: Outstanding Store Wallet Liability */}
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <span className="text-[10px] text-orange-200 uppercase block font-bold">Store Wallet Liability (Total Due)</span>
                <span className={`text-2xl font-black ${analyticsData.totalStoreOutstandingBalance > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  ৳{analyticsData.totalStoreOutstandingBalance.toLocaleString()}
                </span>
                <p className="text-[10px] text-slate-400 mt-1">{analyticsData.storesWithBalanceCount} stores with positive balance</p>
              </div>
            </div>
          </div>

          {/* ── STORE COMMISSION LEDGER & SETTLEMENT SUMMARY TABLE ── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-orange-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-base text-gray-900 flex items-center space-x-2">
                  <Store className="w-5 h-5 text-orange-600" />
                  <span>Store Commission Ledger & Settlement Summary</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  দোকানভিত্তিক মোট বিক্রি, কমিশন আয়, পেমেন্ট ডিসবার্সমেন্ট এবং বর্তমান ওয়ালেট সেটেলমেন্ট হিসেব।
                </p>
              </div>

              {/* Search input for stores */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={storeSearchQuery}
                    onChange={(e) => setStoreSearchQuery(e.target.value)}
                    placeholder="দোকান বা ফোন নম্বর খুঁজুন..."
                    className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500 shadow-xs"
                  />
                </div>
              </div>
            </div>

            {filteredStoreCommissionData.length === 0 ? (
              <div className="py-12 text-center text-gray-400 space-y-2">
                <Store className="w-10 h-10 mx-auto opacity-30" />
                <p className="font-bold text-sm">কোনো স্টোর কমিশন বা অর্ডার রেকর্ড পাওয়া যায়নি।</p>
                <p className="text-xs">
                  {storeSearchQuery ? 'অনুসন্ধান ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।' : 'কমিশন সেট করা দোকান থেকে সম্পন্ন অর্ডার থাকলে এখানে দেখা যাবে।'}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-600 min-w-[850px]">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="py-3.5 px-5">#</th>
                        <th className="py-3.5 px-5">Store & Owner Details</th>
                        <th className="py-3.5 px-5">Commission Rate</th>
                        <th className="py-3.5 px-5">Orders (Range)</th>
                        <th className="py-3.5 px-5">Gross Sales (৳)</th>
                        <th className="py-3.5 px-5">Store Commission (৳)</th>
                        <th className="py-3.5 px-5">Store Net Share (৳)</th>
                        <th className="py-3.5 px-5">Disbursed / Paid (৳)</th>
                        <th className="py-3.5 px-5">Wallet Balance / Settlement</th>
                        <th className="py-3.5 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {paginatedStoreCommissionData.map((row, idx) => {
                        const globalIdx = (safeStorePage - 1) * storePageSize + idx + 1;
                        return (
                          <tr key={row.storeId} className="hover:bg-orange-50/30 transition-colors">
                            <td className="py-4 px-5 text-gray-400 font-bold">{globalIdx}</td>
                            <td className="py-4 px-5">
                              <div className="font-extrabold text-gray-900 flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                                <span>{row.storeName}</span>
                              </div>
                              <div className="text-[11px] text-gray-500 font-medium mt-0.5">
                                {row.ownerName} • <span className="text-emerald-700 font-bold">{row.contactPhone}</span>
                              </div>
                            </td>
                            <td className="py-4 px-5">
                              <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 font-extrabold text-[11px]">
                                {row.commissionPercent}%
                              </span>
                            </td>
                            <td className="py-4 px-5 font-extrabold text-emerald-700">
                              {row.ordersCount} orders
                            </td>
                            <td className="py-4 px-5 font-bold text-gray-800">
                              ৳{Math.round(row.totalProductCost).toLocaleString()}
                            </td>
                            <td className="py-4 px-5 font-black text-purple-900">
                              ৳{row.grossCommission.toLocaleString()}
                            </td>
                            <td className="py-4 px-5 font-bold text-gray-700">
                              ৳{Math.round(row.netSales).toLocaleString()}
                            </td>
                            <td className="py-4 px-5">
                              <div className="font-extrabold text-emerald-600">
                                ৳{row.totalPaidInRange.toLocaleString()}
                              </div>
                              <div className="text-[9px] text-gray-400 font-medium">
                                All-time: ৳{row.allTimePaid.toLocaleString()}
                              </div>
                            </td>
                            <td className="py-4 px-5">
                              {row.currentBalance > 0 ? (
                                <div>
                                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-black text-xs inline-block">
                                    We Owe Store: ৳{row.currentBalance.toLocaleString()}
                                  </span>
                                  <p className="text-[9px] text-gray-400 mt-0.5 font-bold">দোকানকে পরিশোধযোগ্য</p>
                                </div>
                              ) : row.currentBalance < 0 ? (
                                <div>
                                  <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-black text-xs inline-block">
                                    Store Owes Us: ৳{Math.abs(row.currentBalance).toLocaleString()}
                                  </span>
                                  <p className="text-[9px] text-gray-400 mt-0.5 font-bold">দোকানের কাছে পাওনা</p>
                                </div>
                              ) : (
                                <div>
                                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs inline-block">
                                    Fully Settled (৳0)
                                  </span>
                                  <p className="text-[9px] text-gray-400 mt-0.5 font-bold">কোন বকেয়া নেই</p>
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-5 text-right">
                              <button
                                onClick={() => setSelectedDisburseShop(row.shop)}
                                className="px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 font-extrabold text-[11px] transition-all flex items-center gap-1 ml-auto shadow-xs active:scale-95"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>Disburse / Ledger</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-orange-50/50 border-t-2 border-orange-100">
                      <tr>
                        <td colSpan={4} className="py-3.5 px-5 font-extrabold text-gray-700 text-xs uppercase tracking-wider">Page Total</td>
                        <td className="py-3.5 px-5 font-extrabold text-gray-900">
                          ৳{Math.round(paginatedStoreCommissionData.reduce((s, d) => s + d.totalProductCost, 0)).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-5 font-black text-purple-900">
                          ৳{paginatedStoreCommissionData.reduce((s, d) => s + d.grossCommission, 0).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-5 font-bold text-gray-700">
                          ৳{Math.round(paginatedStoreCommissionData.reduce((s, d) => s + d.netSales, 0)).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-5 font-black text-emerald-600">
                          ৳{paginatedStoreCommissionData.reduce((s, d) => s + d.totalPaidInRange, 0).toLocaleString()}
                        </td>
                        <td colSpan={2} className="py-3.5 px-5 text-right font-black text-orange-800 text-xs">
                          Outstanding Balance: ৳{paginatedStoreCommissionData.reduce((s, d) => s + Math.max(0, d.currentBalance), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <PaginationControl
                  currentPage={safeStorePage}
                  totalPages={storeTotalPages}
                  totalItems={filteredStoreCommissionData.length}
                  pageSize={storePageSize}
                  onPageChange={(page) => setStorePage(page)}
                  onPageSizeChange={(newSize) => {
                    setStorePageSize(newSize);
                    setStorePage(1);
                  }}
                  pageSizeOptions={[5, 10, 25, 50]}
                />
              </>
            )}
          </div>

          {/* Date-by-Date Financial Breakdown Table */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-gray-900">Daily Revenue Breakdown Table</h3>
                <p className="text-xs text-gray-500">
                  Selected range: {startDate} to {endDate}
                </p>
              </div>
              <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-purple-100 text-purple-900">
                {analyticsData.dailyBreakdown.length} days active
              </span>
            </div>

            {analyticsData.dailyBreakdown.length === 0 ? (
              <div className="py-16 text-center text-gray-400 space-y-2">
                <Calendar className="w-12 h-12 mx-auto opacity-30" />
                <p className="font-bold text-sm">নির্দিষ্ট সময়কালে কোনো সম্পন্ন অর্ডারের ডাটা নেই।</p>
                <p className="text-xs">তারিখের সীমা পরিবর্তন করে পুনরায় চেষ্টা করুন।</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="py-3.5 px-5">Date</th>
                        <th className="py-3.5 px-5">Completed Orders</th>
                        <th className="py-3.5 px-5">Total Goods Value (৳)</th>
                        <th className="py-3.5 px-5">Gross Delivery Fee (৳)</th>
                        <th className="py-3.5 px-5">Store Commission (৳)</th>
                        <th className="py-3.5 px-5">Helper Payout (৳)</th>
                        <th className="py-3.5 px-5">Approved Paybacks (৳)</th>
                        <th className="py-3.5 px-5 text-right">Net Platform Revenue (৳)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {paginatedDailyBreakdown.map((row) => (
                        <tr key={row.dateStr} className="hover:bg-gray-50/80 transition-colors">
                          <td className="py-4 px-5 font-bold text-gray-900">
                            {new Date(row.dateStr).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="py-4 px-5 font-extrabold text-emerald-600">
                            {row.completedCount} completed
                          </td>
                          <td className="py-4 px-5 font-bold text-gray-700">৳{row.productCosts.toLocaleString()}</td>
                          <td className="py-4 px-5 font-bold text-gray-900">৳{row.grossFees.toLocaleString()}</td>
                          <td className="py-4 px-5 font-extrabold text-orange-600">৳{row.storeCommission.toLocaleString()}</td>
                          <td className="py-4 px-5 font-bold text-indigo-900">৳{row.helperPayouts.toLocaleString()}</td>
                          <td className="py-4 px-5 font-bold text-emerald-650">৳{row.approvedWithdrawals.toLocaleString()}</td>
                          <td className="py-4 px-5 text-right font-black text-purple-900 text-sm">
                            +৳{row.netRevenue.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <PaginationControl
                  currentPage={safeCurrentPage}
                  totalPages={totalPages}
                  totalItems={analyticsData.dailyBreakdown.length}
                  pageSize={pageSize}
                  onPageChange={(page) => setCurrentPage(page)}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setCurrentPage(1);
                  }}
                  pageSizeOptions={[10, 25, 50, 100]}
                />
              </>
            )}
          </div>

          {/* Helper Outstanding Modal */}
          {showOutstandingModal && (
            <OutstandingCommissionsModal
              onClose={() => setShowOutstandingModal(false)}
              totalOutstanding={analyticsData.totalOutstandingLiability}
            />
          )}

          {/* Admin Store Disbursement & Detailed Ledger Modal */}
          {selectedDisburseShop && (
            <AdminStoreDisbursementModal
              shop={selectedDisburseShop}
              onClose={() => setSelectedDisburseShop(null)}
              onDisbursed={() => {
                // Refresh is automatic via fallbackStore subscription
              }}
            />
          )}
        </>
      )}
    </div>
  );
};
