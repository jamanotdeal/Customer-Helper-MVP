package com.jamanot.app.core;

import com.google.firebase.Timestamp;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Collection;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/**
 * Serialises the Firestore document behind an alert so it can travel with the
 * {@code orderAlert} event to JS.
 *
 * <p>This is what lets the popup open in the same instant the alarm starts. Java
 * has the order the moment its listener fires, but the WebView's own Firestore
 * connection is routinely stale after the app has been in the background, and a
 * popup that waits for it opens seconds — sometimes a minute — after the sound.
 * Handing over the document Java already holds removes that round trip.
 *
 * <p>Orders are written by the web layer through {@code cleanForFirestore}, i.e.
 * plain JSON, so the conversion only has to cover JSON types; a stray Timestamp
 * becomes an ISO string, matching how the web layer writes dates.
 */
public final class OrderPayload {

    private OrderPayload() {}

    /** {@code {"order": {...}}} for a helper alert. */
    public static String forOrder(Map<String, Object> order) {
        try {
            JSONObject root = new JSONObject();
            root.put("order", toJson(order));
            return root.toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** {@code {"shopOrders": [...]}} for a store alert. */
    public static String forShopOrders(List<Map<String, Object>> shopOrders) {
        try {
            JSONArray list = new JSONArray();
            for (Map<String, Object> so : shopOrders) list.put(toJson(so));
            JSONObject root = new JSONObject();
            root.put("shopOrders", list);
            return root.toString();
        } catch (Exception e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private static Object toJson(Object v) throws Exception {
        if (v == null) return JSONObject.NULL;
        if (v instanceof Map) {
            JSONObject o = new JSONObject();
            for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) {
                o.put(e.getKey(), toJson(e.getValue()));
            }
            return o;
        }
        if (v instanceof Collection) {
            JSONArray a = new JSONArray();
            for (Object item : (Collection<Object>) v) a.put(toJson(item));
            return a;
        }
        if (v instanceof Timestamp) return iso(((Timestamp) v).toDate());
        if (v instanceof Date) return iso((Date) v);
        if (v instanceof String || v instanceof Number || v instanceof Boolean) return v;
        return String.valueOf(v);
    }

    private static String iso(Date d) {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(d);
    }
}
