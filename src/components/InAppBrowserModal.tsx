'use client';

import React, { useEffect, useState } from 'react';
import { detectInAppBrowser, openInExternalBrowser, copyCurrentWebsiteUrl } from '@/lib/inAppBrowser';
import {
  ExternalLink,
  Compass,
  Copy,
  Check,
  X,
  Share2,
  MoreVertical,
  AlertTriangle,
  Sparkles,
  Smartphone,
  ChevronRight,
} from 'lucide-react';
import Image from 'next/image';

import { fallbackStore } from '@/lib/firebase';
import { PricingSettings } from '@/types';

export const InAppBrowserModal: React.FC = () => {
  const [inAppInfo, setInAppInfo] = useState<{
    isInApp: boolean;
    appName: string;
    isAndroid: boolean;
    isIos: boolean;
  }>({ isInApp: false, appName: '', isAndroid: false, isIos: false });

  const [pricingSettings, setPricingSettings] = useState<PricingSettings>(fallbackStore.pricingSettings);
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setPricingSettings({ ...fallbackStore.pricingSettings });
    const unsub = fallbackStore.subscribe(() => {
      setPricingSettings({ ...fallbackStore.pricingSettings });
    });

    const info = detectInAppBrowser();
    setInAppInfo(info);

    if (info.isInApp) {
      // Check if dismissed in this session
      const sessionDismissed = sessionStorage.getItem('jamanot_inapp_dismissed') === 'true';
      if (!sessionDismissed) {
        // Auto-show modal after a short smooth delay if enabled
        const timer = setTimeout(() => {
          if (fallbackStore.pricingSettings.inAppBrowserPromptEnabled !== false) {
            setIsOpen(true);
          }
        }, 800);
        return () => {
          clearTimeout(timer);
          unsub();
        };
      } else {
        setIsDismissed(true);
      }
    }

    // Allow other components (like AuthContext when Google login is clicked) to open this modal
    const handleTrigger = (e?: any) => {
      if (fallbackStore.pricingSettings.inAppBrowserPromptEnabled !== false) {
        setIsOpen(true);
        if (e?.detail?.showIosGuide) {
          setShowIosGuide(true);
        }
      }
    };

    window.addEventListener('show-inapp-browser-prompt', handleTrigger);
    return () => {
      unsub();
      window.removeEventListener('show-inapp-browser-prompt', handleTrigger);
    };
  }, []);

  const isEnabled = pricingSettings.inAppBrowserPromptEnabled !== false;
  if (!inAppInfo.isInApp || !isEnabled) return null;

  const promptTitle = pricingSettings.inAppBrowserPromptTitle || 'ব্রাউজারে ওপেন করুন';
  const promptSubtitle = pricingSettings.inAppBrowserPromptSubtitle || 'Open in Chrome or Safari for the Best Experience';
  const promptMessage =
    pricingSettings.inAppBrowserPromptMessage ||
    'ফেসবুক বা মেসেঞ্জারের ভেতর গুগল অ্যাকাউন্ট লগইন সরাসরি ব্লক হতে পারে বা বারবার লগইন চাইতে পারে। Chrome বা Safari ব্রাউজারে খুললে ১-ক্লিকে লগইন, লাইভ ট্র্যাকিং এবং অফলাইন সুবিধা সচল থাকবে।';

  const handleOpenBrowser = () => {
    if (inAppInfo.isAndroid) {
      openInExternalBrowser();
    } else {
      setShowIosGuide(true);
    }
  };

  const handleCopyLink = async () => {
    const success = await copyCurrentWebsiteUrl();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } else {
      alert(`লিংক: ${window.location.origin}`);
    }
  };

  const handleDismiss = () => {
    setIsOpen(false);
    setIsDismissed(true);
    try {
      sessionStorage.setItem('jamanot_inapp_dismissed', 'true');
    } catch (_) {}
  };

  return (
    <>
      {/* Subtle Persistent Top Warning Banner when modal is dismissed */}
      {isDismissed && !isOpen && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-amber-600 via-amber-700 to-amber-600 text-white px-3 py-2 text-xs font-semibold shadow-md flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle className="w-4 h-4 text-amber-200 shrink-0 animate-pulse" />
            <span className="truncate">
              {inAppInfo.appName} ব্রাউজার: লগইন ও সেরা সুবিধার জন্য Chrome/Safari-তে খুলুন
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsOpen(true)}
              className="bg-white text-amber-900 hover:bg-amber-50 active:scale-95 px-2.5 py-1 rounded-full font-bold text-[11px] transition-all flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <span>খুলুন</span>
              <ExternalLink className="w-3 h-3" />
            </button>
            <button
              onClick={() => setIsDismissed(false)}
              className="text-amber-200 hover:text-white p-1 rounded-full transition-colors"
              aria-label="Close banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main In-App Browser Alert Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-amber-200/80 overflow-hidden relative animate-in slide-in-from-bottom-8 duration-300 p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            
            {/* Dismiss Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header & Logo */}
            <div className="flex items-start gap-3.5 pr-8">
              <div className="relative w-13 h-13 rounded-2xl overflow-hidden shadow-md border border-emerald-200 bg-emerald-700 flex items-center justify-center shrink-0">
                <Image
                  src="/Jamanot-Logo.png"
                  alt="Jamanot"
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Compass className="w-3 h-3 text-amber-700" />
                    {inAppInfo.appName || 'ইন-অ্যাপ'} ব্রাউজার সনাক্ত
                  </span>
                </div>
                <h3 className="font-extrabold text-base text-gray-900 leading-tight mt-1">
                  {promptTitle}
                </h3>
                <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                  {promptSubtitle}
                </p>
              </div>
            </div>

            {/* Important Notice Box */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/70 space-y-2">
              <div className="flex items-start gap-2 text-amber-900 text-xs font-bold leading-snug">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>লগইন ও নির্বিঘ্ন সেবার জন্য জরুরি তথ্য:</span>
              </div>
              <div className="text-[12px] text-amber-950/85 font-medium leading-relaxed whitespace-pre-line">
                {promptMessage}
              </div>
            </div>

            {/* iOS Step Guide if expanded or on iOS */}
            {showIosGuide && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white space-y-3 shadow-md animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-xs">
                  <Smartphone className="w-4 h-4" />
                  <span>আইফোন / আইপ্যাড (Safari) ওপেন করার নিয়ম:</span>
                </div>
                <div className="space-y-2 text-xs text-gray-200">
                  <div className="flex items-center gap-2.5 bg-white/10 p-2.5 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[11px] shrink-0">
                      1
                    </span>
                    <span className="flex items-center gap-1.5 flex-wrap">
                      স্ক্রিনের নিচে বা উপরে <Share2 className="w-3.5 h-3.5 text-emerald-400 inline" /> <strong>Share</strong> অথবা <MoreVertical className="w-3.5 h-3.5 text-emerald-400 inline" /> <strong>(•••)</strong> বাটনে চাপ দিন
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-white/10 p-2.5 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[11px] shrink-0">
                      2
                    </span>
                    <span className="flex items-center gap-1.5 flex-wrap">
                      মেনু থেকে <strong>&quot;Open in Safari&quot;</strong> (সাফারিতে ওপেন করুন) অপশনটি চাপুন
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              {/* Primary Action Button */}
              <button
                type="button"
                onClick={handleOpenBrowser}
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>
                  {inAppInfo.isAndroid
                    ? 'Chrome ব্রাউজারে ওপেন করুন (Open in Chrome)'
                    : showIosGuide
                    ? 'Safari-তে লিংক ওপেন করুন'
                    : 'Safari ব্রাউজারে ওপেন করার নিয়ম'}
                </span>
              </button>

              {/* Copy Link Button */}
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full py-3 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-98 text-gray-800 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700 font-extrabold">লিংক কপি হয়েছে! ব্রাউজারে পেস্ট করুন</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-gray-600" />
                    <span>ওয়েবসাইট লিংক কপি করুন (Copy Link)</span>
                  </>
                )}
              </button>
            </div>

            {/* Bottom Dismiss Option */}
            <div className="pt-1 flex items-center justify-between text-xs font-semibold text-gray-500">
              <button
                type="button"
                onClick={handleDismiss}
                className="text-gray-400 hover:text-gray-600 py-1 px-2 transition-colors cursor-pointer"
              >
                এখানেই চালিয়ে যান (Continue anyway)
              </button>
              <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>Fast & Secure</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
