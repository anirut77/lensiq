"use strict";
// tests/unit/commercial-collateral.test.js — round 12 commercial + privacy (frontend): pricing DRAFT <-> migrations drift, one
// description of each report, CSV labelled "free on-device", the deeper paid basic report, the lead queue, the owner
// go-live checklist, the product one-pagers (contact + print), collateral wording and the privacy storage table.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const THAI = /[฀-๿]/;
const P = require("../../pricing.js");
const R = require("../../report.js");
const L = require("../../lensiq-leads.js");
const G = require("../../lensiq-golive.js");
const PD = require("../../products.js");
const BIRTH = { y: 1990, m: 5, d: 12, h: 8, mi: 0, gender: "female" };

/** INSERT tuples of a migration: [[...values]] for the statement that starts with `INSERT INTO <table>`. */
function tuples(sql, table) {
  const out = [];
  for (const m of sql.matchAll(new RegExp("INSERT INTO " + table + " \\(([^)]+)\\) VALUES([\\s\\S]*?);", "g"))) {
    const cols = m[1].split(",").map(s => s.trim());
    for (const t of m[2].matchAll(/\(([^()]*)\)/g)) {
      const vals = [...t[1].matchAll(/'((?:[^']|'')*)'|(NULL)|(-?\d+)/g)].map(v => (v[2] ? null : v[3] != null ? Number(v[3]) : v[1]));
      out.push(Object.fromEntries(cols.map((c, i) => [c, vals[i]])));
    }
  }
  return out;
}

test("pricing DRAFT matches backend/migrations 0003 + 0006 (prices, kinds, every listed entitlement)", () => {
  const sql = read("backend/migrations/0003_seed_plans.sql") + "\n" + read("backend/migrations/0006_consumer_pricing.sql");
  const plans = Object.fromEntries(tuples(sql, "plans").map(p => [p.id, p]));
  const ents = tuples(sql, "entitlements");
  for (const d of P.DRAFT) {
    const m = plans[d.id];
    assert.ok(m, "plan in migrations: " + d.id);
    for (const k of ["price_month_satang", "price_year_satang", "price_once_satang"]) if (k in m || d[k] != null) assert.equal(d[k] ?? null, m[k] ?? null, d.id + " " + k);
    assert.equal(P.isOnce(d), (m.kind || "subscription") === "one_time", d.id + " kind");
    for (const [f, e] of Object.entries(d.entitlements || {})) {
      const row = ents.find(x => x.plan_id === d.id && x.feature === f);
      assert.ok(row, `${d.id}.${f} seeded`);
      assert.equal(e.quota, row.quota, `${d.id}.${f} quota`);
      assert.equal(e.period, row.period, `${d.id}.${f} period`);
    }
  }
});

test("one description of the basic report: 3 systems everywhere, never 'one domain'", () => {
  global.window = global.window || globalThis;
  require("../../i18n/en-pricing.js"); require("../../i18n/zh-pricing.js");
  const Q = globalThis.LQI18N_Q || [];
  const en = Object.assign({}, ...Q.filter(d => d.en).map(d => d.en)), zh = Object.assign({}, ...Q.filter(d => d.zh).map(d => d.zh));
  assert.match(P.FEATURES.report_basic[1], /3 ศาสตร์/);
  assert.match(en["pr.q.report_basic"], /3 systems/);
  assert.match(zh["pr.q.report_basic"], /3 种体系/);
  const all = read("pricing.js") + read("i18n/en-pricing.js") + read("i18n/zh-pricing.js") + read("docs/ONE-PAGER-FORTUNE.md") + read("report.js");
  assert.ok(!/1 ศาสตร์|one domain|一个领域/.test(all), "no single-domain wording left");
  const r = R.buildBasic(BIRTH, { now: new Date(2026, 10, 8) });
  assert.deepEqual(r.parts.slice(0, 3).map(p => p.id), ["bazi", "taksa", "lek7"]);
});

test("CSV export: free on-device in every tier (no delivering paid consumer) — labelled, never sold as a perk", () => {
  const cst = read("backend/src/constants.js");
  assert.match(cst, /csv_export:\s*\{[^}]*consumer: null/, "backend still has no paid CSV consumer");
  assert.equal(P.INCLUDED.csv_export, true);
  const q = P.quotaLines({ csv_export: { quota: null, period: "month" } }, null)[0];
  assert.equal(q.included, true);
  assert.match(q.thai, /ฟรีในเครื่องทุกแผน/);
  global.window = global.window || globalThis;
  require("../../i18n/en-pricing.js"); require("../../i18n/zh-pricing.js");
  const Q = globalThis.LQI18N_Q || [];
  const en = Object.assign({}, ...Q.filter(d => d.en).map(d => d.en)), zh = Object.assign({}, ...Q.filter(d => d.zh).map(d => d.zh));
  assert.match(en["pr.q.csv.unl"], /free on the device in every plan/);
  assert.match(zh["pr.q.csv.unl"], /免费/);
  // Creator / Business are positioned on what is delivered today; every new perk is labelled in 3 languages
  for (const id of ["support_2d", "support_nbd", "onboarding", "pilot_credit"]) {
    assert.ok(P.PERKS[id], id);
    assert.ok(en[P.PERKS[id][0]] && zh[P.PERKS[id][0]] && !THAI.test(en[P.PERKS[id][0]] + zh[P.PERKS[id][0]]), id + " en/zh");
  }
  assert.ok(P.DRAFT.find(p => p.id === "pro").perks.some(x => x.id === "support_2d"));
  assert.ok(P.DRAFT.find(p => p.id === "business").perks.some(x => x.id === "onboarding"));
});

test("paid basic report goes beyond the free pages: cross-system deep-dive, next 3 months, 4-week plan", () => {
  const r = R.buildBasic(BIRTH, { now: new Date(2026, 10, 8), monthName: m => "M" + m });
  const ids = r.parts.map(p => p.id);
  assert.deepEqual(ids, ["bazi", "taksa", "lek7", "deep", "ahead"]);
  const deep = r.parts[3];
  assert.deepEqual(deep.sections.map(s => s.id), R.DEEP);
  const before = new Set(r.parts.slice(0, 3).flatMap(p => p.sections.flatMap(s => s.paragraphs)));
  const deepParas = deep.sections.flatMap(s => s.paragraphs);
  assert.ok(deepParas.length >= 6, "deep-dive has substance: " + deepParas.length);
  assert.ok(deepParas.every(p => !before.has(p)), "deep-dive never repeats a paragraph already shown");
  assert.equal(new Set(deepParas).size, deepParas.length, "no repeats inside the deep-dive");
  assert.deepEqual(r.ahead.map(x => x.m), [11, 12, 1]);
  assert.deepEqual(r.ahead.map(x => x.year), [2026, 2026, 2027]);
  for (const x of r.ahead) assert.ok(R.GODS[x.god] && x.tip && x.pillar.length === 2);
  assert.equal(r.plan30.weeks.length, 4);
  assert.ok(r.plan30.weeks.slice(0, 3).every(w => w.items.length >= 1));
  assert.ok(r.plan30.weeks[2].items.some(x => x.t === r.ahead[0].tip), "week 3 carries this month's tip");
  const s = R.toSaved(r);
  assert.equal(s.data.sections[0].id, "plan30");
  assert.ok(s.data.sections.slice(1, 4).every(x => /^deep-/.test(x.id)), "deep-dive kept right after the plan");
  assert.ok(Buffer.byteLength(JSON.stringify(s.data)) <= R.SAVE_BUDGET);
  // same input -> same report (reprint == saved copy)
  assert.deepEqual(R.buildBasic(BIRTH, { now: new Date(2026, 10, 8), monthName: m => "M" + m }).plan30, r.plan30);
});

test("deeper basic report composes in 中文 without Thai; new rp.* keys have en + zh", async () => {
  global.window = global.window || globalThis;
  require("../../i18n/zh-kb-lifecal.js"); require("../../i18n/zh-kb-zodiac.js");
  require("../../i18n/zh-report.js"); require("../../i18n/en-report.js");
  const Q = globalThis.LQI18N_Q || [];
  const zh = Object.assign({}, ...Q.filter(d => d.zh).map(d => d.zh)), en = Object.assign({}, ...Q.filter(d => d.en).map(d => d.en));
  const t = (k, th, v) => String(zh[k] || th).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m));
  const r = R.buildBasic(BIRTH, { lang: "zh", t, now: new Date(2026, 10, 8), monthName: m => m + "月" });
  const thai = JSON.stringify(r).match(/[฀-๿]+/g);
  assert.equal(thai, null, "Thai in zh report: " + (thai || []).slice(0, 5).join(" "));
  const keys = ["rp.f.name", "rp.for", "rp.toc", "rp.part.deep", "rp.deep.work", "rp.deep.money", "rp.deep.love", "rp.part.ahead", "rp.week", "rp.plan30.title", "rp.plan30.note", "rp.plan30.month", "rp.plan30.reviewFor", "rp.plan30.review"];
  for (const k of keys) { assert.ok(zh[k] && en[k], k); assert.ok(!THAI.test(zh[k] + en[k]), k); }
  const { cleanSaved, SAVED_MAX_BYTES } = await import("../../backend/src/members.js");
  assert.ok(Buffer.byteLength(cleanSaved(R.toSaved(r).data)) <= SAVED_MAX_BYTES);
});

test("lead queue: kept in this browser only, capped, copyable; both forms show the 'not sent yet' box", () => {
  let q = [];
  for (let i = 0; i < 14; i++) q = L.queueAdd(q, { name: "N" + i, email: "a" + i + "@ex.com", message: "m" }, 1000 + i);
  assert.equal(q.length, L.QUEUE_MAX);
  assert.equal(q[q.length - 1].name, "N13");
  assert.deepEqual(L.queueAdd([], { foo: "x" }), [], "empty lead not queued");
  assert.match(L.queueText(q.slice(0, 1)), /^Name: N4\nE-mail: a4@ex\.com\nMessage: m$/);
  assert.equal(L.QUEUE_KEY, "lq-leads", "same list home.js used before");
  for (const p of ["index.html", "pricing.html"]) assert.match(read(p), /data-lq-pending/, p);
  assert.match(read("home.js"), /LQ\.queue\(lead\)/);
  assert.match(read("pricing.js"), /L\.queue\(lead\)/);
  const src = read("lensiq-leads.js");
  for (const k of ["leads.q.wait", "leads.q.ready", "leads.q.send", "leads.q.copy", "leads.q.del"]) assert.equal((src.match(new RegExp('"' + k.replace(/\./g, "\\.") + '"', "g")) || []).length, 3, k + ": en + zh + Thai default");
  // nothing is sent by the queue itself: only submit() talks to the API
  assert.ok(!/fetch\(/.test(src));
});

test("owner go-live checklist: every empty placeholder listed, owner-only, same list in check-legal", async () => {
  const empty = G.checklist({}, { api: "", profile: "demo", ageGender: true });
  const todo = empty.filter(x => x.state === "todo").map(x => x.id);
  for (const k of ["name", "tax_id", "address", "email", "effective_date", "dpo_email"]) assert.ok(todo.includes("seller." + k), k);
  assert.ok(todo.includes("config.lead_channel") && todo.includes("config.api"));
  assert.equal(empty.find(x => x.id === "config.profile").state, "warn");
  assert.ok(empty.filter(x => x.state === "outside").length >= 6);
  for (const x of empty) { assert.ok(x.th && x.en && x.zh, x.id); assert.ok(!THAI.test(x.en + x.zh), x.id); }
  const full = G.checklist({ name: "LENSIQ Co., Ltd.", tax_id: "0105500000000", address: "Bangkok", email: "help@ex.com", effective_date: "1 Dec 2026", dpo_email: "dpo@ex.com", line: "@lensiq", counsel_confirmed: true }, { api: "https://api.ex.com", turnstile: "0x1", profile: "commercial", ageGender: false });
  assert.deepEqual(full.filter(x => x.state === "todo").map(x => x.id), []);
  assert.equal(G.checklist({ email: "a@b.co" }, {}).find(x => x.id === "config.lead_channel").state, "warn", "mailto only");
  assert.equal(G.isOwner({ search: "" }, null), false);
  assert.equal(G.isOwner({ search: "?owner=1" }, null), true);
  assert.equal(G.isOwner({ search: "" }, "1"), true);
  assert.equal(G.isOwner({ search: "?owner=0" }, "1"), false);
  assert.match(read("help.html"), /<script src="lensiq-golive\.js\?v=\d+"><\/script>/);
  assert.ok(!/owner-golive/.test(read("index.html") + read("pricing.html")), "not linked from public pages");
  const CL = await import("../../tools/check-legal.mjs");
  const list = CL.goLiveList(read("lensiq-config.js"));
  assert.deepEqual(list.map(x => x.id), G.checklist(CL.sellerFromConfig(read("lensiq-config.js")), CL.siteConfigFromConfig(read("lensiq-config.js"))).map(x => x.id));
});

test("product one-pagers: contact from LENSIQ_SELLER only, print button, 3 languages", () => {
  assert.deepEqual(PD.contactOf({}, ""), []);
  assert.deepEqual(PD.contactOf({ name: "[name]", email: "bad", line: "x" }, "").map(x => x.k), [], "placeholders / malformed values never printed");
  const c = PD.contactOf({ name: "LENSIQ Co.", email: "sales@ex.com", line: "lensiq" }, "https://ex.github.io/lensiq/");
  assert.deepEqual(c.map(x => x.k), ["name", "email", "line", "site"]);
  assert.equal(c[2].href, "https://line.me/R/ti/p/%40lensiq");
  global.window = global.window || globalThis;
  require("../../i18n/en-products.js"); require("../../i18n/zh-products.js");
  const Q = globalThis.LQI18N_Q || [];
  const en = Object.assign({}, ...Q.filter(d => d.en).map(d => d.en)), zh = Object.assign({}, ...Q.filter(d => d.zh).map(d => d.zh));
  for (const p of ["retail.html", "hr.html", "creative-suite.html"]) {
    const h = read(p);
    assert.match(h, /data-pd-print/, p); assert.match(h, /data-pd-seller data-interest="[a-z]+"/, p);
    assert.match(h, /<script src="products\.js\?v=\d+"><\/script>/, p);
    assert.ok(h.indexOf("<script src=\"products.js") > h.indexOf("<script src=\"lensiq-config.js"), p + ": config first");
  }
  for (const k of ["pd.print", "pd.contact.h"]) assert.ok(en[k] && zh[k] && !THAI.test(en[k] + zh[k]), k);
  assert.match(read("products.css"), /@media print\{[\s\S]*\.pd-othersec/);
});

test("collateral: no licence overclaim, image storage stated precisely, docs match the code", () => {
  const th = read("docs/ONE-PAGER-TH.md"), zh = read("docs/ONE-PAGER-ZH.md");
  assert.ok(!th.includes("สัญญาอนุญาตพร้อมใช้เชิงพาณิชย์ในค่าเริ่มต้น") && !zh.includes("默认配置可商用"));
  assert.match(th, /รอความเห็นทางกฎหมาย/); assert.match(zh, /仍待法律意见/);
  assert.ok(!/ไม่เก็บภาพ,/.test(th) && !/不保存画面；/.test(zh), "no blanket 'no images stored'");
  assert.ok(!read("docs/BILLING-PLAN.md").includes("not generated yet"), "credit notes exist (receipt.js creditNoteData)");
  assert.match(read("docs/BILLING-PLAN.md"), /NOT measured yet/);
  assert.ok(!/\| \[ \] \|/.test(read("docs/SUPPORT.md")), "SUPPORT §2 prices filled (draft)");
  for (const f of ["ONE-PAGER-TH", "ONE-PAGER-ZH", "ONE-PAGER-RETAIL", "ONE-PAGER-HR", "ONE-PAGER-EVENTS", "ONE-PAGER-FORTUNE"]) assert.match(read("docs/" + f + ".md"), /ต้นฉบับภายใน|内部底稿/, f);
});

test("privacy §9: member token storage and device-only image stores, in all three copies", () => {
  const pv = read("privacy.html");
  assert.equal((pv.match(/<code>lq-member-session<\/code><\/td>/g) || []).length, 3);
  for (const id of ["p9-member", "en-p9-member", "zh-p9-member", "p9-images", "en-p9-images", "zh-p9-images"]) assert.ok(pv.includes(`id="${id}"`), id);
  for (const db of ["lensiq-qc", "pb-templates", "sg-media"]) assert.equal((pv.match(new RegExp("<code>" + db + "</code>", "g")) || []).length, 3, db);
  // the stores named are the ones the code really opens
  assert.match(read("qc.js"), /indexedDB\.open\("lensiq-qc"/);
  assert.match(read("photobooth-templates.js"), /DB = "pb-templates"/);
  assert.match(read("signage.js"), /name: "sg-media"/);
  assert.match(read("lensiq-member.js"), /TOKEN_KEY = "lq-member-session"/);
});
