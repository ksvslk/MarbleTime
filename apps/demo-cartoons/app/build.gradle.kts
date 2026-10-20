import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.marbletime.cartoons"
    compileSdk = 36
    defaultConfig {
        applicationId = "app.marbletime.cartoons"
        minSdk = 25
        targetSdk = 30 // Fire OS 8 = Android 11 / API 30
        versionCode = 1
        versionName = "0.1"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug") // a test app, sideloaded only
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    // ExoPlayer, for its choice of decoder: a software one draws frames that the stick's screen recordings can see.
    implementation("androidx.media3:media3-exoplayer:1.4.1")
}
