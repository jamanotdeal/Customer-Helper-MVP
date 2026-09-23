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
      ? so.itemsWithPrice.map((it) => `${it.name}${it.unit ? ` (${it.unit})` : ''}: ৳${it.price ?? 0}`).join('; ')
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

