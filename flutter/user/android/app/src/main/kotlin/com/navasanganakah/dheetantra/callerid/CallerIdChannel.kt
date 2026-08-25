package com.navasanganakah.dheetantra.callerid

import android.app.role.RoleManager
import android.telecom.TelecomManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.Manifest
import android.provider.MediaStore
import android.database.Cursor
import android.net.Uri
import android.content.ContentUris
import androidx.core.content.ContextCompat
import android.widget.Toast
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.*

object CallerIdChannel : MethodChannel.MethodCallHandler {
    private const val CHANNEL_NAME = "dheetantra/callerid"
    private const val REQ_DEFAULT_DIALER = 9001
    private var methodChannel: MethodChannel? = null

    fun register(engine: FlutterEngine, context: Context) {
        methodChannel = MethodChannel(engine.dartExecutor.binaryMessenger, CHANNEL_NAME).apply {
            setMethodCallHandler(this@CallerIdChannel)
        }
    }

    fun notifyIntent(intent: Intent?) {
        val payload = intent?.let {
            mapOf(
                "route" to (it.getStringExtra("route") ?: ""),
                "phone" to (it.getStringExtra("phone") ?: ""),
                "durationSeconds" to (it.getIntExtra("durationSeconds", 0)),
                "direction" to (it.getStringExtra("direction") ?: "incoming"),
            )
        } ?: emptyMap<String, Any>()
        methodChannel?.invokeMethod("onIntent", payload)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        val context = getContext()
        when (call.method) {
            "scanRecordings" -> {
                val phone = call.argument<String>("phone") ?: ""
                val afterMs = call.argument<Long>("afterMs") ?: 0L
                val beforeMs = call.argument<Long>("beforeMs") ?: System.currentTimeMillis()
                result.success(scanRecordings(phone, afterMs, beforeMs))
            }
            "getInitialIntent" -> {
                val intent = initialIntent
                result.success(intent?.let {
                    mapOf(
                        "route" to (it.getStringExtra("route") ?: ""),
                        "phone" to (it.getStringExtra("phone") ?: ""),
                        "durationSeconds" to (it.getIntExtra("durationSeconds", 0)),
                        "direction" to (it.getStringExtra("direction") ?: "incoming"),
                    )
                } ?: emptyMap<String, Any>())
            }
            "storeSession" -> {
                val sessionId = call.argument<String>("sessionId") ?: ""
                val workspaceId = call.argument<String>("workspaceId") ?: ""
                if (sessionId.isNotBlank() && workspaceId.isNotBlank()) {
                    SecureTokenStorage.storeSession(context, sessionId, workspaceId)
                    result.success(true)
                } else {
                    result.error("INVALID_ARGS", "sessionId and workspaceId required", null)
                }
            }
            "isCallerIdRoleHeld" -> {
                result.success(checkRoleHeld(context))
            }
            "requestCallerIdRole" -> {
                requestRole(context) { granted -> result.success(granted) }
            }
            "setCallerIdEnabled" -> {
                val enabled = call.argument<Boolean>("enabled") ?: false
                SecureTokenStorage.setCallerIdEnabled(context, enabled)
                result.success(true)
            }
            "setAfterCallEnabled" -> {
                val enabled = call.argument<Boolean>("enabled") ?: false
                SecureTokenStorage.setAfterCallEnabled(context, enabled)
                if (enabled) startAfterCallService(context) else stopAfterCallService(context)
                result.success(true)
            }
            "isDefaultDialer" -> {
                result.success(isDefaultDialer(context))
            }
            "requestDefaultDialerRole" -> {
                result.success(tryLaunchDefaultDialerRole(context))
            }
            "clearAuth" -> {
                SecureTokenStorage.clear(context)
                stopAfterCallService(context)
                result.success(true)
            }
            else -> result.notImplemented()
        }
    }

    private fun getContext(): Context {
        // The channel is registered from MainActivity which provides application context.
        // We keep a static ref below instead of passing Context around from handler.
        return appContext ?: throw IllegalStateException("CallerIdChannel not initialized with context")
    }

    private var appContext: Context? = null
    @Volatile
    private var initialIntent: Intent? = null
    private var currentActivity: java.lang.ref.WeakReference<android.app.Activity>? = null

    fun initContext(context: Context) {
        appContext = context.applicationContext
    }

    fun setActivity(activity: android.app.Activity) {
        currentActivity = java.lang.ref.WeakReference(activity)
    }

    fun setInitialIntent(intent: Intent?) {
        initialIntent = intent
    }

    private fun checkRoleHeld(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
            roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
        } else {
            false
        }
    }

    private fun requestRole(context: Context, callback: (Boolean) -> Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
            if (roleManager.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) {
                val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
                val activity = currentActivity?.get()
                if (activity != null) {
                    activity.startActivityForResult(intent, REQUEST_ROLE)
                    pendingRoleCallback = callback
                } else {
                    // Cannot request role without an Activity; open default apps settings instead.
                    context.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    callback(false)
                }
            } else {
                callback(false)
            }
        } else {
            callback(false)
        }
    }

    private var pendingRoleCallback: ((Boolean) -> Unit)? = null

    fun onRoleResult(requestCode: Int, resultCode: Int) {
        if (requestCode == REQUEST_ROLE) {
            val granted = resultCode == android.app.Activity.RESULT_OK
            pendingRoleCallback?.invoke(granted)
            pendingRoleCallback = null
        }
        if (requestCode == REQUEST_DEFAULT_DIALER) {
            val activity = currentActivity?.get()
            if (activity != null) {
                SecureTokenStorage.setDefaultDialerEnabled(activity, resultCode == android.app.Activity.RESULT_OK)
            }
        }
    }

    private fun tryLaunchDefaultDialerRole(context: Context): Boolean {
        val activity = currentActivity?.get() ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER).apply {
                    putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, context.packageName)
                }
                activity.startActivityForResult(intent, REQUEST_DEFAULT_DIALER)
                true
            } catch (e: Exception) {
                false
            }
        } else {
            false
        }
    }

    private fun startAfterCallService(context: Context) {
        val intent = Intent(context, CallLogObserverService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
    }

    private fun stopAfterCallService(context: Context) {
        context.stopService(Intent(context, CallLogObserverService::class.java))
    }


    private fun scanRecordings(phone: String, afterMs: Long, beforeMs: Long): List<Map<String, Any>> {
        val context = appContext ?: return emptyList()
        val hasPermission = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_GRANTED
        }
        if (!hasPermission) return emptyList()

        val normalizedPhone = phone.replace(Regex("[^0-9]"), "")
        val candidates = mutableListOf<Map<String, Any>>()
        val uri: Uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.DATE_MODIFIED,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.RELATIVE_PATH,
            MediaStore.Audio.Media.DATA
        )
        val selection = "${MediaStore.Audio.Media.DATE_MODIFIED} > ? AND ${MediaStore.Audio.Media.DATE_MODIFIED} < ?"
        val selectionArgs = arrayOf(
            ((afterMs / 1000) - 120).toString(),
            ((beforeMs / 1000) + 60).toString()
        )
        val cursor: Cursor? = context.contentResolver.query(
            uri,
            projection,
            selection,
            selectionArgs,
            "${MediaStore.Audio.Media.DATE_MODIFIED} DESC"
        )
        cursor?.use { c ->
            val idIdx = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val nameIdx = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
            val dateIdx = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
            val durationIdx = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val pathIdx = c.getColumnIndexOrThrow(MediaStore.Audio.Media.RELATIVE_PATH)
            val dataIdx = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA)
            while (c.moveToNext()) {
                val id = c.getLong(idIdx)
                val name = c.getString(nameIdx) ?: ""
                val dt = c.getLong(dateIdx)
                val dur = c.getLong(durationIdx)
                val relPath = c.getString(pathIdx) ?: ""
                val dataPath = c.getString(dataIdx) ?: ""
                val contentUri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id).toString()
                val combined = "$relPath/$dataPath".lowercase()

                var score = 0
                val lowerName = name.lowercase()
                if (combined.contains("call_rec") || combined.contains("callrecord") || combined.contains("phone record") || combined.contains("phonerecord")) score += 100
                if (normalizedPhone.isNotEmpty() && (lowerName.contains(normalizedPhone) || combined.replace(Regex("[^0-9]"), "").contains(normalizedPhone))) score += 60
                if (dur > 0) score += 10

                candidates.add(mapOf(
                    "id" to id,
                    "name" to name,
                    "uri" to contentUri,
                    "path" to dataPath,
                    "durationMs" to dur,
                    "modifiedAt" to (dt * 1000L),
                    "score" to score
                ))
            }
        }
        cursor?.close()
        return candidates.sortedByDescending { (it["score"] as? Int) ?: 0 }.take(5)
    }

    private const val REQUEST_ROLE = 9001
    private const val REQUEST_DEFAULT_DIALER = 9002
}
