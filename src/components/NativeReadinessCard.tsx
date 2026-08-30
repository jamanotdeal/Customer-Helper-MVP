'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  BellRing,
  MapPin,
  BatteryCharging,
  AppWindow,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { isNativeApp } from '@/lib/native';
import {
  getReadiness,
  requestStep,
  openSettings,
  STEP_COPY,
  type PermissionStep,
  type ReadinessReport,
} from '@/lib/permissions';
import { useModal } from '@/components/CustomModal';

/**
 * "Never miss an order" — the permission ladder surfaced as a settings card for
 * Helpers and Stores.
 *
 * Renders nothing on the website and nothing once everything is granted, so it
 * stays out of the way of users who are already set up. It deliberately shows
 * the honest state rather than claiming reliability it can't deliver: on Xiaomi
 * and Oppo devices, no amount of code guarantees a background service survives,
 * so the card says so and points at the setting that helps.
 */
const STEP_META: Record<PermissionStep, { icon: React.ElementType; label: string; required: boolean }> = {
  notifications: { icon: BellRing, label: 'নোটিফিকেশন', required: true },
  location: { icon: MapPin, label: 'লোকেশন', required: true },
  battery: { icon: BatteryCharging, label: 'ব্যাটারি অপটিমাইজেশন', required: false },
  overlay: { icon: AppWindow, label: 'অ্যাপ নিজে থেকে খোলা', required: false },
  autostart: { icon: RotateCw, label: 'অটোস্টার্ট', required: false },
};

export const NativeReadinessCard: React.FC = () => {
  const { showPermissionModal } = useModal();
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [busy, setBusy] = useState<PermissionStep | null>(null);

  const refresh = useCallback(() => {
    if (!isNativeApp()) return;
    getReadiness().then(setReport).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    // The battery and autostart screens give no callback — the only reliable
    // signal that the user changed something is the app coming back to the
    // foreground. setupAppListeners() dispatches a focus event for exactly this.
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  const handleStep = async (step: PermissionStep) => {
    setBusy(step);
    try {
      const copy = STEP_COPY[step];
      const blocked =
        (step === 'notifications' && report?.status?.notifications === 'blocked') ||
        (step === 'location' && report?.status?.location === 'blocked');

      await showPermissionModal({
        // The ladder's step names don't all line up with the modal's icon
        // variants: 'notifications' is 'notification' there, and 'autostart'
        // reuses the battery treatment.
        permissionType:
          step === 'notifications' ? 'notification' : step === 'autostart' ? 'battery' : step,
        title: copy.title,
        message: blocked
          ? `${copy.message}\n\nআগে বন্ধ করে দেওয়া হয়েছে — সেটিংস থেকে চালু করুন।`
          : copy.message,
        allowText: blocked ? 'সেটিংসে যান' : copy.action,
        onAllow: async () => (blocked ? (await openSettings(), false) : requestStep(step)),
      });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  if (!isNativeApp() || !report?.supported) return null;

  const pending = [...report.missingCritical, ...report.missingOptional];
  if (pending.length === 0) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <p className="text-sm font-semibold text-emerald-800">
          সব ঠিক আছে — নতুন অর্ডার সাথে সাথে পাবেন।
        </p>
      </div>
    );
  }

  const critical = report.missingCritical.length > 0;

  return (
    <div
      className={`mx-4 mb-3 rounded-2xl border overflow-hidden ${
        critical ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'
      }`}
    >
      <div className="px-4 pt-3 pb-2 flex items-start gap-3">
        <AlertTriangle
          className={`w-5 h-5 flex-shrink-0 mt-0.5 ${critical ? 'text-red-600' : 'text-amber-600'}`}
        />
        <div>
          <p className={`text-sm font-bold ${critical ? 'text-red-800' : 'text-amber-900'}`}>
            {critical ? 'অর্ডার মিস হতে পারে' : 'আরও নির্ভরযোগ্য করুন'}
          </p>
          <p className={`text-xs mt-0.5 ${critical ? 'text-red-700' : 'text-amber-800'}`}>
            {critical
              ? 'নিচের আবশ্যক অনুমতিগুলো ছাড়া নতুন অর্ডারের খবর পাবেন না।'
              : 'নিচের সেটিংসগুলো চালু করলে ব্যাকগ্রাউন্ডেও অর্ডার মিস হবে না।'}
          </p>
        </div>
      </div>

      <div className="divide-y divide-black/5">
        {pending.map((step) => {
          const meta = STEP_META[step];
          const Icon = meta.icon;
          return (
            <button
              key={step}
              type="button"
              disabled={busy !== null}
              onClick={() => handleStep(step)}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-black/5 active:bg-black/10 transition-colors disabled:opacity-60"
            >
              <Icon className="w-4 h-4 text-gray-600 flex-shrink-0" />
              <span className="flex-1 text-sm font-semibold text-gray-800">
                {meta.label}
                {meta.required && <span className="ml-1.5 text-[10px] text-red-600">আবশ্যক</span>}
              </span>
              {busy === step ? (
                <span className="text-xs text-gray-500">…</span>
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default NativeReadinessCard;
