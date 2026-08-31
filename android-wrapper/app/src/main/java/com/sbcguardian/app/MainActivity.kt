package com.sbcguardian.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    private lateinit var runtimeProvider: GeckoRuntimeProvider
    private lateinit var sessionController: FutSessionController
    private lateinit var extensionInstaller: BuiltInExtensionInstaller
    private lateinit var messageBridge: GeckoMessageBridge
    private lateinit var sessionStore: GuardianSessionStore
    private val extensionReady = mutableStateOf(false)
    private val extensionError = mutableStateOf<String?>(null)
    private val linked = mutableStateOf(false)
    private val pairingCode = mutableStateOf("")
    private val pairingBusy = mutableStateOf(false)
    private val pairingError = mutableStateOf<String?>(null)
    private val accessStatus = mutableStateOf("Checking…")
    private val pendingPreview = mutableStateOf<ActionPreviewRequest?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        runtimeProvider = GeckoRuntimeProvider(this)
        sessionController = FutSessionController(runtimeProvider)
        messageBridge = GeckoMessageBridge(sessionNonce = runtimeProvider.newSessionNonce())
        extensionInstaller = BuiltInExtensionInstaller(runtimeProvider, messageBridge)
        sessionStore = GuardianSessionStore(this)
        linked.value = sessionStore.session() != null

        // Surface ACTION_PREVIEW to the UI for explicit confirmation.
        messageBridge.onActionPreview = { preview ->
            val req = ActionPreviewRequest(
                messageId = (preview["messageId"] as? String) ?: "unknown",
                preview = preview
            )
            pendingPreview.value = req
        }

        // Install the built-in FSU WebExtension, then open the EA FUT Web App.
        extensionInstaller.installBuiltInExtension(
            onReady = {
                extensionError.value = null
                extensionReady.value = true
                sessionStore.session()?.let { session ->
                    messageBridge.syncGuardianSession(session)
                    sessionController.loadEaWebApp()
                    loadAccountStatus(session)
                }
            },
            onError = { error ->
                extensionError.value = error?.message ?: "Built-in extension installation failed"
                extensionReady.value = true
                sessionController.uiState.value = WrapperUiState.Error(
                    extensionError.value!!
                )
            }
        )
        lifecycleScope.launch {
            // Cold GeckoView startup and built-in extension validation can
            // exceed 15 seconds on a Windows emulator.
            delay(60_000)
            if (!extensionReady.value) {
                extensionError.value = "Built-in extension installation timed out"
                extensionReady.value = true
            }
        }

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val preview = pendingPreview.value
                    when {
                        !extensionReady.value -> Text("Preparing SBC Guardian…")
                        extensionError.value != null -> Text(
                            "SBC Guardian unavailable: ${extensionError.value}"
                        )
                        !linked.value -> AccountLinkScreen(
                            code = pairingCode.value,
                            busy = pairingBusy.value,
                            error = pairingError.value,
                            onCodeChange = { pairingCode.value = it },
                            onLink = { linkAccount() }
                        )
                        else -> WrapperScreen(
                            session = sessionController.session,
                            uiState = sessionController.uiState,
                            accessStatus = accessStatus.value,
                            onUnlinkAccount = { unlinkAccount() }
                        )
                    }
                    if (preview != null) {
                        ActionConfirmationDialog(
                            request = preview,
                            onConfirm = {
                                messageBridge.requestDecision(preview)
                                pendingPreview.value = null
                            },
                            onDismiss = {
                                messageBridge.dismissDecision(preview)
                                pendingPreview.value = null
                            }
                        )
                    }
                }
            }
        }
    }

    private fun linkAccount() {
        if (pairingBusy.value) return
        pairingBusy.value = true
        pairingError.value = null
        lifecycleScope.launch {
            runCatching { PairingClient().claim(pairingCode.value) }
                .onSuccess { claim ->
                    sessionStore.save(claim.session, claim.refreshToken)
                    messageBridge.syncGuardianSession(claim.session)
                    linked.value = true
                    pairingCode.value = ""
                    sessionController.loadEaWebApp()
                    loadAccountStatus(claim.session)
                }
                .onFailure { error ->
                    pairingError.value = error.message ?: "Pairing failed"
                }
            pairingBusy.value = false
        }
    }

    private fun loadAccountStatus(session: String) {
        lifecycleScope.launch {
            val client = PairingClient()
            try {
                accessStatus.value = client.accountAccess(session)
            } catch (_: GuardianSessionExpired) {
                val refreshToken = sessionStore.refreshToken()
                if (refreshToken == null) {
                    unlinkAccount()
                    return@launch
                }
                runCatching { client.refresh(refreshToken) }
                    .onSuccess { claim ->
                        sessionStore.save(claim.session, claim.refreshToken)
                        messageBridge.syncGuardianSession(claim.session)
                        accessStatus.value = client.accountAccess(claim.session)
                    }
                    .onFailure { unlinkAccount() }
            } catch (_: Exception) {
                accessStatus.value = "Unavailable — check your connection"
            }
        }
    }

    private fun unlinkAccount() {
        messageBridge.clearGuardianSession()
        sessionStore.clear()
        linked.value = false
        accessStatus.value = "Not linked"
    }

    override fun onDestroy() {
        // The runtime is process-scoped and must survive Activity recreation;
        // close only this Activity's session before it is replaced.
        sessionController.session.close()
        super.onDestroy()
    }
}
