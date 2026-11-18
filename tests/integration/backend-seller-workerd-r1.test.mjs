// tests/integration/backend-seller-workerd-r1.test.mjs — review round 1 finding 9 (2026-11-18): the workerd log check must
// prove its log sink works. A forced internal error on a seller route makes the Worker write its "unhandled" line; the test
// requires that line to be captured AND to carry no seller value. Locked before the round-1 fixes.
// Based on backend-seller-workerd.test.mjs — "ข้อมูลกิจการ" seller details + quotation / invoice / receipt numbering
// in the REAL runtime (workerd via Miniflare, real local D1, real migrations, esbuild bundle like wrangler). FIXED TEST SET,
// hash-locked in evals-locks/seller-settings.sha256 before backend/src/seller.js existed (owner order 2026-11-18).
// Proves what the node:sqlite shim cannot: the D1 batch numbering (changes() inside a real D1 batch) under concurrent
// issues, the owner-only rule and the step-up in workerd, and that workerd's console carries no seller value.
// Needs `npm ci` in backend/ (miniflare + esbuild). Skipped (not failed) when absent, like backend-workerd.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BACKEND = join(ROOT, "backend");
const have = existsSync(join(BACKEND, "node_modules", "miniflare")) && existsSync(join(BACKEND, "node_modules", "esbuild"));
const require = createRequire(join(BACKEND, "package.json"));
const ADMIN_TOKEN = "bootstrap-" + "w".repeat(40);
const PW = "correct horse battery staple workerd seller";
const ORIGIN = "https://site.example";
const MARKS = ["MKWNAMEa1b2", "0000000731906", "MKWADDRc3d4", "8842731905", "0817319066", "mkw.mail9"];

/** Splits a migration into statements (same as backend-workerd.test.mjs; copied so that file's tests do not run twice). */
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

async function start() {
  const { Miniflare, Log, LogLevel } = require("miniflare");
  const esbuild = require("esbuild");
  const built = await esbuild.build({
    entryPoints: [join(BACKEND, "src", "worker.js")], bundle: true, format: "esm", platform: "neutral", write: false,
    mainFields: ["module", "main"], conditions: ["workerd", "worker", "browser"], external: ["node:*", "crypto"], logLevel: "error"
  });
  const lines = [];
  class CaptureLog extends Log { constructor() { super(LogLevel.DEBUG); } log(m) { lines.push(String(m)); } }
  const vars = { ALLOWED_ORIGINS: ORIGIN, ADMIN_ORIGINS: ORIGIN, ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 9).toString("base64"), TRYON: "on" };
  const env = { DB: { type: "d1", id: "lensiq-seller-it" } };
  for (const [k, v] of Object.entries(vars)) env[k] = { type: "text", value: String(v) };
  const mf = new Miniflare({
    log: new CaptureLog(),
    // amendment A1 (re-lock 2026-11-18, test setup only): this Miniflare (5.x) has no handleRuntimeStdio option; workerd's
    // console output reaches the test through handleStructuredLogs instead
    handleStructuredLogs: l => lines.push(JSON.stringify(l)),
    workers: [{
      config: { name: "lensiq", compatibilityDate: "2026-10-01", compatibilityFlags: ["nodejs_compat"],
        manifest: { mainModule: "worker.js", modules: { "worker.js": { type: "esm", contents: built.outputFiles[0].text } } }, env },
      dev: { outboundService: { type: "fetcher", handler: async r => { lines.push("OUTBOUND " + r.url); return new Response("no", { status: 599 }); } } }
    }]
  });
  const db = await mf.getD1Database("DB");
  for (const f of readdirSync(join(BACKEND, "migrations")).filter(f => f.endsWith(".sql")).sort()) {
    await db.batch(sqlStatements(readFileSync(join(BACKEND, "migrations", f), "utf8")).map(s => db.prepare(s)));
  }
  const call = async (path, o = {}) => {
    const headers = { Origin: ORIGIN, ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    let body;
    if (o.body !== undefined) { body = JSON.stringify(o.body); headers["Content-Type"] = "application/json"; }
    const r = await mf.dispatchFetch("https://api.example" + path, { method: o.method || "GET", headers, body });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { /* html */ }
    return { status: r.status, j, text: t };
  };
  return { mf, db, call, lines };
}

test("workerd R1: the runtime log sink captures the Worker's own line (canary) and that line carries no seller value",
  { skip: !have && "backend/node_modules missing — run npm ci in backend/" }, async () => {
    const { mf, db, call, lines } = await start();
    try {
      assert.equal((await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: PW } })).status, 201);
      const tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } })).j.token;
      await db.prepare("DROP TABLE seller_docs").run();
      const r = await call("/admin/api/seller/docs", { method: "POST", token: tok,
        body: { doc_type: "receipt", buyer: { name: "MKWNAMEa1b2", address: "MKWADDRc3d4", tax_id: "0000000731906" }, lines: [{ id: "gate_village_lane", qty: 1 }] } });
      assert.equal(r.status, 500);
      for (const m of MARKS) assert.ok(!r.text.includes(m), "500 answer carries a value");
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !lines.some(l => l.includes("unhandled"))) await new Promise(res => setTimeout(res, 100));
      const out = lines.join("\n");
      assert.ok(/unhandled/.test(out) && /\/admin\/api\/seller\/docs/.test(out), "canary: the Worker's unhandled-error line was captured");
      for (const m of MARKS) assert.ok(!out.includes(m), "runtime log carries a seller value: " + m.slice(0, 3));
    } finally { await mf.dispose(); }
  });
