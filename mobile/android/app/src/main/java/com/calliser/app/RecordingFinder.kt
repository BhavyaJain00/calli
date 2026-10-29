package com.calliser.app

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import kotlin.math.abs
import kotlin.math.min

data class RecordingFile(
    val uri: Uri,
    val mime: String,
    val extension: String,
    val sizeBytes: Long,
)

/**
 * Finds the recording that the phone's built-in call recorder made for a call.
 *
 * Android doesn't let third-party apps capture call audio, so Calliser relies
 * on the dialer's own recorder (Samsung, Xiaomi, OnePlus, Oppo, Vivo...). To
 * avoid ever uploading unrelated audio (voice notes, music), a file must be in
 * a call-recording folder or have the caller's number in its name, AND its
 * timestamps must line up with the call.
 */
object RecordingFinder {
    private const val MAX_TIME_GAP_MS = 10 * 60_000L
    private val FOLDER_HINTS = listOf("call", "phonerecord")

    fun find(context: Context, call: CallEntry): RecordingFile? {
        if (call.durationSec <= 0 || !Permissions.granted(context, Permissions.audio)) return null

        val startMs = call.date
        val endMs = call.date + call.durationSec * 1000L
        val fromSec = (startMs - 2 * 60_000) / 1000
        val toSec = (endMs + MAX_TIME_GAP_MS) / 1000

        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        }
        val pathColumn = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Audio.Media.RELATIVE_PATH
        } else {
            @Suppress("DEPRECATION")
            MediaStore.Audio.Media.DATA
        }
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.MIME_TYPE,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.DATE_MODIFIED,
            MediaStore.Audio.Media.DURATION,
            pathColumn,
        )
        val selection = "(${MediaStore.Audio.Media.DATE_ADDED} BETWEEN ? AND ?) OR " +
            "(${MediaStore.Audio.Media.DATE_MODIFIED} BETWEEN ? AND ?)"
        val args = arrayOf(fromSec.toString(), toSec.toString(), fromSec.toString(), toSec.toString())
        val numberDigits = call.number.filter { it.isDigit() }.takeLast(7)

        var best: RecordingFile? = null
        var bestScore = 0
        context.contentResolver.query(collection, projection, selection, args, null)?.use { c ->
            val idCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val nameCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
            val mimeCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)
            val sizeCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
            val addedCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)
            val modifiedCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
            val durationCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val pathCol = c.getColumnIndexOrThrow(pathColumn)

            while (c.moveToNext()) {
                val name = c.getString(nameCol).orEmpty()
                val path = c.getString(pathCol).orEmpty().lowercase()
                val inCallFolder = FOLDER_HINTS.any { path.contains(it) || name.lowercase().contains(it) }
                val hasNumber = numberDigits.length >= 6 && name.filter { it.isDigit() }.contains(numberDigits)
                if (!inCallFolder && !hasNumber) continue

                val addedMs = c.getLong(addedCol) * 1000
                val modifiedMs = c.getLong(modifiedCol) * 1000
                val gap = min(abs(addedMs - startMs), abs(modifiedMs - endMs))
                if (gap > MAX_TIME_GAP_MS) continue

                var score = (if (inCallFolder) 2 else 0) + (if (hasNumber) 4 else 0)
                score += when {
                    gap < 30_000 -> 3
                    gap < 120_000 -> 2
                    else -> 1
                }
                val fileSec = c.getLong(durationCol) / 1000
                if (fileSec > 0) {
                    val diff = abs(fileSec - call.durationSec)
                    when {
                        diff <= 5 -> score += 3
                        diff <= 30 -> score += 1
                        diff > 120 -> continue // clearly a different recording
                    }
                }

                if (score > bestScore) {
                    val ext = name.substringAfterLast('.', "").lowercase().ifEmpty { "m4a" }
                    bestScore = score
                    best = RecordingFile(
                        uri = ContentUris.withAppendedId(collection, c.getLong(idCol)),
                        mime = normalizeMime(c.getString(mimeCol), ext),
                        extension = ext,
                        sizeBytes = c.getLong(sizeCol),
                    )
                }
            }
        }
        return best
    }

    private fun normalizeMime(mime: String?, ext: String): String {
        val clean = mime?.substringBefore(';')?.trim()?.lowercase()
        if (!clean.isNullOrEmpty() && clean.startsWith("audio/")) return clean
        return when (ext) {
            "mp3" -> "audio/mpeg"
            "m4a", "mp4" -> "audio/mp4"
            "aac" -> "audio/aac"
            "wav" -> "audio/wav"
            "ogg", "opus" -> "audio/ogg"
            "amr" -> "audio/amr"
            "3gp", "3gpp" -> "audio/3gpp"
            "webm" -> "audio/webm"
            else -> "audio/mpeg"
        }
    }
}
