package com.jamanot.app.core;

/**
 * Single-slot holder for an orderId that arrived by Intent before the WebView
 * existed.
 *
 * <p>This exists because of a real cold-start race: Java can launch MainActivity
 * from a killed state, but React does not mount for another second or two, so
 * there is no {@code orderAlert} listener to receive the event. The activity
 * parks the id here and the plugin drains it when JS finally asks.
 */
public final class PendingAlerts {

    private static volatile String pendingOrderId = null;

    private PendingAlerts() {}

    public static void set(String orderId) {
        if (orderId != null && !orderId.isEmpty()) pendingOrderId = orderId;
    }

    /** Reads and clears — a pending alert must only ever be delivered once. */
    public static String consume() {
        String v = pendingOrderId;
        pendingOrderId = null;
        return v;
    }

    public static boolean has() {
        return pendingOrderId != null;
    }
}
