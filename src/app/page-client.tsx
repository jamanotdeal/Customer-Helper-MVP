'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AppHeader } from '@/components/AppHeader';
import { AppSplash, whenSplashArtReady } from '@/components/AppSplash';
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
  getActiveNativeOrderAlerts,
  dismissNativeOrderAlarm,
  type NativeOrderAlert,
  onPullToRefresh,
  finishRefresh,
  setPullToRefreshEnabled,
} from '@/lib/native';
import { fallbackStore } from '@/lib/firebase';
import { subscribeAppVisibility } from '@/lib/appVisibility';
import { helperOrderAlerts } from '@/lib/orderAlerts';
import { isOrderOpen, isShopOrderAwaitingStore } from '@/lib/orderStatus';
import { acceptOrderAsHelper } from '@/lib/helperOrders';
import { useModal } from '@/components/CustomModal';
import { getReadiness, requestStep, openSettings, STEP_COPY, type PermissionStep } from '@/lib/permissions';

import { Order, OrderFeedback } from '@/types';
import { OrderFeedbackModal } from '@/components/OrderFeedbackModal';
import { FeedbackReplyModal } from '@/components/FeedbackReplyModal';
import { CoinRewardModal } from '@/components/CoinRewardModal';
import { getCoinsForService } from '@/lib/pricing';
import { CustomModalInjector } from '@/components/CustomModalInjector';

import { HelperCenterPage } from '@/components/HelperCenterPage';
import { HelperOrderAlerts } from '@/components/HelperOrderAlerts';
import { FeeDetailsPage } from '@/components/FeeDetailsPage';
import { StoreDashboard } from '@/components/StoreDashboard';
import { PwaSmartPrompt } from '@/components/PwaSmartPrompt';
import { InAppBrowserModal } from '@/components/InAppBrowserModal';
import { BlockedUserModal } from '@/components/BlockedUserModal';
import { CustomerOrdersPage } from '@/components/CustomerOrdersPage';
import { StoreProductManager } from '@/components/StoreProductManager';
import { StoreWallet } from '@/components/StoreWallet';
import { CartSummaryDrawer } from '@/components/CartSummaryDrawer';
import { FloatingCartBar } from '@/components/FloatingCartBar';
import { MissingItemFloatingButton } from '@/components/MissingItemFloatingButton';
import { CustomRequestModal } from '@/components/CustomRequestModal';
import { processAndDispatchScheduledOrders } from '@/utils/scheduledOrders';
import { StorePickerModal } from '@/components/StorePickerModal';

export default function PageClient() {
  const { user, loading, activeMode, setActiveMode, openAuthModal, showStorePicker, setShowStorePicker } = useAuth();
  const { showAlert, showConfirm, showPermissionModal } = useModal();
  const [activeTab, setActiveTab] = useState<'request' | 'my_orders' | 'helper_tasks' | 'wallet' | 'admin_panel' | 'explore' | 'helper_center' | 'fee_details' | 'store_products'>('request');
  const [customerHomeResetTrigger, setCustomerHomeResetTrigger] = useState(0);
  const [showGlobalCustomRequestModal, setShowGlobalCustomRequestModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [coinRewardOrder, setCoinRewardOrder] = useState<Order | null>(null);
  const [feedbackOrder, setFeedbackOrder] = useState<Order | null>(null);
  const [pendingReplyFeedback, setPendingReplyFeedback] = useState<OrderFeedback | null>(null);
  const [initialSelectedOrderId, setInitialSelectedOrderId] = useState<string | null>(null);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [hasPromptedBlockedUser, setHasPromptedBlockedUser] = useState(false);

  const isAdminView = Boolean(
    user && (user.isAdmin || user.role === 'admin' || activeMode === 'admin' || (user.email && (user.email.toLowerCase().includes('admin') || user.email === 'ajnasim72@gmail.com' || user.email === 'contact.jamanot@gmail.com')))
  );

  const isStoreUser = Boolean(
    user && (
      user.isStoreApproved ||
      user.role === 'store' ||
      user.isStore ||
      Boolean(user.storeId) ||
      activeMode === 'store'
    )
  );

  const isHelperUser = Boolean(
    user && (user.isHelper || user.role === 'helper' || activeMode === 'helper') && !isStoreUser
  );

  // Helpers get the new-order popup (HelperOrderAlerts) on every screen.
  const showsHelperAlerts = Boolean(user && isHelperUser && !isStoreUser && !isAdminView);

  useEffect(() => {
    if (user?.isBlocked && !hasPromptedBlockedUser) {
      setShowBlockedModal(true);
      setHasPromptedBlockedUser(true);
    }
  }, [user?.isBlocked, hasPromptedBlockedUser]);

  // An order change that was refused because the order had moved on (or been
  // deleted) since this device last saw it. The store has already put the
  // screen back to the real state; this says why the tap did nothing.
  useEffect(() => {
    return fallbackStore.onOrderWriteIssue((issue) => {
      if (issue === 'missing') {
        showAlert('অর্ডারটি আর নেই', 'এই অর্ডারটি মুছে ফেলা হয়েছে, তাই পরিবর্তনটি সংরক্ষণ করা যায়নি।', 'warning');
      } else {
        showAlert(
          'অর্ডারটি পরিবর্তিত হয়েছে',
          'আপনি শেষবার দেখার পর এই অর্ডারের অবস্থা বদলে গেছে, তাই আপনার পরিবর্তনটি প্রয়োগ করা হয়নি। সর্বশেষ অবস্থা দেখে প্রয়োজনে আবার চেষ্টা করুন।',
          'warning'
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-mark all notifications as read when a customer visits or refreshes the page.
  // This clears the red badge on the bell without requiring the user to open the drawer.
  // Only applies in customer mode (not helper / store / admin).
  useEffect(() => {
    if (!user) return;
    const isCustomerMode =
      !user.isAdmin &&
      user.role !== 'admin' &&
      !user.isHelper &&
      user.role !== 'helper' &&
      !user.isStore &&
      !user.isStoreApproved &&
      !user.storeId &&
      user.role !== 'store' &&
      (activeMode === 'customer' || !activeMode);
    if (isCustomerMode) {
      // Fire-and-forget: silently mark as read in background
      fallbackStore.markNotificationsRead(user.uid).catch(() => {/* ignore */});
    }
  }, [user?.uid, activeMode]);

  // Capture referral ref from URL if visited via a referral link
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      const phone = params.get('phone');
      if (ref) {
        localStorage.setItem(
          'jamanot_pending_referral',
          JSON.stringify({
            referrerId: ref,
            phone: phone || '',
            createdAt: Date.now(),
          })
        );
      }
    } catch {
      // ignore
    }
  }, []);

  // Auto-dispatch locally queued scheduled orders when service time opens
  useEffect(() => {
    const tryDispatch = async () => {
      try {
        const dispatched = await processAndDispatchScheduledOrders();
        if (dispatched > 0) {
          showAlert(
            `${dispatched}টি শিডিউল রিকোয়েস্ট পাঠানো হয়েছে!`,
            'সার্ভিস সময় শুরু হওয়ায় আপনার আগে করা শিডিউল রিকোয়েস্টগুলো হেলপারদের কাছে পাঠানো হয়েছে।',
            'success'
          );
        }
      } catch (e) {
        console.warn('[PageClient] Failed to dispatch scheduled orders:', e);
      }
    };

    if (user) {
      tryDispatch();
      const interval = setInterval(tryDispatch, 60000);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const handleSelectOrder = async (orderId: string) => {
    if (!orderId) return;

    // Switch view modes/tabs based on order and user profile
    let order = fallbackStore.orders.get(orderId);
    if (!order) {
      order = await fallbackStore.getOrder(orderId);
    }

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

      // An order a helper can still take opens as the new-order popup, from
      // any screen, rather than as a page.
      if (showsHelperAlerts && !isCustomer && !user.isBlocked && isOrderOpen(order)) {
        helperOrderAlerts.raise(orderId, { force: true });
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
      } else if (user.isHelper) {
        // Fallback: If order details could not be resolved yet but the user is a helper,
        // switch to helper view so HelperDashboard can load/resolve the initial order
        setActiveTab('helper_tasks');
        setActiveMode('helper');
      }
    }
  };

  /** Opens an order in the helper dashboard — the popup's View, or after Accept. */
  const openHelperOrder = (orderId: string) => {
    setInitialSelectedOrderId(orderId);
    setActiveTab('helper_tasks');
    if (activeMode !== 'helper') setActiveMode('helper');
  };

  /**
   * Where a native order alert lands. Java sends the order (or a store's shop
   * orders) with it, so it is cached first and the popup renders at once.
   *
   * @param opts.adopt the alert was already outstanding in Java when the app
   *   came forward (see getActiveNativeOrderAlerts). Show it if it can still
   *   be answered, otherwise silence it — never navigate on its behalf.
   */
  const routeNativeOrderAlert = async (alert: NativeOrderAlert, opts: { adopt?: boolean } = {}) => {
    const { orderId } = alert;
    if (alert.order) fallbackStore.ingestOrder(alert.order);
    if (alert.shopOrders) fallbackStore.ingestShopOrders(alert.shopOrders);
    if (!user) return;

    if (showsHelperAlerts && alert.action === 'accept') {
      // Accept was tapped on the card over other apps: claim it now, without
      // a second confirmation, and land on the order. The transaction decides
      // whether it is still available — it may have gone while the app booted.
      helperOrderAlerts.remove(orderId, 'accepted from the card');
      if (!fallbackStore.orders.has(orderId)) await fallbackStore.getOrder(orderId);
      const outcome = await acceptOrderAsHelper(
        orderId,
        user,
        { showAlert, showConfirm, openAuthModal, onBlocked: () => setShowBlockedModal(true) },
        'Accepted from order alert',
        { skipConfirm: true }
      );
      if (outcome === 'accepted') openHelperOrder(orderId);
      return;
    }

    if (showsHelperAlerts) {
      const order = fallbackStore.orders.get(orderId) || (await fallbackStore.getOrder(orderId));
      if (!order) {
        // Couldn't load it. An alert Java is ringing for still gets its popup
        // (a loading card, which HelperOrderAlerts fills in or retires once the
        // server answers); a plain tap falls through to the normal navigation.
        if (opts.adopt) helperOrderAlerts.raise(orderId, { force: true });
        else handleSelectOrder(orderId);
        return;
      }
      if (isOrderOpen(order) && order.customerId !== user.uid && !user.isBlocked) {
        helperOrderAlerts.raise(orderId, { force: true });
        return;
      }
      // Nothing left to answer — make sure nothing keeps ringing for it.
      dismissNativeOrderAlarm(orderId);
      if (!opts.adopt) handleSelectOrder(orderId);
      return;
    }

    if (isStoreUser) {
      const mine = Array.from(fallbackStore.shopOrders.values()).filter((so) => so.parentOrderId === orderId);
      if (mine.some(isShopOrderAwaitingStore)) {
        // StoreDashboard raises its popup for a pending shop order — directly,
        // without handleSelectOrder's fetch of the parent order in between.
        setInitialSelectedOrderId(orderId);
        return;
      }
      if (opts.adopt) {
        // Answered already: silence it. Unknown here: leave it to Java's watch.
        if (mine.length > 0) dismissNativeOrderAlarm(orderId);
        return;
      }
    }

    if (!opts.adopt) handleSelectOrder(orderId);
  };



  // Check for completed customer orders needing Coin Reward Celebration first, then Feedback
  useEffect(() => {
    if (!user || (activeMode as string) !== 'customer') {
      setCoinRewardOrder(null);
      setFeedbackOrder(null);
      return;
    }

    const checkDeliveredOrderPopups = () => {
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
          return diffHours >= 0 && diffHours <= 72;
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



  // Status bar: white ground with dark icons, matching AppHeader's bg-white/95.
  // Also what keeps the white splash from seaming into a coloured bar.
  useEffect(() => {
    setNativeStatusBar('dark', '#ffffff');
  }, []);

  // Release the native splash as soon as the page can stand in for it: AppSplash
  // (the same art, in the same place) with its image decoded, or the app itself
  // if auth had already resolved. Not waiting for the image is what showed a
  // white screen, then the slogan without the logo, between the two splashes.
  useEffect(() => {
    whenSplashArtReady().then(hideNativeSplash);
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

  // Walk the signed-in helper/store user through any missing permissions (see runPermissionLadder).
  // Customer role accounts and customer mode must never be prompted with the helper/store permission ladder.
  useEffect(() => {
    if (!user) return;
    const isCustomerAccount =
      user.role === 'customer' ||
      (!user.isHelper && !user.isStoreApproved && !user.isStore && !user.isAdmin && user.role !== 'helper' && user.role !== 'store' && user.role !== 'admin');

    if (isCustomerAccount || activeMode === 'customer') {
      return;
    }

    runPermissionLadder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeMode]);

  // Sequentially prompts every missing permission via popup. Required steps
  // (notifications, location) loop until granted; optional steps ask once and
  // remember the dismissal so the user isn't nagged on every launch.
  // Note: Only intended for Helpers and Stores on duty who receive incoming order alerts.
  const runPermissionLadder = async () => {
    if (!user) return;

    const isCustomerAccount =
      user.role === 'customer' ||
      (!user.isHelper && !user.isStoreApproved && !user.isStore && !user.isAdmin && user.role !== 'helper' && user.role !== 'store' && user.role !== 'admin');

    const isHelperOrStore = Boolean(
      (user.isHelper || user.role === 'helper' || activeMode === 'helper') ||
      (user.isStoreApproved || user.role === 'store' || Boolean(user.storeId) || activeMode === 'store')
    );

    if (isCustomerAccount || activeMode === 'customer' || !isHelperOrStore) {
      return;
    }

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
    // Battery optimization is intentionally omitted — it confused users more than
    // it helped, and reliability without it is acceptable on non-aggressive OEMs.
    const OPTIONAL: PermissionStep[] = ['overlay', 'autostart'];
    const skipKey = (step: PermissionStep) => `permission_skipped_${step}`;

    // Overlay is what lets a new order bring the app to the foreground, so one
    // dismissal should not disable that for good — a user who taps away the
    // first time is usually not refusing forever. It re-asks on later launches
    // up to this many dismissals, then stops nagging. Every other optional step
    // keeps the original ask-once behaviour.
    const MAX_OVERLAY_ASKS = 3;
    const dismissKey = (step: PermissionStep) => `permission_dismissals_${step}`;

    const shouldAsk = (step: PermissionStep) => {
      if (typeof localStorage === 'undefined') return true;
      if (step !== 'overlay') return localStorage.getItem(skipKey(step)) !== 'true';
      return Number(localStorage.getItem(dismissKey(step)) || 0) < MAX_OVERLAY_ASKS;
    };

    const recordDismissal = (step: PermissionStep) => {
      if (typeof localStorage === 'undefined') return;
      if (step !== 'overlay') {
        localStorage.setItem(skipKey(step), 'true');
        return;
      }
      const n = Number(localStorage.getItem(dismissKey(step)) || 0);
      localStorage.setItem(dismissKey(step), String(n + 1));
    };
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
      if (!shouldAsk(step)) continue;

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

      if (!accepted) recordDismissal(step);
    }
  };

  // ─── Native order alerts ──────────────────────────────────────────────────
  // Subscribed once, through a ref. It used to re-subscribe on every user, mode
  // and tab change, and Capacitor drops an event that arrives while no
  // listener is attached — an alert landing in one of those gaps was lost.
  const routeNativeOrderAlertRef = useRef(routeNativeOrderAlert);
  routeNativeOrderAlertRef.current = routeNativeOrderAlert;
  const alertsReadyRef = useRef(false);
  alertsReadyRef.current = !loading && Boolean(user);
  const hasBootedRef = useRef(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    return onOrderAlert((alert) => {
      // Before sign-in has resolved there is nowhere to show it; Java parked a
      // copy (PendingAlerts) and keeps outstanding alerts, and both are picked
      // up by the catch-up below once the user is known.
      if (!alertsReadyRef.current) return;
      // Delivered live, so the copy Java parked for a cold start is spent —
      // left in place it would re-open this order on a later catch-up.
      consumePendingOrderAlert().catch(() => {});
      routeNativeOrderAlertRef.current(alert).catch(() => {});
    });
  }, []);

  // Two catch-up routes once the user is known, because events can arrive
  // before anything is listening:
  //  - cold start: Java launched the app before React mounted and parked the
  //    alert in PendingAlerts;
  //  - every return to the foreground: Java may be alerting on orders this
  //    WebView never heard about (it was asleep). Adopting them is what keeps
  //    the popup and the sound together — each one either gets its popup or is
  //    silenced, so nothing rings over an empty screen.
  useEffect(() => {
    if (!isNativeApp() || loading || !user?.uid) return;
    const adopt = () => {
      getActiveNativeOrderAlerts()
        .then((alerts) =>
          alerts.forEach((a) => routeNativeOrderAlertRef.current(a, { adopt: true }).catch(() => {}))
        )
        .catch(() => {});
    };

    consumePendingOrderAlert()
      .then((alert) => (alert ? routeNativeOrderAlertRef.current(alert) : undefined))
      .catch(() => {})
      .finally(adopt);

    return subscribeAppVisibility((visible) => {
      if (visible) adopt();
    });
  }, [loading, user?.uid, showsHelperAlerts, isStoreUser]);

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
          // Reconnect, don't re-subscribe. Tearing every listener down and
          // starting them again re-read the whole session (server addresses,
          // order lists, notifications — about 1,400 reads for a helper) on
          // each pull, and pulling is a habit. Cycling the connection makes
          // every listener re-sync with the server just the same, which is
          // what un-wedges a stale app, for the documents that changed.
          if (fallbackStore.isListeningAs(role, user.uid)) {
            fallbackStore.reconnectAfterBackground();
            fallbackStore.retryShopOrderOutbox();
          } else {
            fallbackStore.initListenersForRole(role, user.uid, user.helperType, user.storeId);
          }
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

  // Auto-switch away from store mode if user lost store access
  useEffect(() => {
    if (user && activeMode === 'store' && !isStoreUser) {
      setActiveMode('customer');
    }
  }, [user, activeMode, isStoreUser, setActiveMode]);

  const prevModeRef = useRef<string | undefined>(undefined);
  const prevUidRef = useRef<string | undefined>(undefined);

  // Sync initial default activeTab ONLY when activeMode or logged-in user session actually changes
  useEffect(() => {
    const isNewUser = prevUidRef.current !== user?.uid;
    const isNewMode = prevModeRef.current !== activeMode;
    prevUidRef.current = user?.uid;
    prevModeRef.current = activeMode;

    if (!isNewUser && !isNewMode) {
      // User profile background update / re-render: do NOT reset or override activeTab
      return;
    }

    if (!user) {
      setInitialSelectedOrderId(null);
      setActiveTab('request');
      return;
    }

    if (isAdminView) {
      setActiveTab('admin_panel');
    } else if (isStoreUser) {
      // When switching to store mode, set initial tab to request/orders
      setActiveTab('request');
    } else if (isHelperUser) {
      setActiveTab('helper_tasks');
    } else {
      setActiveTab('request');
    }
  }, [user?.uid, activeMode, isAdminView, isStoreUser, isHelperUser]);

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
      return (
        <StoreDashboard
          activeTab={activeTab}
          setActiveTab={(tab) => setActiveTab(tab as any)}
          initialSelectedOrderId={initialSelectedOrderId}
          onClearInitialOrder={() => setInitialSelectedOrderId(null)}
        />
      );
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
    if (activeTab === 'my_orders') {
      return (
        <CustomerOrdersPage
          initialSelectedOrderId={initialSelectedOrderId}
          onClearInitialOrder={() => setInitialSelectedOrderId(null)}
        />
      );
    }

    return (
      <CustomerHome
        initialSelectedOrderId={initialSelectedOrderId}
        onClearInitialOrder={() => setInitialSelectedOrderId(null)}
        resetTrigger={customerHomeResetTrigger}
      />
    );
  };

  // Splash for the cold start only, until auth first resolves. `loading` also
  // goes true during sign-in, and the app (with the auth modal and its own
  // progress and error states) has to stay on screen for that.
  if (!loading) hasBootedRef.current = true;
  if (!hasBootedRef.current) return <AppSplash />;

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
          onHomeClick={() => {
            // When Home is tapped from any tab, reset back to top-level home
            setActiveTab('request');
            setCustomerHomeResetTrigger((prev) => prev + 1);
          }}
        />
      )}

      {/* Global Missing Item Floating Button (visible even when logged out for customers) */}
      {!isAdminView && (
        <MissingItemFloatingButton
          onOpenCustomRequest={() => {
            setShowGlobalCustomRequestModal(true);
          }}
        />
      )}

      {/* Helper new-order popup — rendered here so it appears on every screen */}
      {showsHelperAlerts && <HelperOrderAlerts onOpenOrder={openHelperOrder} />}

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
              localStorage.setItem(`feedback_dismissed_${coinRewardOrder.id}`, 'true');
            }
            setCoinRewardOrder(null);
            setFeedbackOrder(null);
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
      {!isNativeApp() && <InAppBrowserModal />}

      {/* PWA Smart First-Visit Detection & Prompts */}
      {!isNativeApp() && <PwaSmartPrompt />}

      {/* Blocked User Notice Modal */}
      {showBlockedModal && (
        <BlockedUserModal
          onClose={() => setShowBlockedModal(false)}
          targetRole={activeMode === 'helper' ? 'helper' : activeMode === 'store' ? 'store' : 'customer'}
        />
      )}

      {/* Persistent Floating Cart Bar (identical design across all customer views) */}
      <FloatingCartBar />

      {/* Global Cart Summary Drawer */}
      <CartSummaryDrawer
        onOrderCreated={(order) => {
          handleSelectOrder(order.id);
        }}
      />

      {/* Global Custom Request Modal (triggered from MissingItemFloatingButton on any page) */}
      <CustomRequestModal
        isOpen={showGlobalCustomRequestModal}
        onClose={() => setShowGlobalCustomRequestModal(false)}
        onOrderCreated={(order) => {
          setShowGlobalCustomRequestModal(false);
          handleSelectOrder(order.id);
        }}
      />

      {/* Multi-Store Picker Modal — shown on login when user has access to multiple stores */}
      {showStorePicker && (
        <StorePickerModal onClose={() => setShowStorePicker(false)} />
      )}
    </div>
  );
}
