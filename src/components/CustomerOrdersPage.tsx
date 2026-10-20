'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { OrderCard } from './OrderCard';
import { OrderDetailsView } from './OrderDetailsView';
import { Order } from '@/types';
import { fallbackStore, versionOf, createChangeGate } from '@/lib/firebase';
import { useOlderOrders } from '@/hooks/useOlderOrders';
import { ClipboardList, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react';
import { processAndDispatchScheduledOrders } from '@/utils/scheduledOrders';

type FilterType = 'ALL' | 'ACTIVE' | 'SCHEDULED' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
type DateFilterType = 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH';

const isOrderScheduled = (o: Order) =>
  o.status === 'SCHEDULED' || o.isScheduled === true;

const isOrderActive = (o: Order) =>
  !['DELIVERED', 'COMPLETED', 'CANCELED', 'CANCELLED'].includes(o.status as string) &&
  o.cancellationRequest?.status !== 'APPROVED' &&
  ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED', 'SCHEDULED'].includes(o.status);

const isOrderPending = (o: Order) =>
  o.status === 'PENDING' &&
  !['DELIVERED', 'COMPLETED', 'CANCELED', 'CANCELLED'].includes(o.status as string) &&
  o.cancellationRequest?.status !== 'APPROVED';

const isOrderCompleted = (o: Order) =>
  o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED';

const isOrderCancelled = (o: Order) =>
  o.status === 'CANCELED' || (o.status as string) === 'CANCELLED' ||
  o.cancellationRequest?.status === 'APPROVED';

const isWithinDateFilter = (o: Order, filter: DateFilterType) => {
  if (filter === 'ALL') return true;
  const rawDate = o.createdAt || o.updatedAt || o.deliveredAt || o.cancelledAt;
  if (!rawDate) return true;
  const orderTime = new Date(rawDate).getTime();
  if (isNaN(orderTime) || orderTime === 0) return true;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (filter === 'TODAY') {
    return orderTime >= startOfToday;
  }
  if (filter === 'LAST_7_DAYS') {
    const sevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;
    return orderTime >= sevenDaysAgo;
  }
  if (filter === 'THIS_MONTH') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return orderTime >= startOfMonth;
  }
  return true;
};

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'ALL', label: 'All Orders' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const DATE_FILTERS: { key: DateFilterType; label: string }[] = [
  { key: 'ALL', label: 'All Dates' },
  { key: 'TODAY', label: 'Today' },
  { key: 'LAST_7_DAYS', label: 'Last 7 Days' },
  { key: 'THIS_MONTH', label: 'This Month' },
];

interface CustomerOrdersPageProps {
  initialSelectedOrderId?: string | null;
  onClearInitialOrder?: () => void;
}

export const CustomerOrdersPage: React.FC<CustomerOrdersPageProps> = ({
  initialSelectedOrderId,
  onClearInitialOrder,
}) => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('ALL');
  const [selectedDateFilter, setSelectedDateFilter] = useState<DateFilterType>('ALL');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Open order from notification
  useEffect(() => {
    if (initialSelectedOrderId && user) {
      setSelectedOrderId(initialSelectedOrderId);
      onClearInitialOrder?.();
    }
  }, [initialSelectedOrderId, user, onClearInitialOrder]);

  // Clear on logout
  useEffect(() => {
    if (!user) setSelectedOrderId(null);
  }, [user]);

  // Sync orders
  useEffect(() => {
    const ordersChanged = createChangeGate();
    const sync = () => {
      if (!ordersChanged(versionOf(fallbackStore.orders))) return;
      if (!user) { setOrders([]); return; }
      const all = Array.from(fallbackStore.orders.values())
        .filter((o) => o.customerId === user.uid)
        .sort((a, b) => {
          const tA = new Date(a.createdAt || a.updatedAt || a.deliveredAt || 0).getTime();
          const tB = new Date(b.createdAt || b.updatedAt || b.deliveredAt || 0).getTime();
          return tB - tA;
        });
      setOrders(all);
    };
    sync();
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, [user]);

  // Fetch on mount
  useEffect(() => {
    if (user?.uid) {
      fallbackStore.fetchCustomerOrders(user.uid).catch(() => {});
    }
  }, [user?.uid]);

  // Check and dispatch due scheduled orders
  useEffect(() => {
    processAndDispatchScheduledOrders().catch(() => {});
    const interval = setInterval(() => {
      processAndDispatchScheduledOrders().catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFilter, selectedDateFilter]);

  const filteredOrders = orders.filter((o) => {
    if (selectedFilter === 'ACTIVE' && !isOrderActive(o)) return false;
    if (selectedFilter === 'SCHEDULED' && !isOrderScheduled(o)) return false;
    if (selectedFilter === 'PENDING' && !isOrderPending(o)) return false;
    if (selectedFilter === 'COMPLETED' && !isOrderCompleted(o)) return false;
    if (selectedFilter === 'CANCELLED' && !isOrderCancelled(o)) return false;
    if (!isWithinDateFilter(o, selectedDateFilter)) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
  const validCurrentPage = totalPages > 0 ? Math.min(Math.max(1, currentPage), totalPages) : 1;

  const paginatedOrders = filteredOrders.length > PAGE_SIZE
    ? filteredOrders.slice((validCurrentPage - 1) * PAGE_SIZE, validCurrentPage * PAGE_SIZE)
    : filteredOrders;

  const older = useOlderOrders(
    'customerId',
    user?.uid,
    orders.length >= 100 &&
    selectedFilter !== 'ACTIVE' && selectedFilter !== 'PENDING'
  );

  // Helper to generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (validCurrentPage > 3) pages.push('...');

      const start = Math.max(2, validCurrentPage - 1);
      const end = Math.min(totalPages - 1, validCurrentPage + 1);

      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }

      if (validCurrentPage < totalPages - 2) pages.push('...');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }
    return pages;
  };

  if (selectedOrderId) {
    return (
      <OrderDetailsView
        key={selectedOrderId}
        orderId={selectedOrderId}
        onBack={() => setSelectedOrderId(null)}
      />
    );
  }

  const activeCount = orders.filter(isOrderActive).length;
  const scheduledCount = orders.filter(isOrderScheduled).length;

  return (
    <div className="space-y-4 pb-28 animate-in fade-in duration-200">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-1 gap-2.5">
        <h2 className="font-extrabold text-lg text-gray-900 flex items-center gap-2 shrink-0">
          <ClipboardList className="w-5 h-5 text-emerald-600" />
          My Orders
        </h2>

        {/* Filter Dropdowns (Date & Status) */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          {/* Date Filter Dropdown */}
          <div className="relative shrink-0">
            <select
              value={selectedDateFilter}
              onChange={(e) => {
                setSelectedDateFilter(e.target.value as DateFilterType);
                setCurrentPage(1);
              }}
              className="text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-2xl pl-3 pr-8 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer hover:border-gray-300 transition-colors"
            >
              {DATE_FILTERS.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Status Filter Dropdown */}
          <div className="relative shrink-0">
            <select
              value={selectedFilter}
              onChange={(e) => {
                setSelectedFilter(e.target.value as FilterType);
                setCurrentPage(1);
              }}
              className="text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-2xl pl-3 pr-8 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer hover:border-gray-300 transition-colors"
            >
              {FILTERS.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                  {key === 'ACTIVE' && activeCount > 0 ? ` (${activeCount})` : ''}
                  {key === 'SCHEDULED' && scheduledCount > 0 ? ` (${scheduledCount})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            {selectedFilter !== 'ACTIVE' && activeCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse border-2 border-white pointer-events-none" />
            )}
            {selectedFilter !== 'SCHEDULED' && scheduledCount > 0 && (
              <span className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse border-2 border-white pointer-events-none" />
            )}
          </div>
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="py-16 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-7 h-7" />
          </div>
          <h4 className="font-bold text-gray-900 text-sm mb-1">কোনো অর্ডার নেই</h4>
          <p className="text-xs text-gray-500">এখনও কোনো রিকোয়েস্ট করা হয়নি।</p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={() => setSelectedOrderId(order.id)}
              customerView
            />
          ))}

          {/* Pagination Controls: shown if items are more than 10 */}
          {filteredOrders.length > PAGE_SIZE && (
            <div className="pt-3 pb-1 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-gray-200 shadow-2xs">
              <span className="text-xs font-medium text-gray-500">
                Showing <strong className="text-gray-900 font-bold">{(validCurrentPage - 1) * PAGE_SIZE + 1}</strong> -{' '}
                <strong className="text-gray-900 font-bold">{Math.min(validCurrentPage * PAGE_SIZE, filteredOrders.length)}</strong> of{' '}
                <strong className="text-gray-900 font-bold">{filteredOrders.length}</strong> orders
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={validCurrentPage <= 1}
                  onClick={() => {
                    setCurrentPage((p) => Math.max(1, p - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-all"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <div className="flex items-center gap-1">
                  {getPageNumbers().map((p, idx) =>
                    p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-1 text-gray-400 text-xs font-bold">
                        ...
                      </span>
                    ) : (
                      <button
                        key={`page-${p}`}
                        type="button"
                        onClick={() => {
                          setCurrentPage(Number(p));
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`w-7 h-7 rounded-xl text-xs font-extrabold flex items-center justify-center transition-all ${
                          validCurrentPage === p
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'border border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  disabled={validCurrentPage >= totalPages}
                  onClick={() => {
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-all"
                  title="Next Page"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {older.showSentinel && (
            <div ref={older.sentinelRef} className="py-4 text-center flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50/50 rounded-2xl border border-emerald-100">
              <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <span>পুরনো অর্ডার লোড হচ্ছে...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
