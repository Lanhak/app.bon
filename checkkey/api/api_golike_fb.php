<?php
declare(strict_types=1);

/*
 * BON SHOP GOLIKE FACEBOOK API
 *
 * App HTool_Tiktok_Prov6 gọi (GET):
 *   1. get_jobs      - g2/o.java -> c()
 *      ?action=get_jobs&platform=facebook&auth_token=...&APIKey=KEY&fb_id=...&server=sv2&high_job=1&device_id_local=...
 *   2. complete_job  - g2/b.java
 *      ?action=complete_job&platform=facebook&auth_token=...&APIKey=KEY&object_id=...&job_id=...&type=...&uid=...
 *        &users_fb_account_id=...&users_advertising_id=...&reaction=...&device_id_local=...
 *   3. report_job    - e2/h.java -> n()
 *      ?action=report_job&platform=facebook&auth_token=...&APIKey=KEY&job_id=...&uid=...&users_advertising_id=...&description=...&device_id_local=...
 *
 * Response contracts (đã chốt từ smali):
 *   get_jobs      -> { "success": true, "data": { "id":.., "job_id":.., "link":.., "type":..,
 *                       "reaction":.., "object_id":.., "price_per_after_cost":.., "fix_coin":.. } }
 *                    Hết việc -> { "success": false, "message": "..." }
 *   complete_job  -> { "success": true, "message": "..." }
 *   report_job    -> { "success": true, "message": "..." }
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
    $config = require dirname(__DIR__, 2) . '/config.php';
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

function ensure_job_tables(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS fb_jobs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        link VARCHAR(255) NOT NULL,
        object_id VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'like',
        reaction VARCHAR(20) NOT NULL DEFAULT 'like',
        price INT UNSIGNED NOT NULL DEFAULT 35,
        max_uses INT UNSIGNED NOT NULL DEFAULT 9999,
        used_count INT UNSIGNED NOT NULL DEFAULT 0,
        status ENUM('active','disabled') NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB");

    $pdo->exec("CREATE TABLE IF NOT EXISTS tiktok_jobs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        video_url VARCHAR(255) NOT NULL,
        ads_id VARCHAR(100) NOT NULL,
        account_id VARCHAR(100) NOT NULL,
        price INT UNSIGNED NOT NULL DEFAULT 20,
        max_uses INT UNSIGNED NOT NULL DEFAULT 9999,
        used_count INT UNSIGNED NOT NULL DEFAULT 0,
        status ENUM('active','disabled') NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB");

    $pdo->exec("CREATE TABLE IF NOT EXISTS job_completions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        platform VARCHAR(10) NOT NULL,
        job_id BIGINT UNSIGNED NOT NULL,
        device_hash CHAR(64) NOT NULL,
        user_id BIGINT UNSIGNED NULL,
        amount INT UNSIGNED NOT NULL DEFAULT 0,
        status ENUM('done','reported') NOT NULL DEFAULT 'done',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_platform_job_device (platform, job_id, device_hash)
    ) ENGINE=InnoDB");

    $pdo->exec("CREATE TABLE IF NOT EXISTS job_reports (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        platform VARCHAR(10) NOT NULL,
        job_id BIGINT UNSIGNED NOT NULL,
        uid VARCHAR(100) NULL,
        device_hash CHAR(64) NOT NULL,
        description VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB");
}

try {
    ensure_job_tables(db());

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        response(['success' => false, 'message' => 'Phương thức không hợp lệ'], 405);
    }

    $action = (string)($_GET['action'] ?? '');
    $apiKey = trim((string)($_GET['APIKey'] ?? ''));
    $deviceId = trim((string)($_GET['device_id_local'] ?? ''));
    $deviceHash = $deviceId !== '' ? hash('sha256', $deviceId) : '';

    if (!in_array($action, ['get_jobs', 'complete_job', 'report_job'], true)) {
        response(['success' => false, 'message' => 'Action không hợp lệ'], 400);
    }

    $pdo = db();

    // Kiểm tra Key VIP
    $keyRow = null;
    if ($apiKey !== '') {
        $s = $pdo->prepare("SELECT id, user_id, expires_at, status FROM vip_keys WHERE key_value = ? LIMIT 1");
        $s->execute([$apiKey]);
        $keyRow = $s->fetch();
    }
    if (!$keyRow) {
        response(['success' => false, 'message' => 'Key VIP không tồn tại']);
    }
    if ($keyRow['status'] !== 'active' || !$keyRow['expires_at'] || strtotime($keyRow['expires_at']) <= time()) {
        $pdo->prepare("UPDATE vip_keys SET status='expired' WHERE id=?")->execute([$keyRow['id']]);
        response(['success' => false, 'message' => 'Key VIP hết hạn hoặc bị khóa']);
    }

    if ($action === 'get_jobs') {
        // Lấy 1 job còn hiệu lực, ưu tiên job thiết bị này chưa làm
        if ($deviceHash !== '') {
            $job = $pdo->prepare(
                "SELECT j.* FROM fb_jobs j
                 LEFT JOIN job_completions c
                        ON c.platform='facebook' AND c.job_id=j.id AND c.device_hash=?
                 WHERE j.status='active' AND j.used_count < j.max_uses AND c.id IS NULL
                 ORDER BY RAND()
                 LIMIT 1"
            );
            $job->execute([$deviceHash]);
            $j = $job->fetch();
        } else {
            $j = $pdo->query(
                "SELECT * FROM fb_jobs
                 WHERE status='active' AND used_count < max_uses
                 ORDER BY RAND()
                 LIMIT 1"
            )->fetch();
        }

        if (!$j) {
            // Lưu ý: KHÔNG trả "data" ở đây - app xem data={} như 1 job rỗng
            response([
                'success' => false,
                'message' => 'Tạm hết nhiệm vụ',
            ]);
        }

        response([
            'success' => true,
            'message' => 'OK',
            'data' => [
                'id' => (int)$j['id'],
                'job_id' => (int)$j['id'],
                'link' => $j['link'],
                'type' => $j['type'],
                'reaction' => $j['reaction'],
                'object_id' => $j['object_id'],
                'price_per_after_cost' => (int)$j['price'],
                'fix_coin' => (int)$j['price'],
                'coin' => (int)$j['price'],
            ],
        ]);
    }

    if ($action === 'complete_job') {
        $jobId = (int)($_GET['job_id'] ?? 0);
        $objectId = trim((string)($_GET['object_id'] ?? ''));
        $type = trim((string)($_GET['type'] ?? 'like'));
        $uid = trim((string)($_GET['uid'] ?? ''));
        $reaction = trim((string)($_GET['reaction'] ?? 'like'));
        $fbAccountId = trim((string)($_GET['users_fb_account_id'] ?? ''));

        if ($jobId <= 0) {
            response(['success' => false, 'message' => 'Thiếu job_id']);
        }
        if ($deviceHash === '') {
            response(['success' => false, 'message' => 'Thiếu device_id_local']);
        }

        $s = $pdo->prepare("SELECT * FROM fb_jobs WHERE id = ? LIMIT 1");
        $s->execute([$jobId]);
        $j = $s->fetch();

        if (!$j) {
            response(['success' => false, 'message' => 'Không tìm thấy công việc']);
        }
        if ($j['status'] !== 'active') {
            response(['success' => false, 'message' => 'Công việc đã bị khóa']);
        }

        // Idempotent: nếu thiết bị đã hoàn thành job này thì vẫn báo success
        // (không cộng thêm - việc cộng xu do app gọi addHistory riêng)
        $ins = $pdo->prepare(
            "INSERT IGNORE INTO job_completions(platform, job_id, device_hash, user_id, amount, status)
             VALUES('facebook', ?, ?, ?, ?, 'done')"
        );
        $ins->execute([$jobId, $deviceHash, $keyRow['user_id'], (int)$j['price']]);

        if ($ins->rowCount() > 0) {
            $pdo->prepare("UPDATE fb_jobs SET used_count = used_count + 1 WHERE id = ?")->execute([$jobId]);
        }

        response([
            'success' => true,
            'message' => 'Hoàn thành nhiệm vụ Facebook thành công',
            'data' => [
                'job_id' => $jobId,
                'object_id' => $objectId !== '' ? $objectId : $j['object_id'],
                'fix_coin' => (int)$j['price'],
                'price_per_after_cost' => (int)$j['price'],
            ],
        ]);
    }

    // report_job
    $jobId = (int)($_GET['job_id'] ?? 0);
    $uid = trim((string)($_GET['uid'] ?? ''));
    $description = trim((string)($_GET['description'] ?? ''));

    if ($jobId <= 0) {
        response(['success' => false, 'message' => 'Thiếu job_id']);
    }
    if ($deviceHash === '') {
        response(['success' => false, 'message' => 'Thiếu device_id_local']);
    }

    $pdo->prepare(
        "INSERT INTO job_reports(platform, job_id, uid, device_hash, description)
         VALUES('facebook', ?, ?, ?, ?)"
    )->execute([$jobId, $uid, $deviceHash, $description]);

    response([
        'success' => true,
        'message' => 'Đã ghi nhận báo cáo công việc',
    ]);
} catch (Throwable $e) {
    response(['success' => false, 'message' => 'Lỗi kết nối máy chủ'], 500);
}
