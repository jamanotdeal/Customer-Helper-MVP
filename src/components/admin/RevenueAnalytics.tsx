'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Order, PricingSettings, Shop } from '@/types';
import { calculateHelperCommission } from '@/lib/pricing';
import { fallbackStore } from '@/lib/firebase';
import { PaginationControl } from './PaginationControl';
import { OutstandingCommissionsModal } from './OutstandingCommissionsModal';
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
} from 'lucide-react';

interface RevenueAnalyticsProps {
  orders: Order[];
  pricing: PricingSettings;
  shops?: Shop[];
}

export const RevenueAnalytics: React.FC<RevenueAnalyticsProps> = ({ orders, pricing, shops = [] }) => {
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
  
  // Store Commission Pagination State
  const [storePage, setStorePage] = useState<number>(1);
  const [storePageSize, setStorePageSize] = useState<number>(10);

  const [showOutstandingModal, setShowOutstandingModal] = useState<boolean>(false);

  // Reset pages to 1 when date filter changes
  useEffect(() => {
    setCurrentPage(1);
    setStorePage(1);
  }, [startDate, endDate]);

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
      // Find oldest order date
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

    // Get total outstanding liability (wallet balances)
    const allUsersWithActivity = new Set([
      ...Array.from(fallbackStore.orders.values()).map(o => o.helperId).filter(Boolean),
      ...Array.from(fallbackStore.withdrawals.values()).map(w => w.helperId).filter(Boolean),
      ...Array.from(fallbackStore.wallets.keys())
    ]) as Set<string>;
    
    const allWallets = Array.from(allUsersWithActivity).map(uid => fallbackStore.getHelperWallet(uid));
    const totalOutstandingLiability = allWallets.reduce((sum, w) => sum + w.balance, 0);

    // Calculate all-time figures for the ledger to avoid date range mismatch
    const allDeliveredOrders = orders.filter((o) => o.status === 'DELIVERED');
    const allTimeGrossDeliveryFees = allDeliveredOrders.reduce((sum, o) => sum + o.deliveryFee, 0);
    const allTimeApprovedPayouts = allWithdrawals
      .filter((w) => w.status === 'APPROVED')
      .reduce((sum, w) => sum + w.amount, 0);

    const allTimePlatformCommission = allDeliveredOrders.reduce((sum, o) => {
      const helperPayout = calculateHelperCommission(o.deliveryFee, pricing);
      return sum + (o.deliveryFee - helperPayout);
    }, 0);

    const totalPlatformCommissionPaidBack = allWallets.reduce((sum, w) => sum + (w.totalPaidCommission || 0), 0);
    const totalPlatformCommissionOutstandingDue = Math.max(0, allTimePlatformCommission - totalPlatformCommissionPaidBack);

    let grossDeliveryFees = 0;
    let totalProductCosts = 0;
    let totalHelperPayouts = 0;
    let netPlatformRevenue = 0;

    // Daily Aggregation Map: DateString -> Summary
    const dailyMap = new Map<
      string,
      {
        dateStr: string;
        completedCount: number;
        grossFees: number;
        productCosts: number;
        helperPayouts: number;
        netRevenue: number;
        approvedWithdrawals: number;
      }
    >();

    deliveredInRange.forEach((o) => {
      const t = getOrderCompletedTime(o);
      const dateStr = getLocalYYYYMMDD(new Date(t));

      const fee = o.deliveryFee;
      const pCost = o.productCost || 0;
      const helperPayout = calculateHelperCommission(fee, pricing);
      const platformShare = fee - helperPayout;

      grossDeliveryFees += fee;
      totalProductCosts += pCost;
      totalHelperPayouts += helperPayout;
      netPlatformRevenue += platformShare;

      const existing = dailyMap.get(dateStr) || {
        dateStr,
        completedCount: 0,
        grossFees: 0,
        productCosts: 0,
        helperPayouts: 0,
        netRevenue: 0,
        approvedWithdrawals: 0,
      };

      existing.completedCount += 1;
      existing.grossFees += fee;
      existing.productCosts += pCost;
      existing.helperPayouts += helperPayout;
      existing.netRevenue += platformShare;

      dailyMap.set(dateStr, existing);
    });

    approvedWithdrawalsInRange.forEach((w) => {
      const t = new Date(w.processedAt || w.createdAt).getTime();
      const dateStr = getLocalYYYYMMDD(new Date(t));

      const existing = dailyMap.get(dateStr) || {
        dateStr,
        completedCount: 0,
        grossFees: 0,
        productCosts: 0,
        helperPayouts: 0,
        netRevenue: 0,
        approvedWithdrawals: 0,
      };

      existing.approvedWithdrawals += w.amount;
      dailyMap.set(dateStr, existing);
    });

    const dailyBreakdown = Array.from(dailyMap.values()).sort(
      (a, b) => new Date(b.dateStr).getTime() - new Date(a.dateStr).getTime()
    );

    // Dynamic metrics in range
    const allOrdersInRange = orders.filter((o) => {
      const t = getTimestampFromField(o.createdAt);
      return t >= startMs && t <= endMs;
    });

    // Total Orders metrics in range
    const totalOrdersCount = allOrdersInRange.length;
    const totalGoodsValueAllOrders = allOrdersInRange.reduce((sum, o) => sum + (o.productCost || 0), 0);
    const totalDeliveryFeesAllOrders = allOrdersInRange.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
    const totalOrderValueAllOrders = totalGoodsValueAllOrders + totalDeliveryFeesAllOrders;

    // Successful Orders metrics in range (deliveredInRange is already calculated above)
    const successfulGoodsValue = deliveredInRange.reduce((sum, o) => sum + (o.productCost || 0), 0);
    const successfulDeliveryFees = deliveredInRange.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
    const successfulOrderValue = successfulGoodsValue + successfulDeliveryFees;

    // Cancelled Orders metrics in range (canceledInRange is already calculated above)
    const cancelledGoodsValue = canceledInRange.reduce((sum, o) => sum + (o.productCost || 0), 0);
    const cancelledDeliveryFees = canceledInRange.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
    const cancelledOrderValue = cancelledGoodsValue + cancelledDeliveryFees;

    const platformCommissionEarnedInRange = deliveredInRange.reduce((sum, o) => {
      const helperPayout = calculateHelperCommission(o.deliveryFee, pricing);
      return sum + (o.deliveryFee - helperPayout);
    }, 0);

    // Sum PAYBACK transactions in range (absolute value)
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

    // Outstanding Wallet Commission Stats
    const helpersWithBalanceCount = allWallets.filter((w) => (w.balance || 0) > 0).length;
    const averageDuePerHelper = helpersWithBalanceCount > 0
      ? Math.round(totalOutstandingLiability / helpersWithBalanceCount)
      : 0;

    // Store Commission Data (from delivered orders in range with selectedShopIds)
    const shopMap = new Map<string, Shop>(shops.map(s => [s.id, s]));
    
    // Check wallet transactions for store paybacks if any linked by ownerUserId
    const allWalletTxs = Array.from(fallbackStore.walletTransactions.values()).flat();

    const storeCommissionMap = new Map<string, {
      storeId: string;
      storeName: string;
      ownerName: string;
      contactPhone: string;
      commissionPercent: number;
      ordersCount: number;
      totalProductCost: number;
      grossCommission: number;
      totalPaid: number;
      netDue: number; // Positive = Store Owes Us, Negative = We Owe Store
    }>();

    deliveredInRange.forEach((o) => {
      if (!o.selectedShopIds || o.selectedShopIds.length === 0) return;
      const productCost = o.productCost || 0;
      // Distribute product cost equally among selected shops (if multiple)
      const costPerShop = productCost / o.selectedShopIds.length;
      o.selectedShopIds.forEach((shopId) => {
        const shop = shopMap.get(shopId);
        if (!shop) return;
        const commPct = shop.commissionPercent || 0;
        const existing = storeCommissionMap.get(shopId) || {
          storeId: shopId,
          storeName: shop.name,
          ownerName: shop.contactPerson || 'Store Owner',
          contactPhone: shop.whatsapp || '—',
          commissionPercent: commPct,
          ordersCount: 0,
          totalProductCost: 0,
          grossCommission: 0,
          totalPaid: 0,
          netDue: 0,
        };

        const commAmount = Math.round(costPerShop * commPct / 100);
        existing.ordersCount += 1;
        existing.totalProductCost += costPerShop;
        existing.grossCommission += commAmount;

        // Calculate paid payback by store owner if ownerUserId is present
        if (shop.ownerUserId) {
          const paidSum = allWalletTxs
            .filter((tx) => tx.userId === shop.ownerUserId && tx.type === 'PAYBACK')
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
          existing.totalPaid = paidSum;
        }

        existing.netDue = existing.grossCommission - existing.totalPaid;
        storeCommissionMap.set(shopId, existing);
      });
    });

    const storeCommissionData = Array.from(storeCommissionMap.values()).sort(
      (a, b) => b.grossCommission - a.grossCommission
    );
    const totalStoreGrossCommission = storeCommissionData.reduce((s, d) => s + d.grossCommission, 0);
    const totalStorePaidCommission = storeCommissionData.reduce((s, d) => s + d.totalPaid, 0);
    const totalStoreNetDue = storeCommissionData.reduce((s, d) => s + d.netDue, 0);
    const totalStoreCommissionOrders = storeCommissionData.reduce((s, d) => s + d.ordersCount, 0);

    return {
      completedCount: deliveredInRange.length,
      canceledCount: canceledInRange.length,
      grossDeliveryFees,
      totalProductCosts,
      totalHelperPayouts,
      netPlatformRevenue,
      totalApprovedPayouts,
      totalPendingPayouts,
      totalOutstandingLiability,
      allTimeGrossDeliveryFees,
      allTimeApprovedPayouts,
      allTimePlatformCommission,
      totalPlatformCommissionPaidBack,
      totalPlatformCommissionOutstandingDue,
      
      // New order value breakdowns
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

      // Store commission
      storeCommissionData,
      totalStoreGrossCommission,
      totalStorePaidCommission,
      totalStoreNetDue,
      totalStoreCommissionOrders,
    };
  }, [orders, pricing, shops, startDate, endDate]);

  const storeTotalPages = Math.ceil(analyticsData.storeCommissionData.length / storePageSize) || 1;
  const safeStorePage = Math.min(storePage, storeTotalPages);

  const paginatedStoreCommissionData = useMemo(() => {
    const start = (safeStorePage - 1) * storePageSize;
    return analyticsData.storeCommissionData.slice(start, start + storePageSize);
  }, [analyticsData.storeCommissionData, safeStorePage, storePageSize]);

  const totalPages = Math.ceil(analyticsData.dailyBreakdown.length / pageSize) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedDailyBreakdown = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return analyticsData.dailyBreakdown.slice(start, start + pageSize);
  }, [analyticsData.dailyBreakdown, safeCurrentPage, pageSize]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Date Range Selector Header Bar */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-soft flex flex-col lg:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-purple-700" />
            <h3 className="font-extrabold text-base text-gray-900">Revenue & Financial Analytics</h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            নির্দিষ্ট সময়কালের ভিত্তিতে প্লাটফর্ম রেভিনিউ, কমিশন এবং আর্থিক হিসেব দেখুন।
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

      {/* Core Revenue Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Net Platform Revenue (Primary Highlight) */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-950 text-white shadow-xl border border-purple-800/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-purple-200 uppercase tracking-wider">
              Net Platform Revenue
            </span>
            <div className="p-2 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-400/30">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black tracking-tight text-white mb-1">
            ৳{analyticsData.netPlatformRevenue}
          </div>
          <p className="text-[11px] text-purple-200 font-medium">
            Jamanot net fee ({100 - pricing.helperCommissionPercent}% commission)
          </p>
        </div>

        {/* Gross Delivery Fees */}
        <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Gross Delivery Fees
            </span>
            <div className="p-2 rounded-2xl bg-emerald-100 text-emerald-700">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900 mb-1">
            ৳{analyticsData.grossDeliveryFees}
          </div>
          <p className="text-[11px] text-gray-500 font-medium">
            From {analyticsData.completedCount} completed deliveries
          </p>
        </div>

        {/* Helper Payouts */}
        <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Helper Earnings Payout
            </span>
            <div className="p-2 rounded-2xl bg-indigo-100 text-indigo-700">
              <Bike className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-indigo-900 mb-1">
            ৳{analyticsData.totalHelperPayouts}
          </div>
          <p className="text-[11px] text-indigo-700 font-semibold">
            Helper share ({pricing.helperCommissionPercent}%)
          </p>
        </div>
      </div>

      {/* Order & Goods Values Cards Row */}
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
              ৳{analyticsData.totalOrderValueAllOrders}
            </div>
            <p className="text-[11px] text-purple-955 font-bold mb-3">
              Total {analyticsData.totalOrdersCount} orders created
            </p>
          </div>
          <div className="pt-3 border-t border-gray-100 space-y-1 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Goods Value:</span>
              <span className="font-extrabold text-gray-900">৳{analyticsData.totalGoodsValueAllOrders}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Delivery Fees:</span>
              <span className="font-extrabold text-gray-900">৳{analyticsData.totalDeliveryFeesAllOrders}</span>
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
              ৳{analyticsData.successfulOrderValue}
            </div>
            <p className="text-[11px] text-emerald-705 font-bold mb-3">
              {analyticsData.completedCount} orders completed
            </p>
          </div>
          <div className="pt-3 border-t border-gray-100 space-y-1 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Goods Value:</span>
              <span className="font-extrabold text-gray-900">৳{analyticsData.successfulGoodsValue}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Delivery Fees:</span>
              <span className="font-extrabold text-gray-900">৳{analyticsData.successfulDeliveryFees}</span>
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
              ৳{analyticsData.cancelledOrderValue}
            </div>
            <p className="text-[11px] text-red-655 font-bold mb-3">
              {analyticsData.canceledCount} orders cancelled
            </p>
          </div>
          <div className="pt-3 border-t border-gray-100 space-y-1 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Goods Value:</span>
              <span className="font-extrabold text-gray-900">৳{analyticsData.cancelledGoodsValue}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Delivery Fees:</span>
              <span className="font-extrabold text-gray-900">৳{analyticsData.cancelledDeliveryFees}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-gray-100 pt-6">
        {/* Approved Commission Paybacks */}
        <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                Approved Commission Paybacks
              </span>
              <div className="p-2 rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-emerald-800 mb-1">
              ৳{analyticsData.approvedPaybacksAmountInRange}
            </div>
            <p className="text-[11px] text-emerald-650 font-bold mb-3">
              {analyticsData.approvedPaybacksCountInRange} payback requests approved
            </p>
          </div>
          <div className="pt-3 border-t border-gray-100 space-y-1 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>All-Time Approved:</span>
              <span className="font-extrabold text-gray-900">৳{analyticsData.allTimeApprovedPaybacksAmount}</span>
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
              ৳{analyticsData.pendingPaybacksAmountInRange}
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
                Outstanding Wallet Commissions
              </span>
              <div className="p-2 rounded-2xl bg-indigo-100 text-indigo-700">
                <Bike className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-indigo-900 mb-1">
              ৳{analyticsData.totalOutstandingLiability}
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

      {/* Rider Commission & Outstanding Collection Summary */}
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
            <span className="text-2xl font-black text-white">৳{analyticsData.platformCommissionEarnedInRange}</span>
            <p className="text-[9px] text-slate-400 mt-1">All-time: ৳{analyticsData.allTimePlatformCommission}</p>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
            <span className="text-[10px] text-indigo-200 uppercase block font-bold">Commission Paid Back (Range)</span>
            <span className="text-2xl font-black text-emerald-400">৳{analyticsData.platformCommissionPaidBackInRange}</span>
            <p className="text-[9px] text-slate-400 mt-1">All-time: ৳{analyticsData.totalPlatformCommissionPaidBack}</p>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
            <span className="text-[10px] text-indigo-200 uppercase block font-bold">Outstanding Due (All-time)</span>
            <span className={`text-2xl font-black ${analyticsData.totalPlatformCommissionOutstandingDue > 0 ? 'text-red-400' : 'text-slate-300'}`}>৳{analyticsData.totalPlatformCommissionOutstandingDue}</span>
            <p className="text-[9px] text-slate-400 mt-1">Range Outstanding: ৳{analyticsData.platformCommissionOutstandingDueInRange}</p>
          </div>
        </div>
      </div>

      {/* Store Commission Breakdown */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-orange-50/30 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-extrabold text-base text-gray-900 flex items-center space-x-2">
              <Store className="w-5 h-5 text-orange-600" />
              <span>Store Commission Ledger & Settlement Summary</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              কোন দোকান থেকে প্লাটফর্ম কত পাবে (Store Owes Us) এবং কাকে পরিশোধ করেছে/পাবে তার স্পষ্ট হিসেব।
            </p>
          </div>
          
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-right">
              <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Gross Commission Earned</div>
              <div className="text-xl font-black text-gray-900">৳{analyticsData.totalStoreGrossCommission}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider">Total Commission Paid</div>
              <div className="text-xl font-black text-emerald-600">৳{analyticsData.totalStorePaidCommission}</div>
            </div>
            <div className="text-right pl-4 border-l border-gray-200">
              <div className="text-[10px] font-extrabold text-orange-600 uppercase tracking-wider">Net Outstanding Due</div>
              <div className="text-2xl font-black text-orange-700">৳{analyticsData.totalStoreNetDue}</div>
              <div className="text-[10px] text-gray-400 font-medium">
                {analyticsData.totalStoreCommissionOrders} store orders • {analyticsData.storeCommissionData.length} active stores
              </div>
            </div>
          </div>
        </div>

        {analyticsData.storeCommissionData.length === 0 ? (
          <div className="py-12 text-center text-gray-400 space-y-2">
            <Store className="w-10 h-10 mx-auto opacity-30" />
            <p className="font-bold text-sm">নির্বাচিত সময়সীমায় কোনো স্টোর কমিশন ডেটা নেই।</p>
            <p className="text-xs">কমিশন সেট করা দোকান থেকে ডেলিভারড অর্ডার থাকলে এখানে দেখা যাবে।</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600 min-w-[750px]">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-5">#</th>
                    <th className="py-3.5 px-5">Store & Contact</th>
                    <th className="py-3.5 px-5">Commission Rate</th>
                    <th className="py-3.5 px-5">Completed Orders</th>
                    <th className="py-3.5 px-5">Total Goods Value (৳)</th>
                    <th className="py-3.5 px-5">Gross Commission (৳)</th>
                    <th className="py-3.5 px-5">Paid Back (৳)</th>
                    <th className="py-3.5 px-5 text-right">Net Settlement Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedStoreCommissionData.map((row, idx) => {
                    const globalIdx = (safeStorePage - 1) * storePageSize + idx + 1;
                    return (
                      <tr key={row.storeId} className="hover:bg-orange-50/30 transition-colors">
                        <td className="py-4 px-5 text-gray-400 font-bold">{globalIdx}</td>
                        <td className="py-4 px-5">
                          <div className="font-extrabold text-gray-900">{row.storeName}</div>
                          <div className="text-[11px] text-gray-500 font-medium">{row.ownerName} • <span className="text-emerald-700 font-bold">{row.contactPhone}</span></div>
                        </td>
                        <td className="py-4 px-5">
                          <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 font-extrabold text-[11px]">
                            {row.commissionPercent}%
                          </span>
                        </td>
                        <td className="py-4 px-5 font-extrabold text-emerald-700">
                          {row.ordersCount} orders
                        </td>
                        <td className="py-4 px-5 font-bold text-gray-700">
                          ৳{Math.round(row.totalProductCost)}
                        </td>
                        <td className="py-4 px-5 font-black text-purple-900">
                          ৳{row.grossCommission}
                        </td>
                        <td className="py-4 px-5 font-extrabold text-emerald-600">
                          ৳{row.totalPaid}
                        </td>
                        <td className="py-4 px-5 text-right">
                          {row.netDue > 0 ? (
                            <div>
                              <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-black text-xs inline-block">
                                Store Owes Us: ৳{row.netDue}
                              </span>
                              <p className="text-[9px] text-gray-400 mt-0.5 font-bold">দোকানের কাছে প্লাটফর্মের পাওনা</p>
                            </div>
                          ) : row.netDue < 0 ? (
                            <div>
                              <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-black text-xs inline-block">
                                We Owe Store: ৳{Math.abs(row.netDue)}
                              </span>
                              <p className="text-[9px] text-gray-400 mt-0.5 font-bold">দোকানকে পরিশোধ করতে হবে</p>
                            </div>
                          ) : (
                            <div>
                              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs inline-block">
                                Fully Settled (৳0)
                              </span>
                              <p className="text-[9px] text-gray-400 mt-0.5 font-bold">কোন বাকি নেই</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-orange-50/50 border-t-2 border-orange-100">
                  <tr>
                    <td colSpan={4} className="py-3.5 px-5 font-extrabold text-gray-700 text-xs uppercase tracking-wider">Page Total</td>
                    <td className="py-3.5 px-5 font-extrabold text-gray-900">
                      ৳{Math.round(paginatedStoreCommissionData.reduce((s, d) => s + d.totalProductCost, 0))}
                    </td>
                    <td className="py-3.5 px-5 font-black text-purple-900">
                      ৳{paginatedStoreCommissionData.reduce((s, d) => s + d.grossCommission, 0)}
                    </td>
                    <td className="py-3.5 px-5 font-black text-emerald-600">
                      ৳{paginatedStoreCommissionData.reduce((s, d) => s + d.totalPaid, 0)}
                    </td>
                    <td className="py-3.5 px-5 text-right font-black text-orange-700 text-sm">
                      Net Due: ৳{paginatedStoreCommissionData.reduce((s, d) => s + d.netDue, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <PaginationControl
              currentPage={safeStorePage}
              totalPages={storeTotalPages}
              totalItems={analyticsData.storeCommissionData.length}
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
                    <th className="py-3.5 px-5">Approved Paybacks (৳)</th>
                    <th className="py-3.5 px-5">Helper Payout (৳)</th>
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
                      <td className="py-4 px-5 font-bold text-gray-700">৳{row.productCosts}</td>
                      <td className="py-4 px-5 font-bold text-gray-900">৳{row.grossFees}</td>
                      <td className="py-4 px-5 font-bold text-emerald-650">৳{row.approvedWithdrawals}</td>
                      <td className="py-4 px-5 font-bold text-indigo-900">৳{row.helperPayouts}</td>
                      <td className="py-4 px-5 text-right font-black text-purple-900 text-sm">
                        +৳{row.netRevenue}
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

      {showOutstandingModal && (
        <OutstandingCommissionsModal
          onClose={() => setShowOutstandingModal(false)}
          totalOutstanding={analyticsData.totalOutstandingLiability}
        />
      )}
    </div>
  );
};
