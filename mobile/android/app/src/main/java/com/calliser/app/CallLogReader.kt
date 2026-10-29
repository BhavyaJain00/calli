package com.calliser.app

import android.content.Context
import android.provider.CallLog

data class CallEntry(
    val id: Long,
    val number: String,
    val type: Int,
    val date: Long,
    val durationSec: Int,
    val cachedName: String?,
) {
    val direction: String
        get() = when (type) {
            CallLog.Calls.OUTGOING_TYPE -> "OUTBOUND"
            CallLog.Calls.MISSED_TYPE,
            CallLog.Calls.REJECTED_TYPE,
            CallLog.Calls.BLOCKED_TYPE -> "MISSED"
            else -> "INBOUND"
        }

    /** Stable id so re-uploading the same call never creates a duplicate. */
    val externalId: String get() = "calllog-$id-$date"
}

object CallLogReader {
    /** Calls newer than [afterMs], oldest first. */
    fun callsAfter(context: Context, afterMs: Long, limit: Int = 200): List<CallEntry> {
        if (!Permissions.granted(context, android.Manifest.permission.READ_CALL_LOG)) return emptyList()

        val projection = arrayOf(
            CallLog.Calls._ID,
            CallLog.Calls.NUMBER,
            CallLog.Calls.TYPE,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
            CallLog.Calls.CACHED_NAME,
        )
        val calls = mutableListOf<CallEntry>()
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            projection,
            "${CallLog.Calls.DATE} > ?",
            arrayOf(afterMs.toString()),
            "${CallLog.Calls.DATE} ASC",
        )?.use { c ->
            val idCol = c.getColumnIndexOrThrow(CallLog.Calls._ID)
            val numberCol = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
            val typeCol = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
            val dateCol = c.getColumnIndexOrThrow(CallLog.Calls.DATE)
            val durationCol = c.getColumnIndexOrThrow(CallLog.Calls.DURATION)
            val nameCol = c.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME)
            while (c.moveToNext() && calls.size < limit) {
                calls += CallEntry(
                    id = c.getLong(idCol),
                    number = c.getString(numberCol).orEmpty(),
                    type = c.getInt(typeCol),
                    date = c.getLong(dateCol),
                    durationSec = c.getInt(durationCol),
                    cachedName = c.getString(nameCol)?.takeIf { it.isNotBlank() },
                )
            }
        }
        return calls
    }
}
