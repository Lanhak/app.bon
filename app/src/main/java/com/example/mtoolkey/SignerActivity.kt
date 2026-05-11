package com.example.mtoolkey

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.android.apksig.ApkSigner
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.security.KeyStore
import java.security.PrivateKey
import java.security.cert.X509Certificate

class SignerActivity : AppCompatActivity() {

    private var apkUri: Uri? = null
    private var keystoreUri: Uri? = null
    private var outputUri: Uri? = null

    private lateinit var tvApk: TextView
    private lateinit var tvKeystore: TextView
    private lateinit var tvOutput: TextView
    private lateinit var tvStatus: TextView
    private lateinit var etAlias: TextInputEditText
    private lateinit var etKsPass: TextInputEditText
    private lateinit var etKeyPass: TextInputEditText
    private lateinit var btnSign: Button

    private val pickApk = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            apkUri = uri
            tvApk.text = "APK: $uri"
        }
    }

    private val pickKeystore = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            keystoreUri = uri
            tvKeystore.text = "Keystore: $uri"
        }
    }

    private val createOutput =
        registerForActivityResult(ActivityResultContracts.CreateDocument("application/vnd.android.package-archive")) { uri ->
            if (uri != null) {
                outputUri = uri
                tvOutput.text = "Lưu tại: $uri"
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_signer)

        tvApk = findViewById(R.id.tvApk)
        tvKeystore = findViewById(R.id.tvKeystore)
        tvOutput = findViewById(R.id.tvOutput)
        tvStatus = findViewById(R.id.tvStatus)
        etAlias = findViewById(R.id.etAlias)
        etKsPass = findViewById(R.id.etKsPass)
        etKeyPass = findViewById(R.id.etKeyPass)
        btnSign = findViewById(R.id.btnSign)

        findViewById<Button>(R.id.btnPickApk).setOnClickListener {
            pickApk.launch(arrayOf("application/vnd.android.package-archive", "application/octet-stream", "*/*"))
        }
        findViewById<Button>(R.id.btnPickKeystore).setOnClickListener {
            pickKeystore.launch(arrayOf("*/*"))
        }
        findViewById<Button>(R.id.btnPickOutput).setOnClickListener {
            createOutput.launch("signed.apk")
        }

        findViewById<Button>(R.id.btnClearKey).setOnClickListener {
            SecureStore(this).clear()
            startActivity(Intent(this, KeyActivity::class.java))
            finish()
        }

        btnSign.setOnClickListener { sign() }
    }

    private fun setStatus(msg: String) {
        tvStatus.text = "Trạng thái: $msg"
    }

    private fun sign() {
        val inApk = apkUri
        val ks = keystoreUri
        val out = outputUri
        if (inApk == null) return setStatus("Bạn chưa chọn APK đầu vào")
        if (ks == null) return setStatus("Bạn chưa chọn keystore")
        if (out == null) return setStatus("Bạn chưa chọn nơi lưu file")

        btnSign.isEnabled = false
        setStatus("Đang ký…")

        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val inputApkFile = copyUriToCacheFile(inApk, "input.apk")
                    val ksBytes = contentResolver.openInputStream(ks)!!.use { it.readBytes() }
                    val ksPass = (etKsPass.text?.toString() ?: "").toCharArray()
                    val keyPassRaw = etKeyPass.text?.toString()
                    val keyPass = (if (keyPassRaw.isNullOrBlank()) ksPass else keyPassRaw.toCharArray())

                    val keyStore = loadKeyStoreBestEffort(ksBytes, ksPass)

                    val alias = (etAlias.text?.toString() ?: "").trim().ifEmpty {
                        keyStore.aliases().toList().firstOrNull()
                            ?: throw IllegalStateException("Keystore không có alias nào")
                    }

                    val privateKey = (keyStore.getKey(alias, keyPass) as? PrivateKey)
                        ?: throw IllegalStateException("Không lấy được PrivateKey (sai alias hoặc mật khẩu?)")

                    val chain = keyStore.getCertificateChain(alias)
                        ?.map { it as X509Certificate }
                        ?: listOf(keyStore.getCertificate(alias) as X509Certificate)

                    val outputApkFile = File(cacheDir, "signed.apk")
                    if (outputApkFile.exists()) outputApkFile.delete()

                    val signerConfig = ApkSigner.SignerConfig.Builder(
                        "signer",
                        privateKey,
                        chain
                    ).build()

                    ApkSigner.Builder(listOf(signerConfig))
                        .setInputApk(inputApkFile)
                        .setOutputApk(outputApkFile)
                        .setV1SigningEnabled(true)
                        .setV2SigningEnabled(true)
                        .setV3SigningEnabled(true)
                        .setV4SigningEnabled(false)
                        .build()
                        .sign()

                    // Ghi ra vị trí người dùng đã chọn
                    contentResolver.openOutputStream(out, "w")!!.use { os ->
                        outputApkFile.inputStream().use { ins -> ins.copyTo(os) }
                    }
                }

                setStatus("Hoàn tất. File đã được lưu.")
            } catch (t: Throwable) {
                setStatus("Lỗi: ${t.message ?: t::class.java.simpleName}")
            } finally {
                btnSign.isEnabled = true
            }
        }
    }

    private fun copyUriToCacheFile(uri: Uri, fileName: String): File {
        val outFile = File(cacheDir, fileName)
        if (outFile.exists()) outFile.delete()
        contentResolver.openInputStream(uri)!!.use { input ->
            FileOutputStream(outFile).use { output ->
                input.copyTo(output)
            }
        }
        return outFile
    }

    private fun loadKeyStoreBestEffort(keystoreBytes: ByteArray, password: CharArray): KeyStore {
        val typesToTry = listOf("PKCS12", "JKS", KeyStore.getDefaultType(), "BKS").distinct()
        var lastError: Throwable? = null
        for (type in typesToTry) {
            try {
                val ks = KeyStore.getInstance(type)
                ByteArrayInputStream(keystoreBytes).use { ks.load(it, password) }
                return ks
            } catch (t: Throwable) {
                lastError = t
            }
        }
        throw IllegalStateException("Không đọc được keystore (sai mật khẩu hoặc định dạng).", lastError)
    }
}

