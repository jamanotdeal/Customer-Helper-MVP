'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Bike, Check, AlertCircle } from 'lucide-react';

interface HelperApplicationModalProps {
  onClose: () => void;
}

export const HelperApplicationModal: React.FC<HelperApplicationModalProps> = ({ onClose }) => {
  const { user, submitHelperApplication } = useAuth();
  const [legalName, setLegalName] = useState(user?.displayName || '');
  const [nid, setNid] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [whatsapp, setWhatsapp] = useState(user?.alternativePhone || '');
  const [fbProfile, setFbProfile] = useState('');
  const [hasSmartphone, setHasSmartphone] = useState(true);
  const [hasCycle, setHasCycle] = useState(false);
  const [hasBike, setHasBike] = useState(true);
  
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legalName.trim() || !nid.trim() || !whatsapp.trim() || !fbProfile.trim()) {
      setError('আপনার পূর্ণ নাম, NID নম্বর, হোয়াটসঅ্যাপ নম্বর এবং ফেসবুক প্রোফাইল লিংক প্রদান করুন।');
      return;
    }

    if (!/^01[3-9]\d{8}$/.test(whatsapp.trim())) {
      setError('অনুগ্রহ করে ১১ ডিজিটের সঠিক হোয়াটসঅ্যাপ নম্বর (যেমন: 01712345678) লিখুন।');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await submitHelperApplication({
        legalName: legalName.trim(),
        nid: nid.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim(),
        fbProfile: fbProfile.trim(),
        hasSmartphone,
        hasCycle,
        hasBike,
        applicationType: 'dedicated',
      });
      setSubmitted(true);
    } catch (err) {
      setError('আবেদন জমা দেওয়া যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              আবেদন সফলভাবে জমা হয়েছে!
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              আপনার ডেডিকেটেড হেলপার আবেদনটি এডমিন রিভিউ করছেন। অনুমোদন সম্পন্ন হলে আপনার হেলপার অ্যাকাউন্ট ডেডিকেটেড রাইডারে উন্নীত হবে।
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
                <h3 className="text-lg font-extrabold text-gray-900">Become a Dedicated Helper</h3>
                <p className="text-xs text-purple-700 font-semibold">ফুল-টাইম বা ডেডিকেটেড রাইডার হিসেবে সার্ভিস দেওয়ার আবেদন</p>
              </div>
            </div>

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

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 mt-2 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-sm shadow-lg shadow-purple-500/20 active:scale-98 transition-all flex items-center justify-center space-x-2"
            >
              {submitting ? (
                <span>আবেদন জমা হচ্ছে...</span>
              ) : (
                <span>Submit Dedicated Helper Application</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
