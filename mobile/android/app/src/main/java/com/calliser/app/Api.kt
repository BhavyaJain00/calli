package com.calliser.app

import android.content.ContentResolver
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** An HTTP error returned by the Calliser server. */
class ApiException(val status: Int, message: String) : IOException(message)

/** An error from the storage service while uploading a recording file. */
class StorageUploadException(val status: Int, message: String) : IOException(message)

/** Minimal client for the Calliser server API (no third-party HTTP library). */
object Api {
    private const val CONNECT_TIMEOUT_MS = 20_000
    private const val READ_TIMEOUT_MS = 120_000

    /** Adds https:// when missing and trims trailing slashes. */
    fun normalizeServer(input: String): String {
        var url = input.trim().trimEnd('/')
        if (url.isNotEmpty() && !url.contains("://")) url = "https://$url"
        return url
    }

    fun register(server: String, body: JSONObject): JSONObject =
        postJson("$server/api/mobile/register", null, body)

    /**
     * Validates the token, marks this phone as online, reports the recording
     * check, and returns how the server wants recordings uploaded.
     */
    fun heartbeat(server: String, token: String, check: RecordingCheck?): JSONObject {
        val conn = open("$server/api/mobile/me", "GET", token)
        if (check != null) {
            check.serverLabel?.let { conn.setRequestProperty("X-Dialer-App", it.take(120)) }
            conn.setRequestProperty("X-Recordings-Visible", check.recordingsFound.toString())
        }
        return readResponse(conn)
    }

    /** Revokes this phone's token on the server (used on sign-out). */
    fun revoke(server: String, token: String) {
        readResponse(open("$server/api/mobile/me", "DELETE", token))
    }

    /** Sends call details (and optionally a `recordingKey` for audio uploaded directly). */
    fun ingestJson(server: String, token: String, meta: JSONObject): JSONObject =
        postJson("$server/api/ingest", token, meta)

    /** Asks the server for a signed URL to upload one recording straight to storage. */
    fun requestUpload(server: String, token: String, mime: String, sizeBytes: Long): JSONObject =
        postJson(
            "$server/api/mobile/upload-url",
            token,
            JSONObject().put("mime", mime).put("sizeBytes", sizeBytes),
        )

    /** Uploads a recording to a signed storage URL with the headers the server provided. */
    fun putFile(uploadUrl: String, headers: JSONObject, recording: RecordingFile, resolver: ContentResolver) {
        val conn = URL(uploadUrl).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "PUT"
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.doOutput = true
            for (key in headers.keys()) conn.setRequestProperty(key, headers.getString(key))
            if (recording.sizeBytes > 0) {
                conn.setFixedLengthStreamingMode(recording.sizeBytes)
            } else {
                conn.setChunkedStreamingMode(64 * 1024)
            }
            val input = resolver.openInputStream(recording.uri)
                ?: throw IOException("The recording file could not be opened")
            input.use { inp -> conn.outputStream.use { out -> inp.copyTo(out, 64 * 1024) } }

            val status = conn.responseCode
            if (status !in 200..299) {
                val body = conn.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                val message = runCatching { JSONObject(body).str("message") ?: JSONObject(body).str("error") }.getOrNull()
                throw StorageUploadException(status, "Recording upload failed ($status)${message?.let { ": $it" } ?: ""}")
            }
        } finally {
            conn.disconnect()
        }
    }

    /** Uploads call details and the recording in one multipart request. */
    fun ingestMultipart(
        server: String,
        token: String,
        meta: JSONObject,
        recording: RecordingFile,
        resolver: ContentResolver,
    ): JSONObject {
        val boundary = "----CalliserBoundary${System.nanoTime()}"
        val conn = open("$server/api/ingest", "POST", token)
        conn.doOutput = true
        conn.setChunkedStreamingMode(64 * 1024)
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")

        BufferedOutputStream(conn.outputStream, 64 * 1024).use { out ->
            fun write(text: String) = out.write(text.toByteArray(Charsets.UTF_8))

            write("--$boundary\r\nContent-Disposition: form-data; name=\"meta\"\r\n\r\n")
            write(meta.toString())
            write("\r\n")

            val input = resolver.openInputStream(recording.uri)
                ?: throw IOException("The recording file could not be opened")
            write("--$boundary\r\n")
            write("Content-Disposition: form-data; name=\"recording\"; filename=\"recording.${recording.extension}\"\r\n")
            write("Content-Type: ${recording.mime}\r\n\r\n")
            input.use { it.copyTo(out, 64 * 1024) }
            write("\r\n--$boundary--\r\n")
        }
        return readResponse(conn)
    }

    private fun postJson(url: String, token: String?, body: JSONObject): JSONObject {
        val conn = open(url, "POST", token)
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        return readResponse(conn)
    }

    private fun open(url: String, method: String, token: String?): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("X-App-Version", BuildConfig.VERSION_NAME)
        if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
        return conn
    }

    private fun readResponse(conn: HttpURLConnection): JSONObject {
        try {
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(text) }.getOrDefault(JSONObject())
            if (status !in 200..299) {
                throw ApiException(status, json.str("error") ?: "Server error ($status)")
            }
            return json
        } finally {
            conn.disconnect()
        }
    }
}
