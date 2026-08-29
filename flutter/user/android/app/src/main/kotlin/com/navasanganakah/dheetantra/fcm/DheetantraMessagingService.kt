package com.navasanganakah.dheetantra.fcm

import com.google.firebase.messaging.RemoteMessage
import com.navasanganakah.dheetantra.plivo.PlivoManager
import com.twilio.twilio_voice.fcm.TwilioVoiceFcm
import io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingService

/**
 * Custom Firebase Messaging service that forwards incoming FCM messages to
 * the Twilio Voice plugin first, then falls back to flutterfire messaging
 * for all non-Twilio push payloads.
 */
class DheetantraMessagingService : FlutterFirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        // 1) Twilio Voice call invite -> handled natively.
        if (TwilioVoiceFcm.handleMessage(this, remoteMessage.data)) {
            return
        }

        // 2) Plivo SDK push relay: SDK non-Plivo payloads ko khud ignore karta hai,
        //    isliye backend ke data messages bhi safe hain.
        //    (Killed-state re-login + push wake M4 mein aayega.)
        PlivoManager.get().ensureInitialized(applicationContext)
        PlivoManager.get().relayPush(remoteMessage.data)

        // 3) Baaki sab flutterfire messaging ko.
        super.onMessageReceived(remoteMessage)
    }

    override fun onNewToken(token: String) {
        // Keep Twilio push binding in sync with FCM token rotations.
        TwilioVoiceFcm.updateToken(this, token)
        // Plivo endpoint ko naye token par re-register karna M4 (credential persistence) mein.
        super.onNewToken(token)
    }
}
