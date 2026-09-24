package com.jamanot.app.core;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
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
