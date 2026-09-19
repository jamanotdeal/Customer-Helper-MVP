'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Wallet, WalletTransaction, WithdrawalRequest, Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from './CustomModal';
import { calculateHelperCommission } from '@/lib/pricing';
import {
  Wallet as WalletIcon,
  Calendar,
  DollarSign,
  ChevronDown,
  X,
  ShoppingBag,
  MapPin,
  Clock,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Receipt,
  Info,
  CheckCircle2,
} from 'lucide-react';

export const HelperWallet: React.FC = () => {
  const { user } = useAuth();
  const { showAlert } = useModal();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<Order[]>([]);
  
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('100');
  const [paymentMethod, setPaymentMethod] = useState<'bKash' | 'Nagad' | 'Rocket' | 'Bank' | 'Cash'>('bKash');
  const [accountNumber, setAccountNumber] = useState('01812345678');
  const [submitting, setSubmitting] = useState(false);

  // Modal for viewing order items & earnings breakdown
  const [showOrdersBreakdownModal, setShowOrdersBreakdownModal] = useState<boolean>(false);
  const [modalOrdersList, setModalOrdersList] = useState<Order[]>([]);
  const [modalTitle, setModalTitle] = useState<string>('');

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
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

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
  const formatExactDateTime = (dateStr?: string | number) => {
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
    if (!dropdownOpen) return;
    const handleOutsideClick = () => setDropdownOpen(false);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [dropdownOpen]);

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDropdownOpen(!dropdownOpen);
  };

  useEffect(() => {
    const syncWallet = () => {
      if (user) {
        const firestoreWallet = fallbackStore.wallets.get(user.uid);
        const w: Wallet = firestoreWallet ?? {
          userId: user.uid,
          totalEarned: 0,
          balance: 0,
          totalPaidCommission: 0,
          totalWithdrawn: 0,
          updatedAt: new Date().toISOString(),
        };

        const wds = Array.from(fallbackStore.withdrawals.values()).filter((item) => item.helperId === user.uid);

        // Fetch all delivered/completed orders of this helper
        const allOrders = Array.from(fallbackStore.orders.values());
        const helperOrders = allOrders.filter(
          (o) => o.helperId === user.uid && (o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED')
        );

        setWallet({ ...w });
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
    return deliveredOrders
      .filter((ord) => {
        const orderDate = ord.deliveredAt || ord.updatedAt || ord.createdAt;
        const t = new Date(orderDate).getTime();
        if (isNaN(t)) return true;
        if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
        if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.deliveredAt || a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.deliveredAt || b.updatedAt || b.createdAt).getTime();
        return timeB - timeA;
      });
  }, [deliveredOrders, startDate, endDate]);

  // Compute Financials helper for any order
  const getOrderFinancials = (o: Order) => {
    const minFee = fallbackStore.pricingSettings.feeCalculatorMinFee ?? 20;
    const baseFeeForHelper = o.isFreeDelivery
      ? Math.max(o.originalDeliveryFee || 0, minFee)
      : Math.max(o.deliveryFee || 0, minFee);
    const helperShare = calculateHelperCommission(baseFeeForHelper, fallbackStore.pricingSettings);
    const platformShare = baseFeeForHelper - helperShare;
    return {
      baseFeeForHelper,
      helperShare,
      platformShare,
    };
  };

  // Range Metrics
  const rangeMetrics = useMemo(() => {
    let earned = 0;
    let totalCollected = 0;
    let commissionDue = 0;
    let paidCommission = 0;

    filteredOrders.forEach((o) => {
      const { baseFeeForHelper, helperShare, platformShare } = getOrderFinancials(o);
      earned += helperShare;
      totalCollected += baseFeeForHelper;
      commissionDue += platformShare;
    });

    filteredWithdrawals.forEach((w) => {
      if (w.status === 'APPROVED') {
        paidCommission += w.amount;
      }
    });

    return { earned, totalCollected, commissionDue, paidCommission, count: filteredOrders.length };
  }, [filteredOrders, filteredWithdrawals]);

  // Today's Metrics (local timezone date matching)
  const todayMetrics = useMemo(() => {
    const todayStr = getTodayStr(); // Local YYYY-MM-DD
    let earnedToday = 0;
    let collectedToday = 0;
    let commissionDueToday = 0;
    const todayOrders: Order[] = [];

    deliveredOrders.forEach((o) => {
      const orderDate = o.deliveredAt || o.updatedAt || o.createdAt;
      const orderLocalStr = getLocalYYYYMMDD(new Date(orderDate));
      if (orderLocalStr === todayStr) {
        const { baseFeeForHelper, helperShare, platformShare } = getOrderFinancials(o);
        earnedToday += helperShare;
        collectedToday += baseFeeForHelper;
        commissionDueToday += platformShare;
        todayOrders.push(o);
      }
    });

    todayOrders.sort((a, b) => {
      const timeA = new Date(a.deliveredAt || a.updatedAt || a.createdAt).getTime();
      const timeB = new Date(b.deliveredAt || b.updatedAt || b.createdAt).getTime();
      return timeB - timeA;
    });

    return { earnedToday, collectedToday, commissionDueToday, countToday: todayOrders.length, todayOrders };
  }, [deliveredOrders]);

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

    if (amt < minWithdrawal) {
      await showAlert(
        'কমিশন পরিশোধের তথ্য ভুল',
        `minimum payback is ${minWithdrawal}BDT`,
        'warning'
      );
      return;
    }

    setSubmitting(true);
    await fallbackStore.submitWithdrawalRequest(user.uid, user.displayName, amt, paymentMethod, accountNumber, 'helper');
    setSubmitting(false);
    setShowWithdrawModal(false);
    await showAlert('অনুরোধ সফল', 'কমিশন পরিশোধের তথ্য ভেরিফিকেশনের জন্য অ্যাডমিনের কাছে পাঠানো হয়েছে।', 'success');
  };

  const presetLabels = {
    ALL_TIME: 'All Times',
    TODAY: 'Today',
    LAST_7: 'Last 7 Days',
    THIS_MONTH: 'This Month',
    CUSTOM: 'Custom'
  };

  const openOrdersBreakdown = (orders: Order[], title: string) => {
    setModalOrdersList(orders);
    setModalTitle(title);
    setShowOrdersBreakdownModal(true);
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
            <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-100">Earnings & Wallet</span>
          </div>

          {/* Filter Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={toggleDropdown}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all text-xs font-bold border border-white/10"
            >
              <span>{presetLabels[activePreset]}</span>
              <ChevronDown className="w-3.5 h-3.5 text-white/80" />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-slate-900 border border-white/10 rounded-2xl shadow-xl z-30 py-1 text-xs">
                {Object.entries(presetLabels).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      handlePresetSelect(preset as any);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-white/10 transition-colors ${
                      activePreset === preset ? 'text-indigo-300 font-extrabold' : 'text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Custom Date Pickers */}
        {activePreset === 'CUSTOM' && (
          <div className="grid grid-cols-2 gap-2 text-[11px] font-bold mb-4 p-3 bg-white/5 border border-white/10 rounded-2xl animate-in fade-in duration-200">
            <div className="flex flex-col bg-slate-900/50 border border-white/10 rounded-xl px-2.5 py-1">
              <span className="text-white/50 text-[8px] uppercase font-extrabold">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset('CUSTOM');
                }}
                className="bg-transparent text-white font-extrabold focus:outline-none text-[11px] w-full"
              />
            </div>
            <div className="flex flex-col bg-slate-900/50 border border-white/10 rounded-xl px-2.5 py-1">
              <span className="text-white/50 text-[8px] uppercase font-extrabold">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset('CUSTOM');
                }}
                className="bg-transparent text-white font-extrabold focus:outline-none text-[11px] w-full"
              />
            </div>
          </div>
        )}

        {/* Main Earnings & Total Collected Block */}
        <div
          onClick={() => {
            if (activePreset === 'TODAY') {
              openOrdersBreakdown(todayMetrics.todayOrders, "Today's Orders Breakdown (আজকের আয়)");
            } else {
              openOrdersBreakdown(filteredOrders, `${presetLabels[activePreset]} Orders Breakdown (${presetLabels[activePreset]} আয়)`);
            }
          }}
          className="mb-5 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer group relative"
          title="অর্ডারের বিবরণ দেখতে ট্যাপ করুন"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-indigo-200 font-bold block">
              {activePreset === 'TODAY' ? "Today's Total Income (আজকের নিট আয়)" : `${presetLabels[activePreset]} Total Income (${presetLabels[activePreset]} নিট আয়)`}
            </span>
            <span className="text-[10px] text-indigo-300 font-bold bg-indigo-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 group-hover:bg-indigo-500/30 transition-colors">
              <span>অর্ডারের তালিকা দেখুন</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>

          <h2 className="text-4xl font-black text-white tracking-tight flex items-baseline gap-1">
            ৳{activePreset === 'TODAY' ? todayMetrics.earnedToday : rangeMetrics.earned}
          </h2>

          {/* Total Collected Amount under Total Income Number */}
          <div className="mt-2.5 pt-2.5 border-t border-white/10 flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-indigo-200 font-semibold flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5 text-indigo-400" />
                <span>Total Collected Amount (মোট সংগৃহীত চার্জ):</span>
              </span>
              <span className="font-extrabold text-indigo-100 text-sm">
                ৳{activePreset === 'TODAY' ? todayMetrics.collectedToday : rangeMetrics.totalCollected}
              </span>
            </div>
            <span className="text-[10px] text-indigo-300/80 font-normal">
              *কমিশন কাটার পূর্বের মোট ডেলিভারি চার্জ (Sum of charges without deducting commission)
            </span>
          </div>

          <div className="mt-2 text-xs text-amber-300 font-semibold flex items-center justify-between">
            <span>বকেয়া কমিশন (Commission to Payback):</span>
            <span className="font-extrabold text-amber-200">৳{wallet?.balance || 0}</span>
          </div>
        </div>

        {/* 4 Stats Grid - Clickable to view details */}
        <div className="grid grid-cols-2 gap-2.5 mb-5 text-white/90">
          <div
            onClick={() => openOrdersBreakdown(filteredOrders, `${presetLabels[activePreset]} Total Earned Orders`)}
            className="bg-white/10 hover:bg-white/15 border border-white/5 p-3 rounded-2xl space-y-1 backdrop-blur-xs cursor-pointer transition-all active:scale-98 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-indigo-200/80 font-bold block leading-tight">
                {activePreset === 'ALL_TIME' ? 'Total Income' : 'Income'}
              </span>
              <Info className="w-3 h-3 text-indigo-300/60 group-hover:text-indigo-200" />
            </div>
            <span className="text-base font-black text-white block truncate">
              ৳{rangeMetrics.earned}
            </span>
            <span className="text-[9px] text-indigo-300 font-medium block">হেলপার নিট আয়</span>
          </div>
          
          <div
            onClick={() => openOrdersBreakdown(filteredOrders, `${presetLabels[activePreset]} Total Collected Orders`)}
            className="bg-white/10 hover:bg-white/15 border border-white/5 p-3 rounded-2xl space-y-1 backdrop-blur-xs cursor-pointer transition-all active:scale-98 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-indigo-200/80 font-bold block leading-tight">
                Total Collected
              </span>
              <Info className="w-3 h-3 text-indigo-300/60 group-hover:text-indigo-200" />
            </div>
            <span className="text-base font-black text-white block truncate">
              ৳{rangeMetrics.totalCollected}
            </span>
            <span className="text-[9px] text-indigo-300 font-medium block">মোট সংগৃহীত চার্জ</span>
          </div>

          <div
            onClick={() => openOrdersBreakdown(filteredOrders, `${presetLabels[activePreset]} Platform Commission Orders`)}
            className="bg-white/10 hover:bg-white/15 border border-white/5 p-3 rounded-2xl space-y-1 backdrop-blur-xs cursor-pointer transition-all active:scale-98 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-indigo-200/80 font-bold block leading-tight">
                Total Commission
              </span>
              <Info className="w-3 h-3 text-indigo-300/60 group-hover:text-indigo-200" />
            </div>
            <span className="text-base font-black text-indigo-200 block truncate">
              ৳{rangeMetrics.commissionDue}
            </span>
            <span className="text-[9px] text-indigo-300 font-medium block">প্ল্যাটফর্ম শেয়ার</span>
          </div>

          <div className="bg-white/10 border border-white/5 p-3 rounded-2xl space-y-1 backdrop-blur-xs">
            <span className="text-[10px] text-indigo-200/80 font-bold block leading-tight">
              Due Commission
            </span>
            <span className="text-base font-black text-amber-300 block truncate">
              ৳{wallet?.balance || 0}
            </span>
            <span className="text-[9px] text-amber-300/80 font-medium block">পরিশোধযোগ্য বকেয়া</span>
          </div>
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
            setWithdrawAmount(String(wallet?.balance || 0));
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
            ? 'Pay Commission to Platform (বকেয়া কমিশন পরিশোধ করুন)'
            : 'No Due Commission (কোনো বকেয়া নেই)'}
        </button>
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

      {/* Helper Earnings Orders Breakdown Popup Modal */}
      {showOrdersBreakdownModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-white/10 text-indigo-200">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">{modalTitle || 'আয়ের বিবরণ (Orders Breakdown)'}</h3>
                  <p className="text-[11px] text-indigo-200">মোট {modalOrdersList.length}টি ডেলিভারি অর্ডার</p>
                </div>
              </div>
              <button
                onClick={() => setShowOrdersBreakdownModal(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Summary KPI Header */}
            {modalOrdersList.length > 0 && (() => {
              let totalOrdersCollected = 0;
              let totalOrdersEarned = 0;
              let totalOrdersCommission = 0;
              modalOrdersList.forEach((o) => {
                const { baseFeeForHelper, helperShare, platformShare } = getOrderFinancials(o);
                totalOrdersCollected += baseFeeForHelper;
                totalOrdersEarned += helperShare;
                totalOrdersCommission += platformShare;
              });

              return (
                <div className="p-3.5 bg-indigo-50/70 border-b border-indigo-100 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-white rounded-xl border border-indigo-100 shadow-xs">
                    <span className="text-[10px] font-bold text-gray-500 block">মোট চার্জ</span>
                    <span className="text-sm font-black text-indigo-950">৳{totalOrdersCollected}</span>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200 shadow-xs">
                    <span className="text-[10px] font-bold text-emerald-800 block">আপনার আয়</span>
                    <span className="text-sm font-black text-emerald-700">৳{totalOrdersEarned}</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-indigo-100 shadow-xs">
                    <span className="text-[10px] font-bold text-gray-500 block">কমিশন</span>
                    <span className="text-sm font-black text-indigo-900">৳{totalOrdersCommission}</span>
                  </div>
                </div>
              );
            })()}

            {/* Orders List Area */}
            <div className="p-4 overflow-y-auto space-y-2.5 flex-1 text-xs">
              {modalOrdersList.length === 0 ? (
                <div className="py-12 text-center text-gray-400 space-y-2">
                  <ShoppingBag className="w-10 h-10 mx-auto text-gray-300" />
                  <p className="font-bold text-gray-600">এই সময়সীমার মধ্যে কোনো সম্পন্ন ডেলিভারি পাওয়া যায়নি।</p>
                </div>
              ) : (
                modalOrdersList.map((ord) => {
                  const { baseFeeForHelper, helperShare, platformShare } = getOrderFinancials(ord);
                  const itemsSummary = ord.items && ord.items.length > 0
                    ? ord.items.map((i) => `${i.name}${i.qty ? ` (${i.qty})` : ''}`).join(', ')
                    : ord.title || 'ডেলিভারি অর্ডার';

                  return (
                    <div
                      key={ord.id}
                      className="p-3.5 rounded-2xl bg-white border border-gray-200/80 shadow-xs hover:border-emerald-300 transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-gray-900 text-xs">#{ord.id}</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800">
                              Delivered
                            </span>
                            {ord.isFreeDelivery && (
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-700">
                                Free Delivery
                              </span>
                            )}
                          </div>
                          <p className="font-bold text-gray-800 mt-1 text-xs line-clamp-2">{itemsSummary}</p>
                          <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span>{formatExactDateTime(ord.deliveredAt || ord.updatedAt || ord.createdAt)}</span>
                          </span>
                        </div>

                        {/* Earnings Breakdown Badge on Right */}
                        <div className="text-right shrink-0 bg-emerald-50 border border-emerald-200/70 p-2 rounded-xl min-w-[95px]">
                          <span className="text-[9px] font-extrabold text-emerald-800 block uppercase">হেলপার আয়</span>
                          <span className="text-sm font-black text-emerald-700 block">+৳{helperShare}</span>
                          <span className="text-[9px] text-gray-500 font-semibold block mt-0.5">
                            চার্জ: ৳{baseFeeForHelper}
                          </span>
                          <span className="text-[9px] text-indigo-700 font-semibold block">
                            ফি: ৳{platformShare}
                          </span>
                        </div>
                      </div>

                      {/* Route & Customer Details */}
                      {(ord.pickupLocation?.address || ord.deliveryLocation?.address) && (
                        <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-600 space-y-1">
                          {ord.pickupLocation?.address && (
                            <div className="flex items-start gap-1.5 truncate">
                              <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 px-1 py-0.5 rounded shrink-0">Pickup:</span>
                              <span className="truncate">{ord.pickupLocation.address}</span>
                            </div>
                          )}
                          {ord.deliveryLocation?.address && (
                            <div className="flex items-start gap-1.5 truncate">
                              <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded shrink-0">Delivery:</span>
                              <span className="truncate">{ord.deliveryLocation.address}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowOrdersBreakdownModal(false)}
                className="py-2.5 px-5 rounded-2xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs transition-all active:scale-95 shadow-sm"
              >
                বন্ধ করুন (Close)
              </button>
            </div>
          </div>
        </div>
      )}

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
                  min={minWithdrawal}
                  max={wallet?.balance || 0}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full p-3.5 rounded-2xl border border-gray-200 font-extrabold text-base focus:border-emerald-500 outline-none"
                  required
                />
                <p className="text-[10px] text-gray-500 mt-1 font-bold">minimum payback is {minWithdrawal}BDT</p>
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
                <label className="text-xs font-bold text-gray-700 block mb-1">Note (optional)</label>
                <textarea
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Transaction id or anything for clearification"
                  rows={3}
                  className="w-full p-3 rounded-2xl border border-gray-200 font-bold text-sm focus:border-emerald-500 outline-none resize-none"
                />
              </div>

              <div className="flex space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 py-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs transition-all"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3.5 rounded-2xl bg-emerald-600 text-white font-extrabold text-xs shadow-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>জমা হচ্ছে...</span>
                    </>
                  ) : (
                    <span>তথ্য জমা দিন</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
