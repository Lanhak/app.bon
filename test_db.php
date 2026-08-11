<?php
header('Content-Type: text/plain; charset=utf-8');
$c = require __DIR__ . '/config.php';
$d = $c['db'];
echo "config.php host     = {$d['host']}\n";
echo "config.php dbname   = {$d['name']}\n";
echo "config.php username = {$d['user']}\n";
echo "config.php pass     = " . (strlen((string)$d['pass']) > 0 ? '**' . strlen((string)$d['pass']) . ' chars**' : '(rỗng)') . "\n";
echo "\nĐang kết nối MySQL... (nếu treo >60s là host sai hoặc chặn)\n";
$t0 = microtime(true);
try {
    $p = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset=utf8mb4",
        $d['user'],
        $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    echo "KẾT NỐI OK sau " . round(microtime(true) - $t0, 2) . "s\n";
    echo "DATABASE() = " . $p->query("SELECT DATABASE()")->fetchColumn() . "\n";
    echo "vip_keys count = " . $p->query("SELECT COUNT(*) FROM vip_keys")->fetchColumn() . "\n";
    $p->query("SELECT created_at FROM vip_keys LIMIT 1");
    echo "Cột created_at: CÓ\n";
} catch (Throwable $e) {
    echo "LỖI sau " . round(microtime(true) - $t0, 2) . "s:\n";
    echo $e->getMessage() . "\n";
    echo "\n--- Hướng khắc phục ---\n";
    echo "1. Vào InfinityFree panel -> 'MySQL Databases' -> đọc đúng 'Host', 'Username', 'Database'.\n";
    echo "2. Sửa lại config.php cho khớp (đặc biệt HOST và PASSWORD).\n";
    echo "3. XÓA file test_db.php sau khi xong.\n";
}
