package com.navasanganakah.dheetantra.callerid

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.TelecomManager

/**
 * Entry point for the system "Dialer" role. Handles ACTION_DIAL / ACTION_VIEW(tel)
 * by opening the in-app dialpad (Flutter [DialerScreen]) and ACTION_CALL by
 * placing the call via TelecomManager so that [DheetantraInCallService] renders
 * the outgoing-call UI. Previously this activity both launched
 * [OutgoingCallActivity] *and* the system placed the call through Telecom,
 * producing two overlapping outgoing screens; now the two flows are separated.
 */
class DialerRouterActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val action = intent?.action
        val uri = intent?.data
        val number = uri?.let { extractNumber(it) } ?: ""

        when (action) {
            Intent.ACTION_CALL -> {
                if (number.isNotBlank()) placeCall(number)
                finish()
            }
            Intent.ACTION_DIAL, Intent.ACTION_VIEW -> {
                openAppDialer(number)
                finish()
            }
            else -> {
                openAppDialer("")
                finish()
            }
        }
    }

    private fun extractNumber(uri: Uri): String {
        return if (uri.scheme == "tel") uri.schemeSpecificPart ?: "" else ""
    }

    /**
     * Places an outgoing GSM/PSTN call through the platform TelecomManager. The
     * resulting call is then delivered to [DheetantraInCallService], which shows
     * [OutgoingCallActivity]. Requires CALL_PHONE permission or the default-dialer
     * role. If placement fails (no permission / not default dialer) we fall back
     * to the in-app dialer so the user is never left with a dead screen.
     */
    private fun placeCall(number: String) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val tm = getSystemService(TELECOM_SERVICE) as TelecomManager
                tm.placeCall(Uri.fromParts("tel", number, null), null)
            } else {
                @Suppress("DEPRECATION")
                startActivity(Intent(Intent.ACTION_CALL, Uri.parse("tel:$number")))
            }
        } catch (e: SecurityException) {
            e.printStackTrace()
            openAppDialer(number)
        }
    }

    /**
     * Opens the Flutter app on the dialpad route. A non-empty number is passed
     * as an extra so the dialpad can pre-fill it (ACTION_DIAL with a number).
     */
    private fun openAppDialer(number: String) {
        val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("route", "/dialer")
            if (number.isNotBlank()) putExtra("phone", number)
        }
        if (intent != null) startActivity(intent)
    }
}
