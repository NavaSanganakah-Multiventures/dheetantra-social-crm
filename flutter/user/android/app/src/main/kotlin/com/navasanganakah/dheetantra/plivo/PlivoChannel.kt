package com.navasanganakah.dheetantra.plivo

import android.content.Context
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Flutter <-> native bridge.
 * Channel: com.navasanganakah.dheetantra/plivo_voice
 */
class PlivoChannel(private val context: Context) {

    private val manager: PlivoManager get() = PlivoManager.get()
    private var channel: MethodChannel? = null

    fun register(flutterEngine: FlutterEngine) {
        channel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "com.navasanganakah.dheetantra/plivo_voice",
        )
        channel?.setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "init" -> result.success(manager.ensureInitialized(context))
                    "login" -> {
                        val username = call.argument<String>("username").orEmpty()
                        val password = call.argument<String>("password").orEmpty()
                        val fcmToken = call.argument<String>("fcmToken")
                        val certificateId = call.argument<String>("certificateId")
                        result.success(manager.login(username, password, fcmToken, certificateId))
                    }
                    "logout" -> result.success(manager.logout())
                    "makeCall" -> {
                        val destination = call.argument<String>("destination").orEmpty()
                        result.success(manager.makeCall(destination))
                    }
                    "answer" -> result.success(manager.answer())
                    "reject" -> result.success(manager.reject())
                    "hangup" -> {
                        manager.hangup()
                        result.success(true)
                    }
                    "mute" -> result.success(manager.mute())
                    "unmute" -> result.success(manager.unmute())
                    "sendDigits" -> {
                        val digits = call.argument<String>("digits").orEmpty()
                        result.success(manager.sendDigits(digits))
                    }
                    "isLoggedIn" -> result.success(manager.isLoggedIn())
                    "relayPush" -> {
                        val data = call.argument<Map<String, String>>("data").orEmpty()
                        manager.relayPush(data)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                result.error("plivo_error", e.message, null)
            }
        }

        // SDK events -> Dart (MethodChannel "onEvent")
        manager.eventSink = { event, data ->
            channel?.invokeMethod("onEvent", mapOf("event" to event, "data" to data))
        }
    }
}
