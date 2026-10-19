import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/cron/process-scheduled-orders
 *
 * Called by Vercel Cron at platform opening time (configured in vercel.json).
 * Finds all orders with status=SCHEDULED or isScheduled=true that are past
 * their scheduledAt time and activates them to PENDING so helpers receive them —
 * even if no customer is currently visiting the app.
 *
 * Also protected by CRON_SECRET so it can be triggered manually by the admin.
 */
export async function POST(req: NextRequest) {
  // Auth: accept Vercel cron header OR a matching secret in the body
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'jamanot-cron-2024';

  // Vercel sets "Bearer <CRON_SECRET>" on cron-triggered requests
  const isVercelCron = authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron) {
    // Allow manual trigger via POST body secret
    const body = await req.json().catch(() => ({}));
    if (body?.secret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'jamanot-pwa';
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDSN_Q5PTgnL7nTm0Ni1yktCculx6jlRYY';
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  let activatedCount = 0;
  const errors: string[] = [];

  try {
    // ── Step 1: Query all SCHEDULED orders ────────────────────────────────────
    const scheduledByStatus = await runFirestoreQuery(baseUrl, apiKey, {
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: 'SCHEDULED' },
          },
        },
        limit: 200,
      },
    });

    // ── Step 2: Query orders with isScheduled=true that slipped through ───────
    const scheduledByFlag = await runFirestoreQuery(baseUrl, apiKey, {
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'isScheduled' },
            op: 'EQUAL',
            value: { booleanValue: true },
          },
        },
        limit: 200,
      },
    });

    // Deduplicate by order doc ID
    const orderMap = new Map<string, any>();
    for (const entry of [...scheduledByStatus, ...scheduledByFlag]) {
      if (!entry?.document) continue;
      const docId = entry.document.name.split('/').pop();
      if (docId) orderMap.set(docId, entry.document);
    }

    // ── Step 3: For each due order, patch it to PENDING ───────────────────────
    for (const [orderId, doc] of Array.from(orderMap.entries())) {
      const fields = doc.fields ?? {};

      // Check scheduledAt — only activate if the time has passed
      const scheduledAtStr: string | null = fields.scheduledAt?.stringValue ?? null;
      if (scheduledAtStr) {
        const scheduledMs = new Date(scheduledAtStr).getTime();
        if (scheduledMs > nowMs) {
          // Not due yet — skip
          continue;
        }
      }
      // No scheduledAt means it was queued for "next opening" — activate it now.

      // Build the updated status history entry
      const existingHistory = fields.statusHistory?.arrayValue?.values ?? [];
      const newHistoryEntry = {
        mapValue: {
          fields: {
            id: { stringValue: `sh-cron-activated-${nowMs}-${orderId}` },
            status: { stringValue: 'PENDING' },
            timestamp: { stringValue: nowIso },
            actor: { stringValue: 'System (Cron)' },
            note: {
              stringValue:
                'নির্ধারিত সময়ে সার্ভার থেকে স্বয়ংক্রিয়ভাবে রিকোয়েস্টটি সক্রিয় হয়েছে',
            },
          },
        },
      };

      // Patch only the fields we need to change
      const patchFields = `updateMask.fieldPaths=status&updateMask.fieldPaths=isScheduled&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=statusHistory`;
      const patchUrl = `https://firestore.googleapis.com/v1/${doc.name}?${patchFields}&key=${apiKey}`;

      const patchBody = {
        name: doc.name,
        fields: {
          ...fields,
          status: { stringValue: 'PENDING' },
          isScheduled: { booleanValue: false },
          updatedAt: { stringValue: nowIso },
          statusHistory: {
            arrayValue: {
              values: [...existingHistory, newHistoryEntry],
            },
          },
        },
      };

      try {
        const patchResp = await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        });

        if (patchResp.ok) {
          activatedCount++;

          // ── Step 4: Create a helper notification announcement ─────────────
          await createOrderAnnouncement(baseUrl, apiKey, orderId, fields, nowMs, nowIso);
        } else {
          const errText = await patchResp.text();
          errors.push(`Order ${orderId}: ${errText}`);
        }
      } catch (e: any) {
        errors.push(`Order ${orderId}: ${e.message}`);
      }
    }

    console.log(
      `[cron/process-scheduled-orders] Activated ${activatedCount} order(s). Errors: ${errors.length}`
    );

    return NextResponse.json({
      success: true,
      activatedCount,
      checkedCount: orderMap.size,
      timestamp: nowIso,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error('[cron/process-scheduled-orders] Fatal error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── GET is allowed for Vercel Cron (it sends GET by default) ─────────────────
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'jamanot-cron-2024';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return POST(req);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function runFirestoreQuery(
  baseUrl: string,
  apiKey: string,
  queryBody: object
): Promise<any[]> {
  const resp = await fetch(`${baseUrl}:runQuery?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryBody),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Firestore query failed: ${txt}`);
  }
  const data = await resp.json();
  return Array.isArray(data) ? data.filter((d: any) => d?.document) : [];
}

/**
 * Creates a notification document so online helpers receive the newly activated
 * order. Mirrors the logic in fallbackStore.newOrderAnnouncement().
 */
async function createOrderAnnouncement(
  baseUrl: string,
  apiKey: string,
  orderId: string,
  orderFields: Record<string, any>,
  nowMs: number,
  nowIso: string
) {
  try {
    const notifId = `notif-${nowMs}-cron-new-${orderId}`;
    const customerName = orderFields.customerName?.stringValue ?? 'Customer';
    const serviceType = orderFields.serviceType?.stringValue ?? 'Service';
    const deliveryFee =
      orderFields.deliveryFee?.integerValue ??
      orderFields.deliveryFee?.doubleValue ??
      0;

    const notifDoc = {
      fields: {
        id: { stringValue: notifId },
        type: { stringValue: 'NEW_ORDER' },
        orderId: { stringValue: orderId },
        targetGroup: { stringValue: 'all-helpers' },
        title: { stringValue: `নতুন রিকোয়েস্ট! 🛵` },
        body: {
          stringValue: `${customerName} — ${serviceType} | ৳${deliveryFee}`,
        },
        createdAt: { stringValue: nowIso },
        isRead: { booleanValue: false },
        metadata: {
          mapValue: {
            fields: {
              activatedByCron: { booleanValue: true },
              originallyScheduled: { booleanValue: true },
            },
          },
        },
      },
    };

    const notifUrl = `${baseUrl}/notifications/${notifId}?key=${apiKey}`;
    await fetch(notifUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notifDoc),
    });
  } catch (e) {
    // Non-fatal — the order was activated, notification is best-effort
    console.warn(`[cron] Failed to create announcement for order ${orderId}:`, e);
  }
}
