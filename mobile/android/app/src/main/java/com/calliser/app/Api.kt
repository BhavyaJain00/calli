package com.calliser.app

import android.content.ContentResolver
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** An HTTP error returned by the Calliser server. */
class ApiException(val status: Int, message: String) : IOException(message)

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

    fun register(server: String, body: JSONObject): JSONObject {
        val conn = open("$server/api/mobile/register", "POST", token = null)
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        return readResponse(conn)
    }

    /** Validates the token and marks this phone as online on the dashboard. */
    fun heartbeat(server: String, token: String): JSONObject =
        readResponse(open("$server/api/mobile/me", "GET", token))

    /** Revokes this phone's token on the server (used on sign-out). */
    fun revoke(server: String, token: String) {
        readResponse(open("$server/api/mobile/me", "DELETE", token))
    }

    /** Uploads one call, streaming its recording when there is one. */
    fun ingest(
        server: String,
        token: String,
        meta: JSONObject,
        recording: RecordingFile?,
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

            if (recording != null) {
                val input = resolver.openInputStream(recording.uri)
                    ?: throw IOException("The recording file could not be opened")
                write("--$boundary\r\n")
                write("Content-Disposition: form-data; name=\"recording\"; filename=\"recording.${recording.extension}\"\r\n")
                write("Content-Type: ${recording.mime}\r\n\r\n")
                input.use { it.copyTo(out, 64 * 1024) }
                write("\r\n")
            }
            write("--$boundary--\r\n")
        }
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
