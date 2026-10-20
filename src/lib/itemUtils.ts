import { Order, OrderItem, ShopOrder } from '@/types';

/**
 * Utilities for formatting item quantity and units
 */

/**
 * Formats item quantity and unit into a clean, standard display string.
 * Prevents redundant numbers such as "5 ১ কেজি" by stripping leading 1/১
 * from units like "১ কেজি", "১ লিটার", "১ পিস", "১ প্যাকেট", "1 kg", etc.
 * 
 * Examples:
 * - (5, "১ কেজি") => "5 কেজি"
 * - (1, "১ কেজি") => "1 কেজি"
 * - (5, "কেজি") => "5 কেজি"
 * - (3, "১ পিস") => "3 পিস"
 * - (2, "১টি") => "2 টি"
 * - (2, "৫০০ গ্রাম") => "2 × ৫০০ গ্রাম"
 * - (1, "৫০০ গ্রাম") => "৫০০ গ্রাম"
 * - (5, undefined) => "5"
 */
export const formatItemQuantityUnit = (
  qty: number,
  rawUnit?: string,
  rawQty?: string | number
): string => {
  let unit = (rawUnit || '').trim();

  // If no unit provided, check if rawQty has non-numeric text (e.g. "২ কেজি")
  if (!unit && typeof rawQty === 'string') {
    const textWithoutNum = rawQty.replace(/[0-9.০-৯\s]+/g, '').trim();
    if (textWithoutNum) {
      unit = textWithoutNum;
    }
  }

  if (!unit) {
    return `${qty}`;
  }

  // Remove leading "1" or "১" with optional "টি"/"টা" and spaces (e.g. "১ কেজি" -> "কেজি", "১টি" -> "টি", "1 kg" -> "kg", "১ পিস" -> "পিস", "১ প্যাকেট" -> "প্যাকেট")
  const leadingOneRegex = /^[1১]\s*(টি|টা)?\s*/i;
  if (leadingOneRegex.test(unit)) {
    const stripped = unit.replace(leadingOneRegex, '').trim();
    if (!stripped) {
      // It was just "1" or "১" or "১টি"
      return unit.includes('টি') ? `${qty} টি` : unit.includes('টা') ? `${qty} টা` : `${qty}`;
    }
    return `${qty} ${stripped}`;
  }

  // If the unit starts with a number like "500 গ্রাম", "250 গ্রাম"
  if (/^[0-9০-৯]/.test(unit)) {
    return qty > 1 ? `${qty} × ${unit}` : unit;
  }

  // Otherwise (e.g. "কেজি", "লিটার", "পিস", "kg", "প্যাকেট")
  return `${qty} ${unit}`;
};

/**
 * Normalizes item names for loose comparison (removes (x2), x2, trailing spaces, lowercases).
 */
export const normalizeItemName = (name: string): string => {
  return (name || '')
    .toLowerCase()
    .replace(/\s*[×x]\s*\d+/g, '')
    .replace(/\s*\(\s*[×x]?\s*\d+\s*\)/g, '')
    .trim();
};

/**
 * Parses numeric quantity of an item, supporting Bengali and English digits.
 */
export const getItemQuantityNum = (item: { qty?: string | number; quantity?: number; unit?: string }): number => {
  if (typeof item.quantity === 'number' && item.quantity > 0) return item.quantity;
  if (typeof item.qty === 'number' && item.qty > 0) return item.qty;
  if (typeof item.qty === 'string') {
    const bengaliNormalized = item.qty.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
    const multMatch = bengaliNormalized.match(/^(\d+(?:\.\d+)?)\s*[×x*]/i);
    if (multMatch) {
      const mult = parseFloat(multMatch[1]);
      if (!isNaN(mult) && mult > 0) return mult;
    }
    if (/(?:গ্রাম|gm|gram|ml|মিলি)/i.test(bengaliNormalized)) {
      const parsed = parseFloat(bengaliNormalized);
      if (!isNaN(parsed) && parsed >= 20) return 1;
    }
    const parsed = parseFloat(bengaliNormalized);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (typeof item.unit === 'string') {
    const bengaliNormalized = item.unit.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
    const multMatch = bengaliNormalized.match(/^(\d+(?:\.\d+)?)\s*[×x*]/i);
    if (multMatch) {
      const mult = parseFloat(multMatch[1]);
      if (!isNaN(mult) && mult > 0) return mult;
    }
    if (/(?:গ্রাম|gm|gram|ml|মিলি)/i.test(bengaliNormalized)) {
      const parsed = parseFloat(bengaliNormalized);
      if (!isNaN(parsed) && parsed >= 20) return 1;
    }
    const parsed = parseFloat(bengaliNormalized);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 1;
};

/**
 * Resolves the unit price of an order item:
 * 1. From item.price (if set and > 0)
 * 2. From connected active ShopOrders (via itemsWithPrice matching item ID or normalized name)
 */
export const getItemUnitPrice = (
  it: OrderItem,
  shopOrders: ShopOrder[] = [],
  parentOrderId?: string
): number | undefined => {
  if (!it) return undefined;

  // 1. If it's a custom item, direct price is only counted as confirmed product cost
  // if the helper marked it purchased, confirmed buyFrom source, or attached a shop order
  const isCustomUnconfirmed = Boolean(it.isCustom && !it.purchased && !it.buyFrom);

  // Direct price on item (if confirmed or standard product catalog item)
  if (!isCustomUnconfirmed) {
    const directPrice = typeof it.price === 'number' && !isNaN(it.price) && it.price > 0
      ? it.price
      : (typeof it.price === 'string' && !isNaN(parseFloat(it.price)) && parseFloat(it.price) > 0 ? parseFloat(it.price) : undefined);
    if (directPrice !== undefined && directPrice > 0) {
      return directPrice;
    }
  }

  // 2. From active ShopOrders (strictly scoped to this order)
  const activeSOs = shopOrders.filter(
    (so) =>
      (!parentOrderId || !so.parentOrderId || so.parentOrderId === parentOrderId) &&
      so.status !== 'CANCELED' &&
      (so.status as string) !== 'CANCELLED'
  );
  const cleanName = (it.name || '').toLowerCase().trim();
  const itNorm = normalizeItemName(it.name || '');

  for (const so of activeSOs) {
    if (so.itemsWithPrice && so.itemsWithPrice.length > 0) {
      const match = so.itemsWithPrice.find((ip: any) => {
        if (it.id && (ip.itemId === it.id || ip.originalId === it.id)) return true;
        const ipName = (ip.name || '').toLowerCase().trim();
        const ipNorm = normalizeItemName(ip.name || '');
        if (ipName && (cleanName === ipName || cleanName.includes(ipName) || ipName.includes(cleanName))) return true;
        if (ipNorm && (itNorm === ipNorm || (itNorm.length > 1 && ipNorm.length > 1 && (itNorm.includes(ipNorm) || ipNorm.includes(itNorm))))) return true;
        return false;
      });
      if (match) {
        const p = typeof match.price === 'number' ? match.price : parseFloat(String(match.price || '0'));
        if (!isNaN(p) && p > 0) return p;
      }
    }
  }

  return undefined;
};

/**
 * Calculates display price breakdown for an item in a shop order or order card.
 * Handles cases where item.price was stored as unit price or as total line price.
 */
export const getShopItemPriceDisplay = (
  item: { name: string; unit?: string; price?: string | number },
  shopOrderTotalPrice?: number
): {
  unitPrice: number;
  qtyNum: number;
  lineTotal: number;
  isMultiQty: boolean;
  breakdownText: string;
} => {
  const rawPrice = typeof item.price === 'number' ? item.price : parseFloat(String(item.price || '0'));
  const qtyNum = getItemQuantityNum({ qty: item.unit, unit: item.unit });
  if (isNaN(rawPrice) || rawPrice <= 0) {
    return { unitPrice: 0, qtyNum, lineTotal: 0, isMultiQty: qtyNum > 1, breakdownText: '' };
  }

  if (qtyNum <= 1) {
    return {
      unitPrice: rawPrice,
      qtyNum: 1,
      lineTotal: rawPrice,
      isMultiQty: false,
      breakdownText: `৳${rawPrice}`,
    };
  }

  // If quantity > 1: determine whether rawPrice was unit price or line total
  let unitPrice = rawPrice;
  let lineTotal = Math.round(rawPrice * qtyNum * 100) / 100;

  if (shopOrderTotalPrice && shopOrderTotalPrice > 0) {
    // 1. If rawPrice * qtyNum strictly exceeds the entire shop order total, rawPrice must be line total
    if (lineTotal > shopOrderTotalPrice + 0.05) {
      lineTotal = rawPrice;
      unitPrice = Math.round((rawPrice / qtyNum) * 100) / 100;
    } else if (Math.abs(rawPrice - shopOrderTotalPrice) < 0.01 && Math.abs(lineTotal - shopOrderTotalPrice) > 0.01) {
      // 2. If rawPrice exactly matches the whole shop order total, rawPrice is line total
      lineTotal = rawPrice;
      unitPrice = Math.round((rawPrice / qtyNum) * 100) / 100;
    }
  }

  return {
    unitPrice,
    qtyNum,
    lineTotal,
    isMultiQty: true,
    breakdownText: `${qtyNum} × ৳${unitPrice}`,
  };
};

/**
 * Accurately calculates total product cost for an order across all items
 * (multiplying each item's unit price by its current quantity) without double-counting.
 * Strictly guarantees that only ShopOrders belonging to this order (so.parentOrderId === order.id) are counted.
 */
export const calculateOrderProductCost = (order: Order, shopOrders: ShopOrder[] = []): number => {
  if (!order) return 0;
  const activeSOs = shopOrders.filter(
    (so) =>
      (!order.id || !so.parentOrderId || so.parentOrderId === order.id) &&
      so.status !== 'CANCELED' &&
      (so.status as string) !== 'CANCELLED'
  );
  const items = order.items || [];

  // If order has no structured items, cost is simply the sum of active shop orders for this order
  if (items.length === 0) {
    const totalSOs = activeSOs.reduce((sum, so) => sum + (Number(so.price) || 0), 0);
    if (totalSOs > 0) return Math.round(totalSOs * 100) / 100;
    return Number(order.productCost) || 0;
  }

  let itemsSum = 0;
  let hasAtLeastOnePricedItem = false;

  // 1. Calculate cost from structured items (unitPrice * quantity)
  for (const it of items) {
    const unitPrice = getItemUnitPrice(it, activeSOs, order.id);
    if (unitPrice !== undefined && unitPrice > 0) {
      const qty = getItemQuantityNum(it);
      itemsSum += unitPrice * qty;
      hasAtLeastOnePricedItem = true;
    }
  }

  // 2. Only if NO individual item prices could be found anywhere:
  // Check if active shop orders specify lump-sum prices without item breakdowns
  if (!hasAtLeastOnePricedItem) {
    const totalSOs = activeSOs.reduce((sum, so) => sum + (Number(so.price) || 0), 0);
    if (totalSOs > 0) {
      return Math.round(totalSOs * 100) / 100;
    }
  }

  if (itemsSum > 0) {
    return Math.round(itemsSum * 100) / 100;
  }

  return Number(order.productCost) || 0;
};

/**
 * Determines whether an order item has already been processed:
 * - Marked as purchased
 * - Cost confirmed (custom item with price > 0 or has buyFrom source)
 * - Assigned or sent to an active shop order (Store order or MySelf order)
 */
export const isItemInProcess = (item: OrderItem, shopOrders: ShopOrder[] = [], parentOrderId?: string): boolean => {
  if (!item) return false;

  // 1. If explicitly marked as purchased/completed
  if (item.purchased) return true;

  // 2. If it's a custom item and price has already been set (> 0)
  const numericPrice = typeof item.price === 'number' && !isNaN(item.price) && item.price > 0
    ? item.price
    : (typeof item.price === 'string' && !isNaN(parseFloat(item.price)) && parseFloat(item.price) > 0 ? parseFloat(item.price) : 0);
  if (item.isCustom && numericPrice > 0) return true;

  // 3. If item has buyFrom set (meaning helper confirmed store or seller)
  if (item.buyFrom && item.buyFrom.trim().length > 0) return true;

  // 4. Check active shop orders
  const activeSOs = shopOrders.filter(
    (so) =>
      (!parentOrderId || !so.parentOrderId || so.parentOrderId === parentOrderId) &&
      so.status !== 'CANCELED' &&
      (so.status as string) !== 'CANCELLED'
  );
  if (activeSOs.length === 0) return false;

  const targetNorm = normalizeItemName(item.name || '');

  for (const so of activeSOs) {
    // If item is assigned to a store and a shopOrder exists for that store
    if (item.storeId && so.shopId && item.storeId === so.shopId) {
      return true;
    }

    // If item is in itemsWithPrice of shopOrder
    if (so.itemsWithPrice && so.itemsWithPrice.length > 0) {
      const match = so.itemsWithPrice.some((ip: any) => {
        if (item.id && (ip.itemId === item.id || ip.originalId === item.id)) return true;
        const ipNorm = normalizeItemName(ip.name || '');
        return ipNorm === targetNorm || (targetNorm.length > 2 && (targetNorm.includes(ipNorm) || ipNorm.includes(targetNorm)));
      });
      if (match) return true;
    }

    // If item name matches lines/parts in requestText
    const rawLines = (so.requestText || '').split(/\r?\n/).filter((l) => !l.startsWith('নোট:'));
    const parts: string[] = [];
    rawLines.forEach((line) => {
      line.split(/,/).forEach((p) => {
        const trimmed = normalizeItemName(p);
        if (trimmed) parts.push(trimmed);
      });
    });
    if (parts.some((p) => p === targetNorm || (p.length > 2 && (targetNorm.includes(p) || p.includes(targetNorm))))) {
      return true;
    }
  }

  return false;
};

