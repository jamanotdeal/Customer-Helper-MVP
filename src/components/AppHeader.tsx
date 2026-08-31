'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Bell, User, LogOut, ShieldCheck, Bike, ShoppingBag, PlusCircle, CheckCircle2, HeartHandshake, Store, Clock, XCircle, Edit } from 'lucide-react';
import { HelperApplicationModal } from './HelperApplicationModal';
import { StoreApplicationModal } from './StoreApplicationModal';
import { EditStoreModal } from './EditStoreModal';
import { fallbackStore } from '@/lib/firebase';

import { useModal } from './CustomModal';

interface AppHeaderProps {
  onOpenNotifications: () => void;
  onNavigate?: (tab: string) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onOpenNotifications, onNavigate }) => {
  const { user, activeMode, setActiveMode, enableCommuterHelperWithLocation, loginWithGoogle, logout } = useAuth();
  const { showAlert, showPermissionModal, showConfirm } = useModal();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showHelperModal, setShowHelperModal] = useState(false);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [storeAppStatus, setStoreAppStatus] = useState<string | null>(null);
  const [showEditStoreModal, setShowEditStoreModal] = useState(false);
  const [storeInfo, setStoreInfo] = useState<any>(null);

  useEffect(() => {
    const syncNotifs = () => {
      if (user) {
        const notifs = fallbackStore.notifications.get(user.uid) || [];
        setUnreadCount(notifs.filter((n) => !n.read).length);
        // Check store application status
        const latestStoreApp = Array.from(fallbackStore.storeApplications.values())
          .filter((a) => a.userId === user.uid)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        setStoreAppStatus(latestStoreApp?.status || null);

        // Fetch/sync store info if store approved
        if (user.storeId) {
          setStoreInfo(fallbackStore.shops.get(user.storeId) || null);
        } else {
          setStoreInfo(null);
        }
      }
    };
    syncNotifs();
    const unsub = fallbackStore.subscribe(syncNotifs);
    return () => { unsub(); };
  }, [user]);

  return (
    <>
      <header
        className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-emerald-100 shadow-sm"
        style={{
          // Respect iOS notch / Dynamic Island
          paddingTop: 'max(12px, env(safe-area-inset-top))',
        }}
      >
        <div className="content-container px-4 py-3 flex items-center justify-between">
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
                onClick={() => loginWithGoogle()}
                className="flex items-center space-x-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-xs px-3 py-2 rounded-xl border border-gray-300 shadow-sm transition-all active:scale-95"
              >
                {/* Official Google multicolour G logo */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
                <span>Sign in</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Profile & Role Drawer / Modal */}
      {showProfileMenu && user && (
        <div
          className="fixed inset-0 z-[10010] bg-black/40 backdrop-blur-xs flex justify-end"
          onClick={() => setShowProfileMenu(false)}
        >
          <div
            className="w-full max-w-xs bg-white h-screen h-[100dvh] max-h-screen max-h-[100dvh] shadow-2xl p-5 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
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
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-gray-900 text-base leading-tight">
                      {user.displayName}
                    </h3>
                    {user.isEduVerified && (
                      <span
                        title="Verified Education Profile"
                        className="inline-flex items-center gap-0.5 text-[10px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800"
                      >
                        <CheckCircle2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        <span>Verified Edu</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  {user.isHelper && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          user.helperType === 'dedicated'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {user.helperType === 'dedicated' ? '⚡ Dedicated Rider' : '🚲 Commuter Helper'}
                      </span>
                      <span className="text-[10px] text-gray-500 font-extrabold">
                        (Max {fallbackStore.pricingSettings.helperActiveOrderLimit ?? 5} active)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mode Switcher */}
              {/* Mode Switcher */}
              <div className="mt-5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
                  {user.isAdmin ? 'Current Mode' : 'Select Mode'}
                </label>
                <div className="space-y-2">
                  {user.isAdmin ? (
                    <div className="w-full flex items-center justify-between p-3 rounded-2xl border border-purple-500 bg-purple-50/70 text-purple-900 font-bold shadow-sm text-left">
                      <div className="flex items-center space-x-2.5">
                        <ShieldCheck className="w-5 h-5 text-purple-600" />
                        <div>
                          <div className="text-sm font-semibold">Admin Panel</div>
                          <div className="text-[11px] text-gray-500 font-normal">Exceptions & Operations</div>
                        </div>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-purple-600" />
                    </div>
                  ) : (
                    <>
                      {activeMode !== 'store' && (
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
                      )}

                      {/* Store Mode — nested under Customer Mode */}
                      {user.helperType !== 'dedicated' && (
                        <div className="ml-3 pl-3 border-l-2 border-emerald-100 space-y-1.5">
                          {user.isStoreApproved ? (
                            <div className="w-full p-3 rounded-2xl border border-orange-400 bg-orange-50/70 text-orange-950 shadow-sm space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <Store className="w-4 h-4 text-orange-600" />
                                  <div>
                                    <div className="text-xs font-black text-orange-850">
                                      {storeInfo?.name || 'My Store'}
                                    </div>
                                    <div className="text-[10px] text-gray-600 font-medium">Approved store mode active</div>
                                  </div>
                                </div>
                                <CheckCircle2 className="w-4.5 h-4.5 text-orange-600" />
                              </div>
                              
                              <button
                                onClick={() => {
                                  setShowProfileMenu(false);
                                  setShowEditStoreModal(true);
                                }}
                                className="w-full py-1.5 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-[10px] flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                              >
                                <Edit className="w-3 h-3 text-white" />
                                <span>Edit Store Info</span>
                              </button>
                            </div>
                          ) : storeAppStatus === 'PENDING' ? (
                            <button
                              onClick={() => { setShowProfileMenu(false); setShowStoreModal(true); }}
                              className="w-full flex items-center justify-between p-2.5 rounded-2xl border border-amber-300 bg-amber-50/70 text-amber-900 text-left"
                            >
                              <div className="flex items-center space-x-2">
                                <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                                <div>
                                  <div className="text-xs font-semibold">Became a Store</div>
                                  <div className="text-[10px] text-amber-700 font-semibold">আবেদন পর্যালোচনাধীন...</div>
                                </div>
                              </div>
                            </button>
                          ) : storeAppStatus === 'REJECTED' || storeAppStatus === 'CANCELED' ? (
                            <button
                              onClick={() => { setShowProfileMenu(false); setShowStoreModal(true); }}
                              className="w-full flex items-center justify-between p-2.5 rounded-2xl border border-gray-100 text-gray-700 hover:bg-orange-50/50 hover:border-orange-200 transition-all text-left"
                            >
                              <div className="flex items-center space-x-2">
                                <Store className="w-4 h-4 text-orange-500" />
                                <div>
                                  <div className="text-xs font-semibold">Became a Store</div>
                                  <div className="text-[10px] text-red-500 font-semibold">আবেদন প্রত্যাখ্যাত — পুনরায় আবেদন করুন</div>
                                </div>
                              </div>
                              <XCircle className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          ) : (
                            <button
                              onClick={() => { setShowProfileMenu(false); setShowStoreModal(true); }}
                              className="w-full flex items-center justify-between p-2.5 rounded-2xl border border-gray-100 text-gray-700 hover:bg-orange-50/50 hover:border-orange-200 transition-all text-left"
                            >
                              <div className="flex items-center space-x-2">
                                <Store className="w-4 h-4 text-orange-500" />
                                <div>
                                  <div className="text-xs font-semibold">Became a Store</div>
                                  <div className="text-[10px] text-gray-500 font-normal">দোকান নিবন্ধন করে স্টোর মোড পান</div>
                                </div>
                              </div>
                            </button>
                          )}
                        </div>
                      )}

                      {((user.isHelper && user.helperType === 'dedicated') || !(fallbackStore.pricingSettings.allowedHelperTypes === 'dedicated_only')) && (
                        <button
                          onClick={async () => {
                            setShowProfileMenu(false);
                            if (user.isHelper) {
                              setActiveMode('helper');
                            } else {
                              const activated = await enableCommuterHelperWithLocation();
                              if (!activated) {
                                const alreadyAsked = typeof localStorage !== 'undefined' && localStorage.getItem('location_permission_prompted') === 'true';
                                if (!alreadyAsked) {
                                  const p = fallbackStore.pricingSettings;
                                  await showPermissionModal({
                                    permissionType: 'location',
                                    title: p.locationPermissionModalTitle || 'লোকেশন পারমিশন আবশ্যক (Location Required)',
                                    message: p.locationPermissionModalBody || 'কম্পিউটার হেলপার (Commuter Helper) মোড চালু করতে ডিভাইসের জিপিএস লোকেশন পারমিশন দেওয়া আবশ্যক।',
                                    onAllow: async () => {
                                      const res = await enableCommuterHelperWithLocation();
                                      if (typeof localStorage !== 'undefined') {
                                        localStorage.setItem('location_permission_prompted', 'true');
                                      }
                                      return res;
                                    },
                                    allowText: 'Allow Location',
                                  });
                                  if (typeof localStorage !== 'undefined') {
                                    localStorage.setItem('location_permission_prompted', 'true');
                                  }
                                } else {
                                  // Force activeMode switch since they already chose
                                  const updatedUser = {
                                    ...user,
                                    isHelper: true,
                                    helperType: user.helperType || 'commuter',
                                    lastActiveMode: 'helper' as const,
                                  };
                                  fallbackStore.saveUser(updatedUser);
                                  setActiveMode('helper');
                                }
                              }
                            }
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
                              <div className="text-sm font-semibold">
                                {user.helperType === 'dedicated' ? 'Dedicated Rider Mode' : 'Commuter Helper Mode'}
                              </div>
                              <div className="text-[11px] text-gray-500 font-normal">
                                {user.helperType === 'dedicated'
                                  ? 'Accept requests & deliver'
                                  : (user.isHelper ? 'Accept requests & earn' : 'Switch directly & allow location')}
                              </div>
                            </div>
                          </div>
                          {activeMode === 'helper' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Helper Center Sidebar Option - General, placed below select mode options */}
              {fallbackStore.pricingSettings.helperCenterEnabled !== false && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onNavigate?.('helper_center');
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-2xl border border-gray-100 hover:bg-emerald-50/50 text-gray-700 transition-all text-left"
                  >
                    <div className="flex items-center space-x-2.5">
                      <HeartHandshake className="w-5 h-5 text-emerald-600" />
                      <div>
                        <div className="text-sm font-semibold">Helper Center</div>
                        <div className="text-[11px] text-gray-500 font-normal">অফিস ও যোগাযোগের তথ্য</div>
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Logout Footer */}
            <div className="pt-4 border-t border-gray-100">
              <button
                onClick={async () => {
                  const confirmed = await showConfirm(
                    'লগআউট নিশ্চিত করুন',
                    'আপনি কি নিশ্চিতভাবে লগআউট করতে চান?',
                    'লগআউট করুন',
                    'বাতিল'
                  );
                  if (confirmed) {
                    logout();
                    setShowProfileMenu(false);
                  }
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

      {/* Become a Store Modal */}
      {showStoreModal && (
        <StoreApplicationModal onClose={() => setShowStoreModal(false)} />
      )}

      {/* Edit Store Information Modal */}
      {showEditStoreModal && storeInfo && (
        <EditStoreModal shop={storeInfo} onClose={() => setShowEditStoreModal(false)} />
      )}
    </>
  );
};
