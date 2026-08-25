package com.navasanganakah.dheetantra.callerid

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import com.navasanganakah.dheetantra.R

/**
 * Outgoing-call UI shown by [DheetantraInCallService] when the system reports a
 * DIALING/CONNECTING call. The actual call placement is now done either by the
 * system (when launched from the contacts app) or by [DialerRouterActivity] /
 * the Flutter dialpad via TelecomManager.placeCall - so this activity no longer
 * tries to place a call itself (the old `shouldPlaceCall` path produced a
 * second outgoing screen on top of the one the InCallService already shows).
 */
class OutgoingCallActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)

        setContentView(R.layout.activity_outgoing_call)

        val phone = intent.getStringExtra("phone") ?: ""
        val callId = intent.getStringExtra("callId")

        findViewById<TextView>(R.id.tvNumber).text = phone

        findViewById<Button>(R.id.btnHangup).setOnClickListener {
            hangUpCallById(callId)
            finish()
        }

        registerReceiver(callEndedReceiver, IntentFilter("com.navasanganakah.dheetantra.CALL_ENDED"), Context.RECEIVER_EXPORTED)
    }

    private val callEndedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(callEndedReceiver) } catch (_: Exception) {}
    }
}
