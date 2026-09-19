'use client';

import React, { useState, useMemo } from 'react';
import { Order, WithdrawalRequest } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { calculateHelperCommission } from '@/lib/pricing';
import {
  X,
  Bike,
  Phone,
  ShoppingBag,
  DollarSign,
  Wallet as WalletIcon,
  CheckCircle2,
  ChevronRight,
  FileText,
  Calendar,
  Filter,
  Receipt,
  TrendingUp,
  Clock,
  MapPin,
  Search,
} from 'lucide-react';
import { AdminOrderDetailsModal } from './AdminOrderDetailsModal';
import { PaginationControl } from './PaginationControl';

interface HelperHistoryModalProps {
  helperId: string;
  helperName: string;
  onClose: () => void;
}

export const HelperHistoryModal: React.FC<HelperHistoryModalProps> = ({
  helperId,
  helperName,
  onClose,
  }) => {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'EARNINGS' | 'JOBS' | 'PAYBACKS'>('EARNINGS');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');

  // Date Range Filtering State
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activePreset, setActivePreset] = useState<'ALL_TIME' | 'TODAY' | 'LAST_7' | 'THIS_MONTH' | 'CUSTOM'>('ALL_TIME');
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);

  // Local YYYY-MM-DD Helper
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

  const handlePresetSelect = (preset: 'ALL_TIME' | 'TODAY' | 'LAST_7' | 'THIS_MONTH' | 'CUSTOM') => {
    setActivePreset(preset);
    setCurrentPage(1);
    if (preset === 'CUSTOM') {
      setShowCustomPicker((prev) => !prev);
      return;
    }
    setShowCustomPicker(false);
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

  const formatExactDateTime = (dateStr?: string | number) => {
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

  // Fetch helper application & profile
  const application = Array.from(fallbackStore.helperApplications.values()).find(
    (a) => a.userId === helperId
  );
  const userProfile = fallbackStore.users.get(helperId);

  // Fetch assigned orders
  const allOrders = Array.from(fallbackStore.orders.values());
  const helperOrders = useMemo(() => {
    return allOrders
      .filter((o) => o.helperId === helperId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allOrders, helperId]);

  // Fetch wallet & transactions & withdrawals
  const wallet = fallbackStore.getHelperWallet(helperId);
  const walletTxs = fallbackStore.walletTransactions.get(helperId) || [];
  const helperWithdrawals = Array.from(fallbackStore.withdrawals.values()).filter(
    (w) => w.helperId === helperId
  );

  // Order financials calculator
  const getOrderFinancials = (o: Order) => {
    const minFee = fallbackStore.pricingSettings.feeCalculatorMinFee ?? 20;
    const baseFeeForHelper = o.isFreeDelivery
      ? Math.max(o.originalDeliveryFee || 0, minFee)
      : Math.max(o.deliveryFee || 0, minFee);
    const helperShare = calculateHelperCommission(baseFeeForHelper, fallbackStore.pricingSettings);
    const platformShare = baseFeeForHelper - helperShare;
    return {
      baseFeeForHelper,
      helperShare,
      platformShare,
    };
  };

  // Filter helper orders based on selected Date Range
  const dateFilteredOrders = useMemo(() => {
    return helperOrders.filter((ord) => {
      const orderDate = ord.deliveredAt || ord.updatedAt || ord.createdAt;
      const t = new Date(orderDate).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [helperOrders, startDate, endDate]);

  // Filter delivered orders in date range
  const filteredDeliveredOrders = useMemo(() => {
    return dateFilteredOrders
      .filter((o) => o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED')
      .sort((a, b) => {
        const timeA = new Date(a.deliveredAt || a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.deliveredAt || b.updatedAt || b.createdAt).getTime();
        return timeB - timeA;
      });
  }, [dateFilteredOrders]);

  // Filtered withdrawals in date range
  const filteredWithdrawals = useMemo(() => {
    return helperWithdrawals.filter((w) => {
      const t = new Date(w.createdAt).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [helperWithdrawals, startDate, endDate]);

  // Filtered Earnings & KPIs
  const earningsMetrics = useMemo(() => {
    let totalCollected = 0;
    let totalEarned = 0;
    let totalPlatformShare = 0;
    let paidCommission = 0;

    filteredDeliveredOrders.forEach((o) => {
      const { baseFeeForHelper, helperShare, platformShare } = getOrderFinancials(o);
      totalCollected += baseFeeForHelper;
      totalEarned += helperShare;
      totalPlatformShare += platformShare;
    });

    filteredWithdrawals.forEach((w) => {
      if (w.status === 'APPROVED') {
        paidCommission += w.amount;
      }
    });

    // Average Delivery Time Calculation
    let totalDurationMs = 0;
    let countWithDuration = 0;
    filteredDeliveredOrders.forEach((o) => {
      if (o.deliveredAt && (o.acceptedAt || o.createdAt)) {
        const dur = new Date(o.deliveredAt).getTime() - new Date(o.acceptedAt || o.createdAt).getTime();
        if (dur > 0) {
          totalDurationMs += dur;
          countWithDuration++;
        }
      }
    });
    const avgDeliveryTimeMins = countWithDuration > 0 ? Math.round(totalDurationMs / (1000 * 60 * countWithDuration)) : 0;
    const avgDeliveryTimeText = avgDeliveryTimeMins > 0 ? `${avgDeliveryTimeMins} mins` : 'N/A';

    return {
      totalCollected,
      totalEarned,
      totalPlatformShare,
      paidCommission,
      dueCommission: Math.max(0, totalPlatformShare - paidCommission),
      completedCount: filteredDeliveredOrders.length,
      avgDeliveryTimeText,
    };
  }, [filteredDeliveredOrders, filteredWithdrawals]);

  // Tab: All Jobs Filtered (with status + text search)
  const tabJobsFiltered = useMemo(() => {
    return dateFilteredOrders.filter((ord) => {
      if (orderStatusFilter !== 'ALL' && ord.status !== orderStatusFilter) {
        return false;
      }
      if (orderSearchQuery.trim()) {
        const q = orderSearchQuery.toLowerCase();
        const idMatch = ord.id.toLowerCase().includes(q);
        const titleMatch = (ord.title || '').toLowerCase().includes(q);
        const custMatch = (ord.customerName || '').toLowerCase().includes(q) || (ord.customerPhone || '').includes(q);
        if (!idMatch && !titleMatch && !custMatch) return false;
      }
      return true;
    });
  }, [dateFilteredOrders, orderStatusFilter, orderSearchQuery]);

  // Pagination for Earnings tab
  const [earningsPage, setEarningsPage] = useState(1);
  const earningsPageSize = 10;
  const totalEarningsPages = Math.ceil(filteredDeliveredOrders.length / earningsPageSize) || 1;
  const paginatedDeliveredOrders = filteredDeliveredOrders.slice(
    (earningsPage - 1) * earningsPageSize,
    earningsPage * earningsPageSize
  );

  // Pagination for All Jobs tab
  const totalJobsPages = Math.ceil(tabJobsFiltered.length / pageSize) || 1;
  const paginatedJobs = tabJobsFiltered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const presetLabels = {
    ALL_TIME: 'All Time',
    TODAY: 'Today',
    LAST_7: 'Last 7 Days',
    THIS_MONTH: 'This Month',
    CUSTOM: 'Custom',
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-indigo-950 via-purple-900 to-indigo-900 text-white flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20">
                <Bike className="w-6 h-6 text-indigo-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-lg">{application?.legalName || helperName}</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/40 text-indigo-100 border border-indigo-300/30">
                    {userProfile?.helperType === 'dedicated' ? '⚡ Dedicated Rider' : '🚲 Commuter Helper'}
                  </span>
                </div>
                <p className="text-xs text-indigo-200">
                  NID: {application?.nid || 'N/A'} • Phone: {userProfile?.alternativePhone || 'N/A'} • UID: {helperId}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-2xl bg-rose-500/80 hover:bg-rose-600 text-white transition-colors shadow-sm cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Date Filter Bar */}
          <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-purple-700" />
                <span>Date Range:</span>
              </span>
              {(['ALL_TIME', 'TODAY', 'LAST_7', 'THIS_MONTH', 'CUSTOM'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className={`px-3 py-1 rounded-xl font-extrabold text-xs transition-all ${
                    activePreset === preset
                      ? 'bg-purple-900 text-white shadow-xs'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {presetLabels[preset]}
                </button>
              ))}
            </div>

            {/* Custom Date Range Pickers */}
            {activePreset === 'CUSTOM' && (
              <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-gray-200">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                    setEarningsPage(1);
                  }}
                  className="px-2 py-1 bg-gray-50 rounded-lg text-xs font-bold text-gray-800 border border-gray-200 outline-none"
                />
                <span className="text-gray-400 font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                    setEarningsPage(1);
                  }}
                  className="px-2 py-1 bg-gray-50 rounded-lg text-xs font-bold text-gray-800 border border-gray-200 outline-none"
                />
              </div>
            )}
          </div>

          {/* Stats Summary Bar (Calculated from selected Date Filter) */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 p-3.5 bg-indigo-50/50 border-b border-gray-200 text-center text-xs">
            <div className="p-2.5 bg-white rounded-2xl border border-gray-200/80 shadow-xs">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Collected</span>
              <span className="text-lg font-black text-indigo-950">৳{earningsMetrics.totalCollected}</span>
              <span className="text-[9px] text-gray-400 block">Charges Before Comm.</span>
            </div>
            <div className="p-2.5 bg-white rounded-2xl border border-emerald-200 shadow-xs">
              <span className="text-[10px] font-bold text-emerald-700 uppercase block">Helper Net Earned</span>
              <span className="text-lg font-black text-emerald-600">৳{earningsMetrics.totalEarned}</span>
              <span className="text-[9px] text-emerald-600/70 block">Helper Income</span>
            </div>
            <div className="p-2.5 bg-white rounded-2xl border border-gray-200/80 shadow-xs">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Platform Comm.</span>
              <span className="text-lg font-black text-purple-900">৳{earningsMetrics.totalPlatformShare}</span>
              <span className="text-[9px] text-gray-400 block">Platform Share</span>
            </div>
            <div className="p-2.5 bg-white rounded-2xl border border-gray-200/80 shadow-xs">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Paid Comm.</span>
              <span className="text-lg font-black text-blue-600">৳{earningsMetrics.paidCommission}</span>
              <span className="text-[9px] text-gray-400 block">Approved Paybacks</span>
            </div>
            <div className="p-2.5 bg-white rounded-2xl border border-amber-200 shadow-xs">
              <span className="text-[10px] font-bold text-amber-700 uppercase block">Due Commission</span>
              <span className="text-lg font-black text-amber-600">
                ৳{activePreset === 'ALL_TIME' ? (wallet.balance || 0) : earningsMetrics.dueCommission}
              </span>
              <span className="text-[9px] text-amber-600/70 block">Current Balance</span>
            </div>
            <div className="p-2.5 bg-white rounded-2xl border border-gray-200/80 shadow-xs">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Delivered</span>
              <span className="text-lg font-black text-gray-800">{earningsMetrics.completedCount} jobs</span>
              <span className="text-[9px] text-gray-400 block">Avg: {earningsMetrics.avgDeliveryTimeText}</span>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-gray-200 bg-gray-100/60 px-4 pt-2 gap-2 text-xs font-extrabold">
            <button
              onClick={() => setActiveTab('EARNINGS')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all flex items-center gap-1.5 ${
                activeTab === 'EARNINGS'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 text-purple-700" />
              <span>Earnings History ({filteredDeliveredOrders.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('JOBS')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all flex items-center gap-1.5 ${
                activeTab === 'JOBS'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 text-indigo-700" />
              <span>All Assigned Orders ({dateFilteredOrders.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('PAYBACKS')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all flex items-center gap-1.5 ${
                activeTab === 'PAYBACKS'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <WalletIcon className="w-3.5 h-3.5 text-emerald-700" />
              <span>Paybacks & Wallet ({filteredWithdrawals.length})</span>
            </button>
          </div>

          {/* Content Area */}
          <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
            {/* TAB 1: EARNINGS BREAKDOWN */}
            {activeTab === 'EARNINGS' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="font-bold">
                    Showing delivered orders for: <strong className="text-gray-900">{presetLabels[activePreset]}</strong> ({filteredDeliveredOrders.length} orders)
                  </span>
                  <span className="font-semibold text-emerald-700">
                    Total Helper Earned: ৳{earningsMetrics.totalEarned} • Total Collected: ৳{earningsMetrics.totalCollected}
                  </span>
                </div>

                {paginatedDeliveredOrders.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <ShoppingBag className="w-10 h-10 mx-auto text-gray-300" />
                    <p className="font-bold text-gray-600">No completed earnings found in this date range.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paginatedDeliveredOrders.map((ord) => {
                      const { baseFeeForHelper, helperShare, platformShare } = getOrderFinancials(ord);
                      const itemsSummary = ord.items && ord.items.length > 0
                        ? ord.items.map((i) => `${i.name}${i.qty ? ` (${i.qty})` : ''}`).join(', ')
                        : ord.title || 'Delivery Request';

                      return (
                        <div
                          key={ord.id}
                          className="p-3.5 rounded-2xl bg-white border border-gray-200 hover:border-purple-300 hover:shadow-xs transition-all flex items-start justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-gray-900">#{ord.id}</span>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800">
                                DELIVERED
                              </span>
                              {ord.isFreeDelivery && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-700">
                                  Free Delivery Promo
                                </span>
                              )}
                              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-gray-400" />
                                <span>{formatExactDateTime(ord.deliveredAt || ord.updatedAt || ord.createdAt)}</span>
                              </span>
                            </div>

                            <p className="font-extrabold text-gray-800 text-xs">{itemsSummary}</p>
                            <p className="text-[11px] text-gray-500">
                              Customer: <strong className="text-gray-700">{ord.customerName}</strong> ({ord.customerPhone})
                            </p>

                            {(ord.pickupLocation?.address || ord.deliveryLocation?.address) && (
                              <div className="text-[10px] text-gray-600 space-y-0.5 pt-1">
                                {ord.pickupLocation?.address && (
                                  <div className="truncate">
                                    <span className="font-bold text-amber-700">Pickup:</span> {ord.pickupLocation.address}
                                  </div>
                                )}
                                {ord.deliveryLocation?.address && (
                                  <div className="truncate">
                                    <span className="font-bold text-emerald-700">Drop:</span> {ord.deliveryLocation.address}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right Side Financials */}
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="text-right bg-emerald-50 border border-emerald-200/80 p-2.5 rounded-xl min-w-[110px]">
                              <span className="text-[9px] font-bold text-emerald-800 uppercase block">Helper Earned</span>
                              <span className="text-base font-black text-emerald-700 block">+৳{helperShare}</span>
                              <div className="text-[9px] text-gray-500 font-semibold border-t border-emerald-200/60 mt-1 pt-0.5">
                                <span>Charge: ৳{baseFeeForHelper}</span>
                                <span className="block text-purple-900">Platform: ৳{platformShare}</span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedOrderId(ord.id)}
                              className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 font-extrabold text-[10px] transition-colors flex items-center gap-1"
                            >
                              <span>Order Details</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredDeliveredOrders.length > earningsPageSize && (
                  <PaginationControl
                    currentPage={earningsPage}
                    totalPages={totalEarningsPages}
                    totalItems={filteredDeliveredOrders.length}
                    pageSize={earningsPageSize}
                    onPageChange={(p) => setEarningsPage(p)}
                    onPageSizeChange={() => {}}
                  />
                )}
              </div>
            )}

            {/* TAB 2: ALL ASSIGNED JOBS */}
            {activeTab === 'JOBS' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap bg-gray-50 p-2 rounded-2xl border border-gray-200">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search order ID, title, customer..."
                      value={orderSearchQuery}
                      onChange={(e) => {
                        setOrderSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-8 pr-3 py-1.5 bg-white rounded-xl border border-gray-200 text-xs font-bold text-gray-800 outline-none"
                    />
                  </div>

                  <select
                    value={orderStatusFilter}
                    onChange={(e) => {
                      setOrderStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="PURCHASED_EXECUTED">Processing</option>
                    <option value="ON_THE_WAY">On The Way</option>
                    <option value="ARRIVED">Arrived</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="CANCELED">Canceled</option>
                  </select>
                </div>

                {paginatedJobs.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="font-bold">No orders found matching the filter.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paginatedJobs.map((ord) => (
                      <div
                        key={ord.id}
                        onClick={() => setSelectedOrderId(ord.id)}
                        className="p-3.5 rounded-2xl bg-white border border-gray-200 hover:border-purple-300 hover:shadow-soft transition-all cursor-pointer flex items-center justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-black text-gray-900">#{ord.id}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                ord.status === 'DELIVERED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ord.status === 'CANCELED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {ord.status}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {formatExactDateTime(ord.createdAt)}
                            </span>
                          </div>
                          <p className="font-extrabold text-gray-800">{ord.title || ord.items?.[0]?.name || 'Order'}</p>
                          <p className="text-[11px] text-gray-500">
                            Customer: {ord.customerName} • Fee: ৳{ord.deliveryFee}
                          </p>
                        </div>

                        <div className="flex items-center space-x-2 text-purple-900 font-extrabold">
                          <span>Details</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {tabJobsFiltered.length > pageSize && (
                  <PaginationControl
                    currentPage={currentPage}
                    totalPages={totalJobsPages}
                    totalItems={tabJobsFiltered.length}
                    pageSize={pageSize}
                    onPageChange={(p) => setCurrentPage(p)}
                    onPageSizeChange={(s) => {
                      setPageSize(s);
                      setCurrentPage(1);
                    }}
                  />
                )}
              </div>
            )}

            {/* TAB 3: PAYBACKS & TRANSACTIONS */}
            {activeTab === 'PAYBACKS' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
                    Commission Payback Requests ({filteredWithdrawals.length})
                  </h4>
                  {filteredWithdrawals.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 bg-gray-50 rounded-2xl border border-gray-200">
                      <p className="font-bold">No commission payback requests recorded in this period.</p>
                    </div>
                  ) : (
                    filteredWithdrawals.map((w) => (
                      <div
                        key={w.id}
                        className="p-3.5 rounded-2xl bg-white border border-gray-200 flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-gray-900">৳{w.amount}</span>
                            <span className="text-[11px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                              {w.paymentMethod}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Account/Tx: <strong className="text-gray-700">{w.accountNumber || 'N/A'}</strong>
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {formatExactDateTime(w.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                            w.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : w.status === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {w.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Immutable Wallet Transactions */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
                    Raw Wallet Ledger ({walletTxs.length})
                  </h4>
                  {walletTxs.length === 0 ? (
                    <div className="p-4 text-center text-gray-400 bg-gray-50 rounded-2xl border border-gray-200">
                      <p className="font-bold">No raw ledger transactions.</p>
                    </div>
                  ) : (
                    walletTxs.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 rounded-2xl bg-white border border-gray-200 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-extrabold text-gray-900">{tx.description}</p>
                          <p className="text-[10px] text-gray-400">
                            {formatExactDateTime(tx.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`font-black text-sm ${
                            tx.amount > 0 ? 'text-emerald-600' : 'text-purple-900'
                          }`}
                        >
                          {tx.amount > 0 ? `+৳${tx.amount}` : `-৳${Math.abs(tx.amount)}`}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
            <button
              onClick={onClose}
              className="py-2.5 px-5 rounded-2xl bg-rose-50 hover:bg-rose-100 font-extrabold text-xs text-rose-600 border border-rose-200 active:scale-95 transition-colors cursor-pointer"
            >
              Close History
            </button>
          </div>
        </div>
      </div>

      {/* Admin Order Details Modal */}
      {selectedOrderId && (
        <AdminOrderDetailsModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}
    </>
  );
};
