package com.navasanganakah.dheetantra.callerid

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.RadioButton
import android.widget.TextView
import android.widget.Toast
import com.navasanganakah.dheetantra.MainActivity
import com.navasanganakah.dheetantra.R
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class CallerCardActivity : Activity() {

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

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

        setContentView(R.layout.activity_caller_card)
        findViewById<View>(R.id.root).setOnClickListener { finish() }

        val phone = intent.getStringExtra("phone") ?: ""
        val name = intent.getStringExtra("name") ?: phone
        val leadStatus = intent.getStringExtra("leadStatus")

        findViewById<TextView>(R.id.tvName).text = name
        findViewById<TextView>(R.id.tvNumber).text = phone

        val tvLeadStatus = findViewById<TextView>(R.id.tvLeadStatus)
        if (!leadStatus.isNullOrBlank()) {
            tvLeadStatus.visibility = View.VISIBLE
            tvLeadStatus.text = leadStatus
        }

        val rg1 = findViewById<android.widget.RadioGroup>(R.id.rgDisposition)
        val rg2 = findViewById<android.widget.RadioGroup>(R.id.rgDisposition2)

        // Only one radio group selection across both groups.
        val selectOne: (View) -> Unit = { selected ->
            rg1.clearCheck()
            rg2.clearCheck()
            if (selected is RadioButton) {
                selected.isChecked = true
            }
        }

        (0 until rg1.childCount).forEach { i ->
            rg1.getChildAt(i).setOnClickListener(selectOne)
        }
        (0 until rg2.childCount).forEach { i ->
            rg2.getChildAt(i).setOnClickListener(selectOne)
        }

        findViewById<Button>(R.id.btnSave).setOnClickListener {
            val notes = findViewById<EditText>(R.id.etNotes).text.toString().trim()
            val disposition = selectedDisposition(rg1, rg2)
            if (notes.isEmpty() && disposition.isEmpty()) {
                Toast.makeText(this, "Select outcome or add notes", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            saveCallNotes(phone, disposition, notes) { success ->
                mainHandler.post {
                    if (success) {
                        Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show()
                        finish()
                    } else {
                        Toast.makeText(this, "Save failed", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }

        findViewById<Button>(R.id.btnOpenApp).setOnClickListener {
            val intent = android.content.Intent(this, MainActivity::class.java).apply {
                flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                        android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("route", "/after-call")
                putExtra("phone", phone)
            }
            startActivity(intent)
            finish()
        }

        findViewById<Button>(R.id.btnClose).setOnClickListener { finish() }
    }

    private fun selectedDisposition(rg1: android.widget.RadioGroup, rg2: android.widget.RadioGroup): String {
        val v1 = rg1.findViewById<RadioButton>(rg1.checkedRadioButtonId)
        if (v1 != null) return v1.text.toString()
        val v2 = rg2.findViewById<RadioButton>(rg2.checkedRadioButtonId)
        return v2?.text?.toString() ?: ""
    }

    private fun saveCallNotes(phone: String, disposition: String, notes: String, callback: (Boolean) -> Unit) {
        executor.execute {
            val ctx = applicationContext
            val sessionId = SecureTokenStorage.getSessionId(ctx) ?: run {
                mainHandler.post { callback(false) }
                return@execute
            }
            val workspaceId = SecureTokenStorage.getWorkspaceId(ctx) ?: run {
                mainHandler.post { callback(false) }
                return@execute
            }
            val baseUrl = getString(R.string.dheetantra_api_base) ?: "https://app.dhitantra.com"

            val combinedNotes = buildString {
                if (disposition.isNotEmpty()) append("Disposition: $disposition")
                if (notes.isNotEmpty()) {
                    if (isNotEmpty()) append("\n")
                    append(notes)
                }
            }

            try {
                // 1. Create call
                val createConn = URL("$baseUrl/api/calls").openConnection() as HttpURLConnection
                createConn.requestMethod = "POST"
                createConn.setRequestProperty("Content-Type", "application/json")
                createConn.setRequestProperty("Cookie", "auth_session=$sessionId")
                createConn.setRequestProperty("x-workspace-id", workspaceId)
                createConn.doOutput = true
                createConn.outputStream.use { os ->
                    val payload = JSONObject().apply {
                        put("phone", phone)
                        put("direction", "incoming")
                        put("status", "ended")
                        put("duration", 0)
                    }.toString().toByteArray(Charsets.UTF_8)
                    os.write(payload)
                }
                val createResponse = createConn.inputStream.bufferedReader().use { it.readText() }
                createConn.disconnect()
                val callId = JSONObject(createResponse).optString("callId")
                if (callId.isNullOrBlank()) {
                    mainHandler.post { callback(false) }
                    return@execute
                }

                // 2. Update notes
                val noteConn = URL("$baseUrl/api/calls/$callId/status").openConnection() as HttpURLConnection
                noteConn.requestMethod = "POST"
                noteConn.setRequestProperty("Content-Type", "application/json")
                noteConn.setRequestProperty("Cookie", "auth_session=$sessionId")
                noteConn.setRequestProperty("x-workspace-id", workspaceId)
                noteConn.doOutput = true
                noteConn.outputStream.use { os ->
                    val payload = JSONObject().put("notes", combinedNotes).toString().toByteArray(Charsets.UTF_8)
                    os.write(payload)
                }
                val ok = noteConn.responseCode in 200..299
                noteConn.disconnect()
                mainHandler.post { callback(ok) }
            } catch (e: Exception) {
                e.printStackTrace()
                mainHandler.post { callback(false) }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdown()
    }
}
