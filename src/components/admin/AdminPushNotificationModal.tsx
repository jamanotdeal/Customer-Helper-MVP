import React, { useState } from 'react';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import { Bell, Send, X, Users, UserCheck, ShieldAlert, Sparkles, CheckCircle2, Search, Clock, Calendar, Repeat } from 'lucide-react';
import { TimePickerInput } from './TimePickerInput';

interface AdminPushNotificationModalProps {
  onClose: () => void;
}

export const AdminPushNotificationModal: React.FC<AdminPushNotificationModalProps> = ({ onClose }) => {
  const { showAlert } = useModal();
  const [targetAudience, setTargetAudience] = useState<'helpers' | 'customers' | 'all' | 'specific' | 'segment'>('helpers');
  const [selectedSegment, setSelectedSegment] = useState<string>('MULTIPLE_ORDERS');
  const [selectedUserUid, setSelectedUserUid] = useState<string>('');
  const [searchUserQuery, setSearchUserQuery] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);

  // Scheduled Notification state
  const [sendTiming, setSendTiming] = useState<'now' | 'scheduled'>('now');
  const [scheduledDate, setScheduledDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState<string>('10:00');
  const [repeatFrequency, setRepeatFrequency] = useState<'NONE' | 'DAILY' | 'WEEKLY'>('NONE');

  // List all registered users for specific user selection
  const allUsers = Array.from(fallbackStore.users.values()).filter(Boolean);
  const filteredUsers = allUsers.filter(
    (u) =>
      Boolean(u) &&
      ((u.displayName && u.displayName.toLowerCase().includes(searchUserQuery.toLowerCase())) ||
        (u.email && u.email.toLowerCase().includes(searchUserQuery.toLowerCase())) ||
        (u.alternativePhone && u.alternativePhone.includes(searchUserQuery)) ||
        (u.uid && u.uid.includes(searchUserQuery)))
  );

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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      showAlert('ভুল তথ্য', 'দয়া করে নোটিফিকেশনের শিরোনাম এবং বিস্তারিত বিবরণ লিখুন।', 'warning');
      return;
    }

    if (targetAudience === 'specific' && !selectedUserUid) {
      showAlert('ইউজার সিলেক্ট করুন', 'দয়া করে নোটিফিকেশন পাঠানোর জন্য একজন নির্দিষ্ট ইউজার সিলেক্ট করুন।', 'warning');
      return;
    }

    setIsSending(true);
    try {
      const targetKey = targetAudience === 'specific' 
        ? selectedUserUid 
        : (targetAudience === 'segment' ? `segment:${selectedSegment}` : targetAudience);

      let scheduledAtIso: string | undefined = undefined;
      if (sendTiming === 'scheduled' && scheduledDate && scheduledTime) {
        const [h, m] = scheduledTime.split(':').map(Number);
        const schedObj = new Date(scheduledDate);
        schedObj.setHours(h || 0, m || 0, 0, 0);
        scheduledAtIso = schedObj.toISOString();
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
        let segLabel = selectedSegment;
        if (selectedSegment === 'MULTIPLE_ORDERS') segLabel = 'কমপক্ষে ২ বার অর্ডারকারী কাস্টমারদের';
        else if (selectedSegment === 'WEEKLY_2_ORDERS') segLabel = 'সপ্তাহে ২+ বার অর্ডারকারী কাস্টমারদের';
        else if (selectedSegment === 'WEEKLY_1_ORDERS') segLabel = 'সপ্তাহে ১+ বার অর্ডারকারী কাস্টমারদের';
        else if (selectedSegment === 'RARE_ORDERS_WEEK') segLabel = 'সপ্তাহে ১ বারও অর্ডার না করা কাস্টমারদের';
        else if (selectedSegment === 'RARE_ORDERS_MONTH') segLabel = 'মাসে ১ বারও অর্ডার না করা কাস্টমারদের';
        else if (selectedSegment === 'INACTIVE_1_WEEK') segLabel = '১ সপ্তাহ যাবত কোনো অর্ডার না করা কাস্টমারদের';
        else if (selectedSegment === 'INACTIVE_2_WEEKS') segLabel = '২ সপ্তাহ যাবত কোনো অর্ডার না করা কাস্টমারদের';
        else if (selectedSegment === 'NEVER_ORDERED') segLabel = 'কখনো অর্ডার না করা কাস্টমারদের';
        else if (selectedSegment === 'NEW_REGISTERED') segLabel = 'নতুন নিবন্ধিত গ্রাহকদের';
        audienceLabel = `অডিয়েন্স গ্রুপ "${segLabel}"-এর কাস্টমারদের`;
      }
      if (targetAudience === 'specific') {
        const u = fallbackStore.users.get(selectedUserUid);
        audienceLabel = u ? `ইউজার "${u.displayName || u.email}"-কে` : 'নির্দিষ্ট ইউজারকে';
      }

      if (sendTiming === 'scheduled') {
        showAlert('নোটিফিকেশন সিডিউল সম্পন্ন!', `${audienceLabel} নির্দিষ্ট সময়ে (${scheduledDate} ${scheduledTime}) পাঠানোর জন্য সিডিউল করা হয়েছে।`, 'success');
      } else {
        showAlert('পুশ নোটিফিকেশন প্রেরিত!', `${audienceLabel} সফলভাবে নোটিফিকেশন পাঠানো হয়েছে।`, 'success');
      }
      onClose();
    } catch (err: any) {
      showAlert('প্রেরণ ব্যর্থ', err?.message || 'নোটিফিকেশন পাঠাতে সমস্যা হয়েছে।', 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-purple-900/10 flex items-center justify-between bg-gradient-to-r from-purple-950 via-purple-900 to-purple-950 text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-purple-800/80 border border-purple-700 shadow-md">
              <Bell className="w-6 h-6 text-purple-200 animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight">Create & Send Push Notification</h3>
              <p className="text-xs text-purple-200">Send real-time PWA push notification to target audiences</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Form */}
        <form onSubmit={handleSend} className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Target Audience Selector */}
          <div>
            <label className="block font-extrabold text-xs text-gray-800 mb-2 uppercase tracking-wider">
              1. Select Audience Target (কার নিকট পাঠাবেন)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => setTargetAudience('helpers')}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  targetAudience === 'helpers'
                    ? 'bg-purple-900 text-white border-purple-900 shadow-md'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <UserCheck className="w-5 h-5 mb-1" />
                <div>
                  <div className="font-extrabold text-xs">Helpers Only</div>
                  <div className="text-[10px] opacity-80">সকল অনুমোদিত হেলপার</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTargetAudience('customers')}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  targetAudience === 'customers'
                    ? 'bg-purple-900 text-white border-purple-900 shadow-md'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Users className="w-5 h-5 mb-1" />
                <div>
                  <div className="font-extrabold text-xs">Customers</div>
                  <div className="text-[10px] opacity-80">সকল গ্রাহকবৃন্দ</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTargetAudience('all')}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  targetAudience === 'all'
                    ? 'bg-purple-900 text-white border-purple-900 shadow-md'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Sparkles className="w-5 h-5 mb-1" />
                <div>
                  <div className="font-extrabold text-xs">Everyone</div>
                  <div className="text-[10px] opacity-80">সকল ইউজার</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTargetAudience('segment')}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  targetAudience === 'segment'
                    ? 'bg-purple-900 text-white border-purple-900 shadow-md'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Users className="w-5 h-5 mb-1 text-amber-300" />
                <div>
                  <div className="font-extrabold text-xs">Segment</div>
                  <div className="text-[10px] opacity-80">অডিয়েন্স গ্রুপ</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTargetAudience('specific')}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  targetAudience === 'specific'
                    ? 'bg-purple-900 text-white border-purple-900 shadow-md'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <ShieldAlert className="w-5 h-5 mb-1" />
                <div>
                  <div className="font-extrabold text-xs">Single User</div>
                  <div className="text-[10px] opacity-80">নির্দিষ্ট ইউজার</div>
                </div>
              </button>
            </div>
          </div>

          {/* Segment Selection if targeted */}
          {targetAudience === 'segment' && (
            <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200 space-y-2">
              <label className="block font-bold text-xs text-purple-950">অডিয়েন্স সেগমেন্ট নির্বাচন করুন:</label>
              <select
                value={selectedSegment}
                onChange={(e) => setSelectedSegment(e.target.value)}
                className="w-full p-3 bg-white border border-purple-200 rounded-xl text-xs font-bold focus:outline-none focus:border-purple-600 animate-in fade-in duration-200"
              >
                <option value="MULTIPLE_ORDERS">Ordered Multiple Times (2+ orders)</option>
                <option value="WEEKLY_2_ORDERS">Frequent: Weekly 2+ Orders</option>
                <option value="WEEKLY_1_ORDERS">Frequent: Weekly 1+ Orders</option>
                <option value="RARE_ORDERS_WEEK">Rare: &lt;1 order/week</option>
                <option value="RARE_ORDERS_MONTH">Rare: &lt;1 order/month</option>
                <option value="INACTIVE_1_WEEK">Inactive: No order since 1 week</option>
                <option value="INACTIVE_2_WEEKS">Inactive: No order since 2 weeks</option>
                <option value="NEVER_ORDERED">Never Ordered (0 orders)</option>
                <option value="NEW_REGISTERED">New Registered (last 7 days)</option>
              </select>
            </div>
          )}

          {/* Specific User Search if targeted */}
          {targetAudience === 'specific' && (
            <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200 space-y-2">
              <label className="block font-bold text-xs text-purple-950">নির্দিষ্ট ইউজার নির্বাচন করুন:</label>
              <div className="relative">
                <Search className="w-4 h-4 text-purple-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="ইউজারের নাম, ইমেইল বা ফোন দিয়ে খুঁজুন..."
                  value={searchUserQuery}
                  onChange={(e) => setSearchUserQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-purple-200 rounded-xl text-xs focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1 pt-1">
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-gray-500 py-2 text-center">কোনো ইউজার পাওয়া যায়নি</p>
                ) : (
                  filteredUsers.map((u, idx) => {
                    const userId = u.uid || `user-${idx}`;
                    return (
                      <button
                        key={userId}
                        type="button"
                        onClick={() => setSelectedUserUid(userId)}
                        className={`w-full text-left p-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                          selectedUserUid === userId
                            ? 'bg-purple-900 text-white font-bold'
                            : 'bg-white hover:bg-purple-100 text-gray-800'
                        }`}
                      >
                        <div>
                          <div>{u.displayName || u.email || 'ইউজার'}</div>
                          <div className="text-[10px] opacity-75">{u.email || u.alternativePhone || userId}</div>
                        </div>
                        {selectedUserUid === userId && <CheckCircle2 className="w-4 h-4" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Quick Presets */}
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

          {/* Notification Title */}
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

          {/* Notification Body */}
          <div>
            <label className="block font-extrabold text-xs text-gray-800 mb-1 uppercase tracking-wider">
              4. Notification Body (বার্তা বিবরণ) <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="e.g. আপনার নিকটস্থ এলাকায় ১টি নতুন ডেলিভারি রিকোয়েস্ট তৈরি হয়েছে। একসেপ্ট করতে অ্যাপ খুলুন।"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-purple-600 focus:bg-white focus:ring-4 focus:ring-purple-600/10"
            />
          </div>

          {/* Delivery Timing & Specific Time Selector */}
          <div className="p-4 bg-purple-50/70 rounded-2xl border border-purple-200 space-y-3">
            <label className="block font-extrabold text-xs text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-700" />
              <span>5. Delivery Timing & Schedule Time Selector (নোটিফিকেশনের সময়কাল)</span>
            </label>

            <div className="grid grid-cols-2 gap-2 bg-white p-1 rounded-xl border border-purple-200">
              <button
                type="button"
                onClick={() => {
                  setSendTiming('now');
                  setRepeatFrequency('NONE');
                }}
                className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center space-x-1.5 transition-all ${
                  sendTiming === 'now'
                    ? 'bg-purple-900 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Immediately (সরাসরি)</span>
              </button>

              <button
                type="button"
                onClick={() => setSendTiming('scheduled')}
                className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center space-x-1.5 transition-all ${
                  sendTiming === 'scheduled'
                    ? 'bg-purple-900 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Schedule Specific Time (নির্দিষ্ট সময়ে)</span>
              </button>
            </div>

            {sendTiming === 'scheduled' && (
              <div className="space-y-3 pt-2 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-extrabold text-purple-900 uppercase block mb-1">
                      Scheduled Date (তারিখ)
                    </label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full p-3 bg-white border border-purple-200 rounded-xl text-xs font-bold focus:border-purple-600 outline-none"
                    />
                  </div>

                  <div>
                    <TimePickerInput
                      label="Exact Schedule Time (নির্দিষ্ট সময়)*"
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
                    <option value="DAILY">Repeat Daily at Exact Time (প্রতিদিন এই সময়ে)</option>
                    <option value="WEEKLY">Repeat Weekly at Exact Time (প্রতি সপ্তাহে এই সময়ে)</option>
                  </select>
                </div>

                <p className="text-[11px] font-semibold text-purple-900 bg-purple-100/80 p-2.5 rounded-xl border border-purple-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-purple-700 shrink-0" />
                  <span>
                    নির্দিষ্ট সময়ে ({scheduledDate} {scheduledTime}) স্বয়ংক্রিয়ভাবে গ্রাহক/হেলপারদের ডিভাইসে নোটিফিকেশন পৌঁছে যাবে।
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Optional Order ID */}
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

          {/* Banner Image Input */}
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
                      reader.onloadend = () => {
                        setImageUrl(reader.result as string);
                      };
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
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Live Mobile Push Preview Card */}
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

          {/* Footer Submit Button */}
          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-5 rounded-2xl bg-gray-100 hover:bg-gray-200 font-extrabold text-xs text-gray-700 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSending || !title || !body}
              className="py-2.5 px-6 rounded-2xl bg-purple-900 hover:bg-purple-950 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg shadow-purple-950/20 flex items-center space-x-2 transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>{isSending ? 'Sending Push...' : 'Send Push Notification Now'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
