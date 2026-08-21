'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Wallet, WalletTransaction, WithdrawalRequest, Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from './CustomModal';
import { calculateHelperCommission } from '@/lib/pricing';
import {
  Wallet as WalletIcon,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Filter,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

export const HelperWallet: React.FC = () => {
  const { user } = useAuth();
  const { showAlert } = useModal();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<Order[]>([]);
  
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('100');
  const [paymentMethod, setPaymentMethod] = useState<'bKash' | 'Nagad' | 'Rocket' | 'Bank' | 'Cash'>('bKash');
  const [accountNumber, setAccountNumber] = useState('01812345678');
  const [submitting, setSubmitting] = useState(false);

  // Pagination for Wallet Ledger
  const [ledgerPage, setLedgerPage] = useState(1);
  const ledgerPageSize = 10;

  const getPaymentInstructions = () => {
    const settings = fallbackStore.pricingSettings;
    switch (paymentMethod) {
      case 'bKash':
        return settings.bkashInstructions || 'bKash Personal: Send Money to 018XXXXXXXX and provide transaction ID.';
      case 'Nagad':
        return settings.nagadInstructions || 'Nagad Personal: Send Money to 018XXXXXXXX and provide transaction ID.';
      case 'Rocket':
        return settings.rocketInstructions || 'Rocket Personal: Send Money to 018XXXXXXXX and provide transaction ID.';
      case 'Bank':
        return settings.bankInstructions || 'Bank Account: Transfer due commission to Bank Name, Account: XXXX-XXXX-XXXX, Branch: XXX, and write Reference.';
      case 'Cash':
        return settings.cashInstructions || 'Cash Payment: Pay directly at the Jamanot office desk and get a receipt.';
      default:
        return '';
    }
  };

  // Date Range Filtering State (Default: ALL_TIME)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activePreset, setActivePreset] = useState<'ALL_TIME' | 'TODAY' | 'LAST_7' | 'THIS_MONTH' | 'CUSTOM'>('ALL_TIME');
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);

  const minWithdrawal = fallbackStore.pricingSettings.minWithdrawalAmount || 100;

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

  const handlePresetSelect = (preset: 'ALL_TIME' | 'TODAY' | 'LAST_7' | 'THIS_MONTH' | 'CUSTOM') => {
    setActivePreset(preset);
    if (preset === 'CUSTOM') {
      setShowCustomPicker((prev) => !prev);
      return;
    }
    setShowCustomPicker(false);
    if (preset === 'ALL_TIME') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      setStartDate(getTodayStr());
      setEndDate(getTodayStr());
    } else if (preset === 'LAST_7') {
      setStartDate(getDaysAgoStr(7));
      setEndDate(getTodayStr());
    } else if (preset === 'THIS_MONTH') {
      setStartDate(getStartOfMonthStr());
      setEndDate(getTodayStr());
    }
  };

  // Exact Date and Time Formatter (e.g., "08 Aug 2026, 05:47 PM")
  const formatExactDateTime = (dateStr: string | number) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  useEffect(() => {
    const syncWallet = () => {
      if (user) {
        const w = fallbackStore.getHelperWallet(user.uid);
        const txs = fallbackStore.walletTransactions.get(user.uid) || [];
        const wds = Array.from(fallbackStore.withdrawals.values()).filter((item) => item.helperId === user.uid);
        const allOrders = Array.from(fallbackStore.orders.values());
        const helperOrders = allOrders.filter(
          (o) => o.helperId === user.uid && o.status === 'DELIVERED'
        );

        setWallet({ ...w });
        setTransactions([...txs]);
        setWithdrawals([...wds]);
        setDeliveredOrders(helperOrders);
      }
    };

    syncWallet();
    const unsub = fallbackStore.subscribe(syncWallet);
    return () => {
      unsub();
    };
  }, [user]);

  // Filtered Transactions & Withdrawals based on selected Date Range
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const t = new Date(tx.createdAt).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [transactions, startDate, endDate]);

  const totalLedgerPages = Math.ceil(filteredTransactions.length / ledgerPageSize) || 1;
  const paginatedTransactions = useMemo(() => {
    return filteredTransactions.slice((ledgerPage - 1) * ledgerPageSize, ledgerPage * ledgerPageSize);
  }, [filteredTransactions, ledgerPage]);

  // Reset ledger page on transactions change
  useEffect(() => {
    setLedgerPage(1);
  }, [filteredTransactions]);

  const filteredWithdrawals = useMemo(() => {
    return withdrawals.filter((w) => {
      const t = new Date(w.createdAt).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [withdrawals, startDate, endDate]);

  // Filtered Delivered Orders based on selected Date Range
  const filteredOrders = useMemo(() => {
    return deliveredOrders.filter((ord) => {
      const orderDate = ord.deliveredAt || ord.createdAt;
      const t = new Date(orderDate).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [deliveredOrders, startDate, endDate]);

  // Range Metrics
  const rangeMetrics = useMemo(() => {
    let earned = 0;
    let commissionDue = 0;
    let paidCommission = 0;

    filteredOrders.forEach((o) => {
      const helperShare = calculateHelperCommission(o.deliveryFee, fallbackStore.pricingSettings);
      earned += helperShare;
      commissionDue += (o.deliveryFee - helperShare);
    });

    filteredWithdrawals.forEach((w) => {
      if (w.status === 'APPROVED') {
        paidCommission += w.amount;
      }
    });

    return { earned, commissionDue, paidCommission };
  }, [filteredOrders, filteredWithdrawals]);

  const pendingPayback = withdrawals.find((w) => w.status === 'PENDING');
  const hasPendingPayback = !!pendingPayback;
  const canPayback = (wallet?.balance || 0) > 0 && !hasPendingPayback;

  const handlePaybackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasPendingPayback) {
      await showAlert(
        'অনুরোধ ইতিমধ্যে প্রক্রিয়াধীন',
        `আপনার একটি কমিশন পরিশোধের অনুরোধ (৳${pendingPayback?.amount}) ইতিমধ্যে প্রক্রিয়াধীন আছে। অ্যাডমিন অনুমোদন/বাতিল না করা পর্যন্ত নতুন অনুরোধ করা যাবে না।`,
        'warning'
      );
      setShowWithdrawModal(false);
      return;
    }

    const amt = parseFloat(withdrawAmount);
    if (!user || isNaN(amt) || amt <= 0 || amt > (wallet?.balance || 0)) {
      await showAlert(
        'কমিশন পরিশোধের তথ্য ভুল',
        `অনুগ্রহ করে ১ থেকে ৳${wallet?.balance || 0} এর মধ্যে বকেয়া কমিশন পরিশোধ করুন।`,
        'warning'
      );
      return;
    }

    setSubmitting(true);
    await fallbackStore.submitWithdrawalRequest(user.uid, user.displayName, amt, paymentMethod, accountNumber);
    setSubmitting(false);
    setShowWithdrawModal(false);
    await showAlert('অনুরোধ সফল', 'কমিশন পরিশোধের তথ্য ভেরিফিকেশনের জন্য অ্যাডমিনের কাছে পাঠানো হয়েছে।', 'success');
  };

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-200">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 rounded-3xl p-6 text-white shadow-floating relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-2xl bg-white/20 backdrop-blur-xs">
              <WalletIcon className="w-5 h-5 text-indigo-300" />
            </div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-100">Commission Ledger</span>
          </div>
        </div>

        <div className="mb-5">
          <span className="text-xs text-indigo-200 block mb-1">Outstanding Due Commission</span>
          <h2 className="text-4xl font-black text-white tracking-tight">
            ৳{wallet?.balance || 0}
          </h2>
        </div>

        {hasPendingPayback && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs font-semibold">
            ⏳ আপনার ৳{pendingPayback.amount} commission payback অনুরোধ অ্যাডমিনের পর্যালোচনায় আছে।
          </div>
        )}

        <button
          onClick={() => {
            if (hasPendingPayback) {
              showAlert(
                'অনুরোধ ইতিমধ্যে প্রক্রিয়াধীন',
                `আপনার একটি কমিশন পরিশোধের অনুরোধ (৳${pendingPayback.amount}) ইতিমধ্যে প্রক্রিয়াধীন আছে। অ্যাডমিন অনুমোদন/বাতিল না করা পর্যন্ত নতুন অনুরোধ করা যাবে না।`,
                'warning'
              );
              return;
            }
            setShowWithdrawModal(true);
          }}
          disabled={!canPayback}
          className={`w-full py-3.5 rounded-2xl font-extrabold text-sm shadow-md transition-all ${
            canPayback
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-98'
              : 'bg-white/20 text-white/60 cursor-not-allowed'
          }`}
        >
          {hasPendingPayback
            ? 'Payback Pending Admin Approval'
            : canPayback
            ? 'Pay Commission to Platform'
            : 'No Due Commission'}
        </button>
      </div>

      {/* Date Range Selector */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-soft space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-emerald-700" />
            <span className="text-xs font-extrabold text-gray-900">Filter by Date Range</span>
          </div>
          {activePreset !== 'ALL_TIME' && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
              Filtered
            </span>
          )}
        </div>

        {/* Quick Filter Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-extrabold scrollbar-none">
          <button
            onClick={() => handlePresetSelect('ALL_TIME')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
              activePreset === 'ALL_TIME'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            All Time
          </button>
          <button
            onClick={() => handlePresetSelect('TODAY')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
              activePreset === 'TODAY'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => handlePresetSelect('LAST_7')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
              activePreset === 'LAST_7'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => handlePresetSelect('THIS_MONTH')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
              activePreset === 'THIS_MONTH'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => handlePresetSelect('CUSTOM')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
              activePreset === 'CUSTOM' || showCustomPicker
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            Custom
          </button>
        </div>

        {/* Custom Date Pickers - Only shown when Custom button is clicked */}
        {(showCustomPicker || activePreset === 'CUSTOM') && (
          <div className="grid grid-cols-2 gap-2 text-xs font-bold pt-1 animate-in fade-in duration-200">
            <div className="flex flex-col bg-gray-50 border border-gray-200 rounded-2xl px-3 py-1.5">
              <span className="text-gray-400 text-[9px] uppercase font-extrabold">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset('CUSTOM');
                }}
                className="bg-transparent text-gray-900 font-extrabold focus:outline-none text-xs"
              />
            </div>
            <div className="flex flex-col bg-gray-50 border border-gray-200 rounded-2xl px-3 py-1.5">
              <span className="text-gray-400 text-[9px] uppercase font-extrabold">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset('CUSTOM');
                }}
                className="bg-transparent text-gray-900 font-extrabold focus:outline-none text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-soft space-y-1">
          <span className="text-[10px] text-gray-400 font-extrabold block leading-tight">
            {activePreset === 'ALL_TIME' ? 'Total Earned' : 'Earned'}
          </span>
          <span className="text-sm font-black text-gray-900 block truncate">
            ৳{activePreset === 'ALL_TIME' ? (wallet?.totalEarned || 0) : rangeMetrics.earned}
          </span>
          {activePreset !== 'ALL_TIME' && (
            <span className="text-[8px] text-gray-400 block truncate">All-Time: ৳{wallet?.totalEarned || 0}</span>
          )}
        </div>
        <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-soft space-y-1">
          <span className="text-[10px] text-gray-400 font-extrabold block leading-tight">
            {activePreset === 'ALL_TIME' ? 'Paid Commission' : 'Paid Comm.'}
          </span>
          <span className="text-sm font-black text-emerald-700 block truncate">
            ৳{activePreset === 'ALL_TIME' ? (wallet?.totalPaidCommission || 0) : rangeMetrics.paidCommission}
          </span>
          {activePreset !== 'ALL_TIME' && (
            <span className="text-[8px] text-gray-400 block truncate">All-Time: ৳{wallet?.totalPaidCommission || 0}</span>
          )}
        </div>
        <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-soft space-y-1">
          <span className="text-[10px] text-gray-400 font-extrabold block leading-tight">
            {activePreset === 'ALL_TIME' ? 'Total Commission' : 'Commission'}
          </span>
          <span className="text-sm font-black text-blue-700 block truncate">
            ৳{activePreset === 'ALL_TIME' 
              ? ((wallet?.totalPaidCommission || 0) + (wallet?.balance || 0)) 
              : rangeMetrics.commissionDue}
          </span>
          {activePreset !== 'ALL_TIME' && (
            <span className="text-[8px] text-gray-400 block truncate">All-Time: ৳{((wallet?.totalPaidCommission || 0) + (wallet?.balance || 0))}</span>
          )}
        </div>
      </div>

      {/* Withdrawal Requests History */}
      {filteredWithdrawals.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Payback History ({filteredWithdrawals.length})
            </h3>
          </div>
          <div className="space-y-2">
            {filteredWithdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 text-xs">
                <div>
                  <span className="font-bold text-gray-900 block">৳{w.amount} ({w.paymentMethod})</span>
                  <span className="text-[10px] font-semibold text-gray-500 block">
                    {formatExactDateTime(w.createdAt)}
                  </span>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                    w.status === 'APPROVED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : w.status === 'REJECTED'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {w.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Immutable Transaction Ledger */}
      <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Wallet Ledger ({filteredTransactions.length})
          </h3>
        </div>
        {filteredTransactions.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">কোনো লেনদেন রেকর্ড পাওয়া যায়নি।</p>
        ) : (
          <>
            <div className="space-y-2.5">
              {paginatedTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50/70 border border-gray-100 text-xs">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-2 rounded-xl ${
                        tx.amount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {tx.amount > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                    </div>
                    <div>
                      <span className="font-bold text-gray-900 block">{tx.description}</span>
                      <span className="text-[10px] font-semibold text-gray-500 block">
                        {formatExactDateTime(tx.createdAt)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`font-black text-sm ${
                      tx.amount > 0 ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {tx.amount > 0 ? `+৳${tx.amount}` : `-৳${Math.abs(tx.amount)}`}
                  </span>
                </div>
              ))}
            </div>
            {filteredTransactions.length > ledgerPageSize && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setLedgerPage((p) => Math.max(p - 1, 1))}
                  disabled={ledgerPage === 1}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-250 text-gray-800 rounded-xl text-xs font-black disabled:opacity-40 transition-all select-none"
                >
                  Prev
                </button>
                <span className="text-xs font-black text-slate-800">
                  Page {ledgerPage} of {totalLedgerPages}
                </span>
                <button
                  type="button"
                  onClick={() => setLedgerPage((p) => Math.min(p + 1, totalLedgerPages))}
                  disabled={ledgerPage === totalLedgerPages}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-250 text-gray-800 rounded-xl text-xs font-black disabled:opacity-40 transition-all select-none"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Withdrawal Form Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="font-bold text-lg text-gray-900">কমিশন পরিশোধের অনুরোধ (Payback)</h3>
            <form onSubmit={handlePaybackSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Payback Amount (৳) ( বকেয়া কমিশন: ৳{wallet?.balance} )
                </label>
                <input
                  type="number"
                  min={1}
                  max={wallet?.balance || 0}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full p-3.5 rounded-2xl border border-gray-200 font-extrabold text-base focus:border-emerald-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Payment Method</label>
                <div className="flex flex-wrap gap-2">
                  {(['bKash', 'Nagad', 'Rocket', 'Bank', 'Cash'] as const).map((method) => (
                    <button
                      type="button"
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`px-3.5 py-2 rounded-2xl font-bold text-xs border transition-all ${
                        paymentMethod === method
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-950 shadow-xs'
                          : 'border-gray-200 text-gray-600 bg-gray-50'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method Specific Instructions */}
              <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-2xl text-[11px] font-semibold text-indigo-950 leading-relaxed">
                <span className="font-bold text-indigo-900 block mb-1">Instructions (নির্দেশাবলী):</span>
                {getPaymentInstructions()}
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">মোবাইল নম্বর / ট্রানজেকশন আইডি (TxID)</label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="মোবাইল বা TxID লিখুন..."
                  className="w-full p-3.5 rounded-2xl border border-gray-200 font-bold text-sm focus:border-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="flex space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-xs"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3.5 rounded-2xl bg-emerald-600 text-white font-extrabold text-xs shadow-md hover:bg-emerald-700"
                >
                  তথ্য জমা দিন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
