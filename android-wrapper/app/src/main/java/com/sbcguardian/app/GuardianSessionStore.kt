package com.sbcguardian.app

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class GuardianSessionStore(context: Context) {
    private val preferences = EncryptedSharedPreferences.create(
        context,
        "guardian_secure_session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun session(): String? = preferences.getString("session", null)
    fun refreshToken(): String? = preferences.getString("refresh", null)

    fun save(session: String, refreshToken: String) {
        preferences.edit().putString("session", session).putString("refresh", refreshToken).apply()
    }

    fun clear() {
        preferences.edit().clear().apply()
    }
}
