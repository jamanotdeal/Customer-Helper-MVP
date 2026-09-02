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
const { withinRadius, resolveRecipients, applyGeofence, buildData } = require('../index.js')._internals;

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
        where() {
          return {
            async get() {
              // Real Firestore's `where('fcmToken','!=',null)` only returns docs
              // that have the field, so the mock must too.
              const docs = Object.entries(users)
                .filter(([, u]) => !!u.fcmToken)
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

  console.log('\n' + passed + ' passed');
})();
