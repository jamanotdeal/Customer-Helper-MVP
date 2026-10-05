package com.jamanot.app.core;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.util.TypedValue;
import android.view.ContextThemeWrapper;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;

import com.jamanot.app.MainActivity;
import com.jamanot.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * The Uber-style incoming-order card, drawn over whatever app the helper or
 * store is using, so a new order can be answered without the app being open.
 *
 * <p>Uses the "Display over other apps" permission the app already asks helpers
 * and stores for. Shown only while the app itself is not on screen (the in-app
 * popup covers that case) and taken down the moment the app comes forward.
 *
 * <ul>
 *   <li><b>Accept</b> (helper) opens the app straight into the accept flow —
 *       the claim itself runs in JS, where the transaction and every side
 *       effect of accepting already live.</li>
 *   <li><b>View</b> opens the app on the order's popup.</li>
 *   <li><b>✕</b> declines this order: its alarm and notification end.</li>
 * </ul>
 *
 * <p>Cards are owned by {@link ActiveOrderAlerts}: a card exists exactly as long
 * as its alert, so an order taken by someone else disappears from here at the
 * same moment its alarm stops.
 *
 * <p>A TYPE_APPLICATION_OVERLAY window cannot appear above the lock screen, so
 * for a locked or sleeping phone the dispatcher also brings the app up over the
 * keyguard ({@link AutoOpen}).
 */
public final class OrderOverlay {

    private static final String TAG = "JamanotOverlay";

    /** Extra on the MainActivity intent: what the user chose on the card. */
    public static final String EXTRA_ALERT_ACTION = "orderAlertAction";
    public static final String ACTION_ACCEPT = "accept";

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    // Main thread only. Insertion-ordered: the newest card is the one shown.
    private static final LinkedHashMap<String, Card> CARDS = new LinkedHashMap<>();
    private static View view;
    private static String shownKey;

    private static final class Card {
        final String title;
        final String body;
        final String payload;
        final String distance;

        Card(String title, String body, String payload, String distance) {
            this.title = title;
            this.body = body;
            this.payload = payload;
            this.distance = distance;
        }
    }

    private OrderOverlay() {}

    /** The user granted "Display over other apps" and hasn't opted out. */
    public static boolean canShow(Context c) {
        return AutoOpen.canAutoOpen(c);
    }

    /** A card drawn now would be under the keyguard, or on a dark screen. */
    public static boolean isScreenLocked(Context c) {
        try {
            KeyguardManager km = (KeyguardManager) c.getSystemService(Context.KEYGUARD_SERVICE);
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            boolean locked = km != null && km.isKeyguardLocked();
            boolean asleep = pm != null && !pm.isInteractive();
            return locked || asleep;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Puts the card for {@code key} on screen (newest first).
     *
     * @return false when the permission is missing, so the caller can fall back.
     */
    public static boolean show(Context c, String key, String title, String body,
                               @Nullable String payload, @Nullable String distance) {
        if (c == null || key == null) return false;
        Context app = c.getApplicationContext();
        if (!canShow(app)) return false;
        MAIN.post(() -> {
            CARDS.remove(key);
            CARDS.put(key, new Card(title, body, payload, distance));
            render(app);
        });
        return true;
    }

    /**
     * Takes one card down, showing the next if there is one.
     *
     * @param gone the order went to someone else (or was cancelled) — say so
     *             briefly, rather than have the card silently vanish under a
     *             finger that was about to tap Accept.
     */
    public static void remove(Context c, String key, boolean gone) {
        if (c == null || key == null) return;
        Context app = c.getApplicationContext();
        MAIN.post(() -> {
            if (CARDS.remove(key) == null) return;
            if (gone && key.equals(shownKey)) {
                try {
                    Toast.makeText(app, R.string.overlay_taken, Toast.LENGTH_SHORT).show();
                } catch (Exception ignored) {
                }
            }
            render(app);
        });
    }

    /** Takes every card down — the app came forward, or the alerts ended. */
    public static void hideAll(Context c) {
        if (c == null) return;
        Context app = c.getApplicationContext();
        MAIN.post(() -> {
            CARDS.clear();
            detach(app);
        });
    }

    // ── Window ───────────────────────────────────────────────────────────────

    private static void render(Context app) {
        if (CARDS.isEmpty()) {
            detach(app);
            return;
        }
        String key = null;
        for (String k : CARDS.keySet()) key = k;
        Card card = CARDS.get(key);

        if (view == null && !attach(app)) {
            // Permission revoked mid-flight, or an OEM refusing overlays: the
            // tray notification is still there.
            CARDS.clear();
            return;
        }
        bind(app, key, card, CARDS.size());
        shownKey = key;
    }

    private static boolean attach(Context app) {
        try {
            WindowManager wm = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
            if (wm == null) return false;
            Context themed = new ContextThemeWrapper(app, android.R.style.Theme_DeviceDefault_Light_NoActionBar);
            View v = LayoutInflater.from(themed).inflate(R.layout.order_alert_overlay, null);

            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    type,
                    // Never takes focus or swallows touches outside the card:
                    // whatever the user was doing underneath keeps working.
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            lp.y = dp(app, 40);

            wm.addView(v, lp);
            view = v;
            return true;
        } catch (Exception e) {
            Log.w(TAG, "Overlay refused: " + e.getMessage());
            view = null;
            return false;
        }
    }

    private static void detach(Context app) {
        shownKey = null;
        if (view == null) return;
        try {
            WindowManager wm = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
            if (wm != null) wm.removeView(view);
        } catch (Exception ignored) {
        }
        view = null;
    }

    // ── Content ──────────────────────────────────────────────────────────────

    private static void bind(Context app, String key, Card card, int total) {
        TextView count = view.findViewById(R.id.overlay_count);
        TextView badge = view.findViewById(R.id.overlay_badge);
        TextView headline = view.findViewById(R.id.overlay_headline);
        TextView line1 = view.findViewById(R.id.overlay_line1);
        TextView line2 = view.findViewById(R.id.overlay_line2);
        TextView primary = view.findViewById(R.id.overlay_primary);
        TextView secondary = view.findViewById(R.id.overlay_secondary);
        TextView close = view.findViewById(R.id.overlay_close);

        setText(count, total > 1 ? total + "টি অর্ডার" : null);

        JSONObject root = parse(card.payload);
        JSONObject order = root == null ? null : root.optJSONObject("order");
        JSONArray shopOrders = root == null ? null : root.optJSONArray("shopOrders");
        boolean store = "store".equals(Prefs.role(app));

        List<String> badgeParts = new ArrayList<>();
        if (order != null) {
            // Helper: what it is, what it pays, where it goes.
            String service = firstNonEmpty(order.optString("service"), order.optString("title"), card.title);
            String items = itemNames(order.optJSONArray("items"));
            setText(headline, items.isEmpty() ? service : service + " — " + items);

            if (order.optBoolean("isFreeDelivery", false)) {
                badgeParts.add(app.getString(R.string.overlay_free_delivery));
            } else if (order.has("deliveryFee")) {
                badgeParts.add(app.getString(R.string.overlay_fee, number(order.opt("deliveryFee"))));
            }
            setText(line1, address(app, R.string.overlay_pickup, order.optJSONObject("pickupLocation")));
            setText(line2, address(app, R.string.overlay_delivery, order.optJSONObject("deliveryLocation")));
        } else if (shopOrders != null && shopOrders.length() > 0) {
            // Store: what the helper is asking for, and from whom.
            JSONObject so = awaitingShopOrder(shopOrders);
            setText(headline, firstNonEmpty(so.optString("requestText"), card.body, card.title));
            Object price = so.opt("price");
            if (price instanceof Number && ((Number) price).doubleValue() > 0) {
                badgeParts.add(app.getString(R.string.overlay_price, number(price)));
            }
            String helperName = so.optString("helperName");
            setText(line1, helperName.isEmpty() ? null : app.getString(R.string.overlay_from_helper, helperName));
            setText(line2, null);
        } else {
            // No document travelled with the alert — the notification's own words.
            setText(headline, firstNonEmpty(card.title, app.getString(R.string.alert_new_order)));
            setText(line1, card.body);
            setText(line2, null);
        }
        if (card.distance != null && !card.distance.isEmpty()) badgeParts.add(card.distance);
        setText(badge, badgeParts.isEmpty() ? null : join(badgeParts, " · "));

        close.setOnClickListener(v -> ActiveOrderAlerts.resolve(app, key, true));

        if (store) {
            // A store answers inside the app (it prices the items first).
            secondary.setVisibility(View.GONE);
            primary.setText(R.string.overlay_open);
            primary.setOnClickListener(v -> openApp(app, key, null));
        } else {
            secondary.setVisibility(View.VISIBLE);
            secondary.setOnClickListener(v -> openApp(app, key, null));
            primary.setText(R.string.overlay_accept);
            primary.setOnClickListener(v -> {
                // The helper has answered: stop ringing now rather than after
                // the app has booted. The claim runs in JS.
                ActiveOrderAlerts.resolve(app, key, false);
                openApp(app, key, ACTION_ACCEPT);
            });
        }
    }

    /**
     * Brings the app forward on this order. A tap on our own visible window is
     * what makes this activity start allowed from the background.
     */
    private static void openApp(Context app, String orderId, @Nullable String action) {
        try {
            Intent i = new Intent(app, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    .putExtra(NotificationHelper.EXTRA_ORDER_ID, orderId);
            if (action != null) i.putExtra(EXTRA_ALERT_ACTION, action);
            app.startActivity(i);
        } catch (Exception e) {
            Log.w(TAG, "Open from overlay refused: " + e.getMessage());
        }
        // The in-app popup takes over from here (MainActivity.onResume also
        // clears the cards; this covers the moment in between).
        hideAll(app);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    @Nullable
    private static JSONObject parse(@Nullable String json) {
        if (json == null) return null;
        try {
            return new JSONObject(json);
        } catch (Exception e) {
            return null;
        }
    }

    private static JSONObject awaitingShopOrder(JSONArray list) {
        for (int i = 0; i < list.length(); i++) {
            JSONObject so = list.optJSONObject(i);
            if (so != null && "PENDING".equals(so.optString("status")) && !so.optBoolean("viewedByStore", false)) {
                return so;
            }
        }
        JSONObject first = list.optJSONObject(0);
        return first != null ? first : new JSONObject();
    }

    private static String itemNames(@Nullable JSONArray items) {
        if (items == null) return "";
        List<String> names = new ArrayList<>();
        for (int i = 0; i < items.length() && names.size() < 4; i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            String name = it.optString("name").trim();
            if (name.isEmpty()) continue;
            String qty = it.optString("qty");
            names.add(qty.isEmpty() || "1".equals(qty) ? name : name + " ×" + qty);
        }
        return join(names, ", ").replace('\n', ' ');
    }

    @Nullable
    private static String address(Context app, int format, @Nullable JSONObject loc) {
        if (loc == null) return null;
        String a = loc.optString("address").trim();
        return a.isEmpty() ? null : app.getString(format, a);
    }

    private static String number(Object v) {
        if (v instanceof Number) {
            double d = ((Number) v).doubleValue();
            return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d);
        }
        return String.valueOf(v);
    }

    private static String firstNonEmpty(String... values) {
        for (String v : values) {
            if (v != null && !v.trim().isEmpty()) return v.trim();
        }
        return "";
    }

    private static String join(List<String> parts, String sep) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (sb.length() > 0) sb.append(sep);
            sb.append(p);
        }
        return sb.toString();
    }

    private static void setText(TextView tv, @Nullable String text) {
        if (text == null || text.trim().isEmpty()) {
            tv.setVisibility(View.GONE);
        } else {
            tv.setText(text);
            tv.setVisibility(View.VISIBLE);
        }
    }

    private static int dp(Context c, int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics());
    }
}
