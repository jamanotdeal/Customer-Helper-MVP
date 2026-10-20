'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { fallbackStore, normalizePhoneNumber, formatWhatsAppNumber } from '@/lib/firebase';
import { Referral } from '@/types';
import { useModal } from './CustomModal';
import {
  X,
  Share2,
  Copy,
  Check,
  Phone,
  ArrowRight,
  Users,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { showAlert } = useModal();

  const [friendPhone, setFriendPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeReferral, setActiveReferral] = useState<Referral | null>(null);
  const [copied, setCopied] = useState(false);
  const [myReferrals, setMyReferrals] = useState<Referral[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const ITEMS_PER_PAGE = 3;
  const referralRewardCoins = fallbackStore.pricingSettings.referralRewardCoins ?? 20;
  const referredUserRewardCoins = fallbackStore.pricingSettings.referredUserRewardCoins ?? 10;
  const referredUserRewardOrderLimit = fallbackStore.pricingSettings.referredUserRewardOrderLimit ?? 1;

  // Sync referrals from fallbackStore
  useEffect(() => {
    if (!isOpen || !user) return;
    const sync = () => {
      const list = Array.from(fallbackStore.referrals.values())
        .filter((r) => r.referrerId === user.uid)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMyReferrals(list);
    };
    sync();
    fallbackStore.fetchReferralsForUser(user.uid).then(sync).catch(() => {});
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, [isOpen, user]);

  // Adjust pagination if myReferrals length changes
  const totalPages = Math.max(1, Math.ceil(myReferrals.length / ITEMS_PER_PAGE));
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  if (!isOpen || typeof document === 'undefined') return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://jamanot.com';
  const generatedLink = activeReferral
    ? `${origin}/?ref=${encodeURIComponent(user?.uid || '')}&phone=${encodeURIComponent(activeReferral.normalizedPhone)}`
    : '';

  const formatReferralMessage = (link: string) => {
    const template =
      fallbackStore.pricingSettings?.referralMessageTemplate?.trim() ||
      'আসসালামু আলাইকুম! জামানত (Jamanot) দিয়ে সহজে বাজার-সদাই ও প্রয়োজনীয় ডেলিভারি নিন। এখনই এই লিঙ্কে গিয়ে অর্ডার করুন: {link}';
    if (template.includes('{link}')) {
      return template.replace(/\{link\}/g, link);
    } else if (template.includes('{url}')) {
      return template.replace(/\{url\}/g, link);
    }
    return `${template} ${link}`;
  };

  const shareText = activeReferral ? formatReferralMessage(generatedLink) : '';
  const whatsappUrl = activeReferral
    ? `https://wa.me/${formatWhatsAppNumber(activeReferral.friendPhone)}?text=${encodeURIComponent(shareText)}`
    : '';

  const handleCopyLink = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitting) return;

    const normalized = normalizePhoneNumber(friendPhone);
    if (!normalized || normalized.length < 10) {
      setPhoneError('সঠিক মোবাইল/হোয়াটসঅ্যাপ নম্বর লিখুন (১১ ডিজিট)');
      return;
    }
    setPhoneError('');

    try {
      setSubmitting(true);
      const referral = await fallbackStore.createReferral({
        referrerId: user.uid,
        referrerName: user.displayName || user.email || 'Customer',
        referrerPhone: user.phoneNumber || user.alternativePhone,
        referrerEmail: user.email,
        friendPhone: friendPhone.trim(),
      });

      setActiveReferral(referral);
      setCurrentPage(1);

      // Generate the WhatsApp direct redirect link using admin configured template
      const directLink = `${origin}/?ref=${encodeURIComponent(user.uid)}&phone=${encodeURIComponent(referral.normalizedPhone)}`;
      const directShareText = formatReferralMessage(directLink);
      const directWaUrl = `https://wa.me/${formatWhatsAppNumber(referral.friendPhone)}?text=${encodeURIComponent(directShareText)}`;

      // Auto redirect user to WhatsApp to send message directly to that friend
      if (typeof window !== 'undefined') {
        const opened = window.open(directWaUrl, '_blank');
        if (!opened || opened.closed || typeof opened.closed === 'undefined') {
          // If popup is blocked by browser policy, redirect directly
          window.location.assign(directWaUrl);
        }
      }
    } catch (err: any) {
      showAlert('ভুল', err?.message || 'রেফারেল তৈরি করা যায়নি। আবার চেষ্টা করুন।', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setActiveReferral(null);
    setFriendPhone('');
    setPhoneError('');
    setCopied(false);
  };

  // Paginated list calculation
  const paginatedReferrals = myReferrals.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-amber-200/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div className="relative bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 p-4 text-white shrink-0 overflow-hidden shadow-xs">
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-lg pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors cursor-pointer z-10"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center space-x-2.5 pr-8">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner shrink-0">
              <Share2 className="w-5 h-5 text-yellow-100" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-black tracking-tight text-white leading-tight">
                  Refer & Earn
                </h2>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/25 text-yellow-100 border border-white/30">
                  +{referralRewardCoins} Coins
                </span>
              </div>
              <p className="text-[11px] text-amber-100 font-medium mt-0.5 leading-snug">
                বন্ধু সফল অর্ডার দিলে পাবেন +{referralRewardCoins} কয়েন{referredUserRewardCoins > 0 ? ` (বন্ধুও পাবেন +${referredUserRewardCoins} কয়েন)` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {!activeReferral ? (
            /* STEP 1: WhatsApp Number Input Form */
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-extrabold text-gray-800 mb-1.5">
                  বন্ধুর হোয়াটসঅ্যাপ নম্বর (Friend's WhatsApp)
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none text-gray-500 font-bold text-xs">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <input
                    type="tel"
                    disabled={submitting}
                    value={friendPhone}
                    onChange={(e) => {
                      setFriendPhone(e.target.value);
                      if (phoneError) setPhoneError('');
                    }}
                    placeholder="01XXXXXXXXX"
                    autoFocus
                    className={`w-full pl-9 pr-3 py-2.5 rounded-2xl border text-sm font-bold outline-none transition-all ${
                      submitting ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
                    } ${
                      phoneError
                        ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-200'
                        : 'border-gray-200 focus:border-amber-500 focus:ring-3 focus:ring-amber-500/10'
                    }`}
                  />
                </div>
                {phoneError && (
                  <p className="text-[11px] text-red-500 font-semibold mt-1 pl-1">
                    {phoneError}
                  </p>
                )}
                <p className="text-[10px] text-gray-500 mt-1 pl-1">
                  নম্বরটি দিলে আপনার বন্ধু জামানত এ অর্ডার করলেই আপনি রিওয়ার্ড পাবেন।
                </p>
              </div>

              {/* Submit Button with Loading State */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 active:scale-98 text-white text-xs font-black shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>সার্ভারে সেভ ও হোয়াটসঅ্যাপ ওপেন হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <span>রেফার লিংক তৈরি ও হোয়াটসঅ্যাপে পাঠান</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* STEP 2: Link Generated & Saved with Auto-Redirect Notice */
            <div className="space-y-3.5 animate-in fade-in duration-200">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-black text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>রেফারেল সফলভাবে সার্ভারে সংরক্ষিত হয়েছে!</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-200/60">
                  <span className="font-semibold text-emerald-950">হোয়াটসঅ্যাপ নম্বর:</span>
                  <span className="font-black text-emerald-800">{activeReferral.friendPhone}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-emerald-900/80">
                  <span>আপনার বোনাস কয়েন:</span>
                  <span className="font-black text-emerald-700">+{referralRewardCoins} Coins</span>
                </div>
                {referredUserRewardCoins > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-emerald-900/80">
                    <span>বন্ধুর বোনাস কয়েন:</span>
                    <span className="font-black text-amber-700">
                      +{referredUserRewardCoins} Coins ({referredUserRewardOrderLimit > 1 ? `প্রথম ${referredUserRewardOrderLimit} অর্ডারে` : '১ম অর্ডারে'})
                    </span>
                  </div>
                )}
              </div>

              {/* Referral Link Box */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  আপনার রেফার লিংক (Referral Link)
                </label>
                <div className="flex items-center gap-1.5 p-1.5 bg-gray-50 rounded-2xl border border-gray-200">
                  <input
                    type="text"
                    readOnly
                    value={generatedLink}
                    className="flex-1 px-2 text-xs font-semibold text-gray-700 bg-transparent outline-none truncate select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-1.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-[11px] font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer active:scale-95"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-gray-600" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Share on WhatsApp Button */}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-4 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] active:scale-98 text-white font-black text-xs shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer no-underline"
              >
                {/* Official WhatsApp SVG Icon */}
                <svg
                  className="w-4 h-4 fill-current shrink-0"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                </svg>
                <span>হোয়াটসঅ্যাপ ওপেন করুন (Open WhatsApp)</span>
              </a>

              {/* Refer Another Button */}
              <button
                type="button"
                onClick={handleReset}
                className="w-full py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer"
              >
                <span>আরেকজন বন্ধুকে রেফার করুন</span>
              </button>
            </div>
          )}

          {/* Previous Referrals List with Pagination */}
          {myReferrals.length > 0 && (
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-gray-800 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-amber-600" />
                  <span>পূর্বের রেফারেল ({myReferrals.length})</span>
                </span>
                <span className="text-[10px] text-gray-500 font-semibold">
                  সফল: {myReferrals.filter((r) => r.status === 'COMPLETED').length}
                </span>
              </div>

              {/* Paginated referrals list */}
              <div className="space-y-1.5 min-h-[96px]">
                {paginatedReferrals.map((ref) => {
                  const isCompleted = ref.status === 'COMPLETED';
                  return (
                    <div
                      key={ref.id}
                      className="p-2 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between text-[11px]"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-gray-900 truncate">
                          {ref.friendPhone}
                        </div>
                        <div className="text-[9px] text-gray-400">
                          {new Date(ref.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      {isCompleted ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px] border border-emerald-200 flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>+{ref.rewardedCoins || referralRewardCoins} Coins</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] border border-amber-200 flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>অপেক্ষমান</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1.5 px-0.5 text-xs">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    <span>Previous</span>
                  </button>

                  <span className="text-[10px] font-semibold text-gray-500">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
