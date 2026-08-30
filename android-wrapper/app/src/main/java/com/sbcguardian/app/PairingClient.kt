package com.sbcguardian.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class PairingClaim(val session: String, val refreshToken: String)
class GuardianSessionExpired : IllegalStateException("Guardian session expired")

class PairingClient(private val baseUrl: String = "https://sbc-guardian.duckdns.org") {
    suspend fun claim(code: String): PairingClaim = withContext(Dispatchers.IO) {
        require(code.isNotBlank()) { "Pairing code is required" }
        val connection = (URL("$baseUrl/api/v2/pairings/claim").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 12_000
            readTimeout = 12_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        try {
            connection.outputStream.use { output ->
                output.write(JSONObject().put("code", code.trim()).toString().toByteArray())
            }
            if (connection.responseCode !in 200..299) {
                throw IllegalStateException("Pairing failed (${connection.responseCode})")
            }
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            val session = json.optString("session_nonce")
            val refresh = json.optString("refresh_token")
            if (!session.matches(Regex("^[A-Za-z0-9_-]{32,256}$")) || refresh.isBlank()) {
                throw IllegalStateException("Pairing returned an invalid response")
            }
            PairingClaim(session, refresh)
        } finally {
            connection.disconnect()
        }
    }

    suspend fun accountAccess(session: String): String = withContext(Dispatchers.IO) {
        val connection = (URL("$baseUrl/api/v2/auth/me").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 12_000
            readTimeout = 12_000
            setRequestProperty("X-Guardian-Session", session)
        }
        try {
            if (connection.responseCode == 401) throw GuardianSessionExpired()
            if (connection.responseCode !in 200..299) {
                throw IllegalStateException("Account status unavailable (${connection.responseCode})")
            }
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            JSONObject(body).optString("access").ifBlank {
                throw IllegalStateException("Account status response is invalid")
            }
        } finally {
            connection.disconnect()
        }
    }

    suspend fun refresh(refreshToken: String): PairingClaim = withContext(Dispatchers.IO) {
        require(refreshToken.isNotBlank()) { "Refresh token is required" }
        val connection = (URL("$baseUrl/api/v2/device-sessions/refresh").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 12_000
            readTimeout = 12_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Guardian-Refresh", refreshToken)
        }
        try {
            connection.outputStream.use { it.write("{}".toByteArray()) }
            if (connection.responseCode !in 200..299) throw GuardianSessionExpired()
            val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            val session = json.optString("session_nonce")
            val refresh = json.optString("refresh_token")
            if (!session.matches(Regex("^[A-Za-z0-9_-]{32,256}$")) || refresh.isBlank()) {
                throw IllegalStateException("Session refresh returned an invalid response")
            }
            PairingClaim(session, refresh)
        } finally {
            connection.disconnect()
        }
    }
}
