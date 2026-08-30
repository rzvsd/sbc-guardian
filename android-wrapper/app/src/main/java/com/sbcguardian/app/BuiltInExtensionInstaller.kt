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
            .ensureBuiltIn(EXTENSION_URI, EXTENSION_ID)
            .accept(
                { extension ->
                    if (extension == null) {
                        onError(IllegalStateException("Built-in extension installation returned no extension"))
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
