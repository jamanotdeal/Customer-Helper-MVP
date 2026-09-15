'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { fallbackStore } from '@/lib/firebase';
import { RewardPrize, RewardClaim, PricingSettings } from '@/types';
import { useModal } from './CustomModal';
import {
  Gift,
  Award,
  Sparkles,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Info,
  X,
  Truck,
  Flame,
  Send,
} from 'lucide-react';
import { AsyncButton } from './ui/AsyncButton';

// Reusable Clean Single Coin Icon
export const SingleCoinIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5" opacity="0.8" />
    <path d="M12 6.5l1.6 3.6 3.9.4-2.9 2.6.8 3.9-3.4-2-3.4 2 .8-3.9-2.9-2.6 3.9-.4z" />
  </svg>
);

interface RewardStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'default' | 'insufficient_coins';
  insufficientMessage?: string;
  requiredCoinsForAction?: number;
}

export const RewardStoreModal: React.FC<RewardStoreModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'default',
  insufficientMessage,
  requiredCoinsForAction,
}) => {
  const { user } = useAuth();
  const { showAlert } = useModal();
  const [activeTab, setActiveTab] = useState<'prizes' | 'my_claims' | 'how_to_earn'>('prizes');
  const [claimingPrize, setClaimingPrize] = useState<RewardPrize | null>(null);
  const [claimNote, setClaimNote] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);

  const [prizes, setPrizes] = useState<RewardPrize[]>([]);
  const [myClaims, setMyClaims] = useState<RewardClaim[]>([]);
  const [pricingSettings, setPricingSettings] = useState<PricingSettings>(fallbackStore.pricingSettings);

  useEffect(() => {
    const syncData = () => {
      setPricingSettings({ ...fallbackStore.pricingSettings });

      // Purge any legacy demo dummy prizes
      const legacyDummyIds = ['prize-free-delivery', 'prize-voucher-50', 'prize-gift-box'];
      legacyDummyIds.forEach((id) => {
        if (fallbackStore.rewardPrizes.has(id)) {
          fallbackStore.deleteRewardPrize(id).catch(() => {});
        }
      });

      // Load prizes created by Admin (No dummy prizes)
      const activePrizes = Array.from(fallbackStore.rewardPrizes.values())
        .filter((p) => p.isEnabled !== false && !legacyDummyIds.includes(p.id))
        .sort((a, b) => a.requiredCoins - b.requiredCoins);
      
      setPrizes(activePrizes);

      // Load user claims
      if (user) {
        fallbackStore.reconcileCustomerCoins(user.uid);
        const claims = Array.from(fallbackStore.rewardClaims.values())
          .filter((c) => c.userId === user.uid)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setMyClaims(claims);
      } else {
        setMyClaims([]);
      }
    };

    syncData();
    const unsub = fallbackStore.subscribe(syncData);
    return () => unsub();
  }, [user]);

  if (!isOpen || typeof document === 'undefined') return null;

  const currentCoins = user?.coins || 0;
  const lifetimeCoins = user?.totalEarnedCoins || currentCoins;

  // Calculate Tier
  const getTierInfo = (coins: number) => {
    if (coins >= 500) return { name: 'Platinum', badgeClass: 'bg-white/25 text-white border-white/40' };
    if (coins >= 200) return { name: 'Gold', badgeClass: 'bg-yellow-400/30 text-yellow-200 border-yellow-300/40' };
    if (coins >= 50) return { name: 'Silver', badgeClass: 'bg-white/20 text-white border-white/30' };
    return null;
  };

  const tier = getTierInfo(lifetimeCoins);

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !claimingPrize) return;

    // Check if user already has an active pending claim for this same prize
    const isAlreadyPending = myClaims.some(
      (c) => c.prizeId === claimingPrize.id && c.status === 'PENDING'
    );
    if (isAlreadyPending) {
      showAlert(
        'দাবি অপেক্ষমাণ',
        'এই পুরস্কারের একটি দাবি ইতোমধ্যে পর্যালোচনার জন্য জমা রয়েছে। এডমিন এটি অনুমোদন বা বাতিল করার পর আপনি আবার দাবি করতে পারবেন।',
        'warning'
      );
      setClaimingPrize(null);
      return;
    }

    if (currentCoins < claimingPrize.requiredCoins) {
      showAlert(
        'পর্যাপ্ত কয়েন নেই',
        `এই পুরস্কার দাবি করতে আপনার ${claimingPrize.requiredCoins} কয়েন প্রয়োজন। আপনার বর্তমান ব্যালেন্স: ${currentCoins} কয়েন।`,
        'warning'
      );
      return;
    }

    try {
      setSubmittingClaim(true);
      await fallbackStore.submitRewardClaim({
        userId: user.uid,
        userName: user.displayName || user.email || 'Customer',
        userPhone: user.phoneNumber || user.alternativePhone,
        userEmail: user.email,
        prizeId: claimingPrize.id,
        prizeTitle: claimingPrize.title,
        requiredCoins: claimingPrize.requiredCoins,
        discountPercent: claimingPrize.discountPercent,
        claimNote: claimNote.trim() || undefined,
      });

      showAlert(
        'দাবি সফলভাবে জমা হয়েছে!',
        `আপনার "${claimingPrize.title}" পুরস্কার দাবিটি এডমিনের কাছে পর্যালোচনার জন্য পাঠানো হয়েছে। এডমিন অনুমোদন দিলে কয়েন কাটা হবে ও আপনি নোটিফিকেশন পাবেন।`,
        'success'
      );

      setClaimingPrize(null);
      setClaimNote('');
      setActiveTab('my_claims');
    } catch (err: any) {
      console.error('Error submitting claim:', err);
      showAlert('ত্রুটি', err?.message || 'দাবি জমা দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।', 'error');
    } finally {
      setSubmittingClaim(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10015] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-emerald-100 flex flex-col max-h-[92vh] max-h-[92dvh] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Gamified Card (Rich Green Theme) */}
        <div className="relative bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-5 text-white overflow-hidden shrink-0 shadow-sm">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute left-1/3 -top-10 w-24 h-24 bg-emerald-300/20 rounded-full blur-2xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors cursor-pointer z-10"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3">
            {/* Single Clean Coin Icon */}
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner shrink-0">
              <SingleCoinIcon className="w-7 h-7 text-yellow-300 drop-shadow-sm" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-black tracking-tight text-white font-sans">
                  জামানত কয়েন ও রিওয়ার্ড
                </h2>
                {tier && (
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${tier.badgeClass}`}>
                    {tier.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-emerald-100 font-medium">
                অর্ডার সম্পন্ন করুন, কয়েন জমিয়ে ফ্রি গিফট নিন!
              </p>
            </div>
          </div>

          {/* Coin Balance Highlight Block */}
          <div className="mt-4 p-3.5 rounded-2xl bg-emerald-950/40 backdrop-blur-md border border-emerald-400/30 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider block">
                আপনার বর্তমান ব্যালেন্স
              </span>
              <div className="flex items-baseline space-x-1.5 mt-0.5">
                <span className="text-2xl font-black text-yellow-300 tracking-tight font-sans">
                  {currentCoins}
                </span>
                <span className="text-xs font-bold text-emerald-100">Coins</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider block">
                সর্বমোট অর্জিত
              </span>
              <div className="flex items-center justify-end space-x-1 mt-0.5">
                <SingleCoinIcon className="w-3.5 h-3.5 text-yellow-300" />
                <span className="text-sm font-extrabold text-white">
                  {lifetimeCoins} Coins
                </span>
              </div>
            </div>
          </div>

          {/* Tips Block directly under the coin balance block */}
          {pricingSettings.rewardStoreTips && (
            <div className="mt-3 p-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 text-white text-xs leading-relaxed">
              <div className="flex items-center space-x-1.5 font-extrabold text-yellow-300 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                <span>টিপস ও নির্দেশনা:</span>
              </div>
              <p className="text-[11px] font-medium text-emerald-50 whitespace-pre-line leading-relaxed">
                {pricingSettings.rewardStoreTips}
              </p>
            </div>
          )}
        </div>

        {/* Insufficient Coins Notice (if opened from free delivery click) */}
        {initialMode === 'insufficient_coins' && (
          <div className="p-3 bg-emerald-50 border-b border-emerald-200 flex items-start space-x-2.5 shrink-0">
            <AlertCircle className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-950 leading-relaxed font-medium">
              <p className="font-bold text-emerald-900">
                {insufficientMessage || pricingSettings.insufficientCoinsMessage || 'আপনার অ্যাকাউন্টে পর্যাপ্ত কয়েন নেই!'}
              </p>
              {typeof requiredCoinsForAction === 'number' && (
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  প্রয়োজন: <strong>{requiredCoinsForAction} কয়েন</strong> (আপনার আছে: <strong>{currentCoins} কয়েন</strong>, আরও <strong>{Math.max(0, requiredCoinsForAction - currentCoins)} কয়েন</strong> দরকার)
                </p>
              )}
            </div>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex border-b border-emerald-100 px-4 shrink-0 bg-white">
          <button
            onClick={() => setActiveTab('prizes')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'prizes'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-emerald-700'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>প্রাইজ পুল ({prizes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('my_claims')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'my_claims'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-emerald-700'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>আমার দাবি ({myClaims.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('how_to_earn')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'how_to_earn'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-emerald-700'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>কয়েন আয়ের নিয়ম</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {/* TAB 1: PRIZE POOL */}
          {activeTab === 'prizes' && (
            <div className="space-y-3">
              {prizes.length === 0 ? (
                <div className="text-center py-12 px-4 bg-emerald-50/40 rounded-2xl border border-dashed border-emerald-200">
                  <Gift className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-gray-800">বর্তমানে কোনো পুরস্কার সক্রিয় নেই</p>
                  <p className="text-xs text-gray-500 mt-1">
                    এডমিন নতুন পুরস্কার যোগ করলে এখানে দেখতে পাবেন। কয়েন জমিয়ে রাখুন!
                  </p>
                </div>
              ) : (
                prizes.map((prize) => {
                  const canClaim = currentCoins >= prize.requiredCoins;
                  const needed = Math.max(0, prize.requiredCoins - currentCoins);
                  const isPendingForThisPrize = myClaims.some(
                    (c) => c.prizeId === prize.id && c.status === 'PENDING'
                  );

                  return (
                    <div
                      key={prize.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isPendingForThisPrize
                          ? 'bg-amber-50/50 border-amber-200'
                          : canClaim
                          ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300 shadow-xs'
                          : 'bg-gray-50/70 border-gray-200 opacity-90'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start space-x-3">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                            isPendingForThisPrize
                              ? 'bg-amber-500 text-white shadow-xs'
                              : canClaim
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-gray-200 text-gray-500'
                          }`}>
                            {prize.discountPercent ? (
                              <Truck className="w-6 h-6" />
                            ) : (
                              <Gift className="w-6 h-6" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="text-sm font-extrabold text-gray-900 leading-tight">
                                {prize.title}
                              </h3>
                              {isPendingForThisPrize && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center space-x-1">
                                  <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                                  <span>দাবি অপেক্ষমাণ</span>
                                </span>
                              )}
                            </div>
                            {prize.description && (
                              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed font-medium">
                                {prize.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Required Coins Badge with clean single coin */}
                        <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center space-x-1">
                          <SingleCoinIcon className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{prize.requiredCoins}</span>
                        </span>
                      </div>

                      <div className="mt-3.5 pt-3 border-t border-gray-200/60 flex items-center justify-between">
                        {isPendingForThisPrize ? (
                          <span className="text-[11px] font-bold text-amber-700 flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>দাবি পর্যালোচনায় আছে (এডমিনের অনুমোদনের অপেক্ষায়)</span>
                          </span>
                        ) : canClaim ? (
                          <span className="text-[11px] font-bold text-emerald-700 flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>আপনার পর্যাপ্ত কয়েন আছে!</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-gray-500">
                            আরও <strong className="text-emerald-800 font-bold">{needed} কয়েন</strong> প্রয়োজন
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (!user) {
                              showAlert('লগইন আবশ্যক', 'পুরস্কার দাবি করতে অনুগ্রহ করে লগইন করুন।', 'info');
                              return;
                            }
                            if (isPendingForThisPrize) {
                              showAlert('দাবি অপেক্ষমাণ', 'এই পুরস্কারের একটি দাবি ইতোমধ্যে পর্যালোচনার জন্য জমা রয়েছে। এডমিন এটি অনুমোদন বা বাতিল করার পর আপনি আবার দাবি করতে পারবেন।', 'warning');
                              return;
                            }
                            setClaimingPrize(prize);
                          }}
                          disabled={isPendingForThisPrize || !canClaim}
                          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                            isPendingForThisPrize
                              ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed opacity-90'
                              : canClaim
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm active:scale-95'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {isPendingForThisPrize ? 'অপেক্ষমাণ' : canClaim ? 'Claim it' : 'লকড'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: MY CLAIMS */}
          {activeTab === 'my_claims' && (
            <div className="space-y-3">
              {myClaims.length === 0 ? (
                <div className="text-center py-10 px-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <Award className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-gray-700">কোনো দাবি পাওয়া যায়নি</p>
                  <p className="text-xs text-gray-500 mt-1">
                    প্রাইজ পুল থেকে আপনার পছন্দের পুরস্কার দাবি করতে পারেন।
                  </p>
                </div>
              ) : (
                myClaims.map((claim) => {
                  const statusConfig = {
                    PENDING: { label: 'অপেক্ষমাণ (Pending)', class: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
                    APPROVED: { label: 'অনুমোদিত (Approved)', class: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
                    REJECTED: { label: 'বাতিল (Rejected)', class: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
                  }[claim.status] || { label: claim.status, class: 'bg-gray-100 text-gray-800 border-gray-200', icon: Clock };

                  const StatusIcon = statusConfig.icon;

                  return (
                    <div
                      key={claim.id}
                      className="p-3.5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-extrabold text-gray-900">
                            {claim.prizeTitle}
                          </h4>
                          <span className="text-[11px] text-gray-500 font-medium">
                            দাবি তারিখ: {new Date(claim.createdAt).toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border flex items-center space-x-1 ${statusConfig.class}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          <span>{statusConfig.label}</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100 font-medium text-gray-600">
                        <span className="flex items-center space-x-1">
                          <span>কয়েন খরচ:</span>
                          <SingleCoinIcon className="w-3.5 h-3.5 text-emerald-700" />
                          <strong className="text-emerald-800 font-bold">{claim.requiredCoins}</strong>
                        </span>
                        {claim.reviewNote && (
                          <span className="text-gray-700 italic">
                            এডমিন নোট: {claim.reviewNote}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: HOW TO EARN */}
          {activeTab === 'how_to_earn' && (
            <div className="space-y-3 text-xs text-gray-700 leading-relaxed font-medium">
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                <h4 className="font-extrabold text-emerald-900 flex items-center space-x-1.5 mb-1.5">
                  <Flame className="w-4 h-4 text-emerald-600" />
                  <span>কয়েন আয়ের নিয়মাবলী</span>
                </h4>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  প্রতিটি ডেলিভারি সফলভাবে সম্পন্ন হলে স্বয়ংক্রিয়ভাবে আপনার একাউন্টে কয়েন যোগ হবে। সার্ভিসের ধরন অনুযায়ী কয়েন পরিমাণ নির্ধারিত হয়:
                </p>
              </div>

              {/* Service Rates Table */}
              <div className="rounded-2xl border border-gray-200 overflow-hidden">
                <div className="bg-emerald-50/70 px-3.5 py-2 font-bold text-emerald-900 text-[11px]">
                  সার্ভিস অনুযায়ী কয়েন রেট:
                </div>
                <div className="divide-y divide-gray-100">
                  {Object.entries(pricingSettings.serviceCoins || {}).map(([svc, coins]) => (
                    <div key={svc} className="px-3.5 py-2 flex items-center justify-between">
                      <span className="text-gray-800 font-semibold">{svc}</span>
                      <span className="font-extrabold text-emerald-700 flex items-center space-x-1">
                        <SingleCoinIcon className="w-3.5 h-3.5 text-emerald-600" />
                        <span>+{coins} Coins</span>
                      </span>
                    </div>
                  ))}
                  <div className="px-3.5 py-2 flex items-center justify-between bg-gray-50/50">
                    <span className="text-gray-700 font-medium">অন্যান্য সকল সাধারণ সার্ভিস (ডিফল্ট)</span>
                    <span className="font-extrabold text-emerald-700 flex items-center space-x-1">
                      <SingleCoinIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span>+{pricingSettings.defaultOrderCoins || 10} Coins</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-[11px] text-emerald-900 leading-relaxed">
                <strong>ফ্রি ডেলিভারি টিপস:</strong> আপনার কাছে <strong>{pricingSettings.freeDeliveryRequiredCoins || 50} কয়েন</strong> থাকলেই রিকোয়েস্ট তৈরি করার সময় &quot;ফ্রি ডেলিভারি&quot; অপশন সিলেক্ট করে ডেলিভারি চার্জ সম্পূর্ণ ফ্রি নিতে পারবেন!
              </div>
            </div>
          )}
        </div>

        {/* Claim Confirmation Modal Overlay */}
        {claimingPrize && (
          <div className="absolute inset-0 z-30 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-emerald-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-gray-900">
                  পুরস্কার দাবির নিশ্চিতকরণ
                </h3>
                <button
                  type="button"
                  onClick={() => setClaimingPrize(null)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <p className="font-bold text-sm text-gray-900">{claimingPrize.title}</p>
                <div className="flex items-center space-x-1">
                  <span>খরচ হবে:</span>
                  <SingleCoinIcon className="w-3.5 h-3.5 text-emerald-700" />
                  <strong className="text-emerald-900 font-extrabold">{claimingPrize.requiredCoins} কয়েন</strong>
                </div>
                <p className="text-[11px] text-gray-600">
                  দাবি জমা দেওয়ার পর এডমিন অনুমোদন দিলে কয়েন কাটা হবে।
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  নোট বা ঠিকানা (ঐচ্ছিক):
                </label>
                <textarea
                  value={claimNote}
                  onChange={(e) => setClaimNote(e.target.value)}
                  placeholder="যেমন: ডেলিভারি ঠিকানা বা কোনো বিশেষ অনুরোধ..."
                  rows={3}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-medium outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setClaimingPrize(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
                >
                  বাতিল
                </button>

                <AsyncButton
                  type="button"
                  onClick={handleClaimSubmit}
                  isLoading={submittingClaim}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white text-xs font-extrabold shadow-sm active:scale-95 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 mr-1" />
                  <span>দাবি পাঠান</span>
                </AsyncButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
