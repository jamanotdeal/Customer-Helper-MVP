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

export default function Home() {
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

  // While Firebase auth / redirect result is still resolving, show a loading screen.
  // This prevents flashing the unauthenticated (login) view when Google redirects back.
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        gap: '16px',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '3px solid rgba(99,102,241,0.2)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ color: '#94a3b8', fontSize: '14px', letterSpacing: '0.05em' }}>Signing you in…</span>
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
