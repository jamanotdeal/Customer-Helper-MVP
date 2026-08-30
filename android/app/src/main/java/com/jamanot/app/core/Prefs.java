package com.jamanot.app.core;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * The bridge between the web layer's identity and the native background code.
 *
 * <p>The WebView writes here at login and on every role/mode switch (see
 * {@code syncNativeUserState} in src/lib/native.ts). The duty service and the
 * messaging service then read it directly, which is what lets Java decide who to
 * alert while JavaScript is frozen or the WebView has been destroyed entirely.
 */
public final class Prefs {

    private static final String FILE = "jamanot_native";

    private static final String K_UID = "uid";
    private static final String K_ROLE = "role";
    private static final String K_IS_HELPER = "isHelper";
    private static final String K_HELPER_TYPE = "helperType";
    private static final String K_STORE_APPROVED = "isStoreApproved";
    private static final String K_STORE_ID = "storeId";
    private static final String K_ACTIVE_MODE = "activeMode";
    private static final String K_ON_DUTY = "onDuty";
    private static final String K_LAT = "helperLat";
    private static final String K_LNG = "helperLng";
    private static final String K_LOC_AT = "helperLocUpdatedAt";
    private static final String K_RADIUS = "radiusKm";
    private static final String K_AUTO_OPEN = "autoOpenEnabled";
    private static final String K_SEEN = "seenNotifIds";
    private static final String K_SERVICE_STARTED = "serviceStartedAt";
    private static final String K_FCM_TOKEN = "fcmToken";
    private static final String K_PTR_ENABLED = "pullToRefreshEnabled";

    /** Matches DEFAULT_PRICING_SETTINGS.helperRadiusKm in src/lib/pricing.ts. */
    public static final float DEFAULT_RADIUS_KM = 3.5f;

    /** Cap on the de-duplication set, mirroring the web _knownNotifIds behaviour. */
    private static final int SEEN_LIMIT = 300;

    private Prefs() {}

    private static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    // ── Identity ────────────────────────────────────────────────────────────

    public static String uid(Context c) { return sp(c).getString(K_UID, null); }

    public static String role(Context c) { return sp(c).getString(K_ROLE, "customer"); }

    public static boolean isHelper(Context c) { return sp(c).getBoolean(K_IS_HELPER, false); }

    public static String helperType(Context c) { return sp(c).getString(K_HELPER_TYPE, "commuter"); }

    public static boolean isStoreApproved(Context c) { return sp(c).getBoolean(K_STORE_APPROVED, false); }

    public static String storeId(Context c) { return sp(c).getString(K_STORE_ID, null); }

    public static String activeMode(Context c) { return sp(c).getString(K_ACTIVE_MODE, "customer"); }

    /** True only for the two roles that receive new-order alerts. */
    public static boolean isDutyRole(Context c) {
        String r = role(c);
        return "helper".equals(r) || "store".equals(r);
    }

    // ── Duty state ──────────────────────────────────────────────────────────

    public static boolean onDuty(Context c) { return sp(c).getBoolean(K_ON_DUTY, false); }

    public static void setOnDuty(Context c, boolean v) {
        sp(c).edit().putBoolean(K_ON_DUTY, v).apply();
    }

    public static boolean autoOpenEnabled(Context c) {
        // Opt-in by design: the app only brings itself to the foreground if the
        // user asked it to. Everyone else gets a heads-up notification.
        return sp(c).getBoolean(K_AUTO_OPEN, false);
    }

    public static void setAutoOpenEnabled(Context c, boolean v) {
        sp(c).edit().putBoolean(K_AUTO_OPEN, v).apply();
    }

    // ── Location & geofence ─────────────────────────────────────────────────

    public static double lat(Context c) {
        return Double.longBitsToDouble(sp(c).getLong(K_LAT, Double.doubleToLongBits(Double.NaN)));
    }

    public static double lng(Context c) {
        return Double.longBitsToDouble(sp(c).getLong(K_LNG, Double.doubleToLongBits(Double.NaN)));
    }

    public static boolean hasLocation(Context c) {
        return !Double.isNaN(lat(c)) && !Double.isNaN(lng(c));
    }

    public static void setLocation(Context c, double lat, double lng) {
        sp(c).edit()
                .putLong(K_LAT, Double.doubleToLongBits(lat))
                .putLong(K_LNG, Double.doubleToLongBits(lng))
                .putLong(K_LOC_AT, System.currentTimeMillis())
                .apply();
    }

    public static long locationUpdatedAt(Context c) { return sp(c).getLong(K_LOC_AT, 0L); }

    public static float radiusKm(Context c) { return sp(c).getFloat(K_RADIUS, DEFAULT_RADIUS_KM); }

    /** Kept live by the duty service's settings/pricing listener, so the admin
     *  panel still controls the radius without an app rebuild. */
    public static void setRadiusKm(Context c, float km) {
        if (km > 0) sp(c).edit().putFloat(K_RADIUS, km).apply();
    }

    // ── Service bookkeeping ─────────────────────────────────────────────────

    public static long serviceStartedAt(Context c) { return sp(c).getLong(K_SERVICE_STARTED, 0L); }

    public static void setServiceStartedAt(Context c, long t) {
        sp(c).edit().putLong(K_SERVICE_STARTED, t).apply();
    }

    public static String fcmToken(Context c) { return sp(c).getString(K_FCM_TOKEN, null); }

    public static void setFcmToken(Context c, String token) {
        sp(c).edit().putString(K_FCM_TOKEN, token).apply();
    }

    public static boolean pullToRefreshEnabled(Context c) {
        return sp(c).getBoolean(K_PTR_ENABLED, true);
    }

    public static void setPullToRefreshEnabled(Context c, boolean v) {
        sp(c).edit().putBoolean(K_PTR_ENABLED, v).apply();
    }

    // ── Notification de-duplication ─────────────────────────────────────────

    /**
     * Persisted so a service restart doesn't re-alert on notifications the user
     * has already seen. Insertion-ordered and trimmed from the front, giving a
     * cheap LRU without pulling in a real cache.
     */
    public static boolean markSeen(Context c, String id) {
        if (id == null || id.isEmpty()) return false;
        SharedPreferences p = sp(c);
        Set<String> stored = p.getStringSet(K_SEEN, null);
        LinkedHashSet<String> seen = stored == null ? new LinkedHashSet<>() : new LinkedHashSet<>(stored);
        if (seen.contains(id)) return false;

        seen.add(id);
        while (seen.size() > SEEN_LIMIT) {
            String oldest = seen.iterator().next();
            seen.remove(oldest);
        }
        p.edit().putStringSet(K_SEEN, seen).apply();
        return true;
    }

    // ── Bulk write from JS ──────────────────────────────────────────────────

    public static class UserState {
        public String uid;
        public String role;
        public Boolean isHelper;
        public String helperType;
        public Boolean isStoreApproved;
        public String storeId;
        public String activeMode;
        public Boolean onDuty;
        public Double lat;
        public Double lng;
        public Float radiusKm;
    }

    /** Applies only the fields the caller actually supplied. */
    public static void apply(Context c, UserState s) {
        SharedPreferences.Editor e = sp(c).edit();
        if (s.uid != null) e.putString(K_UID, s.uid);
        if (s.role != null) e.putString(K_ROLE, s.role);
        if (s.isHelper != null) e.putBoolean(K_IS_HELPER, s.isHelper);
        if (s.helperType != null) e.putString(K_HELPER_TYPE, s.helperType);
        if (s.isStoreApproved != null) e.putBoolean(K_STORE_APPROVED, s.isStoreApproved);
        if (s.storeId != null) e.putString(K_STORE_ID, s.storeId);
        if (s.activeMode != null) e.putString(K_ACTIVE_MODE, s.activeMode);
        if (s.onDuty != null) e.putBoolean(K_ON_DUTY, s.onDuty);
        if (s.lat != null && s.lng != null) {
            e.putLong(K_LAT, Double.doubleToLongBits(s.lat));
            e.putLong(K_LNG, Double.doubleToLongBits(s.lng));
            e.putLong(K_LOC_AT, System.currentTimeMillis());
        }
        if (s.radiusKm != null && s.radiusKm > 0) e.putFloat(K_RADIUS, s.radiusKm);
        e.apply();
    }

    /** Called on logout. Clears identity and duty, keeps the FCM token. */
    public static void clearUser(Context c) {
        String token = fcmToken(c);
        sp(c).edit().clear().apply();
        if (token != null) setFcmToken(c, token);
    }
}
