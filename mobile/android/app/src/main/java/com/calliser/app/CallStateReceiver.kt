package com.calliser.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager

/** When a call ends (phone returns to idle), sync it shortly afterwards. */
class CallStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
        if (state == TelephonyManager.EXTRA_STATE_IDLE && Prefs(context).isSignedIn) {
            // Short delay so the dialer can finish writing its recording.
            SyncScheduler.syncSoon(context, delaySec = 20)
        }
    }
}
