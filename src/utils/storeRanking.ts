import { Shop, OrderFeedback, Order } from '@/types';
import { isShopOpenNow } from '@/components/StoreGrid';

export interface ShopFeedbackStats {
  positiveCount: number;
  negativeCount: number;
  totalCount: number;
  positiveRatio: number; // 0 to 1
  positivePercent: number; // 0 to 100
  isPositiveQualified: boolean; // totalCount > 0 && positiveRatio >= 0.90
  isNew: boolean; // new store without negative reviews
  tier: 1 | 2 | 3; // 1 = >=90% positive, 2 = New store, 3 = Others
}

const NEW_STORE_THRESHOLD_DAYS = 30;

/**
 * Checks if a store was created recently (within specified days).
 */
export function isShopCreatedRecently(createdAt?: string, days = NEW_STORE_THRESHOLD_DAYS): boolean {
  if (!createdAt) return true; // If no date, treat as new
  const createdTime = new Date(createdAt).getTime();
  if (isNaN(createdTime)) return true;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return createdTime >= cutoff;
}

/**
 * Computes feedback statistics and tier ranking for a collection of shops.
 */
export function calculateShopFeedbackStats(
  shops: Shop[],
  feedbacksInput: Map<string, OrderFeedback> | OrderFeedback[],
  ordersInput: Map<string, Order> | Order[]
): Map<string, ShopFeedbackStats> {
  const feedbacks = feedbacksInput instanceof Map ? Array.from(feedbacksInput.values()) : feedbacksInput;
  const orders = ordersInput instanceof Map ? Array.from(ordersInput.values()) : ordersInput;

  // Build an order index for fast lookup
  const orderById = new Map<string, Order>();
  for (const o of orders) {
    if (o && o.id) {
      orderById.set(o.id, o);
    }
  }

  // Pre-index feedbacks per shop
  const shopFeedbackMap = new Map<string, OrderFeedback[]>();
  for (const s of shops) {
    shopFeedbackMap.set(s.id, []);
  }

  for (const fb of feedbacks) {
    if (!fb) continue;
    const linkedOrder = fb.orderId ? orderById.get(fb.orderId) : undefined;

    // Collect all shop IDs that this feedback could belong to
    const targetShopIds = new Set<string>();

    if (fb.shopId) {
      targetShopIds.add(fb.shopId);
    }

    if (linkedOrder) {
      if (linkedOrder.shopId) targetShopIds.add(linkedOrder.shopId);
      if (linkedOrder.selectedShopIds && Array.isArray(linkedOrder.selectedShopIds)) {
        linkedOrder.selectedShopIds.forEach((id) => targetShopIds.add(id));
      }
      if (linkedOrder.items && Array.isArray(linkedOrder.items)) {
        linkedOrder.items.forEach((it) => {
          if (it.storeId) targetShopIds.add(it.storeId);
        });
      }
    }

    targetShopIds.forEach((shopId) => {
      const list = shopFeedbackMap.get(shopId);
      if (list) {
        list.push(fb);
      }
    });
  }

  const result = new Map<string, ShopFeedbackStats>();

  for (const shop of shops) {
    const list = shopFeedbackMap.get(shop.id) || [];
    let positiveCount = 0;
    let negativeCount = 0;

    for (const fb of list) {
      // 1. Thumbs system evaluation
      if (fb.thumbsUp === true) {
        positiveCount++;
      } else if (fb.thumbsUp === false) {
        // If customer explicitly marked ONLY the rider as bad, do NOT penalize the product/store
        const onlyRiderBad =
          fb.badReason === 'RIDER' ||
          (fb.badAspects && fb.badAspects.includes('rider') && !fb.badAspects.includes('product'));

        if (!onlyRiderBad) {
          negativeCount++;
        }
      } else {
        // 2. Legacy numeric rating evaluation
        const rating = typeof fb.shopRating === 'number' && fb.shopRating > 0
          ? fb.shopRating
          : typeof fb.serviceRating === 'number' && fb.serviceRating > 0
          ? fb.serviceRating
          : 0;

        if (rating >= 4) {
          positiveCount++;
        } else if (rating > 0 && rating <= 2) {
          negativeCount++;
        }
      }
    }

    const totalCount = positiveCount + negativeCount;
    const positiveRatio = totalCount > 0 ? positiveCount / totalCount : 0;
    const positivePercent = Math.round(positiveRatio * 100);

    // Criteria: At least 90% positive feedback
    const isPositiveQualified = totalCount > 0 && positiveRatio >= 0.90;

    // Criteria: New store (created recently or no feedback yet, and no negative feedback)
    const isNew = !isPositiveQualified &&
      (isShopCreatedRecently(shop.createdAt) || totalCount === 0) &&
      negativeCount === 0;

    let tier: 1 | 2 | 3 = 3;
    if (isPositiveQualified) {
      tier = 1; // Top priority: >= 90% positive feedback
    } else if (isNew) {
      tier = 2; // Next priority: New store
    } else {
      tier = 3; // Other stores
    }

    result.set(shop.id, {
      positiveCount,
      negativeCount,
      totalCount,
      positiveRatio,
      positivePercent,
      isPositiveQualified,
      isNew,
      tier,
    });
  }

  return result;
}

/**
 * Sorts stores based on customer criteria:
 * 0. Featured stores selected by admin (at the top order).
 * 1. Positive feedback stores first (>= 90% positive feedback).
 * 2. New stores right after the positive feedback stores.
 * 3. Other stores.
 */
export function sortShopsByFeedbackAndNew(
  shops: Shop[],
  feedbacksInput: Map<string, OrderFeedback> | OrderFeedback[],
  ordersInput: Map<string, Order> | Order[]
): Shop[] {
  const statsMap = calculateShopFeedbackStats(shops, feedbacksInput, ordersInput);

  return [...shops].sort((a, b) => {
    // 0. Featured stores to the top!
    const isFeatA = Boolean(a.isFeatured);
    const isFeatB = Boolean(b.isFeatured);
    if (isFeatA !== isFeatB) {
      return isFeatA ? -1 : 1;
    }

    // If both are featured, sort among featured stores:
    if (isFeatA && isFeatB) {
      const orderA = typeof a.featuredOrder === 'number' && !isNaN(a.featuredOrder) ? a.featuredOrder : null;
      const orderB = typeof b.featuredOrder === 'number' && !isNaN(b.featuredOrder) ? b.featuredOrder : null;
      if (orderA !== null && orderB !== null && orderA !== orderB) {
        return orderA - orderB;
      }
      if (orderA !== null && orderB === null) return -1;
      if (orderA === null && orderB !== null) return 1;

      // Prioritize open featured store
      const openA = isShopOpenNow(a) ? 1 : 0;
      const openB = isShopOpenNow(b) ? 1 : 0;
      if (openA !== openB) {
        return openB - openA;
      }

      // Fallback: newest featured/created store
      const timeA = new Date(a.featuredAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.featuredAt || b.createdAt || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
    }

    const statsA = statsMap.get(a.id);
    const statsB = statsMap.get(b.id);

    const tierA = statsA ? statsA.tier : 3;
    const tierB = statsB ? statsB.tier : 3;

    // 1. Primary order: Tier 1 (Positive feedback) -> Tier 2 (New store) -> Tier 3 (Others)
    if (tierA !== tierB) {
      return tierA - tierB;
    }

    // 2. Open stores prioritized within the same tier
    const openA = isShopOpenNow(a) ? 1 : 0;
    const openB = isShopOpenNow(b) ? 1 : 0;
    if (openA !== openB) {
      return openB - openA;
    }

    // 3. Within Tier 1 (>= 90% Positive Feedback)
    if (tierA === 1 && statsA && statsB) {
      // Higher positive ratio first
      if (statsB.positivePercent !== statsA.positivePercent) {
        return statsB.positivePercent - statsA.positivePercent;
      }
      // Higher number of positive reviews
      if (statsB.positiveCount !== statsA.positiveCount) {
        return statsB.positiveCount - statsA.positiveCount;
      }
    }

    // 4. Within Tier 2 (New Stores)
    if (tierA === 2) {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
    }

    // 5. Within Tier 3 (Others)
    if (tierA === 3 && statsA && statsB) {
      if (statsB.positivePercent !== statsA.positivePercent) {
        return statsB.positivePercent - statsA.positivePercent;
      }
    }

    // Fallback: newest creation date
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
}
