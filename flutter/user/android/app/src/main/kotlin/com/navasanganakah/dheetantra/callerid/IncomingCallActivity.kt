package com.navasanganakah.dheetantra.callerid

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.navasanganakah.dheetantra.R
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
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
        findViewById<TextView>(R.id.tvName).text = "Incoming call"

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

        loadCallerProfile(phone)
        registerReceiver(callEndedReceiver, IntentFilter("com.navasanganakah.dheetantra.CALL_ENDED"), Context.RECEIVER_EXPORTED)
    }

    private fun loadCallerProfile(phone: String) {
        executor.execute {
            val ctx = applicationContext
            val sessionId = SecureTokenStorage.getSessionId(ctx) ?: return@execute
            val workspaceId = SecureTokenStorage.getWorkspaceId(ctx) ?: return@execute
            val baseUrl = getString(R.string.dheetantra_api_base) ?: "https://app.dhitantra.com"

            try {
                // Caller card
                val cardJson = apiGet("$baseUrl/api/crm/caller-card?phone=${URLEncoder.encode(phone, "UTF-8")}", sessionId, workspaceId)
                val card = cardJson?.let { JSONObject(it) }
                runOnUiThread { renderCallerCard(card, phone) }

                // Recent calls
                val callsJson = apiGet("$baseUrl/api/calls?phone=${URLEncoder.encode(phone, "UTF-8")}&limit=5", sessionId, workspaceId)
                val calls = callsJson?.let { JSONObject(it).optJSONArray("calls") }
                runOnUiThread { renderCallHistory(calls) }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun apiGet(url: String, sessionId: String, workspaceId: String): String? {
        val conn = URL(url).openConnection() as HttpURLConnection
        return try {
            conn.requestMethod = "GET"
            conn.setRequestProperty("Cookie", "auth_session=$sessionId")
            conn.setRequestProperty("x-workspace-id", workspaceId)
            if (conn.responseCode == 200) conn.inputStream.bufferedReader().use { it.readText() } else null
        } finally {
            conn.disconnect()
        }
    }

    private fun renderCallerCard(card: JSONObject?, phone: String) {
        if (card == null || card.optBoolean("found") != true) {
            findViewById<TextView>(R.id.tvName).text = phone
            addBadge("New number", Color.parseColor("#D32F2F"))
            return
        }

        val name = card.optString("name").takeIf { it.isNotBlank() } ?: phone
        findViewById<TextView>(R.id.tvName).text = name

        val leadStatus = card.optString("leadStatus").takeIf { it.isNotBlank() }
        if (leadStatus != null) addBadge(leadStatus, Color.parseColor("#00D4AA"))

        val tags = card.optJSONArray("tags")
        for (i in 0 until (tags?.length() ?: 0)) {
            val tag = tags?.optString(i) ?: continue
            if (tag.isNotBlank()) addBadge(tag, Color.parseColor("#FFB300"))
        }

        val stats = card.optJSONObject("callStats")
        val total = stats?.optInt("totalCalls") ?: 0
        val durationSec = stats?.optInt("totalDurationSeconds") ?: 0
        val lastCall = stats?.optString("lastCallAt")?.takeIf { it.isNotBlank() }
        val statsBuilder = StringBuilder("Total calls: $total")
        if (durationSec > 0) statsBuilder.append("  •  Duration: ${formatDuration(durationSec)}")
        if (lastCall != null) statsBuilder.append("  •  Last: ${formatDate(lastCall)}")
        findViewById<TextView>(R.id.tvStats).text = statsBuilder.toString()

        val lastMessage = card.optJSONObject("lastMessage")
        if (lastMessage != null) {
            val content = lastMessage.optString("content")
            val platform = lastMessage.optString("platform")
            val tv = findViewById<TextView>(R.id.tvLastMessage)
            tv.text = "Last message ($platform): $content"
            tv.visibility = View.VISIBLE
        }
    }

    private fun renderCallHistory(calls: JSONArray?) {
        val header = findViewById<TextView>(R.id.tvHistoryHeader)
        val container = findViewById<LinearLayout>(R.id.llHistory)
        container.removeAllViews()
        if (calls == null || calls.length() == 0) {
            header.visibility = View.GONE
            val none = TextView(this)
            none.text = "No recent calls"
            none.setTextColor(Color.parseColor("#777777"))
            none.textSize = 13f
            none.gravity = Gravity.CENTER
            container.addView(none)
            return
        }
        header.visibility = View.VISIBLE
        for (i in 0 until calls.length()) {
            val c = calls.optJSONObject(i) ?: continue
            val direction = c.optString("direction", "incoming")
            val status = c.optString("status", "")
            val duration = c.optInt("duration")
            val created = c.optString("created_at")
            val hasRecording = !c.isNull("recording_url") && c.optString("recording_url").isNotBlank()
            val hasSummary = !c.isNull("summary") && c.optString("summary").isNotBlank()
            val line = StringBuilder()
            line.append(if (status.isNotBlank()) status.replaceFirstChar { it.uppercase() } else direction.replaceFirstChar { it.uppercase() })
            line.append("  •  ${formatDate(created)}")
            if (duration > 0) line.append("  •  ${formatDuration(duration)}")
            if (hasRecording) line.append("  🎙")
            if (hasSummary) line.append("  ✨")
            val tv = TextView(this)
            tv.text = line.toString()
            tv.setTextColor(Color.parseColor("#E0E0E0"))
            tv.textSize = 12f
            tv.setPadding(0, 8, 0, 8)
            container.addView(tv)
        }
    }

    private fun addBadge(text: String, color: Int) {
        val badges = findViewById<LinearLayout>(R.id.llBadges)
        val tv = TextView(this)
        tv.text = text.uppercase(Locale.getDefault())
        tv.setTextColor(color)
        tv.textSize = 10f
        tv.setPadding(12, 4, 12, 4)
        tv.background = createBadgeDrawable(color)
        val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        params.marginEnd = 8
        tv.layoutParams = params
        badges.addView(tv)
    }

    private fun createBadgeDrawable(color: Int): android.graphics.drawable.GradientDrawable {
        return android.graphics.drawable.GradientDrawable().apply {
            cornerRadius = 8f
            setColor(color and 0xFFFFFF or (0x22 shl 24))
            setStroke(1, color)
        }
    }

    private fun formatDuration(seconds: Int): String {
        val m = seconds / 60
        val s = seconds % 60
        return if (m == 0) "${s}s" else "${m}m ${String.format("%02d", s)}"
    }

    private fun formatDate(iso: String): String {
        return try {
            val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
            parser.timeZone = java.util.TimeZone.getTimeZone("UTC")
            val d = parser.parse(iso) ?: return iso
            SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault()).format(d)
        } catch (e: Exception) {
            iso
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
