package com.navasanganakah.dheetantra.callerid

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.CallLog
import androidx.core.app.NotificationCompat
import com.navasanganakah.dheetantra.MainActivity
import com.navasanganakah.dheetantra.R

class CallLogObserverService : Service() {

    private var observer: ContentObserver? = null
    private var lastProcessedId: Long = -1

    override fun onCreate() {
        super.onCreate()
        startForeground(FOREGROUND_ID, buildForegroundNotification())
        registerObserver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        observer?.let { contentResolver.unregisterContentObserver(it) }
    }

    private fun registerObserver() {
        observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                if (!SecureTokenStorage.isAfterCallEnabled(this@CallLogObserverService)) return
                processLatestCall()
            }
        }
        contentResolver.registerContentObserver(
            CallLog.Calls.CONTENT_URI,
            true,
            observer!!
        )
    }

    private fun processLatestCall() {
        try {
            val cursor = contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(
                    CallLog.Calls._ID,
                    CallLog.Calls.NUMBER,
                    CallLog.Calls.DURATION,
                    CallLog.Calls.TYPE,
                    CallLog.Calls.DATE
                ),
                null,
                null,
                CallLog.Calls.DATE + " DESC"
            ) ?: return

            cursor.use {
                if (!it.moveToFirst()) return
                val id = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls._ID))
                if (id == lastProcessedId) return
                lastProcessedId = id

                val number = it.getString(it.getColumnIndexOrThrow(CallLog.Calls.NUMBER)) ?: return
                val duration = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls.DURATION))
                val type = it.getInt(it.getColumnIndexOrThrow(CallLog.Calls.TYPE))
                val direction = when (type) {
                    CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                    CallLog.Calls.INCOMING_TYPE -> "incoming"
                    else -> "incoming"
                }
                val date = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls.DATE))
                val now = System.currentTimeMillis()
                // Only process calls ended within last 2 minutes
                if (now - date > 2 * 60 * 1000) return

                showAfterCallNotification(number, duration, direction)
            }
        } catch (e: SecurityException) {
            e.printStackTrace()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun showAfterCallNotification(phoneNumber: String, durationSeconds: Long, direction: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "After-call CRM",
                NotificationManager.IMPORTANCE_HIGH
            )
            manager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("route", "/after-call")
            putExtra("phone", phoneNumber)
            putExtra("durationSeconds", durationSeconds.toInt())
            putExtra("direction", direction)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            1,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Call ended")
            .setContentText("Tap to add notes & recording for $phoneNumber")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify(NOTIFICATION_TAG, phoneNumber.hashCode(), notification)
    }

    private fun buildForegroundNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "After-call CRM",
                NotificationManager.IMPORTANCE_LOW
            )
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("DheeTantra CRM")
            .setContentText("Monitoring calls for CRM updates")
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "dheetantra_after_call"
        private const val NOTIFICATION_TAG = "after_call"
        private const val FOREGROUND_ID = 2001
    }
}
