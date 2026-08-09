'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Order, PricingSettings } from '@/types';
import { calculateHelperCommission } from '@/lib/pricing';
import { fallbackStore } from '@/lib/firebase';
import { PaginationControl } from './PaginationControl';
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
} from 'lucide-react';

interface RevenueAnalyticsProps {
  orders: Order[];
  pricing: PricingSettings;
}

export const RevenueAnalytics: React.FC<RevenueAnalyticsProps> = ({ orders, pricing }) => {
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

  // Reset page to 1 when date filter changes
  useEffect(() => {
    setCurrentPage(1);
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
    const allWallets = Array.from(fallbackStore.wallets.values());
    const totalOutstandingLiability = allWallets.reduce((sum, w) => sum + (w.balance || 0), 0);

    // Calculate all-time figures for the ledger to avoid date range mismatch
    const allDeliveredOrders = orders.filter((o) => o.status === 'DELIVERED');
    const allTimeGrossDeliveryFees = allDeliveredOrders.reduce((sum, o) => sum + o.deliveryFee, 0);
    const allTimeApprovedPayouts = allWithdrawals
      .filter((w) => w.status === 'APPROVED')
      .reduce((sum, w) => sum + w.amount, 0);

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
      dailyBreakdown,
    };
  }, [orders, pricing, startDate, endDate]);

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

      {/* Financial Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* Product Goods Value */}
        <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Total Goods Value
            </span>
            <div className="p-2 rounded-2xl bg-purple-100 text-purple-700">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900 mb-1">
            ৳{analyticsData.totalProductCosts}
          </div>
          <p className="text-[11px] text-gray-500 font-medium">
            Canceled in period: <span className="text-red-600 font-bold">{analyticsData.canceledCount}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-gray-100 pt-6">
        {/* Approved Withdrawals (Disbursed) */}
        <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Approved Cash Payouts
            </span>
            <div className="p-2 rounded-2xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-800 mb-1">
            ৳{analyticsData.allTimeApprovedPayouts}
          </div>
          <p className="text-[11px] text-emerald-600 font-medium">
            Total cash sent to helpers (All-time)
          </p>
        </div>

        {/* Pending Withdrawals (Requested) */}
        <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Pending Withdrawal Requests
            </span>
            <div className="p-2 rounded-2xl bg-amber-100 text-amber-700">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-800 mb-1">
            ৳{analyticsData.totalPendingPayouts}
          </div>
          <p className="text-[11px] text-amber-600 font-medium">
            Awaiting admin approval
          </p>
        </div>

        {/* Outstanding Helper Wallets Liability */}
        <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-soft">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Outstanding Wallet Liability
            </span>
            <div className="p-2 rounded-2xl bg-indigo-100 text-indigo-700">
              <Bike className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-indigo-900 mb-1">
            ৳{analyticsData.totalOutstandingLiability}
          </div>
          <p className="text-[11px] text-indigo-700 font-semibold">
            Helper wallet balances (owed)
          </p>
        </div>
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
                    <th className="py-3.5 px-5">Approved Payouts (৳)</th>
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
                      <td className="py-4 px-5 font-bold text-red-600">৳{row.approvedWithdrawals}</td>
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
    </div>
  );
};
