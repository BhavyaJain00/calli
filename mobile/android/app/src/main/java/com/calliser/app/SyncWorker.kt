package com.calliser.app

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.time.Instant

/**
 * Uploads new calls from the call log, then their recordings.
 *
 * Each call is sent in two steps: first its details (so it shows on the
 * dashboard right away), then its recording. Recordings go straight to cloud
 * storage when the server supports it, which avoids the hosting provider's
 * request-size limit; otherwise they're sent to the server in one request.
 */
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
            val check = runCatching { Diagnostics.run(applicationContext) }.getOrNull()
            val upload = Api.heartbeat(prefs.serverUrl, token, check).optJSONObject("upload")
            val direct = upload?.str("mode") == "direct"
            val maxBytes = upload?.optLong("maxBytes", DEFAULT_MAX_BYTES) ?: DEFAULT_MAX_BYTES

            val now = System.currentTimeMillis()
            val calls = CallLogReader.callsAfter(applicationContext, prefs.lastCallDate, BATCH_SIZE)
            var waitingForRecording = false
            for (call in calls) {
                if (isStopped) break
                val recording = RecordingFinder.find(applicationContext, call)

                // The dialer may still be writing the recording; give it a moment
                // before sending the call without one.
                val endedAgo = now - (call.date + call.durationSec * 1000L)
                if (call.durationSec > 0 && recording == null && endedAgo < RECORDING_GRACE_MS) {
                    SyncScheduler.syncSoon(applicationContext, RECORDING_GRACE_MS / 1000)
                    waitingForRecording = true
                    break
                }

                syncCall(prefs, token, call, recording, direct, maxBytes)
                prefs.lastCallDate = call.date
                prefs.uploadedCount = prefs.uploadedCount + 1
            }
            // A full batch means older calls are still waiting (e.g. "Upload earlier calls").
            if (!waitingForRecording && calls.size == BATCH_SIZE) SyncScheduler.syncSoon(applicationContext)

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
            prefs.lastError = e.message ?: "Network error"
            Result.retry()
        }
    }

    private fun syncCall(
        prefs: Prefs,
        token: String,
        call: CallEntry,
        recording: RecordingFile?,
        direct: Boolean,
        maxBytes: Long,
    ) {
        val server = prefs.serverUrl
        val resolver = applicationContext.contentResolver
        val meta = metadata(prefs, call)

        // 1) Call details.
        val saved = try {
            Api.ingestJson(server, token, meta)
        } catch (e: ApiException) {
            if (e.status == 400) return // malformed call-log row: skip it rather than block the queue
            throw e
        }

        // 2) Recording, unless the server already has it.
        if (recording == null || saved.optBoolean("hasRecording")) return
        if (recording.sizeBytes > maxBytes) return // too large for this server; details are saved

        try {
            if (direct) {
                val target = Api.requestUpload(server, token, recording.mime, recording.sizeBytes)
                Api.putFile(target.getString("uploadUrl"), target.getJSONObject("headers"), recording, resolver)
                Api.ingestJson(
                    server,
                    token,
                    JSONObject(meta.toString())
                        .put("recordingKey", target.getString("key"))
                        .put("recordingMime", recording.mime),
                )
            } else {
                Api.ingestMultipart(server, token, meta, recording, resolver)
            }
        } catch (e: ApiException) {
            when (e.status) {
                // Server switched away from direct uploads since the heartbeat.
                409 -> Api.ingestMultipart(server, token, meta, recording, resolver)
                // The server can't accept this audio file; the call details are saved.
                413, 415 -> Unit
                else -> throw e
            }
        } catch (e: StorageUploadException) {
            if (e.status != 413) throw e // retry later; 413 = file too large for the bucket
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
        private const val DEFAULT_MAX_BYTES = 50L * 1024 * 1024
        private const val BATCH_SIZE = 100
    }
}
