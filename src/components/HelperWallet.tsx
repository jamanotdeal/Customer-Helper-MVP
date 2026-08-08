'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Wallet, WalletTransaction, WithdrawalRequest } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from './CustomModal';
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
  
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('100');
  const [paymentMethod, setPaymentMethod] = useState<'bKash' | 'Nagad' | 'Rocket'>('bKash');
  const [accountNumber, setAccountNumber] = useState('01812345678');
  const [submitting, setSubmitting] = useState(false);

  // Date Range Filtering State (Default: ALL_TIME)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activePreset, setActivePreset] = useState<'ALL_TIME' | 'TODAY' | 'LAST_7' | 'THIS_MONTH' | 'CUSTOM'>('ALL_TIME');

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

  const handlePresetSelect = (preset: 'ALL_TIME' | 'TODAY' | 'LAST_7' | 'THIS_MONTH') => {
    setActivePreset(preset);
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
        const w = fallbackStore.wallets.get(user.uid) || {
          userId: user.uid,
          balance: 0,
          totalEarned: 0,
          totalWithdrawn: 0,
          updatedAt: new Date().toISOString(),
        };
        const txs = fallbackStore.walletTransactions.get(user.uid) || [];
        const wds = Array.from(fallbackStore.withdrawals.values()).filter((item) => item.helperId === user.uid);

        setWallet({ ...w });
        setTransactions([...txs]);
        setWithdrawals([...wds]);
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

  const filteredWithdrawals = useMemo(() => {
    return withdrawals.filter((w) => {
      const t = new Date(w.createdAt).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [withdrawals, startDate, endDate]);

  // Range Metrics
  const rangeMetrics = useMemo(() => {
    let earned = 0;
    let withdrawn = 0;

    filteredTransactions.forEach((tx) => {
      if (tx.amount > 0) {
        earned += tx.amount;
      }
    });

    filteredWithdrawals.forEach((w) => {
      if (w.status === 'APPROVED') {
        withdrawn += w.amount;
      }
    });

    return { earned, withdrawn };
  }, [filteredTransactions, filteredWithdrawals]);

  const canWithdraw = (wallet?.balance || 0) >= minWithdrawal;

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount);
    if (!user || isNaN(amt) || amt < minWithdrawal || amt > (wallet?.balance || 0)) {
      await showAlert(
        'উত্তোলন অনুপযোগী',
        `নূন্যতম উত্তোলন পরিমাণ ৳${minWithdrawal} এবং আপনার ব্যালেন্সের মধ্যে হতে হবে।`,
        'warning'
      );
      return;
    }

    setSubmitting(true);
    await fallbackStore.submitWithdrawalRequest(user.uid, user.displayName, amt, paymentMethod, accountNumber);
    setSubmitting(false);
    setShowWithdrawModal(false);
    await showAlert('অনুরোধ সফল', 'আপনার ব্যালেন্স উত্তোলনের অনুরোধ জমা হয়েছে।', 'success');
  };

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-200">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-900 rounded-3xl p-6 text-white shadow-floating relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-2xl bg-white/20 backdrop-blur-xs">
              <WalletIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-100">Helper Wallet</span>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/20 text-emerald-100">
            Min ৳{minWithdrawal}
          </span>
        </div>

        <div className="mb-5">
          <span className="text-xs text-emerald-200 block mb-1">Available Balance</span>
          <h2 className="text-4xl font-black text-white tracking-tight">
            ৳{wallet?.balance || 0}
          </h2>
        </div>

        <button
          onClick={() => setShowWithdrawModal(true)}
          disabled={!canWithdraw}
          className={`w-full py-3.5 rounded-2xl font-extrabold text-sm shadow-md transition-all ${
            canWithdraw
              ? 'bg-white text-emerald-900 hover:bg-emerald-50 active:scale-98'
              : 'bg-white/20 text-white/60 cursor-not-allowed'
          }`}
        >
          {canWithdraw ? 'Withdraw Balance' : `Minimum ৳${minWithdrawal} Required`}
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
        </div>

        {/* Custom Date Pickers */}
        <div className="grid grid-cols-2 gap-2 text-xs font-bold pt-1">
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
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-soft space-y-1">
          <span className="text-xs text-gray-400 font-bold block">
            {activePreset === 'ALL_TIME' ? 'Total Earned' : 'Earned in Range'}
          </span>
          <span className="text-xl font-extrabold text-gray-900 block">
            ৳{activePreset === 'ALL_TIME' ? (wallet?.totalEarned || 0) : rangeMetrics.earned}
          </span>
          {activePreset !== 'ALL_TIME' && (
            <span className="text-[10px] text-gray-400 block">Total All-Time: ৳{wallet?.totalEarned || 0}</span>
          )}
        </div>
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-soft space-y-1">
          <span className="text-xs text-gray-400 font-bold block">
            {activePreset === 'ALL_TIME' ? 'Total Withdrawn' : 'Withdrawn in Range'}
          </span>
          <span className="text-xl font-extrabold text-emerald-700 block">
            ৳{activePreset === 'ALL_TIME' ? (wallet?.totalWithdrawn || 0) : rangeMetrics.withdrawn}
          </span>
          {activePreset !== 'ALL_TIME' && (
            <span className="text-[10px] text-gray-400 block">Total All-Time: ৳{wallet?.totalWithdrawn || 0}</span>
          )}
        </div>
      </div>

      {/* Withdrawal Requests History */}
      {filteredWithdrawals.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Withdrawal History ({filteredWithdrawals.length})
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
          <div className="space-y-2.5">
            {filteredTransactions.map((tx) => (
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
        )}
      </div>

      {/* Withdrawal Form Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="font-bold text-lg text-gray-900">Withdrawal Request</h3>
            <form onSubmit={handleWithdrawSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Withdrawal Amount (৳) (Available: ৳{wallet?.balance})
                </label>
                <input
                  type="number"
                  min={minWithdrawal}
                  max={wallet?.balance || 0}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full p-3.5 rounded-2xl border border-gray-200 font-extrabold text-base focus:border-emerald-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['bKash', 'Nagad', 'Rocket'] as const).map((method) => (
                    <button
                      type="button"
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2.5 rounded-2xl font-bold text-xs border transition-all ${
                        paymentMethod === method
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Account / Mobile Number</label>
                <input
                  type="tel"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="01XXXXXXXXX"
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3.5 rounded-2xl bg-emerald-600 text-white font-extrabold text-xs shadow-md hover:bg-emerald-700"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

