# BON SERVER FIX V2 - VERIFY

## APK comparison

Compared:
- BON_TOOL.apk (current uploaded build)
- HTool_Tiktok_Prov6(4).apk (original)

Result:
- `Le2/h.d(String,long,int,String,Lz1/f;)V` has identical request logic.
- The only semantic URL change in that method is:
  HTool -> `https://shophuongdev.com/checkkey/api/check_date_key.php?APIKey=`
  BON  -> `https://bonshop.42web.io/checkkey/api/check_date_key.php?APIKey=`
- `Lz1/f.onResponse(...)` is bytecode-equivalent after reference normalization.
- `CheckKeyActivity.r()` has the same VIP/free-key validation flow.
- BON does not change the `status == "success"` condition used by the server-check callback.
- Therefore the popup is not caused by a changed VIP-check algorithm inside these APK classes.

## Server contract required by the APK

`check_date_key.php` must return JSON with:
- `status: "success"` for a valid key
- `end_date`
- `create_date`
- `device_ID`
- `key` / `api_key`

The client treats any other `status`, JSON parse failure, or callback failure as invalid and removes `vip_data`.

## V2 server changes

1. `check_date_key.php`
   - accepts APIKey/api_key/key aliases
   - accepts device_id_local/device_id/deviceId
   - supports DATETIME and Unix timestamp expiration values
   - supports legacy column names for expiration/creation
   - uses `SELECT *` to tolerate older vip_keys schemas
   - returns application errors as JSON with HTTP 200
   - keeps atomic device binding and device-limit enforcement
   - creates `key_devices` if a deployment missed that table
   - never exposes raw DB exceptions to the APK

2. `key.php`
   - same compatibility improvements
   - returns all fields required by `Lz1/g.onPostExecute(JSONObject)`
   - preserves device binding if a client supplies a device id

3. Existing PHP files
   - PHP syntax checked with `php -l`: all PHP files passed.

## Important deployment/data point

If BON_TOOL still shows "YÊU CẦU KÍCH HOẠT KEY" after deploying V2, the most likely remaining cause is DATA, not APK logic:
- the stored `vip_data.api_key` is not present in the new `vip_keys` table; or
- the key is expired/disabled; or
- `key_devices` already contains another device for a `device_limit=1` key.

The admin panel has a `reset` action that deletes `key_devices` rows for a key. Use it only when you intentionally want to rebind the key.

Do not publish database credentials contained in `config.php`. Rotate them if this archive was shared publicly.
