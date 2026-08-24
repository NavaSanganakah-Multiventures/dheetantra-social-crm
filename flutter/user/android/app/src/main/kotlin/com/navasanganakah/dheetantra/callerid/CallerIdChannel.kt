package com.navasanganakah.dheetantra.callerid

import android.app.role.RoleManager
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

    fun register(engine: FlutterEngine, context: Context) {
        MethodChannel(engine.dartExecutor.binaryMessenger, CHANNEL_NAME)
            .setMethodCallHandler(this)
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
                        "phone" to (it.getStringExtra("phone") ?: "")
                    )
                } ?: emptyMap<String, String>())
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

    fun initContext(context: Context) {
        appContext = context.applicationContext
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
                if (context is android.app.Activity) {
                    context.startActivityForResult(intent, REQUEST_ROLE)
                    pendingRoleCallback = callback
                } else {
                    // Cannot request role without an Activity; open default apps settings instead.
                    context.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS))
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

    private const val REQUEST_ROLE = 9001
}
