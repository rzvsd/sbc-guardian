package com.sbcguardian.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView

private enum class NativePanel { NONE, ACCOUNT, SETTINGS, HELP, UPDATE }

@Composable
fun WrapperScreen(
    session: GeckoSession,
    uiState: androidx.compose.runtime.State<WrapperUiState>,
    accessStatus: String,
    onUnlinkAccount: () -> Unit,
    modifier: Modifier = Modifier
) {
    var panel by remember { mutableStateOf(NativePanel.NONE) }
    Box(modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context -> GeckoView(context).apply { setSession(session) } }
        )
        when (val state = uiState.value) {
            is WrapperUiState.Loading -> Surface { Text("Loading EA FUT Web App…", Modifier.padding(16.dp)) }
            is WrapperUiState.Error -> Surface { Text("Error: ${state.message}", Modifier.padding(16.dp)) }
            is WrapperUiState.Ready -> Unit
        }
        Row(Modifier.align(Alignment.TopEnd).padding(8.dp)) {
            Button(onClick = { panel = NativePanel.ACCOUNT }) { Text("Account") }
            Button(onClick = { panel = NativePanel.SETTINGS }) { Text("Settings") }
            Button(onClick = { panel = NativePanel.HELP }) { Text("Help") }
            Button(onClick = { panel = NativePanel.UPDATE }) { Text("Update") }
        }
        if (panel != NativePanel.NONE) {
            Surface(Modifier.align(Alignment.Center).padding(24.dp)) {
                Column(Modifier.padding(24.dp)) {
                    when (panel) {
                        NativePanel.ACCOUNT -> {
                            Text("Subscription status")
                            Text(accessStatus)
                            Button(onClick = onUnlinkAccount) { Text("Unlink account") }
                        }
                        NativePanel.SETTINGS -> Text("Product settings are available inside Guardian in the EA Web App.")
                        NativePanel.HELP -> Text("Open an SBC, choose Guardian → SBC, review the proposed players, then Apply. Submit always asks again.")
                        NativePanel.UPDATE -> Text("This beta updates when a new signed APK is installed.")
                        NativePanel.NONE -> Unit
                    }
                    Button(onClick = { panel = NativePanel.NONE }) { Text("Close") }
                }
            }
        }
    }
}
