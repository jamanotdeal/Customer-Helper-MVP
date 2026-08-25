'use client';

import React from 'react';
import { Shop } from '@/types';
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
  Globe,
} from 'lucide-react';

interface AdminShopDetailsModalProps {
  shop: Shop;
  onClose: () => void;
  onEdit: (shop: Shop) => void;
  onDeleted?: () => void;
}

export const AdminShopDetailsModal: React.FC<AdminShopDetailsModalProps> = ({
  shop,
  onClose,
  onEdit,
  onDeleted,
}) => {
  const { showConfirm, showAlert } = useModal();

  const formattedWhatsApp = shop.whatsapp
    ? shop.whatsapp.replace(/[^0-9]/g, '')
    : '';

  const whatsappUrl = formattedWhatsApp
    ? `https://wa.me/${formattedWhatsApp.startsWith('88') ? formattedWhatsApp : '88' + formattedWhatsApp}`
    : null;

  const googleMapsUrl =
    typeof shop.location?.lat === 'number' && typeof shop.location?.lng === 'number'
      ? `https://www.google.com/maps/search/?api=1&query=${shop.location.lat},${shop.location.lng}`
      : null;

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
    showAlert('সফল', 'দোকানের তথ্য সফলভাবে মুছে ফেলা হয়েছে।', 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200">
        {/* Top Header Card */}
        <div className="bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 text-white p-6 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start space-x-3.5 pr-8">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
              <Store className="w-6 h-6 text-purple-200" />
            </div>
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-purple-500/30 border border-purple-300/30 text-purple-200 text-[10px] font-extrabold uppercase tracking-wider mb-1">
                {shop.type}
              </span>
              <h3 className="text-xl font-black text-white leading-tight">
                {shop.name}
              </h3>
              <p className="text-xs text-purple-200 font-medium mt-0.5">
                ID: <span className="font-mono text-purple-300">{shop.id}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Shop Photo */}
        {shop.photoUrl && (
          <div className="w-full h-40 overflow-hidden relative">
            <img
              src={shop.photoUrl}
              alt={shop.name}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Contact Person & WhatsApp Card */}
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-purple-600" />
              <span>Contact Details</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-gray-400 font-bold block">Contact Person</span>
                <span className="text-sm font-extrabold text-gray-900 block">
                  {shop.contactPerson || 'N/A'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-gray-400 font-bold block">WhatsApp Contact</span>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="text-sm font-extrabold text-emerald-700 font-mono">
                    {shop.whatsapp || 'N/A'}
                  </span>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] flex items-center space-x-1 shadow-sm transition-all"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>Chat</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Location Details Card */}
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-purple-600" />
                <span>Store Location</span>
              </h4>
              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-extrabold text-purple-700 hover:text-purple-900 flex items-center space-x-1 underline"
                >
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

          {/* Commission Info */}
          {shop.commissionPercent !== undefined && (
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-4 border border-purple-100 space-y-1.5">
              <h4 className="text-xs font-black text-purple-700 uppercase tracking-wider flex items-center space-x-1.5">
                <span>💰</span>
                <span>Retailer Commission Deal</span>
              </h4>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-purple-800">{shop.commissionPercent}%</span>
                <span className="text-xs text-purple-600 font-semibold">of product cost given back as commission</span>
              </div>
              {shop.commissionNote && (
                <p className="text-[11px] text-purple-600 font-medium bg-white/70 px-3 py-1.5 rounded-xl border border-purple-100">
                  {shop.commissionNote}
                </p>
              )}
            </div>
          )}

          {/* Additional Info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-purple-50/60 p-3 rounded-2xl border border-purple-100">
              <span className="text-[10px] text-purple-700 font-bold uppercase block mb-0.5">
                Added By
              </span>
              <span className="font-extrabold text-gray-900 block">
                {shop.addedByHelperName || 'Admin'}
              </span>
            </div>

            <div className="bg-purple-50/60 p-3 rounded-2xl border border-purple-100">
              <span className="text-[10px] text-purple-700 font-bold uppercase block mb-0.5">
                Created At
              </span>
              <span className="font-semibold text-gray-800 block text-[11px]">
                {shop.createdAt ? new Date(shop.createdAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center space-x-2.5">
          <button
            type="button"
            onClick={() => {
              onEdit(shop);
              onClose();
            }}
            className="flex-1 py-3 px-4 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5"
          >
            <Edit className="w-4 h-4" />
            <span>Edit Shop</span>
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="py-3 px-4 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-extrabold text-xs transition-all flex items-center justify-center space-x-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-2xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-extrabold text-xs transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
