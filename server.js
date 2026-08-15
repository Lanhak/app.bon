const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || '35c9ef14-46d1-416e-aa7c-a6df43fcc013';
const BASE_URL = process.env.BASE_URL || 'https://bonshop.onrender.com';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

const nowStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const dateAddHours = (hours) => {
  const d = new Date(Date.now() + hours * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const SEED_KEYS = [
  { id: 8,  key_value: 'VIP-57FD76456B2342CDB393', user_id: 2, price: 2000, hours: 24, status: 'active', device_limit: 1, note: '', created_at: '2026-08-15 12:58:20', expires_at: '2026-08-16 12:58:20', device_id: '', device_count: 0 },
  { id: 5,  key_value: 'VIP-40FD7A1557884EF6B0BE', user_id: null, price: 0, hours: 72, status: 'active', device_limit: 1, note: 'backup test vD', created_at: '2026-08-15 11:11:54', expires_at: '2026-08-18 11:11:54', device_id: 'TESTNOW', device_count: 1 },
  { id: 3,  key_value: 'VIP-561318E0620B413DA84A', user_id: 2, price: 2000, hours: 24, status: 'active', device_limit: 1, note: '', created_at: '2026-08-15 09:00:03', expires_at: '2026-08-16 09:00:03', device_id: '', device_count: 0 },
  { id: 2,  key_value: 'VIP-0ED943CC14FD48B1AB42', user_id: 2, price: 2000, hours: 24, status: 'active', device_limit: 1, note: '', created_at: '2026-08-14 13:04:10', expires_at: '2026-08-15 13:04:10', device_id: 'TESTNOW', device_count: 1 },
  { id: 1,  key_value: 'VIP-TEST-001', user_id: null, price: 0, hours: 24, status: 'active', device_limit: 1, note: '', created_at: '2026-08-14 05:38:39', expires_at: '2026-08-15 05:38:39', device_id: '', device_count: 0 }
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

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (parsed && Array.isArray(parsed.keys)) return parsed;
    }
  } catch (e) {}
  return {
    keys: SEED_KEYS.map((k) => Object.assign({}, k)),
    fb_jobs: [],
    tiktok_jobs: [],
    history: [],
    announcement: JSON.parse(JSON.stringify(SEED_ANNOUNCEMENT)),
    key_seq: 100,
    job_seq: 100
  };
}

const state = loadState();
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    } catch (e) {}
  }, 200);
}

function json(res, obj, status) {
  const body = JSON.stringify(obj);
  res.writeHead(status || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-BON-SECRET',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function html(res, body, status) {
  res.writeHead(status || 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function findKey(value) {
  if (!value) return null;
  return state.keys.find((k) => k.key_value && k.key_value.toUpperCase() === String(value).trim().toUpperCase()) || null;
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

function applyDeviceBinding(key, deviceId) {
  if (!deviceId) return { ok: true };
  if (key.device_id) {
    if (key.device_id !== deviceId) return { ok: false, msg: 'Key n\u00E0y \u0111\u00E3 \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng tr\u00EAn thi\u1EBFt b\u1ECB kh\u00E1c!' };
    return { ok: true };
  }
  key.device_id = deviceId;
  key.device_count = (key.device_count || 0) + 1;
  save();
  return { ok: true };
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
    uses: job.uses || 0,
    status: job.status || 'active'
  };
}

const ADMIN = 'X-BON-SECRET';
const SKEY = '\u0042\u004F\u004E\u005F\u0053\u0048\u004F\u0050\u005F\u0041\u0044\u004D\u0049\u004E';

async function handle(req, res) {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = u.pathname;
  const q = u.searchParams;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-BON-SECRET'
    });
    return res.end();
  }

  if (pathname === '/health') return json(res, { status: 'ok', time: nowStr() });

  if (pathname === '/checkkey/api/key.php' || pathname === '/checkkey/api/checkkey.php') {
    const apiKey = q.get('APIKey') || q.get('key') || q.get('api_key');
    if (!apiKey) return json(res, keyError('Vui l\u00F2ng cung c\u1EA5p APIKey!'));
    const v = validateKey(apiKey);
    if (!v.ok) return json(res, keyError(v.msg));
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

  if (pathname === '/checkkey/' || pathname === '/checkkey' || pathname === '/') {
    if (method === 'POST') {
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
        save();
        return json(res, { status: 'success', msg: 'Th\u00EAm th\u00E0nh c\u00F4ng' });
      }
      return json(res, { status: 'error', msg: 'H\u00E0nh \u0111\u1ED9ng kh\u00F4ng h\u1EE3p l\u1EC7!' });
    }
    if (pathname === '/') return html(res, storePage());
    return json(res, { status: 'success', msg: 'BON SHOP API' });
  }

  if (pathname === '/statistics') return html(res, statisticsPage());
  if (pathname === '/Key_Free' || pathname === '/Key_Free/') return html(res, keyFreePage(q.get('key')));

  if (pathname.startsWith('/v1/admin')) return handleAdmin(req, res, pathname, q);

  return json(res, { status: 'error', msg: '404 Not Found' }, 404);
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

  if (action === 'get_jobs') {
    const available = jobs.filter((j) => j.status === 'active' && (!j.max_uses || (j.uses || 0) < j.max_uses)).slice(0, 50);
    return json(res, { success: true, status: 'success', count: available.length, data: available.map(jobPublic) });
  }

  if (action === 'complete_job') {
    if (platform === 'tiktok') {
      state.history.push({
        id: state.history.length + 1,
        name_tool: 'BON_TOOL',
        type: 'complete',
        platform: 'tiktok',
        ads_id: q.get('ads_id') || '',
        account_id: q.get('account_id') || '',
        device_id: q.get('device_id_local') || '',
        time: nowStr()
      });
      save();
      return json(res, { success: true, status: 'success', message: 'Ho\u00E0n th\u00E0nh Job th\u00E0nh c\u00F4ng!', code: 'OK' });
    }
    let job = findJob(platform, q.get('job_id')) || findJob(platform, q.get('object_id')) || null;
    if (!job) return json(res, { success: false, message: 'Job kh\u00F4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\u00E3 h\u1EBFt!', code: 'JOB_NOT_FOUND' });
    job.uses = (job.uses || 0) + 1;
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
    state.history.push({
      id: state.history.length + 1,
      name_tool: 'BON_TOOL',
      type: 'report',
      platform: platform,
      job_id: q.get('job_id') || '',
      uid: q.get('uid') || '',
      device_id: q.get('device_id_local') || '',
      description: q.get('description') || '',
      time: nowStr()
    });
    save();
    return json(res, { success: true, status: 'success', message: '\u0110\u00E3 ghi nh\u1EADn b\u00E1o c\u00E1o Job!', code: 'OK' });
  }

  return json(res, { success: false, message: 'H\u00E0nh \u0111\u1ED9ng kh\u00F4ng h\u1EE3p l\u1EC7!', code: 'BAD_ACTION' });
}

async function handleAdmin(req, res, pathname, q) {
  const secret = req.headers['x-bon-secret'];
  if (secret !== ADMIN_SECRET) return json(res, { success: false, code: 'UNAUTHORIZED', message: 'Kh\u00F4ng \u0111\u01B0\u1EE3c ph\u00E9p!' }, 401);

  if (pathname === '/v1/admin/summary' || pathname === '/v1/admin/dashboard') {
    const obj = {
      success: true,
      users: 0,
      keys: state.keys.length,
      pending_wallet: 0,
      jobs: state.fb_jobs.length + state.tiktok_jobs.length,
      stats: { users: 0, keys: state.keys.length, pending_wallet: 0, jobs: state.fb_jobs.length + state.tiktok_jobs.length },
      dashboard: { users: 0, keys: state.keys.length, pending_wallet: 0, jobs: state.fb_jobs.length + state.tiktok_jobs.length }
    };
    return json(res, obj);
  }

  if (pathname === '/v1/admin/users') {
    const seen = {};
    for (const k of state.keys) if (k.user_id) seen[k.user_id] = true;
    const users = Object.keys(seen).map((id) => ({ id: Number(id), username: 'user' + id, email: '', balance: 0, status: 'active', created_at: '' }));
    return json(res, { success: true, users: users });
  }

  if (pathname === '/v1/admin/keys') return json(res, { success: true, keys: state.keys });

  if (pathname === '/v1/admin/keys/create') {
    if (req.method !== 'POST') return json(res, { success: false, message: 'Method not allowed' }, 405);
    const body = await readBody(req);
    const keyValue = (body.key || body.key_value || '').trim().toUpperCase();
    if (!keyValue) return json(res, { success: false, message: 'Thi\u1EBFu key!' });
    const hours = Number(body.hours) || 24;
    state.keys.push({
      id: state.key_seq++,
      key_value: keyValue,
      user_id: body.user_id || null,
      price: Number(body.price) || 0,
      hours: hours,
      status: body.status || 'active',
      device_limit: Number(body.device_limit) || 1,
      note: body.note || '',
      created_at: nowStr(),
      expires_at: body.expires_at || dateAddHours(hours),
      device_id: body.device_id || '',
      device_count: 0
    });
    save();
    return json(res, { success: true, message: 'T\u1EA1o key th\u00E0nh c\u00F4ng!', key: state.keys[state.keys.length - 1] });
  }

  if (pathname === '/v1/admin/keys/action') {
    if (req.method !== 'POST') return json(res, { success: false, message: 'Method not allowed' }, 405);
    const body = await readBody(req);
    const key = findKey(body.key || body.key_value) || state.keys.find((k) => Number(k.id) === Number(body.id)) || null;
    if (!key) return json(res, { success: false, message: 'Key kh\u00F4ng t\u1ED3n t\u1EA1i!' });
    const action = body.action || '';
    if (action === 'enable') key.status = 'active';
    else if (action === 'disable') key.status = 'disabled';
    else if (action === 'reset') { key.device_id = ''; key.device_count = 0; key.status = 'active'; }
    else if (action === 'delete') state.keys = state.keys.filter((k) => k.id !== key.id);
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
      link: body.link || '',
      object_id: body.object_id || '',
      type: body.type || (platform === 'fb' ? 'like' : 'follow'),
      reaction: body.reaction || 'like',
      fix_coin: Number(body.fix_coin) || Number(body.price) || 0,
      price_per_after_cost: Number(body.price_per_after_cost) || Number(body.price) || Number(body.fix_coin) || 0,
      price: Number(body.price) || Number(body.fix_coin) || 0,
      max_uses: Number(body.max_uses) || 0,
      uses: 0,
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
    else if (action === 'reset') { job.uses = 0; job.status = 'active'; }
    else if (action === 'delete') { if (platform === 'tiktok') state.tiktok_jobs = state.tiktok_jobs.filter((j) => j.id !== job.id); else state.fb_jobs = state.fb_jobs.filter((j) => j.id !== job.id); }
    else return json(res, { success: false, message: 'H\u00E0nh \u0111\u1ED9ng kh\u00F4ng h\u1EE3p l\u1EC7!' });
    save();
    return json(res, { success: true, message: '\u0110\u00E3 x\u1EED l\u00FD!' });
  }

  if (pathname === '/v1/admin/history') {
    return json(res, { success: true, history: state.history });
  }

  return json(res, { success: false, status: 'not_found', message: 'Endpoint kh\u00F4ng t\u1ED3n t\u1EA1i.' }, 404);
}

function statisticsPage() {
  const activeKeys = state.keys.filter((k) => k.status === 'active' && (!k.expires_at || k.expires_at >= nowStr()));
  const rows = state.keys.map((k) => `<tr><td>${k.key_value}</td><td>${k.hours}h</td><td>${k.status}</td><td>${k.expires_at}</td><td>${k.device_id || '-'}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BON SHOP Statistics</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}a{color:#38bdf8}h1{color:#fbbf24}.cards{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.card{background:#1e293b;border-radius:12px;padding:20px;min-width:140px}.card b{display:block;font-size:26px;color:#34d399}.card span{color:#94a3b8;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:16px;background:#1e293b;border-radius:12px;overflow:hidden}th,td{padding:10px 14px;text-align:left;border-bottom:1px solid #334155;font-size:14px}th{background:#0b1220;color:#fbbf24}.badge{padding:2px 8px;border-radius:999px;font-size:12px}.ok{background:#065f46;color:#6ee7b7}.off{background:#7f1d1d;color:#fca5a5}</style></head><body>
<h1>📊 BON SHOP Statistics</h1>
<div class="cards">
<div class="card"><b>${state.keys.length}</b><span>Tổng Key</span></div>
<div class="card"><b>${activeKeys.length}</b><span>Key Hoạt Động</span></div>
<div class="card"><b>${state.fb_jobs.length + state.tiktok_jobs.length}</b><span>Tổng Job</span></div>
<div class="card"><b>${state.history.length}</b><span>Lịch Sử Giao Dịch</span></div>
</div>
<table><tr><th>Key</th><th>Hạn</th><th>Trạng Thái</th><th>Hết Hạn</th><th>Thiết Bị</th></tr>${rows}</table>
</body></html>`;
}

function keyFreePage(keyValue) {
  const key = findKey(keyValue);
  let info;
  if (!key) info = `<p style="color:#fca5a5">Không tìm thấy key: ${keyValue || ''}</p>`;
  else if (key.status !== 'active' || (key.expires_at && key.expires_at < nowStr())) info = `<p style="color:#fca5a5">Key không còn hoạt động hoặc đã hết hạn!</p>`;
  else info = `<p style="color:#6ee7b7">Key hợp lệ!</p><div class="kv"><span>Key:</span><b>${key.key_value}</b></div><div class="kv"><span>Hạn mua:</span><b>${key.hours}h</b></div><div class="kv"><span>Ngày tạo:</span><b>${key.created_at}</b></div><div class="kv"><span>Hết hạn:</span><b>${key.expires_at}</b></div><div class="kv"><span>Thiết bị:</span><b>${key.device_id || 'Chưa kích hoạt'}</b></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BON SHOP - Kiểm Tra Key</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;background:linear-gradient(135deg,#0f172a,#1e293b);color:#e2e8f0;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;padding:24px}.box{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;max-width:420px;width:100%}.kv{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155}.kv span{color:#94a3b8}button{width:100%;margin-top:20px;padding:12px;border:0;border-radius:10px;background:#f59e0b;color:#111827;font-weight:bold;font-size:15px;cursor:pointer}</style></head><body>
<div class="box"><h1 style="margin-top:0;color:#fbbf24">🔑 BON SHOP</h1>${info}<button onclick="window.close()">Đóng</button></div>
</body></html>`;
}

function storePage() {
  const pkgs = [
    { name: 'Key 1 Ngày', price: '20K', hours: '24h' },
    { name: 'Key 3 Ngày', price: '55K', hours: '72h' },
    { name: 'Key 7 Ngày', price: '120K', hours: '168h' },
    { name: 'Key 30 Ngày', price: '400K', hours: '720h' }
  ];
  const cards = pkgs.map((p) => `<div class="pkg"><b>${p.name}</b><span>${p.hours}</span><h2>${p.price}</h2></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BON SHOP - Cửa Hàng</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;text-align:center}.pkgs{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:20px 0}.pkg{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:20px;min-width:150px}.pkg b{display:block}.pkg span{color:#94a3b8}.pkg h2{color:#fbbf24;margin:10px 0 0}a.cta{display:inline-block;margin-top:16px;padding:12px 24px;background:#f59e0b;color:#111827;text-decoration:none;border-radius:10px;font-weight:bold}h1{color:#fbbf24}</style></head><body>
<h1>🛒 BON SHOP</h1><p style="color:#94a3b8">Bảng giá Key VIP</p>
<div class="pkgs">${cards}</div>
<a class="cta" href="https://t.me/akklanh84">Liên Hệ Mua Key</a>
</body></html>`;
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    json(res, { status: 'error', msg: 'Server error: ' + e.message }, 500);
  });
});

server.listen(PORT, () => {
  console.log(`BON SHOP server running on port ${PORT}`);
});
