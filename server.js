'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({limit:'512kb'}));
app.use(express.urlencoded({extended:true,limit:'512kb'}));

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'akklanh84@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '').trim();
const SESSION_SECRET = String(process.env.SESSION_SECRET || '').trim();
const KEYADMIN_SECRET = String(process.env.KEYADMIN_SECRET || 'huongdev8386');
const API_SECRET = String(process.env.API_SECRET || '').trim();
const PUBLIC_URL = String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://bonshop.onrender.com').replace(/\/+$/,'');
const DB_SSL = String(process.env.PGSSL || 'true').toLowerCase() !== 'false';
const DB_CONNECT_TIMEOUT = Number(process.env.PG_CONNECT_TIMEOUT_MS || 7000);

const prices = {24:2000,720:50000,2160:120000};
const banks = {Sacombank:{account:'050088931308',name:'DIEU LANH'},VietinBank:{account:'101886569909',name:'DIEU LANH'}};
const withdrawMin = 10000;

let dbReady = false;
let dbMigrated = false;
let dbLastError = null;
let migrationPromise = null;

const pool = new Pool({
  connectionString: DATABASE_URL || undefined,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: DB_CONNECT_TIMEOUT,
  query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 15000),
  keepAlive: true,
  ssl: DB_SSL ? {rejectUnauthorized:false} : undefined
});
pool.on('error', e => { dbReady=false; dbLastError=e.message; console.error('[DB pool]',e.message); });

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(v){return Number(v||0).toLocaleString('vi-VN');}
function sha(v){return crypto.createHash('sha256').update(String(v)).digest('hex');}
function validHash(v){return /^[a-f0-9]{64}$/i.test(String(v||''));}
function now(){return new Date().toISOString();}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function json(res,data,code=200){return res.status(code).json(data);}
function ok(res,data={}){return res.json({success:true,...data});}
function fail(res,message,code=200,extra={}){return res.status(code).json({success:false,message,...extra});}
function keyCode(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let p=[];for(let j=0;j<4;j++){let s='';for(let i=0;i<5;i++)s+=a[crypto.randomInt(0,a.length)];p.push(s);}return 'VIP-'+p.join('-');}

function sessionSign(payload){
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig=crypto.createHmac('sha256',SESSION_SECRET || 'temporary-dev-secret').update(body).digest('base64url');
  return body+'.'+sig;
}
function sessionRead(req){
  const h=req.headers.cookie||'';
  const item=h.split(';').map(x=>x.trim()).find(x=>x.startsWith('bon_session='));
  if(!item)return null;
  try{
    const token=decodeURIComponent(item.slice(12));
    const [body,sig]=token.split('.');
    if(!body||!sig)return null;
    const expected=crypto.createHmac('sha256',SESSION_SECRET || 'temporary-dev-secret').update(body).digest('base64url');
    if(sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
    const data=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    return data.exp && Date.now()>data.exp ? null : data;
  }catch(_){return null;}
}
function sessionSet(res,data){
  const payload={...data,iat:Date.now(),exp:Date.now()+7*86400000};
  const token=encodeURIComponent(sessionSign(payload));
  res.setHeader('Set-Cookie',`bon_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7*86400}`);
}
function sessionClear(res){res.setHeader('Set-Cookie','bon_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');}
function user(req){return sessionRead(req);}
function requireUser(req,res,next){const s=user(req);if(!s||s.role!=='user')return res.redirect('/?error='+encodeURIComponent('Vui lòng đăng nhập.'));req.session=s;next();}
function requireAdmin(req,res,next){const s=user(req);if(!s||s.role!=='admin')return res.redirect('/admin?error='+encodeURIComponent('Bạn chưa đăng nhập admin.'));req.session=s;next();}

async function ensureColumns(c){
  const statements=[
    `CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY,username VARCHAR(50),email VARCHAR(190) NOT NULL,password_hash VARCHAR(255) NOT NULL,role VARCHAR(20) NOT NULL DEFAULT 'user',balance BIGINT NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(190)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS balance BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email))`,
    `CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username))`,

    `CREATE TABLE IF NOT EXISTS vip_keys (id BIGSERIAL PRIMARY KEY,key_value VARCHAR(80) NOT NULL UNIQUE,duration_hours INTEGER NOT NULL DEFAULT 24,price BIGINT NOT NULL DEFAULT 0,expires_at TIMESTAMPTZ,device_limit INTEGER NOT NULL DEFAULT 1,status VARCHAR(20) NOT NULL DEFAULT 'active',user_id BIGINT,note VARCHAR(255),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS key_value VARCHAR(80)`,
    `ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS duration_hours INTEGER NOT NULL DEFAULT 24`,
    `ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS price BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
    `ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS device_limit INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`,
    `ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS user_id BIGINT`,
    `ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS note VARCHAR(255)`,
    `ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_vip_key_value ON vip_keys(key_value)`,
    `CREATE INDEX IF NOT EXISTS idx_vip_user ON vip_keys(user_id)`,

    `CREATE TABLE IF NOT EXISTS key_devices (id BIGSERIAL PRIMARY KEY,key_id BIGINT NOT NULL,device_hash CHAR(64) NOT NULL,first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(key_id,device_hash))`,
    `ALTER TABLE key_devices ADD COLUMN IF NOT EXISTS first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `ALTER TABLE key_devices ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_key_device ON key_devices(key_id,device_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_key_devices_key ON key_devices(key_id)`,

    `CREATE TABLE IF NOT EXISTS balance_transactions (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,amount BIGINT NOT NULL,balance_after BIGINT NOT NULL,type VARCHAR(40) NOT NULL,description VARCHAR(255),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS description VARCHAR(255)`,
    `ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `CREATE INDEX IF NOT EXISTS idx_tx_user ON balance_transactions(user_id,id DESC)`,

    `CREATE TABLE IF NOT EXISTS wallet_requests (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,request_type VARCHAR(20) NOT NULL,amount BIGINT NOT NULL,bank_name VARCHAR(100) NOT NULL,account_number VARCHAR(80),account_name VARCHAR(190),note VARCHAR(255),status VARCHAR(20) NOT NULL DEFAULT 'pending',admin_note VARCHAR(255),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),processed_at TIMESTAMPTZ)`,
    `ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS account_number VARCHAR(80)`,
    `ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS account_name VARCHAR(190)`,
    `ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS note VARCHAR(255)`,
    `ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS admin_note VARCHAR(255)`,
    `ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`,
    `CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_requests(user_id,id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_wallet_status ON wallet_requests(status)`,

    `CREATE TABLE IF NOT EXISTS fb_jobs (id BIGSERIAL PRIMARY KEY,link VARCHAR(500) NOT NULL,object_id VARCHAR(100) NOT NULL,type VARCHAR(30) NOT NULL DEFAULT 'like',reaction VARCHAR(30) NOT NULL DEFAULT 'like',price INTEGER NOT NULL DEFAULT 35,max_uses INTEGER NOT NULL DEFAULT 9999,used_count INTEGER NOT NULL DEFAULT 0,status VARCHAR(20) NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `ALTER TABLE fb_jobs ADD COLUMN IF NOT EXISTS link VARCHAR(500)`,
    `ALTER TABLE fb_jobs ADD COLUMN IF NOT EXISTS object_id VARCHAR(100)`,
    `ALTER TABLE fb_jobs ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'like'`,
    `ALTER TABLE fb_jobs ADD COLUMN IF NOT EXISTS reaction VARCHAR(30) NOT NULL DEFAULT 'like'`,
    `ALTER TABLE fb_jobs ADD COLUMN IF NOT EXISTS price INTEGER NOT NULL DEFAULT 35`,
    `ALTER TABLE fb_jobs ADD COLUMN IF NOT EXISTS max_uses INTEGER NOT NULL DEFAULT 9999`,
    `ALTER TABLE fb_jobs ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE fb_jobs ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`,
    `ALTER TABLE fb_jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `CREATE INDEX IF NOT EXISTS idx_fb_active ON fb_jobs(status,used_count,max_uses)`,

    `CREATE TABLE IF NOT EXISTS tiktok_jobs (id BIGSERIAL PRIMARY KEY,video_url VARCHAR(500) NOT NULL,ads_id VARCHAR(100) NOT NULL,account_id VARCHAR(100) NOT NULL,price INTEGER NOT NULL DEFAULT 20,max_uses INTEGER NOT NULL DEFAULT 9999,used_count INTEGER NOT NULL DEFAULT 0,status VARCHAR(20) NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `ALTER TABLE tiktok_jobs ADD COLUMN IF NOT EXISTS video_url VARCHAR(500)`,
    `ALTER TABLE tiktok_jobs ADD COLUMN IF NOT EXISTS ads_id VARCHAR(100)`,
    `ALTER TABLE tiktok_jobs ADD COLUMN IF NOT EXISTS account_id VARCHAR(100)`,
    `ALTER TABLE tiktok_jobs ADD COLUMN IF NOT EXISTS price INTEGER NOT NULL DEFAULT 20`,
    `ALTER TABLE tiktok_jobs ADD COLUMN IF NOT EXISTS max_uses INTEGER NOT NULL DEFAULT 9999`,
    `ALTER TABLE tiktok_jobs ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE tiktok_jobs ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`,
    `ALTER TABLE tiktok_jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `CREATE INDEX IF NOT EXISTS idx_tt_ads ON tiktok_jobs(ads_id)`,

    `CREATE TABLE IF NOT EXISTS job_completions (id BIGSERIAL PRIMARY KEY,platform VARCHAR(20) NOT NULL,job_id BIGINT NOT NULL,device_hash CHAR(64) NOT NULL,user_id BIGINT,amount INTEGER NOT NULL DEFAULT 0,status VARCHAR(20) NOT NULL DEFAULT 'done',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(platform,job_id,device_hash))`,
    `CREATE INDEX IF NOT EXISTS idx_completion_device ON job_completions(device_hash,platform)`,
    `CREATE TABLE IF NOT EXISTS job_reports (id BIGSERIAL PRIMARY KEY,platform VARCHAR(20) NOT NULL,job_id BIGINT NOT NULL,uid VARCHAR(100),device_hash CHAR(64) NOT NULL,description VARCHAR(255),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS app_credits (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,device_hash CHAR(64) NOT NULL,name_tool VARCHAR(50) NOT NULL DEFAULT '',amount INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS idx_credits_device_time ON app_credits(device_hash,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_credits_user ON app_credits(user_id,id DESC)`
  ];
  for(const s of statements) await c.query(s);
}

async function migrate(){
  if(!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await ensureColumns(c);
    await c.query('UPDATE users SET updated_at=COALESCE(updated_at,created_at,NOW()) WHERE updated_at IS NULL');
    await c.query('UPDATE vip_keys SET updated_at=COALESCE(updated_at,created_at,NOW()) WHERE updated_at IS NULL');
    await c.query('COMMIT');
    dbMigrated=true;
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}

async function ensureAdmin(){
  if(!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
  const hash=await bcrypt.hash(ADMIN_PASSWORD,12);
  const q=await pool.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1) ORDER BY id LIMIT 1',[ADMIN_EMAIL]);
  if(q.rowCount){await pool.query(`UPDATE users SET role='admin',password_hash=$1,updated_at=NOW() WHERE id=$2`,[hash,q.rows[0].id]);}
  else await pool.query(`INSERT INTO users(username,email,password_hash,role,balance) VALUES($1,$2,$3,'admin',0)`,['admin',ADMIN_EMAIL,hash]);
}

async function connectDatabase(){
  if(!DATABASE_URL){dbReady=false;dbLastError='DATABASE_URL is required';return;}
  if(migrationPromise)return migrationPromise;
  migrationPromise=(async()=>{
    let delay=3000;
    for(let attempt=1;attempt<=999;attempt++){
      try{
        await pool.query('SELECT 1');
        if(!dbMigrated) await migrate();
        await ensureAdmin();
        dbReady=true;dbLastError=null;
        console.log('[BON] PostgreSQL READY');
        return;
      }catch(e){
        dbReady=false;dbLastError=e.message;
        console.error(`[BON] DB attempt ${attempt} failed: ${e.message}`);
        await sleep(Math.min(delay,30000));
        delay=Math.min(Math.round(delay*1.5),30000);
      }
    }
  })().finally(()=>{migrationPromise=null;});
  return migrationPromise;
}
function dbGuard(res){if(dbReady)return true;return json(res,{success:false,message:'Cơ sở dữ liệu chưa sẵn sàng',database:'starting'},503);}
async function dbQuery(sql,params=[]){
  try{return await pool.query(sql,params);}catch(e){dbReady=false;dbLastError=e.message;throw e;}
}

async function validateVip(key){
  if(!key)return {ok:false,status:'invalid',message:'Thiếu APIKey'};
  const q=await dbQuery('SELECT * FROM vip_keys WHERE key_value=$1 LIMIT 1',[key]);
  const v=q.rows[0];
  if(!v)return {ok:false,status:'invalid',message:'Key VIP không tồn tại'};
  if(v.status==='disabled')return {ok:false,status:'disabled',message:'Key VIP đã bị khóa',vip:v};
  if(!v.expires_at || new Date(v.expires_at).getTime()<=Date.now()){
    await dbQuery(`UPDATE vip_keys SET status='expired',updated_at=NOW() WHERE id=$1`,[v.id]);
    return {ok:false,status:'expired',message:'Key VIP đã hết hạn',vip:v};
  }
  return {ok:true,status:'success',message:'Key VIP hợp lệ',vip:v};
}
async function bindDevice(vip,deviceId){
  if(!deviceId)return {ok:true,count:0,bound:''};
  const h=sha(deviceId);
  const known=await dbQuery('SELECT id FROM key_devices WHERE key_id=$1 AND device_hash=$2 LIMIT 1',[vip.id,h]);
  const count=Number((await dbQuery('SELECT COUNT(*)::int n FROM key_devices WHERE key_id=$1',[vip.id])).rows[0].n);
  if(!known.rowCount && count>=Number(vip.device_limit||1))return {ok:false,count,limit:Number(vip.device_limit||1)};
  if(known.rowCount)await dbQuery('UPDATE key_devices SET last_seen=NOW() WHERE id=$1',[known.rows[0].id]);
  else await dbQuery('INSERT INTO key_devices(key_id,device_hash) VALUES($1,$2) ON CONFLICT DO NOTHING',[vip.id,h]);
  return {ok:true,count:known.rowCount?count:count+1,bound:deviceId,hash:h};
}
function vipResponse(v,b){
  return {success:true,status:'success',msg:'Xác thực Server thành công: Key VIP hợp lệ!',message:'Key VIP hợp lệ',key:b.vip.key_value,api_key:b.vip.key_value,vip:true,duration_hours:Number(b.vip.duration_hours),expires_at:b.vip.expires_at,endDate:b.vip.expires_at,end_date:b.vip.expires_at,create_date:b.vip.created_at,device_ID:b.bound||'',device_id:b.bound||'',device_count:b.count,device_limit:Number(b.vip.device_limit||1),owner_user_id:b.vip.user_id||null};
}

function shell(title,body,req,extra=''){
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#070b13;color:#edf2ff;font:15px Arial,sans-serif}a{color:#8bd7ff;text-decoration:none}.wrap{max-width:1180px;margin:auto;padding:18px}.card{background:#0e1625;border:1px solid #24334b;border-radius:18px;padding:18px;margin-bottom:16px;box-shadow:0 12px 35px #0006}.top{display:flex;justify-content:space-between;gap:12px;align-items:center}.brand{font-size:25px;font-weight:900}.muted{color:#91a0b8}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.stat{padding:16px;border:1px solid #293b58;border-radius:14px;background:#0a1220}.stat span{display:block;color:#8d9db5;font-size:12px}.stat b{display:block;font-size:26px;margin-top:6px}.badge{display:inline-block;padding:5px 10px;border-radius:99px;background:#152844;color:#a9dcff;font-size:12px}.notice{padding:12px;border-radius:12px;background:#17253b;border:1px solid #31517a;margin-bottom:14px}input,select,textarea{width:100%;padding:11px;border:1px solid #334663;border-radius:10px;background:#09111e;color:#fff}textarea{min-height:90px}.row{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.formrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}button,.btn{border:0;border-radius:10px;padding:11px 15px;background:#246bff;color:#fff;font-weight:800;cursor:pointer}.green{background:#138a4a}.danger{background:#b42318}.gray{background:#2a3850}table{width:100%;border-collapse:collapse;display:block;overflow:auto}th,td{padding:9px;border-bottom:1px solid #263751;text-align:left;white-space:nowrap}.key{font-family:monospace;color:#6ee7ff;font-weight:800;word-break:break-all}.login{max-width:440px;margin:8vh auto}.center{text-align:center}.small{font-size:12px}.side{position:fixed;left:0;top:0;bottom:0;width:260px;background:#0b1320;border-right:1px solid #22334d;padding:20px;z-index:3}.main{margin-left:260px;max-width:1180px;padding:18px}.nav a{display:block;padding:12px;border-radius:10px;margin:5px 0;color:#dce8f7}.nav a:hover{background:#16243a}.logo{display:flex;align-items:center;gap:10px;margin-bottom:24px}.logoMark{width:42px;height:42px;border-radius:13px;border:2px solid #20d873;display:grid;place-items:center;font-weight:900;color:#20d873}.menuBtn{display:none}@media(max-width:800px){.side{position:static;width:auto;border:0}.main{margin:0}.grid,.grid2,.row{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}.menuBtn{display:block}.side{display:none}.side.open{display:block}}
</style>${extra}</head><body>${body}</body></html>`;
}
function loginPage(req){const e=req.query.error||'';return shell('BON SHOP',`<div class="wrap"><div class="card login"><div class="center"><div class="logo" style="justify-content:center"><div class="logoMark">B</div><div class="brand">BON SHOP</div></div><p class="muted">AI · AUTOMATION · MMO</p></div>${e?`<div class="notice">${esc(e)}</div>`:''}<form method="post" action="/login"><div class="small muted">Username hoặc Gmail</div><input name="login_id" required autocomplete="username"><div class="small muted" style="margin-top:10px">Mật khẩu</div><input name="pass" type="password" required autocomplete="current-password"><button style="width:100%;margin-top:12px">Đăng nhập</button></form><hr style="border-color:#263751;margin:20px 0"><form method="post" action="/register"><h3>Tạo tài khoản</h3><div class="row"><input name="username" placeholder="Username" required><input name="email" type="email" placeholder="Gmail" required></div><input name="pass" type="password" placeholder="Mật khẩu tối thiểu 6 ký tự" required style="margin-top:9px"><button class="gray" style="width:100%;margin-top:9px">Đăng ký</button></form><p class="center small muted" style="margin-top:18px"><a href="/admin">Admin</a> · <a href="/statistics">Thống kê</a> · <a href="/api">API</a></p></div></div>`,req);}
function nav(isAdmin=false){return `<div class="side"><div class="logo"><div class="logoMark">B</div><div><b>BON SHOP</b><div class="small muted">${isAdmin?'ADMIN':'AI · AUTOMATION · MMO'}</div></div></div><div class="nav"><a href="/">🏠 Trang chủ</a><a href="/statistics">📊 Thống kê</a><a href="/Key_Free/">🔑 Key Free</a>${isAdmin?'<a href="/admin">⚙ Quản trị</a>':''}</div></div>`;}

async function renderUser(req){
  const uid=req.session.uid;
  const u=(await dbQuery('SELECT id,username,email,balance,created_at FROM users WHERE id=$1',[uid])).rows[0];
  if(!u)return loginPage(req);
  const [keys,tx,wallets]=await Promise.all([
    dbQuery(`SELECT id,key_value,duration_hours,expires_at,device_limit,status,created_at,note FROM vip_keys WHERE user_id=$1 ORDER BY id DESC LIMIT 30`,[uid]),
    dbQuery(`SELECT amount,balance_after,type,description,created_at FROM balance_transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 20`,[uid]),
    dbQuery(`SELECT request_type,amount,bank_name,status,created_at FROM wallet_requests WHERE user_id=$1 ORDER BY id DESC LIMIT 10`,[uid])
  ]);
  const plans=Object.entries(prices).map(([h,p])=>`<div class="stat"><span>VIP ${h} giờ</span><b>${money(p)} xu</b><form method="post" action="/user/buy"><input type="hidden" name="hours" value="${h}"><button style="margin-top:10px">Mua Key</button></form></div>`).join('');
  const keyRows=keys.rows.map(k=>`<tr><td class="key">${esc(k.key_value)}</td><td>${k.duration_hours}h</td><td>${esc(k.expires_at||'')}</td><td>${esc(k.status)}</td><td>${k.device_limit}</td></tr>`).join('')||'<tr><td colspan="5">Chưa có key.</td></tr>';
  const txRows=tx.rows.map(t=>`<tr><td>${esc(t.created_at)}</td><td>${Number(t.amount)>=0?'+':''}${money(t.amount)}</td><td>${money(t.balance_after)}</td><td>${esc(t.type)}</td><td>${esc(t.description||'')}</td></tr>`).join('')||'<tr><td colspan="5">Chưa có giao dịch.</td></tr>';
  const walletRows=wallets.rows.map(w=>`<tr><td>${esc(w.request_type)}</td><td>${money(w.amount)}</td><td>${esc(w.bank_name)}</td><td>${esc(w.status)}</td><td>${esc(w.created_at)}</td></tr>`).join('')||'<tr><td colspan="5">Chưa có yêu cầu.</td></tr>';
  const bankOpts=Object.keys(banks).map(x=>`<option>${esc(x)}</option>`).join('');
  return shell('BON SHOP — Tài khoản',`${nav(false)}<main class="main"><div class="top card"><div><div class="brand">Xin chào ${esc(u.username||u.email)}</div><div class="muted">Tài khoản BON SHOP</div></div><div class="formrow"><span class="badge">${money(u.balance)} xu</span><form method="post" action="/logout"><button class="gray">Đăng xuất</button></form></div></div><div class="grid">${plans}</div><div class="grid2"><div class="card"><h3>💳 Nạp tiền</h3>${Object.entries(banks).map(([n,b])=>`<div class="notice"><b>${n}</b><br>STK: <span class="key">${b.account}</span><br>Chủ TK: ${b.name}</div>`).join('')}<form method="post" action="/user/deposit"><select name="bank">${bankOpts}</select><input name="amount" type="number" min="1000" placeholder="Số tiền" style="margin-top:8px"><input name="note" placeholder="Nội dung chuyển khoản" style="margin-top:8px"><button class="green" style="margin-top:8px">Gửi yêu cầu nạp</button></form></div><div class="card"><h3>🏦 Rút tiền</h3><form method="post" action="/user/withdraw"><select name="bank">${bankOpts}</select><input name="account_number" placeholder="Số tài khoản" style="margin-top:8px"><input name="account_name" placeholder="Tên chủ tài khoản" style="margin-top:8px"><input name="amount" type="number" min="${withdrawMin}" placeholder="Số xu" style="margin-top:8px"><button style="margin-top:8px">Gửi yêu cầu rút</button></form></div></div><div class="card"><h3>🔑 Key VIP của tôi</h3><table><tr><th>Key</th><th>Giờ</th><th>Hết hạn</th><th>Trạng thái</th><th>Thiết bị</th></tr>${keyRows}</table></div><div class="grid2"><div class="card"><h3>💰 Lịch sử số dư</h3><table><tr><th>Ngày</th><th>Xu</th><th>Số dư</th><th>Loại</th><th>Ghi chú</th></tr>${txRows}</table></div><div class="card"><h3>📦 Nạp/Rút</h3><table><tr><th>Loại</th><th>Số tiền</th><th>Ngân hàng</th><th>Status</th><th>Ngày</th></tr>${walletRows}</table></div></div></main>`,req);}

async function renderAdmin(req){
  const [stats,users,keys,devices,tx,fb,tt,wallets]=await Promise.all([
    dbQuery(`SELECT (SELECT COUNT(*) FROM users WHERE role='user') users,(SELECT COUNT(*) FROM vip_keys WHERE status='active' AND expires_at>NOW()) active_keys,(SELECT COUNT(*) FROM key_devices) devices,(SELECT COALESCE(SUM(amount),0) FROM balance_transactions WHERE amount>0) earned,(SELECT COUNT(*) FROM job_completions WHERE platform='facebook') fb_done,(SELECT COUNT(*) FROM job_completions WHERE platform='tiktok') tt_done`),
    dbQuery(`SELECT id,username,email,role,balance,created_at FROM users ORDER BY id DESC LIMIT 100`),
    dbQuery(`SELECT k.id,k.key_value,k.duration_hours,k.price,k.expires_at,k.device_limit,k.status,k.user_id,k.created_at,u.username,u.email FROM vip_keys k LEFT JOIN users u ON u.id=k.user_id ORDER BY k.id DESC LIMIT 100`),
    dbQuery(`SELECT d.id,d.key_id,d.device_hash,d.first_seen,d.last_seen,k.key_value FROM key_devices d JOIN vip_keys k ON k.id=d.key_id ORDER BY d.id DESC LIMIT 100`),
    dbQuery(`SELECT bt.amount,bt.balance_after,bt.type,bt.description,bt.created_at,u.username,u.email FROM balance_transactions bt LEFT JOIN users u ON u.id=bt.user_id ORDER BY bt.id DESC LIMIT 100`),
    dbQuery(`SELECT * FROM fb_jobs ORDER BY id DESC LIMIT 100`),
    dbQuery(`SELECT * FROM tiktok_jobs ORDER BY id DESC LIMIT 100`),
    dbQuery(`SELECT w.*,u.username,u.email FROM wallet_requests w LEFT JOIN users u ON u.id=w.user_id ORDER BY w.id DESC LIMIT 100`)
  ]);
  const s=stats.rows[0]; const opts=users.rows.filter(u=>u.role==='user').map(u=>`<option value="${u.id}">${esc(u.username||u.email)} (#${u.id})</option>`).join('');
  const userRows=users.rows.map(u=>`<tr><td>${u.id}</td><td>${esc(u.username||'')}</td><td>${esc(u.email)}</td><td>${u.role}</td><td>${money(u.balance)}</td><td><form class="formrow" method="post" action="/admin/balance"><input type="hidden" name="uid" value="${u.id}"><input name="amount" type="number" min="1" placeholder="xu" style="width:90px"><button class="green" name="action" value="topup">+</button><button class="danger" name="action" value="deduct">−</button></form></td></tr>`).join('');
  const keyRows=keys.rows.map(k=>`<tr><td>${k.id}</td><td class="key">${esc(k.key_value)}</td><td>${esc(k.username||k.email||'-')}</td><td>${k.duration_hours}h</td><td>${esc(k.expires_at||'')}</td><td>${esc(k.status)}</td><td>${k.device_limit}</td><td class="formrow"><form method="post" action="/admin/key"><input type="hidden" name="id" value="${k.id}"><button name="action" value="${k.status==='active'?'disable':'enable'}">${k.status==='active'?'Khóa':'Mở'}</button><button name="action" value="reset" class="gray">Reset TB</button></form></td></tr>`).join('')||'<tr><td colspan="8">Chưa có key.</td></tr>';
  const deviceRows=devices.rows.map(d=>`<tr><td>${d.id}</td><td class="key">${esc(d.key_value)}</td><td class="key">${esc(d.device_hash)}</td><td>${esc(d.first_seen)}</td><td>${esc(d.last_seen)}</td></tr>`).join('')||'<tr><td colspan="5">Chưa có.</td></tr>';
  const walletRows=wallets.rows.map(w=>`<tr><td>${w.id}</td><td>${esc(w.username||w.email||'-')}</td><td>${w.request_type}</td><td>${money(w.amount)}</td><td>${esc(w.bank_name)}</td><td>${esc(w.account_number||'')}</td><td>${esc(w.status)}</td><td>${esc(w.created_at)}</td><td>${w.status==='pending'?`<form class="formrow" method="post" action="/admin/wallet"><input type="hidden" name="id" value="${w.id}"><button name="action" value="approve" class="green">Duyệt</button><button name="action" value="reject" class="danger">Từ chối</button></form>`:''}</td></tr>`).join('')||'<tr><td colspan="9">Chưa có.</td></tr>';
  const fbRows=fb.rows.map(j=>`<tr><td>${j.id}</td><td>${esc(j.object_id)}</td><td>${esc(j.type)}/${esc(j.reaction)}</td><td>${money(j.price)}</td><td>${j.used_count}/${j.max_uses}</td><td>${j.status}</td><td><form class="formrow" method="post" action="/admin/job"><input type="hidden" name="platform" value="fb"><input type="hidden" name="id" value="${j.id}"><button name="action" value="${j.status==='active'?'disable':'enable'}">${j.status==='active'?'Khóa':'Mở'}</button><button class="danger" name="action" value="delete">Xóa</button></form></td></tr>`).join('');
  const ttRows=tt.rows.map(j=>`<tr><td>${j.id}</td><td>${esc(j.ads_id)}</td><td>${esc(j.account_id)}</td><td>${money(j.price)}</td><td>${j.used_count}/${j.max_uses}</td><td>${j.status}</td><td><form class="formrow" method="post" action="/admin/job"><input type="hidden" name="platform" value="tt"><input type="hidden" name="id" value="${j.id}"><button name="action" value="${j.status==='active'?'disable':'enable'}">${j.status==='active'?'Khóa':'Mở'}</button><button class="danger" name="action" value="delete">Xóa</button></form></td></tr>`).join('');
  return shell('BON SHOP — Admin',`${nav(true)}<main class="main"><div class="top card"><div><div class="brand">BON SHOP · ADMIN</div><div class="muted">${esc(ADMIN_EMAIL)}</div></div><form method="post" action="/logout"><button class="gray">Đăng xuất</button></form></div><div class="grid"><div class="stat"><span>Users</span><b>${money(s.users)}</b></div><div class="stat"><span>Key hoạt động</span><b>${money(s.active_keys)}</b></div><div class="stat"><span>Thiết bị</span><b>${money(s.devices)}</b></div><div class="stat"><span>Xu đã cộng</span><b>${money(s.earned)}</b></div><div class="stat"><span>FB hoàn thành</span><b>${money(s.fb_done)}</b></div><div class="stat"><span>TikTok hoàn thành</span><b>${money(s.tt_done)}</b></div></div><div class="grid2"><div class="card"><h3>🔑 Tạo Key VIP</h3><form method="post" action="/admin/create-key"><div class="row"><input name="hours" type="number" min="1" value="24"><input name="price" type="number" min="0" value="0"></div><select name="uid" style="margin-top:8px"><option value="0">Không gán user</option>${opts}</select><input name="device_limit" type="number" min="1" value="1" placeholder="Giới hạn thiết bị" style="margin-top:8px"><input name="note" placeholder="Ghi chú" style="margin-top:8px"><button style="margin-top:8px">Tạo Key</button></form><p class="small muted">Muốn addHistory cộng xu cho tài khoản, hãy gán Key cho user ngay khi tạo.</p></div><div class="card"><h3>💰 Cộng / trừ xu</h3><form method="post" action="/admin/balance"><select name="uid">${opts}</select><input name="amount" type="number" min="1" placeholder="Số xu" style="margin-top:8px"><div class="formrow" style="margin-top:8px"><button name="action" value="topup" class="green">Cộng</button><button name="action" value="deduct" class="danger">Trừ</button></div></form></div></div><div class="card"><h3>👥 Người dùng</h3><table><tr><th>ID</th><th>User</th><th>Email</th><th>Role</th><th>Xu</th><th>Điều chỉnh</th></tr>${userRows}</table></div><div class="card"><h3>🔐 Key VIP</h3><table><tr><th>ID</th><th>Key</th><th>User</th><th>Giờ</th><th>Hết hạn</th><th>Status</th><th>TB</th><th>Thao tác</th></tr>${keyRows}</table></div><div class="card"><h3>📱 Thiết bị đã bind</h3><table><tr><th>ID</th><th>Key</th><th>Device SHA256</th><th>First</th><th>Last</th></tr>${deviceRows}</table></div><div class="card"><h3>💳 Nạp / Rút</h3><table><tr><th>ID</th><th>User</th><th>Loại</th><th>Tiền</th><th>Bank</th><th>STK</th><th>Status</th><th>Ngày</th><th></th></tr>${walletRows}</table></div><div class="grid2"><div class="card"><h3>➕ Job Facebook</h3><form method="post" action="/admin/add-job"><input type="hidden" name="platform" value="fb"><input name="link" placeholder="Link Facebook"><input name="object_id" placeholder="Object ID" style="margin-top:8px"><div class="row" style="margin-top:8px"><input name="type" value="like"><input name="reaction" value="like"></div><div class="row" style="margin-top:8px"><input name="price" type="number" value="35"><input name="max_uses" type="number" value="9999"></div><button style="margin-top:8px">Thêm job</button></form></div><div class="card"><h3>➕ Job TikTok</h3><form method="post" action="/admin/add-job"><input type="hidden" name="platform" value="tt"><input name="video_url" placeholder="Video URL"><input name="ads_id" placeholder="Ads ID" style="margin-top:8px"><input name="account_id" placeholder="Account ID" style="margin-top:8px"><div class="row" style="margin-top:8px"><input name="price" type="number" value="20"><input name="max_uses" type="number" value="9999"></div><button style="margin-top:8px">Thêm job</button></form></div></div><div class="grid2"><div class="card"><h3>Facebook Jobs</h3><table><tr><th>ID</th><th>Object</th><th>Type</th><th>Xu</th><th>Uses</th><th>Status</th><th></th></tr>${fbRows}</table></div><div class="card"><h3>TikTok Jobs</h3><table><tr><th>ID</th><th>Ads</th><th>Account</th><th>Xu</th><th>Uses</th><th>Status</th><th></th></tr>${ttRows}</table></div></div></main>`,req);}

async function safePage(res,fn){try{return res.send(await fn());}catch(e){console.error('[PAGE]',e);return res.status(200).send(shell('BON SHOP — lỗi',`<div class="wrap"><div class="card"><h2>Dịch vụ đang bận</h2><p class="muted">Không tải được dữ liệu tài khoản lúc này. PostgreSQL vẫn có thể đang reconnect.</p><a href="/">Tải lại</a></div></div>`));}}

// Public/health
app.get('/health',async(req,res)=>{
  let ping='unknown';
  if(DATABASE_URL){try{await pool.query('SELECT 1');ping='ok';if(!dbReady)connectDatabase().catch(()=>{});}catch(e){ping='error';dbLastError=e.message;dbReady=false;}}
  res.json({ok:true,service:'bon-shop',database:dbReady?'ready':'starting',db_ping:ping,migrated:dbMigrated,time:now()});
});
app.get('/api',(req,res)=>res.json({name:'BON SHOP API',version:'5.0.0',database:dbReady?'ready':'starting',endpoints:['GET /checkkey/api/key.php','GET /checkkey/api/check_date_key.php','GET /checkkey/api/api_golike_fb.php','GET /checkkey/api/api_golike_tiktok.php','POST /checkkey/','POST /api/check-key.php','GET /checkkey/api/announcement.json','GET /Key_Free/','GET /statistics']}));
app.get('/',async(req,res)=>{const s=user(req);if(s?.role==='user'){if(!dbGuard(res))return;return safePage(res,()=>renderUser(req));}return res.send(loginPage(req));});
app.get('/statistics',async(req,res)=>{if(!dbGuard(res))return;try{const q=await Promise.all([dbQuery("SELECT COUNT(*)::int n FROM users WHERE role='user'"),dbQuery("SELECT COUNT(*)::int n FROM vip_keys WHERE status='active' AND expires_at>NOW()"),dbQuery('SELECT COUNT(*)::int n FROM key_devices'),dbQuery('SELECT COALESCE(SUM(amount),0)::bigint n FROM balance_transactions WHERE amount>0'),dbQuery("SELECT COUNT(*)::int n FROM job_completions WHERE platform='facebook'"),dbQuery("SELECT COUNT(*)::int n FROM job_completions WHERE platform='tiktok'")]);const a=q.map(x=>x.rows[0].n);return res.send(shell('BON SHOP — Thống kê',`${nav(false)}<main class="main"><div class="card center"><div class="brand">BON SHOP</div><p class="muted">Hệ thống dịch vụ số · thống kê</p></div><div class="grid">${[['Người dùng',a[0]],['Key hoạt động',a[1]],['Thiết bị',a[2]],['Xu đã cộng',a[3]],['FB hoàn thành',a[4]],['TikTok hoàn thành',a[5]]].map(x=>`<div class="stat"><span>${x[0]}</span><b>${money(x[1])}</b></div>`).join('')}</div></main>`,req));}catch(e){console.error(e);return res.status(200).send(shell('BON SHOP',`<div class="wrap"><div class="card"><h2>Thống kê tạm thời không khả dụng</h2></div></div>`,req));}});
app.get('/Key_Free/',(req,res)=>{const k=String(req.query.key||'').trim();return res.send(shell('BON SHOP — Key Free',`${nav(false)}<main class="main"><div class="card login center"><span class="badge">BON SHOP · KEY FREE</span><h1>${k?'Mã kích hoạt':'Thiếu mã key'}</h1>${k?`<div class="stat key" style="font-size:20px">${esc(k)}</div><button style="margin-top:12px" onclick="navigator.clipboard&&navigator.clipboard.writeText(${JSON.stringify(k)})">📋 Sao chép</button>`:'<p class="muted">Không tìm thấy mã.</p>'}</div></main>`,req));});
app.get('/checkkey/api/announcement.json',(req,res)=>res.json({is_show:false,success:true,status:'success',id:'BON',version_code:10,versionCode:10,version:'5.0.0',version_name:'5.0.0',title:'🚀 BON SHOP',message:'BON SHOP đang hoạt động ổn định.',download_url:`${PUBLIC_URL}/BON_TOOL.apk`,downloadUrl:`${PUBLIC_URL}/BON_TOOL.apk`,force_update:false,forceUpdate:false,updated_at:now()}));

// Auth
app.post('/login',async(req,res)=>{try{if(!dbGuard(res))return;const login=String(req.body.login_id||'').trim().toLowerCase();const pass=String(req.body.pass||'');if(!login||!pass)return res.redirect('/?error='+encodeURIComponent('Thiếu thông tin đăng nhập.'));const q=await dbQuery('SELECT id,username,email,password_hash,role FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1) ORDER BY id LIMIT 1',[login]);const u=q.rows[0];if(!u||!(await bcrypt.compare(pass,u.password_hash)))return res.redirect('/?error='+encodeURIComponent('Sai username/email hoặc mật khẩu.'));sessionSet(res,{role:u.role==='admin'?'admin':'user',uid:Number(u.id),email:u.email,username:u.username||''});res.redirect(u.role==='admin'?'/admin':'/');}catch(e){console.error('[login]',e);res.redirect('/?error='+encodeURIComponent('Máy chủ đang bận, thử lại.'));}});
app.post('/register',async(req,res)=>{try{if(!dbGuard(res))return;const username=String(req.body.username||'').trim();const email=String(req.body.email||'').trim().toLowerCase();const pass=String(req.body.pass||'');if(!/^[A-Za-z0-9_]{3,30}$/.test(username))return res.redirect('/?error='+encodeURIComponent('Username 3-30 ký tự, chỉ chữ/số/_'));if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return res.redirect('/?error='+encodeURIComponent('Email không hợp lệ.'));if(pass.length<6)return res.redirect('/?error='+encodeURIComponent('Mật khẩu tối thiểu 6 ký tự.'));const dup=await dbQuery('SELECT id FROM users WHERE LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($2) LIMIT 1',[username,email]);if(dup.rowCount)return res.redirect('/?error='+encodeURIComponent('Username hoặc email đã tồn tại.'));const hash=await bcrypt.hash(pass,12);const q=await dbQuery(`INSERT INTO users(username,email,password_hash,role,balance) VALUES($1,$2,$3,'user',0) RETURNING id`,[username,email,hash]);sessionSet(res,{role:'user',uid:Number(q.rows[0].id),email,username});res.redirect('/');}catch(e){console.error('[register]',e);res.redirect('/?error='+encodeURIComponent('Không thể tạo tài khoản.'));}});
app.post('/logout',(req,res)=>{sessionClear(res);res.redirect('/');});

// User wallet/key
app.post('/user/deposit',requireUser,async(req,res)=>{try{if(!dbGuard(res))return;const bank=String(req.body.bank||'');const amount=Math.floor(Number(req.body.amount||0));const note=String(req.body.note||'').slice(0,255);if(!banks[bank]||amount<1000)return res.redirect('/?error='+encodeURIComponent('Thông tin nạp tiền không hợp lệ.'));await dbQuery(`INSERT INTO wallet_requests(user_id,request_type,amount,bank_name,note,status) VALUES($1,'deposit',$2,$3,$4,'pending')`,[req.session.uid,amount,bank,note]);res.redirect('/');}catch(e){console.error(e);res.redirect('/?error='+encodeURIComponent('Không thể tạo yêu cầu nạp.'));}});
app.post('/user/withdraw',requireUser,async(req,res)=>{const c=await pool.connect();try{if(!dbReady){c.release();return res.redirect('/?error='+encodeURIComponent('Cơ sở dữ liệu chưa sẵn sàng.'));}const bank=String(req.body.bank||'');const account=String(req.body.account_number||'').trim();const name=String(req.body.account_name||'').trim();const amount=Math.floor(Number(req.body.amount||0));if(!banks[bank]||!account||!name||amount<withdrawMin){c.release();return res.redirect('/?error='+encodeURIComponent('Thông tin rút tiền không hợp lệ.'));}await c.query('BEGIN');const u=(await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[req.session.uid])).rows[0];if(!u||Number(u.balance)<amount){await c.query('ROLLBACK');c.release();return res.redirect('/?error='+encodeURIComponent('Số dư không đủ.'));}const nb=Number(u.balance)-amount;await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,req.session.uid]);await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'withdraw_hold','Giữ tiền chờ rút')`,[req.session.uid,-amount,nb]);await c.query(`INSERT INTO wallet_requests(user_id,request_type,amount,bank_name,account_number,account_name,status) VALUES($1,'withdraw',$2,$3,$4,$5,'pending')`,[req.session.uid,amount,bank,account,name]);await c.query('COMMIT');c.release();res.redirect('/');}catch(e){await c.query('ROLLBACK').catch(()=>{});c.release();console.error(e);res.redirect('/?error='+encodeURIComponent('Không thể tạo yêu cầu rút.'));}});
app.post('/user/buy',requireUser,async(req,res)=>{const c=await pool.connect();try{if(!dbReady){c.release();return res.redirect('/?error='+encodeURIComponent('Cơ sở dữ liệu chưa sẵn sàng.'));}const hours=Number(req.body.hours||0);const price=prices[hours];if(!price){c.release();return res.redirect('/?error='+encodeURIComponent('Gói VIP không hợp lệ.'));}await c.query('BEGIN');const u=(await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[req.session.uid])).rows[0];if(!u||Number(u.balance)<price){await c.query('ROLLBACK');c.release();return res.redirect('/?error='+encodeURIComponent('Số dư không đủ.'));}const nb=Number(u.balance)-price;let key;for(let i=0;i<10;i++){key=keyCode();try{await c.query(`INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,status,user_id,note) VALUES($1,$2,$3,NOW()+($2*INTERVAL '1 hour'),1,'active',$4,'User mua VIP')`,[key,hours,price,req.session.uid]);break;}catch(e){if(e.code!=='23505')throw e;if(i===9)throw e;}}await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,req.session.uid]);await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'purchase',$4)`,[req.session.uid,-price,nb,`Mua Key VIP ${hours}h ${key}`]);await c.query('COMMIT');c.release();res.redirect('/');}catch(e){await c.query('ROLLBACK').catch(()=>{});c.release();console.error(e);res.redirect('/?error='+encodeURIComponent('Không thể mua key.'));}});

// Admin
app.get('/admin',async(req,res)=>{const s=user(req);if(s?.role==='admin'){if(!dbGuard(res))return;return safePage(res,()=>renderAdmin(req));}return res.send(shell('BON SHOP — Admin',`<div class="wrap"><div class="card login"><div class="center"><div class="brand">BON SHOP · ADMIN</div><p class="muted">Đăng nhập quản trị</p></div>${req.query.error?`<div class="notice">${esc(req.query.error)}</div>`:''}<form method="post" action="/admin/login"><input name="email" type="email" placeholder="Admin email" value="${esc(ADMIN_EMAIL)}" required><input name="pass" type="password" placeholder="Mật khẩu" required style="margin-top:9px"><button style="width:100%;margin-top:10px">Đăng nhập</button></form><p class="center small"><a href="/">← User login</a></p></div></div>`,req));});
app.post('/admin/login',async(req,res)=>{try{if(!dbGuard(res))return;const email=String(req.body.email||'').trim().toLowerCase();const pass=String(req.body.pass||'');const q=await dbQuery('SELECT id,username,email,password_hash,role FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1',[email]);const u=q.rows[0];if(!u||u.role!=='admin'||!(await bcrypt.compare(pass,u.password_hash)))return res.redirect('/admin?error='+encodeURIComponent('Sai thông tin admin.'));sessionSet(res,{role:'admin',uid:Number(u.id),email:u.email,username:u.username||'admin'});res.redirect('/admin');}catch(e){console.error(e);res.redirect('/admin?error='+encodeURIComponent('Máy chủ đang bận.'));}});
app.post('/admin/balance',requireAdmin,async(req,res)=>{const c=await pool.connect();try{const uid=Number(req.body.uid||0),amount=Math.floor(Number(req.body.amount||0)),action=String(req.body.action||'');if(uid<=0||amount<=0)throw new Error('invalid');await c.query('BEGIN');const u=(await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[uid])).rows[0];if(!u)throw new Error('notfound');if(action==='deduct'&&Number(u.balance)<amount)throw new Error('insufficient');const nb=action==='deduct'?Number(u.balance)-amount:Number(u.balance)+amount;const signed=action==='deduct'?-amount:amount;await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,uid]);await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_adjust',$4)`,[uid,signed,nb,action==='deduct'?'Admin trừ số dư':'Admin cộng số dư']);await c.query('COMMIT');c.release();res.redirect('/admin');}catch(e){await c.query('ROLLBACK').catch(()=>{});c.release();console.error(e);res.redirect('/admin?error='+encodeURIComponent(e.message==='insufficient'?'Số dư user không đủ.':'Không thể điều chỉnh số dư.'));}});
app.post('/admin/create-key',requireAdmin,async(req,res)=>{try{const hours=Math.max(1,Math.floor(Number(req.body.hours||24))),price=Math.max(0,Math.floor(Number(req.body.price||0))),uid=Math.max(0,Number(req.body.uid||0)),limit=Math.max(1,Math.floor(Number(req.body.device_limit||1))),note=String(req.body.note||'').slice(0,255);let key;for(let i=0;i<20;i++){key=keyCode();try{await dbQuery(`INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,status,user_id,note) VALUES($1,$2,$3,NOW()+($2*INTERVAL '1 hour'),$4,'active',$5,$6)`,[key,hours,price,limit,uid||null,note]);break;}catch(e){if(e.code!=='23505')throw e;}}res.redirect('/admin');}catch(e){console.error(e);res.redirect('/admin?error='+encodeURIComponent('Không thể tạo key.'));}});
app.post('/admin/key',requireAdmin,async(req,res)=>{try{const id=Number(req.body.id||0),action=String(req.body.action||'');if(action==='disable')await dbQuery(`UPDATE vip_keys SET status='disabled',updated_at=NOW() WHERE id=$1`,[id]);else if(action==='enable')await dbQuery(`UPDATE vip_keys SET status='active',updated_at=NOW() WHERE id=$1 AND expires_at>NOW()`,[id]);else if(action==='reset')await dbQuery('DELETE FROM key_devices WHERE key_id=$1',[id]);else if(action==='delete')await dbQuery('DELETE FROM vip_keys WHERE id=$1',[id]);res.redirect('/admin');}catch(e){console.error(e);res.redirect('/admin');}});
app.post('/admin/wallet',requireAdmin,async(req,res)=>{const c=await pool.connect();try{const id=Number(req.body.id||0),action=String(req.body.action||'');await c.query('BEGIN');const r=(await c.query('SELECT * FROM wallet_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r||r.status!=='pending')throw new Error('notfound');if(action==='approve'){await c.query(`UPDATE wallet_requests SET status='approved',processed_at=NOW() WHERE id=$1`,[id]);if(r.request_type==='deposit'){const u=(await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[r.user_id])).rows[0];const nb=Number(u.balance)+Number(r.amount);await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,r.user_id]);await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_topup',$4)`,[r.user_id,r.amount,nb,'Duyệt nạp tiền']);}}else if(action==='reject'){await c.query(`UPDATE wallet_requests SET status='rejected',processed_at=NOW() WHERE id=$1`,[id]);if(r.request_type==='withdraw'){const u=(await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[r.user_id])).rows[0];const nb=Number(u.balance)+Number(r.amount);await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,r.user_id]);await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'refund',$4)`,[r.user_id,r.amount,nb,'Hoàn tiền rút bị từ chối']);}}else throw new Error('invalid');await c.query('COMMIT');c.release();res.redirect('/admin');}catch(e){await c.query('ROLLBACK').catch(()=>{});c.release();console.error(e);res.redirect('/admin?error='+encodeURIComponent('Không thể xử lý yêu cầu.'));}});
app.post('/admin/add-job',requireAdmin,async(req,res)=>{try{const p=String(req.body.platform||'');if(p==='fb'){const link=String(req.body.link||'').trim(),oid=String(req.body.object_id||'').trim();if(!link||!oid)throw new Error('Thiếu link/object_id');await dbQuery(`INSERT INTO fb_jobs(link,object_id,type,reaction,price,max_uses) VALUES($1,$2,$3,$4,$5,$6)`,[link,oid,String(req.body.type||'like'),String(req.body.reaction||'like'),Math.max(0,Number(req.body.price||35)),Math.max(1,Number(req.body.max_uses||9999))]);}else if(p==='tt'){await dbQuery(`INSERT INTO tiktok_jobs(video_url,ads_id,account_id,price,max_uses) VALUES($1,$2,$3,$4,$5)`,[String(req.body.video_url||''),String(req.body.ads_id||''),String(req.body.account_id||''),Math.max(0,Number(req.body.price||20)),Math.max(1,Number(req.body.max_uses||9999))]);}res.redirect('/admin');}catch(e){console.error(e);res.redirect('/admin?error='+encodeURIComponent('Không thể thêm job.'));}});
app.post('/admin/job',requireAdmin,async(req,res)=>{try{const p=String(req.body.platform||''),id=Number(req.body.id||0),action=String(req.body.action||'');const table=p==='tt'?'tiktok_jobs':'fb_jobs';if(action==='disable')await dbQuery(`UPDATE ${table} SET status='disabled' WHERE id=$1`,[id]);else if(action==='enable')await dbQuery(`UPDATE ${table} SET status='active' WHERE id=$1`,[id]);else if(action==='delete')await dbQuery(`DELETE FROM ${table} WHERE id=$1`,[id]);res.redirect('/admin');}catch(e){console.error(e);res.redirect('/admin');}});

// BON_TOOL API compatibility
async function keyEndpoint(req,res){
  if(!dbGuard(res))return;
  const key=String(req.query.APIKey||req.query.api_key||req.query.key||req.body?.APIKey||req.body?.api_key||req.body?.key||'').trim();
  const deviceId=String(req.query.device_id||req.query.deviceId||req.query.device_id_local||req.body?.device_id||req.body?.device_id_local||'').trim();
  try{const v=await validateVip(key);if(!v.ok)return json(res,{status:v.status,msg:v.message,key,api_key:key});const b=await bindDevice(v.vip,deviceId);if(!b.ok)return json(res,{status:'device_limit',msg:'Key VIP đã đạt giới hạn thiết bị',key,api_key:key,device_limit:b.limit});return res.json(vipResponse(v,b));}catch(e){console.error('[key]',e);return json(res,{status:'server_error',msg:'Lỗi kết nối máy chủ'},500);}
}
app.all('/checkkey/api/key.php',keyEndpoint);
app.all('/checkkey/api/check_date_key.php',async(req,res)=>{if(!dbGuard(res))return;const key=String(req.query.APIKey||req.query.api_key||req.query.key||req.body?.APIKey||'').trim();const deviceId=String(req.query.device_id_local||req.query.device_id||req.body?.device_id_local||'').trim();try{const v=await validateVip(key);if(!v.ok)return json(res,{status:v.status,msg:v.message,key,api_key:key});const b=await bindDevice(v.vip,deviceId);if(!b.ok)return json(res,{status:'device_limit',msg:'Key VIP đã đạt giới hạn thiết bị',key,api_key:key,device_limit:b.limit,device_count:b.count});return res.json(vipResponse(v,b));}catch(e){console.error('[check-date]',e);return json(res,{status:'server_error',msg:'Lỗi kết nối máy chủ'},500);}});

app.post('/checkkey/',async(req,res)=>{
  if(!dbGuard(res))return;
  try{
    const inb=req.body||{};const provided=String(inb.keyadmin||'');
    if(provided!==KEYADMIN_SECRET)return fail(res,'Sai keyadmin',403);
    if(String(inb.action||'')!=='addHistory')return fail(res,'Action không hợp lệ',400);
    const deviceId=String(inb.device_id||'').trim();const amount=Math.floor(Number(inb.money||0));const name=String(inb.name_tool||'').trim().slice(0,50);
    if(!deviceId||amount<=0)return fail(res,'Thiếu device_id hoặc money');if(amount>100000)return fail(res,'Số tiền cộng quá lớn');
    const h=sha(deviceId);const kr=await dbQuery(`SELECT k.id,k.user_id,k.expires_at,k.status,k.key_value FROM key_devices d JOIN vip_keys k ON k.id=d.key_id WHERE d.device_hash=$1 ORDER BY d.last_seen DESC LIMIT 1`,[h]);const k=kr.rows[0];
    if(!k||!k.user_id)return fail(res,'Key VIP chưa được gán cho tài khoản user');if(k.status!=='active'||!k.expires_at||new Date(k.expires_at).getTime()<=Date.now())return fail(res,'Key VIP hết hạn hoặc bị khóa');
    const rate=Number((await dbQuery(`SELECT COUNT(*)::int n FROM app_credits WHERE device_hash=$1 AND created_at>=NOW()-INTERVAL '1 hour'`,[h])).rows[0].n);if(rate>=60)return fail(res,'Đã vượt giới hạn cộng xu trong giờ này');
    const c=await pool.connect();try{await c.query('BEGIN');const u=(await c.query('SELECT balance,username,email FROM users WHERE id=$1 FOR UPDATE',[k.user_id])).rows[0];if(!u)throw new Error('user');const nb=Number(u.balance)+amount;await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,k.user_id]);await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'app_credit',$4)`,[k.user_id,amount,nb,'App '+(name||'GOLIKE')]);await c.query(`INSERT INTO app_credits(user_id,device_hash,name_tool,amount) VALUES($1,$2,$3,$4)`,[k.user_id,h,name,amount]);await c.query('COMMIT');return res.json({success:true,message:`Đã cộng ${amount} xu cho ${name||'GOLIKE'}`,data:{username:u.username||u.email,balance:nb,money:amount}});}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error('[addHistory]',e);return fail(res,'Không thể cộng xu',500);}finally{c.release();}
  }catch(e){console.error('[checkkey]',e);return fail(res,'Lỗi kết nối máy chủ',500);}
});

app.all('/api/check-key.php',async(req,res)=>{if(!dbGuard(res))return;try{const secret=String(req.get('X-API-Key')||req.query.api_key||'');if(!API_SECRET||secret!==API_SECRET)return fail(res,'Unauthorized',401);const b=req.body||{};const key=String(b.key||b.key_value||req.query.key||'').trim();const device=String(b.device_hash||req.query.device_hash||'').trim();if(!key||!validHash(device))return fail(res,'key và device_hash SHA-256 64 hex là bắt buộc',400);const v=await validateVip(key);if(!v.ok)return json(res,{success:false,status:v.status,message:v.message,expires_at:v.vip?.expires_at||null},v.status==='invalid'?404:403);const bd=await bindDevice(v.vip,device);if(!bd.ok)return json(res,{success:false,status:'device_limit',message:'Key đã đạt giới hạn thiết bị',device_limit:bd.limit},409);return res.json({success:true,status:'active',message:'Key hợp lệ',key:v.vip.key_value,expires_at:v.vip.expires_at,device_limit:v.vip.device_limit,device_count:bd.count});}catch(e){console.error(e);return fail(res,'Lỗi máy chủ',500);}});

app.all('/checkkey/api/api_golike_fb.php',async(req,res)=>{
  if(!dbGuard(res))return;if(req.method!=='GET')return fail(res,'Phương thức không hợp lệ',405);
  try{
    const action=String(req.query.action||'');const key=String(req.query.APIKey||req.query.api_key||'').trim();const deviceId=String(req.query.device_id_local||req.query.device_id||'').trim();
    if(!['get_jobs','complete_job','report_job'].includes(action))return fail(res,'Action không hợp lệ',400);const v=await validateVip(key);if(!v.ok)return fail(res,v.message);if(!deviceId)return fail(res,'Thiếu device_id_local');const b=await bindDevice(v.vip,deviceId);if(!b.ok)return fail(res,'Key VIP đã đạt giới hạn thiết bị');const h=b.hash;
    if(action==='get_jobs'){
      const q=await dbQuery(`SELECT j.* FROM fb_jobs j LEFT JOIN job_completions c ON c.platform='facebook' AND c.job_id=j.id AND c.device_hash=$1 WHERE j.status='active' AND j.used_count<j.max_uses AND c.id IS NULL ORDER BY RANDOM() LIMIT 1`,[h]);const j=q.rows[0];if(!j)return fail(res,'Tạm hết nhiệm vụ');return res.json({success:true,message:'OK',data:{id:Number(j.id),job_id:Number(j.id),link:j.link,type:j.type,reaction:j.reaction,object_id:j.object_id,price_per_after_cost:Number(j.price),fix_coin:Number(j.price),fix_coin_job:Number(j.price),coin:Number(j.price)}});
    }
    const jobId=Number(req.query.job_id||0);if(jobId<=0)return fail(res,'Thiếu job_id');
    if(action==='complete_job'){
      const j=(await dbQuery('SELECT * FROM fb_jobs WHERE id=$1 LIMIT 1',[jobId])).rows[0];if(!j)return fail(res,'Không tìm thấy công việc');if(j.status!=='active')return fail(res,'Công việc đã bị khóa');
      const c=await pool.connect();try{await c.query('BEGIN');const ins=await c.query(`INSERT INTO job_completions(platform,job_id,device_hash,user_id,amount,status) VALUES('facebook',$1,$2,$3,$4,'done') ON CONFLICT(platform,job_id,device_hash) DO NOTHING`,[jobId,h,v.vip.user_id||null,j.price]);if(ins.rowCount)await c.query('UPDATE fb_jobs SET used_count=used_count+1 WHERE id=$1 AND used_count<max_uses',[jobId]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
      return res.json({success:true,message:'Hoàn thành nhiệm vụ Facebook thành công',data:{job_id:jobId,object_id:String(req.query.object_id||j.object_id),fix_coin:Number(j.price),price_per_after_cost:Number(j.price)}});
    }
    await dbQuery(`INSERT INTO job_reports(platform,job_id,uid,device_hash,description) VALUES('facebook',$1,$2,$3,$4)`,[jobId,String(req.query.uid||''),h,String(req.query.description||'').slice(0,255)]);return res.json({success:true,message:'Đã ghi nhận báo cáo công việc'});
  }catch(e){console.error('[fb api]',e);return fail(res,'Lỗi kết nối máy chủ',500);}
});

app.all('/checkkey/api/api_golike_tiktok.php',async(req,res)=>{
  if(!dbGuard(res))return;if(req.method!=='GET')return fail(res,'Phương thức không hợp lệ',405);
  try{const action=String(req.query.action||'');if(action!=='complete_job')return fail(res,'Action không hợp lệ',400);const key=String(req.query.APIKey||req.query.api_key||'').trim();const deviceId=String(req.query.device_id_local||req.query.device_id||'').trim();const ads=String(req.query.ads_id||'').trim();const account=String(req.query.account_id||'').trim();const v=await validateVip(key);if(!v.ok)return fail(res,v.message);if(!ads)return fail(res,'Thiếu ads_id');if(!deviceId)return fail(res,'Thiếu device_id_local');const b=await bindDevice(v.vip,deviceId);if(!b.ok)return fail(res,'Key VIP đã đạt giới hạn thiết bị');const j=(await dbQuery('SELECT * FROM tiktok_jobs WHERE ads_id=$1 ORDER BY id LIMIT 1',[ads])).rows[0];if(j&&j.status!=='active')return fail(res,'Công việc đã bị khóa');const price=j?Number(j.price):20;if(j){const ins=await dbQuery(`INSERT INTO job_completions(platform,job_id,device_hash,user_id,amount,status) VALUES('tiktok',$1,$2,$3,$4,'done') ON CONFLICT(platform,job_id,device_hash) DO NOTHING`,[j.id,b.hash,v.vip.user_id||null,price]);if(ins.rowCount)await dbQuery('UPDATE tiktok_jobs SET used_count=used_count+1 WHERE id=$1 AND used_count<max_uses',[j.id]);}return res.json({success:true,message:'Hoàn thành nhiệm vụ TikTok thành công',data:{ads_id:ads,account_id:account,fix_coin:price,price_per_after_cost:price}});}catch(e){console.error('[tt api]',e);return fail(res,'Lỗi kết nối máy chủ',500);}
});

app.use((err,req,res,next)=>{console.error('[UNHANDLED]',err);if(!res.headersSent)res.status(200).json({success:false,message:'Máy chủ đang bận, vui lòng thử lại.'});});

const server=app.listen(PORT,'0.0.0.0',()=>{
  console.log(`[BON] listening on 0.0.0.0:${PORT}`);
  if(!DATABASE_URL)console.error('[BON] DATABASE_URL is missing');
  if(!SESSION_SECRET)console.error('[BON] SESSION_SECRET is missing - set it in Render');
  if(!ADMIN_PASSWORD)console.error('[BON] ADMIN_PASSWORD is missing - set it in Render');
  connectDatabase().catch(e=>console.error('[BON] connect loop',e.message));
});
server.keepAliveTimeout=120000;
server.headersTimeout=125000;
process.on('SIGTERM',async()=>{console.log('[BON] SIGTERM');server.close(()=>pool.end().finally(()=>process.exit(0)));});
process.on('SIGINT',async()=>{server.close(()=>pool.end().finally(()=>process.exit(0)));});
