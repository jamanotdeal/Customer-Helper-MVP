'use client';

import React, { useState, useRef } from 'react';
import {
  AdminCustomModalConfig,
  ModalTargetPlatform,
  ModalTargetAudience,
  ModalTriggerEvent,
  ModalDisplayFrequency,
} from '@/types';
import { fallbackStore, uploadCustomModalImage } from '@/lib/firebase';
import {
  X,
  Sparkles,
  Check,
  AlertCircle,
  Clock,
  Calendar,
  Repeat,
  Upload,
  Image as ImageIcon,
  Link as LinkIcon,
  Smartphone,
  Globe,
  Loader2,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { TimePickerInput } from './TimePickerInput';

interface AdminCustomModalFormModalProps {
  modalToEdit?: AdminCustomModalConfig | null;
  onClose: () => void;
  onSaved?: () => void;
}

export const AdminCustomModalFormModal: React.FC<AdminCustomModalFormModalProps> = ({
  modalToEdit,
  onClose,
  onSaved,
}) => {
  // 1. Modal Title (for admin only, never shown to customer)
  const [title, setTitle] = useState(modalToEdit?.title || '');

  // 2. Image (Upload to Firebase Storage only)
  const [imageUrl, setImageUrl] = useState(modalToEdit?.imageUrl || '');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 3. Link Adding (Redirect on image click)
  const [linkUrl, setLinkUrl] = useState(
    modalToEdit?.linkUrl ||
      modalToEdit?.actionUrl ||
      (modalToEdit?.buttons && modalToEdit.buttons[0]?.actionUrl) ||
      ''
  );

  // 4. Audience Selection (Two-tier: Platform first, then audience list)
  const initialPlatform: ModalTargetPlatform =
    modalToEdit?.targetPlatform ||
    (modalToEdit?.targetAudience === 'WEBSITE_USERS'
      ? 'WEB'
      : modalToEdit?.targetAudience === 'MOBILE_APP_USERS'
      ? 'MOBILE_APP'
      : 'ALL');

  const [targetPlatform, setTargetPlatform] = useState<ModalTargetPlatform>(initialPlatform);
  const [targetAudience, setTargetAudience] = useState<ModalTargetAudience>(
    modalToEdit?.targetAudience || 'ALL'
  );

  // 5. Showing Date & Time and Closing Date & Time
  const [startDate, setStartDate] = useState<string>(modalToEdit?.startDate || '');
  const [startTime, setStartTime] = useState<string>(
    modalToEdit?.startTime || modalToEdit?.scheduledTime || ''
  );
  const [endDate, setEndDate] = useState<string>(modalToEdit?.endDate || '');
  const [endTime, setEndTime] = useState<string>(
    modalToEdit?.endTime || modalToEdit?.expiryTime || ''
  );

  // 6. Trigger Event, Display Frequency, Repeated Activity
  const [triggerEvent, setTriggerEvent] = useState<ModalTriggerEvent>(
    modalToEdit?.triggerEvent || 'FIRST_VISIT'
  );
  const [displayFrequency, setDisplayFrequency] = useState<ModalDisplayFrequency>(
    modalToEdit?.displayFrequency || 'ONCE_PER_SESSION'
  );
  const [repeatedDaily, setRepeatedDaily] = useState<boolean>(
    modalToEdit?.repeatedDaily || modalToEdit?.displayFrequency === 'DAILY' || false
  );

  // 7. Active Status
  const [isEnabled, setIsEnabled] = useState<boolean>(modalToEdit?.isEnabled !== false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showManualUrl, setShowManualUrl] = useState(false);
  const [manualUrlInput, setManualUrlInput] = useState('');

  // Handle direct image file upload to Firebase Storage
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type || !file.type.startsWith('image/')) {
      setError('শুধুমাত্র ইমেজ ফাইল (JPG, PNG, WEBP, GIF ইত্যাদি) আপলোড করতে পারবেন।');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setError('');
      setIsUploadingImage(true);
      const uploadedUrl = await uploadCustomModalImage(file);
      setImageUrl(uploadedUrl);
    } catch (err: any) {
      console.error('Firebase Storage upload error:', err);
      const msg = String(err?.message || '');
      if (err?.code === 'storage/unauthorized' || msg.includes('unauthorized') || msg.includes('permission')) {
        setError(
          'Firebase Storage পারমিশন সমস্যা (storage/unauthorized): Firebase Console -> Storage -> Rules এ write অ্যাক্সেস চালু করতে হবে (নিচে নির্দেশিকা দেখুন)। প্রয়োজনে সরাসরি ইমেজ লিংকও দিতে পারেন।'
        );
      } else {
        setError(
          err?.message || 'ছবি আপলোড করতে সমস্যা হয়েছে। দয়া করে পুনরায় চেষ্টা করুন।'
        );
      }
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('মডেলের নাম (Title) দেওয়া আবশ্যক (অ্যাডমিন রেফারেন্সের জন্য)।');
      return;
    }

    if (!imageUrl.trim()) {
      setError('অনুগ্রহ করে কাস্টম মোডালের জন্য একটি ছবি আপলোড করুন।');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const modalData: AdminCustomModalConfig = {
        id: modalToEdit?.id || `modal-${Date.now()}`,
        title: title.trim(),
        imageUrl: imageUrl.trim(),
        linkUrl: linkUrl.trim() || undefined,
        actionUrl: linkUrl.trim() || undefined,
        targetPlatform,
        targetAudience,
        triggerEvent,
        displayFrequency: repeatedDaily ? 'DAILY' : displayFrequency,
        isEnabled,
        startTime: startTime || undefined,
        scheduledTime: startTime || undefined,
        endTime: endTime || undefined,
        expiryTime: endTime || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        repeatedDaily,
        createdAt: modalToEdit?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await fallbackStore.saveCustomModal(modalData);
      if (onSaved) onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to save modal:', err);
      setError('মডেল তথ্য সংরক্ষণ সম্ভব হয়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-5">
          <div className="p-3 rounded-2xl bg-purple-100 text-purple-700">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">
              {modalToEdit ? 'Edit Custom Modal' : 'Create Custom Modal'}
            </h3>
            <p className="text-xs text-gray-500 font-medium">
              ইমেজ-ফোকাসড পপআপ ব্যানার তৈরি ও নিয়ন্ত্রণ করুন
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 text-xs font-semibold flex items-center space-x-2 mb-4 border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Modal Title (Admin Reference only) */}
          <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80">
            <label className="text-xs font-extrabold text-gray-800 block mb-1">
              Modal Title (মডেলের নাম - শুধুমাত্র অ্যাডমিনের জন্য)*
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="যেমন: গ্রীষ্মকালীন ডিসকাউন্ট অফার ব্যানার"
              className="w-full p-2.5 bg-white rounded-xl border border-gray-200 focus:border-purple-600 outline-none text-xs font-bold"
              required
            />
            <p className="text-[11px] text-amber-700 font-medium mt-1.5 flex items-center gap-1">
              <span>ℹ️</span>
              <span>এই টাইটেলটি কাস্টমার স্ক্রিনে প্রদর্শিত হবে না — শুধুমাত্র অ্যাডমিন প্যানেলে চেনার জন্য।</span>
            </p>
          </div>

          {/* 2. Image Upload (Firebase Storage only, image format only) */}
          <div className="p-3.5 bg-purple-50/50 rounded-2xl border border-purple-200/70 space-y-2.5">
            <label className="text-xs font-extrabold text-purple-950 flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-purple-700" />
              <span>Modal Banner Image (ব্যানার ছবি আপলোড)*</span>
            </label>
            <p className="text-[11px] text-gray-500 font-medium">
              শুধুমাত্র ইমেজ ফাইল (JPG, PNG, WEBP) গ্রহণযোগ্য। ছবি সরাসরি Firebase Storage এ আপলোড হবে (No Base64)।
            </p>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {imageUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-purple-200 bg-slate-900 group">
                <img
                  src={imageUrl}
                  alt="Modal Preview"
                  className="w-full max-h-56 object-contain mx-auto"
                />
                <div className="p-2.5 bg-white/95 backdrop-blur-md flex items-center justify-between border-t border-purple-100">
                  <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Firebase Storage এ সংরক্ষিত</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-purple-100 text-purple-800 hover:bg-purple-200 transition-colors flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      <span>পরিবর্তন করুন</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                      title="ছবি মুছুন"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => !isUploadingImage && fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-2 ${
                  isUploadingImage
                    ? 'border-purple-300 bg-purple-50/60'
                    : 'border-purple-300/80 bg-white hover:border-purple-500 hover:bg-purple-50/30'
                }`}
              >
                {isUploadingImage ? (
                  <>
                    <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                    <p className="text-xs font-bold text-purple-900">
                      Firebase Storage এ ছবি আপলোড হচ্ছে...
                    </p>
                  </>
                ) : (
                  <>
                    <div className="p-3 rounded-full bg-purple-100 text-purple-700">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-purple-900">
                        ক্লিক করে ছবি আপলোড করুন
                      </p>
                      <p className="text-[10px] text-gray-500 font-medium">
                        JPG, PNG, WEBP ফরম্যাটে সর্বোচ্চ রেজোলিউশন
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Manual Image URL option */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowManualUrl(!showManualUrl)}
                className="text-[11px] font-bold text-purple-700 hover:text-purple-900 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>{showManualUrl ? '▲ অপশনটি বন্ধ করুন' : '🔗 অথবা সরাসরি ছবির লিংক (URL) পেস্ট করতে চান?'}</span>
              </button>

              {showManualUrl && (
                <div className="mt-2 flex gap-1.5 p-2 bg-white rounded-xl border border-purple-200">
                  <input
                    type="url"
                    value={manualUrlInput}
                    onChange={(e) => setManualUrlInput(e.target.value)}
                    placeholder="https://... ইমেজ ফাইলের সরাসরি লিংক পেস্ট করুন"
                    className="flex-1 p-2 bg-purple-50/40 rounded-lg text-xs font-semibold focus:bg-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (manualUrlInput.trim()) {
                        setImageUrl(manualUrlInput.trim());
                        setManualUrlInput('');
                        setShowManualUrl(false);
                      }
                    }}
                    className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg cursor-pointer transition-all shrink-0"
                  >
                    সেট করুন
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 3. Link Adding (Redirect on image click) */}
          <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200">
            <label className="text-xs font-extrabold text-gray-800 flex items-center gap-1.5 mb-1">
              <LinkIcon className="w-3.5 h-3.5 text-indigo-600" />
              <span>Redirect Link (ছবিতে ক্লিক করলে যে লিঙ্কে যাবে - ঐচ্ছিক)</span>
            </label>
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="যেমন: https://example.com/offer অথবা /request"
              className="w-full p-2.5 bg-white rounded-xl border border-gray-200 focus:border-indigo-600 outline-none text-xs font-semibold"
            />
            <p className="text-[10px] text-gray-500 font-medium mt-1">
              কাস্টমার এই পপআপ ছবিতে ক্লিক করলে সরাসরি এই লিঙ্কে রিডাইরেক্ট হবে। খালি রাখলে কোনো লিঙ্ক কার্যকর হবে না।
            </p>
          </div>

          {/* 4. Audience Selection (Two-tier: Choose between Web / Mobile App first, then audience list) */}
          <div className="p-3.5 bg-indigo-50/40 rounded-2xl border border-indigo-200/80 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-950">
              <Users className="w-4 h-4 text-indigo-700" />
              <span>Target Audience Selection (অডিয়েন্স ও প্ল্যাটফর্ম নির্বাচন)</span>
            </div>

            {/* Step 1: Choose Platform between Web and Mobile App */}
            <div>
              <label className="text-[11px] font-extrabold text-gray-700 uppercase block mb-1.5">
                ধাপ ১: প্ল্যাটফর্ম নির্বাচন করুন (Choose Platform)*
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetPlatform('WEB')}
                  className={`p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    targetPlatform === 'WEB'
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  <span>Web (ওয়েবসাইট)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetPlatform('MOBILE_APP')}
                  className={`p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    targetPlatform === 'MOBILE_APP'
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Mobile App (মোবাইল অ্যাপ)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetPlatform('ALL')}
                  className={`col-span-2 sm:col-span-1 p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    targetPlatform === 'ALL'
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span>উভয় (Web & App)</span>
                </button>
              </div>
            </div>

            {/* Step 2: Audience List based on selection */}
            <div>
              <label className="text-[11px] font-extrabold text-gray-700 uppercase block mb-1.5">
                ধাপ ২: অডিয়েন্স তালিকা ({targetPlatform === 'MOBILE_APP' ? 'Mobile App' : targetPlatform === 'WEB' ? 'Web' : 'All'} Users)*
              </label>
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value as ModalTargetAudience)}
                className="w-full p-2.5 bg-white rounded-xl border border-gray-300 text-xs font-bold text-gray-800 outline-none focus:border-indigo-600"
              >
                <option value="ALL">সকল ইউজার (Everyone / All Users)</option>
                <option value="CUSTOMERS">শুধু কাস্টমার (Customers Only)</option>
                <option value="HELPERS">সকল হেলপার (All Helpers)</option>
                <option value="COMMUTER_HELPERS">কমিউটার হেলপার (Commuter Helpers Only)</option>
                <option value="DEDICATED_HELPERS">ডেডিকেটেড রাইডার (Dedicated Riders Only)</option>
                <option value="LOGGED_IN">লগইন করা ব্যবহারকারী (Logged-In Users)</option>
                <option value="LOGGED_OUT">লগআউট / অতিথি ভিজিটর (Logged-Out Users)</option>
                <option value="MULTIPLE_ORDERS">২+ অর্ডার সম্পন্ন করেছে এমন ইউজার</option>
                <option value="WEEKLY_2_ORDERS">সাপ্তাহিক ২+ অর্ডারকারী (Frequent)</option>
                <option value="WEEKLY_1_ORDERS">সাপ্তাহিক ১+ অর্ডারকারী (Frequent)</option>
                <option value="RARE_ORDERS_WEEK">কম অর্ডার: সপ্তাহে ১টির কম (&lt;1 order/week)</option>
                <option value="RARE_ORDERS_MONTH">কম অর্ডার: মাসে ১টির কম (&lt;1 order/month)</option>
                <option value="INACTIVE_1_WEEK">১ সপ্তাহ ধরে নিষ্ক্রিয় (No order in 1 week)</option>
                <option value="INACTIVE_2_WEEKS">২ সপ্তাহ ধরে নিষ্ক্রিয় (No order in 2 weeks)</option>
                <option value="NEVER_ORDERED">কখনও অর্ডার করেনি এমন ইউজার (0 Orders)</option>
                <option value="NEW_REGISTERED">নতুন রেজিস্টার্ড ইউজার (New in last 7 days)</option>
              </select>
            </div>
          </div>

          {/* 5. Showing Date+Time and Closing Date+Time */}
          <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-amber-700" />
                <span>Showing Date+Time & Closing Date+Time (সময়সূচী)</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Showing Date & Time */}
              <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-2">
                <span className="text-[10px] font-black text-amber-900 uppercase block tracking-wider">
                  🟢 Showing Schedule (প্রদর্শন শুরু)
                </span>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Showing Date (শুরুর তারিখ)</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 text-xs font-bold focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <TimePickerInput
                    label="Showing Time (শুরুর সময়)"
                    value={startTime}
                    onChange={(val) => setStartTime(val)}
                    placeholder="যেমন: 09:00 AM"
                  />
                </div>
              </div>

              {/* Closing Date & Time */}
              <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-2">
                <span className="text-[10px] font-black text-rose-900 uppercase block tracking-wider">
                  🔴 Closing Schedule (প্রদর্শন শেষ/বন্ধ)
                </span>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Closing Date (শেষের তারিখ)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 text-xs font-bold focus:border-rose-500 outline-none"
                  />
                </div>
                <div>
                  <TimePickerInput
                    label="Closing Time (শেষের সময়)"
                    value={endTime}
                    onChange={(val) => setEndTime(val)}
                    placeholder="যেমন: 11:59 PM"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 6. Smart Event Trigger & Display Frequency & Repeated Option */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-gray-50 rounded-2xl border border-gray-200">
            {/* Event Trigger */}
            <div>
              <label className="text-[10px] font-extrabold text-gray-700 uppercase flex items-center gap-1 mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                <span>Smart Event Trigger*</span>
              </label>
              <select
                value={triggerEvent}
                onChange={(e) => setTriggerEvent(e.target.value as ModalTriggerEvent)}
                className="w-full p-2 bg-white rounded-xl border border-gray-200 text-xs font-bold text-gray-800"
              >
                <option value="FIRST_VISIT">Page Load (পেজ খোলার সাথে সাথে)</option>
                <option value="TIME_DELAY_5S">5s Delay (পেজে প্রবেশের ৫ সেকেন্ড পর)</option>
                <option value="TIME_DELAY_10S">10s Delay (পেজে প্রবেশের ১০ সেকেন্ড পর)</option>
                <option value="SCROLL_50">Scroll 50% (পেজের অর্ধেক স্ক্রোল করার পর)</option>
                <option value="EXIT_INTENT">Exit Intent (পেজ ছেড়ে যাওয়ার সময়)</option>
                <option value="LOGIN">After Login (ইউজার লগইন করার পর)</option>
                <option value="DASHBOARD_OPEN">Dashboard Open (ড্যাশবোর্ড খোলার সাথে সাথে)</option>
                <option value="ADD_TO_CART">Add To Cart (কার্টে পণ্য যোগ করার সময়)</option>
                <option value="CART_OPEN">Cart Open (শপিং কার্ট ড্রয়ার খোলার সময়)</option>
                <option value="STORE_VIEW">Store View (শপ/দোকান দেখার সময়)</option>
                <option value="REQUEST_SUBMIT">Request Submit (রিকোয়েস্ট সাবমিটের পর)</option>
                <option value="ORDER_COMPLETE">Order Complete (অর্ডার সম্পন্ন হওয়ার পর)</option>
              </select>
            </div>

            {/* Display Frequency */}
            <div>
              <label className="text-[10px] font-extrabold text-gray-700 uppercase flex items-center gap-1 mb-1">
                <Clock className="w-3.5 h-3.5 text-purple-600" />
                <span>Display Frequency*</span>
              </label>
              <select
                value={repeatedDaily ? 'DAILY' : displayFrequency}
                onChange={(e) => {
                  const val = e.target.value as ModalDisplayFrequency;
                  if (val === 'DAILY') {
                    setRepeatedDaily(true);
                  } else {
                    setRepeatedDaily(false);
                    setDisplayFrequency(val);
                  }
                }}
                className="w-full p-2 bg-white rounded-xl border border-gray-200 text-xs font-bold text-gray-800"
              >
                <option value="ONCE_PER_SESSION">Once Per Session (প্রতি সেশনে একবার)</option>
                <option value="ONCE_EVER">Once Ever (প্রতি ডিভাইসে শুধু একবার)</option>
                <option value="ALWAYS">Always (প্রতিবার ইভেন্ট ঘটলেই)</option>
                <option value="DAILY">Daily (প্রতিদিন নির্দিষ্ট সময়ানুযায়ী)</option>
              </select>
            </div>

            {/* Repeated Option */}
            <div className="col-span-1 sm:col-span-2 pt-1 border-t border-gray-200/60 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-800">
                <input
                  type="checkbox"
                  checked={repeatedDaily}
                  onChange={(e) => setRepeatedDaily(e.target.checked)}
                  className="w-4 h-4 text-purple-700 rounded focus:ring-purple-500"
                />
                <Repeat className="w-4 h-4 text-purple-600" />
                <span>Repeated Activity (প্রতিদিন পুনরাবৃত্তি চালু রাখুন)</span>
              </label>
            </div>
          </div>

          {/* 7. Active Status */}
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="isEnabledCheck"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
            <label htmlFor="isEnabledCheck" className="text-xs font-bold text-gray-800 cursor-pointer">
              Enable & Activate this Modal (এই মোডালটি সক্রিয় রাখুন)
            </label>
          </div>

          {/* Actions */}
          <div className="flex space-x-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-xs transition-all cursor-pointer"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={submitting || isUploadingImage}
              className="flex-1 py-3 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{modalToEdit ? 'Update Modal' : 'Save Modal'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
