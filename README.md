# BON SHOP - onrender.com server

Server Node (không dependency) tự triển khai đầy đủ API mà app **BON_TOOL vD (onrender)** gọi,
đúng format giống `shophuongdev.com`.

## Cách deploy lên onrender.com

1. Tạo repo GitHub chứa 2 file: `server.js` và `package.json` (đã có sẵn trong thư mục này).
2. Vào [onrender.com](https://onrender.com) → **New → Web Service** → chọn repo đó.
3. Cấu hình:
   - **Runtime**: `Node`
   - **Build Command**: để trống (không cần cài dep)
   - **Start Command**: `node server.js`
   - **Instance Type**: Free
4. Deploy. Server sẽ chạy tại `https://bonshop.onrender.com` (hoặc tên bạn đặt).
5. (Tùy chọn) Thêm Env Variables nếu muốn đổi cấu hình:
   - `ADMIN_SECRET` — mật khẩu admin API (mặc định: `35c9ef14-46d1-416e-aa7c-a6df43fcc013`)
   - `BASE_URL` — URL gốc (mặc định `https://bonshop.onrender.com`)
   - `DATA_FILE` — đường dẫn lưu dữ liệu (mặc định `./data.json`; lưu ý Render free không giữ file giữa các lần restart)

> Ghi chú: Render free instance có ổ đĩa tạm — mọi thay đổi dữ liệu (key tạo mới, job, lịch sử)
sẽ mất khi service restart. Để lưu lâu dài, gắn **Persistent Disk** hoặc seed qua Env Variable.

## Các endpoint app gọi

| Endpoint | Mô tả |
|---|---|
| `GET /checkkey/api/key.php?APIKey=` | Kiểm tra key khi kích hoạt (trả `status`/`end_date`/`device_ID`) |
| `GET /checkkey/api/check_date_key.php?APIKey=&device_id_local=` | Kiểm tra + gán thiết bị |
| `GET /checkkey/api/announcement.json` | Thông báo app |
| `GET /checkkey/api/api_golike_fb.php?action=get_jobs\|complete_job\|report_job` | Job Facebook |
| `GET /checkkey/api/api_golike_tiktok.php?action=complete_job` | Job TikTok |
| `POST /checkkey/` | Lịch sử `addHistory` |
| `GET /statistics` | Trang thống kê |
| `GET /Key_Free/?key=` | Trang kiểm tra key |

## Admin API (header `X-BON-SECRET: <ADMIN_SECRET>`)

- `GET /v1/admin/summary`
- `GET /v1/admin/keys` — danh sách key
- `POST /v1/admin/keys/create` — body `{key, hours, price, note}`
- `POST /v1/admin/keys/action` — body `{key, action: enable|disable|reset|delete}`
- `GET /v1/admin/jobs`
- `POST /v1/admin/jobs/create` — body `{platform: fb|tiktok, link, object_id, type, reaction, fix_coin, price, max_uses}`
- `POST /v1/admin/jobs/action` — body `{platform, id, action}`
- `GET /v1/admin/history`

## Seed key mặc định

Server seed sẵn các key đang hoạt động trên worker D1:
`VIP-57FD76456B2342CDB393` (hạn 2026-08-16 12:58), `VIP-40FD7A1557884EF6B0BE`
(backup test vD, thiết bị TESTNOW), `VIP-561318E0620B413DA84A` (hạn 2026-08-16 09:00).

## Test cục bộ

```bash
node server.js
# rồi gọi
curl "http://localhost:3000/checkkey/api/key.php?APIKey=VIP-57FD76456B2342CDB393"
```

## APK tương ứng

`out/BON_TOOL_vD_onrender_final.apk` — đã đổi toàn bộ URL `bonshop.42web.io` → `bonshop.onrender.com`,
ký lại (v1+v2+v3) bằng keystore mới `bon_final.keystore` (pass `bon2026`, alias `BONTOOL`).
