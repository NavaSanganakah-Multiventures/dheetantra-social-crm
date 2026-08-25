package com.navasanganakah.dheetantra.callerid

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import com.navasanganakah.dheetantra.MainActivity
import com.navasanganakah.dheetantra.R

class CallerCardActivity : Activity() {

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

        // Allow the popup to extend past display cutouts and show over lock screen.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)

        setContentView(R.layout.activity_caller_card)

        // Tap outside the card to dismiss.
        findViewById<View>(R.id.root).setOnClickListener { finish() }
        findViewById<View>(R.id.tvName).setOnClickListener { /* consume click inside card */ }

        val phone = intent.getStringExtra("phone") ?: ""
        val name = intent.getStringExtra("name") ?: phone
        val leadStatus = intent.getStringExtra("leadStatus")
        val lastMessage = intent.getStringExtra("lastMessage")

        findViewById<TextView>(R.id.tvName).text = name
        findViewById<TextView>(R.id.tvNumber).text = phone

        val tvLeadStatus = findViewById<TextView>(R.id.tvLeadStatus)
        if (!leadStatus.isNullOrBlank()) {
            tvLeadStatus.visibility = View.VISIBLE
            tvLeadStatus.text = leadStatus
        }

        val tvLastMessage = findViewById<TextView>(R.id.tvLastMessage)
        if (!lastMessage.isNullOrBlank()) {
            tvLastMessage.visibility = View.VISIBLE
            tvLastMessage.text = lastMessage
        }

        findViewById<Button>(R.id.btnOpenApp).setOnClickListener {
            val intent = android.content.Intent(this, MainActivity::class.java).apply {
                flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                        android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("route", "/caller-card")
                putExtra("phone", phone)
            }
            startActivity(intent)
            finish()
        }

        findViewById<Button>(R.id.btnClose).setOnClickListener {
            finish()
        }
    }
}
