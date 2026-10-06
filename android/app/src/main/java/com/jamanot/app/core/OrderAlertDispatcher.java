package com.jamanot.app.core;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

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

    /** Lets the overlay card attach and draw before the app is opened over it. */
    private static final long OPEN_AFTER_CARD_MS = 300L;

    /**
     * How long the order fetch may take before we alert unverified. Transsion
     * (Infinix/Tecno/itel) freezes a backgrounded app within seconds — foreground
     * service or not — and destroys its sockets, so after an FCM push thaws it
     * the Firestore read starts from a cold connection, and the process is
     * frozen again about four seconds after the receiver returns. A fetch that
     * runs past the receiver never gets to open the app.
     */
    private static final long FETCH_DEADLINE_MS = 4_000L;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    /** Dispatches still running, by notification id — see {@link #onNewOrderPush}. */
    private static final Map<String, Task<Void>> IN_FLIGHT = new ConcurrentHashMap<>();

    private OrderAlertDispatcher() {}

    /**
     * Entry point for a wake-up push (FCM). Blocks nothing itself; the caller
     * waits on the returned task, which is what keeps the process thawed.
     *
     * <p>Unlike the other two paths this one does not give up when the
     * de-duplication set says the order was already seen: the duty listener or
     * the WebView may have won the race, and neither of them keeps the process
     * alive. Waiting on their dispatch here holds the app awake until the alert
     * — the app opening included — has actually happened.
     */
    public static Task<Void> onNewOrderPush(Context c, String notifId, String title, String body, String orderId) {
        if (notifId == null || Prefs.markSeen(c, notifId)) {
            return handleNewOrder(c, notifId, title, body, orderId);
        }
        Task<Void> running = IN_FLIGHT.get(notifId);
        return running != null ? running : Tasks.forResult(null);
    }

    /**
     * Callers must have de-duplicated already (Prefs.markSeen).
     *
     * @return a task that completes once the alert was dispatched (the app
     *         launch issued) or dropped, so the FCM receiver can keep its
     *         process alive until then.
     */
    public static Task<Void> handleNewOrder(Context c, String notifId, String title, String body, String orderId) {
        Context app = c.getApplicationContext();
        TaskCompletionSource<Void> done = new TaskCompletionSource<>();
        if (notifId != null) {
            IN_FLIGHT.put(notifId, done.getTask());
            done.getTask().addOnCompleteListener(t -> IN_FLIGHT.remove(notifId));
        }
        try {
            fetchAndDispatch(app, notifId, title, body, orderId, done);
        } catch (Exception e) {
            Log.w(TAG, "dispatch failed: " + e.getMessage());
            done.trySetResult(null);
        }
        return done.getTask();
    }

    private static void fetchAndDispatch(Context app, String notifId, String title, String body,
                                         String orderId, TaskCompletionSource<Void> done) {
        String role = Prefs.role(app);
        boolean helper = "helper".equals(role);
        boolean store = "store".equals(role);

        if (orderId == null || orderId.isEmpty() || (!helper && !store)) {
            dispatch(app, notifId, title, body, orderId, null, null, false, done);
            return;
        }

        FirebaseFirestore db;
        try {
            db = FirebaseFirestore.getInstance();
        } catch (Exception e) {
            // Can't verify anything — alert anyway. A spurious alert is
            // recoverable; a missed order is lost income.
            dispatch(app, notifId, title, body, orderId, null, null, true, done);
            return;
        }

        // Whichever comes first, the fetch or the deadline, decides. An alert
        // raised unverified is still withdrawn if the order turns out to be
        // gone: ActiveOrderAlerts watches every alert it raises.
        AtomicBoolean decided = new AtomicBoolean(false);
        MAIN.postDelayed(() -> {
            if (!decided.compareAndSet(false, true)) return;
            Log.w(TAG, "Order " + orderId + " fetch still pending after " + FETCH_DEADLINE_MS + "ms — alerting unverified.");
            dispatch(app, notifId, title, body, orderId, null, null, true, done);
        }, FETCH_DEADLINE_MS);

        if (helper) {
            db.collection("orders").document(orderId).get().addOnCompleteListener(task -> {
                if (!decided.compareAndSet(false, true)) return;
                try {
                    if (!onHelperOrderFetched(app, notifId, title, body, orderId,
                            task.isSuccessful() ? task.getResult() : null, done)) {
                        done.trySetResult(null);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "helper dispatch failed: " + e.getMessage());
                    done.trySetResult(null);
                }
            });
        } else {
            db.collection("shopOrders").whereEqualTo("parentOrderId", orderId).get().addOnCompleteListener(task -> {
                if (!decided.compareAndSet(false, true)) return;
                try {
                    List<Map<String, Object>> mine = new ArrayList<>();
                    if (task.isSuccessful() && task.getResult() != null) {
                        String storeId = Prefs.effectiveStoreId(app);
                        for (DocumentSnapshot d : task.getResult().getDocuments()) {
                            if (storeId != null && !storeId.equals(d.getString("shopId"))) continue;
                            if (d.getData() != null) mine.add(d.getData());
                        }
                    }
                    if (!onStoreOrdersFetched(app, notifId, title, body, orderId, mine, done)) {
                        done.trySetResult(null);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "store dispatch failed: " + e.getMessage());
                    done.trySetResult(null);
                }
            });
        }
    }

    /** @return true if the alert went to {@link #dispatch}, which then owns {@code done}. */
    private static boolean onHelperOrderFetched(Context app, String notifId, String title, String body,
                                                String orderId, @Nullable DocumentSnapshot doc,
                                                TaskCompletionSource<Void> done) {
        if (doc == null || !doc.exists()) {
            Log.w(TAG, "Order " + orderId + " not readable — alerting unverified.");
            dispatch(app, notifId, title, body, orderId, null, null, true, done);
            return true;
        }
        Map<String, Object> data = doc.getData();
        if (!OrderMatcher.isOrderOpen(data)) {
            Log.i(TAG, "Order " + orderId + " already taken or cancelled — not alerting.");
            return false;
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
            return false;
        }

        Double km = OrderMatcher.minDistanceKm(hLat, hLng, pLat, pLng, dLat, dLng);
        String distance = km == null ? null : OrderMatcher.formatDistance(km);
        dispatch(app, notifId, title, body, orderId, OrderPayload.forOrder(data), distance, true, done);
        return true;
    }

    /** @return true if the alert went to {@link #dispatch}, which then owns {@code done}. */
    private static boolean onStoreOrdersFetched(Context app, String notifId, String title, String body,
                                                String orderId, List<Map<String, Object>> mine,
                                                TaskCompletionSource<Void> done) {
        if (!mine.isEmpty()) {
            boolean awaiting = false;
            for (Map<String, Object> so : mine) {
                if (OrderMatcher.isShopOrderAwaitingStore(so)) awaiting = true;
            }
            if (!awaiting) {
                Log.i(TAG, "Shop orders for " + orderId + " already answered — not alerting.");
                return false;
            }
        }
        dispatch(app, notifId, title, body, orderId,
                mine.isEmpty() ? null : OrderPayload.forShopOrders(mine), null, true, done);
        return true;
    }

    /**
     * The escalation ladder. Each rung degrades cleanly into the one below it.
     *
     * @param distance helper only — how far the order is, for the notification and card.
     * @param ring     helper and store alerts ring until answered; anything else
     *                 gets a single tone.
     * @param done     completed once the ladder has finished, the app launch
     *                 included — which on the card path is a moment later.
     */
    private static void dispatch(Context app, String notifId, String title, String body, String orderId,
                                 @Nullable String payload, @Nullable String distance, boolean ring,
                                 TaskCompletionSource<Void> done) {
        boolean launchPending = false;
        try {
            launchPending = escalate(app, notifId, title, body, orderId, payload, distance, ring, done);
        } finally {
            if (!launchPending) done.trySetResult(null);
        }
    }

    /** @return true when the app launch is still to come, and will complete {@code done} itself. */
    private static boolean escalate(Context app, String notifId, String title, String body, String orderId,
                                    @Nullable String payload, @Nullable String distance, boolean ring,
                                    TaskCompletionSource<Void> done) {
        boolean foreground = MainActivity.isAppInForeground();

        if (ring) {
            // In the foreground the alarm starts at once, because the popup opens
            // in the same instant (the payload travels with the event). In the
            // background it follows the tray notification's own sound.
            long delay = foreground ? 0L : RING_AFTER_NOTIFICATION_MS;
            if (!ActiveOrderAlerts.raise(app, orderId, payload, delay)) {
                Log.i(TAG, "Alert for " + orderId + " was already dealt with — not repeating it.");
                return false;
            }
        } else if (foreground) {
            AlertSound.playOrderTone(app);
        }

        // Always tell JS, background included: the duty service keeps the
        // WebView alive, so the popup is already on screen when the app opens.
        JamanotNativePlugin.emitOrderAlert(orderId, payload);
        if (foreground) return false;

        // 1. Baseline everyone gets: heads-up notification, no special permission.
        String detail = body;
        if (distance != null) detail = (body == null || body.isEmpty()) ? distance : body + " · " + distance;
        NotificationHelper.postOrderAlert(app, notifId, title, detail, orderId);

        // Escalation is for helpers and stores on duty. FCM fans new orders out
        // to every helper in radius, on duty or not, and an off-duty helper must
        // not have orders thrown in their face.
        if (!ring || !Prefs.onDuty(app)) return false;

        // 2. The Uber-style card over whatever app is open. Needs "Display over
        //    other apps". It is the fallback if the OS refuses step 3, and it is
        //    also what lets step 3 happen at all: on Android 15 (verified on an
        //    Infinix) the launch is allowed as BAL_ALLOW_NON_APP_VISIBLE_WINDOW,
        //    i.e. because this card is on screen.
        boolean card = OrderOverlay.show(app, orderId, title, body, payload, distance);

        // 3. Open the app itself on this order, with its popup already up —
        //    always, locked or not. (It briefly opened only on a locked phone,
        //    leaving just the card otherwise; that dropped the behaviour helpers
        //    rely on.) MainActivity.onResume takes the card down once the app is
        //    in front. With a card, wait for it to be on screen first.
        if (card) {
            MAIN.postDelayed(() -> {
                try {
                    AutoOpen.launch(app, orderId);
                } finally {
                    done.trySetResult(null);
                }
            }, OPEN_AFTER_CARD_MS);
            return true;
        }
        AutoOpen.launch(app, orderId);
        return false;
    }
}
