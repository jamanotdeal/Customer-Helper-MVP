'use client';

import React, { useEffect, useState } from 'react';
import { fallbackStore } from '@/lib/firebase';
import {
  Download,
  X,
  Sparkles,
  Smartphone,
  ExternalLink,
  Copy,
  Check,
  Share2,
  PlusSquare,
  Compass,
} from 'lucide-react';
import Image from 'next/image';

// Global holder for beforeinstallprompt event
let globalDeferredPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e;
    window.dispatchEvent(new CustomEvent('pwa-install-available'));
    console.log('[PWA] beforeinstallprompt event captured and ready for 1-click trigger.');
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App successfully installed by user.');
    globalDeferredPrompt = null;
    try {
      localStorage.setItem('jamanot_pwa_installed', 'true');
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('pwa-installed-success'));
  });
}

// Check if currently running in standalone PWA / Native / TWA mode
export const isPwaInstalled = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isStandaloneMatch =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: twa)').matches;
  const isNavigatorStandalone = (window.navigator as any).standalone === true;
  const isTwaOrAndroidApp = document.referrer.startsWith('android-app://');
  const isCapacitorOrCordova =
    !!(window as any).Capacitor || !!(window as any).Cordova || !!(window as any).AndroidInterface;
  const isWebView =
    /wv|Android.*Version\/[0-9]\.[0-9]/i.test(window.navigator.userAgent) &&
    !/Safari/i.test(window.navigator.userAgent);

  return Boolean(
    isStandaloneMatch || isNavigatorStandalone || isTwaOrAndroidApp || isCapacitorOrCordova || isWebView
  );
};

// Detect if user is running inside an in-app browser (FB, Messenger, Instagram, TikTok, etc.)
export const isInAppBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || window.navigator.vendor || '';
  return /FBAN|FBAV|Instagram|Messenger|TikTok|Line|MicroMessenger|Snapchat|musical_ly|Twitter|FB_IAB/i.test(
    ua
  );
};

// Check if device is iOS (iPhone/iPad/iPod)
export const isIosDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
};

export const PwaSmartPrompt: React.FC = () => {
  const [isStandalone, setIsStandalone] = useState<boolean>(true);
  const [isInstalledPreviously, setIsInstalledPreviously] = useState<boolean>(false);
  const [isInApp, setIsInApp] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [hasPrompt, setHasPrompt] = useState<boolean>(false);
  const [showPromptModal, setShowPromptModal] = useState<boolean>(false);
  const [showIosGuide, setShowIosGuide] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone = isPwaInstalled();
    setIsStandalone(standalone);

    const prevInstalled = localStorage.getItem('jamanot_pwa_installed') === 'true';
    setIsInstalledPreviously(prevInstalled);

    const inApp = isInAppBrowser();
    setIsInApp(inApp);

    const ios = isIosDevice();
    setIsIos(ios);

    if (globalDeferredPrompt) {
      setHasPrompt(true);
    }

    const handlePromptAvail = () => {
      setHasPrompt(true);
    };

    const handleInstallSuccess = () => {
      setIsStandalone(true);
      setIsInstalledPreviously(true);
      setShowPromptModal(false);
      setShowIosGuide(false);
    };

    window.addEventListener('pwa-install-available', handlePromptAvail);
    window.addEventListener('pwa-installed-success', handleInstallSuccess);

    // If NOT standalone and prompt was not dismissed recently, show first-visit prompt after 2.5 seconds
    if (!standalone) {
      const dismissedAt = localStorage.getItem('pwa_prompt_dismissed_at');
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      const shouldAutoShow = !dismissedAt || now - parseInt(dismissedAt, 10) > oneDay;

      if (shouldAutoShow) {
        const timer = setTimeout(() => {
          setShowPromptModal(true);
        }, 2200);
        return () => {
          clearTimeout(timer);
          window.removeEventListener('pwa-install-available', handlePromptAvail);
          window.removeEventListener('pwa-installed-success', handleInstallSuccess);
        };
      }
    }

    return () => {
      window.removeEventListener('pwa-install-available', handlePromptAvail);
      window.removeEventListener('pwa-installed-success', handleInstallSuccess);
    };
  }, []);

  // Read admin settings for PWA prompt
  const pwaSettings = fallbackStore.pricingSettings;
  const isEnabled = pwaSettings.pwaInstallPromptEnabled !== false;

  const handleDismiss = () => {
    setShowPromptModal(false);
    setShowIosGuide(false);
    try {
      localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
    } catch (_) {}
  };

  const handleCopyCurrentLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (_) {
      // Fallback prompt
      alert(`লিংক: ${window.location.origin}`);
    }
  };

  const handleInstallClick = async () => {
    if (globalDeferredPrompt) {
      try {
        setIsInstalling(true);
        globalDeferredPrompt.prompt();
        const choice = await globalDeferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          console.log('[PWA] User accepted the 1-click install prompt');
          try {
            localStorage.setItem('jamanot_pwa_installed', 'true');
          } catch (_) {}
          setShowPromptModal(false);
        } else {
          console.log('[PWA] User dismissed the native install dialog');
        }
        globalDeferredPrompt = null;
        setHasPrompt(false);
      } catch (err) {
        console.warn('[PWA] Install prompt error:', err);
      } finally {
        setIsInstalling(false);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    } else if (isInApp) {
      // In-app browser instructions
      setShowPromptModal(true);
    } else {
      // Generic Android / other browser instructions
      if (typeof window !== 'undefined' && (window as any).showCustomAlert) {
        (window as any).showCustomAlert(
          'ইনস্টল নির্দেশিকা (Install App)',
          'অ্যাপ ইনস্টল করতে আপনার ব্রাউজারের উপরে/নিচে ৩-ডট (⋮) মেনু ওপেন করে "Install app" অথবা "Add to Home screen" চাপুন।',
          'info'
        );
      } else {
        alert('অ্যাপ ইনস্টল করতে ব্রাউজার মেনু (⋮) ওপেন করে "Install app" অথবা "Add to Home screen" চাপুন।');
      }
    }
  };

  // If already in standalone PWA, do not render anything
  if (isStandalone) return null;

  // If admin turned off PWA install prompts
  if (!isEnabled) return null;

  return (
    <>
      {/* 1. Floating Open App Banner if app was already installed on device but user visited in browser */}
      {isInstalledPreviously && !showPromptModal && (
        <div className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-xl border border-emerald-500/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 shadow-sm">
                <Smartphone className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">জামানত অ্যাপ ইনস্টল করা আছে</p>
                <p className="text-[10px] text-gray-300 truncate">ফুলস্ক্রিন ও দ্রুত ব্যবহারের জন্য অ্যাপ খুলুন</p>
              </div>
            </div>
            <a
              href="/"
              onClick={() => {
                try {
                  window.location.href = '/';
                } catch (_) {}
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shrink-0 transition-all active:scale-95 shadow-md flex items-center gap-1"
            >
              <span>ওপেন করুন</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* 2. Main First-Visit / Smart PWA Bottom Modal */}
      {showPromptModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-emerald-100 overflow-hidden relative animate-in slide-in-from-bottom-8 duration-300 p-5 space-y-4">
            
            {/* Dismiss Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header / Brand */}
            <div className="flex items-start gap-3.5 pr-8">
              <div className="relative w-14 h-14 rounded-2xl overflow-hidden shadow-lg border border-emerald-200 bg-emerald-700 flex items-center justify-center shrink-0">
                <Image
                  src="/Jamanot-Logo.png"
                  alt="Jamanot App"
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-extrabold text-base text-gray-900 leading-tight">Jamanot (জামানত)</h3>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                    Official App
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  লাইভ অর্ডার ট্র্যাকিং, দ্রুত নোটিফিকেশন ও সেরা অভিজ্ঞতার জন্য মাত্র ১-ক্লিকে অ্যাপ ইনস্টল করুন!
                </p>
              </div>
            </div>

            {/* CASE A: In-App Browser Detected (Facebook, Messenger, Instagram) */}
            {isInApp ? (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2.5 text-left">
                <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
                  <Compass className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>ফেসবুক/মেসেঞ্জার ব্রাউজার নির্দেশিকা</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                  অ্যাপ সরাসরি ইনস্টল করতে ব্রাউজারের উপরে বা নিচে <strong>৩-ডট (⋮)</strong> বাটনে চাপ দিয়ে <strong>&quot;Open in Chrome&quot;</strong> অথবা <strong>&quot;Open in Safari / Browser&quot;</strong> সিলেক্ট করুন।
                </p>
                <button
                  type="button"
                  onClick={handleCopyCurrentLink}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>লিংক কপি হয়েছে! Chrome-এ পেস্ট করুন</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>লিংক কপি করুন (Copy Link)</span>
                    </>
                  )}
                </button>
              </div>
            ) : isIos && showIosGuide ? (
              /* CASE B: iOS Safari Detailed Visual Guide */
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950 text-white space-y-3 text-left shadow-md">
                <p className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  <span>iPhone / iPad-এ মাত্র ৩ ধাপে ইনস্টল করুন:</span>
                </p>
                <div className="space-y-2 text-xs text-gray-200">
                  <div className="flex items-center gap-2.5 bg-white/10 p-2 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[11px] shrink-0">
                      1
                    </span>
                    <span className="flex items-center gap-1.5">
                      Safari ব্রাউজারের নিচে <Share2 className="w-3.5 h-3.5 text-emerald-400 inline" /> <strong>Share</strong> বাটনে চাপ দিন
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-white/10 p-2 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[11px] shrink-0">
                      2
                    </span>
                    <span className="flex items-center gap-1.5">
                      নিচে স্ক্রল করে <PlusSquare className="w-3.5 h-3.5 text-emerald-400 inline" /> <strong>Add to Home Screen</strong> চাপুন
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-white/10 p-2 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[11px] shrink-0">
                      3
                    </span>
                    <span>
                      উপরে ডানে <strong>Add</strong> বাটনে ক্লিক করলেই ইনস্টল সম্পন্ন!
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* CASE C: Android / Chrome / Desktop 1-Click Install */
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleInstallClick}
                  disabled={isInstalling}
                  className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>{isInstalling ? 'ইনস্টল হচ্ছে...' : 'অ্যাপ ইনস্টল করুন (Install App)'}</span>
                </button>

                <p className="text-[11px] text-gray-500 text-center font-medium">
                  {isIos ? 'iPhone ব্যবহারকারীদের জন্য ইনস্টল গাইড' : 'কোনো স্টোরেজ বা চার্জ ছাড়াই তাৎক্ষণিক ইনস্টল হয়'}
                </p>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="pt-1 flex items-center justify-between text-xs font-bold text-gray-500">
              <button
                type="button"
                onClick={handleDismiss}
                className="text-gray-400 hover:text-gray-600 py-1 px-2"
              >
                এখন নয় (Later)
              </button>
              <div className="flex items-center gap-1 text-[11px] text-emerald-700">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>Fast • Lightweight • Offline Ready</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
