# BON SHOP — Node.js Server cho app BON_TOOL

Port đầy đủ bộ PHP `web_BON_TOOL_fixed_v4.zip` sang **1 file `server.js`** thuần Node.js
(không cần cài npm package nào), deploy được lên **Render** tại
**https://bonshop.onrender.com** — đúng domain mà APK đã được sửa để gọi.

## File trong gói

| File | Vai trò |
|---|---|
| `server.js` | Toàn bộ server (API + web shop + admin) |
| `package.json` | Khai báo start script cho Render |
| `render.yaml` | Cấu hình deploy Render (Web Service) |
| `BON_TOOL_onrender.apk` | APK đã sửa domain → `bonshop.onrender.com` (đã ký) |

## Chạy local

```bash
node server.js
# -> http://0.0.0.0:3000
```

Dữ liệu tự tạo file `data.json` (bảng tự tạo khi chạy lần đầu).

## Deploy lên Render (https://bonshop.onrender.com)

Cách 1 — Blueprint (dùng `render.yaml`):
1. Push repo lên GitHub (gồm `server.js`, `package.json`, `render.yaml`).
2. Render → **New → Blueprint**, chọn repo, nhập `SESSION_SECRET` & `API_SECRET` khi được hỏi.

Cách 2 — Web Service thủ công:
1. Render → **New → Web Service**, nối repo hoặc upload.
2. Runtime: **Node**, Build: `npm install`, Start: `node server.js`.
3. Thêm biến môi trường:
   - `BASE_URL=https://bonshop.onrender.com`
   - `SESSION_SECRET=<chuỗi ngẫu nhiên dài>` (bắt buộc đổi)
   - `API_SECRET=<chuỗi bí mật>` (bắt buộc đổi)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `KEYADMIN` (tuỳ chọn, có giá trị mặc định)

## Cấu hình mặc định (giữ nguyên so với config.php cũ)

- Admin login: `akklanh84@gmail.com` / `ttht2007`
- `keyadmin` (addHistory): `huongdev8386`
- `api_secret` (`/api/check-key.php`): `5jaOqjXofEizsYZ8GkHbD5iZmiaNA6RKXuxGuQArRdM`
- Giá key: 24h = 2.000đ · 720h = 50.000đ · 2160h = 120.000đ
- Rút tối thiểu: 10.000đ

## Endpoint app BON_TOOL gọi (đầy đủ)

- `GET /checkkey/api/key.php?APIKey=KEY` — kích hoạt/kiểm tra key VIP
- `GET /checkkey/api/check_date_key.php?APIKey=..&end_date_local=..&device_id_local=..` — kiểm tra định kỳ + gán thiết bị
- `GET /checkkey/api/api_golike_fb.php?action=get_jobs|complete_job|report_job&...` — kho job Facebook
- `GET /checkkey/api/api_golike_tiktok.php?action=complete_job&ads_id=...&APIKey=...` — hoàn thành job TikTok
- `POST /checkkey/` — `{"action":"addHistory","keyadmin":"huongdev8386","device_id":"..","money":N}` cộng xu
- `GET /checkkey/api/announcement.json` — thông báo cập nhật
- `GET /Key_Free/?key=HD_xxx` — trang hiển thị key free
- `GET /statistics` — trang thống kê (WebView trong app)
- `POST /api/check-key.php` (header `X-API-Key`) — API admin
- `GET /BON_TOOL.apk` — tải APK (phát hành bản update)

## Ghi chú quan trọng

- Dữ liệu lưu trong `data.json` **cùng instance**. Render free sẽ mất dữ liệu khi
  redeploy (instance mới). Để lưu bền vững, nâng cấp lên plan có disk hoặc
  thay `CONFIG.dbFile` bằng đường dẫn ổ cứng gắn thêm.
- Luôn **đổi `SESSION_SECRET` và `API_SECRET`** trước khi chạy production.
- Muốn đổi domain gốc (không dùng onrender.com): set `BASE_URL` và rebuild APK lại.
