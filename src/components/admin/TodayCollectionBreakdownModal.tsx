'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { fallbackStore } from '@/lib/firebase';
import { Shop, Order, ShopOrder, PricingSettings, HelperApplication, Wallet } from '@/types';
import { calculateHelperCommission } from '@/lib/pricing';
import { useAdminLifetimeData } from '@/hooks/useAdminLifetimeData';
import { HelperHistoryModal } from './HelperHistoryModal';
import {
  X,
  Store,
  Bike,
  Phone,
  Search,
  ChevronDown,
  ChevronUp,
  Receipt,
  CheckCircle2,
  Copy,
  Check,
  CreditCard,
  Coins,
  Calendar,
  ArrowRight,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';

export interface TodayStoreOwedItem {
  storeId: string;
  storeName: string;
  ownerName?: string;
  phone?: string;
  canReceiveOrders: boolean;
  orderCount: number;
  totalCost: number;
  unpaidAmount: number;    // Remaining due to pay for this date range
  disbursedAmount: number; // Already paid/disbursed for this date range
  commissionEarned: number;
  overallUnpaidBalance: number; // All-time unpaid balance from shop page
  shop?: Shop;
  orders: {
    id: string;
    title?: string;
    cost: number;
    time: string;
    isPaid: boolean;
  }[];
}

export interface TodayHelperPaybackItem {
  helperId: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  photoURL?: string;
  deliveredOrdersCount: number;
  totalCollectedCash: number;
  helperEarnings: number;
  grossPaybackAmount: number;
  paidBackAmount: number;
  remainingPaybackAmount: number;
  walletBalance: number;
  orders: {
    id: string;
    title?: string;
    cost: number;
    deliveryFee: number;
    helperPayout: number;
    platformShare: number;
    storeAmount: number;
    storeCommission: number;
    totalCollected: number;
    paybackAmount: number;
    time: string;
    customerName?: string;
    customerPhone?: string;
    isPaid: boolean;
  }[];
}

export type TabType = 'HELPER_PAYBACK' | 'OWED_STORES';
export type DatePreset = 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'THIS_MONTH' | 'CUSTOM';
export type StatusFilter = 'ALL' | 'DUE' | 'PAID';

interface TodayCollectionBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabType;
  pricing?: PricingSettings;
  onDisburseStore?: (shop: Shop) => void;
}

// Local Date Formatter YYYY-MM-DD
const getLocalYYYYMMDD = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getOrderCompletedTime = (o: Order): number => {
  if ((o as any).completedAt) return new Date((o as any).completedAt).getTime();
  if (o.statusHistory) {
    const deliveredEntry = o.statusHistory.find(
      (h) => h.status === 'DELIVERED' || (h.status as string) === 'COMPLETED'
    );
    if (deliveredEntry) return new Date(deliveredEntry.timestamp).getTime();
  }
  return new Date(o.updatedAt || o.createdAt).getTime();
};

export const TodayCollectionBreakdownModal: React.FC<TodayCollectionBreakdownModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'HELPER_PAYBACK',
  pricing: propPricing,
  onDisburseStore,
}) => {
  // Ensure full lifetime database is fully synced for 100% financial accuracy
  const lifetimeData = useAdminLifetimeData(isOpen);

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Date Filter State
  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [startDate, setStartDate] = useState<string>(() => getLocalYYYYMMDD());
  const [endDate, setEndDate] = useState<string>(() => getLocalYYYYMMDD());

  // Status Filter ('ALL' | 'DUE' | 'PAID')
  const [helperFilter, setHelperFilter] = useState<StatusFilter>('ALL');
  const [storeFilter, setStoreFilter] = useState<StatusFilter>('ALL');

  // Search & Accordion State
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [selectedHelperForDetails, setSelectedHelperForDetails] = useState<{ helperId: string; name: string } | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Live Sync Tick
  const [syncTick, setSyncTick] = useState(0);

  // Payback Recorder State
  const [recordingHelper, setRecordingHelper] = useState<TodayHelperPaybackItem | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<string>('Cash');
  const [payNote, setPayNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Subscribe to fallbackStore changes so data live-updates on paybacks or disbursements
  useEffect(() => {
    const unsub = fallbackStore.subscribe(() => {
      setSyncTick((v) => v + 1);
    });
    return () => {
      unsub();
    };
  }, []);

  // Preset Handler
  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
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
      const past = new Date();
      past.setDate(past.getDate() - 6);
      setStartDate(getLocalYYYYMMDD(past));
      setEndDate(getLocalYYYYMMDD(today));
    } else if (preset === 'THIS_MONTH') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(getLocalYYYYMMDD(first));
      setEndDate(getLocalYYYYMMDD(today));
    }
  };

  // Pricing configuration
  const activePricing: PricingSettings = useMemo(() => {
    return propPricing || fallbackStore.pricingSettings || {
      helperCommissionPercent: 70,
      feeCalculatorMinFee: 20,
    };
  }, [propPricing, syncTick]);

  // Main filtered calculation with exact shop-page financial logic
  const calculations = useMemo(() => {
    if (!isOpen) {
      return {
        totalCollected: 0,
        totalHelperPaybackRemaining: 0,
        totalHelperPaybackPaid: 0,
        totalStoreOwedRemaining: 0,
        totalStoreOwedPaid: 0,
        deliveredCount: 0,
        helpersList: [] as TodayHelperPaybackItem[],
        storesList: [] as TodayStoreOwedItem[],
      };
    }

    const startMs = new Date(`${startDate}T00:00:00`).getTime();
    const endMs = new Date(`${endDate}T23:59:59.999`).getTime();
    const minFee = activePricing.feeCalculatorMinFee ?? 20;

    // Filter delivered orders in date range
    const allOrders = Array.from(fallbackStore.orders.values());
    const deliveredOrders = allOrders.filter((o) => {
      if (o.status !== 'DELIVERED') return false;
      const t = getOrderCompletedTime(o);
      return t >= startMs && t <= endMs;
    });

    const allWithdrawals = Array.from(fallbackStore.withdrawals.values());
    const allShops = Array.from(fallbackStore.shops.values());
    const shopMap = new Map<string, Shop>();
    allShops.forEach((s) => shopMap.set(s.id, s));

    const storeAppsList = Array.from(fallbackStore.storeApplications.values());
    const getShopComm = (s?: Shop): number => {
      if (!s) return 0;
      let rate = Number(s.commissionPercent);
      if (isNaN(rate) || s.commissionPercent === undefined || s.commissionPercent === null) {
        const app = storeAppsList.find((a) => a.userId === s.ownerUserId || a.id === s.applicationId);
        rate = Number(app?.commissionPercent) || 0;
      }
      return rate;
    };

    // Attach shop orders
    const shopOrdersByParentMap = new Map<string, ShopOrder[]>();
    fallbackStore.shopOrders.forEach((so) => {
      if (!so.parentOrderId) return;
      const arr = shopOrdersByParentMap.get(so.parentOrderId) || [];
      arr.push(so);
      shopOrdersByParentMap.set(so.parentOrderId, arr);
    });

    // Helper metadata & wallets
    const appByUserId = new Map<string, HelperApplication>();
    fallbackStore.helperApplications.forEach((a) => {
      if (!appByUserId.has(a.userId)) appByUserId.set(a.userId, a);
    });

    const allUsersWithActivity = new Set([
      ...allOrders.map((o) => o.helperId).filter(Boolean),
      ...allWithdrawals.map((w) => w.helperId).filter(Boolean),
      ...Array.from(fallbackStore.wallets.keys()),
    ]) as Set<string>;
    const allWallets = fallbackStore.getHelperWallets(allUsersWithActivity);

    // Accumulators
    let totalCollected = 0;
    let totalStoreOwedRemaining = 0;
    let totalStoreOwedPaid = 0;
    const storeMap = new Map<string, TodayStoreOwedItem>();
    const helperMap = new Map<string, TodayHelperPaybackItem>();

    deliveredOrders.forEach((o) => {
      const fee = Math.max(o.deliveryFee || 0, minFee);
      const helperPayout = calculateHelperCommission(fee, activePricing);
      const platformShare = fee - helperPayout;

      const timeStr = new Date(getOrderCompletedTime(o)).toLocaleTimeString('bn-BD', {
        hour: '2-digit',
        minute: '2-digit',
      });

      let orderProductCost = 0;
      let orderStoreReturnable = 0;
      let orderStoreCommission = 0;

      const attachedShopOrders = (shopOrdersByParentMap.get(o.id) || []).filter(
        (so) => so.status !== 'CANCELED' && (so.status as string) !== 'CANCELLED'
      );

      if (attachedShopOrders.length > 0) {
        attachedShopOrders.forEach((so) => {
          const price = so.price || 0;
          if (price <= 0) return;
          orderProductCost += price;

          const isMyself = so.shopId === 'myself';
          const shop = !isMyself
            ? (shopMap.get(so.shopId) || allShops.find((s) => s.id === so.shopId || s.ownerUserId === so.shopId))
            : null;
          const canReceive = !isMyself && !!shop && shop.canReceiveOrders !== false;
          const commPct = getShopComm(shop || undefined);
          const comm = !canReceive && commPct > 0 ? Math.round(price * (commPct / 100)) : 0;
          const owed = canReceive ? price : 0;

          // Is this store order already disbursed (paid) as monitored on Shop page?
          const isDisbursed = Boolean(so.isPaid || o.isStorePaid || o.isPaid);

          if (canReceive) {
            orderStoreReturnable += price;
            if (isDisbursed) {
              totalStoreOwedPaid += price;
            } else {
              totalStoreOwedRemaining += price;
            }
          } else {
            orderStoreCommission += comm;
          }

          // Aggregate Store
          const storeKey = shop?.id || so.shopId || 'unknown';
          const existing = storeMap.get(storeKey) || {
            storeId: storeKey,
            storeName: shop?.name || so.shopName || (isMyself ? 'কাস্টমার নিজে / অন্য সোর্স' : 'অজানা দোকান'),
            ownerName: shop?.contactPerson || shop?.managerName,
            phone: shop?.whatsapp || shop?.managerWhatsapp,
            canReceiveOrders: canReceive,
            shop: shop || allShops.find((s) => s.id === storeKey || s.ownerUserId === storeKey),
            orderCount: 0,
            totalCost: 0,
            unpaidAmount: 0,
            disbursedAmount: 0,
            commissionEarned: 0,
            overallUnpaidBalance: 0,
            orders: [],
          };
          existing.orderCount += 1;
          existing.totalCost += price;
          if (canReceive) {
            if (isDisbursed) {
              existing.disbursedAmount += price;
            } else {
              existing.unpaidAmount += price;
            }
          }
          existing.commissionEarned += comm;
          existing.orders.push({
            id: o.id.slice(-6).toUpperCase(),
            title: o.title || so.shopName,
            cost: price,
            time: timeStr,
            isPaid: isDisbursed,
          });
          storeMap.set(storeKey, existing);
        });
      } else if (o.selectedShopIds && o.selectedShopIds.length > 0) {
        const pCost = o.productCost || 0;
        if (pCost > 0) {
          orderProductCost += pCost;
          const costPerShop = pCost / o.selectedShopIds.length;
          o.selectedShopIds.forEach((shopId) => {
            const shop = shopMap.get(shopId) || allShops.find((s) => s.id === shopId);
            const canReceive = !!shop && shop.canReceiveOrders !== false;
            const commPct = getShopComm(shop);
            const comm = !canReceive && commPct > 0 ? Math.round(costPerShop * (commPct / 100)) : 0;
            const owed = canReceive ? costPerShop : 0;
            const isDisbursed = Boolean(o.isStorePaid || o.isPaid);

            if (canReceive) {
              orderStoreReturnable += costPerShop;
              if (isDisbursed) {
                totalStoreOwedPaid += costPerShop;
              } else {
                totalStoreOwedRemaining += costPerShop;
              }
            } else {
              orderStoreCommission += comm;
            }

            const storeKey = shop?.id || shopId;
            const existing = storeMap.get(storeKey) || {
              storeId: storeKey,
              storeName: shop?.name || 'অজানা দোকান',
              ownerName: shop?.contactPerson || shop?.managerName,
              phone: shop?.whatsapp || shop?.managerWhatsapp,
              canReceiveOrders: canReceive,
              shop: shop || allShops.find((s) => s.id === storeKey || s.ownerUserId === storeKey),
              orderCount: 0,
              totalCost: 0,
              unpaidAmount: 0,
              disbursedAmount: 0,
              commissionEarned: 0,
              overallUnpaidBalance: 0,
              orders: [],
            };
            existing.orderCount += 1;
            existing.totalCost += costPerShop;
            if (canReceive) {
              if (isDisbursed) {
                existing.disbursedAmount += costPerShop;
              } else {
                existing.unpaidAmount += costPerShop;
              }
            }
            existing.commissionEarned += comm;
            existing.orders.push({
              id: o.id.slice(-6).toUpperCase(),
              title: o.title,
              cost: costPerShop,
              time: timeStr,
              isPaid: isDisbursed,
            });
            storeMap.set(storeKey, existing);
          });
        }
      } else {
        orderProductCost += (o.productCost || 0);
      }

      // Customer cash collected & Payback
      totalCollected += (fee + orderStoreReturnable + orderStoreCommission);

      // Aggregate Helper
      const helperId = o.helperId;
      if (helperId) {
        const orderTotalCollected = fee + orderProductCost;
        const orderPayback = platformShare + orderStoreReturnable + orderStoreCommission;
        const isOrderPaid = Boolean(o.isHelperPaid || o.isPaid);

        let helperItem = helperMap.get(helperId);
        if (!helperItem) {
          const user = fallbackStore.users.get(helperId);
          const app = appByUserId.get(helperId);
          const name = user?.displayName || app?.legalName || app?.userName || `Helper (${helperId.slice(0, 6)})`;
          const phone = user?.alternativePhone || app?.whatsapp || (user as any)?.phone || user?.email || '';
          const photoURL = user?.photoURL || (app as any)?.photoURL;
          const wallet = allWallets.get(helperId);

          helperItem = {
            helperId,
            name,
            phone,
            whatsapp: app?.whatsapp || user?.alternativePhone,
            photoURL,
            deliveredOrdersCount: 0,
            totalCollectedCash: 0,
            helperEarnings: 0,
            grossPaybackAmount: 0,
            paidBackAmount: 0,
            remainingPaybackAmount: 0,
            walletBalance: wallet?.balance || 0,
            orders: [],
          };
          helperMap.set(helperId, helperItem);
        }

        helperItem.deliveredOrdersCount += 1;
        helperItem.totalCollectedCash += orderTotalCollected;
        helperItem.helperEarnings += helperPayout;
        helperItem.grossPaybackAmount += orderPayback;

        if (isOrderPaid) {
          helperItem.paidBackAmount += orderPayback;
        } else {
          helperItem.remainingPaybackAmount += orderPayback;
        }

        helperItem.orders.push({
          id: o.id.slice(-6).toUpperCase(),
          title: o.title || 'ডেলিভারি অর্ডার',
          cost: orderProductCost,
          deliveryFee: fee,
          helperPayout,
          platformShare,
          storeAmount: orderStoreReturnable,
          storeCommission: orderStoreCommission,
          totalCollected: orderTotalCollected,
          paybackAmount: orderPayback,
          time: timeStr,
          customerName: o.customerName || (o as any).userName,
          customerPhone: o.customerPhone || (o as any).phone,
          isPaid: isOrderPaid,
        });
      }
    });

    // Finalize helpers remaining payback & paid amounts
    const helpersList = Array.from(helperMap.values()).map((h) => {
      const currentWallet = fallbackStore.wallets.get(h.helperId);
      const currentBal = currentWallet?.balance ?? h.walletBalance ?? 0;

      let remaining = h.remainingPaybackAmount;
      let paid = h.paidBackAmount;

      // If the helper's current wallet balance is 0 or negative, all dues are settled!
      if (currentBal <= 0) {
        paid = h.grossPaybackAmount;
        remaining = 0;
      } else if (remaining > currentBal) {
        const surplus = remaining - currentBal;
        paid += surplus;
        remaining = currentBal;
      }

      return {
        ...h,
        walletBalance: currentBal,
        paidBackAmount: paid,
        remainingPaybackAmount: remaining,
      };
    }).sort((a, b) => {
      if (b.remainingPaybackAmount !== a.remainingPaybackAmount) {
        return b.remainingPaybackAmount - a.remainingPaybackAmount;
      }
      return b.paidBackAmount - a.paidBackAmount;
    });

    const totalHelperPaybackRemaining = helpersList.reduce((sum, h) => sum + h.remainingPaybackAmount, 0);
    const totalHelperPaybackPaid = helpersList.reduce((sum, h) => sum + h.paidBackAmount, 0);

    // Finalize stores with overallUnpaidBalance from fallbackStore.getStoreFinancials
    const storesList = Array.from(storeMap.values()).map((s) => {
      let finBalance = 0;
      if (s.shop) {
        const fin = fallbackStore.getStoreFinancials(s.shop);
        finBalance = fin.unpaidBalance;
      }
      return {
        ...s,
        overallUnpaidBalance: finBalance,
      };
    }).sort((a, b) => {
      if (b.unpaidAmount !== a.unpaidAmount) return b.unpaidAmount - a.unpaidAmount;
      return b.disbursedAmount - a.disbursedAmount;
    });

    return {
      totalCollected,
      totalHelperPaybackRemaining,
      totalHelperPaybackPaid,
      totalStoreOwedRemaining,
      totalStoreOwedPaid,
      deliveredCount: deliveredOrders.length,
      helpersList,
      storesList,
    };
  }, [isOpen, startDate, endDate, activePricing, syncTick, lifetimeData.ready]);

  if (!isOpen) return null;

  // Search and status filtered helpers
  const filteredHelpers = calculations.helpersList.filter((h) => {
    // Status filter
    if (helperFilter === 'DUE' && h.remainingPaybackAmount <= 0) return false;
    if (helperFilter === 'PAID' && (h.paidBackAmount <= 0 || h.remainingPaybackAmount > 0)) return false;

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      h.name.toLowerCase().includes(q) ||
      (h.phone && h.phone.includes(q)) ||
      h.helperId.toLowerCase().includes(q)
    );
  });

  // Search and status filtered stores
  const filteredStores = calculations.storesList.filter((s) => {
    // Status filter
    if (storeFilter === 'DUE' && s.unpaidAmount <= 0) return false;
    if (storeFilter === 'PAID' && (s.disbursedAmount <= 0 || s.unpaidAmount > 0)) return false;

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      s.storeName.toLowerCase().includes(q) ||
      (s.ownerName && s.ownerName.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q))
    );
  });

  const dueHelpersCount = calculations.helpersList.filter((h) => h.remainingPaybackAmount > 0).length;
  const paidHelpersCount = calculations.helpersList.filter((h) => h.paidBackAmount > 0 && h.remainingPaybackAmount === 0).length;

  const dueStoresCount = calculations.storesList.filter((s) => s.unpaidAmount > 0).length;
  const paidStoresCount = calculations.storesList.filter((s) => s.disbursedAmount > 0 && s.unpaidAmount === 0).length;

  const handleCopyPhone = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const handleDisburseClick = (item: TodayStoreOwedItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!onDisburseStore) return;

    const shop =
      item.shop ||
      fallbackStore.shops.get(item.storeId) ||
      Array.from(fallbackStore.shops.values()).find(
        (s) => s.id === item.storeId || s.ownerUserId === item.storeId
      );

    if (shop) {
      onDisburseStore(shop);
    } else {
      const fallbackShopObj: Shop = {
        id: item.storeId,
        name: item.storeName,
        type: 'General',
        ownerUserId: item.storeId,
        contactPerson: item.ownerName || '',
        whatsapp: item.phone || '',
        location: { address: '', lat: 0, lng: 0 },
        canReceiveOrders: item.canReceiveOrders,
        commissionPercent: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onDisburseStore(fallbackShopObj);
    }
  };

  const openPaybackModal = (helper: TodayHelperPaybackItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecordingHelper(helper);
    const suggested = helper.remainingPaybackAmount > 0
      ? helper.remainingPaybackAmount
      : (helper.walletBalance > 0 ? helper.walletBalance : helper.grossPaybackAmount);
    setPayAmount(String(suggested || ''));
    setPayMethod('Cash');
    setPayNote('');
  };

  const handlePaybackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordingHelper) return;

    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('অনুগ্রহ করে সঠিক পরিমাণ (৳) লিখুন।');
      return;
    }

    setIsSubmitting(true);
    try {
      await fallbackStore.recordHelperPayback(
        recordingHelper.helperId,
        amt,
        payNote.trim() || 'Paid back to platform',
        payMethod
      );
      setSyncTick((v) => v + 1);
      setIsSubmitting(false);
      setRecordingHelper(null);
      setToastMsg(`৳${amt} পেব্যাক সফলভাবে রেকর্ড করা হয়েছে!`);
      setTimeout(() => setToastMsg(null), 2500);
    } catch (err: any) {
      setIsSubmitting(false);
      alert(err?.message || 'পেব্যাক রেকর্ড ব্যর্থ হয়েছে।');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Main Dialog */}
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] z-10 animate-in fade-in zoom-in-95 duration-150 text-white">
        
        {/* Minimal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
              <span>সংগৃহীত টাকা ও বাকি হিসাব বিভাজন</span>
              <span className="text-[11px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                {calculations.deliveredCount} টি অর্ডার
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              হেলপারদের পেব্যাক এবং শপ পেজের মতো স্টোরদের পেইড/আনপেইড অর্ডার হিসাব
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="বন্ধ করুন"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Date Filter Bar */}
        <div className="px-4 sm:px-5 py-3 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0 text-xs">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400 font-bold flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              তারিখ:
            </span>
            {(['TODAY', 'YESTERDAY', 'LAST_7', 'THIS_MONTH', 'CUSTOM'] as DatePreset[]).map((p) => {
              const labels: Record<DatePreset, string> = {
                TODAY: 'আজ',
                YESTERDAY: 'গতকাল',
                LAST_7: 'গত ৭ দিন',
                THIS_MONTH: 'এই মাস',
                CUSTOM: 'কাস্টম',
              };
              const active = datePreset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePresetChange(p)}
                  className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>

          {/* Date Picker Inputs */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setDatePreset('CUSTOM');
                setStartDate(e.target.value);
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
            <span className="text-slate-500">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setDatePreset('CUSTOM');
                setEndDate(e.target.value);
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
        </div>

        {/* Minimal 3-Metric Summary Strip with Paid & Unpaid Breakdown */}
        <div className="grid grid-cols-3 divide-x divide-slate-800 bg-slate-900 border-b border-slate-800 text-center shrink-0">
          {/* Total Collected */}
          <div className="p-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              মোট সংগৃহীত
            </span>
            <div className="text-base sm:text-xl font-black text-white mt-0.5">
              ৳{calculations.totalCollected.toLocaleString()}
            </div>
            <span className="text-[10px] text-slate-400 font-medium">কাস্টমার ক্যাশ কালেকশন</span>
          </div>

          {/* Helper Payback */}
          <div
            onClick={() => setActiveTab('HELPER_PAYBACK')}
            className={`p-3 cursor-pointer transition-colors ${
              activeTab === 'HELPER_PAYBACK' ? 'bg-indigo-500/10' : 'hover:bg-slate-800/40'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider block">
              হেলপার পেব্যাক
            </span>
            <div className="text-base sm:text-xl font-black text-amber-300 mt-0.5">
              বাকি ৳{calculations.totalHelperPaybackRemaining.toLocaleString()}
            </div>
            <span className="text-[10px] text-emerald-400 font-bold block mt-0.5">
              পরিশোধিত: ৳{calculations.totalHelperPaybackPaid.toLocaleString()}
            </span>
          </div>

          {/* Store Due */}
          <div
            onClick={() => setActiveTab('OWED_STORES')}
            className={`p-3 cursor-pointer transition-colors ${
              activeTab === 'OWED_STORES' ? 'bg-amber-500/10' : 'hover:bg-slate-800/40'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider block">
              দোকানের পাওনা
            </span>
            <div className="text-base sm:text-xl font-black text-amber-300 mt-0.5">
              বাকি ৳{calculations.totalStoreOwedRemaining.toLocaleString()}
            </div>
            <span className="text-[10px] text-emerald-400 font-bold block mt-0.5">
              পরিশোধিত: ৳{calculations.totalStoreOwedPaid.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Tab Switch, Filter Chips & Search */}
        <div className="p-3.5 bg-slate-900 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2.5 shrink-0">
          {/* 2-Way Tab Switch */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('HELPER_PAYBACK')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'HELPER_PAYBACK'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              <span>হেলপার পেব্যাক ({calculations.helpersList.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('OWED_STORES')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'OWED_STORES'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>দোকানের পাওনা ({calculations.storesList.length})</span>
            </button>
          </div>

          {/* Status Sub-Filters & Search */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Status Pills */}
            <div className="flex items-center gap-1 text-[11px] bg-slate-950 p-1 rounded-xl border border-slate-800">
              {activeTab === 'HELPER_PAYBACK' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setHelperFilter('ALL')}
                    className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                      helperFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    সকল ({calculations.helpersList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelperFilter('DUE')}
                    className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                      helperFilter === 'DUE' ? 'bg-amber-500/30 text-amber-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    বকেয়া ({dueHelpersCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelperFilter('PAID')}
                    className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                      helperFilter === 'PAID' ? 'bg-emerald-500/30 text-emerald-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    পরিশোধিত ({paidHelpersCount})
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setStoreFilter('ALL')}
                    className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                      storeFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    সকল ({calculations.storesList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoreFilter('DUE')}
                    className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                      storeFilter === 'DUE' ? 'bg-amber-500/30 text-amber-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    বকেয়া ({dueStoresCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoreFilter('PAID')}
                    className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                      storeFilter === 'PAID' ? 'bg-emerald-500/30 text-emerald-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    পরিশোধিত ({paidStoresCount})
                  </button>
                </>
              )}
            </div>

            {/* Clean Search */}
            <div className="relative w-full sm:w-48 shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="খুঁজুন..."
                className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Toast Notification */}
        {toastMsg && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/30 text-emerald-300 px-4 py-2 text-xs font-bold flex items-center justify-center gap-1.5 animate-in fade-in shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Content Area with Preloader */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {lifetimeData.loading ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 space-y-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-3 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                <Coins className="w-4 h-4 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center">
                <h4 className="text-xs sm:text-sm font-bold text-white">হিসাব ও ডেটা নিখুঁতভাবে সমন্বয় করা হচ্ছে...</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">সবগুলো স্টোর ও হেলপারের লাইভ লেজার যাচাই করা হচ্ছে</p>
              </div>
            </div>
          ) : (
            <>
              {/* TAB 1: HELPER PAYBACK */}
              {activeTab === 'HELPER_PAYBACK' && (
                <>
                  {filteredHelpers.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Bike className="w-9 h-9 mx-auto mb-2 opacity-40 text-slate-500" />
                      <p className="text-xs font-bold">এই ফিল্টারে কোনো হেলপারের হিসাব পাওয়া যায়নি।</p>
                    </div>
                  ) : (
                    filteredHelpers.map((h) => {
                      const isFullyPaid = h.grossPaybackAmount > 0 && h.remainingPaybackAmount === 0;
                      const isPartial = h.paidBackAmount > 0 && h.remainingPaybackAmount > 0;

                      return (
                        <div
                          key={h.helperId}
                          onClick={() => setSelectedHelperForDetails({ helperId: h.helperId, name: h.name })}
                          className="rounded-xl bg-slate-800/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/90 transition-all overflow-hidden cursor-pointer group"
                        >
                          {/* Main Minimal Row */}
                          <div className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 select-none">
                            {/* Left: Helper Info */}
                            <div className="flex items-center space-x-3">
                              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center font-black text-xs shrink-0 group-hover:scale-105 transition-transform">
                                {h.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center space-x-2 flex-wrap">
                                  <h4 className="text-xs sm:text-sm font-black text-white group-hover:text-indigo-200 transition-colors">{h.name}</h4>
                                  <span className="text-[10px] text-slate-400 font-semibold bg-slate-700/60 px-1.5 py-0.5 rounded">
                                    {h.deliveredOrdersCount} টি ডেলিভারি
                                  </span>

                                  {/* Status Badges */}
                                  {isFullyPaid ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3" />
                                      পরিশোধিত (৳{h.paidBackAmount})
                                    </span>
                                  ) : isPartial ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      আংশিক পরিশোধিত (জমা ৳{h.paidBackAmount})
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                      পেব্যাক বাকি
                                    </span>
                                  )}
                                </div>
                                {h.phone && (
                                  <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                                    <a
                                      href={`tel:${h.phone}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-emerald-400 hover:underline font-mono"
                                    >
                                      {h.phone}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={(e) => handleCopyPhone(h.phone!, e)}
                                      className="text-slate-400 hover:text-white"
                                      title="কপি করুন"
                                    >
                                      {copiedPhone === h.phone ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                    <span className="text-slate-500 text-[10px]">
                                      (উপার্জন ৳{h.helperEarnings})
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right: Amounts & Actions */}
                            <div className="flex items-center justify-between sm:justify-end gap-3 pl-12 sm:pl-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-700/50">
                              {/* Payback Amount Due */}
                              <div className="text-left sm:text-right">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                                  {isFullyPaid ? 'পরিশোধিত পেব্যাক' : 'বাকি পেব্যাক'}
                                </span>
                                <div className={`text-sm sm:text-base font-black ${
                                  isFullyPaid ? 'text-emerald-400' : 'text-amber-300'
                                }`}>
                                  ৳{(isFullyPaid ? h.paidBackAmount : h.remainingPaybackAmount).toLocaleString()}
                                </div>
                              </div>

                              {/* Record Payback Button */}
                              <button
                                type="button"
                                onClick={(e) => openPaybackModal(h, e)}
                                className={`px-2.5 py-1.5 rounded-lg text-white font-black text-xs transition-colors flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs ${
                                  isFullyPaid
                                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                    : 'bg-indigo-600 hover:bg-indigo-500'
                                }`}
                              >
                                <Coins className="w-3.5 h-3.5 text-yellow-300" />
                                <span>{isFullyPaid ? 'পুনরায় পেব্যাক' : 'পেব্যাক রেকর্ড'}</span>
                              </button>

                              {/* Details Modal Trigger Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedHelperForDetails({ helperId: h.helperId, name: h.name });
                                }}
                                className="px-2 py-1.5 text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold shrink-0"
                                title="হেলপারের সম্পূর্ণ হিস্ট্রি ও বিস্তারিত প্রোফাইল দেখুন"
                              >
                                <span>বিস্তারিত</span>
                                <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}

              {/* TAB 2: STORES OWED */}
              {activeTab === 'OWED_STORES' && (
                <>
                  {filteredStores.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Store className="w-9 h-9 mx-auto mb-2 opacity-40 text-slate-500" />
                      <p className="text-xs font-bold">এই ফিল্টারে কোনো স্টোরের হিসাব পাওয়া যায়নি।</p>
                    </div>
                  ) : (
                    filteredStores.map((s) => {
                      const isExpanded = expandedStoreId === s.storeId;
                      const isFullyDisbursed = s.totalCost > 0 && s.unpaidAmount === 0;
                      const isPartial = s.disbursedAmount > 0 && s.unpaidAmount > 0;

                      return (
                        <div
                          key={s.storeId}
                          className="rounded-xl bg-slate-800/60 border border-slate-800 hover:border-slate-700 transition-all overflow-hidden"
                        >
                          {/* Main Minimal Row */}
                          <div
                            onClick={() => setExpandedStoreId(isExpanded ? null : s.storeId)}
                            className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer select-none"
                          >
                            {/* Store Info */}
                            <div className="flex items-center space-x-3">
                              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center shrink-0">
                                <Store className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center space-x-2 flex-wrap">
                                  <h4 className="text-xs sm:text-sm font-black text-white">{s.storeName}</h4>
                                  <span className="text-[10px] text-slate-400 bg-slate-700/60 px-1.5 py-0.5 rounded font-bold">
                                    {s.orderCount} টি অর্ডার
                                  </span>

                                  {/* Store Paid Status Badges */}
                                  {isFullyDisbursed ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3" />
                                      পরিশোধিত (৳{s.disbursedAmount})
                                    </span>
                                  ) : isPartial ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      আংশিক পরিশোধিত (পেইড ৳{s.disbursedAmount})
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                      বকেয়া পাওনা
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                                  {s.ownerName && <span>মালিক: {s.ownerName}</span>}
                                  {s.phone && (
                                    <span className="flex items-center space-x-1">
                                      <span>•</span>
                                      <a
                                        href={`tel:${s.phone}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-emerald-400 hover:underline font-mono"
                                      >
                                        {s.phone}
                                      </a>
                                      <button
                                        type="button"
                                        onClick={(e) => handleCopyPhone(s.phone!, e)}
                                        className="text-slate-400 hover:text-white"
                                      >
                                        {copiedPhone === s.phone ? (
                                          <Check className="w-3 h-3 text-emerald-400" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Owed Amount & Disburse Button */}
                            <div className="flex items-center justify-between sm:justify-end gap-3 pl-12 sm:pl-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-700/50">
                              {/* Clickable Owed Amount */}
                              <div
                                onClick={(e) => handleDisburseClick(s, e)}
                                className="text-left sm:text-right hover:opacity-80 transition-opacity cursor-pointer group"
                                title="ডিসবার্স মোডাল খুলতে ক্লিক করুন"
                              >
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block flex items-center justify-start sm:justify-end gap-1">
                                  {isFullyDisbursed ? 'পরিশোধিত' : 'দিতে হবে'} <ArrowRight className="w-2.5 h-2.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                                </span>
                                <div className={`text-sm sm:text-base font-black ${
                                  isFullyDisbursed ? 'text-emerald-400' : 'text-amber-300 underline decoration-dotted decoration-amber-400/50'
                                }`}>
                                  ৳{s.unpaidAmount.toLocaleString()}
                                </div>
                              </div>

                              {/* Disburse or Ledger Button */}
                              {onDisburseStore && (
                                <button
                                  type="button"
                                  onClick={(e) => handleDisburseClick(s, e)}
                                  className={`px-3 py-1.5 rounded-lg font-black text-xs transition-colors flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs ${
                                    isFullyDisbursed
                                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                  }`}
                                  title="টাকা পরিশোধ বা লেজার দেখতে ক্লিক করুন"
                                >
                                  <CreditCard className="w-3.5 h-3.5" />
                                  <span>{isFullyDisbursed ? 'লেজার দেখুন' : 'ডিসবার্স / Pay →'}</span>
                                </button>
                              )}

                              {/* Expand chevron */}
                              <button
                                type="button"
                                className="p-1 text-slate-400 hover:text-white"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Store Orders Details with Paid / Unpaid Status per order */}
                          {isExpanded && (
                            <div className="px-3.5 pb-3 pt-1 bg-slate-950/40 border-t border-slate-800 text-[11px] space-y-1.5">
                              <div className="text-slate-400 font-bold py-1 flex justify-between">
                                <span>সংশ্লিষ্ট অর্ডারসমূহ: (মোট মালামাল: ৳{s.totalCost.toLocaleString()})</span>
                                <span>পেইড: ৳{s.disbursedAmount} • বাকি: ৳{s.unpaidAmount}</span>
                              </div>
                              {s.orders.map((ord, idx) => (
                                <div
                                  key={ord.id || idx}
                                  className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-between gap-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <Receipt className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                    <span className="font-bold text-white">#{ord.id}</span>
                                    {ord.title && <span className="text-slate-300 truncate max-w-xs">{ord.title}</span>}
                                    {ord.time && <span className="text-slate-500">({ord.time})</span>}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {ord.isPaid ? (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        পরিশোধিত
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        বকেয়া
                                      </span>
                                    )}
                                    <strong className="text-white">৳{ord.cost.toLocaleString()}</strong>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Minimal Footer */}
        <div className="p-3.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-400 shrink-0">
          <div>
            পেব্যাক বাকি: <strong className="text-amber-400 font-bold">৳{calculations.totalHelperPaybackRemaining.toLocaleString()}</strong> • 
            দোকানের পাওনা বাকি: <strong className="text-amber-400 font-bold ml-1">৳{calculations.totalStoreOwedRemaining.toLocaleString()}</strong>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>

      {/* Minimal Quick Payback Recorder Modal */}
      {recordingHelper && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-yellow-400" />
                <h4 className="font-black text-sm text-white">হেলপার পেব্যাক গ্রহণ</h4>
              </div>
              <button
                type="button"
                onClick={() => setRecordingHelper(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">হেলপার:</span>
                <strong className="text-white">{recordingHelper.name}</strong>
              </div>
              <div className="flex justify-between text-amber-300 font-bold">
                <span>বাকি পেব্যাক:</span>
                <span>৳{recordingHelper.remainingPaybackAmount.toLocaleString()}</span>
              </div>
              {recordingHelper.walletBalance > 0 && (
                <div className="flex justify-between text-rose-300 font-bold">
                  <span>সর্বমোট ওয়ালেট বকেয়া:</span>
                  <span>৳{recordingHelper.walletBalance.toLocaleString()}</span>
                </div>
              )}
            </div>

            <form onSubmit={handlePaybackSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  পরিশোধিত পরিমাণ (৳)
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm font-black text-white focus:outline-none focus:border-indigo-500"
                />
                {/* Quick Presets */}
                <div className="flex gap-1.5 mt-1.5 text-[10px]">
                  {recordingHelper.remainingPaybackAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPayAmount(String(recordingHelper.remainingPaybackAmount))}
                      className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 font-bold"
                    >
                      বাকি পেব্যাক (৳{recordingHelper.remainingPaybackAmount})
                    </button>
                  )}
                  {recordingHelper.walletBalance > 0 && recordingHelper.walletBalance !== recordingHelper.remainingPaybackAmount && (
                    <button
                      type="button"
                      onClick={() => setPayAmount(String(recordingHelper.walletBalance))}
                      className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 font-bold"
                    >
                      পুরো ডিউ (৳{recordingHelper.walletBalance})
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  পেমেন্ট মাধ্যম
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white font-bold focus:outline-none focus:border-indigo-500"
                >
                  <option value="Cash">ক্যাশ (Cash)</option>
                  <option value="bKash">বিকাশ (bKash)</option>
                  <option value="Nagad">নগদ (Nagad)</option>
                  <option value="Rocket">রকেট (Rocket)</option>
                  <option value="Bank">ব্যাংক (Bank)</option>
                  <option value="Manual Record">অন্যান্য (Other)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  নোট (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="যেমন: ক্যাশ রিসিভড"
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRecordingHelper(null)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'রেকর্ড হচ্ছে...' : 'জমা রেকর্ড করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Helper History & Details Modal */}
      {selectedHelperForDetails && (
        <HelperHistoryModal
          helperId={selectedHelperForDetails.helperId}
          helperName={selectedHelperForDetails.name}
          onClose={() => setSelectedHelperForDetails(null)}
        />
      )}
    </div>
  );
};
