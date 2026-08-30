package com.sbcguardian.app

import org.json.JSONObject
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.WebExtension
import java.time.Instant
import java.util.UUID

class GeckoMessageBridge(private val sessionNonce: String) {

    /** Port back to the FSU WebExtension. Set when the extension connects. */
    private var sendMessage: ((JSONObject) -> Unit)? = null
    private val decidedMessageIds = mutableSetOf<String>()

    /** UI callback for ACTION_PREVIEW. The preview must be shown to the user for
     *  explicit confirmation; it is never auto-forwarded. */
    var onActionPreview: ((Map<String, Any>) -> Unit)? = null

    fun connect(p: WebExtension.Port) {
        sendMessage = { message -> p.postMessage(message) }
        send("HELLO")
    }

    internal fun connectForTest(sender: (JSONObject) -> Unit) {
        sendMessage = sender
    }

    fun syncGuardianSession(session: String) {
        require(session.matches(Regex("^[A-Za-z0-9_-]{32,256}$")))
        send("SESSION_SYNC", JSONObject().put("session", session))
    }

    fun clearGuardianSession() {
        send("SESSION_CLEAR")
    }

    private fun envelope(
        type: String,
        payload: JSONObject = JSONObject(),
        requestId: String? = null
    ) = JSONObject().apply {
            put("protocolVersion", 1)
            put("messageId", UUID.randomUUID().toString())
            put("requestId", requestId ?: JSONObject.NULL)
            put("sessionNonce", sessionNonce)
            put("type", type)
            put("payload", payload)
            put("ts", Instant.now().toString())
        }

    private fun send(type: String, payload: JSONObject = JSONObject()) {
        sendMessage?.invoke(envelope(type, payload))
    }

    /** Validates an envelope against the shared contract (mirror of
     *  shared-contracts/native-bridge/envelope.schema.json). Fail-closed:
     *  unknown protocolVersion, stale sessionNonce, or unknown type -> rejected. */
    fun handle(raw: JSONObject): JSONObject? {
        if (raw.optInt("protocolVersion", -1) != 1) return null
        if (raw.optString("messageId").isBlank()) return null
        if (!raw.has("requestId")) return null
        if (raw.optString("sessionNonce") != sessionNonce) return null
        if (!ALLOWED_TYPES.contains(raw.optString("type"))) return null
        if (runCatching { Instant.parse(raw.optString("ts")) }.isFailure) return null
        if (raw.optJSONObject("payload") == null) return null
        val allowedFields = setOf(
            "protocolVersion", "messageId", "requestId", "sessionNonce", "type", "payload", "ts"
        )
        if (raw.keys().asSequence().any { it !in allowedFields }) return null
        if (raw.optString("type") == "ACTION_PREVIEW") {
            val payload = raw.optJSONObject("payload")
            val preview = payload?.let { json ->
                buildMap<String, Any> {
                    json.keys().forEach { key -> put(key, json.get(key)) }
                    put("messageId", raw.optString("messageId"))
                }
            } ?: emptyMap()
            onActionPreview?.invoke(preview)
        }
        return raw
    }

    /** Forwards an ACTION_DECISION to the extension after explicit user confirm.
     *  There is no hidden auto-submit; only user-confirmed decisions are sent. */
    fun requestDecision(request: ActionPreviewRequest) {
        sendDecision(request, approved = true)
    }

    fun dismissDecision(request: ActionPreviewRequest) {
        sendDecision(request, approved = false)
    }

    private fun sendDecision(request: ActionPreviewRequest, approved: Boolean) {
        if (!decidedMessageIds.add(request.messageId)) return
        val msg = envelope(
            "ACTION_DECISION",
            JSONObject().put("approved", approved),
            requestId = request.messageId
        )
        sendMessage?.invoke(msg)
    }

    /** Registers a message delegate on the extension. Incoming messages are validated
     *  fail-closed; only HELLO/CAPABILITY_STATUS/ACTION_RESULT are auto-acked. ACTION_PREVIEW
     *  is surfaced to the UI for explicit confirmation and is never auto-forwarded. */
    fun attach(extension: WebExtension) {
        extension.setMessageDelegate(
            object : WebExtension.MessageDelegate {
                override fun onConnect(port: WebExtension.Port) {
                    connect(port)
                    port.setDelegate(
                        object : WebExtension.PortDelegate {
                            override fun onPortMessage(message: Any, port: WebExtension.Port) {
                                val json = message as? JSONObject ?: return
                                handle(json)
                            }
                        }
                    )
                }

                override fun onMessage(
                    nativeApp: String,
                    message: Any,
                    sender: WebExtension.MessageSender
                ): GeckoResult<Any>? {
                    val json = message as? JSONObject ?: return null
                    val validated = handle(json) ?: return null
                    return when (validated.optString("type")) {
                        "HELLO", "CAPABILITY_STATUS", "ACTION_RESULT" -> GeckoResult.fromValue(
                            envelope("ACTION_RESULT", JSONObject().put("acknowledged", true), validated.optString("messageId"))
                        )
                        "ACTION_PREVIEW" -> {
                            GeckoResult.fromValue(
                                envelope("ACTION_RESULT", JSONObject().put("acknowledged", true), validated.optString("messageId"))
                            )
                        }
                        else -> null
                    }
                }
            },
            "fsu"
        )
    }

    companion object {
        val ALLOWED_TYPES = setOf(
            "HELLO",
            "GET_APP_SETTINGS",
            "SET_APP_SETTINGS",
            "CAPABILITY_STATUS",
            "ACTION_PREVIEW",
            "ACTION_DECISION",
            "ACTION_RESULT",
            "SESSION_SYNC",
            "SESSION_CLEAR",
            "DIAGNOSTIC"
        )
    }
}
