"use strict";
// tests/unit/commercial-r11.test.js — round 11 commercial + mobile: report deliverables (report.js), the lead transport
// (lensiq-leads.js), the seller config + legal guard (legal.js, tools/check-legal.mjs, help / terms / privacy), the
// member helpers (CAUTION_RE kept in sync with fortune-ai.js, renewal reminder, upsell card) and tier naming.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const R = require("../../report.js");
const L = require("../../lensiq-leads.js");
const M = require("../../lensiq-member.js");
const BIRTH = { y: 1990, m: 5, d: 12, h: 8, mi: 0, gender: "female" };
const BIRTH2 = { y: 1988, m: 11, d: 3, noTime: true, gender: "male" };
const THAI = /[฀-๿]/;

/* ---------------- CAUTION_RE <-> fortune-ai.js ---------------- */
test("member CAUTION_RE carries every gentle-caution marker of fortune-ai.js (TH / ZH / EN)", () => {
  const src = read("fortune-ai.js");
  for (const [name, key] of [["CAUTION_MARK_TH", "th"], ["CAUTION_MARK_ZH", "zh"], ["CAUTION_MARK_EN", "en"]]) {
    const m = src.match(new RegExp("const " + name + " = /(.+?)/i?;"));
    assert.ok(m, name + " found in fortune-ai.js");
    for (const alt of m[1].split("|")) {
      assert.ok(M.CAUTION_MARKS[key].includes(alt), `${name} marker "${alt}" missing from lensiq-member.js CAUTION_MARKS.${key}`);
      assert.ok(M.CAUTION_RE.test("x " + alt + " y"), `CAUTION_RE matches "${alt}"`);
    }
  }
  assert.ok(M.CAUTION_RE.test("Please be careful with money"), "extra English words kept");
  assert.ok(!M.CAUTION_RE.test("A calm and bright month"), "no false positive");
});

test("lightResult keeps an English caution paragraph from a hidden section (safety is never gated)", () => {
  const res = { sections: [{ id: "overview", paragraphs: ["a"] }, { id: "work", paragraphs: ["b"] }, { id: "money", paragraphs: ["Money may feel a little tight this month."] }] };
  const out = M.lightResult(res, { sections: 2 });
  assert.equal(out.sections.length, 3);
  assert.deepEqual(out.sections[2].paragraphs, ["Money may feel a little tight this month."]);
});

/* ---------------- renewal reminder + upsell ---------------- */
test("renewalDue: due from 7 days before the end, never for grants or ended plans; Worker flag wins", () => {
  const t = 1_000_000;
  assert.deepEqual(M.renewalDue({ current_period_end: t + 3 * 86400, source: "purchase" }, t), { due: true, days: 3, ends: t + 3 * 86400 });
  assert.equal(M.renewalDue({ current_period_end: t + 8 * 86400 }, t).due, false);
  assert.equal(M.renewalDue({ current_period_end: t - 10 }, t).due, false);
  assert.equal(M.renewalDue({ current_period_end: t + 86400, source: "grant" }, t).due, false);
  assert.equal(M.renewalDue({ current_period_end: t + 30 * 86400, renewal_due: true }, t).due, true);
  assert.equal(M.renewalDue(null, t).due, false);
  // the Worker's top-level renewal_due / renewal (backend members.js renewalOf) win
  assert.equal(M.renewalDue(M.planForRenewal({ plan: { current_period_end: t + 3 * 86400 }, renewal_due: false }), t).due, false);
  assert.equal(M.renewalDue(M.planForRenewal({ plan: { current_period_end: t + 30 * 86400 }, renewal_due: true, renewal: { current_period_end: t + 2 * 86400 } }), t).days, 2);
  assert.equal(M.planForRenewal({ plan: null }), null);
});

test("upsell: light reading -> 'light'; local reading after a quota refusal today -> 'quota'; AI reading -> none", () => {
  assert.equal(M.upsell({ source: "local" }, { light: { over: false } }, null, "2026-11-08"), "light");
  assert.equal(M.upsell({ source: "local" }, null, "2026-11-08", "2026-11-08"), "quota");
  assert.equal(M.upsell({ source: "local" }, null, "2026-11-07", "2026-11-08"), null);
  assert.equal(M.upsell({ source: "ai" }, null, "2026-11-08", "2026-11-08"), null);
});

test("lensiq-member.js: requests go through LQApi.call (timeout); init failure still fires lq-member-ready; consent focused first", () => {
  const src = read("lensiq-member.js");
  assert.match(src, /a\.call\(path, \{ method/);
  assert.match(src, /\.catch\(function \(\) \{ done\(\); \}\)/);
  assert.match(src, /data-lq-terms/);
  assert.match(src, /el\("div", \{ class: "row" \}, go, slot, cancel\)/, "Google button drawn in the sticky footer row, in place of Continue");
  assert.match(src, /env\(safe-area-inset-bottom\)/);
  const api = require("../../lensiq-api.js");
  assert.equal(typeof api.call, "function");
});

/* ---------------- reports ---------------- */
test("report_basic: three systems composed in full, saved copy fits the Worker limit", () => {
  const r = R.buildBasic(BIRTH, { now: new Date(2026, 10, 8) });
  assert.equal(r.kind, "report_basic");
  assert.deepEqual(r.parts.map(p => p.id), ["bazi", "taksa", "lek7"]);
  for (const p of r.parts) assert.ok(p.sections.length >= 2 && p.sections.every(s => s.paragraphs.length), p.id);
  assert.ok(r.plan && r.plan.items.length >= 1 && r.reminder);
  const s = R.toSaved(r);
  assert.ok(Buffer.byteLength(JSON.stringify(s.data)) <= R.SAVE_BUDGET);
  assert.ok(s.data.sections.length <= 12 && s.data.sections.every(x => x.paragraphs.length <= 12 && x.id.length <= 24));
  // same input -> same wording (a reprint matches the saved copy)
  assert.deepEqual(R.buildBasic(BIRTH, { now: new Date(2026, 10, 8) }).parts[0].sections, r.parts[0].sections);
});

test("report_compat: pair relation + Day-Master element relation, gentle wording", () => {
  const r = R.buildCompat(BIRTH, BIRTH2);
  assert.deepEqual(r.parts.map(p => p.id), ["pair", "elements"]);
  assert.ok(r.score >= 55 && r.score <= 100);
  assert.ok(Object.keys(R.PAIR_EL).includes(r.elRel));
  assert.ok(r.parts[0].sections.length >= 2);
  assert.ok(!/หย่า|เลิกกัน|ตาย|โรค/.test(JSON.stringify(r)), "no divorce / death / illness wording");
});

test("report_annual: 12 months with pillar, ten-god theme and a tip; months survive saving first", () => {
  const r = R.buildAnnual(BIRTH, 2027, { monthName: m => "M" + m });
  assert.equal(r.months.length, 12);
  for (const x of r.months) { assert.ok(R.GODS[x.god] && x.pillar.length === 2 && x.title && x.text && x.tip, JSON.stringify(x)); }
  assert.ok(r.months.some(x => x.god !== r.months[0].god), "months differ");
  const s = R.toSaved(r);
  assert.equal(s.data.sections[0].id, "months-1");
  assert.equal(s.data.sections[1].id, "months-2");
  assert.equal(s.data.sections[0].paragraphs.length, 6);
});

test("reports compose in 中文 without Thai (zh knowledge bases)", () => {
  global.window = global.window || globalThis;
  require("../../i18n/zh-kb-lifecal.js");
  require("../../i18n/zh-kb-zodiac.js");
  const zh = require("../../i18n/zh-report.js") && (globalThis.LQI18N_Q || []).find(d => d.zh && d.zh["rp.h1"]).zh;
  const t = (k, th, v) => String(zh[k] || th).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m));
  for (const r of [R.buildBasic(BIRTH, { lang: "zh", t }), R.buildCompat(BIRTH, BIRTH2, { lang: "zh", t }), R.buildAnnual(BIRTH, 2027, { lang: "zh", t })]) {
    assert.equal(r.lang, "zh", r.kind);
    const thai = JSON.stringify(r).match(/[฀-๿]+/g);
    assert.equal(thai, null, r.kind + " has Thai: " + (thai || []).slice(0, 5).join(" "));
  }
});

test("toSaved output is accepted by the Worker's cleanSaved (backend/src/members.js)", async () => {
  const { cleanSaved, SAVED_MAX_BYTES } = await import("../../backend/src/members.js");
  for (const r of [R.buildBasic(BIRTH), R.buildCompat(BIRTH, BIRTH2), R.buildAnnual(BIRTH, 2027)]) {
    const json = cleanSaved(R.toSaved(r).data);
    assert.ok(Buffer.byteLength(json) <= SAVED_MAX_BYTES, r.kind);
    assert.ok(R.DOMAIN[r.kind]);
  }
});

test("report helpers: validBirth, modeOf, creditsOf", () => {
  assert.equal(R.validBirth({ y: 1990, m: 2, d: 30 }), "rp.err.date");
  assert.equal(R.validBirth({ y: 1800, m: 2, d: 3 }), "rp.err.year");
  assert.equal(R.validBirth(BIRTH), "");
  assert.equal(R.modeOf(null, false), "sample");
  assert.equal(R.modeOf({ free_mode: true }, true), "free");
  assert.equal(R.modeOf({ free_mode: false }, true), "paid");
  assert.deepEqual(R.creditsOf({ perks: { report_basic: { credits: 2 } } }, { report_annual: 1 }), { report_basic: 2, report_compat: 0, report_annual: 0 }, "entitlements win over a stale /api/me");
  assert.deepEqual(R.creditsOf(null, { report_annual: 1 }), { report_basic: 0, report_compat: 0, report_annual: 1 });
  assert.deepEqual(R.creditsOf(null, [{ feature: "report_compat", remaining: 1 }]).report_compat, 1);
});

test("report.js redeems through the server check and every rp.* key has zh + en (zh without Thai)", () => {
  const src = read("report.js"), html = read("report.html");
  assert.match(src, /useEntitlement\(st\.type\)/);
  for (const f of R.TYPES) assert.ok(src.includes(`"${f}"`), f);
  global.window = global.window || globalThis;
  require("../../i18n/zh-report.js"); require("../../i18n/en-report.js");
  const Q = globalThis.LQI18N_Q || [];
  const zh = Object.assign({}, ...Q.filter(d => d.zh).map(d => d.zh)), en = Object.assign({}, ...Q.filter(d => d.en).map(d => d.en));
  const keys = new Set([...src.matchAll(/T\("(rp\.[\w.]+)"/g), ...src.matchAll(/t\("(rp\.[\w.]+)"/g), ...html.matchAll(/data-i18n(?:-attr="[\w-]+:|=")(rp\.[\w.]+)"/g)].map(m => m[1]));
  for (const k of ["rp.god.peer.title", "rp.el.0", "rp.animal.11", "rp.pairEl.officer"]) keys.add(k);
  assert.ok(keys.size > 60, "keys found: " + keys.size);
  for (const k of [...keys]) if (k.endsWith(".")) keys.delete(k); // dynamic prefixes ("rp.el." + i) — covered above
  for (const g of ["peer", "output", "wealth", "officer", "resource"]) for (const f of ["title", "text", "tip"]) keys.add(`rp.god.${g}.${f}`);
  for (let i = 0; i < 5; i++) keys.add("rp.el." + i);
  for (let i = 0; i < 12; i++) keys.add("rp.animal." + i);
  for (const r of Object.keys(R.PAIR_EL)) keys.add("rp.pairEl." + r);
  const miss = [...keys].filter(k => !(k in zh) || !(k in en));
  assert.deepEqual(miss, []);
  assert.deepEqual(Object.entries(zh).filter(([k, v]) => k.startsWith("rp.") && THAI.test(v)), []);
  assert.deepEqual(Object.entries(en).filter(([k, v]) => k.startsWith("rp.") && THAI.test(v)), []);
});

/* ---------------- leads ---------------- */
test("lensiq-leads: clean, mailto, LINE and fallback choice", () => {
  assert.equal(L.filled("[contact e-mail]"), false);
  assert.equal(L.filled(" a@b.co "), true);
  assert.deepEqual(L.cleanLead({ name: " A\u0007 ", email: "a@b.co", x: "drop", message: "m".repeat(2000) }).message.length, 1000);
  assert.equal(L.cleanLead({ x: 1 }).x, undefined);
  assert.equal(L.lineUrl("lensiq"), "https://line.me/R/ti/p/%40lensiq");
  assert.equal(L.lineUrl("@bad id"), "");
  const href = L.mailtoHref("sales@example.com", { name: "Somchai", org: "Shop", email: "s@x.co", interest: "store", message: "hi" });
  assert.ok(href.startsWith("mailto:sales@example.com?subject="));
  assert.ok(decodeURIComponent(href).includes("Name: Somchai") && decodeURIComponent(href).includes("hi"));
  assert.equal(L.mailtoHref("not-an-email", {}), "");
  assert.deepEqual(L.fallbackOf({ email: "", line: "" }).any, false);
  assert.equal(L.fallbackOf({ email: "[contact e-mail]", line: "@lensiq" }).email, "");
  assert.equal(L.fallbackOf({ email: "a@b.co" }).any, true);
});

test("contact form: no more 'sends nowhere' claim as the only path — LQLeads first, honest fallback texts in 3 languages", () => {
  const home = read("home.js"), idx = read("index.html");
  assert.match(home, /L\.submit\(/);
  assert.match(idx, /<script src="lensiq-leads\.js/);
  for (const k of ["home.ok.sent", "home.ok.fallback", "home.ok.notSent", "home.form.mode.api", "home.form.mode.none", "home.form.i6"]) {
    assert.ok(read("i18n/zh-common.js").includes(`"${k}"`) && read("i18n/en-common.js").includes(`"${k}"`), k);
  }
  for (const [f, i] of [["retail.html", "store"], ["hr.html", "hr"], ["creative-suite.html", "creative"]]) assert.ok(read(f).includes(`index.html?interest=${i}#contact`), f);
  assert.ok(/value="hr"/.test(idx) && /value="creative"/.test(idx));
});

/* ---------------- legal pages + guard ---------------- */
test("help / terms / privacy: no raw [placeholders]; each language copy uses the same seller keys", async () => {
  const G = await import("../../tools/check-legal.mjs");
  for (const p of G.PAGES) {
    const html = read(p);
    assert.deepEqual(G.rawPlaceholders(html), [], p);
    const per = ["th", "en", "zh"].map(l => {
      const a = html.indexOf(`<article class="lg lg-${l}`), b = html.indexOf("</article>", a);
      return JSON.stringify(G.sellerKeys(html.slice(a, b)));
    });
    assert.equal(per[0], per[1], p + " th vs en");
    assert.equal(per[0], per[2], p + " th vs zh");
    assert.equal((html.match(/data-seller-demo/g) || []).length, 3, p + " demo notice in 3 languages");
  }
});

test("check-legal: report mode passes now; billing on with gaps fails; complete details pass", async () => {
  const G = await import("../../tools/check-legal.mjs");
  const pages = Object.fromEntries(G.PAGES.map(p => [p, read(p)]));
  const seller = G.sellerFromConfig(read("lensiq-config.js"));
  assert.equal(seller.sales_open, false);
  const now = G.checkLegal({ seller, wrangler: G.wranglerVars(read("backend/wrangler.toml")), pages });
  assert.equal(now.ok, true, now.why.join("; "));
  const on = G.checkLegal({ seller, wrangler: {}, pages, billing: true });
  assert.equal(on.ok, false);
  assert.ok(on.missingRequired.includes("email"));
  const full = { sales_open: true, counsel_confirmed: true, name: "LENSIQ Co., Ltd.", tax_id: "0105500000000", address: "Bangkok", email: "help@example.com", effective_date: "1 Dec 2026", dpo_email: "dpo@example.com" };
  const ok = G.checkLegal({ seller: full, wrangler: { SELLER_NAME: "LENSIQ Co., Ltd.", SELLER_TAX_ID: "0105500000000", SELLER_ADDRESS: "Bangkok", BILLING_ENABLED: "true" }, pages });
  assert.equal(ok.ok, true, ok.why.join("; "));
  const mism = G.checkLegal({ seller: full, wrangler: { SELLER_NAME: "Other", SELLER_TAX_ID: "0105500000000", SELLER_ADDRESS: "Bangkok" }, pages });
  assert.equal(mism.ok, false);
  const raw = G.checkLegal({ seller, pages: { "help.html": "<p>Mail <span class=\"ph\">[contact e-mail]</span></p>" } });
  assert.equal(raw.ok, false, "a raw placeholder always fails");
  assert.deepEqual(G.wranglerVars('FREE_MODE = "false"\nSELLER_NAME = ""').FREE_MODE, "false");
  assert.equal(G.checkLegal({ seller: {}, wrangler: { FREE_MODE: "false" }, pages: {} }).billing, true);
});

test("legal.js fills data-seller spans from window.LENSIQ_SELLER and hides the demo notice only when ready", () => {
  const src = read("legal.js");
  assert.match(src, /LENSIQ_SELLER/);
  assert.match(src, /\[data-seller-demo\]/);
  assert.match(src, /REQUIRED = \["name", "tax_id", "address", "email", "effective_date", "dpo_email"\]/);
  const G = read("tools/check-legal.mjs");
  assert.match(G, /REQUIRED = \["name", "tax_id", "address", "email", "effective_date", "dpo_email"\]/, "same required keys as the guard");
  assert.match(read("lensiq-config.js"), /window\.LENSIQ_SELLER = window\.LENSIQ_SELLER \|\| \{/);
});

test("tier naming: Plus / reports / Creator / Business in help and terms (3 languages); refunds cover one-time reports; §8 in-account reminder", () => {
  const help = read("help.html"), terms = read("terms.html"), sup = read("docs/SUPPORT.md");
  for (const s of ["พลัส (Plus)", "ครีเอเตอร์ (Creator)", "<b>Plus:</b>", "<b>Creator / Business:</b>", "Plus 加强会员", "Creator 创作者"]) assert.ok(help.includes(s), "help: " + s);
  for (const s of ["<b>พลัส (Plus)</b>", "<b>Creator</b>", "Plus 加强会员"]) assert.ok(terms.includes(s), "terms: " + s);
  assert.ok(!/<b>Pro<\/b> \/ <b>Business<\/b>/.test(terms) && !/<li><b>Pro \/ Business:<\/b>/.test(help), "old Pro / Business tier lines replaced");
  for (const s of ["รายงานดวงแบบซื้อครั้งเดียว:</b>", "One-time reports:</b>", "一次性报告：</b>"]) assert.ok(terms.includes(s), "refund clause " + s);
  for (const s of ["account.html#plan", "ยังไม่มีการแจ้งเตือนทางอีเมล", "there are no e-mail reminders yet", "目前暂无邮件提醒"]) assert.ok(terms.includes(s), "§8 " + s);
  assert.ok(!terms.includes("เราจะแจ้งเตือนพร้อม QR ใหม่") && !terms.includes("we send a reminder with a new QR code"), "no promise of a reminder the code does not send");
  assert.match(sup, /Plus/);
  assert.match(sup, /Creator/);
  assert.match(help, /class="tbl tbl-cards"/);
  assert.match(read("legal.css"), /max-width:479\.98px[\s\S]*tbl-cards td::before\{content:attr\(data-label\)/);
});

test("checkout asks for the age of majority; pricing DRAFT uses the BILLING-PLAN Plus perks; one-pagers mark coming-soon perks", () => {
  const html = read("pricing.html"), js = read("pricing.js");
  assert.match(html, /name="age" required/);
  assert.match(js, /age_confirm: !!\(f\.age && f\.age\.checked\)/);
  const P = require("../../pricing.js");
  const plus = P.DRAFT.find(p => p.id === "plus");
  assert.ok(plus.perks.some(x => x.id === "saved_50") && !plus.perks.some(x => x.id === "saved_200"));
  assert.equal(P.DRAFT.find(p => p.id === "pro").name_en, "Creator");
  for (const f of ["docs/ONE-PAGER-RETAIL.md", "docs/ONE-PAGER-TH.md", "docs/ONE-PAGER-ZH.md"]) {
    const t = read(f);
    assert.match(t, /เร็ว ๆ นี้|coming soon|即将推出/i, f);
  }
});
