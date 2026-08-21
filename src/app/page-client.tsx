'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { CustomerHome } from '@/components/CustomerHome';
import { HelperDashboard } from '@/components/HelperDashboard';
import { AdminDashboard } from '@/components/AdminDashboard';
import { HelperWallet } from '@/components/HelperWallet';
import { ExploreHelperView } from '@/components/ExploreHelperView';
import { NotificationDrawer } from '@/components/NotificationDrawer';
import { requestBrowserNotificationPermission, fallbackStore } from '@/lib/firebase';
import { useModal } from '@/components/CustomModal';

import { Order } from '@/types';
import { OrderFeedbackModal } from '@/components/OrderFeedbackModal';
import { CustomModalInjector } from '@/components/CustomModalInjector';

import { HelperCenterPage } from '@/components/HelperCenterPage';

export default function PageClient() {
  const { user, loading, activeMode, setActiveMode } = useAuth();
  const { showPermissionModal } = useModal();
  const [activeTab, setActiveTab] = useState<'request' | 'helper_tasks' | 'wallet' | 'admin_panel' | 'explore' | 'helper_center'>('request');
  const [showNotifications, setShowNotifications] = useState(false);
  const [feedbackOrder, setFeedbackOrder] = useState<Order | null>(null);
  const [initialSelectedOrderId, setInitialSelectedOrderId] = useState<string | null>(null);

  const handleSelectOrder = (orderId: string) => {
    setInitialSelectedOrderId(orderId);
    
    // Switch view modes/tabs based on order and user profile
    const order = fallbackStore.orders.get(orderId);
    if (user) {
      if (user.isAdmin || activeMode === 'admin' || activeTab === 'admin_panel') {
        setActiveTab('admin_panel');
        setActiveMode('admin');
      } else if (order) {
        if (order.helperId === user.uid) {
          // Switch to helper view
          setActiveTab('helper_tasks');
          setActiveMode('helper');
        } else if (order.customerId === user.uid) {
          // Switch to customer view
          setActiveTab('request');
          setActiveMode('customer');
        } else if (!order.helperId && user.isHelper) {
          // Pending order, user is a helper, open in helper tasks to let them accept it
          setActiveTab('helper_tasks');
          setActiveMode('helper');
        }
      }
    }
  };

  // iOS "Add to Home Screen" install banner
  const [showIosInstallBanner, setShowIosInstallBanner] = useState(false);

  // Check for completed customer orders needing feedback (Only for customer mode)
  useEffect(() => {
    if (!user || (activeMode as string) !== 'customer') {
      setFeedbackOrder(null);
      return;
    }

    const checkUnratedDeliveredOrder = () => {
      const userOrders = Array.from(fallbackStore.orders.values()).filter(
        (o) => o.customerId === user.uid && o.status === 'DELIVERED'
      );

      const unrated = userOrders.find((o) => {
        if (o.feedback) return false;
        const dismissed = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(`feedback_dismissed_${o.id}`);
        return !dismissed;
      });

      if (unrated) {
        setFeedbackOrder(unrated);
      } else {
        setFeedbackOrder(null);
      }
    };

    checkUnratedDeliveredOrder();
    const unsub = fallbackStore.subscribe(checkUnratedDeliveredOrder);
    return () => unsub();
  }, [user, activeMode]);

  // Detect iOS Safari standalone check (only show if not already installed as PWA)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isInStandaloneMode =
      ('standalone' in window.navigator && (window.navigator as any).standalone === true) ||
      window.matchMedia('(display-mode: standalone)').matches;
    const dismissed = sessionStorage.getItem('ios_install_banner_dismissed');
    if (isIos && !isInStandaloneMode && !dismissed) {
      setShowIosInstallBanner(true);
    }
  }, []);

  // Auto-register service worker & request browser native push notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          console.log('ServiceWorker registered:', reg.scope);
          // Force SW update check so latest version is always active
          reg.update().catch(() => {});
        })
        .catch((err) => console.warn('ServiceWorker registration note:', err));
    }

    // Automatically ask notification permission on login/load if not granted yet.
    if (user) {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission !== 'granted') {
          const p = fallbackStore.pricingSettings;
          showPermissionModal({
            permissionType: 'notification',
            title: p.notificationPermissionModalTitle || 'নোটিফিকেশন পারমিশন আবশ্যক (Notification Required)',
            message: p.notificationPermissionModalBody || 'জরুরি আপডেট ও অর্ডারের নোটিফিকেশন পাওয়ার জন্য নোটিফিকেশন পারমিশন দেওয়া আবশ্যক।',
            onAllow: () => requestBrowserNotificationPermission(),
            allowText: 'Allow Notification',
          });
        }
      }
    }
  }, [user]);

  // Reset activeTab when activeMode changes
  useEffect(() => {
    if (activeMode === 'customer') {
      setActiveTab('request');
    }
  }, [activeMode]);

  // Strict role view guarding
  const renderCurrentView = () => {
    // If not logged in, user can only see CustomerHome (Request form + How it works)
    if (!user) {
      return <CustomerHome />;
    }

    // Help Center view
    if (activeTab === 'helper_center') {
      return <HelperCenterPage onBack={() => setActiveTab('request')} />;
    }

    // Admin view check: by default, logged-in admin users see Admin Dashboard
    if (user.isAdmin || activeMode === 'admin' || activeTab === 'admin_panel') {
      return (
        <AdminDashboard
          initialSelectedOrderId={initialSelectedOrderId}
          onClearInitialOrder={() => setInitialSelectedOrderId(null)}
        />
      );
    }

    // Helper views check
    if (user.isHelper && activeMode === 'helper') {
      if (activeTab === 'wallet') {
        return <HelperWallet />;
      }
      if (activeTab === 'explore') {
        return <ExploreHelperView />;
      }
      return (
        <HelperDashboard
          initialSelectedOrderId={initialSelectedOrderId}
          onClearInitialOrder={() => setInitialSelectedOrderId(null)}
        />
      );
    }

    // Default Customer view
    return (
      <CustomerHome
        initialSelectedOrderId={initialSelectedOrderId}
        onClearInitialOrder={() => setInitialSelectedOrderId(null)}
      />
    );
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
      <AppHeader
        onOpenNotifications={() => setShowNotifications(true)}
        onNavigate={(tab) => setActiveTab(tab as any)}
      />

      {/* iOS "Add to Home Screen" install banner */}
      {showIosInstallBanner && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            width: 'calc(100% - 32px)',
            maxWidth: '420px',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            borderRadius: '20px',
            padding: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff',
          }}
        >
          <button
            onClick={() => {
              setShowIosInstallBanner(false);
              sessionStorage.setItem('ios_install_banner_dismissed', '1');
            }}
            style={{
              position: 'absolute',
              top: '10px',
              right: '12px',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              color: '#fff',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Dismiss"
          >
            ✕
          </button>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            {/* Bell icon */}
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: '20px',
            }}>
              🔔
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 800, fontSize: '13px', margin: '0 0 4px', lineHeight: 1.3 }}>
                নোটিফিকেশন পেতে অ্যাপ ইনস্টল করুন
              </p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', margin: '0 0 10px', lineHeight: 1.5 }}>
                iPhone-এ push নোটিফিকেশন পেতে হোম স্ক্রিনে যোগ করুন:
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.85)' }}>
                <span style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '4px 8px', fontWeight: 700 }}>
                  Share ↑
                </span>
                <span>→</span>
                <span style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '4px 8px', fontWeight: 700 }}>
                  Add to Home Screen
                </span>
                <span>→</span>
                <span style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '4px 8px', fontWeight: 700 }}>
                  Add
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

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
          onSelectOrder={handleSelectOrder}
        />
      )}

      {/* Customer Order Delivery Feedback Modal */}
      {feedbackOrder && (
        <OrderFeedbackModal
          order={feedbackOrder}
          onClose={() => {
            if (feedbackOrder && typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(`feedback_dismissed_${feedbackOrder.id}`, 'true');
            }
            setFeedbackOrder(null);
          }}
          onSubmitted={() => setFeedbackOrder(null)}
        />
      )}

      {/* Dynamic Admin Custom Modal Injector */}
      <CustomModalInjector currentEvent="FIRST_VISIT" />
    </div>
  );
}
