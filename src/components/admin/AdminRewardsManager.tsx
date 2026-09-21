'use client';

import React, { useState, useEffect } from 'react';
import { fallbackStore } from '@/lib/firebase';
import { RewardPrize, RewardClaim, PricingSettings } from '@/types';
import { useModal } from '../CustomModal';
import {
  Coins,
  Gift,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Save,
  Sparkles,
  Truck,
  Percent,
  X,
  Download,
} from 'lucide-react';
import { AsyncButton } from '../ui/AsyncButton';
import {
  exportRewardClaimsToCSV,
  exportRewardClaimsToPDF,
} from '@/lib/exportUtils';

export const AdminRewardsManager: React.FC = () => {
  const { showAlert, showConfirm } = useModal();
  const [activeSubTab, setActiveSubTab] = useState<'settings' | 'prizes' | 'claims'>('settings');

  // Settings State
  const [pricing, setPricing] = useState<PricingSettings>(fallbackStore.pricingSettings);
  const [serviceCoins, setServiceCoins] = useState<Record<string, number>>(
    fallbackStore.pricingSettings.serviceCoins || {}
  );
  const [defaultCoins, setDefaultCoins] = useState<number>(
    fallbackStore.pricingSettings.defaultOrderCoins ?? 10
  );
  const [freeDeliveryCoins, setFreeDeliveryCoins] = useState<number>(
    fallbackStore.pricingSettings.freeDeliveryRequiredCoins ?? 50
  );
  const [freeDeliveryDiscountPct, setFreeDeliveryDiscountPct] = useState<number>(
    fallbackStore.pricingSettings.freeDeliveryDiscountPercent ?? 100
  );
  const [insufficientTitle, setInsufficientTitle] = useState<string>(
    fallbackStore.pricingSettings.insufficientCoinsTitle || ''
  );
  const [insufficientMessage, setInsufficientMessage] = useState<string>(
    fallbackStore.pricingSettings.insufficientCoinsMessage || ''
  );
  const [tipsText, setTipsText] = useState<string>(
    fallbackStore.pricingSettings.rewardStoreTips || ''
  );
  const [savingSettings, setSavingSettings] = useState(false);

  // Prizes State
  const [prizes, setPrizes] = useState<RewardPrize[]>([]);
  const [editingPrize, setEditingPrize] = useState<RewardPrize | null>(null);
  const [isPrizeModalOpen, setIsPrizeModalOpen] = useState(false);

  // Prize Form State
  const [prizeTitle, setPrizeTitle] = useState('');
  const [prizeDesc, setPrizeDesc] = useState('');
  const [prizeCoins, setPrizeCoins] = useState<number>(50);
  const [prizeDiscount, setPrizeDiscount] = useState<number | undefined>(undefined);
  const [prizeEnabled, setPrizeEnabled] = useState(true);
  const [savingPrize, setSavingPrize] = useState(false);

  // Claims State
  const [claims, setClaims] = useState<RewardClaim[]>([]);
  const [claimsFilter, setClaimsFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [claimsSearch, setClaimsSearch] = useState('');
  const [selectedClaimForAction, setSelectedClaimForAction] = useState<RewardClaim | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [actionNote, setActionNote] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  useEffect(() => {
    const syncData = () => {
      const p = fallbackStore.pricingSettings;
      setPricing({ ...p });
      setServiceCoins({ ...(p.serviceCoins || {}) });
      setDefaultCoins(p.defaultOrderCoins ?? 10);
      setFreeDeliveryCoins(p.freeDeliveryRequiredCoins ?? 50);
      setFreeDeliveryDiscountPct(p.freeDeliveryDiscountPercent ?? 100);
      setInsufficientTitle(p.insufficientCoinsTitle || '');
      setInsufficientMessage(p.insufficientCoinsMessage || '');
      setTipsText(p.rewardStoreTips || '');

      // Purge any legacy demo dummy prizes
      const legacyDummyIds = ['prize-free-delivery', 'prize-voucher-50', 'prize-gift-box'];
      legacyDummyIds.forEach((id) => {
        if (fallbackStore.rewardPrizes.has(id)) {
          fallbackStore.deleteRewardPrize(id).catch(() => {});
        }
      });

      // Prizes
      const prList = Array.from(fallbackStore.rewardPrizes.values())
        .filter((p) => !legacyDummyIds.includes(p.id))
        .sort((a, b) => a.requiredCoins - b.requiredCoins);
      setPrizes(prList);

      // Claims
      const clList = Array.from(fallbackStore.rewardClaims.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setClaims(clList);
    };

    syncData();
    const unsub = fallbackStore.subscribe(syncData);
    return () => unsub();
  }, []);

  // Handle Save Settings
  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      const updatedPricing: PricingSettings = {
        ...pricing,
        defaultOrderCoins: Number(defaultCoins) || 10,
        serviceCoins: { ...serviceCoins },
        freeDeliveryRequiredCoins: Number(freeDeliveryCoins) || 50,
        freeDeliveryDiscountPercent: Math.min(100, Math.max(1, Number(freeDeliveryDiscountPct) || 100)),
        insufficientCoinsTitle: insufficientTitle.trim() || undefined,
        insufficientCoinsMessage: insufficientMessage.trim() || undefined,
        rewardStoreTips: tipsText.trim() || undefined,
      };

      await fallbackStore.savePricingSettings(updatedPricing);
      showAlert('সফল', 'কয়েন ও রিওয়ার্ড সেটিংস সফলভাবে সংরক্ষিত হয়েছে!', 'success');
    } catch (err: any) {
      console.error('Error saving reward settings:', err);
      showAlert('ত্রুটি', 'সেটিংস সংরক্ষণে সমস্যা হয়েছে।', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  // Open Prize Modal for Create / Edit
  const handleOpenPrizeModal = (prize?: RewardPrize) => {
    if (prize) {
      setEditingPrize(prize);
      setPrizeTitle(prize.title);
      setPrizeDesc(prize.description || '');
      setPrizeCoins(prize.requiredCoins);
      setPrizeDiscount(prize.discountPercent);
      setPrizeEnabled(prize.isEnabled !== false);
    } else {
      setEditingPrize(null);
      setPrizeTitle('');
      setPrizeDesc('');
      setPrizeCoins(50);
      setPrizeDiscount(undefined);
      setPrizeEnabled(true);
    }
    setIsPrizeModalOpen(true);
  };

  // Handle Save Prize
  const handleSavePrize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prizeTitle.trim()) {
      showAlert('আবশ্যক তথ্য', 'অনুগ্রহ করে পুরস্কারের নাম লিখুন।', 'warning');
      return;
    }

    try {
      setSavingPrize(true);
      const prizeId = editingPrize ? editingPrize.id : `prize-${Date.now()}`;
      const newPrize: RewardPrize = {
        id: prizeId,
        title: prizeTitle.trim(),
        description: prizeDesc.trim() || undefined,
        requiredCoins: Math.max(1, Number(prizeCoins) || 10),
        discountPercent: prizeDiscount !== undefined && !isNaN(Number(prizeDiscount)) ? Number(prizeDiscount) : undefined,
        isEnabled: prizeEnabled,
        createdAt: editingPrize ? editingPrize.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await fallbackStore.saveRewardPrize(newPrize);
      setIsPrizeModalOpen(false);
      showAlert('সফল', 'পুরস্কার সফলভাবে সংরক্ষিত হয়েছে!', 'success');
    } catch (err: any) {
      console.error('Error saving prize:', err);
      showAlert('ত্রুটি', 'পুরস্কার সংরক্ষণে সমস্যা হয়েছে।', 'error');
    } finally {
      setSavingPrize(false);
    }
  };

  // Handle Delete Prize
  const handleDeletePrize = async (prizeId: string) => {
    const confirmed = await showConfirm(
      'পুরস্কার মুছে ফেলতে চান?',
      'এই পুরস্কারটি তালিকা থেকে মুছে ফেলতে চান নিশ্চিত?',
      'হ্যাঁ, মুছে ফেলুন',
      'বাতিল'
    );
    if (!confirmed) return;

    try {
      await fallbackStore.deleteRewardPrize(prizeId);
      showAlert('মুছে ফেলা হয়েছে', 'পুরস্কার সফলভাবে মুছে ফেলা হয়েছে।', 'info');
    } catch (err) {
      console.error('Error deleting prize:', err);
    }
  };

  // Handle Approve / Reject Claim Action
  const handleExecuteClaimAction = async () => {
    if (!selectedClaimForAction) return;

    try {
      setProcessingAction(true);
      if (actionType === 'APPROVE') {
        await fallbackStore.approveRewardClaim(selectedClaimForAction.id, actionNote.trim() || 'অনুমোদিত', 'Admin');
        showAlert('অনুমোদিত', `দাবিটি অনুমোদিত হয়েছে এবং ব্যবহারকারীর একাউন্ট থেকে ${selectedClaimForAction.requiredCoins} কয়েন কাটা হয়েছে।`, 'success');
      } else {
        await fallbackStore.rejectRewardClaim(selectedClaimForAction.id, actionNote.trim() || 'অনুরোধটি প্রক্রিয়াকরণ করা সম্ভব হয়নি।', 'Admin');
        showAlert('বাতিল করা হয়েছে', 'দাবিটি সফলভাবে বাতিল করা হয়েছে।', 'info');
      }
      setSelectedClaimForAction(null);
      setActionNote('');
    } catch (err) {
      console.error('Error processing claim action:', err);
      showAlert('ত্রুটি', 'দাবি প্রক্রিয়াকরণে সমস্যা হয়েছে।', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  // Filtered Claims
  const filteredClaims = claims.filter((c) => {
    if (claimsFilter !== 'ALL' && c.status !== claimsFilter) return false;
    if (claimsSearch.trim()) {
      const q = claimsSearch.toLowerCase().trim();
      return (
        c.userName.toLowerCase().includes(q) ||
        (c.userPhone && c.userPhone.includes(q)) ||
        (c.userEmail && c.userEmail.toLowerCase().includes(q)) ||
        c.prizeTitle.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const allServices = pricing.services || [
    'Bazar-sodai korte hobe',
    'Khabar ante hobe',
    'Medicine ante hobe',
    'zuta selai korte hobe',
    'amar parcel recive kore dite hobe',
    'mix',
    'onno kicu',
  ];

  return (
    <div className="space-y-5">
      {/* Header & Navigation */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 tracking-tight font-sans">
              কয়েন ও রিওয়ার্ড ম্যানেজমেন্ট (Coins & Gamification)
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              সার্ভিস ভিত্তিক কয়েন আর্নিং, ফ্রি ডেলিভারি ডিসকাউন্ট (1-100%) এবং প্রাইজ পুল পরিচালনা করুন।
            </p>
          </div>
        </div>

        {/* Sub-tabs buttons */}
        <div className="flex items-center bg-gray-100/80 p-1.5 rounded-2xl space-x-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab('settings')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'settings'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            কয়েন ও ডিসকাউন্ট রুলস
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('prizes')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'prizes'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            প্রাইজ পুল ({prizes.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('claims')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'claims'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            দাবির তালিকা ({claims.length})
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: SETTINGS */}
      {activeSubTab === 'settings' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left Card: General & Free Delivery Rules */}
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
              <h3 className="text-sm font-black text-gray-900 flex items-center space-x-2">
                <Truck className="w-4 h-4 text-emerald-600" />
                <span>ফ্রি ডেলিভারি ও সাধারণ কয়েন সেটিংস</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    ডিফল্ট কয়েন (প্রতি অর্ডারে):
                  </label>
                  <input
                    type="number"
                    value={defaultCoins}
                    onChange={(e) => setDefaultCoins(Number(e.target.value))}
                    min={0}
                    className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-amber-500"
                    placeholder="যেমন: 10"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    ক্যাটাগরি নির্দিষ্ট না থাকলে ডিফল্ট কয়েন অর্জিত হবে।
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    ফ্রি ডেলিভারির জন্য প্রয়োজনীয় কয়েন:
                  </label>
                  <input
                    type="number"
                    value={freeDeliveryCoins}
                    onChange={(e) => setFreeDeliveryCoins(Number(e.target.value))}
                    min={1}
                    className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-amber-500"
                    placeholder="যেমন: 50"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    চেকবক্স সিলেক্ট করে ফ্রি ডেলিভারি পেতে এই পরিমাণ কয়েন লাগবে।
                  </p>
                </div>
              </div>

              {/* Delivery Discount Percent (1 - 100%) */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-emerald-900 flex items-center space-x-1.5">
                    <Percent className="w-4 h-4 text-emerald-700" />
                    <span>ডেলিভারি চার্জ ডিসকাউন্ট পার্সেন্টেজ (1–100%):</span>
                  </label>
                  <span className="text-base font-black text-emerald-800 bg-white px-3 py-0.5 rounded-xl border border-emerald-300">
                    {freeDeliveryDiscountPct}% ছাড়
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={freeDeliveryDiscountPct}
                  onChange={(e) => setFreeDeliveryDiscountPct(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <p className="text-[11px] text-emerald-800">
                  {freeDeliveryDiscountPct === 100
                    ? '১০০% সিলেক্ট করায় গ্রাহক সম্পূর্ণ ফ্রি ডেলিভারি পাবেন এবং হেলপারের ডেলিভারি ফি ইনপুট লক থাকবে।'
                    : `গ্রাহক ${freeDeliveryDiscountPct}% ডিসকাউন্ট পাবেন এবং বাকি অংশ ধার্য হবে।`}
                </p>
              </div>

              {/* Insufficient Coins Warning Title & Message */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  পর্যাপ্ত কয়েন না থাকলে পপআপ টাইটেল:
                </label>
                <input
                  type="text"
                  value={insufficientTitle}
                  onChange={(e) => setInsufficientTitle(e.target.value)}
                  placeholder="যেমন: Get Free Delivery বা পর্যাপ্ত কয়েন নেই"
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-amber-500 mb-3"
                />
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  পর্যাপ্ত কয়েন না থাকলে পপআপ মেসেজ:
                </label>
                <textarea
                  value={insufficientMessage}
                  onChange={(e) => setInsufficientMessage(e.target.value)}
                  placeholder="যেমন: আপনার অ্যাকাউন্টে ফ্রি ডেলিভারি পাওয়ার জন্য পর্যাপ্ত কয়েন নেই! আরও অর্ডার করে কয়েন অর্জন করুন।"
                  rows={2}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-amber-500"
                />
              </div>

              {/* Customer Tips Block */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  কাস্টমারদের জন্য রিওয়ার্ড টিপস ও নির্দেশনা:
                </label>
                <textarea
                  value={tipsText}
                  onChange={(e) => setTipsText(e.target.value)}
                  placeholder="যেমন: 💡 জামানত কয়েন টিপস: প্রতি অর্ডারে রেগুলার কয়েন অর্জনের পাশাপাশি নির্দিষ্ট ক্যাম্পেইনে ডাবল কয়েন পাওয়ার সুযোগ রয়েছে..."
                  rows={4}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Right Card: Per-Category / Service Coin Rates */}
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-gray-900 flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>সার্ভিস ভিত্তিক কয়েন আর্নিং রেট</span>
                </h3>
                <span className="text-xs text-gray-500 font-medium">
                  মোট {allServices.length}টি সার্ভিস
                </span>
              </div>

              <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto pr-1">
                {allServices.map((svc) => {
                  const currentRate = serviceCoins[svc] !== undefined ? serviceCoins[svc] : defaultCoins;
                  return (
                    <div key={svc} className="py-2.5 flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-gray-800 line-clamp-1 flex-1">
                        {svc}
                      </span>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <span className="text-xs font-bold text-amber-600">🪙</span>
                        <input
                          type="number"
                          min={0}
                          value={currentRate}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setServiceCoins((prev) => ({
                              ...prev,
                              [svc]: isNaN(val) ? 0 : val,
                            }));
                          }}
                          className="w-20 p-2 rounded-xl border border-gray-200 text-xs font-bold text-right outline-none focus:border-amber-500"
                        />
                        <span className="text-[11px] font-bold text-gray-500">Coins</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Save Action Bar */}
          <div className="flex justify-end pt-2">
            <AsyncButton
              type="button"
              onClick={handleSaveSettings}
              isLoading={savingSettings}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 active:scale-98 transition-all flex items-center space-x-2 cursor-pointer"
            >
              <Save className="w-4 h-4 mr-2" />
              <span>সেটিংস সংরক্ষণ করুন</span>
            </AsyncButton>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: PRIZE POOL */}
      {activeSubTab === 'prizes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-900">
              সক্রিয় পুরস্কার ও প্রাইজ পুল তালিকা
            </h3>
            <button
              type="button"
              onClick={() => handleOpenPrizeModal()}
              className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs flex items-center space-x-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>নতুন পুরস্কার যোগ করুন</span>
            </button>
          </div>

          {prizes.length === 0 ? (
            <div className="text-center py-12 px-4 bg-white rounded-3xl border border-dashed border-gray-200">
              <Gift className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-gray-700">কোনো পুরস্কার তৈরি করা হয়নি</p>
              <p className="text-xs text-gray-500 mt-1 mb-4">
                গ্রাহকদের জন্য কয়েন রিওয়ার্ড এবং গিফট আইটেম যোগ করুন।
              </p>
              <button
                type="button"
                onClick={() => handleOpenPrizeModal()}
                className="px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs"
              >
                + পুরস্কার তৈরি করুন
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {prizes.map((prize) => (
                <div
                  key={prize.id}
                  className={`bg-white rounded-3xl p-5 border shadow-xs space-y-3 flex flex-col justify-between ${
                    prize.isEnabled !== false ? 'border-gray-200' : 'border-gray-200 bg-gray-50/70 opacity-70'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                          {prize.discountPercent ? <Truck className="w-5 h-5 text-emerald-600" /> : <Gift className="w-5 h-5" />}
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-gray-900 leading-tight">
                            {prize.title}
                          </h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border mt-1 inline-block ${
                            prize.isEnabled !== false ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}>
                            {prize.isEnabled !== false ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                          </span>
                        </div>
                      </div>

                      <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                        🪙 {prize.requiredCoins} Coins
                      </span>
                    </div>

                    {prize.description && (
                      <p className="text-xs text-gray-600 font-medium leading-relaxed">
                        {prize.description}
                      </p>
                    )}

                    {prize.discountPercent && (
                      <div className="text-[11px] font-bold text-emerald-700">
                        🎯 ডেলিভারি চার্জ ছাড়: {prize.discountPercent}%
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => handleOpenPrizeModal(prize)}
                      className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
                      title="Edit Prize"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePrize(prize.id)}
                      className="p-2 rounded-xl hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors"
                      title="Delete Prize"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: CLAIMS LEDGER */}
      {activeSubTab === 'claims' && (
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={claimsSearch}
                onChange={(e) => setClaimsSearch(e.target.value)}
                placeholder="গ্রাহকের নাম, ফোন বা পুরস্কার খুঁজুন..."
                className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-amber-500"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center bg-gray-100 p-1 rounded-2xl space-x-1 w-full sm:w-auto overflow-x-auto">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setClaimsFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    claimsFilter === st
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {st === 'ALL' ? 'সকল' : st === 'PENDING' ? 'অপেক্ষমাণ' : st === 'APPROVED' ? 'অনুমোদিত' : 'বাতিল'}
                </button>
              ))}
            </div>

            {/* Export Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => exportRewardClaimsToCSV(filteredClaims)}
                title="Export reward claims to Excel (CSV)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
              <button
                type="button"
                onClick={() => exportRewardClaimsToPDF(filteredClaims)}
                title="Export reward claims to PDF"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
            </div>
          </div>

          {filteredClaims.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-xs font-semibold">
              কোনো দাবি পাওয়া যায়নি।
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredClaims.map((claim) => {
                const statusBadge = {
                  PENDING: { label: 'অপেক্ষমাণ', class: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
                  APPROVED: { label: 'অনুমোদিত', class: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
                  REJECTED: { label: 'বাতিল', class: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
                }[claim.status] || { label: claim.status, class: 'bg-gray-100 text-gray-800', icon: Clock };

                const StatusIcon = statusBadge.icon;

                return (
                  <div key={claim.id} className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-extrabold text-gray-900">
                          {claim.prizeTitle}
                        </h4>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border flex items-center space-x-1 ${statusBadge.class}`}>
                          <StatusIcon className="w-3 h-3" />
                          <span>{statusBadge.label}</span>
                        </span>
                      </div>

                      <p className="text-xs text-gray-600">
                        গ্রাহক: <strong>{claim.userName}</strong> {claim.userPhone && `(${claim.userPhone})`} • খরচ: <strong className="text-amber-700">🪙 {claim.requiredCoins} Coins</strong>
                      </p>

                      {claim.claimNote && (
                        <p className="text-xs text-gray-500 italic">
                          নোট: &quot;{claim.claimNote}&quot;
                        </p>
                      )}

                      <span className="text-[11px] text-gray-400 block">
                        তারিখ: {new Date(claim.createdAt).toLocaleString('bn-BD')}
                      </span>
                    </div>

                    {/* Action Buttons for Pending Claims */}
                    {claim.status === 'PENDING' && (
                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClaimForAction(claim);
                            setActionType('APPROVE');
                            setActionNote('');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-xs transition-all active:scale-95 cursor-pointer flex items-center space-x-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>অনুমোদন</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClaimForAction(claim);
                            setActionType('REJECT');
                            setActionNote('');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-extrabold border border-red-200 transition-all active:scale-95 cursor-pointer flex items-center space-x-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>বাতিল</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE / EDIT PRIZE */}
      {isPrizeModalOpen && (
        <div className="fixed inset-0 z-[10020] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-gray-900">
                {editingPrize ? 'পুরস্কার সম্পাদনা করুন' : 'নতুন পুরস্কার যোগ করুন'}
              </h3>
              <button
                type="button"
                onClick={() => setIsPrizeModalOpen(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePrize} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  পুরস্কারের নাম *
                </label>
                <input
                  type="text"
                  value={prizeTitle}
                  onChange={(e) => setPrizeTitle(e.target.value)}
                  placeholder="যেমন: ১০০% ফ্রি ডেলিভারি বা ৳৫০ ডিসকাউন্ট"
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-semibold outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  প্রয়োজনীয় কয়েন *
                </label>
                <input
                  type="number"
                  min={1}
                  value={prizeCoins}
                  onChange={(e) => setPrizeCoins(Number(e.target.value))}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-semibold outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  ডেলিভারি ডিসকাউন্ট % (যদি ডেলিভারি কুপন হয়):
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={prizeDiscount !== undefined ? prizeDiscount : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPrizeDiscount(v === '' ? undefined : Number(v));
                  }}
                  placeholder="যেমন: 100 (সম্পূর্ণ ফ্রি) বা 50 (অর্ধেক ছাড়)"
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-semibold outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  বিবরণ বা শর্তাবলী:
                </label>
                <textarea
                  value={prizeDesc}
                  onChange={(e) => setPrizeDesc(e.target.value)}
                  placeholder="পুরস্কারের বিস্তারিত বিবরণ ও শর্ত লিখুন..."
                  rows={2}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="prizeEnabled"
                  checked={prizeEnabled}
                  onChange={(e) => setPrizeEnabled(e.target.checked)}
                  className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                />
                <label htmlFor="prizeEnabled" className="text-xs font-bold text-gray-800 cursor-pointer">
                  পুরস্কারটি গ্রাহকদের জন্য সক্রিয় থাকবে
                </label>
              </div>

              <div className="flex space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsPrizeModalOpen(false)}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
                >
                  বাতিল
                </button>
                <AsyncButton
                  type="submit"
                  isLoading={savingPrize}
                  className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold shadow-sm active:scale-95 cursor-pointer"
                >
                  সংরক্ষণ করুন
                </AsyncButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: APPROVE / REJECT CLAIM ACTION */}
      {selectedClaimForAction && (
        <div className="fixed inset-0 z-[10020] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-gray-900">
                {actionType === 'APPROVE' ? 'পুরস্কার দাবি অনুমোদন' : 'পুরস্কার দাবি বাতিল'}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedClaimForAction(null)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-1">
              <p>গ্রাহক: <strong>{selectedClaimForAction.userName}</strong></p>
              <p>পুরস্কার: <strong>{selectedClaimForAction.prizeTitle}</strong></p>
              <p>কয়েন: <strong className="text-amber-700 font-extrabold">🪙 {selectedClaimForAction.requiredCoins}</strong></p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                {actionType === 'APPROVE' ? 'এডমিন নোট (ঐচ্ছিক):' : 'বাতিল করার কারণ:'}
              </label>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder={actionType === 'APPROVE' ? 'যেমন: কুপন কোড প্রদান বা গিফট ডেলিভারি নিশ্চিত...' : 'বাতিলের কারণ লিখুন...'}
                rows={3}
                className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedClaimForAction(null)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                বাতিল
              </button>
              <AsyncButton
                type="button"
                onClick={handleExecuteClaimAction}
                isLoading={processingAction}
                className={`flex-1 py-3 rounded-2xl text-white text-xs font-extrabold shadow-sm active:scale-95 cursor-pointer ${
                  actionType === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {actionType === 'APPROVE' ? 'অনুমোদন নিশ্চিত করুন' : 'বাতিল নিশ্চিত করুন'}
              </AsyncButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
