'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layers, Check, ChevronRight, Sparkles } from 'lucide-react';
import { getServiceIconInfo } from './ServiceIcon';
import { hapticFeedback } from '@/lib/native';

interface ServiceSelectPopupProps {
  isOpen: boolean;
  services: string[];
  selectedService?: string;
  onSelect: (service: string) => void;
  onClose?: () => void;
}

export const ServiceSelectPopup: React.FC<ServiceSelectPopupProps> = ({
  isOpen,
  services,
  selectedService,
  onSelect,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        minHeight: '100vh',
        margin: 0,
      }}
      /* Backdrop click does not close the modal; customer must select a service to proceed */
    >
      <div
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-gray-100 flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 sm:py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/25 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-black text-base sm:text-lg text-gray-900 leading-tight">
                  সার্ভিস বেছে নিন
                </h3>
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-xs text-gray-500 font-semibold mt-0.5">
                চালু করতে যেকোনো সার্ভিসে ক্লিক করুন 👇
              </p>
            </div>
          </div>
        </div>

        {/* Clean, Click-Inviting Services Grid without sub-text */}
        <div className="p-3.5 sm:p-4 overflow-y-auto no-scrollbar flex-1 scroll-smooth-native">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {services.map((svc) => {
              const isSelected = svc === selectedService;
              const info = getServiceIconInfo(svc);
              const SvcIcon = info.icon;

              return (
                <button
                  key={svc}
                  type="button"
                  onClick={() => {
                    hapticFeedback('selection');
                    onSelect(svc);
                  }}
                  className={`group relative flex items-center justify-between gap-2.5 sm:gap-3 p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                    isSelected
                      ? 'bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-white border-2 border-emerald-500 ring-4 ring-emerald-500/15 shadow-md'
                      : 'bg-white border-gray-200/90 hover:border-emerald-500 hover:bg-emerald-50/40 shadow-xs hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    {/* Category Tinted Icon Chip */}
                    <div
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 group-hover:scale-110 shadow-xs ${info.bgClass} ${info.borderClass} ${info.colorClass}`}
                    >
                      <SvcIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>

                    {/* Main Service Title Only (No Sub-text) */}
                    <h4
                      className={`text-xs sm:text-[13px] font-black leading-snug line-clamp-2 transition-colors ${
                        isSelected
                          ? 'text-emerald-950 font-black'
                          : 'text-gray-900 group-hover:text-emerald-700'
                      }`}
                    >
                      {svc}
                    </h4>
                  </div>

                  {/* Click/Selection Indicator */}
                  {isSelected ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs ring-2 ring-emerald-300/50 animate-in zoom-in-75">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-100 group-hover:bg-emerald-600 text-gray-400 group-hover:text-white flex items-center justify-center shrink-0 transition-all duration-200 group-hover:translate-x-0.5 shadow-2xs">
                      <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Minimal Footer Notice */}
        <div className="px-4 py-2.5 bg-gray-50/80 border-t border-gray-100 text-center shrink-0">
          <p className="text-[11px] text-gray-500 font-medium">
            💡 পরবর্তীতে যেকোনো সময় হোম স্ক্রিন থেকে সার্ভিস পরিবর্তন করতে পারবেন
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ServiceSelectPopup;
