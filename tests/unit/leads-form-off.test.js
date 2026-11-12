"use strict";
// tests/unit/leads-form-off.test.js — quote-request form stays OFF (owner decision 2026-11-12, Sellable pack item 9) while
// the admin inbox screen and the privacy text are built. FIXED TEST SET written before the build; sha256 in
// ~/LENSIQ-field/evals/leads/locked.sha256.
// Amendment A6 (explicit owner decision 2026-11-12: the form goes ON): the shipped default is now ON; a page or install
// can still switch it off (LENSIQ_LEADS_FORM = false before lensiq-config.js), and everything below about "off" still
// holds for that case. The privacy section is visible in the markup and hidden by legal.js only when switched off.
//   1. lensiq-config.js: window.LENSIQ_LEADS_FORM defaults to true (only a literal false turns it off); the quote contact
//      LINE ID lives in one place (LENSIQ_SELLER.quote_line) and the general LINE fallback (LENSIQ_SELLER.line) stays empty
//   2. lensiq-leads.js: with the flag off nothing is sent to the API (no Turnstile token, no /v1/leads) even when the API
//      is configured; with the flag on the request goes to /v1/leads
//   3. privacy.html: one quote-request section per language, shown (hidden only when switched off), stating the fields, the purpose, the
//      180-day deletion, who sees it and how to ask for deletion; docs/LEADS-DESIGN.md carries the same text for counsel
//   4. admin page: a Leads tab whose texts are complete in Thai, English and Chinese; server data never through innerHTML
//   5. index confirmation text with the LINE contact in three languages
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");

function runConfig(preset = {}) {
  const w = { ...preset };
  w.window = w;
  vm.runInNewContext(read("lensiq-config.js"), w);
  return w;
}

test("config: LENSIQ_LEADS_FORM is ON by default (owner 2026-11-12); only a literal false turns it off; quote LINE contact in one place", () => {
  assert.equal(runConfig().LENSIQ_LEADS_FORM, true);
  assert.equal(runConfig({ LENSIQ_LEADS_FORM: false }).LENSIQ_LEADS_FORM, false);
  for (const v of ["true", 1, "1", "on", {}, true]) assert.equal(runConfig({ LENSIQ_LEADS_FORM: v }).LENSIQ_LEADS_FORM, true, JSON.stringify(v));
  const src = read("lensiq-config.js");
  assert.match(src, /^window\.LENSIQ_LEADS_FORM = window\.LENSIQ_LEADS_FORM !== false;/m, "shipped default is on");
  const s = runConfig().LENSIQ_SELLER;
  assert.equal(s.quote_line, "@632yliiw", "owner input 2026-11-12");
  assert.equal(s.line, "", "the general LINE fallback stays empty (filling it would show the ID on pages today)");
  assert.equal((src.match(/@632yliiw/g) || []).length, 1, "one place only");
});

function leadsWindow(flag) {
  const calls = [], tokens = [];
  const w = {
    LENSIQ_LEADS_FORM: flag, LENSIQ_SELLER: { quote_line: "@632yliiw", line: "", email: "" },
    LQApi: { enabled: () => true, call: (p, o) => { calls.push({ p, o }); return Promise.resolve({ ok: true, status: 201 }); }, turnstile: a => { tokens.push(a); return Promise.resolve("tok"); } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  };
  w.window = w;
  vm.runInNewContext(read("lensiq-leads.js"), w);
  return { w, calls, tokens };
}

test("lensiq-leads: flag off -> nothing sent (no Turnstile, no /v1/leads) even with the API configured", async () => {
  for (const flag of [false, undefined, "true"]) {
    const { w, calls, tokens } = leadsWindow(flag);
    assert.equal(w.LQLeads.serverOn(), false);
    const r = await w.LQLeads.submit({ name: "ผู้ขอ", email: "a@shop.example", interest: "exam" });
    assert.notEqual(r.via, "api"); assert.equal(r.ok, false);
    assert.equal(calls.length, 0, "no API call"); assert.equal(tokens.length, 0, "no bot-check token requested");
  }
});

test("lensiq-leads: flag on -> POST /v1/leads with a Turnstile token (the path stays ready for the owner's go-ahead)", async () => {
  const { w, calls, tokens } = leadsWindow(true);
  assert.equal(w.LQLeads.serverOn(), true);
  const r = await w.LQLeads.submit({ name: "ผู้ขอ", email: "a@shop.example", interest: "exam" });
  assert.equal(r.via, "api"); assert.equal(r.ok, true);
  assert.equal(calls.length, 1); assert.equal(calls[0].p, "/v1/leads"); assert.deepEqual(tokens, ["lead"]);
  assert.equal(w.LQLeads.quoteLine(), "@632yliiw");
});

test("home.js decides the form mode with LQLeads.serverOn() (the API alone does not switch the form on)", () => {
  const src = read("home.js");
  assert.match(src, /serverOn\(\)/);
  assert.ok(!/if \(A && A\.enabled && A\.enabled\(\)\) return "api";/.test(src), "the API being configured alone no longer means 'api' mode");
});

// ---- privacy text -------------------------------------------------------------------------------------------------
const html = read("privacy.html");
const strip = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
function sections() {
  const out = [];
  const re = /<section id="((?:en-|zh-)?p-quote)"([^>]*)>([\s\S]*?)<\/section>/g;
  let m;
  while ((m = re.exec(html))) out.push({ id: m[1], attrs: m[2], body: m[3] });
  return out;
}
const NEED = {
  "p-quote": ["ชื่อ", "อีเมล", "เบอร์โทร", "ด้านที่สนใจ", "ข้อความ", "ติดต่อกลับ", "180 วัน", "ลบ", "Cloudflare", "Turnstile", "IP", "LINE"],
  "en-p-quote": ["name", "e-mail", "phone", "interest", "message", "reply", "180 days", "delet", "Cloudflare", "Turnstile", "IP", "LINE"],
  "zh-p-quote": ["姓名", "邮箱", "电话", "感兴趣", "留言", "答复", "180 天", "删除", "Cloudflare", "Turnstile", "IP", "LINE"]
};

test("privacy.html: one quote-request section per language with fields, purpose, 180 days, who sees it, deletion", () => {
  const s = sections();
  assert.deepEqual(s.map(x => x.id).sort(), ["en-p-quote", "p-quote", "zh-p-quote"]);
  for (const x of s) {
    assert.match(x.attrs, /\bdata-leads-notice\b/, x.id);
    assert.ok(!/\shidden\b/.test(x.attrs), x.id + " shown in the markup (the form is on); legal.js hides it only when switched off");
    const t = strip(x.body);
    for (const w of NEED[x.id]) assert.ok(t.includes(w), x.id + " mentions " + w);
    assert.match(x.body, /data-seller="quote_line"/, x.id + ": LINE contact from the one config value");
    assert.match(x.body, /data-seller="dpo_email"/, x.id + ": PDPA contact");
  }
  assert.ok(!/href="#(en-|zh-)?p-quote"/.test(html), "no table-of-contents link to a hidden section");
  assert.ok(!html.includes("@632yliiw"), "the LINE ID is not written into the page; it comes from the config only when shown");
  const th = html.indexOf('id="p-quote"'), en = html.indexOf('id="en-p-quote"'), zh = html.indexOf('id="zh-p-quote"');
  const lgEn = html.indexOf('class="lg lg-en"'), lgZh = html.indexOf('class="lg lg-zh"');
  assert.ok(th < lgEn && en > lgEn && en < lgZh && zh > lgZh, "each inside its language copy");
});

test("legal.js reveals the quote-request sections only when window.LENSIQ_LEADS_FORM === true", () => {
  const src = read("legal.js");
  assert.match(src, /LENSIQ_LEADS_FORM === true/);
  assert.match(src, /\[data-leads-notice\]/);
});

test("docs/LEADS-DESIGN.md carries the same privacy text for counsel (every paragraph and list item, three languages)", () => {
  const doc = read("docs/LEADS-DESIGN.md").replace(/\s+/g, " ");
  for (const x of sections()) {
    const parts = [...x.body.matchAll(/<(p|li|h2)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => strip(m[2])).filter(Boolean);
    assert.ok(parts.length >= 5, x.id);
    for (const p of parts) assert.ok(doc.includes(p), x.id + ": missing in LEADS-DESIGN.md: " + p.slice(0, 80));
  }
});

// ---- admin Leads tab --------------------------------------------------------------------------------------------
test("admin: Leads tab present; every text key complete in English and Chinese; no innerHTML", () => {
  const ah = read("admin.html"), js = read("admin.js");
  assert.match(ah, /<button type="button" role="tab" data-tab="leads" aria-selected="false"><span data-i18n="adl\.tab">[^<]+<\/span><span\s+id="adlBadge"/);
  assert.match(ah, /<div class="ad-panel" data-panel="leads" role="tabpanel" hidden>/);
  const keys = new Set([...js.matchAll(/G\("(adl\.[\w.]+)"/g)].map(m => m[1]).concat([...ah.matchAll(/data-i18n="(adl\.[\w.]+)"/g)].map(m => m[1])));
  assert.ok(keys.size >= 25, "Leads texts go through the dictionary: " + keys.size);
  for (const f of ["i18n/en-admin.js", "i18n/zh-admin.js"]) {
    const d = read(f);
    for (const k of keys) assert.ok(d.includes(`"${k}":`), f + " lacks " + k);
  }
  assert.ok(!/innerHTML/.test(js), "server data rendered with textContent only");
});

test("index confirmation with the LINE contact: Thai default + English + Chinese", () => {
  const home = read("home.js");
  assert.match(home, /"home\.ok\.sentLine"/);
  assert.match(read("i18n/en-common.js"), /"home\.ok\.sentLine": "[^"]*\{id\}[^"]*"/);
  assert.match(read("i18n/zh-common.js"), /"home\.ok\.sentLine": "[^"]*\{id\}[^"]*"/);
});
