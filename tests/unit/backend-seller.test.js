"use strict";
// tests/unit/backend-seller.test.js — "ข้อมูลกิจการ" (seller / business details) page and the quotation, invoice and
// receipt documents generated from it (owner order 2026-11-18, "needed for selling"). FIXED TEST SET written and
// hash-locked (evals-locks/seller-settings.sha256, ~/LENSIQ-field/evals/seller-settings/) BEFORE backend/src/seller.js,
// backend/src/price-list.js and migration 0021_seller.sql were written. In-memory D1 (node:sqlite shim); no network.
// Synthetic values only ("ทดสอบ จำกัด", tax ID 0000000000000, marker strings); never real seller details.
//   S1  owner only: a try-on admin, a try-on editor and a merit reviewer get 403 forbidden_role on every seller route
//       (read and write); no session = 401; a member (customer) bearer token is not an admin session (401)
//   S2  step-up to change: owner 2-step verification must be on (owner_totp_required), password + a fresh 6-digit code IN
//       the request (the 5-minute sudo window alone is refused: reauth_inline_required), a wrong code is refused
//       (reauth_failed) and nothing is stored; the logo follows the same rule
//   S3  masked display: GET shows tax ID, bank account number and phone as the last 4 digits only; full values never in
//       the settings response
//   S4  audit: every change is logged as who / when / which fields; no value (nor a 6-character piece of one) in the row
//   S5  values never in logs or analytics: marker values through every seller route (incl. refused input and an
//       internal error) never reach console output, audit_log, any other table, the audit API, or any outbound fetch;
//       seller.js has no log / console / AI / mail / LINE / analytics import
//   S6  the "ยังไม่ได้กรอกข้อมูลกิจการ" block (TH / EN / ZH) on all three documents while required fields are missing,
//       no blank seller lines; issuing is refused (409 seller_incomplete, field names only) and no number is used
//   S7  numbering: prefix + type code + a DB sequence; concurrent issues give unique gap-free numbers; a number is never
//       reused (void keeps it, a changed prefix continues the sequence); issuing twice gives one number
//   S8  filled: every seller field is in the document (the page that is printed to PDF); an issued document keeps the
//       seller details of the day it was issued
//   S9  prices: lines come only from the approved price list (excl. 7 % VAT), each pilot price matches
//       docs/PRICING-RESEARCH.md §3; a client-supplied price is refused; VAT 7 % only for a VAT-registered seller
//   S10 logo: PNG / JPEG / WebP only (magic bytes), size cap, no SVG; stored in D1 (no R2 binding today)
//   S11 migration 0021_seller.sql is listed in health.js with a schema probe
const test = require("node:test");
// test-bug re-lock 2026-11-21 (A5 review): one frozen clock for the code generator and the Worker (tests/unit/totp-clock.js);
// totp(secret, -1) failed when a 30 s step boundary fell between generating and verifying ("400 !== 200", backend-seller.test.js:96)
require("./totp-clock.js").freeze();
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "s".repeat(40);
const OWNER_PW = "correct horse battery staple seller";
const ACC_PW = "a long seller-test passphrase 2026";
const nowS = () => Math.floor(Date.now() / 1000);

// synthetic seller details (owner order: "ทดสอบ จำกัด", tax 0000000000000)
const FILLED = {
  legal_name: "ทดสอบ จำกัด", tax_id: "0000000000000", branch: "สำนักงานใหญ่", address: "1 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพฯ 10000",
  vat_registered: true, vat_rate_bp: 700, bank_name: "ธนาคารทดสอบ", bank_account_name: "ทดสอบ จำกัด", bank_account_no: "0001112223",
  contact_phone: "0200000000", contact_email: "billing@seller.example", contact_line: "@sellertest", doc_prefix: "TS"
};
// marker values: none of these (nor a 6-character piece of them) may appear in a log, an audit row, another table, a
// non-document response or an outbound request
const MARK = {
  legal_name: "ทดสอบ จำกัด MKNAMEq7Zx", tax_id: "0000000731905", branch: "สาขา MKBRANCHu2", address: "MKADDRp9Vw ถนนทดสอบ",
  vat_registered: true, vat_rate_bp: 700, bank_name: "ธนาคาร MKBANKk3Jd", bank_account_name: "MKACCNAMEr5", bank_account_no: "7319058842",
  contact_phone: "0017319055", contact_email: "mkmail.z8@seller.example", contact_line: "@mkline4qa", doc_prefix: "MKPX"
};
const MARK_STRINGS = ["MKNAMEq7Zx", "0000000731905", "MKBRANCHu2", "MKADDRp9Vw", "MKBANKk3Jd", "MKACCNAMEr5", "7319058842", "0017319055",
  "mkmail.z8", "mkline4qa", "MKPX", "MKBUYERx1", "MKBUYADDRy2", "0105500073190"];
const SEC_KEYS = ["legal_name", "tax_id", "branch", "address", "bank_name", "bank_account_name", "bank_account_no", "contact_phone",
  "contact_email", "contact_line", "doc_prefix"];
const REQUIRED = ["legal_name", "tax_id", "address", "vat_status", "bank_name", "bank_account_name", "bank_account_no", "contact", "doc_prefix"];
const BUYER = { name: "ลูกค้าทดสอบ MKBUYERx1", tax_id: "0105500073190", address: "MKBUYADDRy2 ถนนลูกค้า", branch: "สำนักงานใหญ่" };

/** minimal PNG / JPEG / WebP headers (no decoding on the Worker) */
const png = (pad = 64) => Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 64, 0, 0, 0, 32, 8, 6, 0, 0, 0]), Buffer.alloc(pad)]);
const jpeg = (pad = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(pad)]);
const webp = (pad = 64) => { const b = Buffer.alloc(16 + pad); b.write("RIFF", 0, "latin1"); b.writeUInt32LE(8 + pad, 4); b.write("WEBPVP8 ", 8, "latin1"); return b; };

// console capture (every sink a Worker can write to)
const logs = [];
const orig = {};
for (const k of ["log", "info", "warn", "error", "debug"]) { orig[k] = console[k]; console[k] = (...a) => { logs.push(a.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); }; }
test.after(() => { for (const k of Object.keys(orig)) console[k] = orig[k]; });

async function setup(vars = {}, { totpOn = true } = {}) {
  const { handle } = await import(B + "index.js");
  const crypto = await import(B + "crypto.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 21).toString("base64"), TRYON: "on", ...vars });
  const outbound = [];
  const fetchStub = async (url, init = {}) => { outbound.push(String(url) + " " + String(init.body || "")); throw new Error("no network in this test"); };
  const texts = [];
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers, ip: o.ip }), env, { fetch: fetchStub });
    const text = await r.clone().text();
    let j = null; try { j = JSON.parse(text); } catch { /* html / image */ }
    texts.push({ path, status: r.status, type: r.headers.get("Content-Type") || "", text });
    return { status: r.status, j, text, headers: r.headers };
  };
  const totp = (secretB32, d = 0) => crypto.totpAt(crypto.base32Decode(secretB32), Math.floor(nowS() / 30) + d);
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: OWNER_PW } });
  const owner = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: OWNER_PW, mode: "bearer" } })).j.token;
  const O = (path, o = {}) => call("/admin/api" + path, { ...o, token: o.token || owner });
  let ownerSecret = null;
  if (totpOn) {
    const st = await O("/totp/setup", { method: "POST", body: { password: OWNER_PW } });
    ownerSecret = st.j.secret;
    assert.equal((await O("/totp/enable", { method: "POST", body: { code: await totp(ownerSecret, -1) } })).status, 200);
  }
  /** password + a fresh 6-digit code (the replay guard is reset so each step-up gets a usable code) */
  const step = async () => { await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run(); return { password: OWNER_PW, totp: await totp(ownerSecret) }; };
  const sudo = async () => { assert.equal((await O("/reauth", { method: "POST", body: await step() })).status, 200); };
  const putSeller = async (fields, o = {}) => O("/seller", { method: "PUT", body: { ...fields, ...(o.noStep ? {} : await step()) } });
  const account = async (username, role) => {
    await sudo();
    const c = await O("/reviewers", { method: "POST", body: role === undefined ? { username } : { username, role } });
    assert.equal(c.status, 201, JSON.stringify(c.j));
    const s1 = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: c.j.setup_code, password: ACC_PW } });
    const s2 = await call("/admin/api/reviewer-setup/confirm", { method: "POST", body: { code: c.j.setup_code, totp: await totp(s1.j.secret, -1) } });
    assert.equal(s2.status, 200, JSON.stringify(s2.j));
    const l = await call("/admin/api/login", { method: "POST", body: { username, password: ACC_PW, totp: await totp(s1.j.secret), mode: "bearer" } });
    assert.equal(l.status, 200, JSON.stringify(l.j));
    return { token: l.j.token, username };
  };
  const newDoc = async (doc_type, extra = {}) => {
    const r = await O("/seller/docs", { method: "POST", body: { doc_type, buyer: BUYER, lines: [{ id: "attendance_person", qty: 12 }], ...extra } });
    assert.equal(r.status, 201, JSON.stringify(r.j));
    return r.j.doc;
  };
  const issue = async id => O(`/seller/docs/${id}/issue`, { method: "POST", body: await step() });
  const dump = async (skip = []) => {
    const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(t => t.name).filter(t => !skip.includes(t));
    let s = "";
    for (const t of tables) s += t + " " + JSON.stringify((await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results || []) + "\n";
    return s;
  };
  const audits = async () => ((await env.DB.prepare("SELECT ts, actor, action, detail FROM audit_log WHERE action LIKE 'seller.%' ORDER BY id").all()).results || []);
  return { env, call, O, step, sudo, putSeller, account, newDoc, issue, dump, audits, texts, outbound, owner };
}

/** no marker, nor any 6-character piece of a marker, in the text */
function noMarker(text, where) {
  for (const m of MARK_STRINGS) {
    for (let i = 0; i + 6 <= m.length; i += 2) assert.ok(!String(text).includes(m.slice(i, i + 6)), `${where}: a piece of a seller value leaked (${m.slice(0, 3)}…)`);
  }
}

/** coordinator 2026-11-18: each document is complete in Thai, English and Chinese (title and every label) */
const TITLES = { quotation: ["ใบเสนอราคา", "Quotation", "报价单"], invoice: ["ใบแจ้งหนี้", "Invoice", "账单"], receipt: ["ใบเสร็จรับเงิน", "Receipt", "收据"] };
const LABELS = [["ผู้ขาย", "Seller", "卖方"], ["เลขประจำตัวผู้เสียภาษี", "Tax ID", "纳税人识别号"], ["ที่อยู่", "Address", "地址"], ["ลูกค้า", "Customer", "客户"],
  ["เลขที่", "No.", "编号"], ["วันที่", "Date", "日期"], ["รายการ", "Description", "项目"], ["จำนวน", "Quantity", "数量"], ["รวมทั้งสิ้น", "Total", "合计"],
  ["ติดต่อ", "Contact", "联系"]];
const PAY = [["โอนเงินเข้าบัญชี", "Bank transfer", "银行转账"], ["ชื่อบัญชี", "Account name", "账户名"], ["เลขที่บัญชี", "Account number", "账号"]];
function trilingual(html, type) {
  for (const t of TITLES[type]) assert.ok(html.includes(t), `${type}: title ${t}`);
  for (const set of type === "receipt" ? LABELS : LABELS.concat(PAY)) for (const t of set) assert.ok(html.includes(t), `${type}: label ${t}`);
}

const SELLER_ROUTES = [
  ["GET", "/seller"], ["PUT", "/seller"], ["GET", "/seller/logo"], ["PUT", "/seller/logo"], ["DELETE", "/seller/logo"], ["GET", "/seller/prices"],
  ["GET", "/seller/docs"], ["POST", "/seller/docs"], ["GET", "/seller/docs/0123456789abcdef0123456789abcdef"],
  ["POST", "/seller/docs/0123456789abcdef0123456789abcdef/issue"], ["POST", "/seller/docs/0123456789abcdef0123456789abcdef/void"]
];

/* ---------------- S1 ---------------- */
test("S1: owner only: try-on admin, try-on editor and merit reviewer are refused on every seller route (read too); anonymous = 403", async () => {
  const s = await setup();
  const adm = await s.account("shopadmin", "tryon_admin"), ed = await s.account("shopeditor", "tryon_editor"), mr = await s.account("meritrev");
  for (const acc of [adm, ed, mr]) {
    for (const [m, p] of SELLER_ROUTES) {
      const r = await s.call("/admin/api" + p, { method: m, token: acc.token, body: m === "GET" ? undefined : { legal_name: "x", password: ACC_PW } });
      assert.equal(r.status, 403, `${acc.username} ${m} ${p}: ${r.status}`);
      assert.equal(r.j && r.j.code, "forbidden_role", `${acc.username} ${m} ${p}`);
    }
  }
  // coordinator 2026-11-18: READ is owner-only too. Anonymous (no credential at all) = 403 on every route, read included
  for (const [m, p] of SELLER_ROUTES) {
    const r = await s.call("/admin/api" + p, { method: m, body: m === "GET" ? undefined : {} });
    assert.equal(r.status, 403, `${m} ${p} anonymous: ${r.status}`);
    assert.equal(r.j && r.j.code, "owner_only", `${m} ${p} anonymous`);
  }
  // a customer / member token (org admin or staff side) or an expired session is not an owner session: refused (401 =
  // the page sends the owner back to sign-in), and no seller data in the answer
  for (const tok of ["m".repeat(43), "x".repeat(43)]) {
    const r = await s.call("/admin/api/seller", { token: tok });
    assert.ok(r.status === 401 || r.status === 403, String(r.status));
    assert.ok(!r.j || !r.j.profile);
  }
  // nothing was stored by any refused write
  assert.equal((await s.O("/seller")).j.set.legal_name, false);
  // the restricted accounts' reads never carried seller data
  assert.equal((await s.putSeller(FILLED)).status, 200);
  for (const acc of [adm, ed, mr]) {
    const r = await s.call("/admin/api/seller", { token: acc.token });
    assert.equal(r.status, 403);
    assert.ok(!r.text.includes(FILLED.legal_name) && !r.text.includes("0000"), "no seller data in a refused read");
  }
  // clearing a field is a change like any other
  assert.equal((await s.putSeller({ legal_name: "" })).status, 200);
  assert.equal((await s.O("/seller")).j.set.legal_name, false);
});

/* ---------------- S2 ---------------- */
test("S2: changing seller details needs owner 2-step verification on + password and a fresh code in that request", async () => {
  const off = await setup({}, { totpOn: false });
  const r0 = await off.O("/seller", { method: "PUT", body: { legal_name: FILLED.legal_name, password: OWNER_PW } });
  assert.equal(r0.status, 403); assert.equal(r0.j.code, "owner_totp_required");
  assert.equal((await off.O("/seller")).j.set.legal_name, false, "nothing stored without 2-step verification");

  const s = await setup();
  const r1 = await s.putSeller({ legal_name: FILLED.legal_name }, { noStep: true });
  assert.equal(r1.status, 403); assert.equal(r1.j.code, "reauth_inline_required");
  await s.sudo(); // the 5-minute sudo window alone does not count
  const r2 = await s.putSeller({ legal_name: FILLED.legal_name }, { noStep: true });
  assert.equal(r2.status, 403); assert.equal(r2.j.code, "reauth_inline_required");
  const r3 = await s.O("/seller", { method: "PUT", body: { legal_name: FILLED.legal_name, password: OWNER_PW, totp: "000000" } });
  assert.equal(r3.status, 403); assert.equal(r3.j.code, "reauth_failed");
  const r4 = await s.O("/seller", { method: "PUT", body: { legal_name: FILLED.legal_name, password: "wrong password 2026", totp: "000000" } });
  assert.equal(r4.status, 403);
  assert.equal((await s.O("/seller")).j.set.legal_name, false, "nothing stored by a refused change");
  const ok = await s.putSeller({ legal_name: FILLED.legal_name });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  assert.equal((await s.O("/seller")).j.profile.legal_name, FILLED.legal_name);
  // logo: same step-up rule
  const lg = { mime: "image/png", data: png().toString("base64") };
  const l1 = await s.O("/seller/logo", { method: "PUT", body: lg });
  assert.equal(l1.status, 403); assert.equal(l1.j.code, "reauth_inline_required");
  assert.equal((await s.O("/seller/logo", { method: "PUT", body: { ...lg, ...(await s.step()) } })).status, 200);
  assert.equal((await s.O("/seller/logo", { method: "DELETE", body: {} })).status, 403);
  assert.equal((await s.O("/seller/logo", { method: "DELETE", body: await s.step() })).status, 200);
  // failed step-ups are audited (existing reauth.failed rows), without any value
  const fails = (await s.env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'reauth.failed'").all()).results;
  assert.ok(fails.length >= 3, "refused step-ups are audited");
});

/* ---------------- S3 ---------------- */
test("S3: masked display: tax ID, bank account number and phone show the last 4 digits only", async () => {
  const s = await setup();
  assert.equal((await s.putSeller(FILLED)).status, 200);
  const g = await s.O("/seller");
  assert.equal(g.status, 200);
  const p = g.j.profile;
  assert.equal(p.tax_id, undefined, "no full tax ID field");
  assert.equal(p.bank_account_no, undefined, "no full bank account field");
  assert.equal(p.contact_phone, undefined, "no full phone field");
  assert.match(p.tax_id_masked, /^[•*x]+0000$/); assert.ok(p.tax_id_masked.length >= 8);
  assert.match(p.bank_account_no_masked, /^[•*x]+2223$/);
  assert.match(p.contact_phone_masked, /^[•*x]+0000$/);
  assert.ok(!g.text.includes(FILLED.tax_id) && !g.text.includes(FILLED.bank_account_no) && !g.text.includes(FILLED.contact_phone), "full values never in the settings response");
  assert.equal(p.legal_name, FILLED.legal_name);
  assert.equal(p.doc_prefix, "TS");
  assert.equal(p.vat_registered, true); assert.equal(p.vat_rate_bp, 700);
  assert.equal(g.j.complete, true); assert.deepEqual(g.j.missing, []);
  for (const k of SEC_KEYS) assert.equal(g.j.set[k], true, k);
  // the PUT answer is the same masked view
  const u = await s.putSeller({ contact_phone: "0001234567" });
  assert.ok(!u.text.includes("0001234567"));
  assert.match(u.j.profile.contact_phone_masked, /4567$/);
});

/* ---------------- S4 ---------------- */
test("S4: every change is audit-logged as who / when / which fields, never a value", async () => {
  const s = await setup();
  const t0 = nowS();
  assert.equal((await s.putSeller(MARK)).status, 200);
  assert.equal((await s.putSeller({ bank_account_no: "7319058842", contact_line: "" })).status, 200);
  assert.equal((await s.O("/seller/logo", { method: "PUT", body: { mime: "image/png", data: png().toString("base64"), ...(await s.step()) } })).status, 200);
  const a = await s.audits();
  const upd = a.filter(x => x.action === "seller.profile.updated");
  assert.equal(upd.length, 2);
  assert.equal(upd[0].actor, "owner");
  assert.ok(upd[0].ts >= t0 && upd[0].ts <= nowS() + 1);
  const f0 = JSON.parse(upd[0].detail).fields.slice().sort();
  assert.deepEqual(f0, Object.keys(MARK).sort());
  assert.deepEqual(JSON.parse(upd[1].detail).fields.slice().sort(), ["bank_account_no", "contact_line"]);
  assert.ok(a.some(x => x.action === "seller.logo.set"));
  for (const x of a) noMarker(JSON.stringify(x), "audit row " + x.action);
});

/* ---------------- S5 ---------------- */
// re-lock relock5 2026-11-21 (EQUAL test-bug re-lock, branch followups-1121): S5 failed now and then with "a piece of a seller value
// leaked (000…)" although no seller value had leaked. Cause: the digit-only markers (tax IDs, bank number, phone) are checked as 6-digit
// pieces against the whole D1 dump, and the dump holds values that change every run: random hex ids and hashes (crypto.getRandomValues;
// about 1 700 hex positions, so roughly 1 run in 700 contains one of the 14 digit pieces by chance) and clock-derived numbers (the
// rate-limit window_start is the start of the hour: in an hour such as 1764000000 every run held "000000", a piece of 0000000731905).
// Fix: S5 runs at one fixed instant (S5_AT, 10 s into a 30 s TOTP step) with a seeded random source, so its dump is the same bytes every
// run; both are restored afterwards, so other tests are unchanged. Same routes, same markers, same noMarker() rule, same sinks.
const { mock } = require("node:test");
const S5_AT = 1795305610000; // 2026-11-22T00:00:10Z: 10 s into a 30 s step (the clock rule of tests/unit/totp-clock.js)
/** deterministic stand-in for crypto.getRandomValues (xorshift32, fixed seed): the same bytes every run */
function seededRandomValues(seed) {
  let x = seed >>> 0;
  return arr => {
    const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < b.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; b[i] = x & 0xff; }
    return arr;
  };
}
test("S5: seller values never reach logs, audit, other tables, the audit API, analytics or any outbound call", async () => {
  const t0 = Date.now();
  mock.timers.setTime(S5_AT);
  Object.defineProperty(globalThis.crypto, "getRandomValues", { configurable: true, writable: true, value: seededRandomValues(0x5e11e5) });
  try { await s5(); } finally {
    delete globalThis.crypto.getRandomValues;
    mock.timers.setTime(t0);
  }
});
async function s5() {
  const s = await setup();
  const l0 = logs.length;
  assert.equal((await s.putSeller(MARK)).status, 200);
  // refused input that carries marker values: the answer names the field only
  for (const bad of [{ contact_email: "mkmail.z8@@bad" }, { tax_id: "0000000731905MKPX" }, { doc_prefix: "MKPX MKNAMEq7Zx!!" }, { bank_account_no: "7319058842MKBANKk3Jd" },
    { unknown_field: "MKADDRp9Vw" }, { legal_name: "MKNAMEq7Zx".repeat(40) }]) {
    const r = await s.putSeller(bad);
    assert.equal(r.status, 400, JSON.stringify(bad).slice(0, 40));
    noMarker(r.text, "refusal answer");
  }
  await s.O("/seller/logo", { method: "PUT", body: { mime: "image/png", data: png().toString("base64"), ...(await s.step()) } });
  await s.O("/seller");
  const q = await s.newDoc("quotation"), iv = await s.newDoc("invoice"), rc = await s.newDoc("receipt");
  for (const d of [q, iv, rc]) { await s.O(`/seller/docs/${d.id}`); await s.O(`/seller/docs/${d.id}?format=json`); }
  assert.equal((await s.issue(q.id)).status, 200);
  await s.O("/seller/docs");
  assert.equal((await s.O(`/seller/docs/${iv.id}/void`, { method: "POST", body: await s.step() })).status, 200);
  // an internal error on a seller route (table gone): only the error name and the path are logged
  s.env.DB._raw.exec("DROP TABLE seller_docs");
  const e = await s.O("/seller/docs", { method: "POST", body: { doc_type: "receipt", buyer: BUYER, lines: [{ id: "gate_village_lane", qty: 1 }] } });
  assert.equal(e.status, 500);
  noMarker(e.text, "500 answer");
  const out = logs.slice(l0).join("\n");
  noMarker(out, "console output");
  assert.equal((await s.call("/admin/api/audit", { token: s.owner })).status, 200);
  noMarker(s.texts[s.texts.length - 1].text, "GET /admin/api/audit");
  noMarker(await s.dump(["seller_profile", "seller_docs"]), "D1 tables other than the seller tables (incl. audit_log, events, rate_limits)");
  assert.deepEqual(s.outbound, [], "no outbound call (AI, mail, LINE, analytics) from any seller route");
  // static: the seller module never logs and never imports AI / mail / LINE / analytics code
  const src = readFileSync(join(ROOT, "backend", "src", "seller.js"), "utf8") + readFileSync(join(ROOT, "backend", "src", "price-list.js"), "utf8");
  assert.ok(!/\bconsole\.|\blog\(/.test(src), "seller.js / price-list.js write no log line");
  assert.ok(!/from\s+["']\.\/(ai\/|fortune|mail|line|analytics|alerts)/.test(src), "no AI / mail / LINE / analytics / alerts import");
  // the admin page never sends seller data to analytics: the admin shell loads no analytics script and admin-seller.js
  // calls only the admin API
  const shell = readFileSync(join(ROOT, "admin.html"), "utf8");
  assert.ok(!/lensiq-analytics|lensiq-track|lensiq-ai|sendBeacon/.test(shell));
  const ui = readFileSync(join(ROOT, "admin-seller.js"), "utf8");
  assert.ok(!/sendBeacon|LQAnalytics|lensiq-analytics|console\.|\/v1\/events|\/api\/ai|fetch\(/.test(ui), "admin-seller.js uses the admin call() helper only");
}

/* ---------------- S6 ---------------- */
test("S6: missing seller data: TH/EN/ZH block on all three documents, no blank seller lines, issuing refused, no number used", async () => {
  const s = await setup();
  for (const type of ["quotation", "invoice", "receipt"]) {
    const d = await s.newDoc(type);
    const h = await s.O(`/seller/docs/${d.id}`);
    assert.equal(h.status, 200);
    assert.match(h.headers.get("Content-Type"), /text\/html/);
    assert.match(h.text, /data-seller-missing/, type + ": block present");
    assert.match(h.text, /ยังไม่ได้กรอกข้อมูลกิจการ/, type + " TH");
    assert.match(h.text, /Business details not filled in yet/, type + " EN");
    assert.match(h.text, /尚未填写商家信息/, type + " ZH");
    trilingual(h.text, type);
    assert.ok(!/data-seller-field/.test(h.text), type + ": no seller line printed while data is missing (no blanks)");
    const j = (await s.O(`/seller/docs/${d.id}?format=json`)).j;
    assert.deepEqual(j.data.missing_seller_fields.slice().sort(), REQUIRED.slice().sort(), type);
    assert.equal(j.data.issuable, false);
    const r = await s.issue(d.id);
    assert.equal(r.status, 409, type);
    assert.equal(r.j.code, "seller_incomplete");
    assert.deepEqual(r.j.missing.slice().sort(), REQUIRED.slice().sort());
    const row = await s.env.DB.prepare("SELECT status, number, seq FROM seller_docs WHERE id = ?1").bind(d.id).first();
    assert.deepEqual({ ...row }, { status: "draft", number: null, seq: null }, type + ": still a draft, no number");
  }
  const seq = (await s.env.DB.prepare("SELECT COUNT(*) AS n FROM seller_doc_seq WHERE last > 0").first()).n;
  assert.equal(seq, 0, "no sequence number used by a refused issue");
  // partly filled: the block names exactly what is still missing
  assert.equal((await s.putSeller({ legal_name: FILLED.legal_name, tax_id: FILLED.tax_id, address: FILLED.address, contact_email: FILLED.contact_email })).status, 200);
  const d = await s.newDoc("invoice");
  const j = (await s.O(`/seller/docs/${d.id}?format=json`)).j;
  assert.deepEqual(j.data.missing_seller_fields.slice().sort(), ["bank_account_name", "bank_account_no", "bank_name", "doc_prefix", "vat_status"]);
  const r = await s.issue(d.id);
  assert.equal(r.status, 409);
  // explicit VAT "not registered" counts as answered
  assert.equal((await s.putSeller({ vat_registered: false, bank_name: FILLED.bank_name, bank_account_name: FILLED.bank_account_name, bank_account_no: FILLED.bank_account_no, doc_prefix: "TS" })).status, 200);
  const h = await s.O(`/seller/docs/${d.id}`);
  assert.ok(!/data-seller-missing/.test(h.text), "complete: no missing block");
  assert.equal((await s.issue(d.id)).status, 200);
});

/* ---------------- S7 ---------------- */
test("S7: numbering: prefix + type code + DB sequence; concurrent issues unique and gap-free; never reused", async () => {
  const s = await setup();
  assert.equal((await s.putSeller(FILLED)).status, 200);
  const docs = [];
  for (let i = 0; i < 8; i++) docs.push(await s.newDoc("quotation"));
  await s.sudo();
  // eight issues at once (sudo window), plus the first one twice
  const rs = await Promise.all([...docs, docs[0]].map(d => s.O(`/seller/docs/${d.id}/issue`, { method: "POST", body: {} })));
  const ok = rs.filter(r => r.status === 200);
  assert.equal(ok.length, 8, rs.map(r => r.status).join(","));
  assert.equal(rs.filter(r => r.status === 409 && r.j.code === "already_issued").length, 1);
  const nums = ok.map(r => r.j.doc.number).sort();
  assert.equal(new Set(nums).size, 8, "unique");
  assert.deepEqual(nums, [1, 2, 3, 4, 5, 6, 7, 8].map(n => "TS-QT-" + String(n).padStart(6, "0")), "gap-free, prefix + type code");
  // other document types have their own sequence and code
  const iv = await s.newDoc("invoice"), rc = await s.newDoc("receipt");
  assert.equal((await s.issue(iv.id)).j.doc.number, "TS-IV-000001");
  assert.equal((await s.issue(rc.id)).j.doc.number, "TS-RC-000001");
  // void keeps its number; the next quotation continues, never reusing it. Re-lock (owner decision 162, 2026-11-19): the
  // eight issues run at once, so which number docs[7] gets is not fixed; read it before the void instead of assuming 8
  const before = await s.env.DB.prepare("SELECT number FROM seller_docs WHERE id = ?1").bind(docs[7].id).first();
  assert.ok(nums.includes(before.number), "docs[7] holds one of the eight issued numbers: " + before.number);
  assert.equal((await s.O(`/seller/docs/${docs[7].id}/void`, { method: "POST", body: await s.step() })).status, 200);
  const v = await s.env.DB.prepare("SELECT status, number FROM seller_docs WHERE id = ?1").bind(docs[7].id).first();
  assert.equal(v.status, "void"); assert.equal(v.number, before.number);
  const n9 = await s.newDoc("quotation");
  assert.equal((await s.issue(n9.id)).j.doc.number, "TS-QT-000009");
  // a changed prefix continues the sequence (no restart, no reuse)
  assert.equal((await s.putSeller({ doc_prefix: "TS2" })).status, 200);
  const n10 = await s.newDoc("quotation");
  assert.equal((await s.issue(n10.id)).j.doc.number, "TS2-QT-000010");
  // a voided or issued document cannot be issued again; a draft cannot be voided into a number
  assert.equal((await s.issue(docs[7].id)).status, 409);
  const all = (await s.env.DB.prepare("SELECT number FROM seller_docs WHERE number IS NOT NULL").all()).results.map(r => r.number);
  assert.equal(new Set(all).size, all.length, "no number twice in the database");
  // the database itself refuses a duplicate number
  await assert.rejects(s.env.DB.prepare("UPDATE seller_docs SET number = 'TS-QT-000001' WHERE id = ?1").bind(n9.id).run());
  // issued documents are frozen: no edit route changes them
  const iss = await s.issue(docs[0].id);
  assert.equal(iss.status, 409);
});

/* ---------------- S8 ---------------- */
test("S8: filled: every seller field is in each document; an issued document keeps the details of its issue day", async () => {
  const s = await setup();
  assert.equal((await s.putSeller(FILLED)).status, 200);
  assert.equal((await s.O("/seller/logo", { method: "PUT", body: { mime: "image/png", data: png().toString("base64"), ...(await s.step()) } })).status, 200);
  const want = [FILLED.legal_name, FILLED.tax_id, FILLED.branch, FILLED.address, FILLED.bank_name, FILLED.bank_account_name, FILLED.bank_account_no,
    FILLED.contact_phone, FILLED.contact_email, FILLED.contact_line];
  const ids = {};
  for (const type of ["quotation", "invoice", "receipt"]) {
    const d = await s.newDoc(type);
    ids[type] = d.id;
    const h = (await s.O(`/seller/docs/${d.id}`)).text;
    assert.ok(!/data-seller-missing/.test(h), type);
    for (const v of want) {
      if (type === "receipt" && /^(ธนาคารทดสอบ|0001112223)$/.test(v)) continue; // the bank account is a payment instruction (quotation, invoice)
      assert.ok(h.includes(v), `${type}: seller value missing from the document: ${v.slice(0, 4)}…`);
    }
    assert.match(h, /data-seller-field="legal_name"/);
    trilingual(h, type);
    assert.match(h, /<img[^>]+src="data:image\/png;base64,/, type + ": logo");
    assert.ok(h.includes(BUYER.name) && h.includes(BUYER.tax_id), type + ": buyer");
    // VAT-registered seller: 12 people × 19 THB = 228.00, VAT 7 % = 15.96, total 243.96
    assert.ok(h.includes("228.00") && h.includes("15.96") && h.includes("243.96"), type + ": amounts excl. VAT + 7 % VAT");
    assert.match(h, /ไม่รวม(ภาษีมูลค่าเพิ่ม|\s?VAT)/, type + ": prices labelled excl. VAT");
    // print-ready page: no script, strict CSP, A4
    const r = await s.O(`/seller/docs/${d.id}`);
    assert.match(r.headers.get("Content-Security-Policy") || "", /default-src 'none'/);
    assert.ok(!/<script/i.test(h));
    assert.match(h, /@page\s*\{[^}]*A4/);
  }
  // issue the invoice, then change the seller details: the issued invoice keeps the old ones, the draft shows the new
  const iv = await s.issue(ids.invoice);
  assert.equal(iv.status, 200);
  assert.equal(iv.j.doc.number, "TS-IV-000001");
  assert.equal((await s.putSeller({ legal_name: "ทดสอบ ใหม่ จำกัด", address: "2 ถนนใหม่" })).status, 200);
  const hi = (await s.O(`/seller/docs/${ids.invoice}`)).text;
  assert.ok(hi.includes(FILLED.legal_name) && hi.includes(FILLED.address) && !hi.includes("ทดสอบ ใหม่ จำกัด"), "issued: frozen");
  assert.ok(hi.includes("TS-IV-000001"));
  const hq = (await s.O(`/seller/docs/${ids.quotation}`)).text;
  assert.ok(hq.includes("ทดสอบ ใหม่ จำกัด"), "draft: current details");
  assert.match(hq, /ฉบับร่าง|DRAFT/, "a draft is marked as a draft");
  assert.ok(!/ฉบับร่าง/.test(hi), "the issued document is not marked as a draft");
});

/* ---------------- S9 ---------------- */
test("S9: prices only from the approved list (excl. 7 % VAT), matching docs/PRICING-RESEARCH.md §3; no client price; VAT only when registered", async () => {
  const s = await setup();
  const pl = await s.O("/seller/prices");
  assert.equal(pl.status, 200);
  const lines = pl.j.lines;
  const ids = lines.map(l => l.id).sort();
  for (const id of ["attendance_person", "crowd_event_day", "crowd_event_week", "exam_lab_candidate", "exam_lab_room", "gate_parking_lane", "gate_village_lane"]) assert.ok(ids.includes(id), id);
  for (const l of lines) assert.ok(!/hall|dense|monthly_crowd/.test(l.id), "not-for-sale items are not in the list: " + l.id);
  const doc = readFileSync(join(ROOT, "docs", "PRICING-RESEARCH.md"), "utf8");
  const sec3 = doc.slice(doc.indexOf("## 3."), doc.indexOf("## 4."));
  const fmt = n => n.toLocaleString("en-US");
  for (const l of lines) {
    assert.ok(Number.isInteger(l.pilot_satang) && l.pilot_satang > 0, l.id);
    assert.ok(l.name_th && l.name_en && l.name_zh && l.unit_th && l.unit_en && l.unit_zh, l.id + ": TH/EN/ZH");
    const row = sec3.split("\n").find(r => r.startsWith("|") && r.includes(l.source_row));
    assert.ok(row, l.id + ": source row in PRICING-RESEARCH.md §3: " + l.source_row);
    assert.ok(row.includes("**" + fmt(l.pilot_satang / 100) + " THB"), `${l.id}: pilot price ${l.pilot_satang / 100} THB is the approved one`);
    assert.ok(/excl\. 7% VAT/.test(row), l.id + ": excl. 7 % VAT");
    if (l.min_satang) assert.ok(row.includes("minimum " + fmt(l.min_satang / 100) + " THB"), l.id + ": minimum");
  }
  // a client-supplied price or an unknown line is refused
  const bad1 = await s.O("/seller/docs", { method: "POST", body: { doc_type: "quotation", buyer: BUYER, lines: [{ id: "attendance_person", qty: 1, unit_satang: 1 }] } });
  assert.equal(bad1.status, 400);
  const bad2 = await s.O("/seller/docs", { method: "POST", body: { doc_type: "quotation", buyer: BUYER, lines: [{ id: "exam_hall_day", qty: 1 }] } });
  assert.equal(bad2.status, 400);
  const bad3 = await s.O("/seller/docs", { method: "POST", body: { doc_type: "tax_invoice", buyer: BUYER, lines: [{ id: "attendance_person", qty: 1 }] } });
  assert.equal(bad3.status, 400);
  // minimum per line: 3 people × 19 = 57 -> minimum 190.00
  const m = await s.newDoc("quotation", { lines: [{ id: "attendance_person", qty: 3 }] });
  assert.equal(m.subtotal_satang, 19000);
  // not VAT-registered: no VAT line, total = subtotal
  assert.equal((await s.putSeller({ ...FILLED, vat_registered: false })).status, 200);
  const nv = await s.newDoc("invoice", { lines: [{ id: "gate_village_lane", qty: 2 }] });
  const j = (await s.O(`/seller/docs/${nv.id}?format=json`)).j.data;
  assert.equal(j.subtotal_satang, 98000); assert.equal(j.vat_satang, 0); assert.equal(j.total_satang, 98000);
  const h = (await s.O(`/seller/docs/${nv.id}`)).text;
  assert.ok(!/ภาษีมูลค่าเพิ่ม 7%/.test(h), "no VAT line for a seller not registered for VAT");
  // VAT-registered at 7 %
  assert.equal((await s.putSeller({ vat_registered: true, vat_rate_bp: 700 })).status, 200);
  const v = (await s.O(`/seller/docs/${nv.id}?format=json`)).j.data;
  assert.equal(v.vat_satang, 6860); assert.equal(v.total_satang, 104860);
  // the quotation shows the regular price beside the pilot price (owner decision 2026-11-13, option B)
  const q = await s.newDoc("quotation", { lines: [{ id: "gate_village_lane", qty: 1 }] });
  const qh = (await s.O(`/seller/docs/${q.id}`)).text;
  assert.match(qh, /ราคานำร่อง/); assert.match(qh, /ราคาปกติหลังผ่านเกณฑ์นำร่อง/);
});

/* ---------------- S10 ---------------- */
test("S10: logo: PNG / JPEG / WebP only (checked by content), size cap, no SVG; kept in D1 (no R2 binding)", async () => {
  const s = await setup();
  const put = async b => s.O("/seller/logo", { method: "PUT", body: { ...b, ...(await s.step()) } });
  for (const [mime, buf] of [["image/png", png()], ["image/jpeg", jpeg()], ["image/webp", webp()]]) {
    const r = await put({ mime, data: buf.toString("base64") });
    assert.equal(r.status, 200, mime + " " + JSON.stringify(r.j));
    const g = (await s.O("/seller")).j.logo;
    assert.equal(g.set, true); assert.equal(g.mime, mime); assert.equal(g.bytes, buf.length);
    const img = await s.O("/seller/logo");
    assert.equal(img.status, 200); assert.equal(img.headers.get("Content-Type"), mime);
    assert.equal(img.headers.get("X-Content-Type-Options"), "nosniff");
  }
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal((await put({ mime: "image/svg+xml", data: svg.toString("base64") })).status, 415);
  assert.equal((await put({ mime: "image/png", data: svg.toString("base64") })).status, 415, "type checked by the bytes, not the label");
  assert.equal((await put({ mime: "image/png", data: jpeg().toString("base64") })).status, 415, "label and bytes must agree");
  const { LOGO_MAX_BYTES } = await import(B + "seller.js");
  assert.ok(LOGO_MAX_BYTES >= 50000 && LOGO_MAX_BYTES <= 500000, "cap between 50 kB and 500 kB");
  const big = await put({ mime: "image/png", data: png(LOGO_MAX_BYTES).toString("base64") });
  assert.equal(big.status, 413);
  const row = await s.env.DB.prepare("SELECT logo_mime, logo_bytes, length(logo_data) AS n FROM seller_profile WHERE id = 1").first();
  assert.equal(row.logo_mime, "image/webp", "the refused uploads did not replace the stored logo");
  assert.ok(row.n > 0, "kept in D1");
});

/* ---------------- S11 ---------------- */
test("S11: migration 0021_seller.sql exists, is listed in health.js and has a schema probe", async () => {
  assert.ok(existsSync(join(ROOT, "backend", "migrations", "0021_seller.sql")));
  const h = readFileSync(join(ROOT, "backend", "src", "health.js"), "utf8");
  assert.match(h, /"0021_seller\.sql"/);
  assert.match(h, /\["0021_seller\.sql",\s*"SELECT [^"]*seller_profile/);
  const sql = readFileSync(join(ROOT, "backend", "migrations", "0021_seller.sql"), "utf8");
  for (const t of ["seller_profile", "seller_docs", "seller_doc_seq"]) assert.match(sql, new RegExp("CREATE TABLE " + t));
  assert.match(sql, /UNIQUE/);
  // nothing seller-specific in the repository's Worker config (the repo is public)
  const toml = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
  assert.ok(!/ทดสอบ จำกัด|0000000000000|MKNAME/.test(toml));
});
