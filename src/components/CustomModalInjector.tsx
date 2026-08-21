'use client';

import React, { useEffect, useState } from 'react';
import { AdminCustomModalConfig } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { X, Sparkles, ExternalLink } from 'lucide-react';

interface CustomModalInjectorProps {
  currentEvent?: string; // e.g. 'FIRST_VISIT', 'LOGIN', 'REQUEST_SUBMIT', 'ORDER_COMPLETE', 'DASHBOARD_OPEN'
}

export const CustomModalInjector: React.FC<CustomModalInjectorProps> = ({ currentEvent = 'FIRST_VISIT' }) => {
  const { user } = useAuth();
  const [activeModal, setActiveModal] = useState<AdminCustomModalConfig | null>(null);

  useEffect(() => {
    const checkCustomModals = () => {
      const modals = Array.from(fallbackStore.customModals.values());
      const matchingModal = modals.find((modal) => {
        if (!modal.isEnabled) return false;

        // 1. Event trigger match
        if (modal.triggerEvent !== currentEvent) return false;

        // 2. Target audience match
        if (modal.targetAudience === 'CUSTOMERS' && user?.isHelper) return false;
        if (modal.targetAudience === 'HELPERS' && !user?.isHelper) return false;
        if (modal.targetAudience === 'COMMUTER_HELPERS' && (user?.helperType !== 'commuter' || !user?.isHelper)) return false;
        if (modal.targetAudience === 'DEDICATED_HELPERS' && (user?.helperType !== 'dedicated' || !user?.isHelper)) return false;
        if (modal.targetAudience === 'LOGGED_IN' && !user) return false;
        if (modal.targetAudience === 'LOGGED_OUT' && user) return false;

        // 3. Frequency check
        const storageKey = `custom_modal_shown_${modal.id}`;
        if (modal.displayFrequency === 'ONCE_EVER') {
          if (typeof localStorage !== 'undefined' && localStorage.getItem(storageKey)) return false;
        } else if (modal.displayFrequency === 'ONCE_PER_SESSION') {
          if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(storageKey)) return false;
        }

        return true;
      });

      if (matchingModal) {
        setActiveModal(matchingModal);
      }
    };

    checkCustomModals();
    const unsub = fallbackStore.subscribe(checkCustomModals);
    return () => unsub();
  }, [currentEvent, user]);

  const handleClose = () => {
    if (activeModal) {
      const storageKey = `custom_modal_shown_${activeModal.id}`;
      if (activeModal.displayFrequency === 'ONCE_EVER' && typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, 'true');
      } else if (activeModal.displayFrequency === 'ONCE_PER_SESSION' && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(storageKey, 'true');
      }
    }
    setActiveModal(null);
  };

  const handleButtonClick = (actionUrl?: string) => {
    if (actionUrl) {
      if (actionUrl.startsWith('http://') || actionUrl.startsWith('https://')) {
        window.open(actionUrl, '_blank');
      } else {
        window.location.href = actionUrl;
      }
    }
    handleClose();
  };

  if (!activeModal) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200 border border-slate-200">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors backdrop-blur-md"
        >
          <X className="w-5 h-5" />
        </button>

        {activeModal.imageUrl && (
          <div className="w-full h-52 overflow-hidden bg-slate-900 relative">
            <img
              src={activeModal.imageUrl}
              alt={activeModal.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
              <span>{activeModal.title}</span>
            </h3>
            {activeModal.subtitle && (
              <p className="text-xs font-bold text-amber-700">{activeModal.subtitle}</p>
            )}
          </div>

          <p className="text-xs text-gray-600 leading-relaxed font-medium whitespace-pre-line">
            {activeModal.description}
          </p>

          <div className="flex flex-col sm:flex-row gap-2 pt-3">
            {activeModal.buttons.map((btn, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleButtonClick(btn.actionUrl)}
                className={`py-3 px-4 rounded-2xl text-xs font-extrabold flex items-center justify-center space-x-1.5 shadow-md transition-all ${
                  btn.variant === 'primary'
                    ? 'bg-purple-900 hover:bg-purple-950 text-white'
                    : btn.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                <span>{btn.label}</span>
                {btn.actionUrl && <ExternalLink className="w-3.5 h-3.5 opacity-80" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
