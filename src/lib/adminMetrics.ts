import type { Order, Shop, ShopOrder, UserProfile, WithdrawalRequest } from '@/types';

/**
 * Aggregations behind the admin panel's lists.
 *
 * Each of these used to be written where it was displayed as "for every row,
 * search the whole collection": every user against every order, every shop
 * against every shop order against every order. That is unnoticeable with a
 * few hundred documents and freezes the panel with a few thousand — the admin
 * holds the platform's whole history. Here each collection is walked once,
 * into an index, and rows are answered from the index.
 *
 * They are pure functions of their arguments so they can be checked against
 * the row-by-row originals (see the note on each for what must stay equal).
 */

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** The union of several ascending position lists, ascending, without repeats. */
function mergePositions(lists: (number[] | undefined)[]): number[] {
  const present = lists.filter((l): l is number[] => Boolean(l && l.length));
  if (present.length === 0) return [];
  if (present.length === 1) return present[0];
  return Array.from(new Set(present.reduce<number[]>((all, l) => all.concat(l), []))).sort((a, b) => a - b);
}

const isRunning = (o: Order) => o.status !== 'DELIVERED' && o.status !== 'CANCELED';

// ─── Helpers ────────────────────────────────────────────────────────────────

export interface HelperJobCounts {
  /** Assigned and neither delivered nor cancelled. */
  active: number;
  /** Delivered. */
  completed: number;
}

/** Every helper's running and delivered order counts, in one pass. */
export function countJobsByHelper(orders: Iterable<Order>): Map<string, HelperJobCounts> {
  const counts = new Map<string, HelperJobCounts>();
  Array.from(orders).forEach((o) => {
    if (!o.helperId) return;
    let c = counts.get(o.helperId);
    if (!c) {
      c = { active: 0, completed: 0 };
      counts.set(o.helperId, c);
    }
    if (o.status === 'DELIVERED') c.completed += 1;
    else if (o.status !== 'CANCELED') c.active += 1;
  });
  return counts;
}

/** The helpers who have at least one running order. */
export function helpersWithRunningOrders(orders: Iterable<Order>): Set<string> {
  const ids = new Set<string>();
  Array.from(orders).forEach((o) => {
    if (o.helperId && isRunning(o)) ids.add(o.helperId);
  });
  return ids;
}

// ─── Users ──────────────────────────────────────────────────────────────────

export interface UserOrderStats {
  /** The first running order (in `orders` order) this user placed. */
  activeReq: Order | undefined;
  /** The first running order (in `orders` order) this user is delivering. */
  activeDel: Order | undefined;
  customerOrdersCount: number;
  helperOrdersCount: number;
  /** When their most recent order was placed; null if they never ordered. */
  lastOrderMs: number | null;
}

/**
 * Indexes `orders` once and returns a lookup of one user's order statistics.
 *
 * An order is a user's own when it carries their account id, or was placed
 * with either of their phone numbers. "First" means first in `orders`, as a
 * search of the list itself would find it.
 */
export function createUserOrderStats(orders: Order[]): (user: UserProfile) => UserOrderStats {
  const byCustomerId = new Map<string, number[]>();
  const byCustomerPhone = new Map<string, number[]>();
  const byHelperId = new Map<string, number[]>();
  orders.forEach((o, position) => {
    if (o.customerId) pushTo(byCustomerId, o.customerId, position);
    if (o.customerPhone) pushTo(byCustomerPhone, o.customerPhone, position);
    if (o.helperId) pushTo(byHelperId, o.helperId, position);
  });

  return (u) => {
    const placed = mergePositions([
      byCustomerId.get(u.uid),
      u.phoneNumber ? byCustomerPhone.get(u.phoneNumber) : undefined,
      u.alternativePhone ? byCustomerPhone.get(u.alternativePhone) : undefined,
    ]);
    const delivering = byHelperId.get(u.uid) || [];

    let activeReq: Order | undefined;
    let lastOrderMs: number | null = null;
    for (const position of placed) {
      const o = orders[position];
      if (!activeReq && isRunning(o)) activeReq = o;
      const ms = new Date(o.createdAt).getTime();
      if (lastOrderMs === null || ms > lastOrderMs) lastOrderMs = ms;
    }
    let activeDel: Order | undefined;
    for (const position of delivering) {
      if (isRunning(orders[position])) {
        activeDel = orders[position];
        break;
      }
    }
    return {
      activeReq,
      activeDel,
      customerOrdersCount: placed.length,
      helperOrdersCount: delivering.length,
      lastOrderMs,
    };
  };
}

// ─── Shops ──────────────────────────────────────────────────────────────────

export interface ShopMetrics {
  completed: number;
  rejected: number;
  running: number;
  /** Delivered and running sales, for display. */
  totalSales: number;
  commission: number;
  netSales: number;
  totalDisbursed: number;
  /** Delivered sales net of commission, less what has been paid out. */
  unpaidBalance: number;
}

/**
 * Order counts, sales and payout figures for each of `shops`.
 *
 * A shop is known under three ids — its own, its owner's uid, and
 * `store-<owner uid>` — and shop orders, orders and withdrawals refer to it by
 * any of them. Orders also count for a shop they merely list in
 * `selectedShopIds`, unless a shop order of that shop already stands for them.
 * Amounts are summed in the order the collections are given, as before.
 */
export function computeShopMetrics(
  shops: Shop[],
  shopOrders: ShopOrder[],
  orders: Order[],
  withdrawals: WithdrawalRequest[]
): Map<string, ShopMetrics> {
  const orderById = new Map<string, Order>();
  const ordersByShopKey = new Map<string, number[]>();
  orders.forEach((o, position) => {
    if (!orderById.has(o.id)) orderById.set(o.id, o);
    const keys = new Set<string>();
    if (o.shopId) keys.add(o.shopId);
    (o.selectedShopIds || []).forEach((id) => {
      if (id) keys.add(id);
    });
    keys.forEach((key) => pushTo(ordersByShopKey, key, position));
  });

  const shopOrdersByShopId = new Map<string, number[]>();
  shopOrders.forEach((so, position) => {
    if (so.shopId) pushTo(shopOrdersByShopId, so.shopId, position);
  });

  const approvedByAccount = new Map<string, number[]>();
  const approvedStoreByName = new Map<string | undefined, number[]>();
  withdrawals.forEach((w, position) => {
    if (w.status !== 'APPROVED') return;
    pushTo(approvedByAccount, w.helperId, position);
    if (w.userType === 'store') pushTo(approvedStoreByName, w.helperName, position);
  });

  const metrics = new Map<string, ShopMetrics>();
  shops.forEach((s) => {
    const storeUserId = s.ownerUserId || s.id;
    const targetShopId = s.id;
    const storeAlias = `store-${storeUserId}`;

    let completed = 0;
    let rejected = 0;
    let running = 0;
    let totalSales = 0; // all (delivered + running) for display
    let deliveredSales = 0; // only delivered/handover — for unpaid balance

    const seenParentIds = new Set<string>();
    mergePositions([
      shopOrdersByShopId.get(targetShopId),
      shopOrdersByShopId.get(storeUserId),
      shopOrdersByShopId.get(storeAlias),
    ]).forEach((position) => {
      const so = shopOrders[position];
      seenParentIds.add(so.parentOrderId);
      const parentOrder = orderById.get(so.parentOrderId);
      const isCanceled = so.status === 'CANCELED' || parentOrder?.status === 'CANCELED';
      const isCompleted = so.status === 'DELIVERED' || so.status === 'HANDOVER' || parentOrder?.status === 'DELIVERED';

      if (isCanceled) {
        rejected++;
      } else if (isCompleted) {
        completed++;
        const price = so.price || parentOrder?.productCost || 0;
        totalSales += price;
        deliveredSales += price;
      } else {
        running++;
        totalSales += so.price || 0;
      }
    });

    mergePositions([ordersByShopKey.get(targetShopId), ordersByShopKey.get(storeUserId)]).forEach((position) => {
      const mo = orders[position];
      if (seenParentIds.has(mo.id)) return;
      if (mo.status === 'CANCELED') {
        rejected++;
      } else if (mo.status === 'DELIVERED') {
        completed++;
        totalSales += mo.productCost || 0;
        deliveredSales += mo.productCost || 0;
      } else {
        running++;
        totalSales += mo.productCost || 0;
      }
    });

    const commPercent = s.commissionPercent || 0;
    const commission = Math.round(totalSales * (commPercent / 100));
    const netSales = Math.max(0, totalSales - commission);
    // Unpaid balance: only from delivered orders net of commission
    const deliveredCommission = Math.round(deliveredSales * (commPercent / 100));
    const deliveredNetSales = Math.max(0, deliveredSales - deliveredCommission);

    const totalDisbursed = mergePositions([
      approvedByAccount.get(storeUserId),
      approvedByAccount.get(targetShopId),
      approvedByAccount.get(storeAlias),
      approvedStoreByName.get(s.name),
    ]).reduce((sum, position) => sum + withdrawals[position].amount, 0);
    const unpaidBalance = Math.max(0, deliveredNetSales - totalDisbursed);

    metrics.set(s.id, { completed, rejected, running, totalSales, commission, netSales, totalDisbursed, unpaidBalance });
  });
  return metrics;
}

// ─── Sorting ────────────────────────────────────────────────────────────────

/**
 * `items` sorted by a date field, newest first unless `oldestFirst`. The date
 * is parsed once per item — a comparator that parses both sides on every
 * comparison does it some thirty times per item on a list of a hundred
 * thousand. Items with the same time keep their order.
 */
export function sortByDate<T>(items: T[], dateOf: (item: T) => string | undefined, oldestFirst = false): T[] {
  const keyed = items.map((item, position) => ({ item, position, ms: new Date(dateOf(item) || 0).getTime() }));
  keyed.sort((a, b) => {
    const diff = oldestFirst ? a.ms - b.ms : b.ms - a.ms;
    return diff || a.position - b.position;
  });
  return keyed.map((k) => k.item);
}
