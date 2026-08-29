'use client';

import React, { useState } from 'react';
import { Order, HelperApplication, UserProfile, Wallet, WalletTransaction } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { X, Bike, Phone, ShoppingBag, DollarSign, Wallet as WalletIcon, CheckCircle2, ChevronRight, FileText } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'JOBS' | 'WALLET'>('JOBS');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch helper application & profile
  const application = Array.from(fallbackStore.helperApplications.values()).find(
    (a) => a.userId === helperId
  );
  const userProfile = fallbackStore.users.get(helperId);

  // Fetch assigned orders
  const allOrders = Array.from(fallbackStore.orders.values());
  const helperOrders = allOrders
    .filter((o) => o.helperId === helperId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Fetch wallet & transactions
  const wallet = fallbackStore.getHelperWallet(helperId);
  const walletTxs = fallbackStore.walletTransactions.get(helperId) || [];

  // Metrics
  const completedJobs = helperOrders.filter((o) => o.status === 'DELIVERED').length;
  const activeJobs = helperOrders.filter(
    (o) => o.status !== 'DELIVERED' && o.status !== 'CANCELED'
  ).length;

  const deliveredOrders = helperOrders.filter((o) => o.status === 'DELIVERED');
  let totalDurationMs = 0;
  let countWithDuration = 0;
  deliveredOrders.forEach((o) => {
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

  // Pagination for Jobs
  const totalPages = Math.ceil(helperOrders.length / pageSize) || 1;
  const paginatedOrders = helperOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-indigo-950 via-purple-900 to-indigo-900 text-white flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20">
                <Bike className="w-6 h-6 text-indigo-200" />
              </div>
              <div>
                <h3 className="font-extrabold text-lg">{application?.legalName || helperName}</h3>
                <p className="text-xs text-indigo-200">
                  NID: {application?.nid || 'N/A'} • Phone: {userProfile?.alternativePhone || 'N/A'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stats Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-gray-50 border-b border-gray-100 text-center text-xs">
            <div className="p-3 bg-white rounded-2xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Completed Jobs</span>
              <span className="text-xl font-black text-emerald-600">{completedJobs}</span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Active Jobs</span>
              <span className="text-xl font-black text-amber-600">{activeJobs}</span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Avg Delivery</span>
              <span className="text-xl font-black text-purple-900">{avgDeliveryTimeText}</span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Earned</span>
              <span className="text-xl font-black text-indigo-900">৳{wallet.totalEarned}</span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Wallet Balance</span>
              <span className="text-xl font-black text-purple-900">৳{wallet.balance}</span>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-gray-100 bg-gray-100/50 px-4 pt-2 gap-2 text-xs font-extrabold">
            <button
              onClick={() => setActiveTab('JOBS')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all ${
                activeTab === 'JOBS'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              Assigned Orders ({helperOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('WALLET')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all ${
                activeTab === 'WALLET'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              Wallet Transactions ({walletTxs.length})
            </button>
          </div>

          {/* Content Area */}
          <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
            {activeTab === 'JOBS' && (
              <>
                {paginatedOrders.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="font-bold">No orders assigned to this helper yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paginatedOrders.map((ord) => (
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
              </>
            )}

            {activeTab === 'WALLET' && (
              <div className="space-y-2">
                {walletTxs.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <WalletIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="font-bold">No wallet transactions recorded yet.</p>
                  </div>
                ) : (
                  walletTxs.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3 rounded-2xl bg-white border border-gray-200 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-extrabold text-gray-900">{tx.description}</p>
                        <p className="text-[11px] text-gray-400">
                          {new Date(tx.createdAt).toLocaleString()}
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
            )}
          </div>

          {/* Pagination Controls for Jobs */}
          {activeTab === 'JOBS' && helperOrders.length > 0 && (
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={helperOrders.length}
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
              className="py-2.5 px-5 rounded-2xl bg-gray-200 hover:bg-gray-300 font-extrabold text-xs text-gray-800 transition-colors"
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
