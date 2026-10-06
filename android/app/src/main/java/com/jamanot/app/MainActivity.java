package com.jamanot.app;

import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.annotation.Nullable;
import androidx.core.splashscreen.SplashScreen;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.getcapacitor.BridgeActivity;
import com.jamanot.app.auth.GoogleAuthPlugin;
import com.jamanot.app.core.ActiveOrderAlerts;
import com.jamanot.app.core.NotificationHelper;
import com.jamanot.app.core.OrderOverlay;
import com.jamanot.app.core.PendingAlerts;
import com.jamanot.app.core.Prefs;
import com.jamanot.app.plugin.JamanotNativePlugin;

import java.lang.ref.WeakReference;

public class MainActivity extends BridgeActivity {

    /** Hard ceiling on the pull-to-refresh spinner if JS never answers. */
    private static final long REFRESH_WATCHDOG_MS = 6000L;

    /**
     * Set by {@link com.jamanot.app.core.AutoOpen} so this launch knows it was
     * triggered by an order alert rather than by the user tapping the icon —
     * only then do we take over the keyguard.
     */
    public static final String EXTRA_FROM_ALERT = "fromOrderAlert";

    /** True between an alert-driven launch and the activity next going hidden. */
    private boolean showingOverLockScreen = false;

    private SwipeRefreshLayout swipeLayout;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable refreshWatchdog;

    /** Tracked so the duty service can skip alerting while the UI is visible. */
    private static volatile boolean activityResumed = false;

    /** For {@link #onOrderAlertsEnded}, which runs wherever the last alert ends. */
    private static WeakReference<MainActivity> current;

    public static boolean isAppInForeground() {
        return activityResumed;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must precede super.onCreate — installSplashScreen swaps the launch
        // theme for the post-splash theme, and that has to happen before the
        // activity's content view is created or Android 12+ paints its default.
        SplashScreen.installSplashScreen(this);

        registerPlugin(JamanotNativePlugin.class);
        registerPlugin(GoogleAuthPlugin.class);

        super.onCreate(savedInstanceState);

        // The WebView paints transparent until the page has a background, and the
        // window beneath would otherwise show through as a grey frame.
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.setBackgroundColor(Color.WHITE);
            // The in-app alarm loop is Web Audio, and the WebView's autoplay gate
            // blocks it until the user has touched the app. An auto-opened alert
            // is exactly the case where nobody has, so without this the repeating
            // tone that tells a helper an order is still unanswered never starts.
            // AlertSound covers the single alert tone regardless; this is what
            // makes the repeat work.
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
        ViewGroup root = findViewById(android.R.id.content);
        if (root != null) root.setBackgroundColor(Color.WHITE);

        setupPullToRefresh();
        showOverLockScreenIfAlert(getIntent());
        handleAlertIntent(getIntent());
    }

    /**
     * An auto-opened alert has to be visible on a locked, sleeping phone —
     * otherwise the app "opens" behind the keyguard and the user sees nothing
     * until they unlock. Applied per-launch instead of via the manifest so a
     * normal icon tap keeps ordinary lock-screen behaviour.
     */
    private void showOverLockScreenIfAlert(@Nullable Intent intent) {
        if (intent == null || !intent.getBooleanExtra(EXTRA_FROM_ALERT, false)) return;
        intent.removeExtra(EXTRA_FROM_ALERT);
        showingOverLockScreen = true;

        // A phone on a table must not time out from under the popup while it is
        // still asking for an answer. Dropped once the alerts end.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
                KeyguardManager km = getSystemService(KeyguardManager.class);
                // Dismisses only an insecure keyguard; a PIN/pattern stays put
                // and the activity shows above it, which is the correct trade.
                if (km != null) km.requestDismissKeyguard(this, null);
            } else {
                //noinspection deprecation
                getWindow().addFlags(
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
            }
        } catch (Exception ignored) {
            // Never let a keyguard quirk stop the app from opening.
        }
    }

    // ── Pull to refresh ─────────────────────────────────────────────────────

    /**
     * The SwipeRefreshLayout comes from our own
     * res/layout/capacitor_bridge_layout_main.xml, which shadows the one inside
     * @capacitor/android — so there is no runtime reparenting to go wrong.
     */
    private void setupPullToRefresh() {
        swipeLayout = findViewById(R.id.swipe_refresh);
        if (swipeLayout == null) return;

        final WebView webView = getBridge().getWebView();

        swipeLayout.setColorSchemeColors(0xFF059669);
        swipeLayout.setProgressBackgroundColorSchemeColor(Color.WHITE);

        // Two gates, because scroll position alone is not enough. The app's inner
        // scrollers (notification drawer, admin tables, Leaflet maps) consume the
        // touch themselves, so the WebView's own scrollY stays at 0 and a drag
        // inside a modal would otherwise read as a page pull. The second gate is
        // driven from JS via setPullToRefreshEnabled().
        swipeLayout.setOnChildScrollUpCallback((parent, child) ->
                (webView != null && webView.getScrollY() > 0)
                        || !Prefs.pullToRefreshEnabled(MainActivity.this));

        swipeLayout.setOnRefreshListener(() -> {
            // Preferred path: JS re-attaches its Firestore listeners and calls
            // finishRefresh(). Keeps React state, the open tab and the session.
            JamanotNativePlugin.emitPullToRefresh();

            // Fallback: if JS is wedged — which is exactly when a user pulls to
            // refresh — reload the WebView. Firebase Auth persistence lives in
            // IndexedDB, so the user stays logged in across the reload.
            refreshWatchdog = () -> {
                if (webView != null) webView.reload();
                finishRefreshing();
            };
            handler.postDelayed(refreshWatchdog, REFRESH_WATCHDOG_MS);
        });
    }

    /** Called by the plugin when JS reports the refresh is done. */
    public void finishRefreshing() {
        handler.post(() -> {
            if (refreshWatchdog != null) {
                handler.removeCallbacks(refreshWatchdog);
                refreshWatchdog = null;
            }
            if (swipeLayout != null) swipeLayout.setRefreshing(false);
        });
    }

    public void setPullToRefreshEnabled(boolean enabled) {
        Prefs.setPullToRefreshEnabled(this, enabled);
        handler.post(() -> {
            if (swipeLayout != null && !enabled) swipeLayout.setRefreshing(false);
        });
    }

    // ── Deep link from a notification or the full-screen alert ──────────────

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        showOverLockScreenIfAlert(intent);
        handleAlertIntent(intent);
    }

    /**
     * Two delivery routes on purpose:
     *   warm start - the plugin event reaches a live JS listener immediately;
     *   cold start - React has not mounted yet, so the id is parked in
     *                PendingAlerts for consumePendingOrderAlert() to drain.
     * Both funnel into the orderAlert handler in page-client.tsx: an order
     * that is still open becomes the new-order popup, anything else is opened
     * through handleSelectOrder().
     */
    private void handleAlertIntent(@Nullable Intent intent) {
        if (intent == null) return;
        String orderId = intent.getStringExtra(NotificationHelper.EXTRA_ORDER_ID);
        if (orderId == null || orderId.isEmpty()) return;

        // What the user chose on the over-other-apps card, if anything ("accept").
        String action = intent.getStringExtra(OrderOverlay.EXTRA_ALERT_ACTION);
        intent.removeExtra(NotificationHelper.EXTRA_ORDER_ID);
        intent.removeExtra(OrderOverlay.EXTRA_ALERT_ACTION);
        PendingAlerts.set(orderId, action);
        // With the order itself when an alert is outstanding for it, so the
        // popup does not wait on the WebView's Firestore connection.
        JamanotNativePlugin.emitOrderAlert(orderId, ActiveOrderAlerts.payload(orderId), action);
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────

    @Override
    public void onResume() {
        super.onResume();
        activityResumed = true;
        current = new WeakReference<>(this);
        // The app is on screen: its own popup takes over from the card drawn
        // over other apps (outstanding alerts are adopted by JS on resume).
        // Suspended, not discarded — see onStop.
        OrderOverlay.suspend(this);
    }

    @Override
    public void onPause() {
        activityResumed = false;
        super.onPause();
    }

    /**
     * Leaving the screen with an order still unanswered must not leave the
     * helper with nothing: an auto-opened app is often hidden again within
     * seconds — the screen times out, Transsion's pocket mode blanks it when
     * the proximity sensor reads covered, or the user presses Home — and the
     * card used to be gone by then and the keyguard takeover undone, so the
     * order was still ringing (or frozen) with no popup anywhere.
     *
     * <p>So while alerts are outstanding the card comes back over other apps
     * and the activity stays above the keyguard, so pressing power shows the
     * popup again. Only once no alert is left is the takeover undone — without
     * that the flags would persist for the life of the activity, and every
     * later lock would put the app (customer names, phone numbers, addresses)
     * on top of the lock screen for anyone holding it.
     */
    @Override
    public void onStop() {
        super.onStop();
        if (ActiveOrderAlerts.size() > 0) {
            OrderOverlay.restore(this);
            // Stay above the keyguard, but only an alert launch may wake the
            // screen — not every later return to the top.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                try {
                    setTurnScreenOn(false);
                } catch (Exception ignored) {
                }
            }
        } else {
            OrderOverlay.hideAll(this);
            releaseAlertWindow();
        }
    }

    /**
     * The last outstanding alert ended (answered here, taken elsewhere, muted).
     * Any thread. While the activity is on screen the takeover is left alone —
     * pulling the app from under a helper who just accepted would be worse —
     * and onStop undoes it instead.
     */
    public static void onOrderAlertsEnded() {
        new Handler(Looper.getMainLooper()).post(() -> {
            MainActivity a = current != null ? current.get() : null;
            if (a == null || a.isFinishing()) return;
            a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (!activityResumed) a.releaseAlertWindow();
        });
    }

    private void releaseAlertWindow() {
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (!showingOverLockScreen) return;
        showingOverLockScreen = false;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(false);
                setTurnScreenOn(false);
            } else {
                //noinspection deprecation
                getWindow().clearFlags(
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (current != null && current.get() == this) current = null;
        super.onDestroy();
    }
}
