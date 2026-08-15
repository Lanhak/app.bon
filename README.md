# BON SHOP - onrender.com server

Server Node (không dependency) tự triển khai đầy đủ API mà app **BON_TOOL vD (onrender)** gọi,
đúng format giống `shophuongdev.com`, kèm **giao diện web đầy đủ cho User và Admin** giống bản PHP cũ
(`BON_SHOP_FULL_WEB_APP_COMPATIBLE_FIXED`): đăng nhập/đăng ký, nạp/rút tiền, mua Key VIP,
quản trị key/user/job/wallet.

## Cách deploy lên onrender.com

1. Tạo repo GitHub chứa `server.js`, `package.json` (đã có sẵn trong thư mục này).
2. Vào [onrender.com](https://onrender.com) → **New → Web Service** → chọn repo đó.
3. Cấu hình:
   - **Runtime**: `Node`
   - **Build Command**: để trống (không cần cài dep)
   - **Start Command**: `node server.js`
   - **Instance Type**: Free
4. Deploy. Server sẽ chạy tại `https://bonshop.onrender.com` (hoặc tên bạn đặt).
5. (Tùy chọn) Env Variables:
   - `ADMIN_SECRET` — mật khẩu admin API (mặc định: `35c9ef14-46d1-416e-aa7c-a6df43fcc013`)
   - `BASE_URL` — URL gốc (mặc định `https://bonshop.onrender.com`)
   - `DATA_FILE` — đường dẫn lưu dữ liệu (mặc định `./data.json`)

> ⚠️ Render free instance có ổ đĩa tạm — dữ liệu (user/key/job/wallet) sẽ **mất khi restart**.
> Để lưu lâu dài, gắn **Persistent Disk** và trỏ `DATA_FILE` vào đó, hoặc tự sao chép `data.json`.

## Giao diện web (như bản PHP cũ)

### Người dùng (`/`)
- Đăng nhập bằng **username hoặc Gmail/Email**, đăng ký tài khoản mới.
- Side menu: Trang chủ, **Nạp tiền**, **Rút tiền**, **Mua Key**, Dịch vụ MXH, Kiếm tiền, Dịch vụ khác.
- Nạp tiền: hiển thị STK ngân hàng (Sacombank `050088931308`, VietinBank `101886569909` — chủ DIEU LANH),
  gửi yêu cầu nạp → chờ admin duyệt.
- Rút tiền: tối thiểu `10.000đ`, tiền giữ lại khi gửi yêu cầu, hoàn lại nếu admin từ chối.
- Mua Key: các gói `24h = 2.000đ`, `720h (30 ngày) = 50.000đ`, `2160h (90 ngày) = 120.000đ` — trừ số dư tự động.
- Xem lịch sử nạp/rút + danh sách Key của mình.

### Admin (`/admin` hoặc bấm "Đăng nhập quản trị viên" ở trang đăng nhập)
- Đăng nhập: `akklanh84@gmail.com` / `ttht2007`.
- Dashboard: thống kê Users / VIP Keys / Thiết bị / Yêu cầu ví.
- Tab **Users**: cộng / trừ số dư từng user.
- Tab **VIP Keys**: tạo key mới (chọn user / số giờ / giá / ghi chú), gia hạn giờ, Khóa / Mở / Reset thiết bị / Xóa.
- Tab **Devices**: danh sách thiết bị đã kích hoạt key (hash rút gọn, first/last seen).
- Tab **Nạp/Rút**: Duyệt / Từ chối yêu cầu (duyệt nạp → cộng số dư; từ chối rút → hoàn tiền).
- Tab **Giao dịch**: lịch sử số dư (amount, balance after, type, mô tả).
- Tab **Nhiệm vụ**: thêm / khóa / mở / xóa job Facebook (link, object_id, type, reaction, giá, max_uses)
  và job TikTok (video_url, ads_id, account_id, giá, max_uses); xem nhiệm vụ đã hoàn thành + báo cáo lỗi job.

### Trang công khai
- `/statistics` — thống kê công khai (users, key hoạt động, thiết bị, tổng xu chi trả, fb/tt done, hoạt động gần đây).
- `/Key_Free/?key=` — kiểm tra key (app mở trong WebView).

## Tài khoản seed mặc định

| Role | Username | Email | Mật khẩu | Số dư |
|---|---|---|---|---|
| Admin | akklanh84 | akklanh84@gmail.com | `ttht2007` | 0 |
| User | lanhak | trangak2k71@gmail.com | `bon2026` | 94.000 |
| User | testuser01 | testuser01@gmail.com | `bon2026` | 0 |

> Thay đổi mật khẩu: sửa trực tiếp `data.json` (cột `password_hash` dạng `salt:hash` PBKDF2) hoặc
> đăng ký tài khoản mới qua web.

## Các endpoint app gọi

| Endpoint | Mô tả |
|---|---|
| `GET /checkkey/api/key.php?APIKey=` | Kiểm tra key khi kích hoạt (trả `status`/`end_date`/`device_ID`) |
| `GET /checkkey/api/check_date_key.php?APIKey=&device_id_local=` | Kiểm tra + gán thiết bị |
| `GET /checkkey/api/announcement.json` | Thông báo app |
| `GET /checkkey/api/api_golike_fb.php?action=get_jobs\|complete_job\|report_job` | Job Facebook |
| `GET /checkkey/api/api_golike_tiktok.php?action=complete_job` | Job TikTok |
| `POST /checkkey/` | `addHistory` — ghi lịch sử + **cộng xu cho user sở hữu key** gắn với thiết bị (`keyadmin` bắt buộc, giới hạn 60 lần/giờ/thiết bị) |
| `GET /statistics` | Trang thống kê |
| `GET /Key_Free/?key=` | Trang kiểm tra key |

`complete_job`/`report_job` ghi vào `job_completions`/`job_reports` (hiển thị ở admin + statistics).

## Admin API (header `X-BON-SECRET: <ADMIN_SECRET>`)

- `GET /v1/admin/summary` — thống kê (users, keys, pending_wallet, jobs)
- `GET /v1/admin/users`
- `GET /v1/admin/keys`
- `POST /v1/admin/keys/create` — body `{key?, user_id, hours, price, note, device_limit}`
- `POST /v1/admin/keys/action` — body `{key|id, action: enable|disable|reset|delete|extend, hours?}`
- `GET /v1/admin/jobs`
- `POST /v1/admin/jobs/create` — body `{platform: fb|tiktok, link, object_id, ads_id, account_id, type, reaction, fix_coin, price, max_uses}`
- `POST /v1/admin/jobs/action` — body `{platform, id, action}`
- `GET /v1/admin/history`
- `GET /v1/admin/completions`
- `GET /v1/admin/reports`
- `GET /v1/admin/wallet`
- `GET /v1/admin/transactions`

## Seed key mặc định

Server seed sẵn các key đang hoạt động trên worker D1:
`VIP-57FD76456B2342CDB393` (hạn 2026-08-16 12:58, user lanhak), `VIP-40FD7A1557884EF6B0BE`
(backup test vD, thiết bị TESTNOW), `VIP-561318E0620B413DA84A` (hạn 2026-08-16 09:00, user lanhak).

## Test cục bộ

```bash
node server.js
# rồi gọi
curl "http://localhost:3000/checkkey/api/key.php?APIKey=VIP-57FD76456B2342CDB393"
```

Bộ test đầy đủ (API + web login/register/nạp/rút/mua key/admin) tại
`test_full.mjs` trong workspace cache.

## APK tương ứng

`out/BON_TOOL_vD_onrender_final.apk` — đã đổi toàn bộ URL `bonshop.42web.io` → `bonshop.onrender.com`,
ký lại (v1+v2+v3) bằng keystore mới `bon_final.keystore` (pass `bon2026`, alias `BONTOOL`).
