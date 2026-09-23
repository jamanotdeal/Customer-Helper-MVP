'use client';

import React, { useEffect, useState } from 'react';
import { detectInAppBrowser, openInExternalBrowser, copyCurrentWebsiteUrl } from '@/lib/inAppBrowser';
import {
  ExternalLink,
  Compass,
  Copy,
  Check,
  Share2,
  MoreVertical,
  Globe,
  ShieldAlert,
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setPricingSettings({ ...fallbackStore.pricingSettings });
    const unsub = fallbackStore.subscribe(() => {
      setPricingSettings({ ...fallbackStore.pricingSettings });
    });

    const info = detectInAppBrowser();
    setInAppInfo(info);

    // Prevent background scrolling while in in-app browser barrier
    if (info.isInApp && fallbackStore.pricingSettings.inAppBrowserPromptEnabled !== false) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      unsub();
      document.body.style.overflow = '';
    };
  }, []);

  const isEnabled = pricingSettings.inAppBrowserPromptEnabled !== false;
  if (!inAppInfo.isInApp || !isEnabled) return null;

  const promptTitle = pricingSettings.inAppBrowserPromptTitle || 'ব্রাউজারে ওপেন করুন';
  const promptSubtitle = pricingSettings.inAppBrowserPromptSubtitle || 'Open in Chrome or Safari';
  const promptMessage =
    pricingSettings.inAppBrowserPromptMessage ||
    'লগইন ও নির্ভুল সেবার জন্য ওয়েবসাইটটি Chrome বা Safari ব্রাউজারে ওপেন করুন।';

  const handleOpenBrowser = () => {
    openInExternalBrowser();
  };

  const handleCopyLink = async () => {
    const success = await copyCurrentWebsiteUrl();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } else {
      try {
        navigator.clipboard.writeText(window.location.origin);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch (_) {
        alert(`লিংক: ${window.location.origin}`);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="In-App Browser Warning"
      className="fixed inset-0 z-[999999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none touch-manipulation"
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-amber-200/90 overflow-hidden relative animate-in fade-in zoom-in-95 duration-200 p-5 space-y-4">
        
        {/* Header & Logo */}
        <div className="flex items-center gap-3.5">
          <div className="relative w-12 h-12 rounded-2xl overflow-hidden shadow-md border border-emerald-200 bg-emerald-700 flex items-center justify-center shrink-0">
            <Image
              src="/Jamanot-Logo.png"
              alt="Jamanot"
              fill
              className="object-cover"
              priority
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full mb-1">
              <Compass className="w-3 h-3 text-amber-700" />
              <span>{inAppInfo.appName || 'ইন-অ্যাপ'} ব্রাউজার</span>
            </div>
            <h3 className="font-extrabold text-base text-gray-900 leading-tight">
              {promptTitle}
            </h3>
            <p className="text-[11px] text-gray-500 font-medium">
              {promptSubtitle}
            </p>
          </div>
        </div>

        {/* Short & Clean Notice */}
        <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200/70 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-950 font-semibold leading-relaxed">
            {promptMessage}
          </p>
        </div>

        {/* iOS Specific Quick 2-Step Guide */}
        {inAppInfo.isIos && (
          <div className="p-3 rounded-2xl bg-slate-900 text-white space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
              <Globe className="w-3.5 h-3.5" />
              <span>Safari ব্রাউজারে খোলার নিয়ম:</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-gray-200">
              <div className="flex items-center gap-2 bg-white/10 px-2.5 py-1.5 rounded-xl">
                <span className="w-4.5 h-4.5 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[10px] shrink-0">
                  ১
                </span>
                <span>
                  নিচে বা উপরে <Share2 className="w-3 h-3 text-emerald-400 inline mx-0.5" /> বা <MoreVertical className="w-3 h-3 text-emerald-400 inline mx-0.5" /> <strong>(•••)</strong> চাপুন
                </span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 px-2.5 py-1.5 rounded-xl">
                <span className="w-4.5 h-4.5 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[10px] shrink-0">
                  ২
                </span>
                <span>
                  <strong>&quot;Open in Safari&quot;</strong> সিলেক্ট করুন
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* Main Action for Android or general */}
          {inAppInfo.isAndroid ? (
            <button
              type="button"
              onClick={handleOpenBrowser}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Chrome ব্রাউজারে খুলুন</span>
            </button>
          ) : inAppInfo.isIos ? (
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-200" />
                  <span>লিংক কপি হয়েছে! সাফারিতে পেস্ট করুন</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>লিংক কপি করে Safari-তে খুলুন</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenBrowser}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>ব্রাউজারে ওপেন করুন</span>
            </button>
          )}

          {/* Secondary Copy Button (shown if not iOS copy button) */}
          {!inAppInfo.isIos && (
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-2.5 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-98 text-gray-800 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">লিংক কপি হয়েছে!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-gray-600" />
                  <span>লিংক কপি করুন (Copy Link)</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Bottom Lock & Security Badge */}
        <div className="text-center pt-0.5">
          <span className="text-[10px] text-gray-600 font-medium tracking-tight">
            🔒 নিরবচ্ছিন্ন ও নিরাপদ সেবার জন্য ব্রাউজারে খোলা আবশ্যক
          </span>
        </div>

      </div>
    </div>
  );
};

