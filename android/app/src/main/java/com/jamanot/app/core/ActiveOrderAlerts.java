package com.jamanot.app.core;

import android.content.Context;
import android.util.Log;

import androidx.annotation.Nullable;

import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;
import com.jamanot.app.MainActivity;
import com.jamanot.app.plugin.JamanotNativePlugin;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * The new-order alerts currently outstanding on this device, and the single
 * owner of the alarm that rings for them.
 *
 * <p>Every alert is keyed by the order id its notification carries (for a store,
 * the parent order). While at least one key is registered the alarm rings, and
 * each key has its own Firestore listener asking one question: can this still be
 * answered? The moment it cannot — another helper accepted the order, the
 * customer cancelled, the store already responded — the key is resolved: its
 * tray notification is withdrawn, JS is told so the popup closes, and when no
 * key is left the alarm stops.
 *
 * <p>This used to be a bare start/stop switch that only JS could turn off. JS
 * learns that an order was taken through the WebView's Firestore connection,
 * which is exactly the thing that goes stale while the app is in the
 * background — so another helper's accept left this phone ringing for an order
 * that no longer existed. The native listener here does not depend on the
 * WebView at all.
 *
 * <p>JS resolves keys as well, when the user accepts, views or dismisses.
 */
public final class ActiveOrderAlerts {

    private static final String TAG = "JamanotAlerts";

    /** Keys already dealt with. A late duplicate of the same order must not ring again. */
    private static final int RESOLVED_LIMIT = 200;

    /** An alert nobody answered in this long is stale; stop watching it. */
    private static final long MAX_AGE_MS = 30 * 60_000L;

    private static final Object LOCK = new Object();
    private static final Map<String, Entry> ACTIVE = new LinkedHashMap<>();
    private static final LinkedHashSet<String> RESOLVED = new LinkedHashSet<>();

    private static final class Entry {
        final long raisedAt = System.currentTimeMillis();
        /** JSON handed to JS with the alert — see OrderPayload. Refreshed by the watcher. */
        String payload;
        ListenerRegistration reg;
    }

    /** A key with its payload, for JS adopting alerts raised while it wasn't looking. */
    public static final class Snapshot {
        public final String orderId;
        public final String payload;

        Snapshot(String orderId, String payload) {
            this.orderId = orderId;
            this.payload = payload;
        }
    }

    private ActiveOrderAlerts() {}

    /**
     * Registers an alert and starts the alarm.
     *
     * @param ringDelayMs delay before the first tone — pass a gap when a tray
     *                    notification has just played its own sound.
     * @return false if the key was already resolved (the user dealt with this
     *         order, or it is gone), in which case nothing rings.
     */
    public static boolean raise(Context c, String key, @Nullable String payloadJson, long ringDelayMs) {
        if (c == null || key == null || key.isEmpty()) return false;
        Context app = c.getApplicationContext();

        Entry entry;
        synchronized (LOCK) {
            if (RESOLVED.contains(key)) return false;
            purgeExpiredLocked(app);

            Entry existing = ACTIVE.get(key);
            if (existing != null) {
                // The same order reaching us twice (listener and FCM, or JS and
                // Java) is one alert, not a reason to restart the alarm.
                if (payloadJson != null) existing.payload = payloadJson;
                return true;
            }
            entry = new Entry();
            entry.payload = payloadJson;
            ACTIVE.put(key, entry);
        }

        // Outside the lock: the listener's callbacks take it.
        ListenerRegistration reg = watch(app, key);
        synchronized (LOCK) {
            if (ACTIVE.get(key) == entry) {
                entry.reg = reg;
                reg = null;
            }
        }
        // Resolved while we were attaching — don't leak the listener.
        if (reg != null) reg.remove();

        AlertSound.startOrderAlarm(app, ringDelayMs);
        Log.i(TAG, "raised " + key + " (active=" + size() + ")");
        return true;
    }

    /**
     * Ends one alert: stops watching it, withdraws its notification, and stops
     * the alarm if it was the last one.
     *
     * @param notifyJs true when the decision was made here (the order went away),
     *                 so the popup has to be told; false when JS asked for it.
     */
    public static void resolve(Context c, String key, boolean notifyJs) {
        resolve(c, key, notifyJs, false);
    }

    /** The order went away under the alert (taken elsewhere, cancelled, answered). */
    private static void resolveGone(Context app, String key) {
        resolve(app, key, true, true);
    }

    private static void resolve(Context c, String key, boolean notifyJs, boolean gone) {
        if (c == null || key == null) return;
        Context app = c.getApplicationContext();

        Entry e;
        boolean empty;
        synchronized (LOCK) {
            e = ACTIVE.remove(key);
            rememberResolvedLocked(key);
            empty = ACTIVE.isEmpty();
        }
        if (e != null && e.reg != null) e.reg.remove();

        NotificationHelper.cancelOrderAlert(app, key);
        OrderOverlay.remove(app, key, gone);
        if (empty) {
            AlertSound.stopOrderAlarm(app);
            MainActivity.onOrderAlertsEnded();
        }
        if (notifyJs) JamanotNativePlugin.emitOrderAlertCleared(key);
        if (e != null) Log.i(TAG, "resolved " + key + " (notifyJs=" + notifyJs + ", gone=" + gone + ")");
    }

    /** Ends every alert — the popup was muted, or the user went off duty. */
    public static void resolveAll(Context c, boolean notifyJs) {
        if (c == null) return;
        Context app = c.getApplicationContext();

        List<String> keys;
        List<Entry> entries;
        synchronized (LOCK) {
            keys = new ArrayList<>(ACTIVE.keySet());
            entries = new ArrayList<>(ACTIVE.values());
            ACTIVE.clear();
            for (String k : keys) rememberResolvedLocked(k);
        }
        for (Entry e : entries) {
            if (e.reg != null) e.reg.remove();
        }
        for (String k : keys) {
            NotificationHelper.cancelOrderAlert(app, k);
            if (notifyJs) JamanotNativePlugin.emitOrderAlertCleared(k);
        }
        OrderOverlay.hideAll(app);
        AlertSound.stopOrderAlarm(app);
        MainActivity.onOrderAlertsEnded();
    }

    @Nullable
    public static String payload(String key) {
        if (key == null) return null;
        synchronized (LOCK) {
            Entry e = ACTIVE.get(key);
            return e == null ? null : e.payload;
        }
    }

    public static List<Snapshot> snapshot() {
        synchronized (LOCK) {
            List<Snapshot> out = new ArrayList<>(ACTIVE.size());
            for (Map.Entry<String, Entry> e : ACTIVE.entrySet()) {
                out.add(new Snapshot(e.getKey(), e.getValue().payload));
            }
            return out;
        }
    }

    /**
     * The alarm reached its safety cap. The over-other-apps card goes with it —
     * a card on screen is a promise the phone is still asking for an answer.
     * The alerts themselves stay: their notifications remain in the tray and
     * the app adopts them as popups when it is next opened.
     */
    static void onAlarmCapped(Context app) {
        OrderOverlay.hideAll(app);
    }

    public static int size() {
        synchronized (LOCK) {
            return ACTIVE.size();
        }
    }

    private static void updatePayload(String key, @Nullable String payloadJson) {
        if (payloadJson == null) return;
        synchronized (LOCK) {
            Entry e = ACTIVE.get(key);
            if (e != null) e.payload = payloadJson;
        }
    }

    private static void rememberResolvedLocked(String key) {
        RESOLVED.remove(key);
        RESOLVED.add(key);
        while (RESOLVED.size() > RESOLVED_LIMIT) {
            Iterator<String> it = RESOLVED.iterator();
            it.next();
            it.remove();
        }
    }

    private static void purgeExpiredLocked(Context app) {
        long now = System.currentTimeMillis();
        Iterator<Map.Entry<String, Entry>> it = ACTIVE.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, Entry> e = it.next();
            if (now - e.getValue().raisedAt < MAX_AGE_MS) continue;
            if (e.getValue().reg != null) e.getValue().reg.remove();
            rememberResolvedLocked(e.getKey());
            NotificationHelper.cancelOrderAlert(app, e.getKey());
            OrderOverlay.remove(app, e.getKey(), false);
            it.remove();
        }
    }

    // ── Availability watchers ────────────────────────────────────────────────

    @Nullable
    private static ListenerRegistration watch(Context app, String key) {
        FirebaseFirestore db;
        try {
            db = FirebaseFirestore.getInstance();
        } catch (Exception e) {
            Log.w(TAG, "Firestore unavailable, " + key + " is unwatched: " + e.getMessage());
            return null;
        }
        try {
            return "store".equals(Prefs.role(app)) ? watchStore(app, db, key) : watchOrder(app, db, key);
        } catch (Exception e) {
            Log.w(TAG, "watch " + key + " failed: " + e.getMessage());
            return null;
        }
    }

    /**
     * A helper's alert lives exactly as long as the order is open. A cached
     * snapshot can say "taken" (we saw it), but only the server may say "gone":
     * a cold cache has no copy of a brand-new order and would otherwise resolve
     * every alert the instant it was raised.
     */
    private static ListenerRegistration watchOrder(Context app, FirebaseFirestore db, String key) {
        return db.collection("orders").document(key)
                .addSnapshotListener(MetadataChanges.EXCLUDE, (snap, err) -> {
                    if (err != null || snap == null) return;
                    if (!snap.exists()) {
                        if (!snap.getMetadata().isFromCache()) resolveGone(app, key);
                        return;
                    }
                    Map<String, Object> data = snap.getData();
                    if (OrderMatcher.isOrderOpen(data)) {
                        updatePayload(key, OrderPayload.forOrder(data));
                    } else {
                        resolveGone(app, key);
                    }
                });
    }

    /**
     * A store's alert lives while any of its shop orders under this parent is
     * still waiting for it. An empty result is not proof of anything (the shop
     * id on this device may not match), so only an explicit "answered" resolves.
     */
    private static ListenerRegistration watchStore(Context app, FirebaseFirestore db, String key) {
        return db.collection("shopOrders").whereEqualTo("parentOrderId", key)
                .addSnapshotListener(MetadataChanges.EXCLUDE, (snap, err) -> {
                    if (err != null || snap == null) return;
                    String storeId = Prefs.effectiveStoreId(app);
                    List<Map<String, Object>> mine = new ArrayList<>();
                    boolean awaiting = false;
                    for (DocumentSnapshot d : snap.getDocuments()) {
                        if (storeId != null && !storeId.equals(d.getString("shopId"))) continue;
                        Map<String, Object> data = d.getData();
                        if (data == null) continue;
                        mine.add(data);
                        if (OrderMatcher.isShopOrderAwaitingStore(data)) awaiting = true;
                    }
                    if (mine.isEmpty()) return;
                    if (awaiting) {
                        updatePayload(key, OrderPayload.forShopOrders(mine));
                    } else if (!snap.getMetadata().isFromCache()) {
                        resolveGone(app, key);
                    }
                });
    }
}
