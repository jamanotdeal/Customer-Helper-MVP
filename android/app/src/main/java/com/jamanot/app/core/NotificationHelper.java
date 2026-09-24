package com.jamanot.app.core;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.jamanot.app.MainActivity;
import com.jamanot.app.R;

/**
 * All notification construction lives here so the duty service, the messaging
 * service and the boot receiver post identical-looking alerts.
 *
 * <p><b>Channels are immutable once created.</b> Android ignores later changes to
 * a channel's sound, importance or vibration. If any of those need to change,
 * bump the channel id (e.g. {@code CH_ORDER + "_v2"}) and delete the old one —
 * editing the values below will silently do nothing on existing installs.
 */
public final class NotificationHelper {

    public static final String CH_DUTY = "jamanot_duty";

    /**
     * v3 because channels are immutable: v1 had an over-intense vibration
     * pattern, and v2 was created before res/raw/new_order existed, so it is
     * pinned to whatever the device default notification sound was — including
     * "None" on a phone where the user has silenced that default. Setting the
     * sound on the existing channel does nothing, so the id is bumped and the
     * old ones are deleted in {@link #createChannels}.
     */
    public static final String CH_ORDER = "jamanot_order_alert_v3";
    private static final String CH_ORDER_LEGACY_V1 = "jamanot_order_alert";
    private static final String CH_ORDER_LEGACY_V2 = "jamanot_order_alert_v2";

    /** v4 for the same reason as CH_ORDER v3: the channel has to be re-created
     * to pick up the bundled tone. */
    public static final String CH_GENERAL = "jamanot_general_v4";
    private static final String CH_GENERAL_LEGACY_V1 = "jamanot_general";
    private static final String CH_GENERAL_LEGACY_V2 = "jamanot_general_v2";
    private static final String CH_GENERAL_LEGACY_V3 = "jamanot_general_v3";

    public static final int ID_DUTY = 1001;
    public static final int ID_RESUME = 1002;
    private static final int ID_ORDER_BASE = 2000;

    public static final String EXTRA_ORDER_ID = "orderId";

    private static final int BRAND = 0xFF059669;

    private NotificationHelper() {}

    /** Called from Application.onCreate so channels exist before anything posts. */
    public static void createChannels(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;

        // Persistent "on duty" notification. LOW so it never makes a sound or
        // pops a heads-up — it is a status indicator, not an alert.
        NotificationChannel duty = new NotificationChannel(
                CH_DUTY, c.getString(R.string.channel_duty_name), NotificationManager.IMPORTANCE_LOW);
        duty.setDescription(c.getString(R.string.channel_duty_desc));
        duty.setShowBadge(false);
        duty.enableVibration(false);
        duty.setSound(null, null);
        nm.createNotificationChannel(duty);

        // New order. HIGH so it heads-up over whatever the user is doing.
        // Vibration disabled — sound and heads-up are enough; the previous
        // long pattern was too intense for repeated alerts.
        NotificationChannel order = new NotificationChannel(
                CH_ORDER, c.getString(R.string.channel_order_name), NotificationManager.IMPORTANCE_HIGH);
        order.setDescription(c.getString(R.string.channel_order_desc));
        order.enableVibration(false);
        order.setVibrationPattern(null);
        order.enableLights(true);
        order.setLightColor(BRAND);
        order.setShowBadge(true);
        order.setBypassDnd(false);
        Uri sound = orderSoundUri(c);
        if (sound != null) {
            order.setSound(sound, new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
        }
        nm.createNotificationChannel(order);

        // Everything else: order status changes, admin broadcasts, customer
        // updates. HIGH with sound (no vibration) — still noticeable via the
        // heads-up + sound, but without the constant buzzing.
        NotificationChannel general = new NotificationChannel(
                CH_GENERAL, c.getString(R.string.channel_general_name), NotificationManager.IMPORTANCE_HIGH);
        general.setDescription(c.getString(R.string.channel_general_desc));
        general.setShowBadge(true);
        general.enableVibration(false);
        general.setVibrationPattern(null);
        general.enableLights(true);
        general.setLightColor(BRAND);
        Uri generalSound = orderSoundUri(c);
        if (generalSound != null) {
            general.setSound(generalSound, new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
        }
        nm.createNotificationChannel(general);

        // Retire prior channel ids so users aren't left with stale duplicates
        // (with vibration enabled) in the app's notification settings.
        try { nm.deleteNotificationChannel(CH_ORDER_LEGACY_V1); } catch (Exception ignored) {}
        try { nm.deleteNotificationChannel(CH_ORDER_LEGACY_V2); } catch (Exception ignored) {}
        try { nm.deleteNotificationChannel(CH_GENERAL_LEGACY_V1); } catch (Exception ignored) {}
        try { nm.deleteNotificationChannel(CH_GENERAL_LEGACY_V2); } catch (Exception ignored) {}
        try { nm.deleteNotificationChannel(CH_GENERAL_LEGACY_V3); } catch (Exception ignored) {}
    }

    /**
     * The alert tone: res/raw/new_order.* — bundled, so the alert never depends
     * on the device's default notification sound, which the user may have set
     * to "None". Falls back to the system default if the asset is ever dropped.
     *
     * <p>Public because {@link AlertSound} plays the same tone directly for the
     * foreground case, where no notification is posted.
     */
    public static Uri orderSoundUri(Context c) {
        int id = c.getResources().getIdentifier("new_order", "raw", c.getPackageName());
        if (id != 0) {
            return Uri.parse("android.resource://" + c.getPackageName() + "/" + id);
        }
        return android.provider.Settings.System.DEFAULT_NOTIFICATION_URI;
    }

    // ── Duty (foreground service) notification ──────────────────────────────

    public static Notification buildDutyNotification(Context c) {
        PendingIntent open = PendingIntent.getActivity(
                c, 0, new Intent(c, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // A customer is not "on duty" — they are just waiting on their own order,
        // so the persistent notification says that instead.
        boolean customer = Prefs.isCustomerRole(c);

        return new NotificationCompat.Builder(c, CH_DUTY)
                .setSmallIcon(R.drawable.ic_stat_jamanot)
                .setColor(BRAND)
                .setContentTitle(c.getString(customer ? R.string.duty_title_customer : R.string.duty_title))
                .setContentText(c.getString(customer ? R.string.duty_body_customer : R.string.duty_body))
                .setContentIntent(open)
                .addAction(0, c.getString(R.string.duty_action_view), open)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    // ── New order alert ─────────────────────────────────────────────────────

    /**
     * Heads-up alert for a new order. This is the baseline everyone gets — it
     * needs no special permission and works whether or not the overlay-based
     * auto-open is available.
     */
    public static void postOrderAlert(Context c, String notifId, String title, String body, String orderId) {
        Intent open = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (orderId != null) open.putExtra(EXTRA_ORDER_ID, orderId);

        PendingIntent pi = PendingIntent.getActivity(
                c, requestCode(notifId), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_ORDER)
                .setSmallIcon(R.drawable.ic_stat_jamanot)
                .setColor(BRAND)
                .setContentTitle(title != null ? title : c.getString(R.string.alert_new_order))
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pi)
                .addAction(0, c.getString(R.string.alert_view), pi)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setVibrate(new long[]{0})
                .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_LIGHTS);

        safeNotify(c, ID_ORDER_BASE + requestCode(notifId) % 1000, b.build());
    }

    /**
     * Status update — order progress from a store, admin broadcast, customer
     * update. Heads-up with sound and vibration via CH_GENERAL.
     */
    public static void postGeneral(Context c, String notifId, String title, String body, String orderId) {
        Intent open = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (orderId != null) open.putExtra(EXTRA_ORDER_ID, orderId);

        PendingIntent pi = PendingIntent.getActivity(
                c, requestCode(notifId), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(c, CH_GENERAL)
                .setSmallIcon(R.drawable.ic_stat_jamanot)
                .setColor(BRAND)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pi)
                .addAction(0, c.getString(R.string.alert_view), pi)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setVibrate(new long[]{0})
                .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_LIGHTS)
                .build();

        safeNotify(c, ID_ORDER_BASE + requestCode(notifId) % 1000, n);
    }

    /** Posted when the OS refuses a service start (Android 15 boot, FGS timeout). */
    public static void postResumeDutyPrompt(Context c) {
        PendingIntent open = PendingIntent.getActivity(
                c, 2, new Intent(c, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(c, CH_GENERAL)
                .setSmallIcon(R.drawable.ic_stat_jamanot)
                .setColor(BRAND)
                .setContentTitle(c.getString(R.string.duty_resume_title))
                .setContentText(c.getString(R.string.duty_resume_body))
                .setContentIntent(open)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build();

        safeNotify(c, ID_RESUME, n);
    }

    public static void cancel(Context c, int id) {
        NotificationManagerCompat.from(c).cancel(id);
    }

    /**
     * POST_NOTIFICATIONS may be revoked at any time on Android 13+, and notify()
     * throws rather than no-ops when it is.
     */
    private static void safeNotify(Context c, int id, Notification n) {
        try {
            NotificationManagerCompat.from(c).notify(id, n);
        } catch (SecurityException ignored) {
            // Permission revoked — nothing to do but stay quiet.
        }
    }

    private static int requestCode(String notifId) {
        return notifId == null ? 0 : Math.abs(notifId.hashCode());
    }
}
