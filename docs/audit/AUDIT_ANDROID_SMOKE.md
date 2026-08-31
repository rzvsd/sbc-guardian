# Android smoke result

The beta APK builds and installs on the local `Medium_Phone` emulator. A launch smoke exposed a stuck loading
state when built-in WebExtension installation failed: `extensionReady` stayed false and the UI showed only
“Preparing SBC Guardian…”. `MainActivity` now surfaces the installer error and exits the loading state, so the
failure is visible and recoverable instead of appearing as an infinite hang.
