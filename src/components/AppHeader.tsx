'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Bell, User, LogOut, ShieldCheck, Bike, ShoppingBag, PlusCircle, CheckCircle2, X } from 'lucide-react';
import { HelperApplicationModal } from './HelperApplicationModal';
import { fallbackStore } from '@/lib/firebase';

interface AppHeaderProps {
  onOpenNotifications: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onOpenNotifications }) => {
  const { user, activeMode, setActiveMode, loginWithGoogle, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showHelperModal, setShowHelperModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const syncNotifs = () => {
      if (user) {
        const notifs = fallbackStore.notifications.get(user.uid) || [];
        setUnreadCount(notifs.filter((n) => !n.read).length);
      }
    };
    syncNotifs();
    const unsub = fallbackStore.subscribe(syncNotifs);
    return () => {
      unsub();
    };
  }, [user]);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-emerald-100 shadow-sm px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo & Tagline */}
          <div className="flex items-center space-x-3">
            <div className="relative w-10 h-10 rounded-none overflow-hidden shadow-sm border border-emerald-200 flex-shrink-0 bg-emerald-50">
              <Image
                src="/Jamanot-Logo.png"
                alt="Jamanot Logo"
                fill
                className="object-cover"
                priority
              />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-extrabold text-xl tracking-tight text-gray-900 font-sans">
                  Jamanot
                </span>
                {user && activeMode !== 'customer' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                    {activeMode}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-emerald-700 font-sans">
                Ask. Relax. Done.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {user ? (
              <>
                {/* Notifications Bell */}
                <button
                  onClick={onOpenNotifications}
                  className="relative p-2.5 rounded-2xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors"
                  aria-label="Notifications"
                >
                  <Bell className="w-5 h-5 text-emerald-700" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
                  )}
                </button>

                {/* Profile Trigger */}
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center space-x-1.5 p-1 rounded-2xl border border-emerald-200 hover:border-emerald-400 bg-white transition-all shadow-sm"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName}
                      className="w-8 h-8 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                      {user.displayName.charAt(0)}
                    </div>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-2.5 rounded-2xl shadow-md transition-all active:scale-95"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Google Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Login Options Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 relative">
            <button
              onClick={() => setShowLoginModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center pt-2">
              <div className="relative w-12 h-12 rounded-none overflow-hidden shadow-sm border border-emerald-200 mx-auto mb-2 bg-emerald-50">
                <Image
                  src="/Jamanot-Logo.png"
                  alt="Jamanot Logo"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
              <h3 className="font-extrabold text-lg text-gray-900">Jamanot Sign In</h3>
              <p className="text-xs text-gray-500">Ask. Relax. Done.</p>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  loginWithGoogle();
                }}
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md flex items-center justify-center space-x-2 transition-all"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
              </button>

              <p className="text-[11px] text-gray-500 text-center pt-2 leading-relaxed">
                By continuing, you agree to Jamanot&apos;s{' '}
                <Link
                  href="/terms"
                  onClick={() => setShowLoginModal(false)}
                  className="text-emerald-600 font-bold underline hover:text-emerald-700"
                >
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link
                  href="/privacy"
                  onClick={() => setShowLoginModal(false)}
                  className="text-emerald-600 font-bold underline hover:text-emerald-700"
                >
                  Privacy Policy
                </Link>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Profile & Role Drawer / Modal */}
      {showProfileMenu && user && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end"
          onClick={() => setShowProfileMenu(false)}
        >
          <div
            className="w-full max-w-xs bg-white h-full shadow-2xl p-5 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              {/* User Identity Info */}
              <div className="flex items-center space-x-3 pb-4 border-b border-gray-100">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName}
                    className="w-12 h-12 rounded-2xl object-cover ring-2 ring-emerald-500/20"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg">
                    {user.displayName.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-gray-900 text-base leading-tight">
                    {user.displayName}
                  </h3>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
              </div>

              {/* Mode Switcher */}
              <div className="mt-5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
                  Select Mode
                </label>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setActiveMode('customer');
                      setShowProfileMenu(false);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                      activeMode === 'customer'
                        ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 font-bold shadow-sm'
                        : 'border-gray-100 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <ShoppingBag className="w-5 h-5 text-emerald-600" />
                      <div>
                        <div className="text-sm font-semibold">Customer Mode</div>
                        <div className="text-[11px] text-gray-500 font-normal">Request errands & deliveries</div>
                      </div>
                    </div>
                    {activeMode === 'customer' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                  </button>

                  {user.isHelper ? (
                    <button
                      onClick={() => {
                        setActiveMode('helper');
                        setShowProfileMenu(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                        activeMode === 'helper'
                          ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 font-bold shadow-sm'
                          : 'border-gray-100 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <Bike className="w-5 h-5 text-emerald-600" />
                        <div>
                          <div className="text-sm font-semibold">Helper Mode</div>
                          <div className="text-[11px] text-gray-500 font-normal">Accept requests & earn</div>
                        </div>
                      </div>
                      {activeMode === 'helper' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowHelperModal(true);
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 text-emerald-800 hover:bg-emerald-50 transition-all text-left"
                    >
                      <div className="flex items-center space-x-2.5">
                        <PlusCircle className="w-5 h-5 text-emerald-600" />
                        <div>
                          <div className="text-sm font-bold">Become a Helper</div>
                          <div className="text-[11px] text-emerald-700 font-normal">Apply to fulfill nearby tasks</div>
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Admin Switcher ONLY if authorized */}
                  {user.isAdmin && (
                    <button
                      onClick={() => {
                        setActiveMode('admin');
                        setShowProfileMenu(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                        activeMode === 'admin'
                          ? 'border-purple-500 bg-purple-50/70 text-purple-900 font-bold shadow-sm'
                          : 'border-gray-100 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <ShieldCheck className="w-5 h-5 text-purple-600" />
                        <div>
                          <div className="text-sm font-semibold">Admin Panel</div>
                          <div className="text-[11px] text-gray-500 font-normal">Exceptions & Operations</div>
                        </div>
                      </div>
                      {activeMode === 'admin' && <CheckCircle2 className="w-5 h-5 text-purple-600" />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Logout Footer */}
            <div className="pt-4 border-t border-gray-100">
              <button
                onClick={() => {
                  logout();
                  setShowProfileMenu(false);
                }}
                className="w-full flex items-center justify-center space-x-2 p-3 rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 font-semibold text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Become a Helper Modal */}
      {showHelperModal && (
        <HelperApplicationModal onClose={() => setShowHelperModal(false)} />
      )}
    </>
  );
};
