// tests/integration/backend-look-salon-workerd.test.mjs — the salon catalogue approval step (owner decision 2026-11-18) in
// the REAL runtime: workerd via Miniflare, a real local D1 with every migration applied (incl. 0022_look_salon.sql), the
// Worker bundled the way wrangler does (esbuild, so the shared lint lensiq-look-lint.js is bundled from the repo root).
// FIXED TEST SET: written and hash-locked (~/LENSIQ-field/evals/salon-approval/, evals-locks/salon-approval.sha256) BEFORE
// backend/src/look-salon.js was written. No network, no keys, nothing deployed.
//   W1 pending is never public; approve -> public; edit -> pending + off the public list; stale version refused
//   W2 anonymous approve -> 403 (allowed Origin, no Origin, made-up token); a LENSIQ admin (default config) -> 403
//   W3 procedure words TH / EN / ZH refused on create (422) and an entry holding them cannot be approved (422)
//   W4 audit / history rows hold no salon text
// Needs `npm ci` in backend/ (wrangler brings miniflare + workerd + esbuild). Skipped (not failed) when they are absent.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BACKEND = join(ROOT, "backend");
const have = existsSync(join(BACKEND, "node_modules", "miniflare")) && existsSync(join(BACKEND, "node_modules", "esbuild"));
const require = createRequire(join(BACKEND, "package.json"));
const ADMIN_TOKEN = "bootstrap-" + "s".repeat(40);
const ADMIN_PW = "correct horse battery staple workerd salon";
const ACC_PW = "salon workerd account passphrase 2026";
const ORIGIN = "https://site.example";
const nowS = () => Math.floor(Date.now() / 1000);
const SKIP = { skip: !have && "backend/node_modules missing — run npm ci in backend/" };

function sqlStatements(src) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (!q && ch === "-" && src[i + 1] === "-") { while (i < src.length && src[i] !== "\n") i++; cur += "\n"; continue; }
    if (ch === "'") q = !q;
    if (!q && ch === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function start(vars = {}) {
  const { Miniflare } = require("miniflare");
  const esbuild = require("esbuild");
  const built = await esbuild.build({
    entryPoints: [join(BACKEND, "src", "worker.js")], bundle: true, format: "esm", platform: "neutral", write: false,
    mainFields: ["module", "main"], conditions: ["workerd", "worker", "browser"], external: ["node:*", "crypto"], logLevel: "error"
  });
  const text = v => ({ type: "text", value: String(v) });
  const vars0 = { ALLOWED_ORIGINS: ORIGIN, ADMIN_ORIGINS: ORIGIN, FREE_MODE: "true", BILLING_ENABLED: "false", ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN,
    SECRETS_KEK: Buffer.alloc(32, 9).toString("base64"), LOOK_SALON: "on", ...vars };
  const env = { DB: { type: "d1", id: "lensiq-it-salon" } };
  for (const [k, v] of Object.entries(vars0)) env[k] = text(v);
  const mf = new Miniflare({ workers: [{
    config: { name: "lensiq", compatibilityDate: "2026-10-01", compatibilityFlags: ["nodejs_compat"],
      manifest: { mainModule: "worker.js", modules: { "worker.js": { type: "esm", contents: built.outputFiles[0].text } } }, env },
    dev: { outboundService: { type: "fetcher", handler: async r => new Response("unexpected outbound " + r.url, { status: 599 }) } }
  }] });
  const db = await mf.getD1Database("DB");
  await db.prepare("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)").run();
  for (const f of readdirSync(join(BACKEND, "migrations")).filter(f => f.endsWith(".sql")).sort()) {
    await db.batch(sqlStatements(readFileSync(join(BACKEND, "migrations", f), "utf8")).map(s => db.prepare(s)));
    await db.prepare("INSERT INTO d1_migrations (name, applied_at) VALUES (?1, datetime('now'))").bind(f).run();
  }
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.origin !== null) headers.Origin = o.origin || ORIGIN;
    if (o.token) headers.Authorization = "Bearer " + o.token;
    let body;
    if (o.body !== undefined) { body = JSON.stringify(o.body); headers["Content-Type"] = "application/json"; }
    const r = await mf.dispatchFetch("https://api.example" + path, { method: o.method || "GET", headers, body });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { /* not JSON */ }
    return { status: r.status, j, text: t };
  };
  const crypto = await import(join(BACKEND, "src", "crypto.js"));
  const totp = (b32, d = 0) => crypto.totpAt(crypto.base32Decode(b32), Math.floor(nowS() / 30) + d);
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
  const owner = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
  const O = (p, o = {}) => call("/admin/api" + p, { ...o, token: owner });
  return { mf, db, call, O, totp };
}
const brow = (o = {}) => ({ kind: "brow", name_th: "ทรงโค้งนุ่ม", name_en: "Soft arch", name_zh: "柔和弯眉", desc_en: "A gentle arch", shape: { card: "brow-arch" }, rights_ok: true, ...o });

test("workerd W1: pending never public; approve -> public; edit -> pending and off the list; stale version refused", SKIP, async () => {
  const { mf, call, O } = await start();
  try {
    const h = await call("/health/deep");
    assert.equal(h.status, 200, h.text); assert.deepEqual(h.j.migrations.missing, []);
    const c = await O("/look-salon/entries", { method: "POST", body: brow() });
    assert.equal(c.status, 201, c.text); assert.equal(c.j.entry.status, "pending");
    const id = c.j.entry.id;
    assert.deepEqual((await call("/v1/look/salon/catalog")).j.entries, []);
    assert.equal((await O(`/look-salon/entries/${id}/approve`, { method: "POST", body: { version: 1 } })).status, 200);
    assert.deepEqual((await call("/v1/look/salon/catalog")).j.entries.map(e => e.id), [id]);
    const u = await O(`/look-salon/entries/${id}`, { method: "PUT", body: { name_en: "Soft arch, natural" } });
    assert.equal(u.status, 200, u.text); assert.equal(u.j.entry.status, "pending"); assert.equal(u.j.entry.version, 2);
    assert.deepEqual((await call("/v1/look/salon/catalog")).j.entries, []);
    const stale = await O(`/look-salon/entries/${id}/approve`, { method: "POST", body: { version: 1 } });
    assert.equal(stale.status, 409); assert.equal(stale.j.code, "stale_version");
    assert.equal((await O(`/look-salon/entries/${id}/approve`, { method: "POST", body: { version: 2 } })).status, 200);
    assert.deepEqual((await call("/v1/look/salon/catalog")).j.entries.map(e => e.version), [2]);
  } finally { await mf.dispose(); }
});

test("workerd W2: anonymous approve -> 403; a LENSIQ admin (default config) -> 403 approver_not_allowed", SKIP, async () => {
  const { mf, db, call, O, totp } = await start();
  try {
    const id = (await O("/look-salon/entries", { method: "POST", body: brow() })).j.entry.id;
    for (const o of [{}, { origin: null }, { token: "x".repeat(43) }]) {
      const r = await call(`/admin/api/look-salon/entries/${id}/approve`, { method: "POST", body: { version: 1 }, ...o });
      assert.equal(r.status, 403, JSON.stringify(o) + " " + r.text);
    }
    // owner 2-step on + sudo, then a lensiq_admin account
    const st = await O("/totp/setup", { method: "POST", body: { password: ADMIN_PW } });
    assert.equal((await O("/totp/enable", { method: "POST", body: { code: await totp(st.j.secret, -1) } })).status, 200);
    await db.prepare("UPDATE admin_users SET totp_last_step = 0").run();
    assert.equal((await O("/reauth", { method: "POST", body: { password: ADMIN_PW, totp: await totp(st.j.secret) } })).status, 200);
    const acc = await O("/reviewers", { method: "POST", body: { username: "lqadmin", role: "lensiq_admin" } });
    assert.equal(acc.status, 201, acc.text);
    const s1 = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: acc.j.setup_code, password: ACC_PW } });
    assert.equal(s1.status, 200, s1.text);
    assert.equal((await call("/admin/api/reviewer-setup/confirm", { method: "POST", body: { code: acc.j.setup_code, totp: await totp(s1.j.secret, -1) } })).status, 200);
    const l = await call("/admin/api/login", { method: "POST", body: { username: "lqadmin", password: ACC_PW, totp: await totp(s1.j.secret), mode: "bearer" } });
    assert.equal(l.status, 200, l.text);
    const r = await call(`/admin/api/look-salon/entries/${id}/approve`, { method: "POST", body: { version: 1 }, token: l.j.token });
    assert.equal(r.status, 403, r.text); assert.equal(r.j.code, "approver_not_allowed");
    assert.equal((await db.prepare("SELECT status FROM look_salon_entries WHERE id = ?1").bind(id).first()).status, "pending");
  } finally { await mf.dispose(); }
});

test("workerd W3 + W4: procedure words refused and unapprovable (TH / EN / ZH); audit and history hold no salon text", SKIP, async () => {
  const { mf, db, O } = await start();
  try {
    for (const [f, t] of [["name_th", "สักคิ้ว 6 มิติ"], ["name_en", "Microblading soft arch"], ["name_zh", "半永久眉"], ["desc_en", "Thread lift brow"], ["desc_th", "ฉีดฟิลเลอร์ปาก"]]) {
      const r = await O("/look-salon/entries", { method: "POST", body: brow({ [f]: t }) });
      assert.equal(r.status, 422, t); assert.equal(r.j.code, "lint_failed");
    }
    const id = (await O("/look-salon/entries", { method: "POST", body: brow() })).j.entry.id;
    for (const [col, t] of [["name_th", "ร้อยไหมยกคิ้ว"], ["name_en", "Lip tattoo coral"], ["name_zh", "纹眉 柳叶形"]]) {
      await db.prepare(`UPDATE look_salon_entries SET ${col} = ?1 WHERE id = ?2`).bind(t, id).run();
      const r = await O(`/look-salon/entries/${id}/approve`, { method: "POST", body: { version: 1 } });
      assert.equal(r.status, 422, t); assert.equal(r.j.code, "lint_failed");
      await db.prepare(`UPDATE look_salon_entries SET ${col} = ?1 WHERE id = ?2`).bind(col === "name_th" ? "ทรงโค้งนุ่ม" : col === "name_en" ? "Soft arch" : "柔和弯眉", id).run();
    }
    assert.equal((await db.prepare("SELECT status FROM look_salon_entries WHERE id = ?1").bind(id).first()).status, "pending");
    const audit = (await db.prepare("SELECT detail FROM audit_log WHERE action LIKE 'look_salon.%'").all()).results.map(r => r.detail || "").join("\n");
    const hist = (await db.prepare("SELECT * FROM look_salon_events").all()).results.map(r => JSON.stringify(r)).join("\n");
    assert.ok(audit.length > 0 && hist.length > 0);
    for (const t of ["ทรงโค้งนุ่ม", "Soft arch", "柔和弯眉", "A gentle arch", "สักคิ้ว", "Microblading", "半永久", "ร้อยไหม", "tattoo", "纹眉", "ฟิลเลอร์", "Thread lift"]) {
      assert.ok(!audit.includes(t), "audit holds " + t); assert.ok(!hist.includes(t), "history holds " + t);
    }
  } finally { await mf.dispose(); }
});
