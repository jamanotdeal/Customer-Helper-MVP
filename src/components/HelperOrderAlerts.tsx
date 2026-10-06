'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fallbackStore } from '@/lib/firebase';
import { helperOrderAlerts } from '@/lib/orderAlerts';
import { setOrderAlarm } from '@/lib/orderAlarm';
import { onOrderAlertCleared } from '@/lib/native';
import { isOrderOpen } from '@/lib/orderStatus';
import { acceptOrderAsHelper, isOrderAvailableToHelper, isOrderRoutedToHelperType } from '@/lib/helperOrders';
import { useModal } from './CustomModal';
import { NewOrderAlertOverlay } from './NewOrderAlertOverlay';
import { BlockedUserModal } from './BlockedUserModal';

/** Retry delay for an alerted order whose details couldn't be fetched. */
const REFETCH_DELAY_MS = 3000;

interface HelperOrderAlertsProps {
  /** Opens an order's detail screen in the helper dashboard. */
  onOpenOrder: (orderId: string) => void;
}

/**
 * The helper's incoming-order popup, mounted at the app root so it appears on
 * whatever screen is open — the Uber-style "new request" takeover.
 *
 * It decides which orders to announce, keeps each announcement exactly as long
 * as the order is open, and drives the alarm from the same list, so the sound
 * and the popup start and stop together:
 *
 *  - An order that newly becomes available to this helper is announced. What
 *    was already available when the app opened is the baseline, not news (the
 *    native layer alerted on those at the time).
 *  - The moment an announced order is taken, cancelled or deleted it is
 *    dropped, on this device's own order stream or on Java's native watch
 *    (onOrderAlertCleared) — whichever hears first.
 */
export const HelperOrderAlerts: React.FC<HelperOrderAlertsProps> = ({ onOpenOrder }) => {
  const { user, openAuthModal } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const alertIds = useSyncExternalStore(helperOrderAlerts.subscribe, helperOrderAlerts.getIds, helperOrderAlerts.getIds);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  // Re-renders the popup when order details change underneath it.
  const [, setStoreVersion] = useState(0);

  const userRef = useRef(user);
  userRef.current = user;

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;

    let disposed = false;
    let baselined = false;
    const everAvailable = new Set<string>();
    // Alerted orders we have seen in the cache at least once. Leaving the cache
    // after that means they left the pending stream: someone took them.
    const seenLoaded = new Set<string>();
    const fetching = new Set<string>();
    const retryTimers = new Set<ReturnType<typeof setTimeout>>();

    const fetchAlerted = (orderId: string) => {
      if (fetching.has(orderId)) return;
      fetching.add(orderId);
      fallbackStore
        .getOrderFromServer(orderId)
        .then((order) => {
          if (!order && !disposed) helperOrderAlerts.remove(orderId, 'not on server');
        })
        .catch(() => {
          // Offline or a stale connection: say nothing about the order yet,
          // just try again shortly.
          const t = setTimeout(() => {
            retryTimers.delete(t);
            evaluate();
          }, REFETCH_DELAY_MS);
          retryTimers.add(t);
        })
        .finally(() => fetching.delete(orderId));
    };

    function evaluate() {
      if (disposed) return;
      const u = userRef.current;
      if (!u) return;
      setStoreVersion((v) => v + 1);

      for (const id of helperOrderAlerts.getIds()) {
        const order = fallbackStore.orders.get(id);
        if (order) {
          seenLoaded.add(id);
          // Taken, cancelled, or routed away from this helper's type.
          if (!isOrderOpen(order)) helperOrderAlerts.remove(id, `not open (${order.status})`);
          else if (!isOrderRoutedToHelperType(order, u)) helperOrderAlerts.remove(id, 'not routed to this helper type');
        } else if (seenLoaded.has(id)) {
          helperOrderAlerts.remove(id, 'left the cache');
        } else {
          fetchAlerted(id);
        }
      }

      if (u.isBlocked) {
        helperOrderAlerts.clear('helper is blocked');
        return;
      }

      const available: string[] = [];
      fallbackStore.orders.forEach((o) => {
        if (isOrderAvailableToHelper(o, u)) available.push(o.id);
      });

      if (!baselined) {
        // Wait for the server's answer before taking the baseline: the cache
        // alone is whatever was saved at the last launch, and baselining on
        // it would announce everything that arrived in between.
        if (!fallbackStore.isPendingOrdersPrimed()) return;
        baselined = true;
        available.forEach((id) => everAvailable.add(id));
        return;
      }

      available.forEach((id) => {
        if (everAvailable.has(id)) return;
        everAvailable.add(id);
        helperOrderAlerts.raise(id);
      });
    }

    // The notification stream can announce an order before the order stream
    // delivers it; fetch it so it is evaluated now rather than whenever the
    // order stream catches up.
    const onNewOrderHint = (e: Event) => {
      const orderId = (e as CustomEvent).detail?.orderId;
      if (!orderId) return;
      if (fallbackStore.orders.has(orderId)) {
        evaluate();
        return;
      }
      fallbackStore.getOrder(orderId).finally(evaluate);
    };

    evaluate();
    const unsubscribeStore = fallbackStore.subscribe(evaluate);
    const unsubscribeCleared = onOrderAlertCleared((orderId) => helperOrderAlerts.remove(orderId, 'cleared by native'));
    window.addEventListener('new-order-received', onNewOrderHint);

    return () => {
      disposed = true;
      unsubscribeStore();
      unsubscribeCleared();
      window.removeEventListener('new-order-received', onNewOrderHint);
      retryTimers.forEach(clearTimeout);
      // Leaving helper mode (or signing out): nothing here is answerable now.
      helperOrderAlerts.clear('left helper mode');
    };
  }, [uid]);

  // The alarm follows the popup exactly.
  useEffect(() => {
    setOrderAlarm(alertIds);
  }, [alertIds]);
  useEffect(() => () => setOrderAlarm([]), []);

  const handleAccept = async (orderId: string) => {
    helperOrderAlerts.remove(orderId, 'accepted');
    const outcome = await acceptOrderAsHelper(orderId, userRef.current, {
      showAlert,
      showConfirm,
      openAuthModal,
      onBlocked: () => setShowBlockedModal(true),
    });
    if (outcome === 'accepted') onOpenOrder(orderId);
  };

  return (
    <>
      {alertIds.length > 0 && (
        <NewOrderAlertOverlay
          orderIds={alertIds}
          onAccept={handleAccept}
          onView={(orderId) => {
            helperOrderAlerts.remove(orderId, 'viewed');
            onOpenOrder(orderId);
          }}
          onDismissOne={(orderId) => helperOrderAlerts.remove(orderId, 'dismissed')}
          onDismissAll={() => helperOrderAlerts.clear('muted')}
        />
      )}
      {showBlockedModal && (
        <BlockedUserModal onClose={() => setShowBlockedModal(false)} targetRole="helper" />
      )}
    </>
  );
};
