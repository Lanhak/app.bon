const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
function b64url(v) {
  return Buffer.from(v).toString("base64url");
}
function makeAdminToken() {
  const payload = b64url(JSON.stringify({role:"admin", iat:Date.now()}));
  const secret = process.env.ADMIN_KEY || "change-this-admin-key";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return payload + "." + sig;
}
function verifyAdminToken(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 2) return false;
    const [payload, signature] = parts;
    const secret = process.env.ADMIN_KEY || "change-this-admin-key";
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    if (signature.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.role === "admin" && Date.now() - Number(data.iat) < 86400000;
  } catch (_) {
    return false;
  }
}


const app = express();
app.use(express.json({limit: "256kb"}));
app.use(express.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const DATA = path.join(__dirname, "data");

function read(name, fallback) {
  const file = path.join(DATA, name);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (_) { write(name, fallback); return fallback; }
}
function write(name, value) {
  const file = path.join(DATA, name);
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}
function now() { return new Date().toISOString(); }
function id() { return crypto.randomUUID(); }
function sha256(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }
function json(res, body, code=200) {
  res.status(code).set("Cache-Control","no-store").json(body);
}
function cfg() {
  return read("config.json", {});
}
function adminOk(req) {
  const auth = req.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (verifyAdminToken(token)) return true;

  // Backward-compatible internal access using ADMIN_KEY.
  const supplied = req.get("X-Admin-Key") || req.query.admin_key ||
                   (req.body && req.body.admin_key) || "";
  const expected = process.env.ADMIN_KEY || "change-this-admin-key";
  return supplied === expected;
}
function getKey(key) {
  return read("vip_keys.json", []).find(k => k.key_value === key);
}
function validKey(key) {
  const k = getKey(key);
  if (!k) return {ok:false, code:404, message:"Key VIP không tồn tại"};
  if (k.status === "disabled") return {ok:false, code:403, message:"Key VIP đã bị khóa"};
  if (!k.expires_at || Date.parse(k.expires_at) <= Date.now()) {
    const keys = read("vip_keys.json", []);
    const x = keys.find(v => v.id === k.id);
    if (x) x.status = "expired";
    write("vip_keys.json", keys);
    return {ok:false, code:200, message:"Key VIP đã hết hạn"};
  }
  return {ok:true, key:k};
}
function bindDevice(keyId, deviceId) {
  if (!deviceId) return {ok:true, count:0, bound:""};
  const keys = read("vip_keys.json", []);
  const k = keys.find(x => x.id === keyId);
  if (!k) return {ok:false, message:"Key không tồn tại"};
  const devices = read("key_devices.json", []);
  const hash = sha256(deviceId);
  let known = devices.find(d => d.key_id === keyId && d.device_hash === hash);
  const count = devices.filter(d => d.key_id === keyId).length;
  if (!known && count >= Number(k.device_limit || 1))
    return {ok:false, message:"Key VIP đã đạt giới hạn thiết bị", device_limit:Number(k.device_limit||1)};
  if (known) known.last_seen = now();
  else {
    known = {id:id(), key_id:keyId, device_hash:hash, first_seen:now(), last_seen:now()};
    devices.push(known);
  }
  write("key_devices.json", devices);
  return {ok:true, count:devices.filter(d=>d.key_id===keyId).length, bound:deviceId};
}
function keyResponse(k, deviceId="") {
  const devices = read("key_devices.json", []);
  return {
    success:true, status:"success",
    msg:"Xác thực Server thành công: Key VIP hợp lệ!",
    key:k.key_value, api_key:k.key_value, vip:true,
    duration_hours:Number(k.duration_hours),
    expires_at:k.expires_at, endDate:k.expires_at, end_date:k.expires_at,
    create_date:k.created_at,
    device_ID:deviceId, device_id:deviceId,
    device_count:devices.filter(d=>d.key_id===k.id).length,
    device_limit:Number(k.device_limit||1)
  };
}

/* Health/root */
app.get("/", (req,res)=>json(res,{
  name:"BON SHOP API", version:"1.0.0", status:"online",
  endpoints:[
    "GET /checkkey/api/key.php?APIKey=KEY",
    "GET /checkkey/api/check_date_key.php?APIKey=KEY&device_id_local=DEVICE",
    "POST /checkkey/",
    "GET /checkkey/api/api_golike_fb.php",
    "GET /checkkey/api/api_golike_tiktok.php",
    "GET /checkkey/api/announcement.json",
    "GET /statistics"
  ]
}));

/* Announcement */
app.get("/checkkey/api/announcement.json",(req,res)=>{
  json(res, read("announcement.json",{}));
});

/* Main VIP check: exact response contract used by BON TOOL */
app.get("/checkkey/api/key.php",(req,res)=>{
  const key = String(req.query.APIKey || req.query.api_key || req.query.key || "").trim();
  const deviceId = String(req.query.device_id || req.query.deviceId || "").trim();
  if (!key) return json(res,{status:"invalid",msg:"Thiếu APIKey"},400);
  const v = validKey(key);
  if (!v.ok) return json(res,{status:v.message.includes("khóa")?"disabled":v.message.includes("hết")?"expired":"invalid",msg:v.message,key,api_key:key},v.code);
  const b = bindDevice(v.key.id,deviceId);
  if (!b.ok) return json(res,{status:"device_limit",msg:b.message,key,api_key:key,device_limit:b.device_limit});
  json(res,keyResponse(v.key,deviceId));
});

/* Periodic VIP check */
app.get("/checkkey/api/check_date_key.php",(req,res)=>{
  const key = String(req.query.APIKey || req.query.api_key || req.query.key || "").trim();
  const deviceId = String(req.query.device_id_local || req.query.device_id || req.query.deviceId || "").trim();
  if (!key) return json(res,{status:"invalid",msg:"Thiếu APIKey"},400);
  const v = validKey(key);
  if (!v.ok) return json(res,{status:v.message.includes("khóa")?"disabled":v.message.includes("hết")?"expired":"invalid",msg:v.message,key,api_key:key});
  const b = bindDevice(v.key.id,deviceId);
  if (!b.ok) return json(res,{status:"device_limit",msg:b.message,key,api_key:key,device_limit:b.device_limit});
  json(res,keyResponse(v.key,deviceId));
});

/* App addHistory: POST JSON */
app.post("/checkkey/",(req,res)=>{
  const body=req.body||{};
  if (body.keyadmin !== (process.env.ADMIN_KEY || "change-this-admin-key"))
    return json(res,{success:false,message:"Sai keyadmin"},403);
  if (body.action !== "addHistory")
    return json(res,{success:false,message:"Action không hợp lệ"},400);
  const deviceId=String(body.device_id||"").trim();
  const money=Number(body.money||0);
  const nameTool=String(body.name_tool||"").trim();
  if (!deviceId || money<=0) return json(res,{success:false,message:"Thiếu device_id hoặc money"});
  if (money>100000) return json(res,{success:false,message:"Số tiền cộng quá lớn"});
  const hash=sha256(deviceId);
  const credits=read("app_credits",[]);
  const hourAgo=Date.now()-3600000;
  const rate=credits.filter(x=>x.device_hash===hash && Date.parse(x.created_at)>=hourAgo).length;
  if(rate>=60) return json(res,{success:false,message:"Đã vượt giới hạn cộng xu trong giờ này"});
  const devices=read("key_devices",[]);
  const keys=read("vip_keys",[]);
  const d=devices.filter(x=>x.device_hash===hash).sort((a,b)=>Date.parse(b.last_seen)-Date.parse(a.last_seen))[0];
  const k=d ? keys.find(x=>x.id===d.key_id) : null;
  if(!k || !k.user_id) return json(res,{success:false,message:"Thiết bị chưa kích hoạt Key VIP"});
  const vv=validKey(k.key_value);
  if(!vv.ok) return json(res,{success:false,message:"Key VIP hết hạn hoặc bị khóa"});
  const users=read("users",[]);
  const u=users.find(x=>x.id===k.user_id);
  if(!u) return json(res,{success:false,message:"Không tìm thấy tài khoản"});
  u.balance=Number(u.balance||0)+money;
  const t=read("balance_transactions",[]);
  t.push({id:id(),user_id:u.id,amount:money,balance_after:u.balance,type:"admin_topup",description:"App "+(nameTool||"GOLIKE"),created_at:now()});
  credits.push({id:id(),user_id:u.id,device_hash:hash,name_tool:nameTool,amount:money,created_at:now()});
  write("users",users); write("balance_transactions",t); write("app_credits",credits);
  json(res,{success:true,message:`Đã cộng ${money} xu cho ${nameTool}`,data:{username:u.username||u.email,balance:u.balance,money}});
});

/* Facebook GoLike API */
app.get("/checkkey/api/api_golike_fb.php",(req,res)=>{
  const action=String(req.query.action||"");
  const apiKey=String(req.query.APIKey||"").trim();
  const deviceId=String(req.query.device_id_local||"").trim();
  const v=validKey(apiKey);
  if(!v.ok) return json(res,{success:false,message:v.message});
  if(!["get_jobs","complete_job","report_job"].includes(action))
    return json(res,{success:false,message:"Action không hợp lệ"},400);
  const hash=deviceId?sha256(deviceId):"";
  const jobs=read("fb_jobs",[]);
  const completions=read("job_completions",[]);
  if(action==="get_jobs"){
    let available=jobs.filter(j=>j.status==="active" && Number(j.used_count)<Number(j.max_uses||9999) &&
      (!hash || !completions.some(c=>c.platform==="facebook"&&c.job_id===j.id&&c.device_hash===hash)));
    if(!available.length) return json(res,{success:false,message:"Tạm hết nhiệm vụ"});
    const j=available[Math.floor(Math.random()*available.length)];
    return json(res,{success:true,message:"OK",data:{
      id:j.id,job_id:j.id,link:j.link,type:j.type||"like",reaction:j.reaction||"like",
      object_id:j.object_id,price_per_after_cost:Number(j.price||35),
      fix_coin:Number(j.price||35),coin:Number(j.price||35)
    }});
  }
  const jobId=Number(req.query.job_id||0);
  if(action==="complete_job"){
    if(!jobId) return json(res,{success:false,message:"Thiếu job_id"});
    if(!hash) return json(res,{success:false,message:"Thiếu device_id_local"});
    const j=jobs.find(x=>Number(x.id)===jobId);
    if(!j) return json(res,{success:false,message:"Không tìm thấy công việc"});
    if(j.status!=="active") return json(res,{success:false,message:"Công việc đã bị khóa"});
    const exists=completions.some(c=>c.platform==="facebook"&&Number(c.job_id)===jobId&&c.device_hash===hash);
    if(!exists){
      completions.push({id:id(),platform:"facebook",job_id:jobId,device_hash:hash,user_id:v.key.user_id||null,amount:Number(j.price||35),status:"done",created_at:now()});
      j.used_count=Number(j.used_count||0)+1;
      write("job_completions",completions); write("fb_jobs",jobs);
    }
    return json(res,{success:true,message:"Hoàn thành nhiệm vụ Facebook thành công",data:{
      job_id:jobId,object_id:String(req.query.object_id||j.object_id),fix_coin:Number(j.price||35),price_per_after_cost:Number(j.price||35)
    }});
  }
  if(!jobId) return json(res,{success:false,message:"Thiếu job_id"});
  const reports=read("job_reports",[]);
  reports.push({id:id(),platform:"facebook",job_id:jobId,uid:String(req.query.uid||""),device_hash:hash,description:String(req.query.description||""),created_at:now()});
  write("job_reports",reports);
  json(res,{success:true,message:"Đã ghi nhận báo cáo công việc"});
});

/* TikTok GoLike API */
app.get("/checkkey/api/api_golike_tiktok.php",(req,res)=>{
  const action=String(req.query.action||"");
  const apiKey=String(req.query.APIKey||"").trim();
  const deviceId=String(req.query.device_id_local||"").trim();
  if(action!=="complete_job") return json(res,{success:false,message:"Action không hợp lệ"},400);
  const v=validKey(apiKey);
  if(!v.ok) return json(res,{success:false,message:v.message});
  const adsId=String(req.query.ads_id||"").trim();
  const accountId=String(req.query.account_id||"").trim();
  if(!adsId) return json(res,{success:false,message:"Thiếu ads_id"});
  if(!deviceId) return json(res,{success:false,message:"Thiếu device_id_local"});
  const hash=sha256(deviceId);
  const jobs=read("tiktok_jobs",[]);
  const completions=read("job_completions",[]);
  const j=jobs.find(x=>String(x.ads_id)===adsId);
  const price=j?Number(j.price||20):20;
  if(j && j.status!=="active") return json(res,{success:false,message:"Công việc đã bị khóa"});
  if(j){
    const exists=completions.some(c=>c.platform==="tiktok"&&Number(c.job_id)===Number(j.id)&&c.device_hash===hash);
    if(!exists){
      completions.push({id:id(),platform:"tiktok",job_id:j.id,device_hash:hash,user_id:v.key.user_id||null,amount:price,status:"done",created_at:now()});
      j.used_count=Number(j.used_count||0)+1;
      write("job_completions",completions); write("tiktok_jobs",jobs);
    }
  }
  json(res,{success:true,message:"Hoàn thành nhiệm vụ TikTok thành công",data:{ads_id:adsId,account_id:accountId,fix_coin:price}});
});

/* API secret check-key compatibility */
app.post("/api/check-key.php",(req,res)=>{
  const secret=req.get("X-API-Key")||req.query.api_key||"";
  if(secret!==(process.env.API_SECRET||"change-this-api-secret"))
    return json(res,{success:false,message:"Unauthorized"},401);
  const body=req.body||{};
  const key=String(body.key||body.key_value||"").trim();
  const device=String(body.device_hash||"").replace(/[^a-fA-F0-9]/g,"");
  if(!key || device.length!==64) return json(res,{success:false,status:"invalid_request",message:"key và device_hash SHA-256 64 hex là bắt buộc"},400);
  const v=validKey(key);
  if(!v.ok) return json(res,{success:false,status:v.message.includes("khóa")?"disabled":"expired",message:v.message});
  const devices=read("key_devices",[]);
  let d=devices.find(x=>x.key_id===v.key.id&&x.device_hash===device);
  const count=devices.filter(x=>x.key_id===v.key.id).length;
  if(!d&&count>=Number(v.key.device_limit||1)) return json(res,{success:false,status:"device_limit",message:"Key đã đạt giới hạn thiết bị",device_limit:Number(v.key.device_limit||1)},409);
  if(d)d.last_seen=now(); else devices.push({id:id(),key_id:v.key.id,device_hash:device,first_seen:now(),last_seen:now()});
  write("key_devices",devices);
  json(res,{success:true,status:"active",message:"Key hợp lệ",key:v.key.key_value,expires_at:v.key.expires_at,device_limit:Number(v.key.device_limit||1)});
});

/* Key Free display page */
app.get("/Key_Free/",(req,res)=>{
  const key=String(req.query.key||"").trim();
  res.send(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>BON SHOP — Key Free</title><style>body{font:15px Arial;background:#070b16;color:#edf2ff;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px}.card{max-width:420px;width:100%;padding:30px;border:1px solid #2a3e68;border-radius:24px;background:#0d1729;text-align:center}.key{padding:18px;margin:18px 0;border:1px dashed #3b5fa4;border-radius:16px;color:#66e3ff;font:700 20px monospace;word-break:break-all}.btn{padding:13px;width:100%;border:0;border-radius:11px;background:#3566ff;color:#fff;font-weight:700}</style>
  <div class="card"><b>BON SHOP · KEY FREE</b><h2>${key?"Mã kích hoạt của bạn":"Thiếu mã key"}</h2>${key?`<p>Sao chép mã và dán vào app BON_TOOL.</p><div class="key" id="k">${escapeHtml(key)}</div><button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('k').innerText)">📋 Sao chép mã</button>`:"<p>Không tìm thấy mã kích hoạt.</p>"}</div></html>`);
});
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

/* Statistics page */
app.get("/statistics",(req,res)=>{
  const users=read("users",[]), keys=read("vip_keys",[]), devices=read("key_devices",[]);
  const completions=read("job_completions",[]);
  const earned=read("balance_transactions",[]).filter(x=>Number(x.amount)>0).reduce((a,x)=>a+Number(x.amount),0);
  const active=keys.filter(k=>k.status==="active"&&Date.parse(k.expires_at||0)>Date.now()).length;
  res.send(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BON SHOP — Thống kê</title>
  <style>body{font:15px Arial;background:#070b16;color:#edf2ff;padding:18px}.wrap{max-width:760px;margin:auto}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.card{padding:18px;border:1px solid #263a5b;border-radius:16px;background:#0d1729;margin-bottom:12px}.n{font-size:28px;font-weight:700;margin-top:6px}@media(max-width:520px){.grid{grid-template-columns:1fr}}</style>
  <div class="wrap"><div class="card"><b>BON SHOP · THỐNG KÊ</b><h1>BON SHOP</h1><p>Hệ thống dịch vụ số · Node.js + JSON</p></div>
  <div class="grid"><div class="card">Người dùng<div class="n">${users.length}</div></div><div class="card">Key VIP đang hoạt động<div class="n">${active}</div></div>
  <div class="card">Thiết bị kích hoạt<div class="n">${devices.length}</div></div><div class="card">Tổng xu đã chi trả<div class="n">${earned.toLocaleString("vi-VN")}</div></div>
  <div class="card">Facebook jobs<div class="n">${completions.filter(x=>x.platform==="facebook").length}</div></div>
  <div class="card">TikTok jobs<div class="n">${completions.filter(x=>x.platform==="tiktok").length}</div></div></div></div></html>`);
});

/* Admin login */
app.post("/admin/api/login",(req,res)=>{
  const email=String((req.body||{}).email||"").trim().toLowerCase();
  const password=String((req.body||{}).password||"");
  const expectedEmail=String(process.env.ADMIN_EMAIL||"admin@example.com").trim().toLowerCase();
  const expectedPassword=String(process.env.ADMIN_PASSWORD||"change-this-password");
  if(!email || !password || email!==expectedEmail || password!==expectedPassword)
    return json(res,{success:false,message:"Email hoặc mật khẩu không đúng"},401);
  const token=makeAdminToken();
  return json(res,{success:true,message:"Đăng nhập thành công",token,expires_in:86400});
});
app.get("/admin/api/me",(req,res)=>{
  if(!adminOk(req)) return json(res,{success:false,message:"Unauthorized"},401);
  return json(res,{success:true,role:"admin"});
});
app.post("/admin/api/logout",(req,res)=>{
  return json(res,{success:true,message:"Đã đăng xuất"});
});

/* Admin API: key/job/announcement management */
app.use("/admin/api",(req,res,next)=>{ if(!adminOk(req)) return json(res,{success:false,message:"Unauthorized"},401); next(); });

app.get("/admin/api/keys",(req,res)=>json(res,{success:true,data:read("vip_keys",[])}));
app.post("/admin/api/keys",(req,res)=>{
  const body=req.body||{}, hours=Number(body.duration_hours||0);
  if(hours<=0)return json(res,{success:false,message:"duration_hours không hợp lệ"},400);
  const keys=read("vip_keys",[]);
  let key=String(body.key_value||"").trim();
  if(!key) key="VIP-"+crypto.randomBytes(3).toString("hex").toUpperCase()+"-"+crypto.randomBytes(4).toString("hex").toUpperCase();
  if(keys.some(k=>k.key_value===key))return json(res,{success:false,message:"Key đã tồn tại"},409);
  const item={id:id(),key_value:key,duration_hours:hours,price:Number(body.price||0),expires_at:new Date(Date.now()+hours*3600000).toISOString(),device_limit:Number(body.device_limit||1),status:"active",user_id:body.user_id||null,note:String(body.note||""),created_at:now(),updated_at:now()};
  keys.push(item); write("vip_keys",keys); json(res,{success:true,data:item});
});
app.patch("/admin/api/keys/:id",(req,res)=>{
  const keys=read("vip_keys",[]), k=keys.find(x=>x.id===req.params.id);
  if(!k)return json(res,{success:false,message:"Không tìm thấy key"},404);
  if(req.body.status)k.status=req.body.status;
  if(req.body.device_limit)k.device_limit=Number(req.body.device_limit);
  if(req.body.extend_hours)k.expires_at=new Date(Math.max(Date.now(),Date.parse(k.expires_at||0))+Number(req.body.extend_hours)*3600000).toISOString(),k.status="active";
  k.updated_at=now(); write("vip_keys",keys); json(res,{success:true,data:k});
});
app.delete("/admin/api/keys/:id",(req,res)=>{
  const keys=read("vip_keys",[]); const i=keys.findIndex(x=>x.id===req.params.id);
  if(i<0)return json(res,{success:false,message:"Không tìm thấy key"},404);
  keys[i].status="disabled"; keys[i].updated_at=now(); write("vip_keys",keys);
  json(res,{success:true,message:"Đã khóa key"});
});
app.get("/admin/api/jobs/:platform",(req,res)=>{
  const file=req.params.platform==="facebook"?"fb_jobs.json":"tiktok_jobs.json";
  json(res,{success:true,data:read(file,[])});
});
app.post("/admin/api/jobs/:platform",(req,res)=>{
  const file=req.params.platform==="facebook"?"fb_jobs.json":"tiktok_jobs.json";
  const b=req.body||{}, arr=read(file,[]);
  const item={id:Date.now(),...b,price:Number(b.price||20),max_uses:Number(b.max_uses||9999),used_count:0,status:"active",created_at:now()};
  arr.push(item); write(file,arr); json(res,{success:true,data:item});
});
app.patch("/admin/api/jobs/:platform/:id",(req,res)=>{
  const file=req.params.platform==="facebook"?"fb_jobs.json":"tiktok_jobs.json";
  const arr=read(file,[]), x=arr.find(v=>String(v.id)===String(req.params.id));
  if(!x)return json(res,{success:false,message:"Không tìm thấy job"},404);
  Object.assign(x,req.body||{}); write(file,arr); json(res,{success:true,data:x});
});
app.get("/admin/api/announcement",(req,res)=>json(res,{success:true,data:read("announcement.json",{})}));
app.put("/admin/api/announcement",(req,res)=>{
  const a={...read("announcement.json",{}),...(req.body||{}),updated_at:now()}; write("announcement.json",a); json(res,{success:true,data:a});
});
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));

app.use((req,res)=>json(res,{success:false,message:"Endpoint không tồn tại"},404));

app.listen(PORT,()=>console.log(`BON SERVER running on port ${PORT}`));
