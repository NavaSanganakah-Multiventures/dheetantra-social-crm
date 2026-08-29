package com.navasanganakah.dheetantra.plivo

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import com.navasanganakah.dheetantra.MainActivity
import com.navasanganakah.dheetantra.R

/**
 * Plivo SDK ke onIncomingCall par dikhne wali full-screen incoming UI.
 *
 * sip_ua / flutter_callkit_incoming ke conference incoming path se ALAG hai:
 * yeh sirf native Plivo SDK ke onIncomingCall se launch hoti hai, taaki
 * existing flow pe koi farq na pade.
 */
class PlivoIncomingCallActivity : Activity() {

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
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            )
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)

        setContentView(R.layout.activity_plivo_incoming_call)

        val manager = PlivoManager.get()
        findViewById<TextView>(R.id.plivoTvName).text = manager.incomingCallerName()
        findViewById<TextView>(R.id.plivoTvNumber).text = manager.incomingCallerNumber()

        findViewById<Button>(R.id.plivoBtnAccept).setOnClickListener {
            val accepted = manager.answer()
            if (accepted) {
                // In-call UI (Flutter CallScreen) agle milestone mein aayega;
                // abhi app ko foreground mein kholo taaki agent ko context mile.
                openApp()
            }
            finish()
        }

        findViewById<Button>(R.id.plivoBtnDecline).setOnClickListener {
            manager.reject()
            finish()
        }

        registerReceiver(
            callEndedReceiver,
            IntentFilter(PlivoManager.ACTION_INCOMING_ENDED),
            Context.RECEIVER_EXPORTED,
        )
    }

    private fun openApp() {
        try {
            startActivity(
                Intent(this, MainActivity::class.java).addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP,
                ),
            )
        } catch (e: Exception) {
            // ignore
        }
    }

    private val callEndedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(callEndedReceiver)
        } catch (_: Exception) {
        }
    }
}
