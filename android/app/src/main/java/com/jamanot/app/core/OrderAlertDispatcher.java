package com.jamanot.app.core;

import android.content.Context;
import android.util.Log;

import androidx.annotation.Nullable;

import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.TaskCompletionSource;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.jamanot.app.MainActivity;
import com.jamanot.app.plugin.JamanotNativePlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The one path every new-order notification takes, whoever saw it first.
 *
 * <p>Three things can notice a new order: the duty service's Firestore listener,
 * an FCM push, and the WebView's own listener. They share a de-duplication set
 * ({@link Prefs#markSeen}), so only the first one acts — and they used to act
 * differently. When the WebView won, it posted a plain tray notification: the
 * phone made a sound, but the alarm never started and no alert event was sent,
 * so the popup depended on the WebView's (often stale) order listener catching
 * up. Routing all three through here makes the outcome the same regardless of
 * which one won the race.
 *
 * <p>Before alerting it fetches the order, which buys three things: the radius
 * check for helpers, dropping orders that were already taken by the time the
 * notification arrived, and the document itself — sent to JS with the alert so
 * the popup can open in the same instant the alarm starts.
 */
public final class OrderAlertDispatcher {

    private static final String TAG = "JamanotDispatch";

    /** Gap before the alarm when a tray notification has just played its own sound. */
    private static final long RING_AFTER_NOTIFICATION_MS = 2_000L;

    private OrderAlertDispatcher() {}

    /**
     * Callers must have de-duplicated already (Prefs.markSeen).
     *
     * @return a task that completes once the alert was dispatched or dropped, so
     *         the FCM receiver can keep its process alive until then.
     */
    public static Task<Void> handleNewOrder(Context c, String notifId, String title, String body, String orderId) {
        Context app = c.getApplicationContext();
        String role = Prefs.role(app);
        boolean helper = "helper".equals(role);
        boolean store = "store".equals(role);

        if (orderId == null || orderId.isEmpty() || (!helper && !store)) {
            dispatch(app, notifId, title, body, orderId, null, null, false);
            return Tasks.forResult(null);
        }

        FirebaseFirestore db;
        try {
            db = FirebaseFirestore.getInstance();
        } catch (Exception e) {
            // Can't verify anything — alert anyway. A spurious alert is
            // recoverable; a missed order is lost income.
            dispatch(app, notifId, title, body, orderId, null, null, true);
            return Tasks.forResult(null);
        }

        TaskCompletionSource<Void> done = new TaskCompletionSource<>();
        if (helper) {
            db.collection("orders").document(orderId).get().addOnCompleteListener(task -> {
                try {
                    onHelperOrderFetched(app, notifId, title, body, orderId,
                            task.isSuccessful() ? task.getResult() : null);
                } finally {
                    done.trySetResult(null);
                }
            });
        } else {
            db.collection("shopOrders").whereEqualTo("parentOrderId", orderId).get().addOnCompleteListener(task -> {
                try {
                    List<Map<String, Object>> mine = new ArrayList<>();
                    if (task.isSuccessful() && task.getResult() != null) {
                        String storeId = Prefs.effectiveStoreId(app);
                        for (DocumentSnapshot d : task.getResult().getDocuments()) {
                            if (storeId != null && !storeId.equals(d.getString("shopId"))) continue;
                            if (d.getData() != null) mine.add(d.getData());
                        }
                    }
                    onStoreOrdersFetched(app, notifId, title, body, orderId, mine);
                } finally {
                    done.trySetResult(null);
                }
            });
        }
        return done.getTask();
    }

    private static void onHelperOrderFetched(Context app, String notifId, String title, String body,
                                             String orderId, @Nullable DocumentSnapshot doc) {
        if (doc == null || !doc.exists()) {
            Log.w(TAG, "Order " + orderId + " not readable — alerting unverified.");
            dispatch(app, notifId, title, body, orderId, null, null, true);
            return;
        }
        Map<String, Object> data = doc.getData();
        if (!OrderMatcher.isOrderOpen(data)) {
            Log.i(TAG, "Order " + orderId + " already taken or cancelled — not alerting.");
            return;
        }

        Double pLat = OrderMatcher.nestedNumber(data, "pickupLocation", "lat");
        Double pLng = OrderMatcher.nestedNumber(data, "pickupLocation", "lng");
        Double dLat = OrderMatcher.nestedNumber(data, "deliveryLocation", "lat");
        Double dLng = OrderMatcher.nestedNumber(data, "deliveryLocation", "lng");
        double hLat = Prefs.lat(app);
        double hLng = Prefs.lng(app);
        float radius = Prefs.radiusKm(app);

        if (!OrderMatcher.withinRadius(hLat, hLng, pLat, pLng, dLat, dLng, radius)) {
            Log.i(TAG, "Order " + orderId + " outside " + radius + "km — skipping.");
            return;
        }

        Double km = OrderMatcher.minDistanceKm(hLat, hLng, pLat, pLng, dLat, dLng);
        String distance = km == null ? null : OrderMatcher.formatDistance(km);
        dispatch(app, notifId, title, body, orderId, OrderPayload.forOrder(data), distance, true);
    }

    private static void onStoreOrdersFetched(Context app, String notifId, String title, String body,
                                             String orderId, List<Map<String, Object>> mine) {
        if (!mine.isEmpty()) {
            boolean awaiting = false;
            for (Map<String, Object> so : mine) {
                if (OrderMatcher.isShopOrderAwaitingStore(so)) awaiting = true;
            }
            if (!awaiting) {
                Log.i(TAG, "Shop orders for " + orderId + " already answered — not alerting.");
                return;
            }
        }
        dispatch(app, notifId, title, body, orderId,
                mine.isEmpty() ? null : OrderPayload.forShopOrders(mine), null, true);
    }

    /**
     * The escalation ladder. Each rung degrades cleanly into the one below it.
     *
     * @param distance helper only — how far the order is, for the notification and card.
     * @param ring     helper and store alerts ring until answered; anything else
     *                 gets a single tone.
     */
    private static void dispatch(Context app, String notifId, String title, String body, String orderId,
                                 @Nullable String payload, @Nullable String distance, boolean ring) {
        boolean foreground = MainActivity.isAppInForeground();

        if (ring) {
            // In the foreground the alarm starts at once, because the popup opens
            // in the same instant (the payload travels with the event). In the
            // background it follows the tray notification's own sound.
            long delay = foreground ? 0L : RING_AFTER_NOTIFICATION_MS;
            if (!ActiveOrderAlerts.raise(app, orderId, payload, delay)) {
                Log.i(TAG, "Alert for " + orderId + " was already dealt with — not repeating it.");
                return;
            }
        } else if (foreground) {
            AlertSound.playOrderTone(app);
        }

        // Always tell JS, background included: the duty service keeps the
        // WebView alive, so the popup is already on screen when the app opens.
        JamanotNativePlugin.emitOrderAlert(orderId, payload);
        if (foreground) return;

        // 1. Baseline everyone gets: heads-up notification, no special permission.
        String detail = body;
        if (distance != null) detail = (body == null || body.isEmpty()) ? distance : body + " · " + distance;
        NotificationHelper.postOrderAlert(app, notifId, title, detail, orderId);

        // Escalation is for helpers and stores on duty. FCM fans new orders out
        // to every helper in radius, on duty or not, and an off-duty helper must
        // not have orders thrown in their face.
        if (!ring || !Prefs.onDuty(app)) return;

        // 2. The Uber-style card over whatever app is open — answerable without
        //    switching apps. Needs "Display over other apps".
        boolean card = OrderOverlay.show(app, orderId, title, body, payload, distance);

        // 3. A card can't be seen on a locked or sleeping phone (overlays sit
        //    under the keyguard), so there the app itself is woken and brought
        //    up over the lock screen on this order. Without the card permission
        //    this is also the only escalation left — AutoOpen no-ops without it.
        if (!card || OrderOverlay.isScreenLocked(app)) AutoOpen.launch(app, orderId);
    }
}
