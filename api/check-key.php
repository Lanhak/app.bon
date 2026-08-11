<?php
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');
$c=require dirname(__DIR__).'/config.php';
function db():PDO{global $c;static $p;if(!$p){$d=$c['db'];$p=new PDO("mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset=utf8mb4",$d['user'],$d['pass'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);}return $p;}
function out($a,$code=200){http_response_code($code);echo json_encode($a,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;}
$secret=$_SERVER['HTTP_X_API_KEY']??($_GET['api_key']??'');if(!hash_equals((string)$c['api_secret'],(string)$secret))out(['success'=>false,'message'=>'Unauthorized'],401);
$in=json_decode(file_get_contents('php://input'),true);if(!is_array($in))$in=$_POST;$key=trim((string)($in['key']??$in['key_value']??''));$device=preg_replace('/[^a-fA-F0-9]/','',(string)($in['device_hash']??''));
if($key===''||strlen($device)!==64)out(['success'=>false,'status'=>'invalid_request','message'=>'key và device_hash SHA-256 64 hex là bắt buộc'],400);
$p=db();$s=$p->prepare('SELECT * FROM vip_keys WHERE key_value=? LIMIT 1');$s->execute([$key]);$k=$s->fetch();if(!$k)out(['success'=>false,'status'=>'invalid','message'=>'Key không tồn tại'],404);if($k['status']==='disabled')out(['success'=>false,'status'=>'disabled','message'=>'Key đã bị khóa'],403);
if(!$k['expires_at']||strtotime($k['expires_at'])<=time()){$p->prepare("UPDATE vip_keys SET status='expired' WHERE id=?")->execute([$k['id']]);out(['success'=>false,'status'=>'expired','message'=>'Key đã hết hạn','expires_at'=>$k['expires_at']]);}
$d=$p->prepare('SELECT id FROM key_devices WHERE key_id=? AND device_hash=? LIMIT 1');$d->execute([$k['id'],$device]);$known=$d->fetch();$q=$p->prepare('SELECT COUNT(*) FROM key_devices WHERE key_id=?');$q->execute([$k['id']]);$count=(int)$q->fetchColumn();
if(!$known&&$count>=(int)$k['device_limit'])out(['success'=>false,'status'=>'device_limit','message'=>'Key đã đạt giới hạn thiết bị','device_limit'=>(int)$k['device_limit']],409);
if($known)$p->prepare('UPDATE key_devices SET last_seen=NOW() WHERE id=?')->execute([$known['id']]);else$p->prepare('INSERT INTO key_devices(key_id,device_hash) VALUES(?,?)')->execute([$k['id'],$device]);out(['success'=>true,'status'=>'active','message'=>'Key hợp lệ','key'=>$k['key_value'],'expires_at'=>$k['expires_at'],'device_limit'=>(int)$k['device_limit']]);
