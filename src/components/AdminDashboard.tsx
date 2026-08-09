'use client';

import React, { useEffect, useState } from 'react';
import { Order, HelperApplication, WithdrawalRequest, PricingSettings, UserProfile } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from './CustomModal';
import {
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Users,
  ShoppingBag,
  DollarSign,
  Settings,
  Check,
  X,
  Layers,
  ArrowUpRight,
  Sparkles,
  Bike,
  Clock,
  MapPin,
  RefreshCw,
  Search,
  ArrowUpDown,
  Filter,
  User,
  ChevronRight,
  UserCheck,
  Phone,
  Ban,
  Tag,
  Trash2,
  TrendingUp,
  BarChart2,
  Bell,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PaginationControl } from './admin/PaginationControl';
import { AdminOrderDetailsModal } from './admin/AdminOrderDetailsModal';
import { AssignHelperModal } from './admin/AssignHelperModal';
import { CustomerHistoryModal } from './admin/CustomerHistoryModal';
import { HelperHistoryModal } from './admin/HelperHistoryModal';
import { UserDetailsModal } from './admin/UserDetailsModal';
import { RevenueAnalytics } from './admin/RevenueAnalytics';
import { AdminPushNotificationModal } from './admin/AdminPushNotificationModal';

export const AdminDashboard: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [activeTab, setActiveTab] = useState<
    'EXCEPTIONS' | 'ORDERS' | 'USERS_LIST' | 'REVENUE' | 'CUSTOMERS' | 'HELPERS' | 'APPLICATIONS' | 'WITHDRAWALS' | 'PRICING'
  >('EXCEPTIONS');

  // Realtime Data state
  const [orders, setOrders] = useState<Order[]>([]);
  const [applications, setApplications] = useState<HelperApplication[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [pricing, setPricing] = useState<PricingSettings>(fallbackStore.pricingSettings);
  const [placeholdersText, setPlaceholdersText] = useState<string>('');
  const [confirmationMsg, setConfirmationMsg] = useState<string>('');
  const [servicesText, setServicesText] = useState<string>('');

  // Modals state
  const [showPushNotificationModal, setShowPushNotificationModal] = useState<boolean>(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [assignHelperOrder, setAssignHelperOrder] = useState<Order | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; phone?: string } | null>(null);
  const [selectedHelper, setSelectedHelper] = useState<{ id: string; name: string } | null>(null);


  // Search, Filter & Pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'NEWEST' | 'OLDEST' | 'FEE_HIGH' | 'FEE_LOW' | 'ORDERS_HIGH' | 'SPENT_HIGH'>('NEWEST');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset page number on tab / search / filter / sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, statusFilter, withdrawalStatusFilter, sortBy]);

  useEffect(() => {
    const syncAdminData = () => {
      setOrders(Array.from(fallbackStore.orders.values()));
      setApplications(Array.from(fallbackStore.helperApplications.values()));
      setWithdrawals(Array.from(fallbackStore.withdrawals.values()));
      setUsers(Array.from(fallbackStore.users.values()));
      const settings = { ...fallbackStore.pricingSettings };
      setPricing(settings);
      setPlaceholdersText((settings.inputPlaceholders || []).join('\n'));
      setConfirmationMsg(settings.orderConfirmationMessage || '');
      setServicesText((settings.services || []).join('\n'));
    };

    syncAdminData();
    const unsub = fallbackStore.subscribe(syncAdminData);
    return () => {
      unsub();
    };
  }, []);

  // Needs Attention Queue calculations
  const cancellingRequests = orders.filter(
    (o) =>
      (o.cancellationRequest && o.cancellationRequest.status === 'PENDING') ||
      (o.status === 'CANCELED' && new Date().getTime() - new Date(o.cancelledAt || o.updatedAt).getTime() < 86400000)
  );

  const notAcceptedRequests = orders.filter((o) => o.status === 'PENDING');
  const feeAdjustmentsPending = orders.filter(
    (o) => o.feeAdjustment && o.feeAdjustment.status === 'PENDING'
  );
  const pendingApps = applications.filter((a) => a.status === 'PENDING');
  const pendingWds = withdrawals.filter((w) => w.status === 'PENDING');

  const totalExceptionsCount =
    cancellingRequests.filter(o => o.cancellationRequest?.status === 'PENDING').length +
    notAcceptedRequests.length +
    feeAdjustmentsPending.length +
    pendingApps.length +
    pendingWds.length;

  const totalPendingPayoutAmount = pendingWds.reduce((sum, w) => sum + w.amount, 0);
  const approvedHelpersCount = applications.filter((a) => a.status === 'APPROVED').length;

  const handleApproveApp = (appId: string) => {
    fallbackStore.approveHelperApp(appId);
    showAlert('হেলপার অনুমোদিত', 'হেলপার আবেদন সফলভাবে অনুমোদন করা হয়েছে।', 'success');
  };

  const handleApproveWd = (wdId: string) => {
    fallbackStore.approveWithdrawal(wdId);
    showAlert('উইথড্রয়াল অনুমোদিত', 'পেমেন্ট পেআউট অনুমোদন সফল হয়েছে।', 'success');
  };

  const handleRejectWd = (wdId: string) => {
    fallbackStore.rejectWithdrawal(wdId);
    showAlert('উইথড্রয়াল বাতিল', 'উইথড্রয়াল আবেদন বাতিল করা হয়েছে।', 'info');
  };

  const handleApproveCancellation = (orderId: string) => {
    const order = fallbackStore.orders.get(orderId);
    if (!order) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      status: 'CANCELED',
      cancelledAt: new Date().toISOString(),
      cancellationRequest: o.cancellationRequest
        ? { ...o.cancellationRequest, status: 'APPROVED' }
        : undefined,
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: 'CANCELED',
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: 'Cancellation approved by Admin',
        },
      ],
    }));
    showAlert('ক্যানসেলেশন মঞ্জুর', 'অর্ডার ক্যানসেলেশন মনঞ্জুর করা হয়েছে।', 'info');
  };

  const handleRejectCancellation = (orderId: string) => {
    const order = fallbackStore.orders.get(orderId);
    if (!order) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      cancellationRequest: o.cancellationRequest
        ? { ...o.cancellationRequest, status: 'REJECTED' }
        : undefined,
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: 'Cancellation request rejected by Admin',
        },
      ],
    }));
    showAlert('রিকোয়েস্ট অগ্রাহ্য', 'ক্যানসেলেশন রিকোয়েস্ট রিজেক্ট করা হয়েছে।', 'info');
  };

  const handleApproveFeeAdjustment = (orderId: string) => {
    const order = fallbackStore.orders.get(orderId);
    if (!order || !order.feeAdjustment) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      deliveryFee: o.feeAdjustment!.amount,
      feeAdjustment: { ...o.feeAdjustment!, status: 'APPROVED' },
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: `Approved fee adjustment to ৳${o.feeAdjustment!.amount}`,
        },
      ],
    }));
    showAlert('ফি সমন্বয় অনুমোদিত', 'ডেলিভারি ফি আপডেট করা হয়েছে।', 'success');
  };

  const handleRejectFeeAdjustment = (orderId: string) => {
    const order = fallbackStore.orders.get(orderId);
    if (!order || !order.feeAdjustment) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      feeAdjustment: { ...o.feeAdjustment!, status: 'REJECTED' },
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: 'Rejected fee adjustment',
        },
      ],
    }));
    showAlert('ফি সমন্বয় বাতিল', 'ডেলিভারি ফি সমন্বয় বাতিল করা হয়েছে।', 'info');
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedList = placeholdersText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const parsedServices = servicesText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const updatedPricing: PricingSettings = {
      ...pricing,
      inputPlaceholders: parsedList.length > 0 ? parsedList : undefined,
      orderConfirmationMessage: confirmationMsg.trim() || undefined,
      services: parsedServices.length > 0 ? parsedServices : undefined,
    };

    await fallbackStore.savePricingSettings(updatedPricing);
    await showAlert('সেটিংস আপডেট', 'পিকআপ/ডেলিভারি, কমিশন এবং ইনপুট প্লেসহোল্ডার সেটিংস সফলভাবে আপডেট হয়েছে।', 'success');
  };

  const handleToggleAdminRole = async (targetUser: UserProfile, makeAdmin: boolean) => {
    if (!currentUser?.isSuperAdmin) {
      showAlert('অনুমতি নেই', 'শুধুমাত্র Super Admin অন্য ব্যবহারকারীদের অ্যাডমিন বানাতে বা সরাতে পারবেন।', 'error');
      return;
    }
    const actionText = makeAdmin ? 'অ্যাডমিন করার অনুমতি দিতে' : 'অ্যাডমিন স্ট্যাটাস অপসারণ করতে';
    const confirmed = await showConfirm(
      'অ্যাডমিন রোল নিশ্চিতকরণ',
      `আপনি কি ${targetUser.displayName}-কে ${actionText} চান?`,
      makeAdmin ? 'হ্যাঁ, অ্যাডমিন করুন' : 'হ্যাঁ, রোল সরান',
      'বাতিল'
    );
    if (!confirmed) return;

    await fallbackStore.setAdminRole(targetUser.uid, makeAdmin);
    setUsers(Array.from(fallbackStore.users.values()));
    showAlert(
      'রোল আপডেট সম্পন্ন',
      `${targetUser.displayName} ${makeAdmin ? 'এখন একজন Admin।' : 'এর Admin রোল সরানো হয়েছে।'}`,
      'success'
    );
  };

  // --- Filtering & Sorting Helper Functions ---

  // 1. Process Orders List (Search, Filter by Status, Sort by Newest default)
  const getProcessedOrders = (rawOrders: Order[]) => {
    let list = [...rawOrders];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          (o.title || '').toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          (o.customerPhone && o.customerPhone.includes(q)) ||
          (o.helperName && o.helperName.toLowerCase().includes(q)) ||
          (o.deliveryLocation.address && o.deliveryLocation.address.toLowerCase().includes(q)) ||
          o.items.some((it) => it.name.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'UNASSIGNED') {
        list = list.filter((o) => !o.helperId && o.status !== 'CANCELED' && o.status !== 'DELIVERED');
      } else {
        list = list.filter((o) => o.status === statusFilter);
      }
    }

    // Sorting (Default Latest First)
    list.sort((a, b) => {
      if (sortBy === 'OLDEST') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'FEE_HIGH') {
        return b.deliveryFee - a.deliveryFee;
      }
      if (sortBy === 'FEE_LOW') {
        return a.deliveryFee - b.deliveryFee;
      }
      // NEWEST default
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  };

  // 2. Customer Aggregated List
  const getProcessedCustomers = () => {
    const customerMap = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        email?: string;
        createdAt: string;
        totalOrders: number;
        completedOrders: number;
        canceledOrders: number;
        activeOrders: number;
        totalSpent: number;
      }
    >();

    // Seed from users list
    users.forEach((u) => {
      customerMap.set(u.uid, {
        id: u.uid,
        name: u.displayName || 'Anonymous User',
        phone: u.alternativePhone || 'N/A',
        email: u.email,
        createdAt: u.createdAt || new Date().toISOString(),
        totalOrders: 0,
        completedOrders: 0,
        canceledOrders: 0,
        activeOrders: 0,
        totalSpent: 0,
      });
    });

    // Aggregate from orders
    orders.forEach((o) => {
      const existing = customerMap.get(o.customerId) || {
        id: o.customerId,
        name: o.customerName || 'Customer',
        phone: o.customerPhone || 'N/A',
        createdAt: o.createdAt,
        totalOrders: 0,
        completedOrders: 0,
        canceledOrders: 0,
        activeOrders: 0,
        totalSpent: 0,
      };

      existing.totalOrders += 1;
      if (o.status === 'DELIVERED') {
        existing.completedOrders += 1;
        existing.totalSpent += (o.productCost || 0) + o.deliveryFee;
      } else if (o.status === 'CANCELED') {
        existing.canceledOrders += 1;
      } else {
        existing.activeOrders += 1;
      }

      customerMap.set(o.customerId, existing);
    });

    let list = Array.from(customerMap.values());

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q))
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'ORDERS_HIGH') return b.totalOrders - a.totalOrders;
      if (sortBy === 'SPENT_HIGH') return b.totalSpent - a.totalSpent;
      if (sortBy === 'OLDEST') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  };

  // 3. Helper Aggregated List
  const getProcessedHelpers = () => {
    const helperMap = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        email?: string;
        nid?: string;
        status: string;
        completedJobs: number;
        activeOrders: number;
        totalEarned: number;
        balance: number;
        totalWithdrawn: number;
        createdAt: string;
      }
    >();

    // Seed from helper applications & wallets
    applications.forEach((app) => {
      const w = fallbackStore.wallets.get(app.userId);
      helperMap.set(app.userId, {
        id: app.userId,
        name: app.legalName || app.userName,
        phone: app.email,
        nid: app.nid,
        status: app.status,
        completedJobs: 0,
        activeOrders: 0,
        totalEarned: w?.totalEarned || 0,
        balance: w?.balance || 0,
        totalWithdrawn: w?.totalWithdrawn || 0,
        createdAt: app.createdAt,
      });
    });

    // Aggregate from orders
    orders.forEach((o) => {
      if (!o.helperId) return;
      const existing = helperMap.get(o.helperId) || {
        id: o.helperId,
        name: o.helperName || 'Helper',
        phone: 'N/A',
        status: 'APPROVED',
        completedJobs: 0,
        activeOrders: 0,
        totalEarned: 0,
        balance: 0,
        totalWithdrawn: 0,
        createdAt: o.createdAt,
      };

      if (o.status === 'DELIVERED') {
        existing.completedJobs += 1;
      } else if (o.status !== 'CANCELED') {
        existing.activeOrders += 1;
      }

      helperMap.set(o.helperId, existing);
    });

    let list = Array.from(helperMap.values());

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.phone.includes(q) ||
          (h.nid && h.nid.includes(q)) ||
          h.id.toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'ORDERS_HIGH') return b.completedJobs - a.completedJobs;
      if (sortBy === 'SPENT_HIGH') return b.totalEarned - a.totalEarned;
      if (sortBy === 'OLDEST') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  };

  // 4. Unified Users List with Live Running States
  const getProcessedUsersList = () => {
    let list = users.map((u) => {
      const activeReq = orders.find(
        (o) => (o.customerId === u.uid || (u.alternativePhone && o.customerPhone === u.alternativePhone)) &&
          o.status !== 'DELIVERED' &&
          o.status !== 'CANCELED'
      );
      const activeDel = orders.find(
        (o) => o.helperId === u.uid && o.status !== 'DELIVERED' && o.status !== 'CANCELED'
      );

      const customerOrdersCount = orders.filter((o) => o.customerId === u.uid).length;
      const helperOrdersCount = orders.filter((o) => o.helperId === u.uid).length;

      return {
        user: u,
        activeReq,
        activeDel,
        totalOrdersCount: customerOrdersCount + helperOrdersCount,
      };
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.user.displayName.toLowerCase().includes(q) ||
          item.user.email.toLowerCase().includes(q) ||
          (item.user.alternativePhone && item.user.alternativePhone.includes(q)) ||
          item.user.uid.toLowerCase().includes(q) ||
          (item.user.labels && item.user.labels.some((lbl) => lbl.toLowerCase().includes(q)))
      );
    }

    if (statusFilter !== 'ALL') {
      if (statusFilter === 'CUSTOMER') {
        list = list.filter((item) => item.user.role === 'customer' || !item.user.isHelper);
      } else if (statusFilter === 'HELPER') {
        list = list.filter((item) => item.user.isHelper || item.user.role === 'helper');
      } else if (statusFilter === 'ADMIN') {
        list = list.filter((item) => item.user.isAdmin || item.user.role === 'admin');
      } else if (statusFilter === 'BLOCKED') {
        list = list.filter((item) => item.user.isBlocked);
      } else if (statusFilter === 'LABELED') {
        list = list.filter((item) => item.user.labels && item.user.labels.length > 0);
      }
    }

    list.sort((a, b) => {
      if (sortBy === 'OLDEST') return new Date(a.user.createdAt).getTime() - new Date(b.user.createdAt).getTime();
      if (sortBy === 'ORDERS_HIGH') return b.totalOrdersCount - a.totalOrdersCount;
      return new Date(b.user.createdAt).getTime() - new Date(a.user.createdAt).getTime();
    });

    return list;
  };

  // Generic Pagination Calculator
  const paginateList = <T,>(items: T[]) => {
    const totalPages = Math.ceil(items.length / pageSize) || 1;
    const paginatedItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    return { totalPages, paginatedItems, totalItems: items.length };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-purple-950 via-indigo-950 to-purple-900 rounded-3xl p-6 text-white shadow-xl shadow-purple-950/10 border border-purple-800/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <div className="p-2.5 rounded-2xl bg-purple-500/20 border border-purple-400/30 backdrop-blur-md">
                <ShieldCheck className="w-6 h-6 text-purple-300" />
              </div>
              <div>
                <h1 className="font-extrabold text-xl md:text-2xl tracking-tight text-white font-sans">
                  Jamanot Admin Dashboard
                </h1>
                <p className="text-xs md:text-sm text-purple-200 font-medium">
                  Real-time operations, scalable pagination, helper assignment & analytics control.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowPushNotificationModal(true)}
              className="text-xs font-extrabold px-4 py-2 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white flex items-center space-x-2 shadow-lg shadow-purple-950/40 transition-all border border-purple-400/30 active:scale-95"
            >
              <Bell className="w-4 h-4 text-purple-200" />
              <span>Send Push Notification</span>
            </button>

            <span className="text-xs font-extrabold px-3.5 py-2 rounded-2xl bg-amber-400 text-purple-950 flex items-center space-x-1.5 shadow-md">
              <AlertCircle className="w-4 h-4" />
              <span>Needs Attention: {totalExceptionsCount}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Needs Attention Metric */}
        <div
          onClick={() => setActiveTab('EXCEPTIONS')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer ${
            totalExceptionsCount > 0
              ? 'bg-red-50/80 border-red-200 hover:border-red-400 shadow-soft'
              : 'bg-white border-gray-100 hover:border-gray-300 shadow-soft'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Needs Attention
            </span>
            <div className={`p-2 rounded-2xl ${totalExceptionsCount > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">{totalExceptionsCount}</span>
            <span className="text-xs text-gray-500">pending action</span>
          </div>
        </div>

        {/* Total Orders Metric */}
        <div
          onClick={() => setActiveTab('ORDERS')}
          className="p-5 rounded-3xl bg-white border border-gray-100 hover:border-emerald-300 shadow-soft transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Total Orders
            </span>
            <div className="p-2 rounded-2xl bg-emerald-100 text-emerald-700">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">{orders.length}</span>
            <span className="text-xs text-gray-500">total in system</span>
          </div>
        </div>

        {/* Customer Accounts Metric */}
        <div
          onClick={() => setActiveTab('USERS_LIST')}
          className="p-5 rounded-3xl bg-white border border-gray-100 hover:border-purple-300 shadow-soft transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Customer Accounts
            </span>
            <div className="p-2 rounded-2xl bg-purple-100 text-purple-700">
              <User className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">{users.length}</span>
            <span className="text-xs text-purple-700 font-semibold">registered users</span>
          </div>
        </div>

        {/* Active Helpers Metric */}
        <div
          onClick={() => setActiveTab('APPLICATIONS')}
          className="p-5 rounded-3xl bg-white border border-gray-100 hover:border-indigo-300 shadow-soft transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Active Helpers
            </span>
            <div className="p-2 rounded-2xl bg-indigo-100 text-indigo-700">
              <Bike className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">{approvedHelpersCount}</span>
            <span className="text-xs text-amber-600 font-semibold">({pendingApps.length} pending app)</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center space-x-2 bg-gray-100/80 p-1.5 rounded-2xl overflow-x-auto no-scrollbar border border-gray-200/60 text-xs font-extrabold">
        <button
          onClick={() => setActiveTab('EXCEPTIONS')}
          className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 ${
            activeTab === 'EXCEPTIONS'
              ? 'bg-white text-purple-950 shadow-md border border-gray-200/80'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <span>Needs Attention</span>
          {totalExceptionsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px]">
              {totalExceptionsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('ORDERS')}
          className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 ${
            activeTab === 'ORDERS'
              ? 'bg-white text-purple-950 shadow-md border border-gray-200/80'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4 text-emerald-600" />
          <span>All Orders ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('USERS_LIST')}
          className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 ${
            activeTab === 'USERS_LIST'
              ? 'bg-white text-purple-950 shadow-md border border-gray-200/80'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Users className="w-4 h-4 text-purple-600" />
          <span>User Lists ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('REVENUE')}
          className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 ${
            activeTab === 'REVENUE'
              ? 'bg-white text-purple-950 shadow-md border border-gray-200/80'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>Revenue Analytics</span>
        </button>

        <button
          onClick={() => setActiveTab('APPLICATIONS')}
          className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 ${
            activeTab === 'APPLICATIONS'
              ? 'bg-white text-purple-950 shadow-md border border-gray-200/80'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Users className="w-4 h-4 text-indigo-600" />
          <span>Applications ({pendingApps.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('WITHDRAWALS')}
          className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 ${
            activeTab === 'WITHDRAWALS'
              ? 'bg-white text-purple-950 shadow-md border border-gray-200/80'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <DollarSign className="w-4 h-4 text-purple-600" />
          <span>Withdrawals ({pendingWds.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('PRICING')}
          className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 ${
            activeTab === 'PRICING'
              ? 'bg-white text-purple-950 shadow-md border border-gray-200/80'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Settings className="w-4 h-4 text-gray-600" />
          <span>Pricing & Settings</span>
        </button>
      </div>

      {/* Global Search & Sorting Bar (Visible on list tabs) */}
      {activeTab !== 'PRICING' && (
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-soft flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search Box */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search by Order ID, customer, helper, phone, address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Status Filter (for Orders / Exceptions) */}
            {(activeTab === 'ORDERS' || activeTab === 'EXCEPTIONS') && (
              <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-600">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:border-purple-600"
                >
                  <option value="ALL">All Statuses</option>
                  {activeTab === 'ORDERS' && <option value="UNASSIGNED">Unassigned Orders</option>}
                  <option value="PENDING">Pending (Not Accepted)</option>
                  <option value="ACCEPTED">Accepted</option>
                  <option value="PURCHASED_EXECUTED">Purchased / Executed</option>
                  <option value="ON_THE_WAY">On The Way</option>
                  <option value="ARRIVED">Arrived</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="CANCELED">Canceled</option>
                </select>
              </div>
            )}

            {activeTab === 'USERS_LIST' && (
              <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-600">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:border-purple-600"
                >
                  <option value="ALL">All Users</option>
                  <option value="CUSTOMER">Customers Only</option>
                  <option value="HELPER">Helpers Only</option>
                  <option value="ADMIN">Admins Only</option>
                  <option value="BLOCKED">Blocked Users</option>
                  <option value="LABELED">Labeled Users</option>
                </select>
              </div>
            )}

            {activeTab === 'WITHDRAWALS' && (
              <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-600">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={withdrawalStatusFilter}
                  onChange={(e) => setWithdrawalStatusFilter(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:border-purple-600"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending Payouts</option>
                  <option value="APPROVED">Approved Payouts</option>
                  <option value="REJECTED">Rejected Payouts</option>
                </select>
              </div>
            )}

            {/* Sorting Selector (Default: NEWEST) */}
            <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-600">
              <ArrowUpDown className="w-4 h-4 text-gray-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:border-purple-600"
              >
                <option value="NEWEST">Latest First (Default)</option>
                <option value="OLDEST">Oldest First</option>
                {activeTab === 'ORDERS' && (
                  <>
                    <option value="FEE_HIGH">Delivery Fee (High to Low)</option>
                    <option value="FEE_LOW">Delivery Fee (Low to High)</option>
                  </>
                )}
                {(activeTab === 'CUSTOMERS' || activeTab === 'HELPERS') && (
                  <>
                    <option value="ORDERS_HIGH">Most Orders / Completed</option>
                    <option value="SPENT_HIGH">Highest Spent / Earned</option>
                  </>
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 1: NEEDS ATTENTION TAB --- */}
      {activeTab === 'EXCEPTIONS' && (() => {
        const notAccepted = getProcessedOrders(notAcceptedRequests);
        const cancelling = getProcessedOrders(cancellingRequests);
        const feeAdjustments = getProcessedOrders(feeAdjustmentsPending);

        const hasExceptions =
          cancelling.length > 0 ||
          notAccepted.length > 0 ||
          feeAdjustments.length > 0 ||
          pendingApps.length > 0 ||
          pendingWds.length > 0;

        return (
          <div className="space-y-6">
            {!hasExceptions ? (
              <div className="py-16 bg-white rounded-3xl border border-gray-100 text-center p-8 shadow-soft space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8" />
                </div>
                <h4 className="font-extrabold text-gray-900 text-base">সবকিছু ঠিকঠাক চলছে!</h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  এই মুহূর্তে কোনো হেলপার রিকোয়েস্ট ক্যানসেলেশন, পেন্ডিং উইথড্রয়াল, ফি সমন্বয় বা হেলপার আবেদন নেই।
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. Pending Helper Applications */}
                {pendingApps.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <Users className="w-4 h-4 text-purple-700" />
                        <span>Pending Helper Applications ({pendingApps.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3 px-5">Legal Name</th>
                            <th className="py-3 px-5">NID #</th>
                            <th className="py-3 px-5">WhatsApp</th>
                            <th className="py-3 px-5">Vehicles / Assets</th>
                            <th className="py-3 px-5 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {pendingApps.map((app) => (
                            <tr key={app.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3.5 px-5 font-bold text-gray-900">{app.legalName}</td>
                              <td className="py-3.5 px-5 font-mono">{app.nid}</td>
                              <td className="py-3.5 px-5 text-emerald-700 font-bold">{app.whatsapp}</td>
                              <td className="py-3.5 px-5">
                                <div className="flex gap-1 text-[10px] font-bold">
                                  {app.hasSmartphone && <span className="px-1.5 py-0.5 rounded bg-gray-100">Phone</span>}
                                  {app.hasCycle && <span className="px-1.5 py-0.5 rounded bg-gray-100">Cycle</span>}
                                  {app.hasBike && <span className="px-1.5 py-0.5 rounded bg-gray-100">Bike</span>}
                                </div>
                              </td>
                              <td className="py-3.5 px-5 text-right">
                                <button
                                  onClick={() => handleApproveApp(app.id)}
                                  className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                >
                                  Approve Helper
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 2. Pending Withdrawals */}
                {pendingWds.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        <span>Pending Withdrawal Payouts ({pendingWds.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3 px-5">Helper Name</th>
                            <th className="py-3 px-5">Amount</th>
                            <th className="py-3 px-5">Method</th>
                            <th className="py-3 px-5">Account Number</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {pendingWds.map((w) => (
                            <tr key={w.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3.5 px-5 font-bold text-gray-900">{w.helperName}</td>
                              <td className="py-3.5 px-5 font-extrabold text-purple-800">৳{w.amount}</td>
                              <td className="py-3.5 px-5 uppercase font-bold text-gray-700">{w.paymentMethod}</td>
                              <td className="py-3.5 px-5 font-mono">{w.accountNumber}</td>
                              <td className="py-3.5 px-5 text-right">
                                <div className="flex justify-end space-x-1.5">
                                  <button
                                    onClick={() => handleApproveWd(w.id)}
                                    className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectWd(w.id)}
                                    className="py-1.5 px-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-xs transition-all"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 3. Pending Fee Adjustments */}
                {feeAdjustments.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <TrendingUp className="w-4 h-4 text-indigo-700" />
                        <span>Pending Fee Adjustments ({feeAdjustments.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3 px-5">Order ID</th>
                            <th className="py-3 px-5">Customer & Helper</th>
                            <th className="py-3 px-5">Fee Adjustment</th>
                            <th className="py-3 px-5">Reason</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {feeAdjustments.map((ord) => (
                            <tr key={ord.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3.5 px-5 font-bold text-gray-900">#{ord.id}</td>
                              <td className="py-3.5 px-5">
                                <div className="font-extrabold text-gray-900">{ord.customerName}</div>
                                <div className="text-[11px] text-purple-950 font-bold">Helper: {ord.helperName}</div>
                              </td>
                              <td className="py-3.5 px-5">
                                <span className="text-gray-400 line-through mr-1.5">৳{ord.deliveryFee}</span>
                                <span className="font-black text-emerald-700">৳{ord.feeAdjustment?.amount}</span>
                              </td>
                              <td className="py-3.5 px-5 text-gray-600 italic font-normal max-w-xs truncate">{ord.feeAdjustment?.reason}</td>
                              <td className="py-3.5 px-5 text-right">
                                <div className="flex justify-end space-x-1.5">
                                  <button
                                    onClick={() => handleApproveFeeAdjustment(ord.id)}
                                    className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectFeeAdjustment(ord.id)}
                                    className="py-1.5 px-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-xs transition-all"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 4. Cancellation Requests */}
                {cancelling.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span>Order Cancellation Requests ({cancelling.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3 px-5">Order ID</th>
                            <th className="py-3 px-5">Requested By</th>
                            <th className="py-3 px-5">Reason</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {cancelling.map((ord) => (
                            <tr key={ord.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3.5 px-5 font-bold text-gray-900">#{ord.id}</td>
                              <td className="py-3.5 px-5 uppercase font-bold text-red-800">{ord.cancellationRequest?.requestedBy}</td>
                              <td className="py-3.5 px-5 text-gray-600 italic font-normal max-w-xs truncate">{ord.cancellationRequest?.reason}</td>
                              <td className="py-3.5 px-5 text-right">
                                <div className="flex justify-end space-x-1.5">
                                  <button
                                    onClick={() => handleApproveCancellation(ord.id)}
                                    className="py-1.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                  >
                                    Approve Cancellation
                                  </button>
                                  <button
                                    onClick={() => handleRejectCancellation(ord.id)}
                                    className="py-1.5 px-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-xs transition-all"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 5. Unaccepted / Pending Requests */}
                {notAccepted.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>Pending Orders (Not Accepted) ({notAccepted.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3.5 px-5">Order ID</th>
                            <th className="py-3.5 px-5">Customer</th>
                            <th className="py-3.5 px-5">Title & Items</th>
                            <th className="py-3.5 px-5">Fee</th>
                            <th className="py-3.5 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {notAccepted.map((ord) => (
                            <tr key={ord.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3.5 px-5 font-bold text-gray-900">#{ord.id}</td>
                              <td className="py-3.5 px-5">
                                <div className="font-extrabold text-gray-900">{ord.customerName}</div>
                                <div className="text-[11px] text-gray-400">{ord.customerPhone}</div>
                              </td>
                              <td className="py-3.5 px-5">
                                <div className="font-bold text-gray-900 max-w-xs truncate">{ord.title || ord.items?.[0]?.name || 'Order'}</div>
                                <div className="text-[11px] text-gray-500">{ord.items.length} items</div>
                              </td>
                              <td className="py-3.5 px-5 font-extrabold text-emerald-700">৳{ord.deliveryFee}</td>
                              <td className="py-3.5 px-5 text-right">
                                <div className="flex justify-end space-x-2">
                                  <button
                                    onClick={() => setAssignHelperOrder(ord)}
                                    className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all"
                                  >
                                    Assign Helper
                                  </button>
                                  <button
                                    onClick={() => setSelectedOrderId(ord.id)}
                                    className="py-1.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-extrabold text-xs transition-all"
                                  >
                                    Details
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* --- TAB 2: ALL ORDERS TAB --- */}
      {activeTab === 'ORDERS' && (() => {
        const processed = getProcessedOrders(orders);
        const { totalPages, paginatedItems, totalItems } = paginateList(processed);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden space-y-2">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900">System Orders Master List</h3>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800">
                {totalItems} orders found (Latest first)
              </span>
            </div>

            {/* Desktop Table View */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-5">Order ID</th>
                    <th className="py-3.5 px-5">Customer</th>
                    <th className="py-3.5 px-5">Title & Items</th>
                    <th className="py-3.5 px-5">Assigned Helper</th>
                    <th className="py-3.5 px-5">Fee</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.map((ord) => (
                    <tr
                      key={ord.id}
                      className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedOrderId(ord.id)}
                    >
                      <td className="py-4 px-5 font-bold text-gray-900">#{ord.id}</td>
                      <td className="py-4 px-5">
                        <div className="font-extrabold text-gray-900">{ord.customerName}</div>
                        <div className="text-[11px] text-gray-400">{ord.customerPhone}</div>
                      </td>
                      <td className="py-4 px-5">
                        <div className="font-bold text-gray-900 max-w-xs truncate">{ord.title || ord.items?.[0]?.name || 'Order'}</div>
                        <div className="text-[11px] text-gray-500">{ord.items.length} items</div>
                      </td>
                      <td className="py-4 px-5">
                        {ord.helperName ? (
                          <div className="font-bold text-purple-900 flex items-center space-x-1">
                            <Bike className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{ord.helperName}</span>
                          </div>
                        ) : (
                          <span className="text-amber-600 font-bold text-[11px]">Unassigned</span>
                        )}
                      </td>
                      <td className="py-4 px-5 font-extrabold text-emerald-700">৳{ord.deliveryFee}</td>
                      <td className="py-4 px-5">
                        <span
                          className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] ${
                            ord.status === 'DELIVERED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ord.status === 'CANCELED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => setAssignHelperOrder(ord)}
                            className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all"
                          >
                            Assign Helper
                          </button>
                          <button
                            onClick={() => setSelectedOrderId(ord.id)}
                            className="py-1.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-extrabold text-xs transition-all"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* --- TAB 3: UNIFIED USER LISTS TAB --- */}
      {activeTab === 'USERS_LIST' && (() => {
        const processed = getProcessedUsersList();
        const { totalPages, paginatedItems, totalItems } = paginateList(processed);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900">Registered Users Master List</h3>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-800">
                {totalItems} total users recorded
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-5">User Profile</th>
                    <th className="py-3.5 px-5">Role & Badges</th>
                    <th className="py-3.5 px-5">Live Current Running State</th>
                    <th className="py-3.5 px-5">Labels / Tags</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.map((item) => {
                    const u = item.user;
                    return (
                      <tr
                        key={u.uid}
                        className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                        onClick={() => setSelectedUserId(u.uid)}
                      >
                        <td className="py-4 px-5">
                          <div className="font-extrabold text-gray-900 flex items-center space-x-2">
                            <span>{u.displayName}</span>
                          </div>
                          <div className="text-[11px] text-gray-400 font-mono">{u.email || u.uid}</div>
                          {u.alternativePhone && (
                            <div className="text-[11px] text-gray-500">Phone: {u.alternativePhone}</div>
                          )}
                        </td>

                        <td className="py-4 px-5">
                          <div className="flex flex-wrap gap-1">
                            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 font-extrabold text-[10px] uppercase">
                              {u.role}
                            </span>
                            {u.isHelper && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-extrabold text-[10px] uppercase">
                                Helper
                              </span>
                            )}
                            {u.isSuperAdmin ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-purple-950 font-black text-[10px] uppercase tracking-wider flex items-center space-x-1 shadow-sm">
                                <ShieldCheck className="w-3 h-3" />
                                <span>Super Admin</span>
                              </span>
                            ) : u.isAdmin ? (
                              <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white font-extrabold text-[10px] uppercase">
                                Admin
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="py-4 px-5">
                          {item.activeReq ? (
                            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-950 font-extrabold text-[10px]">
                              Req: #{item.activeReq.id} ({item.activeReq.status})
                            </span>
                          ) : item.activeDel ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-950 font-extrabold text-[10px]">
                              Del: #{item.activeDel.id} ({item.activeDel.status})
                            </span>
                          ) : (
                            <span className="text-gray-400 font-bold text-[11px]">Idle / No active request</span>
                          )}
                        </td>

                        <td className="py-4 px-5">
                          {u.labels && u.labels.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {u.labels.map((lbl) => (
                                <span key={lbl} className="px-2 py-0.5 rounded-md bg-amber-100 text-purple-950 font-bold text-[10px]">
                                  {lbl}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic text-[11px]">No labels</span>
                          )}
                        </td>

                        <td className="py-4 px-5">
                          {u.isBlocked ? (
                            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-extrabold text-[10px]">
                              BLOCKED
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">
                              ACTIVE
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end items-center space-x-2">
                            {currentUser?.isSuperAdmin && u.uid !== currentUser.uid && !u.isSuperAdmin && (
                              u.isAdmin ? (
                                <button
                                  onClick={() => handleToggleAdminRole(u, false)}
                                  className="py-1.5 px-3 rounded-xl bg-red-100 hover:bg-red-200 text-red-800 font-extrabold text-xs transition-all flex items-center space-x-1"
                                  title="Remove Admin privileges"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  <span>Remove Admin</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleToggleAdminRole(u, true)}
                                  className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1"
                                  title="Promote to Admin"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Make Admin</span>
                                </button>
                              )
                            )}
                            <button
                              onClick={() => setSelectedUserId(u.uid)}
                              className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all"
                            >
                              View History & Actions
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* --- TAB 4: REVENUE ANALYTICS TAB --- */}
      {activeTab === 'REVENUE' && (
        <RevenueAnalytics orders={orders} pricing={pricing} />
      )}

      {/* --- TAB 3: CUSTOMERS STATS TAB --- */}
      {activeTab === 'CUSTOMERS' && (() => {
        const processed = getProcessedCustomers();
        const { totalPages, paginatedItems, totalItems } = paginateList(processed);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900">Customer Statistics & Order Histories</h3>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-800">
                {totalItems} total customers
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-5">Customer Name</th>
                    <th className="py-3.5 px-5">Phone Number</th>
                    <th className="py-3.5 px-5">Total Orders Placed</th>
                    <th className="py-3.5 px-5">Completed Orders</th>
                    <th className="py-3.5 px-5">Total Spent</th>
                    <th className="py-3.5 px-5 text-right">Order History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone })}
                    >
                      <td className="py-4 px-5 font-extrabold text-gray-900">{c.name}</td>
                      <td className="py-4 px-5 font-bold text-gray-700">{c.phone}</td>
                      <td className="py-4 px-5 font-black text-gray-900">{c.totalOrders} orders</td>
                      <td className="py-4 px-5 font-bold text-emerald-600">{c.completedOrders} completed</td>
                      <td className="py-4 px-5 font-extrabold text-purple-900">৳{c.totalSpent}</td>
                      <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone })}
                          className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all"
                        >
                          View Full History
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* --- TAB 4: HELPER STATS TAB --- */}
      {activeTab === 'HELPERS' && (() => {
        const processed = getProcessedHelpers();
        const { totalPages, paginatedItems, totalItems } = paginateList(processed);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900">Helper Statistics & Performance Histories</h3>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-800">
                {totalItems} helpers recorded
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-5">Helper Name</th>
                    <th className="py-3.5 px-5">NID #</th>
                    <th className="py-3.5 px-5">Completed Jobs</th>
                    <th className="py-3.5 px-5">Active Assigned Jobs</th>
                    <th className="py-3.5 px-5">Total Earned</th>
                    <th className="py-3.5 px-5">Wallet Balance</th>
                    <th className="py-3.5 px-5 text-right">Work History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.map((h) => (
                    <tr
                      key={h.id}
                      className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedHelper({ id: h.id, name: h.name })}
                    >
                      <td className="py-4 px-5 font-extrabold text-gray-900">{h.name}</td>
                      <td className="py-4 px-5 font-bold text-gray-700">{h.nid || 'N/A'}</td>
                      <td className="py-4 px-5 font-black text-emerald-600">{h.completedJobs} jobs</td>
                      <td className="py-4 px-5 font-bold text-amber-600">{h.activeOrders} active</td>
                      <td className="py-4 px-5 font-extrabold text-indigo-900">৳{h.totalEarned}</td>
                      <td className="py-4 px-5 font-extrabold text-purple-900">৳{h.balance}</td>
                      <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedHelper({ id: h.id, name: h.name })}
                          className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all"
                        >
                          View Work History
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* --- TAB 5: HELPER APPLICATIONS TAB --- */}
      {activeTab === 'APPLICATIONS' && (() => {
        let filtered = [...applications];
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          filtered = filtered.filter(
            (a) =>
              a.legalName.toLowerCase().includes(q) ||
              a.userName.toLowerCase().includes(q) ||
              a.nid.includes(q) ||
              a.email.toLowerCase().includes(q)
          );
        }
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const { totalPages, paginatedItems, totalItems } = paginateList(filtered);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900">Helper Registrations & Applications</h3>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-800">
                {totalItems} total registered
              </span>
            </div>

            {/* Desktop Table View */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-5">Legal Name</th>
                    <th className="py-3.5 px-5">NID #</th>
                    <th className="py-3.5 px-5">Contact Email</th>
                    <th className="py-3.5 px-5">Vehicles / Assets</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.map((app) => (
                    <tr key={app.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-4 px-5">
                        <div className="font-extrabold text-gray-900">{app.legalName}</div>
                        <div className="text-[11px] text-gray-400">{app.userName}</div>
                        {app.whatsapp && (
                          <div className="text-[11px] text-emerald-700 font-bold">WA: {app.whatsapp}</div>
                        )}
                        {app.fbProfile && (
                          <a
                            href={app.fbProfile.startsWith('http') ? app.fbProfile : `https://${app.fbProfile}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-blue-600 underline font-semibold block truncate max-w-[140px]"
                          >
                            FB Profile
                          </a>
                        )}
                      </td>
                      <td className="py-4 px-5 font-bold text-gray-900">{app.nid}</td>
                      <td className="py-4 px-5">{app.email}</td>
                      <td className="py-4 px-5">
                        <div className="flex gap-1 text-[10px] font-bold">
                          {app.hasSmartphone && <span className="px-2 py-0.5 rounded bg-gray-100">Phone</span>}
                          {app.hasCycle && <span className="px-2 py-0.5 rounded bg-gray-100">Cycle</span>}
                          {app.hasBike && <span className="px-2 py-0.5 rounded bg-gray-100">Bike</span>}
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <span
                          className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] ${
                            app.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {app.status}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right">
                        {app.status === 'PENDING' ? (
                          <button
                            onClick={() => handleApproveApp(app.id)}
                            className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                          >
                            Approve Helper
                          </button>
                        ) : (
                          <span className="text-emerald-700 font-bold text-xs flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approved</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* --- TAB 6: WITHDRAWALS TAB --- */}
      {activeTab === 'WITHDRAWALS' && (() => {
        let filtered = [...withdrawals];
        if (withdrawalStatusFilter !== 'ALL') {
          filtered = filtered.filter((w) => w.status === withdrawalStatusFilter);
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          filtered = filtered.filter(
            (w) =>
              w.helperName.toLowerCase().includes(q) ||
              w.paymentMethod?.toLowerCase().includes(q) ||
              w.accountNumber?.includes(q) ||
              w.id.toLowerCase().includes(q)
          );
        }
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const { totalPages, paginatedItems, totalItems } = paginateList(filtered);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900">Helper Payout & Withdrawal Requests</h3>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-800">
                {totalItems} total payout requests
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-5">Helper Name</th>
                    <th className="py-3.5 px-5">Amount (৳)</th>
                    <th className="py-3.5 px-5">Payment Method</th>
                    <th className="py-3.5 px-5">Account / Number</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.map((w) => (
                    <tr key={w.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-4 px-5 font-extrabold text-gray-900">{w.helperName}</td>
                      <td className="py-4 px-5 font-extrabold text-purple-800">৳{w.amount}</td>
                      <td className="py-4 px-5 font-bold uppercase">{w.paymentMethod}</td>
                      <td className="py-4 px-5">{w.accountNumber}</td>
                      <td className="py-4 px-5">
                        <span
                          className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] ${
                            w.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : w.status === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {w.status}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right">
                        {w.status === 'PENDING' ? (
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleApproveWd(w.id)}
                              className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectWd(w.id)}
                              className="py-1.5 px-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-xs"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">Processed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* --- TAB 7: PRICING & CONFIGURATION TAB --- */}
      {activeTab === 'PRICING' && (
        <form onSubmit={handleSavePricing} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-soft space-y-6">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="font-extrabold text-lg text-gray-900">Admin Configurable Pricing & Form Controls</h3>
            <p className="text-xs text-gray-500">Configure global platform commissions, payout thresholds, and home page request placeholders.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                Helper Commission Percentage (%)
              </label>
              <input
                type="number"
                value={pricing.helperCommissionPercent}
                onChange={(e) =>
                  setPricing({ ...pricing, helperCommissionPercent: Number(e.target.value) })
                }
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-extrabold outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                Minimum Withdrawal Amount (৳)
              </label>
              <input
                type="number"
                value={pricing.minWithdrawalAmount}
                onChange={(e) =>
                  setPricing({ ...pricing, minWithdrawalAmount: Number(e.target.value) })
                }
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-extrabold outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                Max Active Orders per Helper
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={pricing.helperActiveOrderLimit ?? 5}
                onChange={(e) =>
                  setPricing({ ...pricing, helperActiveOrderLimit: Number(e.target.value) })
                }
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-extrabold outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                required
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                A helper cannot accept new requests once they hit this limit. Default is 5.
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              সার্ভিস ড্রপডাউন অপশন সমূহ (প্রতি লাইনে ১টি):
            </label>
            <textarea
              value={servicesText}
              onChange={(e) => setServicesText(e.target.value)}
              placeholder="প্রতিটি সার্ভিস আলাদা লাইনে লিখুন..."
              rows={6}
              className="w-full p-4 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 leading-relaxed font-sans"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              রিকোয়েস্ট ফর্মের সার্ভিস ড্রপডাউনে এই সার্ভিসগুলো দেখাবে।
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              হোম পেজ রিকোয়েস্ট ইনপুট প্লেসহোল্ডার সমূহ (প্রতি লাইনে ১টি):
            </label>
            <textarea
              value={placeholdersText}
              onChange={(e) => setPlaceholdersText(e.target.value)}
              placeholder="প্রতিটি প্লেসহোল্ডার আলাদা লাইনে লিখুন..."
              rows={6}
              className="w-full p-4 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 leading-relaxed font-sans"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              ব্যবহারকারী রিকোয়েস্ট ইনপুট বক্সে এই প্লেসহোল্ডার লেখাগুলি পরপর পরিবর্তন (rotate) হতে দেখবে।
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              অর্ডার সাবমিটের পর কনফার্মেশন বার্তা (Thank You message):
            </label>
            <input
              type="text"
              value={confirmationMsg}
              onChange={(e) => setConfirmationMsg(e.target.value)}
              placeholder="যেমন: আপনার অনুরোধ পেয়েছি! শীঘ্রই একজন হেলপার গ্রহণ করবে।"
              className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              গ্রাহক অর্ডার সফলভাবে জমা দেওয়ার পর এই বার্তাটি &ldquo;ধন্যবাদ!&rdquo; শিরোনামসহ পপআপে দেখাবে।
            </p>
          </div>

          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-sm shadow-md transition-all"
          >
            Save Pricing & Form Configurations
          </button>
        </form>
      )}

      {/* --- ALL MODALS OVERLAYS --- */}

      {/* 1. Admin Order Details Modal */}
      {selectedOrderId && (
        <AdminOrderDetailsModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}

      {/* 2. Assign Helper Modal */}
      {assignHelperOrder && (
        <AssignHelperModal
          order={assignHelperOrder}
          onClose={() => setAssignHelperOrder(null)}
          onAssigned={() => setAssignHelperOrder(null)}
        />
      )}

      {/* 3. Customer Order History Modal */}
      {selectedCustomer && (
        <CustomerHistoryModal
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          customerPhone={selectedCustomer.phone}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {/* 4. Helper Work History Modal */}
      {selectedHelper && (
        <HelperHistoryModal
          helperId={selectedHelper.id}
          helperName={selectedHelper.name}
          onClose={() => setSelectedHelper(null)}
        />
      )}

      {/* 5. Comprehensive User Details & History Modal */}
      {selectedUserId && (
        <UserDetailsModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onUserUpdated={() => setUsers(Array.from(fallbackStore.users.values()))}
        />
      )}

      {/* 6. Admin Custom Push Notification Modal */}
      {showPushNotificationModal && (
        <AdminPushNotificationModal
          onClose={() => setShowPushNotificationModal(false)}
        />
      )}
    </div>
  );
};
