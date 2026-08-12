# BON TOOL Server — Node.js + JSON

Server này được làm để giữ **đường dẫn API và JSON response tương thích với BON TOOL** đã cung cấp.

## 1. Cài đặt

Yêu cầu Node.js 18+.

```bash
npm install
```

Tạo `.env` từ `.env.example` và đổi:
- `PORT`
- `ADMIN_KEY`
- `API_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Chạy:

```bash
npm start
```

## 2. Endpoint tương thích app

- `GET /checkkey/api/key.php?APIKey=KEY`
- `GET /checkkey/api/check_date_key.php?APIKey=KEY&device_id_local=DEVICE_ID`
- `POST /checkkey/`
- `GET /checkkey/api/api_golike_fb.php?action=get_jobs&platform=facebook&APIKey=KEY&device_id_local=DEVICE_ID`
- `GET /checkkey/api/api_golike_fb.php?action=complete_job&platform=facebook&APIKey=KEY&job_id=1&device_id_local=DEVICE_ID`
- `GET /checkkey/api/api_golike_fb.php?action=report_job&platform=facebook&APIKey=KEY&job_id=1&device_id_local=DEVICE_ID`
- `GET /checkkey/api/api_golike_tiktok.php?action=complete_job&APIKey=KEY&ads_id=ADS&account_id=ACCOUNT&device_id_local=DEVICE_ID`
- `GET /checkkey/api/announcement.json`
- `GET /statistics`
- `GET /Key_Free/?key=HD_xxx`

Ngoài ra có:
- `POST /api/check-key.php` với `X-API-Key`
- Admin: `/admin`
- Admin API: `/admin/api/*`

## 3. Dữ liệu

Tất cả dữ liệu nằm trong `data/*.json`, không cần MySQL.

Không lưu password thật hoặc API secret trong file public. Dùng biến môi trường.

## 4. Tạo key

Mở `/admin`, nhập `ADMIN_KEY`, rồi tạo key.

Hoặc API:

```http
POST /admin/api/keys
X-Admin-Key: YOUR_ADMIN_KEY
Content-Type: application/json

{"duration_hours":24,"price":2000,"device_limit":1}
```

## 5. Thêm job

Facebook:

```http
POST /admin/api/jobs/facebook
X-Admin-Key: YOUR_ADMIN_KEY
Content-Type: application/json

{"link":"https://facebook.com/...","object_id":"123","type":"like","reaction":"like","price":35}
```

TikTok:

```http
POST /admin/api/jobs/tiktok
X-Admin-Key: YOUR_ADMIN_KEY
Content-Type: application/json

{"video_url":"https://www.tiktok.com/...","ads_id":"ADS123","account_id":"ACC123","price":20}
```

## 6. Đưa server lên Render

1. Upload project lên GitHub.
2. Render → New Web Service.
3. Build command: `npm install`
4. Start command: `npm start`
5. Node 18+.
6. Đặt các Environment Variables trong `.env.example`.
7. Sau khi deploy, server sẽ có dạng:
   `https://your-service.onrender.com`

### Lưu ý quan trọng về JSON trên Render

Nếu dùng filesystem mặc định của Render, dữ liệu JSON có thể mất khi service được redeploy/restart. Với dữ liệu key/xu quan trọng, nên dùng persistent disk hoặc chuyển sang database sau.

## 7. Đổi URL trong app

Server hiện tại không thể tự đổi URL hard-code trong APK.

Nếu APK đang gọi:
`https://bonshop.onrender.com/...`

thì cần:
- deploy server đúng domain đó, hoặc
- sửa base URL trong app rồi build lại.

Server này đã giữ các path `/checkkey/...`, `/statistics`, `/Key_Free/` để giảm thay đổi phía app.

## 8. Bảo mật

Không dùng các key/mật khẩu cũ đã từng để trong source công khai. Hãy đổi `ADMIN_KEY`, `API_SECRET` và mật khẩu admin trước khi chạy thật.


## Admin login

Trang `/admin` dùng Email + Password.

Render Environment Variables:

- `ADMIN_EMAIL` — email đăng nhập
- `ADMIN_PASSWORD` — mật khẩu đăng nhập
- `ADMIN_KEY` — secret nội bộ để ký token, không nhập vào trang đăng nhập
- `API_SECRET` — secret cho API

Sau khi đăng nhập, server cấp token phiên có thời hạn 24 giờ.
