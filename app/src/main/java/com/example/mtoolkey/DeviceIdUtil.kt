package com.example.mtoolkey

import android.content.Context
import android.provider.Settings

object DeviceIdUtil {
    fun getDeviceId(context: Context): String {
        // ANDROID_ID ổn cho ràng buộc "1 key = 1 thiết bị" (không tuyệt đối chống giả mạo, nhưng đủ cho bản mẫu).
        return Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
    }
}

