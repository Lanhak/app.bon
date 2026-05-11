package com.example.mtoolkey

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LauncherActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val store = SecureStore(this)
        val savedKey = store.getKey()
        val deviceId = DeviceIdUtil.getDeviceId(this)

        if (savedKey.isNullOrBlank()) {
            goKey()
            return
        }

        lifecycleScope.launch {
            val ok = withContext(Dispatchers.IO) {
                try {
                    val api = KeyApi()
                    val resp = api.validateKey(deviceId, savedKey)
                    resp.ok && resp.valid
                } catch (_: Throwable) {
                    false
                }
            }

            if (ok) goSigner() else goKey()
        }
    }

    private fun goKey() {
        startActivity(Intent(this, KeyActivity::class.java))
        finish()
    }

    private fun goSigner() {
        startActivity(Intent(this, SignerActivity::class.java))
        finish()
    }
}

