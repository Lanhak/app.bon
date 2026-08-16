const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || '35c9ef14-46d1-416e-aa7c-a6df43fcc013';
const BASE_URL = process.env.BASE_URL || 'https://bonshop.onrender.com';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

const SETTINGS = {
  api_secret: '5jaOqjXofEizsYZ8GkHbD5iZmiaNA6RKXuxGuQArRdM',
  admin_email: 'akklanh84@gmail.com',
  admin_password: 'ttht2007',
  prices: { 24: 2000, 720: 50000, 2160: 120000 },
  banks: {
    'Sacombank': { account: '050088931308', name: 'DIEU LANH' },
    'VietinBank': { account: '101886569909', name: 'DIEU LANH' }
  },
  withdraw_min: 10000,
  keyadmin: 'huongdev8386',
  credit_rate_per_hour: 60
};

const nowStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const dateAddHours = (hours, from) => {
  const base = from ? new Date(from.replace(' ', 'T')) : new Date();
  const d = new Date(base.getTime() + hours * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(pw), salt, 10000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  if (!stored || !String(stored).includes(':')) return false;
  const [salt, hash] = String(stored).split(':');
  const test = crypto.pbkdf2Sync(String(pw), salt, 10000, 32, 'sha256').toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genVipKey() {
  let key = '';
  do {
    const parts = [];
    for (let j = 0; j < 4; j++) {
      let x = '';
      for (let i = 0; i < 5; i++) x += KEY_ALPHABET[crypto.randomInt(0, KEY_ALPHABET.length)];
      parts.push(x);
    }
    key = 'VIP-' + parts.join('-');
  } while (findKey(key));
  return key;
}

const SEED_KEYS = [
  { id: 8,  key_value: 'VIP-57FD76456B2342CDB393', user_id: 2, price: 2000, hours: 24, status: 'active', device_limit: 1, note: '', created_at: '2026-08-15 12:58:20', expires_at: '2026-08-16 12:58:20', device_id: '', device_count: 0 },
  { id: 5,  key_value: 'VIP-40FD7A1557884EF6B0BE', user_id: null, price: 0, hours: 72, status: 'active', device_limit: 1, note: 'backup test vD', created_at: '2026-08-15 11:11:54', expires_at: '2026-08-18 11:11:54', device_id: 'TESTNOW', device_count: 1 },
  { id: 3,  key_value: 'VIP-561318E0620B413DA84A', user_id: 2, price: 2000, hours: 24, status: 'active', device_limit: 1, note: '', created_at: '2026-08-15 09:00:03', expires_at: '2026-08-16 09:00:03', device_id: '', device_count: 0 },
  { id: 2,  key_value: 'VIP-0ED943CC14FD48B1AB42', user_id: 2, price: 2000, hours: 24, status: 'active', device_limit: 1, note: '', created_at: '2026-08-14 13:04:10', expires_at: '2026-08-15 13:04:10', device_id: 'TESTNOW', device_count: 1 },
  { id: 1,  key_value: 'VIP-TEST-001', user_id: null, price: 0, hours: 24, status: 'active', device_limit: 1, note: '', created_at: '2026-08-14 05:38:39', expires_at: '2026-08-15 05:38:39', device_id: '', device_count: 0 }
];

const SEED_USERS = [
  { id: 1, username: 'testuser01', email: 'testuser01@gmail.com', role: 'user', balance: 0, password_hash: hashPassword('bon2026'), created_at: '2026-08-14 05:30:00' },
  { id: 2, username: 'lanhak', email: 'trangak2k71@gmail.com', role: 'user', balance: 94000, password_hash: hashPassword('bon2026'), created_at: '2026-08-14 05:35:00' },
  { id: 3, username: 'akklanh84', email: 'akklanh84@gmail.com', role: 'admin', balance: 0, password_hash: hashPassword('ttht2007'), created_at: '2026-08-14 05:40:00' }
];

const SEED_ANNOUNCEMENT = {
  status: 'success',
  is_show: true,
  id: 'BON_NEWS_2026_08_15',
  title: '\u{1F389} TH\u00D4NG B\u00C1O',
  message: 'Ch\u00E0o m\u1EEBng b\u1EA1n \u0111\u1EBFn v\u1EDBi BON SHOP! H\u00E3y nh\u1EADp Key VIP \u0111\u1EC3 s\u1EED d\u1EE5ng c\u00F4ng c\u1EE5 m\u1ED9t c\u00E1ch m\u01B0\u1EE3t m\u00E0 nh\u00E9.',
  download_url: '',
  force_update: false,
  version_code: 10,
  version_name: '10.0'
};

function freshState() {
  return {
    keys: SEED_KEYS.map((k) => Object.assign({}, k)),
    users: SEED_USERS.map((u) => Object.assign({}, u)),
    fb_jobs: [],
    tiktok_jobs: [],
    history: [],
    wallet_requests: [],
    transactions: [],
    devices: [],
    completions: [],
    reports: [],
    credits: [],
    announcement: JSON.parse(JSON.stringify(SEED_ANNOUNCEMENT)),
    key_seq: 100,
    job_seq: 100,
    user_seq: 100,
    wallet_seq: 100,
    tx_seq: 100,
    device_seq: 100,
    completion_seq: 100,
    report_seq: 100,
    credit_seq: 100
  };
}

function migrateState(s) {
  if (!s.users) s.users = SEED_USERS.map((u) => Object.assign({}, u));
  if (!s.wallet_requests) s.wallet_requests = [];
  if (!s.transactions) s.transactions = [];
  if (!s.devices) s.devices = [];
  if (!s.completions) s.completions = [];
  if (!s.reports) s.reports = [];
  if (!s.credits) s.credits = [];
  if (!s.key_seq) s.key_seq = 100;
  if (!s.job_seq) s.job_seq = 100;
  if (!s.user_seq) s.user_seq = 100;
  if (!s.wallet_seq) s.wallet_seq = 100;
  if (!s.tx_seq) s.tx_seq = 100;
  if (!s.device_seq) s.device_seq = 100;
  if (!s.completion_seq) s.completion_seq = 100;
  if (!s.report_seq) s.report_seq = 100;
  if (!s.credit_seq) s.credit_seq = 100;
  return s;
}

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (parsed && Array.isArray(parsed.keys)) return migrateState(parsed);
    }
  } catch (e) {}
  return freshState();
}

// ---- Lưu dữ liệu lâu dài bằng PostgreSQL (Neon SQL over HTTP, không cần cài thêm dependency) ----
// Set env DATABASE_URL = connection string Neon (postgresql://...) để dữ liệu không mất khi Render restart.
// Nếu không có DATABASE_URL, server tự động dùng file data.json (ổ đĩa tạm — dữ liệu sẽ mất khi restart).
const DATABASE_URL = process.env.DATABASE_URL || '';
function dbEndpoint(connString) {
  if (!connString) return '';
  let rest = String(connString).replace(/^[a-z]+:\/\//i, '');
  const at = rest.lastIndexOf('@');
  if (at === -1) return '';
  rest = rest.slice(at + 1);
  const slash = rest.indexOf('/');
  if (slash !== -1) rest = rest.slice(0, slash);
  return 'https://' + rest;
}
const DB_HOST = dbEndpoint(DATABASE_URL);
let dbReady = false;
let dbRetryTimer = null;
let dbQueue = Promise.resolve();

async function dbQuery(query, params) {
  const res = await fetch(DB_HOST + '/sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': DATABASE_URL
    },
    body: JSON.stringify({ query: query, params: params || [] })
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const detail = (data.error && (data.error.message || JSON.stringify(data.error))) || JSON.stringify(data);
    throw new Error('Postgres: ' + detail);
  }
  return data;
}

async function dbEnsureTable() {
  await dbQuery('CREATE TABLE IF NOT EXISTS bon_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
}

async function dbLoad() {
  const r = await dbQuery('SELECT data FROM bon_state WHERE id = 1');
  if (r.rows && r.rows.length && r.rows[0] && r.rows[0].data) return r.rows[0].data;
  return null;
}

async function dbSave() {
  await dbQuery(
    'INSERT INTO bon_state (id, data, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
    [JSON.stringify(state)]
  );
}

async function initDatabase() {
  await dbEnsureTable();
  const loaded = await dbLoad();
  if (loaded && Array.isArray(loaded.keys) && !localDirty) {
    state = migrateState(loaded);
  } else {
    await dbSave();
    localDirty = false;
  }
  dbReady = true;
}

function startDatabaseRetry() {
  if (dbRetryTimer || !DB_HOST) return;
  dbRetryTimer = setInterval(() => {
    initDatabase()
      .then(() => {
        clearInterval(dbRetryTimer);
        dbRetryTimer = null;
        console.log('PostgreSQL đã kết nối — dữ liệu đã đồng bộ.');
      })
      .catch(() => {});
  }, 30000);
}

let state = loadState();
let localDirty = false;
let saveTimer = null;

function flushFile() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (e) {}
}

function save() {
  localDirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flushFile();
    if (DB_HOST && dbReady) {
      dbQueue = dbQueue
        .then(() => dbSave())
        .catch((e) => {
          console.error('Lưu PostgreSQL lỗi (chuyển về file tạm):', e.message);
          dbReady = false;
          startDatabaseRetry();
        });
    }
  }, 400);
}

function json(res, obj, status) {
  const body = JSON.stringify(obj);
  res.writeHead(status || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-BON-SECRET, X-Api-Key',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function html(res, body, status) {
  res.writeHead(status || 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function redirect(res, url) {
  res.writeHead(302, { Location: url });
  res.end();
}

const SESSION_COOKIE = 'bon_session';
const sessions = new Map();

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function getSession(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token && sessions.has(token)) {
    const s = sessions.get(token);
    s.expires = Date.now() + 7 * 86400 * 1000;
    return s;
  }
  const ns = { token: crypto.randomBytes(24).toString('hex'), role: null, uid: null, username: '', email: '', flash: '', expires: Date.now() + 7 * 86400 * 1000 };
  sessions.set(ns.token, ns);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${ns.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`);
  return ns;
}

function flash(s, msg) { s.flash = msg; }
function takeFlash(s) { const m = s.flash; s.flash = ''; return m; }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (ct.includes('application/json')) {
        try { return resolve(JSON.parse(data)); } catch (e) { return resolve({}); }
      }
      if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart')) {
        try { return resolve(Object.fromEntries(new URLSearchParams(data))); } catch (e) { return resolve({}); }
      }
      try { return resolve(JSON.parse(data)); } catch (e) { return resolve(Object.fromEntries(new URLSearchParams(data))); }
    });
    req.on('error', reject);
  });
}

function findKey(value) {
  if (!value) return null;
  return state.keys.find((k) => k.key_value && k.key_value.toUpperCase() === String(value).trim().toUpperCase()) || null;
}

function findUserById(id) {
  return state.users.find((u) => Number(u.id) === Number(id)) || null;
}

function findUserByLogin(login) {
  const l = String(login).trim();
  return state.users.find((u) => String(u.email).toLowerCase() === l.toLowerCase() || String(u.username).toLowerCase() === l.toLowerCase()) || null;
}

function keyInfo(key) {
  return {
    status: 'success',
    msg: 'X\u00E1c th\u1EF1c Server th\u00E0nh c\u00F4ng: Key VIP h\u1EE3p l\u1EC7!',
    key: key.key_value,
    api_key: key.key_value,
    create_date: key.created_at,
    end_date: key.expires_at,
    device_ID: key.device_id || '',
    device_id: key.device_id || '',
    vip: true,
    success: true,
    price: key.price,
    hours: key.hours,
    duration_hours: key.hours,
    note: key.note || ''
  };
}

function keyError(msg) {
  return { status: 'error', msg: msg };
}

function validateKey(value) {
  const key = findKey(value);
  if (!key) return { ok: false, code: 'KEY_NOT_FOUND', msg: 'APIKey kh\u00F4ng t\u1ED3n t\u1EA1i trong h\u1EC7 th\u1ED1ng!' };
  if (key.status !== 'active') return { ok: false, code: 'KEY_DISABLED', msg: 'Key \u0111\u00E3 b\u1ECB kh\u00F3a!' };
  if (key.expires_at && key.expires_at < nowStr()) return { ok: false, code: 'KEY_EXPIRED', msg: 'Key \u0111\u00E3 h\u1EBFt h\u1EA1n s\u1EED d\u1EE5ng! Vui l\u00F2ng gia h\u1EA1n.' };
  return { ok: true, code: 'OK', msg: 'Key VIP h\u1EE3p l\u1EC7!', key: key };
}

function recordDevice(keyId, deviceId) {
  if (!keyId || !deviceId) return;
  const h = sha256(deviceId);
  let dev = state.devices.find((d) => d.key_id === keyId && d.device_hash === h);
  if (dev) {
    dev.last_seen = nowStr();
  } else {
    state.devices.push({ id: state.device_seq++, key_id: keyId, device_hash: h, device_id: deviceId, first_seen: nowStr(), last_seen: nowStr() });
  }
}

function applyDeviceBinding(key, deviceId) {
  if (!deviceId) return { ok: true };
  if (key.device_id) {
    if (key.device_id !== deviceId) return { ok: false, msg: 'Key n\u00E0y \u0111\u00E3 \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng tr\u00EAn thi\u1EBFt b\u1ECB kh\u00E1c!' };
    recordDevice(key.id, deviceId);
    return { ok: true };
  }
  key.device_id = deviceId;
  key.device_count = (key.device_count || 0) + 1;
  recordDevice(key.id, deviceId);
  save();
  return { ok: true };
}

function addTransaction(userId, amount, balanceAfter, type, description) {
  state.transactions.push({
    id: state.tx_seq++,
    user_id: userId,
    amount: amount,
    balance_after: balanceAfter,
    type: type,
    description: description || '',
    created_at: nowStr()
  });
}

function userByDeviceHash(deviceHash) {
  const dev = state.devices.find((d) => d.device_hash === deviceHash);
  if (!dev) return null;
  const key = state.keys.find((k) => k.id === dev.key_id);
  if (!key || !key.user_id) return null;
  if (key.status !== 'active' || (key.expires_at && key.expires_at < nowStr())) return null;
  return { key, device: dev, user: findUserById(key.user_id) };
}

const PLATFORMS = ['fb', 'tiktok'];

function jobsOf(platform) {
  return platform === 'tiktok' ? state.tiktok_jobs : state.fb_jobs;
}

function findJob(platform, id) {
  const jobs = jobsOf(platform);
  if (id === undefined || id === null) return null;
  return jobs.find((j) => String(j.id) === String(id)) || null;
}

function findTikJobByAds(adsId) {
  if (!adsId) return null;
  return state.tiktok_jobs.find((j) => String(j.ads_id) === String(adsId)) || null;
}

function recordCompletion(platform, jobId, deviceHash, userId, amount) {
  const dup = state.completions.find((c) => c.platform === platform && String(c.job_id) === String(jobId) && c.device_hash === deviceHash);
  if (dup) return false;
  state.completions.push({
    id: state.completion_seq++,
    platform: platform,
    job_id: jobId,
    device_hash: deviceHash,
    user_id: userId || null,
    amount: amount || 0,
    status: 'done',
    created_at: nowStr()
  });
  return true;
}

function recordReport(platform, jobId, uid, deviceHash, description) {
  state.reports.push({
    id: state.report_seq++,
    platform: platform,
    job_id: jobId || 0,
    uid: uid || '',
    device_hash: deviceHash || '',
    description: description || '',
    created_at: nowStr()
  });
}

function jobPublic(job) {
  return {
    id: job.id,
    job_id: job.job_id || job.id,
    link: job.link || '',
    object_id: job.object_id || '',
    type: job.type || '',
    reaction: job.reaction || '',
    fix_coin: job.fix_coin || 0,
    price_per_after_cost: job.price_per_after_cost || job.fix_coin || 0,
    price: job.price || job.fix_coin || 0,
    max_uses: job.max_uses || 0,
    uses: job.uses || job.used_count || 0,
    used_count: job.used_count || job.uses || 0,
    status: job.status || 'active'
  };
}

const ADMIN = 'X-BON-SECRET';

async function handle(req, res) {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = u.pathname;
  const q = u.searchParams;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-BON-SECRET, X-Api-Key'
    });
    return res.end();
  }

  if (pathname === '/health') return json(res, { status: 'ok', time: nowStr() });

  if (pathname === '/checkkey/api/key.php' || pathname === '/checkkey/api/checkkey.php') {
    const apiKey = q.get('APIKey') || q.get('key') || q.get('api_key');
    if (!apiKey) return json(res, keyError('Vui l\u00F2ng cung c\u1EA5p APIKey!'));
    const v = validateKey(apiKey);
    if (!v.ok) return json(res, keyError(v.msg));
    const deviceId = q.get('device_id') || q.get('deviceId') || '';
    const bind = applyDeviceBinding(v.key, deviceId);
    if (!bind.ok) return json(res, keyError(bind.msg));
    return json(res, keyInfo(v.key));
  }

  if (pathname === '/checkkey/api/check_date_key.php') {
    const apiKey = q.get('APIKey') || q.get('key');
    if (!apiKey) return json(res, keyError('Vui l\u00F2ng cung c\u1EA5p APIKey!'));
    const v = validateKey(apiKey);
    if (!v.ok) return json(res, keyError(v.msg));
    const deviceId = q.get('device_id_local') || q.get('device_id') || '';
    const bind = applyDeviceBinding(v.key, deviceId);
    if (!bind.ok) return json(res, keyError(bind.msg));
    return json(res, keyInfo(v.key));
  }

  if (pathname === '/checkkey/api/announcement.json' || pathname === '/checkkey/api/announcement') {
    return json(res, state.announcement);
  }

  if (pathname === '/checkkey/api/api_golike_fb.php') {
    return handleGolike(req, res, q, 'fb');
  }

  if (pathname === '/checkkey/api/api_golike_tiktok.php') {
    return handleGolike(req, res, q, 'tiktok');
  }

  if (pathname === '/api/check-key.php' || pathname === '/api/check_key.php') {
    const apiKey = q.get('APIKey') || q.get('key') || q.get('api_key');
    if (!apiKey) return json(res, keyError('Vui l\u00F2ng cung c\u1EA5p APIKey!'));
    const v = validateKey(apiKey);
    if (!v.ok) return json(res, { success: false, code: v.code, message: v.msg });
    return json(res, Object.assign({ success: true }, keyInfo(v.key)));
  }

  if (pathname === '/checkkey/' || pathname === '/checkkey' || pathname === '/checkkey/api') {
    if (method === 'POST') return handleCheckkeyPost(req, res, q);
    return json(res, { status: 'success', msg: 'BON SHOP API' });
  }

  if (pathname === '/statistics') return html(res, statisticsPage());
  if (pathname === '/Key_Free' || pathname === '/Key_Free/') return html(res, keyFreePage(q.get('key')));

  if (pathname.startsWith('/v1/admin')) return handleAdmin(req, res, pathname, q);

  if (pathname === '/admin') {
    if (method === 'POST') return handleWebForm(req, res, q, true);
    return redirect(res, '/?admin=1');
  }

  if (pathname === '/logout') {
    const s = getSession(req, res);
    s.role = null; s.uid = null; s.username = ''; s.email = '';
    return redirect(res, '/');
  }

  if (pathname === '/') {
    if (method === 'POST') return handleWebForm(req, res, q, q.get('admin') === '1');
    const s = getSession(req, res);
    const msg = takeFlash(s);
    if (s.role === 'admin') return html(res, adminPage(s, msg));
    if (s.role === 'user') return html(res, userPage(s, msg));
    return html(res, authPage(q.get('admin') === '1', msg));
  }

  return json(res, { status: 'error', msg: '404 Not Found' }, 404);
}

async function handleCheckkeyPost(req, res, q) {
  const body = await readBody(req);
  const action = body.action || q.get('action') || '';
  if (action === 'addHistory') {
    state.history.push({
      id: state.history.length + 1,
      name_tool: body.name_tool || 'BON_TOOL',
      keyadmin: body.keyadmin || '',
      device_id: body.device_id || body.deviceID || '',
      money: body.money || 0,
      time: nowStr()
    });

    const keyadmin = body.keyadmin || '';
    const deviceId = String(body.device_id || body.deviceID || '').trim();
    const money = Math.max(0, parseInt(body.money, 10) || 0);

    let credited = false;
    if (keyadmin === SETTINGS.keyadmin && deviceId && money > 0) {
      const hash = sha256(deviceId);
      const owner = userByDeviceHash(hash);
      if (owner && owner.user) {
        const hourAgo = Date.now() - 3600 * 1000;
        const recent = state.credits.filter((c) => c.device_hash === hash && new Date(c.created_at.replace(' ', 'T')).getTime() >= hourAgo).length;
        if (recent < SETTINGS.credit_rate_per_hour && money <= 100000) {
          const oldBal = owner.user.balance;
          const newBal = oldBal + money;
          owner.user.balance = newBal;
          addTransaction(owner.user.id, money, newBal, 'admin_topup', 'App ' + (body.name_tool || 'GOLIKE'));
          state.credits.push({ id: state.credit_seq++, user_id: owner.user.id, device_hash: hash, name_tool: body.name_tool || '', amount: money, created_at: nowStr() });
          credited = true;
        }
      }
    }

    save();
    const resp = { status: 'success', msg: 'Th\u00EAm th\u00E0nh c\u00F4ng' };
    if (credited) {
      const owner = userByDeviceHash(sha256(deviceId));
      resp.success = true;
      resp.data = {
        username: owner && owner.user ? (owner.user.username || owner.user.email || '') : '',
        balance: owner && owner.user ? owner.user.balance : 0,
        money: money
      };
    }
    return json(res, resp);
  }
  return json(res, { status: 'error', msg: 'H\u00E0nh \u0111\u1ED9ng kh\u00F4ng h\u1EE3p l\u1EC7!' });
}

function handleGolike(req, res, q, platform) {
  const action = q.get('action') || '';
  const apiKey = q.get('APIKey') || q.get('key');
  const v = validateKey(apiKey);
  if (!v.ok) {
    const msg = platform === 'fb' ? 'Vui l\u00F2ng k\u00EDch ho\u1EA1t Key Vip \u0111\u1EC3 nh\u1EADn Job gi\u00E1 cao!' : 'APIKey kh\u00F4ng t\u1ED3n t\u1EA1i trong h\u1EC7 th\u1ED1ng!';
    return json(res, { success: false, message: msg, code: v.code });
  }

  const jobs = jobsOf(platform);
  const deviceHash = q.get('device_id_local') ? sha256(q.get('device_id_local')) : '';

  if (action === 'get_jobs') {
    const available = jobs.filter((j) => j.status === 'active' && (!j.max_uses || (j.uses || j.used_count || 0) < j.max_uses)).slice(0, 50);
    return json(res, { success: true, status: 'success', count: available.length, data: available.map(jobPublic) });
  }

  if (action === 'complete_job') {
    if (platform === 'tiktok') {
      const adsId = q.get('ads_id') || '';
      const ttJob = findTikJobByAds(adsId);
      if (ttJob) {
        ttJob.uses = (ttJob.uses || ttJob.used_count || 0) + 1;
        ttJob.used_count = ttJob.uses;
        recordCompletion('tiktok', adsId, deviceHash, v.key.user_id || null, ttJob.price || ttJob.fix_coin || 0);
      } else {
        recordCompletion('tiktok', adsId || q.get('job_id') || '0', deviceHash, v.key.user_id || null, 0);
      }
      save();
      return json(res, { success: true, status: 'success', message: 'Ho\u00E0n th\u00E0nh Job th\u00E0nh c\u00F4ng!', code: 'OK' });
    }
    let job = findJob(platform, q.get('job_id')) || findJob(platform, q.get('object_id')) || null;
    if (!job) return json(res, { success: false, message: 'Job kh\u00F4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\u00E3 h\u1EBFt!', code: 'JOB_NOT_FOUND' });
    job.uses = (job.uses || job.used_count || 0) + 1;
    job.used_count = job.uses;
    recordCompletion('facebook', job.id, deviceHash, v.key.user_id || null, job.fix_coin || job.price || 0);
    save();
    return json(res, {
      success: true,
      status: 'success',
      message: 'Ho\u00E0n th\u00E0nh Job th\u00E0nh c\u00F4ng!',
      fix_coin: job.fix_coin || 0,
      price: job.fix_coin || 0,
      job_id: job.id,
      data: jobPublic(job)
    });
  }

  if (action === 'report_job') {
    recordReport(platform, q.get('job_id') || '0', q.get('uid') || '', deviceHash, q.get('description') || '');
    save();
    return json(res, { success: true, status: 'success', message: '\u0110\u00E3 ghi nh\u1EADn b\u00E1o c\u00E1o Job!', code: 'OK' });
  }

  return json(res, { success: false, message: 'H\u00E0nh \u0111\u1ED9ng kh\u00F4ng h\u1EE3p l\u1EC7!', code: 'BAD_ACTION' });
}

async function handleAdmin(req, res, pathname, q) {
  const secret = req.headers['x-bon-secret'];
  if (secret !== ADMIN_SECRET) return json(res, { success: false, code: 'UNAUTHORIZED', message: 'Kh\u00F4ng \u0111\u01B0\u1EE3c ph\u00E9p!' }, 401);

  const pendingWallet = state.wallet_requests.filter((r) => r.status === 'pending').length;

  if (pathname === '/v1/admin/summary' || pathname === '/v1/admin/dashboard') {
    const obj = {
      success: true,
      users: state.users.length,
      keys: state.keys.length,
      pending_wallet: pendingWallet,
      jobs: state.fb_jobs.length + state.tiktok_jobs.length,
      stats: { users: state.users.length, keys: state.keys.length, pending_wallet: pendingWallet, jobs: state.fb_jobs.length + state.tiktok_jobs.length },
      dashboard: { users: state.users.length, keys: state.keys.length, pending_wallet: pendingWallet, jobs: state.fb_jobs.length + state.tiktok_jobs.length }
    };
    return json(res, obj);
  }

  if (pathname === '/v1/admin/users') {
    const users = state.users.map((u) => ({ id: u.id, username: u.username || '', email: u.email || '', role: u.role, balance: u.balance, status: 'active', created_at: u.created_at || '' }));
    return json(res, { success: true, users: users });
  }

  if (pathname === '/v1/admin/keys') return json(res, { success: true, keys: state.keys });

  if (pathname === '/v1/admin/keys/create') {
    if (req.method !== 'POST') return json(res, { success: false, message: 'Method not allowed' }, 405);
    const body = await readBody(req);
    const keyValue = (body.key || body.key_value || '').trim().toUpperCase() || genVipKey();
    const hours = Number(body.hours) || 24;
    const key = {
      id: state.key_seq++,
      key_value: keyValue,
      user_id: body.user_id ? Number(body.user_id) : null,
      price: Number(body.price) || 0,
      hours: hours,
      status: body.status || 'active',
      device_limit: Number(body.device_limit) || 1,
      note: body.note || '',
      created_at: nowStr(),
      expires_at: body.expires_at || dateAddHours(hours),
      device_id: body.device_id || '',
      device_count: 0
    };
    state.keys.push(key);
    save();
    return json(res, { success: true, message: 'T\u1EA1o key th\u00E0nh c\u00F4ng!', key: key });
  }

  if (pathname === '/v1/admin/keys/action') {
    if (req.method !== 'POST') return json(res, { success: false, message: 'Method not allowed' }, 405);
    const body = await readBody(req);
    const key = findKey(body.key || body.key_value) || state.keys.find((k) => Number(k.id) === Number(body.id)) || null;
    if (!key) return json(res, { success: false, message: 'Key kh\u00F4ng t\u1ED3n t\u1EA1i!' });
    const action = body.action || '';
    if (action === 'enable') key.status = 'active';
    else if (action === 'disable') key.status = 'disabled';
    else if (action === 'reset') { key.device_id = ''; key.device_count = 0; key.status = 'active'; state.devices = state.devices.filter((d) => d.key_id !== key.id); }
    else if (action === 'delete') { state.keys = state.keys.filter((k) => k.id !== key.id); state.devices = state.devices.filter((d) => d.key_id !== key.id); }
    else if (action === 'extend') {
      const base = key.expires_at && key.expires_at > nowStr() ? key.expires_at : nowStr();
      key.expires_at = dateAddHours(Number(body.hours) || 24, base);
      key.status = 'active';
    }
    else return json(res, { success: false, message: 'H\u00E0nh \u0111\u1ED9ng kh\u00F4ng h\u1EE3p l\u1EC7!' });
    save();
    return json(res, { success: true, message: '\u0110\u00E3 x\u1EED l\u00FD!' });
  }

  if (pathname === '/v1/admin/jobs') {
    return json(res, { success: true, fb: state.fb_jobs, tiktok: state.tiktok_jobs });
  }

  if (pathname === '/v1/admin/jobs/create') {
    if (req.method !== 'POST') return json(res, { success: false, message: 'Method not allowed' }, 405);
    const body = await readBody(req);
    const platform = body.platform === 'tiktok' ? 'tiktok' : 'fb';
    const job = {
      id: state.job_seq++,
      job_id: body.job_id || String(state.job_seq - 1),
      link: body.link || body.video_url || '',
      object_id: body.object_id || '',
      ads_id: body.ads_id || '',
      account_id: body.account_id || '',
      type: body.type || (platform === 'fb' ? 'like' : 'follow'),
      reaction: body.reaction || 'like',
      fix_coin: Number(body.fix_coin) || Number(body.price) || 0,
      price_per_after_cost: Number(body.price_per_after_cost) || Number(body.price) || Number(body.fix_coin) || 0,
      price: Number(body.price) || Number(body.fix_coin) || 0,
      max_uses: Number(body.max_uses) || 0,
      uses: 0,
      used_count: 0,
      status: body.status || 'active',
      created_at: nowStr()
    };
    if (platform === 'tiktok') state.tiktok_jobs.push(job); else state.fb_jobs.push(job);
    save();
    return json(res, { success: true, message: 'T\u1EA1o Job th\u00E0nh c\u00F4ng!', job: job });
  }

  if (pathname === '/v1/admin/jobs/action') {
    if (req.method !== 'POST') return json(res, { success: false, message: 'Method not allowed' }, 405);
    const body = await readBody(req);
    const platform = body.platform === 'tiktok' ? 'tiktok' : 'fb';
    const arr = platform === 'tiktok' ? state.tiktok_jobs : state.fb_jobs;
    const job = arr.find((j) => String(j.id) === String(body.id));
    if (!job) return json(res, { success: false, message: 'Job kh\u00F4ng t\u1ED3n t\u1EA1i!' });
    const action = body.action || '';
    if (action === 'enable') job.status = 'active';
    else if (action === 'disable') job.status = 'disabled';
    else if (action === 'reset') { job.uses = 0; job.used_count = 0; job.status = 'active'; }
    else if (action === 'delete') { if (platform === 'tiktok') state.tiktok_jobs = state.tiktok_jobs.filter((j) => j.id !== job.id); else state.fb_jobs = state.fb_jobs.filter((j) => j.id !== job.id); }
    else return json(res, { success: false, message: 'H\u00E0nh \u0111\u1ED9ng kh\u00F4ng h\u1EE3p l\u1EC7!' });
    save();
    return json(res, { success: true, message: '\u0110\u00E3 x\u1EED l\u00FD!' });
  }

  if (pathname === '/v1/admin/history') {
    return json(res, { success: true, history: state.history });
  }

  if (pathname === '/v1/admin/completions') {
    return json(res, { success: true, completions: state.completions });
  }

  if (pathname === '/v1/admin/reports') {
    return json(res, { success: true, reports: state.reports });
  }

  if (pathname === '/v1/admin/wallet') {
    return json(res, { success: true, wallet: state.wallet_requests });
  }

  if (pathname === '/v1/admin/transactions') {
    return json(res, { success: true, transactions: state.transactions });
  }

  return json(res, { success: false, status: 'not_found', message: 'Endpoint kh\u00F4ng t\u1ED3n t\u1EA1i.' }, 404);
}

async function handleWebForm(req, res, q, adminLogin) {
  const body = await readBody(req);
  const s = getSession(req, res);

  if (body.register !== undefined) {
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const pw = String(body.pass || '');
    if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) flash(s, 'Username 3-30 k\u00FD t\u1EF1, ch\u1EC9 g\u1ED3m ch\u1EEF, s\u1ED1 v\u00E0 d\u1EA5u _.');
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pw.length < 6) flash(s, 'Gmail/Email ho\u1EB7c m\u1EADt kh\u1EA9u kh\u00F4ng h\u1EE3p l\u1EC7.');
    else if (findUserByLogin(username) || findUserByLogin(email)) flash(s, 'Username ho\u1EB7c email \u0111\u00E3 t\u1ED3n t\u1EA1i.');
    else {
      state.users.push({
        id: state.user_seq++,
        username: username,
        email: email,
        role: 'user',
        balance: 0,
        password_hash: hashPassword(pw),
        created_at: nowStr()
      });
      save();
      flash(s, '\u0110\u0103ng k\u00FD th\u00E0nh c\u00F4ng, h\u00E3y \u0111\u0103ng nh\u1EADp.');
    }
    return redirect(res, adminLogin ? '/?admin=1' : '/');
  }

  if (body.login !== undefined) {
    const login = String(body.login_id || '').trim();
    const pw = String(body.pass || '');
    const isAdminEmail = login.toLowerCase() === SETTINGS.admin_email.toLowerCase();
    if (isAdminEmail && pw === SETTINGS.admin_password) {
      s.role = 'admin'; s.uid = 0; s.username = 'akklanh84'; s.email = SETTINGS.admin_email;
    } else {
      const u = findUserByLogin(login);
      if (u && verifyPassword(pw, u.password_hash)) {
        s.role = u.role || 'user'; s.uid = u.id; s.username = u.username || ''; s.email = u.email;
      } else {
        flash(s, 'Sai username/email ho\u1EB7c m\u1EADt kh\u1EA9u.');
        return redirect(res, adminLogin ? '/?admin=1' : '/');
      }
    }
    return redirect(res, s.role === 'admin' ? '/' : '/');
  }

  const isUser = s.role === 'user';
  const isAdmin = s.role === 'admin';
  const uid = Number(s.uid);
  const user = isUser ? findUserById(uid) : null;

  if (isUser && user) {
    if (body.deposit_request !== undefined) {
      const bank = String(body.bank || '');
      const amount = parseInt(body.amount, 10) || 0;
      const note = String(body.note || '').trim();
      if (!SETTINGS.banks[bank] || amount < 1000) flash(s, 'Vui l\u00F2ng ch\u1ECDn ng\u00E2n h\u00E0ng v\u00E0 nh\u1EADp s\u1ED1 ti\u1EC1n h\u1EE3p l\u1EC7.');
      else {
        state.wallet_requests.push({ id: state.wallet_seq++, user_id: user.id, request_type: 'deposit', amount: amount, bank_name: bank, account_number: '', account_name: '', note: note, status: 'pending', admin_note: '', created_at: nowStr(), processed_at: null });
        save();
        flash(s, '\u0110\u00E3 g\u1EEDi y\u00EAu c\u1EA7u n\u1EA1p ti\u1EC1n. Chuy\u1EC3n kho\u1EA3n \u0111\u00FAng ng\u00E2n h\u00E0ng v\u00E0 ghi ch\u00FA, sau \u0111\u00F3 ch\u1EDD admin duy\u1EC7t.');
      }
    } else if (body.withdraw_request !== undefined) {
      const bank = String(body.bank || '');
      const acc = String(body.account_number || '').trim();
      const name = String(body.account_name || '').trim();
      const amount = parseInt(body.amount, 10) || 0;
      if (!SETTINGS.banks[bank] || !acc || !name || amount < SETTINGS.withdraw_min) flash(s, 'R\u00FAt t\u1ED1i thi\u1EC3u ' + money(SETTINGS.withdraw_min) + ' v\u00E0 ph\u1EA3i nh\u1EADp \u0111\u1EE7 ng\u00E2n h\u00E0ng, STK, t\u00EAn t\u00E0i kho\u1EA3n.');
      else if (user.balance < amount) flash(s, 'S\u1ED1 d\u01B0 kh\u00F4ng \u0111\u1EE7.');
      else {
        user.balance -= amount;
        state.wallet_requests.push({ id: state.wallet_seq++, user_id: user.id, request_type: 'withdraw', amount: amount, bank_name: bank, account_number: acc, account_name: name, note: '', status: 'pending', admin_note: '', created_at: nowStr(), processed_at: null });
        addTransaction(user.id, -amount, user.balance, 'admin_adjust', 'Y\u00EAu c\u1EA7u r\u00FAt ti\u1EC1n');
        save();
        flash(s, '\u0110\u00E3 g\u1EEDi y\u00EAu c\u1EA7u r\u00FAt ti\u1EC1n. S\u1ED1 d\u01B0 \u0111\u00E3 gi\u1EEF l\u1EA1i v\u00E0 s\u1EBD ho\u00E0n khi admin t\u1EEB ch\u1ED1i.');
      }
    } else if (body.buy !== undefined) {
      const hours = parseInt(body.hours, 10) || 0;
      const price = SETTINGS.prices[hours];
      if (!price) flash(s, 'G\u00F3i kh\u00F4ng h\u1EE3p l\u1EC7.');
      else if (user.balance < price) flash(s, 'S\u1ED1 d\u01B0 kh\u00F4ng \u0111\u1EE7.');
      else {
        const keyValue = genVipKey();
        const exp = dateAddHours(hours);
        user.balance -= price;
        state.keys.push({ id: state.key_seq++, key_value: keyValue, user_id: user.id, price: price, hours: hours, status: 'active', device_limit: 1, note: 'Mua t\u1EEB website', created_at: nowStr(), expires_at: exp, device_id: '', device_count: 0 });
        addTransaction(user.id, -price, user.balance, 'purchase', 'Mua Key VIP');
        save();
        flash(s, 'Mua th\u00E0nh c\u00F4ng: ' + keyValue);
      }
    }
  }

  if (isAdmin) {
    if (body.topup !== undefined || body.deduct !== undefined) {
      const uid2 = parseInt(body.uid, 10) || 0;
      const amount = parseInt(body.amount, 10) || 0;
      const isDeduct = body.deduct !== undefined;
      const target = findUserById(uid2);
      if (!target) flash(s, 'Kh\u00F4ng t\u00ECm th\u1EA5y user.');
      else if (amount <= 0) flash(s, 'S\u1ED1 ti\u1EC1n ph\u1EA3i l\u1EDBn h\u01A1n 0.');
      else if (isDeduct && target.balance < amount) flash(s, 'Kh\u00F4ng th\u1EC3 tr\u1EEB: s\u1ED1 d\u01B0 user kh\u00F4ng \u0111\u1EE7.');
      else {
        const oldB = target.balance;
        const newB = isDeduct ? oldB - amount : oldB + amount;
        target.balance = newB;
        addTransaction(target.id, isDeduct ? -amount : amount, newB, isDeduct ? 'admin_adjust' : 'admin_topup', isDeduct ? 'Admin tr\u1EEB s\u1ED1 d\u01B0' : 'Admin c\u1ED9ng s\u1ED1 d\u01B0');
        save();
        flash(s, isDeduct ? '\u0110\u00E3 tr\u1EEB s\u1ED1 d\u01B0 user.' : '\u0110\u00E3 c\u1ED9ng s\u1ED1 d\u01B0.');
      }
    }
    if (body.wallet_action !== undefined) {
      const rid = parseInt(body.rid, 10) || 0;
      const action = String(body.wallet_action);
      const r = state.wallet_requests.find((x) => x.id === rid);
      if (!r || r.status !== 'pending') flash(s, 'Y\u00EAu c\u1EA7u kh\u00F4ng c\u00F2n ch\u1EDD x\u1EED l\u00FD.');
      else if (action === 'approve') {
        r.status = 'approved'; r.processed_at = nowStr();
        if (r.request_type === 'deposit') {
          const u = findUserById(r.user_id);
          if (u) { const newB = u.balance + r.amount; u.balance = newB; addTransaction(u.id, r.amount, newB, 'admin_topup', 'N\u1EA1p ti\u1EC1n - ' + r.bank_name); }
        }
        save();
        flash(s, '\u0110\u00E3 duy\u1EC7t y\u00EAu c\u1EA7u.');
      } else if (action === 'reject') {
        r.status = 'rejected'; r.processed_at = nowStr();
        if (r.request_type === 'withdraw') {
          const u = findUserById(r.user_id);
          if (u) { const newB = u.balance + r.amount; u.balance = newB; addTransaction(u.id, r.amount, newB, 'admin_adjust', 'Ho\u00E0n ti\u1EC1n y\u00EAu c\u1EA7u r\u00FAt b\u1ECB t\u1EEB ch\u1ED1i'); }
        }
        save();
        flash(s, '\u0110\u00E3 t\u1EEB ch\u1ED1i y\u00EAu c\u1EA7u.');
      } else flash(s, 'Thao t\u00E1c kh\u00F4ng h\u1EE3p l\u1EC7.');
    }
    if (body.extend !== undefined) {
      const id = parseInt(body.id, 10) || 0;
      const hours = Math.max(1, parseInt(body.hours, 10) || 1);
      const key = state.keys.find((k) => k.id === id);
      if (key) { const base = key.expires_at && key.expires_at > nowStr() ? key.expires_at : nowStr(); key.expires_at = dateAddHours(hours, base); key.status = 'active'; save(); }
    }
    if (body.create_key !== undefined) {
      const hours = Math.max(1, parseInt(body.hours, 10) || 24);
      const uid2 = parseInt(body.uid, 10) || 0;
      const price = Math.max(0, parseInt(body.price, 10) || 0);
      const note = String(body.note || '').trim();
      const keyValue = genVipKey();
      state.keys.push({ id: state.key_seq++, key_value: keyValue, user_id: uid2 || null, price: price, hours: hours, status: 'active', device_limit: 1, note: note, created_at: nowStr(), expires_at: dateAddHours(hours), device_id: '', device_count: 0 });
      save();
      flash(s, '\u0110\u00E3 t\u1EA1o key: ' + keyValue);
    }
    if (body.act !== undefined) {
      const id = parseInt(body.id, 10) || 0;
      const a = String(body.act);
      const key = state.keys.find((k) => k.id === id);
      if (key) {
        if (a === 'disable') key.status = 'disabled';
        if (a === 'enable') key.status = 'active';
        if (a === 'reset') { key.device_id = ''; key.device_count = 0; key.status = 'active'; state.devices = state.devices.filter((d) => d.key_id !== id); }
        if (a === 'delete') { state.keys = state.keys.filter((k) => k.id !== id); state.devices = state.devices.filter((d) => d.key_id !== id); }
        save();
      }
    }
    if (body.add_fb_job !== undefined) {
      const link = String(body.link || '').trim();
      const oid = String(body.object_id || '').trim();
      const type = String(body.type || 'like');
      const reaction = String(body.reaction || 'like');
      const price = Math.max(0, parseInt(body.price, 10) || 35);
      const maxUses = Math.max(1, parseInt(body.max_uses, 10) || 9999);
      if (!link || !oid) flash(s, 'Ph\u1EA3i nh\u1EADp Link v\u00E0 Object ID.');
      else {
        const job = { id: state.job_seq++, job_id: String(state.job_seq - 1), link: link, object_id: oid, type: type, reaction: reaction, fix_coin: price, price: price, price_per_after_cost: price, max_uses: maxUses, uses: 0, used_count: 0, status: 'active', created_at: nowStr() };
        state.fb_jobs.push(job);
        save();
        flash(s, '\u0110\u00E3 th\u00EAm nhi\u1EC7m v\u1EE5 Facebook.');
      }
    }
    if (body.add_tiktok_job !== undefined) {
      const url = String(body.video_url || '').trim();
      const ads = String(body.ads_id || '').trim();
      const acc = String(body.account_id || '').trim();
      const price = Math.max(0, parseInt(body.price, 10) || 20);
      const maxUses = Math.max(1, parseInt(body.max_uses, 10) || 9999);
      if (!ads) flash(s, 'Ph\u1EA3i nh\u1EADp Ads ID.');
      else {
        const job = { id: state.job_seq++, job_id: String(state.job_seq - 1), link: url, object_id: '', ads_id: ads, account_id: acc, type: 'follow', reaction: 'like', fix_coin: price, price: price, price_per_after_cost: price, max_uses: maxUses, uses: 0, used_count: 0, status: 'active', created_at: nowStr() };
        state.tiktok_jobs.push(job);
        save();
        flash(s, '\u0110\u00E3 th\u00EAm nhi\u1EC7m v\u1EE5 TikTok.');
      }
    }
    if (body.job_act !== undefined) {
      const id = parseInt(body.id, 10) || 0;
      const t = String(body.t || 'fb');
      const a = String(body.job_act);
      const arr = t === 'tt' ? state.tiktok_jobs : state.fb_jobs;
      const job = arr.find((j) => j.id === id);
      if (job) {
        if (a === 'disable') job.status = 'disabled';
        if (a === 'enable') job.status = 'active';
        if (a === 'delete') { if (t === 'tt') state.tiktok_jobs = state.tiktok_jobs.filter((j) => j.id !== id); else state.fb_jobs = state.fb_jobs.filter((j) => j.id !== id); }
        save();
      }
      flash(s, '\u0110\u00E3 c\u1EADp nh\u1EADt nhi\u1EC7m v\u1EE5.');
    }
    if (body.clear_completions !== undefined) {
      state.completions = [];
      save();
      flash(s, '\u0110\u00E3 x\u00F3a l\u1ECBch s\u1EED ho\u00E0n th\u00E0nh.');
    }
  }

  return redirect(res, s.role === 'admin' ? '/' : '/');
}

function esc(x) {
  return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(x) {
  const n = Number(x) || 0;
  const s = Math.abs(n).toLocaleString('en-US').replace(/,/g, '.');
  return (n < 0 ? '-' : '') + s + ' \u0111';
}

const CSS = `*{box-sizing:border-box}body{margin:0;font:15px Arial;background:#080d1a;color:#edf2ff}.wrap{max-width:1180px;margin:auto;padding:22px}.card{background:#11192b;border:1px solid #283754;border-radius:18px;padding:20px;margin-bottom:18px;box-shadow:0 12px 35px #0004}.top{display:flex;justify-content:space-between;gap:12px;align-items:center}.balance{font-size:25px;font-weight:800;color:#66e3ff}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.plan{padding:20px;border:1px solid #31415f;border-radius:16px;background:#0c1425}.price{font-size:28px;font-weight:800}.btn,button{border:0;border-radius:10px;padding:11px 15px;background:#3566ff;color:#fff;font-weight:700;cursor:pointer}.danger{background:#b42318}.green{background:#16803c}input,select{padding:11px;border-radius:9px;border:1px solid #34445f;background:#0b1324;color:#fff}table{width:100%;border-collapse:collapse}td,th{padding:9px;border-bottom:1px solid #293753;text-align:left}.key{font-family:monospace;color:#6ee7ff}.muted{color:#9eabc0}a{color:#8fb5ff}@media(max-width:750px){.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}table{font-size:12px;display:block;overflow:auto;white-space:nowrap}.wallet-grid{grid-template-columns:1fr!important}}
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
.admin-head{display:flex;justify-content:space-between;align-items:center;gap:20px}.eyebrow{font-size:11px;letter-spacing:2px;color:#6e91ff;font-weight:900}.admin-logout{padding:10px 14px;border-radius:10px;background:#1a2943;color:#fff;text-decoration:none}.admin-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.stat-card{padding:18px;border:1px solid #263a5b;border-radius:16px;background:#0d1729}.stat-card span{display:block;color:#8998b0;font-size:12px}.stat-card b{display:block;font-size:28px;margin-top:7px}.admin-tabs{display:flex;gap:8px;overflow:auto;margin:16px 0;padding-bottom:4px}.admin-tab{white-space:nowrap;border:1px solid #2b4063;background:#0e182a;color:#cbd6eb;padding:11px 15px;border-radius:11px}.admin-tab.active{background:#3566ff;border-color:#3566ff;color:#fff}.admin-panel{display:none}.admin-panel.active{display:block}.inline-form{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.inline-form input{max-width:130px}.positive{color:#62e7a0}.negative{color:#ff7777}code{font-size:11px;color:#aab9d3}@media(max-width:700px){.admin-stats{grid-template-columns:1fr 1fr}.admin-head{align-items:flex-start}.admin-head h1{font-size:25px}}`;

const SCRIPTS = `<script>
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
function showRegister(){document.getElementById('loginBox').style.display='none';document.getElementById('registerBox').style.display='block'}
function showLogin(){document.getElementById('registerBox').style.display='none';document.getElementById('loginBox').style.display='block'}
</script>`;

function authPage(adminLogin, msg) {
  const notice = msg ? `<div class="notice">${esc(msg)}</div>` : '';
  const back = adminLogin
    ? `<div class="switch"><a href="./">← Quay lại VIP Shop</a></div>`
    : `<div class="switch">Chưa có tài khoản? <a href="#" onclick="showRegister();return false;">Đăng ký</a></div><div class="admin-link"><a href="admin">Đăng nhập quản trị viên</a></div>`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BON SHOP — Nền tảng dịch vụ số</title><style>${CSS}</style></head><body><div class="wrap">
<div class="card auth-card"><div id="loginBox"><h1>${adminLogin ? 'ADMIN LOGIN' : 'VIP SHOP'}</h1><p class="muted">Đăng nhập bằng username hoặc Gmail/Email</p>${notice}<form method="post"><input style="width:100%" type="text" name="login_id" placeholder="Username hoặc Gmail/Email" required><br><br><input style="width:100%" type="password" name="pass" placeholder="Mật khẩu" required><br><br><button name="login" style="width:100%">Đăng nhập</button></form>${back}</div>
<div id="registerBox" style="display:none"><h1>ĐĂNG KÝ</h1><p class="muted">Tạo tài khoản để mua Key VIP</p>${notice}<form method="post"><input style="width:100%" type="text" name="username" placeholder="Username" pattern="[A-Za-z0-9_]{3,30}" minlength="3" maxlength="30" required><br><br><input style="width:100%" type="email" name="email" placeholder="Gmail / Email" required><br><br><input style="width:100%" type="password" name="pass" placeholder="Mật khẩu >= 6 ký tự" minlength="6" required><br><br><button name="register" style="width:100%">Đăng ký</button></form><div class="switch">Đã có tài khoản? <a href="#" onclick="showLogin();return false;">Đăng nhập</a></div></div></div>
${SCRIPTS}</body></html>`;
}

function userPage(s, msg) {
  const user = findUserById(Number(s.uid)) || { username: s.username, email: s.email, balance: 0 };
  const myKeys = state.keys.filter((k) => Number(k.user_id) === Number(user.id)).sort((a, b) => b.id - a.id).slice(0, 10);
  const myWallet = state.wallet_requests.filter((r) => Number(r.user_id) === Number(user.id)).sort((a, b) => b.id - a.id).slice(0, 10);
  const notice = msg ? `<div class="card notice">${esc(msg)}</div>` : '';

  const bankOptions = Object.keys(SETTINGS.banks).map((bn) => `<option>${esc(bn)}</option>`).join('');
  const bankInfo = Object.entries(SETTINGS.banks).map(([bn, b]) => `<div class="bank"><b>Ngân hàng: ${esc(bn)}</b><br>STK: <b>${esc(b.account)}</b><br>Tên: <b>${esc(b.name)}</b></div>`).join('');

  const plans = [[24, '1 ngày'], [720, '30 ngày'], [2160, '90 ngày']].map(([hours, name]) => {
    const price = SETTINGS.prices[hours];
    return `<div class="plan"><h2>${name}</h2><div class="price">${money(price)}</div><p class="muted">${hours} giờ VIP</p><form method="post"><input type="hidden" name="hours" value="${hours}"><button name="buy" style="width:100%">Mua ngay</button></form></div>`;
  }).join('');

  const walletRows = myWallet.map((r) => `<tr><td>${r.request_type === 'deposit' ? 'Nạp' : 'Rút'}</td><td>${money(r.amount)}</td><td>${esc(r.bank_name)}</td><td>${esc(r.account_number || '-')}</td><td class="status-${esc(r.status)}">${esc(r.status)}</td><td>${esc(r.created_at)}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">Chưa có yêu cầu nào.</td></tr>`;

  const keyRows = myKeys.map((k) => `<tr><td class="key">${esc(k.key_value)}</td><td>${k.hours}h / ${money(k.price)}</td><td>${esc(k.expires_at || '-')}</td><td>${esc(k.status)}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">Chưa có key nào.</td></tr>`;

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BON SHOP — Nền tảng dịch vụ số</title><style>${CSS}</style></head><body><div class="wrap">
<button class="menu-toggle" onclick="toggleMenu()">☰</button>
<div id="sideMenu" class="side-menu">
  <div class="side-head"><div class="side-title">BON SHOP</div><button class="close-menu" onclick="toggleMenu()">×</button></div>
  <div class="side-user">
    <div class="side-username">${esc(user.username || user.email)}</div>
    <div class="side-balance">Số dư ${money(user.balance)}</div>
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
    <a href="/logout" class="logout-link">Đăng xuất</a>
  </div>
</div>
<div id="menuBackdrop" class="menu-backdrop" onclick="toggleMenu()"></div>
<main class="user-main">
  ${notice}
<section id="homeSection" class="section-page active">
  <div class="hero-home">
    <div class="hero-badge">✦ NỀN TẢNG DỊCH VỤ SỐ</div>
    <h1>BON <span>SHOP</span></h1>
    <p class="hero-lead">Hệ sinh thái dịch vụ số hiện đại cho MMO, mạng xã hội và kiếm tiền online — tập trung vào tốc độ, tiện lợi và trải nghiệm người dùng.</p>
    <div class="hero-actions">
      <button onclick="showSection('buy')">🔑 Mua Key VIP</button>
      <button class="ghost" onclick="showSection('social')">📱 Khám phá dịch vụ</button>
    </div>
    <div class="hero-user">Xin chào, <b>${esc(user.username || 'Bạn')}</b> · Số dư <b>${money(user.balance)}</b></div>
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
<div class="card section-page" id="deposit"><h2>💰 Nạp tiền</h2><p>Chuyển khoản theo một trong các ngân hàng bên dưới. <b>Nội dung chuyển khoản phải ghi đúng tên tài khoản/username của bạn</b> (ví dụ: <b>${esc(user.username || '')}</b>). Sau khi chuyển, gửi yêu cầu nạp tiền để admin kiểm tra và cộng số dư.</p>${bankInfo}<form method="post" class="wallet-grid"><div><label>Ngân hàng nhận</label><br><select name="bank" style="width:100%" required>${bankOptions}</select></div><div><label>Số tiền đã chuyển</label><br><input name="amount" type="number" min="1000" step="1000" placeholder="Ví dụ 50000" style="width:100%" required></div><div style="grid-column:1/-1"><label>Nội dung chuyển khoản</label><br><input name="note" placeholder="Ví dụ: ${esc(user.username || 'username')}" style="width:100%" required></div><div style="grid-column:1/-1"><button name="deposit_request">Tôi đã chuyển khoản - Gửi yêu cầu nạp</button></div></form></div>
<div class="card section-page" id="withdraw"><h2>💸 Rút tiền</h2><p class="muted">Số tiền rút tối thiểu: <b>${money(SETTINGS.withdraw_min)}</b>. Tiền sẽ được giữ lại khi gửi yêu cầu; nếu admin từ chối, hệ thống hoàn lại số dư.</p><form method="post" class="wallet-grid"><div><label>Ngân hàng</label><br><select name="bank" style="width:100%" required>${bankOptions}</select></div><div><label>Số tiền rút</label><br><input name="amount" type="number" min="${SETTINGS.withdraw_min}" step="1000" placeholder="Tối thiểu ${SETTINGS.withdraw_min}" style="width:100%" required></div><div><label>Số tài khoản</label><br><input name="account_number" style="width:100%" required></div><div><label>Tên chủ tài khoản</label><br><input name="account_name" style="width:100%" required></div><div style="grid-column:1/-1"><button name="withdraw_request">Gửi yêu cầu rút tiền</button></div></form></div>
<div class="card"><h2>📋 Yêu cầu nạp/rút gần đây</h2><table><tr><th>Loại</th><th>Số tiền</th><th>Ngân hàng</th><th>STK</th><th>Trạng thái</th><th>Thời gian</th></tr>${walletRows}</table></div>
<div class="card section-page" id="buy"><h2>🛒 Mua Key VIP</h2><div class="grid">${plans}</div></div>
<div class="card section-page" id="social"><h2>📱 Dịch vụ MXH</h2><p class="muted">Khu vực dịch vụ mạng xã hội. Hiện đang cập nhật sản phẩm.</p><div class="service-grid"><div class="service-box">TikTok</div><div class="service-box">Facebook</div><div class="service-box">YouTube</div><div class="service-box">Instagram</div></div></div>
<div class="card section-page" id="earn"><h2>💵 Kiếm tiền</h2><p class="muted">Khu vực chương trình kiếm tiền / cộng tác viên. Sắp cập nhật.</p></div>
<div class="card section-page" id="other"><h2>🧰 Dịch vụ khác</h2><p class="muted">Các dịch vụ khác sẽ được bổ sung tại đây.</p></div>
<div class="card"><h2>🔑 Key của tôi</h2><table><tr><th>Key</th><th>Gói</th><th>Hết hạn</th><th>Trạng thái</th></tr>${keyRows}</table></div>
</main>
${SCRIPTS}</body></html>`;
}

function adminPage(s, msg) {
  const adminUsers = state.users.slice().sort((a, b) => b.id - a.id);
  const adminKeys = state.keys.slice().sort((a, b) => b.id - a.id);
  const adminDevices = state.devices.slice().sort((a, b) => b.id - a.id);
  const adminTx = state.transactions.slice().sort((a, b) => b.id - a.id).slice(0, 200);
  const adminWallet = state.wallet_requests.slice().sort((a, b) => b.id - a.id).slice(0, 200);
  const adminFbJobs = state.fb_jobs.slice().sort((a, b) => b.id - a.id).slice(0, 200);
  const adminTtJobs = state.tiktok_jobs.slice().sort((a, b) => b.id - a.id).slice(0, 200);
  const adminJobsDone = state.completions.slice().sort((a, b) => b.id - a.id).slice(0, 100);
  const adminJobReports = state.reports.slice().sort((a, b) => b.id - a.id).slice(0, 50);
  const notice = msg ? `<div class="card notice">${esc(msg)}</div>` : '';

  const uname = (u) => {
    if (!u) return '-';
    return esc(u.username || u.email || '-');
  };

  const userRows = adminUsers.map((u) => `<tr><td>${u.id}</td><td><b>${esc(u.username || '-')}</b></td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td><b>${money(u.balance)}</b></td><td>${esc(u.created_at)}</td><td><form method="post" class="inline-form"><input type="hidden" name="uid" value="${u.id}"><input type="number" name="amount" min="1" step="1000" placeholder="VNĐ" required><button name="topup" value="1">+ Cộng</button><button class="danger" name="deduct" value="1" onclick="return confirm('Xác nhận trừ số dư user này?')">− Trừ</button></form></td></tr>`).join('') || `<tr><td colspan="7" class="muted">Chưa có user.</td></tr>`;

  const userOpts = `<option value="0">— Chưa gán (key tự do) —</option>` + adminUsers.map((u) => `<option value="${u.id}">${esc(u.username || u.email)}</option>`).join('');

  const keyRows = adminKeys.map((k) => {
    const owner = findUserById(k.user_id);
    return `<tr><td>${k.id}</td><td class="key">${esc(k.key_value)}</td><td>${k.hours}h</td><td>${money(k.price)}</td><td>${uname(owner)}</td><td>${esc(k.expires_at || '-')}</td><td>${k.device_count || 0}</td><td>${esc(k.status)}</td><td><form method="post" class="inline-form"><input type="hidden" name="id" value="${k.id}"><input name="hours" type="number" min="1" value="24" style="width:65px"><button name="extend">+ giờ</button>${k.status === 'active' ? `<button class="danger" name="act" value="disable">Khóa</button>` : `<button class="green" name="act" value="enable">Mở</button>`}<button name="act" value="reset">Reset</button><button class="danger" name="act" value="delete" onclick="return confirm('Xóa key này?')">Xóa</button></form></td></tr>`;
  }).join('') || `<tr><td colspan="9" class="muted">Chưa có key.</td></tr>`;

  const deviceRows = adminDevices.map((d) => {
    const key = state.keys.find((k) => k.id === d.key_id);
    const owner = key ? findUserById(key.user_id) : null;
    return `<tr><td>${d.id}</td><td class="key">${key ? esc(key.key_value) : '-'}</td><td>${uname(owner)}</td><td><code>${esc((d.device_hash || '').slice(0, 16))}…</code></td><td>${esc(d.first_seen)}</td><td>${esc(d.last_seen)}</td></tr>`;
  }).join('') || `<tr><td colspan="6" class="muted">Chưa có thiết bị kích hoạt.</td></tr>`;

  const walletRows = adminWallet.map((r) => {
    const owner = findUserById(r.user_id);
    return `<tr><td>${r.id}</td><td>${uname(owner)}</td><td>${r.request_type === 'deposit' ? 'Nạp' : 'Rút'}</td><td>${money(r.amount)}</td><td>${esc(r.bank_name)}</td><td>${esc(r.account_number || '-')}</td><td>${esc(r.account_name || '-')}</td><td>${esc(r.note || '-')}</td><td class="status-${esc(r.status)}">${esc(r.status)}</td><td>${r.status === 'pending' ? `<form method="post" class="inline-form"><input type="hidden" name="rid" value="${r.id}"><button class="green" name="wallet_action" value="approve">Duyệt</button><button class="danger" name="wallet_action" value="reject">Từ chối</button></form>` : 'Đã xử lý'}</td></tr>`;
  }).join('') || `<tr><td colspan="10" class="muted">Chưa có yêu cầu.</td></tr>`;

  const txRows = adminTx.map((t) => {
    const owner = findUserById(t.user_id);
    return `<tr><td>${t.id}</td><td>${uname(owner)}</td><td class="${(t.amount || 0) < 0 ? 'negative' : 'positive'}">${money(t.amount)}</td><td>${money(t.balance_after)}</td><td>${esc(t.type)}</td><td>${esc(t.description || '-')}</td><td>${esc(t.created_at)}</td></tr>`;
  }).join('') || `<tr><td colspan="7" class="muted">Chưa có giao dịch.</td></tr>`;

  const fbJobRows = adminFbJobs.map((j) => `<tr><td>${j.id}</td><td><a target="_blank" rel="noopener" href="${esc(j.link)}">mở</a></td><td><code>${esc(j.object_id)}</code></td><td>${esc(j.type)}</td><td>${esc(j.reaction)}</td><td>${j.price || j.fix_coin}</td><td>${j.used_count || j.uses || 0}/${j.max_uses}</td><td>${esc(j.status)}</td><td><form method="post" class="inline-form"><input type="hidden" name="id" value="${j.id}"><input type="hidden" name="t" value="fb">${j.status === 'active' ? `<button class="danger" name="job_act" value="disable">Khóa</button>` : `<button class="green" name="job_act" value="enable">Mở</button>`}<button class="danger" name="job_act" value="delete" onclick="return confirm('Xóa nhiệm vụ này?')">Xóa</button></form></td></tr>`).join('') || `<tr><td colspan="9" class="muted">Chưa có nhiệm vụ Facebook.</td></tr>`;

  const ttJobRows = adminTtJobs.map((j) => `<tr><td>${j.id}</td><td><code>${esc(j.ads_id)}</code></td><td>${esc(j.account_id)}</td><td>${j.price || j.fix_coin}</td><td>${j.used_count || j.uses || 0}/${j.max_uses}</td><td>${esc(j.status)}</td><td><form method="post" class="inline-form"><input type="hidden" name="id" value="${j.id}"><input type="hidden" name="t" value="tt">${j.status === 'active' ? `<button class="danger" name="job_act" value="disable">Khóa</button>` : `<button class="green" name="job_act" value="enable">Mở</button>`}<button class="danger" name="job_act" value="delete" onclick="return confirm('Xóa nhiệm vụ này?')">Xóa</button></form></td></tr>`).join('') || `<tr><td colspan="7" class="muted">Chưa có nhiệm vụ TikTok.</td></tr>`;

  const doneRows = adminJobsDone.map((c) => {
    const owner = findUserById(c.user_id);
    return `<tr><td>${c.id}</td><td>${esc(String(c.platform).toUpperCase())}</td><td>${esc(c.job_id)}</td><td>${uname(owner)}</td><td>${c.amount}</td><td><code>${esc((c.device_hash || '').slice(0, 12))}…</code></td><td>${esc(c.created_at)}</td></tr>`;
  }).join('') || `<tr><td colspan="7" class="muted">Chưa có nhiệm vụ hoàn thành.</td></tr>`;

  const reportRows = adminJobReports.map((r) => `<tr><td>${r.id}</td><td>${esc(String(r.platform).toUpperCase())}</td><td>${esc(r.job_id)}</td><td>${esc(r.uid || '-')}</td><td>${esc(r.description || '-')}</td><td><code>${esc((r.device_hash || '').slice(0, 12))}…</code></td><td>${esc(r.created_at)}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">Chưa có báo cáo.</td></tr>`;

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BON SHOP — Quản trị</title><style>${CSS}</style></head><body><div class="wrap">
<div class="admin-head card"><div><div class="eyebrow">BON SHOP · CONTROL CENTER</div><h1>👑 Quản trị hệ thống</h1><p class="muted">${esc(s.email)}</p></div><a class="admin-logout" href="/logout">Đăng xuất</a></div>
${notice}
<div class="admin-stats"><div class="stat-card"><span>Users</span><b>${adminUsers.length}</b></div><div class="stat-card"><span>VIP Keys</span><b>${adminKeys.length}</b></div><div class="stat-card"><span>Thiết bị</span><b>${adminDevices.length}</b></div><div class="stat-card"><span>Yêu cầu ví</span><b>${adminWallet.length}</b></div></div>
<div class="admin-tabs"><button class="admin-tab active" onclick="adminTab('users',this)">👤 Users</button><button class="admin-tab" onclick="adminTab('keys',this)">🔑 VIP Keys</button><button class="admin-tab" onclick="adminTab('devices',this)">📱 Devices</button><button class="admin-tab" onclick="adminTab('wallet',this)">💳 Nạp/Rút</button><button class="admin-tab" onclick="adminTab('transactions',this)">📊 Giao dịch</button><button class="admin-tab" onclick="adminTab('jobs',this)">⚙️ Nhiệm vụ</button></div>
<section id="admin-users" class="admin-panel active"><div class="card"><h2>👤 Quản lý Users</h2><table><tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Số dư</th><th>Tạo lúc</th><th>Điều chỉnh</th></tr>${userRows}</table></div></section>
<section id="admin-keys" class="admin-panel"><div class="card"><h2>🔑 VIP Keys</h2>
<div class="card" style="margin:0 0 14px;background:#0d1729;border:1px solid #2a3f63"><h3 style="margin:0 0 10px">➕ Tạo Key VIP mới</h3><form method="post" class="wallet-grid"><div><label>Gán cho user</label><br><select name="uid" style="width:100%">${userOpts}</select></div><div><label>Số giờ</label><br><input name="hours" type="number" min="1" value="720" style="width:100%" required></div><div><label>Giá ghi trên key</label><br><input name="price" type="number" min="0" value="50000" style="width:100%"></div><div><label>Ghi chú</label><br><input name="note" placeholder="Ví dụ: Key tặng" style="width:100%"></div><div style="grid-column:1/-1"><button name="create_key">+ Tạo Key</button></div></form></div>
<table><tr><th>ID</th><th>Key</th><th>Gói</th><th>Giá</th><th>User</th><th>Hết hạn</th><th>Thiết bị</th><th>Trạng thái</th><th>Thao tác</th></tr>${keyRows}</table></div></section>
<section id="admin-devices" class="admin-panel"><div class="card"><h2>📱 Key Devices</h2><p class="muted">Thiết bị đã kích hoạt key. Device hash được hiển thị rút gọn.</p><table><tr><th>ID</th><th>Key</th><th>User</th><th>Device</th><th>First seen</th><th>Last seen</th></tr>${deviceRows}</table></div></section>
<section id="admin-wallet" class="admin-panel"><div class="card"><h2>💳 Yêu cầu Nạp / Rút</h2><table><tr><th>ID</th><th>User</th><th>Loại</th><th>Số tiền</th><th>Ngân hàng</th><th>STK</th><th>Tên</th><th>Nội dung</th><th>Trạng thái</th><th>Xử lý</th></tr>${walletRows}</table></div></section>
<section id="admin-transactions" class="admin-panel"><div class="card"><h2>📊 Lịch sử số dư</h2><table><tr><th>ID</th><th>User</th><th>Amount</th><th>Balance after</th><th>Type</th><th>Mô tả</th><th>Thời gian</th></tr>${txRows}</table></div></section>
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
<table><tr><th>ID</th><th>Link</th><th>Object ID</th><th>Loại</th><th>Reaction</th><th>Giá</th><th>Đã dùng</th><th>Trạng thái</th><th>Thao tác</th></tr>${fbJobRows}</table></div>
<div class="card"><h2>⚙️ Nhiệm vụ TikTok</h2><p class="muted">Kho job TikTok cho auto tool. App gọi <code>api_golike_tiktok.php?action=complete_job&ads_id=...</code></p>
<form method="post" class="wallet-grid">
<div><label>Link video</label><br><input name="video_url" placeholder="https://www.tiktok.com/..." style="width:100%"></div>
<div><label>Ads ID</label><br><input name="ads_id" placeholder="TikTok video id" style="width:100%" required></div>
<div><label>Account ID</label><br><input name="account_id" placeholder="Account id" style="width:100%"></div>
<div><label>Giá (xu)</label><br><input name="price" type="number" min="1" value="20" style="width:100%" required></div>
<div><label>Số lượt tối đa</label><br><input name="max_uses" type="number" min="1" value="9999" style="width:100%" required></div>
<div style="grid-column:1/-1"><button name="add_tiktok_job">+ Thêm nhiệm vụ TikTok</button></div>
</form>
<table><tr><th>ID</th><th>Ads ID</th><th>Account</th><th>Giá</th><th>Đã dùng</th><th>Trạng thái</th><th>Thao tác</th></tr>${ttJobRows}</table></div>
<div class="card"><h2>🕒 Nhiệm vụ đã hoàn thành <span style="float:right"><form method="post" style="display:inline"><button class="danger" name="clear_completions" onclick="return confirm('Xóa toàn bộ lịch sử hoàn thành?')">Xóa lịch sử</button></form></span></h2><table><tr><th>ID</th><th>Nền tảng</th><th>Job ID</th><th>User</th><th>Xu</th><th>Thiết bị</th><th>Thời gian</th></tr>${doneRows}</table></div>
<div class="card"><h2>🚩 Báo cáo lỗi job</h2><table><tr><th>ID</th><th>Nền tảng</th><th>Job ID</th><th>UID</th><th>Mô tả</th><th>Thiết bị</th><th>Thời gian</th></tr>${reportRows}</table></div>
</section>
${SCRIPTS}</body></html>`;
}

function statisticsPage() {
  const platformLabels = [
    { key: 'facebook', label: 'Facebook' },
    { key: 'tiktok', label: 'TikTok' }
  ];
  const counts = { facebook: 0, tiktok: 0 };
  for (const c of state.completions) {
    if (!c || c.status !== 'done') continue;
    const p = c.platform === 'tiktok' ? 'tiktok' : 'facebook';
    counts[p] = (counts[p] || 0) + 1;
  }
  const rows = platformLabels
    .map((p) => `<tr><td><b style="color:#66e3ff">${esc(p.label)}</b></td><td>${Number(counts[p.key]) || 0}</td></tr>`)
    .join('');
  const total = (Number(counts.facebook) || 0) + (Number(counts.tiktok) || 0);

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BON SHOP — Bảng làm việc</title>
<style>*{box-sizing:border-box}body{margin:0;font:15px Arial;background:#070b16;color:#edf2ff;padding:18px}.wrap{max-width:560px;margin:auto}.head{padding:22px;border:1px solid #2a3e68;border-radius:22px;background:linear-gradient(135deg,#111f3a,#0b1426);text-align:center;margin-bottom:16px}.badge{display:inline-block;padding:7px 13px;border:1px solid #3b5fa4;border-radius:99px;color:#8fb5ff;font-size:11px;font-weight:800;letter-spacing:1.5px}h1{margin:14px 0 4px;font-size:26px}p{color:#9eabc0;margin:0;line-height:1.6}table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:11px;border-bottom:1px solid #293753;text-align:left;color:#cbd6eb}th{color:#8998b0;font-weight:700;text-align:left}td:last-child,th:last-child{text-align:right;font-weight:700}.muted{color:#5d6b86;font-size:12px;text-align:center;margin-top:16px}</style></head><body>
<div class="wrap">
  <div class="head">
    <div class="badge">✦ BON SHOP · BẢNG LÀM VIỆC</div>
    <h1>Bảng làm việc</h1>
    <p>Thống kê số lượng nhiệm vụ đã hoàn thành</p>
  </div>
  <div class="card" style="border:1px solid #263a5b;border-radius:16px;background:#0d1729;padding:16px">
    <table>
      <tr><th>Nhiệm vụ</th><th>Số lượng</th></tr>
      ${rows || '<tr><td colspan="2" class="muted" style="text-align:center">Chưa có nhiệm vụ nào.</td></tr>'}
      <tr><td style="font-weight:800;color:#8fb5ff">Tổng</td><td style="font-weight:800;color:#66e3ff">${Number(total) || 0}</td></tr>
    </table>
  </div>
  <div class="muted">BON SHOP · Đơn giản · Nhanh · Tiện lợi</div>
</div>
</body></html>`;
}

function keyFreePage(keyValue) {
  const key = findKey(keyValue);
  let info;
  if (!key) info = `<p style="color:#fca5a5">Không tìm thấy key: ${esc(keyValue || '')}</p>`;
  else if (key.status !== 'active' || (key.expires_at && key.expires_at < nowStr())) info = `<p style="color:#fca5a5">Key không còn hoạt động hoặc đã hết hạn!</p>`;
  else info = `<p style="color:#6ee7b7">Key hợp lệ!</p><div class="kv"><span>Key:</span><b>${esc(key.key_value)}</b></div><div class="kv"><span>Hạn mua:</span><b>${key.hours}h</b></div><div class="kv"><span>Ngày tạo:</span><b>${esc(key.created_at)}</b></div><div class="kv"><span>Hết hạn:</span><b>${esc(key.expires_at)}</b></div><div class="kv"><span>Thiết bị:</span><b>${esc(key.device_id || 'Chưa kích hoạt')}</b></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BON SHOP - Kiểm Tra Key</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;background:linear-gradient(135deg,#0f172a,#1e293b);color:#e2e8f0;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;padding:24px}.box{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;max-width:420px;width:100%}.kv{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155}.kv span{color:#94a3b8}button{width:100%;margin-top:20px;padding:12px;border:0;border-radius:10px;background:#f59e0b;color:#111827;font-weight:bold;font-size:15px;cursor:pointer}</style></head><body>
<div class="box"><h1 style="margin-top:0;color:#fbbf24">🔑 BON SHOP</h1>${info}<button onclick="window.close()">Đóng</button></div>
</body></html>`;
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    json(res, { status: 'error', msg: 'Server error: ' + e.message }, 500);
  });
});

setInterval(() => {
  for (const [token, s] of sessions) {
    if (s.expires < Date.now()) sessions.delete(token);
  }
}, 3600 * 1000);

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  flushFile();
  if (DB_HOST && dbReady) {
    dbSave().finally(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

async function bootstrap() {
  if (DB_HOST) {
    try {
      await initDatabase();
      console.log('PostgreSQL đã kết nối — dữ liệu sẽ không mất khi restart.');
    } catch (e) {
      console.error('Chưa kết nối được PostgreSQL (dùng file tạm, sẽ thử lại sau 30s):', e.message);
      startDatabaseRetry();
    }
  } else {
    console.log('Chưa cấu hình DATABASE_URL — dữ liệu chỉ lưu ở file tạm, sẽ mất khi restart.');
  }
  server.listen(PORT, () => {
    console.log(`BON SHOP server running on port ${PORT}`);
  });
}

bootstrap();
