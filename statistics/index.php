<?php
/*
 * BON SHOP - Statistics
 *
 * StatisticsFragment (app HTool_Tiktok_Prov6) load WebView:
 *   https://bonshop.42web.io/statistics
 *
 * Trang thống kê công khai (không cần đăng nhập).
 * Mọi query đều dùng try/catch để chịu lỗi + tránh treo INFORMATION_SCHEMA.
 */

$config = null;
try { $config = require dirname(__DIR__) . '/config.php'; } catch (Throwable $e) {}

$pdo = null;
if ($config) {
  try {
    $d = $config['db'];
    $pdo = new PDO("mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset=utf8mb4", $d['user'], $d['pass'],
      [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
  } catch (Throwable $e) { $pdo = null; }
}

function cnt(PDO $pdo, string $sql, array $args = []): int {
  try { $s = $pdo->prepare($sql); $s->execute($args); return (int)$s->fetchColumn(); } catch (Throwable $e) { return 0; }
}

$users     = $pdo ? cnt($pdo, "SELECT COUNT(*) FROM users") : 0;
$keys      = $pdo ? cnt($pdo, "SELECT COUNT(*) FROM vip_keys") : 0;
$keysActive= $pdo ? cnt($pdo, "SELECT COUNT(*) FROM vip_keys WHERE status='active' AND expires_at > NOW()") : 0;
$devices   = $pdo ? cnt($pdo, "SELECT COUNT(*) FROM key_devices") : 0;
$earned    = $pdo ? cnt($pdo, "SELECT COALESCE(SUM(amount),0) FROM balance_transactions WHERE amount > 0") : 0;
$fbDone    = $pdo ? cnt($pdo, "SELECT COUNT(*) FROM job_completions WHERE platform='facebook'") : 0;
$ttDone    = $pdo ? cnt($pdo, "SELECT COUNT(*) FROM job_completions WHERE platform='tiktok'") : 0;

$recent = [];
if ($pdo) {
  try {
    $recent = $pdo->query("SELECT j.platform, j.amount, j.created_at, u.username
      FROM job_completions j LEFT JOIN users u ON u.id = j.user_id
      ORDER BY j.id DESC LIMIT 12")->fetchAll();
  } catch (Throwable $e) { $recent = []; }
}

function fmt(int $n): string { return number_format($n, 0, ',', '.'); }
function esc($x): string { return htmlspecialchars((string)$x, ENT_QUOTES, 'UTF-8'); }
?>
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BON SHOP — Thống kê</title>
<style>
*{box-sizing:border-box}
body{margin:0;font:15px Arial;background:#070b16;color:#edf2ff;padding:18px}
.wrap{max-width:760px;margin:auto}
.head{padding:26px;border:1px solid #2a3e68;border-radius:22px;background:linear-gradient(135deg,#111f3a,#0b1426);
  text-align:center;margin-bottom:16px}
.badge{display:inline-block;padding:7px 13px;border:1px solid #3b5fa4;border-radius:99px;color:#8fb5ff;font-size:11px;font-weight:800;letter-spacing:1.5px}
h1{margin:14px 0 4px;font-size:28px}
p{color:#9eabc0;margin:0;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px}
.card{padding:18px;border:1px solid #263a5b;border-radius:16px;background:#0d1729}
.card span{display:block;color:#8998b0;font-size:12px}
.card b{display:block;font-size:26px;margin-top:6px}
.card .sub{font-size:12px;color:#66e3ff;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:13px}
td,th{padding:9px;border-bottom:1px solid #293753;text-align:left;color:#cbd6eb}
th{color:#8998b0;font-weight:700}
.muted{color:#5d6b86;font-size:12px;text-align:center;margin-top:16px}
@media(max-width:520px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div class="badge">✦ BON SHOP · THỐNG KÊ</div>
    <h1>BON SHOP</h1>
    <p>Hệ thống dịch vụ số · cập nhật theo thời gian thực</p>
  </div>
  <div class="grid">
    <div class="card"><span>Người dùng</span><b><?= fmt($users) ?></b></div>
    <div class="card"><span>Key VIP đang hoạt động</span><b><?= fmt($keysActive) ?><div class="sub">/ tổng <?= fmt($keys) ?> key</div></b></div>
    <div class="card"><span>Thiết bị kích hoạt</span><b><?= fmt($devices) ?></b></div>
    <div class="card"><span>Tổng xu đã chi trả</span><b><?= fmt($earned) ?><div class="sub">xu</div></b></div>
    <div class="card"><span>Nhiệm vụ Facebook</span><b><?= fmt($fbDone) ?><div class="sub">đã hoàn thành</div></b></div>
    <div class="card"><span>Nhiệm vụ TikTok</span><b><?= fmt($ttDone) ?><div class="sub">đã hoàn thành</div></b></div>
  </div>
  <div class="card">
    <h2 style="margin:0 0 12px;font-size:17px">🕒 Hoạt động gần đây</h2>
    <?php if ($recent): ?>
      <table>
        <tr><th>Nền tảng</th><th>Xu</th><th>Người dùng</th><th>Thời gian</th></tr>
        <?php foreach ($recent as $r): ?>
        <tr>
          <td><?= esc(strtoupper($r['platform'])) ?></td>
          <td><b style="color:#66e3ff">+<?= fmt((int)$r['amount']) ?></b></td>
          <td><?= esc($r['username'] ?: '-') ?></td>
          <td><?= esc($r['created_at']) ?></td>
        </tr>
        <?php endforeach; ?>
      </table>
    <?php else: ?>
      <p class="muted">Chưa có hoạt động nào.</p>
    <?php endif; ?>
  </div>
  <div class="muted">BON SHOP · Đơn giản · Nhanh · Tiện lợi</div>
</div>
</body>
</html>
