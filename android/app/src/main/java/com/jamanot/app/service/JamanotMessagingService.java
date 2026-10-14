package com.jamanot.app.service;

import android.util.Log;

import androidx.annotation.NonNull;

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.SetOptions;
import com.google.firebase.firestore.WriteBatch;
import com.jamanot.app.MainActivity;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.jamanot.app.core.NotificationHelper;
import com.jamanot.app.core.OrderAlertDispatcher;
import com.jamanot.app.core.OrderMatcher;
import com.jamanot.app.core.Prefs;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * The <b>secondary</b> wake path.
 *
 * <p>{@link DutyForegroundService}'s own Firestore listener is the primary
 * mechanism and needs no server. This class matters for the case that listener
 * cannot cover: the process has been stopped by an OEM battery manager. FCM is
 * delivered by Play Services, which those managers do not touch, so a push can
 * resurrect the app when nothing else would.
 *
 * <p>These are sent by the {@code pushOnNotificationCreate} Cloud Function in
 * functions/index.js, which triggers on {@code notifications/{id}} creates and
 * calls the FCM HTTP v1 API. It stays server-side deliberately: a service
 * account shipped inside the APK is extractable and would let anyone push to
 * every user. The function sends <b>data-only</b> messages, so this method runs
 * for every push and the targeting, de-duplication and channel choice below
 * stay in the app's hands.
 */
public class JamanotMessagingService extends FirebaseMessagingService {

    private static final String TAG = "JamanotFCM";

    /** FCM allows ~20 s per message; the order fetch is normally well under one. */
    private static final long DISPATCH_TIMEOUT_S = 8L;

    /** How long a delivery receipt is kept (a TTL policy on expireAt purges it). */
    private static final long RECEIPT_TTL_MS = 14L * 24 * 60 * 60 * 1000;

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        String previous = Prefs.fcmToken(this);
        Prefs.setFcmToken(this, token);

        // Same shape saveFcmToken() writes from JS: this device in fcmTokens
        // (one entry per signed-in device) and as the newest in fcmToken. The
        // rotated-out token is taken off, so pushes stop going to it.
        String uid = Prefs.uid(this);
        if (uid == null) return;
        try {
            FirebaseFirestore db = FirebaseFirestore.getInstance();
            WriteBatch batch = db.batch();
            com.google.firebase.firestore.DocumentReference ref = db.collection("users").document(uid);
            if (previous != null && !previous.equals(token)) {
                Map<String, Object> remove = new HashMap<>();
                remove.put("fcmTokens", FieldValue.arrayRemove(previous));
                batch.set(ref, remove, SetOptions.merge());
            }
            Map<String, Object> add = new HashMap<>();
            add.put("fcmToken", token);
            add.put("fcmTokens", FieldValue.arrayUnion(token));
            batch.set(ref, add, SetOptions.merge());
            batch.commit().addOnFailureListener(e -> Log.w(TAG, "token write: " + e.getMessage()));
        } catch (Exception e) {
            Log.w(TAG, "Firestore unavailable: " + e.getMessage());
        }
    }

    /**
     * When the push got here and how — the device end of the timings the push
     * function records in pushLog. {@code originalPriority} high but
     * {@code priority} normal means Android/FCM has deprioritised this app,
     * which delays its pushes until the phone next wakes.
     */
    private void logReceipt(RemoteMessage message, Map<String, String> data, String notifId, String type) {
        long now = System.currentTimeMillis();
        long createdAtMs = parseLong(data.get("createdAtMs"));
        long sentAt = parseLong(data.get("sentAt"));
        String priority = priorityName(message.getPriority());
        String originalPriority = priorityName(message.getOriginalPriority());
        boolean foreground = MainActivity.isAppInForeground();
        Log.i(TAG, "push " + notifId + " type=" + type
                + " sinceCreated=" + (createdAtMs > 0 ? (now - createdAtMs) + "ms" : "?")
                + " sinceSent=" + (sentAt > 0 ? (now - sentAt) + "ms" : "?")
                + " priority=" + priority + " (sent " + originalPriority + ")"
                + " foreground=" + foreground + " role=" + Prefs.role(this) + " onDuty=" + Prefs.onDuty(this));

        // New orders only: those are the ones whose lateness costs money.
        String uid = Prefs.uid(this);
        if (!"new_order".equals(type) || notifId == null || uid == null) return;
        try {
            Map<String, Object> r = new HashMap<>();
            r.put("notifId", notifId);
            r.put("uid", uid);
            r.put("orderId", data.get("orderId"));
            r.put("receivedAt", new Date(now));
            if (createdAtMs > 0) r.put("sinceCreatedMs", now - createdAtMs);
            if (sentAt > 0) r.put("sinceSentMs", now - sentAt);
            r.put("priority", priority);
            r.put("originalPriority", originalPriority);
            r.put("foreground", foreground);
            r.put("role", Prefs.role(this));
            r.put("onDuty", Prefs.onDuty(this));
            r.put("expireAt", new Date(now + RECEIPT_TTL_MS));
            FirebaseFirestore.getInstance()
                    .collection("pushReceipts").document(notifId + "_" + uid)
                    .set(r)
                    .addOnFailureListener(e -> Log.w(TAG, "receipt write: " + e.getMessage()));
        } catch (Exception e) {
            Log.w(TAG, "receipt not recorded: " + e.getMessage());
        }
    }

    private static long parseLong(String v) {
        if (v == null) return 0L;
        try {
            return Long.parseLong(v);
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private static String priorityName(int p) {
        switch (p) {
            case RemoteMessage.PRIORITY_HIGH: return "high";
            case RemoteMessage.PRIORITY_NORMAL: return "normal";
            default: return "unknown";
        }
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();

        String notifId = data.get("tag") != null ? data.get("tag") : message.getMessageId();
        String type = data.get("type");
        String orderId = data.get("orderId");
        String targetUserId = data.get("userId");

        String title = data.get("title");
        String body = data.get("body");
        if (message.getNotification() != null) {
            if (title == null) title = message.getNotification().getTitle();
            if (body == null) body = message.getNotification().getBody();
        }

        logReceipt(message, data, notifId, type);

        // Same targeting predicate the duty listener uses, so a push cannot alert
        // someone the Firestore path would have filtered out.
        if (targetUserId != null && !OrderMatcher.targets(this, targetUserId)) {
            Log.i(TAG, "push " + notifId + " not for the account signed in here — dropped.");
            return;
        }

        if ("new_order".equals(type)) {
            // Resurrection: if the user is on duty but our process was killed,
            // this push is the opportunity to bring the service back.
            if (Prefs.onDuty(this) && Prefs.isDutyRole(this) && !DutyForegroundService.isRunning()) {
                try {
                    DutyForegroundService.start(this);
                } catch (Exception e) {
                    Log.w(TAG, "Service resurrect refused: " + e.getMessage());
                }
            }

            // Same path as the duty listener — alarm, popup payload, tray
            // notification and auto-open all live there. This matters most
            // here: when an OEM battery manager has killed or frozen the
            // process, this is the only code that runs. Waited on (we're on an
            // FCM worker thread) so the process isn't frozen or reclaimed
            // before the app has been opened — including when the listener got
            // there first (see onNewOrderPush).
            try {
                Tasks.await(OrderAlertDispatcher.onNewOrderPush(this, notifId, title, body, orderId),
                        DISPATCH_TIMEOUT_S, TimeUnit.SECONDS);
            } catch (Exception e) {
                Log.w(TAG, "new_order dispatch still pending: " + e.getMessage());
            }
            return;
        }

        // De-duplicate against the Firestore listener: whichever arrives first wins.
        if (notifId != null && !Prefs.markSeen(this, notifId)) return;

        // A status update is a tray entry, as on the duty path. It used to be
        // sent to the WebView as an orderAlert while the app was open, which
        // yanked the user onto that order mid-task.
        NotificationHelper.postGeneral(this, notifId, title, body, orderId);
    }
}
