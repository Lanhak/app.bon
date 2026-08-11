<?php
/*
 * BON SHOP - Key Free
 *
 * App HTool_Tiktok_Prov6 tạo key dạng "HD_..." tại thiết bị,
 * build URL https://bonshop.42web.io/Key_Free/?key=HD_xxx
 * rồi rút gọn qua link4m.co (z1/h.java) cho người dùng mở.
 *
 * Trang này chỉ hiển thị key từ query để người dùng copy
 * và dán lại vào app (kích hoạt free key client-side).
 */

$key = trim((string)($_GET['key'] ?? ''));
$hasKey = $key !== '';
?>
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BON SHOP — Key Free</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
  font:15px Arial;background:radial-gradient(circle at 82% -5%,#19336b 0,transparent 32%),radial-gradient(circle at 0% 45%,#10254a 0,transparent 27%),#070b16;color:#edf2ff}
.card{width:100%;max-width:420px;padding:30px;border:1px solid #2a3e68;border-radius:24px;
  background:linear-gradient(135deg,#111f3a,#0b1426 60%,#111d37);box-shadow:0 28px 80px #0007;text-align:center}
.badge{display:inline-block;padding:7px 13px;border:1px solid #3b5fa4;border-radius:99px;color:#8fb5ff;font-size:11px;font-weight:800;letter-spacing:1.5px}
h1{font-size:26px;margin:18px 0 8px}
p{color:#9eabc0;line-height:1.7;margin:0 0 18px}
.keybox{margin:18px 0;padding:18px;border:1px dashed #3b5fa4;border-radius:16px;background:#0c1425;
  font-family:monospace;font-size:20px;font-weight:800;color:#66e3ff;word-break:break-all;letter-spacing:1px;user-select:all}
.btn{border:0;border-radius:11px;padding:13px 18px;background:#3566ff;color:#fff;font-weight:700;font-size:15px;cursor:pointer;width:100%}
.btn.copied{background:#16803c}
.hint{font-size:12px;color:#6f7f9e;margin-top:16px}
.err{color:#ff7777;font-weight:700}
.footer{margin-top:22px;font-size:11px;color:#5d6b86}
</style>
</head>
<body>
<div class="card">
  <div class="badge">✦ BON SHOP · KEY FREE</div>
  <?php if ($hasKey): ?>
    <h1>Mã kích hoạt của bạn</h1>
    <p>Sao chép mã bên dưới, quay lại app BON_TOOL và dán vào ô kích hoạt Key Free.</p>
    <div class="keybox" id="keyValue"><?= htmlspecialchars($key, ENT_QUOTES, 'UTF-8') ?></div>
    <button class="btn" id="copyBtn" onclick="copyKey()">📋 Sao chép mã</button>
    <div class="hint" id="copyHint">Nhấn vào ô mã hoặc nút bên trên để sao chép.</div>
  <?php else: ?>
    <h1 class="err">Thiếu mã key</h1>
    <p>Không tìm thấy mã kích hoạt. Vui lòng mở đúng link trong app BON_TOOL.</p>
  <?php endif; ?>
  <div class="footer">BON SHOP · Hệ sinh thái dịch vụ số</div>
</div>
<script>
function copyKey(){
  var box=document.getElementById('keyValue');
  if(!box)return;
  var text=box.textContent;
  function done(){var b=document.getElementById('copyBtn');b.textContent='✅ Đã sao chép!';b.classList.add('copied');var h=document.getElementById('copyHint');if(h)h.textContent='Dán mã vào app BON_TOOL để kích hoạt Key Free.';}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done).catch(function(){fallback(text);done();});}
  else{fallback(text);done();}
}
function fallback(text){
  var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);
}
</script>
</body>
</html>
