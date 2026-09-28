import { Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';

/**
 * Checks if an order was created by a Store account.
 * Inspects order.isStoreOrder, order.creatorRole, and user profile role in fallbackStore.
 */
export const isOrderFromStore = (order?: Order | null): boolean => {
  if (!order) return false;
  if (order.isStoreOrder === true) return true;
  if (order.creatorRole === 'store') return true;
  if (order.customerId) {
    const cust = fallbackStore.users.get(order.customerId);
    if (cust && (cust.role === 'store' || cust.isStoreApproved || Boolean(cust.storeId))) {
      return true;
    }
  }
  return false;
};
