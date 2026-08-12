#!/usr/bin/env node
'use strict';
/*
 * ============================================================================
 *  BON SHOP — VIP KEY CHECK + GOLIKE AUTO TOOL SERVER  (Node.js, 1 file)
 * ============================================================================
 *  Port đầy đủ từ bộ PHP (web_BON_TOOL_fixed_v4.zip) sang Node.js thuần,
 *  KHÔNG phụ thuộc npm package nào (chỉ dùng thư viện chuẩn của Node).
 *  Deploy được lên Render (https://bonshop.onrender.com) hoặc bất kỳ host nào
 *  có Node.js >= 18 bằng lệnh:  node server.js
 *
 *  Toàn bộ endpoint mà app BON_TOOL (com.htool) gọi đều có đủ:
 *    GET  /checkkey/api/key.php?APIKey=...
 *    GET  /checkkey/api/check_date_key.php?APIKey=...&end_date_local=...&device_id_local=...
 *    GET  /checkkey/api/api_golike_fb.php?action=get_jobs|complete_job|report_job...
 *    GET  /checkkey/api/api_golike_tiktok.php?action=complete_job&ads_id=...
 *    POST /checkkey/                                    (addHistory - cộng xu)
 *    GET  /checkkey/api/announcement.json
 *    GET  /Key_Free/?key=HD_xxx
 *    GET  /statistics
 *    POST /api/check-key.php                            (API admin, X-API-Key)
 *    GET  /                                             (shop: login/register/mua key)
 *    GET  /admin                                        (quản trị: users/keys/ví/nhiệm vụ)
 *    GET  /BON_TOOL.apk                                 (phát hành APK)
 *
 *  Dữ liệu lưu trong file data.json (tự tạo lần đầu). Có thể cấu hình bằng
 *  biến môi trường (xem CONFIG bên dưới).
 * ============================================================================
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================================================
//  CẤU HÌNH (giữ nguyên giá trị tương đương config.php)
// ============================================================================
const CONFIG = {
  dbFile: process.env.DB_FILE || path.join(__dirname, 'data.json'),
  apiSecret: process.env.API_SECRET || '5jaOqjXofEizsYZ8GkHbD5iZmiaNA6RKXuxGuQArRdM',
  adminEmail: process.env.ADMIN_EMAIL || 'akklanh84@gmail.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'ttht2007',
  keyadmin: process.env.KEYADMIN || 'huongdev8386',
  sessionSecret: process.env.SESSION_SECRET || 'bonshop_session_secret_change_me_7f4a2b9c1d0e',
  port: process.env.PORT || 3000,
  baseUrl: (process.env.BASE_URL || 'https://bonshop.onrender.com').replace(/\/+$/, ''),
  prices: { 24: 2000, 720: 50000, 2160: 120000 },
  banks: {
    Sacombank: { account: '050088931308', name: 'DIEU LANH' },
    VietinBank: { account: '101886569909', name: 'DIEU LANH' },
  },
  withdrawMin: 10000,
  apkPath: process.env.APK_PATH || path.join(__dirname, 'BON_TOOL_onrender.apk'),
};

// ============================================================================
//  TIỆN ÍCH THỜI GIAN / CHUỖI
// ============================================================================
function now() { return new Date(); }

// MySQL-style 'YYYY-MM-DD HH:mm:ss' (local time)
function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function parseDate(s) {
  if (!s) return null;
  if (/^\d+$/.test(String(s))) return new Date(Number(s) * 1000); // epoch seconds
  if (typeof s === 'number') return new Date(s);
  const m = String(s).replace('T', ' ').replace('Z', '').match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function isExpired(expiresAt) {
  const d = parseDate(expiresAt);
  return !d || d.getTime() <= now().getTime();
}

function money(n) {
  return Number(n).toLocaleString('vi-VN') + ' đ';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function randomKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const parts = [];
  for (let j = 0; j < 4; j++) {
    let x = '';
    for (let i = 0; i < 5; i++) x += alphabet[crypto.randomInt(0, alphabet.length)];
    parts.push(x);
  }
  return 'VIP-' + parts.join('-');
}

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

// ============================================================================
//  LỚP LƯU TRỮ (embedded JSON database — tự tạo bảng lần đầu)
// ============================================================================
const schema = () => ({
  users: [],            // {id, username, email, password_hash, role, balance, created_at}
  vip_keys: [],         // {id, key_value, duration_hours, price, expires_at, device_limit, status, user_id, note, created_at}
  key_devices: [],      // {id, key_id, device_hash, first_seen, last_seen}
  balance_transactions: [], // {id, user_id, amount, balance_after, type, description, created_at}
  wallet_requests: [],  // {id, user_id, request_type, amount, bank_name, account_number, account_name, note, status, admin_note, created_at, processed_at}
  fb_jobs: [],          // {id, link, object_id, type, reaction, price, max_uses, used_count, status, created_at}
  tiktok_jobs: [],      // {id, video_url, ads_id, account_id, price, max_uses, used_count, status, created_at}
  job_completions: [],  // {id, platform, job_id, device_hash, user_id, amount, status, created_at}
  job_reports: [],      // {id, platform, job_id, uid, device_hash, description, created_at}
  app_credits: [],      // {id, user_id, device_hash, name_tool, amount, created_at}
  _seq: {},
});

let DB = null;

function dbLoad() {
  try {
    const raw = fs.readFileSync(CONFIG.dbFile, 'utf8');
    const parsed = JSON.parse(raw);
    DB = Object.assign(schema(), parsed);
    for (const t of Object.keys(schema())) if (!DB[t]) DB[t] = [];
    if (!DB._seq) DB._seq = {};
    for (const t of Object.keys(schema())) if (DB._seq[t] === undefined) DB._seq[t] = 0;
  } catch (e) {
    DB = schema();
    for (const t of Object.keys(schema())) DB._seq[t] = 0;
    dbSave();
  }
}

function dbSave() {
  try {
    const tmp = CONFIG.dbFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(DB, null, 2));
    fs.renameSync(tmp, CONFIG.dbFile);
  } catch (e) {
    console.error('[db] save error:', e.message);
  }
}

function nextId(table) {
  DB._seq[table] = (DB._seq[table] || 0) + 1;
  return DB._seq[table];
}

function nowStr() { return fmtDate(now()); }

// Generic filters: where(arr, {key: value}) | where(arr, fn)
function where(arr, f) {
  if (typeof f === 'function') return arr.filter(f);
  return arr.filter((r) => Object.keys(f).every((k) => r[k] === f[k]));
}
function first(arr, f) { return arr.find(typeof f === 'function' ? f : (r) => Object.keys(f).every((k) => r[k] === f[k])); }

// ============================================================================
//  MẬT KHẨU / SESSION
// ============================================================================
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}
function verifyPassword(pw, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts[0] === 'scrypt' && parts.length === 3) {
      const hash = crypto.scryptSync(String(pw), parts[1], 32).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(parts[2], 'hex'));
    }
  } catch (e) { /* ignore */ }
  return false;
}

// In-memory sessions (token -> payload)
const sessions = new Map();

function createSession(payload) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Object.assign({}, payload));
  return token;
}
function getSession(req) {
  const cookie = parseCookies(req.headers.cookie);
  const t = cookie.bon_session;
  return t && sessions.has(t) ? sessions.get(t) : null;
}
function destroySession(req) {
  const cookie = parseCookies(req.headers.cookie);
  if (cookie.bon_session) sessions.delete(cookie.bon_session);
}
function setCookie(res, token, maxAge = 7 * 24 * 3600) {
  res.setHeader('Set-Cookie', `bon_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${maxAge}`);
}
function clearCookie(res) {
  res.setHeader('Set-Cookie', 'bon_session=; Path=/; HttpOnly; Max-Age=0');
}
function parseCookies(h) {
  const out = {};
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ============================================================================
//  HTTP UTILITIES
// ============================================================================
function sendJson(res, data, code = 200) {
  const body = JSON.stringify(data, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function sendHtml(res, html, code = 200, extraHeaders = {}) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, extraHeaders));
  res.end(html);
}

function redirect(res, url) {
  res.writeHead(302, { Location: url });
  res.end();
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseQuery(u) {
  const url = new URL(u, 'http://localhost');
  const out = {};
  for (const [k, v] of url.searchParams) out[k] = v;
  return out;
}

function getParams(req) { return parseQuery(req.url); }

async function jsonBody(req) {
  const raw = await readBody(req);
  try {
    const j = JSON.parse(raw);
    return (j && typeof j === 'object') ? j : {};
  } catch (e) {
    const out = {};
    for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
    return out;
  }
}

// ============================================================================
//  API 1: GET /checkkey/api/key.php  — kích hoạt / kiểm tra key VIP
// ============================================================================
function apiKeyCheck(params) {
  const key = String(params.APIKey || params.api_key || params.key || '').trim();
  const deviceId = String(params.device_id || params.deviceId || '').trim();

  if (!key) return sendJsonError('invalid', 'Thiếu APIKey', 400);

  const vip = first(DB.vip_keys, (r) => r.key_value === key);
  if (!vip) {
    return sendJsonError('invalid', 'Key VIP không tồn tại', 200, { key, api_key: key });
  }
  if (vip.status === 'disabled') {
    return sendJsonError('disabled', 'Key VIP đã bị khóa', 200, { key: vip.key_value, api_key: vip.key_value });
  }
  if (isExpired(vip.expires_at)) {
    vip.status = 'expired';
    dbSave();
    return sendJsonError('expired', 'Key VIP đã hết hạn', 200, { key: vip.key_value, api_key: vip.key_value, end_date: vip.expires_at });
  }

  let deviceCount = 0;
  let deviceIdBound = '';
  if (deviceId !== '') {
    const hash = sha256(deviceId);
    const known = first(DB.key_devices, (r) => r.key_id === vip.id && r.device_hash === hash);
    deviceCount = where(DB.key_devices, (r) => r.key_id === vip.id).length;
    if (!known && deviceCount >= vip.device_limit) {
      return sendJsonError('device_limit', 'Key VIP đã đạt giới hạn thiết bị', 200, { key: vip.key_value, api_key: vip.key_value, device_limit: vip.device_limit });
    }
    if (known) {
      known.last_seen = nowStr();
    } else {
      DB.key_devices.push({ id: nextId('key_devices'), key_id: vip.id, device_hash: hash, first_seen: nowStr(), last_seen: nowStr() });
      deviceCount++;
    }
    deviceIdBound = deviceId;
    dbSave();
  }

  return {
    success: true,
    status: 'success',
    msg: 'Xác thực Server thành công: Key VIP hợp lệ!',
    key: vip.key_value,
    api_key: vip.key_value,
    vip: true,
    duration_hours: vip.duration_hours,
    expires_at: vip.expires_at,
    endDate: vip.expires_at,
    end_date: vip.expires_at,
    create_date: vip.created_at,
    device_ID: deviceIdBound,
    device_id: deviceIdBound,
    device_count: deviceCount,
    device_limit: vip.device_limit,
  };
}

// ============================================================================
//  API 2: GET /checkkey/api/check_date_key.php — kiểm tra định kỳ + gán thiết bị
// ============================================================================
function apiCheckDateKey(params) {
  const key = String(params.APIKey || params.api_key || params.key || '').trim();
  const deviceId = String(params.device_id_local || '').trim();
  const endDateLocal = String(params.end_date_local || '').trim();

  if (!endDateLocal) return sendJsonError('invalid', 'Thiếu end_date_local', 400);
  if (!key) return sendJsonError('invalid', 'Thiếu APIKey', 400);

  const vip = first(DB.vip_keys, (r) => r.key_value === key);
  if (!vip) return sendJsonError('invalid', 'Key VIP không tồn tại', 200, { key, api_key: key });
  if (vip.status === 'disabled') {
    return sendJsonError('disabled', 'Key VIP đã bị khóa', 200, { key: vip.key_value, api_key: vip.key_value });
  }
  if (isExpired(vip.expires_at)) {
    vip.status = 'expired';
    dbSave();
    return sendJsonError('expired', 'Key VIP đã hết hạn', 200, { key: vip.key_value, api_key: vip.key_value, end_date_local: vip.expires_at });
  }

  let deviceCount = 0;
  let deviceIdBound = '';
  if (deviceId !== '') {
    const hash = sha256(deviceId);
    const known = first(DB.key_devices, (r) => r.key_id === vip.id && r.device_hash === hash);
    deviceCount = where(DB.key_devices, (r) => r.key_id === vip.id).length;
    if (!known && deviceCount >= vip.device_limit) {
      return sendJsonError('device_limit', 'Key VIP đã đạt giới hạn thiết bị', 200, { key: vip.key_value, api_key: vip.key_value, device_limit: vip.device_limit });
    }
    if (known) known.last_seen = nowStr();
    else {
      DB.key_devices.push({ id: nextId('key_devices'), key_id: vip.id, device_hash: hash, first_seen: nowStr(), last_seen: nowStr() });
      deviceCount++;
    }
    deviceIdBound = deviceId;
    dbSave();
  }

  return {
    success: true,
    status: 'success',
    msg: 'Xác thực Server thành công: Key VIP hợp lệ!',
    key: vip.key_value,
    api_key: vip.key_value,
    vip: true,
    duration_hours: vip.duration_hours,
    expires_at: vip.expires_at,
    end_date_local: vip.expires_at,
    create_date: vip.created_at,
    device_ID: deviceIdBound,
    device_id: deviceIdBound,
    device_count: deviceCount,
    device_limit: vip.device_limit,
  };
}

// ============================================================================
//  API 3: GET /checkkey/api/api_golike_fb.php — kho job Facebook
// ============================================================================
function apiGoLikeFb(params) {
  const action = String(params.action || '');
  const apiKey = String(params.APIKey || '').trim();
  const deviceId = String(params.device_id_local || '').trim();
  const deviceHash = deviceId !== '' ? sha256(deviceId) : '';

  if (!['get_jobs', 'complete_job', 'report_job'].includes(action)) {
    return { success: false, message: 'Action không hợp lệ', _code: 400 };
  }

  const keyRow = apiKey ? first(DB.vip_keys, (r) => r.key_value === apiKey) : null;
  if (!keyRow) return { success: false, message: 'Key VIP không tồn tại' };
  if (keyRow.status !== 'active' || isExpired(keyRow.expires_at)) {
    if (keyRow.status === 'active') { keyRow.status = 'expired'; dbSave(); }
    return { success: false, message: 'Key VIP hết hạn hoặc bị khóa' };
  }

  if (action === 'get_jobs') {
    let candidates = DB.fb_jobs.filter((j) => j.status === 'active' && j.used_count < j.max_uses);
    if (deviceHash !== '') {
      const done = new Set(where(DB.job_completions, (c) => c.platform === 'facebook' && c.device_hash === deviceHash).map((c) => c.job_id));
      candidates = candidates.filter((j) => !done.has(j.id));
    }
    const job = candidates.length ? candidates[crypto.randomInt(0, candidates.length)] : null;
    if (!job) return { success: false, message: 'Tạm hết nhiệm vụ' };
    return {
      success: true,
      message: 'OK',
      data: {
        id: job.id,
        job_id: job.id,
        link: job.link,
        type: job.type,
        reaction: job.reaction,
        object_id: job.object_id,
        price_per_after_cost: job.price,
        fix_coin: job.price,
        coin: job.price,
      },
    };
  }

  if (action === 'complete_job') {
    const jobId = Number(params.job_id || 0);
    const objectId = String(params.object_id || '').trim();
    if (!jobId || jobId <= 0) return { success: false, message: 'Thiếu job_id' };
    if (!deviceHash) return { success: false, message: 'Thiếu device_id_local' };

    const job = first(DB.fb_jobs, (r) => r.id === jobId);
    if (!job) return { success: false, message: 'Không tìm thấy công việc' };
    if (job.status !== 'active') return { success: false, message: 'Công việc đã bị khóa' };

    const existing = first(DB.job_completions, (c) => c.platform === 'facebook' && c.job_id === jobId && c.device_hash === deviceHash);
    if (!existing) {
      DB.job_completions.push({ id: nextId('job_completions'), platform: 'facebook', job_id: jobId, device_hash: deviceHash, user_id: keyRow.user_id || null, amount: job.price, status: 'done', created_at: nowStr() });
      job.used_count = (job.used_count || 0) + 1;
      dbSave();
    }
    return {
      success: true,
      message: 'Hoàn thành nhiệm vụ Facebook thành công',
      data: {
        job_id: jobId,
        object_id: objectId !== '' ? objectId : job.object_id,
        fix_coin: job.price,
        price_per_after_cost: job.price,
      },
    };
  }

  // report_job
  const jobId = Number(params.job_id || 0);
  const uid = String(params.uid || '').trim();
  const description = String(params.description || '').trim();
  if (!jobId || jobId <= 0) return { success: false, message: 'Thiếu job_id' };
  if (!deviceHash) return { success: false, message: 'Thiếu device_id_local' };

  DB.job_reports.push({ id: nextId('job_reports'), platform: 'facebook', job_id: jobId, uid, device_hash: deviceHash, description, created_at: nowStr() });
  dbSave();
  return { success: true, message: 'Đã ghi nhận báo cáo công việc' };
}

// ============================================================================
//  API 4: GET /checkkey/api/api_golike_tiktok.php — kho job TikTok
// ============================================================================
function apiGoLikeTikTok(params) {
  const action = String(params.action || '');
  const apiKey = String(params.APIKey || '').trim();
  const deviceId = String(params.device_id_local || '').trim();
  const adsId = String(params.ads_id || '').trim();
  const accountId = String(params.account_id || '').trim();

  if (action !== 'complete_job') return { success: false, message: 'Action không hợp lệ', _code: 400 };

  const keyRow = apiKey ? first(DB.vip_keys, (r) => r.key_value === apiKey) : null;
  if (!keyRow) return { success: false, message: 'Key VIP không tồn tại' };
  if (keyRow.status !== 'active' || isExpired(keyRow.expires_at)) {
    if (keyRow.status === 'active') { keyRow.status = 'expired'; dbSave(); }
    return { success: false, message: 'Key VIP hết hạn hoặc bị khóa' };
  }

  if (!adsId) return { success: false, message: 'Thiếu ads_id' };
  if (!deviceId) return { success: false, message: 'Thiếu device_id_local' };

  const deviceHash = sha256(deviceId);
  const job = first(DB.tiktok_jobs, (r) => r.ads_id === adsId);
  const jobId = job ? job.id : 0;
  const price = job ? job.price : 20;
  const jobStatus = job ? job.status : 'active';

  if (jobId > 0 && jobStatus !== 'active') return { success: false, message: 'Công việc đã bị khóa' };

  if (jobId > 0) {
    const existing = first(DB.job_completions, (c) => c.platform === 'tiktok' && c.job_id === jobId && c.device_hash === deviceHash);
    if (!existing) {
      DB.job_completions.push({ id: nextId('job_completions'), platform: 'tiktok', job_id: jobId, device_hash: deviceHash, user_id: keyRow.user_id || null, amount: price, status: 'done', created_at: nowStr() });
      job.used_count = (job.used_count || 0) + 1;
      dbSave();
    }
  }

  return {
    success: true,
    message: 'Hoàn thành nhiệm vụ TikTok thành công',
    data: { ads_id: adsId, account_id: accountId, fix_coin: price },
  };
}

// ============================================================================
//  API 5: POST /checkkey/ — addHistory (cộng xu cho user sở hữu key)
// ============================================================================
async function apiAddHistory(req, res) {
  const body = await jsonBody(req);
  const keyadmin = String(body.keyadmin || '').trim();
  if (keyadmin !== CONFIG.keyadmin) return sendJson(res, { success: false, message: 'Sai keyadmin' }, 403);

  const action = String(body.action || '');
  if (action !== 'addHistory') return sendJson(res, { success: false, message: 'Action không hợp lệ' }, 400);

  const nameTool = String(body.name_tool || '').trim();
  const deviceId = String(body.device_id || '').trim();
  const moneyAmt = Number(body.money || 0);

  if (!deviceId || !(moneyAmt > 0)) return sendJson(res, { success: false, message: 'Thiếu device_id hoặc money' });
  if (moneyAmt > 100000) return sendJson(res, { success: false, message: 'Số tiền cộng quá lớn' });

  const deviceHash = sha256(deviceId);

  // Tìm key VIP còn hạn gắn với thiết bị -> user sở hữu key
  const devices = where(DB.key_devices, (d) => d.device_hash === deviceHash)
    .sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen)));
  let keyRow = null;
  for (const d of devices) {
    const k = first(DB.vip_keys, (r) => r.id === d.key_id);
    if (k && k.status === 'active' && !isExpired(k.expires_at)) { keyRow = k; break; }
  }

  if (!keyRow || !keyRow.user_id) return sendJson(res, { success: false, message: 'Thiết bị chưa kích hoạt Key VIP' });

  const userId = keyRow.user_id;

  // Giới hạn tốc độ: tối đa 60 lần / giờ / thiết bị
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recent = where(DB.app_credits, (c) => c.device_hash === deviceHash && parseDate(c.created_at) && parseDate(c.created_at).getTime() >= hourAgo);
  if (recent.length >= 60) return sendJson(res, { success: false, message: 'Đã vượt giới hạn cộng xu trong giờ này' });

  const user = first(DB.users, (r) => r.id === userId);
  if (!user) return sendJson(res, { success: false, message: 'Không tìm thấy tài khoản' });

  const newBalance = (user.balance || 0) + moneyAmt;
  user.balance = newBalance;
  DB.balance_transactions.push({ id: nextId('balance_transactions'), user_id: userId, amount: moneyAmt, balance_after: newBalance, type: 'admin_topup', description: 'App ' + (nameTool || 'GOLIKE'), created_at: nowStr() });
  DB.app_credits.push({ id: nextId('app_credits'), user_id: userId, device_hash: deviceHash, name_tool: nameTool, amount: moneyAmt, created_at: nowStr() });
  dbSave();

  const uname = user.username || user.email || '';
  return sendJson(res, {
    success: true,
    message: 'Đã cộng ' + moneyAmt + ' xu cho ' + nameTool,
    data: { username: uname, balance: newBalance, money: moneyAmt },
  });
}

// ============================================================================
//  API 6: GET /checkkey/api/announcement.json
// ============================================================================
function announcement() {
  return {
    is_show: false,
    id: 'UPDATE',
    version_code: 10,
    versionCode: 10,
    version: '10.0',
    version_name: '10.0',
    title: '🚀 CẬP NHẬT MỚI',
    message: 'Đã có phiên bản mới v10.1. Vui lòng cập nhật để sử dụng mượt mà!',
    download_url: CONFIG.baseUrl + '/BON_TOOL.apk',
    downloadUrl: CONFIG.baseUrl + '/BON_TOOL.apk',
    force_update: false,
    forceUpdate: false,
  };
}

// ============================================================================
//  API 7: POST /api/check-key.php — API admin (X-API-Key)
// ============================================================================
async function apiCheckKeyAdmin(req, res, params) {
  const secret = req.headers['x-api-key'] || params.api_key || '';
  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(String(secret)), Buffer.from(CONFIG.apiSecret));
  } catch (e) { ok = secret === CONFIG.apiSecret; }
  if (!ok) return sendJson(res, { success: false, message: 'Unauthorized' }, 401);

  const body = await jsonBody(req);
  const key = String(body.key || body.key_value || '').trim();
  const device = String(body.device_hash || '').replace(/[^a-fA-F0-9]/g, '');

  if (!key || device.length !== 64) {
    return sendJson(res, { success: false, status: 'invalid_request', message: 'key và device_hash SHA-256 64 hex là bắt buộc' }, 400);
  }

  const k = first(DB.vip_keys, (r) => r.key_value === key);
  if (!k) return sendJson(res, { success: false, status: 'invalid', message: 'Key không tồn tại' }, 404);
  if (k.status === 'disabled') return sendJson(res, { success: false, status: 'disabled', message: 'Key đã bị khóa' }, 403);
  if (isExpired(k.expires_at)) {
    k.status = 'expired'; dbSave();
    return sendJson(res, { success: false, status: 'expired', message: 'Key đã hết hạn', expires_at: k.expires_at });
  }

  const known = first(DB.key_devices, (d) => d.key_id === k.id && d.device_hash === device);
  const count = where(DB.key_devices, (d) => d.key_id === k.id).length;
  if (!known && count >= k.device_limit) {
    return sendJson(res, { success: false, status: 'device_limit', message: 'Key đã đạt giới hạn thiết bị', device_limit: k.device_limit }, 409);
  }
  if (known) known.last_seen = nowStr();
  else DB.key_devices.push({ id: nextId('key_devices'), key_id: k.id, device_hash: device, first_seen: nowStr(), last_seen: nowStr() });
  dbSave();

  return sendJson(res, {
    success: true,
    status: 'active',
    message: 'Key hợp lệ',
    key: k.key_value,
    expires_at: k.expires_at,
    device_limit: k.device_limit,
  });
}

// ============================================================================
//  HELPERS: trang Web
// ============================================================================
function sendJsonError(status, msg, code, extra) {
  return Object.assign({ status, msg, success: status === 'success' }, extra, { _code: code || 200 });
}

function pageShell(title, content, opts = {}) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;font:15px Arial;background:radial-gradient(circle at 82% -5%,#19336b 0,transparent 32%),radial-gradient(circle at 0% 45%,#10254a 0,transparent 27%),#070b16;color:#edf2ff}
.wrap{max-width:${opts.wide ? 1180 : 760}px;margin:auto;padding:22px}
.card{background:#11192b;border:1px solid #283754;border-radius:18px;padding:20px;margin-bottom:18px;box-shadow:0 12px 35px #0004}
.card h1,.card h2{margin-top:0}.card h2{font-size:19px}
.badge{display:inline-block;padding:7px 13px;border:1px solid #3b5fa4;border-radius:99px;color:#8fb5ff;font-size:11px;font-weight:800;letter-spacing:1.5px}
.btn,button{border:0;border-radius:10px;padding:11px 15px;background:#3566ff;color:#fff;font-weight:700;cursor:pointer}
.danger{background:#b42318}.green{background:#16803c}
input,select{padding:11px;border-radius:9px;border:1px solid #34445f;background:#0b1324;color:#fff}
table{width:100%;border-collapse:collapse;font-size:13px}
td,th{padding:9px;border-bottom:1px solid #293753;text-align:left}
th{color:#8998b0}.key{font-family:monospace;color:#6ee7ff}
.muted{color:#9eabc0}a{color:#8fb5ff}
.notice{margin:14px 0;padding:10px;border-radius:10px;background:#17233a;color:#dce7ff}
.wallet-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.plan{padding:20px;border:1px solid #31415f;border-radius:16px;background:#0c1425}
.price{font-size:28px;font-weight:800}
.inline-form{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.inline-form input{max-width:130px}
.positive{color:#62e7a0}.negative{color:#ff7777}
.status-pending{color:#ffd166}.status-approved{color:#65e572}.status-rejected{color:#ff7777}
.bank{padding:15px;border:1px solid #31415f;border-radius:12px;background:#0c1425;margin:10px 0}
.bank b{color:#6ee7ff}
.admin-tabs{display:flex;gap:8px;overflow:auto;margin:16px 0}
.admin-tab{white-space:nowrap;border:1px solid #2b4063;background:#0e182a;color:#cbd6eb;padding:11px 15px;border-radius:11px;cursor:pointer}
.admin-tab.active{background:#3566ff;border-color:#3566ff;color:#fff}
.admin-panel{display:none}.admin-panel.active{display:block}
.admin-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
.stat-card{padding:18px;border:1px solid #263a5b;border-radius:16px;background:#0d1729}
.stat-card span{display:block;color:#8998b0;font-size:12px}.stat-card b{display:block;font-size:28px;margin-top:7px}
code{font-size:11px;color:#aab9d3}
.menu-toggle{position:fixed;left:16px;top:16px;z-index:1100;width:48px;height:48px;border-radius:14px;background:#3566ff;color:#fff;border:0;font-size:25px}
.side-menu{position:fixed;left:0;top:0;bottom:0;width:280px;background:#0d1527;border-right:1px solid #283754;z-index:1200;transform:translateX(-105%);transition:.22s ease;overflow-y:auto}
.side-menu.open{transform:translateX(0)}
.side-menu a{display:block;padding:14px 12px;color:#eaf0ff;text-decoration:none;border-radius:10px}
.side-menu a:hover{background:#17243d}
.side-head{display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid #283754}
.user-main{padding-top:20px}
@media(max-width:700px){.grid,.admin-stats{grid-template-columns:1fr 1fr}.wallet-grid{grid-template-columns:1fr}.card{overflow:auto}}
</style></head><body><div class="wrap">${content}</div>
<script>
function admintab(n,btn){document.querySelectorAll('.admin-panel').forEach(function(x){x.classList.remove('active')});var el=document.getElementById('admin-'+n);if(el)el.classList.add('active');document.querySelectorAll('.admin-tab').forEach(function(x){x.classList.remove('active')});if(btn)btn.classList.add('active');}
function toggleMenu(){var m=document.getElementById('sideMenu');if(m)m.classList.toggle('open');}
</script></body></html>`;
}

// ============================================================================
//  WEB: /statistics
// ============================================================================
function pageStatistics() {
  const users = DB.users.length;
  const keys = DB.vip_keys.length;
  const keysActive = where(DB.vip_keys, (k) => k.status === 'active' && !isExpired(k.expires_at)).length;
  const devices = DB.key_devices.length;
  const earned = DB.balance_transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const fbDone = where(DB.job_completions, (c) => c.platform === 'facebook').length;
  const ttDone = where(DB.job_completions, (c) => c.platform === 'tiktok').length;
  const recent = DB.job_completions.slice().sort((a, b) => b.id - a.id).slice(0, 12);

  const rows = recent.map((c) => {
    const u = first(DB.users, (r) => r.id === c.user_id);
    return `<tr><td>${esc((c.platform || '').toUpperCase())}</td><td><b style="color:#66e3ff">+${c.amount}</b></td><td>${esc(u ? (u.username || u.email) : '-')}</td><td>${esc(c.created_at)}</td></tr>`;
  }).join('');

  const content = `
  <div class="head" style="padding:26px;border:1px solid #2a3e68;border-radius:22px;background:linear-gradient(135deg,#111f3a,#0b1426);text-align:center;margin-bottom:16px">
    <div class="badge">✦ BON SHOP · THỐNG KÊ</div>
    <h1 style="margin:14px 0 4px;font-size:28px">BON SHOP</h1>
    <p class="muted" style="margin:0">Hệ thống dịch vụ số · cập nhật theo thời gian thực</p>
  </div>
  <div class="grid">
    <div class="card"><span>Người dùng</span><b>${users.toLocaleString('vi-VN')}</b></div>
    <div class="card"><span>Key VIP đang hoạt động</span><b>${keysActive.toLocaleString('vi-VN')}<div class="muted" style="font-size:12px">/ tổng ${keys.toLocaleString('vi-VN')} key</div></b></div>
    <div class="card"><span>Thiết bị kích hoạt</span><b>${devices.toLocaleString('vi-VN')}</b></div>
    <div class="card"><span>Tổng xu đã chi trả</span><b>${earned.toLocaleString('vi-VN')}<div class="muted" style="font-size:12px">xu</div></b></div>
    <div class="card"><span>Nhiệm vụ Facebook</span><b>${fbDone.toLocaleString('vi-VN')}<div class="muted" style="font-size:12px">đã hoàn thành</div></b></div>
    <div class="card"><span>Nhiệm vụ TikTok</span><b>${ttDone.toLocaleString('vi-VN')}<div class="muted" style="font-size:12px">đã hoàn thành</div></b></div>
  </div>
  <div class="card"><h2 style="margin:0 0 12px">🕒 Hoạt động gần đây</h2>
    ${recent.length ? `<table><tr><th>Nền tảng</th><th>Xu</th><th>Người dùng</th><th>Thời gian</th></tr>${rows}</table>` : '<p class="muted">Chưa có hoạt động nào.</p>'}
  </div>
  <div class="muted" style="text-align:center;margin-top:16px">BON SHOP · Đơn giản · Nhanh · Tiện lợi</div>`;
  return pageShell('BON SHOP — Thống kê', content);
}

// ============================================================================
//  WEB: /Key_Free/?key=HD_xxx
// ============================================================================
function pageKeyFree(params) {
  const key = String(params.key || '').trim();
  const hasKey = key !== '';
  const keyBox = hasKey
    ? `<h1>Mã kích hoạt của bạn</h1>
       <p>Sao chép mã bên dưới, quay lại app BON_TOOL và dán vào ô kích hoạt Key Free.</p>
       <div class="keybox" id="keyValue" style="margin:18px 0;padding:18px;border:1px dashed #3b5fa4;border-radius:16px;background:#0c1425;font-family:monospace;font-size:20px;font-weight:800;color:#66e3ff;word-break:break-all;user-select:all">${esc(key)}</div>
       <button class="btn" id="copyBtn" onclick="copyKey()" style="width:100%">📋 Sao chép mã</button>`
    : `<h1 style="color:#ff7777">Thiếu mã key</h1>
       <p>Không tìm thấy mã kích hoạt. Vui lòng mở đúng link trong app BON_TOOL.</p>`;
  const content = `<div class="card" style="max-width:420px;margin:auto;text-align:center;padding:30px">
    <div class="badge">✦ BON SHOP · KEY FREE</div>
    ${keyBox}
    <div style="margin-top:18px;font-size:12px;color:#6f7f9e">${hasKey ? 'Nhấn vào ô mã hoặc nút bên trên để sao chép.' : ''}</div>
    <div style="margin-top:22px;font-size:11px;color:#5d6b86">BON SHOP · Hệ sinh thái dịch vụ số</div>
  </div>
  <script>
  function copyKey(){var box=document.getElementById('keyValue');if(!box)return;
    function done(){var b=document.getElementById('copyBtn');b.textContent='✅ Đã sao chép!';}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(box.textContent).then(done).catch(function(){fallback(box.textContent);done();});}
    else{fallback(box.textContent);done();}}
  function fallback(t){var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);}
  </script>`;
  return pageShell('BON SHOP — Key Free', content);
}

// ============================================================================
//  WEB: Login / Register
// ============================================================================
function pageAuth(msg, adminLogin) {
  const content = `<div class="card" style="max-width:430px;margin:60px auto">
    <h1 style="font-size:42px;margin:0 0 14px">${adminLogin ? 'ADMIN LOGIN' : 'VIP SHOP'}</h1>
    <p class="muted">Đăng nhập bằng username hoặc Gmail/Email</p>
    ${msg ? `<div class="notice">${esc(msg)}</div>` : ''}
    <form method="post">
      <input style="width:100%" type="text" name="login_id" placeholder="Username hoặc Gmail/Email" required><br><br>
      <input style="width:100%" type="password" name="pass" placeholder="Mật khẩu" required><br><br>
      <button name="login" style="width:100%">Đăng nhập</button>
    </form>
    ${adminLogin
      ? `<div class="switch" style="text-align:center;margin-top:18px"><a href="./">← Quay lại VIP Shop</a></div>`
      : `<div class="switch" style="text-align:center;margin-top:18px">Chưa có tài khoản? <a href="#" onclick="showRegister();return false;">Đăng ký</a></div>
         <div style="text-align:center;margin-top:28px;font-size:12px"><a href="admin" style="color:#6f7f9e;text-decoration:none">Đăng nhập quản trị viên</a></div>`}
  </div>
  <div id="registerBox" style="display:none;max-width:430px;margin:auto">
    <div class="card"><h1 style="margin:0 0 14px">ĐĂNG KÝ</h1><p class="muted">Tạo tài khoản để mua Key VIP</p>
    ${msg ? `<div class="notice">${esc(msg)}</div>` : ''}
    <form method="post">
      <input style="width:100%" type="text" name="username" placeholder="Username" pattern="[A-Za-z0-9_]{3,30}" minlength="3" maxlength="30" required><br><br>
      <input style="width:100%" type="email" name="email" placeholder="Gmail / Email" required><br><br>
      <input style="width:100%" type="password" name="pass" placeholder="Mật khẩu >= 6 ký tự" minlength="6" required><br><br>
      <button name="register" style="width:100%">Đăng ký</button>
    </form>
    <div class="switch" style="text-align:center;margin-top:18px">Đã có tài khoản? <a href="#" onclick="showLogin();return false;">Đăng nhập</a></div>
    </div>
  </div>
  <script>function showRegister(){document.getElementById('registerBox').style.display='block'}function showLogin(){document.getElementById('registerBox').style.display='none'}</script>`;
  return pageShell(adminLogin ? 'ADMIN LOGIN' : 'VIP SHOP', content);
}

// ============================================================================
//  WEB: User dashboard
// ============================================================================
function pageUser(u, msg, c) {
  const myKeys = DB.vip_keys.filter((k) => k.user_id === u.id).sort((a, b) => b.id - a.id).slice(0, 10);
  const myReqs = DB.wallet_requests.filter((r) => r.user_id === u.id).sort((a, b) => b.id - a.id).slice(0, 10);

  const keyRows = myKeys.map((k) => `<tr><td class="key">${esc(k.key_value)}</td><td>${esc(k.duration_hours)}h / ${money(k.price)}</td><td>${esc(k.expires_at || '-')}</td><td>${esc(k.status)}</td></tr>`).join('');
  const reqRows = myReqs.length ? myReqs.map((r) => `<tr><td>${r.request_type === 'deposit' ? 'Nạp' : 'Rút'}</td><td>${money(r.amount)}</td><td>${esc(r.bank_name)}</td><td>${esc(r.account_number || '-')}</td><td class="status-${esc(r.status)}">${esc(r.status)}</td><td>${esc(r.created_at)}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">Chưa có yêu cầu nào.</td></tr>';

  const bankOptions = Object.keys(CONFIG.banks).map((b) => `<option>${esc(b)}</option>`).join('');
  const bankCards = Object.entries(CONFIG.banks).map(([bn, b]) => `<div class="bank"><b>Ngân hàng: ${esc(bn)}</b><br>STK: <b>${esc(b.account)}</b><br>Tên: <b>${esc(b.name)}</b></div>`).join('');
  const plans = [[24, '1 ngày'], [720, '30 ngày'], [2160, '90 ngày']].map(([hours, name]) => {
    const price = CONFIG.prices[hours];
    return `<div class="plan"><h2 style="margin:0">${name}</h2><div class="price">${money(price)}</div><p class="muted">${hours} giờ VIP</p>
      <form method="post"><input type="hidden" name="hours" value="${hours}"><button name="buy" style="width:100%">Mua ngay</button></form></div>`;
  }).join('');

  const content = `
  <button class="menu-toggle" onclick="toggleMenu()">☰</button>
  <div id="sideMenu" class="side-menu">
    <div class="side-head"><div style="font-size:22px;font-weight:900">BON SHOP</div><button class="btn" onclick="toggleMenu()" style="background:transparent;font-size:26px;padding:0 8px">×</button></div>
    <div style="padding:20px;background:#111d33;border-bottom:1px solid #283754">
      <div style="font-size:18px;font-weight:800;overflow-wrap:anywhere">${esc(u.username || u.email)}</div>
      <div style="margin-top:7px;color:#66e3ff;font-weight:800">Số dư ${money(u.balance)}</div>
    </div>
    <a href="#" onclick="location.href='./';return false;">🏠 Trang chủ</a>
    <a href="#deposit" onclick="location.hash='deposit'">💰 Nạp tiền</a>
    <a href="#withdraw" onclick="location.hash='withdraw'">💸 Rút tiền</a>
    <a href="#buy" onclick="location.hash='buy'">🔑 Mua Key</a>
    <a href="?logout">🚪 Đăng xuất</a>
  </div>
  <main class="user-main">
  ${msg ? `<div class="card notice">${esc(msg)}</div>` : ''}
  <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
    <div><div class="badge">✦ NỀN TẢNG DỊCH VỤ SỐ</div><h1 style="margin:10px 0 4px;font-size:34px">Xin chào, <span style="color:#4f7cff">${esc(u.username || 'Bạn')}</span></h1>
    <p class="muted" style="margin:0">Số dư: <b style="color:#66e3ff">${money(u.balance)}</b></p></div>
    <a class="btn" href="./#buy" style="text-decoration:none">🔑 Mua Key VIP</a>
  </div></div>

  <div class="card" id="deposit"><h2>💰 Nạp tiền</h2>
    <p class="muted">Chuyển khoản theo một trong các ngân hàng bên dưới. <b>Nội dung chuyển khoản phải ghi đúng username của bạn</b>. Sau khi chuyển, gửi yêu cầu để admin duyệt.</p>
    ${bankCards}
    <form method="post" class="wallet-grid">
      <div><label>Ngân hàng nhận</label><br><select name="bank" style="width:100%" required>${bankOptions}</select></div>
      <div><label>Số tiền đã chuyển</label><br><input name="amount" type="number" min="1000" step="1000" placeholder="Ví dụ 50000" style="width:100%" required></div>
      <div style="grid-column:1/-1"><label>Nội dung chuyển khoản</label><br><input name="note" placeholder="Ví dụ: username của bạn" style="width:100%" required></div>
      <div style="grid-column:1/-1"><button name="deposit_request">Tôi đã chuyển khoản - Gửi yêu cầu nạp</button></div>
    </form>
  </div>

  <div class="card" id="withdraw"><h2>💸 Rút tiền</h2>
    <p class="muted">Số tiền rút tối thiểu: <b>${money(CONFIG.withdrawMin)}</b>. Tiền sẽ được giữ lại khi gửi yêu cầu; nếu admin từ chối, hệ thống hoàn lại.</p>
    <form method="post" class="wallet-grid">
      <div><label>Ngân hàng</label><br><select name="bank" style="width:100%" required>${bankOptions}</select></div>
      <div><label>Số tiền rút</label><br><input name="amount" type="number" min="${CONFIG.withdrawMin}" step="1000" style="width:100%" required></div>
      <div><label>Số tài khoản</label><br><input name="account_number" style="width:100%" required></div>
      <div><label>Tên chủ tài khoản</label><br><input name="account_name" style="width:100%" required></div>
      <div style="grid-column:1/-1"><button name="withdraw_request">Gửi yêu cầu rút tiền</button></div>
    </form>
  </div>

  <div class="card"><h2>📋 Yêu cầu nạp/rút gần đây</h2>
    <table><tr><th>Loại</th><th>Số tiền</th><th>Ngân hàng</th><th>STK</th><th>Trạng thái</th><th>Thời gian</th></tr>${reqRows}</table>
  </div>

  <div class="card" id="buy"><h2>🛒 Mua Key VIP</h2><div class="grid">${plans}</div></div>

  <div class="card"><h2>🔑 Key của tôi</h2>
    <table><tr><th>Key</th><th>Gói</th><th>Hết hạn</th><th>Trạng thái</th></tr>${keyRows || '<tr><td colspan="4" class="muted">Bạn chưa có key nào.</td></tr>'}</table>
  </div>
  </main>`;
  return pageShell('BON SHOP — Tài khoản', content);
}

// ============================================================================
//  WEB: Admin panel
// ============================================================================
function pageAdmin(admin, msg) {
  const users = DB.users.slice().sort((a, b) => b.id - a.id);
  const keys = DB.vip_keys.slice().sort((a, b) => b.id - a.id);
  const devices = DB.key_devices.slice().sort((a, b) => b.id - a.id);
  const tx = DB.balance_transactions.slice().sort((a, b) => b.id - a.id).slice(0, 200);
  const wallet = DB.wallet_requests.slice().sort((a, b) => b.id - a.id).slice(0, 200);
  const fbJobs = DB.fb_jobs.slice().sort((a, b) => b.id - a.id).slice(0, 200);
  const ttJobs = DB.tiktok_jobs.slice().sort((a, b) => b.id - a.id).slice(0, 200);
  const doneJobs = DB.job_completions.slice().sort((a, b) => b.id - a.id).slice(0, 100);
  const reports = DB.job_reports.slice().sort((a, b) => b.id - a.id).slice(0, 50);

  const uname = (id) => { const u = first(DB.users, (r) => r.id === id); return u ? (u.username || u.email || '-') : '-'; };
  const keyOf = (kid) => { const k = first(DB.vip_keys, (r) => r.id === kid); return k ? k.key_value : '?'; };

  const usersRows = users.map((u) => `
    <tr><td>${u.id}</td><td><b>${esc(u.username || '-')}</b></td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td><b>${money(u.balance)}</b></td><td>${esc(u.created_at)}</td>
    <td><form method="post" class="inline-form"><input type="hidden" name="uid" value="${u.id}"><input type="number" name="amount" min="1" step="1000" placeholder="VNĐ" required>
      <button name="topup" value="1">+ Cộng</button><button class="danger" name="deduct" value="1" onclick="return confirm('Xác nhận trừ số dư?')">− Trừ</button></form></td></tr>`).join('');

  const userOptions = `<option value="0">— Chưa gán (key tự do) —</option>` + users.map((u) => `<option value="${u.id}">${esc(u.username || u.email)}</option>`).join('');

  const keyRows = keys.map((k) => `
    <tr><td>${k.id}</td><td class="key">${esc(k.key_value)}</td><td>${esc(k.duration_hours)}h</td><td>${money(k.price)}</td>
    <td>${esc(k.user_id ? uname(k.user_id) : '-')}</td><td>${esc(k.expires_at || '-')}</td><td>${esc(k.device_limit)}</td><td>${esc(k.status)}</td>
    <td><form method="post" class="inline-form"><input type="hidden" name="id" value="${k.id}"><input name="hours" type="number" min="1" value="24" style="width:65px"><button name="extend">+ giờ</button>
    ${k.status === 'active' ? `<button class="danger" name="act" value="disable">Khóa</button>` : `<button class="green" name="act" value="enable">Mở</button>`}
    <button name="act" value="reset">Reset</button><button class="danger" name="act" value="delete" onclick="return confirm('Xóa key này?')">Xóa</button></form></td></tr>`).join('');

  const devRows = devices.map((d) => `<tr><td>${d.id}</td><td class="key">${esc(keyOf(d.key_id))}</td><td>${esc(uname(first(DB.vip_keys, (r) => r.id === d.key_id)?.user_id))}</td><td><code>${esc(String(d.device_hash).slice(0, 16))}…</code></td><td>${esc(d.first_seen)}</td><td>${esc(d.last_seen)}</td></tr>`).join('');

  const walletRows = wallet.map((r) => `
    <tr><td>${r.id}</td><td>${esc(uname(r.user_id))}</td><td>${r.request_type === 'deposit' ? 'Nạp' : 'Rút'}</td><td>${money(r.amount)}</td>
    <td>${esc(r.bank_name)}</td><td>${esc(r.account_number || '-')}</td><td>${esc(r.account_name || '-')}</td><td>${esc(r.note || '-')}</td>
    <td class="status-${esc(r.status)}">${esc(r.status)}</td>
    <td>${r.status === 'pending'
      ? `<form method="post" class="inline-form"><input type="hidden" name="rid" value="${r.id}"><button class="green" name="wallet_action" value="approve">Duyệt</button><button class="danger" name="wallet_action" value="reject">Từ chối</button></form>`
      : 'Đã xử lý'}</td></tr>`).join('');

  const txRows = tx.map((t) => `<tr><td>${t.id}</td><td>${esc(uname(t.user_id))}</td><td class="${t.amount < 0 ? 'negative' : 'positive'}">${money(t.amount)}</td><td>${money(t.balance_after)}</td><td>${esc(t.type)}</td><td>${esc(t.description || '-')}</td><td>${esc(t.created_at)}</td></tr>`).join('');

  const fbRows = fbJobs.map((j) => `
    <tr><td>${j.id}</td><td><a target="_blank" rel="noopener" href="${esc(j.link)}">mở</a></td><td><code>${esc(j.object_id)}</code></td><td>${esc(j.type)}</td><td>${esc(j.reaction)}</td><td>${esc(j.price)}</td><td>${esc(j.used_count)}/${esc(j.max_uses)}</td><td>${esc(j.status)}</td>
    <td><form method="post" class="inline-form"><input type="hidden" name="id" value="${j.id}"><input type="hidden" name="t" value="fb">
    ${j.status === 'active' ? `<button class="danger" name="job_act" value="disable">Khóa</button>` : `<button class="green" name="job_act" value="enable">Mở</button>`}
    <button class="danger" name="job_act" value="delete" onclick="return confirm('Xóa nhiệm vụ?')">Xóa</button></form></td></tr>`).join('');

  const ttRows = ttJobs.map((j) => `
    <tr><td>${j.id}</td><td><code>${esc(j.ads_id)}</code></td><td>${esc(j.account_id)}</td><td>${esc(j.price)}</td><td>${esc(j.used_count)}/${esc(j.max_uses)}</td><td>${esc(j.status)}</td>
    <td><form method="post" class="inline-form"><input type="hidden" name="id" value="${j.id}"><input type="hidden" name="t" value="tt">
    ${j.status === 'active' ? `<button class="danger" name="job_act" value="disable">Khóa</button>` : `<button class="green" name="job_act" value="enable">Mở</button>`}
    <button class="danger" name="job_act" value="delete" onclick="return confirm('Xóa nhiệm vụ?')">Xóa</button></form></td></tr>`).join('');

  const doneRows = doneJobs.map((c) => `<tr><td>${c.id}</td><td>${esc(String(c.platform).toUpperCase())}</td><td>${esc(c.job_id)}</td><td>${esc(uname(c.user_id))}</td><td>${esc(c.amount)}</td><td><code>${esc(String(c.device_hash).slice(0, 12))}…</code></td><td>${esc(c.created_at)}</td></tr>`).join('');

  const reportRows = reports.map((r) => `<tr><td>${r.id}</td><td>${esc(String(r.platform).toUpperCase())}</td><td>${esc(r.job_id)}</td><td>${esc(r.uid || '-')}</td><td>${esc(r.description || '-')}</td><td><code>${esc(String(r.device_hash).slice(0, 12))}…</code></td><td>${esc(r.created_at)}</td></tr>`).join('');

  const content = `
  <div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
    <div><div class="badge">BON SHOP · CONTROL CENTER</div><h1 style="margin:8px 0 4px">👑 Quản trị hệ thống</h1><p class="muted" style="margin:0">${esc(admin.email)}</p></div>
    <a class="btn" href="?logout" style="background:#1a2943;text-decoration:none">Đăng xuất</a>
  </div>
  ${msg ? `<div class="card notice">${esc(msg)}</div>` : ''}
  <div class="admin-stats">
    <div class="stat-card"><span>Users</span><b>${users.length}</b></div>
    <div class="stat-card"><span>VIP Keys</span><b>${keys.length}</b></div>
    <div class="stat-card"><span>Thiết bị</span><b>${devices.length}</b></div>
    <div class="stat-card"><span>Yêu cầu ví</span><b>${wallet.length}</b></div>
  </div>
  <div class="admin-tabs">
    <button class="admin-tab active" onclick="admintab('users',this)">👤 Users</button>
    <button class="admin-tab" onclick="admintab('keys',this)">🔑 VIP Keys</button>
    <button class="admin-tab" onclick="admintab('devices',this)">📱 Devices</button>
    <button class="admin-tab" onclick="admintab('wallet',this)">💳 Nạp/Rút</button>
    <button class="admin-tab" onclick="admintab('transactions',this)">📊 Giao dịch</button>
    <button class="admin-tab" onclick="admintab('jobs',this)">⚙️ Nhiệm vụ</button>
  </div>

  <section id="admin-users" class="admin-panel active"><div class="card"><h2>👤 Quản lý Users</h2>
    <table><tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Số dư</th><th>Tạo lúc</th><th>Điều chỉnh</th></tr>${usersRows}</table>
  </div></section>

  <section id="admin-keys" class="admin-panel"><div class="card"><h2>🔑 VIP Keys</h2>
    <div class="card" style="margin:0 0 14px;background:#0d1729;border:1px solid #2a3f63"><h3 style="margin:0 0 10px">➕ Tạo Key VIP mới</h3>
      <form method="post" class="wallet-grid">
        <div><label>Gán cho user</label><br><select name="uid" style="width:100%">${userOptions}</select></div>
        <div><label>Số giờ</label><br><input name="hours" type="number" min="1" value="720" style="width:100%" required></div>
        <div><label>Giá ghi trên key</label><br><input name="price" type="number" min="0" value="50000" style="width:100%"></div>
        <div><label>Ghi chú</label><br><input name="note" placeholder="Ví dụ: Key tặng" style="width:100%"></div>
        <div style="grid-column:1/-1"><button name="create_key">+ Tạo Key</button></div>
      </form>
    </div>
    <table><tr><th>ID</th><th>Key</th><th>Gói</th><th>Giá</th><th>User</th><th>Hết hạn</th><th>Thiết bị</th><th>Trạng thái</th><th>Thao tác</th></tr>${keyRows}</table>
  </div></section>

  <section id="admin-devices" class="admin-panel"><div class="card"><h2>📱 Key Devices</h2>
    <p class="muted">Thiết bị đã kích hoạt key. Device hash hiển thị rút gọn.</p>
    <table><tr><th>ID</th><th>Key</th><th>User</th><th>Device</th><th>First seen</th><th>Last seen</th></tr>${devRows}</table>
  </div></section>

  <section id="admin-wallet" class="admin-panel"><div class="card"><h2>💳 Yêu cầu Nạp / Rút</h2>
    <table><tr><th>ID</th><th>User</th><th>Loại</th><th>Số tiền</th><th>Ngân hàng</th><th>STK</th><th>Tên</th><th>Nội dung</th><th>Trạng thái</th><th>Xử lý</th></tr>${walletRows}</table>
  </div></section>

  <section id="admin-transactions" class="admin-panel"><div class="card"><h2>📊 Lịch sử số dư</h2>
    <table><tr><th>ID</th><th>User</th><th>Amount</th><th>Balance after</th><th>Type</th><th>Mô tả</th><th>Thời gian</th></tr>${txRows}</table>
  </div></section>

  <section id="admin-jobs" class="admin-panel">
    <div class="card"><h2>⚙️ Nhiệm vụ Facebook (GoLike FB)</h2>
      <p class="muted">Kho job cho auto tool GoLike Facebook. App gọi <code>api_golike_fb.php?action=get_jobs</code> để nhận job này.</p>
      <form method="post" class="wallet-grid">
        <div><label>Link bài viết</label><br><input name="link" placeholder="https://www.facebook.com/..." style="width:100%" required></div>
        <div><label>Object ID</label><br><input name="object_id" placeholder="Facebook post id" style="width:100%" required></div>
        <div><label>Loại</label><br><select name="type" style="width:100%"><option value="like">like</option><option value="share">share</option><option value="comment">comment</option><option value="follow">follow</option></select></div>
        <div><label>Reaction</label><br><select name="reaction" style="width:100%"><option value="like">like</option><option value="love">love</option><option value="haha">haha</option><option value="wow">wow</option><option value="sad">sad</option><option value="angry">angry</option><option value="share">share</option></select></div>
        <div><label>Giá (xu)</label><br><input name="price" type="number" min="1" value="35" style="width:100%" required></div>
        <div><label>Số lượt tối đa</label><br><input name="max_uses" type="number" min="1" value="9999" style="width:100%" required></div>
        <div style="grid-column:1/-1"><button name="add_fb_job">+ Thêm nhiệm vụ Facebook</button></div>
      </form>
      <table><tr><th>ID</th><th>Link</th><th>Object ID</th><th>Loại</th><th>Reaction</th><th>Giá</th><th>Đã dùng</th><th>Trạng thái</th><th>Thao tác</th></tr>${fbRows}</table>
    </div>

    <div class="card"><h2>⚙️ Nhiệm vụ TikTok</h2>
      <p class="muted">Kho job TikTok cho auto tool. App gọi <code>api_golike_tiktok.php?action=complete_job&ads_id=...</code></p>
      <form method="post" class="wallet-grid">
        <div><label>Link video</label><br><input name="video_url" placeholder="https://www.tiktok.com/..." style="width:100%"></div>
        <div><label>Ads ID</label><br><input name="ads_id" placeholder="TikTok video id" style="width:100%" required></div>
        <div><label>Account ID</label><br><input name="account_id" placeholder="Account id" style="width:100%"></div>
        <div><label>Giá (xu)</label><br><input name="price" type="number" min="1" value="20" style="width:100%" required></div>
        <div><label>Số lượt tối đa</label><br><input name="max_uses" type="number" min="1" value="9999" style="width:100%" required></div>
        <div style="grid-column:1/-1"><button name="add_tiktok_job">+ Thêm nhiệm vụ TikTok</button></div>
      </form>
      <table><tr><th>ID</th><th>Ads ID</th><th>Account</th><th>Giá</th><th>Đã dùng</th><th>Trạng thái</th><th>Thao tác</th></tr>${ttRows}</table>
    </div>

    <div class="card"><h2>🕒 Nhiệm vụ đã hoàn thành
      <span style="float:right"><form method="post" style="display:inline"><button class="danger" name="clear_completions" onclick="return confirm('Xóa toàn bộ lịch sử hoàn thành?')">Xóa lịch sử</button></form></span></h2>
      <table><tr><th>ID</th><th>Nền tảng</th><th>Job ID</th><th>User</th><th>Xu</th><th>Thiết bị</th><th>Thời gian</th></tr>${doneRows}</table>
    </div>

    <div class="card"><h2>🚩 Báo cáo lỗi job</h2>
      <table><tr><th>ID</th><th>Nền tảng</th><th>Job ID</th><th>UID</th><th>Mô tả</th><th>Thiết bị</th><th>Thời gian</th></tr>${reportRows}</table>
    </div>
  </section>`;
  return pageShell('BON SHOP — Quản trị', content, { wide: true });
}

// ============================================================================
//  XỬ LÝ FORM (POST) — tương đương phần logic PHP index.php
//  Trả về { flash } và tự đặt session cookie; router render lại trang ngay
//  (không redirect, giống PHP).
// ============================================================================
function handleForms(req, res, body) {
  const session = getSession(req);

  // ---- Đăng ký ----
  if (body.register !== undefined) {
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const pw = String(body.pass || '');
    if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) return { flash: 'Username 3-30 ký tự, chỉ gồm chữ, số và dấu _.' };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pw.length < 6) return { flash: 'Gmail/Email hoặc mật khẩu không hợp lệ.' };
    if (first(DB.users, (u) => u.email === email || u.username === username)) return { flash: 'Username hoặc email đã tồn tại.' };
    DB.users.push({ id: nextId('users'), username, email, password_hash: hashPassword(pw), role: 'user', balance: 0, created_at: nowStr() });
    dbSave();
    return { flash: 'Đăng ký thành công, hãy đăng nhập.' };
  }

  // ---- Đăng nhập (admin hoặc user) ----
  if (body.login !== undefined) {
    const login = String(body.login_id || '').trim();
    const pw = String(body.pass || '');
    const adminId = login.toLowerCase();
    // Admin có thể đăng nhập ngay tại trang chủ nếu nhập đúng email/password admin (giống PHP)
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(login) && adminId === CONFIG.adminEmail.toLowerCase() && pw === CONFIG.adminPassword) {
      setCookie(res, createSession({ role: 'admin', email: adminId }));
      return { flash: '' };
    }
    const user = first(DB.users, (u) => (u.email || '').toLowerCase() === login.toLowerCase() || (u.username || '').toLowerCase() === login.toLowerCase());
    if (user && verifyPassword(pw, user.password_hash)) {
      setCookie(res, createSession({ role: 'user', uid: user.id, email: user.email, username: user.username || '' }));
      return { flash: '' };
    }
    return { flash: 'Sai username/email hoặc mật khẩu.' };
  }

  const role = session ? session.role : '';

  // ================= USER =================
  if (role === 'user' && session.uid) {
    const uid = session.uid;
    const user = first(DB.users, (r) => r.id === uid);
    if (!user) return { flash: 'Tài khoản không tồn tại.' };

    if (body.deposit_request !== undefined) {
      const bank = String(body.bank || '');
      const amount = Number(body.amount || 0);
      const note = String(body.note || '').trim();
      if (!CONFIG.banks[bank] || amount < 1000) return { flash: 'Vui lòng chọn ngân hàng và nhập số tiền hợp lệ.' };
      DB.wallet_requests.push({ id: nextId('wallet_requests'), user_id: uid, request_type: 'deposit', amount, bank_name: bank, account_number: null, account_name: null, note, status: 'pending', admin_note: null, created_at: nowStr(), processed_at: null });
      dbSave();
      return { flash: 'Đã gửi yêu cầu nạp tiền. Chuyển khoản đúng ngân hàng và ghi chú, sau đó chờ admin duyệt.' };
    }

    if (body.withdraw_request !== undefined) {
      const bank = String(body.bank || '');
      const acc = String(body.account_number || '').trim();
      const name = String(body.account_name || '').trim();
      const amount = Number(body.amount || 0);
      if (!CONFIG.banks[bank] || !acc || !name || amount < CONFIG.withdrawMin) {
        return { flash: 'Rút tối thiểu ' + money(CONFIG.withdrawMin) + ' và phải nhập đủ ngân hàng, STK, tên tài khoản.' };
      }
      if (user.balance < amount) return { flash: 'Số dư không đủ.' };
      const newBalance = user.balance - amount;
      user.balance = newBalance;
      DB.wallet_requests.push({ id: nextId('wallet_requests'), user_id: uid, request_type: 'withdraw', amount, bank_name: bank, account_number: acc, account_name: name, note: null, status: 'pending', admin_note: null, created_at: nowStr(), processed_at: null });
      DB.balance_transactions.push({ id: nextId('balance_transactions'), user_id: uid, amount: -amount, balance_after: newBalance, type: 'admin_adjust', description: 'Yêu cầu rút tiền', created_at: nowStr() });
      dbSave();
      return { flash: 'Đã gửi yêu cầu rút tiền. Số dư đã giữ lại và sẽ hoàn khi admin từ chối.' };
    }

    if (body.buy !== undefined) {
      const hours = Number(body.hours || 0);
      const price = CONFIG.prices[hours];
      if (!price) return { flash: 'Gói không hợp lệ.' };
      if (user.balance < price) return { flash: 'Số dư không đủ.' };
      let key;
      do { key = randomKey(); } while (first(DB.vip_keys, (r) => r.key_value === key));
      const exp = fmtDate(new Date(Date.now() + hours * 3600 * 1000));
      user.balance -= price;
      DB.vip_keys.push({ id: nextId('vip_keys'), key_value: key, duration_hours: hours, price, expires_at: exp, device_limit: 1, status: 'active', user_id: uid, note: 'Mua từ website', created_at: nowStr() });
      DB.balance_transactions.push({ id: nextId('balance_transactions'), user_id: uid, amount: -price, balance_after: user.balance, type: 'purchase', description: 'Mua Key VIP', created_at: nowStr() });
      dbSave();
      return { flash: 'Mua thành công: ' + key };
    }
  }

  // ================= ADMIN =================
  if (role === 'admin') {
    if (body.topup !== undefined || body.deduct !== undefined) {
      const uid = Number(body.uid || 0);
      const amount = Number(body.amount || 0);
      const action = body.deduct !== undefined ? 'deduct' : 'topup';
      if (uid <= 0 || !(amount > 0)) return { flash: 'Số tiền phải lớn hơn 0.' };
      const user = first(DB.users, (r) => r.id === uid);
      if (!user) return { flash: 'Không tìm thấy user.' };
      if (action === 'deduct' && user.balance < amount) return { flash: 'Không thể trừ: số dư user không đủ.' };
      const newBalance = action === 'deduct' ? user.balance - amount : user.balance + amount;
      user.balance = newBalance;
      DB.balance_transactions.push({ id: nextId('balance_transactions'), user_id: uid, amount: action === 'deduct' ? -amount : amount, balance_after: newBalance, type: action === 'deduct' ? 'admin_adjust' : 'admin_topup', description: action === 'deduct' ? 'Admin trừ số dư' : 'Admin cộng số dư', created_at: nowStr() });
      dbSave();
      return { flash: action === 'deduct' ? 'Đã trừ số dư user.' : 'Đã cộng số dư.' };
    }

    if (body.wallet_action !== undefined) {
      const rid = Number(body.rid || 0);
      const action = String(body.wallet_action || '');
      const r = first(DB.wallet_requests, (x) => x.id === rid);
      if (!r || r.status !== 'pending') return { flash: 'Yêu cầu không còn chờ xử lý.' };
      if (action === 'approve') {
        r.status = 'approved'; r.processed_at = nowStr();
        if (r.request_type === 'deposit') {
          const user = first(DB.users, (x) => x.id === r.user_id);
          if (user) {
            const nb = user.balance + r.amount;
            user.balance = nb;
            DB.balance_transactions.push({ id: nextId('balance_transactions'), user_id: r.user_id, amount: r.amount, balance_after: nb, type: 'admin_topup', description: 'Nạp tiền - ' + r.bank_name, created_at: nowStr() });
          }
        }
        dbSave();
        return { flash: 'Đã duyệt yêu cầu.' };
      }
      if (action === 'reject') {
        r.status = 'rejected'; r.processed_at = nowStr();
        if (r.request_type === 'withdraw') {
          const user = first(DB.users, (x) => x.id === r.user_id);
          if (user) {
            const nb = user.balance + r.amount;
            user.balance = nb;
            DB.balance_transactions.push({ id: nextId('balance_transactions'), user_id: r.user_id, amount: r.amount, balance_after: nb, type: 'admin_adjust', description: 'Hoàn tiền yêu cầu rút bị từ chối', created_at: nowStr() });
          }
        }
        dbSave();
        return { flash: 'Đã từ chối yêu cầu.' };
      }
      return { flash: 'Thao tác không hợp lệ.' };
    }

    if (body.extend !== undefined) {
      const id = Number(body.id || 0);
      const hours = Math.max(1, Number(body.hours || 0));
      const k = first(DB.vip_keys, (x) => x.id === id);
      if (k) {
        const base = isExpired(k.expires_at) ? Date.now() : parseDate(k.expires_at).getTime();
        k.expires_at = fmtDate(new Date(base + hours * 3600 * 1000));
        k.status = 'active';
        dbSave();
        return { flash: 'Đã gia hạn key.' };
      }
      return { flash: 'Không tìm thấy key.' };
    }

    if (body.create_key !== undefined) {
      const hours = Math.max(1, Number(body.hours || 24));
      const uid = Number(body.uid || 0);
      const price = Math.max(0, Number(body.price || 0));
      const note = String(body.note || '').trim();
      let key;
      do { key = randomKey(); } while (first(DB.vip_keys, (r) => r.key_value === key));
      const exp = fmtDate(new Date(Date.now() + hours * 3600 * 1000));
      DB.vip_keys.push({ id: nextId('vip_keys'), key_value: key, duration_hours: hours, price, expires_at: exp, device_limit: 1, status: 'active', user_id: uid || null, note, created_at: nowStr() });
      dbSave();
      return { flash: 'Đã tạo key: ' + key };
    }

    if (body.act !== undefined) {
      const id = Number(body.id || 0);
      const a = String(body.act || '');
      const k = first(DB.vip_keys, (x) => x.id === id);
      if (!k) return { flash: 'Không tìm thấy key.' };
      if (a === 'disable') k.status = 'disabled';
      if (a === 'enable') k.status = 'active';
      if (a === 'reset') DB.key_devices = DB.key_devices.filter((d) => d.key_id !== id);
      if (a === 'delete') {
        DB.vip_keys = DB.vip_keys.filter((x) => x.id !== id);
        DB.key_devices = DB.key_devices.filter((d) => d.key_id !== id);
      }
      dbSave();
      return { flash: 'Đã cập nhật key.' };
    }

    if (body.add_fb_job !== undefined) {
      const link = String(body.link || '').trim();
      const oid = String(body.object_id || '').trim();
      const type = String(body.type || 'like');
      const reaction = String(body.reaction || 'like');
      const price = Math.max(0, Number(body.price || 35));
      const maxUses = Math.max(1, Number(body.max_uses || 9999));
      if (!link || !oid) return { flash: 'Phải nhập Link và Object ID.' };
      DB.fb_jobs.push({ id: nextId('fb_jobs'), link, object_id: oid, type, reaction, price, max_uses: maxUses, used_count: 0, status: 'active', created_at: nowStr() });
      dbSave();
      return { flash: 'Đã thêm nhiệm vụ Facebook.' };
    }

    if (body.add_tiktok_job !== undefined) {
      const url = String(body.video_url || '').trim();
      const ads = String(body.ads_id || '').trim();
      const acc = String(body.account_id || '').trim();
      const price = Math.max(0, Number(body.price || 20));
      const maxUses = Math.max(1, Number(body.max_uses || 9999));
      if (!ads) return { flash: 'Phải nhập Ads ID.' };
      DB.tiktok_jobs.push({ id: nextId('tiktok_jobs'), video_url: url, ads_id: ads, account_id: acc, price, max_uses: maxUses, used_count: 0, status: 'active', created_at: nowStr() });
      dbSave();
      return { flash: 'Đã thêm nhiệm vụ TikTok.' };
    }

    if (body.job_act !== undefined) {
      const id = Number(body.id || 0);
      const t = String(body.t || 'fb');
      const a = String(body.job_act || '');
      const table = t === 'tt' ? 'tiktok_jobs' : 'fb_jobs';
      const job = first(DB[table], (x) => x.id === id);
      if (job) {
        if (a === 'disable') job.status = 'disabled';
        if (a === 'enable') job.status = 'active';
        if (a === 'delete') DB[table] = DB[table].filter((x) => x.id !== id);
        dbSave();
        return { flash: 'Đã cập nhật nhiệm vụ.' };
      }
    }

    if (body.clear_completions !== undefined) {
      DB.job_completions = [];
      dbSave();
      return { flash: 'Đã xóa lịch sử hoàn thành.' };
    }
  }

  return { flash: '' };
}

// ============================================================================
//  ROUTER
// ============================================================================
function sendJsonResult(res, obj) {
  const code = obj._code || 200;
  delete obj._code;
  sendJson(res, obj, code);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const params = Object.fromEntries(url.searchParams);

    // ====== API APP ======
    if (pathname === '/checkkey/api/key.php') {
      return sendJsonResult(res, apiKeyCheck(params));
    }
    if (pathname === '/checkkey/api/check_date_key.php') {
      return sendJsonResult(res, apiCheckDateKey(params));
    }
    if (pathname === '/checkkey/api/api_golike_fb.php') {
      return sendJsonResult(res, apiGoLikeFb(params));
    }
    if (pathname === '/checkkey/api/api_golike_tiktok.php') {
      return sendJsonResult(res, apiGoLikeTikTok(params));
    }
    if (pathname === '/checkkey/api/announcement.json') {
      return sendJson(res, announcement());
    }
    if (pathname === '/checkkey/') {
      if (req.method === 'POST') return apiAddHistory(req, res);
      return sendJson(res, { success: false, message: 'Phương thức không hợp lệ' }, 405);
    }
    if (pathname === '/api/check-key.php') {
      return apiCheckKeyAdmin(req, res, params);
    }
    if (pathname === '/api' || pathname === '/api/' || pathname === '/api/index.php') {
      return sendJson(res, { name: 'BON SHOP API', version: '1.0', endpoint: 'POST /api/check-key.php' });
    }

    // ====== Trang phụ trợ ======
    if (pathname === '/Key_Free/' || pathname === '/Key_Free') {
      return sendHtml(res, pageKeyFree(params));
    }
    if (pathname === '/statistics' || pathname === '/statistics/') {
      return sendHtml(res, pageStatistics());
    }

    // ====== Tải APK ======
    if (pathname === '/BON_TOOL.apk' || pathname === '/BON_TOOL_fixed.apk' || pathname === '/BON_TOOL_onrender.apk') {
      const file = CONFIG.apkPath;
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Length': stat.size,
          'Content-Disposition': 'attachment; filename="BON_TOOL.apk"',
          'Cache-Control': 'no-store',
        });
        fs.createReadStream(file).pipe(res);
        return;
      }
      return sendHtml(res, 'APK chưa được tải lên server.', 404);
    }

    // ====== Trang chủ / Admin ======
    const isAdminPage = pathname === '/admin' || pathname === '/admin/';

    if (params.logout !== undefined) {
      destroySession(req);
      clearCookie(res);
      return redirect(res, './');
    }

    let body = {};
    if (req.method === 'POST') body = await jsonBody(req);

    // Xử lý form (chỉ khi POST) — handleForms có thể đặt session cookie
    let flash = '';
    if (req.method === 'POST') {
      const result = handleForms(req, res, body);
      flash = result.flash || '';
    }

    // Đọc lại session sau khi đăng nhập
    const session = getSession(req);

    // Render
    if (isAdminPage || params.admin === '1') {
      if (session && session.role === 'admin') return sendHtml(res, pageAdmin(session, flash));
      return sendHtml(res, pageAuth(flash, true));
    }

    if (session && session.role === 'user' && session.uid) {
      const user = first(DB.users, (r) => r.id === session.uid);
      if (user) return sendHtml(res, pageUser(user, flash, CONFIG));
      return sendHtml(res, pageAuth('Tài khoản không tồn tại.', false));
    }
    if (session && session.role === 'admin') {
      return sendHtml(res, pageAdmin(session, flash));
    }

    // Chưa đăng nhập
    if (pathname !== '/' && pathname !== '') {
      return sendHtml(res, pageAuth(flash, isAdminPage));
    }
    return sendHtml(res, pageAuth(flash, false));
  } catch (e) {
    console.error('[server] error:', e);
    try { sendJson(res, { success: false, message: 'Lỗi kết nối máy chủ' }, 500); } catch (_) { }
  }
});

// ============================================================================
//  KHỞI ĐỘNG
// ============================================================================
dbLoad();
server.listen(CONFIG.port, () => {
  console.log('BON SHOP server running at http://0.0.0.0:' + CONFIG.port);
  console.log('Base URL: ' + CONFIG.baseUrl);
  console.log('DB file : ' + CONFIG.dbFile);
  if (!fs.existsSync(CONFIG.apkPath)) {
    console.warn('[warn] Không tìm thấy APK tại ' + CONFIG.apkPath + ' (endpoint /BON_TOOL.apk sẽ trả 404)');
  }
});
