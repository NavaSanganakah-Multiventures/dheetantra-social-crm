package com.navasanganakah.dheetantra.plivo

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Plivo login credentials + FCM token ko securely persist karta hai
 * (EncryptedSharedPreferences), taaki killed-state mein FCM push aane par
 * native layer khud re-login kar sake (bina Flutter engine ke).
 */
object PlivoCredentialStore {
    private const val PREFS_FILE = "dheetantra_plivo_creds"
    private const val KEY_USERNAME = "username"
    private const val KEY_PASSWORD = "password"
    private const val KEY_CERTIFICATE_ID = "certificate_id"
    private const val KEY_FCM_TOKEN = "fcm_token"

    private var prefs: EncryptedSharedPreferences? = null

    private fun getPrefs(context: Context): EncryptedSharedPreferences {
        if (prefs == null) {
            val appCtx = context.applicationContext
            val masterKey = MasterKey.Builder(appCtx)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            prefs = EncryptedSharedPreferences.create(
                appCtx,
                PREFS_FILE,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            ) as EncryptedSharedPreferences
        }
        return prefs!!
    }

    fun store(context: Context, username: String, password: String, certificateId: String?, fcmToken: String?) {
        getPrefs(context).edit()
            .putString(KEY_USERNAME, username)
            .putString(KEY_PASSWORD, password)
            .putString(KEY_CERTIFICATE_ID, certificateId ?: "")
            .putString(KEY_FCM_TOKEN, fcmToken ?: "")
            .apply()
    }

    fun getUsername(context: Context): String? = getPrefs(context).getString(KEY_USERNAME, null)
    fun getPassword(context: Context): String? = getPrefs(context).getString(KEY_PASSWORD, null)
    fun getCertificateId(context: Context): String? = getPrefs(context).getString(KEY_CERTIFICATE_ID, null)
    fun getFcmToken(context: Context): String? = getPrefs(context).getString(KEY_FCM_TOKEN, null)

    fun updateFcmToken(context: Context, token: String) {
        getPrefs(context).edit().putString(KEY_FCM_TOKEN, token).apply()
    }

    fun clear(context: Context) {
        getPrefs(context).edit().clear().apply()
    }
}
