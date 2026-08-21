'use client';

import React, { useState, useEffect } from 'react';
import { fallbackStore } from '@/lib/firebase';
import {
  MapPin,
  Phone,
  Mail,
  Facebook,
  Linkedin,
  Instagram,
  ArrowLeft,
  HeartHandshake,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';

interface HelperCenterPageProps {
  onBack?: () => void;
}

export const HelperCenterPage: React.FC<HelperCenterPageProps> = ({ onBack }) => {
  const [p, setP] = useState(fallbackStore.pricingSettings);

  useEffect(() => {
    const sync = () => setP({ ...fallbackStore.pricingSettings });
    sync();
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, []);

  const hasAnyContact =
    p.helperCenterOfficeAddress ||
    p.helperCenterPhone1 ||
    p.helperCenterPhone2 ||
    p.helperCenterEmail ||
    p.helperCenterFacebook ||
    p.helperCenterLinkedin ||
    p.helperCenterInstagram;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 pb-24">
      {/* Hero Header */}
      <div
        className="relative overflow-hidden px-4 pt-6 pb-10"
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
        }}
      >
        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-emerald-200 hover:text-white text-xs font-semibold mb-5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        )}

        {/* Decorative circles */}
        <div
          className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6ee7b7, transparent)', transform: 'translate(30%, -30%)' }}
        />
        <div
          className="absolute bottom-0 left-0 w-32 h-32 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #a7f3d0, transparent)', transform: 'translate(-30%, 30%)' }}
        />

        <div className="relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-white/15 border border-white/30 mb-4 backdrop-blur-sm">
            <HeartHandshake className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white mb-1">Helper Center</h1>
          <p className="text-emerald-200 text-sm font-medium">আমাদের অফিস ও যোগাযোগের তথ্য</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 mt-6 space-y-4 max-w-2xl mx-auto">

        {!hasAnyContact ? (
          <div className="bg-white rounded-3xl shadow-lg p-8 text-center border border-emerald-100">
            <HeartHandshake className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
            <h3 className="font-bold text-gray-700 text-sm mb-1">তথ্য শীঘ্রই যুক্ত হবে</h3>
            <p className="text-xs text-gray-400">আমাদের অ্যাডমিন টিম শীঘ্রই যোগাযোগের বিস্তারিত তথ্য যুক্ত করবেন।</p>
          </div>
        ) : (
          <>
            {/* Office Address */}
            {p.helperCenterOfficeAddress && (
              <div className="bg-white rounded-3xl shadow-lg border border-emerald-100 overflow-hidden">
                <div className="px-5 py-3 bg-emerald-600 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-white shrink-0" />
                  <span className="text-white text-xs font-extrabold uppercase tracking-wide">অফিস ঠিকানা</span>
                </div>
                <div className="p-5">
                  <p className="text-sm font-semibold text-gray-800 leading-relaxed">{p.helperCenterOfficeAddress}</p>
                  {p.helperCenterMapEmbedUrl && (
                    <a
                      href={p.helperCenterMapEmbedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      ম্যাপে দেখুন
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Phone Numbers */}
            {(p.helperCenterPhone1 || p.helperCenterPhone2) && (
              <div className="bg-white rounded-3xl shadow-lg border border-blue-100 overflow-hidden">
                <div className="px-5 py-3 bg-blue-600 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-white shrink-0" />
                  <span className="text-white text-xs font-extrabold uppercase tracking-wide">ফোন নম্বর</span>
                </div>
                <div className="p-5 space-y-3">
                  {p.helperCenterPhone1 && (
                    <a
                      href={`tel:${p.helperCenterPhone1}`}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-blue-500 font-semibold">Primary</p>
                        <p className="text-sm font-extrabold text-gray-900">{p.helperCenterPhone1}</p>
                      </div>
                    </a>
                  )}
                  {p.helperCenterPhone2 && (
                    <a
                      href={`tel:${p.helperCenterPhone2}`}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-blue-500 font-semibold">Secondary</p>
                        <p className="text-sm font-extrabold text-gray-900">{p.helperCenterPhone2}</p>
                      </div>
                    </a>
                  )}
                  {/* WhatsApp quick link for primary */}
                  {p.helperCenterPhone1 && (
                    <a
                      href={`https://wa.me/88${p.helperCenterPhone1.replace(/^0/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-2xl bg-green-50 hover:bg-green-100 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-green-500 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-green-600 font-semibold">WhatsApp</p>
                        <p className="text-sm font-extrabold text-gray-900">{p.helperCenterPhone1}</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Email */}
            {p.helperCenterEmail && (
              <div className="bg-white rounded-3xl shadow-lg border border-violet-100 overflow-hidden">
                <div className="px-5 py-3 bg-violet-600 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-white shrink-0" />
                  <span className="text-white text-xs font-extrabold uppercase tracking-wide">ইমেইল</span>
                </div>
                <div className="p-5">
                  <a
                    href={`mailto:${p.helperCenterEmail}`}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-violet-50 hover:bg-violet-100 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-white" />
                    </div>
                    <p className="text-sm font-extrabold text-gray-900 break-all">{p.helperCenterEmail}</p>
                  </a>
                </div>
              </div>
            )}

            {/* Social Links */}
            {(p.helperCenterFacebook || p.helperCenterLinkedin || p.helperCenterInstagram) && (
              <div className="bg-white rounded-3xl shadow-lg border border-pink-100 overflow-hidden">
                <div className="px-5 py-3 bg-gradient-to-r from-pink-500 to-rose-500 flex items-center gap-2">
                  <span className="text-white text-xs font-extrabold uppercase tracking-wide">সোশ্যাল মিডিয়া</span>
                </div>
                <div className="p-5 space-y-3">
                  {p.helperCenterFacebook && (
                    <a
                      href={p.helperCenterFacebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-[#1877F2] flex items-center justify-center shrink-0">
                        <Facebook className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-blue-500 font-semibold">Facebook</p>
                        <p className="text-sm font-bold text-gray-700 truncate">{p.helperCenterFacebook}</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    </a>
                  )}
                  {p.helperCenterInstagram && (
                    <a
                      href={p.helperCenterInstagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-2xl hover:bg-pink-50 transition-colors"
                      style={{ background: 'linear-gradient(135deg, #fdf2f8, #fce7f3)' }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}
                      >
                        <Instagram className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-pink-500 font-semibold">Instagram</p>
                        <p className="text-sm font-bold text-gray-700 truncate">{p.helperCenterInstagram}</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    </a>
                  )}
                  {p.helperCenterLinkedin && (
                    <a
                      href={p.helperCenterLinkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-2xl bg-sky-50 hover:bg-sky-100 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-[#0A66C2] flex items-center justify-center shrink-0">
                        <Linkedin className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-sky-600 font-semibold">LinkedIn</p>
                        <p className="text-sm font-bold text-gray-700 truncate">{p.helperCenterLinkedin}</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Note */}
            {p.helperCenterNote && (
              <div className="bg-amber-50 rounded-3xl border border-amber-200 p-5">
                <p className="text-sm font-semibold text-amber-800 leading-relaxed">{p.helperCenterNote}</p>
              </div>
            )}
          </>
        )}

        {/* Footer note */}
        <p className="text-center text-[11px] text-gray-400 font-medium pb-4">
          © {new Date().getFullYear()} Jamanot — Ask. Relax. Done.
        </p>
      </div>
    </div>
  );
};
