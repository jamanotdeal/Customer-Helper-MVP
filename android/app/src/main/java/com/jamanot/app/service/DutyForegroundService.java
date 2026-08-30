package com.jamanot.app.service;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.firestore.DocumentChange;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;
import com.google.firebase.firestore.Query;
import com.jamanot.app.MainActivity;
import com.jamanot.app.core.NotificationHelper;
import com.jamanot.app.core.OrderMatcher;
import com.jamanot.app.core.Prefs;
import com.jamanot.app.receiver.RestartServiceReceiver;
import com.jamanot.app.ui.OrderAlertActivity;

import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * Keeps a Helper or Store reachable while the app is backgrounded or killed.
 *
 * <p>The interesting part is that it holds its <i>own</i> Firestore snapshot
 * listener in Java rather than waiting for a push. The web app already writes a
 * {@code type: "new_order"} document into {@code notifications} with a
 * role-scoped pseudo-target ({@code all-commuter-helpers} and friends), so this
 * service simply subscribes to the same query the web listener uses. No FCM send
 * path, no server, and no JavaScript needs to be alive.
 *
 * <p>Foreground service type is chosen per role:
 * <ul>
 *   <li><b>location</b> for Helper — genuinely needed, since the 3.5 km dispatch
 *       radius runs on the helper's position. It also has no Android 15 runtime
 *       cap, and grants background location <i>without</i>
 *       ACCESS_BACKGROUND_LOCATION, avoiding Play's heaviest review path.</li>
 *   <li><b>dataSync</b> for Store — stationary, so no location need. Subject to
 *       the Android 15 6h/24h cap, handled in {@link #onTimeout}.</li>
 * </ul>
 */
public class DutyForegroundService extends Service {

    private static final String TAG = "DutyFG";

    /** Same window the web helper listener uses (firebase.ts:1006). */
    private static final int NOTIF_LIMIT = 60;

    /** Restart delay after an OEM task-killer or onTaskRemoved. */
    private static final long RESTART_DELAY_MS = 5000L;

    private static volatile boolean running = false;

    private FirebaseFirestore db;
    private ListenerRegistration notifReg;
    private ListenerRegistration pricingReg;
    private LocationTracker locationTracker;

    /** Guards against alerting on the backlog that arrives with the first snapshot. */
    private long startedAt = 0L;
    private boolean firstSnapshotHandled = false;

    public static boolean isRunning() {
        return running;
    }

    public static void start(Context c) {
        Intent i = new Intent(c, DutyForegroundService.class);
        ContextCompat.startForegroundService(c, i);
    }

    public static void stop(Context c) {
        try {
            c.stopService(new Intent(c, DutyForegroundService.class));
        } catch (Exception ignored) {
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        startedAt = System.currentTimeMillis();
        Prefs.setServiceStartedAt(this, startedAt);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Re-check on every start: the role may have changed since the service
        // was last launched (mode switch, logout, or a stale watchdog restart).
        if (!Prefs.isDutyRole(this) || !Prefs.onDuty(this) || Prefs.uid(this) == null) {
            Log.i(TAG, "Not an on-duty role — stopping.");
            stopSelf();
            return START_NOT_STICKY;
        }

        if (!goForeground()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        running = true;
        com.jamanot.app.plugin.JamanotNativePlugin.emitDutyStateChanged(true);

        attachListeners();
        startLocationIfHelper();

        // START_STICKY so the system re-creates us after a low-memory kill.
        return START_STICKY;
    }

    /** @return false if the OS refused the foreground start. */
    private boolean goForeground() {
        try {
            int type;
            if ("helper".equals(Prefs.role(this)) && hasLocationPermission()) {
                type = ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
            } else {
                type = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
            }
            ServiceCompat.startForeground(
                    this, NotificationHelper.ID_DUTY,
                    NotificationHelper.buildDutyNotification(this), type);
            return true;
        } catch (Exception e) {
            // Android 12+ throws ForegroundServiceStartNotAllowedException when
            // started from the background; Android 14+ throws on a type mismatch.
            Log.w(TAG, "startForeground refused: " + e);
            NotificationHelper.postResumeDutyPrompt(this);
            return false;
        }
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    // ── Firestore ───────────────────────────────────────────────────────────

    private void attachListeners() {
        if (notifReg != null) return;

        try {
            db = FirebaseFirestore.getInstance();
        } catch (Exception e) {
            Log.w(TAG, "Firestore unavailable: " + e.getMessage());
            return;
        }

        List<String> targets = OrderMatcher.queryTargets(this);
        Log.i(TAG, "Listening on notifications for targets=" + targets);

        // Deliberately the same query shape as the web listener, so behaviour
        // cannot drift between the two. whereIn on a single field needs no
        // composite index, and 4 values is well under the 10-value cap.
        notifReg = db.collection("notifications")
                .whereIn("userId", targets)
                .limit(NOTIF_LIMIT)
                .addSnapshotListener(MetadataChanges.EXCLUDE, (snap, err) -> {
                    if (err != null) {
                        Log.w(TAG, "notifications listener: " + err.getMessage());
                        return;
                    }
                    if (snap == null) return;
                    onNotifications(snap.getDocumentChanges(), snap.getMetadata().isFromCache());
                });

        // Keeps the geofence radius live, so changing it in the admin panel takes
        // effect without an app update.
        pricingReg = db.collection("settings").document("pricing")
                .addSnapshotListener((doc, err) -> {
                    if (err != null || doc == null || !doc.exists()) return;
                    Object v = doc.get("helperRadiusKm");
                    if (v instanceof Number) {
                        Prefs.setRadiusKm(this, ((Number) v).floatValue());
                    }
                });
    }

    private void onNotifications(List<DocumentChange> changes, boolean fromCache) {
        // The first delivery is the existing window, not news. Without this the
        // service would fire an alert storm every time it starts.
        boolean suppress = !firstSnapshotHandled;
        firstSnapshotHandled = true;

        for (DocumentChange change : changes) {
            if (change.getType() != DocumentChange.Type.ADDED) continue;

            DocumentSnapshot doc = change.getDocument();
            String id = doc.getId();
            String notifUserId = doc.getString("userId");
            String type = doc.getString("type");
            Boolean read = doc.getBoolean("read");

            if (!OrderMatcher.targets(this, notifUserId)) continue;
            if (Boolean.TRUE.equals(read)) continue;

            // Second guard: anything created before this service started is
            // backlog even if the de-dup set was cleared.
            if (suppress || olderThanStart(doc.getString("createdAt"))) {
                Prefs.markSeen(this, id);
                continue;
            }

            // Persisted de-dup, so a restart doesn't re-alert on seen items.
            if (!Prefs.markSeen(this, id)) continue;

            String title = doc.getString("title");
            String body = doc.getString("body");
            String orderId = doc.getString("orderId");

            if ("new_order".equals(type)) {
                handleNewOrder(id, title, body, orderId);
            } else {
                NotificationHelper.postGeneral(this, id, title, body, orderId);
            }
        }
    }

    /**
     * createdAt is written as {@code new Date().toISOString()} on the web side,
     * so it is always UTC with milliseconds. Parsed with SimpleDateFormat rather
     * than java.time because minSdk is 24 and this avoids needing core library
     * desugaring for one timestamp.
     */
    private boolean olderThanStart(String createdAtIso) {
        if (createdAtIso == null) return false;
        try {
            java.text.SimpleDateFormat fmt =
                    new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US);
            fmt.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            Date d = fmt.parse(createdAtIso);
            return d != null && d.getTime() < startedAt;
        } catch (Exception e) {
            // Unparseable timestamp — treat as current rather than silently
            // dropping a real order.
            return false;
        }
    }

    /**
     * A new order needs the geofence applied before it becomes an alert. The
     * radius check lives here rather than on the write side because the
     * notification document carries no coordinates — only the order does.
     */
    private void handleNewOrder(String notifId, String title, String body, String orderId) {
        if (orderId == null) {
            dispatchAlert(notifId, title, body, null, null);
            return;
        }

        db.collection("orders").document(orderId).get()
                .addOnSuccessListener(orderDoc -> {
                    Double distance = null;
                    if (orderDoc != null && orderDoc.exists()) {
                        Map<String, Object> data = orderDoc.getData();
                        Double pLat = OrderMatcher.nestedNumber(data, "pickupLocation", "lat");
                        Double pLng = OrderMatcher.nestedNumber(data, "pickupLocation", "lng");
                        Double dLat = OrderMatcher.nestedNumber(data, "deliveryLocation", "lat");
                        Double dLng = OrderMatcher.nestedNumber(data, "deliveryLocation", "lng");

                        double hLat = Prefs.lat(this);
                        double hLng = Prefs.lng(this);
                        float radius = Prefs.radiusKm(this);

                        if (!OrderMatcher.withinRadius(hLat, hLng, pLat, pLng, dLat, dLng, radius)) {
                            Log.i(TAG, "Order " + orderId + " outside " + radius + "km — skipping.");
                            return;
                        }
                        distance = OrderMatcher.minDistanceKm(hLat, hLng, pLat, pLng, dLat, dLng);
                    }
                    dispatchAlert(notifId, title, body, orderId, distance);
                })
                .addOnFailureListener(e -> {
                    // Can't verify the radius — alert anyway. A spurious alert is
                    // recoverable; a missed order is lost income.
                    Log.w(TAG, "Order fetch failed, alerting anyway: " + e.getMessage());
                    dispatchAlert(notifId, title, body, orderId, null);
                });
    }

    /**
     * The escalation ladder. Each rung degrades cleanly into the one below it,
     * which is both the reliability story and the Play-review story.
     */
    private void dispatchAlert(String notifId, String title, String body, String orderId, Double distanceKm) {
        // 1. App already open and visible — don't double-alert. The existing
        //    in-app Firestore listener and UI handle it.
        if (MainActivity.isAppInForeground()) {
            com.jamanot.app.plugin.JamanotNativePlugin.emitOrderAlert(orderId);
            return;
        }

        String detail = body;
        if (distanceKm != null) {
            String d = OrderMatcher.formatDistance(distanceKm);
            detail = (body == null || body.isEmpty()) ? d : body + " · " + d;
        }

        // 2. Baseline everyone gets: heads-up notification, no special permission.
        NotificationHelper.postOrderAlert(this, notifId, title, detail, orderId);

        // 3. Opt-in escalation: actually bring the app to the front. Requires the
        //    user to have granted "Display over other apps", which is the
        //    documented exemption to the Android 10+ background-activity-start ban.
        if (Prefs.autoOpenEnabled(this) && canDrawOverlays()) {
            try {
                OrderAlertActivity.launch(this, orderId, title, detail);
            } catch (Exception e) {
                Log.w(TAG, "Auto-open refused: " + e.getMessage());
            }
        }
    }

    private boolean canDrawOverlays() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || android.provider.Settings.canDrawOverlays(this);
    }

    // ── Location ────────────────────────────────────────────────────────────

    private void startLocationIfHelper() {
        if (!"helper".equals(Prefs.role(this)) || !hasLocationPermission()) return;
        if (locationTracker == null) {
            locationTracker = new LocationTracker(this);
        }
        locationTracker.start();
    }

    // ── Android 15 foreground-service timeout ───────────────────────────────

    /**
     * Android 15 caps a dataSync foreground service at 6 hours per 24, then calls
     * this and forces a stop. Helpers run as type location and never hit it;
     * Stores can, so we surface a tap-to-resume notification rather than going
     * quiet without explanation.
     */
    @Override
    public void onTimeout(int startId) {
        Log.w(TAG, "Foreground service timed out (Android 15 dataSync cap).");
        NotificationHelper.postResumeDutyPrompt(this);
        stopSelf();
    }

    // ── Teardown & restart ──────────────────────────────────────────────────

    /**
     * Swiping the app from Recents does not stop the service (stopWithTask is
     * false in the manifest), but several OEM launchers kill it anyway. Schedule
     * an inexact wake-up to bring it back.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (Prefs.onDuty(this) && Prefs.isDutyRole(this)) {
            scheduleRestart();
        }
        super.onTaskRemoved(rootIntent);
    }

    private void scheduleRestart() {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(this, RestartServiceReceiver.class)
                    .setAction(RestartServiceReceiver.ACTION_RESTART_DUTY);
            PendingIntent pi = PendingIntent.getBroadcast(
                    this, 42, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            // Inexact on purpose: an exact alarm would need SCHEDULE_EXACT_ALARM,
            // another Play-restricted permission we don't qualify for.
            am.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + RESTART_DELAY_MS, pi);
        } catch (Exception e) {
            Log.w(TAG, "Restart alarm failed: " + e.getMessage());
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        com.jamanot.app.plugin.JamanotNativePlugin.emitDutyStateChanged(false);

        if (notifReg != null) { notifReg.remove(); notifReg = null; }
        if (pricingReg != null) { pricingReg.remove(); pricingReg = null; }
        if (locationTracker != null) { locationTracker.stop(); locationTracker = null; }

        super.onDestroy();
    }
}
