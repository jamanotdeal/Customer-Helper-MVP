package com.jamanot.app.receiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.jamanot.app.core.NotificationHelper;
import com.jamanot.app.core.Prefs;
import com.jamanot.app.service.DutyForegroundService;
import com.jamanot.app.work.DutyWatchdogWorker;

/**
 * Two jobs, both reached by broadcast:
 * <ul>
 *   <li>{@link #ACTION_RESTART_DUTY} — the alarm scheduled by onTaskRemoved,
 *       bringing duty back after a task-swipe or OEM kill.</li>
 *   <li>{@link #ACTION_STOP_DUTY} — the "Go off duty" action on the persistent
 *       notification. A visible off-switch matters for both UX and review.</li>
 * </ul>
 */
public class RestartServiceReceiver extends BroadcastReceiver {

    public static final String ACTION_RESTART_DUTY = "com.jamanot.app.RESTART_DUTY";
    public static final String ACTION_STOP_DUTY = "com.jamanot.app.STOP_DUTY";

    private static final String TAG = "DutyRestart";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) return;

        if (ACTION_STOP_DUTY.equals(action)) {
            Prefs.setOnDuty(context, false);
            DutyForegroundService.stop(context);
            DutyWatchdogWorker.cancel(context);
            NotificationHelper.cancel(context, NotificationHelper.ID_DUTY);
            return;
        }

        if (ACTION_RESTART_DUTY.equals(action)) {
            if (!Prefs.onDuty(context) || !Prefs.isDutyRole(context)) return;
            try {
                DutyForegroundService.start(context);
                DutyWatchdogWorker.enqueue(context);
            } catch (Exception e) {
                // A background start can be refused outright; leave the user a
                // tap-to-resume notification rather than failing silently.
                Log.w(TAG, "Restart refused: " + e.getMessage());
                NotificationHelper.postResumeDutyPrompt(context);
            }
        }
    }
}
