package com.jamanot.app.core;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import com.jamanot.app.MainActivity;

/**
 * Brings the app to the foreground on a new order, with the order's alert modal
 * already open.
 *
 * <p>Single place for the escalation so the two wake paths behave identically.
 * They previously did not: {@link com.jamanot.app.service.DutyForegroundService}
 * escalated, while {@link com.jamanot.app.service.JamanotMessagingService} only
 * posted a notification — and FCM is precisely the path that runs when the
 * process has been killed, which is the case the auto-open exists for.
 *
 * <p>The launch target is {@link MainActivity} rather than a native takeover
 * screen: the requirement is the app itself open on the order, and
 * MainActivity's intent handler already parks the id in {@link PendingAlerts}
 * and emits to JS, so both the cold and warm starts land in handleSelectOrder().
 *
 * <p>Starting an activity from the background is banned since Android 10. The
 * documented exemption is SYSTEM_ALERT_WINDOW ("Display over other apps"), so
 * that permission is the gate — without it this is a no-op and the heads-up
 * notification posted alongside remains the user's path to the order.
 */
public final class AutoOpen {

    private static final String TAG = "JamanotAutoOpen";

    /** Long enough to cover the WebView's cold start, short enough to be safe. */
    private static final long WAKE_MS = 15_000L;

    private AutoOpen() {}

    /** True when the OS will actually let us start an activity from the background. */
    public static boolean canAutoOpen(Context c) {
        return Prefs.autoOpenEnabled(c) && Prefs.canDrawOverlays(c);
    }

    /**
     * Wakes the screen and launches MainActivity on {@code orderId}.
     *
     * <p>Safe to call unconditionally — it self-checks the permission and the
     * user's preference, and never throws.
     *
     * @return true if the activity start was issued.
     */
    public static boolean launch(Context c, String orderId) {
        if (!canAutoOpen(c)) return false;

        // Park it before starting: on a cold start React mounts a second or two
        // after the activity, far too late for the plugin event alone.
        PendingAlerts.set(orderId);

        wakeScreen(c);

        try {
            // Same flags the notification's PendingIntent uses. MainActivity is
            // launchMode="singleTask", so this resumes the existing task and
            // delivers onNewIntent rather than stacking a second instance.
            Intent i = new Intent(c, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            if (orderId != null && !orderId.isEmpty()) {
                i.putExtra(NotificationHelper.EXTRA_ORDER_ID, orderId);
            }
            // Tells MainActivity to show over the keyguard for this launch only.
            i.putExtra(MainActivity.EXTRA_FROM_ALERT, true);
            c.startActivity(i);
            return true;
        } catch (Exception e) {
            // An OEM can still refuse. The notification is already posted, so the
            // order is not lost — it just costs the user a tap.
            Log.w(TAG, "Auto-open refused: " + e.getMessage());
            return false;
        }
    }

    /**
     * Turns the display on so the alert is actually seen. MainActivity's
     * setTurnScreenOn() covers this too, but only once it reaches onCreate —
     * acquiring here means the screen is already coming up while the WebView
     * cold-starts.
     */
    private static void wakeScreen(Context c) {
        try {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH && pm.isInteractive()) return;

            @SuppressWarnings("deprecation")
            PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "jamanot:autoOpen");
            wl.setReferenceCounted(false);
            // Timed acquire: released by the OS even if this process dies first.
            wl.acquire(WAKE_MS);
        } catch (Exception e) {
            Log.w(TAG, "Wake refused: " + e.getMessage());
        }
    }
}
