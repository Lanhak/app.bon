<?php
session_start();
$c=require __DIR__.'/config.php';

/*
 * BON SHOP - SQLite edition
 * No MySQL/Render environment variables are required.
 * The database is stored in /var/data/bon.sqlite when that directory exists
 * (recommended with a Render Persistent Disk), otherwise ./data/bon.sqlite.
 */
function db(): PDO {
  static $p = null;
  if ($p instanceof PDO) return $p;

  $dir = is_dir('/var/data') && is_writable('/var/data')
       ? '/var/data'
       : __DIR__.'/data';

  if (!is_dir($dir)) @mkdir($dir, 0775, true);

  $file = $dir.'/bon.sqlite';
  $p = new PDO('sqlite:'.$file, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false
  ]);
  $p->exec("PRAGMA foreign_keys = ON");
  return $p;
}
function h($x){return htmlspecialchars((string)$x,ENT_QUOTES,'UTF-8');}
function money($x){return number_format((int)$x,0,',','.').' đ';}
function flash($m){$_SESSION['flash']=$m;}

function table_columns(PDO $p,$table){
  $out=[];
  foreach($p->query("PRAGMA table_info(".preg_replace('/[^A-Za-z0-9_]/','',$table).")") as $r)$out[]=$r['name'];
  return $out;
}
function add_col_if_missing(PDO $p,$table,$col,$definition){
  $cols=table_columns($p,$table);
  if(!in_array($col,$cols,true)){
    $safeTable=preg_replace('/[^A-Za-z0-9_]/','',$table);
    $safeCol=preg_replace('/[^A-Za-z0-9_]/','',$col);
    $p->exec("ALTER TABLE {$safeTable} ADD COLUMN {$safeCol} {$definition}");
  }
}
function ensure_schema(){
  static $done=false;if($done)return;
  $p=db();

  $p->exec("CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    balance INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )");

  $p->exec("CREATE TABLE IF NOT EXISTS vip_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_value TEXT UNIQUE NOT NULL,
    duration_hours INTEGER NOT NULL DEFAULT 24,
    price INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NULL,
    device_limit INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER NULL,
    note TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
  )");

  $p->exec("CREATE TABLE IF NOT EXISTS key_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id INTEGER NOT NULL,
    device_hash TEXT NOT NULL,
    first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(key_id,device_hash),
    FOREIGN KEY(key_id) REFERENCES vip_keys(id) ON DELETE CASCADE
  )");

  $p->exec("CREATE TABLE IF NOT EXISTS balance_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )");

  $p->exec("CREATE TABLE IF NOT EXISTS wallet_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    request_type TEXT NOT NULL CHECK(request_type IN ('deposit','withdraw')),
    amount INTEGER NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NULL,
    account_name TEXT NULL,
    note TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    admin_note TEXT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )");

  $p->exec("CREATE TABLE IF NOT EXISTS fb_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link TEXT NOT NULL,
    object_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'like',
    reaction TEXT NOT NULL DEFAULT 'like',
    price INTEGER NOT NULL DEFAULT 35,
    max_uses INTEGER NOT NULL DEFAULT 9999,
    used_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )");

  $p->exec("CREATE TABLE IF NOT EXISTS tiktok_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_url TEXT NOT NULL,
    ads_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 20,
    max_uses INTEGER NOT NULL DEFAULT 9999,
    used_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )");

  $p->exec("CREATE TABLE IF NOT EXISTS job_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    job_id INTEGER NOT NULL,
    device_hash TEXT NOT NULL,
    user_id INTEGER NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'done',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform,job_id,device_hash)
  )");

  $p->exec("CREATE TABLE IF NOT EXISTS job_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    job_id INTEGER NOT NULL,
    uid TEXT NULL,
    device_hash TEXT NOT NULL,
    description TEXT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )");

  /* Compatibility with databases/files from the old MySQL version. */
  add_col_if_missing($p,'users','username','TEXT');
  add_col_if_missing($p,'users','role',"TEXT NOT NULL DEFAULT 'user'");
  add_col_if_missing($p,'users','balance','INTEGER NOT NULL DEFAULT 0');
  add_col_if_missing($p,'users','created_at',"TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");

  $done=true;
}
ensure_schema();

/* SQLite replacements for the old ensure_* functions. */
function ensure_wallet_table(){ ensure_schema(); }
function ensure_username_column(){ ensure_schema(); }
function ensure_job_tables(){ ensure_schema(); }

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
      try{
        $s=$p->prepare("SELECT balance FROM users WHERE id=?");$s->execute([$uid]);$u=$s->fetch();
        if(!$u||$u['balance']<$amount){$p->rollBack();$msg='Số dư không đủ.';}
        else{
          $new=(int)$u['balance']-$amount;
          $p->prepare("UPDATE users SET balance=? WHERE id=?")->execute([$new,$uid]);
          $p->prepare("INSERT INTO wallet_requests(user_id,request_type,amount,bank_name,account_number,account_name) VALUES(?,?,?,?,?,?)")->execute([$uid,'withdraw',$amount,$bank,$acc,$name]);
          $p->prepare("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES(?,?,?,?,?)")->execute([$uid,-$amount,$new,'admin_adjust','Yêu cầu rút tiền']);
          $p->commit();$msg='Đã gửi yêu cầu rút tiền. Số dư đã giữ lại và sẽ hoàn khi admin từ chối.';
        }
      }catch(Exception $e){if($p->inTransaction())$p->rollBack();$msg='Không thể tạo yêu cầu rút tiền.';}
    }
  }
  if(isset($_POST['buy'])){
   $hours=(int)$_POST['hours'];$prices=$c['prices'];
   if(!isset($prices[$hours]))$msg='Gói không hợp lệ.';
   else{
     $price=$prices[$hours];$p=db();$p->beginTransaction();
     try{
       $s=$p->prepare("SELECT * FROM users WHERE id=?");$s->execute([$uid]);$u=$s->fetch();
       if(!$u||$u['balance']<$price){$p->rollBack();$msg='Số dư không đủ.';}
       else{
         $a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
         do{
           $ps=[];for($j=0;$j<4;$j++){ $x='';for($i=0;$i<5;$i++)$x.=$a[random_int(0,strlen($a)-1)];$ps[]=$x;}
           $key='VIP-'.implode('-',$ps);
           $q=$p->prepare("SELECT id FROM vip_keys WHERE key_value=?");$q->execute([$key]);
         }while($q->fetch());
         $exp=(new DateTimeImmutable("+$hours hours"))->format('Y-m-d H:i:s');
         $p->prepare("UPDATE users SET balance=balance-? WHERE id=?")->execute([$price,$uid]);
         $p->prepare("INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,user_id,note) VALUES(?,?,?,?,?,?,?)")->execute([$key,$hours,$price,$exp,1,$uid,'Mua từ website']);
         $new=(int)$u['balance']-$price;
         $p->prepare("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES(?,?,?,?,?)")->execute([$uid,-$price,$new,'purchase','Mua Key VIP']);
         $p->commit();$msg="Mua thành công: $key";
       }
     }catch(Exception $e){if($p->inTransaction())$p->rollBack();$msg='Có lỗi khi mua Key.';}
   }
  }
}

if(($_SESSION['role']??'')==='admin'){
 if(isset($_POST['topup']) || isset($_POST['deduct'])){
   $uid=(int)($_POST['uid']??0);$amount=(int)($_POST['amount']??0);$action=isset($_POST['deduct'])?'deduct':'topup';
   if($uid<=0||$amount<=0){$msg='Số tiền phải lớn hơn 0.';}
   else{
     $p=db();$p->beginTransaction();
     try{
       $s=$p->prepare("SELECT balance FROM users WHERE id=?");$s->execute([$uid]);$u=$s->fetch();
       if(!$u){$p->rollBack();$msg='Không tìm thấy user.';}
       elseif($action==='deduct' && (int)$u['balance']<$amount){$p->rollBack();$msg='Không thể trừ: số dư user không đủ.';}
       else{
         $oldBalance=(int)$u['balance'];$new=$action==='deduct'?$oldBalance-$amount:$oldBalance+$amount;
         $p->prepare("UPDATE users SET balance=? WHERE id=?")->execute([$new,$uid]);
         $signed=$action==='deduct'?- $amount:$amount;$type=$action==='deduct'?'admin_adjust':'admin_topup';$desc=$action==='deduct'?'Admin trừ số dư':'Admin cộng số dư';
         $p->prepare("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES(?,?,?,?,?)")->execute([$uid,$signed,$new,$type,$desc]);
         $p->commit();$msg=$action==='deduct'?'Đã trừ số dư user.':'Đã cộng số dư.';
       }
     }catch(Exception $e){if($p->inTransaction())$p->rollBack();$msg='Không thể cập nhật số dư.';}
   }
 }
 if(isset($_POST['wallet_action'])){
   $rid=(int)$_POST['rid'];$action=$_POST['wallet_action'];$p=db();$p->beginTransaction();
   try{
     $s=$p->prepare("SELECT * FROM wallet_requests WHERE id=?");$s->execute([$rid]);$r=$s->fetch();
     if(!$r||$r['status']!=='pending'){$p->rollBack();$msg='Yêu cầu không còn chờ xử lý.';}
     elseif($action==='approve'){
       $p->prepare("UPDATE wallet_requests SET status='approved',processed_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$rid]);
       if($r['request_type']==='deposit'){
         $u=$p->prepare("SELECT balance FROM users WHERE id=?");$u->execute([$r['user_id']]);$usr=$u->fetch();
         $new=(int)$usr['balance']+(int)$r['amount'];
         $p->prepare("UPDATE users SET balance=? WHERE id=?")->execute([$new,$r['user_id']]);
         $p->prepare("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES(?,?,?,?,?)")->execute([$r['user_id'],$r['amount'],$new,'admin_topup','Nạp tiền - '.$r['bank_name']]);
       }
       $p->commit();$msg='Đã duyệt yêu cầu.';
     }elseif($action==='reject'){
       $p->prepare("UPDATE wallet_requests SET status='rejected',processed_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$rid]);
       if($r['request_type']==='withdraw'){
         $u=$p->prepare("SELECT balance FROM users WHERE id=?");$u->execute([$r['user_id']]);$usr=$u->fetch();
         $new=(int)$usr['balance']+(int)$r['amount'];
         $p->prepare("UPDATE users SET balance=? WHERE id=?")->execute([$new,$r['user_id']]);
         $p->prepare("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES(?,?,?,?,?)")->execute([$r['user_id'],$r['amount'],$new,'admin_adjust','Hoàn tiền yêu cầu rút bị từ chối']);
       }
       $p->commit();$msg='Đã từ chối yêu cầu.';
     }else{$p->rollBack();$msg='Thao tác không hợp lệ.';}
   }catch(Exception $e){if($p->inTransaction())$p->rollBack();$msg='Không thể xử lý yêu cầu.';}
 }
 if(isset($_POST['extend'])){
   $id=(int)$_POST['id'];$hours=max(1,(int)$_POST['hours']);
   db()->prepare("UPDATE vip_keys SET expires_at=datetime(CASE WHEN expires_at>datetime('now') THEN expires_at ELSE datetime('now') END, '+' || ? || ' hours'),status='active' WHERE id=?")->execute([$hours,$id]);
 }
 if(isset($_POST['create_key'])){
   $hours=max(1,(int)($_POST['hours']??24));$uid=(int)($_POST['uid']??0);$price=max(0,(int)($_POST['price']??0));$note=trim($_POST['note']??'');$a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
   do{$ps=[];for($j=0;$j<4;$j++){ $x='';for($i=0;$i<5;$i++)$x.=$a[random_int(0,strlen($a)-1)];$ps[]=$x;}$key='VIP-'.implode('-',$ps);$q=db()->prepare("SELECT id FROM vip_keys WHERE key_value=?");$q->execute([$key]);}while($q->fetch());
   $exp=(new DateTimeImmutable("+$hours hours"))->format('Y-m-d H:i:s');
   db()->prepare("INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,user_id,note) VALUES(?,?,?,?,?,?,?)")->execute([$key,$hours,$price,$exp,1,$uid?$uid:null,$note]);$msg='Đã tạo key: '.$key;
 }
 if(isset($_POST['act'])){
   $id=(int)$_POST['id'];$a=$_POST['act'];
   if($a==='disable')db()->prepare("UPDATE vip_keys SET status='disabled' WHERE id=?")->execute([$id]);
   if($a==='enable')db()->prepare("UPDATE vip_keys SET status='active' WHERE id=?")->execute([$id]);
   if($a==='reset')db()->prepare("DELETE FROM key_devices WHERE key_id=?")->execute([$id]);
   if($a==='delete')db()->prepare("DELETE FROM vip_keys WHERE id=?")->execute([$id]);
 }
 if(isset($_POST['add_fb_job'])){
   $link=trim($_POST['link']??'');$oid=trim($_POST['object_id']??'');$type=trim($_POST['type']??'like');$reaction=trim($_POST['reaction']??'like');$price=max(0,(int)($_POST['price']??35));$maxUses=max(1,(int)($_POST['max_uses']??9999));
   if($link===''||$oid==='')$msg='Phải nhập Link và Object ID.';
   else{db()->prepare("INSERT INTO fb_jobs(link,object_id,type,reaction,price,max_uses) VALUES(?,?,?,?,?,?)")->execute([$link,$oid,$type,$reaction,$price,$maxUses]);$msg='Đã thêm nhiệm vụ Facebook.';}
 }
 if(isset($_POST['add_tiktok_job'])){
   $url=trim($_POST['video_url']??'');$ads=trim($_POST['ads_id']??'');$acc=trim($_POST['account_id']??'');$price=max(0,(int)($_POST['price']??20));$maxUses=max(1,(int)($_POST['max_uses']??9999));
   if($ads==='')$msg='Phải nhập Ads ID.';
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

<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BON SHOP</title>
<style>
*{box-sizing:border-box}body{margin:0;font:15px Arial;background:#070b16;color:#edf2ff}.wrap{max-width:1180px;margin:auto;padding:22px}.card{background:#11192b;border:1px solid #283754;border-radius:18px;padding:20px;margin-bottom:18px;box-shadow:0 12px 35px #0004}.btn,button{border:0;border-radius:10px;padding:11px 15px;background:#3566ff;color:#fff;font-weight:700;cursor:pointer}button.danger{background:#b42318}button.green{background:#16803c}input,select{padding:11px;border-radius:9px;border:1px solid #34445f;background:#0b1324;color:#fff;width:100%}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.plan{padding:20px;border:1px solid #31415f;border-radius:16px;background:#0c1425}.price{font-size:28px;font-weight:800}.muted{color:#9eabc0}table{width:100%;border-collapse:collapse}td,th{padding:9px;border-bottom:1px solid #293753;text-align:left}.key{font-family:monospace;color:#6ee7ff}.auth-card{max-width:430px;margin:60px auto}.auth-card h1{font-size:42px;margin:0 0 14px}.notice{margin:14px 0;padding:10px;border-radius:10px;background:#17233a}.menu-toggle{position:fixed;left:16px;top:16px;z-index:1100;width:48px;height:48px;border-radius:14px;background:#3566ff;color:#fff;border:0;font-size:25px}.side-menu{position:fixed;left:0;top:0;bottom:0;width:290px;background:#0d1527;border-right:1px solid #283754;z-index:1200;transform:translateX(-105%);transition:.22s;overflow-y:auto}.side-menu.open{transform:translateX(0)}.side-head{display:flex;justify-content:space-between;padding:20px}.side-nav a{display:block;padding:14px;color:#fff;text-decoration:none}.side-user{padding:20px;background:#111d33}.side-balance{color:#66e3ff;font-weight:800;margin-top:7px}.menu-backdrop{display:none;position:fixed;inset:0;background:#0008;z-index:1150}.menu-backdrop.open{display:block}.user-main{padding-top:72px}.section-page{display:none}.section-page.active{display:block}.hero-home{padding:60px 30px;border:1px solid #2a3e68;border-radius:28px;background:linear-gradient(135deg,#111f3a,#0b1426);box-shadow:0 28px 80px #0007}.hero-home h1{font-size:clamp(56px,10vw,96px);margin:25px 0}.hero-home h1 span{color:#4f7cff}.hero-lead{max-width:740px;color:#adbad0;font-size:19px;line-height:1.7}.hero-actions{display:flex;gap:12px;flex-wrap:wrap}.feature-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:18px}.feature-card{padding:25px;border-radius:20px;border:1px solid #263754;background:#101a2d}.service-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.service-box{padding:18px;background:#0c1425;border:1px solid #31415f;border-radius:12px;text-align:center}.wallet-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.bank{padding:15px;border:1px solid #31415f;border-radius:12px;background:#0c1425;margin:10px 0}.admin-head{display:flex;justify-content:space-between;align-items:center}.admin-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stat-card{padding:18px;border:1px solid #263a5b;border-radius:16px;background:#0d1729}.stat-card span{display:block;color:#8998b0}.stat-card b{display:block;font-size:28px;margin-top:7px}.admin-tabs{display:flex;gap:8px;overflow:auto;margin:16px 0}.admin-tab{white-space:nowrap;background:#0e182a;border:1px solid #2b4063}.admin-panel{display:none}.admin-panel.active{display:block}.inline-form{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.inline-form input{max-width:130px}.status-pending{color:#ffd166}.status-approved{color:#65e572}.status-rejected{color:#ff7777}@media(max-width:700px){.grid,.feature-grid,.wallet-grid{grid-template-columns:1fr}.service-grid{grid-template-columns:1fr 1fr}.admin-stats{grid-template-columns:1fr 1fr}table{display:block;overflow:auto;white-space:nowrap}}
</style></head><body><div class="wrap">
<?php if(empty($_SESSION['role'])): $adminLogin=isset($_GET['admin']);?>
<div class="card auth-card"><div id="loginBox"><h1><?= $adminLogin?'ADMIN LOGIN':'BON SHOP' ?></h1><p class="muted">Đăng nhập bằng username hoặc Gmail/Email</p><?php if($msg):?><div class="notice"><?=h($msg)?></div><?php endif;?><form method="post"><input type="text" name="login_id" placeholder="Username hoặc Gmail/Email" required><br><br><input type="password" name="pass" placeholder="Mật khẩu" required><br><br><button name="login" style="width:100%">Đăng nhập</button></form><?php if($adminLogin):?><p><a href="./">← Quay lại</a></p><?php else:?><div style="text-align:center;margin-top:18px">Chưa có tài khoản? <a href="#" onclick="showRegister();return false;">Đăng ký</a></div><div style="text-align:center;margin-top:28px"><a href="admin">Đăng nhập quản trị viên</a></div><?php endif;?></div>
<div id="registerBox" style="display:none"><h1>ĐĂNG KÝ</h1><p class="muted">Tạo tài khoản để mua Key VIP</p><form method="post"><input name="username" placeholder="Username" pattern="[A-Za-z0-9_]{3,30}" required><br><br><input type="email" name="email" placeholder="Gmail / Email" required><br><br><input type="password" name="pass" placeholder="Mật khẩu >= 6 ký tự" minlength="6" required><br><br><button name="register" style="width:100%">Đăng ký</button></form><div style="text-align:center;margin-top:18px">Đã có tài khoản? <a href="#" onclick="showLogin();return false;">Đăng nhập</a></div></div></div>
<?php elseif($_SESSION['role']==='user'):
$s=db()->prepare("SELECT * FROM users WHERE id=?");$s->execute([$_SESSION['uid']]);$u=$s->fetch();
$kq=db()->prepare("SELECT * FROM vip_keys WHERE user_id=? ORDER BY id DESC LIMIT 10");$kq->execute([$u['id']]);
$rq=db()->prepare("SELECT * FROM wallet_requests WHERE user_id=? ORDER BY id DESC LIMIT 10");$rq->execute([$u['id']]);?>
<button class="menu-toggle" onclick="toggleMenu()">☰</button><div id="sideMenu" class="side-menu"><div class="side-head"><b>BON SHOP</b><button onclick="toggleMenu()">×</button></div><div class="side-user"><b><?=h($u['username']?:$u['email'])?></b><div class="side-balance">Số dư <?=money($u['balance'])?></div></div><nav class="side-nav"><a href="#" onclick="showSection('home');return false">🏠 Trang chủ</a><a href="#" onclick="showSection('deposit');return false">💰 Nạp tiền</a><a href="#" onclick="showSection('withdraw');return false">💸 Rút tiền</a><a href="#" onclick="showSection('buy');return false">🔑 Mua Key</a><a href="#" onclick="showSection('social');return false">📱 Dịch vụ MXH</a><a href="#" onclick="showSection('earn');return false">💵 Kiếm tiền</a><a href="#" onclick="showSection('other');return false">🧰 Dịch vụ khác</a><a href="?logout" style="color:#ff8b8b">Đăng xuất</a></nav></div><div id="menuBackdrop" class="menu-backdrop" onclick="toggleMenu()"></div>
<main class="user-main"><?php if($msg):?><div class="card notice"><?=h($msg)?></div><?php endif;?>
<section id="homeSection" class="section-page active"><div class="hero-home"><div class="muted">✦ NỀN TẢNG DỊCH VỤ SỐ</div><h1>BON <span>SHOP</span></h1><p class="hero-lead">Hệ sinh thái dịch vụ số hiện đại cho MMO, mạng xã hội và kiếm tiền online.</p><div class="hero-actions"><button onclick="showSection('buy')">🔑 Mua Key VIP</button><button onclick="showSection('social')">📱 Khám phá dịch vụ</button></div><p class="muted">Xin chào, <b><?=h($u['username']?:'Bạn')?></b> · Số dư <b><?=money($u['balance'])?></b></p></div><div class="feature-grid"><div class="card"><h2>⚡ BONTOOL · AUTO MMO</h2><p class="muted">Các công cụ hỗ trợ tự động hóa quy trình MMO.</p></div><div class="card"><h2>📱 DỊCH VỤ MXH</h2><p class="muted">TikTok, Facebook, YouTube và Instagram.</p></div><div class="card"><h2>🔑 VIP KEY</h2><p class="muted">Mua và quản lý Key VIP.</p></div><div class="card"><h2>💰 KIẾM TIỀN ONLINE</h2><p class="muted">Khu vực chương trình kiếm tiền và cộng tác.</p></div></div></section>
<div class="card section-page" id="deposit"><h2>💰 Nạp tiền</h2><p>Chuyển khoản và gửi yêu cầu nạp tiền.</p><?php foreach($c['banks'] as $bn=>$b):?><div class="bank"><b><?=h($bn)?></b><br>STK: <b><?=h($b['account'])?></b><br>Tên: <b><?=h($b['name'])?></b></div><?php endforeach;?><form method="post" class="wallet-grid"><div><label>Ngân hàng</label><select name="bank" required><?php foreach($c['banks'] as $bn=>$b):?><option><?=h($bn)?></option><?php endforeach;?></select></div><div><label>Số tiền</label><input name="amount" type="number" min="1000" step="1000" required></div><div style="grid-column:1/-1"><label>Nội dung chuyển khoản</label><input name="note" required></div><div style="grid-column:1/-1"><button name="deposit_request">Gửi yêu cầu nạp</button></div></form></div>
<div class="card section-page" id="withdraw"><h2>💸 Rút tiền</h2><p class="muted">Tối thiểu <?=money($c['withdraw_min'])?></p><form method="post" class="wallet-grid"><div><label>Ngân hàng</label><select name="bank" required><?php foreach($c['banks'] as $bn=>$b):?><option><?=h($bn)?></option><?php endforeach;?></select></div><div><label>Số tiền</label><input name="amount" type="number" min="10000" step="1000" required></div><div><label>STK</label><input name="account_number" required></div><div><label>Tên tài khoản</label><input name="account_name" required></div><div style="grid-column:1/-1"><button name="withdraw_request">Gửi yêu cầu rút</button></div></form></div>
<div class="card"><h2>📋 Yêu cầu gần đây</h2><table><tr><th>Loại</th><th>Số tiền</th><th>Ngân hàng</th><th>Trạng thái</th><th>Thời gian</th></tr><?php foreach($rq as $r):?><tr><td><?=$r['request_type']==='deposit'?'Nạp':'Rút'?></td><td><?=money($r['amount'])?></td><td><?=h($r['bank_name'])?></td><td class="status-<?=h($r['status'])?>"><?=h($r['status'])?></td><td><?=h($r['created_at'])?></td></tr><?php endforeach;?></table></div>
<div class="card section-page" id="buy"><h2>🛒 Mua Key VIP</h2><div class="grid"><?php foreach([[24,'1 ngày'],[720,'30 ngày'],[2160,'90 ngày']] as [$hours,$name]):$price=$c['prices'][$hours];?><div class="plan"><h2><?=$name?></h2><div class="price"><?=money($price)?></div><p><?=$hours?> giờ VIP</p><form method="post"><input type="hidden" name="hours" value="<?=$hours?>"><button name="buy" style="width:100%">Mua ngay</button></form></div><?php endforeach;?></div></div>
<div class="card section-page" id="social"><h2>📱 Dịch vụ MXH</h2><div class="service-grid"><div class="service-box">TikTok</div><div class="service-box">Facebook</div><div class="service-box">YouTube</div><div class="service-box">Instagram</div></div></div>
<div class="card section-page" id="earn"><h2>💵 Kiếm tiền</h2><p class="muted">Sắp cập nhật.</p></div><div class="card section-page" id="other"><h2>🧰 Dịch vụ khác</h2><p class="muted">Sắp cập nhật.</p></div>
<div class="card"><h2>🔑 Key của tôi</h2><table><tr><th>Key</th><th>Gói</th><th>Hết hạn</th><th>Trạng thái</th></tr><?php foreach($kq as $k):?><tr><td class="key"><?=h($k['key_value'])?></td><td><?=h($k['duration_hours'])?>h / <?=money($k['price'])?></td><td><?=h($k['expires_at'])?></td><td><?=h($k['status'])?></td></tr><?php endforeach;?></table></div></main>
<?php else:
$adminUsers=db()->query("SELECT id,username,email,role,balance,created_at FROM users ORDER BY id DESC")->fetchAll();
$adminKeys=db()->query("SELECT k.*,u.username,u.email FROM vip_keys k LEFT JOIN users u ON u.id=k.user_id ORDER BY k.id DESC")->fetchAll();
$adminDevices=db()->query("SELECT d.*,k.key_value,u.username,u.email FROM key_devices d JOIN vip_keys k ON k.id=d.key_id LEFT JOIN users u ON u.id=k.user_id ORDER BY d.id DESC")->fetchAll();
$adminTx=db()->query("SELECT t.*,u.username,u.email FROM balance_transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 200")->fetchAll();
$adminWallet=db()->query("SELECT r.*,u.username,u.email FROM wallet_requests r JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 200")->fetchAll();
$adminFbJobs=db()->query("SELECT * FROM fb_jobs ORDER BY id DESC LIMIT 200")->fetchAll();
$adminTtJobs=db()->query("SELECT * FROM tiktok_jobs ORDER BY id DESC LIMIT 200")->fetchAll();
$adminJobsDone=db()->query("SELECT c.*,u.username FROM job_completions c LEFT JOIN users u ON u.id=c.user_id ORDER BY c.id DESC LIMIT 100")->fetchAll();
$adminJobReports=db()->query("SELECT * FROM job_reports ORDER BY id DESC LIMIT 50")->fetchAll();?>
<div class="admin-head card"><div><h1>👑 BON SHOP · Quản trị</h1><p class="muted"><?=h($_SESSION['email'])?></p></div><a href="?logout">Đăng xuất</a></div><?php if($msg):?><div class="card notice"><?=h($msg)?></div><?php endif;?>
<div class="admin-stats"><div class="stat-card"><span>Users</span><b><?=count($adminUsers)?></b></div><div class="stat-card"><span>VIP Keys</span><b><?=count($adminKeys)?></b></div><div class="stat-card"><span>Thiết bị</span><b><?=count($adminDevices)?></b></div><div class="stat-card"><span>Ví</span><b><?=count($adminWallet)?></b></div></div>
<div class="admin-tabs"><button class="admin-tab active" onclick="adminTab('users',this)">👤 Users</button><button class="admin-tab" onclick="adminTab('keys',this)">🔑 Keys</button><button class="admin-tab" onclick="adminTab('devices',this)">📱 Devices</button><button class="admin-tab" onclick="adminTab('wallet',this)">💳 Nạp/Rút</button><button class="admin-tab" onclick="adminTab('transactions',this)">📊 Giao dịch</button><button class="admin-tab" onclick="adminTab('jobs',this)">⚙️ Nhiệm vụ</button></div>
<section id="admin-users" class="admin-panel active"><div class="card"><h2>Users</h2><table><tr><th>ID</th><th>Username</th><th>Email</th><th>Số dư</th><th>Điều chỉnh</th></tr><?php foreach($adminUsers as $usr):?><tr><td><?=h($usr['id'])?></td><td><?=h($usr['username']?:'-')?></td><td><?=h($usr['email'])?></td><td><?=money($usr['balance'])?></td><td><form method="post" class="inline-form"><input type="hidden" name="uid" value="<?=$usr['id']?>"><input type="number" name="amount" min="1" required><button name="topup">+ Cộng</button><button class="danger" name="deduct">− Trừ</button></form></td></tr><?php endforeach;?></table></div></section>
<section id="admin-keys" class="admin-panel"><div class="card"><h2>VIP Keys</h2><form method="post" class="wallet-grid"><select name="uid"><option value="0">— Key tự do —</option><?php foreach($adminUsers as $usr):?><option value="<?=$usr['id']?>"><?=h($usr['username']?:$usr['email'])?></option><?php endforeach;?></select><input name="hours" type="number" min="1" value="720"><input name="price" type="number" min="0" value="50000"><input name="note" placeholder="Ghi chú"><button name="create_key">+ Tạo Key</button></form><br><table><tr><th>Key</th><th>Gói</th><th>User</th><th>Hết hạn</th><th>Trạng thái</th><th>Thao tác</th></tr><?php foreach($adminKeys as $k):?><tr><td class="key"><?=h($k['key_value'])?></td><td><?=$k['duration_hours']?>h</td><td><?=h($k['username']?:($k['email']??'-'))?></td><td><?=h($k['expires_at']?:'-')?></td><td><?=h($k['status'])?></td><td><form method="post" class="inline-form"><input type="hidden" name="id" value="<?=$k['id']?>"><input name="hours" type="number" min="1" value="24" style="width:65px"><button name="extend">+ giờ</button><button name="act" value="<?=$k['status']==='active'?'disable':'enable'?>"><?=$k['status']==='active'?'Khóa':'Mở'?></button><button name="act" value="reset">Reset</button><button class="danger" name="act" value="delete">Xóa</button></form></td></tr><?php endforeach;?></table></div></section>
<section id="admin-devices" class="admin-panel"><div class="card"><h2>📱 Devices</h2><table><tr><th>ID</th><th>Key</th><th>User</th><th>Device</th><th>Last seen</th></tr><?php foreach($adminDevices as $d):?><tr><td><?=$d['id']?></td><td class="key"><?=h($d['key_value'])?></td><td><?=h($d['username']?:($d['email']??'-'))?></td><td><?=h(substr($d['device_hash'],0,16))?>…</td><td><?=h($d['last_seen'])?></td></tr><?php endforeach;?></table></div></section>
<section id="admin-wallet" class="admin-panel"><div class="card"><h2>💳 Nạp / Rút</h2><table><tr><th>User</th><th>Loại</th><th>Số tiền</th><th>Ngân hàng</th><th>STK</th><th>Trạng thái</th><th>Xử lý</th></tr><?php foreach($adminWallet as $r):?><tr><td><?=h($r['username']?:$r['email'])?></td><td><?=$r['request_type']==='deposit'?'Nạp':'Rút'?></td><td><?=money($r['amount'])?></td><td><?=h($r['bank_name'])?></td><td><?=h($r['account_number']??'-')?></td><td class="status-<?=h($r['status'])?>"><?=h($r['status'])?></td><td><?php if($r['status']==='pending'):?><form method="post" class="inline-form"><input type="hidden" name="rid" value="<?=$r['id']?>"><button class="green" name="wallet_action" value="approve">Duyệt</button><button class="danger" name="wallet_action" value="reject">Từ chối</button></form><?php endif;?></td></tr><?php endforeach;?></table></div></section>
<section id="admin-transactions" class="admin-panel"><div class="card"><h2>📊 Giao dịch</h2><table><tr><th>User</th><th>Amount</th><th>Balance</th><th>Type</th><th>Mô tả</th><th>Thời gian</th></tr><?php foreach($adminTx as $t):?><tr><td><?=h($t['username']?:$t['email'])?></td><td><?=money($t['amount'])?></td><td><?=money($t['balance_after'])?></td><td><?=h($t['type'])?></td><td><?=h($t['description']??'-')?></td><td><?=h($t['created_at'])?></td></tr><?php endforeach;?></table></div></section>
<section id="admin-jobs" class="admin-panel">
<div class="card"><h2>⚙️ Facebook Jobs</h2><form method="post" class="wallet-grid"><input name="link" placeholder="Link Facebook" required><input name="object_id" placeholder="Object ID" required><select name="type"><option>like</option><option>share</option><option>comment</option><option>follow</option></select><select name="reaction"><option>like</option><option>love</option><option>haha</option><option>wow</option><option>sad</option><option>angry</option><option>share</option></select><input name="price" type="number" value="35"><input name="max_uses" type="number" value="9999"><button name="add_fb_job">+ Thêm</button></form><br><table><tr><th>ID</th><th>Object</th><th>Loại</th><th>Giá</th><th>Dùng</th><th>Trạng thái</th><th></th></tr><?php foreach($adminFbJobs as $j):?><tr><td><?=$j['id']?></td><td><?=h($j['object_id'])?></td><td><?=h($j['type'])?></td><td><?=$j['price']?></td><td><?=$j['used_count']?>/<?=$j['max_uses']?></td><td><?=h($j['status'])?></td><td><form method="post" class="inline-form"><input type="hidden" name="id" value="<?=$j['id']?>"><input type="hidden" name="t" value="fb"><button name="job_act" value="<?=$j['status']==='active'?'disable':'enable'?>"><?=$j['status']==='active'?'Khóa':'Mở'?></button><button class="danger" name="job_act" value="delete">Xóa</button></form></td></tr><?php endforeach;?></table></div>
<div class="card"><h2>⚙️ TikTok Jobs</h2><form method="post" class="wallet-grid"><input name="video_url" placeholder="Link video"><input name="ads_id" placeholder="Ads ID" required><input name="account_id" placeholder="Account ID"><input name="price" type="number" value="20"><input name="max_uses" type="number" value="9999"><button name="add_tiktok_job">+ Thêm</button></form><br><table><tr><th>ID</th><th>Ads ID</th><th>Account</th><th>Giá</th><th>Dùng</th><th>Trạng thái</th><th></th></tr><?php foreach($adminTtJobs as $j):?><tr><td><?=$j['id']?></td><td><?=h($j['ads_id'])?></td><td><?=h($j['account_id'])?></td><td><?=$j['price']?></td><td><?=$j['used_count']?>/<?=$j['max_uses']?></td><td><?=h($j['status'])?></td><td><form method="post" class="inline-form"><input type="hidden" name="id" value="<?=$j['id']?>"><input type="hidden" name="t" value="tt"><button name="job_act" value="<?=$j['status']==='active'?'disable':'enable'?>"><?=$j['status']==='active'?'Khóa':'Mở'?></button><button class="danger" name="job_act" value="delete">Xóa</button></form></td></tr><?php endforeach;?></table></div>
<div class="card"><h2>🕒 Hoàn thành</h2><form method="post"><button class="danger" name="clear_completions">Xóa lịch sử</button></form><table><tr><th>Nền tảng</th><th>Job</th><th>User</th><th>Xu</th><th>Thiết bị</th></tr><?php foreach($adminJobsDone as $x):?><tr><td><?=h(strtoupper($x['platform']))?></td><td><?=$x['job_id']?></td><td><?=h($x['username']?:'-')?></td><td><?=$x['amount']?></td><td><?=h(substr($x['device_hash'],0,12))?>…</td></tr><?php endforeach;?></table></div>
<div class="card"><h2>🚩 Báo cáo lỗi</h2><table><tr><th>Nền tảng</th><th>Job</th><th>UID</th><th>Mô tả</th></tr><?php foreach($adminJobReports as $x):?><tr><td><?=h(strtoupper($x['platform']))?></td><td><?=$x['job_id']?></td><td><?=h($x['uid']?:'-')?></td><td><?=h($x['description']?:'-')?></td></tr><?php endforeach;?></table></div>
</section>
<?php endif;?></div>
<script>
function adminTab(n,b){document.querySelectorAll('.admin-panel').forEach(x=>x.classList.remove('active'));let e=document.getElementById('admin-'+n);if(e)e.classList.add('active');document.querySelectorAll('.admin-tab').forEach(x=>x.classList.remove('active'));if(b)b.classList.add('active');}
function showSection(n){document.querySelectorAll('.section-page').forEach(x=>x.classList.remove('active'));let e=document.getElementById(n==='home'?'homeSection':n);if(e)e.classList.add('active');let m=document.getElementById('sideMenu'),b=document.getElementById('menuBackdrop');if(m){m.classList.remove('open');b.classList.remove('open')}window.scrollTo(0,0)}
function toggleMenu(){let m=document.getElementById('sideMenu'),b=document.getElementById('menuBackdrop');if(m){m.classList.toggle('open');b.classList.toggle('open')}}
function showRegister(){document.getElementById('loginBox').style.display='none';document.getElementById('registerBox').style.display='block'}
function showLogin(){document.getElementById('registerBox').style.display='none';document.getElementById('loginBox').style.display='block'}
</script></body></html>
