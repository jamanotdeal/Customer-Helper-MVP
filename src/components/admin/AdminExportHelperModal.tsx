'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderFeedback } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import {
  exportHelperPerformanceToCSV,
  exportHelperPerformanceToPDF,
  exportFleetComparisonToCSV,
  calculateHelperPerformanceMetrics,
  getOrderDelayInfo,
  isFeedbackNegative,
  HelperExportTarget,
} from '@/lib/exportUtils';
import {
  X,
  Download,
  Calendar,
  Search,
  Bike,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Store,
  FileSpreadsheet,
  FileText,
  User,
  Users,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';

export interface AdminExportHelperModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialHelperId?: string | null;
  helpers: Array<{
    id: string;
    name: string;
    phone?: string;
    nid?: string;
    helperType?: string;
    status?: string;
    completedJobs?: number;
    activeOrders?: number;
    totalEarned?: number;
    balance?: number;
  }>;
  allOrders: Order[];
  defaultPreset?: string;
  defaultStartDate?: string;
  defaultEndDate?: string;
}

type PresetType = 'ALL_TIME' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH' | 'CUSTOM';

export const AdminExportHelperModal: React.FC<AdminExportHelperModalProps> = ({
  isOpen,
  onClose,
  initialHelperId,
  helpers,
  allOrders,
  defaultPreset = 'ALL_TIME',
  defaultStartDate = '',
  defaultEndDate = '',
}) => {
  const [selectedHelperId, setSelectedHelperId] = useState<string>(initialHelperId || (helpers[0]?.id ?? ''));
  const [isExportAllFleet, setIsExportAllFleet] = useState<boolean>(false);
  const [helperSearch, setHelperSearch] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [activeMetricTab, setActiveMetricTab] = useState<'NONE' | 'LATE' | 'CANCELLED' | 'ORDERS_PER_DAY' | 'REVIEWS'>('NONE');
  const [reviewSubFilter, setReviewSubFilter] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE'>('ALL');

  // Date Range state
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

  const [activePreset, setActivePreset] = useState<PresetType>(
    (defaultPreset as PresetType) || 'ALL_TIME'
  );
  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [endDate, setEndDate] = useState<string>(defaultEndDate);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Sync initialHelperId if prop changes
  useEffect(() => {
    if (initialHelperId) {
      setSelectedHelperId(initialHelperId);
      setIsExportAllFleet(false);
    } else if (helpers.length > 0 && !selectedHelperId) {
      setSelectedHelperId(helpers[0].id);
    }
  }, [initialHelperId, helpers]);

  const handlePresetChange = (preset: PresetType) => {
    setActivePreset(preset);
    if (preset === 'ALL_TIME') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      const today = getTodayStr();
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'YESTERDAY') {
      const y = getDaysAgoStr(1);
      setStartDate(y);
      setEndDate(y);
    } else if (preset === 'LAST_7') {
      setStartDate(getDaysAgoStr(6));
      setEndDate(getTodayStr());
    } else if (preset === 'LAST_30') {
      setStartDate(getDaysAgoStr(29));
      setEndDate(getTodayStr());
    } else if (preset === 'THIS_MONTH') {
      setStartDate(getStartOfMonthStr());
      setEndDate(getTodayStr());
    }
  };

  // Filtered helpers list for selector
  const filteredHelpers = useMemo(() => {
    if (!helperSearch.trim()) return helpers;
    const q = helperSearch.toLowerCase().trim();
    return helpers.filter((h) => {
      const name = (h.name || '').toLowerCase();
      const phone = (h.phone || '').toLowerCase();
      const nid = (h.nid || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || nid.includes(q);
    });
  }, [helpers, helperSearch]);

  const currentHelper = useMemo(() => {
    return helpers.find((h) => h.id === selectedHelperId) || helpers[0] || null;
  }, [helpers, selectedHelperId]);

  // Orders for currently selected helper in date range
  const selectedHelperOrders = useMemo(() => {
    if (!currentHelper) return [];
    return allOrders.filter((o) => {
      if (o.helperId !== currentHelper.id) return false;
      const orderDate = o.deliveredAt || o.updatedAt || o.createdAt;
      const t = new Date(orderDate).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [allOrders, currentHelper, startDate, endDate]);

  // Feedbacks for selected helper
  const selectedHelperFeedbacks = useMemo(() => {
    if (!currentHelper) return [];
    const storeFeedbacks = Array.from(fallbackStore.orderFeedbacks.values());
    const helperOrderIds = new Set(selectedHelperOrders.map((o) => o.id));

    const fbMap = new Map<string, OrderFeedback>();
    storeFeedbacks.forEach((f) => {
      if (f.helperId === currentHelper.id || helperOrderIds.has(f.orderId)) {
        fbMap.set(f.id, f);
      }
    });

    selectedHelperOrders.forEach((o) => {
      if (o.feedback?.id) {
        fbMap.set(o.feedback.id, o.feedback);
      }
    });

    return Array.from(fbMap.values()).filter((fb) => {
      const t = new Date(fb.createdAt).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [currentHelper, selectedHelperOrders, startDate, endDate]);

  // Calculate live preview metrics
  const previewMetrics = useMemo(() => {
    if (!currentHelper) return null;
    return calculateHelperPerformanceMetrics(
      selectedHelperOrders,
      selectedHelperFeedbacks,
      startDate,
      endDate
    );
  }, [currentHelper, selectedHelperOrders, selectedHelperFeedbacks, startDate, endDate]);

  const periodLabelText = useMemo(() => {
    if (activePreset === 'ALL_TIME') return 'All Time';
    if (activePreset === 'TODAY') return 'Today';
    if (activePreset === 'YESTERDAY') return 'Yesterday';
    if (activePreset === 'LAST_7') return 'Last 7 Days';
    if (activePreset === 'LAST_30') return 'Last 30 Days';
    if (activePreset === 'THIS_MONTH') return 'This Month';
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    return 'Custom Range';
  }, [activePreset, startDate, endDate]);

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      if (isExportAllFleet) {
        const allFeedbacks = Array.from(fallbackStore.orderFeedbacks.values());
        const exportTargets: HelperExportTarget[] = helpers.map((h) => ({
          id: h.id,
          name: h.name,
          phone: h.phone,
          nid: h.nid,
          helperType: h.helperType,
          status: h.status,
          totalEarned: h.totalEarned,
          balance: h.balance,
        }));
        exportFleetComparisonToCSV(exportTargets, allOrders, allFeedbacks, periodLabelText);
      } else if (currentHelper) {
        // Ensure helper's orders are fetched
        await fallbackStore.fetchOrdersForUser(currentHelper.id, 'helper');
        const helperTarget: HelperExportTarget = {
          id: currentHelper.id,
          name: currentHelper.name,
          phone: currentHelper.phone,
          nid: currentHelper.nid,
          helperType: currentHelper.helperType,
          status: currentHelper.status,
          totalEarned: currentHelper.totalEarned,
          balance: currentHelper.balance,
        };
        exportHelperPerformanceToCSV({
          helper: helperTarget,
          orders: selectedHelperOrders,
          feedbacks: selectedHelperFeedbacks,
          periodLabel: periodLabelText,
          startDate,
          endDate,
        });
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!currentHelper || isExportAllFleet) return;
    setIsExporting(true);
    try {
      await fallbackStore.fetchOrdersForUser(currentHelper.id, 'helper');
      const helperTarget: HelperExportTarget = {
        id: currentHelper.id,
        name: currentHelper.name,
        phone: currentHelper.phone,
        nid: currentHelper.nid,
        helperType: currentHelper.helperType,
        status: currentHelper.status,
        totalEarned: currentHelper.totalEarned,
        balance: currentHelper.balance,
      };
      exportHelperPerformanceToPDF({
        helper: helperTarget,
        orders: selectedHelperOrders,
        feedbacks: selectedHelperFeedbacks,
        periodLabel: periodLabelText,
        startDate,
        endDate,
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
              <FileSpreadsheet className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg sm:text-xl tracking-tight">Export Helper Performance Sheet</h3>
              <p className="text-xs text-emerald-200 font-medium">
                Download comprehensive Excel / Sheet data & operations metrics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Export Mode Toggle */}
          <div className="flex items-center gap-2 p-1.5 bg-gray-100 rounded-2xl border border-gray-200">
            <button
              type="button"
              onClick={() => setIsExportAllFleet(false)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 ${
                !isExportAllFleet
                  ? 'bg-white text-emerald-950 shadow-sm border border-gray-200/60'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <User className="w-4 h-4 text-emerald-600" />
              <span>Single Selected Helper</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExportAllFleet(true)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 ${
                isExportAllFleet
                  ? 'bg-white text-emerald-950 shadow-sm border border-gray-200/60'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-600" />
              <span>All Registered Helpers ({helpers.length})</span>
            </button>
          </div>

          {/* Helper Selection Dropdown (Only when Single Helper mode) */}
          {!isExportAllFleet && (
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <Bike className="w-4 h-4 text-emerald-600" />
                <span>Select Helper</span>
              </label>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full py-3 px-4 bg-gray-50 hover:bg-gray-100/80 border border-gray-200 rounded-2xl text-left flex items-center justify-between transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {currentHelper ? (
                    <div className="flex items-center space-x-3 truncate">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center shrink-0">
                        {currentHelper.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <p className="font-extrabold text-sm text-gray-900 truncate">{currentHelper.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {currentHelper.phone || 'No Phone'} {currentHelper.nid ? `• NID: ${currentHelper.nid}` : ''} •{' '}
                          <span className="font-bold text-emerald-700">
                            {currentHelper.helperType === 'dedicated' ? '⚡ Dedicated' : '🚲 Commuter'}
                          </span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">Select a helper...</span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl z-20 overflow-hidden max-h-64 flex flex-col animate-in fade-in zoom-in-95 duration-150">
                    <div className="p-2.5 border-b border-gray-100 bg-gray-50">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={helperSearch}
                          onChange={(e) => setHelperSearch(e.target.value)}
                          placeholder="Search helper by name, phone, NID..."
                          className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:outline-none focus:border-emerald-500"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="overflow-y-auto divide-y divide-gray-50 p-1">
                      {filteredHelpers.length === 0 ? (
                        <p className="p-4 text-center text-xs text-gray-400 font-medium">No helpers found.</p>
                      ) : (
                        filteredHelpers.map((h) => {
                          const isSelected = h.id === selectedHelperId;
                          return (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => {
                                setSelectedHelperId(h.id);
                                setIsDropdownOpen(false);
                              }}
                              className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-colors ${
                                isSelected ? 'bg-emerald-50 text-emerald-950 font-bold' : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center space-x-2.5 truncate">
                                <div
                                  className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center shrink-0 ${
                                    isSelected ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'
                                  }`}
                                >
                                  {h.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="truncate">
                                  <p className="text-xs font-bold text-gray-900 truncate">{h.name}</p>
                                  <p className="text-[11px] text-gray-500 truncate">
                                    {h.phone || 'No phone'} • {h.completedJobs ?? 0} jobs
                                  </p>
                                </div>
                              </div>
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Date Range Presets */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>Date Range Period</span>
            </label>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'ALL_TIME', label: 'All Time' },
                  { id: 'TODAY', label: 'Today' },
                  { id: 'YESTERDAY', label: 'Yesterday' },
                  { id: 'LAST_7', label: 'Last 7 Days' },
                  { id: 'LAST_30', label: 'Last 30 Days' },
                  { id: 'THIS_MONTH', label: 'This Month' },
                  { id: 'CUSTOM', label: 'Custom Range' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetChange(preset.id)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-extrabold transition-all ${
                    activePreset === preset.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            {activePreset === 'CUSTOM' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[11px] font-bold text-gray-600 mb-1 block">From (Start Date)</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-600 mb-1 block">To (End Date)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Live Preview Card (Single helper mode) */}
          {!isExportAllFleet && previewMetrics && currentHelper && (
            <div className="p-4 bg-gradient-to-br from-emerald-50/70 via-teal-50/50 to-indigo-50/40 rounded-2xl border border-emerald-100 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-100/80 pb-2">
                <span className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Metrics Preview ({periodLabelText})</span>
                </span>
                <span className="text-[11px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200">
                  {previewMetrics.totalOrders} orders recorded
                </span>
              </div>

              {/* 8-Grid Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                {/* 1. Delivered */}
                <div className="p-2.5 bg-white rounded-xl border border-emerald-100 shadow-2xs">
                  <p className="text-[10px] uppercase font-bold text-gray-500">Delivered</p>
                  <p className="text-base font-black text-emerald-700">{previewMetrics.deliveredOrders}</p>
                  <p className="text-[10px] text-gray-400 font-semibold">{previewMetrics.deliverySuccessRate}% success</p>
                </div>

                {/* 2. Late Orders (Interactive) */}
                <button
                  type="button"
                  onClick={() => setActiveMetricTab((prev) => (prev === 'LATE' ? 'NONE' : 'LATE'))}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer relative group ${
                    activeMetricTab === 'LATE'
                      ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500 shadow-sm'
                      : 'bg-white border-emerald-100 hover:border-rose-300 hover:shadow-xs'
                  }`}
                  title="Click to view late orders list"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Late Orders</p>
                    <span className="text-[8px] font-black text-rose-700 bg-rose-100/80 px-1 py-0.2 rounded-sm uppercase tracking-tight">
                      {activeMetricTab === 'LATE' ? 'Close' : 'View'}
                    </span>
                  </div>
                  <p className={`text-base font-black ${previewMetrics.lateOrders > 0 ? 'text-rose-600' : 'text-gray-700'}`}>
                    {previewMetrics.lateOrders}
                  </p>
                  <p className="text-[10px] text-gray-400 font-semibold">&gt; 1 hour delay</p>
                </button>

                {/* 3. Cancelled (Interactive) */}
                <button
                  type="button"
                  onClick={() => setActiveMetricTab((prev) => (prev === 'CANCELLED' ? 'NONE' : 'CANCELLED'))}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer relative group ${
                    activeMetricTab === 'CANCELLED'
                      ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500 shadow-sm'
                      : 'bg-white border-emerald-100 hover:border-amber-300 hover:shadow-xs'
                  }`}
                  title="Click to view cancelled orders list"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Cancelled</p>
                    <span className="text-[8px] font-black text-amber-700 bg-amber-100/80 px-1 py-0.2 rounded-sm uppercase tracking-tight">
                      {activeMetricTab === 'CANCELLED' ? 'Close' : 'View'}
                    </span>
                  </div>
                  <p className={`text-base font-black ${previewMetrics.cancelledOrders > 0 ? 'text-amber-600' : 'text-gray-700'}`}>
                    {previewMetrics.cancelledOrders}
                  </p>
                  <p className="text-[10px] text-gray-400 font-semibold">{previewMetrics.failureRate}% failure</p>
                </button>

                {/* 4. Orders / Day (Interactive) */}
                <button
                  type="button"
                  onClick={() => setActiveMetricTab((prev) => (prev === 'ORDERS_PER_DAY' ? 'NONE' : 'ORDERS_PER_DAY'))}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer relative group ${
                    activeMetricTab === 'ORDERS_PER_DAY'
                      ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500 shadow-sm'
                      : 'bg-white border-emerald-100 hover:border-indigo-300 hover:shadow-xs'
                  }`}
                  title="Click to view daily orders breakdown"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Orders / Day</p>
                    <span className="text-[8px] font-black text-indigo-700 bg-indigo-100/80 px-1 py-0.2 rounded-sm uppercase tracking-tight">
                      {activeMetricTab === 'ORDERS_PER_DAY' ? 'Close' : 'View'}
                    </span>
                  </div>
                  <p className="text-base font-black text-indigo-700">{previewMetrics.avgOrdersPerActiveDay}</p>
                  <p className="text-[10px] text-gray-400 font-semibold">avg / active day</p>
                </button>

                {/* 5. Avg Accept Time */}
                <div className="p-2.5 bg-white rounded-xl border border-emerald-100 shadow-2xs">
                  <p className="text-[10px] uppercase font-bold text-gray-500">Avg Accept Time</p>
                  <p className="text-sm font-black text-blue-700 truncate">{previewMetrics.avgAcceptingTimeFormatted}</p>
                  <p className="text-[10px] text-gray-400 font-semibold">from placement</p>
                </div>

                {/* 6. Avg Delivery */}
                <div className="p-2.5 bg-white rounded-xl border border-emerald-100 shadow-2xs">
                  <p className="text-[10px] uppercase font-bold text-gray-500">Avg Delivery</p>
                  <p className="text-sm font-black text-purple-700 truncate">{previewMetrics.avgDeliveryTimeFormatted}</p>
                  <p className="text-[10px] text-gray-400 font-semibold">accept to drop</p>
                </div>

                {/* 7. Partner Store */}
                <div className="p-2.5 bg-white rounded-xl border border-emerald-100 shadow-2xs">
                  <p className="text-[10px] uppercase font-bold text-gray-500">Partner Store</p>
                  <p className="text-base font-black text-amber-700">{previewMetrics.storeOrdersPercent}%</p>
                  <p className="text-[10px] text-gray-400 font-semibold">{previewMetrics.storeOrdersCount} store orders</p>
                </div>

                {/* 8. Reviews & Feedback (Interactive + Positive/Negative counts, no 5-star) */}
                <button
                  type="button"
                  onClick={() => setActiveMetricTab((prev) => (prev === 'REVIEWS' ? 'NONE' : 'REVIEWS'))}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer relative group ${
                    activeMetricTab === 'REVIEWS'
                      ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-600 shadow-sm'
                      : 'bg-white border-emerald-100 hover:border-emerald-300 hover:shadow-xs'
                  }`}
                  title="Click to view customer feedback"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Reviews & Feedback</p>
                    <span className="text-[8px] font-black text-emerald-700 bg-emerald-100/80 px-1 py-0.2 rounded-sm uppercase tracking-tight">
                      {activeMetricTab === 'REVIEWS' ? 'Close' : 'View'}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 py-0.5">
                    <span className="text-xs font-black text-emerald-700 flex items-center gap-0.5" title="Positive Reviews">
                      <ThumbsUp className="w-3.5 h-3.5 fill-emerald-100" />
                      <span>{previewMetrics.positiveReviews}</span>
                    </span>
                    <span className="text-xs text-gray-300 font-bold">|</span>
                    <span className="text-xs font-black text-rose-600 flex items-center gap-0.5" title="Negative Reviews">
                      <ThumbsDown className="w-3.5 h-3.5 fill-rose-100" />
                      <span>{previewMetrics.negativeReviews}</span>
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 font-semibold">{previewMetrics.totalReviews} reviews</p>
                </button>
              </div>

              {/* Dynamic Interactive Detail Panel */}
              {activeMetricTab !== 'NONE' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3.5 sm:p-4 space-y-3 animate-in fade-in zoom-in-98 duration-150">
                  {/* DETAIL 1: LATE ORDERS */}
                  {activeMetricTab === 'LATE' && (() => {
                    const lateOrders = selectedHelperOrders.filter((o) => getOrderDelayInfo(o).isLate);
                    return (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded-lg bg-rose-100 text-rose-700">
                              <AlertTriangle className="w-4 h-4" />
                            </span>
                            <div>
                              <h4 className="text-xs font-extrabold text-gray-900">
                                Late / Delayed Orders ({lateOrders.length})
                              </h4>
                              <p className="text-[11px] text-gray-500 font-medium">
                                Deliveries taking &gt; 60 minutes without mutual agreement
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveMetricTab('NONE')}
                            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            title="Close detail view"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {lateOrders.length === 0 ? (
                          <div className="text-center py-5 text-gray-500 text-xs">
                            <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1 opacity-80" />
                            <p className="font-bold text-gray-800">No Late Orders!</p>
                            <p className="text-[11px] text-gray-400">All deliveries for this helper were completed on schedule.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto max-h-56 divide-y divide-gray-100 text-xs">
                            {lateOrders.map((o) => {
                              const delay = getOrderDelayInfo(o);
                              const isDelivered = o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED';
                              return (
                                <div key={o.id} className="py-2.5 flex items-center justify-between gap-2 hover:bg-gray-50/80 px-2 rounded-xl transition-colors">
                                  <div className="space-y-0.5 truncate">
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-gray-900 text-xs">#{o.id}</span>
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                        isDelivered ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                      }`}>
                                        {o.status}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>{delay.label}</span>
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 truncate">
                                      {o.customerName || 'Customer'} • {o.customerPhone || 'No Phone'} • {o.service || o.title || 'Order'}
                                    </p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="font-black text-gray-900 text-xs">৳{o.deliveryFee || 0}</p>
                                    <p className="text-[10px] text-gray-400">
                                      {new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* DETAIL 2: CANCELLED ORDERS */}
                  {activeMetricTab === 'CANCELLED' && (() => {
                    const cancelledOrders = selectedHelperOrders.filter((o) => o.status === 'CANCELED');
                    return (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded-lg bg-amber-100 text-amber-700">
                              <XCircle className="w-4 h-4" />
                            </span>
                            <div>
                              <h4 className="text-xs font-extrabold text-gray-900">
                                Cancelled Orders ({cancelledOrders.length})
                              </h4>
                              <p className="text-[11px] text-gray-500 font-medium">
                                Orders cancelled after assignment to helper
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveMetricTab('NONE')}
                            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            title="Close detail view"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {cancelledOrders.length === 0 ? (
                          <div className="text-center py-5 text-gray-500 text-xs">
                            <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1 opacity-80" />
                            <p className="font-bold text-gray-800">No Cancelled Orders!</p>
                            <p className="text-[11px] text-gray-400">Zero cancellations recorded in this time range.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto max-h-56 divide-y divide-gray-100 text-xs">
                            {cancelledOrders.map((o) => (
                              <div key={o.id} className="py-2.5 flex items-center justify-between gap-2 hover:bg-gray-50/80 px-2 rounded-xl transition-colors">
                                <div className="space-y-0.5 truncate">
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-gray-900 text-xs">#{o.id}</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-50 text-rose-700">
                                      CANCELLED
                                    </span>
                                    {o.cancellationReason && (
                                      <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md truncate max-w-[200px]" title={o.cancellationReason}>
                                        Reason: {o.cancellationReason}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-600 truncate">
                                    {o.customerName || 'Customer'} • {o.customerPhone || 'No Phone'} • {o.service || o.title || 'Order'}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-black text-gray-900 text-xs">৳{o.deliveryFee || 0}</p>
                                  <p className="text-[10px] text-gray-400">
                                    {new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* DETAIL 3: ORDERS PER DAY */}
                  {activeMetricTab === 'ORDERS_PER_DAY' && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="p-1 rounded-lg bg-indigo-100 text-indigo-700">
                            <Calendar className="w-4 h-4" />
                          </span>
                          <div>
                            <h4 className="text-xs font-extrabold text-gray-900">
                              Daily Orders Breakdown
                            </h4>
                            <p className="text-[11px] text-gray-500 font-medium">
                              Avg {previewMetrics.avgOrdersPerActiveDay} orders / active working day ({previewMetrics.activeDaysCount} active days)
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveMetricTab('NONE')}
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                          title="Close detail view"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="overflow-x-auto max-h-56">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 text-gray-600 uppercase font-black text-[10px] tracking-wider border-b border-gray-100">
                            <tr>
                              <th className="py-2 px-3">Date</th>
                              <th className="py-2 px-3">Day</th>
                              <th className="py-2 px-3 text-center">Orders</th>
                              <th className="py-2 px-3 text-center">Delivered</th>
                              <th className="py-2 px-3 text-center">Late</th>
                              <th className="py-2 px-3 text-center">Cancelled</th>
                              <th className="py-2 px-3 text-center">Success %</th>
                              <th className="py-2 px-3 text-center">Store Orders</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {previewMetrics.dailyBreakdown.map((d) => (
                              <tr key={d.date} className="hover:bg-gray-50/80 font-medium">
                                <td className="py-2 px-3 font-bold text-gray-900">{d.date}</td>
                                <td className="py-2 px-3 text-gray-500">{d.dayOfWeek}</td>
                                <td className="py-2 px-3 text-center font-black text-indigo-700">{d.ordersCount}</td>
                                <td className="py-2 px-3 text-center font-bold text-emerald-700">{d.deliveredCount}</td>
                                <td className="py-2 px-3 text-center">
                                  {d.lateCount > 0 ? (
                                    <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-black text-[10px]">
                                      {d.lateCount}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">0</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {d.cancelledCount > 0 ? (
                                    <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-black text-[10px]">
                                      {d.cancelledCount}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">0</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center font-bold text-emerald-800">{d.successRate}%</td>
                                <td className="py-2 px-3 text-center text-amber-800 font-semibold">{d.storeOrdersCount} ({d.storeOrdersPercent}%)</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DETAIL 4: REVIEWS & FEEDBACK */}
                  {activeMetricTab === 'REVIEWS' && (() => {
                    const filteredReviews = selectedHelperFeedbacks.filter((fb) => {
                      const isNeg = isFeedbackNegative(fb);
                      if (reviewSubFilter === 'POSITIVE') return !isNeg;
                      if (reviewSubFilter === 'NEGATIVE') return isNeg;
                      return true;
                    });

                    return (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded-lg bg-emerald-100 text-emerald-700">
                              <ThumbsUp className="w-4 h-4" />
                            </span>
                            <div>
                              <h4 className="text-xs font-extrabold text-gray-900">
                                Customer Reviews & Feedback ({selectedHelperFeedbacks.length})
                              </h4>
                              <p className="text-[11px] text-gray-500 font-medium">
                                {previewMetrics.positiveReviews} Positive 👍 • {previewMetrics.negativeReviews} Negative 👎
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveMetricTab('NONE')}
                            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            title="Close detail view"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex items-center gap-1.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setReviewSubFilter('ALL')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                              reviewSubFilter === 'ALL'
                                ? 'bg-gray-900 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            All ({selectedHelperFeedbacks.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setReviewSubFilter('POSITIVE')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all flex items-center gap-1 ${
                              reviewSubFilter === 'POSITIVE'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                            <span>Positive ({previewMetrics.positiveReviews})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setReviewSubFilter('NEGATIVE')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all flex items-center gap-1 ${
                              reviewSubFilter === 'NEGATIVE'
                                ? 'bg-rose-600 text-white'
                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            }`}
                          >
                            <ThumbsDown className="w-3 h-3" />
                            <span>Negative ({previewMetrics.negativeReviews})</span>
                          </button>
                        </div>

                        {filteredReviews.length === 0 ? (
                          <div className="text-center py-5 text-gray-400 text-xs">
                            No reviews found matching this filter.
                          </div>
                        ) : (
                          <div className="overflow-y-auto max-h-56 divide-y divide-gray-100 text-xs">
                            {filteredReviews.map((fb) => {
                              const isNeg = isFeedbackNegative(fb);
                              return (
                                <div key={fb.id} className="py-2.5 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-gray-900 text-xs">
                                        {fb.customerName || 'Customer'}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 ${
                                        isNeg ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                                      }`}>
                                        {isNeg ? (
                                          <>
                                            <ThumbsDown className="w-3 h-3" />
                                            <span>Negative</span>
                                          </>
                                        ) : (
                                          <>
                                            <ThumbsUp className="w-3 h-3" />
                                            <span>Positive</span>
                                          </>
                                        )}
                                      </span>
                                      <span className="text-[10px] text-gray-400">Order: #{fb.orderId}</span>
                                    </div>
                                    <span className="text-[10px] text-gray-400">
                                      {new Date(fb.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>

                                  {fb.improvementComment && (
                                    <p className="text-xs text-gray-700 italic bg-gray-50 p-2 rounded-xl border border-gray-100">
                                      "{fb.improvementComment}"
                                    </p>
                                  )}

                                  {isNeg && (fb.badReason || (fb.badAspects && fb.badAspects.length > 0)) && (
                                    <p className="text-[10px] font-bold text-rose-600">
                                      Reported Aspect: {fb.badReason || fb.badAspects?.join(', ')}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Export Content Details Notice */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-slate-700 text-xs space-y-1">
            <p className="font-extrabold flex items-center gap-1.5 text-slate-900">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>What is included in this Excel / Sheet Export:</span>
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 pt-1 list-disc list-inside">
              <li>Orders per day & daily breakdown</li>
              <li>Late / delayed orders (&gt; 1h)</li>
              <li>Cancelled orders & failure rate</li>
              <li>Delivery success rate (%)</li>
              <li>Average order accepting time</li>
              <li>Average delivery duration</li>
              <li>Partner store orders & percentage</li>
              <li>Customer reviews per day & total</li>
              <li>Detailed orders log with fees & ratings</li>
            </ul>
          </div>
        </div>

        {/* Modal Footer / Download Actions */}
        <div className="p-5 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl border border-gray-200 hover:bg-gray-100 text-gray-700 font-extrabold text-xs transition-all active:scale-95"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!isExportAllFleet && (
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isExporting}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-extrabold text-xs transition-all shadow-md active:scale-95"
              >
                <FileText className="w-4 h-4" />
                <span>Export PDF</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={isExporting}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-black text-xs transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
            >
              {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isExporting ? 'Generating Sheet...' : 'Download Excel / Sheet'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
