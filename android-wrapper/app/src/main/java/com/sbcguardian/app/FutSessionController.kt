package com.sbcguardian.app

import androidx.compose.runtime.mutableStateOf
import org.mozilla.geckoview.GeckoSession

class FutSessionController(private val runtimeProvider: GeckoRuntimeProvider) {
    val session = GeckoSession()
    val uiState = mutableStateOf<WrapperUiState>(WrapperUiState.Loading)

    init {
        session.open(runtimeProvider.runtime)
        session.progressDelegate = object : GeckoSession.ProgressDelegate {
            override fun onPageStop(session: GeckoSession, success: Boolean) {
                // The page (EA FUT Web App) finished loading; the GeckoView is visible
                // and the user can authenticate. Ready does not require the extension yet.
                uiState.value = WrapperUiState.Ready
            }
        }
    }

    /** Opens the EA FUT Web App. The user authenticates directly to EA inside this
     *  GeckoSession; cookies and X-UT-SID never leave the GeckoView profile. */
    fun loadEaWebApp() {
        session.loadUri("https://www.ea.com/ea-sports-fc/ultimate-team/web-app/")
    }

    fun onExtensionDetected() {
        uiState.value = WrapperUiState.Ready
    }
}
