package com.calliser.app

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.time.Instant

/** Uploads new calls (and their recordings) from the call log to the server. */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = Prefs(applicationContext)
        val token = prefs.token
        if (!prefs.isSignedIn || token == null) return@withContext Result.success()
        if (!Permissions.hasRequired(applicationContext)) {
            prefs.lastError = "Call log permission is not granted"
            return@withContext Result.success()
        }

        try {
            Api.heartbeat(prefs.serverUrl, token)

            val now = System.currentTimeMillis()
            for (call in CallLogReader.callsAfter(applicationContext, prefs.lastCallDate)) {
                if (isStopped) break
                val recording = RecordingFinder.find(applicationContext, call)

                // The dialer may still be writing the recording; give it a moment
                // before uploading the call without one.
                val endedAgo = now - (call.date + call.durationSec * 1000L)
                if (call.durationSec > 0 && recording == null && endedAgo < RECORDING_GRACE_MS) {
                    SyncScheduler.syncSoon(applicationContext, RECORDING_GRACE_MS / 1000)
                    break
                }

                upload(prefs, token, call, recording)
                prefs.lastCallDate = call.date
                prefs.uploadedCount = prefs.uploadedCount + 1
            }

            prefs.lastSyncAt = System.currentTimeMillis()
            prefs.lastError = null
            Result.success()
        } catch (e: ApiException) {
            when (e.status) {
                401, 403 -> {
                    // Token revoked or account disabled: stop syncing until the
                    // agent signs in again.
                    prefs.signOut(e.message)
                    SyncScheduler.cancelAll(applicationContext)
                    Result.failure()
                }
                else -> {
                    prefs.lastError = e.message
                    Result.retry()
                }
            }
        } catch (e: IOException) {
            prefs.lastError = "Couldn't reach the server: ${e.message ?: "network error"}"
            Result.retry()
        }
    }

    private fun upload(prefs: Prefs, token: String, call: CallEntry, recording: RecordingFile?) {
        val meta = metadata(prefs, call)
        val resolver = applicationContext.contentResolver
        val withinLimit = recording?.takeIf { it.sizeBytes in 1..MAX_UPLOAD_BYTES }
        try {
            Api.ingest(prefs.serverUrl, token, meta, withinLimit, resolver)
        } catch (e: ApiException) {
            when (e.status) {
                // The server rejected the audio file: keep the call, drop the audio.
                413, 415 -> if (withinLimit != null) Api.ingest(prefs.serverUrl, token, meta, null, resolver)
                // Malformed entry (e.g. an odd call-log row): skip it rather than block the queue.
                400 -> Unit
                else -> throw e
            }
        }
    }

    private fun metadata(prefs: Prefs, call: CallEntry): JSONObject {
        val other = call.number.ifBlank { "Private number" }
        val me = prefs.phoneNumber.ifBlank { "This phone" }
        val outbound = call.direction == "OUTBOUND"
        return JSONObject()
            .put("externalId", call.externalId)
            .put("direction", call.direction)
            .put("fromNumber", if (outbound) me else other)
            .put("toNumber", if (outbound) other else me)
            .put("startedAt", Instant.ofEpochMilli(call.date).toString())
            .put("durationSec", call.durationSec)
            .put("consent", true)
            .apply { call.cachedName?.let { put("contactName", it) } }
    }

    companion object {
        private const val RECORDING_GRACE_MS = 90_000L
        private const val MAX_UPLOAD_BYTES = 50L * 1024 * 1024
    }
}
