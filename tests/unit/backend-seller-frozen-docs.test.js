"use strict";
// tests/unit/backend-seller-r1.test.js — seller details, review round 1 (independent reviewer NOT OK on 13cf281, 2026-11-18).
// FIXED TEST SET locked in evals-locks/seller-settings.sha256 BEFORE the fixes. In-memory D1; synthetic values only.
//   R1 (high)  an issued document is fully frozen: a later price change or a removed price line never changes it, and a draft
//              whose line left the price list does not break the list (issue refused with 409 not_on_price_list)
//   R2 (high)  GET /seller/docs uses the same number of D1 statements for 10 and for 100 documents, and at most 15 (Workers
//              Free: 50 queries per invocation)
//   R3 (med)   issued documents do not each carry a copy of the logo: one stored copy per distinct logo; documents still
//              print it; an old logo stays on documents issued with it after the logo is replaced
//   R4 (low)   a missing seller_profile row is recreated: a change answered 200 is really stored
//   R5 (low)   VAT rate: only 7 % (700) is accepted for a VAT-registered seller (approved prices are excl. 7 % VAT); the
//              document prints "7%"
//   R6 (low)   document text: the default branch is TH / EN / ZH; the quotation's regular-price column is TH / EN / ZH
//   R7 (low)   the page can clear tax ID / bank account number / phone (one "remove" control per masked field)
//   R8 (low)   the receipt payment date must be a real calendar date
const test = require("node:test");
// test-bug re-lock 2026-11-21 (A5 review): one frozen clock for the code generator and the Worker (tests/unit/totp-clock.js);
// totp(secret, -1) failed when a 30 s step boundary fell between generating and verifying ("400 !== 200", backend-seller.test.js:96)
require("./totp-clock.js").freeze();
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "r".repeat(40);
const PW = "correct horse battery staple seller r1";
const nowS = () => Math.floor(Date.now() / 1000);
const FILLED = {
  legal_name: "ทดสอบ จำกัด", tax_id: "0000000000000", address: "1 ถนนทดสอบ กรุงเทพฯ 10000", vat_registered: true, vat_rate_bp: 700,
  bank_name: "ธนาคารทดสอบ", bank_account_name: "ทดสอบ จำกัด", bank_account_no: "0001112223", contact_email: "billing@seller.example", doc_prefix: "TS"
};
const png = (fill = 0, pad = 64) => Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 64, 0, 0, 0, 32, 8, 6, 0, 0, 0]), Buffer.alloc(pad, fill)]);

async function setup() {
  const { handle } = await import(B + "index.js");
  const crypto = await import(B + "crypto.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 22).toString("base64") });
  let counting = false, statements = 0;
  const realPrepare = env.DB.prepare;
  env.DB.prepare = sql => { if (counting) statements++; return realPrepare(sql); };
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers }), env, { fetch: async () => { throw new Error("no network"); } });
    const text = await r.clone().text();
    let j = null; try { j = JSON.parse(text); } catch { /* html */ }
    return { status: r.status, j, text };
  };
  const totp = (s, d = 0) => crypto.totpAt(crypto.base32Decode(s), Math.floor(nowS() / 30) + d);
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: PW } });
  const tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } })).j.token;
  const O = (p, o = {}) => call("/admin/api" + p, { ...o, token: tok });
  const secret = (await O("/totp/setup", { method: "POST", body: { password: PW } })).j.secret;
  assert.equal((await O("/totp/enable", { method: "POST", body: { code: await totp(secret, -1) } })).status, 200);
  const step = async () => { await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run(); return { password: PW, totp: await totp(secret) }; };
  const putSeller = async f => O("/seller", { method: "PUT", body: { ...f, ...(await step()) } });
  const newDoc = async (doc_type, lines = [{ id: "gate_village_lane", qty: 2 }], extra = {}) => {
    const r = await O("/seller/docs", { method: "POST", body: { doc_type, buyer: { name: "ลูกค้า ทดสอบ" }, lines, ...extra } });
    assert.equal(r.status, 201, r.text);
    return r.j.doc;
  };
  const issue = async id => O(`/seller/docs/${id}/issue`, { method: "POST", body: await step() });
  const count = async fn => { statements = 0; counting = true; try { await fn(); } finally { counting = false; } return statements; };
  return { env, O, putSeller, newDoc, issue, step, count };
}

test("R1: an issued document is frozen against price changes and removed lines; a draft with a removed line does not break the list", async () => {
  const s = await setup();
  const { PRICE_LINES } = await import(B + "price-list.js");
  assert.equal((await s.putSeller(FILLED)).status, 200);
  const d = await s.newDoc("receipt");
  const draft = await s.newDoc("quotation", [{ id: "crowd_event_week", qty: 1 }]);
  assert.equal((await s.issue(d.id)).status, 200);
  const before = (await s.O(`/seller/docs/${d.id}`)).text;
  assert.ok(before.includes("490.00") && before.includes("980.00"));
  const gate = PRICE_LINES.find(l => l.id === "gate_village_lane");
  const saved = { ...gate };
  const idx = PRICE_LINES.findIndex(l => l.id === "crowd_event_week");
  const removed = PRICE_LINES.splice(idx, 1)[0];
  try {
    gate.pilot_satang = 99000; gate.name_th = "ชื่อใหม่"; gate.name_en = "New name";
    const after = await s.O(`/seller/docs/${d.id}`);
    assert.equal(after.status, 200);
    assert.ok(after.text.includes("490.00") && after.text.includes("980.00"), "issued unit price and line amount unchanged");
    assert.ok(!after.text.includes("990.00") && !after.text.includes("1,980.00") && !after.text.includes("ชื่อใหม่"), "no current price or name on an issued document");
    const j = (await s.O(`/seller/docs/${d.id}?format=json`)).j.data;
    assert.equal(j.lines[0].unit_satang, 49000); assert.equal(j.lines[0].amount_satang, 98000); assert.equal(j.total_satang, 104860);
    // a draft whose line left the list: the list still answers, the draft cannot be issued
    const list = await s.O("/seller/docs");
    assert.equal(list.status, 200, list.text);
    assert.equal(list.j.docs.length, 2);
    const r = await s.issue(draft.id);
    assert.equal(r.status, 409); assert.equal(r.j.code, "not_on_price_list");
    assert.equal((await s.O(`/seller/docs/${draft.id}`)).status, 200, "the draft can still be opened");
    // an issued document whose line was later removed still opens
    PRICE_LINES.splice(PRICE_LINES.indexOf(gate), 1);
    try { assert.equal((await s.O(`/seller/docs/${d.id}`)).status, 200); } finally { PRICE_LINES.push(gate); }
  } finally {
    Object.assign(gate, saved);
    PRICE_LINES.splice(idx, 0, removed);
  }
});

test("R2: the document list costs a fixed, small number of D1 statements (10 vs 100 documents)", async () => {
  const s = await setup();
  assert.equal((await s.putSeller(FILLED)).status, 200);
  for (let i = 0; i < 10; i++) { const d = await s.newDoc(i % 2 ? "invoice" : "quotation"); if (i < 3) assert.equal((await s.issue(d.id)).status, 200); }
  await s.O("/seller/docs"); // warm-up (daily salt row)
  const n10 = await s.count(async () => assert.equal((await s.O("/seller/docs")).status, 200));
  for (let i = 0; i < 90; i++) await s.newDoc("receipt");
  let list;
  const n100 = await s.count(async () => { list = await s.O("/seller/docs"); assert.equal(list.status, 200); });
  assert.equal(list.j.docs.length, 100);
  assert.equal(n100, n10, `statements for 100 documents (${n100}) = for 10 (${n10})`);
  assert.ok(n100 <= 15, "at most 15 statements: " + n100);
  // the summary still carries the totals
  const r = list.j.docs.find(x => x.status === "draft" && x.doc_type === "receipt");
  assert.equal(r.subtotal_satang, 98000); assert.equal(r.total_satang, 104860);
  // the settings view is also bounded
  const g = await s.count(async () => assert.equal((await s.O("/seller")).status, 200));
  assert.ok(g <= 10, "GET /seller statements: " + g);
});

test("R3: one stored copy per distinct logo; documents still print it; old documents keep the old logo", async () => {
  const s = await setup();
  assert.equal((await s.putSeller(FILLED)).status, 200);
  const big = png(7, 150000), other = png(9, 1000);
  assert.equal((await s.O("/seller/logo", { method: "PUT", body: { mime: "image/png", data: big.toString("base64"), ...(await s.step()) } })).status, 200);
  const ids = [];
  for (let i = 0; i < 5; i++) { const d = await s.newDoc("invoice"); assert.equal((await s.issue(d.id)).status, 200); ids.push(d.id); }
  const snap = (await s.env.DB.prepare("SELECT COALESCE(SUM(length(seller_json)), 0) AS n FROM seller_docs").first()).n;
  assert.ok(snap < 5 * 20000, "issued documents do not each hold the logo: " + snap + " bytes of snapshots");
  const tables = (await s.env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(t => t.name);
  let total = 0;
  for (const t of tables) {
    const cols = (await s.env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all()).results.map(c => c.name);
    for (const c of cols) total += Number((await s.env.DB.prepare(`SELECT COALESCE(SUM(length(CAST("${c}" AS BLOB))), 0) AS n FROM "${t}"`).first()).n);
  }
  assert.ok(total < 2.5 * big.length * 4 / 3, "about one base64 copy of the logo in the whole database (profile + one stored copy at most): " + total);
  const b64 = big.toString("base64");
  for (const id of ids) assert.ok((await s.O(`/seller/docs/${id}`)).text.includes(b64.slice(0, 200)), "the issued document prints the logo");
  // replace the logo: documents issued before keep the old one, new ones get the new one
  assert.equal((await s.O("/seller/logo", { method: "PUT", body: { mime: "image/png", data: other.toString("base64"), ...(await s.step()) } })).status, 200);
  assert.ok((await s.O(`/seller/docs/${ids[0]}`)).text.includes(b64.slice(0, 200)), "old logo kept on an old document");
  const n = await s.newDoc("invoice"); assert.equal((await s.issue(n.id)).status, 200);
  assert.ok((await s.O(`/seller/docs/${n.id}`)).text.includes(other.toString("base64").slice(0, 120)));
});

test("R4: a missing seller_profile row is recreated: what is answered as saved is stored", async () => {
  const s = await setup();
  await s.env.DB.prepare("DELETE FROM seller_profile").run();
  const r = await s.putSeller({ legal_name: "ทดสอบ จำกัด" });
  assert.equal(r.status, 200);
  assert.equal((await s.env.DB.prepare("SELECT legal_name FROM seller_profile WHERE id = 1").first() || {}).legal_name, "ทดสอบ จำกัด");
  await s.env.DB.prepare("DELETE FROM seller_profile").run();
  assert.equal((await s.O("/seller/logo", { method: "PUT", body: { mime: "image/png", data: png().toString("base64"), ...(await s.step()) } })).status, 200);
  assert.equal((await s.O("/seller")).j.logo.set, true);
});

test("R5: VAT rate: only 7 % is accepted for a VAT-registered seller; the document prints 7%", async () => {
  const s = await setup();
  for (const bp of [0, 750, 1000, 699]) assert.equal((await s.putSeller({ vat_registered: true, vat_rate_bp: bp })).status, 400, String(bp));
  assert.equal((await s.putSeller({ ...FILLED, vat_rate_bp: 700 })).status, 200);
  const d = await s.newDoc("invoice");
  const h = (await s.O(`/seller/docs/${d.id}`)).text;
  assert.match(h, /ภาษีมูลค่าเพิ่ม 7%/);
  // registering without a rate gives 7 %
  assert.equal((await s.putSeller({ vat_registered: false })).status, 200);
  assert.equal((await s.putSeller({ vat_registered: true })).status, 200);
  assert.equal((await s.O("/seller")).j.profile.vat_rate_bp, 700);
});

test("R6: default branch and the regular-price column are in Thai, English and Chinese", async () => {
  const s = await setup();
  assert.equal((await s.putSeller(FILLED)).status, 200); // no branch set
  const d = await s.newDoc("quotation", [{ id: "attendance_person", qty: 12 }, { id: "gate_village_lane", qty: 1 }]);
  const h = (await s.O(`/seller/docs/${d.id}`)).text;
  assert.ok(h.includes("สำนักงานใหญ่") && /Head office/.test(h) && h.includes("总公司"), "default branch TH / EN / ZH");
  const { PRICE_LINES } = await import(B + "price-list.js");
  for (const l of PRICE_LINES) assert.ok(l.regular_en && l.regular_zh, l.id + ": regular price EN / ZH");
  assert.ok(h.includes("29 (minimum 290)") || /29[^<]*minimum[^<]*290/.test(h), "regular price EN on the quotation");
  assert.ok(/29[^<]*最低[^<]*290/.test(h), "regular price ZH on the quotation");
});

test("R7: the page offers a remove control for each masked field and sends an empty value for it", () => {
  const html = readFileSync(join(ROOT, "admin.html"), "utf8");
  for (const k of ["tax_id", "bank_account_no", "contact_phone"]) assert.match(html, new RegExp(`name="clear_${k}"`), k);
  const js = readFileSync(join(ROOT, "admin-seller.js"), "utf8");
  assert.match(js, /clear_/);
});

test("R8: the receipt payment date must be a real calendar date", async () => {
  const s = await setup();
  for (const bad of ["2026-99-99", "2026-02-30", "2026-13-01", "1999-01-01", "2026-1-01"]) {
    const r = await s.O("/seller/docs", { method: "POST", body: { doc_type: "receipt", buyer: { name: "X" }, lines: [{ id: "gate_setup", qty: 1 }], paid_on: bad } });
    assert.equal(r.status, 400, bad);
  }
  const ok = await s.O("/seller/docs", { method: "POST", body: { doc_type: "receipt", buyer: { name: "X" }, lines: [{ id: "gate_setup", qty: 1 }], paid_on: "2026-11-18" } });
  assert.equal(ok.status, 201);
});
