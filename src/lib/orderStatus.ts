import type { Order, ShopOrder } from '@/types';

/**
 * Whether an order can still be taken by a helper: PENDING, nobody on it, and
 * no approved cancellation.
 *
 * This is the single definition of "still up for grabs". The alert popup, the
 * accept transaction and the native alarm (OrderMatcher.isOrderOpen in Java)
 * all ask exactly this, so the popup, the sound and the accept button can never
 * disagree about whether an order is gone.
 *
 * Kept free of imports beyond types so firebase.ts can use it without a cycle.
 */
export function isOrderOpen(order?: Partial<Order> | null): boolean {
  if (!order) return false;
  if (order.status !== 'PENDING') return false;
  if (typeof order.helperId === 'string' && order.helperId.trim() !== '') return false;
  if (order.cancellationRequest?.status === 'APPROVED') return false;
  return true;
}

/** Whether a store still has to answer this shop order (pending and not yet opened). */
export function isShopOrderAwaitingStore(shopOrder?: Partial<ShopOrder> | null): boolean {
  return Boolean(shopOrder && shopOrder.status === 'PENDING' && !shopOrder.viewedByStore);
}
