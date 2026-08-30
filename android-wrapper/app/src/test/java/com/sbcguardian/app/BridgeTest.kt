package com.sbcguardian.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BridgeTest {
    private val nonce = "n".repeat(24)

    private fun bridge(nonce: String) = GeckoMessageBridge(nonce)

    private fun envelope(nonce: String, type: String, payload: JSONObject? = null): JSONObject {
        return JSONObject().apply {
            put("protocolVersion", 1)
            put("requestId", JSONObject.NULL)
            put("sessionNonce", nonce)
            put("type", type)
            put("messageId", "message-1")
            put("payload", payload ?: JSONObject())
            put("ts", "2026-08-30T12:00:00Z")
        }
    }

    @Test
    fun validHelloIsAccepted() {
        val b = bridge(nonce)
        assertTrue(b.handle(envelope(nonce, "HELLO")) != null)
    }

    @Test
    fun wrongNonceIsRejected() {
        val b = bridge(nonce)
        assertNull(b.handle(envelope("n2", "HELLO")))
    }

    @Test
    fun previewIsDeliveredToUiCallback() {
        val b = bridge(nonce)
        var seen: Map<String, Any>? = null
        b.onActionPreview = { seen = it }
        val payload = JSONObject().put("foo", "bar")
        b.handle(envelope(nonce, "ACTION_PREVIEW", payload))
        assertTrue(seen != null)
        assertEquals("bar", seen?.get("foo"))
        assertEquals("message-1", seen?.get("messageId"))
    }

    @Test
    fun confirmSendsExactlyOneDecision() {
        val b = bridge(nonce)
        val sent = mutableListOf<JSONObject>()
        b.connectForTest { sent.add(it) }
        val req = ActionPreviewRequest("m1", mapOf("x" to "1"))
        b.requestDecision(req)
        assertEquals(1, sent.size)
        assertEquals("ACTION_DECISION", sent[0].optString("type"))
        assertEquals(true, sent[0].getJSONObject("payload").getBoolean("approved"))
        assertEquals("m1", sent[0].optString("requestId"))
    }

    @Test
    fun duplicateConfirmDoesNotSendTwice() {
        val b = bridge(nonce)
        val sent = mutableListOf<JSONObject>()
        b.connectForTest { sent.add(it) }
        val req = ActionPreviewRequest("m1", mapOf("x" to "1"))
        b.requestDecision(req)
        b.requestDecision(req) // duplicate confirm must not re-send
        assertEquals(1, sent.size)
    }

    @Test
    fun noDecisionSendsNothing() {
        val b = bridge(nonce)
        val sent = mutableListOf<JSONObject>()
        b.connectForTest { sent.add(it) }
        // No explicit UI decision means no message and therefore no mutation.
        assertEquals(0, sent.size)
    }

    @Test
    fun dismissSendsExactlyOneNegativeDecision() {
        val b = bridge(nonce)
        val sent = mutableListOf<JSONObject>()
        b.connectForTest { sent.add(it) }
        val req = ActionPreviewRequest("m-dismiss", mapOf("x" to "1"))
        b.dismissDecision(req)
        b.dismissDecision(req)
        assertEquals(1, sent.size)
        assertEquals("ACTION_DECISION", sent.single().optString("type"))
        assertEquals(false, sent.single().getJSONObject("payload").getBoolean("approved"))
    }

    @Test
    fun sessionSyncUsesNonceAndNeverAcceptsMalformedSession() {
        val b = bridge(nonce)
        val sent = mutableListOf<JSONObject>()
        b.connectForTest { sent.add(it) }
        b.syncGuardianSession("a".repeat(32))
        assertEquals("SESSION_SYNC", sent.single().optString("type"))
        assertEquals(nonce, sent.single().optString("sessionNonce"))
        assertEquals("a".repeat(32), sent.single().getJSONObject("payload").optString("session"))
        assertTrue(runCatching { b.syncGuardianSession("bad session") }.isFailure)
    }
}
