package com.jamanot.app.ui;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.jamanot.app.MainActivity;
import com.jamanot.app.R;
import com.jamanot.app.core.NotificationHelper;
import com.jamanot.app.core.PendingAlerts;
import com.jamanot.app.plugin.JamanotNativePlugin;

/**
 * The full-screen "new order" takeover for on-duty Helpers and Stores.
 *
 * <p>Only reachable when the user has granted "Display over other apps" — that
 * permission is the documented exemption to Android 10+'s ban on starting an
 * activity from the background. Without it the service falls back to a heads-up
 * notification and this screen is never shown.
 *
 * <p>Note this deliberately does <i>not</i> use setFullScreenIntent. Since
 * Android 14 USE_FULL_SCREEN_INTENT is granted by default only to calling and
 * alarm apps, and Play policy restricts it to those categories — a delivery app
 * asking for it is a rejection risk for a capability it would likely lose anyway.
 */
public class OrderAlertActivity extends AppCompatActivity {

    private static final String EXTRA_TITLE = "alertTitle";
    private static final String EXTRA_DETAIL = "alertDetail";

    /** Auto-dismiss so a missed alert never strands the user on this screen. */
    private static final long AUTO_DISMISS_MS = 30_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wakeLock;
    private String orderId;

    public static void launch(Context c, String orderId, String title, String detail) {
        Intent i = new Intent(c, OrderAlertActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(NotificationHelper.EXTRA_ORDER_ID, orderId)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_DETAIL, detail);
        c.startActivity(i);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOverLockScreen();
        setContentView(R.layout.activity_order_alert);

        orderId = getIntent().getStringExtra(NotificationHelper.EXTRA_ORDER_ID);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        String detail = getIntent().getStringExtra(EXTRA_DETAIL);

        TextView titleView = findViewById(R.id.alert_title);
        TextView detailView = findViewById(R.id.alert_detail);
        if (title != null && !title.isEmpty()) titleView.setText(title);
        if (detail != null && !detail.isEmpty()) detailView.setText(detail);

        Button view = findViewById(R.id.alert_view);
        Button dismiss = findViewById(R.id.alert_dismiss);
        view.setOnClickListener(v -> openOrder());
        dismiss.setOnClickListener(v -> finishAndRemoveTask());

        // The heads-up notification stays behind, so dismissing here is not
        // destructive — the order is still one tap away.
        handler.postDelayed(this::finishAndRemoveTask, AUTO_DISMISS_MS);
    }

    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = getSystemService(KeyguardManager.class);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            //noinspection deprecation
            getWindow().addFlags(
                    android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }

        // Screen-on wake lock with a hard timeout — a stuck lock is a dead battery.
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                //noinspection deprecation
                wakeLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "jamanot:orderAlert");
                wakeLock.acquire(20_000L);
            }
        } catch (Exception ignored) {
        }
    }

    private void openOrder() {
        // Same handshake as a notification tap: park the id for the cold-start
        // path and emit for the warm one. handleSelectOrder() in page-client.tsx
        // does the rest.
        if (orderId != null) {
            PendingAlerts.set(orderId);
            JamanotNativePlugin.emitOrderAlert(orderId);
        }

        Intent i = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (orderId != null) i.putExtra(NotificationHelper.EXTRA_ORDER_ID, orderId);
        startActivity(i);
        finishAndRemoveTask();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
        super.onDestroy();
    }
}
