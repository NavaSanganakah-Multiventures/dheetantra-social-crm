package com.navasanganakah.dheetantra.callerid

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationCompat
import com.navasanganakah.dheetantra.MainActivity
import com.navasanganakah.dheetantra.R
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

@RequiresApi(Build.VERSION_CODES.Q)
class CallerScreeningService : CallScreeningService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    override fun onScreenCall(callDetails: Call.Details) {
        val handle = callDetails.handle
        val phoneNumber = handle?.schemeSpecificPart ?: handle?.toString() ?: ""

        // Allow the call by default immediately so we never block normal calling.
        respondToCall(callDetails, buildResponse(true, false))

        if (phoneNumber.isBlank()) return
        if (!SecureTokenStorage.isCallerIdEnabled(this)) return

        serviceScope.launch {
            try {
                val card = fetchCallerCard(phoneNumber)
                showCallerNotification(phoneNumber, card)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun buildResponse(allow: Boolean, reject: Boolean): CallResponse {
        val builder = CallResponse.Builder()
        if (reject) {
            builder.apply {
                setDisallowCall(true)
                setRejectCall(true)
            }
        } else {
            builder.setDisallowCall(false)
        }
        return builder.build()
    }

    private fun fetchCallerCard(phoneNumber: String): JSONObject? {
        val token = SecureTokenStorage.getToken(this) ?: return null
        val workspaceId = SecureTokenStorage.getWorkspaceId(this) ?: return null
        val baseUrl = getString(R.string.dheetantra_api_base) ?: "https://app.dhitantra.com"

        val url = URL("$baseUrl/api/crm/caller-card?phone=${Uri.encode(phoneNumber)}")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.setRequestProperty("x-workspace-id", workspaceId)
        conn.setRequestProperty("Accept", "application/json")
        conn.connectTimeout = 5000
        conn.readTimeout = 5000
        return try {
            val response = conn.inputStream.bufferedReader().use { it.readText() }
            JSONObject(response)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        } finally {
            conn.disconnect()
        }
    }

    private fun showCallerNotification(phoneNumber: String, card: JSONObject?) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Caller ID Card",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(channel)
        }

        val name = if (card?.optBoolean("found", false) == true) card.optString("name", phoneNumber) else phoneNumber
        val leadStatus = card?.optString("leadStatus", null)
        val lastMessage = card?.optJSONObject("lastMessage")?.optString("content", null)

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("route", "/caller-card")
            putExtra("phone", phoneNumber)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            phoneNumber.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val content = buildString {
            append("Incoming call")
            if (!leadStatus.isNullOrBlank()) append(" • \$leadStatus")
            if (!lastMessage.isNullOrBlank()) append("\nLast msg: $lastMessage")
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(name)
            .setContentText(content)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true)
            .build()

        manager.notify(NOTIFICATION_TAG, phoneNumber.hashCode(), notification)
    }

    companion object {
        private const val CHANNEL_ID = "dheetantra_caller_id"
        private const val NOTIFICATION_TAG = "caller_id"
    }
}
