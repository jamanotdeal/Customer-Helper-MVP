'use client';

import React, { useState } from 'react';
import { AdminCustomModalConfig, ModalButtonConfig, ModalTargetAudience, ModalTriggerEvent, ModalDisplayFrequency } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { X, Sparkles, Plus, Trash2, Check, AlertCircle } from 'lucide-react';

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
  
  const [buttons, setButtons] = useState<ModalButtonConfig[]>(
    modalToEdit?.buttons || [
      { label: 'ঠিক আছে', variant: 'primary' },
      { label: 'বন্ধ করুন', variant: 'secondary' },
    ]
  );

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

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAddButton = () => {
    if (buttons.length >= 3) return;
    setButtons([...buttons, { label: 'নতুন বাটন', variant: 'secondary' }]);
  };

  const handleRemoveButton = (index: number) => {
    if (buttons.length <= 1) return;
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const handleUpdateButton = (index: number, field: keyof ModalButtonConfig, value: string) => {
    const next = [...buttons];
    next[index] = { ...next[index], [field]: value };
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

    try {
      setSubmitting(true);
      setError('');
      const modalData: AdminCustomModalConfig = {
        id: modalToEdit?.id || `modal-${Date.now()}`,
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        description: description.trim(),
        buttons,
        targetAudience,
        triggerEvent,
        displayFrequency,
        isEnabled,
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
                <option value="CUSTOMERS">Customers Only</option>
                <option value="HELPERS">All Helpers Only</option>
                <option value="COMMUTER_HELPERS">Commuter Helpers Only</option>
                <option value="DEDICATED_HELPERS">Dedicated Riders Only</option>
                <option value="LOGGED_IN">Logged-In Users</option>
                <option value="LOGGED_OUT">Logged-Out Users</option>
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
                value={displayFrequency}
                onChange={(e) => setDisplayFrequency(e.target.value as ModalDisplayFrequency)}
                className="w-full p-2 bg-white rounded-xl border border-gray-200 text-xs font-bold"
              >
                <option value="ONCE_PER_SESSION">Once Per Session</option>
                <option value="ONCE_EVER">Once Ever Per User</option>
                <option value="ALWAYS">Always Every Event</option>
              </select>
            </div>
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
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={btn.label}
                    onChange={(e) => handleUpdateButton(idx, 'label', e.target.value)}
                    placeholder="Button Label"
                    className="p-2 bg-white rounded-xl border border-gray-200 text-xs font-semibold"
                    required
                  />
                  <input
                    type="text"
                    value={btn.actionUrl || ''}
                    onChange={(e) => handleUpdateButton(idx, 'actionUrl', e.target.value)}
                    placeholder="Action URL / Link (optional)"
                    className="p-2 bg-white rounded-xl border border-gray-200 text-xs font-semibold"
                  />
                  <select
                    value={btn.variant || 'primary'}
                    onChange={(e) => handleUpdateButton(idx, 'variant', e.target.value)}
                    className="p-2 bg-white rounded-xl border border-gray-200 text-xs font-bold"
                  >
                    <option value="primary">Primary (Purple)</option>
                    <option value="secondary">Secondary (Gray)</option>
                    <option value="danger">Danger (Red)</option>
                  </select>
                </div>
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
