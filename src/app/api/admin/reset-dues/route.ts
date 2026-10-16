import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin using the same project credentials
function getAdminDb() {
  if (!getApps().length) {
    // Use Application Default Credentials or service account
    // Since we don't have a service account file here, we use the REST API approach below
    throw new Error('Use the client-side reset instead');
  }
  return getFirestore();
}

export async function POST(req: NextRequest) {
  // Simple secret check to avoid accidental calls
  const { secret } = await req.json().catch(() => ({ secret: '' }));
  if (secret !== 'reset-dues-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // We'll use the Firestore REST API directly since we have the project credentials
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    if (!projectId || !apiKey) {
      return NextResponse.json({ error: 'Missing Firebase config' }, { status: 500 });
    }

    // Fetch all orders that have a duePayment field using Firestore REST API
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

    // Run a structured query to find orders with duePayment
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'duePayment' },
            op: 'IS_NOT_NULL',
          },
        },
        limit: 500,
      },
    };

    const queryResp = await fetch(
      `${baseUrl}:runQuery?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryBody),
      }
    );

    const queryData = await queryResp.json();

    if (!Array.isArray(queryData)) {
      console.error('Query response:', queryData);
      return NextResponse.json({ error: 'Query failed', details: queryData }, { status: 500 });
    }

    const orderDocs = queryData.filter((d: any) => d.document);
    let resetCount = 0;
    const errors: string[] = [];

    // For each order, patch the duePayment to status=PAID, amount=0
    for (const entry of orderDocs) {
      const docName: string = entry.document.name; // full path
      const orderId = docName.split('/').pop();

      try {
        // PATCH the duePayment field: set status to PAID and amount to 0
        const patchUrl = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=duePayment&key=${apiKey}`;

        const existingDue = entry.document.fields?.duePayment?.mapValue?.fields || {};
        // Build updated duePayment with amount=0 and status=PAID
        const updatedDue = {
          mapValue: {
            fields: {
              ...existingDue,
              amount: { integerValue: '0' },
              status: { stringValue: 'PAID' },
              resetAt: { stringValue: new Date().toISOString() },
              resetNote: { stringValue: 'Bulk reset to zero by admin on ' + new Date().toLocaleDateString() },
            },
          },
        };

        const patchResp = await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: docName,
            fields: {
              ...entry.document.fields,
              duePayment: updatedDue,
              updatedAt: { stringValue: new Date().toISOString() },
            },
          }),
        });

        if (patchResp.ok) {
          resetCount++;
        } else {
          const errText = await patchResp.text();
          errors.push(`Order ${orderId}: ${errText}`);
        }
      } catch (e: any) {
        errors.push(`Order ${orderId}: ${e.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Reset ${resetCount} order(s) with due amounts to zero.`,
      totalFound: orderDocs.length,
      resetCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error('[reset-dues] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
