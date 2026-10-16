import { Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';

/**
 * Checks if an order was created by a Store account.
 * Inspects order.creatorRole and user profile role in fallbackStore.
 * Note: order.isStoreOrder indicates if the order contains store catalog items,
 * NOT whether the creating user is a store-type user.
 */
export const isOrderFromStore = (order?: Order | null): boolean => {
  if (!order) return false;
  // If explicitly created by a non-store role (customer or helper), it is NOT from a store user
  if (order.creatorRole === 'customer' || order.creatorRole === 'helper') return false;
  // If explicitly created by a store role
  if (order.creatorRole === 'store') return true;
  // Fallback to checking customer/creator account role in fallbackStore
  if (order.customerId) {
    const cust = fallbackStore.users.get(order.customerId);
    if (cust) {
      if (cust.role === 'store' || cust.isStoreApproved || Boolean(cust.storeId)) {
        return true;
      }
      if (cust.role === 'customer' || cust.role === 'helper') {
        return false;
      }
    }
  }
  return false;
};

