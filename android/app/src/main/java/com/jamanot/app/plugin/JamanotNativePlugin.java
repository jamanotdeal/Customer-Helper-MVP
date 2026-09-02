package com.jamanot.app.plugin;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;
import com.jamanot.app.MainActivity;
import com.jamanot.app.core.NotificationHelper;
import com.jamanot.app.core.PendingAlerts;
import com.jamanot.app.core.Prefs;
import com.jamanot.app.service.DutyForegroundService;
import com.jamanot.app.work.DutyWatchdogWorker;

/**
 * The one bridge between the web layer and everything native.
 *
 * <p>Permission prompts, the duty service lifecycle, pull-to-refresh control and
 * the order-alert deep link all pass through here. The web side talks to it via
 * the thin wrappers in src/lib/native.ts, so components never touch Capacitor
 * directly.
 */
@CapacitorPlugin(
        name = "JamanotNative",
        permissions = {
                @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}),
                @Permission(alias = "location", strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                })
        }
)
public class JamanotNativePlugin extends Plugin {

    private static JamanotNativePlugin instance;

    @Override
    public void load() {
        instance = this;
        // Drain anything the cold-start path parked before the WebView existed.
        // getPendingIntentPayload() is the JS side of the same handshake.
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    // ── Events out to JS ────────────────────────────────────────────────────

    public static void emitOrderAlert(String orderId) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("orderId", orderId);
        instance.notifyListeners("orderAlert", data);
    }

    public static void emitPullToRefresh() {
        if (instance == null) return;
        instance.notifyListeners("pullToRefresh", new JSObject());
    }

    public static void emitDutyStateChanged(boolean running) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("running", running);
        instance.notifyListeners("dutyStateChanged", data);
    }

    // ── Permission status ───────────────────────────────────────────────────

    @PluginMethod
    public void getPermissionStatus(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        r.put("notifications", notificationState(c));
        r.put("location", locationState(c));
        r.put("coarseOnly", hasPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION)
                && !hasPermission(c, Manifest.permission.ACCESS_FINE_LOCATION));
        r.put("overlay", canDrawOverlays(c));
        r.put("batteryUnrestricted", isIgnoringBatteryOptimizations(c));
        r.put("autoOpenEnabled", Prefs.autoOpenEnabled(c));
        r.put("dutyRunning", DutyForegroundService.isRunning());
        r.put("oemVendor", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        call.resolve(r);
    }

    private String notificationState(Context c) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && !hasPermission(c, Manifest.permission.POST_NOTIFICATIONS)) {
            return "denied";
        }
        // Below API 33 there is no runtime permission, but the user can still
        // switch the app's notifications off in system settings.
        return NotificationManagerCompat.from(c).areNotificationsEnabled() ? "granted" : "blocked";
    }

    private String locationState(Context c) {
        if (hasPermission(c, Manifest.permission.ACCESS_FINE_LOCATION)
                || hasPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION)) {
            return "granted";
        }
        return "denied";
    }

    private boolean hasPermission(Context c, String p) {
        return ContextCompat.checkSelfPermission(c, p) == PackageManager.PERMISSION_GRANTED;
    }

    // ── Runtime permission requests ─────────────────────────────────────────

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject r = new JSObject();
            r.put("status", notificationState(getContext()));
            call.resolve(r);
            return;
        }
        if (hasPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)) {
            JSObject r = new JSObject();
            r.put("status", "granted");
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermsCallback");
    }

    @PermissionCallback
    private void notificationPermsCallback(PluginCall call) {
        JSObject r = new JSObject();
        boolean granted = hasPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS);
        r.put("status", granted ? "granted" : "denied");
        // shouldShowRequestPermissionRationale goes false once the user has
        // permanently denied — that's the signal for JS to offer "Open settings".
        r.put("canAskAgain", granted || shouldShow(Manifest.permission.POST_NOTIFICATIONS));
        call.resolve(r);
    }

    @PluginMethod
    public void requestLocationPermission(PluginCall call) {
        Context c = getContext();
        if (hasPermission(c, Manifest.permission.ACCESS_FINE_LOCATION)) {
            JSObject r = new JSObject();
            r.put("status", "granted");
            r.put("coarseOnly", false);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("location", call, "locationPermsCallback");
    }

    @PermissionCallback
    private void locationPermsCallback(PluginCall call) {
        Context c = getContext();
        boolean fine = hasPermission(c, Manifest.permission.ACCESS_FINE_LOCATION);
        boolean coarse = hasPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION);
        JSObject r = new JSObject();
        r.put("status", (fine || coarse) ? "granted" : "denied");
        r.put("coarseOnly", coarse && !fine);
        r.put("canAskAgain", fine || coarse || shouldShow(Manifest.permission.ACCESS_FINE_LOCATION));
        call.resolve(r);
    }

    private boolean shouldShow(String permission) {
        Activity a = getActivity();
        return a != null && androidx.core.app.ActivityCompat
                .shouldShowRequestPermissionRationale(a, permission);
    }

    // ── Overlay ("Display over other apps") ─────────────────────────────────

    private static boolean canDrawOverlays(Context c) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(c);
    }

    @PluginMethod
    public void hasOverlayPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", canDrawOverlays(getContext()));
        call.resolve(r);
    }

    /**
     * There is no runtime dialog for SYSTEM_ALERT_WINDOW — the user has to flip
     * it in a settings screen, so the result comes back through the activity
     * result rather than a permission callback.
     */
    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (canDrawOverlays(getContext())) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
        startActivityForResult(call, i, "overlayResultCallback");
    }

    @ActivityCallback
    private void overlayResultCallback(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        // The result code is unreliable here; re-check the actual state instead.
        r.put("granted", canDrawOverlays(getContext()));
        call.resolve(r);
    }

    // ── Battery optimisation & OEM autostart ────────────────────────────────

    private static boolean isIgnoringBatteryOptimizations(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName());
    }

    /**
     * Opens the system battery list rather than firing
     * ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, which needs the
     * REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission — Play-restricted, and a
     * delivery marketplace does not clearly qualify for it.
     */
    @PluginMethod
    public void openBatteryOptimizationSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            openSettingsFallback(call);
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openSettingsFallback(call);
    }

    private void openSettingsFallback(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open settings: " + e.getMessage());
        }
    }

    /**
     * Xiaomi, Oppo, Vivo and Huawei each kill background services unless the app
     * is on an "autostart" allowlist buried in their own settings app. These
     * component names are undocumented and change between ROM versions, hence
     * the try/catch chain down to plain app settings.
     */
    @PluginMethod
    public void openOemAutostartSettings(PluginCall call) {
        String vendor = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase();
        String[][] candidates;

        switch (vendor) {
            case "xiaomi":
            case "redmi":
            case "poco":
                candidates = new String[][]{
                        {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"}};
                break;
            case "oppo":
            case "realme":
                candidates = new String[][]{
                        {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
                        {"com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"},
                        {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"}};
                break;
            case "vivo":
                candidates = new String[][]{
                        {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
                        {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"}};
                break;
            case "huawei":
            case "honor":
                candidates = new String[][]{
                        {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
                        {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"}};
                break;
            case "samsung":
                candidates = new String[][]{
                        {"com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"}};
                break;
            default:
                openSettingsFallback(call);
                return;
        }

        for (String[] pair : candidates) {
            try {
                Intent i = new Intent()
                        .setComponent(new ComponentName(pair[0], pair[1]))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
                return;
            } catch (Exception ignored) {
                // ROM doesn't ship that activity — try the next spelling.
            }
        }
        openSettingsFallback(call);
    }

    // ── User state (SharedPreferences) ──────────────────────────────────────

    /**
     * Called from AuthContext at login and on every role/mode change. This is
     * what lets the duty service decide who to alert with no JavaScript running.
     */
    @PluginMethod
    public void setUserState(PluginCall call) {
        Prefs.UserState s = new Prefs.UserState();
        s.uid = call.getString("uid");
        s.role = call.getString("role");
        s.isHelper = call.getBoolean("isHelper");
        s.helperType = call.getString("helperType");
        s.isStoreApproved = call.getBoolean("isStoreApproved");
        s.storeId = call.getString("storeId");
        s.activeMode = call.getString("activeMode");
        s.onDuty = call.getBoolean("onDuty");
        s.lat = call.getDouble("lat");
        s.lng = call.getDouble("lng");
        Double radius = call.getDouble("radiusKm");
        s.radiusKm = radius == null ? null : radius.floatValue();

        // An explicit null uid means logout, not "leave unchanged".
        if (call.getData().has("uid") && s.uid == null) {
            Prefs.clearUser(getContext());
            DutyForegroundService.stop(getContext());
        } else {
            Prefs.apply(getContext(), s);
        }
        call.resolve();
    }

    @PluginMethod
    public void setAutoOpenEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", false);
        Prefs.setAutoOpenEnabled(getContext(), Boolean.TRUE.equals(enabled));
        call.resolve();
    }

    // ── Duty service ────────────────────────────────────────────────────────

    @PluginMethod
    public void startDutyService(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();

        if (!Prefs.isDutyRole(c)) {
            // Customer and Admin never run a foreground service — they get
            // notifications only. Fewer moving parts, less battery, less to
            // justify at review.
            r.put("started", false);
            r.put("reason", "role-not-eligible");
            call.resolve(r);
            return;
        }

        Prefs.setOnDuty(c, true);
        try {
            DutyForegroundService.start(c);
            DutyWatchdogWorker.enqueue(c);
            r.put("started", true);
        } catch (Exception e) {
            // Android can refuse a foreground start outright (background start
            // restrictions, or the Android 15 boot-time FGS ban).
            r.put("started", false);
            r.put("reason", e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        call.resolve(r);
    }

    @PluginMethod
    public void stopDutyService(PluginCall call) {
        Context c = getContext();
        Prefs.setOnDuty(c, false);
        DutyForegroundService.stop(c);
        DutyWatchdogWorker.cancel(c);
        call.resolve();
    }

    // ── Pull to refresh ─────────────────────────────────────────────────────

    @PluginMethod
    public void setPullToRefreshEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        Activity a = getActivity();
        if (a instanceof MainActivity) {
            ((MainActivity) a).setPullToRefreshEnabled(enabled);
        } else {
            Prefs.setPullToRefreshEnabled(getContext(), enabled);
        }
        call.resolve();
    }

    @PluginMethod
    public void finishRefresh(PluginCall call) {
        Activity a = getActivity();
        if (a instanceof MainActivity) {
            ((MainActivity) a).finishRefreshing();
        }
        call.resolve();
    }

    // ── Order alerts ────────────────────────────────────────────────────────

    /** Drains an orderId that arrived before the WebView was alive. */
    @PluginMethod
    public void getPendingIntentPayload(PluginCall call) {
        JSObject r = new JSObject();
        r.put("orderId", PendingAlerts.consume());
        call.resolve(r);
    }

    @PluginMethod
    public void showLocalNotification(PluginCall call) {
        // Prefer the Firestore notification id so this shares a de-dup namespace
        // with DutyForegroundService. For helper/store the service is listening
        // on the same documents, so without this the user gets the same alert
        // twice whenever the app is in the foreground. Whichever path arrives
        // first wins; the second is dropped.
        String notifId = call.getString("notifId");
        if (notifId != null && !notifId.isEmpty()) {
            if (!Prefs.markSeen(getContext(), notifId)) {
                call.resolve();
                return;
            }
        } else {
            notifId = "local-" + System.currentTimeMillis();
        }
        String title = call.getString("title", "");
        String body = call.getString("body", "");
        String orderId = call.getString("orderId");

        // The WebView has no Notification API, so this is the only way a
        // foreground in-app notification reaches the user. Order traffic goes on
        // the heads-up channel so it gets sound and vibration like the web popup.
        if (Boolean.TRUE.equals(call.getBoolean("important", false))) {
            NotificationHelper.postOrderAlert(getContext(), notifId, title, body, orderId);
        } else {
            NotificationHelper.postGeneral(getContext(), notifId, title, body, orderId);
        }
        call.resolve();
    }

    // ── FCM ─────────────────────────────────────────────────────────────────

    @PluginMethod
    public void getFcmToken(PluginCall call) {
        String cached = Prefs.fcmToken(getContext());
        if (cached != null) {
            JSObject r = new JSObject();
            r.put("token", cached);
            call.resolve(r);
            return;
        }
        try {
            FirebaseMessaging.getInstance().getToken()
                    .addOnCompleteListener(task -> {
                        JSObject r = new JSObject();
                        if (task.isSuccessful() && task.getResult() != null) {
                            Prefs.setFcmToken(getContext(), task.getResult());
                            r.put("token", task.getResult());
                        } else {
                            r.put("token", null);
                        }
                        call.resolve(r);
                    });
        } catch (Exception e) {
            JSObject r = new JSObject();
            r.put("token", null);
            call.resolve(r);
        }
    }
}
