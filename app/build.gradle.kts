plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.example.mtoolkey"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.mtoolkey"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")

    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.3")
    implementation("androidx.documentfile:documentfile:1.0.1")

    // Lưu key an toàn
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Gọi API
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Ký APK (AOSP apksig)
    implementation("com.android.tools.build:apksig:8.2.2")
}

