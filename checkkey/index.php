<?php
declare(strict_types=1);

/*
 * BON SHOP CHECKKEY - root endpoint
 *
 * App HTool_Tiktok_Prov6 gọi (e2/h.java -> q()):
 *   POST https://bonshop.42web.io/checkkey/
 *   Content-Type: application/json; charset=utf-8
 *   Body: {"action":"addHistory","name_tool":"GOLIKE","keyadmin":"huongdev8386","device_id":"...","money":35}
 *
 * Action addHistory = "ADD XU VIP SERVER":
 *   - Cộng tiền (xu) vào số dư của user sở hữu key VIP gắn với thiết bị.
 *   - Thiết bị được nối với key qua bảng key_devices (device_hash = sha256(device_id)).
 *
 * Response mong đợi (z1/f.java):
 *   - Thành công: { "success": true, "data": { "username": "..." } }
 *   - Thất bại:   { "success": false, "message": "..." }
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

function response(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $config = require dirname(__DIR__) . '/config.php';
} catch (Throwable $e) {
    response(['success' => false, 'message' => 'Không tải được config.php'], 500);
}

function db(): PDO {
    global $config;
    static $pdo = null;
    if ($pdo === null) {
        $d = $config['db'];
        $pdo = new PDO(
            "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset=utf8mb4",
            $d['user'],
            $d['pass'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    }
    return $pdo;
}

function ensure_app_credits_table(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_credits (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        device_hash CHAR(64) NOT NULL,
        name_tool VARCHAR(50) NOT NULL DEFAULT '',
        amount INT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_credits_device_time (device_hash, created_at),
        KEY idx_credits_user (user_id)
    ) ENGINE=InnoDB");
}

try {
    ensure_app_credits_table(db());

    // Chỉ nhận POST (app luôn POST body JSON)
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        response(['success' => false, 'message' => 'Phương thức không hợp lệ'], 405);
    }

    $in = json_decode(file_get_contents('php://input'), true);
    if (!is_array($in)) {
        $in = $_POST;
    }

    $keyadmin = (string)($in['keyadmin'] ?? '');
    if (!hash_equals('huongdev8386', $keyadmin)) {
        response(['success' => false, 'message' => 'Sai keyadmin'], 403);
    }

    $action = (string)($in['action'] ?? '');
    if ($action !== 'addHistory') {
        response(['success' => false, 'message' => 'Action không hợp lệ'], 400);
    }

    $nameTool = trim((string)($in['name_tool'] ?? ''));
    $deviceId = trim((string)($in['device_id'] ?? ''));
    $money = (int)($in['money'] ?? 0);

    if ($deviceId === '' || $money <= 0) {
        response(['success' => false, 'message' => 'Thiếu device_id hoặc money']);
    }
    if ($money > 100000) {
        response(['success' => false, 'message' => 'Số tiền cộng quá lớn']);
    }

    $deviceHash = hash('sha256', $deviceId);
    $pdo = db();

    // Tìm key VIP còn hạn đang gắn với thiết bị này -> user sở hữu key
    $stmt = $pdo->prepare(
        "SELECT k.id AS key_id, k.user_id, k.expires_at, k.status
         FROM key_devices d
         JOIN vip_keys k ON k.id = d.key_id
         WHERE d.device_hash = ?
         ORDER BY d.last_seen DESC
         LIMIT 1"
    );
    $stmt->execute([$deviceHash]);
    $keyRow = $stmt->fetch();

    if (!$keyRow || !$keyRow['user_id']) {
        response(['success' => false, 'message' => 'Thiết bị chưa kích hoạt Key VIP']);
    }
    if ($keyRow['status'] !== 'active' || !$keyRow['expires_at'] || strtotime($keyRow['expires_at']) <= time()) {
        response(['success' => false, 'message' => 'Key VIP hết hạn hoặc bị khóa']);
    }

    $userId = (int)$keyRow['user_id'];

    // Giới hạn tốc độ cộng xu: tối đa 60 lần / giờ / thiết bị
    $rate = $pdo->prepare(
        "SELECT COUNT(*) FROM app_credits
         WHERE device_hash = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)"
    );
    $rate->execute([$deviceHash]);
    if ((int)$rate->fetchColumn() >= 60) {
        response(['success' => false, 'message' => 'Đã vượt giới hạn cộng xu trong giờ này']);
    }

    // Cộng tiền + ghi giao dịch
    $pdo->beginTransaction();
    try {
        $sel = $pdo->prepare("SELECT balance FROM users WHERE id = ? FOR UPDATE");
        $sel->execute([$userId]);
        $user = $sel->fetch();
        if (!$user) {
            $pdo->rollBack();
            response(['success' => false, 'message' => 'Không tìm thấy tài khoản']);
        }

        $newBalance = (int)$user['balance'] + $money;
        $pdo->prepare("UPDATE users SET balance = ? WHERE id = ?")->execute([$newBalance, $userId]);
        $pdo->prepare(
            "INSERT INTO balance_transactions(user_id, amount, balance_after, type, description)
             VALUES(?,?,?,?,?)"
        )->execute([$userId, $money, $newBalance, 'admin_topup', 'App ' . ($nameTool !== '' ? $nameTool : 'GOLIKE')]);
        $pdo->prepare(
            "INSERT INTO app_credits(user_id, device_hash, name_tool, amount)
             VALUES(?,?,?,?)"
        )->execute([$userId, $deviceHash, $nameTool, $money]);

        $uname = '';
        $uq = $pdo->prepare("SELECT username, email FROM users WHERE id = ?");
        $uq->execute([$userId]);
        $urow = $uq->fetch();
        if ($urow) {
            $uname = $urow['username'] ?: $urow['email'];
        }

        $pdo->commit();
        response([
            'success' => true,
            'message' => 'Đã cộng ' . $money . ' xu cho ' . $nameTool,
            'data' => [
                'username' => $uname,
                'balance' => $newBalance,
                'money' => $money,
            ],
        ]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        response(['success' => false, 'message' => 'Không thể cộng xu'], 500);
    }
} catch (Throwable $e) {
    response(['success' => false, 'message' => 'Lỗi kết nối máy chủ'], 500);
}
