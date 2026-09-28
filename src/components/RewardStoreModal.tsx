'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, isUserAuthenticated } from '@/context/AuthContext';
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
  X,
  Truck,
  Send,
  Zap,
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
    <circle cx="12" cy="12" r="9.5" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.65" />
    <polygon
      points="12,7 13.5,10.3 17,10.8 14.5,13.2 15.1,16.6 12,14.9 8.9,16.6 9.5,13.2 7,10.8 10.5,10.3"
      fill="currentColor"
    />
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
  const { user, openAuthModal } = useAuth();
  const { showAlert } = useModal();
  const [activeTab, setActiveTab] = useState<'prizes' | 'my_claims' | 'how_to_earn'>('prizes');
  const [claimingPrize, setClaimingPrize] = useState<RewardPrize | null>(null);
  const [claimNote, setClaimNote] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);

  const [prizes, setPrizes] = useState<RewardPrize[]>([]);
  const [myClaims, setMyClaims] = useState<RewardClaim[]>([]);
  const [pricingSettings, setPricingSettings] = useState<PricingSettings>(fallbackStore.pricingSettings);

  // Auto fetch latest active prizes from server whenever modal opens
  useEffect(() => {
    if (isOpen) {
      fallbackStore.fetchRewardPrizes().catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    const syncData = () => {
      setPricingSettings({ ...fallbackStore.pricingSettings });

      // Purge legacy demo dummy prizes
      const legacyDummyIds = ['prize-free-delivery', 'prize-voucher-50', 'prize-gift-box'];
      legacyDummyIds.forEach((id) => {
        if (fallbackStore.rewardPrizes.has(id)) {
          fallbackStore.deleteRewardPrize(id).catch(() => {});
        }
      });

      // Load prizes created by Admin
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
  const freeDeliveryTarget = pricingSettings.freeDeliveryRequiredCoins ?? 50;
  const isFreeDeliveryEligible = currentCoins >= freeDeliveryTarget;
  const progressPercent = Math.min(100, Math.round((currentCoins / Math.max(1, freeDeliveryTarget)) * 100));

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !claimingPrize) return;

    const isAlreadyPending = myClaims.some(
      (c) => c.prizeId === claimingPrize.id && c.status === 'PENDING'
    );
    if (isAlreadyPending) {
      showAlert(
        'Claim Pending',
        'A claim for this prize is already submitted and waiting for review. You can claim again after admin approval.',
        'warning'
      );
      setClaimingPrize(null);
      return;
    }

    if (currentCoins < claimingPrize.requiredCoins) {
      showAlert(
        'Not Enough Coins',
        `You need ${claimingPrize.requiredCoins} coins to claim this prize. Your current balance: ${currentCoins} coins.`,
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
        'Claim Submitted!',
        `Your request for "${claimingPrize.title}" has been submitted. Coins will be deducted after admin approval.`,
        'success'
      );

      setClaimingPrize(null);
      setClaimNote('');
      setActiveTab('my_claims');
    } catch (err: any) {
      console.error('Error submitting claim:', err);
      showAlert('Error', err?.message || 'Failed to submit claim. Please try again.', 'error');
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
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-emerald-100 flex flex-col max-h-[90vh] max-h-[90dvh] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimalist Gamified Header Card */}
        <div className="relative bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-4 sm:p-5 text-white overflow-hidden shrink-0 shadow-sm">
          <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors cursor-pointer z-10"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Title & Coin Balance */}
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner shrink-0">
                <SingleCoinIcon className="w-5 h-5 text-yellow-300 drop-shadow-xs" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white tracking-tight leading-tight">
                  Jamanot Coins & Rewards
                </h2>
                <p className="text-[11px] text-emerald-100 font-medium">
                  Total Earned: {lifetimeCoins} Coins
                </p>
              </div>
            </div>

            {/* Current Balance Tag */}
            <div className="text-right">
              <div className="flex items-baseline justify-end space-x-1">
                <span className="text-2xl font-black text-yellow-300 font-sans tracking-tight">
                  {currentCoins}
                </span>
                <span className="text-[11px] font-bold text-emerald-100">Coins</span>
              </div>
            </div>
          </div>

          {/* Free Delivery Dynamic Progress Banner */}
          <div className="mt-3.5 p-3 rounded-2xl bg-emerald-950/45 backdrop-blur-md border border-emerald-400/30">
            <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
              <div className="flex items-center space-x-1.5 text-yellow-300">
                <Truck className="w-3.5 h-3.5 shrink-0" />
                <span>Free Delivery ({freeDeliveryTarget} Coins)</span>
              </div>
              <span className={`text-[11px] font-black ${isFreeDeliveryEligible ? 'text-emerald-300' : 'text-emerald-200'}`}>
                {isFreeDeliveryEligible ? 'Unlocked ✓' : `${currentCoins}/${freeDeliveryTarget}`}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-black/30 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  isFreeDeliveryEligible
                    ? 'bg-gradient-to-r from-yellow-300 to-emerald-300'
                    : 'bg-gradient-to-r from-amber-400 to-yellow-300'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <p className="text-[11px] text-emerald-100 mt-1.5 font-medium leading-tight">
              {isFreeDeliveryEligible ? (
                <span className="text-emerald-200">
                  🎉 You are eligible for free delivery! Select the option when creating your request.
                </span>
              ) : (
                <span>
                  Need <strong className="text-yellow-300 font-bold">{Math.max(0, freeDeliveryTarget - currentCoins)} more coins</strong> for free delivery.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Insufficient Notice (if opened from action) */}
        {initialMode === 'insufficient_coins' && (
          <div className="p-2.5 px-4 bg-amber-50 border-b border-amber-200 flex items-center space-x-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <p className="text-xs text-amber-900 font-medium leading-tight truncate">
              {insufficientMessage || `Need ${requiredCoinsForAction ?? freeDeliveryTarget} coins (You have ${currentCoins} coins)`}
            </p>
          </div>
        )}

        {/* Minimalist Tabs Bar */}
        <div className="flex border-b border-gray-100 px-3 shrink-0 bg-white">
          <button
            onClick={() => setActiveTab('prizes')}
            className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'prizes'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Prize Pool ({prizes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('my_claims')}
            className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'my_claims'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>My Claims ({myClaims.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('how_to_earn')}
            className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'how_to_earn'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Coin Rates</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 space-y-2.5">
          {/* TAB 1: PRIZE POOL */}
          {activeTab === 'prizes' && (
            <div className="space-y-2.5">
              {prizes.length === 0 ? (
                <div className="text-center py-10 px-4 bg-emerald-50/30 rounded-2xl border border-dashed border-emerald-200">
                  <Gift className="w-8 h-8 text-emerald-400 mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-gray-800">No prizes available right now</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Keep saving coins, exciting new prizes are coming soon!
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
                      className={`p-3 rounded-2xl border transition-all ${
                        isPendingForThisPrize
                          ? 'bg-amber-50/40 border-amber-200'
                          : canClaim
                          ? 'bg-emerald-50/30 border-emerald-200 hover:border-emerald-300'
                          : 'bg-gray-50/70 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isPendingForThisPrize
                              ? 'bg-amber-500 text-white'
                              : canClaim
                              ? 'bg-emerald-600 text-white'
                              : 'bg-gray-200 text-gray-500'
                          }`}>
                            {prize.discountPercent ? (
                              <Truck className="w-4 h-4" />
                            ) : (
                              <Gift className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5 truncate">
                              <h3 className="text-xs sm:text-sm font-bold text-gray-900 truncate">
                                {prize.title}
                              </h3>
                              {isPendingForThisPrize && (
                                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                                  Pending
                                </span>
                              )}
                            </div>
                            {prize.description && (
                              <p className="text-[11px] text-gray-500 truncate font-medium">
                                {prize.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Required Coins Badge */}
                        <div className="shrink-0 flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <SingleCoinIcon className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{prize.requiredCoins}</span>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                        {isPendingForThisPrize ? (
                          <span className="font-semibold text-amber-700 flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Pending approval</span>
                          </span>
                        ) : canClaim ? (
                          <span className="font-bold text-emerald-700 flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Ready to claim</span>
                          </span>
                        ) : (
                          <span className="font-medium text-gray-500">
                            Need <strong className="text-emerald-800 font-bold">{needed} more coins</strong>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (!isUserAuthenticated(user)) {
                              openAuthModal();
                              return;
                            }
                            if (isPendingForThisPrize) {
                              showAlert('Claim Pending', 'A claim for this prize is already pending review.', 'warning');
                              return;
                            }
                            setClaimingPrize(prize);
                          }}
                          disabled={isPendingForThisPrize || !canClaim}
                          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                            isPendingForThisPrize
                              ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed opacity-90'
                              : canClaim
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white shadow-xs active:scale-95'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {isPendingForThisPrize ? 'Pending' : canClaim ? 'Claim' : 'Get'}
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
            <div className="space-y-2">
              {myClaims.length === 0 ? (
                <div className="text-center py-8 px-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <Award className="w-8 h-8 text-gray-300 mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-gray-700">No claims found</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    You can claim rewards from the Prize Pool using your coins.
                  </p>
                </div>
              ) : (
                myClaims.map((claim) => {
                  const statusConfig = {
                    PENDING: { label: 'Pending', class: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
                    APPROVED: { label: 'Approved', class: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
                    REJECTED: { label: 'Rejected', class: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
                  }[claim.status] || { label: claim.status, class: 'bg-gray-100 text-gray-800 border-gray-200', icon: Clock };

                  const StatusIcon = statusConfig.icon;

                  return (
                    <div
                      key={claim.id}
                      className="p-3 rounded-2xl bg-white border border-gray-200 shadow-2xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-extrabold text-gray-900 truncate">
                          {claim.prizeTitle}
                        </h4>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border flex items-center space-x-1 shrink-0 ${statusConfig.class}`}>
                          <StatusIcon className="w-3 h-3" />
                          <span>{statusConfig.label}</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-medium text-gray-600">
                        <span className="flex items-center space-x-1">
                          <span>Cost:</span>
                          <SingleCoinIcon className="w-3 h-3 text-emerald-700" />
                          <strong className="text-emerald-800 font-bold">{claim.requiredCoins} Coins</strong>
                        </span>
                        <span className="text-gray-400 text-[10px]">
                          {new Date(claim.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      {claim.reviewNote && (
                        <p className="text-[11px] text-gray-600 italic bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                          Note: {claim.reviewNote}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: COIN RATES */}
          {activeTab === 'how_to_earn' && (
            <div className="space-y-2.5 text-xs">
              <div className="rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {Object.entries(pricingSettings.serviceCoins || {}).map(([svc, coins]) => (
                  <div key={svc} className="px-3 py-2 flex items-center justify-between bg-white">
                    <span className="text-gray-800 font-semibold truncate pr-2 text-xs">{svc}</span>
                    <span className="font-extrabold text-emerald-700 flex items-center space-x-1 shrink-0 text-xs">
                      <SingleCoinIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span>+{coins}</span>
                    </span>
                  </div>
                ))}
                <div className="px-3 py-2 flex items-center justify-between bg-gray-50/60 text-xs">
                  <span className="text-gray-700 font-medium">Standard Service (Default)</span>
                  <span className="font-extrabold text-emerald-700 flex items-center space-x-1 shrink-0">
                    <SingleCoinIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>+{pricingSettings.defaultOrderCoins ?? 10}</span>
                  </span>
                </div>
              </div>

              {/* Dynamic Free Delivery Hint */}
              <div className="p-2.5 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 text-[11px] text-emerald-950 flex items-center space-x-2">
                <Truck className="w-4 h-4 text-emerald-700 shrink-0" />
                <p className="leading-snug">
                  You need at least <strong>{freeDeliveryTarget} coins</strong> for free delivery on your orders.
                </p>
              </div>

              {/* Custom Admin Tips (if present, shown minimally) */}
              {pricingSettings.rewardStoreTips && (
                <div className="p-2.5 bg-amber-50/60 rounded-2xl border border-amber-200/60 text-[11px] text-amber-950 flex items-start space-x-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed whitespace-pre-line font-medium">
                    {pricingSettings.rewardStoreTips}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Claim Confirmation Modal Overlay */}
        {claimingPrize && (
          <div className="absolute inset-0 z-30 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="w-full max-w-sm bg-white rounded-3xl p-4 sm:p-5 shadow-2xl border border-emerald-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-gray-900">
                  Confirm Reward Claim
                </h3>
                <button
                  type="button"
                  onClick={() => setClaimingPrize(null)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <p className="font-bold text-gray-900">{claimingPrize.title}</p>
                <div className="flex items-center space-x-1">
                  <span>Cost:</span>
                  <SingleCoinIcon className="w-3.5 h-3.5 text-emerald-700" />
                  <strong className="text-emerald-900 font-extrabold">{claimingPrize.requiredCoins} Coins</strong>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Note / Delivery Address (Optional):
                </label>
                <textarea
                  value={claimNote}
                  onChange={(e) => setClaimNote(e.target.value)}
                  placeholder="e.g. Delivery address or special instructions..."
                  rows={2}
                  className="w-full p-2 rounded-xl border border-gray-200 text-xs font-medium outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setClaimingPrize(null)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>

                <AsyncButton
                  type="button"
                  onClick={handleClaimSubmit}
                  isLoading={submittingClaim}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white text-xs font-extrabold shadow-xs active:scale-95 cursor-pointer"
                >
                  <Send className="w-3 h-3 mr-1" />
                  <span>Submit Claim</span>
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
