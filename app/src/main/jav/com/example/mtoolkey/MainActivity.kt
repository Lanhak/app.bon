package com.example.mtoolkey

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var tvInfo: TextView
    private lateinit var btnGolike: Button
    private lateinit var btnTds: Button
    private lateinit var btnTtc: Button
    private lateinit var btnSettings: Button
    private lateinit var btnSigner: Button
    private lateinit var btnLogoutKey: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tvInfo = findViewById(R.id.tvInfo)
        btnGolike = findViewById(R.id.btnGolike)
        btnTds = findViewById(R.id.btnTds)
        btnTtc = findViewById(R.id.btnTtc)
        btnSettings = findViewById(R.id.btnSettings)
        btnSigner = findViewById(R.id.btnSigner)
        btnLogoutKey = findViewById(R.id.btnLogoutKey)

        val deviceId = DeviceIdUtil.getDeviceId(this)
        tvInfo.text = "Đã kích hoạt. DeviceId: $deviceId"

        // Ghi URL mặc định vào Settings nếu chưa có
        UrlStore(this).ensureDefaults()

        btnGolike.setOnClickListener { openService(ServiceType.GOLIKE) }
        btnTds.setOnClickListener { openService(ServiceType.TDS) }
        btnTtc.setOnClickListener { openService(ServiceType.TTC) }

        btnSettings.setOnClickListener {
            startActivity(Intent(this, UrlSettingsActivity::class.java))
        }

        btnSigner.setOnClickListener {
            startActivity(Intent(this, SignerActivity::class.java))
        }

        btnLogoutKey.setOnClickListener {
            SecureStore(this).clear()
            startActivity(Intent(this, KeyActivity::class.java))
            finish()
        }
    }

    private fun openService(service: ServiceType) {
        val store = UrlStore(this)
        val url = store.get(service)
        if (url.isBlank()) {
            // Chưa cấu hình URL → chuyển sang màn hình cài đặt
            startActivity(Intent(this, UrlSettingsActivity::class.java))
            return
        }

        val it = Intent(this, WebLoginActivity::class.java)
        it.putExtra(WebLoginActivity.EXTRA_TITLE, service.label)
        it.putExtra(WebLoginActivity.EXTRA_URL, url)
        startActivity(it)
    }
}
