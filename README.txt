BON SHOP - VIP KEY CHECK API

API này được viết để khớp với flow check key VIP trong app HTool_Tiktok_Prov6.

1) Kích hoạt key (CheckKeyActivity -> z1/g.java):
GET /checkkey/api/key.php?APIKey=KEY

Response thành công (app cần chính xác các field sau):
{
  "status": "success",            // bắt buộc
  "end_date": "Y-m-d H:i:s",      // hạn sử dụng (chưa quá hạn)
  "device_ID": "",                // thiết bị đã gán, rỗng nếu chưa gán
  "create_date": "Y-m-d H:i:s",   // ngày tạo key
  "msg": "...",
  "key": "...", "api_key": "...", "device_count": 0, "device_limit": 1
}

Response thất bại: status != "success" + "msg" (app hiển thị msg).
App KHÔNG gửi device_id tới key.php nên device_ID trả về "" để app bỏ qua
bước so khớp thiết bị tại key.php.

2) Kiểm tra định kỳ khi chạy tool (MainActivity -> e2/h.java d()):
GET /checkkey/api/check_date_key.php
   ?APIKey=KEY
   &end_date_local=EPOCH_SECONDS
   &number_phone_local=N
   &device_id_local=DEVICE_ID

Response:
- Thành công: status = "success" (app so sánh equalsIgnoreCase)
- Thất bại:   status != "success" -> app xoá vip_data và khoá tool

ĐÂY LÀ ĐIỂM SERVER GÁN THIẾT BỊ VÀO KEY (device_id_local) VÀ CHẶN
KEY DÙNG QUÁ GIỚI HẠN THIẾT BỊ (device_limit). Nếu key đã đạt giới hạn
mà thiết bị chưa đăng ký -> trả status=device_limit.

Logic dùng chung cho cả 2 file:
- kiểm tra key tồn tại
- kiểm tra status active/disabled/expired
- kiểm tra expires_at (quá hạn -> đổi status='expired')
- nếu có device_id (device_id_local) -> kiểm tra device_limit, cập nhật key_devices

Không có login, wallet, nạp tiền, rút tiền hay API dịch vụ khác.

3) ĐÃ BỔ SUNG ĐẦY ĐỦ CÁC ENDPOINT CÒN LẠI MÀ APP GỌI (toàn bộ nằm trong bộ code này):

GET /checkkey/api/api_golike_fb.php
   ?action=get_jobs&platform=facebook&auth_token=..&APIKey=KEY&fb_id=..&server=sv2&high_job=1&device_id_local=..
   -> { "success": true, "data": { "id", "job_id", "link", "type", "reaction",
       "object_id", "price_per_after_cost", "fix_coin" } }
   Hết việc -> { "success": false, "message": "Tạm hết nhiệm vụ" }
   (Kho job lấy từ bảng fb_jobs, admin quản lý trong /admin tab "Nhiệm vụ")

   ?action=complete_job&...&object_id=..&job_id=..&type=..&uid=..&users_fb_account_id=..&users_advertising_id=..&reaction=..&device_id_local=..
   -> { "success": true, "message": "..." }

   ?action=report_job&...&job_id=..&uid=..&users_advertising_id=..&description=..&device_id_local=..
   -> { "success": true, "message": "..." }

GET /checkkey/api/api_golike_tiktok.php
   ?action=complete_job&auth_token=..&ads_id=..&account_id=..&APIKey=KEY&async=true&device_id_local=..
   -> { "success": true, "message": "..." }
   (Kho job TikTok: bảng tiktok_jobs, match theo ads_id)

POST /checkkey/   (addHistory - cộng xu cho user sở hữu key gắn thiết bị)
   Body JSON: {"action":"addHistory","name_tool":"GOLIKE","keyadmin":"huongdev8386","device_id":"..","money":N}
   -> { "success": true, "data": { "username": ".." } }
   (Tìm key qua key_devices theo sha256(device_id), cộng balance user,
    giới hạn 60 lần/giờ/thiết bị, mỗi lần <= 100000 xu)

GET /checkkey/api/announcement.json  -> thông báo cập nhật (sửa file JSON khi cần)

GET /Key_Free/?key=HD_xxx  -> trang hiển thị mã kích hoạt free key để copy

GET /statistics  -> trang thống kê công khai cho WebView trong app

Upload toàn bộ thư mục này (config.php, index.php, checkkey/, Key_Free/, statistics/, api/) vào htdocs.
Chạy db.sql một lần (hoặc để các endpoint tự tạo bảng khi được gọi lần đầu).
