package com.sbcguardian.app

import android.content.Context
import org.mozilla.geckoview.GeckoRuntime
import java.util.UUID

class GeckoRuntimeProvider(context: Context) {
    // GeckoView owns one runtime per process. Keep it process-scoped so an
    // Activity recreation (for example, rotation) does not create a second
    // runtime while the first one is still alive.
    val runtime: GeckoRuntime = GeckoRuntime.getDefault(context.applicationContext)
    private val sessionNonce: String =
        UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "")

    /** Random per-app-session nonce used to reject stale native-bridge messages. */
    fun newSessionNonce(): String = sessionNonce
}
