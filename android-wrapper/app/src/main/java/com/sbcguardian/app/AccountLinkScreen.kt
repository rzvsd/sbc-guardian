package com.sbcguardian.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun AccountLinkScreen(
    code: String,
    busy: Boolean,
    error: String?,
    onCodeChange: (String) -> Unit,
    onLink: () -> Unit
) {
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("Link SBC Guardian")
        Text("Sign in on the Guardian web portal, create a one-time pairing code, then paste it here.")
        OutlinedTextField(
            value = code,
            onValueChange = onCodeChange,
            enabled = !busy,
            label = { Text("Pairing code") },
            singleLine = true
        )
        if (error != null) Text(error)
        Button(onClick = onLink, enabled = !busy && code.isNotBlank()) {
            Text(if (busy) "Linking…" else "Link account")
        }
    }
}
