package com.example.mtoolkey

import android.content.Context

enum class ServiceType(val id: String, val label: String) {
    GOLIKE("golike", "Golike"),
    TDS("tds", "TDS"),
    TTC("ttc", "TTC")
}

class UrlStore(context: Context) {
    private val prefs = context.getSharedPreferences("url_prefs", Context.MODE_PRIVATE)

    companion object {
        // URL mặc định theo bạn cung cấp
        private const val DEFAULT_GOLIKE = "https://app.golike.net/login"
        private const val DEFAULT_TDS = "https://traodoisub.com/"
        private const val DEFAULT_TTC = "https://tuongtaccheo.com/index.php"
    }

    fun get(service: ServiceType): String {
        val saved = prefs.getString("login_url_${service.id}", "")?.trim().orEmpty()
        if (saved.isNotBlank()) return saved

        return when (service) {
            ServiceType.GOLIKE -> DEFAULT_GOLIKE
            ServiceType.TDS -> DEFAULT_TDS
            ServiceType.TTC -> DEFAULT_TTC
        }
    }

    fun set(service: ServiceType, url: String) {
        prefs.edit().putString("login_url_${service.id}", url.trim()).apply()
    }

    fun setAll(golike: String, tds: String, ttc: String) {
        prefs.edit()
            .putString("login_url_${ServiceType.GOLIKE.id}", golike.trim())
            .putString("login_url_${ServiceType.TDS.id}", tds.trim())
            .putString("login_url_${ServiceType.TTC.id}", ttc.trim())
            .apply()
    }

    /**
     * Ghi URL mặc định vào prefs nếu chưa có (để màn hình Settings hiển thị sẵn).
     */
    fun ensureDefaults() {
        val e = prefs.edit()
        if (prefs.getString("login_url_${ServiceType.GOLIKE.id}", "")?.isBlank() != false) {
            e.putString("login_url_${ServiceType.GOLIKE.id}", DEFAULT_GOLIKE)
        }
        if (prefs.getString("login_url_${ServiceType.TDS.id}", "")?.isBlank() != false) {
            e.putString("login_url_${ServiceType.TDS.id}", DEFAULT_TDS)
        }
        if (prefs.getString("login_url_${ServiceType.TTC.id}", "")?.isBlank() != false) {
            e.putString("login_url_${ServiceType.TTC.id}", DEFAULT_TTC)
        }
        e.apply()
    }
}
