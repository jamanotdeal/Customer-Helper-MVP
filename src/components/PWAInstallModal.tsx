'use client';

import React, { useEffect, useState } from 'react';
import { fallbackStore } from '@/lib/firebase';
import { CheckCircle2, Download, Share, PlusSquare, ArrowRight, X, Sparkles, Smartphone, ShieldCheck } from 'lucide-react';
import Image from 'next/image';

let deferredInstallPrompt: any = null;

// Global event listener for Chrome/Android/Desktop beforeinstallprompt
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('[PWA] beforeinstallprompt event captured and stored.');
  });
}

// Utility function to check if app is running as standalone PWA
export const isPwaInstalled = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isStandaloneMatch = window.matchMedia('(display-mode: standalone)').matches;
  const isNavigatorStandalone = (window.navigator as any).standalone === true;
  return isStandaloneMatch || isNavigatorStandalone;
};

// Utility function to check if device is iOS (Safari)
export const isIosDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
};

interface OrderSuccessPwaModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId?: string;
  orderTitle?: string;
  onViewOrderDetails?: () => void;
}

export const OrderSuccessPwaModal: React.FC<OrderSuccessPwaModalProps> = ({
  isOpen,
  onClose,
  orderId,
  orderTitle,
  onViewOrderDetails,
}) => {
  const [installed, setInstalled] = useState<boolean>(false);
  const [installing, setInstalling] = useState<boolean>(false);
  const [showIosInstructions, setShowIosInstructions] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setInstalled(isPwaInstalled());
    setShowIosInstructions(isIosDevice() && !isPwaInstalled());
  }, [isOpen]);

  if (!isOpen) return null;

  // Read admin settings for PWA prompt
  const pwaSettings = fallbackStore.pricingSettings;
  const isEnabled = pwaSettings.pwaInstallPromptEnabled !== false; // Default true
  const title = pwaSettings.pwaInstallPromptTitle || 'Install Jamanot App';
  const description =
    pwaSettings.pwaInstallPromptDescription ||
    'আরও দ্রুত আপডেট, ভালো সার্ভিস এবং লাইভ ট্র্যাকিংয়ের জন্য আপনার ফোনে জামানত অ্যাপ ইনস্টল করুন!';
  const buttonText = pwaSettings.pwaInstallButtonText || 'Install Jamanot';

  const handleInstallClick = async () => {
    if (deferredInstallPrompt) {
      try {
        setInstalling(true);
        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          console.log('[PWA] User accepted the install prompt');
          setInstalled(true);
        } else {
          console.log('[PWA] User dismissed the install prompt');
        }
        deferredInstallPrompt = null;
      } catch (err) {
        console.warn('[PWA] Prompt trigger error:', err);
      } finally {
        setInstalling(false);
      }
    } else if (isIosDevice()) {
      setShowIosInstructions(true);
    } else {
      if (typeof window !== 'undefined' && (window as any).showCustomAlert) {
        (window as any).showCustomAlert(
          'ইনস্টল নির্দেশিকা',
          'ইনস্টলেশন অপশনটি আপনার ব্রাউজার মেনুতে আছে। ব্রাউজার মেনুর "Add to Home screen" বা "Install App" সিলেক্ট করুন।',
          'info'
        );
      } else {
        alert('ইনস্টলেশন অপশনটি আপনার ব্রাউজার মেনুতে আছে। ব্রাউজার মেনুর "Add to Home screen" বা "Install App" সিলেক্ট করুন।');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-emerald-100 p-6 space-y-5 relative animate-in zoom-in-95 duration-200 text-center">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Order Success Header */}
        <div className="space-y-2 pt-2">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-md shadow-emerald-600/10">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="font-extrabold text-xl text-gray-900">রিকুয়েস্ট সফলভাবে জমা হয়েছে!</h3>
          {orderId && (
            <p className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full inline-block">
              Order ID: #{orderId} {orderTitle ? `• ${orderTitle}` : ''}
            </p>
          )}
        </div>

        {/* PWA Install Promotion Box (Controlled by Admin & Install Status) */}
        {isEnabled && !installed && (
          <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-950 text-white p-5 rounded-3xl text-left space-y-4 shadow-xl border border-emerald-500/20 relative overflow-hidden">
            <div className="flex items-start gap-3">
              <div className="relative w-12 h-12 rounded-2xl overflow-hidden shadow-md border border-emerald-400/30 shrink-0 bg-emerald-900/50 flex items-center justify-center">
                <Image
                  src="/Jamanot-Logo.png"
                  alt="Jamanot Logo"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="flex-1">
                <h4 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{title}</span>
                </h4>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">{description}</p>
              </div>
            </div>

            {/* Android / Chrome Install Button */}
            {!isIosDevice() && (
              <button
                type="button"
                onClick={handleInstallClick}
                disabled={installing}
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-extrabold text-sm shadow-lg shadow-emerald-500/30 flex items-center justify-center space-x-2 transition-all"
              >
                <Download className="w-4 h-4 text-slate-950" />
                <span>{installing ? 'Installing...' : buttonText}</span>
              </button>
            )}

            {/* iOS Safari Instructions */}
            {isIosDevice() && (
              <div className="space-y-2 pt-1 border-t border-white/10">
                <p className="text-[11px] font-extrabold text-emerald-300 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>iPhone / iOS-এ ইনস্টল করতে:</span>
                </p>
                <div className="space-y-1.5 text-[11px] text-gray-200 font-semibold bg-white/10 p-3 rounded-2xl border border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[10px]">
                      1
                    </span>
                    <span>সফারি ব্রাউজারের নিচে <strong>Share (শেয়ার)</strong> বাটন চাপুন</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[10px]">
                      2
                    </span>
                    <span>তালিকায় নিচে গিয়ে <strong>Add to Home Screen</strong> সিলেক্ট করুন</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[10px]">
                      3
                    </span>
                    <span>উপরে ডানপাশে <strong>Add</strong> বাটনে ক্লিক করুন</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* View Order Details CTA */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onViewOrderDetails) onViewOrderDetails();
            }}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md flex items-center justify-center space-x-2 transition-all active:scale-98"
          >
            <span>View Order Details</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
