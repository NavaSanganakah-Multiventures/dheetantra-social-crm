package com.navasanganakah.dheetantra.callerid

import android.content.Context
import android.os.Build
import android.telecom.TelecomManager

fun isDefaultDialer(context: Context): Boolean {
    val tm = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager ?: return false
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        context.packageName == tm.defaultDialerPackage
    } else {
        false
    }
}
