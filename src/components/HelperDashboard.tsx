'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { HelperRequestCard } from './HelperRequestCard';
import { HelperActiveOrderView } from './HelperActiveOrderView';
import { OrderCard } from './OrderCard';
import { useModal } from './CustomModal';
import { PaginationControl } from './admin/PaginationControl';
import { Bike, CheckCircle2, Clock, AlertTriangle, Layers } from 'lucide-react';

export const HelperDashboard: React.FC = () => {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [activeTab, setActiveTab] = useState<'AVAILABLE' | 'ACTIVE' | 'COMPLETED'>('AVAILABLE');
  const [rejectedOrderIds] = useState<Set<string>>(new Set());
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeOrderLimit, setActiveOrderLimit] = useState<number>(
    fallbackStore.pricingSettings.helperActiveOrderLimit ?? 5
  );

  // Per-tab pagination state
  const [availablePage, setAvailablePage] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const syncOrders = () => {
      if (user) {
        const all = Array.from(fallbackStore.orders.values());

        // Available: status PENDING and no helper assigned
        const avail = all.filter((o) => o.status === 'PENDING' && !o.helperId);
        // Active: assigned to current helper and non-delivered/non-canceled
        const act = all.filter(
          (o) =>
            o.helperId === user.uid &&
            ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED'].includes(o.status)
        );
        // Completed: delivered orders by current helper
        const comp = all.filter((o) => o.helperId === user.uid && o.status === 'DELIVERED');

        setAvailableOrders(avail);
        setActiveOrders(act);
        setCompletedOrders(comp);
        setActiveOrderLimit(fallbackStore.pricingSettings.helperActiveOrderLimit ?? 5);
      }
    };

    syncOrders();
    const unsub = fallbackStore.subscribe(syncOrders);
    return () => {
      unsub();
    };
  }, [user]);

  const handleAcceptOrder = async (orderId: string) => {
    if (!user) return;
    if (activeOrders.length >= activeOrderLimit) {
      await showAlert(
        'অর্ডার সীমা পূর্ণ',
        `আপনি সর্বোচ্চ ${activeOrderLimit}টি অ্যাক্টিভ অর্ডার সম্পন্ন করার পর নতুন অর্ডার নিতে পারবেন।`,
        'warning'
      );
      return;
    }

    const confirmed = await showConfirm(
      'রিকুয়েস্ট গ্রহণ করুন',
      'আপনি কি এই রিকুয়েস্টটি গ্রহণ করতে চান? গ্রহণ করার পর আপনি অর্ডারটি ডেলিভারি করতে বাধ্য থাকবেন।',
      'হ্যাঁ, Accept করুন',
      'বাতিল'
    );
    if (!confirmed) return;

    fallbackStore.updateOrder(orderId, (o) => ({
      ...o,
      status: 'ACCEPTED',
      helperId: user.uid,
      helperName: user.displayName,
      helperPhone: user.alternativePhone,
      acceptedAt: new Date().toISOString(),
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: 'ACCEPTED',
          timestamp: new Date().toISOString(),
          actor: `Helper (${user.displayName})`,
          note: 'Accepted request',
        },
      ],
    }));

    // Auto open active order view
    setSelectedOrderId(orderId);
  };


  if (selectedOrderId) {
    const targetOrder = fallbackStore.orders.get(selectedOrderId);
    if (targetOrder) {
      return (
        <HelperActiveOrderView
          order={targetOrder}
          onBack={() => setSelectedOrderId(null)}
        />
      );
    }
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Helper Workload Header Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-5 text-white shadow-floating">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-2xl bg-white/20 backdrop-blur-xs">
              <Bike className="w-5 h-5" />
            </div>
            <span className="font-extrabold text-base">Helper Workspace</span>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/20">
            Active: {activeOrders.length}/{activeOrderLimit}
          </span>
        </div>
        <p className="text-xs text-emerald-100 font-medium">
          {activeOrders.length >= activeOrderLimit
            ? `Maximum ${activeOrderLimit} active orders reached. Finish existing orders to accept more.`
            : 'Accept nearby customer requests and start earning.'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 bg-gray-100 p-1.5 rounded-2xl">
        <button
          onClick={() => { setActiveTab('AVAILABLE'); setAvailablePage(1); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'AVAILABLE'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Available ({availableOrders.length})
        </button>

        <button
          onClick={() => { setActiveTab('ACTIVE'); setActivePage(1); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'ACTIVE'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Active ({activeOrders.length})
        </button>

        <button
          onClick={() => { setActiveTab('COMPLETED'); setCompletedPage(1); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'COMPLETED'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Completed ({completedOrders.length})
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'AVAILABLE' && (() => {
        const visibleAvailable = availableOrders.filter((ord) => !rejectedOrderIds.has(ord.id));
        const totalAvail = visibleAvailable.length;
        const totalAvailPages = Math.ceil(totalAvail / pageSize) || 1;
        const pagedAvailable = visibleAvailable.slice((availablePage - 1) * pageSize, availablePage * pageSize);
        return (
          <div className="space-y-3">
            {totalAvail === 0 ? (
              <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
                <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <h4 className="font-bold text-gray-900 text-sm mb-1">এখন আশেপাশে কোনো নতুন request নেই</h4>
                <p className="text-xs text-gray-500">নতুন রিকুয়েস্ট এলে নোটিফিকেশন পাবেন।</p>
              </div>
            ) : (
              <>
                {pagedAvailable.map((ord) => (
                  <HelperRequestCard
                    key={ord.id}
                    order={ord}
                    onAccept={handleAcceptOrder}
                    activeOrdersCount={activeOrders.length}
                    activeOrderLimit={activeOrderLimit}
                  />
                ))}
                {totalAvail > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <PaginationControl
                      currentPage={availablePage}
                      totalPages={totalAvailPages}
                      totalItems={totalAvail}
                      pageSize={pageSize}
                      pageSizeOptions={[5, 10, 20]}
                      onPageChange={(p) => setAvailablePage(p)}
                      onPageSizeChange={(s) => { setPageSize(s); setAvailablePage(1); }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {activeTab === 'ACTIVE' && (() => {
        const totalActive = activeOrders.length;
        const totalActivePages = Math.ceil(totalActive / pageSize) || 1;
        const pagedActive = activeOrders.slice((activePage - 1) * pageSize, activePage * pageSize);
        return (
          <div className="space-y-3">
            {totalActive === 0 ? (
              <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
                <CheckCircle2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <h4 className="font-bold text-gray-900 text-sm">কোনো রানিং অর্ডার নেই</h4>
              </div>
            ) : (
              <>
                {pagedActive.map((ord) => (
                  <OrderCard
                    key={ord.id}
                    order={ord}
                    onClick={() => setSelectedOrderId(ord.id)}
                    showDuration={true}
                  />
                ))}
                {totalActive > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <PaginationControl
                      currentPage={activePage}
                      totalPages={totalActivePages}
                      totalItems={totalActive}
                      pageSize={pageSize}
                      pageSizeOptions={[5, 10, 20]}
                      onPageChange={(p) => setActivePage(p)}
                      onPageSizeChange={(s) => { setPageSize(s); setActivePage(1); }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {activeTab === 'COMPLETED' && (() => {
        const totalCompleted = completedOrders.length;
        const totalCompletedPages = Math.ceil(totalCompleted / pageSize) || 1;
        const pagedCompleted = completedOrders.slice((completedPage - 1) * pageSize, completedPage * pageSize);
        return (
          <div className="space-y-3">
            {totalCompleted === 0 ? (
              <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
                <Layers className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <h4 className="font-bold text-gray-900 text-sm">কোনো সম্পন্ন অর্ডার নেই</h4>
              </div>
            ) : (
              <>
                {pagedCompleted.map((ord) => (
                  <OrderCard
                    key={ord.id}
                    order={ord}
                    onClick={() => setSelectedOrderId(ord.id)}
                    showDuration={true}
                  />
                ))}
                {totalCompleted > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <PaginationControl
                      currentPage={completedPage}
                      totalPages={totalCompletedPages}
                      totalItems={totalCompleted}
                      pageSize={pageSize}
                      pageSizeOptions={[5, 10, 20]}
                      onPageChange={(p) => setCompletedPage(p)}
                      onPageSizeChange={(s) => { setPageSize(s); setCompletedPage(1); }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
};
