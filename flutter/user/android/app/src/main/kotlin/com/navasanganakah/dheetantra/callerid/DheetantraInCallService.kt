package com.navasanganakah.dheetantra.callerid

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.telecom.Call
import android.telecom.Connection
import android.telecom.InCallService
import android.telecom.VideoProfile
import android.util.Log
import androidx.core.app.NotificationCompat
import com.navasanganakah.dheetantra.MainActivity
import com.navasanganakah.dheetantra.R

/**
 * Default-dialer in-call UI. The system binds this service for PSTN calls once
 * the app holds the default dialer role. Self-managed calls (the WhatsApp VoIP
 * calls driven by flutter_callkit_incoming's CallkitConnectionService) render
 * their own native UI, so we must skip them here - otherwise both UIs appear at
 * once for the same call.
 */
class DheetantraInCallService : InCallService() {

    companion object {
        private const val TAG = "DheetantraInCall"
        private const val AFTER_CALL_CHANNEL = "dheetantra_after_call"
        private val activeCalls = mutableMapOf<String, Call>()
        private val callStartTimes = mutableMapOf<String, Long>()
        private val callAnswered = mutableMapOf<String, Boolean>()

        @JvmStatic
        fun findCall(id: String): Call? = synchronized(activeCalls) { activeCalls[id] }

        @JvmStatic
        fun hasActiveCall(): Boolean = synchronized(activeCalls) { activeCalls.isNotEmpty() }
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)

        // Skip self-managed calls (WhatsApp VoIP). They own their UI through the
        // flutter_callkit_incoming plugin; rendering ours too would double up.
        val details = call.details
        if (details != null && (details.properties and Connection.PROPERTY_SELF_MANAGED) != 0) {
            Log.d(TAG, "Skipping self-managed call")
            return
        }

        val id = call.toString()
        synchronized(activeCalls) { activeCalls[id] = call }
        call.registerCallback(callCallback)
        val direction = callDirection(call)
        val phone = extractPhone(call)

        Log.d(TAG, "Call added dir=$direction phone=$phone state=${call.state}")

        when (call.state) {
            Call.STATE_RINGING -> showIncomingCall(phone, id)
            Call.STATE_DIALING, Call.STATE_CONNECTING -> showOutgoingCall(phone, id)
            Call.STATE_ACTIVE -> {
                callStartTimes[id] = System.currentTimeMillis()
                callAnswered[id] = true
            }
        }
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        val id = call.toString()
        call.unregisterCallback(callCallback)

        val answered = callAnswered[id] ?: false
        val startMs = callStartTimes[id]
        val durationSec = if (answered && startMs != null) {
            ((System.currentTimeMillis() - startMs) / 1000).toInt()
        } else 0
        val direction = callDirection(call)
        val phone = extractPhone(call)

        synchronized(activeCalls) {
            activeCalls.remove(id)
            callStartTimes.remove(id)
            callAnswered.remove(id)
        }

        Log.d(TAG, "Call removed answered=$answered duration=$durationSec")
        closeCallActivities()
        postAfterCallNotification(phone, durationSec, direction)
    }

    private val callCallback = object : Call.Callback() {
        override fun onStateChanged(call: Call?, state: Int) {
            val id = call?.toString() ?: return
            when (state) {
                Call.STATE_ACTIVE -> {
                    callAnswered[id] = true
                    callStartTimes[id] = System.currentTimeMillis()
                }
                Call.STATE_DISCONNECTED -> {
                    // onCallRemoved will handle cleanup
                }
            }
        }
    }

    private fun showIncomingCall(phone: String, callId: String) {
        val intent = Intent(this, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("phone", phone)
            putExtra("callId", callId)
        }
        startActivity(intent)
    }

    private fun showOutgoingCall(phone: String, callId: String) {
        val intent = Intent(this, OutgoingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("phone", phone)
            putExtra("callId", callId)
        }
        startActivity(intent)
    }

    private fun closeCallActivities() {
        sendBroadcast(Intent("com.navasanganakah.dheetantra.CALL_ENDED"))
    }

    private fun callDirection(call: Call): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            when (call.details?.callDirection) {
                Call.Details.DIRECTION_INCOMING -> "incoming"
                Call.Details.DIRECTION_OUTGOING -> "outgoing"
                Call.Details.DIRECTION_UNKNOWN -> "unknown"
                else -> "unknown"
            }
        } else {
            "incoming"
        }
    }

    private fun extractPhone(call: Call): String {
        return call.details?.handle?.schemeSpecificPart ?: ""
    }

    private fun postAfterCallNotification(phone: String, durationSec: Int, direction: String) {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                AFTER_CALL_CHANNEL,
                "After-call CRM",
                NotificationManager.IMPORTANCE_HIGH
            )
            manager.createNotificationChannel(channel)
        }
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("route", "/after-call")
            putExtra("phone", phone)
            putExtra("durationSeconds", durationSec)
            putExtra("direction", direction)
        }
        val pending = PendingIntent.getActivity(
            this, phone.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, AFTER_CALL_CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Call ended")
            .setContentText("$phone - ${formatDuration(durationSec)}")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        manager.notify("after_call", phone.hashCode(), notification)
    }

    private fun formatDuration(sec: Int): String {
        val m = sec / 60
        val s = sec % 60
        return if (m == 0) "${s}s" else "${m}m ${String.format("%02d", s)}"
    }
}

fun answerCallById(callId: String?) {
    val call = callId?.let { DheetantraInCallService.findCall(it) }
    call?.answer(VideoProfile.STATE_AUDIO_ONLY)
}

fun rejectCallById(callId: String?) {
    val call = callId?.let { DheetantraInCallService.findCall(it) }
    call?.reject(false, null)
}

fun hangUpCallById(callId: String?) {
    val call = callId?.let { DheetantraInCallService.findCall(it) }
    call?.disconnect()
}
