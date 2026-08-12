const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const files = {
  users: path.join(DATA_DIR, "users.json"),
  keys: path.join(DATA_DIR, "vip_keys.json"),
  transactions: path.join(DATA_DIR, "transactions.json"),
  stats: path.join(DATA_DIR, "statistics.json"),
  announcements: path.join(DATA_DIR, "announcements.json")
};

function ensureFile(file, initial) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(initial, null, 2));
}
ensureFile(files.users, []);
ensureFile(files.keys, []);
ensureFile(files.transactions, []);
ensureFile(files.stats, { totalUsers: 0, totalKeysSold: 0, totalRevenue: 0 });
ensureFile(files.announcements, { title: "BON SHOP", message: "Chào mừng bạn đến BON SHOP." });

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return fallback; }
}
function write(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function id(prefix="id") {
  return prefix + "_" + crypto.randomBytes(8).toString("hex");
}
function hashPassword(password, salt=crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, salt, expected) {
  try {
    const got = crypto.scryptSync(String(password), salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
  } catch (_) { return false; }
}
function b64(v) { return Buffer.from(v).toString("base64url"); }
function tokenFor(payload) {
  const body = b64(JSON.stringify(payload));
  const secret = process.env.API_SECRET || "change-this-api-secret";
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + sig;
}
function readToken(token) {
  try {
    const [body, sig] = String(token || "").split(".");
    if (!body || !sig) return null;
    const secret = process.env.API_SECRET || "change-this-api-secret";
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p.exp || Date.now() > p.exp) return null;
    return p;
  } catch (_) { return null; }
}
function bearer(req) {
  const h = req.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}
function userFrom(req) {
  const p = readToken(bearer(req));
  if (!p || p.role !== "user") return null;
  const users = read(files.users, []);
  return users.find(u => u.id === p.sub && u.status !== "disabled") || null;
}
function adminOk(req) {
  const h = req.get("Authorization") || "";
  if (h.startsWith("Bearer ")) {
    const p = readToken(h.slice(7));
    if (p && p.role === "admin") return true;
  }
  const supplied = req.get("X-Admin-Key") || req.query.admin_key || ((req.body || {}).admin_key || "");
  return supplied === (process.env.ADMIN_KEY || "change-this-admin-key");
}
function json(res, data, status=200) { return res.status(status).json(data); }
function safeUser(u) {
  return { id:u.id, username:u.username, email:u.email, balance:u.balance, created_at:u.created_at, status:u.status };
}
function normalizeUsername(v) { return String(v || "").trim().toLowerCase(); }
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "")); }
function generateKey() {
  return "VIP-" + Array.from({length:4}, () => crypto.randomBytes(3).toString("hex").toUpperCase()).join("-");
}
function durationLabel(hours) {
  if (hours % 24 === 0) return (hours/24) + " ngày";
  return hours + " giờ";
}

app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname, "public")));
app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

/* Health / public information */
app.get("/", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.get("/api/health", (req,res) => json(res, {name:"BON SHOP API", version:"2.0.0", status:"online"}));
app.get("/statistics", (req,res) => {
  const users=read(files.users,[]), keys=read(files.keys,[]), tx=read(files.transactions,[]);
  return json(res,{success:true,totalUsers:users.length,totalKeysSold:keys.filter(k=>k.sold_to).length,totalTransactions:tx.length});
});
app.get("/checkkey/api/announcement.json",(req,res)=>json(res,read(files.announcements,{title:"BON SHOP",message:"Chào mừng"})));

/* User authentication */
app.post("/api/auth/register",(req,res)=>{
  const username=normalizeUsername(req.body.username);
  const email=String(req.body.email||"").trim().toLowerCase();
  const password=String(req.body.password||"");
  if(!/^[a-z0-9_.-]{3,32}$/.test(username)) return json(res,{success:false,message:"Username 3-32 ký tự, chỉ dùng chữ thường, số, _, -, ."},400);
  if(!validEmail(email)) return json(res,{success:false,message:"Email không hợp lệ"},400);
  if(password.length<6) return json(res,{success:false,message:"Mật khẩu tối thiểu 6 ký tự"},400);
  const users=read(files.users,[]);
  if(users.some(u=>u.username===username)) return json(res,{success:false,message:"Username đã tồn tại"},409);
  if(users.some(u=>u.email===email)) return json(res,{success:false,message:"Email đã tồn tại"},409);
  const pw=hashPassword(password);
  const u={id:id("usr"),username,email,password_hash:pw.hash,password_salt:pw.salt,balance:0,status:"active",created_at:new Date().toISOString()};
  users.push(u); write(files.users,users);
  return json(res,{success:true,message:"Đăng ký thành công",user:safeUser(u)},201);
});

app.post("/api/auth/login",(req,res)=>{
  const login=String(req.body.login||req.body.username||req.body.email||"").trim().toLowerCase();
  const password=String(req.body.password||"");
  const users=read(files.users,[]);
  const u=users.find(x=>x.username===login || x.email===login);
  if(!u || u.status==="disabled" || !verifyPassword(password,u.password_salt,u.password_hash))
    return json(res,{success:false,message:"Tài khoản hoặc mật khẩu không đúng"},401);
  const token=tokenFor({role:"user",sub:u.id,iat:Date.now(),exp:Date.now()+7*86400000});
  return json(res,{success:true,token,user:safeUser(u),expires_in:7*86400});
});

app.get("/api/auth/me",(req,res)=>{
  const u=userFrom(req);
  if(!u) return json(res,{success:false,message:"Unauthorized"},401);
  return json(res,{success:true,user:safeUser(u)});
});

/* Products */
app.get("/api/products",(req,res)=>{
  return json(res,{success:true,products:[
    {id:"vip_1d",name:"VIP 1 ngày",duration_hours:24,price:2000},
    {id:"vip_30d",name:"VIP 30 ngày",duration_hours:720,price:50000},
    {id:"vip_90d",name:"VIP 90 ngày",duration_hours:2160,price:120000}
  ]});
});

/* User wallet — crediting is intentionally admin-only */
app.get("/api/wallet",(req,res)=>{
  const u=userFrom(req); if(!u) return json(res,{success:false,message:"Unauthorized"},401);
  return json(res,{success:true,balance:u.balance});
});

/* Purchase */
app.post("/api/shop/buy",(req,res)=>{
  const u=userFrom(req); if(!u) return json(res,{success:false,message:"Unauthorized"},401);
  const productId=String(req.body.product_id||"");
  const products={vip_1d:{name:"VIP 1 ngày",duration_hours:24,price:2000},vip_30d:{name:"VIP 30 ngày",duration_hours:720,price:50000},vip_90d:{name:"VIP 90 ngày",duration_hours:2160,price:120000}};
  const p=products[productId];
  if(!p) return json(res,{success:false,message:"Sản phẩm không tồn tại"},400);
  const users=read(files.users,[]);
  const idx=users.findIndex(x=>x.id===u.id);
  if(idx<0) return json(res,{success:false,message:"User không tồn tại"},401);
  if(Number(users[idx].balance)<p.price) return json(res,{success:false,message:"Số dư không đủ"},400);
  const keys=read(files.keys,[]);
  const key={id:id("key"),key:generateKey(),duration_hours:p.duration_hours,price:p.price,device_limit:1,status:"active",created_at:new Date().toISOString(),sold_to:u.id,sold_at:new Date().toISOString()};
  users[idx].balance-=p.price; keys.push(key);
  const txs=read(files.transactions,[]);
  txs.push({id:id("tx"),user_id:u.id,type:"purchase",amount:-p.price,product_id:productId,key_id:key.id,status:"success",created_at:new Date().toISOString()});
  write(files.users,users); write(files.keys,keys); write(files.transactions,txs);
  return json(res,{success:true,message:"Mua Key thành công",key:key.key,product:p,balance:users[idx].balance});
});

app.get("/api/user/keys",(req,res)=>{
  const u=userFrom(req); if(!u) return json(res,{success:false,message:"Unauthorized"},401);
  const keys=read(files.keys,[]).filter(k=>k.sold_to===u.id).map(k=>({...k,key:k.key}));
  return json(res,{success:true,keys});
});
app.get("/api/user/transactions",(req,res)=>{
  const u=userFrom(req); if(!u) return json(res,{success:false,message:"Unauthorized"},401);
  return json(res,{success:true,transactions:read(files.transactions,[]).filter(t=>t.user_id===u.id)});
});

/* Legacy check-key API */
app.get("/checkkey/api/key.php",(req,res)=>{
  const key=String(req.query.APIKey||"");
  const k=read(files.keys,[]).find(x=>x.key===key);
  if(!k) return json(res,{success:false,valid:false,message:"Key không tồn tại"},404);
  return json(res,{success:true,valid:k.status==="active",key:k.key,status:k.status,duration_hours:k.duration_hours,device_limit:k.device_limit,sold_to:k.sold_to||null});
});
app.get("/checkkey/api/check_date_key.php",(req,res)=>{
  const key=String(req.query.APIKey||"");
  const k=read(files.keys,[]).find(x=>x.key===key);
  if(!k) return json(res,{success:false,valid:false,message:"Key không tồn tại"},404);
  const activated=k.activated_at?new Date(k.activated_at).getTime():null;
  const expires=activated?activated+k.duration_hours*3600000:null;
  return json(res,{success:true,valid:k.status==="active",APIKey:k.key,status:k.status,activated_at:k.activated_at||null,expires_at:expires?new Date(expires).toISOString():null,device_id_local:req.query.device_id_local||null});
});
app.post("/checkkey/",(req,res)=>json(res,{success:false,message:"Use /api/auth/login or /api/shop/buy"}));
app.get("/checkkey/api/load_history.php",(req,res)=>{
  const u=userFrom(req);
  if(u) return json(res,{success:true,history:read(files.transactions,[]).filter(t=>t.user_id===u.id)});
  return json(res,{success:true,history:read(files.transactions,[]).slice(-50)});
});
app.get("/checkkey/api/api_golike_fb.php",(req,res)=>json(res,{success:true,tasks:[]}));
app.get("/checkkey/api/api_golike_tiktok.php",(req,res)=>json(res,{success:true,tasks:[]}));

/* Admin auth */
app.post("/admin/api/login",(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase();
  const password=String(req.body.password||"");
  const expectedEmail=String(process.env.ADMIN_EMAIL||"admin@example.com").trim().toLowerCase();
  const expectedPassword=String(process.env.ADMIN_PASSWORD||"change-this-password");
  if(email!==expectedEmail || password!==expectedPassword) return json(res,{success:false,message:"Email hoặc mật khẩu không đúng"},401);
  return json(res,{success:true,token:tokenFor({role:"admin",iat:Date.now(),exp:Date.now()+86400000}),expires_in:86400});
});
app.get("/admin/api/me",(req,res)=>adminOk(req)?json(res,{success:true,role:"admin"}):json(res,{success:false,message:"Unauthorized"},401));

app.use("/admin/api",(req,res,next)=>{
  if(req.path==="/login" || req.path==="/me") return next();
  if(!adminOk(req)) return json(res,{success:false,message:"Unauthorized"},401);
  next();
});
app.get("/admin/api/users",(req,res)=>json(res,{success:true,users:read(files.users,[]).map(safeUser)}));
app.post("/admin/api/users/:id/balance",(req,res)=>{
  const amount=Number(req.body.amount);
  if(!Number.isFinite(amount)) return json(res,{success:false,message:"Amount không hợp lệ"},400);
  const users=read(files.users,[]); const i=users.findIndex(u=>u.id===req.params.id);
  if(i<0) return json(res,{success:false,message:"Không tìm thấy user"},404);
  users[i].balance=Math.max(0,Number(users[i].balance||0)+amount); write(files.users,users);
  const txs=read(files.transactions,[]); txs.push({id:id("tx"),user_id:users[i].id,type:amount>=0?"admin_credit":"admin_debit",amount,admin:true,status:"success",created_at:new Date().toISOString()}); write(files.transactions,txs);
  return json(res,{success:true,user:safeUser(users[i])});
});
app.get("/admin/api/keys",(req,res)=>json(res,{success:true,keys:read(files.keys,[])}));
app.post("/admin/api/keys",(req,res)=>{
  const hours=Math.max(1,Number(req.body.duration_hours||24));
  const price=Math.max(0,Number(req.body.price||0));
  const limit=Math.max(1,Number(req.body.device_limit||1));
  const keys=read(files.keys,[]);
  const k={id:id("key"),key:generateKey(),duration_hours:hours,price,device_limit:limit,status:"active",created_at:new Date().toISOString()};
  keys.push(k); write(files.keys,keys); return json(res,{success:true,key:k});
});
app.delete("/admin/api/keys/:id",(req,res)=>{
  const keys=read(files.keys,[]); const i=keys.findIndex(k=>k.id===req.params.id);
  if(i<0)return json(res,{success:false,message:"Không tìm thấy Key"},404);
  keys[i].status="disabled"; write(files.keys,keys); return json(res,{success:true,key:keys[i]});
});
app.get("/admin/api/transactions",(req,res)=>json(res,{success:true,transactions:read(files.transactions,[])}));
app.get("/admin/api/statistics",(req,res)=>{
  const users=read(files.users,[]),keys=read(files.keys,[]),tx=read(files.transactions,[]);
  return json(res,{success:true,totalUsers:users.length,totalKeys:keys.length,soldKeys:keys.filter(k=>k.sold_to).length,revenue:tx.filter(t=>t.type==="purchase").reduce((s,t)=>s+Math.abs(Number(t.amount||0)),0)});
});
app.put("/admin/api/announcement",(req,res)=>{
  const data={title:String(req.body.title||"BON SHOP"),message:String(req.body.message||""),updated_at:new Date().toISOString()};
  write(files.announcements,data); return json(res,{success:true,announcement:data});
});

app.listen(PORT,()=>console.log(`BON SERVER running on port ${PORT}`));
