"use strict";
// tests/unit/backend-seller-r2.test.js — seller details, review round 2 low findings (independent reviewer OK on 69d36fe with
// 4 low items; the coordinator ordered 1–3 fixed, 2026-11-18). FIXED TEST SET locked in evals-locks/seller-settings.sha256
// BEFORE the fixes. In-memory D1; synthetic values only.
//   H1  /health/deep names 0021_seller.sql as missing when seller_docs lacks the columns added during round 1
//       (lines_frozen_json, logo_hash)
//   U2  a draft whose line left the approved price list shows a TH / EN / ZH note on that line (not the raw id at 0.00),
//       and the list summary carries the unavailable line ids so the tab can say why
//   V3  the admin page's VAT rate is fixed at 7 % (read-only field, the page always sends 700), with a TH / EN / ZH note
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "q".repeat(40);
const PW = "correct horse battery staple seller r2";
const nowS = () => Math.floor(Date.now() / 1000);

test("H1: /health/deep names 0021_seller.sql when seller_docs lacks lines_frozen_json / logo_hash", async () => {
  const { deepHealth } = await import(B + "health.js");
  const ok = createEnv({});
  const h0 = await deepHealth(ok);
  assert.deepEqual(h0.migrations.missing, [], JSON.stringify(h0));
  for (const col of ["lines_frozen_json", "logo_hash"]) {
    const env = createEnv({});
    env.DB._raw.exec(`ALTER TABLE seller_docs DROP COLUMN ${col}`);
    const h = await deepHealth(env);
    assert.equal(h.ok, false, col);
    assert.deepEqual(h.migrations.missing, ["0021_seller.sql"], col);
  }
});

test("U2: a draft line that left the price list carries a TH / EN / ZH note; the list says which lines", async () => {
  const { handle } = await import(B + "index.js");
  const crypto = await import(B + "crypto.js");
  const { PRICE_LINES } = await import(B + "price-list.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 23).toString("base64") });
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers }), env, {});
    const text = await r.clone().text();
    let j = null; try { j = JSON.parse(text); } catch { /* html */ }
    return { status: r.status, j, text };
  };
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: PW } });
  const tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } })).j.token;
  const O = (p, o = {}) => call("/admin/api" + p, { ...o, token: tok });
  const secret = (await O("/totp/setup", { method: "POST", body: { password: PW } })).j.secret;
  assert.equal((await O("/totp/enable", { method: "POST", body: { code: await crypto.totpAt(crypto.base32Decode(secret), Math.floor(nowS() / 30) - 1) } })).status, 200);
  const d = await O("/seller/docs", { method: "POST", body: { doc_type: "quotation", buyer: { name: "ลูกค้า" }, lines: [{ id: "crowd_event_day", qty: 2 }, { id: "gate_setup", qty: 1 }] } });
  assert.equal(d.status, 201);
  const idx = PRICE_LINES.findIndex(l => l.id === "crowd_event_day");
  const removed = PRICE_LINES.splice(idx, 1)[0];
  try {
    const h = (await O(`/seller/docs/${d.j.doc.id}`)).text;
    assert.match(h, /data-unavailable-line="crowd_event_day"/);
    for (const t of ["ไม่อยู่ในรายการราคาที่อนุมัติแล้ว", "No longer on the approved price list", "已不在批准的价目表中"]) assert.ok(h.includes(t), t);
    const row = h.slice(h.indexOf('data-unavailable-line="crowd_event_day"'));
    const tr = row.slice(0, row.indexOf("</tr>"));
    assert.ok(!/>0\.00</.test(tr), "no 0.00 amount on the unavailable line");
    assert.ok(!/>crowd_event_day</.test(tr), "the raw id is not shown as the item name");
    const list = await O("/seller/docs");
    assert.deepEqual(list.j.docs[0].unavailable_lines, ["crowd_event_day"]);
    // the tab explains it (TH default + EN / ZH)
    const js = readFileSync(join(ROOT, "admin-seller.js"), "utf8");
    assert.match(js, /unavailable_lines/);
    for (const f of ["en-admin.js", "zh-admin.js"]) assert.match(readFileSync(join(ROOT, "i18n", f), "utf8"), /"ads\.unavailable":/, f);
  } finally { PRICE_LINES.splice(idx, 0, removed); }
});

test("V3: the VAT rate on the admin page is fixed at 7 % and the page always sends 700", () => {
  const html = readFileSync(join(ROOT, "admin.html"), "utf8");
  const m = /<input[^>]*name="vat_rate"[^>]*>/.exec(html);
  assert.ok(m, "vat_rate field present");
  assert.match(m[0], /\breadonly\b/);
  assert.match(m[0], /value="7"/);
  assert.match(html, /data-i18n="ads\.f\.vatNote"/);
  for (const f of ["en-admin.js", "zh-admin.js"]) assert.match(readFileSync(join(ROOT, "i18n", f), "utf8"), /"ads\.f\.vatNote":/, f);
  const js = readFileSync(join(ROOT, "admin-seller.js"), "utf8");
  assert.ok(!/parseFloat\(f\.vat_rate/.test(js), "the page does not read a rate typed by the user");
  assert.match(js, /vat_rate_bp\s*=\s*700/);
});
