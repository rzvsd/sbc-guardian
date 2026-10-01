package com.sbcguardian.app

import android.content.Context
import android.content.pm.ApplicationInfo
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.GeckoRuntime
import java.util.UUID

class GeckoRuntimeProvider(context: Context) {
    // GeckoView owns one runtime per process. Keep it process-scoped so an
    // Activity recreation (for example, rotation) does not create a second
    // runtime while the first one is still alive.
    private val debugBuild = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    private val runtimeSettings = GeckoRuntimeSettings.Builder()
        .extensionsWebAPIEnabled(true)
        .remoteDebuggingEnabled(debugBuild)
        .consoleOutput(debugBuild)
        .debugLogging(debugBuild)
        .build()

    val runtime: GeckoRuntime = GeckoRuntime.create(context.applicationContext, runtimeSettings)
    private val sessionNonce: String =
        UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "")

    /** Random per-app-session nonce used to reject stale native-bridge messages. */
    fun newSessionNonce(): String = sessionNonce
}
