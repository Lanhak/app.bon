# BON SERVER 5.0.0

Server Node.js + PostgreSQL cho BON_TOOL, chạy GitHub + Render.

## 1. Render Environment

Bắt buộc:

- `DATABASE_URL` = **Internal Database URL** của Postgres `bon-db` trên Render.
- `ADMIN_EMAIL` = email admin.
- `ADMIN_PASSWORD` = mật khẩu admin.
- `SESSION_SECRET` = chuỗi bí mật dài, ví dụ chuỗi 64 hex.

Khuyến nghị:

- `PGSSL=true`
- `PUBLIC_URL=https://bonshop.onrender.com`
- `KEYADMIN_SECRET=huongdev8386`
- `API_SECRET` = secret riêng cho `/api/check-key.php`.

Không commit `.env` hoặc password PostgreSQL vào GitHub.

## 2. Database

Server mở HTTP trước rồi mới kết nối PostgreSQL. Nếu Postgres khởi động chậm, server không chết; nó retry và `/health` báo `starting` cho tới khi DB sẵn sàng.

Khi thành công:

```json
{"ok":true,"service":"bon-shop","database":"ready"}
```

Migration dùng `ADD COLUMN IF NOT EXISTS`, bao gồm `users.updated_at` để tương thích DB của BON_SERVER cũ.

## 3. API contract BON_TOOL

Các endpoint giữ nguyên path mà APK hiện tại gọi:

- `GET /checkkey/api/key.php?APIKey=KEY`
- `GET /checkkey/api/check_date_key.php?APIKey=KEY&end_date_local=...&number_phone_local=...&device_id_local=...`
- `GET /checkkey/api/api_golike_fb.php?action=get_jobs&platform=facebook&auth_token=...&APIKey=KEY&fb_id=...&server=sv2&high_job=1&device_id_local=...`
- `GET /checkkey/api/api_golike_fb.php?action=complete_job&platform=facebook&auth_token=...&APIKey=KEY&object_id=...&job_id=...&type=...&uid=...&users_fb_account_id=...&users_advertising_id=...&reaction=...&device_id_local=...`
- `GET /checkkey/api/api_golike_fb.php?action=report_job&platform=facebook&auth_token=...&APIKey=KEY&job_id=...&uid=...&users_advertising_id=...&description=...&device_id_local=...`
- `GET /checkkey/api/api_golike_tiktok.php?action=complete_job&auth_token=...&ads_id=...&account_id=...&APIKey=KEY&async=true&device_id_local=...`
- `POST /checkkey/` với `action=addHistory`
- `GET /checkkey/api/announcement.json`
- `GET /Key_Free/?key=...`
- `GET /statistics`
- `POST /api/check-key.php` với `X-API-Key`.

### Key VIP flow

1. `key.php` xác thực key.
2. `check_date_key.php` bind `device_id_local` vào `key_devices` và kiểm tra `device_limit`.
3. Facebook/TikTok API tự kiểm tra key + bind device.
4. `POST /checkkey/` cộng xu cho **user được gán vào key**.

**Quan trọng:** Key tạo trong Admin nếu để `Không gán user` vẫn có thể xác thực VIP và chạy phần API job, nhưng `addHistory` không thể biết tài khoản nào nhận xu. Muốn dùng đầy đủ cộng xu, hãy gán key cho user khi tạo key.

## 4. Admin

Mở `/admin`.

Admin tự được tạo/cập nhật từ `ADMIN_EMAIL` + `ADMIN_PASSWORD` khi DB migration hoàn tất.

Admin có:

- Users / số dư
- Tạo, khóa, mở, reset thiết bị, xóa Key VIP
- Gán Key VIP cho user ngay khi tạo
- Nạp/rút và duyệt yêu cầu
- Job Facebook
- Job TikTok
- Thống kê thiết bị và xu

## 5. Kiểm tra sau deploy

```text
https://bonshop.onrender.com/health
https://bonshop.onrender.com/api
https://bonshop.onrender.com/statistics
https://bonshop.onrender.com/admin
```

Không đưa connection string PostgreSQL có password vào source code.
