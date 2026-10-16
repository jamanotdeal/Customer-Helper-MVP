'use client';

import { Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { isOrderTimingOpen } from '@/lib/pricing';

const STORAGE_KEY = 'scheduled_customer_orders_v1';

/**
 * Retrieve all locally scheduled orders (optionally filtered by customer UID).
 */
export function getScheduledOrders(customerId?: string): Order[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: Order[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    if (customerId) {
      return list.filter((o) => o.customerId === customerId);
    }
    return list;
  } catch (e) {
    console.error('[scheduledOrders] Error reading scheduled orders:', e);
    return [];
  }
}

/**
 * Save an order to localhost scheduled queue.
 */
export function saveScheduledOrder(order: Order): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getScheduledOrders();
    const updated = [order, ...list.filter((o) => o.id !== order.id)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('scheduled_orders_changed'));
  } catch (e) {
    console.error('[scheduledOrders] Error saving scheduled order:', e);
  }
}

/**
 * Remove an order from localhost scheduled queue (e.g. upon dispatch or customer cancellation).
 */
export function removeScheduledOrder(orderId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getScheduledOrders();
    const updated = list.filter((o) => o.id !== orderId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('scheduled_orders_changed'));
  } catch (e) {
    console.error('[scheduledOrders] Error removing scheduled order:', e);
  }
}

/**
 * Check if service is currently open; if open, dispatches all queued local orders to the server.
 * Returns the count of dispatched orders.
 */
export async function processAndDispatchScheduledOrders(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const timing = isOrderTimingOpen(fallbackStore.pricingSettings);
  if (!timing.isOpen) return 0;

  const orders = getScheduledOrders();
  if (orders.length === 0) return 0;

  let dispatchedCount = 0;
  for (const ord of orders) {
    try {
      const now = new Date().toISOString();
      const updatedOrder: Order = {
        ...ord,
        status: 'PENDING',
        isScheduled: false,
        createdAt: now,
        updatedAt: now,
        statusHistory: [
          ...(ord.statusHistory || []),
          {
            id: `sh-scheduled-dispatched-${Date.now()}`,
            status: 'PENDING',
            timestamp: now,
            actor: 'System',
            note: 'সার্ভিস সময় শুরু হওয়ায় শিডিউল করা রিকোয়েস্টটি সার্ভারে পাঠানো হয়েছে',
          },
        ],
      };

      await fallbackStore.addOrder(updatedOrder);
      removeScheduledOrder(ord.id);
      dispatchedCount++;
    } catch (err) {
      console.error('[scheduledOrders] Failed to dispatch scheduled order:', ord.id, err);
    }
  }

  if (dispatchedCount > 0) {
    window.dispatchEvent(
      new CustomEvent('scheduled_orders_dispatched', {
        detail: { count: dispatchedCount },
      })
    );
  }

  return dispatchedCount;
}
