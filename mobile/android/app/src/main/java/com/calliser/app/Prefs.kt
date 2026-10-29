package com.calliser.app

import android.content.Context
import org.json.JSONObject

/** App state, stored privately on the phone (excluded from backups). */
class Prefs(context: Context) {
    private val sp = context.applicationContext.getSharedPreferences("calliser", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString(KEY_SERVER, "") ?: ""
        set(value) = sp.edit().putString(KEY_SERVER, value).apply()

    val token: String? get() = sp.getString(KEY_TOKEN, null)
    val userName: String get() = sp.getString(KEY_USER_NAME, "") ?: ""
    val userEmail: String get() = sp.getString(KEY_USER_EMAIL, "") ?: ""
    val orgName: String get() = sp.getString(KEY_ORG, "") ?: ""
    val phoneNumber: String get() = sp.getString(KEY_PHONE, "") ?: ""

    /** Date (ms) of the newest call already uploaded; only newer calls are synced. */
    var lastCallDate: Long
        get() = sp.getLong(KEY_LAST_CALL, 0L)
        set(value) = sp.edit().putLong(KEY_LAST_CALL, value).apply()

    var lastSyncAt: Long
        get() = sp.getLong(KEY_LAST_SYNC, 0L)
        set(value) = sp.edit().putLong(KEY_LAST_SYNC, value).apply()

    var uploadedCount: Int
        get() = sp.getInt(KEY_UPLOADED, 0)
        set(value) = sp.edit().putInt(KEY_UPLOADED, value).apply()

    var lastError: String?
        get() = sp.getString(KEY_ERROR, null)
        set(value) = sp.edit().putString(KEY_ERROR, value).apply()

    /** Set when the server rejects the token (revoked device or disabled user). */
    var signedOutReason: String?
        get() = sp.getString(KEY_SIGNED_OUT, null)
        set(value) = sp.edit().putString(KEY_SIGNED_OUT, value).apply()

    val isSignedIn: Boolean get() = !token.isNullOrEmpty() && serverUrl.isNotEmpty()

    fun saveSignIn(server: String, response: JSONObject, enteredPhone: String) {
        val user = response.getJSONObject("user")
        val org = response.optJSONObject("org")
        val device = response.optJSONObject("device")
        sp.edit()
            .putString(KEY_SERVER, server)
            .putString(KEY_TOKEN, response.getString("token"))
            .putString(KEY_USER_NAME, user.str("name") ?: "")
            .putString(KEY_USER_EMAIL, user.str("email") ?: "")
            .putString(KEY_ORG, org?.str("name") ?: "")
            .putString(KEY_PHONE, device?.str("phoneNumber") ?: enteredPhone)
            // Only calls made after signing in are uploaded.
            .putLong(KEY_LAST_CALL, System.currentTimeMillis())
            .putLong(KEY_LAST_SYNC, 0L)
            .putInt(KEY_UPLOADED, 0)
            .remove(KEY_ERROR)
            .remove(KEY_SIGNED_OUT)
            .apply()
    }

    /** Forgets the account but keeps the server address and email for next time. */
    fun signOut(reason: String? = null) {
        sp.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_USER_NAME)
            .remove(KEY_ORG)
            .remove(KEY_ERROR)
            .putString(KEY_SIGNED_OUT, reason)
            .apply()
    }

    private companion object {
        const val KEY_SERVER = "server"
        const val KEY_TOKEN = "token"
        const val KEY_USER_NAME = "userName"
        const val KEY_USER_EMAIL = "userEmail"
        const val KEY_ORG = "orgName"
        const val KEY_PHONE = "phoneNumber"
        const val KEY_LAST_CALL = "lastCallDate"
        const val KEY_LAST_SYNC = "lastSyncAt"
        const val KEY_UPLOADED = "uploadedCount"
        const val KEY_ERROR = "lastError"
        const val KEY_SIGNED_OUT = "signedOutReason"
    }
}

/** Like optString, but returns null for missing or JSON-null values. */
fun JSONObject.str(name: String): String? =
    if (!has(name) || isNull(name)) null else optString(name).takeIf { it.isNotEmpty() }
