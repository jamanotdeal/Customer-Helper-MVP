'use client';

import React, { useState } from 'react';
import { Order, HelperApplication, UserProfile } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import { X, Search, Bike, CheckCircle2, User, Phone } from 'lucide-react';

interface AssignHelperModalProps {
  order: Order;
  onClose: () => void;
  onAssigned?: () => void;
}

export const AssignHelperModal: React.FC<AssignHelperModalProps> = ({
  order,
  onClose,
  onAssigned,
}) => {
  const { showAlert } = useModal();
  const [searchQuery, setSearchQuery] = useState('');

  // Collect approved helpers
  const allApplications = Array.from(fallbackStore.helperApplications.values());
  const approvedApps = allApplications.filter((a) => a.status === 'APPROVED');
  const allUsers = Array.from(fallbackStore.users.values());
  const helperUsers = allUsers.filter((u) => u.isHelper || u.role === 'helper');

  // Merge helper data
  const helpersList = approvedApps.map((app) => {
    const matchedUser = helperUsers.find((u) => u.uid === app.userId);
    const assignedOrdersCount = Array.from(fallbackStore.orders.values()).filter(
      (o) => o.helperId === app.userId && o.status !== 'DELIVERED' && o.status !== 'CANCELED'
    ).length;
    const completedOrdersCount = Array.from(fallbackStore.orders.values()).filter(
      (o) => o.helperId === app.userId && o.status === 'DELIVERED'
    ).length;

    return {
      userId: app.userId,
      name: app.legalName || app.userName,
      phone: matchedUser?.alternativePhone || 'N/A',
      email: app.email,
      nid: app.nid,
      hasCycle: app.hasCycle,
      hasBike: app.hasBike,
      activeJobs: assignedOrdersCount,
      completedJobs: completedOrdersCount,
    };
  });

  // Filter helpers by query
  const filteredHelpers = helpersList.filter(
    (h) =>
      h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.phone.includes(searchQuery) ||
      h.nid.includes(searchQuery)
  );

  const handleAssign = (helper: (typeof helpersList)[0]) => {
    fallbackStore.updateOrder(order.id, (o) => {
      const isPending = o.status === 'PENDING';
      const updatedStatus = isPending ? 'ACCEPTED' : o.status;
      return {
        ...o,
        helperId: helper.userId,
        helperName: helper.name,
        helperPhone: helper.phone,
        status: updatedStatus,
        acceptedAt: isPending ? new Date().toISOString() : o.acceptedAt,
        statusHistory: [
          ...o.statusHistory,
          {
            id: `sh-${Date.now()}`,
            status: updatedStatus,
            timestamp: new Date().toISOString(),
            actor: 'Admin',
            note: `Assigned to helper ${helper.name}`,
          },
        ],
      };
    });

    // Notify assigned helper
    fallbackStore.addNotification({
      id: `notif-${Date.now()}-helper-assign`,
      userId: helper.userId,
      title: 'অ্যাডমিন অর্ডার অ্যাসাইন করেছেন!',
      body: `অর্ডার #${order.id} (${order.title}) আপনাকে অ্যাসাইন করা হয়েছে।`,
      orderId: order.id,
      read: false,
      createdAt: new Date().toISOString(),
    });

    showAlert(
      'হেলপার অ্যাসাইন সম্পন্ন',
      `অর্ডার #${order.id} সফলভাবে ${helper.name}-কে অ্যাসাইন করা হয়েছে।`,
      'success'
    );

    if (onAssigned) onAssigned();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-purple-950 text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-2xl bg-purple-800/60 border border-purple-700">
              <Bike className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">Assign Helper to Order</h3>
              <p className="text-xs text-purple-200">Order #{order.id} • {order.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/70">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search helper by name, phone, NID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
            />
          </div>
        </div>

        {/* Helpers List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {filteredHelpers.length === 0 ? (
            <div className="py-12 text-center text-gray-500 space-y-2">
              <User className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="font-bold text-xs">No approved helpers found.</p>
              <p className="text-[11px] text-gray-400">Make sure helpers are approved in the Helper Applications tab.</p>
            </div>
          ) : (
            filteredHelpers.map((h) => {
              const isCurrentlyAssigned = order.helperId === h.userId;
              return (
                <div
                  key={h.userId}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrentlyAssigned
                      ? 'bg-purple-50/60 border-purple-300'
                      : 'bg-white border-gray-100 hover:border-purple-200 hover:shadow-soft'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-extrabold text-sm text-gray-900">{h.name}</h4>
                      {isCurrentlyAssigned && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-200 text-purple-900 text-[10px] font-extrabold flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Currently Assigned</span>
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                      <span className="flex items-center space-x-1 text-gray-700 font-semibold">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span>{h.phone}</span>
                      </span>
                      <span>• Active Jobs: <strong className="text-amber-600">{h.activeJobs}</strong></span>
                      <span>• Completed: <strong className="text-emerald-600">{h.completedJobs}</strong></span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAssign(h)}
                    disabled={isCurrentlyAssigned}
                    className={`py-2 px-4 rounded-xl font-extrabold text-xs transition-all ${
                      isCurrentlyAssigned
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-purple-900 hover:bg-purple-950 text-white shadow-md'
                    }`}
                  >
                    {isCurrentlyAssigned ? 'Assigned' : 'Assign Helper'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="py-2.5 px-5 rounded-2xl bg-gray-200 hover:bg-gray-300 font-extrabold text-xs text-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
