'use client';

import React, { useState } from 'react';
import { HelperApplication, AllowedAreaPolygon } from '@/types';
import { X, CheckCircle2, ShieldCheck, MapPin, Globe, AlertTriangle, Bike, Smartphone } from 'lucide-react';
import { useModal } from '../CustomModal';

interface ApproveHelperModalProps {
  application: HelperApplication;
  existingAreas: AllowedAreaPolygon[];
  onClose: () => void;
  onConfirmApprove: (appId: string, assignedZoneIds: string[], serveAllAreas: boolean) => Promise<void>;
  onOpenAreaDrawer?: () => void;
}

export const ApproveHelperModal: React.FC<ApproveHelperModalProps> = ({
  application,
  existingAreas,
  onClose,
  onConfirmApprove,
  onOpenAreaDrawer,
}) => {
  const { showAlert } = useModal();
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>(() => {
    if (application.preferredAreaId && existingAreas.some((a) => a.id === application.preferredAreaId)) {
      return [application.preferredAreaId];
    }
    if (application.assignedAreaIds && application.assignedAreaIds.length > 0) {
      return application.assignedAreaIds;
    }
    // If only one area exists, pre-select it
    if (existingAreas.length === 1) {
      return [existingAreas[0].id];
    }
    return [];
  });
  const [serveAllAreas, setServeAllAreas] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleZone = (zoneId: string) => {
    if (serveAllAreas) setServeAllAreas(false);
    setSelectedZoneIds((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]
    );
  };

  const selectAllZones = () => {
    setSelectedZoneIds(existingAreas.map((a) => a.id));
    setServeAllAreas(false);
  };

  const clearZones = () => {
    setSelectedZoneIds([]);
  };

  const handleApprove = async () => {
    if (!serveAllAreas && selectedZoneIds.length === 0) {
      showAlert(
        'জোন নির্ধারণ আবশ্যক',
        'হেলপার অনুমোদন করতে অন্তত একটি সার্ভিস জোন (Service Zone) সিলেক্ট করা বাধ্যতামূলক। জোন ছাড়া হেলপার কোনো অর্ডার পাবেন না।',
        'warning'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      await onConfirmApprove(application.id, selectedZoneIds, serveAllAreas);
      onClose();
    } catch (err: any) {
      showAlert('ত্রুটি', err?.message || 'অনুমোদন সম্পন্ন করা সম্ভব হয়নি।', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col max-h-[92dvh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 via-teal-50 to-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-gray-900 leading-tight">
                হেলপার অনুমোদন ও সার্ভিস জোন নির্ধারণ
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">
                অনুমোদনের পূর্বে হেলপারের জন্য নির্দিষ্ট সার্ভিস জোন নির্ধারণ করুন
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Applicant Info Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  আবেদনকারী
                </span>
                <h4 className="font-extrabold text-sm text-slate-900">
                  {application.legalName || application.userName}
                </h4>
                <div className="text-xs text-slate-600 font-medium mt-0.5 space-x-2">
                  <span>📱 {application.whatsapp}</span>
                  {application.nid && <span>• NID: {application.nid}</span>}
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase">
                {application.status}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200 text-[11px] font-bold text-slate-600">
              {application.hasSmartphone && (
                <span className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 flex items-center gap-1">
                  <Smartphone className="w-3 h-3 text-emerald-600" />
                  <span>Smartphone</span>
                </span>
              )}
              {application.hasCycle && (
                <span className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 flex items-center gap-1">
                  <Bike className="w-3 h-3 text-emerald-600" />
                  <span>Bicycle</span>
                </span>
              )}
              {application.hasBike && (
                <span className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 flex items-center gap-1">
                  <Bike className="w-3 h-3 text-purple-600" />
                  <span>Motorbike</span>
                </span>
              )}
              {application.preferredAreaId && (
                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-emerald-600" />
                  <span>পছন্দের জোন: {existingAreas.find((a) => a.id === application.preferredAreaId)?.name || application.preferredAreaId}</span>
                </span>
              )}
            </div>
          </div>

          {/* Mandatory Zone Selection Instructions */}
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-extrabold">জোন নির্ধারণ নীতি (Zone Policy):</p>
              <p className="text-[11px] leading-relaxed text-amber-800 font-medium">
                হেলপারকে অবশ্যই অন্তত একটি জোনে অন্তর্ভুক্ত করতে হবে। হেলপার কেবল তার নির্ধারিত জোনের নতুন অর্ডারের নোটিফিকেশন ও লিস্ট দেখতে পাবেন। কোনো জোন নির্ধারণ না করলে হেলপার কোনো রিকোয়েস্ট পাবেন না।
              </p>
            </div>
          </div>

          {/* Zone Selection Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>উপলব্ধ সার্ভিস জোন তালিকা ({existingAreas.length})</span>
              </label>

              {existingAreas.length > 0 && (
                <div className="flex items-center space-x-2 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={selectAllZones}
                    className="text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                  >
                    সকল জোন সিলেক্ট
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={clearZones}
                    className="text-gray-500 hover:text-gray-700 underline cursor-pointer"
                  >
                    ক্লিয়ার
                  </button>
                </div>
              )}
            </div>

            {existingAreas.length === 0 ? (
              <div className="p-6 rounded-2xl border-2 border-dashed border-gray-200 text-center space-y-2">
                <Globe className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="text-xs font-bold text-gray-600">
                  এখনো কোনো সার্ভিস জোন / সাব-এরিয়া তৈরি করা হয়নি!
                </p>
                <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
                  হেলপারকে জোনে অ্যাসাইন করতে প্রথমে Service Areas & Geofencing থেকে ম্যাপে এলাকা ড্র করুন।
                </p>
                {onOpenAreaDrawer && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAreaDrawer();
                    }}
                    className="mt-2 py-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all"
                  >
                    + নতুন সার্ভিস এরিয়া ড্র করুন
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {existingAreas.map((area) => {
                  const isSelected = selectedZoneIds.includes(area.id);
                  const helpersCount = area.assignedHelperIds?.length || 0;

                  return (
                    <div
                      key={area.id}
                      onClick={() => toggleZone(area.id)}
                      className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/70 shadow-xs'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <div className="min-w-0">
                          <h5 className="font-black text-xs text-gray-900 truncate">
                            {area.name}
                          </h5>
                          <span className="text-[10px] text-gray-500 font-semibold">
                            {area.country || 'Bangladesh'}
                          </span>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-emerald-600 text-white'
                              : 'border border-gray-300 bg-white'
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold pt-1.5 border-t border-gray-100">
                        <span>🗺️ {area.coordinates?.length || 0} vertices</span>
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                          👥 {helpersCount} জন হেলপার
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Optional Serve All Areas Override */}
            <div className="pt-2 border-t border-gray-100">
              <label className="flex items-center space-x-2.5 p-3 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-gray-100/70 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={serveAllAreas}
                  onChange={(e) => {
                    setServeAllAreas(e.target.checked);
                    if (e.target.checked) setSelectedZoneIds([]);
                  }}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300"
                />
                <div>
                  <span className="text-xs font-black text-gray-900 block">
                    🌐 উন্মুক্ত সার্ভিস (Serve All Areas - Global Coverage)
                  </span>
                  <span className="text-[10px] text-gray-500 font-medium block">
                    নির্দিষ্ট কোনো জোন সীমাবদ্ধ না রেখে হেলপারকে সকল এলাকার অর্ডারের অনুমোদন দিন।
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs font-bold text-gray-500">
            {serveAllAreas
              ? 'গ্লোবাল (All Areas) নির্ধারিত'
              : `${selectedZoneIds.length} টি জোন নির্বাচিত`}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-colors"
            >
              বাতিল
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={isSubmitting || (!serveAllAreas && selectedZoneIds.length === 0)}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center space-x-1.5"
            >
              {isSubmitting ? (
                <span>অনুমোদন হচ্ছে...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>অনুমোদন ও জোন নিশ্চিত করুন</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
