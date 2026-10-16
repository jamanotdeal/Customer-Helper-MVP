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

// Check if currently running inside native Play Store app / TWA / Cordova / Capacitor
export const isNativeAndroidApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isTwaOrAndroidApp =
    document.referrer.startsWith('android-app://') ||
    document.referrer.includes('com.jamanot.app');
  const isCapacitorOrCordova =
    !!(window as any).Capacitor ||
    !!(window as any).Cordova ||
    !!(window as any).AndroidInterface ||
    (window as any).isNativeApp === true ||
    (window as any).isApp === true;
  const isAppUserAgent = /wv|AndroidApp|JamanotApp/i.test(navigator.userAgent || '');

  return Boolean(isTwaOrAndroidApp || isCapacitorOrCordova || isAppUserAgent);
};

// Check if currently running in standalone PWA / Native / TWA mode
export const isPwaInstalled = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isStandaloneMatch =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: twa)').matches;
  const isNavigatorStandalone = (window.navigator as any).standalone === true;

  return Boolean(
    isStandaloneMatch || isNavigatorStandalone || isNativeAndroidApp()
  );
};

// Check if device is iOS (iPhone/iPad/iPod)
export const isIosDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
};

// Check if device is Android
export const isAndroidDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || window.navigator.vendor || '';
  return /android/i.test(ua);
};

// Official Google Play Store app link
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.jamanot.app';

// Google Play Store SVG Icon
export const PlayStoreIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 466 512"
    className={className}
    fill="none"
  >
    <g fillRule="nonzero">
      {/* Red Section (Bottom Left) */}
      <path
        fill="#EA4335"
        d="M199.9 237.8 1.4 470.17c7.22 24.57 30.16 41.81 55.8 41.81 11.16 0 20.93-2.79 29.3-8.37l244.16-139.46L199.9 237.8z"
      />
      {/* Yellow Section (Right) */}
      <path
        fill="#FBBC04"
        d="m433.91 205.1-104.65-60-111.61 110.22 113.01 108.83 104.64-58.6c18.14-9.77 30.7-29.3 30.7-50.23-1.4-20.93-13.95-40.46-32.09-50.22z"
      />
      {/* Green Section (Top Left) */}
      <path
        fill="#34A853"
        d="M199.42 273.45 329.27 145.1 87.9 8.37C79.53 2.79 68.36 0 57.2 0 30.7 0 6.98 18.14 1.4 41.86l198.02 231.59z"
      />
      {/* Blue Section (Far Left Wing) */}
      <path
        fill="#4285F4"
        d="M1.39 41.86C0 46.04 0 51.63 0 57.2v397.64c0 5.57 0 9.76 1.4 15.34l216.27-214.86L1.39 41.86z"
      />
    </g>
  </svg>
);

// Check if current browser environment supports installation
export const isPwaSupported = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || navigator.vendor || '';

  // Android devices support installation via Google Play Store
  if (/android/i.test(ua)) {
    return true;
  }

  // 1. Service Worker is a hard requirement for PWA
  if (!('serviceWorker' in navigator)) return false;

  // 2. Chromium-based browsers with native install prompt support
  if ('onbeforeinstallprompt' in window || globalDeferredPrompt) {
    return true;
  }

  // 3. iOS devices (iPhone, iPad, iPod) - Safari/WebKit supports Add to Home Screen PWA
  if (isIosDevice()) {
    return true;
  }

  // 4. Desktop Safari 17+ on macOS Sonoma supports PWA ("Add to Dock")
  const isMacSafari = /Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua);
  if (isMacSafari) {
    const versionMatch = ua.match(/Version\/(\d+)/i);
    const safariVersion = versionMatch ? parseInt(versionMatch[1], 10) : 0;
    if (safariVersion >= 17) {
      return true;
    }
  }

  return false;
};

// Detect if user is running inside an in-app browser (FB, Messenger, Instagram, TikTok, etc.)
export const isInAppBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || window.navigator.vendor || '';
  return /FBAN|FBAV|Instagram|Messenger|TikTok|Line|MicroMessenger|Snapchat|musical_ly|Twitter|FB_IAB/i.test(
    ua
  );
};

export const PwaSmartPrompt: React.FC = () => {
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isNativeApp, setIsNativeApp] = useState<boolean>(false);
  const [isPlayAppInstalled, setIsPlayAppInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('jamanot_play_app_installed') === 'true';
  });
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isInstalledPreviously, setIsInstalledPreviously] = useState<boolean>(false);
  const [isInApp, setIsInApp] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [isAndroid, setIsAndroid] = useState<boolean>(false);
  const [hasPrompt, setHasPrompt] = useState<boolean>(false);
  const [showPromptModal, setShowPromptModal] = useState<boolean>(false);
  const [showIosGuideModal, setShowIosGuideModal] = useState<boolean>(false);
  const [showInAppGuideModal, setShowInAppGuideModal] = useState<boolean>(false);
  const [showFallbackGuideModal, setShowFallbackGuideModal] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const android = isAndroidDevice();
    setIsAndroid(android);

    const supported = isPwaSupported() || android;
    setIsSupported(supported);

    const nativeApp = isNativeAndroidApp();
    setIsNativeApp(nativeApp);

    const standalone = isPwaInstalled();
    setIsStandalone(standalone);

    const prevInstalled = localStorage.getItem('jamanot_pwa_installed') === 'true';
    setIsInstalledPreviously(prevInstalled);

    // If currently running inside native Play Store app, do not show any install/open prompt
    if (nativeApp) {
      return;
    }

    // Check if Play Store app is installed on Android device
    if (android && 'getInstalledRelatedApps' in navigator) {
      (navigator as any)
        .getInstalledRelatedApps()
        .then((relatedApps: any[]) => {
          if (relatedApps && relatedApps.length > 0) {
            const hasPlayApp = relatedApps.some(
              (app: any) =>
                app.id === 'com.jamanot.app' ||
                app.platform === 'play' ||
                app.url?.includes('com.jamanot.app')
            );
            if (hasPlayApp) {
              setIsPlayAppInstalled(true);
              try {
                localStorage.setItem('jamanot_play_app_installed', 'true');
              } catch (_) {}
            }
          }
        })
        .catch(() => {});
    }

    // For non-Android (iOS / Desktop PWA), if not supported or already installed, do not show
    if (!android && (!supported || prevInstalled || standalone)) {
      return;
    }

    const inApp = isInAppBrowser();
    setIsInApp(inApp);

    const ios = isIosDevice();
    setIsIos(ios);

    if (globalDeferredPrompt) {
      setHasPrompt(true);
    }

    const handlePromptAvail = () => {
      setHasPrompt(true);
      setIsSupported(true);
    };

    const handleInstallSuccess = () => {
      setIsStandalone(true);
      setIsInstalledPreviously(true);
      setShowPromptModal(false);
      setShowIosGuideModal(false);
      setShowInAppGuideModal(false);
      setShowFallbackGuideModal(false);
    };

    window.addEventListener('pwa-install-available', handlePromptAvail);
    window.addEventListener('pwa-installed-success', handleInstallSuccess);

    // Auto-show modal if not in native app and not dismissed within last 24 hours
    // (Still shows for Android even if PWA is installed, as requested)
    const dismissedAt = localStorage.getItem('pwa_prompt_dismissed_at');
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const shouldAutoShow = !dismissedAt || now - parseInt(dismissedAt, 10) > oneDay;

    if (shouldAutoShow) {
      const timer = setTimeout(() => {
        const isRunningNative = isNativeAndroidApp();
        if (!isRunningNative) {
          setShowPromptModal(true);
        }
      }, 1500);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('pwa-install-available', handlePromptAvail);
        window.removeEventListener('pwa-installed-success', handleInstallSuccess);
      };
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
    setShowIosGuideModal(false);
    setShowInAppGuideModal(false);
    setShowFallbackGuideModal(false);
    try {
      localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
    } catch (_) {}
  };

  const handleOpenApp = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const isAndroidDeviceType = isAndroidDevice();
    const isIosDeviceType = isIosDevice();

    if (isAndroidDeviceType) {
      try {
        localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
        localStorage.setItem('jamanot_play_app_installed', 'true');
      } catch (_) {}
      setShowPromptModal(false);
      // Launch Android App via standard intent URI
      const intentUrl =
        'intent://jamanot.com#Intent;package=com.jamanot.app;scheme=https;launchFlags=0x10000000;end;';
      window.location.href = intentUrl;

      // Fallback: If app is not installed or intent fails, redirect to Play Store after timeout
      setTimeout(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          window.location.href = PLAY_STORE_URL;
        }
      }, 1800);
    } else if (isIosDeviceType) {
      if (typeof window !== 'undefined' && (window as any).showCustomAlert) {
        (window as any).showCustomAlert(
          'অ্যাপ ওপেন করুন',
          'আপনার আইফোনের হোম স্ক্রিন (Home Screen) থেকে Jamanot অ্যাপ আইকনে ট্যাপ করে অ্যাপটি সরাসরি খুলুন।',
          'info'
        );
      } else {
        alert('আপনার আইফোনের হোম স্ক্রিন (Home Screen) থেকে Jamanot অ্যাপ আইকনে ট্যাপ করে অ্যাপটি সরাসরি খুলুন।');
      }
    } else {
      // Desktop / Other
      window.open(window.location.origin, '_blank');
    }
  };

  const handleCopyCurrentLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (_) {
      alert(`লিংক: ${window.location.origin}`);
    }
  };

  const handleInstallClick = async () => {
    if (isAndroid) {
      try {
        localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
        localStorage.setItem('jamanot_play_app_installed', 'true');
      } catch (_) {}
      setShowPromptModal(false);
      window.location.href = PLAY_STORE_URL;
      return;
    }

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
          setIsInstalledPreviously(true);
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
    } else if (isIos || isIosDevice()) {
      // For iOS / iPhone: show guide popup
      setShowIosGuideModal(true);
    } else if (isInApp) {
      // In-app browser (Facebook/Messenger/Instagram): show open-in-browser guide popup
      setShowInAppGuideModal(true);
    } else {
      // Fallback for browsers without deferred prompt
      setShowFallbackGuideModal(true);
    }
  };

  // If already running inside native Play Store app, do not render
  if (isNativeApp) return null;

  // For non-Android (iOS / Desktop PWA): if standalone or not supported, do not render
  if (!isAndroid && (isStandalone || !isSupported || isInstalledPreviously)) return null;

  // If admin turned off PWA install prompts
  if (!isEnabled) return null;

  return (
    <>
      {/* Main Installation Modal (Play Store for Android, PWA for others) */}
      {showPromptModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-emerald-100 overflow-hidden relative animate-in slide-in-from-bottom-8 duration-300 p-5 space-y-4">
            
            {/* Dismiss Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-extrabold text-base text-gray-900 leading-tight">Jamanot (জামানত)</h3>
                  {isAndroid ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200/90 text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                      <PlayStoreIcon className="w-2.5 h-2.5 shrink-0" />
                      <span>Google Play</span>
                    </span>
                  ) : (
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                      Official App
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  {isAndroid
                    ? isPlayAppInstalled
                      ? 'আপনার ফোনে জামানত অফিশিয়াল অ্যাপ ইনস্টল করা রয়েছে। দ্রুততম সেবা ও সেরা অভিজ্ঞতার জন্য সরাসরি অ্যাপে ওপেন করুন!'
                      : 'সহজ ও দ্রুত কেনাকাটা, লাইভ অর্ডার ট্র্যাকিং এবং ইনস্ট্যান্ট আপডেটের জন্য গুগল প্লে স্টোর থেকে জামানত অফিসিয়াল অ্যাপটি ডাউনলোড করুন!'
                    : 'লাইভ অর্ডার ট্র্যাকিং, দ্রুত নোটিফিকেশন ও সেরা অভিজ্ঞতার জন্য মাত্র ১-ক্লিকে অ্যাপ ইনস্টল করুন!'}
                </p>
              </div>
            </div>

            {/* Main Action Button */}
            <div className="space-y-2 pt-1">
              {isAndroid ? (
                isPlayAppInstalled ? (
                  <button
                    type="button"
                    onClick={handleOpenApp}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-98 text-white font-extrabold text-sm shadow-xl shadow-emerald-600/25 flex items-center justify-center gap-3.5 transition-all cursor-pointer border border-emerald-500 group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 p-1.5 transition-transform group-hover:scale-110">
                      <PlayStoreIcon className="w-full h-full" />
                    </div>
                    <div className="text-left flex-1">
                      <div className="text-[10px] text-emerald-100 font-bold uppercase tracking-wider leading-none">INSTALLED APP</div>
                      <div className="text-sm font-black text-white leading-tight mt-0.5">Jamanot অ্যাপে ওপেন করুন</div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-white/90 group-hover:text-white transition-colors shrink-0" />
                  </button>
                ) : (
                  <>
                    <a
                      href={PLAY_STORE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        try {
                          localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
                          localStorage.setItem('jamanot_play_app_installed', 'true');
                        } catch (_) {}
                        setShowPromptModal(false);
                      }}
                      className="w-full py-3.5 px-4 rounded-2xl bg-slate-950 hover:bg-black active:scale-98 text-white font-extrabold text-sm shadow-xl shadow-slate-900/25 flex items-center justify-center gap-3.5 transition-all cursor-pointer border border-slate-800 group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0 p-1.5 transition-transform group-hover:scale-110">
                        <PlayStoreIcon className="w-full h-full" />
                      </div>
                      <div className="text-left flex-1">
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider leading-none">GET IT ON</div>
                        <div className="text-sm font-black text-white leading-tight mt-0.5">Play Store থেকে ইনস্টল করুন</div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors shrink-0" />
                    </a>

                    <button
                      type="button"
                      onClick={handleOpenApp}
                      className="w-full py-1.5 px-3 text-center text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>অ্যাপ ইতিমধ্যে ইনস্টল করা থাকলে:</span>
                      <span className="font-extrabold underline">সরাসরি খুলুন (Open App)</span>
                    </button>
                  </>
                )
              ) : (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  disabled={isInstalling}
                  className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{isInstalling ? 'ইনস্টল হচ্ছে...' : 'অ্যাপ ইনস্টল করুন (Install App)'}</span>
                </button>
              )}

              <p className="text-[11px] text-gray-500 text-center font-medium">
                {isAndroid
                  ? isPlayAppInstalled
                    ? '১-ক্লিকে অফিসিয়াল জামানত অ্যাপ চালু করুন'
                    : 'গুগল প্লে স্টোর থেকে নিরাপদ ও সরাসরি ইনস্টল'
                  : 'কোনো স্টোরেজ বা চার্জ ছাড়াই তাৎক্ষণিক ইনস্টল হয়'}
              </p>
            </div>

            {/* Bottom Actions */}
            <div className="pt-1 flex items-center justify-between text-xs font-bold text-gray-500">
              <button
                type="button"
                onClick={handleDismiss}
                className="text-gray-400 hover:text-gray-600 py-1 px-2 cursor-pointer"
              >
                এখন নয় (Later)
              </button>
              <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>Fast • Official • Verified</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 3. iOS / iPhone Step-by-Step Guide Popup */}
      {showIosGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-emerald-100 overflow-hidden relative animate-in slide-in-from-bottom-8 duration-300 p-5 space-y-4">
            {/* Close Button */}
            <button
              onClick={() => setShowIosGuideModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-2.5 text-emerald-900 font-extrabold text-sm pr-8">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-extrabold text-gray-900 text-sm">iPhone / iPad ইনস্টল গাইড</h4>
                <p className="text-[11px] text-gray-500 font-normal">Safari ব্রাউজার দিয়ে মাত্র ৩ ধাপে ইনস্টল করুন</p>
              </div>
            </div>

            {/* Visual Step Guide */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950 text-white space-y-3 shadow-md">
              <div className="space-y-2 text-xs text-gray-200">
                <div className="flex items-center gap-2.5 bg-white/10 p-2.5 rounded-xl">
                  <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[11px] shrink-0">
                    1
                  </span>
                  <span className="flex items-center gap-1.5 flex-wrap">
                    Safari ব্রাউজারের নিচে <Share2 className="w-3.5 h-3.5 text-emerald-400 inline" /> <strong>Share</strong> বাটনে চাপ দিন
                  </span>
                </div>
                <div className="flex items-center gap-2.5 bg-white/10 p-2.5 rounded-xl">
                  <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[11px] shrink-0">
                    2
                  </span>
                  <span className="flex items-center gap-1.5 flex-wrap">
                    নিচে স্ক্রল করে <PlusSquare className="w-3.5 h-3.5 text-emerald-400 inline" /> <strong>Add to Home Screen</strong> চাপুন
                  </span>
                </div>
                <div className="flex items-center gap-2.5 bg-white/10 p-2.5 rounded-xl">
                  <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[11px] shrink-0">
                    3
                  </span>
                  <span>
                    উপরে ডানপাশে <strong>Add</strong> বাটনে ক্লিক করলেই অ্যাপ ইনস্টল সম্পন্ন!
                  </span>
                </div>
              </div>
            </div>

            {/* Got It Button */}
            <button
              type="button"
              onClick={() => {
                setShowIosGuideModal(false);
                setShowPromptModal(false);
              }}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>বুঝেছি (Got It)</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. In-App Browser Guide Popup (Facebook/Messenger/Instagram) */}
      {showInAppGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-amber-100 overflow-hidden relative animate-in slide-in-from-bottom-8 duration-300 p-5 space-y-4">
            <button
              onClick={() => setShowInAppGuideModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2.5 text-left">
              <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
                <Compass className="w-4 h-4 text-amber-600 shrink-0" />
                <span>ফেসবুক/মেসেঞ্জার ব্রাউজার নির্দেশিকা</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed font-medium">
                অ্যাপ সরাসরি ইনস্টল করতে ব্রাউজারের উপরে বা নিচে <strong>৩-ডট (⋮)</strong> বাটনে চাপ দিয়ে <strong>&quot;Open in Chrome&quot;</strong> অথবা <strong>&quot;Open in Safari&quot;</strong> সিলেক্ট করুন।
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

            <button
              type="button"
              onClick={() => {
                setShowInAppGuideModal(false);
                setShowPromptModal(false);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}

      {/* 5. Generic Browser Fallback Guide Popup */}
      {showFallbackGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-100 overflow-hidden relative animate-in slide-in-from-bottom-8 duration-300 p-5 space-y-4">
            <button
              onClick={() => setShowFallbackGuideModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 text-gray-900 font-bold text-sm">
              <Download className="w-4 h-4 text-emerald-600" />
              <span>ইনস্টল নির্দেশিকা</span>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              অ্যাপ ইনস্টল করতে আপনার ব্রাউজারের উপরে বা নিচের <strong>৩-ডট (⋮)</strong> মেনু ওপেন করে <strong>&quot;Install app&quot;</strong> অথবা <strong>&quot;Add to Home screen&quot;</strong> চাপুন।
            </p>

            <button
              type="button"
              onClick={() => {
                setShowFallbackGuideModal(false);
                setShowPromptModal(false);
              }}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-colors"
            >
              বুঝেছি
            </button>
          </div>
        </div>
      )}
    </>
  );
};
