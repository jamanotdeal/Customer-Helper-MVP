import type { Order, UserProfile } from '@/types';
import { fallbackStore } from './firebase';
import { isHelperWithinOrderRadius } from './pricing';
import { isHelperEligibleForOrder } from './geofenceUtils';
import { isOrderOpen } from './orderStatus';

const ACTIVE_STATUSES = ['ACCEPTED', 'PURCHASED_EXECUTED', 'ON_THE_WAY', 'ARRIVED'];

/**
 * Whether a helper should be offered this order: it is still open, and it
 * passes the admin's helper-type rule, the commuter/dedicated routing rule, the
 * dispatch radius and the delivery-area geofence.
 *
 * The New list and the new-order alert both use this, so a helper is alerted
 * to exactly the orders they can see in the list.
 */
export function isOrderAvailableToHelper(o: Order, user: UserProfile): boolean {
  if (!isOrderOpen(o)) return false;
  if (!isOrderRoutedToHelperType(o, user)) return false;
  const settings = fallbackStore.pricingSettings;

  if (!isHelperWithinOrderRadius(user.helperLocation, o, settings.helperRadiusKm || 3.5)) return false;

  if (settings.allowedDeliveryAreas && settings.allowedDeliveryAreas.length > 0) {
    if (!isHelperEligibleForOrder(user, o, settings.allowedDeliveryAreas, settings.allowedDeliveryAreasEnabled)) {
      return false;
    }
  }
  return true;
}

/**
 * The admin's helper-type and receiver rules. Unlike radius, these change over
 * an order's life: under commuter_first an order is routed to dedicated riders
 * after a delay and is withdrawn from commuters at that moment — an alert a
 * commuter still has open for it is stale from then on.
 */
export function isOrderRoutedToHelperType(o: Order, user: UserProfile): boolean {
  const settings = fallbackStore.pricingSettings;
  const isDedicatedHelper = user.helperType === 'dedicated';

  const allowedTypes = settings.allowedHelperTypes || 'both';
  if (allowedTypes === 'dedicated_only' && !isDedicatedHelper) return false;
  if (allowedTypes === 'commuters_only' && isDedicatedHelper) return false;

  // Under commuter_first a dedicated rider sees an order only once it has
  // been routed to them, and a commuter only until then.
  //
  // Under dedicated_first dedicated riders are the ones announced to, and
  // nothing ever takes an order away from them, so routedToDedicated must not
  // hide it. It used to (as the "mirror image" of commuter_first), but the
  // push function stamps routedToDedicated on every order the moment its
  // all-dedicated-helpers announcement goes out (suppressDuplicateDedicated in
  // functions/index.js) — so every new order was withdrawn from the very
  // riders it was announced to: the alarm rang, the popup opened and closed a
  // second later, and the order never showed in their New list.
  const receiverRule = settings.orderReceiverRule || 'commuter_first';
  if (receiverRule === 'commuter_first') {
    if (isDedicatedHelper ? !o.routedToDedicated : o.routedToDedicated) return false;
  } else if (receiverRule === 'dedicated_first') {
    if (!isDedicatedHelper && !o.routedToDedicated) return false;
  }
  return true;
}

/** Orders this helper is currently running. */
export function countActiveOrdersForHelper(uid: string): number {
  let n = 0;
  fallbackStore.orders.forEach((o) => {
    if (o.helperId === uid && ACTIVE_STATUSES.includes(o.status) && o.cancellationRequest?.status !== 'APPROVED') n++;
  });
  return n;
}

export type AcceptOutcome = 'accepted' | 'taken' | 'declined' | 'limit' | 'blocked' | 'unauthenticated' | 'failed';

export interface AcceptOrderUi {
  showAlert: (title: string, message: string, type?: 'info' | 'success' | 'warning' | 'error') => Promise<void>;
  showConfirm: (title: string, message: string, confirmText?: string, cancelText?: string) => Promise<boolean>;
  openAuthModal: () => void;
  onBlocked: () => void;
}

const TAKEN_TITLE = 'দুঃখিত!';
const TAKEN_MESSAGE =
  'এই অর্ডারটি ইতিমধ্যে অন্য কোনো হেলপার গ্রহণ করেছেন অথবা এডমিন কর্তৃক অন্য কাউকে অ্যাসাইন করা হয়েছে।';

// ─── Claims in flight ────────────────────────────────────────────────────────
// The claim is a round trip to the server, and on a poor connection it can take
// a while. Every accept button used to show nothing in the meantime — the popup
// even closed itself first — so the order just sat there looking unaccepted,
// and a second tap started a second claim that came back "already taken" (by
// the first one). Screens read this to show progress and refuse repeats.

const claiming = new Map<string, number>(); // orderId → when the claim started
const claimListeners = new Set<() => void>();
let claimingIds: string[] = [];

function setClaiming(orderId: string, on: boolean) {
  if (on) claiming.set(orderId, Date.now());
  else if (!claiming.delete(orderId)) return;
  claimingIds = Array.from(claiming.keys());
  claimListeners.forEach((l) => l());
}

export const acceptClaims = {
  subscribe(listener: () => void): () => void {
    claimListeners.add(listener);
    return () => {
      claimListeners.delete(listener);
    };
  },
  /** Stable between changes, for useSyncExternalStore. */
  getIds(): string[] {
    return claimingIds;
  },
  startedAt(orderId: string): number | undefined {
    return claiming.get(orderId);
  },
};

// One accept per order at a time: a second tap (or the popup and the list both
// firing) joins the run already going instead of claiming again.
const acceptsInFlight = new Map<string, Promise<AcceptOutcome>>();

/**
 * The one accept flow, used by the new-order popup, the New list and the
 * Explore map: checks, confirmation, then an atomic claim on the server (see
 * fallbackStore.claimOrderForHelper), so two helpers can never both get it.
 */
export function acceptOrderAsHelper(
  orderId: string,
  user: UserProfile | null,
  ui: AcceptOrderUi,
  note = 'Accepted request',
  opts: { skipConfirm?: boolean } = {}
): Promise<AcceptOutcome> {
  const running = acceptsInFlight.get(orderId);
  if (running) return running;
  const run = runAccept(orderId, user, ui, note, opts).finally(() => {
    acceptsInFlight.delete(orderId);
    setClaiming(orderId, false);
  });
  acceptsInFlight.set(orderId, run);
  return run;
}

async function runAccept(
  orderId: string,
  user: UserProfile | null,
  ui: AcceptOrderUi,
  note: string,
  opts: { skipConfirm?: boolean }
): Promise<AcceptOutcome> {
  if (!user || !user.uid || (!user.email && (!user.displayName || user.displayName === '?'))) {
    ui.openAuthModal();
    return 'unauthenticated';
  }
  if (user.isBlocked) {
    ui.onBlocked();
    return 'blocked';
  }

  const limit = fallbackStore.pricingSettings.helperActiveOrderLimit ?? 5;
  if (countActiveOrdersForHelper(user.uid) >= limit) {
    await ui.showAlert(
      'অর্ডার সীমা পূর্ণ',
      `আপনি সর্বোচ্চ ${limit}টি অ্যাক্টিভ অর্ডার সম্পন্ন করার পর নতুন অর্ডার নিতে পারবেন।`,
      'warning'
    );
    return 'limit';
  }

  if (!isOrderOpen(fallbackStore.orders.get(orderId))) {
    await ui.showAlert(TAKEN_TITLE, TAKEN_MESSAGE, 'error');
    return 'taken';
  }

  // skipConfirm: the helper already answered "Accept" on the card drawn over
  // other apps — asking again after the app opens would be a second accept.
  if (!opts.skipConfirm) {
    const confirmed = await ui.showConfirm(
      'রিকুয়েস্ট গ্রহণ করুন',
      'আপনি কি এই রিকুয়েস্টটি গ্রহণ করতে চান? গ্রহণ করার পর আপনি অর্ডারটি ডেলিভারি করতে বাধ্য থাকবেন।',
      'হ্যাঁ, Accept করুন',
      'বাতিল'
    );
    if (!confirmed) return 'declined';
  }

  let outcome: 'accepted' | 'taken';
  setClaiming(orderId, true);
  try {
    outcome = await fallbackStore.claimOrderForHelper(orderId, user, note);
  } catch (e: any) {
    console.warn('[acceptOrderAsHelper] claim failed:', e?.message || e);
    setClaiming(orderId, false);
    await ui.showAlert(
      'অর্ডার গ্রহণ করা যায়নি',
      'ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।',
      'error'
    );
    return 'failed';
  }
  setClaiming(orderId, false);

  if (outcome === 'taken') {
    await ui.showAlert(TAKEN_TITLE, TAKEN_MESSAGE, 'error');
    return 'taken';
  }
  return 'accepted';
}
