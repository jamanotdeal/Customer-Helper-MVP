'use client';

import { Order, Shop, PricingSettings } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { isOrderTimingOpen } from '@/lib/pricing';

const STORAGE_KEY = 'scheduled_customer_orders_v1';

/**
 * Converts Bengali digits to English digits
 */
export function toEnglishDigits(str: string): string {
  return str.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
}

/**
 * Converts English digits to Bengali digits
 */
export function toBengaliDigits(numOrStr: number | string): string {
  const str = String(numOrStr);
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return str.replace(/\d/g, (d) => bengaliDigits[parseInt(d, 10)]);
}

/**
 * Parses a time string (e.g. "9:00 AM", "09:30", "10:00 PM") into minutes from midnight (0-1439).
 */
export function parseTimeToMinutes(tStr?: string): number | null {
  if (!tStr) return null;
  const clean = toEnglishDigits(tStr).trim().toUpperCase();
  const match12 = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2] ? parseInt(match12[2], 10) : 0;
    const ampm = match12[3];
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  const match24 = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    return h * 60 + m;
  }
  return null;
}

export interface NextOpeningTimeResult {
  targetDate: Date;
  formattedTime: string;
  isToday: boolean;
  timeLabel: string;
}

/**
 * Calculates the exact next opening Date and formatted display string for a shop or platform.
 */
export function getNextStoreOpeningTime(
  shop?: Shop | null,
  settings?: PricingSettings
): NextOpeningTimeResult {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Try shop's openingTime first, then platform's orderTimingStart, fallback to 8:00 AM
  let startMinutes = parseTimeToMinutes(shop?.openingTime);
  if (startMinutes === null && settings?.orderTimingStart) {
    startMinutes = parseTimeToMinutes(settings.orderTimingStart);
  }
  if (startMinutes === null) {
    startMinutes = 8 * 60; // 8:00 AM default
  }

  const hours = Math.floor(startMinutes / 60);
  const minutes = startMinutes % 60;

  // Decide if opening is later today or tomorrow
  const isToday = currentMinutes < startMinutes;
  const targetDate = new Date(now);
  if (!isToday) {
    targetDate.setDate(targetDate.getDate() + 1);
  }
  targetDate.setHours(hours, minutes, 0, 0);

  // Format time for display (e.g. "সকাল ৯:০০ টা" or "সকাল ৯:৩০ টা")
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMinutesStr = minutes > 0 ? `:${String(minutes).padStart(2, '0')}` : ':০০';
  const ampmBengali = hours < 12 ? 'সকাল' : hours < 16 ? 'দুপুর' : hours < 20 ? 'বিকাল' : 'রাত';
  const ampmEng = hours < 12 ? 'AM' : 'PM';

  const timeOnlyBengali = `${ampmBengali} ${toBengaliDigits(displayHours)}${toBengaliDigits(displayMinutesStr)} টা`;
  const timeOnlyEng = `${displayHours}${minutes > 0 ? `:${String(minutes).padStart(2, '0')}` : ':00'} ${ampmEng}`;

  const prefixBengali = isToday ? 'আজ' : 'আগামীকাল';
  const prefixEng = isToday ? 'Today' : 'Tomorrow';

  const formattedTime = `${prefixBengali} ${timeOnlyBengali} (${prefixEng} ${timeOnlyEng})`;
  const timeLabel = `${prefixBengali} ${timeOnlyBengali}`;

  return {
    targetDate,
    formattedTime,
    isToday,
    timeLabel,
  };
}

/**
 * Calculates the exact next opening Date and formatted display string for the platform based on admin Order Timing settings.
 */
export function getNextPlatformOpeningTime(
  settings?: PricingSettings
): NextOpeningTimeResult {
  return getNextStoreOpeningTime(null, settings);
}

/**
 * Formats a scheduled ISO timestamp into a friendly human-readable date/time string.
 */
export function formatScheduledTime(isoString?: string): string {
  if (!isoString) return 'নির্ধারিত সময়';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'নির্ধারিত সময়';

    const now = new Date();
    const isSameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      d.getDate() === tomorrow.getDate() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getFullYear() === tomorrow.getFullYear();

    const hours = d.getHours();
    const minutes = d.getMinutes();
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    const displayMinutesStr = minutes > 0 ? `:${String(minutes).padStart(2, '0')}` : ':০০';
    const ampmBengali = hours < 12 ? 'সকাল' : hours < 16 ? 'দুপুর' : hours < 20 ? 'বিকাল' : 'রাত';
    const timeStr = `${ampmBengali} ${toBengaliDigits(displayHours)}${toBengaliDigits(displayMinutesStr)}`;

    if (isSameDay) {
      return `আজ ${timeStr}`;
    }
    if (isTomorrow) {
      return `আগামীকাল ${timeStr}`;
    }

    const monthsBengali = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
    const dateStr = `${toBengaliDigits(d.getDate())} ${monthsBengali[d.getMonth()]}`;
    return `${dateStr}, ${timeStr}`;
  } catch {
    return 'নির্ধারিত সময়';
  }
}

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
 * Dispatches all due scheduled orders (both from Firestore fallbackStore and legacy localStorage).
 * Returns the count of dispatched orders.
 */
export async function processAndDispatchScheduledOrders(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  let dispatchedCount = 0;

  // 1. Process active scheduled orders in Firestore
  const allOrders = Array.from(fallbackStore.orders.values());
  const nowMs = Date.now();

  for (const ord of allOrders) {
    if (ord.status === 'SCHEDULED' || ord.isScheduled) {
      const scheduledTimeMs = ord.scheduledAt ? new Date(ord.scheduledAt).getTime() : 0;
      if (scheduledTimeMs > 0 && scheduledTimeMs <= nowMs) {
        try {
          await fallbackStore.activateScheduledOrder(ord.id);
          dispatchedCount++;
        } catch (err) {
          console.error('[scheduledOrders] Failed to activate due Firestore order:', ord.id, err);
        }
      }
    }
  }

  // 2. Process legacy local storage queued orders if service is open
  const timing = isOrderTimingOpen(fallbackStore.pricingSettings);
  if (timing.isOpen) {
    const localOrders = getScheduledOrders();
    for (const ord of localOrders) {
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
        console.error('[scheduledOrders] Failed to dispatch local scheduled order:', ord.id, err);
      }
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
