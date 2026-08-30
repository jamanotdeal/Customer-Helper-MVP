package com.jamanot.app.core;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.InputStream;
import java.io.ByteArrayOutputStream;

/**
 * Runs the same golden vectors as {@code npm run test:geofence} against the Java
 * geofence, so the web and native dispatch logic cannot silently disagree about
 * which helpers see which orders.
 *
 * <p>The fixture is copied from src/lib/__fixtures__/geofence-cases.json by the
 * {@code syncGeofenceFixture} Gradle task, so editing the TypeScript-side file is
 * enough — there is no second copy to remember.
 *
 * <p>A plain JVM unit test (no Robolectric): everything under test is static and
 * touches no Android APIs.
 */
public class OrderMatcherParityTest {

    @Test
    public void matchesTypeScriptImplementation() throws Exception {
        JSONObject fixture = new JSONObject(readFixture());
        double radiusKm = fixture.getDouble("radiusKm");
        JSONArray cases = fixture.getJSONArray("cases");

        assertTrue("fixture should not be empty", cases.length() > 0);

        StringBuilder failures = new StringBuilder();

        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            String name = c.getString("name");

            double helperLat = coord(c, "helper", "lat", Double.NaN);
            double helperLng = coord(c, "helper", "lng", Double.NaN);
            Double pickupLat = boxed(c, "pickup", "lat");
            Double pickupLng = boxed(c, "pickup", "lng");
            Double deliveryLat = boxed(c, "delivery", "lat");
            Double deliveryLng = boxed(c, "delivery", "lng");

            boolean expected = c.getBoolean("expectedWithin");
            boolean actual = OrderMatcher.withinRadius(
                    helperLat, helperLng,
                    pickupLat, pickupLng,
                    deliveryLat, deliveryLng,
                    radiusKm);

            if (actual != expected) {
                failures.append("\n  ").append(name)
                        .append(" — expected ").append(expected)
                        .append(", got ").append(actual);
            }
        }

        assertEquals("Geofence diverged from src/lib/pricing.ts:" + failures, 0, failures.length());
    }

    @Test
    public void haversineMatchesKnownDistance() {
        // Same pair as the "just inside the radius" fixture case, which the Node
        // script reports as 3.403 km.
        double d = OrderMatcher.distanceKm(23.8103, 90.4125, 23.8409, 90.4125);
        assertEquals(3.403, d, 0.01);
    }

    private static double coord(JSONObject c, String key, String field, double fallback) {
        JSONObject o = c.isNull(key) ? null : c.optJSONObject(key);
        return o == null ? fallback : o.optDouble(field, fallback);
    }

    private static Double boxed(JSONObject c, String key, String field) {
        JSONObject o = c.isNull(key) ? null : c.optJSONObject(key);
        if (o == null || !o.has(field)) return null;
        return o.optDouble(field);
    }

    private static String readFixture() throws Exception {
        try (InputStream in = OrderMatcherParityTest.class
                .getResourceAsStream("/geofence-cases.json")) {
            if (in == null) throw new IllegalStateException("geofence-cases.json not on the test classpath");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }
}
