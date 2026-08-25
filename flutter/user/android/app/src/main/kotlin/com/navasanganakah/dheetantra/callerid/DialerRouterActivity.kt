package com.navasanganakah.dheetantra.callerid

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.TelecomManager

class DialerRouterActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val action = intent?.action
        val uri = intent?.data
        val number = uri?.let { extractNumber(it) } ?: ""

        when (action) {
            Intent.ACTION_CALL -> {
                if (number.isNotBlank()) {
                    placeCall(number)
                    startOutgoingScreen(number)
                } else {
                    openAppDialer()
                }
            }
            Intent.ACTION_DIAL -> {
                if (number.isNotBlank()) {
                    startOutgoingScreen(number)
                } else {
                    openAppDialer()
                }
            }
            Intent.ACTION_VIEW -> {
                if (uri?.scheme == "tel" && number.isNotBlank()) {
                    startOutgoingScreen(number)
                } else {
                    openAppDialer()
                }
            }
            else -> openAppDialer()
        }

        finish()
    }

    private fun extractNumber(uri: Uri): String {
        return if (uri.scheme == "tel") uri.schemeSpecificPart ?: "" else ""
    }

    private fun placeCall(number: String) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val telecomManager = getSystemService(TELECOM_SERVICE) as TelecomManager
                telecomManager.placeCall(Uri.fromParts("tel", number, null), null)
            }
        } catch (e: SecurityException) {
            e.printStackTrace()
        }
    }

    private fun startOutgoingScreen(number: String) {
        val intent = Intent(this, OutgoingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("phone", number)
        }
        startActivity(intent)
    }

    private fun openAppDialer() {
        val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        if (intent != null) startActivity(intent)
    }
}
