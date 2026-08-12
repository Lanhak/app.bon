# BON TOOL API contract extracted from the supplied APK + PHP package

Base URL for deployment: `https://bonshop.onrender.com`

## Legacy endpoints

### VIP activation
GET `/checkkey/api/key.php?APIKey=KEY`

Success:
- status=success
- end_date
- device_ID
- create_date
- msg
- key
- api_key
- device_count
- device_limit

### Periodic VIP check
GET `/checkkey/api/check_date_key.php?APIKey=KEY&end_date_local=...&number_phone_local=...&device_id_local=...`

The device is bound here and device_limit is enforced.

### Facebook
GET `/checkkey/api/api_golike_fb.php`
- `action=get_jobs`
- `action=complete_job`
- `action=report_job`

`get_jobs` success includes:
`success`, `message`, `data.id`, `data.job_id`, `data.link`, `data.type`, `data.reaction`, `data.object_id`, `data.price_per_after_cost`, `data.fix_coin`, `data.coin`.

### TikTok
GET `/checkkey/api/api_golike_tiktok.php?action=complete_job`

Success includes:
`success`, `message`, `data.ads_id`, `data.account_id`, `data.fix_coin`.

### Add history / credit
POST `/checkkey/`

JSON:
```json
{
  "action":"addHistory",
  "name_tool":"GOLIKE",
  "keyadmin":"...",
  "device_id":"...",
  "money":35
}
```

Success:
```json
{"success":true,"message":"...","data":{"username":"...","balance":123,"money":35}}
```

### Public pages
- `/Key_Free/?key=...`
- `/statistics`

### Protected API
POST `/api/check-key.php`
Header `X-API-Key: API_SECRET`
Body:
```json
{"key":"VIP-...","device_hash":"64 hex SHA-256"}
```

## Important deployment detail

The supplied APK contains the old hostname `bonshop.42web.io`. A new Render server cannot change a URL hard-coded inside an already-built APK. The APK must be rebuilt with the Render hostname (or a compatible DNS/domain strategy must be used).
