// tests/integration/backend-seller-workerd.test.mjs — "ข้อมูลกิจการ" seller details + quotation / invoice / receipt numbering
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
const MARKS = ["MKWNAMEa1b2", "0000000731906", "MKWADDRc3d4", "8842731905", "0017319066", "mkw.mail9"];

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

test("workerd: seller details are owner-only (read too), need step-up, issue numbers are unique and gap-free, no value in the runtime log",
  { skip: !have && "backend/node_modules missing — run npm ci in backend/" }, async () => {
    const { mf, db, call, lines } = await start();
    try {
      const crypto = await import(pathToFileURL(join(BACKEND, "src", "crypto.js")).href);
      const totp = async (s, d = 0) => crypto.totpAt(crypto.base32Decode(s), Math.floor(Date.now() / 30000) + d);
      assert.equal((await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: PW } })).status, 201);
      const tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } })).j.token;
      const O = (p, o = {}) => call("/admin/api" + p, { ...o, token: tok });
      const secret = (await O("/totp/setup", { method: "POST", body: { password: PW } })).j.secret;
      assert.equal((await O("/totp/enable", { method: "POST", body: { code: await totp(secret, -1) } })).status, 200);
      const step = async () => { await db.prepare("UPDATE admin_users SET totp_last_step = 0").run(); return { password: PW, totp: await totp(secret) }; };

      // anonymous read and a try-on admin's read are refused
      assert.equal((await call("/admin/api/seller")).status, 403);
      assert.equal((await call("/admin/api/seller/docs")).status, 403);
      assert.equal((await O("/reauth", { method: "POST", body: await step() })).status, 200);
      const c = await O("/reviewers", { method: "POST", body: { username: "shopadmin", role: "tryon_admin" } });
      assert.equal(c.status, 201, c.text);
      const s1 = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: c.j.setup_code, password: PW + " acc" } });
      await call("/admin/api/reviewer-setup/confirm", { method: "POST", body: { code: c.j.setup_code, totp: await totp(s1.j.secret, -1) } });
      const acc = (await call("/admin/api/login", { method: "POST", body: { username: "shopadmin", password: PW + " acc", totp: await totp(s1.j.secret), mode: "bearer" } })).j.token;
      assert.equal((await call("/admin/api/seller", { token: acc })).status, 403);
      assert.equal((await call("/admin/api/seller/docs", { token: acc })).status, 403);

      // step-up: without password + code refused, with them stored
      const fields = { legal_name: "ทดสอบ จำกัด MKWNAMEa1b2", tax_id: "0000000731906", address: "MKWADDRc3d4 กรุงเทพฯ", vat_registered: true, vat_rate_bp: 700,
        bank_name: "ธนาคารทดสอบ", bank_account_name: "ทดสอบ จำกัด", bank_account_no: "8842731905", contact_phone: "0017319066", contact_email: "mkw.mail9@seller.example",
        contact_line: "@sellertest", doc_prefix: "WK" };
      assert.equal((await O("/seller", { method: "PUT", body: fields })).j.code, "reauth_inline_required");
      const put = await O("/seller", { method: "PUT", body: { ...fields, ...(await step()) } });
      assert.equal(put.status, 200, put.text);
      assert.ok(!put.text.includes("0000000731906") && !put.text.includes("8842731905") && !put.text.includes("0017319066"), "masked");

      // twelve drafts issued at once inside the sudo window: unique, gap-free numbers from the D1 batch
      const ids = [];
      for (let i = 0; i < 12; i++) {
        const d = await O("/seller/docs", { method: "POST", body: { doc_type: "receipt", buyer: { name: "ลูกค้า " + i }, lines: [{ id: "gate_village_lane", qty: 1 }] } });
        assert.equal(d.status, 201, d.text);
        ids.push(d.j.doc.id);
      }
      assert.equal((await O("/reauth", { method: "POST", body: await step() })).status, 200);
      const rs = await Promise.all([...ids, ids[0], ids[1]].map(id => O(`/seller/docs/${id}/issue`, { method: "POST", body: {} })));
      assert.equal(rs.filter(r => r.status === 200).length, 12, rs.map(r => r.status).join(","));
      const nums = rs.filter(r => r.status === 200).map(r => r.j.doc.number).sort();
      assert.deepEqual(nums, Array.from({ length: 12 }, (_, i) => "WK-RC-" + String(i + 1).padStart(6, "0")));
      const seq = await db.prepare("SELECT last FROM seller_doc_seq WHERE doc_type = 'receipt'").first();
      assert.equal(seq.last, 12, "the sequence moved once per issued document");

      // the issued PDF source carries the seller fields
      const h = await O(`/seller/docs/${ids[0]}`);
      assert.ok(h.text.includes("MKWNAMEa1b2") && h.text.includes("0000000731906"));

      // workerd's own log output never carries a seller value
      await new Promise(r => setTimeout(r, 200));
      const out = lines.join("\n");
      for (const m of MARKS) assert.ok(!out.includes(m), "runtime log carries a seller value: " + m.slice(0, 3));
      assert.ok(!/OUTBOUND/.test(out), "no outbound call");
      const audit = (await db.prepare("SELECT detail FROM audit_log").all()).results.map(r => r.detail || "").join("\n");
      for (const m of MARKS) assert.ok(!audit.includes(m), "audit carries a seller value");
    } finally { await mf.dispose(); }
  });
