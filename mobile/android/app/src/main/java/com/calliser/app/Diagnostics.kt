package com.calliser.app

import android.content.Context
import android.telecom.TelecomManager

/** Result of the "Recording check": can Calliser read this phone's call recordings? */
data class RecordingCheck(
    val dialerPackage: String?,
    val dialerName: String?,
    val audioPermission: Boolean,
    val recordingsFound: Int,
    val folder: String?,
) {
    /** Google's Phone app keeps recordings in its private storage. */
    val usesGooglePhone: Boolean get() = dialerPackage == GOOGLE_PHONE

    val displayName: String
        get() = when {
            usesGooglePhone -> "Google Phone"
            dialerName != null -> dialerName
            dialerPackage != null -> dialerPackage
            else -> "Unknown"
        }

    /** Sent to the server so admins see it on the Devices page. */
    val serverLabel: String?
        get() = dialerPackage?.let { "$displayName ($it)" }

    companion object {
        const val GOOGLE_PHONE = "com.google.android.dialer"
    }
}

object Diagnostics {
    private const val WINDOW_MS = 30L * 24 * 60 * 60 * 1000

    fun run(context: Context): RecordingCheck {
        val pkg = runCatching {
            context.getSystemService(TelecomManager::class.java)?.defaultDialerPackage
        }.getOrNull()
        val name = pkg?.let { p ->
            runCatching {
                val pm = context.packageManager
                @Suppress("DEPRECATION")
                pm.getApplicationLabel(pm.getApplicationInfo(p, 0)).toString()
            }.getOrNull()
        }
        val audio = Permissions.granted(context, Permissions.audio)
        val folders = if (audio) {
            RecordingFinder.recentCallRecordingFolders(context, System.currentTimeMillis() - WINDOW_MS)
        } else {
            emptyList()
        }
        return RecordingCheck(pkg, name, audio, folders.size, folders.firstOrNull())
    }
}
