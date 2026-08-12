# BON_SERVER 4.0.0 — Render + PostgreSQL

Server được viết lại từ **web_BON_TOOL.ZIP** và kiểm tra API contract trong **BON_TOOL.apk**.

Mục tiêu của bản này:
- Node.js + Express, chạy trực tiếp trên Render.
- PostgreSQL Render, không còn MySQL/PHP/InfinityFree.
- Server **mở port trước khi chờ database**, nên database timeout không làm Render báo "No open ports".
- Migration tự động, đặc biệt sửa lỗi cũ `column "updated_at" of relation "users" does not exist`.
- Giữ các đường dẫn API mà BON_TOOL đang sử dụng.
- Có giao diện user, admin, mua key, nạp/rút, quản lý key, quản lý job Facebook/TikTok và thống kê.

## 1. Quan trọng: DATABASE_URL

Không đưa password database vào GitHub.

Trong Render:
1. Mở Web Service `bonshop`.
2. Vào **Environment**.
3. Thêm `DATABASE_URL`.
4. Chọn **Internal Database URL** của database `bon-db` nếu Web Service và PostgreSQL ở cùng region/workspace.
5. Database và Web Service nên ở cùng region (trường hợp của bạn là Virginia).

Nếu dùng URL ngoài Render, dùng **External Database URL** từ nút Connect của PostgreSQL.

Bản server này mặc định bật TLS (`PGSSL=true`). Nếu URL/internal connection của bạn không dùng TLS và log báo lỗi TLS, đặt:
`PGSSL=false`

## 2. Environment Variables

Thiết lập:

```text
DATABASE_URL=<Internal Database URL của bon-db>
ADMIN_EMAIL=akklanh84@gmail.com
ADMIN_PASSWORD=<mật khẩu admin của bạn>
SESSION_SECRET=<chuỗi bí mật dài>
KEYADMIN_SECRET=huongdev8386
API_SECRET=<chuỗi bí mật dài>
PUBLIC_URL=https://bonshop.onrender.com
PGSSL=true
```

`PORT` không cần tự đặt; Render tự cung cấp và server dùng `process.env.PORT`, mặc định 10000.

## 3. Deploy GitHub + Render

### GitHub
Giải nén ZIP rồi upload toàn bộ nội dung lên repository.

Không upload:
- `.env` thật
- password PostgreSQL
- secret thật

### Render
Có thể dùng Dockerfile có sẵn:
- Runtime: Docker
- Health Check: `/health`
- Dockerfile: `./Dockerfile`

Dockerfile dùng:
`npm install --omit=dev --no-audit --no-fund`

Không dùng `npm ci`, vì project không bắt buộc package-lock.

## 4. Admin

Sau khi database kết nối thành công, server tự tạo/cập nhật user admin theo:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Đăng nhập:
`https://bonshop.onrender.com/admin`

Nếu đổi mật khẩu trong Render Environment thì deploy/restart lại service.

## 5. API tương thích BON_TOOL

### Key VIP

`GET/POST /checkkey/api/key.php`

Hỗ trợ:
- `APIKey`
- `api_key`
- `key`
- `device_id`

Response thành công có:
- `success: true`
- `status: "success"`
- `key`
- `api_key`
- `expires_at`
- `endDate`
- `end_date`
- `create_date`
- `device_ID`
- `device_id`
- `device_count`
- `device_limit`

### Kiểm tra hạn key

`GET/POST /checkkey/api/check_date_key.php`

Hỗ trợ:
- `APIKey`
- `device_id_local`
- `device_id`

### Add History / cộng xu

`POST /checkkey/`

Body JSON:

```json
{
  "action": "addHistory",
  "name_tool": "GOLIKE",
  "keyadmin": "huongdev8386",
  "device_id": "<device id>",
  "money": 35
}
```

Server kiểm tra thiết bị đã bind với key VIP, kiểm tra hạn key, giới hạn 60 lần/giờ/thiết bị, rồi cộng xu vào user.

### Facebook GoLike

`GET /checkkey/api/api_golike_fb.php`

Actions:
- `get_jobs`
- `complete_job`
- `report_job`

Giữ response dạng:
`{success,data:{id,job_id,link,type,reaction,object_id,price_per_after_cost,fix_coin,coin}}`

### TikTok GoLike

`GET /checkkey/api/api_golike_tiktok.php`

Action:
- `complete_job`

Giữ response:
`success`, `message`, `data.ads_id`, `data.account_id`, `data.fix_coin`.

### API check-key

`POST /api/check-key.php`

Header:
`X-API-Key: <API_SECRET>`

Body:
```json
{
  "key": "VIP-...",
  "device_hash": "<sha256 64 hex>"
}
```

### Announcement

`GET /checkkey/api/announcement.json`

### Health

`GET /health`

Ví dụ:
```json
{
  "ok": true,
  "service": "bon-shop",
  "database": "ready"
}
```

## 6. Database

Các bảng chính:
- users
- vip_keys
- key_devices
- balance_transactions
- wallet_requests
- fb_jobs
- tiktok_jobs
- job_completions
- job_reports
- app_credits

Server tự chạy migration khi khởi động.

Nếu database cũ đã có bảng `users` nhưng thiếu `updated_at`, server dùng:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

Đây chính là lỗi làm bản 3.0.0 trước đó crash.

## 7. Vì sao bản trước bị 502 / timeout

Có hai lỗi riêng:

### Lỗi 1
`column "updated_at" of relation "users" does not exist`

Do schema PostgreSQL cũ không có cột `updated_at`.

Bản này tự bổ sung cột.

### Lỗi 2
`Connection terminated due to connection timeout`

Bản cũ đợi PostgreSQL ngay trong startup rồi mới `listen()`, khiến Render không thấy port 10000 và báo:

`No open ports detected`

Bản này:
1. `listen(0.0.0.0:PORT)` ngay.
2. Render thấy port.
3. Database được kết nối/migrate ở background.
4. Nếu database đang Creating/đang timeout, server vẫn sống.
5. Server retry kết nối nhiều lần.
6. API trả `503 Database chưa sẵn sàng` thay vì làm process chết.

Nếu retry mãi:
- kiểm tra Web Service và Postgres cùng region.
- ưu tiên Internal Database URL.
- kiểm tra DATABASE_URL không bị copy thiếu host/port/database.
- kiểm tra PostgreSQL đã `Available/Running`.

## 8. Kiểm tra bằng Termux

```bash
curl -i https://bonshop.onrender.com/health
curl -i https://bonshop.onrender.com/api
curl -i https://bonshop.onrender.com/statistics
```

Khi database ready:

```bash
curl -s https://bonshop.onrender.com/health
```

phải có:

```json
"database":"ready"
```

## 9. Lưu ý về BON_TOOL.apk

APK bạn gửi đang chứa endpoint cũ `bonshop.42web.io` trong string/resources. Server Render này cung cấp **cùng path/API contract**, nhưng nếu APK vẫn gọi cứng `https://bonshop.42web.io`, nó sẽ không tự chuyển sang Render.

Muốn APK gọi server mới thì APK phải được build/sửa URL base thành:

`https://bonshop.onrender.com`

Các path giữ nguyên:
- `/checkkey/`
- `/checkkey/api/key.php`
- `/checkkey/api/check_date_key.php`
- `/checkkey/api/api_golike_fb.php`
- `/checkkey/api/api_golike_tiktok.php`
- `/checkkey/api/announcement.json`

## 10. Security

Không commit:
- `DATABASE_URL`
- mật khẩu admin
- API secret

Render khuyến nghị dùng Environment Variables/Secrets cho connection strings và API keys.

`KEYADMIN_SECRET` đang giữ giá trị cũ để tương thích với APK hiện tại. Nếu sau này sửa APK, nên đổi secret này.

