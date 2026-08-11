<?php
declare(strict_types=1);

/*
 * BON SHOP GOLIKE TIKTOK API
 *
 * App HTool_Tiktok_Prov6 gọi (GET) - g2/a0.java (t==2, VIP key):
 *   ?action=complete_job&auth_token=...&ads_id=...&account_id=...&APIKey=KEY&async=true&device_id_local=...
 *
 * Response contract (g2/v.java):
 *   - Có "success": { "success": true|false, "message": "..." }
 *   - Hoặc có "status": { "status": 200 } (200 = success)
 *   - Nếu thiếu cả hai, app dựa vào HTTP status.
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
}

try {
    ensure_job_tables(db());

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        response(['success' => false, 'message' => 'Phương thức không hợp lệ'], 405);
    }

    $action = (string)($_GET['action'] ?? '');
    $apiKey = trim((string)($_GET['APIKey'] ?? ''));
    $deviceId = trim((string)($_GET['device_id_local'] ?? ''));
    $adsId = trim((string)($_GET['ads_id'] ?? ''));
    $accountId = trim((string)($_GET['account_id'] ?? ''));

    if ($action !== 'complete_job') {
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

    if ($adsId === '') {
        response(['success' => false, 'message' => 'Thiếu ads_id']);
    }
    if ($deviceId === '') {
        response(['success' => false, 'message' => 'Thiếu device_id_local']);
    }

    $deviceHash = hash('sha256', $deviceId);

    // Tìm job TikTok theo ads_id (nếu admin đã đăng ký trong kho job)
    $s = $pdo->prepare("SELECT * FROM tiktok_jobs WHERE ads_id = ? LIMIT 1");
    $s->execute([$adsId]);
    $job = $s->fetch();

    $jobId = $job ? (int)$job['id'] : 0;
    $price = $job ? (int)$job['price'] : 20;
    $jobStatus = $job ? $job['status'] : 'active';

    if ($jobId > 0 && $jobStatus !== 'active') {
        response(['success' => false, 'message' => 'Công việc đã bị khóa']);
    }

    // Ghi nhận hoàn thành (idempotent)
    if ($jobId > 0) {
        $ins = $pdo->prepare(
            "INSERT IGNORE INTO job_completions(platform, job_id, device_hash, user_id, amount, status)
             VALUES('tiktok', ?, ?, ?, ?, 'done')"
        );
        $ins->execute([$jobId, $deviceHash, $keyRow['user_id'], $price]);

        if ($ins->rowCount() > 0) {
            $pdo->prepare("UPDATE tiktok_jobs SET used_count = used_count + 1 WHERE id = ?")->execute([$jobId]);
        }
    }

    response([
        'success' => true,
        'message' => 'Hoàn thành nhiệm vụ TikTok thành công',
        'data' => [
            'ads_id' => $adsId,
            'account_id' => $accountId,
            'fix_coin' => $price,
        ],
    ]);
} catch (Throwable $e) {
    response(['success' => false, 'message' => 'Lỗi kết nối máy chủ'], 500);
}
