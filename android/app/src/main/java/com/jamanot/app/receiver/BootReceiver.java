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
 * Restores duty after a reboot — and after an app update, which is the case
 * that usually gets forgotten: MY_PACKAGE_REPLACED fires because installing a
 * new version stops every running service without telling the user.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "DutyBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Prefs.onDuty(context) || !Prefs.isDutyRole(context) || Prefs.uid(context) == null) {
            return;
        }

        try {
            DutyForegroundService.start(context);
            DutyWatchdogWorker.enqueue(context);
        } catch (Exception e) {
            // Android 15 blocks several foreground-service types from starting on
            // BOOT_COMPLETED. `location` is currently allowed, but never assume:
            // fall back to a notification whose tap starts the service from a
            // foreground activity instead.
            Log.w(TAG, "Boot start refused: " + e.getMessage());
            NotificationHelper.postResumeDutyPrompt(context);
        }
    }
}
