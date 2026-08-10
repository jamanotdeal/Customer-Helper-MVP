'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { CustomerHome } from '@/components/CustomerHome';
import { HelperDashboard } from '@/components/HelperDashboard';
import { AdminDashboard } from '@/components/AdminDashboard';
import { HelperWallet } from '@/components/HelperWallet';
import { NotificationDrawer } from '@/components/NotificationDrawer';
import { requestBrowserNotificationPermission } from '@/lib/firebase';

export default function PageClient() {
  const { user, loading, activeMode } = useAuth();
  const [activeTab, setActiveTab] = useState<'request' | 'helper_tasks' | 'wallet' | 'admin_panel'>('request');
  const [showNotifications, setShowNotifications] = useState(false);

  // Auto-register service worker & request browser native push notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('ServiceWorker registered:', reg.scope))
        .catch((err) => console.warn('ServiceWorker registration note:', err));
    }

    if (user) {
      requestBrowserNotificationPermission();
    }
  }, [user]);

  // Strict role view guarding
  const renderCurrentView = () => {
    // If not logged in, user can only see CustomerHome (Request form + How it works)
    if (!user) {
      return <CustomerHome />;
    }

    // Admin view check: by default, logged-in admin users see Admin Dashboard
    if (user.isAdmin || activeMode === 'admin' || activeTab === 'admin_panel') {
      return <AdminDashboard />;
    }

    // Helper views check
    if (user.isHelper) {
      if (activeTab === 'wallet') {
        return <HelperWallet />;
      }
      if (activeMode === 'helper' || activeTab === 'helper_tasks') {
        return <HelperDashboard />;
      }
    }

    // Default Customer view
    return <CustomerHome />;
  };

  const isAdminView = Boolean(
    user && (user.isAdmin || activeMode === 'admin' || activeTab === 'admin_panel')
  );

  // While Firebase auth / redirect result is still resolving, show a skeleton layout.
  // Mirrors the real app structure so there's no jarring full-page loading screen.
  if (loading) {
    return (
      <div className="mobile-container relative flex flex-col min-h-screen bg-gray-50">
        {/* Header Skeleton */}
        <div className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="w-28 h-6 rounded-xl bg-gray-200 animate-pulse" />
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
          </div>
        </div>

        {/* Main Content Skeleton */}
        <main className="flex-1 w-full p-4 pb-20 space-y-4">
          {/* Form Card Skeleton */}
          <div className="bg-white rounded-3xl border border-gray-100 p-5 space-y-4 shadow-sm">
            {/* Heading lines */}
            <div className="space-y-2 text-center">
              <div className="w-40 h-5 rounded-xl bg-gray-200 animate-pulse mx-auto" />
              <div className="w-56 h-3.5 rounded-lg bg-gray-100 animate-pulse mx-auto" />
              <div className="w-44 h-3 rounded-lg bg-gray-100 animate-pulse mx-auto" />
            </div>
            {/* CTA button skeleton */}
            <div className="w-full h-12 rounded-2xl bg-emerald-100 animate-pulse" />
          </div>

          {/* Info cards skeleton */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-5 space-y-3">
            <div className="w-36 h-4 rounded-lg bg-emerald-200 animate-pulse" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-3 bg-white p-3.5 rounded-2xl">
                <div className="w-7 h-7 rounded-full bg-emerald-100 animate-pulse shrink-0" />
                <div className="flex-1 h-4 rounded-lg bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl p-5 space-y-3">
            <div className="w-24 h-4 rounded-lg bg-gray-200 animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-3.5 rounded-2xl bg-gray-50 space-y-2">
                  <div className="w-5 h-5 rounded-lg bg-gray-200 animate-pulse" />
                  <div className="w-16 h-3 rounded bg-gray-200 animate-pulse" />
                  <div className="w-24 h-2.5 rounded bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Bottom Nav Skeleton */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-100 px-6 py-2 flex items-center justify-around z-50">
          {[1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center space-y-1">
              <div className="w-6 h-6 rounded-lg bg-gray-200 animate-pulse" />
              <div className="w-10 h-2.5 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={isAdminView ? "w-full min-h-screen bg-slate-50/80 flex flex-col" : "mobile-container relative flex flex-col min-h-screen"}>
      {/* Header */}
      <AppHeader onOpenNotifications={() => setShowNotifications(true)} />

      {/* Main Content Body */}
      <main className={isAdminView ? "flex-1 w-full" : "flex-1 w-full p-4 pb-20"}>
        {renderCurrentView()}
      </main>

      {/* Mobile Bottom Navigation (Only for non-admin modes) */}
      {user && !isAdminView && (
        <BottomNav
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab as any);
          }}
        />
      )}

      {/* Notification Drawer Overlay */}
      {showNotifications && (
        <NotificationDrawer
          onClose={() => setShowNotifications(false)}
        />
      )}
    </div>
  );
}
