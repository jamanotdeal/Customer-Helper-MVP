import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Bike, Check, AlertCircle, Trash2, Edit3, CreditCard, Building2 } from 'lucide-react';
import { fallbackStore } from '@/lib/firebase';
import { HelperApplication } from '@/types';
import { AsyncButton } from './ui/AsyncButton';

interface HelperApplicationModalProps {
  onClose: () => void;
}

export const HelperApplicationModal: React.FC<HelperApplicationModalProps> = ({ onClose }) => {
  const { user, submitHelperApplication, updateHelperApplication, cancelHelperApplication } = useAuth();
  
  // Check if user has an existing PENDING application
  const existingPendingApp = user
    ? Array.from(fallbackStore.helperApplications.values()).find(
        (app) => app.userId === user.uid && app.status === 'PENDING'
      )
    : undefined;

  const [legalName, setLegalName] = useState(existingPendingApp?.legalName || user?.displayName || '');
  const [nid, setNid] = useState(existingPendingApp?.nid || '');
  const [email, setEmail] = useState(existingPendingApp?.email || user?.email || '');
  const [whatsapp, setWhatsapp] = useState(existingPendingApp?.whatsapp || user?.alternativePhone || '');
  const [fbProfile, setFbProfile] = useState(existingPendingApp?.fbProfile || '');
  const [hasSmartphone, setHasSmartphone] = useState(existingPendingApp?.hasSmartphone ?? true);
  const [hasCycle, setHasCycle] = useState(existingPendingApp?.hasCycle ?? false);
  const [hasBike, setHasBike] = useState(existingPendingApp?.hasBike ?? true);
  const [preferredAreaId, setPreferredAreaId] = useState(existingPendingApp?.preferredAreaId || '');
  
  // Payment Options for receiving money from customers
  const [bkashNumber, setBkashNumber] = useState(existingPendingApp?.bkashNumber || '');
  const [bkashType, setBkashType] = useState<'Personal' | 'Merchant' | 'Agent'>(existingPendingApp?.bkashType || 'Personal');
  const [nagadNumber, setNagadNumber] = useState(existingPendingApp?.nagadNumber || '');
  const [nagadType, setNagadType] = useState<'Personal' | 'Merchant'>(existingPendingApp?.nagadType || 'Personal');
  const [bankName, setBankName] = useState(existingPendingApp?.bankName || '');
  const [bankAccountName, setBankAccountName] = useState(existingPendingApp?.bankAccountName || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(existingPendingApp?.bankAccountNumber || '');
  const [bankBranch, setBankBranch] = useState(existingPendingApp?.bankBranch || '');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const availableAreas = fallbackStore.pricingSettings.allowedDeliveryAreas || [];

  const isStoreUser = Boolean(
    user && (
      user.isStore ||
      user.isStoreApproved ||
      Boolean(user.storeId) ||
      user.role === 'store'
    )
  );

  useEffect(() => {
    if (isStoreUser) {
      setError('স্টোর ইউজার কখনো হেলপার হতে পারবেন না।');
      return;
    }

    if (user?.isHelper) {
      setSuccessMessage('আপনি ইতিমধ্যে একজন নিবন্ধিত হেলপার! হেলপার ভিউতে পাঠানো হচ্ছে...');
      setSubmitted(true);
      setTimeout(() => {
        onClose();
      }, 1500);
      return;
    }

    if (existingPendingApp) {
      setLegalName(existingPendingApp.legalName);
      setNid(existingPendingApp.nid);
      setEmail(existingPendingApp.email || user?.email || '');
      setWhatsapp(existingPendingApp.whatsapp);
      setFbProfile(existingPendingApp.fbProfile);
      setHasSmartphone(existingPendingApp.hasSmartphone);
      setHasCycle(existingPendingApp.hasCycle);
      setHasBike(existingPendingApp.hasBike);
      setPreferredAreaId(existingPendingApp.preferredAreaId || '');
      setBkashNumber(existingPendingApp.bkashNumber || '');
      setBkashType(existingPendingApp.bkashType || 'Personal');
      setNagadNumber(existingPendingApp.nagadNumber || '');
      setNagadType(existingPendingApp.nagadType || 'Personal');
      setBankName(existingPendingApp.bankName || '');
      setBankAccountName(existingPendingApp.bankAccountName || '');
      setBankAccountNumber(existingPendingApp.bankAccountNumber || '');
      setBankBranch(existingPendingApp.bankBranch || '');
    }
  }, [existingPendingApp, user, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStoreUser) {
      setError('স্টোর ইউজার কখনো হেলপার হতে পারবেন না।');
      return;
    }
    if (!legalName.trim() || !nid.trim() || !whatsapp.trim() || !fbProfile.trim()) {
      setError('আপনার পূর্ণ নাম, NID নম্বর, হোয়াটসঅ্যাপ নম্বর এবং ফেসবুক প্রোফাইল লিংক প্রদান করুন।');
      return;
    }

    if (!/^01[3-9]\d{8}$/.test(whatsapp.trim())) {
      setError('অনুগ্রহ করে ১১ ডিজিটের সঠিক হোয়াটসঅ্যাপ নম্বর (যেমন: 01712345678) লিখুন।');
      return;
    }

    // Check if user is already an approved helper
    if (user?.isHelper) {
      setSuccessMessage('আপনি ইতিমধ্যে একজন নিবন্ধিত হেলপার! হেলপার ভিউতে রিডাইরেক্ট করা হচ্ছে...');
      setSubmitted(true);
      setTimeout(() => {
        onClose();
      }, 1500);
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      if (existingPendingApp) {
        await updateHelperApplication(existingPendingApp.id, {
          legalName: legalName.trim(),
          nid: nid.trim(),
          email: email.trim(),
          whatsapp: whatsapp.trim(),
          fbProfile: fbProfile.trim(),
          hasSmartphone,
          hasCycle,
          hasBike,
          preferredAreaId: preferredAreaId || undefined,
          bkashNumber: bkashNumber.trim() || undefined,
          bkashType: bkashNumber.trim() ? bkashType : undefined,
          nagadNumber: nagadNumber.trim() || undefined,
          nagadType: nagadNumber.trim() ? nagadType : undefined,
          bankName: bankName.trim() || undefined,
          bankAccountName: bankAccountName.trim() || undefined,
          bankAccountNumber: bankAccountNumber.trim() || undefined,
          bankBranch: bankBranch.trim() || undefined,
        });
        setSuccessMessage('আপনার আবেদনের তথ্য সফলভাবে আপডেট করা হয়েছে!');
      } else {
        await submitHelperApplication({
          legalName: legalName.trim(),
          nid: nid.trim(),
          email: email.trim(),
          whatsapp: whatsapp.trim(),
          fbProfile: fbProfile.trim(),
          hasSmartphone,
          hasCycle,
          hasBike,
          preferredAreaId: preferredAreaId || undefined,
          applicationType: 'dedicated',
          bkashNumber: bkashNumber.trim() || undefined,
          bkashType: bkashNumber.trim() ? bkashType : undefined,
          nagadNumber: nagadNumber.trim() || undefined,
          nagadType: nagadNumber.trim() ? nagadType : undefined,
          bankName: bankName.trim() || undefined,
          bankAccountName: bankAccountName.trim() || undefined,
          bankAccountNumber: bankAccountNumber.trim() || undefined,
          bankBranch: bankBranch.trim() || undefined,
        });
        setSuccessMessage('আবেদন সফলভাবে জমা হয়েছে!');
      }
      setSubmitted(true);
    } catch (err) {
      setError('আবেদন জমা বা আপডেট করা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelApplication = async () => {
    if (!existingPendingApp) return;
    try {
      setSubmitting(true);
      await cancelHelperApplication(existingPendingApp.id);
      setSuccessMessage('আপনার আবেদন বাতিল করা হয়েছে। আপনি চাইলে পুনরায় আবেদন করতে পারেন।');
      setSubmitted(true);
    } catch (err) {
      setError('আবেদন বাতিল করা যায়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200/60 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {successMessage || 'আবেদন সফলভাবে সম্পন্ন হয়েছে!'}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              আপনার ডেডিকেটেড হেলপার আবেদনের আপডেটটি অ্যাডমিন রিভিউ করছেন।
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold shadow-md hover:bg-emerald-700 transition-all"
            >
              ঠিক আছে
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-3 rounded-2xl bg-purple-100 text-purple-800">
                <Bike className="w-6 h-6 text-purple-700" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-gray-900">
                  {existingPendingApp ? 'Update Dedicated Helper Application' : 'Become a Dedicated Helper'}
                </h3>
                <p className="text-xs text-purple-700 font-semibold">
                  {existingPendingApp ? 'আপনার পেন্ডিং আবেদনের তথ্য সংশোধন বা বাতিল করতে পারেন' : 'ফুল-টাইম বা ডেডিকেটেড রাইডার হিসেবে সার্ভিস দেওয়ার আবেদন'}
                </p>
              </div>
            </div>

            {existingPendingApp && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-950">
                  <Edit3 className="w-4 h-4 text-amber-700" />
                  <span>পেন্ডিং আবেদন ইতিমধ্যে জমা দেওয়া আছে</span>
                </div>
                <p>
                  আপনার একটি আবেদন অ্যাডমিনের রিভিউয়ের জন্য জমা রয়েছে। আপনি চাইলে তথ্য আপডেট করতে পারেন অথবা বর্তমান আবেদনটি বাতিল করতে পারেন।
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-xs font-semibold flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Legal Name (NID অনুযায়ী)*
              </label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="যেমন: আনিসুর রহমান"
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                NID Number*
              </label>
              <input
                type="text"
                value={nid}
                onChange={(e) => setNid(e.target.value)}
                placeholder="১০, ১৩ বা ১৭ ডিজিটের NID নম্বর"
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                WhatsApp Number*
              </label>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full p-3 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 focus:border-emerald-500 outline-none text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Facebook Link*
                </label>
                <input
                  type="text"
                  value={fbProfile}
                  onChange={(e) => setFbProfile(e.target.value)}
                  placeholder="fb.com/username"
                  className="w-full p-3 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
                  required
                />
              </div>
            </div>

            {availableAreas.length > 0 && (
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  পছন্দের সার্ভিস জোন / এলাকা (Preferred Zone)
                </label>
                <select
                  value={preferredAreaId}
                  onChange={(e) => setPreferredAreaId(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm bg-white font-medium"
                >
                  <option value="">জোন নির্বাচন করুন (ঐচ্ছিক)...</option>
                  {availableAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      📍 {area.name} ({area.country || 'Bangladesh'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-700 block">অন্যান্য তথ্য</label>
              
              <label className="flex items-center justify-between p-3 rounded-2xl border border-gray-100 bg-gray-50/50 cursor-pointer">
                <span className="text-xs font-semibold text-gray-800">স্মার্টফোন আছে?</span>
                <input
                  type="checkbox"
                  checked={hasSmartphone}
                  onChange={(e) => setHasSmartphone(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl border border-gray-100 bg-gray-50/50 cursor-pointer">
                <span className="text-xs font-semibold text-gray-800">সাইকেল (Bicycle) আছে?</span>
                <input
                  type="checkbox"
                  checked={hasCycle}
                  onChange={(e) => setHasCycle(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl border border-gray-100 bg-gray-50/50 cursor-pointer">
                <span className="text-xs font-semibold text-gray-800">বাইক (Motorbike) আছে?</span>
                <input
                  type="checkbox"
                  checked={hasBike}
                  onChange={(e) => setHasBike(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
              </label>
            </div>

            {/* Payment Options (bKash / Nagad / Bank) */}
            <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200/80 space-y-3 pt-2">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-gray-900">
                    পেমেন্ট পাওয়ার একাউন্ট নম্বর (Payment Options)
                  </h4>
                  <p className="text-[11px] text-gray-500 font-medium">
                    গ্রাহক যাতে সরাসরি আপনাকে বিল পে করতে পারে, সেজন্য এক বা একাধিক একাউন্ট দিন
                  </p>
                </div>
              </div>

              {/* bKash */}
              <div className="bg-white p-3 rounded-xl border border-gray-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-pink-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-pink-600 inline-block"></span>
                    বিকাশ (bKash)
                  </span>
                  <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg text-[10px] font-bold">
                    {(['Personal', 'Merchant', 'Agent'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setBkashType(t)}
                        className={`px-2 py-0.5 rounded-md transition-all ${
                          bkashType === t ? 'bg-pink-600 text-white shadow-2xs' : 'text-gray-600'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="tel"
                  value={bkashNumber}
                  onChange={(e) => setBkashNumber(e.target.value)}
                  placeholder="বিকাশ নম্বর (01XXXXXXXXX)"
                  maxLength={11}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold focus:border-pink-500 focus:outline-none"
                />
              </div>

              {/* Nagad */}
              <div className="bg-white p-3 rounded-xl border border-gray-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-orange-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-orange-600 inline-block"></span>
                    নগদ (Nagad)
                  </span>
                  <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg text-[10px] font-bold">
                    {(['Personal', 'Merchant'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNagadType(t)}
                        className={`px-2 py-0.5 rounded-md transition-all ${
                          nagadType === t ? 'bg-orange-600 text-white shadow-2xs' : 'text-gray-600'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="tel"
                  value={nagadNumber}
                  onChange={(e) => setNagadNumber(e.target.value)}
                  placeholder="নগদ নম্বর (01XXXXXXXXX)"
                  maxLength={11}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold focus:border-orange-500 focus:outline-none"
                />
              </div>

              {/* Bank Account */}
              <div className="bg-white p-3 rounded-xl border border-gray-200/80 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-blue-900">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>ব্যাংক একাউন্ট (Bank Account)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="ব্যাংকের নাম (Bank Name)"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={bankAccountName}
                    onChange={(e) => setBankAccountName(e.target.value)}
                    placeholder="হিসাবধারীর নাম (A/C Name)"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="হিসাব নম্বর (A/C Number)"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={bankBranch}
                    onChange={(e) => setBankBranch(e.target.value)}
                    placeholder="শাখা / ব্রাঞ্চ (Branch Name)"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              {existingPendingApp && (
                <AsyncButton
                  type="button"
                  onClick={handleCancelApplication}
                  isLoading={submitting}
                  icon={<Trash2 className="w-4 h-4" />}
                  className="flex-1 py-3.5 rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-xs flex items-center justify-center space-x-1.5 transition-all"
                >
                  <span>আবেদন বাতিল</span>
                </AsyncButton>
              )}
              <AsyncButton
                type="submit"
                isLoading={submitting}
                className="flex-1 py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs shadow-lg shadow-purple-500/20 active:scale-98 transition-all flex items-center justify-center space-x-2"
              >
                <span>{existingPendingApp ? 'Update Application' : 'Submit Application'}</span>
              </AsyncButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
