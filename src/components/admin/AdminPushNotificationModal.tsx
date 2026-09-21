import React, { useState } from 'react';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import {
  Bell, Send, X, Users, UserCheck, ShieldAlert, Sparkles,
  CheckCircle2, Search, Clock, Calendar, Repeat, SlidersHorizontal,
  Filter, Coins, TrendingUp, CalendarClock, BarChart2, ChevronDown,
} from 'lucide-react';
import { TimePickerInput } from './TimePickerInput';
import { AppNotification, UserProfile } from '@/types';

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface AdminPushNotificationModalProps {
  onClose: () => void;
  editingNotification?: AppNotification | null;
  initialData?: Partial<AppNotification> | null;
}

/** Structured custom segment params (all optional / additive) */
interface CustomSegmentFilters {
  /** minimum total orders (inclusive) */
  minOrders?: number;
  /** maximum total orders (inclusive, for "low frequency" scenarios) */
  maxOrders?: number;
  /** last order must be within N days (0 = ignore) */
  lastOrderWithinDays?: number;
  /** last order must be MORE than N days ago (for inactive targeting) */
  lastOrderOlderThanDays?: number;
  /** weekly order rate >= this value */
  weeklyRateGte?: number;
  /** weekly order rate < this value (for rare-order targeting) */
  weeklyRateLt?: number;
  /** coin balance >= this value */
  minCoins?: number;
  /** coin balance <= this value */
  maxCoins?: number;
  /** registered within the last N days */
  registeredWithinDays?: number;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function encodeCustomSegment(f: CustomSegmentFilters): string {
  const parts: string[] = [];
  if (f.minOrders !== undefined && f.minOrders > 0) parts.push(`minOrders=${f.minOrders}`);
  if (f.maxOrders !== undefined && f.maxOrders >= 0) parts.push(`maxOrders=${f.maxOrders}`);
  if (f.lastOrderWithinDays !== undefined && f.lastOrderWithinDays > 0) parts.push(`lastOrderWithinDays=${f.lastOrderWithinDays}`);
  if (f.lastOrderOlderThanDays !== undefined && f.lastOrderOlderThanDays > 0) parts.push(`lastOrderOlderThanDays=${f.lastOrderOlderThanDays}`);
  if (f.weeklyRateGte !== undefined && f.weeklyRateGte > 0) parts.push(`weeklyRateGte=${f.weeklyRateGte}`);
  if (f.weeklyRateLt !== undefined && f.weeklyRateLt > 0) parts.push(`weeklyRateLt=${f.weeklyRateLt}`);
  if (f.minCoins !== undefined && f.minCoins > 0) parts.push(`minCoins=${f.minCoins}`);
  if (f.maxCoins !== undefined && f.maxCoins >= 0) parts.push(`maxCoins=${f.maxCoins}`);
  if (f.registeredWithinDays !== undefined && f.registeredWithinDays > 0) parts.push(`registeredWithinDays=${f.registeredWithinDays}`);
  return `CUSTOM:${parts.join(':')}`;
}

/* ─── Filter badge label helpers ─────────────────────────────────────────── */

function filterBadges(f: CustomSegmentFilters): string[] {
  const b: string[] = [];
  if ((f.minOrders ?? 0) > 0) b.push(`≥ ${f.minOrders} orders`);
  if ((f.maxOrders ?? Infinity) < Infinity && f.maxOrders !== undefined) b.push(`≤ ${f.maxOrders} orders`);
  if ((f.lastOrderWithinDays ?? 0) > 0) b.push(`Ordered last ${f.lastOrderWithinDays}d`);
  if ((f.lastOrderOlderThanDays ?? 0) > 0) b.push(`Inactive ${f.lastOrderOlderThanDays}+ days`);
  if ((f.weeklyRateGte ?? 0) > 0) b.push(`Weekly rate ≥ ${f.weeklyRateGte}`);
  if ((f.weeklyRateLt ?? 0) > 0) b.push(`Weekly rate < ${f.weeklyRateLt}`);
  if ((f.minCoins ?? 0) > 0) b.push(`Coins ≥ ${f.minCoins}`);
  if ((f.maxCoins ?? Infinity) < Infinity && f.maxCoins !== undefined) b.push(`Coins ≤ ${f.maxCoins}`);
  if ((f.registeredWithinDays ?? 0) > 0) b.push(`New (${f.registeredWithinDays}d)`);
  return b;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export const AdminPushNotificationModal: React.FC<AdminPushNotificationModalProps> = ({
  onClose,
  editingNotification,
  initialData,
}) => {
  const { showAlert } = useModal();
  const isEditMode = !!editingNotification;
  const initialSource = editingNotification || initialData;

  const getInitialTarget = (): 'helpers' | 'customers' | 'all' | 'specific' | 'segment' => {
    if (!initialSource?.userId) return 'helpers';
    if (initialSource.userId === 'all-helpers') return 'helpers';
    if (initialSource.userId === 'all-customers') return 'customers';
    if (initialSource.userId === 'all') return 'all';
    if (initialSource.userId.startsWith('segment:')) return 'segment';
    return 'specific';
  };

  const getInitialSegment = () => {
    if (initialSource?.userId?.startsWith('segment:')) {
      return initialSource.userId.replace('segment:', '');
    }
    return 'preset';
  };

  const getInitialUserUid = () => {
    if (
      initialSource?.userId &&
      !['all-helpers', 'all-customers', 'all'].includes(initialSource.userId) &&
      !initialSource.userId.startsWith('segment:')
    ) {
      return initialSource.userId;
    }
    return '';
  };

  const getInitialDate = () => {
    if (initialSource?.scheduledAt) {
      try {
        return new Date(initialSource.scheduledAt).toISOString().split('T')[0];
      } catch (_) {
        return new Date().toISOString().split('T')[0];
      }
    }
    return new Date().toISOString().split('T')[0];
  };

  const getInitialTime = () => {
    if (initialSource?.repeatTime) return initialSource.repeatTime;
    if (initialSource?.scheduledAt) {
      try {
        const d = new Date(initialSource.scheduledAt);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      } catch (_) {
        return '10:00';
      }
    }
    return '10:00';
  };

  /* ── Core state ──────────────────────────────────────────────────────────── */
  const [targetAudience, setTargetAudience] = useState<'helpers' | 'customers' | 'all' | 'specific' | 'segment'>(getInitialTarget);
  // 'preset' = classic quick dropdown; 'custom' = filter builder
  const [segmentMode, setSegmentMode] = useState<'preset' | 'custom'>('preset');
  const [selectedSegment, setSelectedSegment] = useState<string>(getInitialSegment());
  const [selectedUserUid, setSelectedUserUid] = useState<string>(getInitialUserUid());
  const [searchUserQuery, setSearchUserQuery] = useState<string>('');
  const [title, setTitle] = useState<string>(initialSource?.title || '');
  const [body, setBody] = useState<string>(initialSource?.body || '');
  const [orderId, setOrderId] = useState<string>(initialSource?.orderId || '');
  const [imageUrl, setImageUrl] = useState<string>(initialSource?.imageUrl || '');
  const [isSending, setIsSending] = useState<boolean>(false);

  /* ── Schedule state ─────────────────────────────────────────────────────── */
  const [sendTiming, setSendTiming] = useState<'now' | 'scheduled'>(
    initialSource?.isScheduled || initialSource?.scheduledAt ? 'scheduled' : 'now'
  );
  const [scheduledDate, setScheduledDate] = useState<string>(getInitialDate);
  const [scheduledTime, setScheduledTime] = useState<string>(getInitialTime);
  const [repeatFrequency, setRepeatFrequency] = useState<'NONE' | 'DAILY' | 'WEEKLY'>(
    initialSource?.repeatFrequency || 'NONE'
  );

  /* ── Custom segment filter state ─────────────────────────────────────────── */
  const [customFilters, setCustomFilters] = useState<CustomSegmentFilters>({});

  /* ── User search state ───────────────────────────────────────────────────── */
  const [isSearchingUser, setIsSearchingUser] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);

  /* ── User search effect ─────────────────────────────────────────────────── */
  React.useEffect(() => {
    if (!searchUserQuery.trim()) {
      setSearchResults([]);
      setIsSearchingUser(false);
      return;
    }

    setIsSearchingUser(true);
    const timer = setTimeout(async () => {
      try {
        const serverUsersList = await fallbackStore.getAllUsers();
        const q = searchUserQuery.toLowerCase().trim();
        const matched = serverUsersList.filter((u) => {
          if (!u) return false;
          return (
            (u.displayName && u.displayName.toLowerCase().includes(q)) ||
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.alternativePhone && u.alternativePhone.toLowerCase().includes(q)) ||
            (u.uid && u.uid.toLowerCase().includes(q))
          );
        }).slice(0, 30);
        setSearchResults(matched);
      } catch (err) {
        console.error('Error fetching users from server:', err);
      } finally {
        setIsSearchingUser(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchUserQuery]);

  /* ── Presets ────────────────────────────────────────────────────────────── */
  const presets = [
    { label: 'অফার বা আপডেট', title: 'জামানট বিশেষ আপডেট!', body: 'প্রিয় গ্রাহক, জামানট-এর মাধ্যমে দ্রুত ডেলিভারি সেবায় আপনাকে স্বাগতম।' },
    { label: 'হেলপার অ্যালার্ট', title: 'নতুন রিকোয়েস্ট সতর্কবার্তা!', body: 'আপনার এলাকায় নতুন অর্ডার উপলব্ধ রয়েছে। এখনই রিকোয়েস্ট চেক করুন।' },
    { label: 'হেলপার বোনাস', title: 'হেলপারদের জন্য বিশেষ বোনাস!', body: 'আজকে বেশি ডেলিভারি করে পান আকর্ষণীয় অতিরিক্ত বোনাস!' },
    { label: 'সিস্টেম মেইনটেন্যান্স', title: 'সিস্টেম মেইনটেন্যান্স নোটিশ', body: 'সাময়িক সময়ের জন্য সিস্টেম সার্ভিস আপডেট করা হচ্ছে।' },
  ];

  const handleApplyPreset = (preset: { title: string; body: string }) => {
    setTitle(preset.title);
    setBody(preset.body);
  };

  /* ── Custom filter updater ──────────────────────────────────────────────── */
  const updateFilter = (key: keyof CustomSegmentFilters, raw: string) => {
    const num = raw === '' ? undefined : parseInt(raw, 10);
    setCustomFilters((prev) => ({ ...prev, [key]: num }));
  };

  /* ── Build effective segment key ─────────────────────────────────────────── */
  const effectiveSegmentKey = segmentMode === 'custom'
    ? encodeCustomSegment(customFilters)
    : selectedSegment;

  /* ── Send handler ────────────────────────────────────────────────────────── */
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      showAlert('ভুল তথ্য', 'দয়া করে নোটিফিকেশনের শিরোনাম এবং বিস্তারিত বিবরণ লিখুন।', 'warning');
      return;
    }
    if (targetAudience === 'specific' && !selectedUserUid) {
      showAlert('ইউজার সিলেক্ট করুন', 'দয়া করে নোটিফিকেশন পাঠানোর জন্য একজন নির্দিষ্ট ইউজার সিলেক্ট করুন।', 'warning');
      return;
    }
    if (targetAudience === 'segment' && segmentMode === 'custom' && filterBadges(customFilters).length === 0) {
      showAlert('ফিল্টার যোগ করুন', 'অন্তত একটি অডিয়েন্স ফিল্টার সিলেক্ট করুন।', 'warning');
      return;
    }

    setIsSending(true);
    try {
      const targetKey =
        targetAudience === 'specific'
          ? selectedUserUid
          : targetAudience === 'segment'
          ? `segment:${effectiveSegmentKey}`
          : targetAudience;

      let scheduledAtIso: string | undefined = undefined;
      if (sendTiming === 'scheduled' && scheduledDate && scheduledTime) {
        const [h, m] = scheduledTime.split(':').map(Number);
        const schedObj = new Date(scheduledDate);
        schedObj.setHours(h || 0, m || 0, 0, 0);
        scheduledAtIso = schedObj.toISOString();
      }

      if (isEditMode && editingNotification) {
        const isFutureScheduled = scheduledAtIso ? new Date(scheduledAtIso).getTime() > Date.now() : false;
        let mappedTarget = targetKey;
        if (targetAudience === 'helpers') mappedTarget = 'all-helpers';
        if (targetAudience === 'customers') mappedTarget = 'all-customers';

        await fallbackStore.updateScheduledNotification(editingNotification.id, {
          userId: mappedTarget,
          title: title.trim(),
          body: body.trim(),
          orderId: orderId.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          scheduledAt: scheduledAtIso,
          isScheduled: isFutureScheduled || (repeatFrequency && repeatFrequency !== 'NONE'),
          repeatFrequency,
          repeatTime: scheduledTime,
        });

        showAlert('নোটিফিকেশন আপডেট সম্পন্ন!', 'সিডিউলকৃত নোটিফিকেশনের সকল তথ্য সফলভাবে পরিবর্তন করা হয়েছে।', 'success');
        onClose();
        return;
      }

      await fallbackStore.sendAdminPushNotification(
        targetKey,
        title.trim(),
        body.trim(),
        orderId.trim() || undefined,
        imageUrl.trim() || undefined,
        scheduledAtIso,
        repeatFrequency,
        scheduledTime
      );

      let audienceLabel = 'সকল হেলপারদের';
      if (targetAudience === 'customers') audienceLabel = 'সকল কাস্টমারদের';
      if (targetAudience === 'all') audienceLabel = 'সকল গ্রাহক ও হেলপারদের';
      if (targetAudience === 'segment') {
        if (segmentMode === 'custom') {
          const badges = filterBadges(customFilters);
          audienceLabel = `কাস্টম সেগমেন্ট [${badges.join(', ')}]-এর কাস্টমারদের`;
        } else {
          const segLabels: Record<string, string> = {
            MULTIPLE_ORDERS: 'কমপক্ষে ২ বার অর্ডারকারী কাস্টমারদের',
            WEEKLY_2_ORDERS: 'সপ্তাহে ২+ বার অর্ডারকারী কাস্টমারদের',
            WEEKLY_1_ORDERS: 'সপ্তাহে ১+ বার অর্ডারকারী কাস্টমারদের',
            RARE_ORDERS_WEEK: 'সপ্তাহে ১ বারও অর্ডার না করা কাস্টমারদের',
            RARE_ORDERS_MONTH: 'মাসে ১ বারও অর্ডার না করা কাস্টমারদের',
            INACTIVE_1_WEEK: '১ সপ্তাহ যাবত কোনো অর্ডার না করা কাস্টমারদের',
            INACTIVE_2_WEEKS: '২ সপ্তাহ যাবত কোনো অর্ডার না করা কাস্টমারদের',
            NEVER_ORDERED: 'কখনো অর্ডার না করা কাস্টমারদের',
            NEW_REGISTERED: 'নতুন নিবন্ধিত গ্রাহকদের',
          };
          audienceLabel = `অডিয়েন্স গ্রুপ "${segLabels[selectedSegment] || selectedSegment}"-এর কাস্টমারদের`;
        }
      }
      if (targetAudience === 'specific') {
        const u = fallbackStore.users.get(selectedUserUid);
        audienceLabel = u ? `ইউজার "${u.displayName || u.email}"-কে` : 'নির্দিষ্ট ইউজারকে';
      }

      if (sendTiming === 'scheduled') {
        showAlert('নোটিফিকেশন সিডিউল সম্পন্ন!', `${audienceLabel} নির্দিষ্ট সময়ে (${scheduledDate} ${scheduledTime}) পাঠানোর জন্য সিডিউল করা হয়েছে।`, 'success');
      } else {
        showAlert('পুশ নোটিফিকেশন প্রেরিত!', `${audienceLabel} সফলভাবে নোটিফিকেশন পাঠানো হয়েছে।`, 'success');
      }
      onClose();
    } catch (err: any) {
      showAlert('প্রেরণ ব্যর্থ', err?.message || 'নোটিফিকেশন পাঠাতে সমস্যা হয়েছে।', 'error');
    } finally {
      setIsSending(false);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────
   * Render
   * ─────────────────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* ── Header ── */}
        <div className="p-5 border-b border-purple-900/10 flex items-center justify-between bg-gradient-to-r from-purple-950 via-purple-900 to-purple-950 text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-purple-800/80 border border-purple-700 shadow-md">
              <Bell className="w-6 h-6 text-purple-200 animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight">
                {isEditMode ? 'Edit Scheduled Notification' : 'Create & Send Push Notification'}
              </h3>
              <p className="text-xs text-purple-200">
                {isEditMode
                  ? 'Modify target audience, message details or scheduled release timing'
                  : 'Send real-time PWA push notification to target audiences'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-rose-500/80 hover:bg-rose-600 text-white transition-colors shadow-sm"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSend} className="p-5 overflow-y-auto space-y-5 flex-1">

          {/* ── 1. Target Audience tabs ── */}
          <div>
            <label className="block font-extrabold text-xs text-gray-800 mb-2 uppercase tracking-wider">
              1. Select Audience Target (কার নিকট পাঠাবেন)
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(
                [
                  { key: 'helpers',  Icon: UserCheck,      label: 'Helpers Only',  sub: 'সকল অনুমোদিত হেলপার' },
                  { key: 'customers',Icon: Users,           label: 'Customers',     sub: 'সকল গ্রাহকবৃন্দ' },
                  { key: 'all',      Icon: Sparkles,        label: 'Everyone',      sub: 'সকল ইউজার' },
                  { key: 'segment',  Icon: SlidersHorizontal, label: 'Segment',    sub: 'অডিয়েন্স গ্রুপ' },
                  { key: 'specific', Icon: ShieldAlert,     label: 'Single User',   sub: 'নির্দিষ্ট ইউজার' },
                ] as const
              ).map(({ key, Icon, label, sub }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTargetAudience(key)}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    targetAudience === key
                      ? 'bg-purple-900 text-white border-purple-900 shadow-md'
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-1" />
                  <div>
                    <div className="font-extrabold text-xs">{label}</div>
                    <div className="text-[10px] opacity-80">{sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Segment panel ── */}
          {targetAudience === 'segment' && (
            <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-200 space-y-4 animate-in fade-in duration-200">

              {/* Mode toggle */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSegmentMode('preset')}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold border transition-all ${
                    segmentMode === 'preset'
                      ? 'bg-purple-900 text-white border-purple-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}
                >
                  Quick Presets
                </button>
                <button
                  type="button"
                  onClick={() => setSegmentMode('custom')}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold border transition-all flex items-center justify-center gap-1.5 ${
                    segmentMode === 'custom'
                      ? 'bg-purple-900 text-white border-purple-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Custom Filter Builder
                </button>
              </div>

              {/* ── Preset dropdown ── */}
              {segmentMode === 'preset' && (
                <div>
                  <label className="block font-bold text-xs text-purple-950 mb-1.5">
                    অডিয়েন্স সেগমেন্ট নির্বাচন করুন:
                  </label>
                  <select
                    value={selectedSegment}
                    onChange={(e) => setSelectedSegment(e.target.value)}
                    className="w-full p-3 bg-white border border-purple-200 rounded-xl text-xs font-bold focus:outline-none focus:border-purple-600"
                  >
                    <optgroup label="Order Frequency">
                      <option value="MULTIPLE_ORDERS">Ordered Multiple Times (2+ total orders)</option>
                      <option value="WEEKLY_2_ORDERS">Frequent: Weekly 2+ Orders</option>
                      <option value="WEEKLY_1_ORDERS">Frequent: Weekly 1+ Orders</option>
                      <option value="RARE_ORDERS_WEEK">Low Frequency: &lt;1 order/week</option>
                      <option value="RARE_ORDERS_MONTH">Low Frequency: &lt;1 order/month</option>
                    </optgroup>
                    <optgroup label="Inactivity">
                      <option value="INACTIVE_1_WEEK">Inactive: No order since 1 week</option>
                      <option value="INACTIVE_2_WEEKS">Inactive: No order since 2 weeks</option>
                    </optgroup>
                    <optgroup label="Other">
                      <option value="NEVER_ORDERED">Never Ordered (0 orders)</option>
                      <option value="NEW_REGISTERED">New Registered (last 7 days)</option>
                    </optgroup>
                  </select>
                </div>
              )}

              {/* ── Custom filter builder ── */}
              {segmentMode === 'custom' && (
                <div className="space-y-4 animate-in fade-in duration-200">

                  {/* Active badges */}
                  {filterBadges(customFilters).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {filterBadges(customFilters).map((b, i) => (
                        <span
                          key={i}
                          className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-purple-900 text-white"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* ── Order frequency ── */}
                  <div className="bg-white rounded-xl border border-purple-100 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1.5 bg-indigo-100 rounded-lg">
                        <BarChart2 className="w-3.5 h-3.5 text-indigo-700" />
                      </div>
                      <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Order Frequency</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                          Min Total Orders (≥)
                        </label>
                        <select
                          value={customFilters.minOrders ?? ''}
                          onChange={(e) => updateFilter('minOrders', e.target.value)}
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Any</option>
                          <option value="1">≥ 1 order</option>
                          <option value="2">≥ 2 orders</option>
                          <option value="5">≥ 5 orders</option>
                          <option value="10">≥ 10 orders</option>
                          <option value="20">≥ 20 orders</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                          Max Total Orders (≤)
                        </label>
                        <select
                          value={customFilters.maxOrders ?? ''}
                          onChange={(e) => updateFilter('maxOrders', e.target.value)}
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Any</option>
                          <option value="0">= 0 (never ordered)</option>
                          <option value="1">≤ 1 order</option>
                          <option value="3">≤ 3 orders</option>
                          <option value="5">≤ 5 orders</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                          Weekly Rate (≥)
                        </label>
                        <select
                          value={customFilters.weeklyRateGte ?? ''}
                          onChange={(e) => updateFilter('weeklyRateGte', e.target.value)}
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Any</option>
                          <option value="1">≥ 1/week</option>
                          <option value="2">≥ 2/week</option>
                          <option value="3">≥ 3/week</option>
                          <option value="5">≥ 5/week</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                          Weekly Rate (under)
                        </label>
                        <select
                          value={customFilters.weeklyRateLt ?? ''}
                          onChange={(e) => updateFilter('weeklyRateLt', e.target.value)}
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Any</option>
                          <option value="1">&lt; 1/week</option>
                          <option value="2">&lt; 2/week</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* ── Last order / recency ── */}
                  <div className="bg-white rounded-xl border border-purple-100 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1.5 bg-teal-100 rounded-lg">
                        <CalendarClock className="w-3.5 h-3.5 text-teal-700" />
                      </div>
                      <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Last Order Recency</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                          Ordered within last N days
                        </label>
                        <select
                          value={customFilters.lastOrderWithinDays ?? ''}
                          onChange={(e) => updateFilter('lastOrderWithinDays', e.target.value)}
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Any</option>
                          <option value="1">Last 1 day (today)</option>
                          <option value="3">Last 3 days</option>
                          <option value="7">Last 7 days (1 week)</option>
                          <option value="14">Last 14 days (2 weeks)</option>
                          <option value="30">Last 30 days (1 month)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                          Inactive (no order for N+ days)
                        </label>
                        <select
                          value={customFilters.lastOrderOlderThanDays ?? ''}
                          onChange={(e) => updateFilter('lastOrderOlderThanDays', e.target.value)}
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Any</option>
                          <option value="3">3+ days inactive</option>
                          <option value="7">7+ days inactive</option>
                          <option value="14">14+ days inactive</option>
                          <option value="30">30+ days inactive</option>
                          <option value="60">60+ days inactive</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* ── Coins ── */}
                  <div className="bg-white rounded-xl border border-purple-100 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1.5 bg-amber-100 rounded-lg">
                        <TrendingUp className="w-3.5 h-3.5 text-amber-700" />
                      </div>
                      <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Coin Balance</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                          Min Coins (≥)
                        </label>
                        <select
                          value={customFilters.minCoins ?? ''}
                          onChange={(e) => updateFilter('minCoins', e.target.value)}
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Any</option>
                          <option value="1">≥ 1 coin (has coins)</option>
                          <option value="10">≥ 10 coins</option>
                          <option value="25">≥ 25 coins</option>
                          <option value="50">≥ 50 coins</option>
                          <option value="100">≥ 100 coins</option>
                          <option value="200">≥ 200 coins</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                          Max Coins (≤)
                        </label>
                        <select
                          value={customFilters.maxCoins ?? ''}
                          onChange={(e) => updateFilter('maxCoins', e.target.value)}
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Any</option>
                          <option value="0">= 0 coins (no coins)</option>
                          <option value="10">≤ 10 coins</option>
                          <option value="25">≤ 25 coins</option>
                          <option value="50">≤ 50 coins</option>
                          <option value="100">≤ 100 coins</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* ── Registration recency ── */}
                  <div className="bg-white rounded-xl border border-purple-100 p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-emerald-100 rounded-lg">
                        <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                      </div>
                      <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Registration Recency</span>
                    </div>
                    <select
                      value={customFilters.registeredWithinDays ?? ''}
                      onChange={(e) => updateFilter('registeredWithinDays', e.target.value)}
                      className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-purple-500"
                    >
                      <option value="">Any (all ages)</option>
                      <option value="1">Registered today</option>
                      <option value="3">Registered last 3 days</option>
                      <option value="7">Registered last 7 days</option>
                      <option value="14">Registered last 14 days</option>
                      <option value="30">Registered last 30 days</option>
                    </select>
                  </div>

                  {/* Clear all */}
                  {filterBadges(customFilters).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCustomFilters({})}
                      className="text-[11px] font-bold text-rose-500 hover:text-rose-700 underline"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Specific user search ── */}
          {targetAudience === 'specific' && (() => {
            const selectedUserObj = selectedUserUid ? fallbackStore.users.get(selectedUserUid) : null;
            return (
              <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200 space-y-2">
                <label className="block font-bold text-xs text-purple-950">নির্দিষ্ট ইউজার নির্বাচন করুন:</label>
                {selectedUserObj ? (
                  <div className="p-3 bg-white rounded-xl border border-purple-300 flex items-center justify-between shadow-xs">
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      <div className="p-2 bg-purple-900 text-white rounded-lg font-bold text-xs">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden">
                        <div className="font-extrabold text-xs text-gray-900 truncate">
                          {selectedUserObj.displayName || 'ইউজার'}
                        </div>
                        <div className="text-[10px] text-purple-700 font-mono truncate">
                          {selectedUserObj.email || selectedUserObj.alternativePhone || selectedUserObj.uid}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedUserUid(''); setSearchUserQuery(''); }}
                      className="p-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 font-extrabold text-xs shrink-0 transition-colors"
                    >
                      পরিবর্তন করুন
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-purple-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="ইউজারের নাম, ইমেইল, আইডি বা ফোন দিয়ে খুঁজুন..."
                        value={searchUserQuery}
                        onChange={(e) => setSearchUserQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-purple-200 rounded-xl text-xs focus:outline-none focus:border-purple-600"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 pt-1">
                      {isSearchingUser ? (
                        <p className="text-xs text-purple-700 font-bold py-3 text-center animate-pulse">সার্ভার থেকে ইউজার খোঁজা হচ্ছে...</p>
                      ) : !searchUserQuery.trim() ? (
                        <p className="text-xs text-gray-500 py-3 text-center">ইউজারের নাম, ইমেইল, আইডি বা ফোন লিখে খুঁজুন...</p>
                      ) : searchResults.length === 0 ? (
                        <p className="text-xs text-rose-600 py-3 text-center font-semibold">সার্ভারে কোনো ইউজার পাওয়া যায়নি</p>
                      ) : (
                        searchResults.map((u, idx) => {
                          const userId = u.uid || `user-${idx}`;
                          return (
                            <button
                              key={userId}
                              type="button"
                              onClick={() => { setSelectedUserUid(userId); setSearchUserQuery(''); }}
                              className={`w-full text-left p-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                                selectedUserUid === userId
                                  ? 'bg-purple-900 text-white font-bold'
                                  : 'bg-white hover:bg-purple-100 text-gray-800 border border-purple-100'
                              }`}
                            >
                              <div className="overflow-hidden">
                                <div className="font-extrabold truncate">{u.displayName || 'ইউজার'}</div>
                                <div className="text-[10px] opacity-75 font-mono truncate">
                                  {u.email ? `${u.email} • ` : ''}{u.alternativePhone ? `${u.alternativePhone} • ` : ''}ID: {userId}
                                </div>
                              </div>
                              {selectedUserUid === userId
                                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                                : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 shrink-0">সিলেক্ট করুন</span>
                              }
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── 2. Quick Presets ── */}
          <div>
            <label className="block font-extrabold text-xs text-gray-800 mb-1.5 uppercase tracking-wider">
              2. Quick Template Presets (দ্রুত বার্তা টেমপ্লেট)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className="py-1 px-3 rounded-full bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 text-[11px] font-bold transition-all"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── 3. Title ── */}
          <div>
            <label className="block font-extrabold text-xs text-gray-800 mb-1 uppercase tracking-wider">
              3. Title (শিরোনাম) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. নতুন রিকোয়েস্ট তৈরি হয়েছে!"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-purple-600 focus:bg-white focus:ring-4 focus:ring-purple-600/10"
            />
          </div>

          {/* ── 4. Body ── */}
          <div>
            <label className="block font-extrabold text-xs text-gray-800 mb-1 uppercase tracking-wider">
              4. Notification Body (বার্তা বিবরণ) <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="e.g. আপনার নিকটস্থ এলাকায় ১টি নতুন ডেলিভারি রিকোয়েস্ট তৈরি হয়েছে। একসেপ্ট করতে অ্যাপ খুলুন।"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-purple-600 focus:bg-white focus:ring-4 focus:ring-purple-600/10"
            />
          </div>

          {/* ── 5. Delivery Timing ── */}
          <div className="p-4 bg-purple-50/70 rounded-2xl border border-purple-200 space-y-3">
            <label className="block font-extrabold text-xs text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-700" />
              <span>5. Delivery Timing & Schedule (নোটিফিকেশনের সময়কাল)</span>
            </label>

            <div className="grid grid-cols-2 gap-2 bg-white p-1 rounded-xl border border-purple-200">
              <button
                type="button"
                onClick={() => { setSendTiming('now'); setRepeatFrequency('NONE'); }}
                className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center space-x-1.5 transition-all ${
                  sendTiming === 'now' ? 'bg-purple-900 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Immediately (সরাসরি)</span>
              </button>
              <button
                type="button"
                onClick={() => setSendTiming('scheduled')}
                className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center space-x-1.5 transition-all ${
                  sendTiming === 'scheduled' ? 'bg-purple-900 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Schedule Specific Time</span>
              </button>
            </div>

            {sendTiming === 'scheduled' && (
              <div className="space-y-3 pt-2 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-extrabold text-purple-900 uppercase block mb-1">Scheduled Date (তারিখ)</label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full p-3 bg-white border border-purple-200 rounded-xl text-xs font-bold focus:border-purple-600 outline-none"
                    />
                  </div>
                  <div>
                    <TimePickerInput
                      label="Exact Schedule Time (নির্দিষ্ট সময়)*"
                      value={scheduledTime}
                      onChange={(val) => setScheduledTime(val)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold text-purple-900 uppercase block mb-1 flex items-center gap-1">
                    <Repeat className="w-3 h-3 text-purple-600" />
                    <span>Repeat Schedule (পুনরাবৃত্তি অপশন)</span>
                  </label>
                  <select
                    value={repeatFrequency}
                    onChange={(e) => setRepeatFrequency(e.target.value as any)}
                    className="w-full p-2.5 bg-white border border-purple-200 rounded-xl text-xs font-extrabold focus:border-purple-600"
                  >
                    <option value="NONE">One-time Only (শুধুমাত্র একবার)</option>
                    <option value="DAILY">Repeat Daily at Exact Time (প্রতিদিন এই সময়ে)</option>
                    <option value="WEEKLY">Repeat Weekly at Exact Time (প্রতি সপ্তাহে এই সময়ে)</option>
                  </select>
                </div>

                <p className="text-[11px] font-semibold text-purple-900 bg-purple-100/80 p-2.5 rounded-xl border border-purple-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-purple-700 shrink-0" />
                  <span>
                    নির্দিষ্ট সময়ে ({scheduledDate} {scheduledTime}) স্বয়ংক্রিয়ভাবে গ্রাহক/হেলপারদের ডিভাইসে নোটিফিকেশন পৌঁছে যাবে।
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* ── 6. Optional Order ID ── */}
          <div>
            <label className="block font-extrabold text-xs text-gray-800 mb-1 uppercase tracking-wider">
              6. Optional Order ID Reference (ঐচ্ছিক অর্ডার আইডি)
            </label>
            <input
              type="text"
              placeholder="e.g. ORD-1002 (ঐচ্ছিক)"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:border-purple-600 focus:bg-white"
            />
          </div>

          {/* ── 7. Banner Image ── */}
          <div className="space-y-2">
            <label className="block font-extrabold text-xs text-gray-800 uppercase tracking-wider">
              7. Banner Image (ঐচ্ছিক ব্যানার ইমেজ)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="ইমেজ ইউআরএল পেস্ট করুন (Paste Image URL)..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:border-purple-600 focus:bg-white"
              />
              <label className="shrink-0 cursor-pointer px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-200 rounded-xl text-xs font-extrabold flex items-center justify-center transition-colors">
                <span>Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setImageUrl(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>
            {imageUrl && (
              <div className="relative mt-2 rounded-xl overflow-hidden border border-gray-200 max-h-36 bg-gray-50 flex items-center justify-center">
                <img src={imageUrl} alt="Uploaded preview" className="max-h-36 object-contain" />
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-rose-600/90 hover:bg-rose-700 text-white transition-colors shadow-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* ── Live Preview ── */}
          <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-inner space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>PWA Mobile Notification Preview</span>
              </span>
              <span>Just now</span>
            </div>
            <div className="flex items-start space-x-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700/80">
              <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center font-extrabold text-xs shrink-0 shadow">
                J
              </div>
              <div className="space-y-0.5 overflow-hidden flex-1">
                <div className="font-extrabold text-xs text-white truncate">
                  {title || 'Notification Title Preview'}
                </div>
                <div className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                  {body || 'Your custom message text will be displayed here on helper/customer mobile screens...'}
                </div>
              </div>
              {imageUrl && (
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-slate-700">
                  <img src={imageUrl} alt="Notification banner preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-5 rounded-2xl bg-rose-50 hover:bg-rose-100 font-extrabold text-xs text-rose-600 border border-rose-200 active:scale-95 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending || !title || !body}
              className="py-2.5 px-6 rounded-2xl bg-purple-900 hover:bg-purple-950 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg shadow-purple-950/20 flex items-center space-x-2 transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSending
                  ? isEditMode ? 'Updating...' : 'Sending Push...'
                  : isEditMode
                  ? 'Save & Update Notification'
                  : sendTiming === 'scheduled'
                  ? 'Schedule Notification'
                  : 'Send Push Notification Now'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
