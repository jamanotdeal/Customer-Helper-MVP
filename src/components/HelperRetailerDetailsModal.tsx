'use client';

import React from 'react';
import { Shop } from '@/types';
import { X, MapPin, Phone, User, Store, CheckCircle2, MessageSquare, Percent, Info } from 'lucide-react';

interface HelperRetailerDetailsModalProps {
  shop: Shop | null;
  isSelected: boolean;
  productCost?: number;
  onClose: () => void;
  onSelect: (shopId: string) => void;
  onDeselect: (shopId: string) => void;
}

export const HelperRetailerDetailsModal: React.FC<HelperRetailerDetailsModalProps> = ({
  shop,
  isSelected,
  productCost,
  onClose,
  onSelect,
  onDeselect,
}) => {
  if (!shop) return null;

  const commissionAmount =
    shop.commissionPercent !== undefined && productCost !== undefined
      ? Math.round((shop.commissionPercent / 100) * productCost)
      : null;

  const whatsappUrl = shop.whatsapp
    ? `https://wa.me/${shop.whatsapp.replace(/[^0-9]/g, '').startsWith('88')
        ? shop.whatsapp.replace(/[^0-9]/g, '')
        : '88' + shop.whatsapp.replace(/[^0-9]/g, '')}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">

        {/* Shop Photo Header */}
        <div className="relative">
          {shop.photoUrl ? (
            <div className="w-full h-44 overflow-hidden relative bg-gradient-to-br from-purple-900 to-indigo-900">
              <img
                src={shop.photoUrl}
                alt={shop.name}
                className="w-full h-full object-cover opacity-90"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              {/* Name overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <span className="inline-block bg-purple-500/50 border border-purple-300/40 text-purple-100 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-1">
                  {shop.type}
                </span>
                <h3 className="text-xl font-black text-white leading-tight drop-shadow-lg">{shop.name}</h3>
              </div>
            </div>
          ) : (
            <div className="w-full bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 px-5 pt-8 pb-5">
              <div className="flex items-center space-x-3">
                <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                  <Store className="w-7 h-7 text-purple-200" />
                </div>
                <div>
                  <span className="inline-block bg-purple-500/40 border border-purple-300/40 text-purple-200 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-1">
                    {shop.type}
                  </span>
                  <h3 className="text-xl font-black text-white leading-tight">{shop.name}</h3>
                </div>
              </div>
            </div>
          )}

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-2.5 rounded-full bg-black/30 hover:bg-black/50 text-white transition-all backdrop-blur-sm"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Selected badge */}
          {isSelected && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-emerald-600/90 backdrop-blur-sm text-white text-[10px] font-black px-2.5 py-1 rounded-full border border-emerald-400/50">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Selected</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">

          {/* Commission highlight (if set) */}
          {shop.commissionPercent !== undefined && (
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-100">
                  <Percent className="w-4 h-4 text-purple-700" />
                </div>
                <span className="text-xs font-black text-purple-800 uppercase tracking-wider">Retailer Commission</span>
              </div>
              <div className="flex items-end gap-2 flex-wrap">
                <span className="text-2xl font-black text-purple-900">{shop.commissionPercent}%</span>
                {commissionAmount !== null ? (
                  <span className="text-sm font-extrabold text-purple-700">
                    ≈ ৳{commissionAmount} <span className="text-purple-400 text-[10px] font-semibold">(based on ৳{productCost} product cost)</span>
                  </span>
                ) : (
                  <span className="text-xs text-purple-600 font-semibold">of product cost → goes to company</span>
                )}
              </div>
              {shop.commissionNote && (
                <p className="text-[11px] text-purple-600 font-medium bg-white/70 px-3 py-1.5 rounded-xl border border-purple-100 mt-1">
                  {shop.commissionNote}
                </p>
              )}
              <p className="text-[10px] text-purple-500 font-semibold mt-1">
                💡 This commission will be reflected in your payback to the company.
              </p>
            </div>
          )}

          {/* Contact & Location */}
          <div className="space-y-2.5">
            {/* Contact Person */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="p-1.5 rounded-lg bg-gray-100">
                <User className="w-4 h-4 text-gray-500" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Owner / Contact</span>
                <span className="text-sm font-extrabold text-gray-900">{shop.contactPerson || 'N/A'}</span>
              </div>
            </div>

            {/* Owner WhatsApp */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50/70 border border-emerald-100">
              <div className="p-1.5 rounded-lg bg-emerald-100">
                <Phone className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Owner WhatsApp</span>
                <span className="text-sm font-extrabold text-emerald-800 font-mono">{shop.whatsapp || 'N/A'}</span>
              </div>
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-[#25D366] text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>Chat</span>
                </a>
              )}
            </div>

            {/* Manager info (if set) */}
            {(shop.managerName || shop.managerWhatsapp) && (
              <>
                {shop.managerName && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 border border-blue-100">
                    <div className="p-1.5 rounded-lg bg-blue-100">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">Manager Name</span>
                      <span className="text-sm font-extrabold text-blue-900">{shop.managerName}</span>
                    </div>
                  </div>
                )}
                {shop.managerWhatsapp && (() => {
                  const mgWaUrl = `https://wa.me/${shop.managerWhatsapp.replace(/[^0-9]/g, '').startsWith('88')
                    ? shop.managerWhatsapp.replace(/[^0-9]/g, '')
                    : '88' + shop.managerWhatsapp.replace(/[^0-9]/g, '')}`;
                  return (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 border border-blue-100">
                      <div className="p-1.5 rounded-lg bg-blue-100">
                        <Phone className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">Manager WhatsApp</span>
                        <span className="text-sm font-extrabold text-blue-900 font-mono">{shop.managerWhatsapp}</span>
                      </div>
                      <a
                        href={mgWaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-[#25D366] text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Chat</span>
                      </a>
                    </div>
                  );
                })()}
              </>
            )}

            {/* Location */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="p-1.5 rounded-lg bg-gray-100 mt-0.5 shrink-0">
                <MapPin className="w-4 h-4 text-gray-500" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Address</span>
                <span className="text-xs font-semibold text-gray-800 leading-relaxed block">
                  {shop.location?.address || 'Address not available'}
                </span>
              </div>
            </div>

            {/* Store Description / What's Available */}
            {shop.description && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="p-1.5 rounded-lg bg-amber-100 mt-0.5 shrink-0">
                  <Info className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <span className="text-[10px] text-amber-600 font-bold uppercase block mb-0.5">কী পাওয়া যায় (What's Available)</span>
                  <span className="text-xs font-semibold text-amber-900 leading-relaxed block">
                    {shop.description}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all"
            >
              বাতিল
            </button>
            {isSelected ? (
              <button
                type="button"
                onClick={() => {
                  onDeselect(shop.id);
                  onClose();
                }}
                className="flex-2 flex-grow py-3 px-4 rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-extrabold text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <X className="w-4 h-4" />
                <span>Remove Selection</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onSelect(shop.id);
                  onClose();
                }}
                className="flex-2 flex-grow py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-extrabold text-xs shadow-md shadow-purple-700/25 transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>এই দোকান বেছে নিন</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
