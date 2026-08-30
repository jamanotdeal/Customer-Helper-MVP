package com.jamanot.app.service;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.firebase.firestore.FirebaseFirestore;
import com.jamanot.app.core.Prefs;

import java.util.HashMap;
import java.util.Map;

/**
 * Keeps the helper's position fresh while on duty, for two consumers: the local
 * geofence check in {@link DutyForegroundService}, and {@code users/{uid}
 * .helperLocation}, which every other device reads when fanning out orders.
 *
 * <p>Cadence is deliberately far slower than the 12-second high-accuracy poll in
 * HelperDashboard. That rate is defensible while a screen is on and the user is
 * watching a map; sustained in a background service it would be a battery
 * complaint and a bad review.
 */
public class LocationTracker {

    private static final String TAG = "DutyLoc";

    private static final long INTERVAL_MS = 3 * 60 * 1000L;      // 3 minutes
    private static final float MIN_DISPLACEMENT_M = 150f;        // ignore drift
    private static final long WRITE_THROTTLE_MS = 5 * 60 * 1000L; // Firestore writes

    private final Context context;
    private final FusedLocationProviderClient client;
    private LocationCallback callback;
    private long lastWriteAt = 0L;

    public LocationTracker(Context context) {
        this.context = context.getApplicationContext();
        this.client = LocationServices.getFusedLocationProviderClient(this.context);
    }

    private boolean hasPermission() {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressLint("MissingPermission")
    public void start() {
        if (callback != null || !hasPermission()) return;

        LocationRequest request = new LocationRequest.Builder(
                Priority.PRIORITY_BALANCED_POWER_ACCURACY, INTERVAL_MS)
                .setMinUpdateIntervalMillis(INTERVAL_MS)
                .setMinUpdateDistanceMeters(MIN_DISPLACEMENT_M)
                .setWaitForAccurateLocation(false)
                .build();

        callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                Location loc = result.getLastLocation();
                if (loc == null) return;
                onFix(loc.getLatitude(), loc.getLongitude());
            }
        };

        try {
            client.requestLocationUpdates(request, callback, null);
            // Seed immediately so the very first order isn't geofenced against a
            // stale position from the last session.
            client.getLastLocation().addOnSuccessListener(loc -> {
                if (loc != null) onFix(loc.getLatitude(), loc.getLongitude());
            });
        } catch (SecurityException e) {
            Log.w(TAG, "Location permission revoked mid-session: " + e.getMessage());
            callback = null;
        }
    }

    private void onFix(double lat, double lng) {
        Prefs.setLocation(context, lat, lng);

        long now = System.currentTimeMillis();
        if (now - lastWriteAt < WRITE_THROTTLE_MS) return;
        lastWriteAt = now;

        String uid = Prefs.uid(context);
        if (uid == null) return;

        // Mirrors updateHelperLocation() in AuthContext so the other devices'
        // fan-out geofence sees the same shape.
        Map<String, Object> helperLocation = new HashMap<>();
        helperLocation.put("lat", lat);
        helperLocation.put("lng", lng);
        helperLocation.put("address", "Current Position");
        helperLocation.put("updatedAt", new java.text.SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(new java.util.Date()));

        Map<String, Object> update = new HashMap<>();
        update.put("helperLocation", helperLocation);

        try {
            FirebaseFirestore.getInstance()
                    .collection("users").document(uid)
                    .set(update, com.google.firebase.firestore.SetOptions.merge())
                    .addOnFailureListener(e -> Log.w(TAG, "helperLocation write: " + e.getMessage()));
        } catch (Exception e) {
            Log.w(TAG, "Firestore unavailable: " + e.getMessage());
        }
    }

    public void stop() {
        if (callback != null) {
            client.removeLocationUpdates(callback);
            callback = null;
        }
    }
}
