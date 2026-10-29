package com.calliser.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

object Permissions {
    /** Permission for reading recordings made by the phone's dialer. */
    val audio: String
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_AUDIO
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }

    /** Without these, calls can't be synced at all. */
    val required = arrayOf(Manifest.permission.READ_CALL_LOG, Manifest.permission.READ_PHONE_STATE)

    fun granted(context: Context, permission: String): Boolean =
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    fun hasRequired(context: Context): Boolean = required.all { granted(context, it) }

    fun missing(context: Context): Array<String> =
        (required + audio).filterNot { granted(context, it) }.toTypedArray()
}
