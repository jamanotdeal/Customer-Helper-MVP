package com.jamanot.app.core;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.SetOptions;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * The phone's end of a push's timeline, in {@code pushReceipts/{notifId}_{uid}}.
 * The push function records the server's end in {@code pushLog/{notifId}}; FCM
 * accepting a message there says nothing about when, or whether, it reached
 * the phone. This does.
 *
 * <ul>
 *   <li>{@link #received} — when the push arrived, how late, at which priority,
 *       and what the app did with it ({@code outcome}). {@code originalPriority}
 *       high with {@code priority} normal means FCM has deprioritised the app.
 *       The device state that decides delivery is recorded alongside:
 *       notification permission, the alert channel's importance, battery
 *       optimisation, and the app standby bucket (on Android 9+ a rare or
 *       restricted bucket caps how many high-priority pushes are delivered at
 *       once).</li>
 *   <li>{@link #opened} — when the user tapped the notification.</li>
 * </ul>
 *
 * <p>One small write per push delivered to the device, and one per tap; a TTL
 * policy on {@code expireAt} purges them.
 */
public final class PushReceipts {

    private static final String TAG = "JamanotFCM";

    private static final long RECEIPT_TTL_MS = 14L * 24 * 60 * 60 * 1000;

    private PushReceipts() {}

    public static void received(Context c, String notifId, @Nullable String type, @Nullable String orderId,
                                long receivedAt, long createdAtMs, long sentAt,
                                String priority, String originalPriority, boolean foreground,
                                String outcome, long handledMs) {
        String uid = Prefs.uid(c);
        if (notifId == null || uid == null) return;
        try {
            Map<String, Object> r = new HashMap<>();
            r.put("notifId", notifId);
            r.put("uid", uid);
            r.put("type", type);
            r.put("orderId", orderId);
            r.put("receivedAt", new Date(receivedAt));
            if (createdAtMs > 0) r.put("sinceCreatedMs", receivedAt - createdAtMs);
            if (sentAt > 0) r.put("sinceSentMs", receivedAt - sentAt);
            r.put("priority", priority);
            r.put("originalPriority", originalPriority);
            r.put("foreground", foreground);
            r.put("role", Prefs.role(c));
            r.put("onDuty", Prefs.onDuty(c));
            r.put("outcome", outcome);
            r.put("handledMs", handledMs);
            r.putAll(deviceState(c));
            r.put("expireAt", new Date(receivedAt + RECEIPT_TTL_MS));
            FirebaseFirestore.getInstance()
                    .collection("pushReceipts").document(notifId + "_" + uid)
                    .set(r, SetOptions.merge())
                    .addOnFailureListener(e -> Log.w(TAG, "receipt write: " + e.getMessage()));
        } catch (Exception e) {
            Log.w(TAG, "receipt not recorded: " + e.getMessage());
        }
    }

    /** The user opened the app from this notification. Merged: the push may not have been what showed it. */
    public static void opened(Context c, @Nullable String notifId) {
        String uid = Prefs.uid(c);
        if (notifId == null || notifId.isEmpty() || uid == null) return;
        try {
            long now = System.currentTimeMillis();
            Map<String, Object> r = new HashMap<>();
            r.put("notifId", notifId);
            r.put("uid", uid);
            r.put("openedAt", new Date(now));
            r.put("expireAt", new Date(now + RECEIPT_TTL_MS));
            FirebaseFirestore.getInstance()
                    .collection("pushReceipts").document(notifId + "_" + uid)
                    .set(r, SetOptions.merge())
                    .addOnFailureListener(e -> Log.w(TAG, "open receipt write: " + e.getMessage()));
        } catch (Exception e) {
            Log.w(TAG, "open receipt not recorded: " + e.getMessage());
        }
    }

    private static Map<String, Object> deviceState(Context c) {
        Map<String, Object> s = new HashMap<>();
        try {
            s.put("notificationsEnabled", NotificationManagerCompat.from(c).areNotificationsEnabled());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = c.getSystemService(NotificationManager.class);
                NotificationChannel ch = nm == null ? null : nm.getNotificationChannel(NotificationHelper.CH_ORDER);
                if (ch != null) s.put("orderChannelImportance", ch.getImportance());
            }
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                s.put("batteryUnrestricted", pm.isIgnoringBatteryOptimizations(c.getPackageName()));
                s.put("deviceIdle", pm.isDeviceIdleMode());
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
                if (usm != null) s.put("standbyBucket", bucketName(usm.getAppStandbyBucket()));
            }
            s.put("device", Build.MANUFACTURER + " " + Build.MODEL + " / Android " + Build.VERSION.RELEASE);
        } catch (Exception e) {
            Log.w(TAG, "device state unreadable: " + e.getMessage());
        }
        return s;
    }

    private static String bucketName(int bucket) {
        switch (bucket) {
            case UsageStatsManager.STANDBY_BUCKET_ACTIVE: return "active";
            case UsageStatsManager.STANDBY_BUCKET_WORKING_SET: return "working_set";
            case UsageStatsManager.STANDBY_BUCKET_FREQUENT: return "frequent";
            case UsageStatsManager.STANDBY_BUCKET_RARE: return "rare";
            case 45: return "restricted"; // STANDBY_BUCKET_RESTRICTED, API 30
            default: return String.valueOf(bucket);
        }
    }
}
