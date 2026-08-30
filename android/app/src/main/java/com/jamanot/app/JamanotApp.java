package com.jamanot.app;

import android.app.Application;

import com.google.firebase.FirebaseApp;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.FirebaseFirestoreSettings;
import com.google.firebase.firestore.PersistentCacheSettings;
import com.jamanot.app.core.NotificationHelper;

/**
 * Process-wide setup.
 *
 * <p>Runs for every entry point, not just MainActivity — the duty service, the
 * messaging service and the boot receiver can all start the process without any
 * activity. Notification channels in particular must exist before BootReceiver
 * posts anything, which is why they are created here rather than in the activity.
 */
public class JamanotApp extends Application {

    @Override
    public void onCreate() {
        super.onCreate();

        try {
            FirebaseApp.initializeApp(this);

            // Persistent cache keeps a service restart from re-reading the whole
            // 60-document notification window, which matters on a metered
            // connection and for battery.
            FirebaseFirestore.getInstance().setFirestoreSettings(
                    new FirebaseFirestoreSettings.Builder()
                            .setLocalCacheSettings(
                                    PersistentCacheSettings.newBuilder()
                                            .setSizeBytes(16L * 1024 * 1024)
                                            .build())
                            .build());
            FirebaseFirestore.setLoggingEnabled(false);
        } catch (Exception e) {
            // google-services.json missing during early development — the web
            // layer still works, only the native listener is unavailable.
            android.util.Log.w("JamanotApp", "Firebase init skipped: " + e.getMessage());
        }

        NotificationHelper.createChannels(this);
    }
}
