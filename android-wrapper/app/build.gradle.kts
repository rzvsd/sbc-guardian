import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.sbcguardian.app"
    compileSdk = 36

    defaultConfig {
        // Beta is the default build; production flavor overrides applicationId.
        applicationId = "com.sbcguardian.app.beta"
        minSdk = 31
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }

    // Beta (sideload) vs production application ids.
    flavorDimensions += "distribution"

    productFlavors {
        create("beta") {
            applicationId = "com.sbcguardian.app.beta"
            dimension = "distribution"
        }
        create("production") {
            applicationId = "com.sbcguardian.app"
            dimension = "distribution"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // GeckoView is pinned to an exact stable release and recorded in
    // third-party-notices/OSS_REGISTER.json (MPL-2.0). Update the version there too.
    implementation("org.mozilla.geckoview:geckoview:153.0.20260810162159")

    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.3")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.compose.ui:ui:1.6.8")
    implementation("androidx.compose.material3:material3:1.2.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}

// ---- Bundle the FSU WebExtension into assets/fsu-extension before packaging ----
val extensionDir = file("../../extension")
val fsuDist = file("$extensionDir/dist")
val fsuAssets = file("src/main/assets/fsu-extension")

val npmPackageGecko = tasks.register<Exec>("npmPackageGecko") {
    group = "fsu"
    description = "Builds the Gecko/Android variant of the FSU extension."
    workingDir = extensionDir
    if (System.getProperty("os.name").startsWith("Windows")) {
        commandLine(
            "${System.getenv("SystemRoot")}\\System32\\cmd.exe",
            "/c",
            "${System.getenv("ProgramFiles")}\\nodejs\\npm.cmd",
            "run",
            "package:gecko"
        )
    } else {
        commandLine("npm", "run", "package:gecko")
    }
}

val bundleFsuExtension = tasks.register("bundleFsuExtension") {
    group = "fsu"
    description = "Unpacks the packaged FSU extension into assets/fsu-extension and verifies it."
    dependsOn(npmPackageGecko)
    doLast {
        fsuAssets.deleteRecursively()
        fsuAssets.mkdirs()
        val zip = fsuDist.listFiles()
            ?.firstOrNull { it.name.contains("-gecko-") && it.name.endsWith(".zip") }
            ?: throw GradleException(
                "FSU gecko package not found in $fsuDist. Run 'npm run package:gecko'."
            )
        copy {
            from(zipTree(zip))
            into(fsuAssets)
        }
        val manifest = File(fsuAssets, "manifest.json")
        if (!manifest.exists()) {
            throw GradleException("FSU extension bundle incomplete: manifest.json missing.")
        }
        val hasRuntime = fsuAssets.walkTopDown().any {
            it.name == "background.js" || it.name == "background-gecko.js"
        }
        if (!hasRuntime) {
            throw GradleException("FSU extension bundle incomplete: no runtime script found.")
        }
    }
}

tasks.named("preBuild") { dependsOn(bundleFsuExtension) }
