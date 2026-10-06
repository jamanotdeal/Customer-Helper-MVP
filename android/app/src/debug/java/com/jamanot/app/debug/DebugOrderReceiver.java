package com.jamanot.app.debug;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.google.android.gms.tasks.Tasks;
import com.jamanot.app.core.OrderAlertDispatcher;

import java.util.concurrent.TimeUnit;

/**
 * Debug builds only: replays a new-order push without the server, so the
 * wake-and-open path can be tested on a real phone. A broadcast reaches the
 * app exactly the way an FCM delivery does — including on OEMs that freeze
 * background apps, which thaw the process for the receiver and nothing more.
 *
 * <pre>
 * adb shell am broadcast -a com.google.android.c2dm.intent.RECEIVE \
 *     -n com.jamanot.app/.debug.DebugOrderReceiver \
 *     --es orderId &lt;id&gt; [--es title "..."] [--es body "..."]
 * </pre>
 */
public class DebugOrderReceiver extends BroadcastReceiver {

    private static final String TAG = "JamanotDebug";

    @Override
    public void onReceive(Context context, Intent intent) {
        Context app = context.getApplicationContext();
        String orderId = intent.getStringExtra("orderId");
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String notifId = "debug-" + System.currentTimeMillis();

        String replayOf = intent.getStringExtra("notifId");
        if (replayOf != null) notifId = replayOf;
        Log.i(TAG, "replaying new_order " + orderId + " as " + notifId);

        // Same shape as JamanotMessagingService: wait on the dispatch off the
        // main thread, inside the receiver's lifetime.
        final String id = notifId;
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                Tasks.await(OrderAlertDispatcher.onNewOrderPush(app, id,
                        title != null ? title : "Debug order", body != null ? body : "", orderId),
                        8, TimeUnit.SECONDS);
            } catch (Exception e) {
                Log.w(TAG, "dispatch still pending: " + e.getMessage());
            } finally {
                pending.finish();
            }
        }).start();
    }
}
