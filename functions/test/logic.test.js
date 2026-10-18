/**
 * Offline tests for the parts of the push sender that decide *who* gets woken.
 * No emulator and no credentials: the Firestore handle is mocked, so this runs
 * anywhere with `npm test`.
 *
 * The targeting rules here have to agree with three other places — the switch in
 * OrderMatcher.targets() (Java), the `targets` expression in
 * _handleNotificationSnapshot (TS), and initListenersForRole's target lists. A
 * mismatch means someone is either woken for other people's work or misses
 * their own, which is exactly the class of bug this whole path exists to avoid.
 */

process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'test' });
process.env.GCLOUD_PROJECT = 'test';

const assert = require('node:assert');
const {
  tokensOf,
  tokenHash,
  isOrderOpen,
  sendWithRetry,
  withinRadius,
  resolveRecipients,
  addStoreAccounts,
  applyGeofence,
  buildData,
  dedicatedNotifId,
  dedicatedDelayMinutes,
} = require('../index.js')._internals;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('  FAIL ' + name + '\n       ' + e.message);
    process.exitCode = 1;
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('  FAIL ' + name + '\n       ' + e.message);
    process.exitCode = 1;
  }
}

/** Minimal stand-in for the admin Firestore handle. */
function mockDb({ users = {}, orders = {}, pricing = null }) {
  return {
    doc(path) {
      const [col, id] = path.split('/');
      const store = col === 'users' ? users : col === 'orders' ? orders : { pricing };
      const data = store[id];
      return {
        async get() {
          return { exists: !!data, id, data: () => data };
        },
      };
    },
    collection() {
      return {
        where(field, op, value) {
          return {
            async get() {
              // Real Firestore's `where('fcmToken','!=',null)` only returns docs
              // that have the field, so the mock must too.
              const docs = Object.entries(users)
                .filter(([, u]) => (op === '!=' ? u[field] !== undefined && u[field] !== value : u[field] === value))
                .map(([id, u]) => ({ id, data: () => u }));
              return { docs };
            },
          };
        },
      };
    },
  };
}

// Dhaka-ish coordinates; ~1.1 km apart at 0.01 degrees of latitude.
const PICKUP = { lat: 23.8103, lng: 90.4125 };
const NEAR = { lat: 23.8153, lng: 90.4125 };   // ~0.55 km
const FAR = { lat: 23.9103, lng: 90.4125 };    // ~11 km

const USERS = {
  'helper-near': { fcmToken: 't-near', isHelper: true, helperType: 'dedicated', helperLocation: NEAR },
  'helper-far': { fcmToken: 't-far', isHelper: true, helperType: 'commuter', helperLocation: FAR },
  'helper-nogps': { fcmToken: 't-nogps', isHelper: true, helperType: 'commuter' },
  'customer-1': { fcmToken: 't-cust', isHelper: false, role: 'customer' },
  'store-1': { fcmToken: 't-store', isStoreApproved: true, role: 'customer' },
  'admin-1': { fcmToken: 't-admin', isAdmin: true, role: 'admin' },
  'no-device': { isHelper: true, helperType: 'commuter' },
};

const uids = (rs) => rs.map((r) => r.uid).sort();

console.log('geofence');

test('helper inside the radius is kept', () => {
  assert.strictEqual(withinRadius(NEAR, { pickupLocation: PICKUP }, 3.5), true);
});

test('helper outside the radius is dropped', () => {
  assert.strictEqual(withinRadius(FAR, { pickupLocation: PICKUP }, 3.5), false);
});

test('helper with no location is kept (no GPS fix must not cost them work)', () => {
  assert.strictEqual(withinRadius(undefined, { pickupLocation: PICKUP }, 3.5), true);
});

test('order with no coordinates is kept', () => {
  assert.strictEqual(withinRadius(NEAR, {}, 3.5), true);
});

test('a coordinate of exactly 0 counts as missing, matching pricing.ts', () => {
  assert.strictEqual(withinRadius({ lat: 0, lng: 0 }, { pickupLocation: PICKUP }, 3.5), true);
});

test('delivery end counts too when pickup is far', () => {
  const order = { pickupLocation: FAR, deliveryLocation: NEAR };
  assert.strictEqual(withinRadius(NEAR, order, 3.5), true);
});

console.log('recipient resolution');

(async () => {
  const db = mockDb({ users: USERS });

  await testAsync('direct uid resolves to that one device', async () => {
    assert.deepStrictEqual(uids(await resolveRecipients(db, 'customer-1')), ['customer-1']);
  });

  await testAsync('user with no token resolves to nobody', async () => {
    assert.deepStrictEqual(await resolveRecipients(db, 'no-device'), []);
  });

  await testAsync('unknown uid resolves to nobody', async () => {
    assert.deepStrictEqual(await resolveRecipients(db, 'ghost'), []);
  });

  await testAsync('all-helpers reaches every helper with a device', async () => {
    assert.deepStrictEqual(uids(await resolveRecipients(db, 'all-helpers')), [
      'helper-far',
      'helper-near',
      'helper-nogps',
    ]);
  });

  await testAsync('all-dedicated-helpers excludes commuters', async () => {
    assert.deepStrictEqual(uids(await resolveRecipients(db, 'all-dedicated-helpers')), ['helper-near']);
  });

  await testAsync('all-commuter-helpers excludes dedicated riders', async () => {
    assert.deepStrictEqual(uids(await resolveRecipients(db, 'all-commuter-helpers')), [
      'helper-far',
      'helper-nogps',
    ]);
  });

  await testAsync('a helper whose newest device logged out is still reached through fcmTokens', async () => {
    const helperDb = mockDb({
      users: { ...USERS, 'helper-other-device': { fcmToken: '', fcmTokens: ['t-tablet'], isHelper: true } },
    });
    assert.ok(uids(await resolveRecipients(helperDb, 'all-helpers')).includes('helper-other-device'));
  });

  await testAsync('helper groups never reach a non-helper', async () => {
    const helperDb = mockDb({ users: { ...USERS, 'customer-2': { fcmToken: 't-c2', isHelper: false } } });
    assert.ok(!uids(await resolveRecipients(helperDb, 'all-helpers')).includes('customer-2'));
  });

  await testAsync('all-customers excludes helpers and admins', async () => {
    assert.deepStrictEqual(uids(await resolveRecipients(db, 'all-customers')), ['customer-1', 'store-1']);
  });

  await testAsync('all-stores reaches approved stores only', async () => {
    assert.deepStrictEqual(uids(await resolveRecipients(db, 'all-stores')), ['store-1']);
  });

  await testAsync('all reaches every device', async () => {
    assert.strictEqual((await resolveRecipients(db, 'all')).length, 6);
  });

  await testAsync('admin segments are left to the client', async () => {
    assert.deepStrictEqual(await resolveRecipients(db, 'segment:loyal'), []);
  });

  await testAsync('an unknown broadcast target wakes nobody', async () => {
    assert.deepStrictEqual(await resolveRecipients(db, 'all-somethings'), []);
  });

  console.log('geofence applied to a broadcast');

  const geoDb = mockDb({
    users: USERS,
    orders: { 'order-1': { pickupLocation: PICKUP, deliveryLocation: PICKUP } },
    pricing: { helperRadiusKm: 3.5 },
  });
  const everyone = await resolveRecipients(geoDb, 'all-helpers');

  await testAsync('new_order broadcast drops helpers outside the radius', async () => {
    const notif = { type: 'new_order', userId: 'all-helpers', orderId: 'order-1' };
    assert.deepStrictEqual(uids(await applyGeofence(geoDb, everyone, notif)), ['helper-near', 'helper-nogps']);
  });

  await testAsync('status updates are never geofenced', async () => {
    const notif = { type: 'order_update', userId: 'all-helpers', orderId: 'order-1' };
    assert.strictEqual((await applyGeofence(geoDb, everyone, notif)).length, 3);
  });

  await testAsync('a direct-uid new_order is never geofenced', async () => {
    const notif = { type: 'new_order', userId: 'store-1', orderId: 'order-1' };
    const direct = await resolveRecipients(geoDb, 'store-1');
    assert.strictEqual((await applyGeofence(geoDb, direct, notif)).length, 1);
  });

  await testAsync('a missing order alerts everyone rather than nobody', async () => {
    const notif = { type: 'new_order', userId: 'all-helpers', orderId: 'gone' };
    assert.strictEqual((await applyGeofence(geoDb, everyone, notif)).length, 3);
  });

  console.log('store accounts');

  // A shop run by its owner and by a second account linked through storeId.
  const storeUsers = {
    owner: { fcmToken: 't-owner', storeId: 'store-owner' },
    staff: { fcmToken: 't-staff', storeId: 'store-owner' },
    'staff-nodevice': { storeId: 'store-owner' },
    other: { fcmToken: 't-other', storeId: 'store-elsewhere' },
  };
  const storeDb = {
    ...mockDb({ users: storeUsers }),
    collection(name) {
      return {
        where(field, op, value) {
          return {
            async get() {
              const rows = name === 'users' ? storeUsers : {};
              const docs = Object.entries(rows)
                .filter(([, u]) => (op === 'in' ? value.includes(u[field]) : u[field] === value))
                .map(([id, u]) => ({ id, data: () => u }));
              return { docs };
            },
          };
        },
      };
    },
  };

  await testAsync('a store notification also reaches accounts linked to the shop', async () => {
    const notif = { type: 'new_order', userId: 'owner', targetRole: 'store', orderId: 'o1' };
    const owner = await resolveRecipients(storeDb, 'owner');
    assert.deepStrictEqual(uids(await addStoreAccounts(storeDb, owner, notif)), ['owner', 'staff']);
  });

  await testAsync('accounts linked to the shop are added even when the owner has no device', async () => {
    const notif = { type: 'new_order', userId: 'owner', targetRole: 'store', orderId: 'o1' };
    assert.deepStrictEqual(uids(await addStoreAccounts(storeDb, [], notif)), ['owner', 'staff']);
  });

  await testAsync('non-store notifications are left alone', async () => {
    const notif = { type: 'new_order', userId: 'owner', targetRole: 'helper', orderId: 'o1' };
    const owner = await resolveRecipients(storeDb, 'owner');
    assert.deepStrictEqual(uids(await addStoreAccounts(storeDb, owner, notif)), ['owner']);
  });

  await testAsync('broadcasts are left alone', async () => {
    const notif = { type: 'new_order', userId: 'all-stores', targetRole: 'store' };
    assert.deepStrictEqual(await addStoreAccounts(storeDb, [], notif), []);
  });

  console.log('payload');

  test('every data value is a string', () => {
    const data = buildData('notif-1', { title: 'T', body: 'B', userId: 'u1', type: 'new_order', orderId: 16547 });
    Object.entries(data).forEach(([k, v]) => assert.strictEqual(typeof v, 'string', k + ' is not a string'));
    assert.strictEqual(data.orderId, '16547');
    assert.strictEqual(data.tag, 'notif-1', 'tag must carry the document id — it is the de-dup key');
  });

  test('a notification with no order omits orderId entirely', () => {
    const data = buildData('notif-2', { title: 'T', body: 'B', userId: 'u1' });
    assert.ok(!('orderId' in data));
    assert.strictEqual(data.type, 'order_update');
  });

  console.log('dedicated routing');

  test('the announcement id is derived from the order, never from a clock', () => {
    const created = Date.parse('2026-09-08T14:13:10.924Z');
    const a = dedicatedNotifId('90431', created);
    const b = dedicatedNotifId('90431', created);
    assert.strictEqual(a, b, 'two callers must agree on the id');
    assert.strictEqual(a, 'notif-1788876790924-ded-90431');
  });

  test('the id keeps canonicalNotifId\'s notif-<13 digits> shape', () => {
    // Anything else and the client rewrites it on the way in, which would
    // reintroduce a clock and with it the duplicates.
    assert.match(dedicatedNotifId('90431', Date.parse('2026-09-08T14:13:10.924Z')), /^notif-\d{13}-ded-/);
  });

  test('different orders never share an announcement', () => {
    const t = Date.parse('2026-09-08T14:13:10.924Z');
    assert.notStrictEqual(dedicatedNotifId('90431', t), dedicatedNotifId('70255', t));
  });

  test('the delay falls back to 7 minutes when unset or nonsense', () => {
    assert.strictEqual(dedicatedDelayMinutes({ dedicatedHelperDelayMinutes: 1 }), 1);
    assert.strictEqual(dedicatedDelayMinutes({}), 7);
    assert.strictEqual(dedicatedDelayMinutes(null), 7);
    assert.strictEqual(dedicatedDelayMinutes({ dedicatedHelperDelayMinutes: 0 }), 7);
    assert.strictEqual(dedicatedDelayMinutes({ dedicatedHelperDelayMinutes: 'soon' }), 7);
  });

  test('the id matches what production actually wrote', () => {
    // Order 90431 was routed by a client carrying the fix; these are the real
    // values from that write. The server must produce the same string, or the
    // two paths would each create their own document.
    assert.strictEqual(
      dedicatedNotifId('90431', Date.parse('2026-09-08T14:13:10.924Z')),
      'notif-1788876790924-ded-90431'
    );
  });

  console.log('devices per account');

  test('every registered device of an account is pushed, newest field included', () => {
    assert.deepStrictEqual(tokensOf({ fcmToken: 'phone', fcmTokens: ['web', 'phone', '', 7] }).sort(), ['phone', 'web']);
  });

  test('an account from an older app version (fcmToken only) still works', () => {
    assert.deepStrictEqual(tokensOf({ fcmToken: 'phone' }), ['phone']);
  });

  test('an account whose newest device logged out keeps its other devices', () => {
    assert.deepStrictEqual(tokensOf({ fcmToken: '', fcmTokens: ['tablet'] }), ['tablet']);
  });

  await testAsync('a direct uid reaches the phone and the browser alike', async () => {
    const db = mockDb({ users: { both: { fcmToken: 'web', fcmTokens: ['phone', 'web'] } } });
    const [r] = await resolveRecipients(db, 'both');
    assert.deepStrictEqual(r.tokens.sort(), ['phone', 'web']);
  });

  test('token hashes are stable and never the token', () => {
    assert.strictEqual(tokenHash('abc'), tokenHash('abc'));
    assert.notStrictEqual(tokenHash('abc'), tokenHash('abd'));
    assert.ok(!tokenHash('secret-token').includes('secret'));
  });

  console.log('orders already taken');

  test('a pending order nobody took is open', () => {
    assert.strictEqual(isOrderOpen({ status: 'PENDING' }), true);
  });
  test('an accepted or assigned order is not', () => {
    assert.strictEqual(isOrderOpen({ status: 'ACCEPTED' }), false);
    assert.strictEqual(isOrderOpen({ status: 'PENDING', helperId: 'h1' }), false);
  });
  test('an approved cancellation closes it', () => {
    assert.strictEqual(isOrderOpen({ status: 'PENDING', cancellationRequest: { status: 'APPROVED' } }), false);
  });

  await testAsync('a broadcast for an order already taken pushes nobody', async () => {
    const takenDb = mockDb({
      users: USERS,
      orders: { taken: { status: 'ACCEPTED', helperId: 'h9', pickupLocation: PICKUP } },
      pricing: { helperRadiusKm: 3.5 },
    });
    const notif = { type: 'new_order', userId: 'all-helpers', orderId: 'taken' };
    assert.deepStrictEqual(await applyGeofence(takenDb, everyone, notif), []);
  });

  console.log('payload limits and timing');

  test('a long body is clipped well under the 4 KB FCM limit', () => {
    const data = buildData('n1', { title: 'ত'.repeat(500), body: 'ক'.repeat(5000) });
    assert.ok(Buffer.byteLength(JSON.stringify(data)) < 3000, Buffer.byteLength(JSON.stringify(data)) + ' bytes');
  });

  test('timing fields travel as strings', () => {
    const data = buildData('n1', { title: 't' }, { createdAtMs: 1000, sentAt: 2000 });
    assert.strictEqual(data.createdAtMs, '1000');
    assert.strictEqual(data.sentAt, '2000');
  });

  console.log('sending and retries');

  /** Fake FCM: each call takes the next scripted reply per token. */
  function fakeMessaging(script) {
    const calls = [];
    return {
      calls,
      async sendEachForMulticast({ tokens }) {
        calls.push([...tokens]);
        return {
          responses: tokens.map((t) => {
            const next = (script[t] || []).shift() || 'ok';
            return next === 'ok' ? { success: true } : { success: false, error: { code: next, message: next } };
          }),
        };
      },
    };
  }

  await testAsync('a transient failure is retried, and only for that device', async () => {
    const m = fakeMessaging({ b: ['messaging/server-unavailable'] });
    const out = await sendWithRetry(m, ['a', 'b'], { data: {} }, 'n');
    assert.strictEqual(out.get('a'), 'sent');
    assert.strictEqual(out.get('b'), 'sent');
    assert.deepStrictEqual(m.calls, [['a', 'b'], ['b']]);
  });

  await testAsync('a device still failing after the retries is reported as transient', async () => {
    const down = 'messaging/internal-error';
    const m = fakeMessaging({ a: [down, down, down, down] });
    const out = await sendWithRetry(m, ['a'], { data: {} }, 'n');
    assert.strictEqual(out.get('a'), 'transient');
    assert.strictEqual(m.calls.length, 3);
  });

  await testAsync('only an unregistered token counts as dead', async () => {
    const m = fakeMessaging({ gone: ['messaging/registration-token-not-registered'], bad: ['messaging/invalid-argument'] });
    const out = await sendWithRetry(m, ['gone', 'bad'], { data: {} }, 'n');
    assert.strictEqual(out.get('gone'), 'dead');
    // invalid-argument is a message problem: the device keeps its token.
    assert.strictEqual(out.get('bad'), 'failed:messaging/invalid-argument');
    assert.strictEqual(m.calls.length, 1);
  });

  await testAsync('a call that throws outright is retried as a whole', async () => {
    let n = 0;
    const m = {
      async sendEachForMulticast({ tokens }) {
        if (n++ === 0) throw Object.assign(new Error('socket hang up'), { code: 'app/network-error' });
        return { responses: tokens.map(() => ({ success: true })) };
      },
    };
    const out = await sendWithRetry(m, ['a', 'b'], { data: {} }, 'n');
    assert.deepStrictEqual([...out.values()], ['sent', 'sent']);
  });

  console.log('\n' + passed + ' passed');
})();
