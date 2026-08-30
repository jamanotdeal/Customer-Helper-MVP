/**
 * Runs the shared golden vectors against the TypeScript geofence.
 *
 * Its counterpart, OrderMatcherParityTest, runs the same JSON against the Java
 * implementation in the duty service. Both must pass — that pairing is the only
 * thing stopping the web and native dispatch logic from quietly disagreeing
 * about which helpers see which orders.
 *
 *   npm run test:geofence
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, '../src/lib/__fixtures__/geofence-cases.json'), 'utf8')
);

// Mirrors calculateDistanceKm / getOrderMinDistanceKm / isHelperWithinOrderRadius
// in src/lib/pricing.ts. Duplicated rather than imported so this script has no
// TypeScript build step; if pricing.ts changes, this must change with it and the
// cases below will say so.
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getOrderMinDistanceKm(helperLoc, orderLocs) {
  if (!helperLoc?.lat || !helperLoc?.lng) return null;
  const dists = [];
  if (orderLocs?.pickupLocation?.lat && orderLocs?.pickupLocation?.lng) {
    dists.push(calculateDistanceKm(helperLoc.lat, helperLoc.lng,
      orderLocs.pickupLocation.lat, orderLocs.pickupLocation.lng));
  }
  if (orderLocs?.deliveryLocation?.lat && orderLocs?.deliveryLocation?.lng) {
    dists.push(calculateDistanceKm(helperLoc.lat, helperLoc.lng,
      orderLocs.deliveryLocation.lat, orderLocs.deliveryLocation.lng));
  }
  if (dists.length === 0) return null;
  return Math.min(...dists);
}

function isHelperWithinOrderRadius(helperLoc, orderLocs, radiusKm = 3.5) {
  if (!helperLoc?.lat || !helperLoc?.lng) return true;
  const minDist = getOrderMinDistanceKm(helperLoc, orderLocs);
  if (minDist === null) return true;
  return minDist <= radiusKm;
}

let failed = 0;
for (const c of fixture.cases) {
  const actual = isHelperWithinOrderRadius(
    c.helper ?? undefined,
    { pickupLocation: c.pickup ?? undefined, deliveryLocation: c.delivery ?? undefined },
    fixture.radiusKm
  );
  const ok = actual === c.expectedWithin;
  if (!ok) failed++;
  const dist = getOrderMinDistanceKm(c.helper ?? undefined, {
    pickupLocation: c.pickup ?? undefined,
    deliveryLocation: c.delivery ?? undefined,
  });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${c.name}` +
    (dist === null ? '  (no distance)' : `  (${dist.toFixed(3)} km)`) +
    (ok ? '' : `  expected ${c.expectedWithin}, got ${actual}`)
  );
}

console.log(`\n${fixture.cases.length - failed}/${fixture.cases.length} passed`);
process.exit(failed === 0 ? 0 : 1);
