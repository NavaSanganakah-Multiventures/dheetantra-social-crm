package com.navasanganakah.dheetantra

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import com.navasanganakah.dheetantra.callerid.CallerIdChannel

class MainActivity: FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        CallerIdChannel.initContext(this)
        CallerIdChannel.setInitialIntent(intent)
        CallerIdChannel.setActivity(this)

        if (intent.action == Intent.ACTION_CALL || intent.action == Intent.ACTION_DIAL || intent.action == Intent.ACTION_VIEW) {
            val uri = intent.data
            if (uri?.scheme == "tel") {
                val number = uri.schemeSpecificPart ?: ""
                if (number.isNotBlank()) {
                    placeCall(number)
                }
                // Clear action so Flutter does not re-process.
                intent.action = null
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        CallerIdChannel.register(flutterEngine, this)
        CallerIdChannel.setActivity(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        CallerIdChannel.setInitialIntent(intent)
        CallerIdChannel.notifyIntent(intent)
    }

    private fun placeCall(number: String) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val telecomManager = getSystemService(TELECOM_SERVICE) as android.telecom.TelecomManager
                val uri = android.net.Uri.fromParts("tel", number, null)
                telecomManager.placeCall(uri, null)
            } else {
                val intent = Intent(Intent.ACTION_CALL, android.net.Uri.parse("tel:$number"))
                startActivity(intent)
            }
        } catch (e: SecurityException) {
            e.printStackTrace()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        CallerIdChannel.onRoleResult(requestCode, resultCode)
    }
}
