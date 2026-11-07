"use strict";
// tests/unit/backend-d1-shim.js — in-memory Cloudflare D1 stand-in over Node's built-in node:sqlite (no native deps),
// with every migration in backend/migrations applied. Supports the subset the Worker uses:
// prepare().bind().first()/all()/run(), db.batch([...]) (one transaction), db.exec().
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

// node:sqlite prints an ExperimentalWarning on first load — keep test output clean
const origEmit = process.emitWarning;
process.emitWarning = function (w, ...rest) {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0] && rest[0].type;
  if (type === "ExperimentalWarning" && /SQLite/i.test(String(w))) return;
  return origEmit.call(process, w, ...rest);
};
const { DatabaseSync } = require("node:sqlite");
process.emitWarning = origEmit;

const MIGRATIONS = join(__dirname, "..", "..", "backend", "migrations");

const norm = v => {
  if (v === undefined) throw new TypeError("D1_TYPE_ERROR: undefined is not a supported bind value");
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
};

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args.map(norm)); }
  _s() { return this.db.prepare(this.sql); }
  async first(col) {
    const row = this._s().get(...this.args);
    if (row == null) return null;
    const o = { ...row };
    return col ? o[col] ?? null : o;
  }
  async all() { return { success: true, results: this._s().all(...this.args).map(r => ({ ...r })), meta: {} }; }
  _runSync() {
    const s = this._s();
    if (/\bRETURNING\b/i.test(this.sql)) { const rows = s.all(...this.args); return { success: true, results: rows, meta: { changes: rows.length } }; }
    const r = s.run(...this.args);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async run() { return this._runSync(); }
}

function createD1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  return {
    _raw: db,
    prepare: sql => new Stmt(db, sql),
    exec: async sql => { db.exec(sql); return { count: 1 }; },
    // like D1: the whole batch is one transaction; synchronous here, so concurrent batches never interleave
    batch: async stmts => {
      db.exec("BEGIN");
      try { const out = stmts.map(s => s._runSync()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    }
  };
}

/** A test env: D1 + sensible vars. Override anything via `vars`. */
function createEnv(vars = {}) {
  return {
    DB: createD1(),
    ALLOWED_ORIGINS: "https://site.example",
    ADMIN_ORIGINS: "https://site.example",
    FREE_MODE: "true",
    BILLING_ENABLED: "false",
    RAW_EVENT_DAYS: "90",
    ...vars
  };
}

/** Request helper. */
function req(path, { method = "GET", body, headers = {}, origin = "https://site.example", ip = "203.0.113.7" } = {}) {
  const h = { "CF-Connecting-IP": ip, ...headers };
  if (origin) h.Origin = origin;
  let b;
  if (body !== undefined) { b = typeof body === "string" ? body : JSON.stringify(body); if (!h["Content-Type"]) h["Content-Type"] = "application/json"; }
  return new Request("https://api.example" + path, { method, headers: h, body: b });
}

module.exports = { createD1, createEnv, req };
