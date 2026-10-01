package com.sbcguardian.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView

private enum class NativePanel { NONE, ACCOUNT, SETTINGS, HELP, UPDATE }

@Composable
fun WrapperScreen(
    session: GeckoSession,
    uiState: State<WrapperUiState>,
    accessStatus: String,
    onUnlinkAccount: () -> Unit,
    canGoBack: Boolean,
    modifier: Modifier = Modifier
) {
    var panel by remember { mutableStateOf(NativePanel.NONE) }
    var menuOpen by remember { mutableStateOf(false) }
    var dismissedError by remember { mutableStateOf<String?>(null) }
    BackHandler(enabled = panel != NativePanel.NONE || menuOpen || canGoBack) {
        when {
            panel != NativePanel.NONE -> panel = NativePanel.NONE
            menuOpen -> menuOpen = false
            else -> session.goBack()
        }
    }
    Column(modifier.fillMaxSize().imePadding()) {
        Surface(color = Color(0xFF191920), contentColor = Color.White) {
            Row(Modifier.fillMaxWidth().height(48.dp).padding(start = 16.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Text("SBC Guardian", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                Box {
                    TextButton(onClick = { menuOpen = true }, modifier = Modifier
                        .size(48.dp).semantics { contentDescription = "App menu" }) {
                        Text("⋮", color = Color.White)
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        NativePanel.entries.filter { it != NativePanel.NONE }.forEach { target ->
                            DropdownMenuItem(text = { Text(target.name.lowercase().replaceFirstChar { it.uppercase() }) },
                                onClick = { menuOpen = false; panel = target })
                        }
                    }
                }
            }
        }
        when (val state = uiState.value) {
            WrapperUiState.Loading -> LinearProgressIndicator(Modifier.fillMaxWidth())
            is WrapperUiState.Error -> if (dismissedError != state.message) {
                Surface {
                    Column(Modifier.padding(12.dp)) {
                        Text(state.message)
                        Row {
                            TextButton(onClick = { dismissedError = null; session.reload() }) { Text("Retry") }
                            TextButton(onClick = { dismissedError = state.message }) { Text("Dismiss") }
                        }
                    }
                }
            }
            WrapperUiState.Ready -> Unit
        }
        AndroidView(modifier = Modifier.fillMaxWidth().weight(1f),
            factory = { context -> GeckoView(context).apply { setSession(session) } })
    }
    if (panel != NativePanel.NONE) {
        AlertDialog(
            onDismissRequest = { panel = NativePanel.NONE },
            title = { Text(panel.name.lowercase().replaceFirstChar { it.uppercase() }) },
            text = {
                Column {
                    when (panel) {
                        NativePanel.ACCOUNT -> {
                            Text("Subscription status: $accessStatus")
                            TextButton(onClick = onUnlinkAccount) { Text("Unlink account") }
                        }
                        NativePanel.SETTINGS -> Text("Open EA Settings, then FSU Settings, to configure the available tools.")
                        NativePanel.HELP -> Text("Open an SBC in EA FC and use its squad tools. Return with Back. Guardian cloud solving is not included in this UI repair. Irreversible actions still require confirmation.")
                        NativePanel.UPDATE -> Text("Install a newer signed APK to update this beta. Your existing account link and settings are retained.")
                        NativePanel.NONE -> Unit
                    }
                }
            },
            confirmButton = { TextButton(onClick = { panel = NativePanel.NONE }) { Text("Close") } }
        )
    }
}
