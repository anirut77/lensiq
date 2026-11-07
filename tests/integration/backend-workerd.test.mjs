// tests/integration/backend-workerd.test.mjs — the Worker in the REAL runtime (workerd via Miniflare) with a real local
// D1 (SQLite inside workerd), the real migrations, and the bundle built the way wrangler does (esbuild). Outbound fetch
// (Opn, Google JWKS, Turnstile) is answered by a local fake — no network, no keys, no account needed.
//
// Covers what the node:sqlite shim cannot prove: the module loads in workerd (entry exports), changes() inside a D1
// batch (gap-free receipt / credit-note numbering), INSERT … SELECT … WHERE EXISTS claim guards (fulfilment), RETURNING,
// Request/Response/WebCrypto behaviour, and the full checkout -> webhook -> receipt -> refund -> credit-note path,
// Google sign-in and admin login + re-auth.
//
// Needs `npm ci` in backend/ (wrangler brings miniflare + workerd + esbuild). Skipped (not failed) when they are absent.
// Run: npm run test:integration   (or: node --test tests/integration/)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, createSign, generateKeyPairSync } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BACKEND = join(ROOT, "backend");
const have = existsSync(join(BACKEND, "node_modules", "miniflare")) && existsSync(join(BACKEND, "node_modules", "esbuild"));
const require = createRequire(join(BACKEND, "package.json"));

const CLIENT_ID = "test-client.apps.example";
const WH_SECRET = Buffer.from("webhook-secret-for-tests-0123456789").toString("base64");
const ADMIN_TOKEN = "bootstrap-" + "t".repeat(40);
const ADMIN_PW = "correct horse battery staple";
const ORIGIN = "https://site.example";
const nowS = () => Math.floor(Date.now() / 1000);

const b64u = b => Buffer.from(b).toString("base64url");
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: "jwk" }), kid: "kid-1", alg: "RS256", use: "sig" };
const jwt = c => {
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "kid-1" })), p = b64u(JSON.stringify(c));
  return h + "." + p + "." + b64u(createSign("RSA-SHA256").update(h + "." + p).sign(privateKey));
};

/** Splits a migration into statements (strips -- comments outside quotes). */
export function sqlStatements(src) {
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

function fakeOutbound() {
  const st = { charges: new Map(), n: 0 };
  st.handler = async request => {
    const url = new URL(request.url);
    if (request.url === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [JWK] }, { headers: { "Cache-Control": "max-age=3600" } });
    if (url.hostname === "challenges.cloudflare.com") {
      const p = new URLSearchParams(await request.text());
      const [tok, action] = String(p.get("response")).split(":");
      return Response.json({ success: tok === "good", action, hostname: "site.example" });
    }
    if (url.hostname === "api.omise.co" && url.pathname === "/charges" && request.method === "POST") {
      const p = new URLSearchParams(await request.text());
      const id = "chrg_test_" + String(++st.n).padStart(12, "0");
      const c = { object: "charge", id, amount: Number(p.get("amount")), currency: "thb", status: "pending", source: { type: "promptpay", scannable_code: { image: { download_uri: `https://api.omise.co/charges/${id}/documents/d/downloads/QR` } } } };
      st.charges.set(id, c);
      return Response.json(c);
    }
    const m = /^\/charges\/(chrg_test_\d+)$/.exec(url.pathname);
    if (m) return Response.json(st.charges.get(m[1]));
    return new Response("unexpected outbound " + request.url, { status: 599 });
  };
  return st;
}

async function start(vars = {}) {
  const { Miniflare } = require("miniflare");
  const esbuild = require("esbuild");
  const built = await esbuild.build({
    entryPoints: [join(BACKEND, "src", "worker.js")], bundle: true, format: "esm", platform: "neutral", write: false,
    mainFields: ["module", "main"], conditions: ["workerd", "worker", "browser"], external: ["node:*", "crypto"], logLevel: "error"
  });
  const net = fakeOutbound();
  const text = v => ({ type: "text", value: String(v) });
  const vars0 = {
    ALLOWED_ORIGINS: ORIGIN, ADMIN_ORIGINS: ORIGIN, FREE_MODE: "false", BILLING_ENABLED: "true", GOOGLE_CLIENT_ID: CLIENT_ID,
    TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", OPN_SECRET_KEY: "skey_test_5xyzabcdefghijklmnop", OPN_WEBHOOK_SECRET: WH_SECRET,
    ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 7).toString("base64"), VAT_REGISTERED: "true",
    SELLER_NAME: "บริษัท เลนส์ไอคิว จำกัด", SELLER_TAX_ID: "0105500000000", SELLER_ADDRESS: "กรุงเทพฯ 10110", ...vars
  };
  const env = { DB: { type: "d1", id: "lensiq-it" } };
  for (const [k, v] of Object.entries(vars0)) env[k] = text(v);
  const mf = new Miniflare({ workers: [{
    config: { name: "lensiq", compatibilityDate: "2026-10-01", compatibilityFlags: ["nodejs_compat"],
      manifest: { mainModule: "worker.js", modules: { "worker.js": { type: "esm", contents: built.outputFiles[0].text } } }, env },
    dev: { outboundService: { type: "fetcher", handler: net.handler } }
  }] });
  const db = await mf.getD1Database("DB");
  // apply every migration like `wrangler d1 migrations apply` (and record it in wrangler's d1_migrations table)
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
    if (o.body !== undefined) { body = typeof o.body === "string" ? o.body : JSON.stringify(o.body); headers["Content-Type"] = headers["Content-Type"] || "application/json"; }
    const r = await mf.dispatchFetch("https://api.example" + path, { method: o.method || "GET", headers, body });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { /* html */ }
    return { status: r.status, j, text: t, headers: r.headers };
  };
  return { mf, db, net, call };
}

test("workerd: the Worker starts, D1 + migrations are current (/health/deep via d1_migrations)", { skip: !have && "backend/node_modules missing — run npm ci in backend/" }, async () => {
  const { mf, call } = await start();
  try {
    assert.deepEqual((await call("/health")).j, { ok: true });
    const h = await call("/health/deep");
    assert.equal(h.status, 200, h.text);
    assert.equal(h.j.migrations.method, "d1_migrations");
    assert.deepEqual(h.j.migrations.missing, []);
  } finally { await mf.dispose(); }
});

test("workerd: sign-in -> checkout -> signed webhook (racing duplicates) -> receipt -> partial refund -> credit note; admin re-auth", { skip: !have && "backend/node_modules missing — run npm ci in backend/" }, async () => {
  const { mf, db, net, call } = await start();
  try {
    // Google sign-in (JWKS + Turnstile answered by the fake outbound)
    const n = await call("/api/auth/nonce", { method: "POST", body: {} });
    assert.equal(n.status, 201, n.text);
    const sub = "424242";
    const claims = { iss: "https://accounts.google.com", aud: CLIENT_ID, sub, email: "it@example.test", email_verified: true, iat: nowS() - 5, exp: nowS() + 3600, nonce: n.j.nonce };
    const si = await call("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: jwt(claims), nonce: n.j.nonce, accept_terms: true, consent_version: "m1" } });
    assert.equal(si.status, 200, si.text);
    const token = si.j.token;
    // checkout (VAT tax invoice) and the provider marks it paid
    const co = await call("/v1/billing/checkout", { method: "POST", token, headers: { "X-Turnstile-Token": "good:checkout", "Idempotency-Key": "it-key-00000001" }, body: { plan_id: "plus", period: "year", accept_terms: true, age_confirm: "adult", buyer: { name: "ร้าน IT", tax_id: "1234567890123", address: "เชียงใหม่" } } });
    assert.equal(co.status, 201, co.text);
    const replay = await call("/v1/billing/checkout", { method: "POST", token, headers: { "X-Turnstile-Token": "good:checkout", "Idempotency-Key": "it-key-00000001" }, body: { plan_id: "plus", period: "year", accept_terms: true, age_confirm: "adult" } });
    assert.equal(replay.j.payment_id, co.j.payment_id, "idempotent replay (UNIQUE index in real D1)");
    const pay = await db.prepare("SELECT provider_charge_id FROM payments WHERE id = ?1").bind(co.j.payment_id).first();
    net.charges.get(pay.provider_charge_id).status = "successful";
    const hook = id => {
      const body = JSON.stringify({ object: "event", id, key: "charge.complete", data: { object: "charge", id: pay.provider_charge_id } });
      const ts = String(nowS());
      const sig = createHmac("sha256", Buffer.from(WH_SECRET, "base64")).update(`${ts}.${body}`).digest("hex");
      return call("/v1/billing/webhook/opn", { method: "POST", origin: null, body, headers: { "Omise-Signature-Timestamp": ts, "Omise-Signature": sig } });
    };
    const rs = await Promise.all([hook("evnt_test_it00000001"), hook("evnt_test_it00000002"), hook("evnt_test_it00000003")]);
    assert.ok(rs.every(r => r.status === 200), rs.map(r => r.text).join(" | "));
    const row = await db.prepare("SELECT status, receipt_no, fulfilled_at, ext_seconds, doc_type FROM payments WHERE id = ?1").bind(co.j.payment_id).first();
    assert.equal(row.status, "successful"); assert.match(row.receipt_no, /^LQ-\d{6}-000001$/, "changes() guard numbered exactly once");
    assert.ok(row.fulfilled_at); assert.equal(row.ext_seconds, 365 * 86400); assert.equal(row.doc_type, "tax_invoice_receipt");
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM subscriptions").first()).n, 1, "EXISTS(token) guard granted once");
    assert.equal((await db.prepare("SELECT value FROM counters WHERE name LIKE 'receipt:%'").first()).value, 1);
    const me = await call("/api/me", { token });
    assert.equal(me.j.tier, "plus");
    const rec = await call(`/api/me/payments/${co.j.payment_id}/receipt`, { token });
    assert.match(rec.text, /ใบกำกับภาษี/);
    // admin: login, money op refused without TOTP? (billing on) -> enable path not needed: REQUIRE is billing-on, so use inline
    await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
    const login = await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } });
    assert.equal(login.status, 200, login.text);
    const A = (p, o = {}) => call("/admin/api" + p, { ...o, headers: { Authorization: "Bearer " + login.j.token, ...(o.headers || {}) } });
    const noTotp = await A(`/billing/payments/${co.j.payment_id}/refund`, { method: "POST", body: { password: ADMIN_PW, reference: "X" } });
    assert.equal(noTotp.j.code, "owner_totp_required");
    // TOTP on (WebCrypto HMAC-SHA1 + AES-GCM inside workerd), then the sudo window
    const crypto = await import(join(BACKEND, "src", "crypto.js"));
    const setup = await A("/totp/setup", { method: "POST", body: { password: ADMIN_PW } });
    assert.equal(setup.status, 200, setup.text);
    const secret = crypto.base32Decode(setup.j.secret);
    const step = Math.floor(nowS() / 30);
    assert.equal((await A("/totp/enable", { method: "POST", body: { code: await crypto.totpAt(secret, step - 1) } })).status, 200);
    assert.equal((await A("/reauth", { method: "POST", body: { password: ADMIN_PW, totp: await crypto.totpAt(secret, step) } })).status, 200);
    const r1 = await A(`/billing/payments/${co.j.payment_id}/refund`, { method: "POST", body: { reference: "KBANK-IT-1", amount_satang: 10700 } });
    assert.equal(r1.status, 200, r1.text);
    assert.equal(r1.j.status, "partially_refunded"); assert.match(r1.j.credit_note_no, /^CN-\d{6}-000001$/);
    const r2 = await A(`/billing/payments/${co.j.payment_id}/refund`, { method: "POST", body: { reference: "KBANK-IT-2", amount_satang: 10700 } });
    assert.match(r2.j.credit_note_no, /^CN-\d{6}-000002$/, "credit-note counter: changes() in a real D1 batch");
    const cn = await call(`/api/me/payments/${co.j.payment_id}/refunds/${r1.j.refund_id}/credit-note?format=json`, { token });
    assert.equal(cn.status, 200, cn.text); assert.equal(cn.j.vat_on_difference_satang, 700);
    assert.equal((await call("/api/me", { token })).j.tier, "plus", "a partial refund keeps the paid plan");
    // go-live status for the signed-in owner
    const st = await A("/state");
    assert.equal(st.j.bootstrapped, true); assert.equal(typeof st.j.go_live.ok, "boolean");
  } finally { await mf.dispose(); }
});
