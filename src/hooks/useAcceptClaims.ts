import { useSyncExternalStore } from 'react';
import { acceptClaims } from '@/lib/helperOrders';

/** Orders this device is claiming right now (see acceptOrderAsHelper). */
export function useAcceptClaims(): string[] {
  return useSyncExternalStore(acceptClaims.subscribe, acceptClaims.getIds, acceptClaims.getIds);
}

/** Whether this order's claim is on its way to the server. */
export function useIsAccepting(orderId: string | undefined | null): boolean {
  const ids = useAcceptClaims();
  return !!orderId && ids.includes(orderId);
}
