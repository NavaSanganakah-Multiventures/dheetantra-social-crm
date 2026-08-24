package com.navasanganakah.dheetantra.callerid

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object SecureTokenStorage {
    private const val PREFS_FILE = "dheetantra_secure_auth"
    private const val KEY_TOKEN = "auth_token"
    private const val KEY_WORKSPACE_ID = "workspace_id"
    private const val KEY_CALLER_ID_ENABLED = "caller_id_enabled"
    private const val KEY_AFTER_CALL_ENABLED = "after_call_crm_enabled"

    private var prefs: EncryptedSharedPreferences? = null

    private fun getPrefs(context: Context): EncryptedSharedPreferences {
        if (prefs == null) {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            prefs = EncryptedSharedPreferences.create(
                context,
                PREFS_FILE,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            ) as EncryptedSharedPreferences
        }
        return prefs!!
    }

    fun storeAuth(context: Context, token: String, workspaceId: String) {
        getPrefs(context).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_WORKSPACE_ID, workspaceId)
            .apply()
    }

    fun getToken(context: Context): String? = getPrefs(context).getString(KEY_TOKEN, null)
    fun getWorkspaceId(context: Context): String? = getPrefs(context).getString(KEY_WORKSPACE_ID, null)

    fun setCallerIdEnabled(context: Context, enabled: Boolean) {
        getPrefs(context).edit().putBoolean(KEY_CALLER_ID_ENABLED, enabled).apply()
    }
    fun isCallerIdEnabled(context: Context): Boolean = getPrefs(context).getBoolean(KEY_CALLER_ID_ENABLED, false)

    fun setAfterCallEnabled(context: Context, enabled: Boolean) {
        getPrefs(context).edit().putBoolean(KEY_AFTER_CALL_ENABLED, enabled).apply()
    }
    fun isAfterCallEnabled(context: Context): Boolean = getPrefs(context).getBoolean(KEY_AFTER_CALL_ENABLED, false)

    fun clear(context: Context) {
        getPrefs(context).edit().clear().apply()
    }
}
