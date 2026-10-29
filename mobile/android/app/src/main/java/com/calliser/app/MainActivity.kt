package com.calliser.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.text.format.DateUtils
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.io.IOException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * Single-screen app with three states:
 *   1. Sign in (server address, email, password, recording consent)
 *   2. Grant permissions (call log, phone state, audio files)
 *   3. Status (last sync, uploaded calls, sync now, open dashboard, sign out)
 */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var content: LinearLayout
    private val handler = Handler(Looper.getMainLooper())
    private var prefillServer: String? = null
    private var prefillEmail: String? = null

    // Refreshes the status screen while it's visible (sync runs in the background).
    private val ticker = object : Runnable {
        override fun run() {
            if (prefs.isSignedIn && Permissions.hasRequired(this@MainActivity)) render()
            handler.postDelayed(this, 3_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        readDeepLink(intent)

        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(32))
        }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(BG)
            isFillViewport = true
            addView(content)
        }
        applySystemBarInsets(scroll)
        setContentView(scroll)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readDeepLink(intent)
        render()
    }

    override fun onResume() {
        super.onResume()
        render()
        if (prefs.isSignedIn && Permissions.hasRequired(this)) {
            SyncScheduler.schedulePeriodic(this)
            SyncScheduler.syncSoon(this)
        }
        handler.postDelayed(ticker, 3_000)
    }

    override fun onPause() {
        handler.removeCallbacks(ticker)
        super.onPause()
    }

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        render()
        if (prefs.isSignedIn && Permissions.hasRequired(this)) {
            SyncScheduler.schedulePeriodic(this)
            SyncScheduler.syncSoon(this)
        }
    }

    private fun readDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "calliser" && data.host == "setup") {
            prefillServer = data.getQueryParameter("server")
            prefillEmail = data.getQueryParameter("email")
        }
    }

    private fun render() {
        content.removeAllViews()
        when {
            !prefs.isSignedIn -> renderSignIn()
            !Permissions.hasRequired(this) -> renderPermissions()
            else -> renderStatus()
        }
    }

    // ------------------------------------------------------------ sign in

    private fun renderSignIn() {
        addTitle("Calliser", "Sign in to sync your work calls")

        prefs.signedOutReason?.let { addBanner("You were signed out: $it", isError = true) }

        val server = addInput(
            "Server address",
            "https://calls.yourcompany.com",
            prefillServer ?: prefs.serverUrl.ifEmpty { BuildConfig.DEFAULT_SERVER_URL },
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI,
        )
        val email = addInput(
            "Email",
            "you@company.com",
            prefillEmail ?: prefs.userEmail,
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
        )
        val password = addInput(
            "Password",
            "",
            "",
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
        )
        val phone = addInput(
            "This phone's work number (optional)",
            "+1 202 555 0100",
            prefs.phoneNumber,
            InputType.TYPE_CLASS_PHONE,
        )

        val consent = CheckBox(this).apply {
            text = "I confirm that the people I call are informed that calls may be recorded, " +
                "as required by law and my company's policy. Calls made after I sign in, and " +
                "their recordings, will be uploaded to my company's Calliser."
            setTextColor(TEXT)
            textSize = 14f
            setPadding(dp(4), dp(8), 0, dp(8))
        }
        content.addView(consent, matchWidth(top = 8))

        val error = addText("", 14f, ERROR).apply { visibility = View.GONE }
        val button = addButton("Sign in", primary = true) {}

        button.setOnClickListener {
            val serverUrl = Api.normalizeServer(server.text.toString())
            val emailText = email.text.toString().trim()
            val passwordText = password.text.toString()
            val phoneText = phone.text.toString().trim()

            fun fail(message: String) {
                error.text = message
                error.visibility = View.VISIBLE
            }
            when {
                serverUrl.isEmpty() -> return@setOnClickListener fail("Enter your Calliser server address.")
                !serverUrl.startsWith("https://") ->
                    return@setOnClickListener fail("The server address must start with https://")
                emailText.isEmpty() || passwordText.isEmpty() ->
                    return@setOnClickListener fail("Enter your email and password.")
                !consent.isChecked ->
                    return@setOnClickListener fail("Please confirm the recording notice to continue.")
            }

            error.visibility = View.GONE
            button.isEnabled = false
            button.text = "Signing in…"
            val body = JSONObject()
                .put("email", emailText)
                .put("password", passwordText)
                .put("deviceLabel", deviceLabel())
                .put("platform", "android")
                .put("appVersion", BuildConfig.VERSION_NAME)
                .put("consent", true)
            if (phoneText.isNotEmpty()) body.put("phoneNumber", phoneText)

            Thread {
                val result = runCatching { Api.register(serverUrl, body) }
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    result.onSuccess { response ->
                        prefs.saveSignIn(serverUrl, response, phoneText)
                        prefillServer = null
                        prefillEmail = null
                        render()
                        if (Permissions.hasRequired(this)) {
                            SyncScheduler.schedulePeriodic(this)
                            SyncScheduler.syncSoon(this)
                        }
                    }.onFailure { e ->
                        button.isEnabled = true
                        button.text = "Sign in"
                        fail(friendlyError(e))
                    }
                }
            }.start()
        }
    }

    // -------------------------------------------------------- permissions

    private fun renderPermissions() {
        addTitle("Allow access", "Calliser needs these to sync your work calls")

        addPermissionRow(
            "Call logs",
            "See the calls made and received on this phone.",
            Permissions.granted(this, android.Manifest.permission.READ_CALL_LOG),
        )
        addPermissionRow(
            "Phone",
            "Know when a call ends so it syncs right away.",
            Permissions.granted(this, android.Manifest.permission.READ_PHONE_STATE),
        )
        addPermissionRow(
            "Music and audio",
            "Find the recordings made by your phone's call recorder.",
            Permissions.granted(this, Permissions.audio),
        )

        addButton("Allow access", primary = true) {
            requestPermissions(Permissions.missing(this), REQUEST_PERMISSIONS)
        }
        addButton("Open app settings") { openAppSettings() }
        addText(
            "If Android doesn't show the request, open app settings → Permissions and allow them there.",
            13f,
            MUTED,
        )
    }

    // ------------------------------------------------------------- status

    private fun renderStatus() {
        addTitle("Calliser", "Your calls are syncing to the dashboard")

        val account = card()
        account.addView(text("Signed in as ${prefs.userName}", 16f, TEXT, bold = true))
        account.addView(text(listOf(prefs.userEmail, prefs.orgName).filter { it.isNotBlank() }.joinToString(" · "), 14f, MUTED))
        account.addView(text(prefs.serverUrl, 13f, MUTED))

        val sync = card()
        val lastSync = prefs.lastSyncAt
        sync.addView(
            row(
                "Last sync",
                if (lastSync == 0L) "Not yet"
                else DateUtils.getRelativeTimeSpanString(lastSync, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString(),
            ),
        )
        sync.addView(row("Calls uploaded", prefs.uploadedCount.toString()))
        prefs.lastError?.let { sync.addView(text(it, 13f, ERROR)) }

        if (!Permissions.granted(this, Permissions.audio)) {
            addBanner(
                "Recordings won't be uploaded until you allow access to music and audio files.",
                isError = false,
            )
            addButton("Allow audio access") {
                requestPermissions(arrayOf(Permissions.audio), REQUEST_PERMISSIONS)
            }
        }

        addButton("Sync now", primary = true) {
            SyncScheduler.syncSoon(this)
            prefs.lastError = null
            render()
        }
        addButton("Open dashboard") {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${prefs.serverUrl}/dashboard")))
        }
        addButton("Battery settings") {
            runCatching { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        }

        addText(
            "Turn on automatic call recording in your phone's own Phone app " +
                "(Settings → Call recording) so recordings can be uploaded. " +
                "Set Calliser's battery usage to Unrestricted so syncing isn't paused.",
            13f,
            MUTED,
        )

        addButton("Sign out") {
            AlertDialog.Builder(this)
                .setTitle("Sign out?")
                .setMessage("This phone will stop uploading calls until you sign in again.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Sign out") { _, _ -> signOut() }
                .show()
        }
    }

    private fun signOut() {
        val server = prefs.serverUrl
        val token = prefs.token
        SyncScheduler.cancelAll(this)
        prefs.signOut()
        if (token != null) Thread { runCatching { Api.revoke(server, token) } }.start()
        render()
    }

    // ------------------------------------------------------------ helpers

    private fun friendlyError(e: Throwable): String = when (e) {
        is ApiException -> e.message ?: "Sign-in failed"
        is UnknownHostException -> "Can't find that server. Check the address and your internet connection."
        is SSLException -> "Secure connection to the server failed. Check the server address."
        is IOException -> "Couldn't reach the server: ${e.message ?: "network error"}"
        else -> e.message ?: "Sign-in failed"
    }

    private fun deviceLabel(): String {
        val maker = Build.MANUFACTURER.replaceFirstChar { it.uppercase() }
        val model = Build.MODEL
        return if (model.startsWith(maker, ignoreCase = true)) model else "$maker $model"
    }

    private fun openAppSettings() {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)),
        )
    }

    private fun applySystemBarInsets(view: View) {
        view.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom,
                )
            }
            insets
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun matchWidth(top: Int = 0): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = dp(top) }

    private fun text(value: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setLineSpacing(0f, 1.15f)
    }

    private fun addText(value: String, size: Float, color: Int): TextView =
        text(value, size, color).also { content.addView(it, matchWidth(top = 12)) }

    private fun addTitle(title: String, subtitle: String) {
        val logo = TextView(this).apply {
            text = "C"
            gravity = Gravity.CENTER
            textSize = 22f
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            background = rounded(BRAND, 12)
        }
        content.addView(logo, LinearLayout.LayoutParams(dp(48), dp(48)))
        content.addView(text(title, 24f, TEXT, bold = true), matchWidth(top = 12))
        content.addView(text(subtitle, 15f, MUTED), matchWidth(top = 2))
    }

    private fun addInput(label: String, hint: String, value: String, type: Int): EditText {
        content.addView(text(label, 14f, TEXT, bold = true), matchWidth(top = 16))
        val input = EditText(this).apply {
            this.hint = hint
            setText(value)
            inputType = type
            textSize = 16f
            setSingleLine(true)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = rounded(Color.WHITE, 8, stroke = BORDER)
        }
        content.addView(input, matchWidth(top = 6))
        return input
    }

    private fun addButton(label: String, primary: Boolean = false, onClick: () -> Unit): Button {
        val button = Button(this).apply {
            text = label
            isAllCaps = false
            textSize = 15f
            setTextColor(if (primary) Color.WHITE else TEXT)
            background = if (primary) rounded(BRAND, 8) else rounded(Color.WHITE, 8, stroke = BORDER)
            stateListAnimator = null
            setOnClickListener { onClick() }
        }
        content.addView(button, matchWidth(top = 12).apply { height = dp(48) })
        return button
    }

    private fun addBanner(message: String, isError: Boolean) {
        val banner = text(message, 14f, if (isError) ERROR else WARNING_TEXT).apply {
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = rounded(if (isError) ERROR_BG else WARNING_BG, 8)
        }
        content.addView(banner, matchWidth(top = 16))
    }

    private fun addPermissionRow(name: String, why: String, granted: Boolean) {
        val box = card()
        box.addView(text(if (granted) "✓  $name" else "•  $name", 16f, if (granted) SUCCESS else TEXT, bold = true))
        box.addView(text(why, 14f, MUTED))
    }

    private fun card(): LinearLayout {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = rounded(Color.WHITE, 12, stroke = BORDER)
        }
        content.addView(box, matchWidth(top = 16))
        return box
    }

    private fun row(label: String, value: String) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, dp(4), 0, dp(4))
        addView(text(label, 14f, MUTED), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        addView(text(value, 14f, TEXT, bold = true))
    }

    private fun rounded(color: Int, radiusDp: Int, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radiusDp).toFloat()
        if (stroke != null) setStroke(dp(1), stroke)
    }

    private companion object {
        const val REQUEST_PERMISSIONS = 1
        val BRAND = Color.parseColor("#2563EB")
        val BG = Color.parseColor("#F8FAFC")
        val TEXT = Color.parseColor("#0F172A")
        val MUTED = Color.parseColor("#64748B")
        val BORDER = Color.parseColor("#E2E8F0")
        val SUCCESS = Color.parseColor("#047857")
        val ERROR = Color.parseColor("#B91C1C")
        val ERROR_BG = Color.parseColor("#FEF2F2")
        val WARNING_TEXT = Color.parseColor("#92400E")
        val WARNING_BG = Color.parseColor("#FFFBEB")
    }
}
