'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { doc } from 'firebase/firestore';
import { getDoc, onSnapshot } from '@/lib/firestoreMetered';
import { fallbackStore, db } from '@/lib/firebase';
import type { Order, ShopOrder } from '@/types';

/**
 * The parent orders of a store's shop orders, so a delivery or cancellation of
 * the main order moves its shop orders to the finished list (StoreDashboard).
 *
 * This used to subscribe to every parent order inside an effect keyed on the
 * shop-order arrays. Each subscription's first snapshot wrote to the store and
 * notified it, which rebuilt those arrays, which tore every subscription down
 * and opened it again — a loop at network speed. Measured on a store phone
 * (2026-10-18): 10,884 subscriptions and 19,917 order reads in one session for
 * 18 shop orders, about 6 reads a second and 18% of a CPU core while idle.
 *
 * Now: parents are keyed by id, so a new list with the same orders changes
 * nothing; only an active shop order's parent is kept live (a finished one is
 * read once); and a snapshot that changes nothing notifies no one.
 *
 * `held` / `setHeld` are the parents read here and not otherwise in the store.
 */
export function useParentOrders(
  liveShopOrders: ShopOrder[],
  loadedShopOrders: ShopOrder[],
  held: Record<string, Order>,
  setHeld: Dispatch<SetStateAction<Record<string, Order>>>
) {
  const parentKeys = useMemo(() => {
    const live = new Set<string>();
    const all = new Set<string>();
    [...liveShopOrders, ...loadedShopOrders].forEach((so) => {
      if (!so.parentOrderId) return;
      all.add(so.parentOrderId);
      const finished = so.status === 'DELIVERED' || so.status === 'CANCELED' || (so.status as string) === 'CANCELLED';
      if (!finished) live.add(so.parentOrderId);
    });
    return { live: Array.from(live).sort().join('|'), all: Array.from(all).sort().join('|') };
  }, [liveShopOrders, loadedShopOrders]);

  // Parents not held anywhere yet: read once.
  const heldRef = useRef(held);
  heldRef.current = held;
  useEffect(() => {
    const ids = parentKeys.all ? parentKeys.all.split('|') : [];
    const missing = ids.filter((pId) => !fallbackStore.orders.has(pId) && !heldRef.current[pId]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const fetched: Record<string, Order> = {};
      await Promise.all(
        missing.map(async (pId) => {
          try {
            const snap = await getDoc(doc(db, 'orders', pId));
            if (snap.exists()) fetched[pId] = snap.data() as Order;
          } catch (e) {
            console.error('[Firestore] Error fetching parent order:', pId, e);
          }
        })
      );
      if (cancelled || Object.keys(fetched).length === 0) return;
      Object.entries(fetched).forEach(([pId, ord]) => fallbackStore.orders.set(pId, ord));
      setHeld((prev) => ({ ...prev, ...fetched }));
      fallbackStore.notify();
    })();
    return () => {
      cancelled = true;
    };
  }, [parentKeys.all, setHeld]);

  // Active shop orders' parents: live, one subscription each for as long as
  // the shop order stays active.
  const subsRef = useRef<Map<string, () => void>>(new Map());
  useEffect(() => {
    const wanted = new Set(parentKeys.live ? parentKeys.live.split('|') : []);
    const subs = subsRef.current;
    subs.forEach((unsub, pId) => {
      if (!wanted.has(pId)) {
        unsub();
        subs.delete(pId);
      }
    });
    wanted.forEach((pId) => {
      if (subs.has(pId)) return;
      subs.set(
        pId,
        onSnapshot(
          doc(db, 'orders', pId),
          (docSnap) => {
            if (!docSnap.exists()) return;
            const updated = docSnap.data() as Order;
            const current = fallbackStore.orders.get(pId);
            if (current && JSON.stringify(current) === JSON.stringify(updated)) return;
            setHeld((prev) => ({ ...prev, [pId]: updated }));
            fallbackStore.orders.set(pId, updated);
            fallbackStore.notify();
          },
          (err) => console.warn('[Firestore] Realtime parent order sync error:', err)
        )
      );
    });
  }, [parentKeys.live, setHeld]);

  useEffect(() => {
    const subs = subsRef.current;
    return () => {
      subs.forEach((unsub) => unsub());
      subs.clear();
    };
  }, []);
}
