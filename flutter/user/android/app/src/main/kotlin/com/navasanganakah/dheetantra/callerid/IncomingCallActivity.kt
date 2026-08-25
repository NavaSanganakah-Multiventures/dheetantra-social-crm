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
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class IncomingCallActivity : Activity() {

    private val executor = Executors.newSingleThreadExecutor()

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

        setContentView(R.layout.activity_incoming_call)

        val phone = intent.getStringExtra("phone") ?: ""
        val callId = intent.getStringExtra("callId")

        findViewById<TextView>(R.id.tvNumber).text = phone
        val tvName = findViewById<TextView>(R.id.tvName)

        fetchCallerCard(phone) { card ->
            runOnUiThread {
                val name = card?.optString("name")?.takeIf { it.isNotBlank() } ?: phone
                tvName.text = name
            }
        }

        findViewById<Button>(R.id.btnAnswer).setOnClickListener {
            answerCallById(callId)
            findViewById<View>(R.id.incomingActions).visibility = View.GONE
            findViewById<View>(R.id.ongoingActions).visibility = View.VISIBLE
        }

        findViewById<Button>(R.id.btnDecline).setOnClickListener {
            rejectCallById(callId)
            finish()
        }

        findViewById<Button>(R.id.btnHangup).setOnClickListener {
            hangUpCallById(callId)
            finish()
        }

        registerReceiver(callEndedReceiver, IntentFilter("com.navasanganakah.dheetantra.CALL_ENDED"), Context.RECEIVER_EXPORTED)
    }

    private fun fetchCallerCard(phone: String, callback: (org.json.JSONObject?) -> Unit) {
        executor.execute {
            val ctx = applicationContext
            val sessionId = SecureTokenStorage.getSessionId(ctx)
            val workspaceId = SecureTokenStorage.getWorkspaceId(ctx)
            if (sessionId == null || workspaceId == null) {
                callback(null)
                return@execute
            }
            val baseUrl = getString(R.string.dheetantra_api_base) ?: "https://app.dhitantra.com"
            try {
                val conn = URL("$baseUrl/api/crm/caller-card?phone=${java.net.URLEncoder.encode(phone, "UTF-8")}").openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.setRequestProperty("Cookie", "auth_session=$sessionId")
                conn.setRequestProperty("x-workspace-id", workspaceId)
                if (conn.responseCode == 200) {
                    val text = conn.inputStream.bufferedReader().use { it.readText() }
                    callback(org.json.JSONObject(text))
                } else {
                    callback(null)
                }
                conn.disconnect()
            } catch (e: Exception) {
                e.printStackTrace()
                callback(null)
            }
        }
    }

    private val callEndedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(callEndedReceiver) } catch (_: Exception) {}
        executor.shutdown()
    }
}
