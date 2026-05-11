package com.example.mtoolkey

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class KeyActivity : AppCompatActivity() {

    private lateinit var tvDevice: TextView
    private lateinit var etKey: TextInputEditText
    private lateinit var tvStatus: TextView
    private lateinit var btnGetTrial: Button
    private lateinit var btnValidate: Button

    private val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_key)

        tvDevice = findViewById(R.id.tvDevice)
        etKey = findViewById(R.id.etKey)
        tvStatus = findViewById(R.id.tvStatus)
        btnGetTrial = findViewById(R.id.btnGetTrial)
        btnValidate = findViewById(R.id.btnValidate)

        val deviceId = DeviceIdUtil.getDeviceId(this)
        tvDevice.text = "DeviceId: $deviceId"

        btnGetTrial.setOnClickListener { requestTrial(deviceId) }
        btnValidate.setOnClickListener { validate(deviceId) }
    }

    private fun setStatus(msg: String) {
        tvStatus.text = "Trạng thái: $msg"
    }

    private fun requestTrial(deviceId: String) {
        btnGetTrial.isEnabled = false
        btnValidate.isEnabled = false
        setStatus("Đang xin key trial…")

        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                try {
                    KeyApi().requestTrial(deviceId)
                } catch (t: Throwable) {
                    KeyApi.TrialResponse(false, null, null, t.message)
                }
            }

            if (result.ok && !result.key.isNullOrBlank()) {
                etKey.setText(result.key)
                copyToClipboard(result.key!!)
                val exp = result.expiresAt?.let { fmt.format(Date(it)) } ?: "?"
                setStatus("Đã có key (đã copy). Hết hạn: $exp")
            } else {
                setStatus("Không lấy được key: ${result.error ?: "unknown"}")
            }

            btnGetTrial.isEnabled = true
            btnValidate.isEnabled = true
        }
    }

    private fun validate(deviceId: String) {
        val key = etKey.text?.toString()?.trim().orEmpty()
        if (key.length < 10) return setStatus("Key không hợp lệ")

        btnGetTrial.isEnabled = false
        btnValidate.isEnabled = false
        setStatus("Đang xác thực…")

        lifecycleScope.launch {
            val resp = withContext(Dispatchers.IO) {
                try {
                    KeyApi().validateKey(deviceId, key)
                } catch (t: Throwable) {
                    KeyApi.ValidateResponse(false, false, null, null, t.message)
                }
            }

            if (resp.ok && resp.valid) {
                SecureStore(this@KeyActivity).saveKey(key)
                val exp = resp.expiresAt?.let { fmt.format(Date(it)) } ?: "?"
                setStatus("Hợp lệ. Hết hạn: $exp")
                startActivity(Intent(this@KeyActivity, MainActivity::class.java))
                finish()
                return@launch
            }

            setStatus("Sai/hết hạn. Lý do: ${resp.reason ?: resp.error ?: "unknown"}")
            btnGetTrial.isEnabled = true
            btnValidate.isEnabled = true
        }
    }

    private fun copyToClipboard(text: String) {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("key", text))
    }
}
