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
import com.google.firebase.firestore.FieldPath;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.FirebaseFirestoreException;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;
import com.google.firebase.firestore.Query;
import com.jamanot.app.core.NotificationHelper;
import com.jamanot.app.core.OrderAlertDispatcher;
import com.jamanot.app.core.OrderMatcher;
import com.jamanot.app.core.Prefs;
import com.jamanot.app.receiver.RestartServiceReceiver;

import java.util.Date;
import java.util.List;

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

    /** Window used when the createdAt index is missing — see attachNotifListener. */
    private static final int NOTIF_LIMIT_FALLBACK = 200;

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
        if ("helper".equals(Prefs.role(this)) && hasLocationPermission()
                && startForegroundAs(ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)) {
            return true;
        }
        // A location-type service may only start while the app is in use, so a
        // restart from the background — FCM resurrecting the process after an
        // OEM kill, the watchdog, boot — is refused for it on Android 14+.
        // Falling back to dataSync keeps the order listener alive; the helper's
        // last known position still drives the radius check.
        if (startForegroundAs(ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)) return true;

        NotificationHelper.postResumeDutyPrompt(this);
        return false;
    }

    private boolean startForegroundAs(int type) {
        try {
            ServiceCompat.startForeground(
                    this, NotificationHelper.ID_DUTY,
                    NotificationHelper.buildDutyNotification(this), type);
            return true;
        } catch (Exception e) {
            // Android 12+ throws ForegroundServiceStartNotAllowedException when
            // started from the background; Android 14+ throws on a type mismatch
            // or a missing while-in-use permission.
            Log.w(TAG, "startForeground(type=" + type + ") refused: " + e);
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
        // cannot drift between the two — ordering included. A limit() with no
        // orderBy is not "the newest N": Firestore returns the first N in
        // document-id order, i.e. the OLDEST, which starved this listener of
        // every notification created after the window filled up.
        attachNotifListener(targets, true);

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

    /**
     * @param ordered order by {@code createdAt desc}, which needs the composite
     *                index in firestore.indexes.json. When that index has not
     *                been deployed the query fails with FAILED_PRECONDITION, so
     *                we retry once ordered by document id — ids are
     *                {@code notif-<epoch ms>...}, so recent documents still land
     *                in the window rather than the helper getting nothing.
     */
    private void attachNotifListener(List<String> targets, boolean ordered) {
        Query q = db.collection("notifications").whereIn("userId", targets);
        q = ordered
                ? q.orderBy("createdAt", Query.Direction.DESCENDING)
                : q.orderBy(FieldPath.documentId(), Query.Direction.DESCENDING);

        // Wider window in the fallback: documents written before the web layer
        // normalised ids to timestamp-first (`notif-ded-*`, `notif-shop-*`) sort
        // above every `notif-<ms>` id, so a tight window could be filled by that
        // legacy backlog alone.
        notifReg = q.limit(ordered ? NOTIF_LIMIT : NOTIF_LIMIT_FALLBACK)
                .addSnapshotListener(MetadataChanges.EXCLUDE, (snap, err) -> {
                    if (err != null) {
                        if (ordered && err.getCode() == FirebaseFirestoreException.Code.FAILED_PRECONDITION) {
                            Log.w(TAG, "notifications index missing — retrying in document-id order. "
                                    + "Deploy firestore.indexes.json to restore createdAt ordering.");
                            if (notifReg != null) { notifReg.remove(); notifReg = null; }
                            firstSnapshotHandled = false;
                            attachNotifListener(targets, false);
                            return;
                        }
                        Log.w(TAG, "notifications listener: " + err.getMessage());
                        return;
                    }
                    if (snap == null) return;
                    Log.i(TAG, "notif snapshot: size=" + snap.size()
                            + " changes=" + snap.getDocumentChanges().size()
                            + " fromCache=" + snap.getMetadata().isFromCache()
                            + " ordered=" + ordered);
                    onNotifications(snap.getDocumentChanges(), snap.getMetadata().isFromCache());
                });
    }

    private void onNotifications(List<DocumentChange> changes, boolean fromCache) {
        // The first delivery is mostly the existing window, not news — without a
        // guard the service would fire an alert storm every time it starts. But
        // a blanket skip also swallowed real orders: the listener attaches a
        // moment after the service starts, and anything created inside that
        // window arrives in this very first snapshot. Those were marked seen and
        // never alerted, on a restart the user never saw (watchdog, Android 15
        // FGS timeout, boot, app update). So the blanket skip now applies only
        // where the per-document createdAt check below cannot judge for itself.
        boolean firstSnapshot = !firstSnapshotHandled;
        firstSnapshotHandled = true;

        for (DocumentChange change : changes) {
            if (change.getType() != DocumentChange.Type.ADDED) continue;

            DocumentSnapshot doc = change.getDocument();
            String id = doc.getId();
            String notifUserId = doc.getString("userId");
            String type = doc.getString("type");
            Boolean read = doc.getBoolean("read");

            if (!OrderMatcher.targets(this, notifUserId)) {
                Log.d(TAG, "skip " + id + ": not targeted (userId=" + notifUserId + ")");
                continue;
            }
            // A new order ignores the document's read flag. Broadcasts are one
            // document shared by every helper, and older app builds wrote
            // read:true onto them when *their* user opened the drawer — which
            // silently cancelled the alert, alarm and auto-open on every other
            // phone. Repeats are already prevented per device (markSeen below),
            // and the dispatcher drops an order that is no longer open.
            if (Boolean.TRUE.equals(read) && !"new_order".equals(type)) {
                Log.d(TAG, "skip " + id + ": already read");
                continue;
            }

            // Anything created before this service started is backlog even if
            // the de-dup set was cleared. On the first snapshot a document with
            // no usable createdAt is treated as backlog too, since there is
            // nothing else to distinguish it from the window being replayed.
            String createdAt = doc.getString("createdAt");
            if (olderThanStart(createdAt) || (firstSnapshot && !hasTimestamp(createdAt))) {
                Log.d(TAG, "skip " + id + ": backlog (firstSnapshot=" + firstSnapshot + ")");
                Prefs.markSeen(this, id);
                continue;
            }

            // Persisted de-dup, so a restart doesn't re-alert on seen items.
            if (!Prefs.markSeen(this, id)) {
                Log.d(TAG, "skip " + id + ": already seen");
                continue;
            }
            Log.i(TAG, "alerting " + id + " type=" + type);

            String title = doc.getString("title");
            String body = doc.getString("body");
            String orderId = doc.getString("orderId");

            if ("new_order".equals(type)) {
                // Shared with FCM and the WebView — see OrderAlertDispatcher.
                OrderAlertDispatcher.handleNewOrder(this, id, title, body, orderId);
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
    /** True when createdAt is present and in the format olderThanStart() can read. */
    private boolean hasTimestamp(String createdAtIso) {
        return createdAtIso != null && parseCreatedAt(createdAtIso) != null;
    }

    private boolean olderThanStart(String createdAtIso) {
        Date d = parseCreatedAt(createdAtIso);
        // Unparseable timestamp — treat as current rather than silently
        // dropping a real order.
        return d != null && d.getTime() < startedAt;
    }

    private Date parseCreatedAt(String createdAtIso) {
        if (createdAtIso == null) return null;
        try {
            java.text.SimpleDateFormat fmt =
                    new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US);
            fmt.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            return fmt.parse(createdAtIso);
        } catch (Exception e) {
            return null;
        }
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
