<?php
session_start();
$c=require __DIR__.'/config.php';
function db(): PDO {
  global $c;
  static $p = null;
  if ($p instanceof PDO) return $p;

  $d = $c['db'];

  // Render/external MySQL: prefer BON_* variables, then common MySQL env names.
  $host = getenv('BON_DB_HOST') ?: getenv('MYSQLHOST') ?: ($d['host'] ?? '');
  $port = getenv('BON_DB_PORT') ?: getenv('MYSQLPORT') ?: ($d['port'] ?? '3306');
  $name = getenv('BON_DB_NAME') ?: getenv('MYSQL_DATABASE') ?: ($d['name'] ?? '');
  $user = getenv('BON_DB_USER') ?: getenv('MYSQLUSER') ?: ($d['user'] ?? '');
  $pass = getenv('BON_DB_PASS');
  if ($pass === false) $pass = getenv('MYSQLPASSWORD');
  if ($pass === false) $pass = ($d['pass'] ?? '');

  // Do not silently connect to the Render container itself.
  if (!$host || $host === '127.0.0.1' || $host === 'localhost') {
    throw new RuntimeException(
      'BON MySQL chưa được cấu hình. Hãy đặt BON_DB_HOST, BON_DB_PORT, BON_DB_NAME, BON_DB_USER và BON_DB_PASS trong Render Environment Variables.'
    );
  }

  $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
  $p = new PDO($dsn, $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false
  ]);
  return $p;
}
function h($x){return htmlspecialchars((string)$x,ENT_QUOTES,'UTF-8');}
function money($x){return number_format((int)$x,0,',','.').' đ';}
function flash($m){$_SESSION['flash']=$m;}
function ensure_wallet_table(){
  static $done=false;if($done)return;
  db()->exec("CREATE TABLE IF NOT EXISTS wallet_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    request_type ENUM('deposit','withdraw') NOT NULL,
    amount BIGINT UNSIGNED NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NULL,
    account_name VARCHAR(190) NULL,
    note VARCHAR(255) NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    admin_note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULL,
    KEY idx_wallet_user(user_id), KEY idx_wallet_status(status),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB");
  $done=true;
}
ensure_wallet_table();
function ensure_username_column(){
  static $done=false;if($done)return;
  $p=db();
  // Không dùng INFORMATION_SCHEMA (InfinityFree treo query này) -> dùng try/catch
  try{
    $p->query("SELECT username FROM users LIMIT 1");
  }catch(Throwable $e){
    try{
      $p->exec("ALTER TABLE users ADD COLUMN username VARCHAR(50) NULL AFTER id");
      $p->exec("ALTER TABLE users ADD UNIQUE KEY uq_users_username (username)");
    }catch(Throwable $e2){}
  }
  $done=true;
}
ensure_username_column();
function ensure_job_tables(){
  static $done=false;if($done)return;
  $p=db();
  $p->exec("CREATE TABLE IF NOT EXISTS fb_jobs (
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
  $p->exec("CREATE TABLE IF NOT EXISTS tiktok_jobs (
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
  $p->exec("CREATE TABLE IF NOT EXISTS job_completions (
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
  $p->exec("CREATE TABLE IF NOT EXISTS job_reports (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    platform VARCHAR(10) NOT NULL,
    job_id BIGINT UNSIGNED NOT NULL,
    uid VARCHAR(100) NULL,
    device_hash CHAR(64) NOT NULL,
    description VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB");
  $done=true;
}
ensure_job_tables();

if(isset($_GET['logout'])){session_destroy();header('Location:index.php');exit;}
$msg=$_SESSION['flash']??'';unset($_SESSION['flash']);

if(isset($_POST['register'])){
 $username=trim($_POST['username']??'');
 $e=strtolower(trim($_POST['email']??''));$pw=$_POST['pass']??'';
 if(!preg_match('/^[A-Za-z0-9_]{3,30}$/',$username))$msg='Username 3-30 ký tự, chỉ gồm chữ, số và dấu _.';
 elseif(!filter_var($e,FILTER_VALIDATE_EMAIL)||strlen($pw)<6)$msg='Gmail/Email hoặc mật khẩu không hợp lệ.';
 else try{
   db()->prepare("INSERT INTO users(username,email,password_hash) VALUES(?,?,?)")->execute([$username,$e,password_hash($pw,PASSWORD_DEFAULT)]);
   $msg='Đăng ký thành công, hãy đăng nhập.';
 }catch(Exception $x){$msg='Username hoặc email đã tồn tại.';}
}
if(isset($_POST['login'])){
 $login=trim($_POST['login_id']??'');$pw=$_POST['pass']??'';
 $adminId=strtolower($login);
 if(filter_var($login,FILTER_VALIDATE_EMAIL) && hash_equals(strtolower($c['admin_email']),$adminId) && hash_equals($c['admin_password'],$pw)){$_SESSION=['role'=>'admin','email'=>$adminId];}
 else{
   $s=db()->prepare("SELECT * FROM users WHERE LOWER(email)=LOWER(?) OR LOWER(username)=LOWER(?) LIMIT 1");
   $s->execute([$login,$login]);$u=$s->fetch();
   if($u&&password_verify($pw,$u['password_hash']))$_SESSION=['role'=>'user','uid'=>$u['id'],'email'=>$u['email'],'username'=>$u['username']??''];
   else $msg='Sai username/email hoặc mật khẩu.';
 }
}

if(($_SESSION['role']??'')==='user'){
  $uid=(int)$_SESSION['uid'];
  if(isset($_POST['deposit_request'])){
    $bank=$_POST['bank']??'';$amount=(int)($_POST['amount']??0);$note=trim($_POST['note']??'');
    if(!isset($c['banks'][$bank])||$amount<1000)$msg='Vui lòng chọn ngân hàng và nhập số tiền hợp lệ.';
    else{db()->prepare("INSERT INTO wallet_requests(user_id,request_type,amount,bank_name,note) VALUES(?,?,?,?,?)")->execute([$uid,'deposit',$amount,$bank,$note]);$msg='Đã gửi yêu cầu nạp tiền. Chuyển khoản đúng ngân hàng và ghi chú, sau đó chờ admin duyệt.';}
  }
  if(isset($_POST['withdraw_request'])){
    $bank=trim($_POST['bank']??'');$acc=trim($_POST['account_number']??'');$name=trim($_POST['account_name']??'');$amount=(int)($_POST['amount']??0);
    if(!isset($c['banks'][$bank])||$acc===''||$name===''||$amount<(int)$c['withdraw_min'])$msg='Rút tối thiểu '.money($c['withdraw_min']).' và phải nhập đủ ngân hàng, STK, tên tài khoản.';
    else{
      $p=db();$p->beginTransaction();
      try{$s=$p->prepare("SELECT balance FROM users WHERE id=? FOR UPDATE");$s->execute([$uid]);$u=$s->fetch();
        if(!$u||$u['balance']<$amount){$p->rollBack();$msg='Số dư không đủ.';}
        else{$new=(int)$u['balance']-$amount;$p->prepare("UPDATE users SET balance=? WHERE id=?")->execute([$new,$uid]);$p->prepare("INSERT INTO wallet_requests(user_id,request_type,amount,bank_name,account_number,account_name) VALUES(?,?,?,?,?,?)")->execute([$uid,'withdraw',$amount,$bank,$acc,$name]);$p->prepare("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES(?,?,?,?,?)")->execute([$uid,-$amount,$new,'admin_adjust','Yêu cầu rút tiền']);$p->commit();$msg='Đã gửi yêu cầu rút tiền. Số dư đã giữ lại và sẽ hoàn khi admin từ chối.';}
      }catch(Exception $e){$p->rollBack();$msg='Không thể tạo yêu cầu rút tiền.';}
    }
  }
  if(isset($_POST['buy'])){
   $hours=(int)$_POST['hours'];$prices=$c['prices'];
   if(!isset($prices[$hours]))$msg='Gói không hợp lệ.';else{$price=$prices[$hours];$p=db();$p->beginTransaction();try{$s=$p->prepare("SELECT * FROM users WHERE id=? FOR UPDATE");$s->execute([$uid]);$u=$s->fetch();if(!$u||$u['balance']<$price){$p->rollBack();$msg='Số dư không đủ.';}else{$a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';do{$ps=[];for($j=0;$j<4;$j++){ $x='';for($i=0;$i<5;$i++)$x.=$a[random_int(0,strlen($a)-1)];$ps[]=$x;}$key='VIP-'.implode('-',$ps);$q=$p->prepare("SELECT id FROM vip_keys WHERE key_value=?");$q->execute([$key]);}while($q->fetch());$exp=(new DateTimeImmutable("+$hours hours"))->format('Y-m-d H:i:s');$p->prepare("UPDATE users SET balance=balance-? WHERE id=?")->execute([$price,$uid]);$p->prepare("INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,user_id,note) VALUES(?,?,?,?,?,?,?)")->execute([$key,$hours,$price,$exp,1,$uid,'Mua từ website']);$new=(int)$u['balance']-$price;$p->prepare("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES(?,?,?,?,?)")->execute([$uid,-$price,$new,'purchase','Mua Key VIP']);$p->commit();$msg="Mua thành công: $key";}}catch(Exception $e){$p->rollBack();$msg='Có lỗi khi mua Key.';}}
  }
}

if(($_SESSION['role']??'')==='admin'){
 if(isset($_POST['topup']) || isset($_POST['deduct'])){
   $uid=(int)($_POST['uid']??0);
   $amount=(int)($_POST['amount']??0);
   $action=isset($_POST['deduct'])?'deduct':'topup';
   if($uid<=0||$amount<=0){$msg='Số tiền phải lớn hơn 0.';}
   else{
     $p=db();$p->beginTransaction();
     try{
       $s=$p->prepare("SELECT balance FROM users WHERE id=? FOR UPDATE");
       $s->execute([$uid]);$u=$s->fetch();
       if(!$u){$p->rollBack();$msg='Không tìm thấy user.';}
       elseif($action==='deduct' && (int)$u['balance']<$amount){
         $p->rollBack();$msg='Không thể trừ: số dư user không đủ.';
       }else{
         $oldBalance=(int)$u['balance'];
         $new=$action==='deduct'?$oldBalance-$amount:$oldBalance+$amount;
         $p->prepare("UPDATE users SET balance=? WHERE id=?")->execute([$new,$uid]);
         $signed=$action==='deduct'?- $amount:$amount;
         $type=$action==='deduct'?'admin_adjust':'admin_topup';
         $desc=$action==='deduct'?'Admin trừ số dư':'Admin cộng số dư';
         $p->prepare("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES(?,?,?,?,?)")->execute([$uid,$signed,$new,$type,$desc]);
         $p->commit();
         $msg=$action==='deduct'?'Đã trừ số dư user.':'Đã cộng số dư.';
       }
     }catch(Exception $e){$p->rollBack();$msg='Không thể cập nhật số dư.';}
   }
}
 if(isset($_POST['wallet_action'])){
   $rid=(int)$_POST['rid'];$action=$_POST['wallet_action'];$p=db();$p->beginTransaction();
   try{$s=$p->prepare("SELECT * FROM wallet_requests WHERE id=? FOR UPDATE");$s->execute([$rid]);$r=$s->fetch();
     if(!$r||$r['status']!=='pending'){$p->rollBack();$msg='Yêu cầu không còn chờ xử lý.';}
     elseif($action==='approve'){$p->prepare("UPDATE wallet_requests SET status='approved',processed_at=NOW() WHERE id=?")->execute([$rid]);if($r['request_type']==='deposit'){$u=$p->prepare("SELECT balance FROM users WHERE id=? FOR UPDATE");$u->execute([$r['user_id']]);$usr=$u->fetch();$new=(int)$usr['balance']+(int)$r['amount'];$p->prepare("UPDATE users SET balance=? WHERE id=?")->execute([$new,$r['user_id']]);$p->prepare("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES(?,?,?,?,?)")->execute([$r['user_id'],$r['amount'],$new,'admin_topup','Nạp tiền - '.$r['bank_name']]);}$p->commit();$msg='Đã duyệt yêu cầu.';}
     elseif($action==='reject'){$p->prepare("UPDATE wallet_requests SET status='rejected',processed_at=NOW() WHERE id=?")->execute([$rid]);if($r['request_type']==='withdraw'){$u=$p->prepare("SELECT balance FROM users WHERE id=? FOR UPDATE");$u->execute([$r['user_id']]);$usr=$u->fetch();$new=(int)$usr['balance']+(int)$r['amount'];$p->prepare("UPDATE users SET balance=? WHERE id=?")->execute([$new,$r['user_id']]);$p->prepare("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES(?,?,?,?,?)")->execute([$r['user_id'],$r['amount'],$new,'admin_adjust','Hoàn tiền yêu cầu rút bị từ chối']);}$p->commit();$msg='Đã từ chối yêu cầu.';}
     else{$p->rollBack();$msg='Thao tác không hợp lệ.';}
   }catch(Exception $e){$p->rollBack();$msg='Không thể xử lý yêu cầu.';}
 }
  if(isset($_POST['extend'])){$id=(int)$_POST['id'];$hours=max(1,(int)$_POST['hours']);db()->prepare("UPDATE vip_keys SET expires_at=DATE_ADD(IF(expires_at>NOW(),expires_at,NOW()),INTERVAL ? HOUR),status='active' WHERE id=?")->execute([$hours,$id]);}
  if(isset($_POST['create_key'])){
    $hours=max(1,(int)($_POST['hours']??24));$uid=(int)($_POST['uid']??0);
    $price=max(0,(int)($_POST['price']??0));$note=trim($_POST['note']??'');
    $a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do{$ps=[];for($j=0;$j<4;$j++){ $x='';for($i=0;$i<5;$i++)$x.=$a[random_int(0,strlen($a)-1)];$ps[]=$x;}$key='VIP-'.implode('-',$ps);
      $q=db()->prepare("SELECT id FROM vip_keys WHERE key_value=?");$q->execute([$key]);}while($q->fetch());
    $exp=(new DateTimeImmutable("+$hours hours"))->format('Y-m-d H:i:s');
    db()->prepare("INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,user_id,note) VALUES(?,?,?,?,?,?,?)")->execute([$key,$hours,$price,$exp,1,$uid?$uid:null,$note]);
    $msg='Đã tạo key: '.$key;
  }
  if(isset($_POST['act'])){$id=(int)$_POST['id'];$a=$_POST['act'];if($a==='disable')db()->prepare("UPDATE vip_keys SET status='disabled' WHERE id=?")->execute([$id]);if($a==='enable')db()->prepare("UPDATE vip_keys SET status='active' WHERE id=?")->execute([$id]);if($a==='reset')db()->prepare("DELETE FROM key_devices WHERE key_id=?")->execute([$id]);if($a==='delete')db()->prepare("DELETE FROM vip_keys WHERE id=?")->execute([$id]);}
  if(isset($_POST['add_fb_job'])){
    $link=trim($_POST['link']??'');$oid=trim($_POST['object_id']??'');$type=trim($_POST['type']??'like');$reaction=trim($_POST['reaction']??'like');
    $price=max(0,(int)($_POST['price']??35));$maxUses=max(1,(int)($_POST['max_uses']??9999));
    if($link===''||$oid===''){$msg='Phải nhập Link và Object ID.';}
    else{db()->prepare("INSERT INTO fb_jobs(link,object_id,type,reaction,price,max_uses) VALUES(?,?,?,?,?,?)")->execute([$link,$oid,$type,$reaction,$price,$maxUses]);$msg='Đã thêm nhiệm vụ Facebook.';}
  }
  if(isset($_POST['add_tiktok_job'])){
    $url=trim($_POST['video_url']??'');$ads=trim($_POST['ads_id']??'');$acc=trim($_POST['account_id']??'');$price=max(0,(int)($_POST['price']??20));$maxUses=max(1,(int)($_POST['max_uses']??9999));
    if($ads===''){$msg='Phải nhập Ads ID.';}
    else{db()->prepare("INSERT INTO tiktok_jobs(video_url,ads_id,account_id,price,max_uses) VALUES(?,?,?,?,?)")->execute([$url,$ads,$acc,$price,$maxUses]);$msg='Đã thêm nhiệm vụ TikTok.';}
  }
  if(isset($_POST['job_act'])){
    $id=(int)$_POST['id'];$t=$_POST['t']??'fb';$a=$_POST['job_act'];$table=$t==='tt'?'tiktok_jobs':'fb_jobs';
    if($a==='disable')db()->prepare("UPDATE $table SET status='disabled' WHERE id=?")->execute([$id]);
    if($a==='enable')db()->prepare("UPDATE $table SET status='active' WHERE id=?")->execute([$id]);
    if($a==='delete')db()->prepare("DELETE FROM $table WHERE id=?")->execute([$id]);
    $msg='Đã cập nhật nhiệm vụ.';
  }
  if(isset($_POST['clear_completions'])){db()->exec("DELETE FROM job_completions");$msg='Đã xóa lịch sử hoàn thành.';}
 }
?>
<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BON SHOP — Nền tảng dịch vụ số</title>
<style>
*{box-sizing:border-box}body{margin:0;font:15px Arial;background:#080d1a;color:#edf2ff}.wrap{max-width:1180px;margin:auto;padding:22px}.card{background:#11192b;border:1px solid #283754;border-radius:18px;padding:20px;margin-bottom:18px;box-shadow:0 12px 35px #0004}.top{display:flex;justify-content:space-between;gap:12px;align-items:center}.balance{font-size:25px;font-weight:800;color:#66e3ff}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.plan{padding:20px;border:1px solid #31415f;border-radius:16px;background:#0c1425}.price{font-size:28px;font-weight:800}.btn,button{border:0;border-radius:10px;padding:11px 15px;background:#3566ff;color:#fff;font-weight:700;cursor:pointer}.danger{background:#b42318}.green{background:#16803c}input,select{padding:11px;border-radius:9px;border:1px solid #34445f;background:#0b1324;color:#fff}table{width:100%;border-collapse:collapse}td,th{padding:9px;border-bottom:1px solid #293753;text-align:left}.key{font-family:monospace;color:#6ee7ff}.muted{color:#9eabc0}a{color:#8fb5ff}@media(max-width:750px){.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}table{font-size:12px;display:block;overflow:auto;white-space:nowrap}.wallet-grid{grid-template-columns:1fr!important}}
.auth-card{max-width:430px;margin:60px auto}.auth-card h1{font-size:42px;margin:0 0 14px}.auth-card input{font-size:16px;min-height:52px}.switch{text-align:center;margin-top:18px;color:#9eabc0;font-size:14px}.switch a{font-weight:700;text-decoration:none;color:#8fb5ff}.admin-link{text-align:center;margin-top:28px;font-size:12px}.admin-link a{color:#6f7f9e;text-decoration:none}.notice{margin:14px 0;padding:10px;border-radius:10px;background:#17233a;color:#dce7ff}.bank{padding:15px;border:1px solid #31415f;border-radius:12px;background:#0c1425;margin:10px 0}.bank b{color:#6ee7ff}.wallet-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.small{font-size:13px}.status-pending{color:#ffd166}.status-approved{color:#65e572}.status-rejected{color:#ff7777}

.menu-toggle{position:fixed;left:16px;top:16px;z-index:1100;width:48px;height:48px;border-radius:14px;background:#3566ff;color:#fff;border:0;font-size:25px;box-shadow:0 8px 24px #0005}
.side-menu{position:fixed;left:0;top:0;bottom:0;width:290px;background:#0d1527;border-right:1px solid #283754;z-index:1200;transform:translateX(-105%);transition:.22s ease;overflow-y:auto;box-shadow:15px 0 45px #0007}
.side-menu.open{transform:translateX(0)}
.side-head{display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid #283754}
.side-title{font-size:22px;font-weight:900}
.close-menu{background:transparent;border:0;color:#fff;font-size:30px;padding:0}
.side-user{padding:22px 20px;background:#111d33;border-bottom:1px solid #283754}
.side-username{font-size:19px;font-weight:800;overflow-wrap:anywhere}
.side-balance{margin-top:7px;color:#66e3ff;font-weight:800}
.side-nav{padding:10px}
.side-nav a,.side-support a{display:block;padding:14px 12px;color:#eaf0ff;text-decoration:none;border-radius:10px}
.side-nav a:hover,.side-support a:hover{background:#17243d}
.side-support{border-top:1px solid #283754;padding:15px}
.support-title{font-weight:800;color:#9eabc0;padding:8px 12px}
.logout-link{color:#ff8b8b!important}
.menu-backdrop{display:none;position:fixed;inset:0;background:#0008;z-index:1150}
.menu-backdrop.open{display:block}
.user-main{padding-top:72px}
.quick-links{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.quick-links a{background:#182640;border:1px solid #2d4265;padding:14px;border-radius:12px;text-decoration:none;color:#fff;font-weight:700;text-align:center}
.service-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.service-box{padding:18px;background:#0c1425;border:1px solid #31415f;border-radius:12px;text-align:center;font-weight:700}
@media(max-width:650px){.service-grid{grid-template-columns:1fr 1fr}.quick-links{grid-template-columns:1fr}.menu-toggle{top:10px;left:10px}}

/* BON SHOP professional landing */
body{background:radial-gradient(circle at 82% -5%,#19336b 0,transparent 32%),radial-gradient(circle at 0% 45%,#10254a 0,transparent 27%),#070b16}
.hero-home{position:relative;overflow:hidden;padding:78px 42px 46px;border:1px solid #2a3e68;border-radius:28px;background:linear-gradient(135deg,#111f3a 0%,#0b1426 52%,#111d37 100%);box-shadow:0 28px 80px #0007}
.hero-home:before{content:"";position:absolute;width:330px;height:330px;right:-120px;top:-130px;border-radius:50%;background:#3566ff38;filter:blur(2px)}
.hero-home:after{content:"";position:absolute;width:180px;height:180px;left:-90px;bottom:-100px;border-radius:50%;background:#35b7ff20;filter:blur(5px)}
.hero-badge{position:relative;display:inline-block;padding:8px 13px;border:1px solid #3b5fa4;border-radius:99px;color:#8fb5ff;font-size:12px;font-weight:800;letter-spacing:1.5px}
.hero-home h1{position:relative;font-size:clamp(56px,10vw,96px);line-height:.9;margin:25px 0 20px;letter-spacing:-5px}
.hero-home h1 span{color:#4f7cff}.hero-lead{position:relative;max-width:740px;color:#adbad0;font-size:19px;line-height:1.75;margin:0 0 30px}
.hero-actions{position:relative;display:flex;gap:12px;flex-wrap:wrap}.hero-actions button{min-width:175px;padding:13px 18px}.hero-actions .ghost{background:transparent;border:1px solid #3a527d}
.hero-user{position:relative;margin-top:32px;color:#8e9db5;font-size:14px}.hero-user b{color:#fff}
.home-section-title{padding:40px 5px 18px}.home-section-title span{display:block;font-size:27px;font-weight:900}.home-section-title small{display:block;color:#8391aa;margin-top:7px}
.feature-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.feature-card{min-height:220px;padding:26px;border-radius:20px;border:1px solid #263754;background:linear-gradient(145deg,#101a2d,#0b1323);transition:.2s;box-shadow:0 10px 30px #0003}
.feature-card:hover{transform:translateY(-4px);border-color:#3d5f9e}.feature-main{background:linear-gradient(145deg,#142850,#0c1425);border-color:#355991}
.feature-card h3{margin:15px 0 9px;font-size:20px}.feature-card p{color:#96a5be;line-height:1.65;margin:0 0 17px}.feature-card span{color:#7893c8;font-size:12px;font-weight:800;letter-spacing:1px}
.feature-icon,.wide-icon{width:50px;height:50px;display:grid;place-items:center;border-radius:15px;background:#1a2c4e;font-size:23px}.mini-btn{padding:9px 13px;background:#1b2c4e;border:1px solid #385582}
.feature-wide{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}.feature-wide>div{padding:22px;border:1px solid #253653;border-radius:18px;background:#0d1627}
.feature-wide h3{margin:12px 0 7px;font-size:17px}.feature-wide p{color:#8493ac;line-height:1.55;margin:0;font-size:13px}.wide-icon{width:42px;height:42px;font-size:19px}
.about-strip{margin-top:16px;padding:24px;border-radius:20px;border:1px solid #253653;background:#0d1627;display:flex;justify-content:space-between;gap:20px;align-items:center}.about-strip strong{font-size:22px}.about-strip span{color:#8392ab;font-size:13px}
.stats{display:flex;gap:12px;align-items:center;flex-wrap:wrap;color:#8998b0;font-size:12px}.stats b{color:#5f86ff;font-size:18px}
.section-page{display:none}.section-page.active{display:block}.sub-section{display:none}.sub-section.show{display:block}
@media(max-width:700px){.hero-home{padding:52px 24px 32px}.hero-home h1{font-size:60px}.feature-grid,.feature-wide{grid-template-columns:1fr}.about-strip{display:block}.stats{margin-top:18px}}
.admin-head{display:flex;justify-content:space-between;align-items:center;gap:20px}.eyebrow{font-size:11px;letter-spacing:2px;color:#6e91ff;font-weight:900}.admin-logout{padding:10px 14px;border-radius:10px;background:#1a2943;color:#fff;text-decoration:none}.admin-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.stat-card{padding:18px;border:1px solid #263a5b;border-radius:16px;background:#0d1729}.stat-card span{display:block;color:#8998b0;font-size:12px}.stat-card b{display:block;font-size:28px;margin-top:7px}.admin-tabs{display:flex;gap:8px;overflow:auto;margin:16px 0;padding-bottom:4px}.admin-tab{white-space:nowrap;border:1px solid #2b4063;background:#0e182a;color:#cbd6eb;padding:11px 15px;border-radius:11px}.admin-tab.active{background:#3566ff;border-color:#3566ff;color:#fff}.admin-panel{display:none}.admin-panel.active{display:block}.inline-form{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.inline-form input{max-width:130px}.positive{color:#62e7a0}.negative{color:#ff7777}code{font-size:11px;color:#aab9d3}@media(max-width:700px){.admin-stats{grid-template-columns:1fr 1fr}.admin-head{align-items:flex-start}.admin-head h1{font-size:25px}}
</style></head><body><div class="wrap">
<?php if(empty($_SESSION['role'])): $adminLogin=isset($_GET['admin']);?>
<div class="card auth-card"><div id="loginBox"><h1><?= $adminLogin?'ADMIN LOGIN':'VIP SHOP' ?></h1><p class="muted">Đăng nhập bằng username hoặc Gmail/Email</p><?php if($msg):?><div class="notice"><?=h($msg)?></div><?php endif;?><form method="post"><input style="width:100%" type="text" name="login_id" placeholder="Username hoặc Gmail/Email" required><br><br><input style="width:100%" type="password" name="pass" placeholder="Mật khẩu" required><br><br><button name="login" style="width:100%">Đăng nhập</button></form><?php if($adminLogin):?><div class="switch"><a href="./">← Quay lại VIP Shop</a></div><?php else:?><div class="switch">Chưa có tài khoản? <a href="#" onclick="showRegister();return false;">Đăng ký</a></div><div class="admin-link"><a href="admin">Đăng nhập quản trị viên</a></div><?php endif;?></div>
<div id="registerBox" style="display:none"><h1>ĐĂNG KÝ</h1><p class="muted">Tạo tài khoản để mua Key VIP</p><?php if($msg):?><div class="notice"><?=h($msg)?></div><?php endif;?><form method="post"><input style="width:100%" type="text" name="username" placeholder="Username" pattern="[A-Za-z0-9_]{3,30}" minlength="3" maxlength="30" required><br><br><input style="width:100%" type="email" name="email" placeholder="Gmail / Email" required><br><br><input style="width:100%" type="password" name="pass" placeholder="Mật khẩu >= 6 ký tự" minlength="6" required><br><br><button name="register" style="width:100%">Đăng ký</button></form><div class="switch">Đã có tài khoản? <a href="#" onclick="showLogin();return false;">Đăng nhập</a></div></div></div>
<?php elseif($_SESSION['role']==='user'): $s=db()->prepare("SELECT * FROM users WHERE id=?");$s->execute([$_SESSION['uid']]);$u=$s->fetch();$kq=db()->prepare("SELECT * FROM vip_keys WHERE user_id=? ORDER BY id DESC LIMIT 10");$kq->execute([$u['id']]);$rq=db()->prepare("SELECT * FROM wallet_requests WHERE user_id=? ORDER BY id DESC LIMIT 10");$rq->execute([$u['id']]);?>
<button class="menu-toggle" onclick="toggleMenu()">☰</button>
<div id="sideMenu" class="side-menu">
  <div class="side-head"><div class="side-title">BON SHOP</div><button class="close-menu" onclick="toggleMenu()">×</button></div>
  <div class="side-user">
    <div class="side-username"><?=h($u['username'] ?: $u['email'])?></div>
    <div class="side-balance">Số dư <?=money($u['balance'])?></div>
  </div>
  <nav class="side-nav">
    <a href="#" onclick="showSection('home');return false;">🏠 Trang chủ</a>
    <a href="#" onclick="showSection('deposit');return false;">💰 Nạp tiền</a>
    <a href="#" onclick="showSection('withdraw');return false;">💸 Rút tiền</a>
    <a href="#" onclick="showSection('buy');return false;">🔑 Mua Key</a>
    <a href="#" onclick="showSection('social');return false;">📱 Dịch vụ MXH</a>
    <a href="#" onclick="showSection('earn');return false;">💵 Kiếm tiền</a>
    <a href="#" onclick="showSection('other');return false;">🧰 Dịch vụ khác</a>
  </nav>
  <div class="side-support">
    <div class="support-title">Hỗ trợ</div>
    <a target="_blank" rel="noopener" href="https://zalo.me/g/ognqig191">Zalo</a>
    <a target="_blank" rel="noopener" href="https://t.me/trangak2k7">Telegram</a>
    <a target="_blank" rel="noopener" href="https://youtube.com/@lanhak2k7?si=87LajB9ckrBf_GqS">YouTube</a>
    <a href="?logout" class="logout-link">Đăng xuất</a>
  </div>
</div>
<div id="menuBackdrop" class="menu-backdrop" onclick="toggleMenu()"></div>
<main class="user-main">
  <?php if($msg):?><div class="card notice"><?=h($msg)?></div><?php endif;?>
<section id="homeSection" class="section-page active">
  <div class="hero-home">
    <div class="hero-badge">✦ NỀN TẢNG DỊCH VỤ SỐ</div>
    <h1>BON <span>SHOP</span></h1>
    <p class="hero-lead">Hệ sinh thái dịch vụ số hiện đại cho MMO, mạng xã hội và kiếm tiền online — tập trung vào tốc độ, tiện lợi và trải nghiệm người dùng.</p>
    <div class="hero-actions">
      <button onclick="showSection('buy')">🔑 Mua Key VIP</button>
      <button class="ghost" onclick="showSection('social')">📱 Khám phá dịch vụ</button>
    </div>
    <div class="hero-user">Xin chào, <b><?=h($u['username'] ?: 'Bạn')?></b> · Số dư <b><?=money($u['balance'])?></b></div>
  </div>
  <div class="home-section-title"><span>Khám phá BON SHOP</span><small>Một nơi — nhiều công cụ và dịch vụ cho công việc online của bạn.</small></div>
  <div class="feature-grid">
    <div class="feature-card feature-main"><div class="feature-icon">⚡</div><h3>BONTOOL · AUTO MMO</h3><p>Các công cụ hỗ trợ tự động hóa quy trình MMO, giúp giảm thao tác lặp lại và tối ưu thời gian làm việc.</p><span>AUTO · MMO · TOOLS</span></div>
    <div class="feature-card"><div class="feature-icon">📱</div><h3>DỊCH VỤ MXH</h3><p>Dịch vụ hỗ trợ các nền tảng mạng xã hội như TikTok, Facebook, YouTube và Instagram.</p><button class="mini-btn" onclick="showSection('social')">Xem dịch vụ →</button></div>
    <div class="feature-card"><div class="feature-icon">🔑</div><h3>VIP KEY</h3><p>Mua Key VIP theo gói thời gian, quản lý key và theo dõi trạng thái ngay trong tài khoản.</p><button class="mini-btn" onclick="showSection('buy')">Xem gói →</button></div>
    <div class="feature-card"><div class="feature-icon">💰</div><h3>KIẾM TIỀN ONLINE</h3><p>Khám phá các hướng kiếm tiền như vượt link, bán Gmail, làm nhiệm vụ và các chương trình cộng tác.</p><button class="mini-btn" onclick="showSection('earn')">Khám phá →</button></div>
  </div>
  <div class="feature-wide">
    <div><div class="wide-icon">🛡️</div><h3>Giao dịch rõ ràng</h3><p>Nạp tiền, rút tiền và lịch sử số dư được quản lý trực tiếp trong tài khoản.</p></div>
    <div><div class="wide-icon">🚀</div><h3>Trải nghiệm nhanh</h3><p>Giao diện tối ưu cho điện thoại, thao tác đơn giản và dễ sử dụng.</p></div>
    <div><div class="wide-icon">💬</div><h3>Hỗ trợ</h3><p>Liên hệ Zalo, Telegram hoặc YouTube của BON SHOP khi cần hỗ trợ.</p></div>
  </div>
  <div class="about-strip"><div><strong>BON SHOP</strong><br><span>Đơn giản · Nhanh · Tiện lợi</span></div><div class="stats"><b>01</b><span>Tài khoản</span><b>02</b><span>Nạp/Rút</span><b>03</b><span>Dịch vụ</span></div></div>
</section>
<div class="card section-page" id="deposit"><h2>💰 Nạp tiền</h2><p>Chuyển khoản theo một trong các ngân hàng bên dưới. <b>Nội dung chuyển khoản phải ghi đúng tên tài khoản/username của bạn</b> (ví dụ: <b>akklanh84</b>). Sau khi chuyển, gửi yêu cầu nạp tiền để admin kiểm tra và cộng số dư.</p><?php foreach($c['banks'] as $bn=>$b):?><div class="bank"><b>Ngân hàng: <?=h($bn)?></b><br>STK: <b><?=h($b['account'])?></b><br>Tên: <b><?=h($b['name'])?></b></div><?php endforeach;?><form method="post" class="wallet-grid"><div><label>Ngân hàng nhận</label><br><select name="bank" style="width:100%" required><?php foreach($c['banks'] as $bn=>$b):?><option><?=h($bn)?></option><?php endforeach;?></select></div><div><label>Số tiền đã chuyển</label><br><input name="amount" type="number" min="1000" step="1000" placeholder="Ví dụ 50000" style="width:100%" required></div><div style="grid-column:1/-1"><label>Nội dung chuyển khoản</label><br><input name="note" placeholder="Ví dụ: akklanh84" style="width:100%" required></div><div style="grid-column:1/-1"><button name="deposit_request">Tôi đã chuyển khoản - Gửi yêu cầu nạp</button></div></form></div>
<div class="card section-page" id="withdraw"><h2>💸 Rút tiền</h2><p class="muted">Số tiền rút tối thiểu: <b><?=money($c['withdraw_min'])?></b>. Tiền sẽ được giữ lại khi gửi yêu cầu; nếu admin từ chối, hệ thống hoàn lại số dư.</p><form method="post" class="wallet-grid"><div><label>Ngân hàng</label><br><select name="bank" style="width:100%" required><?php foreach($c['banks'] as $bn=>$b):?><option><?=h($bn)?></option><?php endforeach;?></select></div><div><label>Số tiền rút</label><br><input name="amount" type="number" min="10000" step="1000" placeholder="Tối thiểu 10000" style="width:100%" required></div><div><label>Số tài khoản</label><br><input name="account_number" style="width:100%" required></div><div><label>Tên chủ tài khoản</label><br><input name="account_name" style="width:100%" required></div><div style="grid-column:1/-1"><button name="withdraw_request">Gửi yêu cầu rút tiền</button></div></form></div>
<div class="card"><h2>📋 Yêu cầu nạp/rút gần đây</h2><table><tr><th>Loại</th><th>Số tiền</th><th>Ngân hàng</th><th>STK</th><th>Trạng thái</th><th>Thời gian</th></tr><?php foreach($rq as $r):?><tr><td><?= $r['request_type']==='deposit'?'Nạp':'Rút' ?></td><td><?=money($r['amount'])?></td><td><?=h($r['bank_name'])?></td><td><?=h($r['account_number']??'-')?></td><td class="status-<?=h($r['status'])?>"><?=h($r['status'])?></td><td><?=h($r['created_at'])?></td></tr><?php endforeach;?></table></div>
<div class="card section-page" id="buy"><h2>🛒 Mua Key VIP</h2><div class="grid"><?php foreach([[24,'1 ngày'],[720,'30 ngày'],[2160,'90 ngày']] as [$hours,$name]):$price=$c['prices'][$hours];?><div class="plan"><h2><?=$name?></h2><div class="price"><?=money($price)?></div><p class="muted"><?=$hours?> giờ VIP</p><form method="post"><input type="hidden" name="hours" value="<?=$hours?>"><button name="buy" style="width:100%">Mua ngay</button></form></div><?php endforeach;?></div></div>
<div class="card section-page" id="social"><h2>📱 Dịch vụ MXH</h2><p class="muted">Khu vực dịch vụ mạng xã hội. Hiện đang cập nhật sản phẩm.</p><div class="service-grid"><div class="service-box">TikTok</div><div class="service-box">Facebook</div><div class="service-box">YouTube</div><div class="service-box">Instagram</div></div></div>
<div class="card section-page" id="earn"><h2>💵 Kiếm tiền</h2><p class="muted">Khu vực chương trình kiếm tiền / cộng tác viên. Sắp cập nhật.</p></div>
<div class="card section-page" id="other"><h2>🧰 Dịch vụ khác</h2><p class="muted">Các dịch vụ khác sẽ được bổ sung tại đây.</p></div>
<div class="card"><h2>🔑 Key của tôi</h2><table><tr><th>Key</th><th>Gói</th><th>Hết hạn</th><th>Trạng thái</th></tr><?php foreach($kq as $k):?><tr><td class="key"><?=h($k['key_value'])?></td><td><?=h($k['duration_hours'])?>h / <?=money($k['price'])?></td><td><?=h($k['expires_at'])?></td><td><?=h($k['status'])?></td></tr><?php endforeach;?></table></div>
</main>
<?php else:?>
<?php
$adminUsers=db()->query("SELECT id,username,email,role,balance,created_at FROM users ORDER BY id DESC")->fetchAll();
$adminKeys=db()->query("SELECT k.*,u.username,u.email FROM vip_keys k LEFT JOIN users u ON u.id=k.user_id ORDER BY k.id DESC")->fetchAll();
$adminDevices=db()->query("SELECT d.*,k.key_value,u.username,u.email FROM key_devices d JOIN vip_keys k ON k.id=d.key_id LEFT JOIN users u ON u.id=k.user_id ORDER BY d.id DESC")->fetchAll();
$adminTx=db()->query("SELECT t.*,u.username,u.email FROM balance_transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 200")->fetchAll();
$adminWallet=db()->query("SELECT r.*,u.username,u.email FROM wallet_requests r JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 200")->fetchAll();
$adminFbJobs=db()->query("SELECT * FROM fb_jobs ORDER BY id DESC LIMIT 200")->fetchAll();
$adminTtJobs=db()->query("SELECT * FROM tiktok_jobs ORDER BY id DESC LIMIT 200")->fetchAll();
$adminJobsDone=db()->query("SELECT c.*,u.username FROM job_completions c LEFT JOIN users u ON u.id=c.user_id ORDER BY c.id DESC LIMIT 100")->fetchAll();
$adminJobReports=db()->query("SELECT * FROM job_reports ORDER BY id DESC LIMIT 50")->fetchAll();
?>
<div class="admin-head card"><div><div class="eyebrow">BON SHOP · CONTROL CENTER</div><h1>👑 Quản trị hệ thống</h1><p class="muted"><?=h($_SESSION['email'])?></p></div><a class="admin-logout" href="?logout">Đăng xuất</a></div>
<?php if($msg):?><div class="card notice"><?=h($msg)?></div><?php endif;?>
<div class="admin-stats"><div class="stat-card"><span>Users</span><b><?=count($adminUsers)?></b></div><div class="stat-card"><span>VIP Keys</span><b><?=count($adminKeys)?></b></div><div class="stat-card"><span>Thiết bị</span><b><?=count($adminDevices)?></b></div><div class="stat-card"><span>Yêu cầu ví</span><b><?=count($adminWallet)?></b></div></div>
<div class="admin-tabs"><button class="admin-tab active" onclick="adminTab('users',this)">👤 Users</button><button class="admin-tab" onclick="adminTab('keys',this)">🔑 VIP Keys</button><button class="admin-tab" onclick="adminTab('devices',this)">📱 Devices</button><button class="admin-tab" onclick="adminTab('wallet',this)">💳 Nạp/Rút</button><button class="admin-tab" onclick="adminTab('transactions',this)">📊 Giao dịch</button><button class="admin-tab" onclick="adminTab('jobs',this)">⚙️ Nhiệm vụ</button></div>
<section id="admin-users" class="admin-panel active"><div class="card"><h2>👤 Quản lý Users</h2><table><tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Số dư</th><th>Tạo lúc</th><th>Điều chỉnh</th></tr><?php foreach($adminUsers as $usr):?><tr><td><?=h($usr['id'])?></td><td><b><?=h($usr['username'] ?: '-')?></b></td><td><?=h($usr['email'])?></td><td><?=h($usr['role'])?></td><td><b><?=money($usr['balance'])?></b></td><td><?=h($usr['created_at'])?></td><td><form method="post" class="inline-form"><input type="hidden" name="uid" value="<?=$usr['id']?>"><input type="number" name="amount" min="1" step="1000" placeholder="VNĐ" required><button name="topup" value="1">+ Cộng</button><button class="danger" name="deduct" value="1" onclick="return confirm('Xác nhận trừ số dư user này?')">− Trừ</button></form></td></tr><?php endforeach;?></table></div></section>
<section id="admin-keys" class="admin-panel"><div class="card"><h2>🔑 VIP Keys</h2>
<div class="card" style="margin:0 0 14px;background:#0d1729;border:1px solid #2a3f63"><h3 style="margin:0 0 10px">➕ Tạo Key VIP mới</h3><form method="post" class="wallet-grid"><div><label>Gán cho user</label><br><select name="uid" style="width:100%"><option value="0">— Chưa gán (key tự do) —</option><?php foreach($adminUsers as $usr):?><option value="<?=$usr['id']?>"><?=h($usr['username'] ?: $usr['email'])?></option><?php endforeach;?></select></div><div><label>Số giờ</label><br><input name="hours" type="number" min="1" value="720" style="width:100%" required></div><div><label>Giá ghi trên key</label><br><input name="price" type="number" min="0" value="50000" style="width:100%"></div><div><label>Ghi chú</label><br><input name="note" placeholder="Ví dụ: Key tặng" style="width:100%"></div><div style="grid-column:1/-1"><button name="create_key">+ Tạo Key</button></div></form></div>
<table><tr><th>ID</th><th>Key</th><th>Gói</th><th>Giá</th><th>User</th><th>Hết hạn</th><th>Thiết bị</th><th>Trạng thái</th><th>Thao tác</th></tr><?php foreach($adminKeys as $k):?><tr><td><?=h($k['id'])?></td><td class="key"><?=h($k['key_value'])?></td><td><?=h($k['duration_hours'])?>h</td><td><?=money($k['price'])?></td><td><?=h($k['username'] ?: ($k['email']??'-'))?></td><td><?=h($k['expires_at'] ?: '-')?></td><td><?=h($k['device_limit'])?></td><td><?=h($k['status'])?></td><td><form method="post" class="inline-form"><input type="hidden" name="id" value="<?=$k['id']?>"><input name="hours" type="number" min="1" value="24" style="width:65px"><button name="extend">+ giờ</button><?php if($k['status']==='active'):?><button class="danger" name="act" value="disable">Khóa</button><?php else:?><button class="green" name="act" value="enable">Mở</button><?php endif;?><button name="act" value="reset">Reset</button><button class="danger" name="act" value="delete" onclick="return confirm('Xóa key này?')">Xóa</button></form></td></tr><?php endforeach;?></table></div></section>
<section id="admin-devices" class="admin-panel"><div class="card"><h2>📱 Key Devices</h2><p class="muted">Thiết bị đã kích hoạt key. Device hash được hiển thị rút gọn.</p><table><tr><th>ID</th><th>Key</th><th>User</th><th>Device</th><th>First seen</th><th>Last seen</th></tr><?php foreach($adminDevices as $d):?><tr><td><?=h($d['id'])?></td><td class="key"><?=h($d['key_value'])?></td><td><?=h($d['username'] ?: ($d['email']??'-'))?></td><td><code><?=h(substr($d['device_hash'],0,16))?>…</code></td><td><?=h($d['first_seen'])?></td><td><?=h($d['last_seen'])?></td></tr><?php endforeach;?></table></div></section>
<section id="admin-wallet" class="admin-panel"><div class="card"><h2>💳 Yêu cầu Nạp / Rút</h2><table><tr><th>ID</th><th>User</th><th>Loại</th><th>Số tiền</th><th>Ngân hàng</th><th>STK</th><th>Tên</th><th>Nội dung</th><th>Trạng thái</th><th>Xử lý</th></tr><?php foreach($adminWallet as $r):?><tr><td><?=h($r['id'])?></td><td><?=h($r['username'] ?: $r['email'])?></td><td><?=$r['request_type']==='deposit'?'Nạp':'Rút'?></td><td><?=money($r['amount'])?></td><td><?=h($r['bank_name'])?></td><td><?=h($r['account_number']??'-')?></td><td><?=h($r['account_name']??'-')?></td><td><?=h($r['note']??'-')?></td><td class="status-<?=h($r['status'])?>"><?=h($r['status'])?></td><td><?php if($r['status']==='pending'):?><form method="post" class="inline-form"><input type="hidden" name="rid" value="<?=$r['id']?>"><button class="green" name="wallet_action" value="approve">Duyệt</button><button class="danger" name="wallet_action" value="reject">Từ chối</button></form><?php else:?>Đã xử lý<?php endif;?></td></tr><?php endforeach;?></table></div></section>
<section id="admin-transactions" class="admin-panel"><div class="card"><h2>📊 Lịch sử số dư</h2><table><tr><th>ID</th><th>User</th><th>Amount</th><th>Balance after</th><th>Type</th><th>Mô tả</th><th>Thời gian</th></tr><?php foreach($adminTx as $t):?><tr><td><?=h($t['id'])?></td><td><?=h($t['username'] ?: $t['email'])?></td><td class="<?=((int)$t['amount']<0?'negative':'positive')?>"><?=money($t['amount'])?></td><td><?=money($t['balance_after'])?></td><td><?=h($t['type'])?></td><td><?=h($t['description']??'-')?></td><td><?=h($t['created_at'])?></td></tr><?php endforeach;?></table></div></section>
<section id="admin-jobs" class="admin-panel">
<div class="card"><h2>⚙️ Nhiệm vụ Facebook (GoLike FB)</h2><p class="muted">Kho job cho auto tool GoLike Facebook. App gọi <code>api_golike_fb.php?action=get_jobs</code> để nhận job này.</p>
<form method="post" class="wallet-grid">
<div><label>Link bài viết</label><br><input name="link" placeholder="https://www.facebook.com/..." style="width:100%" required></div>
<div><label>Object ID</label><br><input name="object_id" placeholder="Facebook post id" style="width:100%" required></div>
<div><label>Loại</label><br><select name="type" style="width:100%"><option value="like">like</option><option value="share">share</option><option value="comment">comment</option><option value="follow">follow</option></select></div>
<div><label>Reaction</label><br><select name="reaction" style="width:100%"><option value="like">like</option><option value="love">love</option><option value="haha">haha</option><option value="wow">wow</option><option value="sad">sad</option><option value="angry">angry</option><option value="share">share</option></select></div>
<div><label>Giá (xu)</label><br><input name="price" type="number" min="1" value="35" style="width:100%" required></div>
<div><label>Số lượt tối đa</label><br><input name="max_uses" type="number" min="1" value="9999" style="width:100%" required></div>
<div style="grid-column:1/-1"><button name="add_fb_job">+ Thêm nhiệm vụ Facebook</button></div>
</form>
<table><tr><th>ID</th><th>Link</th><th>Object ID</th><th>Loại</th><th>Reaction</th><th>Giá</th><th>Đã dùng</th><th>Trạng thái</th><th>Thao tác</th></tr><?php foreach($adminFbJobs as $j):?><tr><td><?=h($j['id'])?></td><td><a target="_blank" rel="noopener" href="<?=h($j['link'])?>">mở</a></td><td><code><?=h($j['object_id'])?></code></td><td><?=h($j['type'])?></td><td><?=h($j['reaction'])?></td><td><?=h($j['price'])?></td><td><?=h($j['used_count'])?>/<?=h($j['max_uses'])?></td><td><?=h($j['status'])?></td><td><form method="post" class="inline-form"><input type="hidden" name="id" value="<?=$j['id']?>"><input type="hidden" name="t" value="fb"><?php if($j['status']==='active'):?><button class="danger" name="job_act" value="disable">Khóa</button><?php else:?><button class="green" name="job_act" value="enable">Mở</button><?php endif;?><button class="danger" name="job_act" value="delete" onclick="return confirm('Xóa nhiệm vụ này?')">Xóa</button></form></td></tr><?php endforeach;?></table></div>
<div class="card"><h2>⚙️ Nhiệm vụ TikTok</h2><p class="muted">Kho job TikTok cho auto tool. App gọi <code>api_golike_tiktok.php?action=complete_job&ads_id=...</code></p>
<form method="post" class="wallet-grid">
<div><label>Link video</label><br><input name="video_url" placeholder="https://www.tiktok.com/..." style="width:100%"></div>
<div><label>Ads ID</label><br><input name="ads_id" placeholder="TikTok video id" style="width:100%" required></div>
<div><label>Account ID</label><br><input name="account_id" placeholder="Account id" style="width:100%"></div>
<div><label>Giá (xu)</label><br><input name="price" type="number" min="1" value="20" style="width:100%" required></div>
<div><label>Số lượt tối đa</label><br><input name="max_uses" type="number" min="1" value="9999" style="width:100%" required></div>
<div style="grid-column:1/-1"><button name="add_tiktok_job">+ Thêm nhiệm vụ TikTok</button></div>
</form>
<table><tr><th>ID</th><th>Ads ID</th><th>Account</th><th>Giá</th><th>Đã dùng</th><th>Trạng thái</th><th>Thao tác</th></tr><?php foreach($adminTtJobs as $j):?><tr><td><?=h($j['id'])?></td><td><code><?=h($j['ads_id'])?></code></td><td><?=h($j['account_id'])?></td><td><?=h($j['price'])?></td><td><?=h($j['used_count'])?>/<?=h($j['max_uses'])?></td><td><?=h($j['status'])?></td><td><form method="post" class="inline-form"><input type="hidden" name="id" value="<?=$j['id']?>"><input type="hidden" name="t" value="tt"><?php if($j['status']==='active'):?><button class="danger" name="job_act" value="disable">Khóa</button><?php else:?><button class="green" name="job_act" value="enable">Mở</button><?php endif;?><button class="danger" name="job_act" value="delete" onclick="return confirm('Xóa nhiệm vụ này?')">Xóa</button></form></td></tr><?php endforeach;?></table></div>
<div class="card"><h2>🕒 Nhiệm vụ đã hoàn thành <span style="float:right"><form method="post" style="display:inline"><button class="danger" name="clear_completions" onclick="return confirm('Xóa toàn bộ lịch sử hoàn thành?')">Xóa lịch sử</button></form></span></h2><table><tr><th>ID</th><th>Nền tảng</th><th>Job ID</th><th>User</th><th>Xu</th><th>Thiết bị</th><th>Thời gian</th></tr><?php foreach($adminJobsDone as $c):?><tr><td><?=h($c['id'])?></td><td><?=h(strtoupper($c['platform']))?></td><td><?=h($c['job_id'])?></td><td><?=h($c['username'] ?: '-')?></td><td><?=h($c['amount'])?></td><td><code><?=h(substr($c['device_hash'],0,12))?>…</code></td><td><?=h($c['created_at'])?></td></tr><?php endforeach;?></table></div>
<div class="card"><h2>🚩 Báo cáo lỗi job</h2><table><tr><th>ID</th><th>Nền tảng</th><th>Job ID</th><th>UID</th><th>Mô tả</th><th>Thiết bị</th><th>Thời gian</th></tr><?php foreach($adminJobReports as $r):?><tr><td><?=h($r['id'])?></td><td><?=h(strtoupper($r['platform']))?></td><td><?=h($r['job_id'])?></td><td><?=h($r['uid'] ?: '-')?></td><td><?=h($r['description'] ?: '-')?></td><td><code><?=h(substr($r['device_hash'],0,12))?>…</code></td><td><?=h($r['created_at'])?></td></tr><?php endforeach;?></table></div>
</section>
<?php endif;?></div>
<script>
function adminTab(name,btn){document.querySelectorAll('.admin-panel').forEach(function(x){x.classList.remove('active')});var el=document.getElementById('admin-'+name);if(el)el.classList.add('active');document.querySelectorAll('.admin-tab').forEach(function(x){x.classList.remove('active')});if(btn)btn.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});}

function showSection(name){
 document.querySelectorAll('.section-page').forEach(function(el){el.classList.remove('active');});
 var home=document.getElementById('homeSection');
 if(name==='home'){if(home)home.classList.add('active');}
 else{var el=document.getElementById(name);if(el)el.classList.add('active');}
 document.querySelectorAll('.sub-section').forEach(function(el){el.classList.remove('show');});
 if(name==='deposit')document.querySelectorAll('.deposit-sub').forEach(function(el){el.classList.add('show');});
 if(name==='buy')document.querySelectorAll('.buy-sub').forEach(function(el){el.classList.add('show');});
 var m=document.getElementById('sideMenu'),b=document.getElementById('menuBackdrop');
 if(m){m.classList.remove('open');if(b)b.classList.remove('open');}
 window.scrollTo({top:0,behavior:'smooth'});
}
function toggleMenu(){
 const m=document.getElementById('sideMenu'),b=document.getElementById('menuBackdrop');
 if(!m)return;
 m.classList.toggle('open');b.classList.toggle('open');
}
function showRegister(){document.getElementById('loginBox').style.display='none';document.getElementById('registerBox').style.display='block'}function showLogin(){document.getElementById('registerBox').style.display='none';document.getElementById('loginBox').style.display='block'}</script>
</body></html>
