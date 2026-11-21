"use strict";
// tests/unit/seller-doc-lang.test.js — owner decision 199 ข (2026-11-20): the seller's DEFAULT document language is
// Thai + English. A seller default only (one setting for every new document); a per-document choice comes later and is
// not built. FIXED TEST SET, hash-locked in evals-locks/seller-docs.sha256 (~/LENSIQ-field/evals/seller-docs/) BEFORE
// any product code. In-memory D1 (node:sqlite shim); no network; synthetic values only.
// Switch: Worker var SELLER_DOC_LANG, "on" (trimmed, any case) enables it; "off" in backend/wrangler.toml for the
// template (customer) build AND the test deployment (live), so nothing changes on a deployed Worker until the owner says.
//   L1  switch off (default): GET /seller has no doc_langs; PUT doc_langs is refused (400 unknown_field) before any
//       step-up; drafts render in TH + EN + ZH exactly as before (data.langs "th-en-zh")
//   L2  switch on: GET /seller reports {value: null, effective: "th-en", options}; a draft renders TH + EN and no Chinese
//   L3  the owner sets the default (step-up as every seller change; audited as a field name, never a value): "th" =
//       Thai only (no English or Chinese labels), "th-en-zh" = all three; any other value is refused (bad_field)
//   L4  an issued document keeps the language it was issued with; a later default change touches drafts only
//   L5  documents issued before the switch (no language in the frozen copy) keep TH + EN + ZH; switching off again
//       renders every draft in TH + EN + ZH even when a default was stored
//   L6  all three document types and the "not filled in" block follow the language set; every amount stays printed
//   L7  backend/wrangler.toml: SELLER_DOC_LANG = "off" in [vars] and [env.test.vars]
//   L8  the lawyer question (Thai + English quotation / tax documents; which language governs) is in docs/LEGAL-PACKET.md
//       and in the CTO-BRIEF legal table
//   L9  admin page: the default-language control is hidden in admin.html (shown only when the Worker reports doc_langs);
//       every new label exists in English and Chinese
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "d".repeat(40);
const OWNER_PW = "seller document language passphrase";
const nowS = () => Math.floor(Date.now() / 1000);
const HAN = /[㐀-鿿＀-￯]/;
const LATIN_LABELS = ["Quotation", "Invoice", "Receipt", "Seller", "Customer", "Description", "Quantity", "Subtotal", "Total", "Bank transfer", "DRAFT"];

const FILLED = {
  legal_name: "ทดสอบ จำกัด", tax_id: "0000000000000", branch: "สำนักงานใหญ่", address: "ที่อยู่ทดสอบสังเคราะห์ แขวงทดสอบ เขตทดสอบ",
  vat_registered: true, vat_rate_bp: 700, bank_name: "ธนาคารทดสอบ", bank_account_name: "ทดสอบ จำกัด", bank_account_no: "0001112223",
  contact_phone: "0200000000", doc_prefix: "TS"
};
const BUYER = { name: "ลูกค้าทดสอบ", address: "ที่อยู่ลูกค้าทดสอบ" };

/** document text without the inline <style> (the embedded font) and without tags */
const body = html => String(html).replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");

async function setup(vars = {}) {
  const { handle } = await import(B + "index.js");
  const crypto = await import(B + "crypto.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 23).toString("base64"), ...vars });
  const outbound = [];
  const fetchStub = async url => { outbound.push(String(url)); throw new Error("no network in this test"); };
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers }), env, { fetch: fetchStub });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch { /* html */ }
    return { status: r.status, j, text };
  };
  const totp = (s, d = 0) => crypto.totpAt(crypto.base32Decode(s), Math.floor(nowS() / 30) + d);
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: OWNER_PW } });
  const owner = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: OWNER_PW, mode: "bearer" } })).j.token;
  const O = (path, o = {}) => call("/admin/api" + path, { ...o, token: owner });
  const st = await O("/totp/setup", { method: "POST", body: { password: OWNER_PW } });
  const secret = st.j.secret;
  assert.equal((await O("/totp/enable", { method: "POST", body: { code: await totp(secret, -1) } })).status, 200);
  const step = async () => { await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run(); return { password: OWNER_PW, totp: await totp(secret) }; };
  const put = async (fields, o = {}) => O("/seller", { method: "PUT", body: { ...fields, ...(o.noStep ? {} : await step()) } });
  const draft = async (type = "quotation", qty = 3) => {
    const r = await O("/seller/docs", { method: "POST", body: { doc_type: type, buyer: BUYER, lines: [{ id: "attendance_person", qty }] } });
    assert.equal(r.status, 201, JSON.stringify(r.j));
    return r.j.doc.id;
  };
  const html = async id => { const r = await O("/seller/docs/" + id); assert.equal(r.status, 200); return r.text; };
  const data = async id => (await O("/seller/docs/" + id + "?format=json")).j.data;
  const issue = async id => {
    const r = await O("/seller/docs/" + id + "/issue", { method: "POST", body: await step() });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    return r.j.doc;
  };
  return { env, O, put, draft, html, data, issue, outbound, step };
}

const hasEn = h => LATIN_LABELS.some(w => body(h).includes(w));
const hasZh = h => HAN.test(body(h));
const hasTh = h => /[ก-๛]/.test(body(h));

test("L1: switch off (default): no doc_langs in GET, PUT doc_langs refused before any step-up, drafts stay TH + EN + ZH", async () => {
  const s = await setup();
  const g = await s.O("/seller");
  assert.equal(g.status, 200);
  assert.ok(!("doc_langs" in g.j), "no doc_langs while the switch is off: " + Object.keys(g.j));
  const p = await s.put({ doc_langs: "th" }, { noStep: true });
  assert.equal(p.status, 400, JSON.stringify(p.j));
  assert.equal(p.j.code, "unknown_field");
  assert.equal((await s.put(FILLED)).status, 200);
  const id = await s.draft();
  const h = await s.html(id);
  assert.ok(hasTh(h) && hasEn(h) && hasZh(h), "TH + EN + ZH while off");
  assert.ok(/报价单/.test(h) && /Quotation/.test(h) && /ใบเสนอราคา/.test(h));
  assert.equal((await s.data(id)).langs, "th-en-zh");
  for (const v of ["On ", " ON", "on"]) {
    const t = await setup({ SELLER_DOC_LANG: v });
    assert.ok("doc_langs" in (await t.O("/seller")).j, JSON.stringify(v) + " switches it on");
  }
  for (const v of ["", "off", "true", "1", "yes"]) {
    const t = await setup({ SELLER_DOC_LANG: v });
    assert.ok(!("doc_langs" in (await t.O("/seller")).j), JSON.stringify(v) + " keeps it off");
  }
});

test("L2: switch on: the default is Thai + English (no Chinese anywhere in the document)", async () => {
  const s = await setup({ SELLER_DOC_LANG: "on" });
  const g = (await s.O("/seller")).j;
  assert.deepEqual(g.doc_langs, { value: null, effective: "th-en", options: ["th", "th-en", "th-en-zh"] });
  assert.equal((await s.put(FILLED)).status, 200);
  const id = await s.draft();
  const h = await s.html(id);
  assert.ok(hasTh(h) && hasEn(h), "Thai and English labels");
  assert.ok(!hasZh(h), "no Chinese: " + (body(h).match(/.{0,30}[㐀-鿿].{0,30}/) || [])[0]);
  assert.equal((await s.data(id)).langs, "th-en");
});

test("L3: the owner sets the default (step-up, audited by field name): th = Thai only, th-en-zh = all three; other values refused", async () => {
  const s = await setup({ SELLER_DOC_LANG: "on" });
  assert.equal((await s.put(FILLED)).status, 200);
  const noStep = await s.put({ doc_langs: "th" }, { noStep: true });
  assert.notEqual(noStep.status, 200, "a change needs the step-up");
  assert.equal((await s.O("/seller")).j.doc_langs.value, null, "nothing stored without the step-up");
  for (const bad of ["en", "zh", "th-zh", "TH", "", "th-en-zh-ja", 1, true, null]) {
    if (bad === "" || bad === null) continue; // "" / null clear a field (back to the default): checked below
    const r = await s.put({ doc_langs: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.j.code, "bad_field", JSON.stringify(bad));
  }
  const r = await s.put({ doc_langs: "th" });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.deepEqual(r.j.doc_langs, { value: "th", effective: "th", options: ["th", "th-en", "th-en-zh"] });
  let h = await s.html(await s.draft());
  assert.ok(hasTh(h) && !hasEn(h) && !hasZh(h), "Thai only: " + LATIN_LABELS.filter(w => body(h).includes(w)));
  const audit = await s.env.DB.prepare("SELECT action, detail FROM audit_log WHERE action = 'seller.profile.updated' ORDER BY rowid DESC LIMIT 1").first();
  assert.ok(audit && /doc_langs/.test(audit.detail), "audited by field name: " + JSON.stringify(audit));
  assert.ok(!/"th"/.test(audit.detail), "the value is not in the audit row: " + audit.detail);
  assert.equal((await s.put({ doc_langs: "th-en-zh" })).status, 200);
  h = await s.html(await s.draft());
  assert.ok(hasTh(h) && hasEn(h) && hasZh(h), "all three");
  assert.equal((await s.put({ doc_langs: "" })).status, 200, "cleared");
  assert.deepEqual((await s.O("/seller")).j.doc_langs, { value: null, effective: "th-en", options: ["th", "th-en", "th-en-zh"] });
  assert.deepEqual(s.outbound, []);
});

test("L4: an issued document keeps its language; a later default change touches drafts only", async () => {
  const s = await setup({ SELLER_DOC_LANG: "on" });
  assert.equal((await s.put(FILLED)).status, 200);
  const issuedId = await s.draft();
  const d = await s.issue(issuedId);
  assert.ok(d.number);
  assert.equal((await s.put({ doc_langs: "th" })).status, 200);
  const h = await s.html(issuedId);
  assert.ok(hasEn(h) && !hasZh(h), "issued under th-en: still TH + EN");
  assert.equal((await s.data(issuedId)).langs, "th-en");
  const later = await s.html(await s.draft());
  assert.ok(!hasEn(later) && !hasZh(later), "new draft: Thai only");
  assert.equal((await s.put({ doc_langs: "th-en-zh" })).status, 200);
  assert.ok(!hasZh(await s.html(issuedId)), "the issued one never changes");
  // void keeps the frozen language too
  assert.equal((await s.O("/seller/docs/" + issuedId + "/void", { method: "POST", body: await s.step() })).status, 200);
  const v = await s.html(issuedId);
  assert.ok(hasEn(v) && !hasZh(v), "void: still TH + EN");
});

test("L5: documents issued before the switch keep TH + EN + ZH; switching off renders every draft TH + EN + ZH", async () => {
  const s = await setup({ SELLER_DOC_LANG: "off" });
  assert.equal((await s.put(FILLED)).status, 200);
  const oldId = await s.draft();
  await s.issue(oldId);
  s.env.SELLER_DOC_LANG = "on";
  assert.equal((await s.put({ doc_langs: "th" })).status, 200);
  const h = await s.html(oldId);
  assert.ok(hasTh(h) && hasEn(h) && hasZh(h), "issued before the switch: all three");
  assert.equal((await s.data(oldId)).langs, "th-en-zh");
  const dr = await s.draft();
  assert.ok(!hasEn(await s.html(dr)), "draft follows the stored default while on");
  s.env.SELLER_DOC_LANG = "off";
  const h2 = await s.html(dr);
  assert.ok(hasTh(h2) && hasEn(h2) && hasZh(h2), "switch off: back to TH + EN + ZH");
  assert.ok(!("doc_langs" in (await s.O("/seller")).j));
});

test("L6: every document type and the 'not filled in' block follow the language set; every amount stays printed", async () => {
  const { baht } = await import(B + "receipt.js");
  for (const langs of ["th", "th-en", "th-en-zh"]) {
    const s = await setup({ SELLER_DOC_LANG: "on" });
    if (langs !== "th-en") assert.equal((await s.put({ doc_langs: langs })).status, 200);
    // not filled in yet
    const m = await s.html(await s.draft("invoice"));
    assert.ok(/ยังไม่ได้กรอกข้อมูลกิจการ/.test(m), langs + ": TH missing block");
    assert.equal(/Business details not filled in yet/.test(m), langs !== "th", langs + ": EN missing block");
    assert.equal(/尚未填写商家信息/.test(m), langs === "th-en-zh", langs + ": ZH missing block");
    assert.equal((await s.put(FILLED)).status, 200);
    for (const type of ["quotation", "invoice", "receipt"]) {
      const id = await s.draft(type, 99999);
      const h = await s.html(id), dd = await s.data(id), t = body(h);
      assert.equal(hasEn(h), langs !== "th", `${langs} ${type}: English`);
      assert.equal(hasZh(h), langs === "th-en-zh", `${langs} ${type}: Chinese`);
      for (const v of [dd.subtotal_satang, dd.vat_satang, dd.total_satang, dd.lines[0].unit_satang, dd.lines[0].amount_satang]) {
        assert.ok(t.includes(baht(v)), `${langs} ${type}: amount ${baht(v)} printed`);
      }
      assert.ok(t.includes("99999"), `${langs} ${type}: quantity printed`);
    }
  }
});

test("L7: backend/wrangler.toml keeps SELLER_DOC_LANG off for the template (customer) build and the test deployment", () => {
  const w = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
  // section headers at the start of a line (relock1: the file's header comment also names "[env.test]")
  const top = w.slice(w.indexOf("\n[vars]"), w.indexOf("\n[env.test]"));
  const tst = w.slice(w.indexOf("\n[env.test.vars]"));
  assert.ok(top.length > 100 && tst.length > 100, "both sections found");
  for (const [name, sec] of [["[vars]", top], ["[env.test.vars]", tst]]) {
    assert.match(sec, /^SELLER_DOC_LANG = "off"$/m, name);
    assert.doesNotMatch(sec, /^SELLER_DOC_LANG = "on"/im, name);
  }
});

test("L8: the lawyer question is in docs/LEGAL-PACKET.md and in the CTO-BRIEF legal table", () => {
  const lp = readFileSync(join(ROOT, "docs", "LEGAL-PACKET.md"), "utf8");
  const sec = lp.slice(lp.indexOf("### 7.4"));
  assert.ok(lp.includes("### 7.4"), "section 7.4 in the tax / documents chapter");
  const q = sec.slice(0, sec.indexOf("\n### ") > 0 ? sec.indexOf("\n### ") : 4000);
  assert.match(q, /ไทย\s*\+\s*อังกฤษ|ภาษาไทยและภาษาอังกฤษ/, "Thai + English named");
  assert.match(q, /ใบเสนอราคา/);
  assert.match(q, /ใบกำกับภาษี/);
  assert.match(q, /ภาษาใด(?:มีผล|ใช้บังคับ|เป็นหลัก)/, "which language governs");
  assert.match(q, /199/, "owner decision 199");
  assert.match(q, /L77/);
  const cto = readFileSync(join(ROOT, "docs", "CTO-BRIEF.md"), "utf8");
  assert.match(cto, /^\| L77 \|.*(?:Thai \+ English|Thai and English).*govern/m, "CTO-BRIEF L77 row");
});

test("L9: admin page: the control is hidden by default; every new label is in English and Chinese", () => {
  const html = readFileSync(join(ROOT, "admin.html"), "utf8");
  const m = /<label[^>]*id="adsLangRow"[^>]*>[\s\S]*?<\/label>/.exec(html);
  assert.ok(m, "admin.html has the #adsLangRow control");
  assert.match(m[0], /<label[^>]*\bhidden\b/, "hidden until the Worker reports doc_langs");
  assert.match(m[0], /<select name="doc_langs"/);
  for (const v of ["th", "th-en", "th-en-zh"]) assert.match(m[0], new RegExp(`<option value="${v}"`), v);
  const keys = [...m[0].matchAll(/data-i18n="([^"]+)"/g)].map(x => x[1]);
  const js = readFileSync(join(ROOT, "admin-seller.js"), "utf8");
  for (const x of js.matchAll(/G\("(ads\.lang[\w.]*)"/g)) keys.push(x[1]);
  assert.ok(keys.length >= 5, "labels: " + keys);
  const en = readFileSync(join(ROOT, "i18n", "en-admin.js"), "utf8"), zh = readFileSync(join(ROOT, "i18n", "zh-admin.js"), "utf8");
  for (const k of keys) {
    const e = new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"([^"]+)"`).exec(en), z = new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"([^"]+)"`).exec(zh);
    assert.ok(e && !/[ก-๛]/.test(e[1]), "en " + k);
    assert.ok(z && !/[ก-๛]/.test(z[1]) && HAN.test(z[1]), "zh " + k);
  }
});
