package com.sbcguardian.app

/** Native message models mirroring shared-contracts/native-bridge/envelope.schema.json. */
data class NativeEnvelope(
    val protocolVersion: Int,
    val messageId: String,
    val requestId: String?,
    val sessionNonce: String,
    val type: String,
    val payload: Map<String, Any>,
    val ts: String
)

data class ActionPreviewRequest(
    val messageId: String,
    val preview: Map<String, Any>
)
