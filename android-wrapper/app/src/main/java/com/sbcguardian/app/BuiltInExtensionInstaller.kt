package com.sbcguardian.app

import org.mozilla.geckoview.WebExtension

class BuiltInExtensionInstaller(
    private val runtimeProvider: GeckoRuntimeProvider,
    private val messageBridge: GeckoMessageBridge
) {

    fun installBuiltInExtension(
        onReady: (WebExtension) -> Unit,
        onError: (Throwable?) -> Unit
    ) {
        runtimeProvider.runtime.webExtensionController
            // The bundled extension is part of the APK and changes with app
            // updates. ensureBuiltIn() only checks whether this ID already
            // exists, so it can keep stale JavaScript forever. Reinstalling a
            // built-in extension refreshes the packaged files on every start.
            .installBuiltIn(EXTENSION_URI)
            .accept(
                { extension ->
                    if (extension == null) {
                        onError(IllegalStateException("Built-in extension installation returned no extension"))
                    } else if (extension.id != EXTENSION_ID) {
                        onError(IllegalStateException("Unexpected built-in extension id"))
                    } else {
                        messageBridge.attach(extension)
                        onReady(extension)
                    }
                },
                onError
            )
    }

    companion object {
        private const val EXTENSION_URI = "resource://android/assets/fsu-extension/"
        private const val EXTENSION_ID = "guardian@sbcguardian.local"
    }
}
