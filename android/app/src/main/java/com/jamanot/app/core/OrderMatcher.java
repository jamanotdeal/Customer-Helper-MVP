package com.jamanot.app.core;

import android.content.Context;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * Port of the two pieces of web logic the background service genuinely has to
 * re-implement:
 *
 * <ul>
 *   <li>the {@code targets} predicate from {@code _handleNotificationSnapshot}
 *       in src/lib/firebase.ts</li>
 *   <li>{@code calculateDistanceKm} / {@code getOrderMinDistanceKm} /
 *       {@code isHelperWithinOrderRadius} from src/lib/pricing.ts</li>
 * </ul>
 *
 * <p><b>Deliberately not ported:</b> the {@code orderReceiverRule} →
 * {@code all-commuter-helpers} / {@code all-dedicated-helpers} mapping. That is
 * resolved by whichever client <i>writes</i> the notification ({@code addOrder}
 * in firebase.ts) and is baked into the document's {@code userId}, so this side
 * only has to answer "does that pseudo-target include me?".
 *
 * <p><b>Keeping this in sync:</b> src/lib/__fixtures__/geofence-cases.json holds
 * golden vectors run against both this class (OrderMatcherParityTest) and
 * pricing.ts (npm run test:geofence). Change the algorithm on either side and
 * the parity test fails rather than orders silently mis-routing.
 */
public final class OrderMatcher {

    private static final double EARTH_RADIUS_KM = 6371.0;

    private OrderMatcher() {}

    // ── Targeting ───────────────────────────────────────────────────────────

    /** The pseudo-targets this device's Firestore query should subscribe to. */
    public static List<String> queryTargets(Context c) {
        String uid = Prefs.uid(c);
        if (uid == null) uid = "__none__";

        if ("store".equals(Prefs.role(c))) {
            // Mirrors the store branch of initListenersForRole (firebase.ts:856)
            return Arrays.asList(uid, "all", "all-stores");
        }

        if ("customer".equals(Prefs.role(c))) {
            // Mirrors the customer branch. Without this a customer would be
            // subscribed to the helper pseudo-targets and would both miss their
            // own order updates and be woken by other people's work.
            return Arrays.asList(uid, "all", "all-customers");
        }

        // Mirrors the helper branch (firebase.ts:1005)
        String group = "dedicated".equals(Prefs.helperType(c))
                ? "all-dedicated-helpers"
                : "all-commuter-helpers";
        return Arrays.asList(uid, "all", "all-helpers", group);
    }

    /**
     * Whether a notification document actually addresses this device.
     *
     * <p>Mirrors the {@code targets} expression in firebase.ts. One intentional
     * addition: the web version has no {@code all-stores} arm even though the
     * store listener subscribes to it, so a broadcast to stores is stored but
     * never popped on web. Stores must be alerted here, so the arm is included.
     */
    public static boolean targets(Context c, String notifUserId) {
        if (notifUserId == null) return false;

        String uid = Prefs.uid(c);
        if (notifUserId.equals(uid)) return true;
        if ("all".equals(notifUserId)) return true;

        boolean isHelper = Prefs.isHelper(c);
        boolean isDedicated = "dedicated".equals(Prefs.helperType(c));
        String role = Prefs.role(c);

        switch (notifUserId) {
            case "all-helpers":
                return isHelper;
            case "all-commuter-helpers":
                return isHelper && !isDedicated;
            case "all-dedicated-helpers":
                return isHelper && isDedicated;
            case "all-stores":
                return "store".equals(role) || Prefs.isStoreApproved(c);
            case "all-customers":
                return !isHelper && !"admin".equals(role);
            default:
                return false;
        }
    }

    // ── Geofence ────────────────────────────────────────────────────────────

    /** Haversine. Identical formula to calculateDistanceKm in pricing.ts. */
    public static double distanceKm(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1))
                * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double cc = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_KM * cc;
    }

    /**
     * The JS source uses truthy checks ({@code !helperLoc?.lat}), which treats a
     * coordinate of exactly 0 as missing. Replicated here on purpose — parity
     * with the web behaviour matters more than the edge case, and Bangladesh is
     * nowhere near lat/lng 0.
     */
    private static boolean present(Double v) {
        return v != null && !v.isNaN() && v != 0.0d;
    }

    /**
     * Minimum distance from the helper to either end of the order.
     * Returns null when either side lacks usable coordinates — matching
     * getOrderMinDistanceKm's null return.
     */
    public static Double minDistanceKm(double helperLat, double helperLng,
                                       Double pickupLat, Double pickupLng,
                                       Double deliveryLat, Double deliveryLng) {
        if (!present(helperLat) || !present(helperLng)) return null;

        Double best = null;
        if (present(pickupLat) && present(pickupLng)) {
            best = distanceKm(helperLat, helperLng, pickupLat, pickupLng);
        }
        if (present(deliveryLat) && present(deliveryLng)) {
            double d = distanceKm(helperLat, helperLng, deliveryLat, deliveryLng);
            best = (best == null) ? d : Math.min(best, d);
        }
        return best;
    }

    private static boolean present(double v) {
        return !Double.isNaN(v) && v != 0.0d;
    }

    /**
     * Mirrors isHelperWithinOrderRadius: missing coordinates on either side mean
     * "show it" rather than "hide it", so a helper with no GPS fix still sees work.
     */
    public static boolean withinRadius(double helperLat, double helperLng,
                                       Double pickupLat, Double pickupLng,
                                       Double deliveryLat, Double deliveryLng,
                                       double radiusKm) {
        if (!present(helperLat) || !present(helperLng)) return true;
        Double min = minDistanceKm(helperLat, helperLng, pickupLat, pickupLng, deliveryLat, deliveryLng);
        if (min == null) return true;
        return min <= radiusKm;
    }

    // ── Firestore document helpers ──────────────────────────────────────────

    /** Reads {@code order.pickupLocation.lat} style nested numbers defensively. */
    @SuppressWarnings("unchecked")
    public static Double nestedNumber(Map<String, Object> doc, String outer, String inner) {
        if (doc == null) return null;
        Object o = doc.get(outer);
        if (!(o instanceof Map)) return null;
        Object v = ((Map<String, Object>) o).get(inner);
        if (v instanceof Number) return ((Number) v).doubleValue();
        return null;
    }

    /** Formats a distance the way the alert screen should read it. */
    public static String formatDistance(Double km) {
        if (km == null) return "";
        if (km < 1.0) return Math.round(km * 1000) + " মিটার দূরে";
        return String.format(java.util.Locale.US, "%.1f কিমি দূরে", km);
    }
}
