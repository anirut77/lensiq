"use strict";
// tests/unit/pricing.test.js — pricing.js pure helpers (plans from /v1/billing/plans, buy only 'active', perks with
// 'coming soon', one-time reports, VAT-inclusive totals, quotas) + pricing.html wiring (shared nav, i18n, refund links).
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const P = require("../../pricing.js");

const ROOT = join(__dirname, "..", "..");
const ON = { billing_enabled: true, pricing_enabled: true, free_mode: false, vat_registered: true };

test("visiblePlans: Worker plans (active only outside preview); DRAFT fallback only in preview", () => {
  const info = { plans: [{ id: "free", status: "active" }, { id: "plus", status: "active" }, { id: "pro", status: "draft" }, { id: "old", status: "retired" }] };
  assert.deepEqual(P.visiblePlans(info, false).map(p => p.id), ["free", "plus"]);
  assert.deepEqual(P.visiblePlans(info, true).map(p => p.id), ["free", "plus", "pro"]);
  assert.deepEqual(P.visiblePlans({ pricing_enabled: true }, false), [], "no DRAFT outside preview");
  const d = P.visiblePlans({}, true).map(p => p.id);
  for (const id of ["plus", "report_basic", "report_compat", "report_annual", "pro", "business"]) assert.ok(d.includes(id), id);
});

test("DRAFT matches the round-10 Thai prices (49 / 99 / 199 one-time; 149 / 990 Plus)", () => {
  const by = Object.fromEntries(P.DRAFT.map(p => [p.id, p]));
  assert.equal(by.report_basic.price_once_satang, 4900);
  assert.equal(by.report_compat.price_once_satang, 9900);
  assert.equal(by.report_annual.price_once_satang, 19900);
  assert.equal(by.plus.price_month_satang, 14900);
  assert.equal(by.plus.price_year_satang, 99000);
  assert.equal(by.pro.price_month_satang, 99000);
  assert.equal(by.business.price_month_satang, 390000);
});

test("buyable: only status 'active', billing on, priced > 0, never free", () => {
  const plus = { id: "plus", kind: "subscription", status: "active", price_month_satang: 14900, price_year_satang: 99000 };
  assert.equal(P.buyable(plus, ON, "month"), true);
  assert.equal(P.buyable({ ...plus, status: "draft" }, ON, "month"), false);
  assert.equal(P.buyable({ ...plus, status: "coming_soon" }, ON, "month"), false);
  assert.equal(P.buyable(plus, { ...ON, billing_enabled: false }, "month"), false);
  assert.equal(P.buyable({ id: "free", status: "active", price_month_satang: 0 }, ON, "month"), false);
  assert.equal(P.buyable({ id: "enterprise", status: "active", price_month_satang: null }, ON, "month"), false);
  const rep = { id: "report_basic", kind: "one_time", status: "active", price_once_satang: 4900 };
  assert.equal(P.buyable(rep, ON, "year"), true, "one-time ignores the period");
  assert.equal(P.priceOf(rep, "month"), 4900);
  assert.equal(P.isOnce({ price_once_satang: 100 }), true, "one-time detected without kind");
});

test("vatSplit: VAT-inclusive 7 % share (same as the Worker)", () => {
  assert.deepEqual(P.vatSplit(14900, true), { total: 14900, subtotal: 13925, vat: 975 });
  assert.deepEqual(P.vatSplit(4900, false), { total: 4900, subtotal: 4900, vat: 0 });
});

test("perksOf: registry status 'coming_soon' wins, labels merged, unknown shapes tolerated", () => {
  const plan = { id: "plus", perks: ["history", { id: "pdf_report" }, { label_th: "พิเศษ", status: "coming_soon" }] };
  const reg = [{ id: "history", status: "active", label_en: "History" }, { id: "pdf_report", status: "coming_soon", label_th: "PDF" }, { id: "english", status: "active", plans: ["plus"], label_th: "อังกฤษ" }];
  const out = P.perksOf(plan, reg);
  assert.deepEqual(out.map(x => [x.id, x.status]), [["history", "active"], ["pdf_report", "coming_soon"], [null, "coming_soon"], ["english", "active"]]);
  assert.equal(out[0].en, "History");
  const obj = P.perksOf({ id: "x", perks: ["a"] }, { a: { status: "coming_soon" } });
  assert.equal(obj[0].status, "coming_soon");
  assert.deepEqual(P.perksOf({ id: "x" }, null), []);
  assert.deepEqual(P.perksOf(null, "garbage"), []);
});

test("quotaLines: quota + period, 0 = not included, null = unlimited", () => {
  const q = P.quotaLines({ ai_reading: { quota: 30, period: "month" }, csv_export: { quota: 0, period: "month" }, hub_nodes: { quota: null, period: "month" }, unknown_x: { quota: 1 } });
  assert.deepEqual(q.map(x => x.feature), ["ai_reading", "hub_nodes"]);
  assert.equal(q[0].vars.n, 30);
  assert.equal(q[0].vars.per[0], "pr.q.perMonth");
  assert.equal(q[1].unlimited, true);
  assert.equal(q[1].key, "pr.q.hub.unl");
});

test("planName: language-specific names with fallbacks", () => {
  const p = { id: "plus", name_th: "พลัส", name_en: "Plus" };
  assert.equal(P.planName(p, "th"), "พลัส");
  assert.equal(P.planName(p, "en"), "Plus");
  assert.equal(P.planName(p, "zh"), "Plus", "zh falls back to English");
  assert.equal(P.planName({ ...p, name_zh: "加强版" }, "zh"), "加强版");
});

test("pricing.html: shared nav + i18n, back link, refund terms beside the accept box, draft only via JS", () => {
  const html = readFileSync(join(ROOT, "pricing.html"), "utf8");
  assert.match(html, /<header class="nav" id="siteNav"><\/header>\s*<script src="nav\.js/);
  assert.match(html, /i18n\/zh-pricing\.js/);
  assert.match(html, /id="prBack"/);
  const accept = html.slice(html.indexOf('class="pr-accept"'), html.indexOf("</div>", html.indexOf('class="pr-accept"')));
  assert.match(accept, /href="terms\.html#t8"/);
  assert.match(accept, /href="terms\.html#t9"/);
  assert.match(html, /id="prDraft" role="note" hidden/, "draft banner hidden unless ?preview");
  assert.match(html, /<meta name="robots" content="noindex/);
  // every pr.* key used by the page / script has an English and a Chinese entry
  const js = readFileSync(join(ROOT, "pricing.js"), "utf8");
  const keys = new Set([...html.matchAll(/data-i18n(?:-attr="[a-z]+:|=")(pr\.[\w.]+)"/g)].map(m => m[1]).concat([...js.matchAll(/"(pr\.[\w.]+)",\s*"/g)].map(m => m[1])));
  for (const q of P.quotaLines({ ai_reading: { quota: null }, analytics_days: { quota: null }, csv_export: { quota: null }, hub_nodes: { quota: null } })) keys.add(q.key);
  for (const l of ["en", "zh"]) {
    const d = readFileSync(join(ROOT, "i18n", `${l}-pricing.js`), "utf8");
    const missing = [...keys].filter(k => !d.includes(`"${k}"`));
    assert.deepEqual(missing, [], `${l}-pricing.js misses keys`);
  }
});

test("quotaLines with the Worker perk registry: coming_soon from registry or entitlement; registry-only labels", () => {
  const reg = { ai_reading: { status: "active", th: "AI", en: "AI" }, analytics_days: { status: "coming_soon", th: "สถิติ", en: "Stats" }, report_basic: { status: "active" }, new_x: { status: "coming_soon", th: "ใหม่", en: "New" } };
  const q = P.quotaLines({ ai_reading: { quota: 30, period: "month" }, analytics_days: { quota: 90, period: "day" }, hub_nodes: { quota: 3, period: "month", status: "coming_soon" }, new_x: { quota: 1, period: "once" } }, reg);
  assert.deepEqual(q.map(x => [x.feature, x.status]), [["ai_reading", "active"], ["analytics_days", "coming_soon"], ["hub_nodes", "coming_soon"], ["new_x", "coming_soon"]]);
  assert.equal(q[3].key, null);
  assert.equal(q[3].label.en, "New");
  assert.equal(P.buyable({ id: "plus", status: "active", purchasable: false, price_month_satang: 14900 }, ON, "month"), false, "purchasable:false respected");
});
