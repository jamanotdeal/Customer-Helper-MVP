package com.jamanot.app.core;

/**
 * Single-slot holder for an orderId that arrived by Intent before the WebView
 * existed.
 *
 * <p>This exists because of a real cold-start race: Java can launch MainActivity
 * from a killed state, but React does not mount for another second or two, so
 * there is no {@code orderAlert} listener to receive the event. The activity
 * parks the id here and the plugin drains it when JS finally asks.
 *
 * <p>The action travels with it: "Accept" on the over-other-apps card has to
 * survive the app booting, or the helper would land on the popup and have to
 * accept a second time.
 */
public final class PendingAlerts {

    private static String pendingOrderId = null;
    private static String pendingAction = null;

    private PendingAlerts() {}

    public static void set(String orderId) {
        set(orderId, null);
    }

    public static synchronized void set(String orderId, String action) {
        if (orderId == null || orderId.isEmpty()) return;
        pendingOrderId = orderId;
        pendingAction = action;
    }

    /**
     * Reads and clears — a pending alert must only ever be delivered once.
     *
     * @return {orderId, action}, or null when nothing is parked.
     */
    public static synchronized String[] consume() {
        if (pendingOrderId == null) return null;
        String[] v = {pendingOrderId, pendingAction};
        pendingOrderId = null;
        pendingAction = null;
        return v;
    }

    public static synchronized boolean has() {
        return pendingOrderId != null;
    }
}
