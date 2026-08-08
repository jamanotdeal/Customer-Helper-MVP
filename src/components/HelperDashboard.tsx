'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { HelperRequestCard } from './HelperRequestCard';
import { HelperActiveOrderView } from './HelperActiveOrderView';
import { OrderCard } from './OrderCard';
import { useModal } from './CustomModal';
import { Bike, CheckCircle2, Clock, AlertTriangle, Layers } from 'lucide-react';

export const HelperDashboard: React.FC = () => {
  const { user } = useAuth();
  const { showAlert } = useModal();
  const [activeTab, setActiveTab] = useState<'AVAILABLE' | 'ACTIVE' | 'COMPLETED'>('AVAILABLE');
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

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
    if (activeOrders.length >= 5) {
      await showAlert(
        'অর্ডার সীমা পূর্ণ',
        'আপনি সর্বোচ্চ ৫টি অ্যাক্টিভ অর্ডার সম্পন্ন করার পর নতুন অর্ডার নিতে পারবেন।',
        'warning'
      );
      return;
    }

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

  const handleFeeAdjustment = async (orderId: string, amount: number, reason: string) => {
    if (!user) return;
    if (activeOrders.length >= 5) {
      await showAlert(
        'অর্ডার সীমা পূর্ণ',
        'আপনি সর্বোচ্চ ৫টি অ্যাক্টিভ অর্ডার সম্পন্ন করার পর নতুন অর্ডার নিতে পারবেন।',
        'warning'
      );
      return;
    }

    fallbackStore.updateOrder(orderId, (o) => ({
      ...o,
      status: 'ACCEPTED',
      helperId: user.uid,
      helperName: user.displayName,
      helperPhone: user.alternativePhone,
      acceptedAt: new Date().toISOString(),
      feeAdjustment: {
        amount,
        reason,
        status: 'PENDING',
        requestedAt: new Date().toISOString(),
      },
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: 'ACCEPTED',
          timestamp: new Date().toISOString(),
          actor: `Helper (${user.displayName})`,
          note: `Requested fee adjustment to ৳${amount}`,
        },
      ],
    }));

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
            Active: {activeOrders.length}/5
          </span>
        </div>
        <p className="text-xs text-emerald-100 font-medium">
          {activeOrders.length >= 5
            ? '⚠️ Maximum 5 active orders reached. Finish existing orders to accept more.'
            : 'Accept nearby customer requests and start earning.'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 bg-gray-100 p-1.5 rounded-2xl">
        <button
          onClick={() => setActiveTab('AVAILABLE')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'AVAILABLE'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Available ({availableOrders.length})
        </button>

        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'ACTIVE'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Active ({activeOrders.length})
        </button>

        <button
          onClick={() => setActiveTab('COMPLETED')}
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
      {activeTab === 'AVAILABLE' && (
        <div className="space-y-3">
          {availableOrders.length === 0 ? (
            <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <h4 className="font-bold text-gray-900 text-sm mb-1">এখন আশেপাশে কোনো নতুন request নেই</h4>
              <p className="text-xs text-gray-500">নতুন রিকুয়েস্ট এলে নোটিফিকেশন পাবেন।</p>
            </div>
          ) : (
            availableOrders.map((ord) => (
              <HelperRequestCard
                key={ord.id}
                order={ord}
                onAccept={handleAcceptOrder}
                onRequestFeeAdjustment={handleFeeAdjustment}
                activeOrdersCount={activeOrders.length}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'ACTIVE' && (
        <div className="space-y-3">
          {activeOrders.length === 0 ? (
            <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
              <CheckCircle2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <h4 className="font-bold text-gray-900 text-sm">কোনো রানিং অর্ডার নেই</h4>
            </div>
          ) : (
            activeOrders.map((ord) => (
              <OrderCard
                key={ord.id}
                order={ord}
                onClick={() => setSelectedOrderId(ord.id)}
                showDuration={true}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'COMPLETED' && (
        <div className="space-y-3">
          {completedOrders.length === 0 ? (
            <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center p-6 shadow-soft">
              <Layers className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <h4 className="font-bold text-gray-900 text-sm">কোনো সম্পন্ন অর্ডার নেই</h4>
            </div>
          ) : (
            completedOrders.map((ord) => (
              <OrderCard
                key={ord.id}
                order={ord}
                onClick={() => setSelectedOrderId(ord.id)}
                showDuration={true}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
