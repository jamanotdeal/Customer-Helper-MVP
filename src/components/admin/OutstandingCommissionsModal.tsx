'use client';

import React, { useState, useMemo } from 'react';
import { fallbackStore } from '@/lib/firebase';
import { Wallet, UserProfile, HelperApplication } from '@/types';
import { X, Search, Bike, DollarSign, TrendingUp, User, CheckCircle2 } from 'lucide-react';

interface OutstandingCommissionsModalProps {
  onClose: () => void;
  totalOutstanding: number;
}

export const OutstandingCommissionsModal: React.FC<OutstandingCommissionsModalProps> = ({
  onClose,
  totalOutstanding,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Get all wallets and helper applications/profiles
  const wallets = useMemo(() => {
    const allUsersWithActivity = new Set([
      ...Array.from(fallbackStore.orders.values()).map(o => o.helperId).filter(Boolean),
      ...Array.from(fallbackStore.withdrawals.values()).map(w => w.helperId).filter(Boolean),
      ...Array.from(fallbackStore.wallets.keys())
    ]) as Set<string>;

    const allWallets = Array.from(allUsersWithActivity).map(uid => fallbackStore.getHelperWallet(uid));
    const users = fallbackStore.users;
    const apps = Array.from(fallbackStore.helperApplications.values());

    return allWallets
      .filter((w) => (w.balance || 0) > 0)
      .map((w) => {
        const user = users.get(w.userId);
        const app = apps.find((a) => a.userId === w.userId);

        const name = user?.displayName || app?.legalName || app?.userName || `Helper (${w.userId.slice(0, 6)})`;
        const phone = user?.alternativePhone || app?.whatsapp || user?.email || 'N/A';
        const photoURL = user?.photoURL;

        return {
          wallet: w,
          name,
          phone,
          photoURL,
        };
      })
      .sort((a, b) => b.wallet.balance - a.wallet.balance);
  }, []);

  // Filtered list based on search query
  const filteredWallets = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return wallets;
    return wallets.filter(
      (w) =>
        w.name.toLowerCase().includes(query) ||
        w.phone.includes(query) ||
        w.wallet.userId.toLowerCase().includes(query)
    );
  }, [wallets, searchQuery]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-indigo-950/10 flex items-center justify-between bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-indigo-800/80 border border-indigo-700 shadow-md">
              <Bike className="w-6 h-6 text-indigo-200" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight">Outstanding Helper Wallets</h3>
              <p className="text-xs text-indigo-200">Detailed list of commissions currently remaining on helper wallets</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Banner & Search */}
        <div className="p-5 bg-gray-50 border-b border-gray-100 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-soft flex items-center space-x-4">
              <div className="p-3 rounded-xl bg-indigo-50 text-indigo-700">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-extrabold uppercase block tracking-wider">Total Owed Commission</span>
                <span className="text-xl font-black text-gray-900">৳{totalOutstanding}</span>
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-soft flex items-center space-x-4">
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700">
                <User className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-extrabold uppercase block tracking-wider">Active Helper Accounts</span>
                <span className="text-xl font-black text-gray-900">{wallets.length} helpers</span>
              </div>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search by name, phone number, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10 transition-all"
            />
          </div>
        </div>

        {/* Modal List Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {filteredWallets.length === 0 ? (
            <div className="py-16 text-center text-gray-400 space-y-2">
              <Search className="w-12 h-12 mx-auto opacity-30" />
              <p className="font-bold text-sm">কোনো হেলপার তথ্য পাওয়া যায়নি।</p>
              <p className="text-xs">অনুগ্রহ করে অন্য নাম বা ফোন দিয়ে সার্চ করুন।</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredWallets.map(({ wallet, name, phone, photoURL }) => (
                <div
                  key={wallet.userId}
                  className="p-4 rounded-2xl bg-white border border-gray-100 shadow-soft hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center space-x-3">
                    {photoURL ? (
                      <img
                        src={photoURL}
                        alt={name}
                        className="w-10 h-10 rounded-xl object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-sm">
                        {name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h4 className="font-extrabold text-sm text-gray-900">{name}</h4>
                      <p className="text-xs text-gray-500 font-medium">WhatsApp/Phone: {phone}</p>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5">ID: {wallet.userId.slice(0, 12)}...</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-50">
                    <div className="text-left sm:text-right text-xs">
                      <span className="text-[10px] text-gray-400 font-bold block uppercase">Helper Share</span>
                      <span className="font-semibold text-gray-700">Earned: ৳{wallet.totalEarned || 0}</span>
                    </div>

                    <div className="text-left sm:text-right text-xs">
                      <span className="text-[10px] text-gray-400 font-bold block uppercase">Paid back</span>
                      <span className="font-semibold text-emerald-600">৳{wallet.totalPaidCommission || 0}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 font-bold block uppercase">Due Commission</span>
                      <span className="text-base font-black text-rose-600">
                        ৳{wallet.balance}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-500 font-medium">
            Showing {filteredWallets.length} of {wallets.length} helper wallets.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-gray-200 hover:bg-gray-300 font-extrabold text-xs text-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
