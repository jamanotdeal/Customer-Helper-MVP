'use client';

import React, { useState, useMemo } from 'react';
import { Shop, Order, ShopOrder, WithdrawalRequest, Wallet, WalletTransaction } from '@/types';
import { fallbackStore, db, cleanForFirestore } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useModal } from '../CustomModal';
import {
  X,
  Store,
  DollarSign,
  TrendingUp,
  CreditCard,
  Send,
  Calendar,
  Search,
  User as UserIcon,
  Phone,
  MessageSquare,
  Package,
  ShoppingBag,
  CheckCircle2,
  Clock,
  Ban,
  ArrowRight,
  Layers,
  ChevronDown,
  ExternalLink,
  Receipt,
  FileSpreadsheet,
  BarChart2,
} from 'lucide-react';

interface AdminStoreDisbursementModalProps {
  shop: Shop;
  onClose: () => void;
  onDisbursed?: () => void;
}

type TabType = 'OVERVIEW' | 'HELPERS' | 'ORDERS' | 'HISTORY' | 'ANALYTICS';
type DatePreset = 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'THIS_MONTH' | 'ALL_TIME' | 'CUSTOM';

export const AdminStoreDisbursementModal: React.FC<AdminStoreDisbursementModalProps> = ({
  shop,
  onClose,
  onDisbursed,
}) => {
  const { showConfirm, showAlert } = useModal();

  const [activeTab, setActiveTab] = useState<TabType>('OVERVIEW');
  const [activePreset, setActivePreset] = useState<DatePreset>('TODAY');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Search queries
  const [helperSearch, setHelperSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');

  // Disbursement Form State
  const [showDisburseForm, setShowDisburseForm] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Bank Transfer');
  const [accountRefNote, setAccountRefNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper date utility
  const getLocalYYYYMMDD = (d: Date = new Date()): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handlePresetSelect = (preset: DatePreset) => {
    setActivePreset(preset);
    const today = new Date();
    if (preset === 'TODAY') {
      const t = getLocalYYYYMMDD(today);
      setStartDate(t);
      setEndDate(t);
    } else if (preset === 'YESTERDAY') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = getLocalYYYYMMDD(y);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'LAST_7') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(getLocalYYYYMMDD(d));
      setEndDate(getLocalYYYYMMDD(today));
    } else if (preset === 'THIS_MONTH') {
      const m = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(getLocalYYYYMMDD(m));
      setEndDate(getLocalYYYYMMDD(today));
    } else if (preset === 'ALL_TIME') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Commission Rate
  const commissionRate = useMemo(() => {
    const rate = Number(shop.commissionPercent);
    if (!isNaN(rate) && rate >= 0) return rate;
    const app = Array.from(fallbackStore.storeApplications.values()).find(
      (a) => a.userId === shop.ownerUserId || a.id === shop.applicationId
    );
    const appRate = Number(app?.commissionPercent);
    if (!isNaN(appRate) && appRate >= 0) return appRate;
    return 0;
  }, [shop]);

  // Target Store User ID
  const storeUserId = shop.ownerUserId || shop.id;

  // Retrieve all orders and shop orders
  const allOrders = useMemo(() => Array.from(fallbackStore.orders.values()), []);
  const allShopOrders = useMemo(() => Array.from(fallbackStore.shopOrders.values()), []);
  const allWithdrawals = useMemo(() => Array.from(fallbackStore.withdrawals.values()), []);

  // Filter Shop Orders matching this shop
  const shopOrdersForThisStore = useMemo(() => {
    const targetShopId = shop.id;
    return allShopOrders.filter(
      (so) => so.shopId === targetShopId || so.shopId === storeUserId || so.shopId === `store-${storeUserId}`
    );
  }, [allShopOrders, shop.id, storeUserId]);

  // Filter Parent Orders matching this shop
  const parentOrdersForThisStore = useMemo(() => {
    const targetShopId = shop.id;
    return allOrders.filter(
      (o) =>
        o.shopId === targetShopId ||
        o.shopId === storeUserId ||
        o.selectedShopIds?.includes(targetShopId) ||
        o.selectedShopIds?.includes(storeUserId)
    );
  }, [allOrders, shop.id, storeUserId]);

  // Store Withdrawals / Disbursements
  const storeWithdrawals = useMemo(() => {
    return allWithdrawals.filter(
      (w) =>
        w.helperId === storeUserId ||
        w.helperId === shop.id ||
        w.helperId === `store-${storeUserId}` ||
        (w.userType === 'store' && (w.helperName === shop.name || w.helperId === shop.id))
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allWithdrawals, storeUserId, shop.id, shop.name]);

  // Total Disbursed (All Time Approved)
  const totalAllTimeDisbursed = useMemo(() => {
    return storeWithdrawals
      .filter((w) => w.status === 'APPROVED')
      .reduce((sum, w) => sum + w.amount, 0);
  }, [storeWithdrawals]);

  // Combined Normalized Orders for this store with Full Details
  const normalizedStoreOrders = useMemo(() => {
    const map = new Map<string, any>();

    // 1. From ShopOrders
    shopOrdersForThisStore.forEach((so) => {
      const parent = allOrders.find((o) => o.id === so.parentOrderId);
      const isCanceled = so.status === 'CANCELED' || parent?.status === 'CANCELED';
      const isDelivered = parent?.status === 'DELIVERED' || so.status === 'DELIVERED';
      const isHandover = so.status === 'HANDOVER';
      const grossPrice = (so.price && so.price > 0) ? so.price : (parent?.productCost || 0);

      const comm = Math.round(grossPrice * (commissionRate / 100));
      const net = Math.max(0, grossPrice - comm);

      const helper = so.helperId ? fallbackStore.users.get(so.helperId) : undefined;
      const helperName = so.helperName || parent?.helperName || helper?.displayName || 'Helper';
      const helperPhone = parent?.helperPhone || helper?.phoneNumber || '';

      const effectiveDate = so.createdAt || parent?.createdAt || new Date().toISOString();

      map.set(so.parentOrderId || so.id, {
        id: so.id,
        parentOrderId: so.parentOrderId || so.id,
        orderNumber: parent?.id ? (parent.id.length > 8 ? parent.id.slice(-6).toUpperCase() : parent.id) : so.id.slice(-6).toUpperCase(),
        createdAt: effectiveDate,
        deliveredAt: parent?.statusHistory?.find((s) => s.status === 'DELIVERED')?.timestamp || so.updatedAt,
        status: isCanceled ? 'CANCELED' : isDelivered ? 'DELIVERED' : isHandover ? 'HANDOVER' : 'IN_PROGRESS',
        rawStatus: so.status,
        grossSales: grossPrice,
        commissionRate,
        commission: comm,
        netSales: net,
        helperId: so.helperId || parent?.helperId || 'unassigned',
        helperName,
        helperPhone,
        customerName: parent?.customerName || 'Customer',
        customerPhone: parent?.customerPhone || '',
        deliveryAddress: parent?.deliveryLocation?.address || '',
        itemsWithPrice: so.itemsWithPrice || [],
        itemsText: so.requestText || (parent?.items ? parent.items.map((i) => `${i.name} (x${i.qty})`).join(', ') : ''),
        note: so.note || parent?.additionalNote || '',
      });
    });

    // 2. From Parent Orders directly (if not already captured)
    parentOrdersForThisStore.forEach((po) => {
      if (!map.has(po.id)) {
        const isCanceled = po.status === 'CANCELED';
        const isDelivered = po.status === 'DELIVERED';
        const grossPrice = po.productCost || 0;
        const comm = Math.round(grossPrice * (commissionRate / 100));
        const net = Math.max(0, grossPrice - comm);

        const helper = po.helperId ? fallbackStore.users.get(po.helperId) : undefined;
        const helperName = po.helperName || helper?.displayName || 'Helper';
        const helperPhone = po.helperPhone || helper?.phoneNumber || '';

        map.set(po.id, {
          id: `po-${po.id}`,
          parentOrderId: po.id,
          orderNumber: po.id.length > 8 ? po.id.slice(-6).toUpperCase() : po.id,
          createdAt: po.createdAt,
          deliveredAt: po.statusHistory?.find((s) => s.status === 'DELIVERED')?.timestamp,
          status: isCanceled ? 'CANCELED' : isDelivered ? 'DELIVERED' : 'IN_PROGRESS',
          rawStatus: po.status,
          grossSales: grossPrice,
          commissionRate,
          commission: comm,
          netSales: net,
          helperId: po.helperId || 'unassigned',
          helperName,
          helperPhone,
          customerName: po.customerName || 'Customer',
          customerPhone: po.customerPhone || '',
          deliveryAddress: po.deliveryLocation?.address || '',
          itemsWithPrice: [],
          itemsText: po.items ? po.items.map((i) => `${i.name} (x${i.qty})`).join(', ') : '',
          note: po.additionalNote || '',
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [shopOrdersForThisStore, parentOrdersForThisStore, allOrders, commissionRate]);

  // Filter orders by Date Range
  const filteredOrders = useMemo(() => {
    return normalizedStoreOrders.filter((o) => {
      if (!startDate && !endDate) return true;
      const orderDateStr = o.createdAt ? o.createdAt.slice(0, 10) : '';
      if (startDate && orderDateStr < startDate) return false;
      if (endDate && orderDateStr > endDate) return false;
      return true;
    });
  }, [normalizedStoreOrders, startDate, endDate]);

  // Overall Financials Calculation (All-time vs Date Filtered)
  const allTimeDeliveredNetSales = useMemo(() => {
    return normalizedStoreOrders
      .filter((o) => o.status === 'DELIVERED' || o.status === 'HANDOVER')
      .reduce((sum, o) => sum + o.netSales, 0);
  }, [normalizedStoreOrders]);

  const allTimeGrossSales = useMemo(() => {
    return normalizedStoreOrders
      .filter((o) => o.status === 'DELIVERED' || o.status === 'HANDOVER')
      .reduce((sum, o) => sum + o.grossSales, 0);
  }, [normalizedStoreOrders]);

  const allTimeCommission = useMemo(() => {
    return normalizedStoreOrders
      .filter((o) => o.status === 'DELIVERED' || o.status === 'HANDOVER')
      .reduce((sum, o) => sum + o.commission, 0);
  }, [normalizedStoreOrders]);

  // Current Available Unpaid Balance = All Time Delivered Net Sales - All Time Disbursed
  const currentAvailableBalance = Math.max(0, allTimeDeliveredNetSales - totalAllTimeDisbursed);

  // Metrics for the Selected Date Range
  const rangeMetrics = useMemo(() => {
    let gross = 0;
    let comm = 0;
    let net = 0;
    let deliveredCount = 0;
    let activeCount = 0;
    let canceledCount = 0;

    filteredOrders.forEach((o) => {
      if (o.status === 'DELIVERED' || o.status === 'HANDOVER') {
        gross += o.grossSales;
        comm += o.commission;
        net += o.netSales;
        deliveredCount++;
      } else if (o.status === 'CANCELED') {
        canceledCount++;
      } else {
        activeCount++;
      }
    });

    return {
      gross,
      comm,
      net,
      deliveredCount,
      activeCount,
      canceledCount,
      totalCount: filteredOrders.length,
    };
  }, [filteredOrders]);

  // Helper-by-Helper Breakdown ("Which helper how much ordered")
  const helperBreakdown = useMemo(() => {
    const helperMap = new Map<string, {
      helperId: string;
      helperName: string;
      helperPhone: string;
      totalOrders: number;
      deliveredOrders: number;
      activeOrders: number;
      canceledOrders: number;
      totalProductValue: number;
      netProductValue: number;
      commissionValue: number;
      orders: any[];
    }>();

    filteredOrders.forEach((order) => {
      const key = order.helperId || order.helperName || 'unknown';
      if (!helperMap.has(key)) {
        helperMap.set(key, {
          helperId: order.helperId,
          helperName: order.helperName || 'Unassigned Helper',
          helperPhone: order.helperPhone || '',
          totalOrders: 0,
          deliveredOrders: 0,
          activeOrders: 0,
          canceledOrders: 0,
          totalProductValue: 0,
          netProductValue: 0,
          commissionValue: 0,
          orders: [],
        });
      }

      const item = helperMap.get(key)!;
      item.totalOrders += 1;
      item.orders.push(order);

      if (order.status === 'DELIVERED' || order.status === 'HANDOVER') {
        item.deliveredOrders += 1;
        item.totalProductValue += order.grossSales;
        item.commissionValue += order.commission;
        item.netProductValue += order.netSales;
      } else if (order.status === 'CANCELED') {
        item.canceledOrders += 1;
      } else {
        item.activeOrders += 1;
        item.totalProductValue += order.grossSales;
      }
    });

    let list = Array.from(helperMap.values());
    if (helperSearch.trim()) {
      const q = helperSearch.toLowerCase().trim();
      list = list.filter(
        (h) => h.helperName.toLowerCase().includes(q) || h.helperPhone.includes(q) || h.helperId.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => b.totalProductValue - a.totalProductValue);
  }, [filteredOrders, helperSearch]);

  // Filtered Orders for the Orders Tab
  const searchedOrders = useMemo(() => {
    return filteredOrders.filter((o) => {
      if (orderStatusFilter !== 'ALL' && o.status !== orderStatusFilter) {
        return false;
      }
      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase().trim();
        const matchesId = o.parentOrderId.toLowerCase().includes(q) || o.orderNumber.toLowerCase().includes(q);
        const matchesHelper = o.helperName.toLowerCase().includes(q) || o.helperPhone.includes(q);
        const matchesCustomer = o.customerName.toLowerCase().includes(q) || o.customerPhone.includes(q);
        const matchesItems = o.itemsText.toLowerCase().includes(q);
        return matchesId || matchesHelper || matchesCustomer || matchesItems;
      }
      return true;
    });
  }, [filteredOrders, orderStatusFilter, orderSearch]);

  // Handle Disbursement Submission
  const handleDisbursePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(payoutAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showAlert('ভুল পরিমাণ', 'অনুগ্রহ করে সঠিক পেমেন্ট পরিমাণ (৳) লিখুন।', 'error');
      return;
    }

    const confirmed = await showConfirm(
      'পেমেন্ট ডিসবার্সমেন্ট নিশ্চিতকরণ',
      `আপনি কি "${shop.name}" স্টোরকে ৳${amountNum.toLocaleString('en-US')} ডিসবার্স (পেমেন্ট ট্রান্সফার) করতে চান?\n\nপেমেন্ট মেথড: ${paymentMethod}\nরেফারেন্স/নোট: ${accountRefNote || 'কোনো রেফারেন্স নেই'}\n\nএটি সম্পন্ন হলে স্টোরের ওয়ালেটের অপরিশোধিত ব্যালেন্স কমে যাবে।`,
      'হ্যাঁ, পেমেন্ট ডিসবার্স করুন',
      'বাতিল'
    );

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const effectiveStoreUserId = shop.ownerUserId || (shop.id.startsWith('store-') ? shop.id.replace('store-', '') : shop.id);
      if (typeof (fallbackStore as any).recordStoreDisbursement === 'function') {
        await (fallbackStore as any).recordStoreDisbursement(
          shop.id,
          amountNum,
          paymentMethod,
          accountRefNote,
          effectiveStoreUserId
        );
      } else {
        // Direct Fallback Execution if browser HMR singleton is unrefreshed
        const storeUserId = effectiveStoreUserId;
        const storeName = shop.name || 'Store';
        const txId = `tx-store-${Date.now()}`;
        const newTx: WalletTransaction = {
          id: txId,
          userId: storeUserId,
          amount: -amountNum,
          type: 'PAYBACK',
          description: `Store payout disbursement by admin: ৳${amountNum} (${paymentMethod}${accountRefNote ? ` - ${accountRefNote}` : ''})`,
          createdAt: new Date().toISOString(),
        };

        const userTxs = fallbackStore.walletTransactions.get(storeUserId) || [];
        userTxs.unshift(newTx);
        fallbackStore.walletTransactions.set(storeUserId, userTxs);

        const reqId = `wd-store-${Date.now()}`;
        const req: WithdrawalRequest = {
          id: reqId,
          helperId: storeUserId,
          helperName: storeName,
          amount: amountNum,
          status: 'APPROVED',
          paymentMethod: paymentMethod || 'Bank Transfer',
          accountNumber: accountRefNote || 'Admin store disbursement',
          userType: 'store',
          createdAt: new Date().toISOString(),
          processedAt: new Date().toISOString(),
        };
        fallbackStore.withdrawals.set(req.id, req);

        if (shop.id && shop.id !== storeUserId) {
          const shopTxs = fallbackStore.walletTransactions.get(shop.id) || [];
          shopTxs.unshift({ ...newTx, userId: shop.id });
          fallbackStore.walletTransactions.set(shop.id, shopTxs);
        }

        const existing = fallbackStore.wallets.get(storeUserId);
        const currentWithdrawn = (existing?.totalWithdrawn ?? 0) + amountNum;
        const currentBalance = Math.max(0, (existing?.balance ?? 0) - amountNum);
        const updatedWallet: Wallet = {
          userId: storeUserId,
          totalEarned: existing?.totalEarned ?? 0,
          balance: currentBalance,
          totalPaidCommission: existing?.totalPaidCommission ?? 0,
          totalWithdrawn: currentWithdrawn,
          updatedAt: new Date().toISOString(),
        };
        fallbackStore.wallets.set(storeUserId, updatedWallet);

        fallbackStore.notify();

        try {
          await setDoc(doc(db, 'wallets', storeUserId), cleanForFirestore(updatedWallet), { merge: true });
          await setDoc(doc(db, 'walletTransactions', newTx.id), cleanForFirestore(newTx));
          await setDoc(doc(db, 'withdrawals', req.id), cleanForFirestore(req));
        } catch (e: any) {
          console.warn('[Firestore] direct recordStoreDisbursement note:', e?.message || e);
        }
      }

      showAlert(
        'পেমেন্ট সফলভাবে ডিসবার্স করা হয়েছে',
        `৳${amountNum.toLocaleString('en-US')} "${shop.name}" এর অ্যাকাউন্টে সফলভাবে রেকর্ড করা হয়েছে। স্টোর ওয়ালেট সাথে সাথে আপডেট হয়েছে।`,
        'success'
      );

      setPayoutAmount('');
      setAccountRefNote('');
      setShowDisburseForm(false);
      if (onDisbursed) onDisbursed();
    } catch (err: any) {
      showAlert('ডিসবার্সমেন্ট ব্যর্থ', err?.message || 'পেমেন্ট ডিসবার্স করতে সমস্যা হয়েছে।', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formattedWhatsApp = shop.whatsapp ? shop.whatsapp.replace(/[^0-9]/g, '') : '';
  const whatsappUrl = formattedWhatsApp
    ? `https://wa.me/${formattedWhatsApp.startsWith('88') ? formattedWhatsApp : '88' + formattedWhatsApp}`
    : null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-emerald-950 text-white p-5 sm:p-6 relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-rose-500/80 hover:bg-rose-600 text-white transition-all shadow-sm"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4 pr-8">
            <div className="flex items-center space-x-3.5">
              <div className="w-13 h-13 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
                <Store className="w-7 h-7 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/30 border border-emerald-300/30 text-emerald-300 text-[10px] font-extrabold uppercase tracking-wider">
                    {shop.type || 'Shop'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/30 border border-purple-300/30 text-purple-300 text-[10px] font-extrabold uppercase">
                    Commission: {commissionRate}%
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white mt-1 leading-tight">{shop.name}</h3>
                <p className="text-xs text-emerald-200/80 font-medium flex items-center gap-2 mt-0.5">
                  <span>Contact: <strong>{shop.contactPerson || 'Store Owner'}</strong> ({shop.whatsapp || 'No Phone'})</span>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold inline-flex items-center gap-1"
                    >
                      <MessageSquare className="w-3 h-3" /> WhatsApp
                    </a>
                  )}
                </p>
              </div>
            </div>

            {/* Current Due / Available Balance Box */}
            <div className="bg-emerald-500/15 border border-emerald-400/30 backdrop-blur-md px-4 py-2.5 rounded-2xl text-right ml-auto">
              <span className="text-[10px] text-emerald-200 uppercase font-black tracking-wider block">
                Current Unpaid Balance
              </span>
              <span className="text-2xl font-black text-emerald-300 block">
                ৳{currentAvailableBalance.toLocaleString('en-US')}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPayoutAmount(String(currentAvailableBalance));
                  setShowDisburseForm(true);
                  setActiveTab('OVERVIEW');
                }}
                className="mt-1 px-3 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow-sm inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Disburse Payment</span>
              </button>
            </div>
          </div>

          {/* Date Range Selector Bar */}
          <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider mr-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" /> Filter Period:
              </span>
              {(['TODAY', 'YESTERDAY', 'LAST_7', 'THIS_MONTH', 'ALL_TIME'] as DatePreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePresetSelect(p)}
                  className={`px-2.5 py-1 rounded-xl font-bold text-[11px] transition-all ${activePreset === p
                    ? 'bg-emerald-400 text-slate-950 font-extrabold shadow-sm'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                >
                  {p === 'TODAY'
                    ? 'Today'
                    : p === 'YESTERDAY'
                      ? 'Yesterday'
                      : p === 'LAST_7'
                        ? 'Last 7 Days'
                        : p === 'THIS_MONTH'
                          ? 'This Month'
                          : 'All Time'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded-xl border border-white/10">
              <div className="flex items-center space-x-1">
                <span className="text-white/60 text-[10px] uppercase font-bold">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setActivePreset('CUSTOM');
                  }}
                  className="bg-transparent text-white font-bold focus:outline-none text-[11px]"
                />
              </div>
              <span className="text-white/40 font-bold">—</span>
              <div className="flex items-center space-x-1">
                <span className="text-white/60 text-[10px] uppercase font-bold">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setActivePreset('CUSTOM');
                  }}
                  className="bg-transparent text-white font-bold focus:outline-none text-[11px]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50/80 px-5 pt-2 gap-2 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('OVERVIEW')}
            className={`py-2.5 px-4 rounded-t-2xl font-extrabold text-xs transition-all flex items-center space-x-2 border-b-2 whitespace-nowrap ${activeTab === 'OVERVIEW'
              ? 'bg-white text-emerald-900 border-emerald-600 shadow-xs'
              : 'text-gray-500 hover:text-gray-900 border-transparent'
              }`}
          >
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Financials & Disburse</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('HELPERS')}
            className={`py-2.5 px-4 rounded-t-2xl font-extrabold text-xs transition-all flex items-center space-x-2 border-b-2 whitespace-nowrap ${activeTab === 'HELPERS'
              ? 'bg-white text-purple-900 border-purple-600 shadow-xs'
              : 'text-gray-500 hover:text-gray-900 border-transparent'
              }`}
          >
            <UserIcon className="w-4 h-4 text-purple-600" />
            <span>Helper Breakdown ({helperBreakdown.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ORDERS')}
            className={`py-2.5 px-4 rounded-t-2xl font-extrabold text-xs transition-all flex items-center space-x-2 border-b-2 whitespace-nowrap ${activeTab === 'ORDERS'
              ? 'bg-white text-blue-900 border-blue-600 shadow-xs'
              : 'text-gray-500 hover:text-gray-900 border-transparent'
              }`}
          >
            <ShoppingBag className="w-4 h-4 text-blue-600" />
            <span>Order Records ({filteredOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            className={`py-2.5 px-4 rounded-t-2xl font-extrabold text-xs transition-all flex items-center space-x-2 border-b-2 whitespace-nowrap ${activeTab === 'HISTORY'
              ? 'bg-white text-indigo-900 border-indigo-600 shadow-xs'
              : 'text-gray-500 hover:text-gray-900 border-transparent'
              }`}
          >
            <Receipt className="w-4 h-4 text-indigo-600" />
            <span>Disbursement History ({storeWithdrawals.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ANALYTICS')}
            className={`py-2.5 px-4 rounded-t-2xl font-extrabold text-xs transition-all flex items-center space-x-2 border-b-2 whitespace-nowrap ${activeTab === 'ANALYTICS'
              ? 'bg-white text-blue-900 border-blue-600 shadow-xs'
              : 'text-gray-500 hover:text-gray-900 border-transparent'
              }`}
          >
            <BarChart2 className="w-4 h-4 text-blue-600" />
            <span>Revenue Analytics</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/40">

          {/* ──────────────── TAB 1: OVERVIEW & DISBURSE ──────────────── */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-5">
              {/* Financial KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Gross Sales */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs space-y-1">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
                    Gross Delivered Sales
                  </span>
                  <span className="text-xl font-black text-gray-900 block">
                    ৳{rangeMetrics.gross.toLocaleString('en-US')}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold block">
                    {rangeMetrics.deliveredCount} delivered orders
                  </span>
                </div>

                {/* Platform Commission */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs space-y-1">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
                    Platform Fee ({commissionRate}%)
                  </span>
                  <span className="text-xl font-black text-purple-700 block">
                    ৳{rangeMetrics.comm.toLocaleString('en-US')}
                  </span>
                  <span className="text-[10px] text-purple-500 font-bold block">
                    Commission Deducted
                  </span>
                </div>

                {/* Net Sales in Period */}
                <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs space-y-1 bg-gradient-to-br from-emerald-50/50 to-white">
                  <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">
                    Net Sales Payable
                  </span>
                  <span className="text-xl font-black text-emerald-700 block">
                    ৳{rangeMetrics.net.toLocaleString('en-US')}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold block">
                    Gross - Platform Fee
                  </span>
                </div>

                {/* Total Disbursed (All Time) */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs space-y-1">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
                    Total Disbursed
                  </span>
                  <span className="text-xl font-black text-slate-800 block">
                    ৳{totalAllTimeDisbursed.toLocaleString('en-US')}
                  </span>
                  <span className="text-[10px] text-gray-500 font-bold block">
                    {storeWithdrawals.filter((w) => w.status === 'APPROVED').length} payouts made
                  </span>
                </div>
              </div>


              {/* Disbursement Action Box */}
              <div className="bg-white rounded-3xl border border-emerald-100 p-5 shadow-soft space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
                  <div>
                    <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                      <Send className="w-4 h-4 text-emerald-600" />
                      Disburse Store Payout to Bank / MFS
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Record payments transferred to this store at night or after order settlements.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500">Unpaid Balance:</span>
                    <span className="text-base font-black text-emerald-700">৳{currentAvailableBalance.toLocaleString('en-US')}</span>
                  </div>
                </div>

                {/* Disbursement Form */}
                <form onSubmit={handleDisbursePayment} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Amount */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black text-gray-700 uppercase">Payout Amount (৳)*</label>
                        {currentAvailableBalance > 0 && (
                          <button
                            type="button"
                            onClick={() => setPayoutAmount(Math.round(currentAvailableBalance).toString(10))}
                            className="text-[10px] font-black text-emerald-700 hover:underline cursor-pointer"
                          >
                            Fill Max (৳{currentAvailableBalance.toLocaleString('en-US')})
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400 font-bold text-sm">৳</span>
                        <input
                          type="number"
                          step="any"
                          required
                          lang="en"
                          inputMode="numeric"
                          placeholder="e.g. 5000"
                          value={payoutAmount}
                          onChange={(e) => {
                            // Ensure only ASCII/English digits get stored
                            const raw = e.target.value.replace(/[^\d.]/g, '');
                            setPayoutAmount(raw);
                          }}
                          className="w-full pl-7 pr-3 py-2 rounded-xl border border-gray-200 font-black text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Payment Method */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-gray-700 uppercase">Payment Channel*</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full py-2 px-3 rounded-xl border border-gray-200 font-bold text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="Bank Transfer">Bank Transfer (BEFTN / NPSB)</option>
                        <option value="bKash (Merchant)">bKash (Merchant)</option>
                        <option value="bKash (Personal)">bKash (Personal)</option>
                        <option value="Nagad">Nagad</option>
                        <option value="Rocket">Rocket</option>
                        <option value="Upay">Upay</option>
                        <option value="Cash">Cash Handover</option>
                        <option value="Cheque">Bank Cheque</option>
                      </select>
                    </div>

                    {/* Reference / TxID / Account Note */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-gray-700 uppercase">Bank Ref / TxID / Note</label>
                      <input
                        type="text"
                        placeholder="TxID, A/C No, Bank Name, Slip No..."
                        value={accountRefNote}
                        onChange={(e) => setAccountRefNote(e.target.value)}
                        className="w-full py-2 px-3 rounded-xl border border-gray-200 font-medium text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[11px] text-gray-500">
                      ⚡ <em>Submitting will automatically deduct the store balance and add a transfer ledger entry.</em>
                    </p>
                    <button
                      type="submit"
                      disabled={isSubmitting || !payoutAmount || parseFloat(payoutAmount) <= 0}
                      className="py-2.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs shadow-md transition-all flex items-center space-x-2 cursor-pointer active:scale-95"
                    >
                      <Send className="w-4 h-4" />
                      <span>{isSubmitting ? 'Recording...' : 'Confirm & Disburse Payment'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Quick Summary of Helper Orders Today / Selected Period */}
              <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                    <UserIcon className="w-4 h-4 text-purple-600" />
                    Top Helpers Collecting From This Store ({activePreset === 'TODAY' ? 'Today' : 'Selected Period'})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setActiveTab('HELPERS')}
                    className="text-xs font-bold text-purple-700 hover:underline flex items-center gap-1"
                  >
                    <span>View All ({helperBreakdown.length})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {helperBreakdown.length === 0 ? (
                  <div className="py-6 text-center text-gray-400 text-xs">
                    No helpers collected orders from this store in the selected date range.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {helperBreakdown.slice(0, 6).map((h) => (
                      <div
                        key={h.helperId}
                        className="p-3 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between hover:border-purple-200 transition-all"
                      >
                        <div className="space-y-0.5">
                          <span className="text-xs font-black text-gray-900 block">{h.helperName}</span>
                          <span className="text-[10px] text-gray-500 block font-mono">{h.helperPhone || h.helperId}</span>
                          <span className="text-[10px] font-bold text-purple-700 block">
                            {h.totalOrders} orders ({h.deliveredOrders} delivered)
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-emerald-700 block">
                            ৳{h.totalProductValue.toLocaleString('en-US')}
                          </span>
                          <span className="text-[9px] text-gray-400 font-bold block">Product Value</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ──────────────── TAB 2: HELPERS BREAKDOWN ──────────────── */}
          {activeTab === 'HELPERS' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-black text-sm text-gray-900">Helper Ordering & Collection Breakdown</h4>
                  <p className="text-xs text-gray-500">
                    Track which helper collected how much product value from "{shop.name}".
                  </p>
                </div>

                {/* Helper Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search helper name or phone..."
                    value={helperSearch}
                    onChange={(e) => setHelperSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                  />
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-600 min-w-[650px]">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-black text-[10px] tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="py-3 px-4">Helper Name</th>
                        <th className="py-3 px-4">Contact Phone</th>
                        <th className="py-3 px-4 text-center">Orders Handled</th>
                        <th className="py-3 px-4 text-right">Total Product Value (৳)</th>
                        <th className="py-3 px-4 text-right">Store Net Share (৳)</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {helperBreakdown.map((h) => {
                        const formattedHp = h.helperPhone ? h.helperPhone.replace(/[^0-9]/g, '') : '';
                        const hpWaUrl = formattedHp
                          ? `https://wa.me/${formattedHp.startsWith('88') ? formattedHp : '88' + formattedHp}`
                          : null;

                        return (
                          <tr key={h.helperId} className="hover:bg-purple-50/40 transition-colors">
                            <td className="py-3.5 px-4">
                              <span className="font-black text-gray-900 block text-xs">{h.helperName}</span>
                              <span className="text-[10px] text-gray-400 font-mono block">ID: {h.helperId}</span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-extrabold text-gray-800 block text-xs">{h.helperPhone || '—'}</span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[10px] font-black border border-emerald-200">
                                  ✓ {h.deliveredOrders} Deliv
                                </span>
                                {h.activeOrders > 0 && (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[10px] font-black border border-amber-200">
                                    ⚡ {h.activeOrders} Active
                                  </span>
                                )}
                                {h.canceledOrders > 0 && (
                                  <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 text-[10px] font-black border border-rose-200">
                                    ✕ {h.canceledOrders} Canc
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right font-black text-purple-900 text-sm">
                              ৳{h.totalProductValue.toLocaleString('en-US')}
                            </td>
                            <td className="py-3.5 px-4 text-right font-black text-emerald-700 text-sm">
                              ৳{h.netProductValue.toLocaleString('en-US')}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {hpWaUrl && (
                                  <a
                                    href={hpWaUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold"
                                    title="WhatsApp Helper"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                {h.helperPhone && (
                                  <a
                                    href={`tel:${h.helperPhone}`}
                                    className="p-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold"
                                    title="Call Helper"
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {helperBreakdown.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-gray-400 font-semibold">
                            No helper records found for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────── TAB 3: ORDER RECORDS ──────────────── */}
          {activeTab === 'ORDERS' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-black text-sm text-gray-900">Store Order Ledger & Breakdown</h4>
                  <p className="text-xs text-gray-500">
                    Showing individual orders containing products from this store.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Status filter */}
                  <select
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value)}
                    className="py-1.5 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white"
                  >
                    <option value="ALL">All Status ({filteredOrders.length})</option>
                    <option value="DELIVERED">Delivered ({filteredOrders.filter((o) => o.status === 'DELIVERED').length})</option>
                    <option value="IN_PROGRESS">In Progress ({filteredOrders.filter((o) => o.status === 'IN_PROGRESS' || o.status === 'HANDOVER').length})</option>
                    <option value="CANCELED">Canceled ({filteredOrders.filter((o) => o.status === 'CANCELED').length})</option>
                  </select>

                  {/* Search bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search order #, helper, item..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-600 min-w-[780px]">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-black text-[10px] tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="py-3 px-4">Order & Time</th>
                        <th className="py-3 px-4">Helper Info</th>
                        <th className="py-3 px-4">Customer</th>
                        <th className="py-3 px-4">Items / Products</th>
                        <th className="py-3 px-4 text-right">Product Cost (৳)</th>
                        <th className="py-3 px-4 text-right">Net Payable (৳)</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {searchedOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-black text-gray-900 block text-xs">#{ord.orderNumber}</span>
                            <span className="text-[10px] text-gray-400 block mt-0.5">{formatDateTime(ord.createdAt)}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-extrabold text-gray-900 block text-xs">{ord.helperName}</span>
                            {ord.helperPhone && (
                              <span className="text-[10px] text-purple-700 font-semibold block">{ord.helperPhone}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-gray-800 block text-xs">{ord.customerName}</span>
                            {ord.customerPhone && (
                              <span className="text-[10px] text-gray-500 block">{ord.customerPhone}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 max-w-xs">
                            {ord.itemsWithPrice && ord.itemsWithPrice.length > 0 ? (
                              <div className="space-y-0.5 text-[11px]">
                                {ord.itemsWithPrice.map((item: any, idx: number) => (
                                  <div key={idx} className="flex items-center justify-between gap-2 text-gray-800">
                                    <span className="truncate">{item.name} {item.unit ? `(${item.unit})` : ''}</span>
                                    {item.price ? <strong className="text-gray-900">৳{item.price}</strong> : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-700 truncate" title={ord.itemsText}>
                                {ord.itemsText || '—'}
                              </p>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-gray-900 text-sm">
                            ৳{ord.grossSales.toLocaleString('en-US')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-emerald-700 text-sm">
                            ৳{ord.netSales.toLocaleString('en-US')}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider inline-block ${ord.status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : ord.status === 'CANCELED'
                                  ? 'bg-red-100 text-red-800 border border-red-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}
                            >
                              {ord.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {searchedOrders.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-gray-400 font-semibold">
                            No orders found for this search/filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────── TAB 4: DISBURSEMENT HISTORY ──────────────── */}
          {activeTab === 'HISTORY' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-black text-sm text-gray-900">Disbursement & Payout Transfer History</h4>
                  <p className="text-xs text-gray-500">
                    All recorded payments transferred by Admin to "{shop.name}".
                  </p>
                </div>
                <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
                  Total Disbursed: ৳{totalAllTimeDisbursed.toLocaleString('en-US')}
                </span>
              </div>

              <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-600 min-w-[650px]">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-black text-[10px] tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="py-3 px-4">Disbursement ID & Date</th>
                        <th className="py-3 px-4">Channel / Method</th>
                        <th className="py-3 px-4">Account / Ref Note</th>
                        <th className="py-3 px-4 text-right">Amount (৳)</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {storeWithdrawals.map((w) => (
                        <tr key={w.id} className="hover:bg-gray-50/80 transition-colors">
                          <td className="py-3.5 px-4">
                            <span className="font-mono text-xs font-black text-gray-900 block">{w.id}</span>
                            <span className="text-[10px] text-gray-400 block mt-0.5">
                              {formatDateTime(w.processedAt || w.createdAt)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-gray-800">
                            <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-800 text-[11px] font-bold">
                              {w.paymentMethod || 'Bank Transfer'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-gray-700 whitespace-pre-wrap max-w-xs">
                            {w.accountNumber || '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-emerald-700 text-base">
                            ৳{w.amount.toLocaleString('en-US')}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${w.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : w.status === 'REJECTED'
                                  ? 'bg-red-100 text-red-800 border border-red-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}
                            >
                              {w.status === 'APPROVED' ? 'Transferred' : w.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {storeWithdrawals.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-gray-400 font-semibold">
                            No disbursements recorded yet for this store.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────── TAB 5: REVENUE ANALYTICS ──────────────── */}
          {activeTab === 'ANALYTICS' && (() => {
            const totalOrders = rangeMetrics.totalCount;
            const deliveredOrders = rangeMetrics.deliveredCount;
            const canceledOrders = rangeMetrics.canceledCount;
            const activeOrders = rangeMetrics.activeCount;
            const avgOrderSize = totalOrders > 0 ? Math.round(rangeMetrics.gross / totalOrders) : 0;
            const avgDeliveredOrderSize = deliveredOrders > 0 ? Math.round(rangeMetrics.gross / deliveredOrders) : 0;
            const deliveryRate = totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0;
            const cancelRate = totalOrders > 0 ? Math.round((canceledOrders / totalOrders) * 100) : 0;
            const platformEarned = rangeMetrics.comm;
            const storeEarned = rangeMetrics.net;

            return (
              <div className="space-y-5">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-blue-600" />
                  <div>
                    <h3 className="text-sm font-black text-gray-900">Revenue Analytics</h3>
                    <p className="text-[11px] text-gray-500">
                      How much customers spend on average · {activePreset === 'TODAY' ? 'Today' : activePreset === 'LAST_7' ? 'Last 7 Days' : activePreset === 'THIS_MONTH' ? 'This Month' : activePreset === 'ALL_TIME' ? 'All Time' : 'Selected Period'}
                    </p>
                  </div>
                </div>

                {/* Primary Avg Order Size - Hero Card */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-widest text-blue-200 block">
                        Average Order Size
                      </span>
                      <span className="text-4xl font-black mt-1 block">
                        ৳{avgOrderSize.toLocaleString('en-US')}
                      </span>
                      <span className="text-sm text-blue-200 font-semibold mt-1 block">
                        per order across all {totalOrders} orders in period
                      </span>
                    </div>
                    <div className="bg-white/15 rounded-2xl p-3">
                      <BarChart2 className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-blue-200 font-bold uppercase block">Avg. Delivered Only</span>
                      <span className="text-lg font-black text-white">৳{avgDeliveredOrderSize.toLocaleString('en-US')}</span>
                      <span className="text-[10px] text-blue-300 font-medium block">({deliveredOrders} delivered orders)</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-blue-200 font-bold uppercase block">Total Revenue (Gross)</span>
                      <span className="text-lg font-black text-white">৳{rangeMetrics.gross.toLocaleString('en-US')}</span>
                      <span className="text-[10px] text-blue-300 font-medium block">from {deliveredOrders} completed orders</span>
                    </div>
                  </div>
                </div>

                {/* Order Outcome Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-2xl border border-emerald-100 p-4 space-y-1">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Delivery Rate</span>
                    <span className="text-2xl font-black text-emerald-600 block">{deliveryRate}%</span>
                    <span className="text-[10px] text-gray-500 font-bold block">{deliveredOrders} / {totalOrders} orders</span>
                  </div>
                  <div className="bg-white rounded-2xl border border-rose-100 p-4 space-y-1">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Cancel Rate</span>
                    <span className="text-2xl font-black text-rose-500 block">{cancelRate}%</span>
                    <span className="text-[10px] text-gray-500 font-bold block">{canceledOrders} canceled</span>
                  </div>
                  <div className="bg-white rounded-2xl border border-amber-100 p-4 space-y-1">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Active / Pending</span>
                    <span className="text-2xl font-black text-amber-600 block">{activeOrders}</span>
                    <span className="text-[10px] text-gray-500 font-bold block">in progress now</span>
                  </div>
                </div>

                {/* Earnings Split */}
                <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-soft space-y-4">
                  <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-purple-600" />
                    Revenue Split (Delivered Orders)
                  </h4>
                  {rangeMetrics.gross > 0 ? (
                    <>
                      {/* Visual Bar */}
                      <div className="h-5 rounded-full overflow-hidden flex bg-gray-100">
                        <div
                          className="bg-emerald-500 h-full transition-all"
                          style={{ width: `${Math.round((storeEarned / rangeMetrics.gross) * 100)}%` }}
                        />
                        <div
                          className="bg-purple-500 h-full transition-all"
                          style={{ width: `${Math.round((platformEarned / rangeMetrics.gross) * 100)}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                          <div>
                            <span className="text-[10px] font-bold text-gray-500 block">Store Earns (Net)</span>
                            <span className="text-sm font-black text-emerald-700">৳{storeEarned.toLocaleString('en-US')}</span>
                            <span className="text-[10px] text-gray-400 font-medium ml-1">
                              ({rangeMetrics.gross > 0 ? Math.round((storeEarned / rangeMetrics.gross) * 100) : 0}%)
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-purple-500 shrink-0" />
                          <div>
                            <span className="text-[10px] font-bold text-gray-500 block">Platform Fee ({commissionRate}%)</span>
                            <span className="text-sm font-black text-purple-700">৳{platformEarned.toLocaleString('en-US')}</span>
                            <span className="text-[10px] text-gray-400 font-medium ml-1">
                              ({rangeMetrics.gross > 0 ? Math.round((platformEarned / rangeMetrics.gross) * 100) : 0}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No delivered orders in selected period.</p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>


        {/* Modal Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
          <div className="text-xs text-gray-500 font-medium">
            Store ID: <span className="font-mono text-gray-700 font-bold">{shop.id}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-2xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-xs transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
