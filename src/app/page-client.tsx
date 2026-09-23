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
} from '@/lib/native';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '@/components/CustomModal';

import { Order, OrderFeedback } from '@/types';
import { OrderFeedbackModal } from '@/components/OrderFeedbackModal';
import { FeedbackReplyModal } from '@/components/FeedbackReplyModal';
import { CoinRewardModal } from '@/components/CoinRewardModal';
import { getCoinsForService } from '@/lib/pricing';
import { CustomModalInjector } from '@/components/CustomModalInjector';

import { HelperCenterPage } from '@/components/HelperCenterPage';
import { FeeDetailsPage } from '@/components/FeeDetailsPage';
import { StoreDashboard } from '@/components/StoreDashboard';
import { PwaSmartPrompt } from '@/components/PwaSmartPrompt';
import { InAppBrowserModal } from '@/components/InAppBrowserModal';

export default function PageClient() {
  const { user, loading, activeMode, setActiveMode } = useAuth();
  const { showAlert, showPermissionModal } = useModal();
  const [activeTab, setActiveTab] = useState<'request' | 'helper_tasks' | 'wallet' | 'admin_panel' | 'explore' | 'helper_center' | 'fee_details'>('request');
  const [showNotifications, setShowNotifications] = useState(false);
  const [coinRewardOrder, setCoinRewardOrder] = useState<Order | null>(null);
  const [feedbackOrder, setFeedbackOrder] = useState<Order | null>(null);
  const [pendingReplyFeedback, setPendingReplyFeedback] = useState<OrderFeedback | null>(null);
  const [initialSelectedOrderId, setInitialSelectedOrderId] = useState<string | null>(null);

  const handleSelectOrder = (orderId: string) => {
    // Switch view modes/tabs based on order and user profile
    const order = fallbackStore.orders.get(orderId);

    if (user && order) {
      const isCustomer = order.customerId === user.uid;
      const isAdmin = user.isAdmin || activeMode === 'admin' || activeTab === 'admin_panel';
      const isAssignedHelper = order.helperId === user.uid;

      // Requirement 1: If someone else accepted the order, helper should never be able to see order details
      if (!isAdmin && !isCustomer && order.helperId && !isAssignedHelper) {
        showAlert(
          'অর্ডারটি ইতিমধ্যে গৃহীত হয়েছে',
          'দুঃখিত, এই অর্ডারটি ইতিমধ্যে অন্য একজন হেলপার গ্রহণ করেছেন। আপনি আর এই অর্ডারের বিবরণ দেখতে পারবেন না।',
          'warning'
        );
        return;
      }
    }

    setInitialSelectedOrderId(orderId);
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



  // Check for completed customer orders needing Coin Reward Celebration first, then Feedback
  useEffect(() => {
    if (!user || (activeMode as string) !== 'customer') {
      setCoinRewardOrder(null);
      setFeedbackOrder(null);
      return;
    }

    const checkDeliveredOrderPopups = () => {
      fallbackStore.reconcileCustomerCoins(user.uid);

      const userOrders = Array.from(fallbackStore.orders.values()).filter(
        (o) => o.customerId === user.uid && o.status === 'DELIVERED'
      );

      // 1. Check for uncelebrated delivered order first (Coin Reward Modal)
      const uncelebrated = userOrders.find((o) => {
        const coinSeen = typeof localStorage !== 'undefined' && localStorage.getItem(`coin_reward_seen_${o.id}`);
        if (coinSeen) return false;

        const completionTimeStr = o.deliveredAt || o.updatedAt || o.createdAt;
        if (!completionTimeStr) return false;
        try {
          const completionTime = new Date(completionTimeStr).getTime();
          const now = Date.now();
          const diffHours = (now - completionTime) / (1000 * 60 * 60);
          return diffHours >= 0 && diffHours <= 8;
        } catch (e) {
          return false;
        }
      });

      if (uncelebrated) {
        setCoinRewardOrder(uncelebrated);
        // Do not show feedback modal simultaneously; it will trigger immediately when coin reward modal closes
        setFeedbackOrder(null);
        return;
      }

      setCoinRewardOrder(null);

      // 2. Check for unrated delivered order (Feedback Modal)
      const unrated = userOrders.find((o) => {
        if (o.feedback) return false;
        const dismissed = typeof localStorage !== 'undefined' && localStorage.getItem(`feedback_dismissed_${o.id}`);
        if (dismissed) return false;

        const completionTimeStr = o.deliveredAt || o.updatedAt || o.createdAt;
        if (!completionTimeStr) return false;

        try {
          const completionTime = new Date(completionTimeStr).getTime();
          const now = Date.now();
          const diffHours = (now - completionTime) / (1000 * 60 * 60);
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

    checkDeliveredOrderPopups();
    const unsub = fallbackStore.subscribe(checkDeliveredOrderPopups);
    return () => unsub();
  }, [user, activeMode]);

  // Check for admin replies to customer's feedback (one-time, time-windowed)
  useEffect(() => {
    if (!user || (activeMode as string) !== 'customer') {
      setPendingReplyFeedback(null);
      return;
    }

    const checkPendingReplies = () => {
      const now = Date.now();
      const allFeedbacks = Array.from(fallbackStore.orderFeedbacks.values());
      const pending = allFeedbacks.find((fb) => {
        if (fb.customerId !== user.uid) return false;
        if (!fb.adminReply) return false;
        if (fb.adminReplyShownToCustomer) return false;
        // Check start time — if showFrom is set, must not show before that time
        if (fb.adminReplyShowFrom) {
          const from = new Date(fb.adminReplyShowFrom).getTime();
          if (now < from) return false;
        }
        // Check time window — if showUntil is set, must be in the future
        if (fb.adminReplyShowUntil) {
          const until = new Date(fb.adminReplyShowUntil).getTime();
          if (now > until) return false;
        }
        return true;
      });
      setPendingReplyFeedback(pending || null);
    };

    checkPendingReplies();
    const unsub = fallbackStore.subscribe(checkPendingReplies);
    return () => unsub();
  }, [user, activeMode]);



  // Native status bar color (emerald green matching the header)
  useEffect(() => {
    setNativeStatusBar('dark', '#059669');
  }, []);

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

  // Auto-register service worker & request push notification permission (only for Helper or Store on load)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          console.log('ServiceWorker registered:', reg.scope);
          reg.update().catch(() => { });
        })
        .catch((err) => console.warn('ServiceWorker registration note:', err));
    }

    if (user && (user.isHelper || user.isStoreApproved || user.role === 'store' || user.role === 'helper' || Boolean(user.storeId))) {
      const alreadyGranted = typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
      const alreadyAsked = typeof localStorage !== 'undefined' && localStorage.getItem('notification_permission_prompted') === 'true';

      if (!alreadyGranted && !alreadyAsked) {
        requestNativePushPermission().then((granted) => {
          if (!granted) {
            const p = fallbackStore.pricingSettings;
            showPermissionModal({
              permissionType: 'notification',
              title: p.notificationPermissionModalTitle || 'নোটিফিকেশন পারমিশন আবশ্যক (Notification Required)',
              message: p.notificationPermissionModalBody || 'জরুরি আপডেট ও অর্ডারের নোটিফিকেশন পাওয়ার জন্য নোটিফিকেশন পারমিশন দেওয়া আবশ্যক।',
              onAllow: async () => {
                const res = await requestNativePushPermission();
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem('notification_permission_prompted', 'true');
                }
                return res;
              },
              allowText: 'Allow Notification',
            }).then(() => {
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('notification_permission_prompted', 'true');
              }
            });
          } else {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('notification_permission_prompted', 'true');
            }
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Listen for orderId query parameter changes (e.g. from notification clicks) to redirect/open that order
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

  const isAdminView = Boolean(
    user && (user.isAdmin || user.role === 'admin' || activeMode === 'admin' || (user.email && (user.email.toLowerCase().includes('admin') || user.email === 'ajnasim72@gmail.com' || user.email === 'contact.jamanot@gmail.com')))
  );

  const isStoreUser = Boolean(
    user && (user.isStoreApproved || user.role === 'store' || Boolean(user.storeId) || activeMode === 'store')
  );

  const isHelperUser = Boolean(
    user && (user.isHelper || user.role === 'helper' || activeMode === 'helper')
  );

  // Sync activeTab when user or activeMode changes
  useEffect(() => {
    if (!user) {
      if (activeTab !== 'fee_details' && activeTab !== 'helper_center') {
        setActiveTab('request');
      }
      return;
    }

    if (isAdminView) {
      setActiveTab('admin_panel');
    } else if (isStoreUser) {
      if (activeTab !== 'wallet') {
        setActiveTab('request');
      }
    } else if (isHelperUser) {
      if (activeTab === 'request' || activeTab === 'admin_panel' || activeTab === 'helper_center') {
        setActiveTab('helper_tasks');
      }
    } else {
      if (activeTab !== 'fee_details' && activeTab !== 'helper_center') {
        setActiveTab('request');
      }
    }
  }, [user, activeMode, isAdminView, isStoreUser, isHelperUser]);

  // Strict role view guarding
  const renderCurrentView = () => {
    // 1. If not logged in, user can only see CustomerHome or public fee/help pages
    if (!user) {
      if (activeTab === 'fee_details') {
        return <FeeDetailsPage onBack={() => setActiveTab('request')} />;
      }
      if (activeTab === 'helper_center') {
        return <HelperCenterPage onBack={() => setActiveTab('request')} />;
      }
      return <CustomerHome />;
    }

    // 2. Admin view check: Admin type users ONLY see Admin Panel access
    if (isAdminView) {
      return (
        <AdminDashboard
          initialSelectedOrderId={initialSelectedOrderId}
          onClearInitialOrder={() => setInitialSelectedOrderId(null)}
        />
      );
    }

    // 3. Store view check: Store type users ONLY see Store views
    if (isStoreUser) {
      return <StoreDashboard activeTab={activeTab} setActiveTab={(tab) => setActiveTab(tab as any)} />;
    }

    // 4. Helper view check: Helper type users view Helper views
    if (isHelperUser) {
      if (activeTab === 'wallet') {
        return <HelperWallet />;
      }
      if (activeTab === 'explore') {
        return <ExploreHelperView />;
      }
      if (activeTab === 'fee_details') {
        return <FeeDetailsPage onBack={() => setActiveTab('helper_tasks')} />;
      }
      return (
        <HelperDashboard
          initialSelectedOrderId={initialSelectedOrderId}
          onClearInitialOrder={() => setInitialSelectedOrderId(null)}
        />
      );
    }

    // 5. Customer views
    if (activeTab === 'fee_details') {
      return <FeeDetailsPage onBack={() => setActiveTab('request')} />;
    }
    if (activeTab === 'helper_center') {
      return <HelperCenterPage onBack={() => setActiveTab('request')} />;
    }

    return (
      <CustomerHome
        initialSelectedOrderId={initialSelectedOrderId}
        onClearInitialOrder={() => setInitialSelectedOrderId(null)}
      />
    );
  };

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

      {/* Customer Coin Earning Celebration Modal (Triggered BEFORE Feedback) */}
      {coinRewardOrder && (
        <CoinRewardModal
          earnedCoins={coinRewardOrder.coinsAwarded || getCoinsForService(coinRewardOrder.service, fallbackStore.pricingSettings)}
          onClose={() => {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(`coin_reward_seen_${coinRewardOrder.id}`, 'true');
            }
            const finishedOrder = coinRewardOrder;
            setCoinRewardOrder(null);
            // Check if feedback is needed
            if (!finishedOrder.feedback) {
              setFeedbackOrder(finishedOrder);
            }
          }}
          onContinueToFeedback={() => {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(`coin_reward_seen_${coinRewardOrder.id}`, 'true');
            }
            const finishedOrder = coinRewardOrder;
            setCoinRewardOrder(null);
            // Immediately open feedback modal
            if (!finishedOrder.feedback) {
              setFeedbackOrder(finishedOrder);
            }
          }}
        />
      )}

      {/* Customer Order Delivery Feedback Modal */}
      {feedbackOrder && !coinRewardOrder && (
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

      {/* Admin Reply to Customer Feedback — one-time modal, time-windowed */}
      {pendingReplyFeedback && !feedbackOrder && !coinRewardOrder && (
        <FeedbackReplyModal
          feedback={pendingReplyFeedback}
          onClose={async () => {
            const fb = pendingReplyFeedback;
            setPendingReplyFeedback(null);
            await fallbackStore.markFeedbackReplyShown(fb.id);
          }}
        />
      )}

      {/* Dynamic Admin Custom Modal Injector */}
      <CustomModalInjector currentEvent="FIRST_VISIT" />

      {/* In-App Browser (Facebook/Messenger/Instagram) Detection & 1-Click Launch */}
      <InAppBrowserModal />

      {/* PWA Smart First-Visit Detection & Prompts */}
      <PwaSmartPrompt />
    </div>
  );
}
