package com.jamanot.app.core;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

/**
 * Plays the new-order tone from Java, independently of everything that can
 * silence it.
 *
 * <p>Why this exists: the alert tone used to have two producers, and each had a
 * case where it produced nothing.
 * <ul>
 *   <li>The notification channel's own sound covers the backgrounded case — but
 *       only when a notification is actually posted.</li>
 *   <li>The WebView's AudioContext covers the foreground case — but it is
 *       blocked by the autoplay policy until the user has touched the app, so
 *       an auto-opened alert (nobody has touched anything yet) was silent. That
 *       is the "the first orders beep, later ones don't" report: once
 *       {@link com.jamanot.app.core.AutoOpen} raises the activity, every later
 *       alert takes the foreground path and lost its sound.</li>
 * </ul>
 *
 * <p>This class is the floor under both: in-process playback of a bundled asset
 * that needs no user gesture, no WebView, and no notification.
 *
 * <p>It plays on the notification stream and takes transient audio focus, so it
 * ducks music rather than fighting it. Silent mode and a zeroed notification
 * volume still silence it — those are the user's own settings and overriding
 * them is not ours to do.
 */
public final class AlertSound {

    private static final String TAG = "JamanotAlertSound";

    /** Guards {@link #player} — alerts can arrive from the FCM and duty threads at once. */
    private static final Object LOCK = new Object();

    private static MediaPlayer player;
    private static AudioFocusRequest focusRequest;

    private AlertSound() {}

    /**
     * Fires the new-order tone. Safe to call from any thread and in any app
     * state; every failure path is swallowed, because a broken sound must never
     * take the alert itself down with it.
     */
    public static void playOrderTone(Context c) {
        play(c, NotificationHelper.orderSoundUri(c));
    }

    // ── Repeating new-order alarm ────────────────────────────────────────────
    //
    // The single tone above is not enough for a helper: an unanswered order has
    // to keep ringing until they open the app and close the alert popup. That
    // loop used to live only in the WebView, which stays silent whenever the app
    // is closed or minimised — so the alarm stopped after the notification's own
    // one-shot sound unless AutoOpen managed to raise the app, which needs the
    // optional overlay permission and is further restricted on Android 15. The
    // loop therefore runs here. It is driven by ActiveOrderAlerts, which starts
    // it when an alert is raised and stops it once no alert is outstanding —
    // whether the user answered the popup or the order went to someone else.
    // Nothing else should call start/stop directly.

    /** Gap between tones: the asset is ~1.2 s, so this reads as a steady "ting ting". */
    private static final long ALARM_REPEAT_MS = 2_000L;

    /** Safety cap so an ignored alert can't ring (and hold the CPU) indefinitely. */
    private static final long ALARM_MAX_MS = 3 * 60_000L;

    private static final Handler HANDLER = new Handler(Looper.getMainLooper());

    private static boolean alarming = false;
    private static long alarmStartedAt = 0L;
    private static PowerManager.WakeLock alarmWakeLock;
    private static Runnable alarmTick;

    /**
     * Starts the repeating new-order tone, or extends it if one is already
     * ringing. Stopped by {@link #stopOrderAlarm} (ActiveOrderAlerts, once no
     * alert is outstanding) or by {@link #ALARM_MAX_MS}.
     *
     * @param initialDelayMs delay before the first tone — pass the repeat gap when
     *                       a notification has just played its own sound, so the
     *                       two don't overlap.
     */
    public static void startOrderAlarm(Context c, long initialDelayMs) {
        if (c == null) return;
        Context app = c.getApplicationContext();

        synchronized (LOCK) {
            alarmStartedAt = System.currentTimeMillis();
            if (alarming) return; // Already ringing — the cap is extended above.
            alarming = true;
            acquireAlarmWakeLockLocked(app);

            alarmTick = new Runnable() {
                @Override
                public void run() {
                    boolean capped;
                    synchronized (LOCK) {
                        if (!alarming || alarmTick != this) return;
                        capped = System.currentTimeMillis() - alarmStartedAt >= ALARM_MAX_MS;
                        if (capped) stopAlarmLocked(app);
                    }
                    if (capped) {
                        ActiveOrderAlerts.onAlarmCapped(app);
                        return;
                    }
                    playOrderTone(app);
                    HANDLER.postDelayed(this, ALARM_REPEAT_MS);
                }
            };
            HANDLER.postDelayed(alarmTick, Math.max(0L, initialDelayMs));
        }
    }

    /** Stops the repeating tone. Safe to call when nothing is ringing. */
    public static void stopOrderAlarm(Context c) {
        if (c == null) return;
        synchronized (LOCK) {
            stopAlarmLocked(c.getApplicationContext());
        }
    }

    public static boolean isAlarming() {
        synchronized (LOCK) {
            return alarming;
        }
    }

    private static void stopAlarmLocked(Context app) {
        if (alarmTick != null) HANDLER.removeCallbacks(alarmTick);
        alarmTick = null;
        if (alarming) releaseLocked(app); // Cut off a tone mid-play too.
        alarming = false;
        if (alarmWakeLock != null) {
            try {
                if (alarmWakeLock.isHeld()) alarmWakeLock.release();
            } catch (Exception ignored) {
            }
            alarmWakeLock = null;
        }
    }

    /**
     * Handler delays are measured in uptime, which stops while the CPU sleeps —
     * with the screen off the loop would stall after the first tone without this.
     * Timed to the cap, so the OS releases it even if nothing else does.
     */
    private static void acquireAlarmWakeLockLocked(Context app) {
        try {
            PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            alarmWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jamanot:orderAlarm");
            alarmWakeLock.setReferenceCounted(false);
            alarmWakeLock.acquire(ALARM_MAX_MS + ALARM_REPEAT_MS);
        } catch (Exception e) {
            Log.w(TAG, "Alarm wake lock refused: " + e.getMessage());
        }
    }

    private static void play(Context c, Uri sound) {
        if (c == null || sound == null) return;
        Context app = c.getApplicationContext();

        synchronized (LOCK) {
            // A burst of orders must not stack players on top of each other.
            releaseLocked(app);

            try {
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();

                MediaPlayer mp = new MediaPlayer();
                mp.setAudioAttributes(attrs);
                mp.setDataSource(app, sound);
                mp.setOnCompletionListener(p -> release(app));
                mp.setOnErrorListener((p, what, extra) -> {
                    Log.w(TAG, "playback error what=" + what + " extra=" + extra);
                    release(app);
                    return true;
                });
                mp.prepare();

                requestFocusLocked(app, attrs);
                player = mp;
                mp.start();
            } catch (Exception e) {
                // A missing codec, a revoked asset, no audio device: log and move
                // on — the notification and the in-app alert still stand.
                Log.w(TAG, "Could not play alert tone: " + e.getMessage());
                releaseLocked(app);
            }
        }
    }

    private static void requestFocusLocked(Context c, AudioAttributes attrs) {
        try {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(attrs)
                        .build();
                am.requestAudioFocus(focusRequest);
            } else {
                //noinspection deprecation
                am.requestAudioFocus(null, AudioManager.STREAM_NOTIFICATION,
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
            }
        } catch (Exception ignored) {
            // Focus is a courtesy to other apps; never a reason not to alert.
        }
    }

    private static void release(Context c) {
        synchronized (LOCK) {
            releaseLocked(c);
        }
    }

    private static void releaseLocked(Context c) {
        if (player != null) {
            try {
                player.reset();
                player.release();
            } catch (Exception ignored) {
            }
            player = null;
        }
        try {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusRequest != null) {
                    am.abandonAudioFocusRequest(focusRequest);
                    focusRequest = null;
                }
            } else {
                //noinspection deprecation
                am.abandonAudioFocus(null);
            }
        } catch (Exception ignored) {
        }
    }
}
