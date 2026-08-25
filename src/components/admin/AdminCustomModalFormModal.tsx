'use client';

import React, { useState } from 'react';
import { AdminCustomModalConfig, ModalButtonConfig, ModalButtonActionType, ModalTargetAudience, ModalTriggerEvent, ModalDisplayFrequency } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { X, Sparkles, Plus, Trash2, Check, AlertCircle, Clock, Calendar, Repeat } from 'lucide-react';
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
  const [title, setTitle] = useState(modalToEdit?.title || '');
  const [subtitle, setSubtitle] = useState(modalToEdit?.subtitle || '');
  const [imageUrl, setImageUrl] = useState(modalToEdit?.imageUrl || '');
  const [description, setDescription] = useState(modalToEdit?.description || '');
  
  const [buttons, setButtons] = useState<ModalButtonConfig[]>(() => {
    const initialBtns = modalToEdit?.buttons || [
      { label: 'ঠিক আছে', actionType: 'CLOSE', variant: 'primary' },
      { label: 'বন্ধ করুন', actionType: 'CLOSE', variant: 'secondary' },
    ];
    return initialBtns.map((b) => ({
      ...b,
      actionType: b.actionType || (b.actionUrl || b.url ? 'REDIRECT' : 'CLOSE'),
      actionUrl: b.actionUrl || b.url || '',
    }));
  });

  const [targetAudience, setTargetAudience] = useState<ModalTargetAudience>(
    modalToEdit?.targetAudience || 'ALL'
  );
  const [triggerEvent, setTriggerEvent] = useState<ModalTriggerEvent>(
    modalToEdit?.triggerEvent || 'FIRST_VISIT'
  );
  const [displayFrequency, setDisplayFrequency] = useState<ModalDisplayFrequency>(
    modalToEdit?.displayFrequency || 'ONCE_PER_SESSION'
  );
  const [isEnabled, setIsEnabled] = useState<boolean>(
    modalToEdit?.isEnabled !== false
  );

  // Time Selection & Scheduling States
  const [scheduledTime, setScheduledTime] = useState<string>(modalToEdit?.scheduledTime || '');
  const [startTime, setStartTime] = useState<string>(modalToEdit?.startTime || '');
  const [endTime, setEndTime] = useState<string>(modalToEdit?.endTime || '');
  const [expiryTime, setExpiryTime] = useState<string>(modalToEdit?.expiryTime || '');
  const [startDate, setStartDate] = useState<string>(modalToEdit?.startDate || '');
  const [endDate, setEndDate] = useState<string>(modalToEdit?.endDate || '');
  const [repeatedDaily, setRepeatedDaily] = useState<boolean>(
    modalToEdit?.repeatedDaily || modalToEdit?.displayFrequency === 'DAILY' || false
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAddButton = () => {
    if (buttons.length >= 3) return;
    setButtons([
      ...buttons,
      { label: 'নতুন বাটন', actionType: 'CLOSE', variant: 'secondary', actionUrl: '' },
    ]);
  };

  const handleRemoveButton = (index: number) => {
    if (buttons.length <= 1) return;
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const handleUpdateButton = (index: number, field: keyof ModalButtonConfig, value: any) => {
    const next = [...buttons];
    const updated = { ...next[index], [field]: value };
    if (field === 'actionType' && value === 'CLOSE') {
      updated.actionUrl = '';
    }
    next[index] = updated;
    setButtons(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('টাইটেল এবং ডেসক্রিপশন পূরণ করা আবশ্যক।');
      return;
    }
    if (buttons.length === 0) {
      setError('কমপক্ষে ১টি বাটন যোগ করতে হবে।');
      return;
    }

    // Validate button redirect links
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (b.actionType === 'REDIRECT' && (!b.actionUrl || !b.actionUrl.trim())) {
        setError(`বাটন #${i + 1} ("${b.label}") এর রিডাইরেক্ট লিঙ্ক দেওয়া আবশ্যক।`);
        return;
      }
    }

    try {
      setSubmitting(true);
      setError('');

      const cleanButtons: ModalButtonConfig[] = buttons.map((b) => {
        if (b.actionType === 'CLOSE') {
          return { label: b.label.trim(), actionType: 'CLOSE', variant: b.variant };
        }
        return {
          label: b.label.trim(),
          actionType: 'REDIRECT',
          actionUrl: b.actionUrl?.trim(),
          variant: b.variant,
        };
      });

      const modalData: AdminCustomModalConfig = {
        id: modalToEdit?.id || `modal-${Date.now()}`,
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        description: description.trim(),
        buttons: cleanButtons,
        targetAudience,
        triggerEvent,
        displayFrequency: repeatedDaily ? 'DAILY' : displayFrequency,
        isEnabled,
        scheduledTime: scheduledTime || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        expiryTime: expiryTime || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        repeatedDaily: repeatedDaily,
        createdAt: modalToEdit?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await fallbackStore.saveCustomModal(modalData);
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      setError('মডেল তথ্য সংরক্ষণ সম্ভব হয়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="p-3 rounded-2xl bg-purple-100 text-purple-700">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">
              {modalToEdit ? 'Edit Custom Dynamic Modal' : 'Create Custom Dynamic Modal'}
            </h3>
            <p className="text-xs text-gray-500 font-medium">
              টাইটেল, অডিয়েন্স, ট্রিগার ইভেন্ট ও ডিসপ্লে ফ্রিকোয়েন্সি কনফিগার করুন
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-xs font-semibold flex items-center space-x-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">Modal Title*</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="যেমন: বিশেষ অফার / জরুরী আপডেট"
              className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-xs font-semibold"
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">Subtitle (Optional)</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="ছোট সাবটাইটেল..."
              className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-xs font-semibold"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">Image URL (Optional)</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/banner.jpg"
              className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-xs font-semibold"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">Description / Content Body*</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="মেসেজের পূর্ণাঙ্গ তথ্য লিখুন..."
              rows={3}
              className="w-full p-3 rounded-2xl border border-gray-200 focus:border-purple-500 outline-none text-xs font-medium"
              required
            />
          </div>

          {/* Audience & Event Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-200">
            <div>
              <label className="text-[10px] font-extrabold text-gray-600 uppercase block mb-1">
                Target Audience
              </label>
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value as ModalTargetAudience)}
                className="w-full p-2 bg-white rounded-xl border border-gray-200 text-xs font-bold"
              >
                <option value="ALL">Everyone (ALL)</option>
                <option value="WEBSITE_USERS">Website / Browser Users Only (ওয়েবসাইট ইউজার)</option>
                <option value="MOBILE_APP_USERS">Mobile App Users Only (মোবাইল অ্যাপ ইউজার)</option>
                <option value="CUSTOMERS">Customers Only</option>
                <option value="HELPERS">All Helpers Only</option>
                <option value="COMMUTER_HELPERS">Commuter Helpers Only</option>
                <option value="DEDICATED_HELPERS">Dedicated Riders Only</option>
                <option value="LOGGED_IN">Logged-In Users</option>
                <option value="LOGGED_OUT">Logged-Out Users</option>
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

            <div>
              <label className="text-[10px] font-extrabold text-gray-600 uppercase block mb-1">
                Event Trigger
              </label>
              <select
                value={triggerEvent}
                onChange={(e) => setTriggerEvent(e.target.value as ModalTriggerEvent)}
                className="w-full p-2 bg-white rounded-xl border border-gray-200 text-xs font-bold"
              >
                <option value="FIRST_VISIT">Page First Visit</option>
                <option value="LOGIN">After User Login</option>
                <option value="REQUEST_SUBMIT">After Request Submit</option>
                <option value="ORDER_COMPLETE">After Order Complete</option>
                <option value="DASHBOARD_OPEN">Dashboard Open</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-extrabold text-gray-600 uppercase block mb-1">
                Display Frequency
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
                className="w-full p-2 bg-white rounded-xl border border-gray-200 text-xs font-bold"
              >
                <option value="ONCE_PER_SESSION">Once Per Session</option>
                <option value="ONCE_EVER">Once Ever Per User</option>
                <option value="ALWAYS">Always Every Event</option>
                <option value="DAILY">Daily at Specific Time (দৈনিক সময়ানুযায়ী)</option>
              </select>
            </div>
          </div>

          {/* Time Selector & Scheduled Active Window */}
          <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-purple-950 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-purple-700" />
                <span>Time Selector & Display Schedule (সময় ও টাইমিং সিলেক্টর)</span>
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-purple-900 bg-white px-2.5 py-1 rounded-xl border border-purple-200 shadow-xs">
                <input
                  type="checkbox"
                  checked={repeatedDaily}
                  onChange={(e) => setRepeatedDaily(e.target.checked)}
                  className="w-3.5 h-3.5 text-purple-700 rounded focus:ring-purple-500"
                />
                <Repeat className="w-3.5 h-3.5 text-purple-600" />
                <span>Repeated Activity (দৈনিক পুনরাবৃত্তি)</span>
              </label>
            </div>

            <div>
              {/* Exact Scheduled Time */}
              <TimePickerInput
                label="Exact Showing Time (পপআপ দেখানোর সময়)"
                value={scheduledTime}
                onChange={(val) => setScheduledTime(val)}
                placeholder="যেমন: 10:00 AM"
              />
            </div>

            {/* Date Range Selection */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-extrabold text-gray-600 uppercase block mb-1">
                  Start Date (শুরুর তারিখ - optional)
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full p-2 bg-white rounded-xl border border-gray-200 text-xs font-bold focus:border-purple-600 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-extrabold text-gray-600 uppercase block mb-1">
                  End Date (শেষের তারিখ - optional)
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full p-2 bg-white rounded-xl border border-gray-200 text-xs font-bold focus:border-purple-600 outline-none"
                  />
                </div>
              </div>
            </div>

            {repeatedDaily && (
              <p className="text-[11px] font-semibold text-purple-800 bg-purple-100/70 p-2 rounded-xl border border-purple-200 flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                <span>প্রতিদিন নির্বাচনকৃত সময়ে ({scheduledTime ? scheduledTime : 'নির্দিষ্ট সময়'}) ব্যবহারকারীদের সামনে মোডালটি প্রদর্শিত হবে।</span>
              </p>
            )}
          </div>

          {/* Action Buttons Configuration */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-700">Modal Buttons (Max 3)</label>
              {buttons.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddButton}
                  className="px-2.5 py-1 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-bold flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Button</span>
                </button>
              )}
            </div>

            {buttons.map((btn, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Button #{idx + 1}</span>
                  {buttons.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveButton(idx)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-extrabold text-gray-500 uppercase block mb-0.5">Label</label>
                    <input
                      type="text"
                      value={btn.label}
                      onChange={(e) => handleUpdateButton(idx, 'label', e.target.value)}
                      placeholder="Button Label"
                      className="w-full p-2 bg-white rounded-xl border border-gray-200 text-xs font-semibold"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-extrabold text-gray-500 uppercase block mb-0.5">Action Type</label>
                    <select
                      value={btn.actionType || 'CLOSE'}
                      onChange={(e) => handleUpdateButton(idx, 'actionType', e.target.value as ModalButtonActionType)}
                      className="w-full p-2 bg-white rounded-xl border border-gray-200 text-xs font-bold"
                    >
                      <option value="CLOSE">Close Modal (মোডাল বন্ধ করুন)</option>
                      <option value="REDIRECT">Redirect to URL (লিঙ্কে যান)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] font-extrabold text-gray-500 uppercase block mb-0.5">Variant Style</label>
                    <select
                      value={btn.variant || 'primary'}
                      onChange={(e) => handleUpdateButton(idx, 'variant', e.target.value)}
                      className="w-full p-2 bg-white rounded-xl border border-gray-200 text-xs font-bold"
                    >
                      <option value="primary">Primary (Purple)</option>
                      <option value="secondary">Secondary (Gray)</option>
                      <option value="danger">Danger (Red)</option>
                    </select>
                  </div>
                </div>

                {/* Render actionUrl input ONLY if actionType is REDIRECT */}
                {btn.actionType === 'REDIRECT' && (
                  <div className="pt-1">
                    <label className="text-[9px] font-extrabold text-purple-700 uppercase block mb-0.5">
                      Redirect URL / Link*
                    </label>
                    <input
                      type="text"
                      value={btn.actionUrl || ''}
                      onChange={(e) => handleUpdateButton(idx, 'actionUrl', e.target.value)}
                      placeholder="https://example.com/offer or /request"
                      className="w-full p-2 bg-white rounded-xl border border-purple-300 text-xs font-semibold focus:border-purple-600 outline-none"
                      required
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="isEnabledCheck"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
            <label htmlFor="isEnabledCheck" className="text-xs font-bold text-gray-800">
              Enable & Activate this Modal (সক্রিয় রাখুন)
            </label>
          </div>

          <div className="flex space-x-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-xs"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3.5 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-2"
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
