'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Order, WithdrawalRequest, OrderFeedback } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { calculateHelperCommission } from '@/lib/pricing';
import { useModal } from '../CustomModal';
import {
  X,
  Bike,
  Phone,
  ShoppingBag,
  DollarSign,
  Wallet as WalletIcon,
  CheckCircle2,
  ChevronRight,
  FileText,
  Calendar,
  Filter,
  Receipt,
  TrendingUp,
  TrendingDown,
  Clock,
  MapPin,
  Search,
  Plus,
  Activity,
  BarChart3,
  ThumbsDown,
  ThumbsUp,
  AlertTriangle,
  Zap,
  Check,
  Star,
  RefreshCw,
  Sparkles,
  Info,
  Timer,
  AlertCircle,
  Award,
  Store,
} from 'lucide-react';
import { AdminOrderDetailsModal } from './AdminOrderDetailsModal';
import { PaginationControl } from './PaginationControl';

interface HelperHistoryModalProps {
  helperId: string;
  helperName: string;
  onClose: () => void;
}

type PresetType = 'ALL_TIME' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH' | 'CUSTOM';

export const HelperHistoryModal: React.FC<HelperHistoryModalProps> = ({
  helperId,
  helperName,
  onClose,
}) => {
  const { showAlert } = useModal();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'PERFORMANCE' | 'EARNINGS' | 'JOBS' | 'REVIEWS' | 'PAYBACKS'>('PERFORMANCE');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [feedbackFilter, setFeedbackFilter] = useState<'ALL' | 'NEGATIVE' | 'POSITIVE'>('ALL');

  // Real-time store subscription
  const [, setStoreVersion] = useState(0);
  useEffect(() => {
    return fallbackStore.subscribe(() => {
      setStoreVersion((v) => v + 1);
    });
  }, []);

  // Commission Payback Transaction Recording State
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payNote, setPayNote] = useState('');
  const [isSubmittingPayback, setIsSubmittingPayback] = useState(false);

  // Graph series toggles
  const [activeSeries, setActiveSeries] = useState<{
    acceptingTime: boolean;
    deliveryTime: boolean;
    orderDelivery: boolean;
    negativeReviews: boolean;
  }>({
    acceptingTime: true,
    deliveryTime: true,
    orderDelivery: true,
    negativeReviews: true,
  });

  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

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

  // Date Range Filtering State - Default to LAST_7
  const [startDate, setStartDate] = useState<string>(getDaysAgoStr(6));
  const [endDate, setEndDate] = useState<string>(getTodayStr());
  const [activePreset, setActivePreset] = useState<PresetType>('LAST_7');
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);

  const handlePresetSelect = (preset: PresetType) => {
    setActivePreset(preset);
    setCurrentPage(1);
    if (preset === 'CUSTOM') {
      setShowCustomPicker(true);
      return;
    }
    setShowCustomPicker(false);
    if (preset === 'ALL_TIME') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      setStartDate(getTodayStr());
      setEndDate(getTodayStr());
    } else if (preset === 'YESTERDAY') {
      const y = getDaysAgoStr(1);
      setStartDate(y);
      setEndDate(y);
    } else if (preset === 'LAST_7') {
      setStartDate(getDaysAgoStr(6));
      setEndDate(getTodayStr());
    } else if (preset === 'LAST_30') {
      setStartDate(getDaysAgoStr(29));
      setEndDate(getTodayStr());
    } else if (preset === 'THIS_MONTH') {
      setStartDate(getStartOfMonthStr());
      setEndDate(getTodayStr());
    }
  };

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

  const formatDurationSecs = (secs: number): string => {
    if (secs <= 0) return '0s';
    if (secs < 60) return `${Math.round(secs)}s`;
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    if (s === 0) return `${m}m`;
    return `${m}m ${s}s`;
  };

  const formatDurationMins = (mins: number): string => {
    if (mins <= 0) return '0 min';
    if (mins < 60) return `${Math.round(mins)} mins`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // Fetch helper application & profile
  const application = Array.from(fallbackStore.helperApplications.values()).find(
    (a) => a.userId === helperId
  );
  const userProfile = fallbackStore.users.get(helperId);

  // Fetch assigned orders
  const allOrders = Array.from(fallbackStore.orders.values());
  const helperOrders = useMemo(() => {
    return allOrders
      .filter((o) => o.helperId === helperId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allOrders, helperId]);

  // Fetch helper feedbacks
  const helperFeedbacks = useMemo(() => {
    const storeFeedbacks = Array.from(fallbackStore.orderFeedbacks.values());
    const helperOrderIds = new Set(helperOrders.map((o) => o.id));

    const fbMap = new Map<string, OrderFeedback>();

    storeFeedbacks.forEach((f) => {
      if (f.helperId === helperId || helperOrderIds.has(f.orderId)) {
        fbMap.set(f.id, f);
      }
    });

    helperOrders.forEach((o) => {
      if (o.feedback && o.feedback.id) {
        fbMap.set(o.feedback.id, o.feedback);
      }
    });

    return Array.from(fbMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [helperOrders, helperId]);

  const isFeedbackNegative = (f: OrderFeedback): boolean => {
    if (f.thumbsUp === false) return true;
    if (f.riderRating > 0 && f.riderRating <= 2) return true;
    if (f.serviceRating > 0 && f.serviceRating <= 2) return true;
    const rCount = (f.riderRating > 0 ? 1 : 0) + (f.serviceRating > 0 ? 1 : 0);
    if (rCount > 0 && ((f.riderRating || 0) + (f.serviceRating || 0)) / rCount <= 2) return true;
    return false;
  };

  // Check if an order was placed to a partner store / shop
  const isOrderPlacedToStore = (ord: Order): boolean => {
    const shopOrders = fallbackStore.getShopOrdersForOrder(ord.id);
    if (shopOrders && shopOrders.length > 0) return true;
    if (ord.selectedShopIds && ord.selectedShopIds.length > 0) return true;
    if (ord.isStoreOrder) return true;
    return false;
  };

  // Helper order duration calculators
  const getOrderAcceptanceSecs = (ord: Order): number | null => {
    const createdMs = new Date(ord.createdAt).getTime();
    if (isNaN(createdMs) || createdMs <= 0) return null;

    let acceptedMs: number | null = null;
    if (ord.acceptedAt) {
      const t = new Date(ord.acceptedAt).getTime();
      if (!isNaN(t) && t > 0) acceptedMs = t;
    }
    if (!acceptedMs && ord.statusHistory && ord.statusHistory.length > 0) {
      const hist = ord.statusHistory.find((h) => h.status === 'ACCEPTED');
      if (hist && hist.timestamp) {
        const t = new Date(hist.timestamp).getTime();
        if (!isNaN(t) && t > 0) acceptedMs = t;
      }
    }
    if (!acceptedMs) return null;
    const diffSecs = Math.max(0, Math.round((acceptedMs - createdMs) / 1000));
    // Filter anomalies (>24 hours)
    if (diffSecs > 86400) return null;
    return diffSecs;
  };

  const getOrderDeliveryMins = (ord: Order): number | null => {
    if (ord.status !== 'DELIVERED' && (ord.status as string) !== 'COMPLETED') return null;
    const deliveredMs = new Date(ord.deliveredAt || ord.updatedAt).getTime();
    if (isNaN(deliveredMs) || deliveredMs <= 0) return null;

    const startMs = new Date(ord.acceptedAt || ord.createdAt).getTime();
    if (isNaN(startMs) || startMs <= 0) return null;

    const diffMins = Math.max(0, Math.round((deliveredMs - startMs) / (60 * 1000)));
    // Filter anomalies (>24 hours)
    if (diffMins > 1440) return null;
    return diffMins;
  };

  // Fetch wallet & transactions & withdrawals
  const wallet = fallbackStore.getHelperWallet(helperId);
  const walletTxs = fallbackStore.walletTransactions.get(helperId) || [];
  const helperWithdrawals = Array.from(fallbackStore.withdrawals.values()).filter(
    (w) => w.helperId === helperId
  );

  // Order financials calculator
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

  // Filter helper orders based on selected Date Range
  const dateFilteredOrders = useMemo(() => {
    return helperOrders.filter((ord) => {
      const orderDate = ord.deliveredAt || ord.updatedAt || ord.createdAt;
      const t = new Date(orderDate).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [helperOrders, startDate, endDate]);

  // Filter delivered orders in date range
  const filteredDeliveredOrders = useMemo(() => {
    return dateFilteredOrders
      .filter((o) => o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED')
      .sort((a, b) => {
        const timeA = new Date(a.deliveredAt || a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.deliveredAt || b.updatedAt || b.createdAt).getTime();
        return timeB - timeA;
      });
  }, [dateFilteredOrders]);

  // Filter feedbacks in date range
  const dateFilteredFeedbacks = useMemo(() => {
    return helperFeedbacks.filter((fb) => {
      const t = new Date(fb.createdAt).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [helperFeedbacks, startDate, endDate]);

  // Filtered withdrawals in date range
  const filteredWithdrawals = useMemo(() => {
    return helperWithdrawals.filter((w) => {
      const t = new Date(w.createdAt).getTime();
      if (isNaN(t)) return true;
      if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [helperWithdrawals, startDate, endDate]);

  // 4 Primary KPIs Calculation
  const performanceKPIs = useMemo(() => {
    // 1. Avg Order Accepting Time
    let totalAcceptingSecs = 0;
    let countWithAcceptance = 0;
    dateFilteredOrders.forEach((o) => {
      const durSecs = getOrderAcceptanceSecs(o);
      if (durSecs !== null) {
        totalAcceptingSecs += durSecs;
        countWithAcceptance++;
      }
    });
    const avgAcceptingSecs = countWithAcceptance > 0 ? Math.round(totalAcceptingSecs / countWithAcceptance) : 0;
    const avgAcceptingMinsFraction = avgAcceptingSecs / 60;
    const avgAcceptingText = countWithAcceptance > 0 ? formatDurationSecs(avgAcceptingSecs) : 'N/A';

    // 2. Order Delivery Time (Avg Delivery Duration)
    let totalDeliveryMins = 0;
    let countWithDeliveryTime = 0;
    filteredDeliveredOrders.forEach((o) => {
      const durMins = getOrderDeliveryMins(o);
      if (durMins !== null) {
        totalDeliveryMins += durMins;
        countWithDeliveryTime++;
      }
    });
    const avgDeliveryMins = countWithDeliveryTime > 0 ? Math.round(totalDeliveryMins / countWithDeliveryTime) : 0;
    const avgDeliveryTimeText = countWithDeliveryTime > 0 ? `${avgDeliveryMins} mins` : 'N/A';

    // 3. Order Delivery (Total Delivered Count)
    const orderDeliveryCount = filteredDeliveredOrders.length;
    const totalAssignedInPeriod = dateFilteredOrders.length;
    const completionRate = totalAssignedInPeriod > 0
      ? Math.round((orderDeliveryCount / totalAssignedInPeriod) * 100)
      : 100;

    // 4. Negative Reviews
    let negativeCount = 0;
    let positiveCount = 0;
    dateFilteredFeedbacks.forEach((f) => {
      if (isFeedbackNegative(f)) {
        negativeCount++;
      } else {
        positiveCount++;
      }
    });
    const totalReviews = dateFilteredFeedbacks.length;
    const positiveRate = totalReviews > 0
      ? Math.round((positiveCount / totalReviews) * 100)
      : 100;

    // 5. Store Orders Placed to Partner Stores
    let storeOrdersCount = 0;
    let storeOrdersGMV = 0;
    let storeOrdersRealGMV = 0; // Only real partner store purchases (no custom costs)
    dateFilteredOrders.forEach((o) => {
      if (isOrderPlacedToStore(o)) {
        storeOrdersCount++;
        const shopOrders = fallbackStore.getShopOrdersForOrder(o.id);
        const activeShopOrders = shopOrders && shopOrders.length > 0
          ? shopOrders.filter((so) => so.status !== 'CANCELED')
          : [];
        const storeSpent = activeShopOrders.length > 0
          ? activeShopOrders.reduce((s, so) => s + (so.price || 0), 0)
          : (o.productCost || 0);
        storeOrdersGMV += storeSpent;
        // Real partner store = not a 'myself'/custom-cost entry
        const realShopOrders = activeShopOrders.filter(
          (so) => so.shopId !== 'myself' && so.shopName !== 'MySelf' && !so.id?.startsWith('so-myself')
        );
        storeOrdersRealGMV += realShopOrders.reduce((s, so) => s + (so.price || 0), 0);
      }
    });

    const storeOrdersPercentage = totalAssignedInPeriod > 0
      ? Math.round((storeOrdersCount / totalAssignedInPeriod) * 100)
      : 0;

    const deliveredStoreOrdersCount = filteredDeliveredOrders.filter(isOrderPlacedToStore).length;
    const deliveredStoreOrdersPercentage = filteredDeliveredOrders.length > 0
      ? Math.round((deliveredStoreOrdersCount / filteredDeliveredOrders.length) * 100)
      : 0;

    return {
      avgAcceptingSecs,
      avgAcceptingMinsFraction,
      avgAcceptingText,
      countWithAcceptance,
      avgDeliveryMins,
      avgDeliveryTimeText,
      countWithDeliveryTime,
      orderDeliveryCount,
      totalAssignedInPeriod,
      completionRate,
      negativeCount,
      positiveCount,
      totalReviews,
      positiveRate,
      storeOrdersCount,
      storeOrdersPercentage,
      storeOrdersGMV,
      storeOrdersRealGMV,
      deliveredStoreOrdersCount,
      deliveredStoreOrdersPercentage,
    };
  }, [dateFilteredOrders, filteredDeliveredOrders, dateFilteredFeedbacks]);

  // Filtered Earnings & Finances
  const earningsMetrics = useMemo(() => {
    let totalCollected = 0;
    let totalEarned = 0;
    let totalPlatformShare = 0;
    let paidCommission = 0;

    filteredDeliveredOrders.forEach((o) => {
      const { baseFeeForHelper, helperShare, platformShare } = getOrderFinancials(o);
      totalCollected += baseFeeForHelper;
      totalEarned += helperShare;
      totalPlatformShare += platformShare;
    });

    filteredWithdrawals.forEach((w) => {
      if (w.status === 'APPROVED') {
        paidCommission += w.amount;
      }
    });

    // Shop / Store order financials for this helper in the date range
    let totalStoreOrdersAmount = 0;
    let returnableStoreAmount = 0;    // Acceptable (registered) stores — full amount returned to company
    let nonAcceptableStoreCommission = 0; // Non-acceptable stores — commission owed

    filteredDeliveredOrders.forEach((o) => {
      const shopOrders = fallbackStore.getShopOrdersForOrder(o.id).filter((so) => so.status !== 'CANCELED');
      shopOrders.forEach((so) => {
        const price = so.price || 0;
        if (price <= 0) return;
        totalStoreOrdersAmount += price;

        const isMyself = so.shopId === 'myself';
        const shop = !isMyself ? fallbackStore.shops.get(so.shopId) : null;
        const canReceive = !isMyself && !!shop && shop.canReceiveOrders !== false;

        if (canReceive) {
          returnableStoreAmount += price;
        } else {
          let commissionRate = Number(shop?.commissionPercent);
          if (isNaN(commissionRate) || shop?.commissionPercent === undefined) {
            const app = Array.from(fallbackStore.storeApplications.values()).find(
              (a) => a.id === shop?.applicationId || (shop?.ownerUserId && a.userId === shop.ownerUserId)
            );
            commissionRate = Number(app?.commissionPercent) || 0;
          }
          if (commissionRate > 0) {
            nonAcceptableStoreCommission += Math.round(price * (commissionRate / 100));
          }
        }
      });
    });

    // Total receivable by admin = total delivery collected + returnable store amounts + non-acceptable store commissions
    const totalAdminReceivable = totalCollected + returnableStoreAmount + nonAcceptableStoreCommission;

    return {
      totalCollected,
      totalEarned,
      totalPlatformShare,
      paidCommission,
      dueCommission: Math.max(0, totalPlatformShare - paidCommission),
      completedCount: filteredDeliveredOrders.length,
      avgDeliveryTimeText: performanceKPIs.avgDeliveryTimeText,
      totalStoreOrdersAmount,
      returnableStoreAmount,
      nonAcceptableStoreCommission,
      totalAdminReceivable,
    };
  }, [filteredDeliveredOrders, filteredWithdrawals, performanceKPIs.avgDeliveryTimeText]);

  // Build Timeline Graph Data Points based on Date Range
  const graphTimelineData = useMemo(() => {
    const isSingleDay = Boolean(
      (activePreset === 'TODAY' || activePreset === 'YESTERDAY' || (startDate && startDate === endDate))
    );

    interface TimeBucket {
      key: string;
      label: string;
      fullLabel: string;
      orders: Order[];
      feedbacks: OrderFeedback[];
      acceptingSecsList: number[];
      deliveryMinsList: number[];
    }

    const buckets: TimeBucket[] = [];

    if (isSingleDay) {
      // 12 two-hour time slots across the day: 00:00, 02:00, ..., 22:00
      const targetDate = startDate || getTodayStr();
      const targetParts = targetDate.split('-');
      const dObj = new Date(parseInt(targetParts[0]), parseInt(targetParts[1]) - 1, parseInt(targetParts[2]));
      const dateHeader = dObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

      for (let hour = 0; hour < 24; hour += 2) {
        const startHStr = String(hour).padStart(2, '0');
        const endHStr = String(Math.min(23, hour + 1)).padStart(2, '0');
        buckets.push({
          key: `${startHStr}:00`,
          label: `${startHStr}:00`,
          fullLabel: `${dateHeader} (${startHStr}:00 - ${endHStr}:59)`,
          orders: [],
          feedbacks: [],
          acceptingSecsList: [],
          deliveryMinsList: [],
        });
      }

      // Assign orders to hour buckets
      dateFilteredOrders.forEach((o) => {
        const dStr = o.deliveredAt || o.acceptedAt || o.createdAt;
        const d = new Date(dStr);
        if (!isNaN(d.getTime())) {
          const h = d.getHours();
          const bucketIndex = Math.min(11, Math.floor(h / 2));
          buckets[bucketIndex]?.orders.push(o);

          const accSecs = getOrderAcceptanceSecs(o);
          if (accSecs !== null) {
            buckets[bucketIndex]?.acceptingSecsList.push(accSecs);
          }
          const delMins = getOrderDeliveryMins(o);
          if (delMins !== null) {
            buckets[bucketIndex]?.deliveryMinsList.push(delMins);
          }
        }
      });

      // Assign feedbacks to hour buckets
      dateFilteredFeedbacks.forEach((f) => {
        const d = new Date(f.createdAt);
        if (!isNaN(d.getTime())) {
          const h = d.getHours();
          const bucketIndex = Math.min(11, Math.floor(h / 2));
          buckets[bucketIndex]?.feedbacks.push(f);
        }
      });
    } else {
      // Multi-day timeline
      let startD = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
      let endD = endDate ? new Date(`${endDate}T23:59:59`) : new Date();

      if (activePreset === 'ALL_TIME') {
        // Find earliest order date
        const earliestOrder = helperOrders[helperOrders.length - 1];
        if (earliestOrder) {
          const eDate = new Date(earliestOrder.createdAt);
          if (!isNaN(eDate.getTime())) {
            startD = eDate;
          }
        } else {
          startD = new Date();
          startD.setDate(startD.getDate() - 14);
        }
      }

      // Cap to 35 days max to prevent SVG crowding
      const diffDays = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / (24 * 3600 * 1000)));
      const daysCount = Math.min(diffDays + 1, 35);

      const daysList: string[] = [];
      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(endD);
        d.setDate(endD.getDate() - i);
        daysList.push(getLocalYYYYMMDD(d));
      }

      const dayBucketMap = new Map<string, TimeBucket>();
      daysList.forEach((dStr) => {
        const parts = dStr.split('-');
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const fullLabel = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const b = {
          key: dStr,
          label,
          fullLabel,
          orders: [],
          feedbacks: [],
          acceptingSecsList: [],
          deliveryMinsList: [],
        };
        dayBucketMap.set(dStr, b);
        buckets.push(b);
      });

      // Populate orders by day
      dateFilteredOrders.forEach((o) => {
        const dStr = getLocalYYYYMMDD(new Date(o.deliveredAt || o.acceptedAt || o.createdAt));
        const b = dayBucketMap.get(dStr);
        if (b) {
          b.orders.push(o);
          const accSecs = getOrderAcceptanceSecs(o);
          if (accSecs !== null) b.acceptingSecsList.push(accSecs);
          const delMins = getOrderDeliveryMins(o);
          if (delMins !== null) b.deliveryMinsList.push(delMins);
        }
      });

      // Populate feedbacks by day
      dateFilteredFeedbacks.forEach((f) => {
        const dStr = getLocalYYYYMMDD(new Date(f.createdAt));
        const b = dayBucketMap.get(dStr);
        if (b) {
          b.feedbacks.push(f);
        }
      });
    }

    // Convert buckets to finalized graph metric points
    return buckets.map((b) => {
      const deliveredCount = b.orders.filter(
        (o) => o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED'
      ).length;

      const avgAcceptingSecs = b.acceptingSecsList.length > 0
        ? Math.round(b.acceptingSecsList.reduce((acc, v) => acc + v, 0) / b.acceptingSecsList.length)
        : 0;

      const avgDeliveryMins = b.deliveryMinsList.length > 0
        ? Math.round(b.deliveryMinsList.reduce((acc, v) => acc + v, 0) / b.deliveryMinsList.length)
        : 0;

      const negativeReviewsCount = b.feedbacks.filter(isFeedbackNegative).length;

      return {
        key: b.key,
        label: b.label,
        fullLabel: b.fullLabel,
        avgAcceptingSecs,
        avgAcceptingMinsFraction: avgAcceptingSecs / 60,
        avgDeliveryMins,
        deliveredCount,
        negativeReviewsCount,
        totalReviewsCount: b.feedbacks.length,
        hasActivity: b.orders.length > 0 || b.feedbacks.length > 0,
      };
    });
  }, [activePreset, startDate, endDate, dateFilteredOrders, dateFilteredFeedbacks, helperOrders]);

  // Helper order delay detector (> 1 hour / 60 mins)
  const getOrderDelayInfo = (ord: Order) => {
    const isDelivered = ord.status === 'DELIVERED' || (ord.status as string) === 'COMPLETED';
    const isCanceled = ord.status === 'CANCELED';

    if (isCanceled) return { isDelayed: false, delayMinutes: 0, delayLabel: '' };

    if (!isDelivered) {
      // Active order: delayed if elapsed time > 1 hour (>= 60 mins) & not mutually discussed
      const createdMs = new Date(ord.createdAt).getTime();
      if (isNaN(createdMs)) return { isDelayed: false, delayMinutes: 0, delayLabel: '' };
      const elapsedMs = Date.now() - createdMs;
      const elapsedMins = Math.round(elapsedMs / (60 * 1000));
      if (elapsedMins >= 60 && !ord.mutuallyDiscussed) {
        return {
          isDelayed: true,
          delayMinutes: elapsedMins,
          delayLabel: `Delayed >1h (${formatDurationMins(elapsedMins)})`,
        };
      }
      return { isDelayed: false, delayMinutes: elapsedMins, delayLabel: '' };
    } else {
      // Delivered order: delayed if total delivery duration > 1 hour (>= 60 mins) & not mutually discussed
      const deliveredMs = new Date(ord.deliveredAt || ord.updatedAt).getTime();
      const startMs = new Date(ord.acceptedAt || ord.createdAt).getTime();
      if (!isNaN(deliveredMs) && !isNaN(startMs) && deliveredMs > startMs) {
        const durMins = Math.round((deliveredMs - startMs) / (60 * 1000));
        if (durMins >= 60 && !ord.mutuallyDiscussed) {
          return {
            isDelayed: true,
            delayMinutes: durMins,
            delayLabel: `Delivery >1h (${formatDurationMins(durMins)})`,
          };
        }
      }
      return { isDelayed: false, delayMinutes: 0, delayLabel: '' };
    }
  };

  // Tab: All Jobs Filtered (with status + text search) - Delayed featured at TOP
  const tabJobsFiltered = useMemo(() => {
    const filtered = dateFilteredOrders.filter((ord) => {
      if (orderStatusFilter === 'STORE_ORDERS') {
        if (!isOrderPlacedToStore(ord)) return false;
      } else if (orderStatusFilter === 'NON_STORE') {
        if (isOrderPlacedToStore(ord)) return false;
      } else if (orderStatusFilter === 'DELAYED') {
        return getOrderDelayInfo(ord).isDelayed;
      } else if (orderStatusFilter !== 'ALL' && ord.status !== orderStatusFilter) {
        return false;
      }
      if (orderSearchQuery.trim()) {
        const q = orderSearchQuery.toLowerCase();
        const idMatch = ord.id.toLowerCase().includes(q);
        const titleMatch = (ord.title || '').toLowerCase().includes(q);
        const custMatch = (ord.customerName || '').toLowerCase().includes(q) || (ord.customerPhone || '').includes(q);
        if (!idMatch && !titleMatch && !custMatch) return false;
      }
      return true;
    });

    // Sort: Delayed orders ALWAYS featured at the top in red
    return filtered.sort((a, b) => {
      const delayA = getOrderDelayInfo(a).isDelayed;
      const delayB = getOrderDelayInfo(b).isDelayed;
      if (delayA && !delayB) return -1;
      if (!delayA && delayB) return 1;
      if (delayA && delayB) {
        return getOrderDelayInfo(b).delayMinutes - getOrderDelayInfo(a).delayMinutes;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [dateFilteredOrders, orderStatusFilter, orderSearchQuery]);

  // Tab: Reviews Filtered
  const tabReviewsFiltered = useMemo(() => {
    return dateFilteredFeedbacks.filter((fb) => {
      const isNeg = isFeedbackNegative(fb);
      if (feedbackFilter === 'NEGATIVE') return isNeg;
      if (feedbackFilter === 'POSITIVE') return !isNeg;
      return true;
    });
  }, [dateFilteredFeedbacks, feedbackFilter]);

  // Sort delivered orders so delayed deliveries feature at the top
  const sortedDeliveredOrders = useMemo(() => {
    return [...filteredDeliveredOrders].sort((a, b) => {
      const delayA = getOrderDelayInfo(a).isDelayed;
      const delayB = getOrderDelayInfo(b).isDelayed;
      if (delayA && !delayB) return -1;
      if (!delayA && delayB) return 1;
      if (delayA && delayB) {
        return getOrderDelayInfo(b).delayMinutes - getOrderDelayInfo(a).delayMinutes;
      }
      const timeA = new Date(a.deliveredAt || a.updatedAt || a.createdAt).getTime();
      const timeB = new Date(b.deliveredAt || b.updatedAt || b.createdAt).getTime();
      return timeB - timeA;
    });
  }, [filteredDeliveredOrders]);

  // Pagination for Earnings tab
  const [earningsPage, setEarningsPage] = useState(1);
  const [showStoreOrdersPanel, setShowStoreOrdersPanel] = useState(false);
  const earningsPageSize = 10;
  const totalEarningsPages = Math.ceil(sortedDeliveredOrders.length / earningsPageSize) || 1;
  const paginatedDeliveredOrders = sortedDeliveredOrders.slice(
    (earningsPage - 1) * earningsPageSize,
    earningsPage * earningsPageSize
  );

  // Pagination for All Jobs tab
  const totalJobsPages = Math.ceil(tabJobsFiltered.length / pageSize) || 1;
  const paginatedJobs = tabJobsFiltered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Record Commission Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      showAlert('ভুল পরিমাণ', 'অনুগ্রহ করে সঠিক পেমেন্ট পরিমাণ (৳) প্রদান করুন।', 'warning');
      return;
    }
    setIsSubmittingPayback(true);
    try {
      await fallbackStore.recordHelperPayback(helperId, amt, payNote.trim(), payMethod);
      setIsSubmittingPayback(false);
      setShowRecordPaymentModal(false);
      setPayAmount('');
      setPayNote('');
      showAlert('লেনদেন রেকর্ড সম্পন্ন', `হেলপারের পরিশোধিত ৳${amt} সফলভাবে রেকর্ড করা হয়েছে এবং কমিশন ডিউ থেকে কমানো হয়েছে।`, 'success');
    } catch (err: any) {
      setIsSubmittingPayback(false);
      showAlert('ব্যর্থ', err?.message || 'পেমেন্ট রেকর্ড করা যায়নি।', 'error');
    }
  };

  const presetLabels: Record<PresetType, string> = {
    ALL_TIME: 'All Time',
    TODAY: 'Today',
    YESTERDAY: 'Yesterday',
    LAST_7: 'Last 7 Days',
    LAST_30: 'Last 30 Days',
    THIS_MONTH: 'This Month',
    CUSTOM: 'Custom Range',
  };

  // SVG Chart Geometry Calculations
  const chartWidth = 740;
  const chartHeight = 220;
  const chartPaddingTop = 20;
  const chartPaddingBottom = 35;
  const chartPaddingX = 40;
  const innerWidth = chartWidth - chartPaddingX * 2;
  const innerHeight = chartHeight - chartPaddingTop - chartPaddingBottom;

  const pointsCount = Math.max(1, graphTimelineData.length);

  // Compute maximums for scaling
  const maxAcceptingTime = Math.max(5, ...graphTimelineData.map((d) => d.avgAcceptingMinsFraction * 1.2));
  const maxDeliveryTime = Math.max(30, ...graphTimelineData.map((d) => d.avgDeliveryMins * 1.15));
  const maxOrdersCount = Math.max(5, ...graphTimelineData.map((d) => d.deliveredCount * 1.2));
  const maxNegativeReviews = Math.max(4, ...graphTimelineData.map((d) => d.negativeReviewsCount * 1.3));

  // Build SVG Path Coordinates
  const buildSvgSeries = (
    accessor: (d: (typeof graphTimelineData)[0]) => number,
    maxVal: number
  ) => {
    const coords = graphTimelineData.map((d, idx) => {
      const x = pointsCount === 1
        ? chartWidth / 2
        : chartPaddingX + (idx / (pointsCount - 1)) * innerWidth;
      const val = accessor(d);
      const normalized = maxVal > 0 ? Math.min(1, Math.max(0, val / maxVal)) : 0;
      const y = chartPaddingTop + innerHeight - normalized * innerHeight;
      return { x, y, val, idx };
    });

    if (coords.length === 0) return { pathD: '', areaD: '', coords: [] };
    if (coords.length === 1) {
      const c = coords[0];
      return {
        pathD: `M ${c.x - 15} ${c.y} L ${c.x + 15} ${c.y}`,
        areaD: `M ${c.x - 15} ${chartPaddingTop + innerHeight} L ${c.x - 15} ${c.y} L ${c.x + 15} ${c.y} L ${c.x + 15} ${chartPaddingTop + innerHeight} Z`,
        coords,
      };
    }

    const pathD = coords.reduce((acc, curr, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`, '');
    const first = coords[0];
    const last = coords[coords.length - 1];
    const bottomY = chartPaddingTop + innerHeight;
    const areaD = `${pathD} L ${last.x.toFixed(1)} ${bottomY} L ${first.x.toFixed(1)} ${bottomY} Z`;

    return { pathD, areaD, coords };
  };

  const acceptingSeries = useMemo(() => {
    return buildSvgSeries((d) => d.avgAcceptingMinsFraction, maxAcceptingTime);
  }, [graphTimelineData, maxAcceptingTime]);

  const deliverySeries = useMemo(() => {
    return buildSvgSeries((d) => d.avgDeliveryMins, maxDeliveryTime);
  }, [graphTimelineData, maxDeliveryTime]);

  const orderDeliverySeries = useMemo(() => {
    return buildSvgSeries((d) => d.deliveredCount, maxOrdersCount);
  }, [graphTimelineData, maxOrdersCount]);

  const negativeReviewSeries = useMemo(() => {
    return buildSvgSeries((d) => d.negativeReviewsCount, maxNegativeReviews);
  }, [graphTimelineData, maxNegativeReviews]);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-gray-100">
          
          {/* Header */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-950 via-purple-900 to-indigo-900 text-white flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center space-x-3">
              {userProfile?.photoURL ? (
                <img
                  src={userProfile.photoURL}
                  alt={userProfile?.displayName || application?.legalName || helperName}
                  className="w-12 h-12 rounded-2xl object-cover ring-2 ring-indigo-400/40 shadow-md shrink-0"
                />
              ) : (
                <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20 shadow-inner shrink-0">
                  <Bike className="w-6 h-6 text-indigo-200" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
                    {userProfile?.displayName || application?.legalName || helperName}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/40 text-indigo-100 border border-indigo-300/30">
                    {userProfile?.helperType === 'dedicated' ? '⚡ Dedicated Rider' : '🚲 Commuter Helper'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/40 text-amber-100 border border-amber-300/30 flex items-center gap-1">
                    <Store className="w-3 h-3 text-amber-300" />
                    <span>Store Orders: {performanceKPIs.storeOrdersCount} ({performanceKPIs.storeOrdersPercentage}%)</span>
                  </span>
                  {userProfile?.isEduVerified && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/40 text-blue-100 border border-blue-300/30 flex items-center gap-0.5">
                      <Check className="w-3 h-3" />
                      <span>Edu Verified</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-indigo-200 mt-0.5 font-medium">
                  NID: {application?.nid || 'N/A'} • Phone: {userProfile?.alternativePhone || userProfile?.phoneNumber || application?.whatsapp || 'N/A'} • UID: {helperId}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-2xl bg-rose-500/80 hover:bg-rose-600 text-white transition-all shadow-sm cursor-pointer active:scale-95"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Date Filter Bar */}
          <div className="p-3 sm:px-5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap text-xs shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-purple-700" />
                <span>Date Filter:</span>
              </span>
              {(['ALL_TIME', 'TODAY', 'YESTERDAY', 'LAST_7', 'LAST_30', 'THIS_MONTH', 'CUSTOM'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className={`px-3 py-1 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                    activePreset === preset
                      ? 'bg-purple-900 text-white shadow-xs'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {presetLabels[preset]}
                </button>
              ))}
            </div>

            {/* Custom Date Range Pickers */}
            {(activePreset === 'CUSTOM' || showCustomPicker) && (
              <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-xl border border-gray-200 shadow-xs animate-in fade-in duration-150">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                    setEarningsPage(1);
                  }}
                  className="px-2 py-0.5 bg-gray-50 rounded-lg text-xs font-bold text-gray-800 border border-gray-200 outline-none"
                />
                <span className="text-gray-400 font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                    setEarningsPage(1);
                  }}
                  className="px-2 py-0.5 bg-gray-50 rounded-lg text-xs font-bold text-gray-800 border border-gray-200 outline-none"
                />
              </div>
            )}
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-gray-200 bg-gray-100/70 px-4 pt-2 gap-1.5 text-xs font-extrabold shrink-0 overflow-x-auto">
            <button
              onClick={() => setActiveTab('PERFORMANCE')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'PERFORMANCE'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
              <span>📊 Performance & Graph</span>
            </button>
            <button
              onClick={() => setActiveTab('EARNINGS')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'EARNINGS'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 text-purple-700" />
              <span>Earnings History ({filteredDeliveredOrders.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('JOBS')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'JOBS'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 text-blue-700" />
              <span>All Orders ({dateFilteredOrders.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('REVIEWS')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'REVIEWS'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Star className="w-3.5 h-3.5 text-amber-500" />
              <span>Reviews & Ratings ({dateFilteredFeedbacks.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('PAYBACKS')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'PAYBACKS'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <WalletIcon className="w-3.5 h-3.5 text-emerald-700" />
              <span>Paybacks & Wallet ({filteredWithdrawals.length})</span>
            </button>
          </div>

          {/* Content Area */}
          <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs bg-slate-50/40">
            
            {/* TAB 1: PERFORMANCE ANALYTICS & GRAPH */}
            {activeTab === 'PERFORMANCE' && (
              <div className="space-y-4">
                
                {/* 5 PRIMARY KPI HERO CARDS */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  
                  {/* KPI 1: Avg Order Accepting Time */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-indigo-700 tracking-wide flex items-center gap-1">
                        <Timer className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Avg Accepting Time</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${
                        performanceKPIs.avgAcceptingSecs > 0 && performanceKPIs.avgAcceptingSecs <= 60
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : performanceKPIs.avgAcceptingSecs <= 180
                          ? 'bg-blue-100 text-blue-800 border-blue-200'
                          : performanceKPIs.avgAcceptingSecs <= 300
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-rose-100 text-rose-800 border-rose-200'
                      }`}>
                        {performanceKPIs.avgAcceptingSecs === 0 ? 'N/A' : performanceKPIs.avgAcceptingSecs <= 60 ? '⚡ Ultra Fast' : performanceKPIs.avgAcceptingSecs <= 180 ? '🟢 Fast' : performanceKPIs.avgAcceptingSecs <= 300 ? '🟡 Normal' : '🔴 Slow'}
                      </span>
                    </div>
                    <div className="my-2">
                      <span className="text-2xl font-black text-indigo-950">
                        {performanceKPIs.avgAcceptingText}
                      </span>
                      <span className="text-[10px] text-gray-500 block font-medium mt-0.5">
                        Order creation to acceptance
                      </span>
                    </div>
                    <div className="text-[10px] text-indigo-900/70 font-semibold bg-indigo-100/50 px-2 py-1 rounded-lg">
                      Based on {performanceKPIs.countWithAcceptance} accepted orders
                    </div>
                  </div>

                  {/* KPI 2: Order Delivery Time */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-emerald-700 tracking-wide flex items-center gap-1">
                        <Bike className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Order Delivery Time</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${
                        performanceKPIs.avgDeliveryMins > 0 && performanceKPIs.avgDeliveryMins <= 25
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : performanceKPIs.avgDeliveryMins <= 40
                          ? 'bg-teal-100 text-teal-800 border-teal-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}>
                        {performanceKPIs.avgDeliveryMins === 0 ? 'N/A' : performanceKPIs.avgDeliveryMins <= 25 ? '🚀 Speedy' : performanceKPIs.avgDeliveryMins <= 40 ? '🟢 On Track' : '⏳ Long'}
                      </span>
                    </div>
                    <div className="my-2">
                      <span className="text-2xl font-black text-emerald-950">
                        {performanceKPIs.avgDeliveryTimeText}
                      </span>
                      <span className="text-[10px] text-gray-500 block font-medium mt-0.5">
                        Avg duration per delivery
                      </span>
                    </div>
                    <div className="text-[10px] text-emerald-900/70 font-semibold bg-emerald-100/50 px-2 py-1 rounded-lg">
                      Across {performanceKPIs.countWithDeliveryTime} delivered orders
                    </div>
                  </div>

                  {/* KPI 3: Order Delivery */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-white border border-purple-100 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-purple-700 tracking-wide flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                        <span>Order Delivery</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                        {performanceKPIs.completionRate}% Done
                      </span>
                    </div>
                    <div className="my-2">
                      <span className="text-2xl font-black text-purple-950">
                        {performanceKPIs.orderDeliveryCount} <span className="text-sm font-bold text-gray-500">jobs</span>
                      </span>
                      <span className="text-[10px] text-gray-500 block font-medium mt-0.5">
                        Completed successfully
                      </span>
                    </div>
                    <div className="text-[10px] text-purple-900/70 font-semibold bg-purple-100/50 px-2 py-1 rounded-lg">
                      {performanceKPIs.totalAssignedInPeriod} total assigned in period
                    </div>
                  </div>

                  {/* KPI 4: Store Orders Placed */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-white border border-amber-200 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-amber-800 tracking-wide flex items-center gap-1">
                        <Store className="w-3.5 h-3.5 text-amber-600" />
                        <span>Store Orders</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                        {performanceKPIs.storeOrdersPercentage}% Placed
                      </span>
                    </div>
                    <div className="my-2">
                      <span className="text-2xl font-black text-amber-950">
                        {performanceKPIs.storeOrdersCount} <span className="text-sm font-bold text-gray-500">orders</span>
                      </span>
                      <span className="text-[10px] text-gray-500 block font-medium mt-0.5">
                        Placed to partner stores
                      </span>
                    </div>
                    <div className="text-[10px] text-amber-900/80 font-bold bg-amber-100/60 px-2 py-1 rounded-lg flex items-center justify-between">
                      <span>{performanceKPIs.deliveredStoreOrdersCount} delivered</span>
                      <span className="text-[9px] text-amber-800 bg-amber-200/70 px-1 py-0.5 rounded font-black">Commissionable</span>
                    </div>
                  </div>

                  {/* KPI 5: Negative Reviews */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-50 to-white border border-rose-100 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-rose-700 tracking-wide flex items-center gap-1">
                        <ThumbsDown className="w-3.5 h-3.5 text-rose-600" />
                        <span>Negative Reviews</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${
                        performanceKPIs.negativeCount === 0
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border-rose-200'
                      }`}>
                        {performanceKPIs.negativeCount === 0 ? '✨ 100% Clean' : `${performanceKPIs.positiveRate}% Satisfied`}
                      </span>
                    </div>
                    <div className="my-2">
                      <span className={`text-2xl font-black ${performanceKPIs.negativeCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {performanceKPIs.negativeCount} <span className="text-sm font-bold text-gray-500">reviews</span>
                      </span>
                      <span className="text-[10px] text-gray-500 block font-medium mt-0.5">
                        Customer dissatisfaction count
                      </span>
                    </div>
                    <div className="text-[10px] text-rose-900/70 font-semibold bg-rose-100/50 px-2 py-1 rounded-lg">
                      {performanceKPIs.positiveCount} positive out of {performanceKPIs.totalReviews} reviews
                    </div>
                  </div>

                </div>

                {/* PERFORMANCE GRAPH SECTION */}
                <div className="p-4 sm:p-5 bg-white rounded-3xl border border-gray-200 shadow-sm space-y-4">
                  
                  {/* Graph Header & Series Toggles */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-gray-100">
                    <div>
                      <h4 className="font-extrabold text-sm sm:text-base text-gray-900 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-purple-700" />
                        <span>Helper Performance Timeline ({presetLabels[activePreset]})</span>
                      </h4>
                      <p className="text-[11px] text-gray-500 font-medium">
                        Visualizing KPI trend curves for acceptance speed, delivery duration, delivery volume & feedback.
                      </p>
                    </div>

                    {/* Interactive Series Toggle Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setActiveSeries((p) => ({ ...p, acceptingTime: !p.acceptingTime }))}
                        className={`px-2.5 py-1 rounded-xl font-extrabold text-[11px] transition-all flex items-center gap-1.5 cursor-pointer ${
                          activeSeries.acceptingTime
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-gray-100 text-gray-400 hover:text-gray-700'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-indigo-300" />
                        <span>Accepting Time</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveSeries((p) => ({ ...p, deliveryTime: !p.deliveryTime }))}
                        className={`px-2.5 py-1 rounded-xl font-extrabold text-[11px] transition-all flex items-center gap-1.5 cursor-pointer ${
                          activeSeries.deliveryTime
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-gray-100 text-gray-400 hover:text-gray-700'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-300" />
                        <span>Delivery Time</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveSeries((p) => ({ ...p, orderDelivery: !p.orderDelivery }))}
                        className={`px-2.5 py-1 rounded-xl font-extrabold text-[11px] transition-all flex items-center gap-1.5 cursor-pointer ${
                          activeSeries.orderDelivery
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-gray-100 text-gray-400 hover:text-gray-700'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-purple-300" />
                        <span>Deliveries</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveSeries((p) => ({ ...p, negativeReviews: !p.negativeReviews }))}
                        className={`px-2.5 py-1 rounded-xl font-extrabold text-[11px] transition-all flex items-center gap-1.5 cursor-pointer ${
                          activeSeries.negativeReviews
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'bg-gray-100 text-gray-400 hover:text-gray-700'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-rose-300" />
                        <span>Neg Reviews</span>
                      </button>
                    </div>
                  </div>

                  {/* SVG Chart */}
                  <div className="relative w-full overflow-x-auto select-none pt-2">
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      className="w-full h-auto min-w-[620px] overflow-visible"
                    >
                      <defs>
                        <linearGradient id="acceptingGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                        </linearGradient>
                        <linearGradient id="deliveryGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                        </linearGradient>
                        <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                        </linearGradient>
                        <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((lvl, i) => {
                        const y = chartPaddingTop + innerHeight - lvl * innerHeight;
                        return (
                          <line
                            key={i}
                            x1={chartPaddingX}
                            y1={y}
                            x2={chartWidth - chartPaddingX}
                            y2={y}
                            stroke="#e5e7eb"
                            strokeDasharray="3 3"
                            strokeWidth="1"
                          />
                        );
                      })}

                      {/* Series: Avg Accepting Time */}
                      {activeSeries.acceptingTime && acceptingSeries.pathD && (
                        <g>
                          {acceptingSeries.areaD && (
                            <path d={acceptingSeries.areaD} fill="url(#acceptingGradient)" />
                          )}
                          <path
                            d={acceptingSeries.pathD}
                            fill="none"
                            stroke="#6366f1"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {acceptingSeries.coords.map((c) => (
                            <circle
                              key={c.idx}
                              cx={c.x}
                              cy={c.y}
                              r={hoveredPointIndex === c.idx ? 5.5 : 3.5}
                              fill="#ffffff"
                              stroke="#6366f1"
                              strokeWidth={hoveredPointIndex === c.idx ? 3 : 2}
                            />
                          ))}
                        </g>
                      )}

                      {/* Series: Order Delivery Time */}
                      {activeSeries.deliveryTime && deliverySeries.pathD && (
                        <g>
                          {deliverySeries.areaD && (
                            <path d={deliverySeries.areaD} fill="url(#deliveryGradient)" />
                          )}
                          <path
                            d={deliverySeries.pathD}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {deliverySeries.coords.map((c) => (
                            <circle
                              key={c.idx}
                              cx={c.x}
                              cy={c.y}
                              r={hoveredPointIndex === c.idx ? 5.5 : 3.5}
                              fill="#ffffff"
                              stroke="#10b981"
                              strokeWidth={hoveredPointIndex === c.idx ? 3 : 2}
                            />
                          ))}
                        </g>
                      )}

                      {/* Series: Order Delivery (Volume) */}
                      {activeSeries.orderDelivery && orderDeliverySeries.pathD && (
                        <g>
                          {orderDeliverySeries.areaD && (
                            <path d={orderDeliverySeries.areaD} fill="url(#ordersGradient)" />
                          )}
                          <path
                            d={orderDeliverySeries.pathD}
                            fill="none"
                            stroke="#8b5cf6"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {orderDeliverySeries.coords.map((c) => (
                            <circle
                              key={c.idx}
                              cx={c.x}
                              cy={c.y}
                              r={hoveredPointIndex === c.idx ? 5.5 : 3.5}
                              fill="#ffffff"
                              stroke="#8b5cf6"
                              strokeWidth={hoveredPointIndex === c.idx ? 3 : 2}
                            />
                          ))}
                        </g>
                      )}

                      {/* Series: Negative Reviews */}
                      {activeSeries.negativeReviews && negativeReviewSeries.pathD && (
                        <g>
                          {negativeReviewSeries.areaD && (
                            <path d={negativeReviewSeries.areaD} fill="url(#negativeGradient)" />
                          )}
                          <path
                            d={negativeReviewSeries.pathD}
                            fill="none"
                            stroke="#ef4444"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {negativeReviewSeries.coords.map((c) => (
                            <circle
                              key={c.idx}
                              cx={c.x}
                              cy={c.y}
                              r={hoveredPointIndex === c.idx ? 5.5 : 3.5}
                              fill="#ffffff"
                              stroke="#ef4444"
                              strokeWidth={hoveredPointIndex === c.idx ? 3 : 2}
                            />
                          ))}
                        </g>
                      )}

                      {/* Interactive Hover Guides & Axis Labels */}
                      {graphTimelineData.map((point, idx) => {
                        const x = pointsCount === 1
                          ? chartWidth / 2
                          : chartPaddingX + (idx / (pointsCount - 1)) * innerWidth;
                        const isHovered = hoveredPointIndex === idx;

                        return (
                          <g key={point.key} className="cursor-pointer">
                            {/* Hover Vertical Guide */}
                            {isHovered && (
                              <line
                                x1={x}
                                y1={chartPaddingTop}
                                x2={x}
                                y2={chartPaddingTop + innerHeight}
                                stroke="#6b7280"
                                strokeDasharray="3 3"
                                strokeWidth="1.5"
                              />
                            )}

                            {/* Transparent Interactive Hover Trigger */}
                            <rect
                              x={x - (innerWidth / pointsCount) / 2}
                              y={chartPaddingTop}
                              width={innerWidth / pointsCount}
                              height={innerHeight + chartPaddingBottom}
                              fill="transparent"
                              onMouseEnter={() => setHoveredPointIndex(idx)}
                              onMouseLeave={() => setHoveredPointIndex(null)}
                            />

                            {/* X-Axis Date Label */}
                            <text
                              x={x}
                              y={chartHeight - 12}
                              textAnchor="middle"
                              fill={isHovered ? '#111827' : '#9ca3af'}
                              fontSize="10"
                              fontWeight={isHovered ? '800' : '600'}
                            >
                              {point.label}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* HOVER TOOLTIP CARD */}
                  {hoveredPointIndex !== null && graphTimelineData[hoveredPointIndex] && (
                    <div className="p-3.5 bg-slate-900 text-white rounded-2xl shadow-xl flex items-center justify-between gap-4 flex-wrap animate-in fade-in zoom-in-95 duration-100">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Timeline Focus
                        </span>
                        <h5 className="font-extrabold text-xs text-white">
                          {graphTimelineData[hoveredPointIndex].fullLabel}
                        </h5>
                      </div>

                      <div className="flex items-center gap-4 flex-wrap text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                          <span className="text-slate-300 font-bold">Acceptance:</span>
                          <span className="font-extrabold text-white">
                            {graphTimelineData[hoveredPointIndex].avgAcceptingSecs > 0
                              ? formatDurationSecs(graphTimelineData[hoveredPointIndex].avgAcceptingSecs)
                              : 'N/A'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                          <span className="text-slate-300 font-bold">Delivery:</span>
                          <span className="font-extrabold text-white">
                            {graphTimelineData[hoveredPointIndex].avgDeliveryMins > 0
                              ? `${graphTimelineData[hoveredPointIndex].avgDeliveryMins} mins`
                              : 'N/A'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                          <span className="text-slate-300 font-bold">Deliveries:</span>
                          <span className="font-extrabold text-white">
                            {graphTimelineData[hoveredPointIndex].deliveredCount} jobs
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                          <span className="text-slate-300 font-bold">Neg Reviews:</span>
                          <span className={`font-extrabold ${
                            graphTimelineData[hoveredPointIndex].negativeReviewsCount > 0 ? 'text-rose-400' : 'text-white'
                          }`}>
                            {graphTimelineData[hoveredPointIndex].negativeReviewsCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Empty state if no data points have activity */}
                  {!graphTimelineData.some((d) => d.hasActivity) && (
                    <div className="py-6 text-center text-gray-400 bg-gray-50/70 rounded-2xl border border-dashed border-gray-200">
                      <Clock className="w-8 h-8 mx-auto text-gray-300 mb-1" />
                      <p className="font-bold text-xs text-gray-600">No order activities recorded in this selected date range.</p>
                      <p className="text-[11px] text-gray-400">Try selecting 'Last 30 Days' or 'All Time' to see historical trends.</p>
                    </div>
                  )}

                </div>

                {/* HELPER RECENT REVIEWS & FEEDBACK PREVIEW */}
                <div className="p-4 sm:p-5 bg-white rounded-3xl border border-gray-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-xs sm:text-sm text-gray-900 flex items-center gap-1.5">
                        <Star className="w-4 h-4 text-amber-500" />
                        <span>Recent Customer Feedback & Quality Score</span>
                      </h4>
                      <p className="text-[11px] text-gray-500">
                        Total {dateFilteredFeedbacks.length} feedbacks received in this date range.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('REVIEWS')}
                      className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-extrabold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>View All ({dateFilteredFeedbacks.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {dateFilteredFeedbacks.length === 0 ? (
                    <div className="p-5 text-center text-gray-400 bg-gray-50 rounded-2xl">
                      <p className="font-bold text-xs">No customer reviews submitted in this timeframe.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {dateFilteredFeedbacks.slice(0, 4).map((fb) => {
                        const isNeg = isFeedbackNegative(fb);
                        return (
                          <div
                            key={fb.id}
                            className={`p-3.5 rounded-2xl border transition-all ${
                              isNeg
                                ? 'bg-rose-50/50 border-rose-200'
                                : 'bg-white border-gray-200 hover:border-purple-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900 text-xs">
                                  {fb.customerName || 'Customer'}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                                  isNeg
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {isNeg ? '⚠️ Negative' : '⭐ Positive'}
                                </span>
                              </div>
                              <span className="text-[10px] text-gray-400 font-medium">
                                {formatExactDateTime(fb.createdAt)}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 mt-1 text-[11px]">
                              <span className="font-bold text-amber-600 flex items-center gap-0.5">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                <span>Rider: {fb.riderRating || '—'} / 5</span>
                              </span>
                              {fb.serviceRating > 0 && (
                                <span className="text-gray-500 font-medium">
                                  Service: {fb.serviceRating} / 5
                                </span>
                              )}
                            </div>

                            {fb.improvementComment && (
                              <p className="mt-1.5 text-xs text-gray-700 bg-white/80 p-2 rounded-xl border border-gray-100 font-medium italic">
                                "{fb.improvementComment}"
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* TAB 2: EARNINGS BREAKDOWN */}
            {activeTab === 'EARNINGS' && (
              <div className="space-y-3">
                {/* Stats Summary Bar — Row 1: Delivery & Earnings */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 pb-2 bg-indigo-50/50 border border-gray-200 rounded-t-3xl text-center text-xs">
                  <div className="p-2.5 bg-white rounded-2xl border border-gray-200/80 shadow-xs">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Collected</span>
                    <span className="text-lg font-black text-indigo-950">৳{earningsMetrics.totalCollected}</span>
                    <span className="text-[9px] text-gray-400 block">Delivery Charges</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-2xl border border-emerald-200 shadow-xs">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase block">Helper Net Earned</span>
                    <span className="text-lg font-black text-emerald-600">৳{earningsMetrics.totalEarned}</span>
                    <span className="text-[9px] text-emerald-600/70 block">Helper Income</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-2xl border border-amber-200 shadow-xs flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-amber-700 uppercase block">Due Commission</span>
                      <span className="text-lg font-black text-amber-600">
                        ৳{activePreset === 'ALL_TIME' ? (wallet.balance || 0) : earningsMetrics.dueCommission}
                      </span>
                      <span className="text-[9px] text-amber-600/70 block">Current Balance</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPayAmount(String(wallet.balance > 0 ? wallet.balance : ''));
                        setShowRecordPaymentModal(true);
                      }}
                      className="mt-1.5 py-1 px-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                      title="Record payment to reduce commission due"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Reduce Due</span>
                    </button>
                  </div>
                  <div className="p-2.5 bg-white rounded-2xl border border-gray-200/80 shadow-xs">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Delivered</span>
                    <span className="text-lg font-black text-gray-800">{earningsMetrics.completedCount} jobs</span>
                    <span className="text-[9px] text-gray-400 block">Avg: {earningsMetrics.avgDeliveryTimeText}</span>
                  </div>
                </div>

                {/* Stats Summary Bar — Row 2: Store Orders & Admin Receivable */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 px-3.5 pt-0 pb-3.5 bg-indigo-50/50 border border-gray-200 border-t-0 rounded-b-3xl text-center text-xs">
                  {/* Combined Store Orders block (count + GMV + store amount) */}
                  <button
                    type="button"
                    onClick={() => setShowStoreOrdersPanel(true)}
                    className="p-2.5 bg-white rounded-2xl border border-amber-200 shadow-xs text-left transition-all cursor-pointer active:scale-95 hover:border-amber-400 hover:bg-amber-50 hover:shadow-md col-span-1"
                    title="Click to view store orders with item details"
                  >
                    <span className="text-[10px] font-bold text-amber-800 uppercase block">Store Orders</span>
                    <span className="text-base font-black text-amber-900 block leading-tight">
                      {performanceKPIs.deliveredStoreOrdersCount}
                      <span className="text-xs font-bold text-amber-600 ml-1">({performanceKPIs.deliveredStoreOrdersPercentage}%)</span>
                    </span>
                    <span className="text-[9px] text-amber-700 block mt-0.5">
                      GMV ৳{performanceKPIs.storeOrdersGMV}
                      {performanceKPIs.storeOrdersGMV !== performanceKPIs.storeOrdersRealGMV && (
                        <span className="text-gray-400 ml-1">• Partner ৳{performanceKPIs.storeOrdersRealGMV}</span>
                      )}
                    </span>
                    <span className="text-[9px] text-amber-600/70 block mt-0.5">Tap to view details →</span>
                  </button>

                  {/* Non-Acceptable Store Commission block */}
                  <div className="p-2.5 bg-white rounded-2xl border border-orange-200 shadow-xs text-left">
                    <span className="text-[10px] font-bold text-orange-700 uppercase block">Non-Store Comm.</span>
                    <span className="text-base font-black text-orange-900 block leading-tight">৳{earningsMetrics.nonAcceptableStoreCommission}</span>
                    <span className="text-[9px] text-orange-600/80 block mt-0.5">
                      Commission on ৳{earningsMetrics.totalStoreOrdersAmount - earningsMetrics.returnableStoreAmount} bought from non-partner stores
                    </span>
                  </div>

                  {/* Returnable / Acceptable Store Amount */}
                  <div className="p-2.5 bg-white rounded-2xl border border-purple-200 shadow-xs text-left">
                    <span className="text-[10px] font-bold text-purple-700 uppercase block">Returnable Amt.</span>
                    <span className="text-base font-black text-purple-900 block leading-tight">৳{earningsMetrics.returnableStoreAmount}</span>
                    <span className="text-[9px] text-purple-600/80 block mt-0.5">Full amount from partner/registered stores</span>
                  </div>

                  {/* Total Admin Receivable / Payable */}
                  <div className="p-2.5 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-indigo-300 shadow-xs text-left">
                    <span className="text-[10px] font-bold text-indigo-800 uppercase block">Total Payable Amount</span>
                    <span className="text-base font-black text-indigo-900 block leading-tight">৳{earningsMetrics.totalAdminReceivable}</span>
                    <span className="text-[9px] text-indigo-600/80 block mt-0.5">
                      Delivery collected + returnable + store comm.
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 px-1 pt-1">
                  <span className="font-bold">
                    Showing delivered orders for: <strong className="text-gray-900">{presetLabels[activePreset]}</strong> ({filteredDeliveredOrders.length} orders)
                  </span>
                  <span className="font-semibold text-emerald-700">
                    Total Helper Earned: ৳{earningsMetrics.totalEarned} • Total Collected: ৳{earningsMetrics.totalCollected}
                  </span>
                </div>

                {paginatedDeliveredOrders.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-2 bg-white rounded-3xl border border-gray-200">
                    <ShoppingBag className="w-10 h-10 mx-auto text-gray-300" />
                    <p className="font-bold text-gray-600">No completed earnings found in this date range.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paginatedDeliveredOrders.map((ord) => {
                      const { baseFeeForHelper, helperShare, platformShare } = getOrderFinancials(ord);
                      const delayInfo = getOrderDelayInfo(ord);
                      const hasStore = isOrderPlacedToStore(ord);
                      const itemsSummary = ord.items && ord.items.length > 0
                        ? ord.items.map((i) => `${i.name}${i.qty ? ` (${i.qty})` : ''}`).join(', ')
                        : ord.title || 'Delivery Request';

                      return (
                        <div
                          key={ord.id}
                          className={`p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                            delayInfo.isDelayed
                              ? 'bg-rose-50/70 border-rose-300 hover:border-rose-400 hover:shadow-md ring-1 ring-rose-200'
                              : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-xs'
                          }`}
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-gray-900">#{ord.id}</span>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800">
                                DELIVERED
                              </span>
                              {hasStore && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-0.5">
                                  <Store className="w-2.5 h-2.5 text-amber-700" />
                                  <span>Store Order</span>
                                </span>
                              )}
                              {delayInfo.isDelayed && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                                  <span>{delayInfo.delayLabel}</span>
                                </span>
                              )}
                              {ord.isFreeDelivery && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-700">
                                  Free Delivery Promo
                                </span>
                              )}
                              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-gray-400" />
                                <span>{formatExactDateTime(ord.deliveredAt || ord.updatedAt || ord.createdAt)}</span>
                              </span>
                            </div>

                            <p className={`font-extrabold text-xs ${delayInfo.isDelayed ? 'text-rose-950' : 'text-gray-800'}`}>
                              {itemsSummary}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              Customer: <strong className="text-gray-700">{ord.customerName}</strong> ({ord.customerPhone})
                            </p>

                            {(ord.pickupLocation?.address || ord.deliveryLocation?.address) && (
                              <div className="text-[10px] text-gray-600 space-y-0.5 pt-1">
                                {ord.pickupLocation?.address && (
                                  <div className="truncate">
                                    <span className="font-bold text-amber-700">Pickup:</span> {ord.pickupLocation.address}
                                  </div>
                                )}
                                {ord.deliveryLocation?.address && (
                                  <div className="truncate">
                                    <span className="font-bold text-emerald-700">Drop:</span> {ord.deliveryLocation.address}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right Side Financials */}
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="text-right bg-emerald-50 border border-emerald-200/80 p-2.5 rounded-xl min-w-[110px]">
                              <span className="text-[9px] font-bold text-emerald-800 uppercase block">Helper Earned</span>
                              <span className="text-base font-black text-emerald-700 block">+৳{helperShare}</span>
                              <div className="text-[9px] text-gray-500 font-semibold border-t border-emerald-200/60 mt-1 pt-0.5">
                                <span>Charge: ৳{baseFeeForHelper}</span>
                                <span className="block text-purple-900">Platform: ৳{platformShare}</span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedOrderId(ord.id)}
                              className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 font-extrabold text-[10px] transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <span>Order Details</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredDeliveredOrders.length > earningsPageSize && (
                  <PaginationControl
                    currentPage={earningsPage}
                    totalPages={totalEarningsPages}
                    totalItems={filteredDeliveredOrders.length}
                    pageSize={earningsPageSize}
                    onPageChange={(p) => setEarningsPage(p)}
                    onPageSizeChange={() => {}}
                  />
                )}
              </div>
            )}

            {/* TAB 3: ALL ASSIGNED JOBS */}
            {activeTab === 'JOBS' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap bg-white p-2.5 rounded-2xl border border-gray-200">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search order ID, title, customer..."
                      value={orderSearchQuery}
                      onChange={(e) => {
                        setOrderSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-8 pr-3 py-1.5 bg-gray-50 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 outline-none"
                    />
                  </div>

                  <select
                    value={orderStatusFilter}
                    onChange={(e) => {
                      setOrderStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="STORE_ORDERS">🏪 Store Orders ({performanceKPIs.storeOrdersCount})</option>
                    <option value="NON_STORE">Direct / Non-Store Orders</option>
                    <option value="DELAYED">🚨 Delayed Orders Only</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="PURCHASED_EXECUTED">Processing</option>
                    <option value="ON_THE_WAY">On The Way</option>
                    <option value="ARRIVED">Arrived</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="CANCELED">Canceled</option>
                  </select>
                </div>

                {paginatedJobs.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 bg-white rounded-3xl border border-gray-200">
                    <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="font-bold">No orders found matching the filter.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paginatedJobs.map((ord) => {
                      const delayInfo = getOrderDelayInfo(ord);
                      const hasStore = isOrderPlacedToStore(ord);
                      return (
                        <div
                          key={ord.id}
                          onClick={() => setSelectedOrderId(ord.id)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            delayInfo.isDelayed
                              ? 'bg-rose-50/80 border-rose-300 hover:border-rose-400 hover:shadow-md ring-1 ring-rose-200'
                              : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-soft'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2 flex-wrap">
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
                              {hasStore && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-0.5">
                                  <Store className="w-2.5 h-2.5 text-amber-700" />
                                  <span>Store Order</span>
                                </span>
                              )}
                              {delayInfo.isDelayed && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                                  <span>{delayInfo.delayLabel}</span>
                                </span>
                              )}
                              <span className="text-[10px] text-gray-400">
                                {formatExactDateTime(ord.createdAt)}
                              </span>
                            </div>
                            <p className={`font-extrabold ${delayInfo.isDelayed ? 'text-rose-950' : 'text-gray-800'}`}>
                              {ord.title || ord.items?.[0]?.name || 'Order'}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              Customer: {ord.customerName} • Fee: ৳{ord.deliveryFee}
                            </p>
                          </div>

                          <div className="flex items-center space-x-2 text-purple-900 font-extrabold">
                            <span>Details</span>
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {tabJobsFiltered.length > pageSize && (
                  <PaginationControl
                    currentPage={currentPage}
                    totalPages={totalJobsPages}
                    totalItems={tabJobsFiltered.length}
                    pageSize={pageSize}
                    onPageChange={(p) => setCurrentPage(p)}
                    onPageSizeChange={(s) => {
                      setPageSize(s);
                      setCurrentPage(1);
                    }}
                  />
                )}
              </div>
            )}

            {/* TAB 4: REVIEWS & RATINGS */}
            {activeTab === 'REVIEWS' && (
              <div className="space-y-3">
                <div className="p-3 bg-white rounded-2xl border border-gray-200 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h4 className="font-extrabold text-xs text-gray-800 uppercase tracking-wider">
                      Reviews & Quality Ratings ({tabReviewsFiltered.length})
                    </h4>
                    <span className="text-[11px] text-gray-500">
                      Filtered for: <strong className="text-gray-900">{presetLabels[activePreset]}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(['ALL', 'NEGATIVE', 'POSITIVE'] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setFeedbackFilter(filter)}
                        className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                          feedbackFilter === filter
                            ? 'bg-purple-900 text-white shadow-xs'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {filter === 'ALL' ? `All (${dateFilteredFeedbacks.length})` : filter === 'NEGATIVE' ? `⚠️ Negative (${performanceKPIs.negativeCount})` : `⭐ Positive (${performanceKPIs.positiveCount})`}
                      </button>
                    ))}
                  </div>
                </div>

                {tabReviewsFiltered.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 bg-white rounded-3xl border border-gray-200">
                    <Star className="w-10 h-10 mx-auto mb-2 opacity-40 text-amber-400" />
                    <p className="font-bold">No reviews matching the criteria.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {tabReviewsFiltered.map((fb) => {
                      const isNeg = isFeedbackNegative(fb);
                      return (
                        <div
                          key={fb.id}
                          className={`p-4 rounded-2xl border shadow-xs transition-all ${
                            isNeg
                              ? 'bg-rose-50/70 border-rose-200'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-gray-900 text-sm">
                                {fb.customerName || 'Customer'}
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                isNeg
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}>
                                {isNeg ? '⚠️ Negative Review' : '⭐ Positive Review'}
                              </span>
                              <span className="text-[10px] font-bold text-gray-500">
                                Order #{fb.orderId}
                              </span>
                            </div>

                            <span className="text-[10px] text-gray-400 font-semibold">
                              {formatExactDateTime(fb.createdAt)}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 mt-2 text-xs">
                            <span className="font-bold text-amber-600 flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              <span>Rider Rating: <strong>{fb.riderRating || '—'} / 5</strong></span>
                            </span>
                            {fb.serviceRating > 0 && (
                              <span className="text-gray-600 font-semibold">
                                Service: <strong>{fb.serviceRating} / 5</strong>
                              </span>
                            )}
                            {fb.shopRating > 0 && (
                              <span className="text-gray-600 font-semibold">
                                Shop: <strong>{fb.shopRating} / 5</strong>
                              </span>
                            )}
                          </div>

                          {fb.improvementComment && (
                            <div className="mt-2.5 p-3 rounded-xl bg-white border border-gray-200/80">
                              <span className="text-[10px] font-bold text-gray-400 uppercase block">
                                Customer Comment:
                              </span>
                              <p className="text-xs text-gray-800 font-medium italic mt-0.5">
                                "{fb.improvementComment}"
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: PAYBACKS & TRANSACTIONS */}
            {activeTab === 'PAYBACKS' && (
              <div className="space-y-4">
                <div className="p-4 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 border border-amber-200/80 rounded-2xl flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-amber-800 tracking-wider block">Commission Balance & Payment</span>
                    <p className="text-xs text-gray-800 font-bold mt-0.5">
                      Current Outstanding Due: <strong className="text-amber-700 text-sm font-black">৳{wallet.balance || 0}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPayAmount(String(wallet.balance > 0 ? wallet.balance : ''));
                      setShowRecordPaymentModal(true);
                    }}
                    className="py-2 px-4 rounded-xl bg-purple-900 hover:bg-purple-950 active:scale-95 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-purple-200" />
                    <span>Record Payment / Reduce Due</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
                    Commission Payback Requests ({filteredWithdrawals.length})
                  </h4>
                  {filteredWithdrawals.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 bg-white rounded-2xl border border-gray-200">
                      <p className="font-bold">No commission payback requests recorded in this period.</p>
                    </div>
                  ) : (
                    filteredWithdrawals.map((w) => (
                      <div
                        key={w.id}
                        className="p-3.5 rounded-2xl bg-white border border-gray-200 flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-gray-900">৳{w.amount}</span>
                            <span className="text-[11px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                              {w.paymentMethod}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Account/Tx: <strong className="text-gray-700">{w.accountNumber || 'N/A'}</strong>
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {formatExactDateTime(w.createdAt)}
                          </p>
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
                    ))
                  )}
                </div>

                {/* Immutable Wallet Transactions */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
                    Raw Wallet Ledger ({walletTxs.length})
                  </h4>
                  {walletTxs.length === 0 ? (
                    <div className="p-4 text-center text-gray-400 bg-white rounded-2xl border border-gray-200">
                      <p className="font-bold">No raw ledger transactions.</p>
                    </div>
                  ) : (
                    walletTxs.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 rounded-2xl bg-white border border-gray-200 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-extrabold text-gray-900">{tx.description}</p>
                          <p className="text-[10px] text-gray-400">
                            {formatExactDateTime(tx.createdAt)}
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
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end shrink-0">
            <button
              onClick={onClose}
              className="py-2.5 px-5 rounded-2xl bg-rose-50 hover:bg-rose-100 font-extrabold text-xs text-rose-600 border border-rose-200 active:scale-95 transition-colors cursor-pointer"
            >
              Close History & Analytics
            </button>
          </div>
        </div>
      </div>

      {/* Record Commission Payment / Reduce Due Modal */}
      {showRecordPaymentModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-gray-100">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-indigo-950 via-purple-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-white/10 border border-white/20">
                  <Receipt className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base">Record Commission Payment</h3>
                  <p className="text-[11px] text-indigo-200">Reduce commission due amount</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRecordPaymentModal(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleRecordPayment} className="p-5 space-y-4 text-xs">
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-amber-800 block">Helper Name</span>
                  <span className="text-xs font-black text-gray-900">{application?.legalName || helperName}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-extrabold uppercase text-amber-800 block">Current Due</span>
                  <span className="text-base font-black text-amber-700">৳{wallet.balance || 0}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Payment Amount (৳) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="e.g. 100"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 outline-none focus:border-purple-600 focus:bg-white transition-all"
                />

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {wallet.balance > 0 && (
                    <button
                      type="button"
                      onClick={() => setPayAmount(String(wallet.balance))}
                      className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 font-extrabold text-[10px] transition-colors"
                    >
                      Full Due (৳{wallet.balance})
                    </button>
                  )}
                  {[50, 100, 200, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPayAmount(String(preset))}
                      className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-[10px] transition-colors"
                    >
                      +৳{preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:border-purple-600 focus:bg-white transition-all"
                >
                  <option value="Cash">Cash (ক্যাশ গ্রহণ)</option>
                  <option value="bKash">bKash (বিকাশ)</option>
                  <option value="Nagad">Nagad (নগদ)</option>
                  <option value="Rocket">Rocket (রকেট)</option>
                  <option value="Bank Transfer">Bank Transfer (ব্যাংক)</option>
                  <option value="Adjustment">Adjustment / Waiver (সমন্বয়)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Note / Trx ID / Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. TrxID #8X73... or Received at office counter"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 outline-none focus:border-purple-600 focus:bg-white transition-all"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRecordPaymentModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayback}
                  className="px-5 py-2.5 rounded-xl bg-purple-900 hover:bg-purple-950 disabled:opacity-50 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  {isSubmittingPayback ? (
                    <span>Recording...</span>
                  ) : (
                    <>
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Confirm & Record</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Store Orders Detail Panel */}
      {showStoreOrdersPanel && (
        <div className="fixed inset-0 z-[9999] flex justify-end" style={{ background: 'rgba(0,0,0,0.45)' }}>
          {/* Backdrop */}
          <div className="absolute inset-0" onClick={() => setShowStoreOrdersPanel(false)} />
          {/* Panel */}
          <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden animate-[slideInRight_0.25s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 shrink-0">
              <div>
                <h2 className="font-black text-amber-900 text-base flex items-center gap-2">
                  <Store className="w-4 h-4 text-amber-600" />
                  Store Orders
                </h2>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  {filteredDeliveredOrders.filter(isOrderPlacedToStore).length} store orders • Total ৳{performanceKPIs.storeOrdersGMV}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStoreOrdersPanel(false)}
                className="p-1.5 rounded-xl hover:bg-amber-100 text-amber-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Orders list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredDeliveredOrders.filter(isOrderPlacedToStore).length === 0 ? (
                <div className="py-16 text-center text-gray-400 space-y-2">
                  <Store className="w-10 h-10 mx-auto text-gray-300" />
                  <p className="font-bold text-gray-500">No store orders in this period.</p>
                </div>
              ) : (
                filteredDeliveredOrders.filter(isOrderPlacedToStore).map((ord) => {
                  const shopOrders = fallbackStore.getShopOrdersForOrder(ord.id).filter((so) => so.status !== 'CANCELED');
                  const orderTotal = shopOrders.length > 0
                    ? shopOrders.reduce((s, so) => s + (so.price || 0), 0)
                    : (ord.productCost || 0);
                  const itemsSummary = ord.items && ord.items.length > 0
                    ? ord.items.map((i) => `${i.name}${i.qty ? ` (${i.qty})` : ''}`).join(', ')
                    : ord.title || 'Store Request';

                  return (
                    <div key={ord.id} className="bg-white border border-amber-200 rounded-2xl overflow-hidden shadow-xs">
                      {/* Order header */}
                      <div className="flex items-center justify-between px-3.5 py-2.5 bg-amber-50 border-b border-amber-100">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-amber-900 text-xs">#{ord.id}</span>
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">DELIVERED</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-amber-900">৳{orderTotal}</span>
                          <button
                            type="button"
                            onClick={() => { setShowStoreOrdersPanel(false); setSelectedOrderId(ord.id); }}
                            className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 font-extrabold text-[9px] transition-colors cursor-pointer"
                          >
                            Details <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Order meta */}
                      <div className="px-3.5 pt-2.5 pb-1">
                        <p className="text-xs font-extrabold text-gray-800 line-clamp-1">{itemsSummary}</p>
                        <p className="text-[10px] text-gray-500">
                          Customer: <strong className="text-gray-700">{ord.customerName}</strong>
                          {ord.customerPhone ? ` · ${ord.customerPhone}` : ''}
                        </p>
                      </div>

                      {/* Shop orders with items */}
                      {shopOrders.length > 0 ? (
                        <div className="px-3.5 pb-3 space-y-2 pt-1">
                          {shopOrders.map((so) => {
                            const items = so.itemsWithPrice || [];
                            const soTotal = so.price || 0;
                            return (
                              <div key={so.id} className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                                {/* Shop name row */}
                                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200">
                                  <span className="text-[10px] font-black text-gray-700 flex items-center gap-1">
                                    <Store className="w-2.5 h-2.5 text-amber-600" />
                                    {so.shopName}
                                  </span>
                                  <span className="text-[10px] font-black text-amber-800">৳{soTotal}</span>
                                </div>
                                {/* Items */}
                                {items.length > 0 ? (
                                  <div className="divide-y divide-gray-100">
                                    {items.map((item, idx) => (
                                      <div key={idx} className="flex items-center justify-between px-3 py-1.5">
                                        <span className="text-[10px] font-semibold text-gray-700">
                                          {item.name}{item.unit ? <span className="text-gray-400 font-normal ml-1">({item.unit})</span> : null}
                                        </span>
                                        <span className="text-[10px] font-black text-gray-900">
                                          {item.price != null ? `৳${item.price}` : <span className="text-gray-400">—</span>}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="px-3 py-2">
                                    <p className="text-[10px] text-gray-400 italic">{so.requestText || 'No item details'}</p>
                                  </div>
                                )}
                                {/* Store note */}
                                {so.note && (
                                  <div className="px-3 py-1.5 bg-blue-50 border-t border-blue-100">
                                    <p className="text-[9px] text-blue-700"><span className="font-bold">Note:</span> {so.note}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="px-3.5 pb-3 pt-1">
                          <p className="text-[10px] text-gray-400 italic">৳{ord.productCost || 0} (estimated product cost)</p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

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
