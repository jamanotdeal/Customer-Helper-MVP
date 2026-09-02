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
import {
  requestNativePushPermission,
  setupAppListeners,
  setNativeStatusBar,
  isNativeApp,
  hideNativeSplash,
  onOrderAlert,
  consumePendingOrderAlert,
  onPullToRefresh,
  finishRefresh,
  setPullToRefreshEnabled,
} from '@/lib/native';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '@/components/CustomModal';
import { getReadiness, requestStep, openSettings, STEP_COPY, type PermissionStep } from '@/lib/permissions';

import { Order } from '@/types';
import { OrderFeedbackModal } from '@/components/OrderFeedbackModal';
import { CustomModalInjector } from '@/components/CustomModalInjector';

import { HelperCenterPage } from '@/components/HelperCenterPage';
import { FeeDetailsPage } from '@/components/FeeDetailsPage';
import { StoreDashboard } from '@/components/StoreDashboard';

export default function PageClient() {
  const { user, loading, activeMode, setActiveMode } = useAuth();
  const { showPermissionModal } = useModal();
  const [activeTab, setActiveTab] = useState<'request' | 'helper_tasks' | 'wallet' | 'admin_panel' | 'explore' | 'helper_center' | 'fee_details'>('request');
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

  // iOS "Add to Home Screen" install banner (only shown in browser, not in native app)
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
        const dismissed = typeof localStorage !== 'undefined' && localStorage.getItem(`feedback_dismissed_${o.id}`);
        if (dismissed) return false;

        // Only show review modal if order was completed within the last 8 hours
        const completionTimeStr = o.deliveredAt || o.updatedAt || o.createdAt;
        if (!completionTimeStr) return false;
        
        try {
          const completionTime = new Date(completionTimeStr).getTime();
          const now = Date.now();
          const diffMs = now - completionTime;
          const diffHours = diffMs / (1000 * 60 * 60);
          return diffHours >= 0 && diffHours <= 8;
        } catch (e) {
          return false;
        }
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

  // Detect iOS Safari standalone check (only show in browser PWA mode)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Already in standalone PWA mode — no need for install prompt
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isInStandaloneMode =
      ('standalone' in window.navigator && (window.navigator as any).standalone === true) ||
      window.matchMedia('(display-mode: standalone)').matches;
    const dismissed = sessionStorage.getItem('ios_install_banner_dismissed');
    if (isIos && !isInStandaloneMode && !dismissed) {
      setShowIosInstallBanner(true);
    }
  }, []);

  // Status bar: white ground with dark icons, matching AppHeader's bg-white/95.
  // Also what keeps the white splash from seaming into a coloured bar.
  useEffect(() => {
    setNativeStatusBar('dark', '#ffffff');
  }, []);

  // Hold the native splash until auth has actually resolved, then fade it out.
  // Hiding on first paint instead would flash the loading skeleton.
  useEffect(() => {
    if (!loading) hideNativeSplash();
  }, [loading]);

  // Setup native app lifecycle listeners (Android back button, foreground/background events)
  useEffect(() => {
    const cleanup = setupAppListeners(() => {
      // Android hardware back button handler
      if (showNotifications) {
        setShowNotifications(false);
        return true; // Handled — don't exit app
      }
      return false; // Not handled — let Capacitor decide (exit or go back in history)
    });
    return cleanup;
  }, [showNotifications]);

  // Auto-register service worker & request push notification permission
  useEffect(() => {
    // Native builds bundle their assets and use the Java notification path, so
    // registering the service worker would only add latency and duplicate alerts.
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && !isNativeApp()) {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          console.log('ServiceWorker registered:', reg.scope);
          reg.update().catch(() => {});
        })
        .catch((err) => console.warn('ServiceWorker registration note:', err));
    }

    if (user) {
      runPermissionLadder();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Sequentially prompts every missing permission via popup. Required steps
  // (notifications, location) loop until granted; optional steps ask once and
  // remember the dismissal so the user isn't nagged on every launch.
  const runPermissionLadder = async () => {
    if (!isNativeApp()) {
      // Browser fallback: keep only the notification prompt, since the OS-level
      // permissions below don't apply.
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission === 'granted') return;
      if (typeof localStorage !== 'undefined' && localStorage.getItem('notification_permission_prompted') === 'true') return;

      const p = fallbackStore.pricingSettings;
      await showPermissionModal({
        permissionType: 'notification',
        title: p.notificationPermissionModalTitle || 'নোটিফিকেশন পারমিশন আবশ্যক (Notification Required)',
        message: p.notificationPermissionModalBody || 'জরুরি আপডেট ও অর্ডারের নোটিফিকেশন পাওয়ার জন্য নোটিফিকেশন পারমিশন দেওয়া আবশ্যক।',
        onAllow: () => requestNativePushPermission(),
        allowText: 'Allow Notification',
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('notification_permission_prompted', 'true');
      }
      return;
    }

    const REQUIRED: PermissionStep[] = ['notifications', 'location'];
    const OPTIONAL: PermissionStep[] = ['battery', 'overlay', 'autostart'];
    const skipKey = (step: PermissionStep) => `permission_skipped_${step}`;
    const p = fallbackStore.pricingSettings;

    const modalTypeFor = (step: PermissionStep): 'notification' | 'location' | 'overlay' | 'battery' | 'autostart' =>
      step === 'notifications' ? 'notification' : step === 'autostart' ? 'battery' : step;

    const copyFor = (step: PermissionStep) => {
      const base = STEP_COPY[step];
      if (step === 'notifications') {
        return {
          title: p.notificationPermissionModalTitle || base.title,
          message: p.notificationPermissionModalBody || base.message,
          action: base.action,
        };
      }
      if (step === 'location') {
        return {
          title: p.locationPermissionModalTitle || base.title,
          message: p.locationPermissionModalBody || base.message,
          action: base.action,
        };
      }
      return base;
    };

    // Required steps: loop until granted so the user cannot proceed with a
    // missing critical permission. Blocked (permanently-denied) states redirect
    // to the app settings screen.
    for (const step of REQUIRED) {
      let granted = false;
      while (!granted) {
        const report = await getReadiness();
        const stillMissing = report.missingCritical.includes(step);
        if (!stillMissing) { granted = true; break; }

        const blocked =
          (step === 'notifications' && report.status?.notifications === 'blocked') ||
          (step === 'location' && report.status?.location === 'blocked');
        const copy = copyFor(step);

        await showPermissionModal({
          permissionType: modalTypeFor(step),
          title: copy.title,
          message: blocked
            ? `${copy.message}\n\nআগে বন্ধ করে দেওয়া হয়েছে — সেটিংস থেকে চালু করুন।`
            : copy.message,
          allowText: blocked ? 'সেটিংসে যান' : copy.action,
          onAllow: async () => (blocked ? (await openSettings(), false) : requestStep(step)),
        });

        const after = await getReadiness();
        granted = !after.missingCritical.includes(step);
      }
    }

    // Optional steps: ask once. If the user closes the modal we remember it
    // and don't re-prompt on subsequent launches.
    for (const step of OPTIONAL) {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(skipKey(step)) === 'true') continue;

      const report = await getReadiness();
      if (!report.missingOptional.includes(step)) continue;

      const copy = copyFor(step);
      const accepted = await showPermissionModal({
        permissionType: modalTypeFor(step),
        title: copy.title,
        message: copy.message,
        allowText: copy.action,
        onAllow: () => requestStep(step),
      });

      if (typeof localStorage !== 'undefined' && !accepted) {
        localStorage.setItem(skipKey(step), 'true');
      }
    }
  };

  // ─── Native order alerts ──────────────────────────────────────────────────
  // Two delivery routes, covering a real cold-start race: Java can launch the
  // app from a killed state well before React mounts, so there is no listener
  // to receive the event. The warm path gets the plugin event; the cold path
  // drains the id Java parked for us. Both land in handleSelectOrder, which
  // already does all the role and tab switching.
  useEffect(() => {
    if (!isNativeApp()) return;

    const unsubscribe = onOrderAlert(({ orderId }) => {
      if (orderId) handleSelectOrder(orderId);
    });

    consumePendingOrderAlert()
      .then((orderId) => { if (orderId) handleSelectOrder(orderId); })
      .catch(() => {});

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeMode, activeTab]);

  // ─── Native pull-to-refresh ───────────────────────────────────────────────
  // Prefer a soft refresh: re-attach the Firestore listeners rather than
  // reloading the WebView, so React state and the open tab survive. Java runs a
  // 6s watchdog that hard-reloads if this never reports back — which is exactly
  // the wedged-app case people pull down to fix.
  useEffect(() => {
    if (!isNativeApp()) return;

    return onPullToRefresh(() => {
      try {
        if (user) {
          const role: 'customer' | 'helper' | 'admin' | 'store' =
            user.isAdmin ? 'admin'
              : (user.isStoreApproved || activeMode === 'store') ? 'store'
              : (user.isHelper && activeMode === 'helper') ? 'helper'
              : 'customer';
          fallbackStore.teardownListeners();
          fallbackStore.initListenersForRole(role, user.uid, user.helperType, user.storeId);
        }
      } finally {
        finishRefresh();
      }
    });
  }, [user, activeMode]);

  // Disarm the pull gesture while an overlay is open. Necessary because these
  // consume touch inside the WebView, leaving its own scrollY at 0 — so without
  // this a downward drag in a drawer or on a Leaflet map reads as a page pull.
  useEffect(() => {
    if (!isNativeApp()) return;
    const blocked = showNotifications || feedbackOrder !== null;
    setPullToRefreshEnabled(!blocked);
  }, [showNotifications, feedbackOrder]);

  // Listen for orderId query parameter changes (e.g. from notification clicks) to redirect/open that order (Requirement 1)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkQueryParam = () => {
      const params = new URLSearchParams(window.location.search);
      const orderId = params.get('orderId');
      if (orderId) {
        handleSelectOrder(orderId);
        // Clean query parameter from address bar cleanly without a full page reload
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
      }
    };

    // Run on initial mount and when document registers changes
    checkQueryParam();

    window.addEventListener('focus', checkQueryParam);
    window.addEventListener('visibilitychange', checkQueryParam);
    window.addEventListener('popstate', checkQueryParam);

    return () => {
      window.removeEventListener('focus', checkQueryParam);
      window.removeEventListener('visibilitychange', checkQueryParam);
      window.removeEventListener('popstate', checkQueryParam);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeMode, activeTab]);

  // Reset activeTab when activeMode changes
  useEffect(() => {
    if (activeMode === 'customer' && activeTab !== 'fee_details' && activeTab !== 'helper_center') {
      setActiveTab('request');
    }
  }, [activeMode]);

  // Strict role view guarding
  const renderCurrentView = () => {
    // Fee Details view (available to guests and logged in users)
    if (activeTab === 'fee_details') {
      return <FeeDetailsPage onBack={() => setActiveTab('request')} />;
    }

    // Help Center view
    if (activeTab === 'helper_center') {
      return <HelperCenterPage onBack={() => setActiveTab('request')} />;
    }

    // If not logged in, user can only see CustomerHome (Request form + How it works)
    if (!user) {
      return <CustomerHome />;
    }

    // Admin view check: by default, logged-in admin users see Admin Dashboard
    if (user.isAdmin || user.role === 'admin' || activeMode === 'admin' || activeTab === 'admin_panel') {
      return (
        <AdminDashboard
          initialSelectedOrderId={initialSelectedOrderId}
          onClearInitialOrder={() => setInitialSelectedOrderId(null)}
        />
      );
    }

    // Store mode: approved store users automatically see StoreDashboard after loading
    if (user.isStoreApproved || user.role === 'store' || activeMode === 'store') {
      return <StoreDashboard activeTab={activeTab} setActiveTab={(tab) => setActiveTab(tab as any)} />;
    }

    // Helper views check: dedicated helpers and helper mode users see Helper view as primary
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
    user && (user.isAdmin || user.role === 'admin' || activeMode === 'admin' || activeTab === 'admin_panel')
  );

  // While Firebase auth is resolving, show a skeleton layout (mirrors real layout to avoid CLS)
  if (loading) {
    return (
      <div className="mobile-container relative flex flex-col min-h-screen bg-gray-50">
        {/* Header Skeleton */}
        <div className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between"
          style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
          <div className="w-28 h-6 rounded-xl bg-gray-200 animate-pulse" />
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
          </div>
        </div>

        {/* Main Content Skeleton */}
        <main className="flex-1 w-full">
          <div className="content-container p-4 pb-24 space-y-4">
          {/* Form Card Skeleton */}
          <div className="bg-white rounded-3xl border border-gray-100 p-5 space-y-4 shadow-sm">
            <div className="space-y-2 text-center">
              <div className="w-40 h-5 rounded-xl bg-gray-200 animate-pulse mx-auto" />
              <div className="w-56 h-3.5 rounded-lg bg-gray-100 animate-pulse mx-auto" />
              <div className="w-44 h-3 rounded-lg bg-gray-100 animate-pulse mx-auto" />
            </div>
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
          </div>
        </main>

        {/* Bottom Nav Skeleton */}
        <div className="fixed bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 pt-2 z-40"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          <div className="content-container flex items-center justify-around px-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-center space-y-1">
                <div className="w-6 h-6 rounded-lg bg-gray-200 animate-pulse" />
                <div className="w-10 h-2.5 rounded bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>
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

      {/* iOS "Add to Home Screen" install banner (only shown in browser PWA mode) */}
      {showIosInstallBanner && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            width: 'calc(100% - 32px)',
            maxWidth: '680px',
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
      <main className={isAdminView ? "flex-1 w-full" : "flex-1 w-full"}>
        <div className={isAdminView ? "w-full" : "content-container p-4 pb-20"}>
          {renderCurrentView()}
        </div>
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
            if (feedbackOrder && typeof localStorage !== 'undefined') {
              localStorage.setItem(`feedback_dismissed_${feedbackOrder.id}`, 'true');
            }
            setFeedbackOrder(null);
          }}
          onSubmitted={() => {
            if (feedbackOrder && typeof localStorage !== 'undefined') {
              localStorage.setItem(`feedback_dismissed_${feedbackOrder.id}`, 'true');
            }
            setFeedbackOrder(null);
          }}
        />
      )}

      {/* Dynamic Admin Custom Modal Injector */}
      <CustomModalInjector currentEvent="FIRST_VISIT" />
    </div>
  );
}
