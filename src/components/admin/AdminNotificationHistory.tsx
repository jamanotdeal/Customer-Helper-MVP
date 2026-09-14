import React, { useState, useEffect, useMemo } from 'react';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import { AppNotification, UserProfile } from '@/types';
import {
  Bell,
  Send,
  Clock,
  Calendar,
  Repeat,
  Search,
  Filter,
  Trash2,
  Edit3,
  Copy,
  Zap,
  CheckCircle2,
  Users,
  UserCheck,
  User,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  X,
  AlertCircle
} from 'lucide-react';

interface AdminNotificationHistoryProps {
  onOpenCreateModal: () => void;
  onEditNotification: (notif: AppNotification) => void;
  onDuplicateNotification: (notif: AppNotification) => void;
}

export const AdminNotificationHistory: React.FC<AdminNotificationHistoryProps> = ({
  onOpenCreateModal,
  onEditNotification,
  onDuplicateNotification,
}) => {
  const { showAlert, showConfirm } = useModal();

  const [subView, setSubView] = useState<'ALL' | 'SCHEDULED' | 'SENT'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAudienceFilter, setSelectedAudienceFilter] = useState<string>('ALL');
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Data states
  const [scheduledList, setScheduledList] = useState<AppNotification[]>([]);
  const [sentList, setSentList] = useState<AppNotification[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, UserProfile>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadData = () => {
    // Scheduled notifications
    const schedArr = Array.from(fallbackStore.scheduledNotifications.values()).sort(
      (a, b) => new Date(a.scheduledAt || a.createdAt).getTime() - new Date(b.scheduledAt || b.createdAt).getTime()
    );
    setScheduledList(schedArr);

    // Sent notifications history: ONLY notifications created by admin via "Send push notification"
    const historyMap = fallbackStore.adminNotificationsHistory;
    const sentMap = new Map<string, AppNotification>();

    // Add only admin push notifications from adminNotificationsHistory
    historyMap.forEach((n, id) => {
      const isAdminNotification = n.isAdminPush || n.createdByAdmin || id.startsWith('admin-notif-') || id.startsWith('notif-disp-') || id.startsWith('sched-');
      if (!n.isScheduled && isAdminNotification) {
        sentMap.set(id, n);
      }
    });

    const sentArr = Array.from(sentMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setSentList(sentArr);

    // Users
    setUsersMap(new Map(fallbackStore.users));
  };

  useEffect(() => {
    loadData();
    const unsub = fallbackStore.subscribe(() => {
      loadData();
    });
    return () => unsub();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    loadData();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 400);
  };

  const handleDeleteScheduled = async (notif: AppNotification) => {
    const confirmed = await showConfirm(
      'সিডিউল বাতিল ও মুছবেন?',
      `আপনি কি "${notif.title}" নোটিফিকেশনটি প্রকাশ হওয়ার পূর্বেই বাতিল ও ডিলিট করতে চান?`,
      'হ্যাঁ, ডিলিট করুন',
      'বাতিল'
    );
    if (!confirmed) return;
    try {
      await fallbackStore.deleteScheduledNotification(notif.id);
      showAlert('মুছে ফেলা হয়েছে', 'সিডিউলকৃত নোটিফিকেশন সফলভাবে মুছে ফেলা হয়েছে।', 'success');
    } catch (err: any) {
      showAlert('ত্রুটি', err?.message || 'মুছে ফেলতে সমস্যা হয়েছে।', 'error');
    }
  };

  const handlePublishNow = async (notif: AppNotification) => {
    const confirmed = await showConfirm(
      'এখনই নোটিফিকেশন পাঠাবেন?',
      `আপনি কি "${notif.title}" সিডিউল নোটিফিকেশনটি নির্ধারিত সময়ের পূর্বেই এখনই গ্রাহকদের কাছে পাঠাতে চান?`,
      'হ্যাঁ, পাঠিয়ে দিন',
      'বাতিল'
    );
    if (!confirmed) return;
    try {
      await fallbackStore.publishScheduledNotificationNow(notif.id);
      showAlert('প্রকাশিত হয়েছে!', 'নোটিফিকেশন সফলভাবে অবিলম্বে প্রেরণ করা হয়েছে।', 'success');
    } catch (err: any) {
      showAlert('ত্রুটি', err?.message || 'নোটিফিকেশন পাঠাতে সমস্যা হয়েছে।', 'error');
    }
  };

  const handleDeleteSent = async (notif: AppNotification) => {
    const confirmed = await showConfirm(
      'হিস্ট্রি থেকে মুছবেন?',
      `আপনি কি "${notif.title}" নোটিফিকেশনটি হিস্ট্রি থেকে মুছে ফেলতে চান?`,
      'হ্যাঁ, ডিলিট করুন',
      'বাতিল'
    );
    if (!confirmed) return;
    try {
      await fallbackStore.deleteNotification(notif.id);
      showAlert('মুছে ফেলা হয়েছে', 'নোটিফিকেশন হিস্ট্রি থেকে সফলভাবে মুছে ফেলা হয়েছে।', 'success');
    } catch (err: any) {
      showAlert('ত্রুটি', err?.message || 'মুছে ফেলতে সমস্যা হয়েছে।', 'error');
    }
  };

  // Audience Helper Formatter
  const formatAudience = (userId: string) => {
    if (userId === 'all-helpers' || userId === 'helpers') {
      return {
        label: 'Helpers Only (সকল হেলপার)',
        shortLabel: 'Helpers',
        icon: UserCheck,
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        badgeColor: 'bg-emerald-600',
      };
    }
    if (userId === 'all-customers' || userId === 'customers') {
      return {
        label: 'Customers Only (সকল কাস্টমার)',
        shortLabel: 'Customers',
        icon: Users,
        bg: 'bg-purple-50 text-purple-700 border-purple-200',
        badgeColor: 'bg-purple-600',
      };
    }
    if (userId === 'all') {
      return {
        label: 'Everyone (সকল ইউজার)',
        shortLabel: 'Everyone',
        icon: Sparkles,
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
        badgeColor: 'bg-blue-600',
      };
    }
    if (userId.startsWith('segment:')) {
      const segName = userId.replace('segment:', '');
      let segFriendly = segName;
      if (segName === 'MULTIPLE_ORDERS') segFriendly = 'Ordered 2+ Times';
      else if (segName === 'WEEKLY_2_ORDERS') segFriendly = 'Weekly 2+ Orders';
      else if (segName === 'WEEKLY_1_ORDERS') segFriendly = 'Weekly 1+ Orders';
      else if (segName === 'RARE_ORDERS_WEEK') segFriendly = 'Low Orders (<1/wk)';
      else if (segName === 'RARE_ORDERS_MONTH') segFriendly = 'Low Orders (<1/mo)';
      else if (segName === 'INACTIVE_1_WEEK') segFriendly = 'Inactive 1 Week';
      else if (segName === 'INACTIVE_2_WEEKS') segFriendly = 'Inactive 2 Weeks';
      else if (segName === 'NEVER_ORDERED') segFriendly = 'Never Ordered';
      else if (segName === 'NEW_REGISTERED') segFriendly = 'New Registered (7d)';

      return {
        label: `Segment: ${segFriendly}`,
        shortLabel: segFriendly,
        icon: Filter,
        bg: 'bg-amber-50 text-amber-800 border-amber-200',
        badgeColor: 'bg-amber-500',
      };
    }

    const u = usersMap.get(userId);
    const userDisplay = u ? `${u.displayName || u.email || 'User'} (${u.alternativePhone || u.uid.substring(0, 6)})` : `UID: ${userId.substring(0, 10)}`;
    return {
      label: `Single User: ${userDisplay}`,
      shortLabel: u?.displayName || 'Single User',
      icon: User,
      bg: 'bg-slate-50 text-slate-700 border-slate-200',
      badgeColor: 'bg-slate-600',
    };
  };

  // Relative Time / Schedule Time Formatter
  const formatScheduledTimeBadge = (notif: AppNotification) => {
    if (!notif.scheduledAt) return null;
    const schedDate = new Date(notif.scheduledAt);
    const now = new Date();
    const diffMs = schedDate.getTime() - now.getTime();

    let relativeText = '';
    let isPastDue = diffMs <= 0;

    if (isPastDue) {
      relativeText = 'Due to send shortly (অপেক্ষমাণ)';
    } else {
      const mins = Math.floor(diffMs / (60 * 1000));
      const hours = Math.floor(mins / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) {
        relativeText = `In ${days} day${days > 1 ? 's' : ''} ${hours % 24} hr${(hours % 24) > 1 ? 's' : ''}`;
      } else if (hours > 0) {
        relativeText = `In ${hours} hr${hours > 1 ? 's' : ''} ${mins % 60} min${(mins % 60) > 1 ? 's' : ''}`;
      } else {
        relativeText = `In ${mins} min${mins > 1 ? 's' : ''}`;
      }
    }

    return {
      formattedDate: schedDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      relativeText,
      isPastDue,
    };
  };

  // Metrics
  const totalSentCount = sentList.length;
  const totalScheduledCount = scheduledList.length;
  const recurringCount = scheduledList.filter((n) => n.repeatFrequency && n.repeatFrequency !== 'NONE').length;

  const todaySentCount = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return sentList.filter((n) => n.createdAt && n.createdAt.startsWith(todayStr)).length;
  }, [sentList]);

  // Filtered List
  const filteredNotifications = useMemo(() => {
    let combined: { item: AppNotification; isSched: boolean }[] = [];

    if (subView === 'ALL') {
      const s = scheduledList.map((item) => ({ item, isSched: true }));
      const p = sentList.map((item) => ({ item, isSched: false }));
      combined = [...s, ...p];
    } else if (subView === 'SCHEDULED') {
      combined = scheduledList.map((item) => ({ item, isSched: true }));
    } else {
      combined = sentList.map((item) => ({ item, isSched: false }));
    }

    // Filter by Audience
    if (selectedAudienceFilter !== 'ALL') {
      combined = combined.filter(({ item }) => {
        if (selectedAudienceFilter === 'HELPERS') return item.userId === 'all-helpers' || item.userId === 'helpers';
        if (selectedAudienceFilter === 'CUSTOMERS') return item.userId === 'all-customers' || item.userId === 'customers';
        if (selectedAudienceFilter === 'ALL') return item.userId === 'all';
        if (selectedAudienceFilter === 'SEGMENT') return item.userId.startsWith('segment:');
        if (selectedAudienceFilter === 'SPECIFIC') return !['all-helpers', 'all-customers', 'all', 'helpers', 'customers'].includes(item.userId) && !item.userId.startsWith('segment:');
        return true;
      });
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      combined = combined.filter(({ item }) => {
        const titleMatch = item.title?.toLowerCase().includes(q);
        const bodyMatch = item.body?.toLowerCase().includes(q);
        const orderMatch = item.orderId?.toLowerCase().includes(q);
        const userMatch = item.userId?.toLowerCase().includes(q);
        return titleMatch || bodyMatch || orderMatch || userMatch;
      });
    }

    return combined;
  }, [subView, scheduledList, sentList, selectedAudienceFilter, searchQuery]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredNotifications.length / pageSize) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredNotifications.slice(start, start + pageSize);
  }, [filteredNotifications, currentPage, pageSize]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Action Header */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-3 bg-purple-900 text-white rounded-2xl shadow-md shrink-0">
            <Bell className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="font-extrabold text-base sm:text-lg text-gray-900 flex items-center gap-2">
              <span>Notification Center & History</span>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 text-xs font-black">
                {totalSentCount + totalScheduledCount} Total
              </span>
            </h3>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              ট্র্যাক করুন প্রেরিত সকল পুশ নোটিফিকেশন এবং পাবলিশ হওয়ার আগেই সিডিউলকৃত নোটিফিকেশন এডিট বা ডিলিট করুন।
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 rounded-2xl border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors flex items-center justify-center"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-purple-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onOpenCreateModal}
            className="py-2.5 px-4 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-all flex items-center space-x-2 active:scale-95"
          >
            <Send className="w-4 h-4" />
            <span>Create Push Notification</span>
          </button>
        </div>
      </div>

      {/* 4 Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Total Sent */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-100 shadow-soft space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold">
            <span>Total Sent (মোট প্রেরিত)</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-700">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900">{totalSentCount}</div>
          <p className="text-[11px] text-gray-400 font-medium">Delivered to users</p>
        </div>

        {/* Scheduled & Pending */}
        <div
          onClick={() => {
            setSubView('SCHEDULED');
            setCurrentPage(1);
          }}
          className={`p-4 sm:p-5 rounded-3xl border shadow-soft space-y-2 cursor-pointer transition-all ${
            totalScheduledCount > 0
              ? 'bg-purple-950 text-white border-purple-800'
              : 'bg-white text-gray-900 border-gray-100'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold opacity-80">
            <span>Scheduled (অপেক্ষমাণ)</span>
            <div className={`p-2 rounded-xl ${totalScheduledCount > 0 ? 'bg-purple-800 text-purple-200' : 'bg-purple-50 text-purple-700'}`}>
              <Clock className="w-4 h-4 animate-pulse" />
            </div>
          </div>
          <div className="text-2xl font-black">{totalScheduledCount}</div>
          <p className={`text-[11px] font-medium ${totalScheduledCount > 0 ? 'text-purple-300' : 'text-gray-400'}`}>
            {totalScheduledCount > 0 ? 'Editable before release' : 'No upcoming schedules'}
          </p>
        </div>

        {/* Recurring Automation */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-100 shadow-soft space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold">
            <span>Recurring Automation (রিকারিং)</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
              <Repeat className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900">{recurringCount}</div>
          <p className="text-[11px] text-gray-400 font-medium">Daily & weekly automated</p>
        </div>

        {/* Sent Today */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-100 shadow-soft space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold">
            <span>Sent Today (আজকে প্রেরিত)</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900">{todaySentCount}</div>
          <p className="text-[11px] text-gray-400 font-medium">Pushed in last 24h</p>
        </div>
      </div>

      {/* Sub-views Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-3xl border border-gray-100 shadow-soft">
        <div className="flex items-center space-x-1.5 overflow-x-auto p-0.5">
          <button
            type="button"
            onClick={() => {
              setSubView('ALL');
              setCurrentPage(1);
            }}
            className={`py-2 px-4 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all ${
              subView === 'ALL'
                ? 'bg-purple-900 text-white shadow-md'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            All Notifications ({totalSentCount + totalScheduledCount})
          </button>

          <button
            type="button"
            onClick={() => {
              setSubView('SCHEDULED');
              setCurrentPage(1);
            }}
            className={`py-2 px-4 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center space-x-1.5 ${
              subView === 'SCHEDULED'
                ? 'bg-purple-900 text-white shadow-md'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Scheduled & Upcoming</span>
            {totalScheduledCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-purple-600 text-white text-[10px]">
                {totalScheduledCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setSubView('SENT');
              setCurrentPage(1);
            }}
            className={`py-2 px-4 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center space-x-1.5 ${
              subView === 'SENT'
                ? 'bg-purple-900 text-white shadow-md'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Sent / Published History ({totalSentCount})</span>
          </button>
        </div>

        {/* Audience Target Dropdown */}
        <div className="flex items-center space-x-2 px-1">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={selectedAudienceFilter}
            onChange={(e) => {
              setSelectedAudienceFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 focus:outline-none focus:border-purple-600"
          >
            <option value="ALL">All Target Audiences</option>
            <option value="HELPERS">Helpers Only</option>
            <option value="CUSTOMERS">Customers Only</option>
            <option value="SEGMENT">Audience Segments</option>
            <option value="SPECIFIC">Single Specific Users</option>
          </select>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3.5 rounded-3xl border border-gray-100 shadow-soft flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search notifications by title, description, order ID, or user target..."
            className="w-full pl-10 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="p-1 rounded-full text-gray-400 hover:text-gray-600 absolute right-3 top-2.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Notification Items List */}
      {paginatedList.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-gray-100 text-center space-y-3 shadow-soft">
          <div className="w-14 h-14 bg-purple-50 text-purple-700 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <Bell className="w-7 h-7" />
          </div>
          <h4 className="font-extrabold text-base text-gray-900">কোনো নোটিফিকেশন পাওয়া যায়নি</h4>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {subView === 'SCHEDULED'
              ? 'বর্তমানে কোনো সিডিউলকৃত নোটিফিকেশন নেই। আপনি যেকোনো সময় নতুন সিডিউল নোটিফিকেশন তৈরি করতে পারেন।'
              : 'আপনার নির্বাচিত ফিল্টারে কোনো নোটিফিকেশন মেলেনি। নতুন পুশ নোটিফিকেশন পাঠাতে নিচের বাটনে ট্যাপ করুন।'}
          </p>
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="mt-2 py-2.5 px-5 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-all inline-flex items-center space-x-1.5"
          >
            <Send className="w-4 h-4" />
            <span>Create Push Notification</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {paginatedList.map(({ item, isSched }) => {
            const audienceInfo = formatAudience(item.userId);
            const schedInfo = isSched ? formatScheduledTimeBadge(item) : null;
            const createdFormatted = new Date(item.createdAt).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            });

            return (
              <div
                key={item.id}
                className={`p-5 rounded-3xl border transition-all bg-white hover:shadow-md ${
                  isSched
                    ? 'border-purple-300 ring-2 ring-purple-600/10'
                    : 'border-gray-150'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left Main Content */}
                  <div className="space-y-3 flex-1 overflow-hidden">
                    {/* Status and Audience Chips */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {/* Status Badge */}
                      {isSched ? (
                        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-purple-900 text-white font-extrabold text-[11px] shadow-xs">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                          <span>Scheduled (অপেক্ষমাণ)</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Published / Sent</span>
                        </div>
                      )}

                      {/* Recurrence Badge if applicable */}
                      {item.repeatFrequency && item.repeatFrequency !== 'NONE' && (
                        <div className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 font-extrabold text-[11px]">
                          <Repeat className="w-3 h-3 text-indigo-600" />
                          <span>
                            {item.repeatFrequency === 'DAILY' ? 'Repeat Daily' : 'Repeat Weekly'}
                            {item.repeatTime ? ` @ ${item.repeatTime}` : ''}
                          </span>
                        </div>
                      )}

                      {/* Audience Badge */}
                      <div
                        className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full border font-bold text-[11px] ${audienceInfo.bg}`}
                      >
                        <audienceInfo.icon className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[240px]">{audienceInfo.label}</span>
                      </div>

                      {/* Order Reference Badge */}
                      {item.orderId && (
                        <div className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-bold text-[11px]">
                          <span>Order: #{item.orderId}</span>
                        </div>
                      )}
                    </div>

                    {/* Title and Body */}
                    <div className="space-y-1">
                      <h4 className="font-black text-sm sm:text-base text-gray-900 leading-tight">
                        {item.title}
                      </h4>
                      <p className="text-xs sm:text-sm text-gray-600 leading-relaxed font-normal whitespace-pre-line">
                        {item.body}
                      </p>
                    </div>

                    {/* Banner Image Preview Thumbnail if attached */}
                    {item.imageUrl && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedImagePreview(item.imageUrl || null)}
                          className="flex items-center space-x-2 p-1.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors group"
                        >
                          <div className="w-12 h-10 rounded-lg overflow-hidden bg-gray-200 shrink-0">
                            <img src={item.imageUrl} alt="Banner" className="w-full h-full object-cover" />
                          </div>
                          <div className="text-left pr-2">
                            <div className="text-[11px] font-bold text-gray-800 flex items-center gap-1 group-hover:text-purple-700">
                              <span>Attached Banner Image</span>
                              <ExternalLink className="w-3 h-3" />
                            </div>
                            <div className="text-[10px] text-gray-400">Click to view full preview</div>
                          </div>
                        </button>
                      </div>
                    )}

                    {/* Timing Details Bar */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-gray-400 font-medium">
                      <div>Created: {createdFormatted}</div>
                      {isSched && schedInfo && (
                        <div className="flex items-center space-x-1 text-purple-900 font-bold bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-200">
                          <Calendar className="w-3 h-3 text-purple-600" />
                          <span>Release: {schedInfo.formattedDate} ({schedInfo.relativeText})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Actions Bar */}
                  <div className="flex lg:flex-col items-center justify-end gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                    {isSched ? (
                      <>
                        {/* Edit Scheduled Notification */}
                        <button
                          type="button"
                          onClick={() => onEditNotification(item)}
                          className="flex-1 lg:flex-initial py-2 px-3.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 font-extrabold text-xs transition-colors flex items-center justify-center space-x-1.5 shadow-xs"
                          title="Edit scheduled notification"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-purple-700" />
                          <span>Edit</span>
                        </button>

                        {/* Publish Immediately */}
                        <button
                          type="button"
                          onClick={() => handlePublishNow(item)}
                          className="flex-1 lg:flex-initial py-2 px-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-extrabold text-xs transition-colors flex items-center justify-center space-x-1.5"
                          title="Publish now immediately"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-600" />
                          <span>Send Now</span>
                        </button>

                        {/* Delete Scheduled Notification */}
                        <button
                          type="button"
                          onClick={() => handleDeleteScheduled(item)}
                          className="p-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-extrabold text-xs transition-colors flex items-center justify-center shadow-xs"
                          title="Delete scheduled notification"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Duplicate & Send Again */}
                        <button
                          type="button"
                          onClick={() => onDuplicateNotification(item)}
                          className="flex-1 lg:flex-initial py-2 px-3.5 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 font-extrabold text-xs transition-colors flex items-center justify-center space-x-1.5"
                          title="Reuse or send again"
                        >
                          <Copy className="w-3.5 h-3.5 text-gray-500" />
                          <span>Reuse</span>
                        </button>

                        {/* Delete from Sent History */}
                        <button
                          type="button"
                          onClick={() => handleDeleteSent(item)}
                          className="p-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-extrabold text-xs transition-colors flex items-center justify-center"
                          title="Delete from history"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-soft flex items-center justify-between">
          <div className="text-xs text-gray-500 font-bold">
            Showing Page <span className="text-purple-900 font-black">{currentPage}</span> of{' '}
            <span className="text-purple-900 font-black">{totalPages}</span> ({filteredNotifications.length} items)
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Full Image Preview Modal */}
      {selectedImagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 bg-purple-950 text-white flex items-center justify-between">
              <div className="font-extrabold text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-300" />
                <span>Notification Banner Preview</span>
              </div>
              <button
                onClick={() => setSelectedImagePreview(null)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-gray-900 flex items-center justify-center overflow-auto max-h-[75vh]">
              <img
                src={selectedImagePreview}
                alt="Banner full view"
                className="max-h-full max-w-full object-contain rounded-xl"
              />
            </div>
            <div className="p-3 bg-gray-50 border-t border-gray-100 text-right">
              <button
                onClick={() => setSelectedImagePreview(null)}
                className="px-4 py-1.5 rounded-xl bg-purple-900 text-white font-extrabold text-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
