package com.example.mtoolkey

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class KeyApi {
    private val client = OkHttpClient()
    private val json = "application/json; charset=utf-8".toMediaType()

    data class TrialResponse(val ok: Boolean, val key: String?, val expiresAt: Long?, val error: String?)
    data class ValidateResponse(val ok: Boolean, val valid: Boolean, val expiresAt: Long?, val reason: String?, val error: String?)

    fun requestTrial(deviceId: String): TrialResponse {
        val url = ApiConfig.BASE_URL.trimEnd('/') + "/requestTrial"
        val bodyJson = JSONObject().put("deviceId", deviceId).toString()
        val req = Request.Builder()
            .url(url)
            .post(bodyJson.toRequestBody(json))
            .build()

        client.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) return TrialResponse(false, null, null, "HTTP ${resp.code}: $text")
            val obj = JSONObject(text)
            return TrialResponse(
                ok = obj.optBoolean("ok", false),
                key = obj.optString("key", null),
                expiresAt = if (obj.has("expiresAt")) obj.optLong("expiresAt") else null,
                error = obj.optString("error", null)
            )
        }
    }

    fun validateKey(deviceId: String, key: String): ValidateResponse {
        val url = ApiConfig.BASE_URL.trimEnd('/') + "/validateKey"
        val bodyJson = JSONObject()
            .put("deviceId", deviceId)
            .put("key", key)
            .toString()

        val req = Request.Builder()
            .url(url)
            .post(bodyJson.toRequestBody(json))
            .build()

        client.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) return ValidateResponse(false, false, null, null, "HTTP ${resp.code}: $text")
            val obj = JSONObject(text)
            return ValidateResponse(
                ok = obj.optBoolean("ok", false),
                valid = obj.optBoolean("valid", false),
                expiresAt = if (obj.has("expiresAt")) obj.optLong("expiresAt") else null,
                reason = obj.optString("reason", null),
                error = obj.optString("error", null)
            )
        }
    }
}

