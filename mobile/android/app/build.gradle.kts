import java.util.Properties

plugins {
    id("com.android.application")
}

// Release signing key. Created by `npm run android:build` on first run and kept
// out of version control. Back it up: updates must be signed with the same key.
val keystoreProps = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun prop(name: String, fallback: String) =
    (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() } ?: fallback

android {
    namespace = "com.calliser.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.calliser.app"
        minSdk = 26
        targetSdk = 36
        versionCode = prop("calliser.versionCode", "1").toInt()
        versionName = prop("calliser.versionName", "1.0.0")
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"${prop("calliser.serverUrl", "")}\"")
    }

    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.work:work-runtime-ktx:2.12.0")
}
