// Root project build file. The Android wrapper is greenfield; it reuses only
// proven Gradle/Android versions and never copies old Guardian code or UI.
plugins {
    id("com.android.application") version "8.9.1" apply false
    id("org.jetbrains.kotlin.android") version "2.3.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.21" apply false
}
