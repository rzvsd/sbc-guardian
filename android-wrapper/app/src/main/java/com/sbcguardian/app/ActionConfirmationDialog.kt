package com.sbcguardian.app

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable

/** Shown before any irreversible EA mutation. Confirmation is always explicit. */
@Composable
fun ActionConfirmationDialog(
    request: ActionPreviewRequest,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = onConfirm) { Text("Confirm") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
        title = { Text("Confirm ${request.preview["kind"] ?: "action"}") },
        text = {
            Text(
                listOfNotNull(
                    request.preview["summary"]?.toString(),
                    request.preview["costRisk"]?.toString(),
                    "This may be irreversible."
                ).joinToString("\n")
            )
        }
    )
}
