'use client';

import React from 'react';
import { Shop } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import {
  X,
  Store,
  MapPin,
  User,
  Edit,
  Trash2,
  ExternalLink,
  MessageSquare,
  Globe,
  FileText,
  Ban,
  ShieldAlert,
  Send,
  DollarSign,
  Package,
  Upload,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import { StoreProductManager } from '../StoreProductManager';
import { AdminBlockModal } from './AdminBlockModal';
import { AdminStoreDisbursementModal } from './AdminStoreDisbursementModal';
import { LifetimeDataNotice } from './LifetimeDataNotice';
import { useAdminLifetimeData } from '@/hooks/useAdminLifetimeData';
import { compressImage } from '@/lib/imageUtils';

interface AdminShopDetailsModalProps {
  shop: Shop;
  onClose: () => void;
  onEdit: (shop: Shop) => void;
  onDeleted?: () => void;
  onShopUpdated?: () => void;
}

export const AdminShopDetailsModal: React.FC<AdminShopDetailsModalProps> = ({
  shop,
  onClose,
  onEdit,
  onDeleted,
  onShopUpdated,
}) => {
  // Wallets and history here are summed over every order, withdrawal and
  // shop order, which the admin panel reads only when a view like this opens.
  const lifetimeData = useAdminLifetimeData();

  const { showConfirm, showAlert } = useModal();
  const [showBlockModal, setShowBlockModal] = React.useState(false);
  const [showDisburseModal, setShowDisburseModal] = React.useState(false);
  const [currentShop, setCurrentShop] = React.useState<Shop>(shop);
  const [currentStatus, setCurrentStatus] = React.useState<'Approved' | 'Pending' | 'Rejected'>(
    shop.status === 'Pending' || shop.status === 'PENDING'
      ? 'Pending'
      : shop.status === 'Rejected' || shop.status === 'REJECTED'
      ? 'Rejected'
      : 'Approved'
  );
  const [activeTab, setActiveTab] = React.useState<'details' | 'items'>('details');
  const [storeProductsCount, setStoreProductsCount] = React.useState<number>(() => {
    return Array.from(fallbackStore.storeProducts.values()).filter(
      (p) => p.storeId === shop.id || (shop.ownerUserId && p.storeId === shop.ownerUserId)
    ).length;
  });

  const shopPhotoInputRef = React.useRef<HTMLInputElement>(null);

  const handleShopPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showAlert('ভুল ফাইল', 'অনুগ্রহ করে একটি ছবি ফাইল নির্বাচন করুন।', 'warning');
      return;
    }
    try {
      const compressed = await compressImage(file, 700, 700, 0.85);
      await fallbackStore.updateShop(shop.id, { photoUrl: compressed });
      setCurrentShop((prev) => ({ ...prev, photoUrl: compressed }));
      if (onShopUpdated) onShopUpdated();
      showAlert('সফল', 'দোকানের প্রোফাইল ছবি সফলভাবে আপডেট করা হয়েছে।', 'success');
    } catch {
      showAlert('ত্রুটি', 'ছবি প্রসেস করতে ব্যর্থ হয়েছে।', 'error');
    }
  };

  const handleRemoveShopPhoto = async () => {
    const confirmed = await showConfirm(
      'ছবি অপসারণ নিশ্চিতকরণ',
      `"${shop.name}" দোকানের প্রোফাইল ছবি মুছে ফেলবেন?`,
      'হ্যাঁ, মুছে ফেলুন',
      'বাতিল'
    );
    if (!confirmed) return;
    try {
      await fallbackStore.updateShop(shop.id, { photoUrl: '' });
      setCurrentShop((prev) => ({ ...prev, photoUrl: '' }));
      if (onShopUpdated) onShopUpdated();
      showAlert('সফল', 'দোকানের ছবি মুছে ফেলা হয়েছে।', 'info');
    } catch {
      showAlert('ত্রুটি', 'ছবি মুছতে ব্যর্থ হয়েছে।', 'error');
    }
  };

  React.useEffect(() => {
    const updateCount = () => {
      const cnt = Array.from(fallbackStore.storeProducts.values()).filter(
        (p) => p.storeId === shop.id || (shop.ownerUserId && p.storeId === shop.ownerUserId)
      ).length;
      setStoreProductsCount(cnt);
    };
    const unsub = fallbackStore.subscribe(updateCount);
    fallbackStore.loadStoreProducts();
    return () => unsub();
  }, [shop.id, shop.ownerUserId]);

  const formattedWhatsApp = shop.whatsapp
    ? shop.whatsapp.replace(/[^0-9]/g, '')
    : '';

  const whatsappUrl = formattedWhatsApp
    ? `https://wa.me/${formattedWhatsApp.startsWith('88') ? formattedWhatsApp : '88' + formattedWhatsApp}`
    : null;

  const managerWaNum = shop.managerWhatsapp?.replace(/[^0-9]/g, '') || '';
  const managerWhatsappUrl = managerWaNum
    ? `https://wa.me/${managerWaNum.startsWith('88') ? managerWaNum : '88' + managerWaNum}`
    : null;

  const googleMapsUrl =
    typeof shop.location?.lat === 'number' && typeof shop.location?.lng === 'number'
      ? `https://www.google.com/maps/search/?api=1&query=${shop.location.lat},${shop.location.lng}`
      : null;

  // Compute Order Statistics & Financials dynamically based on order statuses
  const fin = fallbackStore.getStoreFinancials(shop);
  const completedOrders = fin.completedOrders;
  const rejectedOrders = fin.canceledOrders;
  const runningOrders = fin.runningOrders;
  const totalSales = fin.deliveredSales;
  const totalDisbursed = fin.totalDisbursed;
  const unpaidBalance = fin.unpaidBalance;
  const commission = fin.deliveredCommission;
  const disbursedCommission = fin.disbursedCommission;
  const unpaidCommission = fin.unpaidCommission;

  const handleToggleBlock = async () => {
    if (currentShop.isBlocked) {
      const confirmed = await showConfirm(
        'স্টোর আনব্লক নিশ্চিতকরণ',
        `আপনি কি "${currentShop.name}" স্টোরটি আনব্লক করতে চান?`,
        'হ্যাঁ, আনব্লক করুন',
        'বাতিল'
      );
      if (!confirmed) return;

      await fallbackStore.blockShop(shop.id, false);
      const updated = { ...currentShop, isBlocked: false, adminBlockNote: undefined, blockedReason: undefined };
      setCurrentShop(updated);
      showAlert('আনব্লক সম্পন্ন', `"${currentShop.name}" স্টোরটি পুনরায় সক্রিয় করা হয়েছে।`, 'success');
      if (onShopUpdated) onShopUpdated();
    } else {
      setShowBlockModal(true);
    }
  };

  const handleConfirmBlock = async (note: string) => {
    await fallbackStore.blockShop(shop.id, true, note);
    const updated = { ...currentShop, isBlocked: true, adminBlockNote: note, blockedReason: note };
    setCurrentShop(updated);
    showAlert('ব্লক সম্পন্ন', `"${currentShop.name}" স্টোরটি ব্লক করা হয়েছে।`, 'info');
    if (onShopUpdated) onShopUpdated();
  };

  const handleStatusChange = async (newStatus: 'Approved' | 'Pending' | 'Rejected') => {
    setCurrentStatus(newStatus);
    await fallbackStore.updateShopStatus(shop.id, newStatus);
    showAlert('সফল', `দোকানের স্ট্যাটাস ${newStatus} এ পরিবর্তিত হয়েছে।`, 'success');
    if (onShopUpdated) onShopUpdated();
  };

  const isStoreActive = currentShop.isActive !== undefined ? currentShop.isActive : (currentShop.isOpen !== false);

  const handleToggleActiveStatus = async () => {
    const newActive = !isStoreActive;
    await fallbackStore.toggleShopActiveStatus(shop.id, newActive);
    const updated = { ...currentShop, isOpen: newActive, isActive: newActive };
    setCurrentShop(updated);
    showAlert(
      newActive ? 'দোকান সক্রিয় (Active) করা হয়েছে' : 'দোকান নিষ্ক্রিয় (Inactive) করা হয়েছে',
      `"${shop.name}" স্টোরটি এখন ${newActive ? 'সক্রিয় (Active) এবং গ্রাহকদের জন্য খোলা' : 'নিষ্ক্রিয় (Inactive / Offline) করা হয়েছে'}।`,
      newActive ? 'success' : 'info'
    );
    if (onShopUpdated) onShopUpdated();
  };

  const isFeatured = Boolean(currentShop.isFeatured);

  const handleToggleFeatured = async () => {
    const nextVal = !isFeatured;
    await fallbackStore.toggleShopFeaturedStatus(shop.id, nextVal, currentShop.featuredOrder);
    const updated = {
      ...currentShop,
      isFeatured: nextVal,
      featuredAt: nextVal ? (currentShop.featuredAt || new Date().toISOString()) : undefined,
    };
    setCurrentShop(updated);
    showAlert(
      nextVal ? 'স্টোর টপে ফিচার করা হয়েছে' : 'টপ ফিচার থেকে সরানো হয়েছে',
      `"${shop.name}" ${nextVal ? 'সফলভাবে টপে ফিচার করা হয়েছে। গ্রাহক ক্যাটাগরি সিলেক্ট করলে এই দোকানটি তালিকার শীর্ষে প্রদর্শিত হবে।' : 'টপ ফিচার থেকে বাদ দেওয়া হয়েছে।'}`,
      'success'
    );
    if (onShopUpdated) onShopUpdated();
  };

  const handleUpdateFeaturedOrder = async () => {
    const input = prompt(
      `"${currentShop.name}" এর জন্য প্রায়োরিটি ক্রম নম্বর দিন (কম নম্বর শীর্ষে থাকবে, যেমন 1, 2, 3...):`,
      currentShop.featuredOrder !== undefined ? String(currentShop.featuredOrder) : '1'
    );
    if (input === null) return;
    const num = parseInt(input.trim(), 10);
    const newOrder = !isNaN(num) && num > 0 ? num : undefined;
    await fallbackStore.toggleShopFeaturedStatus(shop.id, true, newOrder);
    const updated = { ...currentShop, isFeatured: true, featuredOrder: newOrder };
    setCurrentShop(updated);
    showAlert('অগ্রাধিকার আপডেট', `"${shop.name}" এর প্রায়োরিটি #${newOrder || 'Default'} সেট করা হয়েছে।`, 'success');
    if (onShopUpdated) onShopUpdated();
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm(
      'দোকান ডিলিট নিশ্চিতকরণ',
      `আপনি কি নিশ্চিতভাবে ${shop.name} দোকানটি ডিলিট করতে চান?`,
      'হ্যাঁ, ডিলিট করুন',
      'বাতিল'
    );
    if (!confirmed) return;

    await fallbackStore.deleteShop(shop.id);
    if (onDeleted) onDeleted();
    showAlert('সফল', 'দোকানের তথ্য সফলভাবে মুছে ফেলা হয়েছে।', 'success');
    onClose();
  };

  const InfoRow = ({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) => (
    <div>
      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">{label}</span>
      <span className={`text-sm font-extrabold text-gray-900 block mt-0.5 ${mono ? 'font-mono text-xs break-all' : ''}`}>
        {value || <span className="text-gray-300 font-medium">—</span>}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className={`w-full ${activeTab === 'items' ? 'max-w-3xl' : 'max-w-lg'} bg-white rounded-3xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh] transition-all`}>
        <LifetimeDataNotice className="m-3 mb-0 shrink-0" loading={lifetimeData.loading} error={lifetimeData.error} onRetry={lifetimeData.retry} />

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 text-white p-6 relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-rose-500/80 hover:bg-rose-600 text-white transition-all shadow-sm cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start space-x-3.5 pr-8">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
              <Store className="w-6 h-6 text-purple-200" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-purple-500/30 border border-purple-300/30 text-purple-200 text-[10px] font-extrabold uppercase tracking-wider">
                  {shop.type}
                </span>
                {currentShop.isBlocked && (
                  <span className="px-2.5 py-0.5 rounded-full bg-red-500 text-white font-black text-[10px] uppercase tracking-wider flex items-center space-x-1 shadow-xs">
                    <Ban className="w-3 h-3" />
                    <span>BLOCKED</span>
                  </span>
                )}
                <select
                  value={currentStatus}
                  onChange={(e) => handleStatusChange(e.target.value as any)}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border cursor-pointer outline-none ${
                    currentStatus === 'Approved'
                      ? 'bg-emerald-500 text-white border-emerald-400'
                      : currentStatus === 'Pending'
                      ? 'bg-amber-500 text-white border-amber-400'
                      : 'bg-red-500 text-white border-red-400'
                  }`}
                >
                  <option value="Approved" className="bg-white text-gray-900 font-bold">Approved</option>
                  <option value="Pending" className="bg-white text-gray-900 font-bold">Pending</option>
                  <option value="Rejected" className="bg-white text-gray-900 font-bold">Rejected</option>
                </select>
                <button
                  type="button"
                  onClick={handleToggleActiveStatus}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all flex items-center space-x-1 shadow-xs ${
                    isStoreActive
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-400'
                      : 'bg-rose-500 hover:bg-rose-600 text-white border-rose-400'
                  }`}
                  title="Click to toggle store Active / Inactive status"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isStoreActive ? 'bg-white animate-pulse' : 'bg-white'}`} />
                  <span>{isStoreActive ? 'Active (খোলা)' : 'Inactive (বন্ধ)'}</span>
                </button>
              </div>
              <h3 className="text-xl font-black text-white leading-tight">{shop.name}</h3>
              <p className="text-xs text-purple-200 font-medium mt-0.5">
                ID: <span className="font-mono text-purple-300">{shop.id}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="bg-gray-100 p-1 flex border-b border-gray-200 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-2 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'details'
                ? 'bg-white text-purple-950 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Store className="w-3.5 h-3.5 text-purple-700" />
            <span>দোকানের বিবরণ (Details)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('items')}
            className={`flex-1 py-2 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'items'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>পণ্য ব্যবস্থাপনা ({storeProductsCount} Items)</span>
          </button>
        </div>

        {/* Items Management Body */}
        {activeTab === 'items' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 overscroll-contain">
            <StoreProductManager
              storeId={shop.id}
              storeName={shop.name}
              hideFloatingFab={true}
            />
          </div>
        ) : (
          <>
            {/* Hidden Photo Input */}
            <input
              ref={shopPhotoInputRef}
              type="file"
              accept="image/*"
              onChange={handleShopPhotoUpload}
              className="hidden"
            />

            {/* Shop Photo Banner with Admin Upload/Edit Button */}
            {currentShop.photoUrl ? (
              <div className="w-full h-44 overflow-hidden relative shrink-0 group bg-gray-900">
                <img
                  src={currentShop.photoUrl}
                  alt={currentShop.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                
                {/* Admin Quick Action Controls */}
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => shopPhotoInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-white/90 hover:bg-white text-gray-800 text-xs font-bold backdrop-blur-md shadow-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                  >
                    <Upload className="w-3.5 h-3.5 text-purple-700" />
                    <span>ছবি পরিবর্তন করুন</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveShopPhoto}
                    className="p-1.5 rounded-xl bg-black/60 hover:bg-rose-600 text-white backdrop-blur-md shadow-md transition-all cursor-pointer"
                    title="ছবি মুছে ফেলুন"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 mx-5 mt-4 rounded-2xl border-2 border-dashed border-purple-200/80 bg-purple-50/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-gray-900">দোকানের কোনো প্রোফাইল ছবি নেই</p>
                    <p className="text-[10px] text-gray-500">গ্রাহক ও হেলপারদের সহজে চেনার জন্য ছবি যুক্ত করুন।</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => shopPhotoInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>ছবি আপলোড</span>
                </button>
              </div>
            )}

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Block Warning Banner if store is blocked */}
          {currentShop.isBlocked && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 flex items-start space-x-3">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-red-950">এই স্টোরটি বর্তমানে ব্লকড (BLOCKED)!</h4>
                <p className="text-xs text-red-800">
                  🔒 <strong>অ্যাডমিন ইন্টারনাল নোট:</strong> "{currentShop.adminBlockNote || currentShop.blockedReason || 'অ্যাডমিন দ্বারা সীমাবদ্ধ'}"
                </p>
                <p className="text-[10px] text-red-600 font-medium">
                  (এই নোটটি শুধুমাত্র অ্যাডমিন দেখতে পাবেন। গ্রাহকদের কাছে এই স্টোরে অর্ডার পাঠানো বন্ধ থাকবে।)
                </p>
              </div>
            </div>
          )}

          {/* Order Metrics Section */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                📊 Order Statistics & Revenue
              </span>
              <span className="text-[10px] font-bold text-slate-400">Realtime Summary</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white/10 rounded-xl p-2 backdrop-blur-xs">
                <span className="text-[9px] font-extrabold text-emerald-400 uppercase block">Completed</span>
                <span className="text-lg font-black text-white">{completedOrders}</span>
              </div>
              <div className="bg-white/10 rounded-xl p-2 backdrop-blur-xs">
                <span className="text-[9px] font-extrabold text-amber-400 uppercase block">Running</span>
                <span className="text-lg font-black text-white">{runningOrders}</span>
              </div>
              <div className="bg-white/10 rounded-xl p-2 backdrop-blur-xs">
                <span className="text-[9px] font-extrabold text-rose-400 uppercase block">Rejected</span>
                <span className="text-lg font-black text-white">{rejectedOrders}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
              <div className="bg-emerald-950/60 border border-emerald-500/20 rounded-xl p-2.5">
                <span className="text-[10px] font-bold text-emerald-300 block">Total Delivered Sales</span>
                <span className="text-base font-black text-emerald-400">৳{totalSales.toLocaleString()}</span>
                {unpaidBalance > 0 ? (
                  <span className="text-[10px] text-amber-300 font-extrabold block mt-0.5">
                    Due Payout: ৳{unpaidBalance.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-300 font-bold block mt-0.5">
                    Settled / Cleared
                  </span>
                )}
              </div>
              <div className="bg-purple-950/60 border border-purple-500/20 rounded-xl p-2.5">
                <span className="text-[10px] font-bold text-purple-300 block">Commission ({shop.commissionPercent || 0}%)</span>
                <span className="text-base font-black text-purple-300">৳{commission.toLocaleString()}</span>
                <div className="text-[9px] text-purple-200/90 font-medium mt-0.5 leading-tight">
                  <span>Settled: ৳{disbursedCommission.toLocaleString()}</span>
                  {unpaidCommission > 0 && (
                    <span className="text-amber-300 font-bold block">Due: ৳{unpaidCommission.toLocaleString()}</span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDisburseModal(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-95"
            >
              <DollarSign className="w-4 h-4" />
              <span>Financials, Helper Breakdown & Disburse Payment</span>
            </button>
          </div>

          {/* Store Description / Products-Services */}
          {shop.description && (
            <div className="bg-orange-50/60 rounded-2xl p-4 border border-orange-100">
              <span className="text-[10px] text-orange-700 font-black uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5" /> দোকানে কী কী পণ্য/সেবা পাওয়া যায়
              </span>
              <p className="text-xs text-gray-700 font-medium leading-relaxed">{shop.description}</p>
            </div>
          )}

          {/* Owner & Manager */}
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-purple-600" /> মালিক ও ম্যানেজারের তথ্য
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {/* Owner */}
              <div className="space-y-1">
                <InfoRow label="মালিকের নাম" value={shop.contactPerson} />
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs font-extrabold text-emerald-700 font-mono">{shop.whatsapp || '—'}</span>
                  {whatsappUrl && (
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm transition-all">
                      <MessageSquare className="w-3 h-3" /> Chat
                    </a>
                  )}
                </div>
              </div>
              {/* Manager */}
              <div className="space-y-1">
                <InfoRow label="ম্যানেজারের নাম" value={shop.managerName || '—'} />
                {shop.managerWhatsapp && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs font-extrabold text-emerald-700 font-mono">{shop.managerWhatsapp}</span>
                    {managerWhatsappUrl && (
                      <a href={managerWhatsappUrl} target="_blank" rel="noopener noreferrer"
                        className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm transition-all">
                        <MessageSquare className="w-3 h-3" /> Chat
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Applicant (Platform User) Info */}
          {(shop.ownerUserEmail || shop.ownerUserId || shop.addedByHelperName) && (
            <div className="bg-purple-50/60 rounded-2xl p-4 border border-purple-100 space-y-3">
              <h4 className="text-xs font-black text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Applicant (Platform User)
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Display Name" value={shop.addedByHelperName} />
                <InfoRow label="Email" value={shop.ownerUserEmail} />
                <InfoRow label="User ID" value={shop.ownerUserId} mono />
                {shop.applicationId && (
                  <InfoRow label="Application ID" value={shop.applicationId} mono />
                )}
              </div>
            </div>
          )}

          {/* Location */}
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-purple-600" />
                <span>Store Location</span>
              </h4>
              {googleMapsUrl && (
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-extrabold text-purple-700 hover:text-purple-900 flex items-center space-x-1 underline">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <p className="text-xs font-semibold text-gray-800 leading-relaxed bg-white p-3 rounded-xl border border-gray-200/80">
              {shop.location?.address || 'No location address recorded'}
            </p>
            {typeof shop.location?.lat === 'number' && typeof shop.location?.lng === 'number' && (
              <div className="flex items-center space-x-2 text-[11px] text-gray-500 font-mono">
                <span className="font-bold text-gray-400">Coordinates:</span>
                <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded-md font-semibold border border-purple-100">
                  {shop.location.lat.toFixed(5)}, {shop.location.lng.toFixed(5)}
                </span>
              </div>
            )}
          </div>

          {/* Order Receiving Capability */}
          <div className="bg-purple-50/80 rounded-2xl p-4 border border-purple-200/80 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-black text-purple-950 uppercase tracking-wider">
                Order Receiving Capability
              </h4>
              <p className="text-[11px] text-purple-800 font-semibold mt-0.5">
                {(shop.canReceiveOrders !== false)
                  ? 'সরাসরি অর্ডার গ্রহণ সক্ষম (Accepts requests directly via Store App)'
                  : 'ম্যানুয়াল দোকান (Added by admin - Helper updates price, note & status manually)'}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                const currentVal = shop.canReceiveOrders !== undefined ? shop.canReceiveOrders : true;
                const updated = { ...shop, canReceiveOrders: !currentVal };
                await fallbackStore.saveShop(updated);
                showAlert(
                  'Order Receive Capability Updated',
                  `"${shop.name}" এর জন্য Order Receive Capability ${!currentVal ? 'সক্রিয় (Can Receive)' : 'নিষ্ক্রিয় (Manual Only)'} করা হয়েছে।`,
                  'success'
                );
                onClose();
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border shadow-sm transition-all cursor-pointer ${
                (shop.canReceiveOrders !== false)
                  ? 'bg-purple-700 hover:bg-purple-800 text-white border-purple-600'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-800 border-gray-400'
              }`}
            >
              {(shop.canReceiveOrders !== false) ? 'Can Receive: YES' : 'Can Receive: NO'}
            </button>
          </div>

          {/* Store Active / Inactive Status Switch */}
          <div className="bg-emerald-50/60 rounded-2xl p-4 border border-emerald-200/80 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${isStoreActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                  Store Active / Inactive Status (দোকান সক্রিয়/নিষ্ক্রিয়)
                </h4>
              </div>
              <p className="text-[11px] text-gray-600 font-semibold mt-0.5">
                {isStoreActive
                  ? 'দোকানটি বর্তমানে সক্রিয় (Active / Open) — গ্রাহক ও হেলপাররা অর্ডার করতে পারবেন।'
                  : 'দোকানটি বর্তমানে নিষ্ক্রিয় (Inactive / Closed) — কাস্টমারদের কাছে দোকানটি বন্ধ দেখাবে।'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleActiveStatus}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border shadow-sm transition-all cursor-pointer flex items-center space-x-1.5 ${
                isStoreActive
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500'
                  : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500'
              }`}
            >
              <span>{isStoreActive ? 'Active (ON)' : 'Inactive (OFF)'}</span>
            </button>
          </div>

          {/* Top Featured Store Switch */}
          <div className="bg-amber-50/70 rounded-2xl p-4 border border-amber-200/90 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-1.5">
                  <Sparkles className={`w-4 h-4 ${isFeatured ? 'text-amber-500 fill-amber-400 animate-pulse' : 'text-gray-400'}`} />
                  <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider">
                    Feature at Top (শীর্ষে ফিচার করুন)
                  </h4>
                </div>
                <p className="text-[11px] text-amber-900 font-semibold mt-0.5">
                  {isFeatured
                    ? 'এই দোকানটি ক্যাটাগরি নির্বাচনের সময় শীর্ষে (টপে) প্রদর্শিত হবে। গ্রাহকদের কোনো "Featured" স্ট্যাটাস ট্যাগ দেখানো হবে না।'
                    : 'বর্তমানে সাধারণ নিয়মে প্রদর্শিত হচ্ছে (টপে ফিচার্ড নয়)।'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleFeatured}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border shadow-sm transition-all cursor-pointer flex items-center space-x-1.5 shrink-0 ${
                  isFeatured
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300'
                }`}
              >
                <span>{isFeatured ? '⭐ Featured: ON' : '☆ Featured: OFF'}</span>
              </button>
            </div>

            {isFeatured && (
              <div className="flex items-center justify-between pt-2.5 border-t border-amber-200/60 bg-amber-100/50 p-2.5 rounded-xl">
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">
                    অগ্রাধিকার ক্রম (Priority Order)
                  </span>
                  <span className="text-xs text-amber-900 font-bold">
                    #{currentShop.featuredOrder || '1'} (কম নম্বর আগে প্রদর্শিত হবে)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleUpdateFeaturedOrder}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer transition-all active:scale-95"
                >
                  ক্রম পরিবর্তন করুন
                </button>
              </div>
            )}
          </div>

          {/* Commission */}
          {shop.commissionPercent !== undefined && (
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-4 border border-purple-100 space-y-1.5">
              <h4 className="text-xs font-black text-purple-700 uppercase tracking-wider flex items-center space-x-1.5">
                <span>💰</span>
                <span>প্রতি অর্ডারে কমিশন</span>
              </h4>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-purple-800">{shop.commissionPercent}%</span>
                <span className="text-xs text-purple-600 font-semibold">প্রতি অর্ডারের পণ্যমূল্যের উপর কমিশন</span>
              </div>
              {shop.commissionNote && (
                <p className="text-[11px] text-purple-600 font-medium bg-white/70 px-3 py-1.5 rounded-xl border border-purple-100">
                  {shop.commissionNote}
                </p>
              )}
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-purple-50/60 p-3 rounded-2xl border border-purple-100">
              <span className="text-[10px] text-purple-700 font-bold uppercase block mb-0.5">Added By</span>
              <span className="font-extrabold text-gray-900 block">{shop.addedByHelperName || 'Admin'}</span>
            </div>
            <div className="bg-purple-50/60 p-3 rounded-2xl border border-purple-100">
              <span className="text-[10px] text-purple-700 font-bold uppercase block mb-0.5">Created At</span>
              <span className="font-semibold text-gray-800 block text-[11px]">
                {shop.createdAt ? new Date(shop.createdAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer for Details View */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center space-x-2 shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('items')}
            className="py-3 px-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95"
            title="পণ্য ব্যবস্থাপনা করুন"
          >
            <Package className="w-3.5 h-3.5" />
            <span>Manage Items ({storeProductsCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDisburseModal(true)}
            className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Disburse Payment</span>
          </button>

          <button
            type="button"
            onClick={handleToggleBlock}
            className={`py-3 px-3.5 rounded-2xl font-extrabold text-xs shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 ${
              currentShop.isBlocked
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>{currentShop.isBlocked ? 'Unblock Store' : 'Block Store'}</span>
          </button>

          <button
            type="button"
            onClick={() => { onEdit(shop); onClose(); }}
            className="flex-1 py-3 px-4 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <Edit className="w-4 h-4" />
            <span>Edit Shop</span>
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="py-3 px-4 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-extrabold text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 font-extrabold text-xs transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </>
    )}

    {/* Footer for Items View */}
    {activeTab === 'items' && (
      <div className="p-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('details')}
          className="py-2.5 px-4 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 font-extrabold text-xs transition-all flex items-center space-x-1.5 cursor-pointer"
        >
          <Store className="w-3.5 h-3.5 text-purple-700" />
          <span>← Back to Store Details</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="py-2.5 px-5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-extrabold text-xs shadow-xs transition-all cursor-pointer active:scale-95"
        >
          Close
        </button>
      </div>
    )}

        {/* Admin Block Note Modal */}
        {showBlockModal && (
          <AdminBlockModal
            targetName={currentShop.name}
            targetType="Store"
            onConfirm={handleConfirmBlock}
            onClose={() => setShowBlockModal(false)}
          />
        )}

        {/* Store Financials & Disbursement Modal */}
        {showDisburseModal && (
          <AdminStoreDisbursementModal
            shop={currentShop}
            onClose={() => setShowDisburseModal(false)}
            onDisbursed={() => {
              if (onShopUpdated) onShopUpdated();
            }}
          />
        )}
      </div>
    </div>
  );
};
