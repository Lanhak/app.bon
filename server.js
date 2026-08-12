
'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'akklanh84@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const KEYADMIN_SECRET = process.env.KEYADMIN_SECRET || 'huongdev8386';
const API_SECRET = process.env.API_SECRET || crypto.randomBytes(32).toString('hex');
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://bonshop.onrender.com').replace(/\/+$/, '');
const KEY_FREE_URL = PUBLIC_URL || '';
const DB_SSL = String(process.env.PGSSL || 'true').toLowerCase() !== 'false';

const prices = {
  24: 2000,
  720: 50000,
  2160: 120000,
};

const banks = {
  Sacombank: { account: '050088931308', name: 'DIEU LANH' },
  VietinBank: { account: '101886569909', name: 'DIEU LANH' },
};

const withdrawMin = 10000;
let dbReady = false;
let dbLastError = null;

const pool = new Pool({
  connectionString: DATABASE_URL || undefined,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 8000),
  ssl: DB_SSL ? { rejectUnauthorized: false } : undefined,
  keepAlive: true,
});

pool.on('error', (err) => {
  dbLastError = err.message;
  console.error('PostgreSQL pool error:', err.message);
});

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function money(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}
function nowIso() { return new Date().toISOString(); }

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function readSession(req) {
  const raw = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('bon_session='));
  if (!raw) return null;
  const token = decodeURIComponent(raw.slice('bon_session='.length));
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch (_) { return null; }
}
function setSession(res, data) {
  const payload = { ...data, iat: Date.now(), exp: Date.now() + 7 * 24 * 3600 * 1000 };
  res.setHeader('Set-Cookie', `bon_session=${encodeURIComponent(signSession(payload))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7*24*3600}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', 'bon_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
}
function currentUser(req) { return readSession(req); }
function requireUser(req, res, next) {
  const s = currentUser(req);
  if (!s || s.role !== 'user') return res.redirect('/?error=' + encodeURIComponent('Vui lòng đăng nhập.'));
  req.session = s;
  next();
}
function requireAdmin(req, res, next) {
  const s = currentUser(req);
  if (!s || s.role !== 'admin') return res.redirect('/admin?error=' + encodeURIComponent('Bạn chưa đăng nhập admin.'));
  req.session = s;
  next();
}
function apiError(res, message, code = 200, extra = {}) {
  return res.status(code).json({ success: false, message, ...extra });
}
function apiOk(res, data = {}) {
  return res.json({ success: true, ...data });
}
function deviceHash(deviceId) {
  return crypto.createHash('sha256').update(String(deviceId)).digest('hex');
}
function validDeviceHash(s) {
  return /^[a-f0-9]{64}$/i.test(String(s || ''));
}
function keyCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const parts = [];
  for (let j = 0; j < 4; j++) {
    let x = '';
    for (let i = 0; i < 5; i++) x += alphabet[crypto.randomInt(0, alphabet.length)];
    parts.push(x);
  }
  return 'VIP-' + parts.join('-');
}

async function migrate() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    await c.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(50),
        email VARCHAR(190) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        balance BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50)`);
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(190)`);
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`);
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'`);
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance BIGINT NOT NULL DEFAULT 0`);
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email))`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower ON users (LOWER(username)) WHERE username IS NOT NULL`);

    await c.query(`
      CREATE TABLE IF NOT EXISTS vip_keys (
        id BIGSERIAL PRIMARY KEY,
        key_value VARCHAR(80) NOT NULL UNIQUE,
        duration_hours INTEGER NOT NULL,
        price BIGINT NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ,
        device_limit INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        user_id BIGINT NULL,
        note VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS key_value VARCHAR(80)`);
    await c.query(`ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS duration_hours INTEGER NOT NULL DEFAULT 24`);
    await c.query(`ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS price BIGINT NOT NULL DEFAULT 0`);
    await c.query(`ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
    await c.query(`ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS device_limit INTEGER NOT NULL DEFAULT 1`);
    await c.query(`ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`);
    await c.query(`ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS user_id BIGINT`);
    await c.query(`ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS note VARCHAR(255)`);
    await c.query(`ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await c.query(`ALTER TABLE vip_keys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_vip_key_value ON vip_keys(key_value)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_vip_user ON vip_keys(user_id)`);

    await c.query(`
      CREATE TABLE IF NOT EXISTS key_devices (
        id BIGSERIAL PRIMARY KEY,
        key_id BIGINT NOT NULL,
        device_hash CHAR(64) NOT NULL,
        first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(key_id, device_hash)
      )
    `);
    await c.query(`ALTER TABLE key_devices ADD COLUMN IF NOT EXISTS first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await c.query(`ALTER TABLE key_devices ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_key_device ON key_devices(key_id, device_hash)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_key_devices_key ON key_devices(key_id)`);

    await c.query(`
      CREATE TABLE IF NOT EXISTS balance_transactions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        amount BIGINT NOT NULL,
        balance_after BIGINT NOT NULL,
        type VARCHAR(30) NOT NULL,
        description VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS description VARCHAR(255)`);
    await c.query(`ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_tx_user ON balance_transactions(user_id, id DESC)`);

    await c.query(`
      CREATE TABLE IF NOT EXISTS wallet_requests (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        request_type VARCHAR(20) NOT NULL,
        amount BIGINT NOT NULL,
        bank_name VARCHAR(100) NOT NULL,
        account_number VARCHAR(80),
        account_name VARCHAR(190),
        note VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        admin_note VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_requests(user_id, id DESC)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_wallet_status ON wallet_requests(status, id DESC)`);

    await c.query(`
      CREATE TABLE IF NOT EXISTS fb_jobs (
        id BIGSERIAL PRIMARY KEY,
        link VARCHAR(255) NOT NULL,
        object_id VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'like',
        reaction VARCHAR(20) NOT NULL DEFAULT 'like',
        price INTEGER NOT NULL DEFAULT 35,
        max_uses INTEGER NOT NULL DEFAULT 9999,
        used_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS tiktok_jobs (
        id BIGSERIAL PRIMARY KEY,
        video_url VARCHAR(255) NOT NULL,
        ads_id VARCHAR(100) NOT NULL,
        account_id VARCHAR(100) NOT NULL,
        price INTEGER NOT NULL DEFAULT 20,
        max_uses INTEGER NOT NULL DEFAULT 9999,
        used_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS job_completions (
        id BIGSERIAL PRIMARY KEY,
        platform VARCHAR(20) NOT NULL,
        job_id BIGINT NOT NULL,
        device_hash CHAR(64) NOT NULL,
        user_id BIGINT,
        amount INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'done',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(platform, job_id, device_hash)
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_completion_device ON job_completions(device_hash, platform)`);
    await c.query(`
      CREATE TABLE IF NOT EXISTS job_reports (
        id BIGSERIAL PRIMARY KEY,
        platform VARCHAR(20) NOT NULL,
        job_id BIGINT NOT NULL,
        uid VARCHAR(100),
        device_hash CHAR(64) NOT NULL,
        description VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS app_credits (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        device_hash CHAR(64) NOT NULL,
        name_tool VARCHAR(50) NOT NULL DEFAULT '',
        amount INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_credits_device_time ON app_credits(device_hash, created_at)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_credits_user ON app_credits(user_id, id DESC)`);

    await c.query('COMMIT');
    await ensureAdmin();
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function ensureAdmin() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const existing = await pool.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [ADMIN_EMAIL]);
  if (existing.rowCount) {
    await pool.query(
      `UPDATE users SET role='admin', password_hash=$1, updated_at=NOW() WHERE id=$2`,
      [hash, existing.rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO users(username,email,password_hash,role,balance) VALUES($1,$2,$3,'admin',0)`,
      ['admin', ADMIN_EMAIL, hash]
    );
  }
}

async function waitForDatabase() {
  let delay = 3000;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      await pool.query('SELECT 1');
      await migrate();
      dbReady = true;
      dbLastError = null;
      console.log('BON database ready');
      return;
    } catch (e) {
      dbReady = false;
      dbLastError = e.message;
      console.error(`Database connection/migration attempt ${attempt}/20 failed: ${e.message}`);
      if (attempt < 20) await new Promise(r => setTimeout(r, Math.min(delay, 30000)));
      delay = Math.min(delay * 1.5, 30000);
    }
  }
}

async function dbOr503(res) {
  if (!dbReady) {
    res.status(503).json({
      success: false,
      message: 'Database chưa sẵn sàng',
      database: 'starting',
    });
    return false;
  }
  return true;
}

function pageShell(title, body, req, extra = '') {
  const s = currentUser(req);
  return `<!doctype html><html lang="vi"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;font:15px Arial,sans-serif;background:#070b16;color:#edf2ff}
a{color:#8fb5ff;text-decoration:none}.wrap{max-width:1180px;margin:auto;padding:18px}
.card{background:#10192a;border:1px solid #263a5b;border-radius:18px;padding:18px;margin-bottom:16px;box-shadow:0 12px 35px #0004}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px}.brand{font-size:24px;font-weight:900}.muted{color:#91a0b8}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.stat{padding:16px;border:1px solid #2b3f61;border-radius:14px;background:#0b1424}.stat span{display:block;color:#8998b0;font-size:12px}.stat b{display:block;font-size:26px;margin-top:6px}
input,select,textarea{width:100%;padding:11px;border-radius:10px;border:1px solid #34445f;background:#0a1221;color:#fff;outline:none}
textarea{min-height:80px}.row{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.formrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
button,.btn{border:0;border-radius:10px;padding:11px 15px;background:#3566ff;color:#fff;font-weight:700;cursor:pointer}.green{background:#16803c}.danger{background:#b42318}.gray{background:#293753}
.badge{display:inline-block;padding:5px 9px;border-radius:99px;background:#182743;color:#9fc0ff;font-size:12px}
.key{font-family:monospace;color:#66e3ff;font-weight:800;word-break:break-all}.notice{padding:12px;border-radius:12px;background:#172640;border:1px solid #31507e;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:13px;display:block;overflow:auto}th,td{padding:9px;border-bottom:1px solid #293753;text-align:left;white-space:nowrap}
h1,h2,h3{margin-top:0}.login{max-width:430px;margin:9vh auto}.center{text-align:center}.small{font-size:12px}
@media(max-width:800px){.grid,.grid2,.row{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
</style>${extra}</head><body><div class="wrap">${body}</div></body></html>`;
}

function loginPage(req, error = '') {
  const e = error || req.query.error || '';
  return pageShell('BON SHOP', `<div class="card login">
<div class="center"><div class="brand">BON SHOP</div><p class="muted">Đăng nhập hệ thống</p></div>
${e ? `<div class="notice">${esc(e)}</div>` : ''}
<form method="post" action="/login">
<div class="small muted">Username hoặc Email</div><input name="login_id" required autocomplete="username">
<div class="small muted" style="margin-top:10px">Mật khẩu</div><input name="pass" type="password" required autocomplete="current-password">
<button style="width:100%;margin-top:14px">Đăng nhập</button>
</form>
<hr style="border-color:#263a5b;margin:20px 0">
<form method="post" action="/register">
<h3>Đăng ký</h3>
<div class="row"><input name="username" placeholder="Username" required><input name="email" type="email" placeholder="Email" required></div>
<input name="pass" type="password" placeholder="Mật khẩu từ 6 ký tự" required style="margin-top:10px">
<button class="gray" style="width:100%;margin-top:10px">Tạo tài khoản</button>
</form>
<p class="center small muted" style="margin-top:18px"><a href="/admin">Đăng nhập Admin</a> · <a href="/statistics">Thống kê</a></p>
</div>`, req);
}

async function renderUser(req) {
  const uid = req.session.uid;
  const u = (await pool.query('SELECT id,username,email,balance,created_at FROM users WHERE id=$1', [uid])).rows[0];
  if (!u) return loginPage(req, 'Tài khoản không tồn tại.');
  const keys = (await pool.query(`SELECT id,key_value,duration_hours,expires_at,device_limit,status,created_at,note FROM vip_keys WHERE user_id=$1 ORDER BY id DESC LIMIT 20`, [uid])).rows;
  const tx = (await pool.query(`SELECT amount,balance_after,type,description,created_at FROM balance_transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 20`, [uid])).rows;
  const msg = req.query.msg || '';
  const plans = Object.entries(prices).map(([h,p]) => `<div class="stat"><span>${h} giờ</span><b>${money(p)} xu</b><form method="post" action="/user/buy"><input type="hidden" name="hours" value="${h}"><button style="margin-top:10px">Mua Key</button></form></div>`).join('');
  const keyRows = keys.map(k => `<tr><td class="key">${esc(k.key_value)}</td><td>${k.duration_hours}h</td><td>${esc(k.expires_at || '')}</td><td>${esc(k.status)}</td><td>${k.device_limit}</td></tr>`).join('') || '<tr><td colspan="5">Chưa có key.</td></tr>';
  const txRows = tx.map(t => `<tr><td>${esc(t.created_at)}</td><td>${Number(t.amount)>=0?'+':''}${money(t.amount)}</td><td>${money(t.balance_after)}</td><td>${esc(t.type)}</td><td>${esc(t.description||'')}</td></tr>`).join('') || '<tr><td colspan="5">Chưa có giao dịch.</td></tr>';
  const bankOptions = Object.keys(banks).map(b => `<option>${esc(b)}</option>`).join('');
  return pageShell('BON SHOP — Tài khoản', `<div class="top card">
<div><div class="brand">BON SHOP</div><div class="muted">Xin chào ${esc(u.username || u.email)}</div></div>
<div class="formrow"><span class="badge">Số dư: ${money(u.balance)} xu</span><form method="post" action="/logout"><button class="gray">Đăng xuất</button></form></div></div>
${msg ? `<div class="notice">${esc(msg)}</div>` : ''}
<div class="grid">${plans}</div>
<div class="grid2">
<div class="card"><h3>Nạp tiền</h3><form method="post" action="/user/deposit">
<select name="bank">${bankOptions}</select><input name="amount" type="number" min="1000" placeholder="Số tiền" style="margin-top:8px"><input name="note" placeholder="Ghi chú chuyển khoản" style="margin-top:8px"><button class="green" style="margin-top:8px">Gửi yêu cầu nạp</button></form>
</div>
<div class="card"><h3>Rút tiền</h3><form method="post" action="/user/withdraw">
<select name="bank">${bankOptions}</select><input name="account_number" placeholder="Số tài khoản" style="margin-top:8px"><input name="account_name" placeholder="Tên tài khoản" style="margin-top:8px"><input name="amount" type="number" min="${withdrawMin}" placeholder="Số xu rút" style="margin-top:8px"><button style="margin-top:8px">Gửi yêu cầu rút</button></form></div>
</div>
<div class="card"><h3>Key của tôi</h3><table><thead><tr><th>Key</th><th>Thời hạn</th><th>Hết hạn</th><th>Trạng thái</th><th>Thiết bị</th></tr></thead><tbody>${keyRows}</tbody></table></div>
<div class="card"><h3>Lịch sử số dư</h3><table><thead><tr><th>Thời gian</th><th>Biến động</th><th>Số dư sau</th><th>Loại</th><th>Mô tả</th></tr></thead><tbody>${txRows}</tbody></table></div>
`, req);
}

async function renderAdmin(req) {
  const users = (await pool.query(`SELECT id,username,email,role,balance,created_at FROM users ORDER BY id DESC LIMIT 100`)).rows;
  const keys = (await pool.query(`SELECT k.*,u.username,u.email FROM vip_keys k LEFT JOIN users u ON u.id=k.user_id ORDER BY k.id DESC LIMIT 100`)).rows;
  const wallets = (await pool.query(`SELECT w.*,u.username,u.email FROM wallet_requests w LEFT JOIN users u ON u.id=w.user_id ORDER BY w.id DESC LIMIT 100`)).rows;
  const fb = (await pool.query(`SELECT * FROM fb_jobs ORDER BY id DESC LIMIT 100`)).rows;
  const tt = (await pool.query(`SELECT * FROM tiktok_jobs ORDER BY id DESC LIMIT 100`)).rows;
  const stats = await Promise.all([
    pool.query('SELECT COUNT(*)::int n FROM users'),
    pool.query("SELECT COUNT(*)::int n FROM vip_keys WHERE status='active' AND expires_at>NOW()"),
    pool.query('SELECT COUNT(*)::int n FROM key_devices'),
    pool.query("SELECT COALESCE(SUM(amount),0)::bigint n FROM balance_transactions WHERE amount>0"),
    pool.query("SELECT COUNT(*)::int n FROM job_completions WHERE platform='facebook'"),
    pool.query("SELECT COUNT(*)::int n FROM job_completions WHERE platform='tiktok'")
  ]);
  const vals = stats.map(x => x.rows[0].n);
  const msg=req.query.msg||'';
  const userOpts=users.map(u=>`<option value="${u.id}">${esc(u.username||u.email)} (#${u.id})</option>`).join('');
  const keyRows=keys.map(k=>`<tr><td>${k.id}</td><td class="key">${esc(k.key_value)}</td><td>${esc(k.username||k.email||'-')}</td><td>${k.duration_hours}h</td><td>${esc(k.expires_at||'')}</td><td>${esc(k.status)}</td><td>${k.device_limit}</td><td class="formrow">
<form method="post" action="/admin/key"><input type="hidden" name="id" value="${k.id}"><input type="hidden" name="action" value="extend"><input name="hours" type="number" value="24" style="width:80px"><button>+h</button></form>
<form method="post" action="/admin/key"><input type="hidden" name="id" value="${k.id}"><input type="hidden" name="action" value="${k.status==='active'?'disable':'enable'}"><button class="${k.status==='active'?'danger':'green'}">${k.status==='active'?'Khóa':'Mở'}</button></form>
<form method="post" action="/admin/key"><input type="hidden" name="id" value="${k.id}"><input type="hidden" name="action" value="reset"><button class="gray">Reset TB</button></form>
<form method="post" action="/admin/key" onsubmit="return confirm('Xóa key này?')"><input type="hidden" name="id" value="${k.id}"><input type="hidden" name="action" value="delete"><button class="danger">Xóa</button></form>
</td></tr>`).join('');
  const walletRows=wallets.map(w=>`<tr><td>${w.id}</td><td>${esc(w.username||w.email||'-')}</td><td>${esc(w.request_type)}</td><td>${money(w.amount)}</td><td>${esc(w.bank_name)}</td><td>${esc(w.account_number||'')}</td><td>${esc(w.account_name||'')}</td><td>${esc(w.status)}</td><td>${esc(w.created_at)}</td><td>${w.status==='pending'?`<form method="post" action="/admin/wallet" class="formrow"><input type="hidden" name="id" value="${w.id}"><button name="action" value="approve" class="green">Duyệt</button><button name="action" value="reject" class="danger">Từ chối</button></form>`:''}</td></tr>`).join('');
  const userRows=users.map(u=>`<tr><td>${u.id}</td><td>${esc(u.username||'')}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${money(u.balance)}</td><td class="formrow"><form method="post" action="/admin/balance"><input type="hidden" name="uid" value="${u.id}"><input name="amount" type="number" min="1" placeholder="xu" style="width:100px"><button name="action" value="topup" class="green">+</button><button name="action" value="deduct" class="danger">−</button></form></td></tr>`).join('');
  const fbRows=fb.map(j=>`<tr><td>${j.id}</td><td>${esc(j.object_id)}</td><td>${esc(j.type)}/${esc(j.reaction)}</td><td>${money(j.price)}</td><td>${j.used_count}/${j.max_uses}</td><td>${esc(j.status)}</td><td class="formrow"><form method="post" action="/admin/job"><input type="hidden" name="platform" value="fb"><input type="hidden" name="id" value="${j.id}"><button name="action" value="${j.status==='active'?'disable':'enable'}">${j.status==='active'?'Khóa':'Mở'}</button><button class="danger" name="action" value="delete">Xóa</button></form></td></tr>`).join('');
  const ttRows=tt.map(j=>`<tr><td>${j.id}</td><td>${esc(j.ads_id)}</td><td>${esc(j.account_id)}</td><td>${money(j.price)}</td><td>${j.used_count}/${j.max_uses}</td><td>${esc(j.status)}</td><td class="formrow"><form method="post" action="/admin/job"><input type="hidden" name="platform" value="tt"><input type="hidden" name="id" value="${j.id}"><button name="action" value="${j.status==='active'?'disable':'enable'}">${j.status==='active'?'Khóa':'Mở'}</button><button class="danger" name="action" value="delete">Xóa</button></form></td></tr>`).join('');
  return pageShell('BON SHOP — Admin', `<div class="top card"><div><div class="brand">BON SHOP · ADMIN</div><div class="muted">${esc(ADMIN_EMAIL)}</div></div><form method="post" action="/logout"><button class="gray">Đăng xuất</button></form></div>
${msg?`<div class="notice">${esc(msg)}</div>`:''}
<div class="grid">
<div class="stat"><span>Users</span><b>${money(vals[0])}</b></div><div class="stat"><span>Key active</span><b>${money(vals[1])}</b></div><div class="stat"><span>Thiết bị</span><b>${money(vals[2])}</b></div><div class="stat"><span>Xu đã cộng</span><b>${money(vals[3])}</b></div><div class="stat"><span>FB hoàn thành</span><b>${money(vals[4])}</b></div><div class="stat"><span>TikTok hoàn thành</span><b>${money(vals[5])}</b></div>
</div>
<div class="grid2">
<div class="card"><h3>Tạo Key VIP</h3><form method="post" action="/admin/create-key"><div class="row"><input name="hours" type="number" value="24" min="1" placeholder="Giờ"><input name="price" type="number" value="0" min="0" placeholder="Giá"></div><select name="uid" style="margin-top:8px"><option value="0">Không gán user</option>${userOpts}</select><input name="note" placeholder="Ghi chú" style="margin-top:8px"><button style="margin-top:8px">Tạo Key</button></form></div>
<div class="card"><h3>Cộng / trừ xu</h3><form method="post" action="/admin/balance"><select name="uid">${userOpts}</select><input name="amount" type="number" min="1" placeholder="Số xu" style="margin-top:8px"><div class="formrow" style="margin-top:8px"><button name="action" value="topup" class="green">Cộng</button><button name="action" value="deduct" class="danger">Trừ</button></div></form></div>
</div>
<div class="card"><h3>Người dùng</h3><table><thead><tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Số dư</th><th>Điều chỉnh</th></tr></thead><tbody>${userRows}</tbody></table></div>
<div class="card"><h3>Key VIP</h3><table><thead><tr><th>ID</th><th>Key</th><th>User</th><th>Giờ</th><th>Hết hạn</th><th>Status</th><th>TB</th><th>Thao tác</th></tr></thead><tbody>${keyRows||'<tr><td colspan="8">Chưa có key</td></tr>'}</tbody></table></div>
<div class="card"><h3>Yêu cầu nạp/rút</h3><table><thead><tr><th>ID</th><th>User</th><th>Loại</th><th>Số tiền</th><th>Ngân hàng</th><th>STK</th><th>Tên</th><th>Status</th><th>Ngày</th><th>Thao tác</th></tr></thead><tbody>${walletRows||'<tr><td colspan="10">Chưa có</td></tr>'}</tbody></table></div>
<div class="grid2">
<div class="card"><h3>Thêm job Facebook</h3><form method="post" action="/admin/add-job"><input type="hidden" name="platform" value="fb"><input name="link" placeholder="Link Facebook"><input name="object_id" placeholder="Object ID" style="margin-top:8px"><div class="row" style="margin-top:8px"><input name="type" value="like"><input name="reaction" value="like"></div><div class="row" style="margin-top:8px"><input name="price" type="number" value="35"><input name="max_uses" type="number" value="9999"></div><button style="margin-top:8px">Thêm</button></form></div>
<div class="card"><h3>Thêm job TikTok</h3><form method="post" action="/admin/add-job"><input type="hidden" name="platform" value="tt"><input name="video_url" placeholder="Video URL"><input name="ads_id" placeholder="Ads ID" style="margin-top:8px"><input name="account_id" placeholder="Account ID" style="margin-top:8px"><div class="row" style="margin-top:8px"><input name="price" type="number" value="20"><input name="max_uses" type="number" value="9999"></div><button style="margin-top:8px">Thêm</button></form></div>
</div>
<div class="grid2"><div class="card"><h3>Jobs Facebook</h3><table><tr><th>ID</th><th>Object</th><th>Type</th><th>Xu</th><th>Uses</th><th>Status</th><th></th></tr>${fbRows}</table></div>
<div class="card"><h3>Jobs TikTok</h3><table><tr><th>ID</th><th>Ads</th><th>Account</th><th>Xu</th><th>Uses</th><th>Status</th><th></th></tr>${ttRows}</table></div></div>
`, req);
}

// --- Public pages ---
app.get('/health', async (req,res) => {
  res.json({ ok: true, service: 'bon-shop', database: dbReady ? 'ready' : 'starting', time: nowIso() });
});
app.get('/api', (req,res) => res.json({
  name:'BON SHOP API', version:'4.0.0', database: dbReady ? 'ready' : 'starting',
  endpoints:[
    'GET /checkkey/api/key.php',
    'GET /checkkey/api/check_date_key.php',
    'GET /checkkey/api/api_golike_fb.php',
    'GET /checkkey/api/api_golike_tiktok.php',
    'POST /checkkey/',
    'POST /api/check-key.php',
    'GET /statistics'
  ]
}));
app.get('/', async (req,res) => {
  if (currentUser(req)?.role === 'user') {
    if (!dbReady) return res.status(503).send(pageShell('BON SHOP', '<div class="card"><h1>Database đang khởi động</h1><p class="muted">Render đã mở cổng. Server đang kết nối PostgreSQL, hãy tải lại sau vài giây.</p></div>', req));
    return res.send(await renderUser(req));
  }
  res.send(loginPage(req));
});
app.get('/statistics', async (req,res) => {
  if (!dbReady) return res.send(pageShell('BON SHOP — Thống kê','<div class="card"><h1>BON SHOP</h1><p class="muted">Database đang khởi động.</p></div>',req));
  const q = await Promise.all([
    pool.query('SELECT COUNT(*)::int n FROM users'),
    pool.query("SELECT COUNT(*)::int n FROM vip_keys"),
    pool.query("SELECT COUNT(*)::int n FROM vip_keys WHERE status='active' AND expires_at>NOW()"),
    pool.query("SELECT COUNT(*)::int n FROM key_devices"),
    pool.query("SELECT COALESCE(SUM(amount),0)::bigint n FROM balance_transactions WHERE amount>0"),
    pool.query("SELECT COUNT(*)::int n FROM job_completions WHERE platform='facebook'"),
    pool.query("SELECT COUNT(*)::int n FROM job_completions WHERE platform='tiktok'"),
    pool.query(`SELECT j.platform,j.amount,j.created_at,u.username FROM job_completions j LEFT JOIN users u ON u.id=j.user_id ORDER BY j.id DESC LIMIT 12`)
  ]);
  const [users,keys,active,devices,earned,fbDone,ttDone,recent] = q.map(x=>x.rows);
  const stats = [[users[0].n,'Người dùng'],[active[0].n,`Key VIP hoạt động / ${keys[0].n}`],[devices[0].n,'Thiết bị'],[earned[0].n,'Xu đã cộng'],[fbDone[0].n,'Facebook hoàn thành'],[ttDone[0].n,'TikTok hoàn thành']];
  return res.send(pageShell('BON SHOP — Thống kê',`<div class="card center"><div class="brand">BON SHOP</div><p class="muted">Hệ thống dịch vụ số · thống kê</p></div><div class="grid">${stats.map(x=>`<div class="stat"><span>${esc(x[1])}</span><b>${money(x[0])}</b></div>`).join('')}</div><div class="card"><h3>Hoạt động gần đây</h3><table><tr><th>Nền tảng</th><th>Xu</th><th>User</th><th>Thời gian</th></tr>${recent.map(r=>`<tr><td>${esc(r.platform)}</td><td>+${money(r.amount)}</td><td>${esc(r.username||'-')}</td><td>${esc(r.created_at)}</td></tr>`).join('')||'<tr><td colspan="4">Chưa có</td></tr>'}</table></div>`,req));
});
app.get('/Key_Free/', (req,res) => {
  const key = String(req.query.key || '').trim();
  res.send(pageShell('BON SHOP — Key Free',`<div class="card login center"><span class="badge">BON SHOP · KEY FREE</span><h1>${key?'Mã kích hoạt của bạn':'Thiếu mã key'}</h1>${key?`<p class="muted">Sao chép mã và dán vào BON_TOOL.</p><div class="key stat" style="font-size:20px">${esc(key)}</div><button onclick="navigator.clipboard&&navigator.clipboard.writeText(${JSON.stringify(key)})">📋 Sao chép</button>`:'<p class="muted">Không tìm thấy mã kích hoạt.</p>'}</div>`,req));
});
app.get('/checkkey/api/announcement.json', (req,res) => res.json({
  success:true, status:'success', version:'4.0.0',
  title:'BON SHOP', message:'Server BON SHOP đang hoạt động.',
  url: PUBLIC_URL || 'https://bonshop.onrender.com',
  updated_at: nowIso()
}));

// --- Authentication ---
app.post('/login', async (req,res) => {
  if (!await dbOr503(res)) return;
  const login = String(req.body.login_id || '').trim().toLowerCase();
  const pass = String(req.body.pass || '');
  const q = await pool.query('SELECT id,username,email,password_hash,role FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1) LIMIT 1',[login]);
  const u = q.rows[0];
  if (!u || !(await bcrypt.compare(pass,u.password_hash))) return res.redirect('/?error='+encodeURIComponent('Sai username/email hoặc mật khẩu.'));
  setSession(res,{role:u.role==='admin'?'admin':'user',uid:u.id,email:u.email,username:u.username||''});
  res.redirect(u.role==='admin'?'/admin':'/');
});
app.post('/register', async (req,res) => {
  if (!await dbOr503(res)) return;
  const username=String(req.body.username||'').trim();
  const email=String(req.body.email||'').trim().toLowerCase();
  const pass=String(req.body.pass||'');
  if(!/^[A-Za-z0-9_]{3,30}$/.test(username)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||pass.length<6)
    return res.redirect('/?error='+encodeURIComponent('Thông tin đăng ký không hợp lệ.'));
  try {
    const hash=await bcrypt.hash(pass,12);
    await pool.query(`INSERT INTO users(username,email,password_hash,role,balance) VALUES($1,$2,$3,'user',0)`,[username,email,hash]);
    res.redirect('/?error='+encodeURIComponent('Đăng ký thành công, hãy đăng nhập.'));
  } catch(e) { res.redirect('/?error='+encodeURIComponent('Username hoặc email đã tồn tại.')); }
});
app.post('/logout',(req,res)=>{clearSession(res);res.redirect('/');});

// --- User actions ---
app.post('/user/deposit',requireUser,async(req,res)=>{
  if(!await dbOr503(res))return;
  const bank=String(req.body.bank||'');const amount=Number(req.body.amount||0);const note=String(req.body.note||'').slice(0,255);
  if(!banks[bank]||amount<1000)return res.redirect('/?msg='+encodeURIComponent('Ngân hàng hoặc số tiền không hợp lệ.'));
  await pool.query(`INSERT INTO wallet_requests(user_id,request_type,amount,bank_name,note) VALUES($1,'deposit',$2,$3,$4)`,[req.session.uid,amount,bank,note]);
  res.redirect('/?msg='+encodeURIComponent('Đã gửi yêu cầu nạp tiền.'));
});
app.post('/user/withdraw',requireUser,async(req,res)=>{
  if(!await dbOr503(res))return;
  const bank=String(req.body.bank||'');const acc=String(req.body.account_number||'').trim();const name=String(req.body.account_name||'').trim();const amount=Number(req.body.amount||0);
  if(!banks[bank]||!acc||!name||amount<withdrawMin)return res.redirect('/?msg='+encodeURIComponent('Thông tin rút tiền không hợp lệ.'));
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const u=(await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[req.session.uid])).rows[0];
    if(!u||Number(u.balance)<amount){await c.query('ROLLBACK');return res.redirect('/?msg='+encodeURIComponent('Số dư không đủ.'));}
    const newBal=Number(u.balance)-amount;
    await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[newBal,req.session.uid]);
    await c.query(`INSERT INTO wallet_requests(user_id,request_type,amount,bank_name,account_number,account_name) VALUES($1,'withdraw',$2,$3,$4,$5)`,[req.session.uid,amount,bank,acc,name]);
    await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_adjust','Giữ tiền yêu cầu rút')`,[req.session.uid,-amount,newBal]);
    await c.query('COMMIT');
    res.redirect('/?msg='+encodeURIComponent('Đã gửi yêu cầu rút tiền.'));
  }catch(e){await c.query('ROLLBACK').catch(()=>{});res.redirect('/?msg='+encodeURIComponent('Không thể tạo yêu cầu rút.'));}
  finally{c.release();}
});
app.post('/user/buy',requireUser,async(req,res)=>{
  if(!await dbOr503(res))return;
  const hours=Number(req.body.hours||0);const price=prices[hours];
  if(!price)return res.redirect('/?msg='+encodeURIComponent('Gói không hợp lệ.'));
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const u=(await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.session.uid])).rows[0];
    if(!u||Number(u.balance)<price){await c.query('ROLLBACK');return res.redirect('/?msg='+encodeURIComponent('Số dư không đủ.'));}
    let key;
    for(let i=0;i<10;i++){const candidate=keyCode();const x=await c.query('SELECT 1 FROM vip_keys WHERE key_value=$1',[candidate]);if(!x.rowCount){key=candidate;break;}}
    if(!key)throw new Error('Cannot generate unique key');
    const exp=new Date(Date.now()+hours*3600000);
    const newBal=Number(u.balance)-price;
    await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[newBal,req.session.uid]);
    await c.query(`INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,status,user_id,note) VALUES($1,$2,$3,$4,1,'active',$5,'Mua từ website')`,[key,hours,price,exp,req.session.uid]);
    await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'purchase','Mua Key VIP')`,[req.session.uid,-price,newBal]);
    await c.query('COMMIT');
    res.redirect('/?msg='+encodeURIComponent('Mua thành công: '+key));
  }catch(e){await c.query('ROLLBACK').catch(()=>{});res.redirect('/?msg='+encodeURIComponent('Có lỗi khi mua Key.'));}
  finally{c.release();}
});

// --- Admin ---
app.get('/admin', async(req,res)=>{
  if(currentUser(req)?.role!=='admin') return res.send(pageShell('BON SHOP — Admin',`<div class="card login"><div class="brand">BON SHOP · ADMIN</div>${req.query.error?`<div class="notice">${esc(req.query.error)}</div>`:''}<form method="post" action="/admin/login"><input name="email" type="email" placeholder="Admin email" value="${esc(ADMIN_EMAIL)}" required><input name="password" type="password" placeholder="Mật khẩu" required style="margin-top:8px"><button style="width:100%;margin-top:10px">Đăng nhập Admin</button></form><p class="small muted" style="margin-top:15px">Tài khoản admin được tạo từ biến môi trường ADMIN_EMAIL / ADMIN_PASSWORD.</p></div>`,req));
  if(!dbReady)return res.status(503).send(pageShell('BON SHOP — Admin','<div class="card"><h1>Database đang khởi động</h1><p class="muted">Hãy tải lại sau vài giây.</p></div>',req));
  res.send(await renderAdmin(req));
});
app.post('/admin/login',async(req,res)=>{
  if(!await dbOr503(res))return;
  const email=String(req.body.email||'').trim().toLowerCase();const pass=String(req.body.password||'');
  if(email!==ADMIN_EMAIL||pass!==ADMIN_PASSWORD)return res.redirect('/admin?error='+encodeURIComponent('Sai tài khoản admin.'));
  const u=(await pool.query('SELECT id,username,email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1',[ADMIN_EMAIL])).rows[0];
  if(!u)return res.redirect('/admin?error='+encodeURIComponent('Admin chưa được tạo. Kiểm tra DATABASE_URL.'));
  setSession(res,{role:'admin',uid:u.id,email:u.email,username:u.username||'admin'});res.redirect('/admin');
});
app.post('/admin/balance',requireAdmin,async(req,res)=>{
  const uid=Number(req.body.uid||0),amount=Number(req.body.amount||0),action=String(req.body.action||'');
  if(uid<=0||amount<=0)return res.redirect('/admin?msg='+encodeURIComponent('Số tiền không hợp lệ.'));
  const c=await pool.connect();
  try{await c.query('BEGIN');const u=(await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[uid])).rows[0];
    if(!u){await c.query('ROLLBACK');return res.redirect('/admin?msg='+encodeURIComponent('Không tìm thấy user.'));}
    const old=Number(u.balance);const newBal=action==='deduct'?old-amount:old+amount;
    if(newBal<0){await c.query('ROLLBACK');return res.redirect('/admin?msg='+encodeURIComponent('Số dư không đủ.'));}
    await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[newBal,uid]);
    await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,$4,$5)`,[uid,action==='deduct'?-amount:amount,newBal,action==='deduct'?'admin_adjust':'admin_topup',action==='deduct'?'Admin trừ số dư':'Admin cộng số dư']);
    await c.query('COMMIT');res.redirect('/admin?msg='+encodeURIComponent('Đã cập nhật số dư.'));
  }catch(e){await c.query('ROLLBACK').catch(()=>{});res.redirect('/admin?msg='+encodeURIComponent('Không thể cập nhật.'));}finally{c.release();}
});
app.post('/admin/create-key',requireAdmin,async(req,res)=>{
  const hours=Math.max(1,Number(req.body.hours||24));const price=Math.max(0,Number(req.body.price||0));const uid=Number(req.body.uid||0);const note=String(req.body.note||'').slice(0,255);
  let key;for(let i=0;i<10;i++){const k=keyCode();if(!(await pool.query('SELECT 1 FROM vip_keys WHERE key_value=$1',[k])).rowCount){key=k;break;}}
  if(!key)return res.redirect('/admin?msg='+encodeURIComponent('Không tạo được key.'));
  const exp=new Date(Date.now()+hours*3600000);
  await pool.query(`INSERT INTO vip_keys(key_value,duration_hours,price,expires_at,device_limit,status,user_id,note) VALUES($1,$2,$3,$4,1,'active',$5,$6)`,[key,hours,price,exp,uid||null,note]);
  res.redirect('/admin?msg='+encodeURIComponent('Đã tạo key: '+key));
});
app.post('/admin/key',requireAdmin,async(req,res)=>{
  const id=Number(req.body.id||0),action=String(req.body.action||'');
  try{
    if(action==='extend'){const h=Math.max(1,Number(req.body.hours||24));await pool.query(`UPDATE vip_keys SET expires_at=GREATEST(COALESCE(expires_at,NOW()),NOW()) + ($1::int * INTERVAL '1 hour'),status='active',updated_at=NOW() WHERE id=$2`,[h,id]);}
    else if(action==='disable')await pool.query(`UPDATE vip_keys SET status='disabled',updated_at=NOW() WHERE id=$1`,[id]);
    else if(action==='enable')await pool.query(`UPDATE vip_keys SET status=CASE WHEN expires_at>NOW() THEN 'active' ELSE 'expired' END,updated_at=NOW() WHERE id=$1`,[id]);
    else if(action==='reset')await pool.query('DELETE FROM key_devices WHERE key_id=$1',[id]);
    else if(action==='delete')await pool.query('DELETE FROM vip_keys WHERE id=$1',[id]);
    res.redirect('/admin?msg='+encodeURIComponent('Đã cập nhật key.'));
  }catch(e){res.redirect('/admin?msg='+encodeURIComponent('Không thể cập nhật key.'));}
});
app.post('/admin/wallet',requireAdmin,async(req,res)=>{
  const id=Number(req.body.id||0),action=String(req.body.action||'');const c=await pool.connect();
  try{
    await c.query('BEGIN');const r=(await c.query('SELECT * FROM wallet_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!r||r.status!=='pending'){await c.query('ROLLBACK');return res.redirect('/admin?msg='+encodeURIComponent('Yêu cầu không còn chờ xử lý.'));}
    if(action==='approve'){
      await c.query(`UPDATE wallet_requests SET status='approved',processed_at=NOW() WHERE id=$1`,[id]);
      if(r.request_type==='deposit'){
        const u=(await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[r.user_id])).rows[0];const nb=Number(u.balance)+Number(r.amount);
        await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,r.user_id]);
        await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_topup',$4)`,[r.user_id,r.amount,nb,'Nạp tiền - '+r.bank_name]);
      }
    }else if(action==='reject'){
      await c.query(`UPDATE wallet_requests SET status='rejected',processed_at=NOW() WHERE id=$1`,[id]);
      if(r.request_type==='withdraw'){
        const u=(await c.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[r.user_id])).rows[0];const nb=Number(u.balance)+Number(r.amount);
        await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,r.user_id]);
        await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_adjust','Hoàn tiền yêu cầu rút bị từ chối')`,[r.user_id,r.amount,nb]);
      }
    }else{await c.query('ROLLBACK');return res.redirect('/admin?msg='+encodeURIComponent('Thao tác không hợp lệ.'));}
    await c.query('COMMIT');res.redirect('/admin?msg='+encodeURIComponent('Đã xử lý yêu cầu.'));
  }catch(e){await c.query('ROLLBACK').catch(()=>{});res.redirect('/admin?msg='+encodeURIComponent('Không thể xử lý yêu cầu.'));}finally{c.release();}
});
app.post('/admin/add-job',requireAdmin,async(req,res)=>{
  const p=String(req.body.platform||'');
  try{
    if(p==='fb'){
      const link=String(req.body.link||'').trim(),oid=String(req.body.object_id||'').trim(),type=String(req.body.type||'like'),reaction=String(req.body.reaction||'like'),price=Math.max(0,Number(req.body.price||35)),max=Math.max(1,Number(req.body.max_uses||9999));
      if(!link||!oid)return res.redirect('/admin?msg='+encodeURIComponent('Facebook job thiếu link/object_id.'));
      await pool.query(`INSERT INTO fb_jobs(link,object_id,type,reaction,price,max_uses) VALUES($1,$2,$3,$4,$5,$6)`,[link,oid,type,reaction,price,max]);
    }else if(p==='tt'){
      const url=String(req.body.video_url||''),ads=String(req.body.ads_id||'').trim(),acc=String(req.body.account_id||'').trim(),price=Math.max(0,Number(req.body.price||20)),max=Math.max(1,Number(req.body.max_uses||9999));
      if(!ads)return res.redirect('/admin?msg='+encodeURIComponent('TikTok job thiếu ads_id.'));
      await pool.query(`INSERT INTO tiktok_jobs(video_url,ads_id,account_id,price,max_uses) VALUES($1,$2,$3,$4,$5)`,[url,ads,acc,price,max]);
    }
    res.redirect('/admin?msg='+encodeURIComponent('Đã thêm nhiệm vụ.'));
  }catch(e){res.redirect('/admin?msg='+encodeURIComponent('Không thể thêm nhiệm vụ.'));}
});
app.post('/admin/job',requireAdmin,async(req,res)=>{
  const p=String(req.body.platform||''),id=Number(req.body.id||0),action=String(req.body.action||'');const table=p==='tt'?'tiktok_jobs':'fb_jobs';
  try{
    if(action==='disable')await pool.query(`UPDATE ${table} SET status='disabled' WHERE id=$1`,[id]);
    else if(action==='enable')await pool.query(`UPDATE ${table} SET status='active' WHERE id=$1`,[id]);
    else if(action==='delete')await pool.query(`DELETE FROM ${table} WHERE id=$1`,[id]);
    res.redirect('/admin?msg='+encodeURIComponent('Đã cập nhật nhiệm vụ.'));
  }catch(e){res.redirect('/admin?msg='+encodeURIComponent('Không thể cập nhật nhiệm vụ.'));}
});

// --- BON_TOOL compatibility APIs ---
async function findVip(key) {
  const q=await pool.query(`SELECT id,key_value,duration_hours,expires_at,device_limit,status,user_id,created_at FROM vip_keys WHERE key_value=$1 LIMIT 1`,[key]);
  return q.rows[0]||null;
}
async function validateVip(key) {
  const vip=await findVip(key);
  if(!vip)return {ok:false,status:'invalid',message:'Key VIP không tồn tại'};
  if(vip.status==='disabled')return {ok:false,status:'disabled',message:'Key VIP đã bị khóa',vip};
  if(!vip.expires_at||new Date(vip.expires_at).getTime()<=Date.now()){
    await pool.query(`UPDATE vip_keys SET status='expired',updated_at=NOW() WHERE id=$1`,[vip.id]);
    return {ok:false,status:'expired',message:'Key VIP đã hết hạn',vip};
  }
  return {ok:true,status:'success',vip};
}
async function bindDevice(vip, deviceId) {
  if(!deviceId) return {ok:true,count:0,bound:''};
  const hash=deviceHash(deviceId);
  const known=await pool.query('SELECT id FROM key_devices WHERE key_id=$1 AND device_hash=$2 LIMIT 1',[vip.id,hash]);
  const count=Number((await pool.query('SELECT COUNT(*) n FROM key_devices WHERE key_id=$1',[vip.id])).rows[0].n);
  if(!known.rowCount && count>=Number(vip.device_limit)) return {ok:false,count,limit:Number(vip.device_limit)};
  if(known.rowCount) await pool.query('UPDATE key_devices SET last_seen=NOW() WHERE id=$1',[known.rows[0].id]);
  else {await pool.query('INSERT INTO key_devices(key_id,device_hash) VALUES($1,$2)',[vip.id,hash]);}
  return {ok:true,count:known.rowCount?count:count+1,bound:deviceId};
}

async function keyApi(req,res) {
  if(!await dbOr503(res))return;
  const key=String(req.query.APIKey||req.query.api_key||req.query.key||req.body?.APIKey||req.body?.api_key||req.body?.key||'').trim();
  const deviceId=String(req.query.device_id||req.query.deviceId||req.body?.device_id||'').trim();
  if(!key)return res.status(400).json({status:'invalid',msg:'Thiếu APIKey'});
  const v=await validateVip(key);
  if(!v.ok)return res.json({status:v.status,msg:v.message,key,api_key:key});
  const b=await bindDevice(v.vip,deviceId);
  if(!b.ok)return res.json({status:'device_limit',msg:'Key VIP đã đạt giới hạn thiết bị',key,api_key:key,device_limit:b.limit});
  return res.json({success:true,status:'success',msg:'Xác thực Server thành công: Key VIP hợp lệ!',key:v.vip.key_value,api_key:v.vip.key_value,vip:true,duration_hours:v.vip.duration_hours,expires_at:v.vip.expires_at,endDate:v.vip.expires_at,end_date:v.vip.expires_at,create_date:v.vip.created_at,device_ID:b.bound||'',device_id:b.bound||'',device_count:b.count,device_limit:v.vip.device_limit});
}
app.all('/checkkey/api/key.php',keyApi);
app.all('/checkkey/api/check_date_key.php',async(req,res)=>{
  if(!await dbOr503(res))return;
  const key=String(req.query.APIKey||req.query.api_key||req.query.key||req.body?.APIKey||req.body?.api_key||req.body?.key||'').trim();
  const deviceId=String(req.query.device_id_local||req.query.device_id||req.query.deviceId||req.body?.device_id_local||'').trim();
  if(!key)return res.status(400).json({status:'invalid',msg:'Thiếu APIKey'});
  const v=await validateVip(key);
  if(!v.ok)return res.json({status:v.status,msg:v.message,key,api_key:key});
  const b=await bindDevice(v.vip,deviceId);
  if(!b.ok)return res.json({status:'device_limit',msg:'Key VIP đã đạt giới hạn thiết bị',key,api_key:key,device_limit:b.limit});
  return res.json({success:true,status:'success',msg:'Xác thực Server thành công: Key VIP hợp lệ!',key:v.vip.key_value,api_key:v.vip.key_value,vip:true,duration_hours:v.vip.duration_hours,expires_at:v.vip.expires_at,endDate:v.vip.expires_at,end_date:v.vip.expires_at,create_date:v.vip.created_at,device_ID:b.bound||'',device_id:b.bound||'',device_count:b.count,device_limit:v.vip.device_limit});
});

app.all('/checkkey/',async(req,res)=>{
  if(!await dbOr503(res))return;
  if(req.method!=='POST')return res.status(405).json({success:false,message:'Phương thức không hợp lệ'});
  const inb=req.body||{};
  const providedKeyAdmin=String(inb.keyadmin||''); if(providedKeyAdmin.length!==KEYADMIN_SECRET.length || !crypto.timingSafeEqual(Buffer.from(providedKeyAdmin),Buffer.from(KEYADMIN_SECRET)))return apiError(res,'Sai keyadmin',403);
  if(String(inb.action||'')!=='addHistory')return apiError(res,'Action không hợp lệ',400);
  const deviceId=String(inb.device_id||'').trim();const moneyN=Number(inb.money||0);const nameTool=String(inb.name_tool||'').trim().slice(0,50);
  if(!deviceId||moneyN<=0)return apiError(res,'Thiếu device_id hoặc money');
  if(moneyN>100000)return apiError(res,'Số tiền cộng quá lớn');
  const hash=deviceHash(deviceId);
  const kr=await pool.query(`SELECT k.id key_id,k.user_id,k.expires_at,k.status FROM key_devices d JOIN vip_keys k ON k.id=d.key_id WHERE d.device_hash=$1 ORDER BY d.last_seen DESC LIMIT 1`,[hash]);
  const keyRow=kr.rows[0];
  if(!keyRow||!keyRow.user_id)return apiError(res,'Thiết bị chưa kích hoạt Key VIP');
  if(keyRow.status!=='active'||!keyRow.expires_at||new Date(keyRow.expires_at).getTime()<=Date.now())return apiError(res,'Key VIP hết hạn hoặc bị khóa');
  const rate=Number((await pool.query(`SELECT COUNT(*) n FROM app_credits WHERE device_hash=$1 AND created_at>=NOW()-INTERVAL '1 hour'`,[hash])).rows[0].n);
  if(rate>=60)return apiError(res,'Đã vượt giới hạn cộng xu trong giờ này');
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const u=(await c.query('SELECT balance,username,email FROM users WHERE id=$1 FOR UPDATE',[keyRow.user_id])).rows[0];
    if(!u){await c.query('ROLLBACK');return apiError(res,'Không tìm thấy tài khoản');}
    const nb=Number(u.balance)+moneyN;
    await c.query('UPDATE users SET balance=$1,updated_at=NOW() WHERE id=$2',[nb,keyRow.user_id]);
    await c.query(`INSERT INTO balance_transactions(user_id,amount,balance_after,type,description) VALUES($1,$2,$3,'admin_topup',$4)`,[keyRow.user_id,moneyN,nb,'App '+(nameTool||'GOLIKE')]);
    await c.query(`INSERT INTO app_credits(user_id,device_hash,name_tool,amount) VALUES($1,$2,$3,$4)`,[keyRow.user_id,hash,nameTool,moneyN]);
    await c.query('COMMIT');
    return res.json({success:true,message:`Đã cộng ${moneyN} xu cho ${nameTool}`,data:{username:u.username||u.email,balance:nb,money:moneyN}});
  }catch(e){await c.query('ROLLBACK').catch(()=>{});return apiError(res,'Không thể cộng xu',500);}
  finally{c.release();}
});

app.all('/api/check-key.php',async(req,res)=>{
  if(!await dbOr503(res))return;
  const secret=String(req.get('X-API-Key')||req.query.api_key||'');
  if(secret!==API_SECRET)return apiError(res,'Unauthorized',401);
  const inb=req.body||{};const key=String(inb.key||inb.key_value||'').trim();const device=String(inb.device_hash||'').trim();
  if(!key||!validDeviceHash(device))return apiError(res,'key và device_hash SHA-256 64 hex là bắt buộc',400);
  const v=await validateVip(key);if(!v.ok)return res.status(v.status==='invalid'?404:403).json({success:false,status:v.status,message:v.message,expires_at:v.vip?.expires_at});
  const known=await pool.query('SELECT id FROM key_devices WHERE key_id=$1 AND device_hash=$2 LIMIT 1',[v.vip.id,device]);
  const count=Number((await pool.query('SELECT COUNT(*) n FROM key_devices WHERE key_id=$1',[v.vip.id])).rows[0].n);
  if(!known.rowCount&&count>=Number(v.vip.device_limit))return res.status(409).json({success:false,status:'device_limit',message:'Key đã đạt giới hạn thiết bị',device_limit:v.vip.device_limit});
  if(known.rowCount)await pool.query('UPDATE key_devices SET last_seen=NOW() WHERE id=$1',[known.rows[0].id]);else await pool.query('INSERT INTO key_devices(key_id,device_hash) VALUES($1,$2)',[v.vip.id,device]);
  return res.json({success:true,status:'active',message:'Key hợp lệ',key:v.vip.key_value,expires_at:v.vip.expires_at,device_limit:v.vip.device_limit});
});

app.all('/checkkey/api/api_golike_fb.php',async(req,res)=>{
  if(!await dbOr503(res))return;
  if(req.method!=='GET')return apiError(res,'Phương thức không hợp lệ',405);
  const action=String(req.query.action||'');const apiKey=String(req.query.APIKey||'').trim();const deviceId=String(req.query.device_id_local||'').trim();
  if(!['get_jobs','complete_job','report_job'].includes(action))return apiError(res,'Action không hợp lệ',400);
  const v=await validateVip(apiKey);if(!v.ok)return apiError(res,v.message);
  if(!deviceId)return apiError(res,'Thiếu device_id_local');
  const hash=deviceHash(deviceId);const bound=await pool.query('SELECT 1 FROM key_devices WHERE key_id=$1 AND device_hash=$2 LIMIT 1',[v.vip.id,hash]);
  if(!bound.rowCount){const b=await bindDevice(v.vip,deviceId);if(!b.ok)return apiError(res,'Key VIP đã đạt giới hạn thiết bị');}
  if(action==='get_jobs'){
    const q=await pool.query(`SELECT j.* FROM fb_jobs j LEFT JOIN job_completions c ON c.platform='facebook' AND c.job_id=j.id AND c.device_hash=$1 WHERE j.status='active' AND j.used_count<j.max_uses AND c.id IS NULL ORDER BY RANDOM() LIMIT 1`,[hash]);
    const j=q.rows[0];if(!j)return apiError(res,'Tạm hết nhiệm vụ');
    return res.json({success:true,message:'OK',data:{id:Number(j.id),job_id:Number(j.id),link:j.link,type:j.type,reaction:j.reaction,object_id:j.object_id,price_per_after_cost:j.price,fix_coin:j.price,coin:j.price}});
  }
  if(action==='complete_job'){
    const jobId=Number(req.query.job_id||0);const objectId=String(req.query.object_id||'').trim();const uid=String(req.query.uid||'').trim();const reaction=String(req.query.reaction||'like');
    if(jobId<=0)return apiError(res,'Thiếu job_id');
    const j=(await pool.query('SELECT * FROM fb_jobs WHERE id=$1 LIMIT 1',[jobId])).rows[0];
    if(!j)return apiError(res,'Không tìm thấy công việc');
    if(j.status!=='active')return apiError(res,'Công việc đã bị khóa');
    const ins=await pool.query(`INSERT INTO job_completions(platform,job_id,device_hash,user_id,amount,status) VALUES('facebook',$1,$2,$3,$4,'done') ON CONFLICT(platform,job_id,device_hash) DO NOTHING`,[jobId,hash,v.vip.user_id,j.price]);
    if(ins.rowCount)await pool.query('UPDATE fb_jobs SET used_count=used_count+1 WHERE id=$1',[jobId]);
    return res.json({success:true,message:'Hoàn thành nhiệm vụ Facebook thành công',data:{job_id:jobId,object_id:objectId||j.object_id,fix_coin:j.price,price_per_after_cost:j.price}});
  }
  const jobId=Number(req.query.job_id||0);const uid=String(req.query.uid||'').trim();const description=String(req.query.description||'').slice(0,255);
  if(jobId<=0)return apiError(res,'Thiếu job_id');
  await pool.query(`INSERT INTO job_reports(platform,job_id,uid,device_hash,description) VALUES('facebook',$1,$2,$3,$4)`,[jobId,uid,hash,description]);
  return res.json({success:true,message:'Đã ghi nhận báo cáo công việc'});
});

app.all('/checkkey/api/api_golike_tiktok.php',async(req,res)=>{
  if(!await dbOr503(res))return;
  if(req.method!=='GET')return apiError(res,'Phương thức không hợp lệ',405);
  if(String(req.query.action||'')!=='complete_job')return apiError(res,'Action không hợp lệ',400);
  const apiKey=String(req.query.APIKey||'').trim();const deviceId=String(req.query.device_id_local||'').trim();const adsId=String(req.query.ads_id||'').trim();const accountId=String(req.query.account_id||'').trim();
  const v=await validateVip(apiKey);if(!v.ok)return apiError(res,v.message);
  if(!adsId)return apiError(res,'Thiếu ads_id');if(!deviceId)return apiError(res,'Thiếu device_id_local');
  const hash=deviceHash(deviceId);const b=await bindDevice(v.vip,deviceId);if(!b.ok)return apiError(res,'Key VIP đã đạt giới hạn thiết bị');
  const j=(await pool.query('SELECT * FROM tiktok_jobs WHERE ads_id=$1 LIMIT 1',[adsId])).rows[0];
  if(j&&j.status!=='active')return apiError(res,'Công việc đã bị khóa');
  const price=j?Number(j.price):20;
  if(j){
    const ins=await pool.query(`INSERT INTO job_completions(platform,job_id,device_hash,user_id,amount,status) VALUES('tiktok',$1,$2,$3,$4,'done') ON CONFLICT(platform,job_id,device_hash) DO NOTHING`,[j.id,hash,v.vip.user_id,price]);
    if(ins.rowCount)await pool.query('UPDATE tiktok_jobs SET used_count=used_count+1 WHERE id=$1',[j.id]);
  }
  return res.json({success:true,message:'Hoàn thành nhiệm vụ TikTok thành công',data:{ads_id:adsId,account_id:accountId,fix_coin:price}});
});

// Catch errors and start
app.use((err,req,res,next)=>{console.error('Unhandled request error:',err);if(!res.headersSent)res.status(500).json({success:false,message:'Lỗi máy chủ'});});

const httpServer=app.listen(PORT,'0.0.0.0',()=>{
  console.log(`BON SHOP running on 0.0.0.0:${PORT}`);
  if (!DATABASE_URL) console.error('DATABASE_URL is not set. Add it in Render Environment.');
  httpServer.keepAliveTimeout=120000;
  httpServer.headersTimeout=125000;
  waitForDatabase().catch(e=>{dbLastError=e.message;console.error('Startup DB loop failed:',e.message);});
});
