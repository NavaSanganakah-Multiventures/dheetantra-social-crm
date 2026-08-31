package com.navasanganakah.dheetantra.fcm

import com.google.firebase.messaging.RemoteMessage
import com.twilio.twilio_voice.fcm.TwilioVoiceFcm
import io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingService

/**
 * Custom Firebase Messaging service that forwards incoming FCM messages to
 * the Twilio Voice plugin first, then falls back to flutterfire messaging
 * for all non-Twilio push payloads.
 */
class DheetantraMessagingService : FlutterFirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        // Twilio Voice call invite -> handled natively.
        if (TwilioVoiceFcm.handleMessage(this, remoteMessage.data)) {
            return
        }
        super.onMessageReceived(remoteMessage)
    }

    override fun onNewToken(token: String) {
        // Keep Twilio push binding in sync with FCM token rotations.
        TwilioVoiceFcm.updateToken(this, token)
        super.onNewToken(token)
    }
}
