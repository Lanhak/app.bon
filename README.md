# MTool Key App (Android)

App Android mẫu gồm 2 phần:
1) **Kích hoạt bằng key** (trial 24h, 1 key/1 thiết bị) qua API Firebase Functions  
2) Sau khi hợp lệ thì vào màn hình **Signer** (ký lại APK bằng keystore của bạn)

## 1) Cấu hình URL API
Mở file:
`app/src/main/java/com/example/mtoolkey/ApiConfig.kt`

Sửa:
```kotlin
const val BASE_URL = "https://key-server-zfwa.onrender.com"
```
thành base URL backend của bạn (Node.js/Render).

## 2) Chạy app
1. Mở project bằng Android Studio
2. Sync Gradle
3. Run lên máy thật/emulator (Android 8.0+)

## 2b) Build APK không cần Android Studio (GitHub Actions)
Nếu bạn không muốn cài Android Studio, bạn có thể build trên GitHub:
1. Tạo repo mới trên GitHub.
2. Upload toàn bộ source của project này lên repo.
3. Vào tab **Actions** → chọn workflow **Build Android APK** → bấm **Run workflow**.
4. Chờ chạy xong → tải file `app-debug.apk` trong phần **Artifacts**.

## 3) Luồng sử dụng
- Mở app → nếu chưa có key → màn hình Key
- Bấm **“Lấy key trial 24h”** → app gọi API `POST /requestTrial` và copy key
- Bấm **“Xác thực & vào app”** → gọi API `POST /validateKey`
- Hợp lệ → vào màn hình chính (Golike/TDS/TTC + Signer)

## 4) Đăng nhập Golike/TDS/TTC (thủ công)
- Vào màn hình chính → bấm **Cài URL đăng nhập** để dán URL login của Golike/TDS/TTC
- Sau đó bấm Golike/TDS/TTC → app mở WebView để bạn tự đăng nhập

## Lưu ý
- Đây là cơ chế licensing mẫu hợp lệ (server cấp/validate key).  
- Bạn có thể nâng cấp bảo mật bằng Firebase App Check và/hoặc giới hạn rate theo IP.
