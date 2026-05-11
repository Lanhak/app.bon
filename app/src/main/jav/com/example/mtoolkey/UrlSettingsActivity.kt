package com.example.mtoolkey

import android.os.Bundle
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.textfield.TextInputEditText

class UrlSettingsActivity : AppCompatActivity() {

    private lateinit var etGolike: TextInputEditText
    private lateinit var etTds: TextInputEditText
    private lateinit var etTtc: TextInputEditText
    private lateinit var btnSave: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_url_settings)

        etGolike = findViewById(R.id.etGolike)
        etTds = findViewById(R.id.etTds)
        etTtc = findViewById(R.id.etTtc)
        btnSave = findViewById(R.id.btnSave)

        val store = UrlStore(this)
        etGolike.setText(store.get(ServiceType.GOLIKE))
        etTds.setText(store.get(ServiceType.TDS))
        etTtc.setText(store.get(ServiceType.TTC))

        btnSave.setOnClickListener {
            store.setAll(
                golike = etGolike.text?.toString().orEmpty(),
                tds = etTds.text?.toString().orEmpty(),
                ttc = etTtc.text?.toString().orEmpty()
            )
            finish()
        }
    }
}

