const express=require('express');
const crypto=require('crypto');
const {Pool}=require('pg');

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true}));
app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});

const PORT=Number(process.env.PORT||3000);
const APP_URL=process.env.APP_URL||'https://bonshop.onrender.com';
const API_SECRET=process.env.API_SECRET||'';
const SESSION_SECRET=process.env.SESSION_SECRET||'';
const ADMIN_EMAIL=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const WITHDRAW_MIN=Number(process.env.WITHDRAW_MIN||10000);
let PRICES={24:2000,720:50000,2160:120000};
let BANKS={};
try{if(process.env.PRICES_JSON)PRICES=JSON.parse(process.env.PRICES_JSON)}catch{}
try{if(process.env.BANKS_JSON)BANKS=JSON.parse(process.env.BANKS_JSON)}catch{}

if(!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set');
if(!SESSION_SECRET) console.warn('SESSION_SECRET is not set; login cookies cannot be verified. Set SESSION_SECRET in Render Environment.');
const pool=new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? {rejectUnauthorized:false}:false,
 max:5,
 idleTimeoutMillis:30000,
 connectionTimeoutMillis:60000
});

function dbSafeInfo(){
  try{
    const u=new URL(process.env.DATABASE_URL||'');
    return {host:u.hostname,port:u.port||'5432',database:u.pathname.replace(/^\//,'')};
  }catch{return {host:'invalid-or-missing',port:'',database:''}}
}
function send(res,obj,code=200){return res.status(code).json(obj)}
function h(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(x){return Number(x||0).toLocaleString('vi-VN')+' đ'}
function hashDevice(x){return crypto.createHash('sha256').update(String(x)).digest('hex')}
function makeKey(){
 const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 const p=[];
 for(let j=0;j<4;j++){let s='';for(let i=0;i<5;i++)s+=a[crypto.randomInt(a.length)];p.push(s)}
 return 'VIP-'+p.join('-')
}
function sign(obj){
 if(!SESSION_SECRET) return '';
 const b=Buffer.from(JSON.stringify(obj)).toString('base64url');
 return b+'.'+crypto.createHmac('sha256',SESSION_SECRET).update(b).digest('base64url')
}
function verify(raw){
 try{if(!raw||!SESSION_SECRET)return null;const [b,s]=raw.split('.');const exp=crypto.createHmac('sha256',SESSION_SECRET).update(b).digest('base64url');if(s!==exp)return null;return JSON.parse(Buffer.from(b,'base64url').toString())}catch{return null}
}
function setAuth(res,user){res.setHeader('Set-Cookie',`bon_auth=${sign(user)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`)}
function clearAuth(res){res.setHeader('Set-Cookie','bon_auth=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0')}
function auth(req){const c=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('bon_auth='));return c?verify(c.slice(9)):null}
function requireUser(req,res,next){const u=auth(req);if(!u||u.role!=='user')return res.redirect('/?error=login');req.user=u;next()}
function requireAdmin(req,res,next){const u=auth(req);if(!u||u.role!=='admin')return res.redirect('/?error=admin_login');req.user=u;next()}

const MIGRATION="CREATE TABLE IF NOT EXISTS users (\n id BIGSERIAL PRIMARY KEY,\n username VARCHAR(50) UNIQUE,\n email VARCHAR(190) NOT NULL UNIQUE,\n password_hash VARCHAR(255) NOT NULL,\n role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),\n balance BIGINT NOT NULL DEFAULT 0 CHECK(balance >= 0),\n created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\nCREATE TABLE IF NOT EXISTS vip_keys (\n id BIGSERIAL PRIMARY KEY,\n key_value VARCHAR(80) NOT NULL UNIQUE,\n duration_hours INTEGER NOT NULL,\n price BIGINT NOT NULL DEFAULT 0,\n expires_at TIMESTAMPTZ,\n device_limit INTEGER NOT NULL DEFAULT 1,\n status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','expired')),\n user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,\n note VARCHAR(255),\n created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\nCREATE INDEX IF NOT EXISTS idx_vip_user ON vip_keys(user_id);\nCREATE TABLE IF NOT EXISTS key_devices (\n id BIGSERIAL PRIMARY KEY,\n key_id BIGINT NOT NULL REFERENCES vip_keys(id) ON DELETE CASCADE,\n device_hash CHAR(64) NOT NULL,\n first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n UNIQUE(key_id, device_hash)\n);\nCREATE TABLE IF NOT EXISTS balance_transactions (\n id BIGSERIAL PRIMARY KEY,\n user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n amount BIGINT NOT NULL,\n balance_after BIGINT NOT NULL,\n type VARCHAR(40) NOT NULL,\n description VARCHAR(255),\n created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\nCREATE INDEX IF NOT EXISTS idx_tx_user ON balance_transactions(user_id);\nCREATE TABLE IF NOT EXISTS wallet_requests (\n id BIGSERIAL PRIMARY KEY,\n user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n request_type VARCHAR(20) NOT NULL CHECK(request_type IN ('deposit','withdraw')),\n amount BIGINT NOT NULL CHECK(amount > 0),\n bank_name VARCHAR(100) NOT NULL,\n account_number VARCHAR(50),\n account_name VARCHAR(190),\n note VARCHAR(255),\n status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),\n admin_note VARCHAR(255),\n created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n processed_at TIMESTAMPTZ\n);\nCREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_requests(user_id);\nCREATE INDEX IF NOT EXISTS idx_wallet_status ON wallet_requests(status);\nCREATE TABLE IF NOT EXISTS fb_jobs (\n id BIGSERIAL PRIMARY KEY,\n link VARCHAR(255) NOT NULL,\n object_id VARCHAR(100) NOT NULL,\n type VARCHAR(20) NOT NULL DEFAULT 'like',\n reaction VARCHAR(20) NOT NULL DEFAULT 'like',\n price INTEGER NOT NULL DEFAULT 35,\n max_uses INTEGER NOT NULL DEFAULT 9999,\n used_count INTEGER NOT NULL DEFAULT 0,\n status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),\n created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\nCREATE TABLE IF NOT EXISTS tiktok_jobs (\n id BIGSERIAL PRIMARY KEY,\n video_url VARCHAR(255) NOT NULL,\n ads_id VARCHAR(100) NOT NULL,\n account_id VARCHAR(100) NOT NULL,\n price INTEGER NOT NULL DEFAULT 20,\n max_uses INTEGER NOT NULL DEFAULT 9999,\n used_count INTEGER NOT NULL DEFAULT 0,\n status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),\n created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\nCREATE TABLE IF NOT EXISTS job_completions (\n id BIGSERIAL PRIMARY KEY,\n platform VARCHAR(20) NOT NULL,\n job_id BIGINT NOT NULL,\n device_hash CHAR(64) NOT NULL,\n user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,\n amount INTEGER NOT NULL DEFAULT 0,\n status VARCHAR(20) NOT NULL DEFAULT 'done',\n created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n UNIQUE(platform, job_id, device_hash)\n);\nCREATE TABLE IF NOT EXISTS job_reports (\n id BIGSERIAL PRIMARY KEY,\n platform VARCHAR(20) NOT NULL,\n job_id BIGINT NOT NULL,\n uid VARCHAR(100),\n device_hash CHAR(64) NOT NULL,\n description VARCHAR(255),\n created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\nCREATE TABLE IF NOT EXISTS app_credits (\n id BIGSERIAL PRIMARY KEY,\n user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n device_hash CHAR(64) NOT NULL,\n name_tool VARCHAR(50) NOT NULL DEFAULT '',\n amount INTEGER NOT NULL DEFAULT 0,\n created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\nCREATE INDEX IF NOT EXISTS idx_credits_device_time ON app_credits(device_hash,created_at);\nCREATE INDEX IF NOT EXISTS idx_credits_user ON app_credits(user_id);\n";
async function migrate(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 // Render Postgres can take several seconds to accept connections after deploy/wake.
 // Retry the initial schema connection instead of terminating the web service.
 let lastErr;
 for(let attempt=1;attempt<=6;attempt++){
   try{
     await pool.query('SELECT 1');
     lastErr=null;
     break;
   }catch(err){
     lastErr=err;
     console.warn(`Database connection attempt ${attempt}/6 failed: ${err.message}`);
     if(attempt<6) await new Promise(r=>setTimeout(r, Math.min(5000*attempt,20000)));
   }
 }
 if(lastErr) throw lastErr;
 await pool.query(MIGRATION);
 // Additive compatibility migration for BON databases created by older builds.
 await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()");
 await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'");
 await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)");
 await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS balance BIGINT DEFAULT 0");
 await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()");
 await pool.query("UPDATE users SET role='user' WHERE role IS NULL");
 await pool.query("UPDATE users SET balance=0 WHERE balance IS NULL");
 await pool.query("UPDATE vip_keys SET status='expired',updated_at=NOW() WHERE status='active' AND (expires_at IS NULL OR expires_at<=NOW())");
 await ensureAdmin();
}
async function ensureAdmin(){
 if(!ADMIN_EMAIL||!ADMIN_PASSWORD){console.warn('ADMIN_EMAIL/ADMIN_PASSWORD not set; admin bootstrap skipped');return}
 const hash=await require('crypto').promisify?null:null;
 // bcrypt is intentionally avoided; use scrypt with a portable encoded format.
 const passwordHash=await hashPassword(ADMIN_PASSWORD);
 const q=await pool.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1',[ADMIN_EMAIL]);
 if(q.rowCount){
   await pool.query("UPDATE users SET role='admin',password_hash=$2,updated_at=NOW() WHERE id=$1",[q.rows[0].id,passwordHash]);
 }else{
   await pool.query("INSERT INTO users(email,password_hash,role,balance) VALUES($1,$2,'admin',0)",[ADMIN_EMAIL,passwordHash]);
 }
}
function hashPassword(p){
 return new Promise((resolve,reject)=>{
  const salt=crypto.randomBytes(16).toString('hex');
  crypto.scrypt(p,salt,64,(e,d)=>e?reject(e):resolve(`scrypt$${salt}$${d.toString('hex')}`))
 })
}
function verifyPassword(p,stored){
 return new Promise(resolve=>{
  const x=String(stored||'').split('$');
  if(x.length!==3||x[0]!=='scrypt')return resolve(false);
  crypto.scrypt(p,x[1],64,(e,d)=>resolve(!e&&crypto.timingSafeEqual(Buffer.from(x[2],'hex'),d)))
 })
}
async function tx(fn){
 const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r}catch(e){try{await c.query('ROLLBACK')}catch{}throw e}finally{c.release()}
}
async function keyLookup(key,deviceId){
 const q=await pool.query('SELECT * FROM vip_keys WHERE key_value=$1 LIMIT 1',[key]);
 if(!q.rowCount)return {error:['invalid','Key VIP không tồn tại']};
 const k=q.rows[0];
 if(k.status==='disabled')return {error:['disabled','Key VIP đã bị khóa'],key:k};
 if(!k.expires_at||new Date(k.expires_at)<=new Date()){
   await pool.query("UPDATE vip_keys SET status='expired',updated_at=NOW() WHERE id=$1",[k.id]);
   return {error:['expired','Key VIP đã hết hạn'],key:k};
 }
 let count=0;
 if(deviceId){
   const dh=hashDevice(deviceId);
   const known=await pool.query('SELECT id FROM key_devices WHERE key_id=$1 AND device_hash=$2 LIMIT 1',[k.id,dh]);
   const cnt=await pool.query('SELECT COUNT(*)::int AS n FROM key_devices WHERE key_id=$1',[k.id]);count=cnt.rows[0].n;
   if(!known.rowCount && count>=Number(k.device_limit))return {error:['device_limit','Key VIP đã đạt giới hạn thiết bị'],key:k,device_count:count};
   if(known.rowCount)await pool.query('UPDATE key_devices SET last_seen=NOW() WHERE id=$1',[known.rows[0].id]);
   else{await pool.query('INSERT INTO key_devices(key_id,device_hash) VALUES($1,$2)',[k.id,dh]);count++}
 }
 return {key:k,device_count:count};
}

app.get('/health',(req,res)=>send(res,{ok:true,service:'bon-shop',database:dbSafeInfo()}));
app.get('/health',async(req,res)=>{try{const q=await pool.query('SELECT NOW() AS now');send(res,{ok:true,status:'online',service:'BON SHOP',time:q.rows[0].now})}catch(e){send(res,{ok:false,status:'database_error',message:e.message},503)}});

app.get('/api',(_,res)=>send(res,{name:'BON SHOP API',version:'3.0.0',endpoint:'POST /api/check-key.php'}));

app.all('/checkkey/api/key.php',async(req,res)=>{
 try{
  const key=String(req.query.APIKey||req.query.api_key||req.query.key||req.body.APIKey||req.body.api_key||req.body.key||'').trim();
  const device=String(req.query.device_id||req.query.deviceId||req.body.device_id||'').trim();
  if(!key)return send(res,{status:'invalid',msg:'Thiếu APIKey'},400);
  const r=await keyLookup(key,device);
  if(r.error){return send(res,{status:r.error[0],msg:r.error[1],key:r.key?.key_value||key,api_key:r.key?.key_value||key,device_limit:r.key?.device_limit},r.error[0]==='disabled'?403:200)}
  const k=r.key;
  send(res,{success:true,status:'success',msg:'Xác thực Server thành công: Key VIP hợp lệ!',key:k.key_value,api_key:k.key_value,vip:true,duration_hours:Number(k.duration_hours),expires_at:k.expires_at,endDate:k.expires_at,end_date:k.expires_at,create_date:k.created_at,device_ID:device,device_id:device,device_count:r.device_count,device_limit:Number(k.device_limit)});
 }catch(e){send(res,{status:'server_error',msg:'Lỗi kết nối máy chủ'},500)}
});

app.all('/checkkey/api/check_date_key.php',async(req,res)=>{
 try{
  const key=String(req.query.APIKey||req.query.api_key||req.query.key||req.body.APIKey||'').trim();
  const device=String(req.query.device_id_local||req.query.device_id||req.body.device_id_local||'').trim();
  if(!key)return send(res,{status:'invalid',msg:'Thiếu APIKey'},400);
  const r=await keyLookup(key,device);
  if(r.error)return send(res,{status:r.error[0],msg:r.error[1],key:r.key?.key_value||key,api_key:r.key?.key_value||key,device_limit:r.key?.device_limit});
  const k=r.key;send(res,{success:true,status:'success',msg:'Xác thực Server thành công: Key VIP hợp lệ!',key:k.key_value,api_key:k.key_value,vip:true,duration_hours:Number(k.duration_hours),expires_at:k.expires_at,endDate:k.expires_at,end_date:k.expires_at,create_date:k.created_at,device_ID:device,device_id:device,device_count:r.device_count,device_limit:Number(k.device_limit)});
 }catch(e){send(res,{status:'server_error',msg:'Lỗi kết nối máy chủ'},500)}
});

app.post('/checkkey/',async(req,res)=>{
 try{
  if(req.body.keyadmin!=='huongdev8386')return send(res,{success:false,message:'Sai keyadmin'},403);
  if(req.body.action!=='addHistory')return send(res,{success:false,message:'Action không hợp lệ'},400);
  const device=String(req.body.device_id||'').trim(), moneyN=Number(req.body.money||0), nameTool=String(req.body.name_tool||'').trim();
  if(!device||moneyN<=0)return send(res,{success:false,message:'Thiếu device_id hoặc money'});
  if(moneyN>100000)return send(res,{success:false,message:'Số tiền cộng quá lớn'});
  const dh=hashDevice(device);
  const r=await tx(async(c)=>{
   const k=await c.query("SELECT k.id AS key_id,k.user_id,k.expires_at,k.status FROM key_devices d JOIN vip_keys k ON k.id=d.key_id WHERE d.device_hash=$1 ORDER BY d.last_seen DESC LIMIT 1",[dh]);
   if(!k.rowCount)throw Object.assign(new Error('Thiết bị chưa kích hoạt Key VIP'),{public:true});
   const kr=k.rows[0];if(kr.status!=='active'||!kr.expires_at||new Date(kr.expires_at)<=new Date())throw Object.assign(new Error('Key VIP hết hạn hoặc bị khóa'),{public:true});
   const rate=await c.query("SELECT COUNT(*)::int AS n FROM app_credits WHERE device_hash=$1 AND created_at>=NOW()-INTERVAL '1 hour'",[dh]);
   if(rate.rows[0].n>=60)throw Object.assign(new Error('Đã vượt giới hạn cộng xu trong giờ này'),{public:true});
   const u=await c.query('SELECT balance,email,username FROM users WHERE id=$1 FOR UPDATE',[kr.user_id]);if(!u.rowCount)throw Object.assign(new Error('Không tìm thấy tài khoản'),{public:true});
   const nb=Number(u.rows[0].balance)+moneyN;
   await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,kr.user_id]);
   await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_topup',$4)",[kr.user_id,moneyN,nb,'App '+(nameTool||'GOLIKE')]);
   await c.query('INSERT INTO app_credits(user_id,device_hash,name_tool,amount) VALUES($1,$2,$3,$4)',[kr.user_id,dh,nameTool,moneyN]);
   return {username:u.rows[0].username||u.rows[0].email,balance:nb};
  });
  send(res,{success:true,message:`Đã cộng ${moneyN} xu cho ${nameTool}`,data:{username:r.username,balance:r.balance,money:moneyN}});
 }catch(e){send(res,{success:false,message:e.public?e.message:'Không thể cộng xu'},e.public?200:500)}
});

async function goLikeKey(req,res){
 const action=String(req.query.action||''), apiKey=String(req.query.APIKey||req.query.api_key||'').trim(), device=String(req.query.device_id_local||'').trim();
 if(!['get_jobs','complete_job','report_job'].includes(action))return send(res,{success:false,message:'Action không hợp lệ'},400);
 const r=await keyLookup(apiKey,'');
 if(r.error)return send(res,{success:false,message:r.error[1]});
 const k=r.key, dh=device?hashDevice(device):'';
 if(action==='get_jobs'){
  const q=dh?await pool.query(`SELECT j.* FROM fb_jobs j WHERE j.status='active' AND j.used_count<j.max_uses AND NOT EXISTS(SELECT 1 FROM job_completions c WHERE c.platform='facebook' AND c.job_id=j.id AND c.device_hash=$1) ORDER BY RANDOM() LIMIT 1`,[dh]):await pool.query("SELECT * FROM fb_jobs WHERE status='active' AND used_count<max_uses ORDER BY RANDOM() LIMIT 1");
  if(!q.rowCount)return send(res,{success:false,message:'Tạm hết nhiệm vụ'});
  const j=q.rows[0];return send(res,{success:true,message:'OK',data:{id:Number(j.id),job_id:Number(j.id),link:j.link,type:j.type,reaction:j.reaction,object_id:j.object_id,price_per_after_cost:Number(j.price),fix_coin:Number(j.price),coin:Number(j.price)}});
 }
 const jobId=Number(req.query.job_id||0);if(!jobId)return send(res,{success:false,message:'Thiếu job_id'});
 if(!dh)return send(res,{success:false,message:'Thiếu device_id_local'});
 if(action==='complete_job'){
  const q=await pool.query('SELECT * FROM fb_jobs WHERE id=$1 LIMIT 1',[jobId]);if(!q.rowCount)return send(res,{success:false,message:'Không tìm thấy công việc'});
  const j=q.rows[0];if(j.status!=='active')return send(res,{success:false,message:'Công việc đã bị khóa'});
  const ins=await pool.query(`INSERT INTO job_completions(platform,job_id,device_hash,user_id,amount,status) VALUES('facebook',$1,$2,$3,$4,'done') ON CONFLICT DO NOTHING`,[jobId,dh,k.user_id,Number(j.price)]);
  if(ins.rowCount)await pool.query('UPDATE fb_jobs SET used_count=used_count+1 WHERE id=$1',[jobId]);
  return send(res,{success:true,message:'Hoàn thành nhiệm vụ Facebook thành công',data:{job_id:jobId,object_id:req.query.object_id||j.object_id,fix_coin:Number(j.price),price_per_after_cost:Number(j.price)}});
 }
 await pool.query('INSERT INTO job_reports(platform,job_id,uid,device_hash,description) VALUES($1,$2,$3,$4,$5)',['facebook',jobId,req.query.uid||'',dh,req.query.description||'']);
 return send(res,{success:true,message:'Đã ghi nhận báo cáo công việc'});
}
app.all('/checkkey/api/api_golike_fb.php',async(req,res)=>{try{await goLikeKey(req,res)}catch(e){send(res,{success:false,message:'Lỗi kết nối máy chủ'},500)}});

app.all('/checkkey/api/api_golike_tiktok.php',async(req,res)=>{
 try{
  if(String(req.query.action||'')!=='complete_job')return send(res,{success:false,message:'Action không hợp lệ'},400);
  const apiKey=String(req.query.APIKey||'').trim(),device=String(req.query.device_id_local||'').trim(),ads=String(req.query.ads_id||'').trim(),acc=String(req.query.account_id||'').trim();
  const r=await keyLookup(apiKey,'');if(r.error)return send(res,{success:false,message:r.error[1]});
  if(!ads)return send(res,{success:false,message:'Thiếu ads_id'});if(!device)return send(res,{success:false,message:'Thiếu device_id_local'});
  const q=await pool.query('SELECT * FROM tiktok_jobs WHERE ads_id=$1 LIMIT 1',[ads]);
  const j=q.rows[0], price=j?Number(j.price):20;
  if(j&&j.status!=='active')return send(res,{success:false,message:'Công việc đã bị khóa'});
  if(j){
   const ins=await pool.query(`INSERT INTO job_completions(platform,job_id,device_hash,user_id,amount,status) VALUES('tiktok',$1,$2,$3,$4,'done') ON CONFLICT DO NOTHING`,[j.id,hashDevice(device),r.key.user_id,price]);
   if(ins.rowCount)await pool.query('UPDATE tiktok_jobs SET used_count=used_count+1 WHERE id=$1',[j.id]);
  }
  send(res,{success:true,message:'Hoàn thành nhiệm vụ TikTok thành công',data:{ads_id:ads,account_id:acc,fix_coin:price}});
 }catch(e){send(res,{success:false,message:'Lỗi kết nối máy chủ'},500)}
});

app.get('/checkkey/api/announcement.json',async(req,res)=>send(res,{success:true,announcement:'BON SHOP',message:'Hệ thống đang hoạt động bình thường',updated_at:new Date().toISOString()}));

app.all('/api/check-key.php',async(req,res)=>{
 try{
  const secret=req.headers['x-api-key']||req.query.api_key||req.body.api_key||'';
  const sb=Buffer.from(String(secret));const ab=Buffer.from(String(API_SECRET));if(!API_SECRET||sb.length!==ab.length||!crypto.timingSafeEqual(sb,ab))return send(res,{success:false,message:'Unauthorized'},401);
  const key=String(req.body.key||req.body.key_value||req.query.key||'').trim();
  const dh=String(req.body.device_hash||req.query.device_hash||'').replace(/[^a-fA-F0-9]/g,'');
  if(!key||dh.length!==64)return send(res,{success:false,status:'invalid_request',message:'key và device_hash SHA-256 64 hex là bắt buộc'},400);
  const r=await keyLookup(key,'');if(r.error)return send(res,{success:false,status:r.error[0],message:r.error[1]},r.error[0]==='disabled'?403:404);
  const known=await pool.query('SELECT id FROM key_devices WHERE key_id=$1 AND device_hash=$2 LIMIT 1',[r.key.id,dh]);
  const count=await pool.query('SELECT COUNT(*)::int n FROM key_devices WHERE key_id=$1',[r.key.id]);
  if(!known.rowCount&&count.rows[0].n>=Number(r.key.device_limit))return send(res,{success:false,status:'device_limit',message:'Key đã đạt giới hạn thiết bị'},409);
  if(known.rowCount)await pool.query('UPDATE key_devices SET last_seen=NOW() WHERE id=$1',[known.rows[0].id]);else await pool.query('INSERT INTO key_devices(key_id,device_hash) VALUES($1,$2)',[r.key.id,dh]);
  send(res,{success:true,status:'active',message:'Key hợp lệ',key:r.key.key_value,expires_at:r.key.expires_at,device_limit:Number(r.key.device_limit)});
 }catch(e){send(res,{success:false,message:'Server error'},500)}
});

app.get('/Key_Free/',(req,res)=>res.send(keyFree(req.query.key)));
function keyFree(key){
 const k=h(key||'');
 return `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BON SHOP — Key Free</title><style>${css()} .box{max-width:430px;margin:10vh auto;text-align:center}.key{padding:20px;border:1px dashed #4672c7;border-radius:14px;font:700 20px monospace;color:#66e3ff;word-break:break-all;background:#0b1324}</style><body><main class="card box"><span class="badge">✦ BON SHOP · KEY FREE</span><h1>Mã kích hoạt của bạn</h1>${key?`<p>Sao chép mã bên dưới rồi quay lại app.</p><div class="key" id="k">${k}</div><button onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('k').textContent)">📋 Sao chép</button>`:'<p>Thiếu mã key.</p>'}</main></body></html>`
}

app.get('/statistics',async(req,res)=>{
 try{
  const vals=await Promise.all([
   pool.query('SELECT COUNT(*)::int n FROM users'),pool.query('SELECT COUNT(*)::int n FROM vip_keys'),
   pool.query("SELECT COUNT(*)::int n FROM vip_keys WHERE status='active' AND expires_at>NOW()"),
   pool.query('SELECT COUNT(*)::int n FROM key_devices'),
   pool.query("SELECT COALESCE(SUM(amount),0)::bigint n FROM balance_transactions WHERE amount>0"),
   pool.query("SELECT COUNT(*)::int n FROM job_completions WHERE platform='facebook'"),
   pool.query("SELECT COUNT(*)::int n FROM job_completions WHERE platform='tiktok'")
  ]);
  res.send(statPage(vals.map(x=>x.rows[0].n)));
 }catch(e){res.status(503).send(statPage([0,0,0,0,0,0,0],e.message))}
});

function css(){return `*{box-sizing:border-box}body{margin:0;font:15px Arial;background:#080d1a;color:#edf2ff}.wrap{max-width:1180px;margin:auto;padding:22px}.card{background:#11192b;border:1px solid #283754;border-radius:18px;padding:20px;margin-bottom:18px;box-shadow:0 12px 35px #0004}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.badge{display:inline-block;padding:7px 13px;border:1px solid #3b5fa4;border-radius:99px;color:#8fb5ff;font-size:11px;font-weight:800;letter-spacing:1.5px}button{border:0;border-radius:10px;padding:11px 15px;background:#3566ff;color:#fff;font-weight:700;cursor:pointer}input,select{padding:11px;border-radius:9px;border:1px solid #34445f;background:#0b1324;color:#fff;width:100%}table{width:100%;border-collapse:collapse}td,th{padding:9px;border-bottom:1px solid #293753;text-align:left;white-space:nowrap}.muted{color:#9eabc0}a{color:#8fb5ff}.price{font-size:28px;font-weight:800}.wallet{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:750px){.grid,.wallet{grid-template-columns:1fr}table{display:block;overflow:auto;font-size:12px}}.danger{background:#b42318}.green{background:#16803c}.notice{padding:12px;background:#17233a;border-radius:10px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center}`}

function layout(title,body){return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)}</title><style>${css()}</style></head><body><div class="wrap">${body}</div></body></html>`}
function statPage(v){return layout('BON SHOP — Thống kê',`<div class="card" style="text-align:center"><span class="badge">✦ BON SHOP · THỐNG KÊ</span><h1>BON SHOP</h1><p class="muted">Hệ thống dịch vụ số · cập nhật theo thời gian thực</p></div><div class="grid">${[['Người dùng',v[0]],['VIP đang hoạt động',v[2]],['Thiết bị',v[3]],['Tổng xu đã chi trả',money(v[4])],['Facebook hoàn thành',v[5]],['TikTok hoàn thành',v[6]]].map(x=>`<div class="card"><span class="muted">${x[0]}</span><h2>${h(x[1])}</h2></div>`).join('')}</div>`)}

app.get('/',async(req,res)=>{
 if(req.query.logout){clearAuth(res);return res.redirect('/')}
 const u=auth(req);
 if(!u)return res.send(layout('BON SHOP — Đăng nhập',`<div class="card" style="max-width:430px;margin:8vh auto"><span class="badge">✦ BON SHOP</span><h1>Đăng nhập</h1>${req.query.error?'<div class="notice">Sai tài khoản hoặc phiên đăng nhập.</div>':''}<form method="post" action="/auth/login"><p><input name="login_id" placeholder="Username hoặc Email" required></p><p><input type="password" name="pass" placeholder="Mật khẩu" required></p><button>Đăng nhập</button></form><hr><h2>Đăng ký</h2><form method="post" action="/auth/register"><p><input name="username" placeholder="Username" required></p><p><input type="email" name="email" placeholder="Email" required></p><p><input type="password" name="pass" placeholder="Mật khẩu ≥ 6 ký tự" required></p><button>Đăng ký</button></form><p><a href="/statistics">Thống kê</a></p></div>`));
 if(u.role==='admin')return res.redirect('/admin');
 const q=await pool.query('SELECT * FROM users WHERE id=$1',[u.uid]);if(!q.rowCount){clearAuth(res);return res.redirect('/')}
 const user=q.rows[0];
 const keys=(await pool.query('SELECT * FROM vip_keys WHERE user_id=$1 ORDER BY id DESC',[u.uid])).rows;
 const rq=(await pool.query('SELECT * FROM wallet_requests WHERE user_id=$1 ORDER BY id DESC LIMIT 30',[u.uid])).rows;
 const banks=Object.keys(BANKS);
 const body=`<div class="top card"><div><span class="badge">BON SHOP</span><h1>Xin chào ${h(user.username||user.email)}</h1><div class="price">${money(user.balance)}</div></div><div><a href="/?logout=1">Đăng xuất</a></div></div>
 <div class="card"><h2>💰 Nạp tiền</h2><p class="muted">Nội dung chuyển khoản phải ghi đúng username/email của bạn.</p>${banks.map(b=>`<div class="card"><b>${h(b)}</b><br>STK: ${h(BANKS[b].account)}<br>Tên: ${h(BANKS[b].name)}</div>`).join('')}<form method="post" action="/wallet/deposit" class="wallet"><select name="bank" required>${banks.map(b=>`<option>${h(b)}</option>`).join('')}</select><input name="amount" type="number" min="1000" step="1000" placeholder="Số tiền" required><input name="note" placeholder="Nội dung chuyển khoản" required><button>Gửi yêu cầu nạp</button></form></div>
 <div class="card"><h2>💸 Rút tiền</h2><form method="post" action="/wallet/withdraw" class="wallet"><select name="bank" required>${banks.map(b=>`<option>${h(b)}</option>`).join('')}</select><input name="amount" type="number" min="${WITHDRAW_MIN}" required><input name="account_number" placeholder="Số tài khoản" required><input name="account_name" placeholder="Tên chủ tài khoản" required><button>Gửi yêu cầu rút</button></form></div>
 <div class="card"><h2>🛒 Mua Key VIP</h2><div class="grid">${Object.entries(PRICES).map(([hr,pr])=>`<div class="card"><h2>${Number(hr)/24} ngày</h2><div class="price">${money(pr)}</div><form method="post" action="/buy"><input type="hidden" name="hours" value="${hr}"><button>Mua ngay</button></form></div>`).join('')}</div></div>
 <div class="card"><h2>🔑 Key của tôi</h2><table><tr><th>Key</th><th>Gói</th><th>Hết hạn</th><th>Trạng thái</th></tr>${keys.map(k=>`<tr><td>${h(k.key_value)}</td><td>${k.duration_hours}h / ${money(k.price)}</td><td>${h(k.expires_at)}</td><td>${h(k.status)}</td></tr>`).join('')}</table></div>
 <div class="card"><h2>📋 Yêu cầu gần đây</h2><table><tr><th>Loại</th><th>Số tiền</th><th>Ngân hàng</th><th>Trạng thái</th></tr>${rq.map(r=>`<tr><td>${h(r.request_type)}</td><td>${money(r.amount)}</td><td>${h(r.bank_name)}</td><td>${h(r.status)}</td></tr>`).join('')}</table></div>
 <div class="card"><h2>📱 Dịch vụ MXH</h2><p class="muted">TikTok · Facebook · YouTube · Instagram</p></div>`;
 res.send(layout('BON SHOP',body))
});


app.post('/auth/register',async(req,res)=>{
 try{
  const username=String(req.body.username||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),pw=String(req.body.pass||'');
  if(!/^[A-Za-z0-9_]{3,30}$/.test(username)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||pw.length<6)return res.redirect('/?error=invalid');
  const ph=await hashPassword(pw);await pool.query('INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3)',[username,email,ph]);res.redirect('/?registered=1')
 }catch(e){res.redirect('/?error=exists')}
});
app.post('/auth/login',async(req,res)=>{
 try{
  const login=String(req.body.login_id||'').trim(),pw=String(req.body.pass||'');
  if(ADMIN_EMAIL&&login.toLowerCase()===ADMIN_EMAIL&&pw===ADMIN_PASSWORD){setAuth(res,{role:'admin',email:ADMIN_EMAIL});return res.redirect('/admin')}
  const q=await pool.query('SELECT * FROM users WHERE lower(email)=lower($1) OR lower(username)=lower($1) LIMIT 1',[login]);if(!q.rowCount||!(await verifyPassword(pw,q.rows[0].password_hash)))return res.redirect('/?error=login');
  const u=q.rows[0];setAuth(res,{role:u.role,uid:Number(u.id),email:u.email,username:u.username||''});res.redirect(u.role==='admin'?'/admin':'/')
 }catch(e){res.redirect('/?error=login')}
});
app.get('/logout',(req,res)=>{clearAuth(res);res.redirect('/')});

app.post('/wallet/deposit',requireUser,async(req,res)=>{const bank=String(req.body.bank||''),amount=Number(req.body.amount||0),note=String(req.body.note||'');if(!BANKS[bank]||amount<1000)return res.redirect('/?error=wallet');await pool.query("INSERT INTO wallet_requests(user_id,request_type,amount,bank_name,note) VALUES($1,'deposit',$2,$3,$4)",[req.user.uid,amount,bank,note]);res.redirect('/')});
app.post('/wallet/withdraw',requireUser,async(req,res)=>{
 const bank=String(req.body.bank||''),amount=Number(req.body.amount||0),acc=String(req.body.account_number||''),name=String(req.body.account_name||'');if(!BANKS[bank]||amount<WITHDRAW_MIN||!acc||!name)return res.redirect('/?error=wallet');
 try{await tx(async(c)=>{const u=await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[req.user.uid]);if(!u.rowCount||Number(u.rows[0].balance)<amount)throw new Error('balance');const nb=Number(u.rows[0].balance)-amount;await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,req.user.uid]);await c.query("INSERT INTO wallet_requests(user_id,request_type,amount,bank_name,account_number,account_name) VALUES($1,'withdraw',$2,$3,$4,$5)",[req.user.uid,amount,bank,acc,name]);await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_adjust','Yêu cầu rút tiền')",[req.user.uid,-amount,nb])});res.redirect('/')}catch{res.redirect('/?error=balance')}
});
app.post('/buy',requireUser,async(req,res)=>{
 const hours=Number(req.body.hours||0),price=Number(PRICES[hours]||0);if(!price)return res.redirect('/?error=plan');
 try{const key=await tx(async(c)=>{const u=await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[req.user.uid]);if(!u.rowCount||Number(u.rows[0].balance)<price)throw new Error('balance');let k;do{k=makeKey();const x=await c.query('SELECT 1 FROM vip_keys WHERE key_value=$1',[k]);if(!x.rowCount)break}while(true);const exp=new Date(Date.now()+hours*3600000);const nb=Number(u.rows[0].balance)-price;await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,req.user.uid]);await c.query("INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,user_id,note) VALUES($1,$2,$3,$4,1,$5,'Mua từ website')",[k,hours,price,exp,req.user.uid]);await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'purchase','Mua Key VIP')",[req.user.uid,-price,nb]);return k});res.redirect('/?purchased='+encodeURIComponent(key))}catch{res.redirect('/?error=balance')}
});

app.get('/admin',requireAdmin,async(req,res)=>{
 const [users,keys,devices,txs,wallet,fb,tt,done,reports]=await Promise.all([
  pool.query('SELECT id,username,email,role,balance,created_at FROM users ORDER BY id DESC'),
  pool.query('SELECT k.*,u.username,u.email FROM vip_keys k LEFT JOIN users u ON u.id=k.user_id ORDER BY k.id DESC'),
  pool.query('SELECT d.*,k.key_value,u.username,u.email FROM key_devices d JOIN vip_keys k ON k.id=d.key_id LEFT JOIN users u ON u.id=k.user_id ORDER BY d.id DESC'),
  pool.query('SELECT t.*,u.username,u.email FROM balance_transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 200'),
  pool.query('SELECT r.*,u.username,u.email FROM wallet_requests r JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 200'),
  pool.query('SELECT * FROM fb_jobs ORDER BY id DESC LIMIT 200'),pool.query('SELECT * FROM tiktok_jobs ORDER BY id DESC LIMIT 200'),
  pool.query('SELECT c.*,u.username FROM job_completions c LEFT JOIN users u ON u.id=c.user_id ORDER BY c.id DESC LIMIT 100'),
  pool.query('SELECT * FROM job_reports ORDER BY id DESC LIMIT 50')
 ]);
 const body=`<div class="top card"><div><span class="badge">BON SHOP · CONTROL CENTER</span><h1>👑 Quản trị hệ thống</h1><p class="muted">${h(req.user.email)}</p></div><a href="/logout">Đăng xuất</a></div>
 <div class="grid"><div class="card">Users<h2>${users.rowCount}</h2></div><div class="card">VIP Keys<h2>${keys.rowCount}</h2></div><div class="card">Devices<h2>${devices.rowCount}</h2></div><div class="card">Wallet<h2>${wallet.rowCount}</h2></div><div class="card">FB Jobs<h2>${fb.rowCount}</h2></div><div class="card">TikTok Jobs<h2>${tt.rowCount}</h2></div></div>
 <div class="card"><h2>👤 Users / số dư</h2><table><tr><th>ID</th><th>User</th><th>Email</th><th>Role</th><th>Balance</th><th>Điều chỉnh</th></tr>${users.rows.map(u=>`<tr><td>${u.id}</td><td>${h(u.username||'-')}</td><td>${h(u.email)}</td><td>${h(u.role)}</td><td>${money(u.balance)}</td><td><form method="post" action="/admin/balance" style="display:flex;gap:5px"><input type="hidden" name="uid" value="${u.id}"><input name="amount" type="number" min="1" placeholder="VNĐ"><button name="action" value="topup">+ Cộng</button><button class="danger" name="action" value="deduct">− Trừ</button></form></td></tr>`).join('')}</table></div>
 <div class="card"><h2>🔑 VIP Keys</h2><form method="post" action="/admin/key/create" class="wallet"><select name="uid"><option value="0">Chưa gán</option>${users.rows.map(u=>`<option value="${u.id}">${h(u.username||u.email)}</option>`).join('')}</select><input name="hours" type="number" value="720" min="1"><input name="price" type="number" value="50000" min="0"><input name="note" placeholder="Ghi chú"><button>Tạo Key</button></form><table><tr><th>ID</th><th>Key</th><th>Gói</th><th>Giá</th><th>User</th><th>Hạn</th><th>Thiết bị</th><th>Trạng thái</th><th>Thao tác</th></tr>${keys.rows.map(k=>`<tr><td>${k.id}</td><td>${h(k.key_value)}</td><td>${k.duration_hours}h</td><td>${money(k.price)}</td><td>${h(k.username||k.email||'-')}</td><td>${h(k.expires_at)}</td><td>${k.device_limit}</td><td>${h(k.status)}</td><td><form method="post" action="/admin/key/action" style="display:flex;gap:4px"><input type="hidden" name="id" value="${k.id}"><input name="hours" type="number" value="24" min="1" style="width:70px"><button name="action" value="extend">+h</button><button name="action" value="${k.status==='active'?'disable':'enable'}">${k.status==='active'?'Khóa':'Mở'}</button><button name="action" value="reset">Reset</button><button class="danger" name="action" value="delete">Xóa</button></form></td></tr>`).join('')}</table></div>
 <div class="card"><h2>💳 Nạp/Rút</h2><table><tr><th>ID</th><th>User</th><th>Loại</th><th>Tiền</th><th>Bank</th><th>STK</th><th>Trạng thái</th><th>Xử lý</th></tr>${wallet.rows.map(r=>`<tr><td>${r.id}</td><td>${h(r.username||r.email)}</td><td>${h(r.request_type)}</td><td>${money(r.amount)}</td><td>${h(r.bank_name)}</td><td>${h(r.account_number||'-')}</td><td>${h(r.status)}</td><td>${r.status==='pending'?`<form method="post" action="/admin/wallet" style="display:flex;gap:4px"><input type="hidden" name="id" value="${r.id}"><button class="green" name="action" value="approve">Duyệt</button><button class="danger" name="action" value="reject">Từ chối</button></form>`:'Đã xử lý'}</td></tr>`).join('')}</table></div>
 <div class="card"><h2>⚙️ Facebook Jobs</h2><form method="post" action="/admin/job/fb" class="wallet"><input name="link" placeholder="Link" required><input name="object_id" placeholder="Object ID" required><select name="type"><option>like</option><option>share</option><option>comment</option><option>follow</option></select><select name="reaction"><option>like</option><option>love</option><option>haha</option><option>wow</option><option>sad</option><option>angry</option><option>share</option></select><input name="price" type="number" value="35"><input name="max_uses" type="number" value="9999"><button>Thêm FB Job</button></form><table><tr><th>ID</th><th>Object</th><th>Type</th><th>Reaction</th><th>Price</th><th>Used</th><th>Status</th></tr>${fb.rows.map(j=>`<tr><td>${j.id}</td><td>${h(j.object_id)}</td><td>${h(j.type)}</td><td>${h(j.reaction)}</td><td>${j.price}</td><td>${j.used_count}/${j.max_uses}</td><td>${h(j.status)}</td></tr>`).join('')}</table></div>
 <div class="card"><h2>⚙️ TikTok Jobs</h2><form method="post" action="/admin/job/tt" class="wallet"><input name="video_url" placeholder="Video URL"><input name="ads_id" placeholder="Ads ID" required><input name="account_id" placeholder="Account ID"><input name="price" type="number" value="20"><input name="max_uses" type="number" value="9999"><button>Thêm TikTok Job</button></form><table><tr><th>ID</th><th>Ads ID</th><th>Account</th><th>Price</th><th>Used</th><th>Status</th></tr>${tt.rows.map(j=>`<tr><td>${j.id}</td><td>${h(j.ads_id)}</td><td>${h(j.account_id)}</td><td>${j.price}</td><td>${j.used_count}/${j.max_uses}</td><td>${h(j.status)}</td></tr>`).join('')}</table></div>
 <div class="card"><h2>📱 Devices</h2><table><tr><th>ID</th><th>Key</th><th>User</th><th>Device hash</th><th>Last seen</th></tr>${devices.rows.map(d=>`<tr><td>${d.id}</td><td>${h(d.key_value)}</td><td>${h(d.username||d.email||'-')}</td><td>${h(d.device_hash.slice(0,16))}…</td><td>${h(d.last_seen)}</td></tr>`).join('')}</table></div>
 <div class="card"><h2>📊 Transactions</h2><table><tr><th>ID</th><th>User</th><th>Amount</th><th>After</th><th>Type</th><th>Description</th></tr>${txs.rows.map(t=>`<tr><td>${t.id}</td><td>${h(t.username||t.email)}</td><td>${money(t.amount)}</td><td>${money(t.balance_after)}</td><td>${h(t.type)}</td><td>${h(t.description||'-')}</td></tr>`).join('')}</table></div>
 <div class="card"><h2>🕒 Completed jobs</h2><table><tr><th>ID</th><th>Platform</th><th>Job</th><th>User</th><th>Xu</th><th>Time</th></tr>${done.rows.map(d=>`<tr><td>${d.id}</td><td>${h(d.platform)}</td><td>${d.job_id}</td><td>${h(d.username||'-')}</td><td>${d.amount}</td><td>${h(d.created_at)}</td></tr>`).join('')}</table></div>`;
 res.send(layout('BON SHOP — Admin',body))
});
app.post('/admin/balance',requireAdmin,async(req,res)=>{const uid=Number(req.body.uid),amount=Number(req.body.amount),act=req.body.action;if(uid<=0||amount<=0)return res.redirect('/admin');try{await tx(async(c)=>{const u=await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[uid]);if(!u.rowCount)throw 0;const old=Number(u.rows[0].balance);if(act==='deduct'&&old<amount)throw 0;const nb=act==='deduct'?old-amount:old+amount;await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,uid]);await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_adjust',$4)",[uid,act==='deduct'?-amount:amount,nb,act==='deduct'?'Admin trừ số dư':'Admin cộng số dư'])});res.redirect('/admin')}catch{res.redirect('/admin?error=balance')}});
app.post('/admin/key/create',requireAdmin,async(req,res)=>{let k;do{k=makeKey();const q=await pool.query('SELECT 1 FROM vip_keys WHERE key_value=$1',[k]);if(!q.rowCount)break}while(true);const hrr=Math.max(1,Number(req.body.hours||24)),price=Math.max(0,Number(req.body.price||0)),uid=Number(req.body.uid||0)||null;await pool.query("INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,user_id,note) VALUES($1,$2,$3,$4,1,$5,$6)",[k,hrr,price,new Date(Date.now()+hrr*3600000),uid,req.body.note||'']);res.redirect('/admin')});
app.post('/admin/key/action',requireAdmin,async(req,res)=>{const id=Number(req.body.id),a=req.body.action;try{if(a==='extend'){await pool.query("UPDATE vip_keys SET expires_at=GREATEST(COALESCE(expires_at,NOW()),NOW()) + ($1::int * INTERVAL '1 hour'),status='active',updated_at=NOW() WHERE id=$2",[Math.max(1,Number(req.body.hours||24)),id])}if(a==='disable')await pool.query("UPDATE vip_keys SET status='disabled',updated_at=NOW() WHERE id=$1",[id]);if(a==='enable')await pool.query("UPDATE vip_keys SET status='active',updated_at=NOW() WHERE id=$1",[id]);if(a==='reset')await pool.query('DELETE FROM key_devices WHERE key_id=$1',[id]);if(a==='delete')await pool.query('DELETE FROM vip_keys WHERE id=$1',[id]);}catch{}res.redirect('/admin')});
app.post('/admin/wallet',requireAdmin,async(req,res)=>{const id=Number(req.body.id),a=req.body.action;try{await tx(async(c)=>{const q=await c.query('SELECT * FROM wallet_requests WHERE id=$1 FOR UPDATE',[id]);if(!q.rowCount||q.rows[0].status!=='pending')throw 0;const r=q.rows[0];if(a==='approve'){await c.query("UPDATE wallet_requests SET status='approved',processed_at=NOW() WHERE id=$1",[id]);if(r.request_type==='deposit'){const u=await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[r.user_id]);const nb=Number(u.rows[0].balance)+Number(r.amount);await c.query('UPDATE users SET balance=$1 WHERE id=$2',[nb,r.user_id]);await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_topup',$4)",[r.user_id,r.amount,nb,'Nạp tiền - '+r.bank_name])}}else if(a==='reject'){await c.query("UPDATE wallet_requests SET status='rejected',processed_at=NOW() WHERE id=$1",[id]);if(r.request_type==='withdraw'){const u=await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[r.user_id]);const nb=Number(u.rows[0].balance)+Number(r.amount);await c.query('UPDATE users SET balance=$1 WHERE id=$2',[nb,r.user_id]);await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_adjust',$4)",[r.user_id,r.amount,nb,'Hoàn tiền rút bị từ chối'])}}else throw 0})}catch{}res.redirect('/admin')});
app.post('/admin/job/fb',requireAdmin,async(req,res)=>{await pool.query("INSERT INTO fb_jobs(link,object_id,type,reaction,price,max_uses) VALUES($1,$2,$3,$4,$5,$6)",[req.body.link,req.body.object_id,req.body.type||'like',req.body.reaction||'like',Number(req.body.price||35),Number(req.body.max_uses||9999)]);res.redirect('/admin')});
app.post('/admin/job/tt',requireAdmin,async(req,res)=>{await pool.query("INSERT INTO tiktok_jobs(video_url,ads_id,account_id,price,max_uses) VALUES($1,$2,$3,$4,$5)",[req.body.video_url||'',req.body.ads_id,req.body.account_id||'',Number(req.body.price||20),Number(req.body.max_uses||9999)]);res.redirect('/admin')});

app.use((req,res)=>res.status(404).send(layout('404',`<div class="card"><h1>404</h1><p>Không tìm thấy đường dẫn.</p><a href="/">Về trang chủ</a></div>`)));
migrate().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`BON SHOP running on 0.0.0.0:${PORT}`))).catch(e=>{console.error('Startup failed:',e);process.exit(1)});
