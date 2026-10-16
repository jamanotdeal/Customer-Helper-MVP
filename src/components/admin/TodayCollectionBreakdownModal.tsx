'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Store,
  Bike,
  Sparkles,
  Phone,
  Search,
  ChevronDown,
  ChevronUp,
  Receipt,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Copy,
  Check
} from 'lucide-react';

export interface TodayStoreOwedItem {
  storeId: string;
  storeName: string;
  ownerName?: string;
  phone?: string;
  canReceiveOrders: boolean;
  orderCount: number;
  totalCost: number;
  owedAmount: number; // Total money to pay to this store
  commissionEarned: number; // Commission earned if store cannot accept orders
  orders: {
    id: string;
    title?: string;
    cost: number;
    time: string;
  }[];
}

interface TodayCollectionBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  todayTotalCollectedAmount: number;
  todayReturnableStoreAmount: number;
  todayDeliveryCharges: number;
  todayNonAcceptableStoreCommission: number;
  todayDeliveredOrdersCount: number;
  storesList: TodayStoreOwedItem[];
}

type TabType = 'OWED_STORES' | 'ALL_STORES' | 'COMMISSIONS' | 'DELIVERY';

export const TodayCollectionBreakdownModal: React.FC<TodayCollectionBreakdownModalProps> = ({
  isOpen,
  onClose,
  todayTotalCollectedAmount,
  todayReturnableStoreAmount,
  todayDeliveryCharges,
  todayNonAcceptableStoreCommission,
  todayDeliveredOrdersCount,
  storesList,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('OWED_STORES');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filtered store lists
  const storesOwed = useMemo(() => {
    return storesList
      .filter((s) => s.owedAmount > 0)
      .sort((a, b) => b.owedAmount - a.owedAmount);
  }, [storesList]);

  const commissionStores = useMemo(() => {
    return storesList
      .filter((s) => s.commissionEarned > 0)
      .sort((a, b) => b.commissionEarned - a.commissionEarned);
  }, [storesList]);

  const displayedStores = useMemo(() => {
    let list: TodayStoreOwedItem[] = [];
    if (activeTab === 'OWED_STORES') {
      list = storesOwed;
    } else if (activeTab === 'COMMISSIONS') {
      list = commissionStores;
    } else if (activeTab === 'ALL_STORES') {
      list = [...storesList].sort((a, b) => (b.owedAmount + b.commissionEarned) - (a.owedAmount + a.commissionEarned));
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    return list.filter((s) =>
      s.storeName.toLowerCase().includes(q) ||
      (s.ownerName && s.ownerName.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q))
    );
  }, [activeTab, storesOwed, commissionStores, storesList, searchQuery]);

  const handleCopyPhone = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-emerald-950/90 via-slate-900 to-teal-950/90 p-5 sm:p-6 border-b border-white/10 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2.5 mb-1.5 flex-wrap">
                <span className="px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  কাকে কত টাকা দিতে হবে
                </span>
                <span className="text-xs text-slate-300 font-medium">
                  • আজকের সংগৃহীত অর্থের লাইভ হিসাব
                </span>
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-white tracking-tight">
                আজকের মোট সংগৃহীত টাকা ও প্রদেয় হিসাব বিভাজন
              </h3>
              <p className="text-xs sm:text-sm text-slate-300/80 font-medium mt-1">
                কোন স্টোরকে কত প্রদেয় এবং ডেলিভারি চার্জ ও কমিশন আয়ের পূর্ণাঙ্গ তালিকা
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all shrink-0 cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Top 4 Summary Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-5">
            {/* Total Live Collected */}
            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/10 backdrop-blur-md">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                আজকের মোট সংগৃহীত
              </span>
              <div className="text-xl sm:text-2xl font-black text-white mt-0.5">
                ৳{todayTotalCollectedAmount.toLocaleString()}
              </div>
              <span className="text-[10px] text-emerald-300 font-semibold block mt-0.5">
                {todayDeliveredOrdersCount} টি সম্পন্ন ডেলিভারি
              </span>
            </div>

            {/* Total Owed to Stores */}
            <div
              onClick={() => setActiveTab('OWED_STORES')}
              className={`p-3.5 rounded-2xl border backdrop-blur-md cursor-pointer transition-all ${
                activeTab === 'OWED_STORES'
                  ? 'bg-amber-500/20 border-amber-400/50 ring-2 ring-amber-400/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider block">
                  স্টোরদের প্রদেয় (Owed)
                </span>
                <Store className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-amber-300 mt-0.5">
                ৳{todayReturnableStoreAmount.toLocaleString()}
              </div>
              <span className="text-[10px] text-amber-200/80 font-semibold block mt-0.5">
                {storesOwed.length} টি স্টোরকে দিতে হবে
              </span>
            </div>

            {/* Delivery Charges */}
            <div
              onClick={() => setActiveTab('DELIVERY')}
              className={`p-3.5 rounded-2xl border backdrop-blur-md cursor-pointer transition-all ${
                activeTab === 'DELIVERY'
                  ? 'bg-emerald-500/20 border-emerald-400/50 ring-2 ring-emerald-400/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider block">
                  ডেলিভারি চার্জেস
                </span>
                <Bike className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-300 mt-0.5">
                ৳{todayDeliveryCharges.toLocaleString()}
              </div>
              <span className="text-[10px] text-emerald-200/80 font-semibold block mt-0.5">
                আজকের মোট ফি আদায়
              </span>
            </div>

            {/* Unaccepted Store Commissions */}
            <div
              onClick={() => setActiveTab('COMMISSIONS')}
              className={`p-3.5 rounded-2xl border backdrop-blur-md cursor-pointer transition-all ${
                activeTab === 'COMMISSIONS'
                  ? 'bg-teal-500/20 border-teal-400/50 ring-2 ring-teal-400/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-teal-200 uppercase tracking-wider block">
                  নন-অ্যাক্সেপ্টেড কমিশন
                </span>
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-teal-300 mt-0.5">
                ৳{todayNonAcceptableStoreCommission.toLocaleString()}
              </div>
              <span className="text-[10px] text-teal-200/80 font-semibold block mt-0.5">
                {commissionStores.length} টি স্টোর থেকে আয়
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation & Search */}
        <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveTab('OWED_STORES')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'OWED_STORES'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              কাকে কত দিতে হবে ({storesOwed.length})
            </button>

            <button
              onClick={() => setActiveTab('COMMISSIONS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'COMMISSIONS'
                  ? 'bg-teal-500 text-slate-950 font-black shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              কমিশন আদায় ({commissionStores.length})
            </button>

            <button
              onClick={() => setActiveTab('DELIVERY')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'DELIVERY'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              ডেলিভারি চার্জ বিবরণ
            </button>

            <button
              onClick={() => setActiveTab('ALL_STORES')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'ALL_STORES'
                  ? 'bg-slate-600 text-white font-black shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              সকল স্টোর ({storesList.length})
            </button>
          </div>

          {/* Search Box */}
          {activeTab !== 'DELIVERY' && (
            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="স্টোরের নাম বা ফোন নম্বর..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3.5 flex-1">
          {/* TAB 1, 2, 4: Stores List View */}
          {activeTab !== 'DELIVERY' && (
            <>
              {displayedStores.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-3xl bg-slate-800/40 border border-slate-800">
                  <Store className="w-10 h-10 text-slate-500 mx-auto mb-3 opacity-60" />
                  <h4 className="text-sm font-bold text-slate-300">
                    {searchQuery ? 'খুঁজে পাওয়া যায়নি' : 'আজকের কোনো হিসাব পাওয়া যায়নি'}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    {searchQuery
                      ? `"${searchQuery}" এর সাথে কোনো স্টোরের মিল পাওয়া যায়নি।`
                      : activeTab === 'OWED_STORES'
                      ? 'আজকে কোনো অর্ডার গ্রহণকারী স্টোরের কাছে প্রদেয় অর্থ নেই।'
                      : 'আজকে এই ক্যাটাগরিতে কোনো স্টোরের তথ্য নেই।'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedStores.map((item, idx) => {
                    const isExpanded = expandedStoreId === item.storeId;
                    return (
                      <div
                        key={item.storeId || idx}
                        className="rounded-2xl bg-slate-800/70 border border-slate-700/80 hover:border-slate-600 transition-all overflow-hidden"
                      >
                        {/* Main Store Row */}
                        <div
                          onClick={() => setExpandedStoreId(isExpanded ? null : item.storeId)}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                        >
                          <div className="flex items-start space-x-3.5">
                            <div className="w-10 h-10 rounded-xl bg-slate-700/80 border border-slate-600 flex items-center justify-center shrink-0 mt-0.5">
                              <Store className="w-5 h-5 text-amber-400" />
                            </div>

                            <div>
                              <div className="flex items-center space-x-2 flex-wrap">
                                <h4 className="text-sm font-black text-white">
                                  {item.storeName}
                                </h4>
                                {item.canReceiveOrders ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    অর্ডার গ্রহণকারী
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                    নন-অ্যাক্সেপ্টিং
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1 flex-wrap gap-y-1">
                                {item.ownerName && (
                                  <span>মালিক: <strong className="text-slate-300">{item.ownerName}</strong></span>
                                )}
                                {item.phone && (
                                  <span className="flex items-center space-x-1.5">
                                    <Phone className="w-3 h-3 text-emerald-400" />
                                    <a
                                      href={`tel:${item.phone}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-emerald-400 hover:underline font-semibold"
                                    >
                                      {item.phone}
                                    </a>
                                    <button
                                      onClick={(e) => handleCopyPhone(item.phone!, e)}
                                      className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                                      title="নম্বর কপি করুন"
                                    >
                                      {copiedPhone === item.phone ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </span>
                                )}
                                <span className="text-slate-400">
                                  অর্ডার: <strong className="text-white">{item.orderCount} টি</strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Amounts & Expand Arrow */}
                          <div className="flex items-center justify-between sm:justify-end space-x-4 pl-13 sm:pl-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-700/50">
                            <div className="text-left sm:text-right">
                              {item.owedAmount > 0 && (
                                <div>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
                                    স্টোরকে প্রদেয় (Owe)
                                  </span>
                                  <div className="text-lg sm:text-xl font-black text-amber-300">
                                    ৳{item.owedAmount.toLocaleString()}
                                  </div>
                                </div>
                              )}

                              {item.commissionEarned > 0 && (
                                <div>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300 block">
                                    কমিশন আদায়
                                  </span>
                                  <div className="text-base sm:text-lg font-black text-teal-300">
                                    ৳{item.commissionEarned.toLocaleString()}
                                  </div>
                                </div>
                              )}
                            </div>

                            <button
                              className="p-1.5 rounded-xl bg-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                              title={isExpanded ? 'সংকোচন করুন' : 'বিস্তারিত দেখুন'}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Expanded Orders Details */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 bg-slate-900/60 border-t border-slate-700/60 text-xs">
                            <div className="font-bold text-slate-300 mb-2 flex items-center justify-between">
                              <span>আজকের সংশ্লিষ্ট অর্ডারসমূহ ({item.orders.length} টি):</span>
                              <span className="text-[11px] text-slate-400 font-normal">
                                মোট মালামালের মূল্য: ৳{item.totalCost.toLocaleString()}
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              {item.orders.map((ord, oIdx) => (
                                <div
                                  key={ord.id || oIdx}
                                  className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-between gap-2"
                                >
                                  <div className="flex items-center space-x-2">
                                    <Receipt className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                    <div>
                                      <span className="font-bold text-white">#{ord.id}</span>
                                      {ord.title && (
                                        <span className="text-slate-300 ml-2">{ord.title}</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-3 text-right shrink-0">
                                    {ord.time && (
                                      <span className="text-slate-400 text-[11px]">{ord.time}</span>
                                    )}
                                    <span className="font-black text-amber-300">
                                      ৳{ord.cost.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB 3: Delivery Charges Breakdown */}
          {activeTab === 'DELIVERY' && (
            <div className="space-y-4">
              <div className="p-5 rounded-3xl bg-slate-800/70 border border-slate-700/80">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center">
                    <Bike className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-white">
                      আজকের ডেলিভারি চার্জ কালেকশন
                    </h4>
                    <p className="text-xs text-slate-400">
                      আজকে ডেলিভারি অর্ডারগুলো থেকে আদায়কৃত মোট সার্ভিস ফি
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-700">
                  <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-700">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      মোট ডেলিভারি চার্জ
                    </span>
                    <div className="text-2xl font-black text-emerald-300 mt-1">
                      ৳{todayDeliveryCharges.toLocaleString()}
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-700">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      সম্পন্ন অর্ডার
                    </span>
                    <div className="text-2xl font-black text-white mt-1">
                      {todayDeliveredOrdersCount} টি
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-700">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      গড় ডেলিভারি ফি
                    </span>
                    <div className="text-2xl font-black text-indigo-300 mt-1">
                      ৳{todayDeliveredOrdersCount > 0 ? Math.round(todayDeliveryCharges / todayDeliveredOrdersCount) : 0}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 text-xs text-slate-300 flex items-start space-x-3">
                <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>
                  ডেলিভারি ফি কাস্টমারদের কাছ থেকে সরাসরি ক্যাশ বা অনলাইনে হেল্পারের মাধ্যমে সংগৃহীত হয়। প্ল্যাটফর্ম কমিশন এবং হেল্পার পেআউট এই পরিমাণের অংশ।
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="text-xs text-slate-400">
            সর্বমোট প্রদেয়: <strong className="text-amber-300 font-black">৳{todayReturnableStoreAmount.toLocaleString()}</strong> ({storesOwed.length} টি স্টোর)
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>
    </div>
  );
};
