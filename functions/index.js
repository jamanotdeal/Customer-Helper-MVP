/**
 * Server-side push sender.
 *
 * Every notification in this app is a document in `notifications`. Each device
 * also holds its own Firestore listener (DutyForegroundService on Android), and
 * that listener is the primary delivery path. It has one hole it cannot cover:
 * OEM battery managers (Transsion/Xiaomi/Oppo/Vivo) freeze the app process
 * seconds after it leaves the foreground, which suspends the listener and cuts
 * its socket. Verified on an Infinix X6728: with the app closed, notifications
 * arrived only when the app was next opened.
 *
 * FCM is delivered by Play Services, which those managers do not freeze, so a
 * push reaches the device when nothing else can. This function is the sender
 * that JamanotMessagingService.java has always been waiting for.
 *
 * Design notes:
 *
 *  - **Data-only messages.** No `notification` block. A message carrying one is
 *    rendered by the system tray directly and `onMessageReceived` never runs
 *    while the app is backgrounded, which would bypass the client's targeting
 *    check, its de-duplication and its channel choice. Data-only keeps the app
 *    in control.
 *
 *  - **The client re-checks targeting.** OrderMatcher.targets() drops anything
 *    not meant for the account currently signed in, which matters because one
 *    device token can be recorded against several users (a shared test phone).
 *    So a broadcast may be fanned out to a superset; the device filters.
 *
 *  - **De-duplication is shared.** `tag` carries the notification document id,
 *    and both the push receiver and the Firestore listener funnel through
 *    Prefs.markSeen(id). Whichever arrives first alerts; the other is dropped.
 *
 *  - **The geofence runs here.** A new-order broadcast to a helper group is
 *    filtered by distance on the client when it comes from the listener, but a
 *    push posts immediately. Mirrors isHelperWithinOrderRadius in
 *    src/lib/pricing.ts so both paths alert the same helpers.
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const logger = require('firebase-functions/logger');

initializeApp();

/**
 * Must match the Firestore database's location. If `firebase deploy` rejects
 * this with a location error, it names the correct region — put it here.
 */
const REGION = 'us-central1';

/** Matches DEFAULT_PRICING_SETTINGS.helperRadiusKm in src/lib/pricing.ts. */
const DEFAULT_RADIUS_KM = 3.5;

/** Older documents are a backfill or a retry storm, not news worth waking a phone for. */
const MAX_AGE_MS = 10 * 60 * 1000;

/** An order alert nobody saw within the hour is stale; do not deliver it late. */
const TTL_MS = 60 * 60 * 1000;

/** sendEachForMulticast's per-call cap. */
const BATCH_SIZE = 500;

const EARTH_RADIUS_KM = 6371.0;

// ── Geofence (parity with src/lib/pricing.ts) ────────────────────────────────

/** The JS source uses truthy checks, so a coordinate of exactly 0 reads as missing. */
function present(v) {
  return typeof v === 'number' && Number.isFinite(v) && v !== 0;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Missing coordinates on either side mean "show it", so a helper with no fix still sees work. */
function withinRadius(helperLocation, order, radiusKm) {
  const hLat = helperLocation && helperLocation.lat;
  const hLng = helperLocation && helperLocation.lng;
  if (!present(hLat) || !present(hLng)) return true;

  const ends = [order && order.pickupLocation, order && order.deliveryLocation];
  const distances = ends
    .filter((loc) => loc && present(loc.lat) && present(loc.lng))
    .map((loc) => distanceKm(hLat, hLng, loc.lat, loc.lng));

  if (distances.length === 0) return true;
  return Math.min(...distances) <= radiusKm;
}

// ── Recipient resolution ─────────────────────────────────────────────────────

const HELPER_GROUPS = new Set(['all-helpers', 'all-commuter-helpers', 'all-dedicated-helpers']);

/**
 * Resolves a notification's `userId` — a uid or one of the pseudo-targets the
 * app writes — into the users who should be pushed. Mirrors the switch in
 * OrderMatcher.targets() and _handleNotificationSnapshot.
 */
async function resolveRecipients(db, target) {
  if (!target) return [];

  // Admin segments are evaluated from order history on the client; skip rather
  // than duplicate that logic here.
  if (target.startsWith('segment:')) return [];

  if (!target.startsWith('all')) {
    const snap = await db.doc(`users/${target}`).get();
    if (!snap.exists) return [];
    const profile = snap.data() || {};
    return profile.fcmToken ? [{ uid: snap.id, token: profile.fcmToken, profile }] : [];
  }

  const snap = await db.collection('users').where('fcmToken', '!=', null).get();
  const users = snap.docs.map((d) => ({ uid: d.id, token: d.data().fcmToken, profile: d.data() }));

  const isHelper = (u) => !!u.profile.isHelper;
  const isDedicated = (u) => u.profile.helperType === 'dedicated';
  const isAdmin = (u) => !!u.profile.isAdmin || u.profile.role === 'admin';

  switch (target) {
    case 'all':
      return users;
    case 'all-helpers':
      return users.filter(isHelper);
    case 'all-commuter-helpers':
      return users.filter((u) => isHelper(u) && !isDedicated(u));
    case 'all-dedicated-helpers':
      return users.filter((u) => isHelper(u) && isDedicated(u));
    case 'all-customers':
      return users.filter((u) => !isHelper(u) && !isAdmin(u));
    case 'all-stores':
      return users.filter((u) => !!u.profile.isStoreApproved || u.profile.role === 'store');
    default:
      logger.warn('Unknown broadcast target, nobody pushed', { target });
      return [];
  }
}

/** Drops helpers outside the dispatch radius for a new-order broadcast. */
async function applyGeofence(db, recipients, notif) {
  if (notif.type !== 'new_order') return recipients;
  if (!HELPER_GROUPS.has(notif.userId)) return recipients;
  if (!notif.orderId) return recipients;

  const orderSnap = await db.doc(`orders/${notif.orderId}`).get();
  if (!orderSnap.exists) return recipients; // Cannot verify — a missed order costs more than a spurious alert.
  const order = orderSnap.data();

  let radiusKm = DEFAULT_RADIUS_KM;
  try {
    const pricing = await db.doc('settings/pricing').get();
    const configured = pricing.exists && pricing.data().helperRadiusKm;
    if (typeof configured === 'number' && configured > 0) radiusKm = configured;
  } catch (e) {
    logger.warn('pricing settings unreadable, using default radius', { error: e.message });
  }

  return recipients.filter((r) => withinRadius(r.profile.helperLocation, order, radiusKm));
}

// ── Send ─────────────────────────────────────────────────────────────────────

/** FCM data values must all be strings; undefined keys are dropped. */
function buildData(notifId, notif) {
  const data = {
    tag: notifId,
    title: notif.title || 'Jamanot',
    body: notif.body || '',
    userId: notif.userId || '',
    type: notif.type || 'order_update',
  };
  if (notif.orderId) data.orderId = String(notif.orderId);
  return data;
}

async function removeStaleTokens(db, uids) {
  await Promise.all(
    [...new Set(uids)].map((uid) =>
      db
        .doc(`users/${uid}`)
        .update({ fcmToken: FieldValue.delete() })
        .catch((e) => logger.warn('token cleanup failed', { uid, error: e.message }))
    )
  );
}

exports.pushOnNotificationCreate = onDocumentCreated(
  {
    document: 'notifications/{notifId}',
    region: REGION,
    // Cost guardrails. The work per notification is a few Firestore reads and
    // one FCM call, so the smallest instance is plenty, and capping instances
    // means a burst of writes can never scale this into a surprise bill.
    memory: '256MiB',
    maxInstances: 10,
    timeoutSeconds: 60,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const notif = snap.data() || {};
    const notifId = event.params.notifId;

    if (notif.createdAt) {
      const age = Date.now() - new Date(notif.createdAt).getTime();
      if (Number.isFinite(age) && age > MAX_AGE_MS) {
        logger.info('skipped: too old', { notifId, ageMs: age });
        return;
      }
    }

    const db = getFirestore();

    let recipients = await resolveRecipients(db, notif.userId);
    recipients = await applyGeofence(db, recipients, notif);
    if (recipients.length === 0) {
      logger.info('no reachable devices', { notifId, target: notif.userId });
      return;
    }

    // One device token can belong to several accounts (a shared phone); send once
    // per token and let the receiver decide whether it is addressed to it.
    const byToken = new Map();
    for (const r of recipients) {
      if (!r.token) continue;
      const uids = byToken.get(r.token) || [];
      uids.push(r.uid);
      byToken.set(r.token, uids);
    }

    const tokens = [...byToken.keys()];
    const data = buildData(notifId, notif);
    const messaging = getMessaging();

    let sent = 0;
    const staleUids = [];

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const res = await messaging.sendEachForMulticast({
        tokens: batch,
        data,
        android: {
          priority: 'high', // Wakes an idle or app-standby device.
          ttl: TTL_MS,
        },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: { aps: { 'content-available': 1, sound: 'default' } },
        },
      });

      sent += res.successCount;
      res.responses.forEach((r, idx) => {
        if (r.success) return;
        const code = r.error && r.error.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          staleUids.push(...(byToken.get(batch[idx]) || []));
        } else {
          logger.warn('push failed', { notifId, code });
        }
      });
    }

    if (staleUids.length > 0) await removeStaleTokens(db, staleUids);

    logger.info('push fan-out complete', {
      notifId,
      target: notif.userId,
      type: notif.type,
      devices: tokens.length,
      sent,
      stale: staleUids.length,
    });
  }
);

// Exported for the offline test harness only; nothing in the deployed function
// reads this. See functions/test/logic.test.js.
exports._internals = { withinRadius, resolveRecipients, applyGeofence, buildData };
