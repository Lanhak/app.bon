
'use strict';

const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL)
    ? { rejectUnauthorized: false } : false
});

const prices = {24:2000,720:50000,2160:120000};
const withdrawMin = Number(process.env.WITHDRAW_MIN || 10000);
let banks = {};
try { banks = JSON.parse(process.env.BANKS_JSON || '{}'); } catch (_) {}

app.set('trust proxy', 1);
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'development-only-change-me',
  resave:false, saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:7*86400000}
}));

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = (res,data,status=200) => res.status(status).json(data);
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const key = () => 'BON-' + crypto.randomBytes(12).toString('hex').toUpperCase();
const epoch = d => d ? Math.floor(new Date(d).getTime()/1000) : 0;
const sqlDate = d => d ? new Date(d).toISOString().slice(0,19).replace('T',' ') : null;

async function q(text, params=[]){ return pool.query(text,params); }
async function tx(fn){
  const c=await pool.connect();
  try{await c.query('BEGIN'); const r=await fn(c); await c.query('COMMIT'); return r;}
  catch(e){await c.query('ROLLBACK');throw e;} finally{c.release();}
}
async function migrate(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sql=fs.readFileSync(__dirname+'/schema.sql','utf8');
  await q(sql);
}
async function ensureAdmin(){
  const email=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
  const pass=process.env.ADMIN_PASSWORD||'';
  if(!email||!pass) return;
  const r=await q('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1',[email]);
  if(!r.rowCount){
    const hash=await hashPassword(pass);
    await q("INSERT INTO users(username,email,password_hash,role) VALUES($1,$2,$3,'admin')",
      ['admin',email,hash]);
  }
}
function hashPassword(password){
  return new Promise((resolve,reject)=>{
    const salt=crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password,salt,64,(e,key)=>e?reject(e):resolve(`${salt}:${key.toString('hex')}`));
  });
}
function verifyPassword(password,stored){
  return new Promise(resolve=>{
    const [salt,hex]=String(stored).split(':');
    if(!salt||!hex) return resolve(false);
    crypto.scrypt(password,salt,64,(e,key)=>{
      if(e) return resolve(false);
      const a=Buffer.from(hex,'hex'), b=Buffer.from(key);
      resolve(a.length===b.length && crypto.timingSafeEqual(a,b));
    });
  });
}
function user(req){return req.session.user||null;}
function requireLogin(req,res,next){
  if(!user(req)) return res.redirect('/');
  next();
}
function requireAdmin(req,res,next){
  if(!user(req)||user(req).role!=='admin') return res.status(403).send(page('403','Không có quyền truy cập.'));
  next();
}
async function getVip(apiKey){
  const r=await q('SELECT * FROM vip_keys WHERE key_value=$1 LIMIT 1',[apiKey]);
  return r.rows[0]||null;
}
async function validateVip(apiKey,deviceId){
  if(!apiKey) return {ok:false,status:'invalid',message:'Thiếu APIKey'};
  const k=await getVip(apiKey);
  if(!k) return {ok:false,status:'invalid',message:'Key VIP không tồn tại'};
  if(k.status==='disabled') return {ok:false,status:'disabled',message:'Key VIP đã bị khóa'};
  if(!k.expires_at || new Date(k.expires_at)<=new Date()){
    await q("UPDATE vip_keys SET status='expired',updated_at=NOW() WHERE id=$1",[k.id]);
    return {ok:false,status:'expired',message:'Key VIP đã hết hạn',expires_at:k.expires_at};
  }
  if(deviceId){
    const dh=sha(deviceId);
    const known=await q('SELECT id FROM key_devices WHERE key_id=$1 AND device_hash=$2 LIMIT 1',[k.id,dh]);
    const cnt=await q('SELECT COUNT(*)::int n FROM key_devices WHERE key_id=$1',[k.id]);
    if(!known.rowCount && Number(cnt.rows[0].n)>=Number(k.device_limit))
      return {ok:false,status:'device_limit',message:'Key VIP đã đạt giới hạn thiết bị',device_limit:k.device_limit};
    if(known.rowCount) await q('UPDATE key_devices SET last_seen=NOW() WHERE id=$1',[known.rows[0].id]);
    else await q('INSERT INTO key_devices(key_id,device_hash) VALUES($1,$2)',[k.id,dh]);
  }
  return {ok:true,key:k};
}

function page(title,body){
 return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <title>${h(title)} · BON SHOP</title><style>
 *{box-sizing:border-box}body{margin:0;background:#070b16;color:#edf2ff;font:14px Arial;line-height:1.5}
 a{color:#7fb0ff;text-decoration:none}.wrap{max-width:1000px;margin:auto;padding:18px}.nav{display:flex;gap:10px;flex-wrap:wrap;padding:14px 0;border-bottom:1px solid #253552;margin-bottom:20px}
 .card{background:#0d1729;border:1px solid #263a5b;border-radius:18px;padding:20px;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
 input,select,button,textarea{width:100%;padding:11px;border-radius:10px;border:1px solid #34496d;background:#0a1221;color:#fff;margin:5px 0}
 button{background:#3566ff;border:0;font-weight:700;cursor:pointer}.danger{background:#a73545}.muted{color:#8b9ab4}.stat{font-size:25px;font-weight:800}.pill{display:inline-block;padding:4px 9px;border-radius:99px;background:#172b50;color:#9fc0ff}
 table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #263650;text-align:left}h1,h2{margin-top:0}
 </style></head><body><div class="wrap"><div class="nav"><b>✦ BON SHOP</b><a href="/">Trang chủ</a><a href="/statistics">Thống kê</a><a href="/dashboard">Dashboard</a><a href="/admin">Admin</a><a href="/login">Đăng nhập</a><a href="/logout">Đăng xuất</a></div>${body}</div></body></html>`;
}
function userHtml(){
 const u=globalThis.__reqUser; return u ? `<span class="pill">${h(u.username||u.email)}</span><a href="/dashboard">Dashboard</a>${u.role==='admin'?'<a href="/admin">Admin</a>':''}<a href="/logout">Đăng xuất</a>` : `<a href="/login">Đăng nhập</a><a href="/register">Đăng ký</a>`;
}
app.use((req,res,next)=>{globalThis.__reqUser=user(req);next();});

app.get('/health',async(req,res)=>{
 try{await q('SELECT 1');res.json({ok:true,service:'BON SHOP',version:'2.0.0',database:'postgresql',time:new Date().toISOString()});}
 catch(e){res.status(503).json({ok:false,service:'BON SHOP',error:'database_unavailable'});}
});

app.get('/',async(req,res)=>{
 const u=user(req);
 if(u) return res.redirect('/dashboard');
 res.send(page('BON SHOP',`<div class="card"><h1>BON SHOP</h1><p class="muted">Server API tương thích BON TOOL · Render + PostgreSQL</p><div class="grid"><div><h2>API</h2><p>Key VIP · thiết bị · Facebook/TikTok jobs · cộng xu.</p></div><div><h2>Tài khoản</h2><p>Đăng ký · số dư · nạp/rút · lịch sử.</p></div></div><a href="/login"><button>Đăng nhập</button></a></div>`));
});
app.get('/register',(req,res)=>res.send(page('Đăng ký',`<div class="card"><h1>Đăng ký</h1><form method="post"><input name="username" placeholder="Username" required><input name="email" type="email" placeholder="Email" required><input name="password" type="password" placeholder="Mật khẩu" required minlength="6"><button>Đăng ký</button></form></div>`)));
app.post('/register',async(req,res)=>{
 const {username,email,password}=req.body;
 if(!/^[A-Za-z0-9_]{3,30}$/.test(username||'')||!email||!password||password.length<6) return res.status(400).send(page('Lỗi','Thông tin đăng ký không hợp lệ.'));
 try{const ph=await hashPassword(password);await q('INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3)',[username,email.toLowerCase(),ph]);res.redirect('/login');}
 catch(e){res.status(409).send(page('Lỗi','Username hoặc email đã tồn tại.'));}
});
app.get('/login',(req,res)=>res.send(page('Đăng nhập',`<div class="card"><h1>Đăng nhập</h1><form method="post"><input name="login" placeholder="Username hoặc Email" required><input name="password" type="password" placeholder="Mật khẩu" required><button>Đăng nhập</button></form></div>`)));
app.post('/login',async(req,res)=>{
 const {login,password}=req.body; const r=await q('SELECT * FROM users WHERE lower(email)=lower($1) OR lower(username)=lower($1) LIMIT 1',[login||'']);
 if(!r.rowCount||!(await verifyPassword(password||'',r.rows[0].password_hash))) return res.status(401).send(page('Lỗi','Sai tài khoản hoặc mật khẩu.'));
 const x=r.rows[0];req.session.user={id:Number(x.id),username:x.username,email:x.email,role:x.role};res.redirect('/dashboard');
});
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));

app.get('/dashboard',requireLogin,async(req,res)=>{
 const r=await q('SELECT id,username,email,balance,created_at FROM users WHERE id=$1',[user(req).id]);const u=r.rows[0];
 const txs=await q('SELECT amount,type,description,created_at FROM balance_transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 20',[u.id]);
 res.send(page('Dashboard',`<div class="grid"><div class="card"><span class="muted">Số dư</span><div class="stat">${Number(u.balance).toLocaleString('vi-VN')} xu</div></div><div class="card"><span class="muted">Tài khoản</span><div>${h(u.username||u.email)}</div></div></div>
 <div class="card"><h2>🔑 Mua Key VIP</h2><p class="muted">24h: 2.000đ · 30 ngày: 50.000đ · 90 ngày: 120.000đ</p><form method="post" action="/buy-key"><select name="hours"><option value="24">24 giờ — 2.000đ</option><option value="720">30 ngày — 50.000đ</option><option value="2160">90 ngày — 120.000đ</option></select><button>Mua Key</button></form></div>
 <div class="card"><h2>Nạp tiền</h2><form method="post" action="/wallet/deposit"><select name="bank">${Object.entries(banks).map(([n])=>`<option>${h(n)}</option>`).join('')}</select><input name="amount" type="number" min="1000" placeholder="Số tiền"><input name="note" placeholder="Ghi chú"><button>Gửi yêu cầu nạp</button></form></div>
 <div class="card"><h2>Rút tiền</h2><form method="post" action="/wallet/withdraw"><select name="bank">${Object.entries(banks).map(([n])=>`<option>${h(n)}</option>`).join('')}</select><input name="account_number" placeholder="Số tài khoản"><input name="account_name" placeholder="Tên tài khoản"><input name="amount" type="number" min="${withdrawMin}" placeholder="Số tiền"><button>Gửi yêu cầu rút</button></form><p class="muted">Tối thiểu ${withdrawMin.toLocaleString('vi-VN')} đ</p></div>
 <div class="card"><h2>Lịch sử</h2><table><tr><th>Loại</th><th>Số xu</th><th>Mô tả</th><th>Thời gian</th></tr>${txs.rows.map(x=>`<tr><td>${h(x.type)}</td><td>${Number(x.amount).toLocaleString('vi-VN')}</td><td>${h(x.description)}</td><td>${h(x.created_at)}</td></tr>`).join('')}</table></div>`));
});
app.post('/buy-key',requireLogin,async(req,res)=>{
 const hours=Number(req.body.hours||24), price=prices[hours];
 if(!price)return res.status(400).send(page('Lỗi','Gói Key không hợp lệ.'));
 try{
  const result=await tx(async c=>{
   const u=await c.query('SELECT balance,username,email FROM users WHERE id=$1 FOR UPDATE',[user(req).id]);
   if(!u.rowCount||Number(u.rows[0].balance)<price)throw Error('Số dư không đủ.');
   let k; for(let i=0;i<5;i++){k=key();const x=await c.query('SELECT 1 FROM vip_keys WHERE key_value=$1',[k]);if(!x.rowCount)break;}
   const exp=new Date(Date.now()+hours*3600000);
   const b=Number(u.rows[0].balance)-price;
   await c.query('UPDATE users SET balance=$1 WHERE id=$2',[b,user(req).id]);
   await c.query('INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,user_id,note) VALUES($1,$2,$3,$4,1,$5,$6)',[k,hours,price,exp,user(req).id,'Mua từ website']);
   await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'purchase','Mua Key VIP')",[user(req).id,-price,b]);
   return {k,exp};
  });
  res.send(page('Key VIP',`<div class="card"><h1>Mua Key thành công</h1><div class="stat" style="word-break:break-all">${h(result.k)}</div><p>Hết hạn: ${h(result.exp.toISOString())}</p><a href="/dashboard">Quay lại Dashboard</a></div>`));
 }catch(e){res.status(400).send(page('Lỗi',h(e.message)));}
});
app.post('/wallet/deposit',requireLogin,async(req,res)=>{
 const amount=Number(req.body.amount||0),bank=req.body.bank||'',note=String(req.body.note||'').slice(0,255);
 if(!banks[bank]||amount<1000)return res.status(400).send(page('Lỗi','Ngân hàng hoặc số tiền không hợp lệ.'));
 await q("INSERT INTO wallet_requests(user_id,request_type,amount,bank_name,note) VALUES($1,'deposit',$2,$3,$4)",[user(req).id,amount,bank,note]);res.redirect('/dashboard');
});
app.post('/wallet/withdraw',requireLogin,async(req,res)=>{
 const amount=Number(req.body.amount||0),bank=req.body.bank||'',acc=String(req.body.account_number||''),name=String(req.body.account_name||'');
 if(!banks[bank]||!acc||!name||amount<withdrawMin)return res.status(400).send(page('Lỗi','Thông tin rút tiền không hợp lệ.'));
 try{await tx(async c=>{const r=await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[user(req).id]);if(!r.rowCount||Number(r.rows[0].balance)<amount)throw Error('Số dư không đủ');const b=Number(r.rows[0].balance)-amount;await c.query('UPDATE users SET balance=$1 WHERE id=$2',[b,user(req).id]);await c.query("INSERT INTO wallet_requests(user_id,request_type,amount,bank_name,account_number,account_name) VALUES($1,'withdraw',$2,$3,$4,$5)",[user(req).id,amount,bank,acc,name]);await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_adjust','Yêu cầu rút tiền')",[user(req).id,-amount,b]);});res.redirect('/dashboard');}
 catch(e){res.status(400).send(page('Lỗi',h(e.message)));}
});

app.get('/admin',requireAdmin,async(req,res)=>{
 const [u,k,fb,tt,w]=await Promise.all([
  q('SELECT id,username,email,balance,created_at FROM users ORDER BY id DESC LIMIT 50'),
  q('SELECT id,key_value,duration_hours,price,expires_at,device_limit,status,user_id FROM vip_keys ORDER BY id DESC LIMIT 50'),
  q('SELECT * FROM fb_jobs ORDER BY id DESC LIMIT 30'),q('SELECT * FROM tiktok_jobs ORDER BY id DESC LIMIT 30'),
  q("SELECT w.*,u.username FROM wallet_requests w JOIN users u ON u.id=w.user_id ORDER BY w.id DESC LIMIT 50")
 ]);
 res.send(page('Admin',`<div class="card"><h1>Admin</h1><div class="card"><h2>💰 Điều chỉnh số dư</h2><form method="post" action="/admin/balance"><input name="user_id" type="number" placeholder="User ID"><input name="amount" type="number" placeholder="Số xu (+/-)"><input name="description" placeholder="Lý do"><button>Cập nhật</button></form></div>
 <div class="grid"><div><h2>Tạo Key</h2><form method="post" action="/admin/key"><select name="hours"><option value="24">24h</option><option value="720">30d</option><option value="2160">90d</option></select><input name="price" type="number" placeholder="Giá"><input name="device_limit" type="number" value="1"><input name="user_id" type="number" placeholder="User ID (tuỳ chọn)"><button>Tạo Key</button></form></div><div><h2>Thêm FB job</h2><form method="post" action="/admin/fb"><input name="link" placeholder="Link"><input name="object_id" placeholder="Object ID"><input name="type" value="like"><input name="reaction" value="like"><input name="price" value="35"><button>Thêm</button></form></div><div><h2>Thêm TikTok job</h2><form method="post" action="/admin/tiktok"><input name="video_url" placeholder="Video URL"><input name="ads_id" placeholder="ads_id"><input name="account_id" placeholder="account_id"><input name="price" value="20"><button>Thêm</button></form></div></div></div>
 <div class="card"><h2>Users</h2><table><tr><th>ID</th><th>User</th><th>Email</th><th>Balance</th></tr>${u.rows.map(x=>`<tr><td>${x.id}</td><td>${h(x.username)}</td><td>${h(x.email)}</td><td>${Number(x.balance).toLocaleString('vi-VN')}</td></tr>`).join('')}</table></div>
 <div class="card"><h2>Keys</h2><table><tr><th>ID</th><th>Key</th><th>Hạn</th><th>Devices</th><th>Status</th></tr>${k.rows.map(x=>`<tr><td>${x.id}</td><td>${h(x.key_value)}</td><td>${h(x.expires_at)}</td><td>${x.device_limit}</td><td>${h(x.status)}</td></tr>`).join('')}</table></div>
 <div class="card"><h2>Wallet requests</h2><table><tr><th>ID</th><th>User</th><th>Type</th><th>Amount</th><th>Status</th><th></th></tr>${w.rows.map(x=>`<tr><td>${x.id}</td><td>${h(x.username)}</td><td>${h(x.request_type)}</td><td>${Number(x.amount).toLocaleString('vi-VN')}</td><td>${h(x.status)}</td><td>${x.status==='pending'?`<form method="post" action="/admin/wallet/${x.id}"><button name="action" value="approve">Duyệt</button><button class="danger" name="action" value="reject">Từ chối</button></form>`:''}</td></tr>`).join('')}</table></div>`));
});
app.post('/admin/balance',requireAdmin,async(req,res)=>{
 const uid=Number(req.body.user_id||0), amount=Number(req.body.amount||0), desc=String(req.body.description||'Admin adjust').slice(0,255);
 if(!uid||!amount)return res.status(400).send(page('Lỗi','User ID và amount là bắt buộc.'));
 try{await tx(async c=>{const r=await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[uid]);if(!r.rowCount)throw Error('Không tìm thấy user.');const b=Number(r.rows[0].balance)+amount;if(b<0)throw Error('Số dư không thể âm.');await c.query('UPDATE users SET balance=$1 WHERE id=$2',[b,uid]);await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_adjust',$4)",[uid,amount,b,desc]);});res.redirect('/admin');}catch(e){res.status(400).send(page('Lỗi',h(e.message)));}
});
app.post('/admin/key',requireAdmin,async(req,res)=>{
 const hours=Number(req.body.hours||24),price=Number(req.body.price||prices[hours]||0),limit=Math.max(1,Number(req.body.device_limit||1)),uid=req.body.user_id?Number(req.body.user_id):null;
 const k=key(); const expires=new Date(Date.now()+hours*3600000);
 await q('INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,user_id) VALUES($1,$2,$3,$4,$5,$6)',[k,hours,price,expires,limit,uid]);res.send(page('Key created',`<div class="card"><h1>Key đã tạo</h1><div class="stat">${h(k)}</div><p>${expires.toISOString()}</p><a href="/admin">Quay lại</a></div>`));
});
app.post('/admin/fb',requireAdmin,async(req,res)=>{await q('INSERT INTO fb_jobs(link,object_id,type,reaction,price) VALUES($1,$2,$3,$4,$5)',[req.body.link,req.body.object_id,req.body.type||'like',req.body.reaction||'like',Number(req.body.price||35)]);res.redirect('/admin');});
app.post('/admin/tiktok',requireAdmin,async(req,res)=>{await q('INSERT INTO tiktok_jobs(video_url,ads_id,account_id,price) VALUES($1,$2,$3,$4)',[req.body.video_url,req.body.ads_id,req.body.account_id,Number(req.body.price||20)]);res.redirect('/admin');});
app.post('/admin/wallet/:id',requireAdmin,async(req,res)=>{
 const id=Number(req.params.id),action=req.body.action;
 await tx(async c=>{
  const r=await c.query('SELECT * FROM wallet_requests WHERE id=$1 FOR UPDATE',[id]);if(!r.rowCount)throw Error('Không tìm thấy yêu cầu');
  const w=r.rows[0];if(w.status!=='pending')return;
  if(action==='approve'){
   if(w.request_type==='deposit'){
    const u=await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[w.user_id]);const b=Number(u.rows[0].balance)+Number(w.amount);
    await c.query('UPDATE users SET balance=$1 WHERE id=$2',[b,w.user_id]);await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_topup','Duyệt nạp tiền')",[w.user_id,w.amount,b]);
   }
   await c.query("UPDATE wallet_requests SET status='approved',processed_at=NOW() WHERE id=$1",[id]);
  } else if(action==='reject'){
   if(w.request_type==='withdraw'){
    const u=await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[w.user_id]);const b=Number(u.rows[0].balance)+Number(w.amount);
    await c.query('UPDATE users SET balance=$1 WHERE id=$2',[b,w.user_id]);await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_adjust','Hoàn tiền yêu cầu rút bị từ chối')",[w.user_id,w.amount,b]);
   }
   await c.query("UPDATE wallet_requests SET status='rejected',processed_at=NOW() WHERE id=$1",[id]);
  }
 });res.redirect('/admin');
});

// Legacy key API
app.get('/checkkey/api/key.php',async(req,res)=>{
 try{
  const k=String(req.query.APIKey||req.query.api_key||req.query.key||'').trim(),device=String(req.query.device_id||req.query.deviceId||'').trim();
  const v=await validateVip(k,device);
  if(!v.ok)return json(res,{status:v.status,msg:v.message,key:k,api_key:k,expires_at:v.expires_at||undefined},200);
  const x=v.key; const dc=await q('SELECT COUNT(*)::int n FROM key_devices WHERE key_id=$1',[x.id]);
  return json(res,{status:'success',msg:'Key VIP hợp lệ',key:x.key_value,api_key:x.key_value,end_date:sqlDate(x.expires_at),device_ID:'',create_date:sqlDate(x.created_at),device_count:Number(dc.rows[0].n),device_limit:x.device_limit});
 }catch(e){return json(res,{status:'server_error',msg:'Không tải được dữ liệu key'},500);}
});
app.get('/checkkey/api/check_date_key.php',async(req,res)=>{
 try{
  const k=String(req.query.APIKey||req.query.api_key||req.query.key||'').trim(),device=String(req.query.device_id_local||req.query.device_id||'').trim();
  const v=await validateVip(k,device);
  if(!v.ok)return json(res,{status:v.status,msg:v.message,key:k,api_key:k,end_date:v.expires_at||null},200);
  const x=v.key; const dc=await q('SELECT COUNT(*)::int n FROM key_devices WHERE key_id=$1',[x.id]);
  return json(res,{status:'success',msg:'Key VIP còn hạn',key:x.key_value,api_key:x.key_value,end_date:sqlDate(x.expires_at),device_ID:device?sha(device):'',device_count:Number(dc.rows[0].n),device_limit:x.device_limit});
 }catch(e){return json(res,{status:'server_error',msg:'Không tải được dữ liệu key'},500);}
});
app.get('/checkkey/api/announcement.json',(req,res)=>res.json({success:true,announcement:'BON SHOP API đang hoạt động',version:'2.0.0'}));

// Shared GoLike Facebook
app.get('/checkkey/api/api_golike_fb.php',async(req,res)=>{
 try{
  const action=String(req.query.action||''),apiKey=String(req.query.APIKey||''),device=String(req.query.device_id_local||''),dh=device?sha(device):'';
  const v=await validateVip(apiKey);if(!v.ok)return json(res,{success:false,message:v.message});
  if(!['get_jobs','complete_job','report_job'].includes(action))return json(res,{success:false,message:'Action không hợp lệ'},400);
  if(action==='get_jobs'){
   const r=dh?await q(`SELECT j.* FROM fb_jobs j LEFT JOIN job_completions c ON c.platform='facebook' AND c.job_id=j.id AND c.device_hash=$1 WHERE j.status='active' AND j.used_count<j.max_uses AND c.id IS NULL ORDER BY RANDOM() LIMIT 1`,[dh]):await q("SELECT * FROM fb_jobs WHERE status='active' AND used_count<max_uses ORDER BY RANDOM() LIMIT 1");
   if(!r.rowCount)return json(res,{success:false,message:'Tạm hết nhiệm vụ'});
   const j=r.rows[0];return json(res,{success:true,message:'OK',data:{id:Number(j.id),job_id:Number(j.id),link:j.link,type:j.type,reaction:j.reaction,object_id:j.object_id,price_per_after_cost:j.price,fix_coin:j.price,coin:j.price}});
  }
  const jobId=Number(req.query.job_id||0);if(!jobId)return json(res,{success:false,message:'Thiếu job_id'});
  if(!dh)return json(res,{success:false,message:'Thiếu device_id_local'});
  if(action==='complete_job'){
   const r=await q('SELECT * FROM fb_jobs WHERE id=$1',[jobId]);if(!r.rowCount)return json(res,{success:false,message:'Không tìm thấy công việc'});
   const j=r.rows[0];if(j.status!=='active')return json(res,{success:false,message:'Công việc đã bị khóa'});
   const ins=await q(`INSERT INTO job_completions(platform,job_id,device_hash,user_id,amount) VALUES('facebook',$1,$2,$3,$4) ON CONFLICT DO NOTHING`,[jobId,dh,v.key.user_id,j.price]);
   if(ins.rowCount)await q('UPDATE fb_jobs SET used_count=used_count+1 WHERE id=$1',[jobId]);
   return json(res,{success:true,message:'Hoàn thành nhiệm vụ Facebook thành công',data:{job_id:jobId,object_id:String(req.query.object_id||j.object_id),fix_coin:j.price,price_per_after_cost:j.price}});
  }
  await q("INSERT INTO job_reports(platform,job_id,uid,device_hash,description) VALUES('facebook',$1,$2,$3,$4)",[jobId,req.query.uid||'',dh,req.query.description||'']);
  return json(res,{success:true,message:'Đã ghi nhận báo cáo công việc'});
 }catch(e){return json(res,{success:false,message:'Lỗi kết nối máy chủ'},500);}
});
app.get('/checkkey/api/api_golike_tiktok.php',async(req,res)=>{
 try{
  if(String(req.query.action||'')!=='complete_job')return json(res,{success:false,message:'Action không hợp lệ'},400);
  const v=await validateVip(String(req.query.APIKey||''));if(!v.ok)return json(res,{success:false,message:v.message});
  const ads=String(req.query.ads_id||''),acc=String(req.query.account_id||''),device=String(req.query.device_id_local||'');if(!ads)return json(res,{success:false,message:'Thiếu ads_id'});if(!device)return json(res,{success:false,message:'Thiếu device_id_local'});
  const j=await q('SELECT * FROM tiktok_jobs WHERE ads_id=$1 LIMIT 1',[ads]);const row=j.rows[0],price=row?Number(row.price):20;
  if(row&&row.status!=='active')return json(res,{success:false,message:'Công việc đã bị khóa'});
  if(row){const ins=await q(`INSERT INTO job_completions(platform,job_id,device_hash,user_id,amount) VALUES('tiktok',$1,$2,$3,$4) ON CONFLICT DO NOTHING`,[row.id,sha(device),v.key.user_id,price]);if(ins.rowCount)await q('UPDATE tiktok_jobs SET used_count=used_count+1 WHERE id=$1',[row.id]);}
  return json(res,{success:true,message:'Hoàn thành nhiệm vụ TikTok thành công',data:{ads_id:ads,account_id:acc,fix_coin:price}});
 }catch(e){return json(res,{success:false,message:'Lỗi kết nối máy chủ'},500);}
});

// addHistory endpoint
app.post('/checkkey/',async(req,res)=>{
 try{
  const expected=process.env.KEYADMIN||'';const supplied=Buffer.from(String(req.body.keyadmin||'')); const expectedBuf=Buffer.from(expected); if(!expected||supplied.length!==expectedBuf.length||!crypto.timingSafeEqual(supplied,expectedBuf))return json(res,{success:false,message:'Sai keyadmin'},403);
  if(req.body.action!=='addHistory')return json(res,{success:false,message:'Action không hợp lệ'},400);
  const device=String(req.body.device_id||''),money=Number(req.body.money||0),name=String(req.body.name_tool||'');if(!device||money<=0||money>100000)return json(res,{success:false,message:'Thiếu device_id hoặc money'});
  const dh=sha(device);
  const r=await q(`SELECT k.user_id,k.expires_at,k.status FROM key_devices d JOIN vip_keys k ON k.id=d.key_id WHERE d.device_hash=$1 ORDER BY d.last_seen DESC LIMIT 1`,[dh]);
  if(!r.rowCount||!r.rows[0].user_id)return json(res,{success:false,message:'Thiết bị chưa kích hoạt Key VIP'});
  const k=r.rows[0];if(k.status!=='active'||new Date(k.expires_at)<=new Date())return json(res,{success:false,message:'Key VIP hết hạn hoặc bị khóa'});
  const rate=await q("SELECT COUNT(*)::int n FROM app_credits WHERE device_hash=$1 AND created_at>=NOW()-INTERVAL '1 hour'",[dh]);if(Number(rate.rows[0].n)>=60)return json(res,{success:false,message:'Đã vượt giới hạn cộng xu trong giờ này'});
  const result=await tx(async c=>{const u=await c.query('SELECT balance,username,email FROM users WHERE id=$1 FOR UPDATE',[k.user_id]);if(!u.rowCount)throw Error('Không tìm thấy tài khoản');const b=Number(u.rows[0].balance)+money;await c.query('UPDATE users SET balance=$1 WHERE id=$2',[b,k.user_id]);await c.query("INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_topup',$4)",[k.user_id,money,b,'App '+(name||'GOLIKE')]);await c.query('INSERT INTO app_credits(user_id,device_hash,name_tool,amount) VALUES($1,$2,$3,$4)',[k.user_id,dh,name,money]);return {balance:b,username:u.rows[0].username||u.rows[0].email};});
  return json(res,{success:true,message:`Đã cộng ${money} xu cho ${name}`,data:{username:result.username,balance:result.balance,money}});
 }catch(e){return json(res,{success:false,message:'Lỗi kết nối máy chủ'},500);}
});

// api/check-key.php contract
app.all('/api/check-key.php',async(req,res)=>{
 const secret=req.get('X-API-Key')||req.query.api_key||'';if(!process.env.API_SECRET||secret!==process.env.API_SECRET)return json(res,{success:false,message:'Unauthorized'},401);
 const b=req.body||{};const k=String(b.key||b.key_value||req.query.key||'').trim(),device=String(b.device_hash||req.query.device_hash||'').replace(/[^a-fA-F0-9]/g,'');
 if(!k||device.length!==64)return json(res,{success:false,status:'invalid_request',message:'key và device_hash SHA-256 64 hex là bắt buộc'},400);
 const v=await validateVip(k);if(!v.ok)return json(res,{success:false,status:v.status,message:v.message},v.status==='invalid'?404:403);
 const x=v.key;const known=await q('SELECT id FROM key_devices WHERE key_id=$1 AND device_hash=$2',[x.id,device]);const cnt=await q('SELECT COUNT(*)::int n FROM key_devices WHERE key_id=$1',[x.id]);
 if(!known.rowCount&&Number(cnt.rows[0].n)>=Number(x.device_limit))return json(res,{success:false,status:'device_limit',message:'Key đã đạt giới hạn thiết bị',device_limit:x.device_limit},409);
 if(known.rowCount)await q('UPDATE key_devices SET last_seen=NOW() WHERE id=$1',[known.rows[0].id]);else await q('INSERT INTO key_devices(key_id,device_hash) VALUES($1,$2)',[x.id,device]);
 return json(res,{success:true,status:'active',message:'Key hợp lệ',key:x.key_value,expires_at:x.expires_at,device_limit:x.device_limit});
});
app.get('/api/',(req,res)=>res.json({name:'BON SHOP API',version:'2.0.0',endpoint:'POST /api/check-key.php'}));

// Key Free
app.get('/Key_Free/',(req,res)=>{
 const k=String(req.query.key||'');res.send(page('Key Free',`<div class="card" style="max-width:520px;margin:40px auto;text-align:center"><span class="pill">✦ BON SHOP · KEY FREE</span>${k?`<h1>Mã kích hoạt</h1><p class="muted">Sao chép mã và dán vào BON TOOL.</p><div id="k" class="stat" style="word-break:break-all">${h(k)}</div><button onclick="navigator.clipboard.writeText(document.getElementById('k').innerText)">📋 Sao chép</button>`:`<h1>Thiếu mã key</h1><p>Không tìm thấy mã kích hoạt.</p>`}</div>`));
});

// statistics
app.get('/statistics',async(req,res)=>{
 const c=async(sql,p=[])=>{try{const r=await q(sql,p);return Number(r.rows[0]?.n||0)}catch(_){return 0}};
 const users=await c('SELECT COUNT(*) n FROM users'),keys=await c('SELECT COUNT(*) n FROM vip_keys'),active=await c("SELECT COUNT(*) n FROM vip_keys WHERE status='active' AND expires_at>NOW()"),devices=await c('SELECT COUNT(*) n FROM key_devices'),earned=await c('SELECT COALESCE(SUM(amount),0) n FROM balance_transactions WHERE amount>0'),fb=await c("SELECT COUNT(*) n FROM job_completions WHERE platform='facebook'"),tt=await c("SELECT COUNT(*) n FROM job_completions WHERE platform='tiktok'");
 res.send(page('Statistics',`<div class="card"><h1>BON SHOP · Thống kê</h1><div class="grid"><div class="card"><span>Người dùng</span><div class="stat">${users}</div></div><div class="card"><span>Key VIP active</span><div class="stat">${active}/${keys}</div></div><div class="card"><span>Thiết bị</span><div class="stat">${devices}</div></div><div class="card"><span>Xu đã chi</span><div class="stat">${earned}</div></div><div class="card"><span>Facebook jobs</span><div class="stat">${fb}</div></div><div class="card"><span>TikTok jobs</span><div class="stat">${tt}</div></div></div></div>`));
});

app.use((req,res)=>res.status(404).json({success:false,message:'Not found'}));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({success:false,message:'Internal server error'});});

migrate().then(ensureAdmin).then(()=>{
 app.listen(PORT,()=>console.log(`BON running on port ${PORT}`));
}).catch(e=>{console.error('Startup failed:',e);process.exit(1);});
