/**
 * exportUtils.ts
 * Zero-dependency client-side export utilities for admin data sections.
 * - CSV: UTF-8 BOM + Blob download (opens natively in Excel, supports Bengali text)
 * - PDF: styled HTML table opened in new window + window.print()
 */

import { Order, UserProfile, OrderFeedback, RewardClaim, ShopOrder } from '@/types';

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/** Escape a cell value for CSV (wraps in quotes, escapes inner quotes). */
function escapeCSV(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Wrap in quotes if the value contains a comma, newline, or quote
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build a CSV string from headers and rows. */
function buildCSV(headers: string[], rows: (string | number | undefined | null)[][]): string {
  const lines: string[] = [headers.map(escapeCSV).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCSV).join(','));
  }
  return lines.join('\r\n');
}

/** Trigger a CSV file download in the browser. */
function downloadCSV(filename: string, csv: string): void {
  // BOM for Excel to correctly detect UTF-8 (important for Bengali characters)
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Open a new window with a styled HTML table and trigger print dialog. */
function printHTMLTable(
  title: string,
  headers: string[],
  rows: (string | number | undefined | null)[][],
  summaryLines?: string[]
): void {
  const headerHTML = headers.map((h) => `<th>${h}</th>`).join('');
  const rowsHTML = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${cell === null || cell === undefined ? '' : String(cell)}</td>`)
          .join('')}</tr>`
    )
    .join('');

  const summaryHTML = summaryLines && summaryLines.length > 0
    ? `<div class="summary">${summaryLines.map((l) => `<p>${l}</p>`).join('')}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
    h1 { font-size: 16px; font-weight: 700; margin-bottom: 4px; color: #1a1a2e; }
    .meta { font-size: 10px; color: #555; margin-bottom: 12px; }
    .summary { margin-bottom: 12px; }
    .summary p { font-size: 11px; color: #333; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    thead { background: #4f46e5; color: #fff; }
    th { padding: 7px 9px; text-align: left; font-weight: 700; white-space: nowrap; }
    td { padding: 6px 9px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) { background: #f9fafb; }
    tr:hover { background: #ede9fe; }
    @page { size: A4 landscape; margin: 15mm; }
    @media print {
      body { padding: 0; }
      thead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">Exported on: ${new Date().toLocaleString('en-GB', { hour12: true })} &nbsp;|&nbsp; Total records: ${rows.length}</p>
  ${summaryHTML}
  <table>
    <thead><tr>${headerHTML}</tr></thead>
    <tbody>${rowsHTML}</tbody>
  </table>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow popups for this site to use the PDF export feature.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Small delay so styles render before print dialog opens
  setTimeout(() => {
    win.focus();
    win.print();
  }, 400);
}

/** Format a date string to a human-readable short form. */
function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Users List Export
// ---------------------------------------------------------------------------

const USER_HEADERS = [
  '#',
  'Name',
  'Email',
  'Phone',
  'Role',
  'Is Helper',
  'Helper Type',
  'Coins',
  'Customer Orders',
  'Helper Orders',
  'Status',
  'Store',
  'Segments',
  'Join Date',
];

type EnrichedUser = {
  user: UserProfile;
  customerOrdersCount: number;
  helperOrdersCount: number;
  segments: string[];
  [key: string]: unknown;
};

function usersToRows(items: EnrichedUser[]): (string | number)[][] {
  return items.map((item, i) => {
    const u = item.user;
    return [
      i + 1,
      u.displayName || '',
      u.email || '',
      u.phoneNumber || u.alternativePhone || '',
      u.role,
      u.isHelper ? 'Yes' : 'No',
      u.helperType || '',
      u.coins ?? 0,
      item.customerOrdersCount,
      item.helperOrdersCount,
      u.isBlocked ? 'Blocked' : 'Active',
      u.isStore ? 'Yes' : 'No',
      (item.segments || []).join(', '),
      fmtDate(u.createdAt),
    ];
  });
}

export function exportUsersToCSV(items: EnrichedUser[], label = 'users'): void {
  const rows = usersToRows(items);
  const csv = buildCSV(USER_HEADERS, rows);
  downloadCSV(`admin_${label}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

export function exportUsersToPDF(items: EnrichedUser[], label = 'Users List'): void {
  const rows = usersToRows(items);
  const summary = [
    `Total Users: ${items.length}`,
    `Helpers: ${items.filter((i) => i.user.isHelper).length}`,
    `Blocked: ${items.filter((i) => i.user.isBlocked).length}`,
  ];
  printHTMLTable(`Admin — ${label}`, USER_HEADERS, rows, summary);
}

// ---------------------------------------------------------------------------
// Orders Export
// ---------------------------------------------------------------------------

const ORDER_HEADERS = [
  '#',
  'Order ID',
  'Customer',
  'Customer Phone',
  'Helper',
  'Helper Phone',
  'Service',
  'Status',
  'Delivery Fee (৳)',
  'Product Cost (৳)',
  'Total (৳)',
  'Coins Awarded',
  'Created At',
  'Accepted At',
  'Delivered At',
];

function ordersToRows(orders: Order[]): (string | number)[][] {
  return orders.map((o, i) => [
    i + 1,
    o.id,
    o.customerName || '',
    o.customerPhone || '',
    o.helperName || '',
    o.helperPhone || '',
    o.service || o.title || '',
    o.status,
    o.deliveryFee ?? 0,
    o.productCost ?? 0,
    (o.deliveryFee ?? 0) + (o.productCost ?? 0),
    o.coinsAwarded ?? 0,
    fmtDate(o.createdAt),
    fmtDate(o.acceptedAt),
    fmtDate(o.deliveredAt),
  ]);
}

export function exportOrdersToCSV(orders: Order[]): void {
  const rows = ordersToRows(orders);
  const csv = buildCSV(ORDER_HEADERS, rows);
  downloadCSV(`admin_orders_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

export function exportOrdersToPDF(orders: Order[]): void {
  const rows = ordersToRows(orders);
  const delivered = orders.filter((o) => o.status === 'DELIVERED');
  const totalFees = orders.reduce((s, o) => s + (o.deliveryFee ?? 0), 0);
  const totalProducts = orders.reduce((s, o) => s + (o.productCost ?? 0), 0);
  const summary = [
    `Total Orders: ${orders.length}`,
    `Delivered: ${delivered.length}   Canceled: ${orders.filter((o) => o.status === 'CANCELED').length}   Pending: ${orders.filter((o) => o.status === 'PENDING').length}`,
    `Total Delivery Fees: ৳${totalFees.toLocaleString()}   Total Product Cost: ৳${totalProducts.toLocaleString()}   Grand Total: ৳${(totalFees + totalProducts).toLocaleString()}`,
  ];
  printHTMLTable('Admin — All Orders', ORDER_HEADERS, rows, summary);
}

// ---------------------------------------------------------------------------
// Feedback Export
// ---------------------------------------------------------------------------

const FEEDBACK_HEADERS = [
  '#',
  'Order ID',
  'Customer',
  'Helper',
  'Shop',
  'Rider Rating',
  'Service Rating',
  'Shop Rating',
  'Avg Rating',
  'Comment',
  'Date',
];

function feedbackToRows(feedbacks: OrderFeedback[]): (string | number)[][] {
  return feedbacks.map((f, i) => {
    const ratings = [f.riderRating, f.serviceRating, f.shopRating].filter((r) => r > 0);
    const avg = ratings.length > 0
      ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
      : '0.0';
    return [
      i + 1,
      f.orderId,
      f.customerName || '',
      f.helperName || '',
      f.shopName || '',
      f.riderRating ?? '',
      f.serviceRating ?? '',
      f.shopRating ?? '',
      avg,
      f.improvementComment || '',
      fmtDate(f.createdAt),
    ];
  });
}

export function exportFeedbackToCSV(feedbacks: OrderFeedback[]): void {
  const rows = feedbackToRows(feedbacks);
  const csv = buildCSV(FEEDBACK_HEADERS, rows);
  downloadCSV(`admin_feedback_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

export function exportFeedbackToPDF(feedbacks: OrderFeedback[]): void {
  const rows = feedbackToRows(feedbacks);
  const totalF = feedbacks.length;
  const avgRider = totalF > 0
    ? (feedbacks.reduce((s, f) => s + f.riderRating, 0) / totalF).toFixed(1)
    : '0.0';
  const avgService = totalF > 0
    ? (feedbacks.reduce((s, f) => s + f.serviceRating, 0) / totalF).toFixed(1)
    : '0.0';
  const summary = [
    `Total Feedback Entries: ${totalF}`,
    `Avg Rider Rating: ${avgRider} ★   Avg Service Rating: ${avgService} ★`,
  ];
  printHTMLTable('Admin — Order Feedback', FEEDBACK_HEADERS, rows, summary);
}

// ---------------------------------------------------------------------------
// Coins & Reward Claims Export
// ---------------------------------------------------------------------------

const CLAIM_HEADERS = [
  '#',
  'Claim ID',
  'User',
  'Phone',
  'Email',
  'Prize',
  'Required Coins',
  'Discount %',
  'Status',
  'Claim Note',
  'Review Note',
  'Reviewed By',
  'Claimed At',
  'Reviewed At',
];

function claimsToRows(claims: RewardClaim[]): (string | number)[][] {
  return claims.map((c, i) => [
    i + 1,
    c.id,
    c.userName || '',
    c.userPhone || '',
    c.userEmail || '',
    c.prizeTitle || '',
    c.requiredCoins ?? 0,
    c.discountPercent ?? '',
    c.status,
    c.claimNote || '',
    c.reviewNote || '',
    c.reviewedBy || '',
    fmtDate(c.createdAt),
    fmtDate(c.reviewedAt),
  ]);
}

export function exportRewardClaimsToCSV(claims: RewardClaim[]): void {
  const rows = claimsToRows(claims);
  const csv = buildCSV(CLAIM_HEADERS, rows);
  downloadCSV(`admin_reward_claims_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

export function exportRewardClaimsToPDF(claims: RewardClaim[]): void {
  const rows = claimsToRows(claims);
  const pending = claims.filter((c) => c.status === 'PENDING').length;
  const approved = claims.filter((c) => c.status === 'APPROVED').length;
  const totalCoins = claims.reduce((s, c) => s + (c.requiredCoins ?? 0), 0);
  const summary = [
    `Total Claims: ${claims.length}   Pending: ${pending}   Approved: ${approved}   Rejected: ${claims.length - pending - approved}`,
    `Total Coins Redeemed: ${totalCoins.toLocaleString()} coins`,
  ];
  printHTMLTable('Admin — Coins & Reward Claims', CLAIM_HEADERS, rows, summary);
}

// ---------------------------------------------------------------------------
// Store / Shop Orders Export
// ---------------------------------------------------------------------------

const SHOP_ORDER_HEADERS = [
  '#',
  'Store Order ID',
  'Parent Order ID',
  'Shop Name',
  'Helper Name',
  'Request / Items',
  'Price (৳)',
  'Seller Name',
  'Seller Phone',
  'Status',
  'Store Note',
  'Created At',
  'Updated At',
];

function shopOrdersToRows(shopOrders: ShopOrder[]): (string | number)[][] {
  return shopOrders.map((so, i) => [
    i + 1,
    so.id,
    so.parentOrderId || '',
    so.shopName || '',
    so.helperName || '',
    so.itemsWithPrice && so.itemsWithPrice.length > 0
      ? so.itemsWithPrice.map((it) => `${it.name}: ৳${it.price ?? 0}`).join('; ')
      : (so.requestText || ''),
    so.price !== undefined && so.price !== null ? so.price : 0,
    so.sellerName || '',
    so.sellerPhone || '',
    so.status,
    so.note || '',
    fmtDate(so.createdAt),
    fmtDate(so.updatedAt),
  ]);
}

export function exportShopOrdersToCSV(shopOrders: ShopOrder[]): void {
  const rows = shopOrdersToRows(shopOrders);
  const csv = buildCSV(SHOP_ORDER_HEADERS, rows);
  downloadCSV(`admin_store_orders_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

export function exportShopOrdersToPDF(shopOrders: ShopOrder[]): void {
  const rows = shopOrdersToRows(shopOrders);
  const delivered = shopOrders.filter((so) => so.status === 'DELIVERED');
  const totalPrice = shopOrders.reduce((s, so) => s + (so.price ?? 0), 0);
  const summary = [
    `Total Store Orders: ${shopOrders.length}`,
    `Delivered: ${delivered.length}   Canceled: ${shopOrders.filter((so) => so.status === 'CANCELED').length}   Pending: ${shopOrders.filter((so) => so.status === 'PENDING').length}   Preparing: ${shopOrders.filter((so) => so.status === 'PREPARING').length}   Ready: ${shopOrders.filter((so) => so.status === 'READY').length}   Handover: ${shopOrders.filter((so) => so.status === 'HANDOVER').length}`,
    `Total Store Orders Value: ৳${totalPrice.toLocaleString()}`,
  ];
  printHTMLTable('Admin — All Store Orders', SHOP_ORDER_HEADERS, rows, summary);
}

// ---------------------------------------------------------------------------
// Helper Performance & Operations Sheet Export
// ---------------------------------------------------------------------------

export interface HelperExportTarget {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  nid?: string;
  helperType?: string;
  status?: string;
  balance?: number;
  totalEarned?: number;
}

export interface HelperExportDataOptions {
  helper: HelperExportTarget;
  orders: Order[];
  feedbacks: OrderFeedback[];
  periodLabel?: string;
  startDate?: string;
  endDate?: string;
}

/** Check if feedback is negative (thumbs down or rating <= 2) */
export function isFeedbackNegative(f: OrderFeedback): boolean {
  if (f.thumbsUp === false) return true;
  if (f.riderRating > 0 && f.riderRating <= 2) return true;
  if (f.serviceRating > 0 && f.serviceRating <= 2) return true;
  const rCount = (f.riderRating > 0 ? 1 : 0) + (f.serviceRating > 0 ? 1 : 0);
  if (rCount > 0 && ((f.riderRating || 0) + (f.serviceRating || 0)) / rCount <= 2) return true;
  return false;
}

/** Calculate helper order acceptance time in seconds */
export function getOrderAcceptanceSecs(ord: Order): number | null {
  const createdMs = new Date(ord.createdAt).getTime();
  if (isNaN(createdMs) || createdMs <= 0) return null;
  let acceptedMs: number | null = null;
  if (ord.acceptedAt) {
    const t = new Date(ord.acceptedAt).getTime();
    if (!isNaN(t) && t > 0) acceptedMs = t;
  }
  if (!acceptedMs && ord.statusHistory && ord.statusHistory.length > 0) {
    const hist = ord.statusHistory.find((h) => h.status === 'ACCEPTED');
    if (hist && hist.timestamp) {
      const t = new Date(hist.timestamp).getTime();
      if (!isNaN(t) && t > 0) acceptedMs = t;
    }
  }
  if (!acceptedMs) return null;
  const diffSecs = Math.max(0, Math.round((acceptedMs - createdMs) / 1000));
  if (diffSecs > 86400) return null; // Discard anomalies > 24h
  return diffSecs;
}

/** Calculate order delivery duration in minutes */
export function getOrderDeliveryMins(ord: Order): number | null {
  if (ord.status !== 'DELIVERED' && (ord.status as string) !== 'COMPLETED') return null;
  const deliveredMs = new Date(ord.deliveredAt || ord.updatedAt).getTime();
  if (isNaN(deliveredMs) || deliveredMs <= 0) return null;
  const startMs = new Date(ord.acceptedAt || ord.createdAt).getTime();
  if (isNaN(startMs) || startMs <= 0) return null;
  const diffMins = Math.max(0, Math.round((deliveredMs - startMs) / (60 * 1000)));
  if (diffMins > 1440) return null; // Discard anomalies > 24h
  return diffMins;
}

/** Determine whether an order was late / delayed (> 1 hour without mutual discussion) */
export function getOrderDelayInfo(ord: Order): { isLate: boolean; lateMinutes: number; label: string } {
  if (ord.status === 'CANCELED') return { isLate: false, lateMinutes: 0, label: 'Cancelled' };
  const isDelivered = ord.status === 'DELIVERED' || (ord.status as string) === 'COMPLETED';

  if (!isDelivered) {
    const createdMs = new Date(ord.createdAt).getTime();
    if (isNaN(createdMs)) return { isLate: false, lateMinutes: 0, label: '' };
    const elapsedMins = Math.round((Date.now() - createdMs) / (60 * 1000));
    if (elapsedMins >= 60 && !ord.mutuallyDiscussed) {
      return { isLate: true, lateMinutes: elapsedMins, label: `Delayed >1h (${elapsedMins} mins)` };
    }
    return { isLate: false, lateMinutes: elapsedMins, label: 'In Progress' };
  } else {
    const deliveredMs = new Date(ord.deliveredAt || ord.updatedAt).getTime();
    const startMs = new Date(ord.acceptedAt || ord.createdAt).getTime();
    if (!isNaN(deliveredMs) && !isNaN(startMs) && deliveredMs > startMs) {
      const durMins = Math.round((deliveredMs - startMs) / (60 * 1000));
      if (durMins >= 60 && !ord.mutuallyDiscussed) {
        return { isLate: true, lateMinutes: durMins, label: `Late Delivery (${durMins} mins)` };
      }
    }
    return { isLate: false, lateMinutes: 0, label: 'On Time' };
  }
}

/** Check if order was placed to a partner store */
export function isOrderPlacedToPartnerStore(ord: Order): boolean {
  if (ord.isStoreOrder) return true;
  if (ord.selectedShopIds && ord.selectedShopIds.length > 0) return true;
  if (ord.shopId && ord.shopId !== 'myself') return true;
  return false;
}

/** Helper to format seconds as string */
function formatSecs(secs: number): string {
  if (secs <= 0) return '0s';
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Helper to format minutes as string */
function formatMins(mins: number): string {
  if (mins <= 0) return '0 min';
  if (mins < 60) return `${Math.round(mins)} mins`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export interface ComputedHelperMetrics {
  totalOrders: number;
  deliveredOrders: number;
  lateOrders: number;
  cancelledOrders: number;
  activeOrders: number;
  deliverySuccessRate: number;
  failureRate: number;
  avgAcceptingSecs: number;
  avgAcceptingTimeFormatted: string;
  avgDeliveryMins: number;
  avgDeliveryTimeFormatted: string;
  storeOrdersCount: number;
  storeOrdersPercent: number;
  totalReviews: number;
  positiveReviews: number;
  negativeReviews: number;
  avgRating: number;
  avgOrdersPerActiveDay: number;
  avgOrdersPerCalendarDay: number;
  avgReviewsPerActiveDay: number;
  activeDaysCount: number;
  calendarDaysCount: number;
  dailyBreakdown: Array<{
    date: string;
    dayOfWeek: string;
    ordersCount: number;
    deliveredCount: number;
    lateCount: number;
    cancelledCount: number;
    successRate: number;
    failureRate: number;
    reviewsCount: number;
    avgRating: number;
    negativeReviewsCount: number;
    avgAcceptingSecs: number;
    avgDeliveryMins: number;
    storeOrdersCount: number;
    storeOrdersPercent: number;
  }>;
}

/** Calculate comprehensive performance metrics for a helper */
export function calculateHelperPerformanceMetrics(
  orders: Order[],
  feedbacks: OrderFeedback[],
  startDate?: string,
  endDate?: string
): ComputedHelperMetrics {
  const totalOrders = orders.length;
  let deliveredOrders = 0;
  let lateOrders = 0;
  let cancelledOrders = 0;
  let activeOrders = 0;
  let storeOrdersCount = 0;

  let totalAcceptingSecs = 0;
  let countWithAcceptance = 0;

  let totalDeliveryMins = 0;
  let countWithDelivery = 0;

  interface DayBucket {
    date: string;
    dayOfWeek: string;
    orders: Order[];
    feedbacks: OrderFeedback[];
  }

  const dayMap = new Map<string, DayBucket>();

  const getLocalDateStr = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return 'Unknown';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return 'Unknown';
    }
  };

  const getOrCreateDay = (dStr: string): DayBucket => {
    let b = dayMap.get(dStr);
    if (!b) {
      let dayOfWeek = '';
      if (dStr !== 'Unknown') {
        const parts = dStr.split('-');
        const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      }
      b = { date: dStr, dayOfWeek, orders: [], feedbacks: [] };
      dayMap.set(dStr, b);
    }
    return b;
  };

  orders.forEach((o) => {
    const isDelivered = o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED';
    const isCancelled = o.status === 'CANCELED';

    if (isDelivered) deliveredOrders++;
    else if (isCancelled) cancelledOrders++;
    else activeOrders++;

    const delayInfo = getOrderDelayInfo(o);
    if (delayInfo.isLate) lateOrders++;

    if (isOrderPlacedToPartnerStore(o)) storeOrdersCount++;

    const accSecs = getOrderAcceptanceSecs(o);
    if (accSecs !== null) {
      totalAcceptingSecs += accSecs;
      countWithAcceptance++;
    }

    const delMins = getOrderDeliveryMins(o);
    if (delMins !== null) {
      totalDeliveryMins += delMins;
      countWithDelivery++;
    }

    const dateStr = getLocalDateStr(o.deliveredAt || o.acceptedAt || o.createdAt);
    getOrCreateDay(dateStr).orders.push(o);
  });

  feedbacks.forEach((f) => {
    const dateStr = getLocalDateStr(f.createdAt);
    getOrCreateDay(dateStr).feedbacks.push(f);
  });

  // Calculate review stats
  const totalReviews = feedbacks.length;
  let positiveReviews = 0;
  let negativeReviews = 0;
  let totalRatingSum = 0;
  let countWithRating = 0;

  feedbacks.forEach((f) => {
    if (isFeedbackNegative(f)) {
      negativeReviews++;
    } else {
      positiveReviews++;
    }

    const ratings = [f.riderRating, f.serviceRating, f.shopRating].filter((r) => r && r > 0);
    if (ratings.length > 0) {
      totalRatingSum += ratings.reduce((a, b) => a + b, 0) / ratings.length;
      countWithRating++;
    }
  });

  const avgRating = countWithRating > 0 ? Number((totalRatingSum / countWithRating).toFixed(1)) : 5.0;

  const finishedOrders = deliveredOrders + cancelledOrders;
  const deliverySuccessRate = finishedOrders > 0
    ? Number(((deliveredOrders / finishedOrders) * 100).toFixed(1))
    : (totalOrders > 0 ? Number(((deliveredOrders / totalOrders) * 100).toFixed(1)) : 100);

  const failureRate = finishedOrders > 0
    ? Number(((cancelledOrders / finishedOrders) * 100).toFixed(1))
    : (totalOrders > 0 ? Number(((cancelledOrders / totalOrders) * 100).toFixed(1)) : 0);

  const avgAcceptingSecs = countWithAcceptance > 0 ? Math.round(totalAcceptingSecs / countWithAcceptance) : 0;
  const avgDeliveryMins = countWithDelivery > 0 ? Math.round(totalDeliveryMins / countWithDelivery) : 0;

  const storeOrdersPercent = totalOrders > 0 ? Number(((storeOrdersCount / totalOrders) * 100).toFixed(1)) : 0;

  // Compute daily breakdown sorted descending by date
  const sortedDayKeys = Array.from(dayMap.keys()).sort((a, b) => b.localeCompare(a));
  const dailyBreakdown = sortedDayKeys.map((k) => {
    const bucket = dayMap.get(k)!;
    const bOrders = bucket.orders;
    const bFeedbacks = bucket.feedbacks;

    const bDelivered = bOrders.filter((o) => o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED').length;
    const bCancelled = bOrders.filter((o) => o.status === 'CANCELED').length;
    const bLate = bOrders.filter((o) => getOrderDelayInfo(o).isLate).length;
    const bStore = bOrders.filter(isOrderPlacedToPartnerStore).length;

    let bAccTotal = 0;
    let bAccCount = 0;
    let bDelTotal = 0;
    let bDelCount = 0;

    bOrders.forEach((o) => {
      const a = getOrderAcceptanceSecs(o);
      if (a !== null) {
        bAccTotal += a;
        bAccCount++;
      }
      const d = getOrderDeliveryMins(o);
      if (d !== null) {
        bDelTotal += d;
        bDelCount++;
      }
    });

    let bNegReviews = 0;
    let bRatingTotal = 0;
    let bRatingCount = 0;

    bFeedbacks.forEach((f) => {
      if (isFeedbackNegative(f)) bNegReviews++;
      const r = [f.riderRating, f.serviceRating, f.shopRating].filter((v) => v && v > 0);
      if (r.length > 0) {
        bRatingTotal += r.reduce((x, y) => x + y, 0) / r.length;
        bRatingCount++;
      }
    });

    const bFinished = bDelivered + bCancelled;
    const bSuccessRate = bFinished > 0
      ? Number(((bDelivered / bFinished) * 100).toFixed(1))
      : (bOrders.length > 0 ? Number(((bDelivered / bOrders.length) * 100).toFixed(1)) : 100);

    const bFailureRate = bFinished > 0
      ? Number(((bCancelled / bFinished) * 100).toFixed(1))
      : (bOrders.length > 0 ? Number(((bCancelled / bOrders.length) * 100).toFixed(1)) : 0);

    return {
      date: bucket.date,
      dayOfWeek: bucket.dayOfWeek,
      ordersCount: bOrders.length,
      deliveredCount: bDelivered,
      lateCount: bLate,
      cancelledCount: bCancelled,
      successRate: bSuccessRate,
      failureRate: bFailureRate,
      reviewsCount: bFeedbacks.length,
      avgRating: bRatingCount > 0 ? Number((bRatingTotal / bRatingCount).toFixed(1)) : 5.0,
      negativeReviewsCount: bNegReviews,
      avgAcceptingSecs: bAccCount > 0 ? Math.round(bAccTotal / bAccCount) : 0,
      avgDeliveryMins: bDelCount > 0 ? Math.round(bDelTotal / bDelCount) : 0,
      storeOrdersCount: bStore,
      storeOrdersPercent: bOrders.length > 0 ? Number(((bStore / bOrders.length) * 100).toFixed(1)) : 0,
    };
  });

  const activeDaysCount = Math.max(1, dailyBreakdown.filter((d) => d.ordersCount > 0).length);

  let calendarDaysCount = activeDaysCount;
  if (startDate && endDate) {
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    if (!isNaN(s) && !isNaN(e) && e >= s) {
      calendarDaysCount = Math.max(1, Math.round((e - s) / (24 * 3600 * 1000)) + 1);
    }
  }

  const avgOrdersPerActiveDay = Number((totalOrders / activeDaysCount).toFixed(1));
  const avgOrdersPerCalendarDay = Number((totalOrders / calendarDaysCount).toFixed(1));
  const avgReviewsPerActiveDay = Number((totalReviews / activeDaysCount).toFixed(1));

  return {
    totalOrders,
    deliveredOrders,
    lateOrders,
    cancelledOrders,
    activeOrders,
    deliverySuccessRate,
    failureRate,
    avgAcceptingSecs,
    avgAcceptingTimeFormatted: formatSecs(avgAcceptingSecs),
    avgDeliveryMins,
    avgDeliveryTimeFormatted: formatMins(avgDeliveryMins),
    storeOrdersCount,
    storeOrdersPercent,
    totalReviews,
    positiveReviews,
    negativeReviews,
    avgRating,
    avgOrdersPerActiveDay,
    avgOrdersPerCalendarDay,
    avgReviewsPerActiveDay,
    activeDaysCount,
    calendarDaysCount,
    dailyBreakdown,
  };
}

/**
 * Export a comprehensive performance sheet for a specific helper to CSV (Excel compatible).
 * Includes summary KPIs, daily breakdown (orders/day, reviews/day), and detailed orders list.
 */
export function exportHelperPerformanceToCSV(options: HelperExportDataOptions): void {
  const { helper, orders, feedbacks, periodLabel, startDate, endDate } = options;
  const metrics = calculateHelperPerformanceMetrics(orders, feedbacks, startDate, endDate);

  const lines: string[] = [];

  // Helper row builder
  const addRow = (...cells: (string | number | undefined | null)[]) => {
    lines.push(cells.map(escapeCSV).join(','));
  };

  const addBlank = () => lines.push('');

  // 1. Report Header & Helper Profile
  addRow('HELPER PERFORMANCE & OPERATIONS REPORT', '');
  addRow('Helper Name', helper.name);
  addRow('Helper ID', helper.id);
  addRow('Phone', helper.phone || 'N/A');
  addRow('NID #', helper.nid || 'N/A');
  addRow('Helper Type', helper.helperType === 'dedicated' ? 'Dedicated Rider' : 'Commuter Helper');
  addRow('Status', helper.status || 'APPROVED');
  addRow('Reporting Period', periodLabel || (startDate && endDate ? `${startDate} to ${endDate}` : 'All Time'));
  addRow('Exported On', new Date().toLocaleString('en-GB', { hour12: true }));
  addBlank();

  // 2. Performance KPIs Summary
  addRow('KEY PERFORMANCE INDICATORS (KPIS)', 'VALUE', 'CALCULATION / NOTE');
  addRow('Total Orders Assigned', metrics.totalOrders, 'All orders assigned to helper in period');
  addRow('Delivered Orders (Completed)', metrics.deliveredOrders, 'Successfully fulfilled & delivered');
  addRow('Late / Delayed Orders (>1 Hour)', metrics.lateOrders, 'Deliveries exceeding 60 mins without mutual agreement');
  addRow('Cancelled Orders', metrics.cancelledOrders, 'Orders canceled while assigned');
  addRow('Active / In-Progress Orders', metrics.activeOrders, 'Orders ongoing or not yet delivered');
  addRow('Average Orders Per Day (Active Days)', metrics.avgOrdersPerActiveDay, `Orders / ${metrics.activeDaysCount} active working days`);
  addRow('Average Orders Per Day (Calendar Days)', metrics.avgOrdersPerCalendarDay, `Orders / ${metrics.calendarDaysCount} total days in period`);
  addRow('Delivery Success Rate', `${metrics.deliverySuccessRate}%`, 'Delivered / (Delivered + Cancelled)');
  addRow('Failure / Cancellation Rate', `${metrics.failureRate}%`, 'Cancelled / (Delivered + Cancelled)');
  addRow('Average Order Accepting Time', metrics.avgAcceptingTimeFormatted, 'Average duration from order creation to helper acceptance');
  addRow('Average Delivery Time', metrics.avgDeliveryTimeFormatted, 'Average duration from acceptance to customer delivery');
  addRow('Partner Store Orders Placed', metrics.storeOrdersCount, 'Orders made with partner shops / stores');
  addRow('Partner Store Order Percentage', `${metrics.storeOrdersPercent}%`, 'Partner store orders / Total assigned orders');
  addRow('Total Customer Reviews', metrics.totalReviews, 'Customer reviews & feedback received');
  addRow('Average Reviews Per Day', metrics.avgReviewsPerActiveDay, 'Reviews / active working days');
  addRow('Average Customer Rating', `${metrics.avgRating} ★`, 'Average star rating out of 5.0');
  addRow('Positive Reviews (👍 Positive)', metrics.positiveReviews, 'Satisfied customer feedback');
  addRow('Negative Reviews (👎 Negative)', metrics.negativeReviews, 'Customer complaints or issues');
  addRow(
    'Positive Feedback Rate',
    `${metrics.totalReviews > 0 ? ((metrics.positiveReviews / metrics.totalReviews) * 100).toFixed(1) : 100}%`,
    'Positive reviews / Total reviews'
  );
  if (helper.totalEarned !== undefined) {
    addRow('Total Estimated Earnings', `৳${helper.totalEarned.toLocaleString()}`, 'Helper delivery fee commission');
  }
  if (helper.balance !== undefined) {
    addRow('Wallet Balance', `৳${helper.balance.toLocaleString()}`, 'Current helper wallet balance');
  }
  addBlank();

  // 3. Daily Breakdown Table (Orders per day & Reviews per day)
  addRow('DAILY PERFORMANCE BREAKDOWN (ORDERS & REVIEWS PER DAY)', '');
  const dailyHeaders = [
    'Date',
    'Day',
    'Orders Assigned',
    'Delivered Orders',
    'Late / Delayed Orders',
    'Cancelled Orders',
    'Delivery Success Rate (%)',
    'Failure Rate (%)',
    'Reviews Count',
    'Positive Reviews (👍)',
    'Negative Reviews (👎)',
    'Avg Accepting Time',
    'Avg Delivery Time (mins)',
    'Partner Store Orders',
    'Partner Store Orders (%)',
  ];
  addRow(...dailyHeaders);

  metrics.dailyBreakdown.forEach((d) => {
    const posCount = Math.max(0, d.reviewsCount - d.negativeReviewsCount);
    addRow(
      d.date,
      d.dayOfWeek,
      d.ordersCount,
      d.deliveredCount,
      d.lateCount,
      d.cancelledCount,
      `${d.successRate}%`,
      `${d.failureRate}%`,
      d.reviewsCount,
      posCount,
      d.negativeReviewsCount,
      formatSecs(d.avgAcceptingSecs),
      d.avgDeliveryMins > 0 ? `${d.avgDeliveryMins} mins` : '—',
      d.storeOrdersCount,
      `${d.storeOrdersPercent}%`
    );
  });
  addBlank();

  // 4. Detailed Orders Log
  addRow('INDIVIDUAL ORDERS LOG', '');
  const orderLogHeaders = [
    '#',
    'Order ID',
    'Date & Time',
    'Status',
    'Service / Title',
    'Customer Name',
    'Customer Phone',
    'Delivery Fee (৳)',
    'Product Cost (৳)',
    'Is Partner Store?',
    'Order Accepting Time',
    'Delivery Duration',
    'Is Late / Delayed?',
    'Late Status / Delay Details',
    'Customer Feedback Sentiment',
    'Customer Feedback Comment',
  ];
  addRow(...orderLogHeaders);

  orders.forEach((o, idx) => {
    const delay = getOrderDelayInfo(o);
    const accSecs = getOrderAcceptanceSecs(o);
    const delMins = getOrderDeliveryMins(o);
    const fb = feedbacks.find((f) => f.orderId === o.id) || o.feedback;
    const sentimentStr = fb
      ? isFeedbackNegative(fb)
        ? '👎 Negative'
        : '👍 Positive'
      : 'No Feedback';

    addRow(
      idx + 1,
      o.id,
      fmtDate(o.createdAt),
      o.status,
      o.service || o.title || '',
      o.customerName || '',
      o.customerPhone || '',
      o.deliveryFee ?? 0,
      o.productCost ?? 0,
      isOrderPlacedToPartnerStore(o) ? 'Yes' : 'No',
      accSecs !== null ? formatSecs(accSecs) : '—',
      delMins !== null ? `${delMins} mins` : '—',
      delay.isLate ? 'YES (LATE)' : 'No',
      delay.label,
      sentimentStr,
      fb?.improvementComment || ''
    );
  });

  const csvContent = lines.join('\r\n');
  const safeName = (helper.name || 'helper').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const dateSuffix = new Date().toISOString().slice(0, 10);
  downloadCSV(`helper_${safeName}_performance_${dateSuffix}.csv`, csvContent);
}

/**
 * Export a styled PDF report for a specific helper
 */
export function exportHelperPerformanceToPDF(options: HelperExportDataOptions): void {
  const { helper, orders, feedbacks, periodLabel, startDate, endDate } = options;
  const metrics = calculateHelperPerformanceMetrics(orders, feedbacks, startDate, endDate);

  const title = `Helper Performance Report — ${helper.name}`;

  const kpisSummary = [
    `<strong>Helper:</strong> ${helper.name} (${helper.phone || 'No Phone'}) &nbsp;|&nbsp; <strong>Type:</strong> ${helper.helperType === 'dedicated' ? 'Dedicated Rider' : 'Commuter Helper'} &nbsp;|&nbsp; <strong>Period:</strong> ${periodLabel || 'All Time'}`,
    `<strong>Total Orders:</strong> ${metrics.totalOrders} &nbsp;|&nbsp; <strong>Delivered:</strong> ${metrics.deliveredOrders} &nbsp;|&nbsp; <strong>Late Orders:</strong> ${metrics.lateOrders} &nbsp;|&nbsp; <strong>Cancelled:</strong> ${metrics.cancelledOrders}`,
    `<strong>Success Rate:</strong> ${metrics.deliverySuccessRate}% &nbsp;|&nbsp; <strong>Failure Rate:</strong> ${metrics.failureRate}% &nbsp;|&nbsp; <strong>Avg Orders/Day:</strong> ${metrics.avgOrdersPerActiveDay}`,
    `<strong>Avg Accepting Time:</strong> ${metrics.avgAcceptingTimeFormatted} &nbsp;|&nbsp; <strong>Avg Delivery Time:</strong> ${metrics.avgDeliveryTimeFormatted} &nbsp;|&nbsp; <strong>Partner Store Orders:</strong> ${metrics.storeOrdersCount} (${metrics.storeOrdersPercent}%)`,
    `<strong>Total Reviews:</strong> ${metrics.totalReviews} &nbsp;|&nbsp; <strong>Avg Rating:</strong> ${metrics.avgRating} ★ &nbsp;|&nbsp; <strong>Negative Reviews:</strong> ${metrics.negativeReviews}`,
  ];

  const headers = [
    'Date',
    'Day',
    'Orders',
    'Delivered',
    'Late',
    'Cancelled',
    'Success %',
    'Failure %',
    'Reviews',
    'Rating',
    'Neg. Reviews',
    'Accept Time',
    'Delivery Time',
    'Partner Store %',
  ];

  const rows = metrics.dailyBreakdown.map((d) => [
    d.date,
    d.dayOfWeek,
    d.ordersCount,
    d.deliveredCount,
    d.lateCount,
    d.cancelledCount,
    `${d.successRate}%`,
    `${d.failureRate}%`,
    d.reviewsCount,
    `${d.avgRating} ★`,
    d.negativeReviewsCount,
    formatSecs(d.avgAcceptingSecs),
    d.avgDeliveryMins > 0 ? `${d.avgDeliveryMins}m` : '—',
    `${d.storeOrdersPercent}%`,
  ]);

  printHTMLTable(title, headers, rows, kpisSummary);
}

/**
 * Export fleet-wide helper comparison sheet to CSV (Excel)
 */
export function exportFleetComparisonToCSV(
  helpers: HelperExportTarget[],
  allOrders: Order[],
  allFeedbacks: OrderFeedback[],
  periodLabel = 'All Time'
): void {
  const headers = [
    '#',
    'Helper Name',
    'Phone',
    'NID #',
    'Helper Type',
    'Status',
    'Total Orders Assigned',
    'Delivered Orders',
    'Late / Delayed Orders',
    'Cancelled Orders',
    'Orders Per Day (Avg)',
    'Delivery Success Rate (%)',
    'Failure Rate (%)',
    'Avg Order Accepting Time',
    'Avg Delivery Time',
    'Partner Store Orders',
    'Partner Store Orders (%)',
    'Total Customer Reviews',
    'Reviews Per Day (Avg)',
    'Average Customer Rating',
    'Negative Reviews',
    'Total Earned (৳)',
    'Wallet Balance (৳)',
  ];

  const rows = helpers.map((h, i) => {
    const hOrders = allOrders.filter((o) => o.helperId === h.id);
    const orderIds = new Set(hOrders.map((o) => o.id));
    const hFeedbacks = allFeedbacks.filter((f) => f.helperId === h.id || orderIds.has(f.orderId));
    const m = calculateHelperPerformanceMetrics(hOrders, hFeedbacks);

    return [
      i + 1,
      h.name,
      h.phone || 'N/A',
      h.nid || 'N/A',
      h.helperType === 'dedicated' ? 'Dedicated Rider' : 'Commuter Helper',
      h.status || 'APPROVED',
      m.totalOrders,
      m.deliveredOrders,
      m.lateOrders,
      m.cancelledOrders,
      m.avgOrdersPerActiveDay,
      `${m.deliverySuccessRate}%`,
      `${m.failureRate}%`,
      m.avgAcceptingTimeFormatted,
      m.avgDeliveryTimeFormatted,
      m.storeOrdersCount,
      `${m.storeOrdersPercent}%`,
      m.totalReviews,
      m.avgReviewsPerActiveDay,
      `${m.avgRating} ★`,
      m.negativeReviews,
      h.totalEarned ?? 0,
      h.balance ?? 0,
    ];
  });

  const summaryLine = `# Fleet Performance Summary — Period: ${periodLabel} | Generated: ${new Date().toLocaleString('en-GB')}`;
  const csv = `${summaryLine}\r\n${buildCSV(headers, rows)}`;
  downloadCSV(`fleet_helpers_performance_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

