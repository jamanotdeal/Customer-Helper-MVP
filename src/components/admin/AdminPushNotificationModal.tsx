'use client';

import React, { useState } from 'react';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import { Bell, Send, X, Users, UserCheck, ShieldAlert, Sparkles, CheckCircle2, Search } from 'lucide-react';

interface AdminPushNotificationModalProps {
  onClose: () => void;
}

export const AdminPushNotificationModal: React.FC<AdminPushNotificationModalProps> = ({ onClose }) => {
  const { showAlert } = useModal();
  const [targetAudience, setTargetAudience] = useState<'helpers' | 'customers' | 'all' | 'specific'>('helpers');
  const [selectedUserUid, setSelectedUserUid] = useState<string>('');
  const [searchUserQuery, setSearchUserQuery] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);

  // List all registered users for specific user selection
  const allUsers = Array.from(fallbackStore.users.values());
  const filteredUsers = allUsers.filter(
    (u) =>
      u.displayName?.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      u.alternativePhone?.includes(searchUserQuery) ||
      u.uid.includes(searchUserQuery)
  );

  const presets = [
    { label: 'অফার বা আপডেট', title: 'জামানট বিশেষ আপডেট!', body: 'প্রিয় গ্রাহক, জামানট-এর মাধ্যমে দ্রুত ডেলিভারি সেবায় আপনাকে স্বাগতম।' },
    { label: 'হেলপার অ্যালার্ট', title: 'নতুন রিকোয়েস্ট সতর্কবার্তা!', body: 'আপনার এলাকায় নতুন অর্ডার উপলব্ধ রয়েছে। এখনই রিকোয়েস্ট চেক করুন।' },
    { label: 'হেলপার বোনাস', title: 'হেলপারদের জন্য বিশেষ বোনাস!', body: 'আজকে বেশি ডেলিভারি করে পান আকর্ষণীয় অতিরিক্ত বোনাস!' },
    { label: 'সিস্টেম নোটিশ', title: 'সিস্টেম মেইনটেন্যান্স নোটিশ', body: 'সাময়িক সময়ের জন্য সিস্টেম সার্ভিস আপডেট করা হচ্ছে।' },
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
      const targetKey = targetAudience === 'specific' ? selectedUserUid : targetAudience;
      await fallbackStore.sendAdminPushNotification(targetKey, title.trim(), body.trim(), orderId.trim() || undefined);

      let audienceLabel = 'সকল হেলপারদের';
      if (targetAudience === 'customers') audienceLabel = 'সকল কাস্টমারদের';
      if (targetAudience === 'all') audienceLabel = 'সকল গ্রাহক ও হেলপারদের';
      if (targetAudience === 'specific') {
        const u = fallbackStore.users.get(selectedUserUid);
        audienceLabel = u ? `ইউজার "${u.displayName || u.email}"-কে` : 'নির্দিষ্ট ইউজারকে';
      }

      showAlert('পুশ নোটিফিকেশন প্রেরিত!', `${audienceLabel} সফলভাবে নোটিফিকেশন পাঠানো হয়েছে।`, 'success');
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                  filteredUsers.map((u) => (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => setSelectedUserUid(u.uid)}
                      className={`w-full text-left p-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                        selectedUserUid === u.uid
                          ? 'bg-purple-900 text-white font-bold'
                          : 'bg-white hover:bg-purple-100 text-gray-800'
                      }`}
                    >
                      <div>
                        <div>{u.displayName || u.email || 'ইউজার'}</div>
                        <div className="text-[10px] opacity-75">{u.email || u.alternativePhone || u.uid}</div>
                      </div>
                      {selectedUserUid === u.uid && <CheckCircle2 className="w-4 h-4" />}
                    </button>
                  ))
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

          {/* Optional Order ID */}
          <div>
            <label className="block font-extrabold text-xs text-gray-800 mb-1 uppercase tracking-wider">
              5. Optional Order ID Reference (ঐচ্ছিক অর্ডার আইডি)
            </label>
            <input
              type="text"
              placeholder="e.g. ORD-1002 (ঐচ্ছিক)"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:border-purple-600 focus:bg-white"
            />
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
              <div className="space-y-0.5 overflow-hidden">
                <div className="font-extrabold text-xs text-white truncate">
                  {title || 'Notification Title Preview'}
                </div>
                <div className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                  {body || 'Your custom message text will be displayed here on helper/customer mobile screens...'}
                </div>
              </div>
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
