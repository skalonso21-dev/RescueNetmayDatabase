'use strict';
/* ============================================================
   RescueNet — MySQL storage engine
   ------------------------------------------------------------
   Drop-in replacement for the old JSON-file storage.
   Exposes the SAME readStore() / writeStore(store) API that
   server.js already uses, so no endpoint code had to change.

   Data model:
     - Real columns for anything you want to browse/filter in
       phpMyAdmin (id, name, status, timestamps, lat/lng...)
     - A `data` JSON column with the COMPLETE original object,
       which is what gets handed back to the apps.
     - `ord` column preserves the exact array order.
   ============================================================ */

const fs   = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

/* ---------- config ---------- */
const CONFIG_FILE = path.join(__dirname, 'db-config.json');
let cfg = {
  host: '127.0.0.1',
  port: 3306,
  user: 'rescuenet',
  password: 'rescuenet123',
  database: 'rescuenet'
};
try {
  cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
  console.log('[DB] loaded db-config.json');
} catch (e) { /* use defaults */ }

const pool = mysql.createPool({
  ...cfg,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
  enableKeepAlive: true
});

/* ---------- value coercion helpers ---------- */
function toStr(v, max) {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return max ? s.slice(0, max) : s;
}
function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toDateTime(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function toDateOnly(v) {
  const dt = toDateTime(v);
  return dt ? dt.slice(0, 10) : null;
}

/* ---------- column mapping per table ----------
   Each function pulls the interesting fields OUT of the
   original object into real columns. Everything else is
   preserved untouched in the `data` JSON column. */
const TABLES = {
  alerts: {
    cols: ['resident', 'type', 'status', 'severity', 'lat', 'lng', 'created_at'],
    map: (r) => ({
      resident: toStr(r.resident, 190),
      type: toStr(r.type, 64),
      status: toStr(r.status, 32),
      severity: toStr(r.severity, 32),
      lat: toNum(r.lat),
      lng: toNum(r.lng),
      created_at: toDateTime(r.createdAt || r.created_at || r.time || r.timestamp)
    })
  },
  reports: {
    cols: ['resident', 'type', 'status', 'created_at'],
    map: (r) => ({
      resident: toStr(r.resident, 190),
      type: toStr(r.type, 64),
      status: toStr(r.status, 32),
      created_at: toDateTime(r.createdAt || r.created_at || r.time || r.timestamp)
    })
  },
  residents: {
    cols: ['first_name', 'last_name', 'email', 'phone', 'status', 'registered_at', 'approved_at', 'rejected_at'],
    map: (r) => ({
      first_name: toStr(r.firstName || r.first_name, 120),
      last_name: toStr(r.lastName || r.last_name, 120),
      email: toStr(r.email, 190),
      phone: toStr(r.phone, 32),
      status: toStr(r.status, 24),
      registered_at: toDateTime(r.registeredAt || r.createdAt),
      approved_at: toDateTime(r.approvedAt),
      rejected_at: toDateTime(r.rejectedAt)
    })
  },
  responders: {
    cols: ['name', 'role', 'skill', 'phone', 'email', 'status', 'approval_status', 'lat', 'lng', 'joined', 'approved_at', 'rejected_at'],
    map: (r) => ({
      name: toStr(r.name || ((r.firstName || '') + ' ' + (r.lastName || '')).trim(), 160),
      role: toStr(r.role, 80),
      skill: toStr(r.skill || r.specialty, 160),
      phone: toStr(r.phone, 32),
      email: toStr(r.email, 190),
      status: toStr(r.status, 32),
      approval_status: toStr(r.approvalStatus || r.approval_status, 24),
      lat: toNum(r.lat),
      lng: toNum(r.lng),
      joined: toDateOnly(r.joined || r.joinedAt || r.createdAt),
      approved_at: toDateTime(r.approvedAt),
      rejected_at: toDateTime(r.rejectedAt)
    })
  },
  assignments: {
    cols: ['case_id', 'responder_id', 'status'],
    map: (r) => ({
      case_id: toStr(r.caseId || r.alertId || r.case_id, 64),
      responder_id: toStr(r.responderId || r.responder_id, 64),
      status: toStr(r.status, 32)
    })
  },
  households: {
    cols: ['status'],
    map: (r) => ({ status: toStr(r.status, 32) })
  },
  announcements: {
    cols: ['title', 'created_at'],
    map: (r) => ({
      title: toStr(r.title, 255),
      created_at: toDateTime(r.createdAt || r.created_at || r.date)
    })
  },
  resources: {
    cols: ['title'],
    map: (r) => ({ title: toStr(r.title || r.name, 255) })
  }
};

/* ---------- schema (self-healing) ---------- */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS alerts (
     id VARCHAR(64) NOT NULL, resident VARCHAR(190) NULL, type VARCHAR(64) NULL,
     status VARCHAR(32) NULL, severity VARCHAR(32) NULL, lat DECIMAL(10,7) NULL,
     lng DECIMAL(10,7) NULL, created_at DATETIME NULL, ord INT NOT NULL DEFAULT 0,
     data JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (id), KEY idx_al_status (status), KEY idx_al_created (created_at)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS reports (
     id VARCHAR(64) NOT NULL, resident VARCHAR(190) NULL, type VARCHAR(64) NULL,
     status VARCHAR(32) NULL, created_at DATETIME NULL, ord INT NOT NULL DEFAULT 0,
     data JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (id), KEY idx_rep_created (created_at)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS residents (
     id VARCHAR(64) NOT NULL, first_name VARCHAR(120) NULL, last_name VARCHAR(120) NULL,
     email VARCHAR(190) NULL, phone VARCHAR(32) NULL, status VARCHAR(24) NOT NULL DEFAULT 'pending',
     registered_at DATETIME NULL, approved_at DATETIME NULL, rejected_at DATETIME NULL,
     ord INT NOT NULL DEFAULT 0, data JSON NOT NULL,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (id), KEY idx_res_email (email), KEY idx_res_phone (phone), KEY idx_res_status (status)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS responders (
     id VARCHAR(64) NOT NULL, name VARCHAR(160) NULL, role VARCHAR(80) NULL, skill VARCHAR(160) NULL,
     phone VARCHAR(32) NULL, email VARCHAR(190) NULL, status VARCHAR(32) NULL,
     approval_status VARCHAR(24) NULL, lat DECIMAL(10,7) NULL, lng DECIMAL(10,7) NULL,
     joined DATE NULL, approved_at DATETIME NULL, rejected_at DATETIME NULL,
     ord INT NOT NULL DEFAULT 0, data JSON NOT NULL,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (id), KEY idx_rs_phone (phone), KEY idx_rs_email (email), KEY idx_rs_approval (approval_status)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS assignments (
     id VARCHAR(64) NOT NULL, case_id VARCHAR(64) NULL, responder_id VARCHAR(64) NULL,
     status VARCHAR(32) NULL, ord INT NOT NULL DEFAULT 0, data JSON NOT NULL,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (id), KEY idx_as_responder (responder_id), KEY idx_as_case (case_id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS households (
     id VARCHAR(64) NOT NULL, status VARCHAR(32) NULL, ord INT NOT NULL DEFAULT 0, data JSON NOT NULL,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS announcements (
     id VARCHAR(64) NOT NULL, title VARCHAR(255) NULL, created_at DATETIME NULL,
     ord INT NOT NULL DEFAULT 0, data JSON NOT NULL,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (id), KEY idx_ann_created (created_at)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS resources (
     id VARCHAR(64) NOT NULL, title VARCHAR(255) NULL, ord INT NOT NULL DEFAULT 0, data JSON NOT NULL,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS responder_locations (
     responder_id VARCHAR(64) NOT NULL, lat DECIMAL(10,7) NOT NULL, lng DECIMAL(10,7) NOT NULL,
     accuracy DECIMAL(10,2) NULL, name VARCHAR(160) NULL, role VARCHAR(80) NULL,
     status VARCHAR(32) NULL, updated_at DATETIME NULL, data JSON NOT NULL,
     PRIMARY KEY (responder_id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS otps (
     otp_key VARCHAR(190) NOT NULL, code VARCHAR(16) NOT NULL, phone VARCHAR(32) NULL,
     expires_at DATETIME NOT NULL, attempts INT NOT NULL DEFAULT 0, last_sent_at DATETIME NULL,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (otp_key), KEY idx_otp_expires (expires_at)) ENGINE=InnoDB`
];

async function ensureSchema() {
  for (const stmt of SCHEMA) await pool.query(stmt);
  console.log('[DB] schema ready (rescuenet)');
}

/* ---------- READ ---------- */
async function readStore() {
  const store = {
    alerts: [], reports: [], residents: [], assignments: [], households: [],
    announcements: [], resources: [], responderLocations: {}, responders: []
  };

  await Promise.all(Object.keys(TABLES).map(async (key) => {
    const [rows] = await pool.query(
      `SELECT data FROM \`${key}\` ORDER BY ord ASC, updated_at ASC`
    );
    store[key] = rows.map((r) => {
      try {
        return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      } catch (e) { return null; }
    }).filter(Boolean);
  }));

  const [locs] = await pool.query('SELECT data FROM responder_locations');
  for (const r of locs) {
    try {
      const obj = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      if (obj && obj.responderId) store.responderLocations[obj.responderId] = obj;
    } catch (e) { /* skip */ }
  }

  return store;
}

/* ---------- WRITE (diff-based: only changed rows are touched) ---------- */
async function syncTable(conn, key, rows) {
  const def = TABLES[key];
  const [existing] = await conn.query(`SELECT id, data, ord FROM \`${key}\``);
  const prev = new Map(existing.map((r) => [String(r.id), r]));
  const keep = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;
    const id = String(row.id != null ? row.id : ('auto_' + key + '_' + i));
    keep.add(id);

    const json = JSON.stringify(row);
    const old = prev.get(id);
    const ordChanged = !old || Number(old.ord) !== i;
    const dataChanged = !old || old.data !== json;

    if (!ordChanged && !dataChanged) continue; // nothing to do

    const mapped = def.map(row);
    const cols = ['id', 'ord', 'data', ...def.cols];
    const vals = [id, i, json, ...def.cols.map((c) => mapped[c])];
    const placeholders = cols.map(() => '?').join(', ');
    const updates = cols.filter((c) => c !== 'id').map((c) => `\`${c}\`=VALUES(\`${c}\`)`).join(', ');

    await conn.query(
      `INSERT INTO \`${key}\` (${cols.map((c) => '`' + c + '`').join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      vals
    );
  }

  const stale = [...prev.keys()].filter((id) => !keep.has(id));
  if (stale.length) {
    await conn.query(`DELETE FROM \`${key}\` WHERE id IN (?)`, [stale]);
  }
}

async function syncLocations(conn, obj) {
  const entries = Object.entries(obj || {});
  const [existing] = await conn.query('SELECT responder_id, data FROM responder_locations');
  const prev = new Map(existing.map((r) => [String(r.responder_id), r.data]));
  const keep = new Set();

  for (const [rid, loc] of entries) {
    if (!loc || typeof loc !== 'object') continue;
    keep.add(String(rid));
    const payload = Object.assign({ responderId: rid }, loc);
    const json = JSON.stringify(payload);
    if (prev.get(String(rid)) === json) continue;

    await conn.query(
      `INSERT INTO responder_locations
         (responder_id, lat, lng, accuracy, name, role, status, updated_at, data)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng), accuracy=VALUES(accuracy),
         name=VALUES(name), role=VALUES(role), status=VALUES(status),
         updated_at=VALUES(updated_at), data=VALUES(data)`,
      [
        String(rid), toNum(loc.lat) ?? 0, toNum(loc.lng) ?? 0, toNum(loc.accuracy),
        toStr(loc.name, 160), toStr(loc.role, 80), toStr(loc.status, 32),
        toDateTime(loc.updatedAt), json
      ]
    );
  }

  const stale = [...prev.keys()].filter((id) => !keep.has(id));
  if (stale.length) {
    await conn.query('DELETE FROM responder_locations WHERE responder_id IN (?)', [stale]);
  }
}

async function writeStore(store) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const key of Object.keys(TABLES)) {
      if (Array.isArray(store[key])) await syncTable(conn, key, store[key]);
    }
    if (store.responderLocations && typeof store.responderLocations === 'object') {
      await syncLocations(conn, store.responderLocations);
    }
    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw e;
  } finally {
    conn.release();
  }
}

/* ---------- RACE GUARD ----------
   Endpoints do read → mutate → write. If two requests overlap,
   the second write could clobber the first. This serializes
   read+write cycles per process. */
let chain = Promise.resolve();
function withStore(mutator) {
  const run = async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  };
  const next = chain.then(run, run);
  chain = next.catch(() => {});
  return next;
}

/* ---------- OTP persistence (survives restart) ---------- */
const otp = {
  async get(key) {
    if (!key) return null;
    const [rows] = await pool.query(
      'SELECT otp_key, code, phone, expires_at, attempts, last_sent_at FROM otps WHERE otp_key = ?',
      [String(key)]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      key: r.otp_key,
      code: r.code,
      phone: r.phone,
      expiresAt: new Date(r.expires_at + 'Z').getTime(),
      attempts: r.attempts,
      lastSentAt: r.last_sent_at ? new Date(r.last_sent_at + 'Z').getTime() : null
    };
  },
  async set(key, rec) {
    await pool.query(
      `INSERT INTO otps (otp_key, code, phone, expires_at, attempts, last_sent_at)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE code=VALUES(code), phone=VALUES(phone),
         expires_at=VALUES(expires_at), attempts=VALUES(attempts), last_sent_at=VALUES(last_sent_at)`,
      [
        String(key), String(rec.code), toStr(rec.phone, 32),
        toDateTime(rec.expiresAt), rec.attempts || 0,
        toDateTime(rec.lastSentAt || Date.now())
      ]
    );
  },
  async del(key) {
    if (!key) return;
    await pool.query('DELETE FROM otps WHERE otp_key = ?', [String(key)]);
  },
  async cleanup() {
    await pool.query('DELETE FROM otps WHERE expires_at < UTC_TIMESTAMP()');
  }
};

module.exports = { pool, readStore, writeStore, withStore, ensureSchema, otp, TABLES };
