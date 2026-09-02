package com.jamanot.app.service;

import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.SetOptions;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.jamanot.app.MainActivity;
import com.jamanot.app.core.NotificationHelper;
import com.jamanot.app.core.OrderMatcher;
import com.jamanot.app.core.Prefs;

import java.util.HashMap;
import java.util.Map;

/**
 * The <b>secondary</b> wake path.
 *
 * <p>{@link DutyForegroundService}'s own Firestore listener is the primary
 * mechanism and needs no server. This class matters for the case that listener
 * cannot cover: the process has been stopped by an OEM battery manager. FCM is
 * delivered by Play Services, which those managers do not touch, so a push can
 * resurrect the app when nothing else would.
 *
 * <p>These are sent by the {@code pushOnNotificationCreate} Cloud Function in
 * functions/index.js, which triggers on {@code notifications/{id}} creates and
 * calls the FCM HTTP v1 API. It stays server-side deliberately: a service
 * account shipped inside the APK is extractable and would let anyone push to
 * every user. The function sends <b>data-only</b> messages, so this method runs
 * for every push and the targeting, de-duplication and channel choice below
 * stay in the app's hands.
 */
public class JamanotMessagingService extends FirebaseMessagingService {

    private static final String TAG = "JamanotFCM";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Prefs.setFcmToken(this, token);

        // Same users/{uid}.fcmToken field saveFcmToken() writes on the web side,
        // so both paths converge on one document shape.
        String uid = Prefs.uid(this);
        if (uid == null) return;
        try {
            Map<String, Object> update = new HashMap<>();
            update.put("fcmToken", token);
            FirebaseFirestore.getInstance()
                    .collection("users").document(uid)
                    .set(update, SetOptions.merge())
                    .addOnFailureListener(e -> Log.w(TAG, "token write: " + e.getMessage()));
        } catch (Exception e) {
            Log.w(TAG, "Firestore unavailable: " + e.getMessage());
        }
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();

        String notifId = data.get("tag") != null ? data.get("tag") : message.getMessageId();
        String type = data.get("type");
        String orderId = data.get("orderId");
        String targetUserId = data.get("userId");

        String title = data.get("title");
        String body = data.get("body");
        if (message.getNotification() != null) {
            if (title == null) title = message.getNotification().getTitle();
            if (body == null) body = message.getNotification().getBody();
        }

        // Same targeting predicate the duty listener uses, so a push cannot alert
        // someone the Firestore path would have filtered out.
        if (targetUserId != null && !OrderMatcher.targets(this, targetUserId)) return;

        // De-duplicate against the Firestore listener: whichever arrives first wins.
        if (notifId != null && !Prefs.markSeen(this, notifId)) return;

        if (MainActivity.isAppInForeground()) {
            com.jamanot.app.plugin.JamanotNativePlugin.emitOrderAlert(orderId);
            return;
        }

        if ("new_order".equals(type)) {
            NotificationHelper.postOrderAlert(this, notifId, title, body, orderId);
            // Resurrection: if the user is on duty but our process was killed,
            // this push is the opportunity to bring the service back.
            if (Prefs.onDuty(this) && Prefs.isDutyRole(this) && !DutyForegroundService.isRunning()) {
                try {
                    DutyForegroundService.start(this);
                } catch (Exception e) {
                    Log.w(TAG, "Service resurrect refused: " + e.getMessage());
                }
            }
        } else {
            NotificationHelper.postGeneral(this, notifId, title, body, orderId);
        }
    }
}
