package com.jamanot.app.work;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.jamanot.app.core.Prefs;
import com.jamanot.app.service.DutyForegroundService;

import java.util.concurrent.TimeUnit;

/**
 * Safety net for aggressive OEM task-killers.
 *
 * <p>MIUI, ColorOS and FuntouchOS will stop a foreground service that Android
 * itself would leave alone. WorkManager is JobScheduler-backed and survives most
 * of those kills, so a cheap 15-minute check is the most reliable way to notice
 * duty has died and bring it back. 15 minutes is WorkManager's floor for
 * periodic work.
 *
 * <p>This cannot defeat a genuine user force-stop — nothing can, by OS design.
 */
public class DutyWatchdogWorker extends Worker {

    private static final String TAG = "DutyWatchdog";
    private static final String WORK_NAME = "jamanot-duty-watchdog";

    public DutyWatchdogWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();

        if (!Prefs.onDuty(c) || !Prefs.isDutyRole(c) || Prefs.uid(c) == null) {
            cancel(c);
            return Result.success();
        }

        if (!DutyForegroundService.isRunning()) {
            Log.i(TAG, "Duty service not running — restarting.");
            try {
                DutyForegroundService.start(c);
            } catch (Exception e) {
                Log.w(TAG, "Watchdog restart refused: " + e.getMessage());
                return Result.retry();
            }
        }
        return Result.success();
    }

    public static void enqueue(Context c) {
        try {
            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                    DutyWatchdogWorker.class, 15, TimeUnit.MINUTES)
                    .build();
            WorkManager.getInstance(c).enqueueUniquePeriodicWork(
                    WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
        } catch (Exception e) {
            Log.w(TAG, "enqueue failed: " + e.getMessage());
        }
    }

    public static void cancel(Context c) {
        try {
            WorkManager.getInstance(c).cancelUniqueWork(WORK_NAME);
        } catch (Exception ignored) {
        }
    }
}
