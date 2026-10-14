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

const crypto = require('node:crypto');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
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

/**
 * Older documents are a backfill or a retry storm, not news worth waking a phone
 * for. Measured from the document's server create time — the sender's own
 * clock (notif.createdAt) can be minutes off on a phone with manual time, and
 * judging by it silently dropped every push from such a phone.
 */
const MAX_AGE_MS = 10 * 60 * 1000;

/** Extra in-process attempts for tokens that failed transiently, and the waits before them. */
const RETRY_DELAYS_MS = [500, 2000];

/**
 * FCM errors worth trying again: the service, not the token or the message,
 * was the problem. Everything else is either a dead token (removed) or a bug in
 * the message (logged; retrying would fail the same way).
 */
const TRANSIENT_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unknown-error',
  'messaging/message-rate-exceeded',
  'messaging/quota-exceeded',
  'app/network-error',
  'app/network-timeout',
]);

/** The token no longer belongs to an installed app. Nothing else proves that. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** FCM caps a data payload at 4 KB; Bengali is 3 bytes a character. */
const MAX_TITLE_CHARS = 120;
const MAX_BODY_CHARS = 600;

/** How long a pushLog entry is kept (set a TTL policy on `expireAt` to purge them). */
const PUSH_LOG_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** An order alert nobody saw within the hour is stale; do not deliver it late. */
const TTL_MS = 60 * 60 * 1000;

/** sendEachForMulticast's per-call cap. */
const BATCH_SIZE = 500;

/** Pseudo-target every dedicated-routing announcement is addressed to. */
const DEDICATED_TARGET = 'all-dedicated-helpers';

/** Matches DEFAULT_PRICING_SETTINGS.dedicatedHelperDelayMinutes in src/lib/pricing.ts. */
const DEFAULT_DEDICATED_DELAY_MIN = 7;

/** Most orders the sweep will route in one pass; a bigger backlog waits for the next minute. */
const SWEEP_MAX_ORDERS = 25;

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

/**
 * Every device registered for an account. `fcmTokens` holds one token per
 * signed-in device; `fcmToken` is the newest of them, and the only one older
 * app versions write. An account used on a phone and in a browser used to keep
 * just whichever registered last — so signing in to the website silently
 * stopped the phone from being woken.
 */
function tokensOf(profile) {
  const out = new Set();
  if (profile && typeof profile.fcmToken === 'string' && profile.fcmToken) out.add(profile.fcmToken);
  if (profile && Array.isArray(profile.fcmTokens)) {
    profile.fcmTokens.forEach((t) => {
      if (typeof t === 'string' && t) out.add(t);
    });
  }
  return [...out];
}

/** Short, stable stand-in for a token in logs and pushLog — never the token itself. */
function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

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
    const tokens = tokensOf(profile);
    return tokens.length ? [{ uid: snap.id, tokens, profile }] : [];
  }

  // Every client that registers a device also writes fcmToken (see
  // saveFcmToken), and the token cleanup below keeps it set ('' at worst)
  // while fcmTokens has entries — so this still finds every reachable user.
  const snap = await db.collection('users').where('fcmToken', '!=', null).get();
  const users = snap.docs
    .map((d) => ({ uid: d.id, tokens: tokensOf(d.data()), profile: d.data() }))
    .filter((u) => u.tokens.length > 0);

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

/**
 * A store notification is addressed to the shop's owner (resolveShopOwnerId in
 * firebase.ts), but a shop can be run from other accounts too: any user whose
 * `storeId` is that shop gets its dashboard. Those accounts were never pushed,
 * so with the app in the background — on Transsion phones, frozen — a new shop
 * order reached nobody but the owner. Adds them, alongside the owner.
 *
 * Only for direct-uid notifications marked targetRole 'store'; everything else
 * passes through untouched.
 */
async function addStoreAccounts(db, recipients, notif) {
  const owner = notif && notif.userId;
  if (!owner || notif.targetRole !== 'store' || owner.startsWith('all') || owner.startsWith('segment:')) {
    return recipients;
  }

  const shopIds = new Set([`store-${owner}`]);
  try {
    const owned = await db.collection('shops').where('ownerUserId', '==', owner).get();
    owned.docs.forEach((d) => shopIds.add(d.id));
  } catch (e) {
    logger.warn('owned shops unreadable, using the store-<uid> id only', { owner, error: e.message });
  }

  let linked;
  try {
    // `in` takes up to 30 values; an owner with more shops than that is not a thing.
    linked = await db.collection('users').where('storeId', 'in', [...shopIds].slice(0, 30)).get();
  } catch (e) {
    logger.warn('store accounts unreadable, pushing the owner only', { owner, error: e.message });
    return recipients;
  }

  const seen = new Set(recipients.map((r) => r.uid));
  const out = [...recipients];
  linked.docs.forEach((d) => {
    const profile = d.data() || {};
    const tokens = tokensOf(profile);
    if (seen.has(d.id) || tokens.length === 0 || !shopIds.has(profile.storeId)) return;
    seen.add(d.id);
    out.push({ uid: d.id, tokens, profile });
  });
  return out;
}

/** Drops helpers outside the dispatch radius for a new-order broadcast. */
async function applyGeofence(db, recipients, notif) {
  if (notif.type !== 'new_order') return recipients;
  if (!HELPER_GROUPS.has(notif.userId)) return recipients;
  if (!notif.orderId) return recipients;

  const orderSnap = await db.doc(`orders/${notif.orderId}`).get();
  if (!orderSnap.exists) return recipients; // Cannot verify — a missed order costs more than a spurious alert.
  const order = orderSnap.data();

  // Taken or cancelled before the push went out: every phone would drop it
  // without showing anything, and FCM lowers the priority of an app whose
  // high-priority pushes keep producing nothing visible — which is what then
  // makes the *next* order late on those phones.
  if (!isOrderOpen(order)) {
    logger.info('skipped: order no longer open', { orderId: notif.orderId, status: order && order.status });
    return [];
  }

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

/**
 * Same question OrderMatcher.isOrderOpen asks on the phone. A document with no
 * status is not judged — only an explicit answer closes an order.
 */
function isOrderOpen(order) {
  if (!order) return true;
  if (order.status && order.status !== 'PENDING') return false;
  if (typeof order.helperId === 'string' && order.helperId.trim()) return false;
  if (order.cancellationRequest && order.cancellationRequest.status === 'APPROVED') return false;
  return true;
}

// ── Dedicated routing ─────────────────────────────────────────────

/**
 * An order nobody accepted within `dedicatedHelperDelayMinutes` is announced to
 * dedicated riders. That decision used to be made by every signed-in client on
 * its own 30-second timer, and a pending order sits in the cache of all of them
 * at once — so N devices announced it N times. One order in production
 * accumulated 25 separate notifications this way.
 *
 * The sweep below makes the server the authoritative router. Clients keep a
 * fallback copy (see checkDedicatedRouting in src/lib/firebase.ts) that waits an
 * extra grace period, so routing still happens if this function is undeployed or
 * failing — it just never wins the race in normal operation.
 *
 * Two independent guards make a duplicate impossible rather than unlikely:
 *
 *  1. The claim below is a transaction on the order. Whoever writes
 *     `dedicatedNotifId` first owns the announcement; everyone else reads it and
 *     stops.
 *  2. The id is derived from the order, never from a clock, so even two writers
 *     racing past guard 1 address the same document.
 */

/** settings/pricing changes rarely; one read per warm instance per minute is plenty. */
let _pricingCache = { at: 0, data: null };

async function readPricing(db) {
  if (Date.now() - _pricingCache.at < 60 * 1000 && _pricingCache.data) {
    return _pricingCache.data;
  }
  try {
    const snap = await db.doc('settings/pricing').get();
    _pricingCache = { at: Date.now(), data: snap.exists ? snap.data() : {} };
  } catch (e) {
    logger.warn('pricing unreadable, using defaults', { error: e.message });
    _pricingCache = { at: Date.now(), data: _pricingCache.data || {} };
  }
  return _pricingCache.data;
}

/**
 * The one id an order's dedicated announcement can ever have.
 *
 * Identical to the expression in checkDedicatedRouting, and already in
 * canonicalNotifId's `notif-<13 digits>` shape so the client stores it verbatim.
 * Seeded from the order's own createdAt rather than the routing moment: two
 * writers whose clocks differ must still agree.
 */
function dedicatedNotifId(orderId, createdAtMs) {
  return `notif-${createdAtMs}-ded-${orderId}`;
}

function dedicatedDelayMinutes(pricing) {
  const v = pricing && pricing.dedicatedHelperDelayMinutes;
  return typeof v === 'number' && v > 0 ? v : DEFAULT_DEDICATED_DELAY_MIN;
}

/**
 * Claims the announcement for one order and writes it, atomically.
 *
 * @returns the notification id if this call created it, null if it was already
 *          claimed or the order stopped being eligible.
 */
async function claimAndAnnounce(db, orderId, delayMins) {
  const orderRef = db.doc(`orders/${orderId}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return null;
    const order = snap.data() || {};

    // Re-checked inside the transaction: the order may have been accepted or
    // routed between the query and here.
    if (order.status !== 'PENDING') return null;
    if (order.dedicatedNotifId || order.routedToDedicated) return null;

    const createdAtMs = new Date(order.createdAt).getTime();
    if (!Number.isFinite(createdAtMs)) return null;

    const notifId = dedicatedNotifId(orderId, createdAtMs);
    const routedAt = new Date().toISOString();
    const items = Array.isArray(order.items) ? order.items : [];
    const itemDesc = items.map((i) => i && i.name).filter(Boolean).join(', ') || order.title || '';

    tx.set(db.doc(`notifications/${notifId}`), {
      id: notifId,
      userId: DEDICATED_TARGET,
      title: '[ডেডিকেটেড রাইডার] অর্ডার গ্রহণ করতে পারেন!',
      body: `${order.title}: ${itemDesc} - ${delayMins} মিনিট পার হয়েছে।`,
      orderId,
      read: false,
      createdAt: routedAt,
      // For a dedicated rider this *is* the new order: typed as one so it gets
      // the radius filter below and, on the phone, the alarm and the popup —
      // untyped, it arrived as a plain status notification.
      type: 'new_order',
      targetRole: 'helper',
    });

    tx.set(
      orderRef,
      { routedToDedicated: true, dedicatedNotifiedAt: routedAt, dedicatedNotifId: notifId },
      { merge: true }
    );

    return notifId;
  });
}

exports.dedicatedRoutingSweep = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: REGION,
    memory: '256MiB',
    // One writer at a time. Not required for correctness — the transaction
    // handles that — but it keeps the read volume flat and predictable.
    maxInstances: 1,
    timeoutSeconds: 120,
  },
  async () => {
    const db = getFirestore();
    const pricing = await readPricing(db);
    const delayMins = dedicatedDelayMinutes(pricing);
    const cutoff = new Date(Date.now() - delayMins * 60 * 1000).toISOString();

    // createdAt is an ISO-8601 UTC string on every order the app writes, so it
    // orders lexicographically and this range scan is exact.
    let due;
    try {
      due = await db
        .collection('orders')
        .where('status', '==', 'PENDING')
        .where('createdAt', '<=', cutoff)
        .orderBy('createdAt', 'asc')
        .limit(SWEEP_MAX_ORDERS)
        .get();
    } catch (e) {
      // Almost always the (status, createdAt) composite index not being
      // deployed yet. Log and return rather than throw: the client fallback
      // in checkDedicatedRouting still routes, 90 s later than this would.
      logger.error('dedicated sweep query failed — deploy firestore.indexes.json', {
        error: e.message,
      });
      return;
    }

    if (due.empty) return;

    let announced = 0;
    for (const doc of due.docs) {
      const order = doc.data() || {};
      if (order.dedicatedNotifId || order.routedToDedicated) continue;
      try {
        const notifId = await claimAndAnnounce(db, doc.id, delayMins);
        if (notifId) {
          announced++;
          logger.info('dedicated routing announced', { orderId: doc.id, notifId });
        }
      } catch (e) {
        logger.warn('dedicated routing failed for order', { orderId: doc.id, error: e.message });
      }
    }

    logger.info('dedicated routing sweep complete', {
      candidates: due.size,
      announced,
      delayMins,
    });
  }
);

/**
 * Suppresses a dedicated announcement written by a client that does not have the
 * deterministic-id fix — an old APK or a stale web session. Such a client stamps
 * its own clock into the id, so it lands as a *new* document that no de-dup set
 * can recognise.
 *
 * The order carries the id of the announcement that won. Anything else for the
 * same order is a duplicate: it is deleted and never pushed. This is what makes
 * the guarantee hold across app versions rather than only within the fixed one.
 *
 * @returns true when the caller should stop (duplicate handled).
 */
async function suppressDuplicateDedicated(db, notifId, notif) {
  if (notif.userId !== DEDICATED_TARGET || !notif.orderId) return false;

  const orderRef = db.doc(`orders/${notif.orderId}`);
  let owner;
  try {
    owner = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) return notifId; // Cannot verify — let it through.
      const existing = (snap.data() || {}).dedicatedNotifId;
      if (existing) return existing;
      // routedToDedicated is set alongside the claim because a client without
      // the fix gates only on that field — it has never heard of
      // dedicatedNotifId. Stamping both here is what stops an old app from
      // announcing the same order again on its next tick.
      tx.set(
        orderRef,
        {
          dedicatedNotifId: notifId,
          routedToDedicated: true,
          dedicatedNotifiedAt: (snap.data() || {}).dedicatedNotifiedAt || new Date().toISOString(),
        },
        { merge: true }
      );
      return notifId;
    });
  } catch (e) {
    logger.warn('dedicated claim check failed, delivering anyway', {
      notifId,
      error: e.message,
    });
    return false;
  }

  if (owner === notifId) return false;

  try {
    await db.doc(`notifications/${notifId}`).delete();
  } catch (e) {
    logger.warn('duplicate cleanup failed', { notifId, error: e.message });
  }
  logger.info('suppressed duplicate dedicated announcement', {
    notifId,
    orderId: notif.orderId,
    keptInstead: owner,
  });
  return true;
}

// ── Send ─────────────────────────────────────────────────────────────────────

function clip(text, max) {
  const s = String(text || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * FCM data values must all be strings; undefined keys are dropped.
 *
 * `createdAtMs` (server time the notification was written) and `sentAt` (when
 * this function handed it to FCM) let the phone log how late it arrived.
 */
function buildData(notifId, notif, timing = {}) {
  const data = {
    tag: notifId,
    title: clip(notif.title || 'Jamanot', MAX_TITLE_CHARS),
    body: clip(notif.body, MAX_BODY_CHARS),
    userId: notif.userId || '',
    type: notif.type || 'order_update',
  };
  if (notif.orderId) data.orderId = String(notif.orderId);
  if (timing.createdAtMs) data.createdAtMs = String(timing.createdAtMs);
  if (timing.sentAt) data.sentAt = String(timing.sentAt);
  return data;
}

/**
 * Removes dead tokens from the accounts that held them. fcmToken is moved to
 * another of the account's devices rather than deleted, so the account stays
 * visible to the broadcast query while it still has one.
 */
async function removeDeadTokens(db, deadByUid) {
  await Promise.all(
    [...deadByUid.entries()].map(([uid, dead]) =>
      db
        .runTransaction(async (tx) => {
          const ref = db.doc(`users/${uid}`);
          const snap = await tx.get(ref);
          if (!snap.exists) return;
          const profile = snap.data() || {};
          const remaining = tokensOf(profile).filter((t) => !dead.has(t));
          const update = { fcmTokens: remaining };
          if (dead.has(profile.fcmToken)) update.fcmToken = remaining[remaining.length - 1] || '';
          tx.set(ref, update, { merge: true });
        })
        .catch((e) => logger.warn('token cleanup failed', { uid, error: e.message }))
    )
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends to every token, retrying the ones that failed for a transient reason.
 *
 * @returns per-token outcome: 'sent' | 'dead' | 'transient' | 'failed:<code>'
 */
async function sendWithRetry(messaging, tokens, message, notifId) {
  const outcome = new Map();
  let pending = tokens;
  for (let attempt = 0; pending.length > 0; attempt++) {
    const retryLater = [];
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      let res;
      try {
        res = await messaging.sendEachForMulticast({ ...message, tokens: batch });
      } catch (e) {
        // The whole call failed (network, auth): every token in it is unsent.
        logger.warn('push call failed', { notifId, attempt, error: e.message, code: e.code });
        batch.forEach((t) => {
          outcome.set(t, 'transient');
          retryLater.push(t);
        });
        continue;
      }
      res.responses.forEach((r, idx) => {
        const token = batch[idx];
        if (r.success) return outcome.set(token, 'sent');
        const code = (r.error && r.error.code) || 'unknown';
        if (DEAD_TOKEN_CODES.has(code)) return outcome.set(token, 'dead');
        if (TRANSIENT_CODES.has(code)) {
          outcome.set(token, 'transient');
          retryLater.push(token);
          return;
        }
        // invalid-argument and friends: the message, not the device, is wrong.
        // These used to delete the recipients' tokens, unregistering phones
        // that had done nothing wrong.
        outcome.set(token, `failed:${code}`);
        logger.error('push rejected', { notifId, code, detail: r.error && r.error.message });
      });
    }
    if (retryLater.length === 0 || attempt >= RETRY_DELAYS_MS.length) break;
    await sleep(RETRY_DELAYS_MS[attempt]);
    pending = retryLater;
  }
  return outcome;
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
    // A failed run (Firestore unreadable, FCM down after the in-process
    // retries) is run again by the platform instead of the push being lost.
    // pushLog makes a re-run send only to the devices still missing it, and
    // MAX_AGE_MS ends the retries once the alert would be stale anyway.
    retry: true,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const startedAt = Date.now();
    const notif = snap.data() || {};
    const notifId = event.params.notifId;

    const createdAtMs = snap.createTime ? snap.createTime.toMillis() : Date.parse(event.time) || startedAt;
    const clientCreatedMs = notif.createdAt ? Date.parse(notif.createdAt) : NaN;
    const timing = {
      notifId,
      type: notif.type,
      target: notif.userId,
      orderId: notif.orderId,
      // How late the trigger fired (event delivery + cold start).
      triggerLagMs: startedAt - createdAtMs,
      // The sender's clock against the server's; large values explain odd ids/ages.
      senderClockSkewMs: Number.isFinite(clientCreatedMs) ? clientCreatedMs - createdAtMs : null,
    };

    const age = startedAt - createdAtMs;
    if (age > MAX_AGE_MS) {
      logger.info('skipped: too old', { ...timing, ageMs: age });
      return;
    }

    const db = getFirestore();
    const logRef = db.doc(`pushLog/${notifId}`);

    // A re-run after a partial failure: skip the devices already reached.
    const prior = await logRef.get();
    const priorData = prior.exists ? prior.data() || {} : {};
    if (priorData.status === 'done') return;
    const alreadySent = new Set(priorData.sentTokenHashes || []);

    // A duplicate written by a client without the deterministic-id fix is
    // removed here, before it can become a push or a tray entry.
    if (await suppressDuplicateDedicated(db, notifId, notif)) return;

    let recipients = await resolveRecipients(db, notif.userId);
    recipients = await addStoreAccounts(db, recipients, notif);
    recipients = await applyGeofence(db, recipients, notif);
    const resolvedAt = Date.now();

    // One device token can belong to several accounts (a shared phone); send once
    // per token and let the receiver decide whether it is addressed to it.
    const byToken = new Map();
    for (const r of recipients) {
      for (const token of r.tokens || []) {
        const uids = byToken.get(token) || [];
        uids.push(r.uid);
        byToken.set(token, uids);
      }
    }
    const tokens = [...byToken.keys()].filter((t) => !alreadySent.has(tokenHash(t)));

    if (byToken.size === 0) {
      logger.info('no reachable devices', { ...timing, resolveMs: resolvedAt - startedAt });
      return;
    }

    const sentAt = Date.now();
    const message = {
      data: buildData(notifId, notif, { createdAtMs, sentAt }),
      android: {
        priority: 'high', // Wakes an idle or app-standby device.
        ttl: TTL_MS,
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { 'content-available': 1, sound: 'default' } },
      },
    };
    const outcome = await sendWithRetry(getMessaging(), tokens, message, notifId);
    const providerMs = Date.now() - sentAt;

    const deadByUid = new Map();
    let sent = 0;
    let transient = 0;
    const failures = {};
    outcome.forEach((result, token) => {
      if (result === 'sent') {
        sent++;
        alreadySent.add(tokenHash(token));
      } else if (result === 'dead') {
        (byToken.get(token) || []).forEach((uid) => {
          const set = deadByUid.get(uid) || new Set();
          set.add(token);
          deadByUid.set(uid, set);
        });
      } else if (result === 'transient') {
        transient++;
      } else {
        failures[result] = (failures[result] || 0) + 1;
      }
    });
    if (deadByUid.size > 0) await removeDeadTokens(db, deadByUid);

    const summary = {
      ...timing,
      devices: byToken.size,
      skippedAlreadySent: byToken.size - tokens.length,
      sent,
      dead: [...deadByUid.values()].reduce((n, set) => n + set.size, 0),
      transient,
      failures,
      resolveMs: resolvedAt - startedAt,
      providerMs,
      // Notification written → FCM accepted it. The phone logs the rest.
      endToEndMs: Date.now() - createdAtMs,
    };

    try {
      // JSON round trip drops undefined fields (a notification without an
      // orderId), which Firestore would reject — and a failed log write must
      // never fail the push itself.
      const entry = JSON.parse(
        JSON.stringify({
          ...summary,
          status: transient > 0 ? 'partial' : 'done',
          notifCreatedAt: new Date(createdAtMs).toISOString(),
          sentAt: new Date(sentAt).toISOString(),
          sentTokenHashes: [...alreadySent],
          attempts: (priorData.attempts || 0) + 1,
        })
      );
      entry.expireAt = new Date(Date.now() + PUSH_LOG_TTL_MS);
      await logRef.set(entry, { merge: true });
    } catch (e) {
      logger.warn('pushLog write failed', { notifId, error: e.message });
    }

    logger.info('push fan-out complete', summary);

    // Some devices are still unreached for a reason that may pass: let the
    // platform run this again (retry: true). They alone are sent to next time.
    if (transient > 0) throw new Error(`${transient} device(s) failed transiently`);
  }
);

// Exported for the offline test harness only; nothing in the deployed function
// reads this. See functions/test/logic.test.js.
exports._internals = {
  tokensOf,
  tokenHash,
  isOrderOpen,
  sendWithRetry,
  clip,
  withinRadius,
  resolveRecipients,
  addStoreAccounts,
  applyGeofence,
  buildData,
  dedicatedNotifId,
  dedicatedDelayMinutes,
};
