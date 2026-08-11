<?php
/*
 * BON SHOP - VIP periodic key validation.
 * Compatible with the BON_TOOL/HTool client contract:
 * GET /checkkey/api/check_date_key.php?APIKey=...&end_date_local=...&number_phone_local=...&device_id_local=...
 *
 * Application-level errors intentionally use HTTP 200 so the Android client always
 * receives JSON instead of an upstream HTML error page.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

function out_json($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function db_conn() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $config = require dirname(__DIR__, 2) . '/config.php';
    $d = $config['db'];

    $pdo = new PDO(
        "mysql:host=" . $d['host'] . ";port=" . $d['port'] . ";dbname=" . $d['name'] . ";charset=utf8mb4",
        $d['user'],
        $d['pass'],
        array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        )
    );
    return $pdo;
}

/* Accept DATETIME, Unix seconds, or Unix milliseconds. */
function epoch_seconds($value) {
    if ($value === null || $value === '') return 0;
    $s = trim((string)$value);

    if (preg_match('/^\d+$/', $s)) {
        $n = (int)$s;
        if ($n > 100000000000) $n = (int)floor($n / 1000);
        return $n;
    }

    $t = strtotime($s);
    return $t === false ? 0 : $t;
}

function row_expiration($row) {
    foreach (array('expires_at', 'end_date', 'expiration_date') as $k) {
        if (array_key_exists($k, $row) && $row[$k] !== null && $row[$k] !== '') {
            return $row[$k];
        }
    }
    return null;
}

function row_created($row) {
    foreach (array('created_at', 'create_date', 'created_date') as $k) {
        if (array_key_exists($k, $row) && $row[$k] !== null && $row[$k] !== '') {
            return $row[$k];
        }
    }
    return date('Y-m-d H:i:s');
}

function key_value_of($row) {
    foreach (array('key_value', 'api_key', 'key') as $k) {
        if (isset($row[$k]) && trim((string)$row[$k]) !== '') return trim((string)$row[$k]);
    }
    return '';
}

try {
    $pdo = db_conn();

    $key = trim((string)(
        $_GET['APIKey'] ??
        $_GET['api_key'] ??
        $_GET['key'] ??
        ''
    ));

    $deviceId = trim((string)(
        $_GET['device_id_local'] ??
        $_GET['device_id'] ??
        $_GET['deviceId'] ??
        ''
    ));

    if ($key === '') {
        out_json(array(
            'success' => false,
            'status' => 'invalid',
            'msg' => 'Thiếu APIKey'
        ));
    }

    /*
     * SELECT * is intentional: it keeps this endpoint compatible with an
     * existing vip_keys table that predates the current db.sql.
     */
    $stmt = $pdo->prepare("SELECT * FROM vip_keys WHERE key_value = ? LIMIT 1");
    $stmt->execute(array($key));
    $vip = $stmt->fetch();

    if (!$vip) {
        out_json(array(
            'success' => false,
            'status' => 'invalid',
            'msg' => 'Key VIP không tồn tại',
            'key' => $key,
            'api_key' => $key
        ));
    }

    $storedKey = key_value_of($vip);
    $status = strtolower(trim((string)($vip['status'] ?? 'active')));

    if ($status === 'disabled' || $status === 'blocked') {
        out_json(array(
            'success' => false,
            'status' => 'disabled',
            'msg' => 'Key VIP đã bị khóa',
            'key' => $storedKey,
            'api_key' => $storedKey
        ));
    }

    if ($status === 'expired') {
        out_json(array(
            'success' => false,
            'status' => 'expired',
            'msg' => 'Key VIP đã hết hạn',
            'key' => $storedKey,
            'api_key' => $storedKey,
            'end_date' => row_expiration($vip)
        ));
    }

    /*
     * Legacy rows with an empty status are accepted only when the expiration
     * is still valid. Explicit disabled/expired states above remain blocked.
     */
    $expiresRaw = row_expiration($vip);
    $expiresTs = epoch_seconds($expiresRaw);

    if ($expiresTs <= 0 || $expiresTs <= time()) {
        if (isset($vip['id'])) {
            try {
                $pdo->prepare("UPDATE vip_keys SET status='expired' WHERE id=?")->execute(array($vip['id']));
            } catch (Throwable $ignore) {}
        }

        out_json(array(
            'success' => false,
            'status' => 'expired',
            'msg' => 'Key VIP đã hết hạn',
            'key' => $storedKey,
            'api_key' => $storedKey,
            'end_date' => $expiresRaw
        ));
    }

    $deviceCount = 0;
    $deviceBound = '';

    if ($deviceId !== '') {
        if (!isset($vip['id'])) {
            out_json(array(
                'success' => false,
                'status' => 'server_error',
                'msg' => 'Dữ liệu key không có id'
            ));
        }

        $deviceHash = hash('sha256', $deviceId);
        $limit = isset($vip['device_limit']) ? (int)$vip['device_limit'] : 1;
        if ($limit < 1) $limit = 1;

        try {
            /*
             * The table is part of db.sql. CREATE IF NOT EXISTS only repairs
             * an installation where db.sql was not fully imported.
             */
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS key_devices (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    key_id BIGINT UNSIGNED NOT NULL,
                    device_hash CHAR(64) NOT NULL,
                    first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_key_device(key_id,device_hash),
                    KEY idx_key_devices_key(key_id)
                ) ENGINE=InnoDB"
            );

            $pdo->beginTransaction();

            $lock = $pdo->prepare(
                "SELECT * FROM vip_keys WHERE id=? LIMIT 1 FOR UPDATE"
            );
            $lock->execute(array($vip['id']));
            $locked = $lock->fetch();

            if (!$locked) {
                $pdo->rollBack();
                out_json(array(
                    'success' => false,
                    'status' => 'invalid',
                    'msg' => 'Key VIP không tồn tại'
                ));
            }

            $lockedStatus = strtolower(trim((string)($locked['status'] ?? 'active')));
            $lockedExpires = row_expiration($locked);
            if ($lockedStatus === 'disabled' || $lockedStatus === 'blocked') {
                $pdo->rollBack();
                out_json(array(
                    'success' => false,
                    'status' => 'disabled',
                    'msg' => 'Key VIP đã bị khóa'
                ));
            }

            if (epoch_seconds($lockedExpires) <= time()) {
                $pdo->rollBack();
                out_json(array(
                    'success' => false,
                    'status' => 'expired',
                    'msg' => 'Key VIP đã hết hạn',
                    'end_date' => $lockedExpires
                ));
            }

            $limit = isset($locked['device_limit']) ? (int)$locked['device_limit'] : $limit;
            if ($limit < 1) $limit = 1;

            $find = $pdo->prepare(
                "SELECT id FROM key_devices WHERE key_id=? AND device_hash=? LIMIT 1"
            );
            $find->execute(array($locked['id'], $deviceHash));
            $known = $find->fetch();

            $countStmt = $pdo->prepare(
                "SELECT COUNT(*) FROM key_devices WHERE key_id=?"
            );
            $countStmt->execute(array($locked['id']));
            $deviceCount = (int)$countStmt->fetchColumn();

            if (!$known && $deviceCount >= $limit) {
                $pdo->rollBack();
                out_json(array(
                    'success' => false,
                    'status' => 'device_limit',
                    'msg' => 'Key VIP đã đạt giới hạn thiết bị',
                    'key' => key_value_of($locked),
                    'api_key' => key_value_of($locked),
                    'device_limit' => $limit
                ));
            }

            if ($known) {
                $pdo->prepare(
                    "UPDATE key_devices SET last_seen=NOW() WHERE id=?"
                )->execute(array($known['id']));
            } else {
                $pdo->prepare(
                    "INSERT INTO key_devices(key_id,device_hash) VALUES(?,?)"
                )->execute(array($locked['id'], $deviceHash));
                $deviceCount++;
            }

            $pdo->commit();
            $deviceBound = $deviceId;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('[BON check_date_key] ' . $e->getMessage());
            out_json(array(
                'success' => false,
                'status' => 'server_error',
                'msg' => 'Không thể kiểm tra thiết bị của Key VIP'
            ));
        }
    }

    $hours = isset($vip['duration_hours']) ? (int)$vip['duration_hours'] : 0;
    $created = row_created($vip);

    out_json(array(
        'success' => true,
        'status' => 'success',
        'msg' => 'Xác thực Server thành công: Key VIP hợp lệ!',
        'key' => $storedKey,
        'api_key' => $storedKey,
        'vip' => true,
        'duration_hours' => $hours,
        'expires_at' => $expiresRaw,
        'endDate' => $expiresRaw,
        'end_date' => $expiresRaw,
        'create_date' => $created,
        'device_ID' => $deviceBound,
        'device_id' => $deviceBound,
        'device_count' => $deviceCount,
        'number_phone' => $deviceCount,
        'number_phone_local' => $deviceCount,
        'device_limit' => isset($vip['device_limit']) ? max(1, (int)$vip['device_limit']) : 1
    ));

} catch (Throwable $e) {
    error_log('[BON check_date_key fatal] ' . $e->getMessage());
    out_json(array(
        'success' => false,
        'status' => 'server_error',
        'msg' => 'Lỗi kết nối máy chủ'
    ));
}
