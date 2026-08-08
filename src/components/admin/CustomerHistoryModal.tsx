'use client';

import React, { useState } from 'react';
import { Order, UserProfile } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { X, User, Phone, ShoppingBag, DollarSign, Calendar, Clock, ChevronRight } from 'lucide-react';
import { AdminOrderDetailsModal } from './AdminOrderDetailsModal';
import { PaginationControl } from './PaginationControl';

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
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch customer orders
  const allOrders = Array.from(fallbackStore.orders.values());
  const customerOrders = allOrders
    .filter((o) => o.customerId === customerId || o.customerPhone === customerPhone)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-purple-950 to-indigo-900 text-white flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20">
                <User className="w-6 h-6 text-purple-200" />
              </div>
              <div>
                <h3 className="font-extrabold text-lg">{customerName}</h3>
                <p className="text-xs text-purple-200">
                  Phone: {customerPhone || 'N/A'} • ID: {customerId}
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

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 border-b border-gray-100 text-center text-xs">
            <div className="p-3 bg-white rounded-2xl border border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Orders</span>
              <span className="text-xl font-black text-gray-900">{totalOrders}</span>
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
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Spent</span>
              <span className="text-xl font-black text-purple-900">৳{totalSpent}</span>
            </div>
          </div>

          {/* Customer Orders History List */}
          <div className="p-4 overflow-y-auto space-y-3 flex-1">
            <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
              Customer Order History ({totalOrders})
            </h4>

            {paginatedOrders.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="font-bold text-xs">No orders placed yet.</p>
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
