'use client';

import React, { createContext, useContext, useState } from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ModalType = 'info' | 'success' | 'warning' | 'error' | 'confirm' | 'permission';

export interface ModalOptions {
  type?: ModalType;
  permissionType?: 'location' | 'notification';
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  allowText?: string;
  onAllow?: () => Promise<boolean> | boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface ModalContextType {
  showAlert: (title: string, message: string, type?: ModalType) => Promise<void>;
  showConfirm: (title: string, message: string, confirmText?: string, cancelText?: string) => Promise<boolean>;
  showPermissionModal: (options: {
    permissionType: 'location' | 'notification';
    title: string;
    message: string;
    onAllow?: () => Promise<boolean> | boolean;
    allowText?: string;
    cancelText?: string;
  }) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<ModalOptions | null>(null);
  const [resolver, setResolver] = useState<((val: any) => void) | null>(null);
  const [isAllowing, setIsAllowing] = useState<boolean>(false);

  const showAlert = (title: string, message: string, type: ModalType = 'info'): Promise<void> => {
    return new Promise((resolve) => {
      setIsAllowing(false);
      setModalState({
        title,
        message,
        type,
        confirmText: 'ঠিক আছে',
      });
      setResolver(() => resolve);
    });
  };

  const showConfirm = (
    title: string,
    message: string,
    confirmText = 'হ্যাঁ, নিশ্চিত করুন',
    cancelText = 'বাতিল'
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setIsAllowing(false);
      setModalState({
        title,
        message,
        type: 'confirm',
        confirmText,
        cancelText,
      });
      setResolver(() => resolve);
    });
  };

  const showPermissionModal = (options: {
    permissionType: 'location' | 'notification';
    title: string;
    message: string;
    onAllow?: () => Promise<boolean> | boolean;
    allowText?: string;
    cancelText?: string;
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      setIsAllowing(false);
      setModalState({
        type: 'permission',
        permissionType: options.permissionType,
        title: options.title,
        message: options.message,
        onAllow: options.onAllow,
        allowText: options.allowText || (options.permissionType === 'location' ? 'Allow Location' : 'Allow Notification'),
        cancelText: options.cancelText,
      });
      setResolver(() => resolve);
    });
  };

  const handleConfirm = () => {
    if (resolver) resolver(true);
    setModalState(null);
    setResolver(null);
  };

  const handleCancel = () => {
    if (resolver) resolver(false);
    setModalState(null);
    setResolver(null);
  };

  const handleAllowPermission = async () => {
    if (!modalState) return;
    setIsAllowing(true);

    let granted = false;
    try {
      if (modalState.onAllow) {
        granted = await modalState.onAllow();
      } else if (modalState.permissionType === 'notification') {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          const res = await Notification.requestPermission();
          granted = res === 'granted';
        }
      } else if (modalState.permissionType === 'location') {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          granted = await new Promise<boolean>((res) => {
            navigator.geolocation.getCurrentPosition(
              () => res(true),
              () => res(false),
              { timeout: 8000 }
            );
          });
        }
      }
    } catch (_) {
      granted = false;
    }

    setIsAllowing(false);
    if (resolver) resolver(granted);
    setModalState(null);
    setResolver(null);
  };

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).showCustomAlert = showAlert;
      (window as any).showCustomConfirm = showConfirm;
    }
  }, [showAlert, showConfirm]);

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm, showPermissionModal }}>
      {children}
      {modalState && (
        <div className="fixed inset-0 z-[20000] bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4 relative animate-in zoom-in-95 duration-200 border border-emerald-100">
            {/* Close Button */}
            <button
              onClick={handleCancel}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon Header */}
            <div className="flex flex-col items-center text-center space-y-2 pt-2">
              {modalState.type === 'permission' ? (
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-pulse">
                  <Info className="w-8 h-8" />
                </div>
              ) : modalState.type === 'success' ? (
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8" />
                </div>
              ) : modalState.type === 'error' ? (
                <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8" />
                </div>
              ) : modalState.type === 'warning' ? (
                <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                  <Info className="w-8 h-8" />
                </div>
              )}

              <h3 className="font-black text-lg text-gray-900 leading-tight pt-1">
                {modalState.title}
              </h3>
              <p className="text-xs text-gray-600 font-medium leading-relaxed">
                {modalState.message}
              </p>
            </div>



            {/* Action Buttons */}
            <div className="flex flex-col space-y-2 pt-2">
              {modalState.type === 'permission' ? (
                <button
                  type="button"
                  onClick={handleAllowPermission}
                  disabled={isAllowing}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
                >
                  {isAllowing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>{modalState.allowText || (modalState.permissionType === 'location' ? 'Allow Location' : 'Allow Notification')}</span>
                  )}
                </button>
              ) : (
                <div className="flex space-x-2 pt-1">
                  {modalState.type === 'confirm' && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex-1 py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all"
                    >
                      {modalState.cancelText || 'বাতিল'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className={`flex-1 py-3.5 rounded-2xl font-extrabold text-xs shadow-md transition-all text-white ${
                      modalState.type === 'error'
                        ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                        : modalState.type === 'warning'
                        ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    }`}
                  >
                    {modalState.confirmText || 'ঠিক আছে'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
