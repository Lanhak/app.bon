# BON SERVER — GitHub + Render

Bản chuyển đổi từ `web_BON_TOOL.ZIP` sang Node.js/Express + PostgreSQL để chạy trên Render.

## Đã đối chiếu với BON_TOOL.apk

Các host/path legacy được giữ nguyên dưới `https://bonshop.onrender.com`:

- `GET /checkkey/api/key.php?APIKey=...`
- `GET /checkkey/api/check_date_key.php?...`
- `GET /checkkey/api/api_golike_fb.php?action=get_jobs|complete_job|report_job`
- `GET /checkkey/api/api_golike_tiktok.php?action=complete_job`
- `POST /checkkey/` (`addHistory`)
- `GET /checkkey/api/announcement.json`
- `GET /Key_Free/?key=...`
- `GET /statistics`
- `POST/GET /api/check-key.php`
- `GET /api/`
- `GET /health`

Các response quan trọng giữ các field mà APK dùng như `status`, `msg`, `end_date`, `device_ID`, `create_date`, `success`, `message`, `data`, `job_id`, `object_id`, `fix_coin`, `price_per_after_cost`.

## Database

Render filesystem không nên được dùng làm nơi lưu dữ liệu sản xuất. Server dùng PostgreSQL qua `DATABASE_URL` và chạy `schema.sql` khi khởi động.

## Render

`render.yaml` đã có Web Service + PostgreSQL. Sau khi tạo service, đặt:

- `DATABASE_URL` — Render tự nối từ database trong Blueprint.
- `SESSION_SECRET` — secret.
- `API_SECRET` — secret dùng cho `/api/check-key.php`.
- `KEYADMIN` — giá trị keyadmin mà APK hiện tại gửi khi gọi `/checkkey/`.
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `BANKS_JSON`
- `APP_URL=https://bonshop.onrender.com`
- `WITHDRAW_MIN=10000`

**Không commit credential thật vào GitHub.**

## Local

```bash
npm install
DATABASE_URL=postgresql://... SESSION_SECRET=dev API_SECRET=dev KEYADMIN=... npm start
```

Health:

```text
GET http://localhost:3000/health
```

## APK host

APK cũ có hard-coded host `bonshop.42web.io`. Server mới có thể cung cấp đúng các path, nhưng một APK đã đóng gói URL cũ vẫn sẽ gọi host cũ. Muốn APK gọi Render phải đổi base URL trong APK và build lại, hoặc dùng cơ chế chuyển hướng DNS/domain phù hợp.

## Lưu ý về bảo mật

Không đưa password database, API secret, admin password hoặc private key vào repository. Giá trị legacy có trong source PHP được coi là đã lộ và nên được thay mới trên Render.
