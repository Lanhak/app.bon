# VIP Shop - InfinityFree

Upload all files to htdocs. The app automatically creates wallet_requests if your database user has table-creation permission.

Wallet features:
- Deposit instructions for Sacombank and VietinBank.
- User must enter transfer note/username and submit a deposit request. Admin manually approves.
- Withdrawal requires bank, account number, account name, minimum 10,000 VND.
- Withdrawal amount is held from balance until admin approves/rejects; rejection refunds it.

Admin: /admin

- Admin balance controls: cộng hoặc trừ số dư user; trừ tiền không được vượt quá số dư hiện tại.

- User accounts now have a unique username (3-30 letters/numbers/underscore).
- Login accepts either username or Gmail/email.
- User dashboard has a left hamburger menu with balance, navigation, and support links.
- Existing databases are migrated automatically by adding the username column when the app first loads.


## Quản trị & API
- `/admin`: quản trị Users, VIP Keys, Key Devices, Nạp/Rút, Lịch sử số dư và **Nhiệm vụ** (kho job FB/TikTok cho auto tool GoLike).
- API: `POST /api/check-key.php`, header `X-API-Key` = `api_secret` trong `config.php`. Body JSON: `{"key":"VIP-...","device_hash":"64_hex_sha256"}`.

## Endpoint app BON_TOOL gọi (đã có đủ trong bộ code)
- `GET /checkkey/api/key.php?APIKey=KEY` — kích hoạt/kiểm tra key VIP.
- `GET /checkkey/api/check_date_key.php` — kiểm tra định kỳ + gán thiết bị.
- `GET /checkkey/api/api_golike_fb.php` — get_jobs / complete_job / report_job (Facebook).
- `GET /checkkey/api/api_golike_tiktok.php?action=complete_job` — hoàn thành job TikTok.
- `POST /checkkey/` — addHistory (cộng xu theo thiết bị).
- `GET /checkkey/api/announcement.json` — thông báo cập nhật.
- `GET /Key_Free/?key=HD_xxx` — trang hiển thị mã key free.
- `GET /statistics` — trang thống kê (WebView trong app).

Chi tiết contract từng endpoint xem `README.txt`.

## V2 verification note

The current BON_TOOL and original HTool use the same VIP validation flow in
`Le2/h.d`, `Lz1/f.onResponse`, and `CheckKeyActivity.r`. The BON build changes
the VIP-check host to `bonshop.42web.io`; the server must therefore contain the
same `/checkkey/api/check_date_key.php` contract.

If an existing key was activated against the old server, moving the APK to a
new database does not automatically migrate the key record or its device
binding. The new database must contain that key and its active expiration.
