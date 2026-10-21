'use client';

import React, { useState } from 'react';
import { Order, UserProfile } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { X, User, Phone, ShoppingBag, DollarSign, Calendar, Clock, ChevronRight } from 'lucide-react';
import { AdminOrderDetailsModal } from './AdminOrderDetailsModal';
import { PaginationControl } from './PaginationControl';
import { LifetimeDataNotice } from './LifetimeDataNotice';
import { useAdminLifetimeData } from '@/hooks/useAdminLifetimeData';

type PresetType = 'ALL_TIME' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH' | 'CUSTOM';

const presetLabels: Record<PresetType, string> = {
  ALL_TIME: 'All Time',
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  LAST_7: 'Last 7 Days',
  LAST_30: 'Last 30 Days',
  THIS_MONTH: 'This Month',
  CUSTOM: 'Custom',
};

interface CustomerHistoryModalProps {
  customerId: string;
  customerName: string;
  customerPhone?: string;
  onClose: () => void;
}

export const CustomerHistoryModal: React.FC<CustomerHistoryModalProps> = ({
  customerId,
  customerName,
  customerPhone,
  onClose,
}) => {
  // Wallets and history here are summed over every order, withdrawal and
  // shop order, which the admin panel reads only when a view like this opens.
  const lifetimeData = useAdminLifetimeData();

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  // Date Range Filtering State - Default to TODAY
  const [startDate, setStartDate] = useState<string>(getTodayStr());
  const [endDate, setEndDate] = useState<string>(getTodayStr());
  const [activePreset, setActivePreset] = useState<PresetType>('TODAY');
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);

  const handlePresetSelect = (preset: PresetType) => {
    setActivePreset(preset);
    setCurrentPage(1);
    if (preset === 'CUSTOM') {
      setShowCustomPicker(true);
      return;
    }
    setShowCustomPicker(false);
    if (preset === 'ALL_TIME') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      setStartDate(getTodayStr());
      setEndDate(getTodayStr());
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

  const matchesDateRange = (dateVal?: string | number) => {
    if (!startDate && !endDate) return true;
    if (!dateVal) return false;
    const t = new Date(dateVal).getTime();
    if (isNaN(t)) return true;
    if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
    if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
    return true;
  };

  // Fetch customer orders
  const allOrders = Array.from(fallbackStore.orders.values());
  const allCustomerOrders = allOrders
    .filter((o) => o.customerId === customerId || o.customerPhone === customerPhone)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Filtered customer orders for active date range (default TODAY)
  const customerOrders = allCustomerOrders.filter((o) => matchesDateRange(o.createdAt));

  const userProfile = fallbackStore.users.get(customerId);

  // Calculate metrics
  const totalOrders = customerOrders.length;
  const completedOrders = customerOrders.filter((o) => o.status === 'DELIVERED').length;
  const canceledOrders = customerOrders.filter((o) => o.status === 'CANCELED').length;
  const totalSpent = customerOrders
    .filter((o) => o.status === 'DELIVERED')
    .reduce((sum, o) => sum + (o.productCost || 0) + o.deliveryFee, 0);

  // Pagination
  const totalPages = Math.ceil(totalOrders / pageSize) || 1;
  const paginatedOrders = customerOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          <LifetimeDataNotice className="m-3 mb-0 shrink-0" loading={lifetimeData.loading} error={lifetimeData.error} onRetry={lifetimeData.retry} />
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-purple-950 to-indigo-900 text-white flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20">
                <User className="w-6 h-6 text-purple-200" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-lg">{customerName}</h3>
                  {userProfile?.labels && userProfile.labels.length > 0 && userProfile.labels.map((lbl) => (
                    <span key={lbl} className="px-2 py-0.5 rounded-md bg-amber-300 text-purple-950 font-black text-[10px]">
                      🏷️ {lbl}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-purple-200">
                  Phone: {customerPhone || 'N/A'} • ID: {customerId}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-2xl bg-rose-500/80 hover:bg-rose-600 text-white transition-colors shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Date Filter Bar - Defaults to TODAY */}
          <div className="p-3 sm:px-5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap text-xs shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-purple-700" />
                <span>Date Filter:</span>
              </span>
              {(['ALL_TIME', 'TODAY', 'YESTERDAY', 'LAST_7', 'LAST_30', 'THIS_MONTH', 'CUSTOM'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className={`px-3 py-1 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
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
            {(activePreset === 'CUSTOM' || showCustomPicker) && (
              <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-xl border border-gray-200 shadow-xs animate-in fade-in duration-150">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-0.5 bg-gray-50 rounded-lg text-xs font-bold text-gray-800 border border-gray-200 outline-none"
                />
                <span className="text-gray-400 font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-0.5 bg-gray-50 rounded-lg text-xs font-bold text-gray-800 border border-gray-200 outline-none"
                />
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 border-b border-gray-100 text-center text-xs">
            <div className="p-3 bg-white rounded-2xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">
                Total Orders {activePreset !== 'ALL_TIME' && `(${presetLabels[activePreset]})`}
              </span>
              <span className="text-xl font-black text-gray-900">{totalOrders}</span>
              {activePreset !== 'ALL_TIME' && (
                <span className="text-[10px] text-gray-400 block font-semibold">{allCustomerOrders.length} all-time</span>
              )}
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Completed</span>
              <span className="text-xl font-black text-emerald-600">{completedOrders}</span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Canceled</span>
              <span className="text-xl font-black text-red-600">{canceledOrders}</span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">
                Total Spent {activePreset !== 'ALL_TIME' && `(${presetLabels[activePreset]})`}
              </span>
              <span className="text-xl font-black text-purple-900">৳{totalSpent}</span>
            </div>
          </div>

          {/* Customer Orders History List */}
          <div className="p-4 overflow-y-auto space-y-3 flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
                Customer Order History ({totalOrders}) {activePreset !== 'ALL_TIME' && `• ${presetLabels[activePreset]}`}
              </h4>
              {activePreset !== 'ALL_TIME' && allCustomerOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => handlePresetSelect('ALL_TIME')}
                  className="text-xs font-bold text-purple-700 hover:underline cursor-pointer"
                >
                  Show All Time ({allCustomerOrders.length})
                </button>
              )}
            </div>

            {paginatedOrders.length === 0 ? (
              <div className="py-12 text-center text-gray-400 space-y-2">
                <ShoppingBag className="w-10 h-10 mx-auto opacity-40" />
                <p className="font-bold text-sm text-gray-700">
                  {activePreset === 'TODAY'
                    ? 'আজকে এই কাস্টমারের কোনো অর্ডার নেই।'
                    : 'নির্বাচিত সময়ে কোনো অর্ডার নেই।'}
                </p>
                {allCustomerOrders.length > 0 && activePreset !== 'ALL_TIME' && (
                  <button
                    type="button"
                    onClick={() => handlePresetSelect('ALL_TIME')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-black transition-all cursor-pointer shadow-xs"
                  >
                    সকল {allCustomerOrders.length}টি পূর্বের অর্ডার দেখতে ক্লিক করুন (All Time)
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {paginatedOrders.map((ord) => (
                  <div
                    key={ord.id}
                    onClick={() => setSelectedOrderId(ord.id)}
                    className="p-3.5 rounded-2xl bg-white border border-gray-200 hover:border-purple-300 hover:shadow-soft transition-all cursor-pointer flex items-center justify-between text-xs"
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
                      </div>
                      <p className="font-extrabold text-gray-800">{ord.title || ord.items?.[0]?.name || 'Order'}</p>
                      <p className="text-[11px] text-gray-500">
                        {new Date(ord.createdAt).toLocaleString()} • Delivery Fee: ৳{ord.deliveryFee}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 text-purple-900 font-extrabold text-xs">
                      <span>View Details</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalOrders > 0 && (
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalOrders}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          )}

          {/* Footer */}
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
            <button
              onClick={onClose}
              className="py-2.5 px-5 rounded-2xl bg-rose-50 hover:bg-rose-100 font-extrabold text-xs text-rose-600 border border-rose-200 active:scale-95 transition-colors"
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
