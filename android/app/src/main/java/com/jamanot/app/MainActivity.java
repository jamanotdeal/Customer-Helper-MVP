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
import com.jamanot.app.core.NotificationHelper;
import com.jamanot.app.core.PendingAlerts;
import com.jamanot.app.core.Prefs;
import com.jamanot.app.plugin.JamanotNativePlugin;

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
     * Both funnel into handleSelectOrder() in page-client.tsx, which already
     * does all the role and tab switching.
     */
    private void handleAlertIntent(@Nullable Intent intent) {
        if (intent == null) return;
        String orderId = intent.getStringExtra(NotificationHelper.EXTRA_ORDER_ID);
        if (orderId == null || orderId.isEmpty()) return;

        intent.removeExtra(NotificationHelper.EXTRA_ORDER_ID);
        PendingAlerts.set(orderId);
        JamanotNativePlugin.emitOrderAlert(orderId);
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────

    @Override
    public void onResume() {
        super.onResume();
        activityResumed = true;
    }

    @Override
    public void onPause() {
        activityResumed = false;
        super.onPause();
    }

    /**
     * Undo the keyguard takeover once the alert has been seen and the activity
     * is hidden again. Without this the flags persist for the life of the
     * activity, so every later lock would put the app — customer names, phone
     * numbers, addresses — on top of the lock screen for anyone holding it.
     */
    @Override
    public void onStop() {
        super.onStop();
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
        super.onDestroy();
    }
}
