# BON SERVER FULL

This project is a Node.js/PostgreSQL migration based directly on the supplied
BON_TOOL APK and `web_BON_TOOL.ZIP`.

## Included

- Legacy APK endpoints:
  - `/checkkey/api/key.php`
  - `/checkkey/api/check_date_key.php`
  - `/checkkey/api/api_golike_fb.php`
  - `/checkkey/api/api_golike_tiktok.php`
  - `/checkkey/` (`addHistory`)
  - `/api/check-key.php`
  - `/Key_Free/`
  - `/statistics`
  - `/api`
- User UI: register, login, balance, deposit, withdraw, VIP purchase, key list, wallet history.
- Admin UI: users/balance, VIP keys, devices, wallet approvals, FB jobs, TikTok jobs, transactions, completed jobs.
- PostgreSQL schema/migrations.
- Render Docker deployment.
- Signed stateless auth cookie (no MemoryStore warning).
- Password hashing with Node `crypto.scrypt`; no external bcrypt dependency.

## Render environment

Set:
`DATABASE_URL`, `SESSION_SECRET`, `API_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`APP_URL`, `WITHDRAW_MIN`, `PRICES_JSON`, `BANKS_JSON`.

Never commit production credentials.

## Important compatibility

The supplied APK contains the old host `bonshop.42web.io`. The APK must be rebuilt
with `https://bonshop.onrender.com` if it should call the Render service directly.
A server-side redirect cannot rewrite a hard-coded URL inside an APK.

The old PHP `config.php` contained database/admin/API credentials. They are NOT
copied into this project. Rotate those old credentials.

## Render redirect-loop fix
`requireAdmin` now redirects unauthenticated requests to `/` instead of `/admin`, preventing an `/admin -> /admin` redirect loop when a stale/invalid cookie is present. The service does not perform HTTP/HTTPS redirects; Render terminates TLS at its proxy.
