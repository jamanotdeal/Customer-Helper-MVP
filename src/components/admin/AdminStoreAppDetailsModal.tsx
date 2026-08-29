'use client';

import React, { useState } from 'react';
import { StoreApplication } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import {
  X,
  Store,
  MapPin,
  Phone,
  User,
  Calendar,
  Edit,
  Trash2,
  ExternalLink,
  MessageSquare,
  CheckCircle,
  XCircle,
  Ban,
  Save,
  Globe,
  Percent,
  FileText,
  Mail,
  Clock,
  AlertTriangle,
} from 'lucide-react';

interface AdminStoreAppDetailsModalProps {
  application: StoreApplication;
  onClose: () => void;
  onSaved: () => void;
}

type ViewMode = 'VIEW' | 'EDIT';

export const AdminStoreAppDetailsModal: React.FC<AdminStoreAppDetailsModalProps> = ({
  application,
  onClose,
  onSaved,
}) => {
  const { showAlert, showConfirm } = useModal();
  const [mode, setMode] = useState<ViewMode>('VIEW');

  // Admin-configurable store types (same source as the store application form)
  const STORE_TYPES_DEFAULT = [
    'মুদিখানা ও সুপারশপ',
    'ফার্মেসি ও ওষুধ',
    'রেস্টুরেন্ট ও ফাস্টফুড',
    'মাংস ও মাছ বাজার',
    'ফল ও সবজির দোকান',
    'ইলেকট্রনিক্স ও গ্যাজেট',
    'স্টেশনারি ও বই',
    'পোশাক ও ফ্যাশন',
    'লন্ড্রি ও ড্রাই ক্লিনিং',
    'অন্যান্য',
  ];
  const storeTypes = fallbackStore.pricingSettings.storeTypes?.length
    ? fallbackStore.pricingSettings.storeTypes
    : STORE_TYPES_DEFAULT;

  // Edit form fields
  const [storeName, setStoreName] = useState(application.storeName);
  const [storeType, setStoreType] = useState(application.storeType);
  const [storeDescription, setStoreDescription] = useState(application.storeDescription || '');
  const [ownerName, setOwnerName] = useState(application.ownerName);
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(application.ownerWhatsapp);
  const [managerName, setManagerName] = useState(application.managerName);
  const [managerWhatsapp, setManagerWhatsapp] = useState(application.managerWhatsapp);
  const [commissionPercent, setCommissionPercent] = useState<number | string>(application.commissionPercent);
  const [reviewNote, setReviewNote] = useState(application.reviewNote || '');
  const [status, setStatus] = useState<StoreApplication['status']>(application.status);
  const [locationAddress, setLocationAddress] = useState(application.location?.address || '');
  const [locationLat, setLocationLat] = useState<string>(application.location?.lat?.toString() || '');
  const [locationLng, setLocationLng] = useState<string>(application.location?.lng?.toString() || '');

  const [saving, setSaving] = useState(false);

  const ownerWaNum = application.ownerWhatsapp?.replace(/[^0-9]/g, '') || '';
  const ownerWhatsappUrl = ownerWaNum
    ? `https://wa.me/${ownerWaNum.startsWith('88') ? ownerWaNum : '88' + ownerWaNum}`
    : null;

  const managerWaNum = application.managerWhatsapp?.replace(/[^0-9]/g, '') || '';
  const managerWhatsappUrl = managerWaNum
    ? `https://wa.me/${managerWaNum.startsWith('88') ? managerWaNum : '88' + managerWaNum}`
    : null;

  const googleMapsUrl =
    typeof application.location?.lat === 'number' && typeof application.location?.lng === 'number'
      ? `https://www.google.com/maps/search/?api=1&query=${application.location.lat},${application.location.lng}`
      : null;

  const statusColors: Record<StoreApplication['status'], string> = {
    PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
    APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    REJECTED: 'bg-red-100 text-red-800 border-red-200',
    CANCELED: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  const handleApprove = async () => {
    const confirmed = await showConfirm(
      'স্টোর অনুমোদন',
      `"${application.storeName}" দোকানটি অনুমোদন করবেন? এটি স্বয়ংক্রিয়ভাবে দোকানের তালিকায় যুক্ত হবে।`,
      'হ্যাঁ, অনুমোদন করুন',
      'বাতিল'
    );
    if (!confirmed) return;
    await fallbackStore.approveStoreApp(application.id);
    showAlert('অনুমোদন সম্পন্ন', `"${application.storeName}" অনুমোদিত হয়েছে।`, 'success');
    onSaved();
    onClose();
  };

  const handleReject = async () => {
    const confirmed = await showConfirm(
      'স্টোর প্রত্যাখ্যান',
      `"${application.storeName}" দোকানটির আবেদন প্রত্যাখ্যান করবেন?`,
      'হ্যাঁ, প্রত্যাখ্যান করুন',
      'বাতিল'
    );
    if (!confirmed) return;
    await fallbackStore.rejectStoreApp(application.id, reviewNote);
    showAlert('প্রত্যাখ্যান সম্পন্ন', `"${application.storeName}" এর আবেদন প্রত্যাখ্যাত হয়েছে।`, 'info');
    onSaved();
    onClose();
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm(
      'আবেদন ডিলিট নিশ্চিতকরণ',
      `"${application.storeName}" এর আবেদনটি সম্পূর্ণরূপে মুছে ফেলবেন? এটি পূর্বাবস্থায় ফেরানো যাবে না।`,
      'হ্যাঁ, ডিলিট করুন',
      'বাতিল'
    );
    if (!confirmed) return;
    await fallbackStore.deleteStoreApp(application.id);
    showAlert('সফল', 'স্টোর আবেদনটি মুছে ফেলা হয়েছে।', 'success');
    onSaved();
    onClose();
  };

  const handleBlock = async () => {
    const confirmed = await showConfirm(
      'অ্যাকাউন্ট ব্লক',
      `"${application.ownerName}" (${application.userName}) এর অ্যাকাউন্ট ব্লক করবেন? এতে তাদের স্টোর অ্যাক্সেস বন্ধ হয়ে যাবে।`,
      'হ্যাঁ, ব্লক করুন',
      'বাতিল'
    );
    if (!confirmed) return;
    const reason = 'Store application violation — blocked by admin.';
    await fallbackStore.blockStoreUser(application.userId, reason);
    // Also reject the application
    await fallbackStore.rejectStoreApp(application.id, 'Account blocked by admin.');
    showAlert('ব্লক সম্পন্ন', `"${application.ownerName}" এর অ্যাকাউন্ট ব্লক করা হয়েছে।`, 'warning');
    onSaved();
    onClose();
  };

  const handleSaveEdit = async () => {
    if (!storeName.trim() || !ownerName.trim() || !ownerWhatsapp.trim()) {
      showAlert('Error', 'Store name, owner name, and owner WhatsApp are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      await fallbackStore.updateStoreApp(application.id, {
        storeName: storeName.trim(),
        storeType: storeType.trim(),
        storeDescription: storeDescription.trim(),
        ownerName: ownerName.trim(),
        ownerWhatsapp: ownerWhatsapp.trim(),
        managerName: managerName.trim(),
        managerWhatsapp: managerWhatsapp.trim(),
        commissionPercent: Number(commissionPercent) || 0,
        reviewNote: reviewNote.trim(),
        status,
        location: {
          ...application.location,
          address: locationAddress.trim(),
          lat: locationLat ? parseFloat(locationLat) : application.location?.lat,
          lng: locationLng ? parseFloat(locationLng) : application.location?.lng,
        },
      });
      showAlert('সফল', 'স্টোর আবেদনের তথ্য আপডেট হয়েছে।', 'success');
      onSaved();
      onClose();
    } catch {
      showAlert('Error', 'Update failed. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const InfoRow = ({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) => (
    <div>
      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">{label}</span>
      <span className={`text-sm font-extrabold text-gray-900 block mt-0.5 ${mono ? 'font-mono' : ''}`}>{value || <span className="text-gray-300 font-medium">—</span>}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white p-5 relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start space-x-3.5 pr-10">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/25 flex items-center justify-center shrink-0 shadow-inner">
              <Store className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/20 border border-white/25 text-white text-[10px] font-extrabold uppercase tracking-wider">
                  {application.storeType}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${statusColors[application.status]}`}>
                  {application.status}
                </span>
              </div>
              <h3 className="text-xl font-black text-white leading-tight truncate">{application.storeName}</h3>
              <p className="text-xs text-orange-100 mt-0.5">
                App ID: <span className="font-mono text-orange-200">{application.id}</span>
                {' · '}
                <span>{new Date(application.createdAt).toLocaleDateString()}</span>
              </p>
            </div>
          </div>

          {/* Mode toggle tabs */}
          <div className="flex gap-1.5 mt-4 bg-black/20 rounded-2xl p-1 w-fit">
            <button
              type="button"
              onClick={() => setMode('VIEW')}
              className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all ${mode === 'VIEW' ? 'bg-white text-orange-700 shadow' : 'text-white/80 hover:text-white'}`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setMode('EDIT')}
              className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${mode === 'EDIT' ? 'bg-white text-orange-700 shadow' : 'text-white/80 hover:text-white'}`}
            >
              <Edit className="w-3.5 h-3.5" />
              Edit
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {mode === 'VIEW' ? (
            <>
              {/* Store Info */}
              <div className="bg-orange-50/60 rounded-2xl p-4 border border-orange-100 space-y-3">
                <h4 className="text-xs font-black text-orange-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5" /> Store Info
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow label="Store Name" value={application.storeName} />
                  <InfoRow label="Store Type" value={application.storeType} />
                </div>
                {application.storeDescription && (
                  <div className="bg-white rounded-xl p-3 border border-orange-100">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Store Description</span>
                    <p className="text-xs text-gray-700 font-medium leading-relaxed">{application.storeDescription}</p>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Commission</span>
                    <span className="text-2xl font-black text-emerald-700">{application.commissionPercent > 0 ? `${application.commissionPercent}%` : '—'}</span>
                  </div>
                  {application.commissionPercent > 0 && (
                    <span className="text-xs text-gray-500 font-medium">of product cost per order</span>
                  )}
                </div>
              </div>

              {/* Owner & Manager */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-orange-600" /> Owner & Manager
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <InfoRow label="Owner Name" value={application.ownerName} />
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-extrabold text-emerald-700 font-mono">{application.ownerWhatsapp}</span>
                      {ownerWhatsappUrl && (
                        <a href={ownerWhatsappUrl} target="_blank" rel="noopener noreferrer"
                          className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm transition-all">
                          <MessageSquare className="w-3 h-3" />
                          Chat
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <InfoRow label="Manager Name" value={application.managerName} />
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-extrabold text-emerald-700 font-mono">{application.managerWhatsapp}</span>
                      {managerWhatsappUrl && (
                        <a href={managerWhatsappUrl} target="_blank" rel="noopener noreferrer"
                          className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm transition-all">
                          <MessageSquare className="w-3 h-3" />
                          Chat
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Applicant Info */}
              <div className="bg-purple-50/60 rounded-2xl p-4 border border-purple-100 space-y-3">
                <h4 className="text-xs font-black text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Applicant (Platform User)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow label="Display Name" value={application.userName} />
                  <InfoRow label="Email" value={application.userEmail} />
                  <InfoRow label="User ID" value={application.userId} mono />
                </div>
              </div>

              {/* Location */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-orange-600" /> Store Location
                  </h4>
                  {googleMapsUrl && (
                    <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-extrabold text-purple-700 hover:text-purple-900 flex items-center gap-1 underline">
                      <Globe className="w-3.5 h-3.5" />
                      Google Maps
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-xs font-semibold text-gray-800 leading-relaxed bg-white p-3 rounded-xl border border-gray-200/80">
                  {application.location?.address || 'No location address recorded'}
                </p>
                {typeof application.location?.lat === 'number' && typeof application.location?.lng === 'number' && (
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono">
                    <span className="font-bold text-gray-400">Coordinates:</span>
                    <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded-md font-semibold border border-purple-100">
                      {application.location.lat.toFixed(5)}, {application.location.lng.toFixed(5)}
                    </span>
                  </div>
                )}
              </div>

              {/* Timeline & Review Note */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100 space-y-1">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Submitted
                  </span>
                  <span className="text-xs font-extrabold text-gray-900">
                    {new Date(application.createdAt).toLocaleDateString()}
                  </span>
                  <span className="text-[11px] text-gray-500 block">
                    {new Date(application.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                {application.reviewedAt && (
                  <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100 space-y-1">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Reviewed At
                    </span>
                    <span className="text-xs font-extrabold text-gray-900">
                      {new Date(application.reviewedAt).toLocaleDateString()}
                    </span>
                    <span className="text-[11px] text-gray-500 block">
                      {new Date(application.reviewedAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>

              {application.reviewNote && (
                <div className="bg-amber-50 rounded-2xl p-3.5 border border-amber-200">
                  <span className="text-[10px] text-amber-700 font-black uppercase tracking-wider flex items-center gap-1 mb-1">
                    <FileText className="w-3 h-3" /> Review Note
                  </span>
                  <p className="text-xs text-amber-900 font-semibold leading-relaxed">{application.reviewNote}</p>
                </div>
              )}
            </>
          ) : (
            /* ── EDIT MODE ── */
            <div className="space-y-4">
              {/* Status */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Application Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StoreApplication['status'])}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 outline-none"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="CANCELED">CANCELED</option>
                </select>
              </div>

              {/* Store Name */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">দোকানের নাম (Store Name) *</label>
                <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                  placeholder="যেমন: আলম জেনারেল স্টোর" />
              </div>

              {/* Store Type — same dropdown as the store application form */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">দোকানের ধরন (Store Type)</label>
                <select
                  value={storeType}
                  onChange={(e) => setStoreType(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold bg-white outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                >
                  {storeTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  {/* Keep the current value selectable even if it's not in the list */}
                  {storeType && !storeTypes.includes(storeType) && (
                    <option value={storeType}>{storeType} (current)</option>
                  )}
                </select>
              </div>

              {/* Owner Info */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-600 block">মালিকের তথ্য (Owner Info) *</label>
                <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                  placeholder="মালিকের পুরো নাম" />
                <input type="tel" value={ownerWhatsapp} onChange={(e) => setOwnerWhatsapp(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                  placeholder="মালিকের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)" />
              </div>

              {/* Manager Info */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-600 block">ম্যানেজারের তথ্য (Manager Info)</label>
                <input type="text" value={managerName} onChange={(e) => setManagerName(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                  placeholder="ম্যানেজারের পুরো নাম" />
                <input type="tel" value={managerWhatsapp} onChange={(e) => setManagerWhatsapp(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                  placeholder="ম্যানেজারের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)" />
              </div>

              {/* Commission */}
              <div className="pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-700 block mb-1.5">প্রতি অর্ডারে কমিশন % *</label>
                <div className="relative">
                  <input type="number" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)}
                    min={0} max={100} step={0.5}
                    className="w-full p-3 pr-10 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                    placeholder="যেমন: ৫" />
                  <span className="absolute right-4 top-3.5 text-sm font-black text-gray-400">%</span>
                </div>
              </div>

              {/* Store Description */}
              <div className="pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-700 block mb-1.5">দোকানে কী কী পণ্য/সেবা পাওয়া যায়?</label>
                <textarea value={storeDescription} onChange={(e) => setStoreDescription(e.target.value)} rows={3}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 resize-none"
                  placeholder="যেমন: চাল, ডাল, তেল, শ্যাম্পু, সাবান, টুথপেস্ট, বিভিন্ন গৃহস্থালী পণ্য..." />
              </div>

              {/* Location — address + coordinates */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-600 block">দোকানের অবস্থান (Location)</label>
                <input type="text" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                  placeholder="দোকানের সম্পূর্ণ ঠিকানা" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">Latitude</label>
                    <input type="number" value={locationLat} onChange={(e) => setLocationLat(e.target.value)}
                      step="0.00001"
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-mono outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
                      placeholder="e.g. 23.81030" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">Longitude</label>
                    <input type="number" value={locationLng} onChange={(e) => setLocationLng(e.target.value)}
                      step="0.00001"
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-mono outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
                      placeholder="e.g. 90.41250" />
                  </div>
                </div>
              </div>

              {/* Review Note — admin only */}
              <div className="pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Review Note (Admin Internal)</label>
                <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 resize-none"
                  placeholder="Internal admin note about this application..." />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 p-4 bg-gray-50 border-t border-gray-100">
          {mode === 'VIEW' ? (
            <div className="flex flex-wrap items-center gap-2">
              {application.status === 'PENDING' && (
                <>
                  <button type="button" onClick={handleApprove}
                    className="flex-1 min-w-[100px] py-2.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5">
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                  <button type="button" onClick={handleReject}
                    className="flex-1 min-w-[100px] py-2.5 px-4 rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-extrabold text-xs transition-all flex items-center justify-center gap-1.5">
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </>
              )}
              {application.status === 'APPROVED' && (
                <button type="button" onClick={handleReject}
                  className="flex-1 min-w-[100px] py-2.5 px-4 rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-extrabold text-xs transition-all flex items-center justify-center gap-1.5">
                  <XCircle className="w-4 h-4" />
                  Revoke Approval
                </button>
              )}
              <button type="button" onClick={() => setMode('EDIT')}
                className="py-2.5 px-4 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all flex items-center gap-1.5">
                <Edit className="w-4 h-4" />
                Edit
              </button>
              <button type="button" onClick={handleBlock}
                className="py-2.5 px-4 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-extrabold text-xs transition-all flex items-center gap-1.5">
                <Ban className="w-4 h-4" />
                Block
              </button>
              <button type="button" onClick={handleDelete}
                className="py-2.5 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-sm transition-all flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
              <button type="button" onClick={onClose}
                className="py-2.5 px-4 rounded-2xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-extrabold text-xs transition-all">
                Close
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleSaveEdit} disabled={saving}
                className="flex-1 py-3 px-4 rounded-2xl bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5">
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setMode('VIEW')}
                className="py-3 px-4 rounded-2xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-extrabold text-xs transition-all">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
