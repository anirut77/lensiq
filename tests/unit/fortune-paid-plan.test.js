"use strict";
// tests/unit/fortune-paid-plan.test.js — FIXED TEST SET, owner order 2026-11-15 (2) for fortune-paid: goal-based plan
// (แผนมูตามเป้าหมาย), conversion items a–h and the funnel. Locked (evals-locks/fortune-paid.sha256, re-lock (4)) BEFORE the
// build. DOM half: tests/e2e/fortune-paid-plan.e2e.mjs. Switches on in the tests only: LENSIQ_FORTUNE_PAID and the plan
// sub-switch LENSIQ_FORTUNE_PLAN (both default false; the plan conflicts with CLAUDE.md "Remedies and merit" until the owner
// amends it, docs/PENDING-DECISIONS.md).
//   plan  chosen only by the person's goal (work, money, love, health, protection, barami); never built from, or offered as the
//         answer to, a warning: no caution lead or caution item's text, no "weak" / "chong" Merit entries, no chong type;
//         places only from published Merit place entries (lint-clean); colours / directions only from the facts' extras (birth
//         data via the engine) and each of them also in the free part; every step labelled "according to belief", no promised
//         result, passes the same hard-limit and safety filters as free text (gentle and straight); none in the crisis state
//   conv  a: one group offer per group with paid depth, price in the button text · b: pre-payment preview = every paid group's
//         heading + at most the first two lines of its paid text, nothing else paid · c: made for this person (nickname if
//         given, the reading's headline) · d: the price ladder 49 / 99 / 199 / 149 together · f: share card holds no personal
//         data unless the person chooses it · h: no countdown, urgency, invented reviews / counts or fear wording; every number
//         shown is a configured price
//   funnel totals only (overview → open → tap → paid) through the consent-gated analytics; nothing without it, nothing personal
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const P = require("../../fortune-paid.js");
const SEED = require("../../lensiq-merit-seed.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");
const LANGS = ["th", "en", "zh"];
const GOALS = ["work", "money", "love", "health", "protection", "barami"];
const LADDER = { group: 49, full: 99, year: 199, plus: 149 };

function withSw(paid, plan, fn) {
  const a = globalThis.LENSIQ_FORTUNE_PAID, b = globalThis.LENSIQ_FORTUNE_PLAN;
  globalThis.LENSIQ_FORTUNE_PAID = paid; globalThis.LENSIQ_FORTUNE_PLAN = plan;
  try { return fn(); } finally { globalThis.LENSIQ_FORTUNE_PAID = a; globalThis.LENSIQ_FORTUNE_PLAN = b; }
}
const flat = x => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === "object" ? Object.values(x).flatMap(flat) : typeof x === "string" ? [x] : []);
const leads = l => [...new Set(flat(FA.straight.LEADS[l]).concat(flat((FA.straight.NATAL_LEADS || {})[l]), flat(FA._internal.cautionLeads(l))))]
  .map(s => s.replace(/[.。]$/, "")).filter(s => s.length >= 8);
const itemOf = (dom, it, l) => { try { return (l === "en" ? FA.en.item(dom, it) : l === "zh" ? FA.zh.item(dom, it) : it) || it; } catch (e) { return it; } };
const isCaut = (it, st) => it.tone === "caution" || it.polarity === "challenge" || (st && FA.straight.LABEL_NEG.test(String(it.label || "")));
const OUTCOME = { th: /รับรอง|แน่นอน|ได้ผล|สำเร็จแน่|ดวงดีขึ้น|เปลี่ยนดวง|แก้ดวง|แก้ชง|โชคดีแน่|ร่ำรวย|หายป่วย/,
  en: /guarantee|will (?:bring|make|give|fix|change)|surely|for sure|it works|will work|change your (?:luck|fortune)|fix your|get rich|cure/i, zh: /保证|一定会|必定|灵验|改运|转运|化解|发财|治愈/ };
const URGENCY = new RegExp("เหลือเวลา|หมดเขต|ด่วน|วันนี้เท่านั้น|นาทีสุดท้าย|คนซื้อแล้ว|รีวิว|ดาว 5|only today|hurry|limited time|" +
  "last chance|countdown|left in stock|people bought|reviews?|rated|限时|倒计时|仅剩|已有.*人|好评|赶快", "i");
const FEAR = /ถ้าไม่.*(?:จะ|ดวง)|ก่อนจะสาย|เคราะห์ร้ายจะ|unless you|before it'?s too late|or (?:else|your luck)|不然|否则|以免厄运/i;

let CORPUS = null;
async function corpus() {
  if (CORPUS) return CORPUS;
  const X = await exportTool();
  const out = [];
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const straight of [false, true]) {
    const r = X.lcg(80808 + X.DOMAINS.indexOf(d) * 43 + (straight ? 17 : 0) + LANGS.indexOf(lang) * 811);
    let got = 0;
    for (let i = 0; i < 300 && got < 24; i++) {
      let f; try { f = X.factsFor(d, i + 7000, r); } catch (e) { continue; }
      if (i % 3 === 0) f = Object.assign({}, f, { subject: Object.assign({}, f.subject, { nickname: "น้องฝน" }) });
      const res = FA.compose(f, { seed: 61000 + i * 13, lang, straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      got++;
      const caut = (f.items || []).filter(it => isCaut(it, straight)).flatMap(it => Object.values((itemOf(f.domain, it, lang) || {}).meanings || {}).flatMap(flat));
      out.push({ d, lang, straight, f, res, caut });
    }
  }
  CORPUS = out;
  return out;
}
const PUBLISHED_PLACES = new Set(SEED.filter(s => s.type === "place" && s.status === "published" && !(s.keys || []).some(k => k === "weak" || k === "chong")).map(s => s.id));

test("switches: the plan needs BOTH LENSIQ_FORTUNE_PAID and LENSIQ_FORTUNE_PLAN exactly true; lensiq-config.js ships both false", () => {
  const src = fs.readFileSync(path.join(ROOT, "lensiq-config.js"), "utf8");
  assert.match(src, /window\.LENSIQ_FORTUNE_PLAN\s*=/);
  for (const [pre, want] of [[undefined, false], ["true", false], [1, false], [true, true]]) {
    const win = { location: { pathname: "/x.html", hostname: "localhost", search: "" } };
    if (pre !== undefined) win.LENSIQ_FORTUNE_PLAN = pre;
    win.window = win; vm.runInNewContext(src, win);
    assert.equal(win.LENSIQ_FORTUNE_PLAN, want, "preset " + JSON.stringify(pre));
  }
  assert.equal(withSw(true, false, () => P.planEnabled()), false);
  assert.equal(withSw(false, true, () => P.planEnabled()), false);
  assert.equal(withSw(true, true, () => P.planEnabled()), true);
  assert.deepEqual(P.GOALS, GOALS);
  for (const l of LANGS) for (const g of GOALS) assert.ok(String(P.TEXT[l]["goal." + g] || "").trim(), `${l} goal.${g} label`);
});

test("plan: chosen by goal only, built from published Merit places and the facts' extras, never from a warning (>= 2,000 plans)", async () => {
  const C = await corpus();
  let n = 0;
  const bad = [];
  for (const x of C) for (const goal of [GOALS[(n + x.d.length) % 6]]) {
    const pl = withSw(true, true, () => P.planFor(goal, { facts: x.f, res: x.res, lang: x.lang, items: SEED }));
    assert.ok(pl, `${x.d} ${x.lang}: plan for ${goal}`);
    n++;
    assert.equal(pl.goal, goal);
    assert.ok(pl.placeIds.length >= 1 && pl.placeIds.every(id => PUBLISHED_PLACES.has(id)), "places only from published Merit place entries: " + pl.placeIds);
    const ex = x.f.extras || {};
    for (const c of pl.colours) if (!flat(ex.luckyColors).includes(c)) bad.push(`${x.d} ${x.lang}: colour not from the facts: ${c}`);
    for (const dd of pl.directions) if (!flat(ex.directions).includes(dd)) bad.push(`${x.d} ${x.lang}: direction not from the facts: ${dd}`);
    const all = pl.steps.map(s => s.text).join("\n");
    assert.ok(pl.steps.length >= 3, "steps in order");
    pl.steps.forEach((s, i) => assert.equal(s.n, i + 1, "numbered in order"));
    assert.ok(all.includes(P.TEXT[x.lang].belief) || pl.belief === P.TEXT[x.lang].belief, "labelled according to belief");
    for (const s of pl.steps) {
      if (!P.safe(s.text, { straight: false }) || !P.safe(s.text, { straight: true })) bad.push(`${x.d} ${x.lang}: unsafe step ${s.text.slice(0, 60)}`);
      if (OUTCOME[x.lang].test(s.text)) bad.push(`${x.d} ${x.lang}: promised result ${s.text.slice(0, 60)}`);
      if (/\d+\s*(?:บาท|THB|泰铢)|฿/.test(s.text)) bad.push(`${x.d} ${x.lang}: a price inside the plan`);
      const q = leads(x.lang).find(q => s.text.includes(q)) || x.caut.find(m => m.length >= 12 && s.text.includes(m));
      if (q) bad.push(`${x.d} ${x.lang}: plan built from a warning …${q.slice(0, 40)}`);
    }
    if (bad.length > 25) break;
  }
  assert.ok(n >= 2000, "plans " + n);
  assert.equal(bad.length, 0, bad.join("\n"));
});

test("plan: no plan without a valid goal, without published places, with the plan switch off, or in the crisis state", () => {
  const f = { domain: "zodiac", items: [], extras: { luckyColors: ["เขียว"] } }, res = { lang: "th", sections: [{ id: "overview", paragraphs: ["ก"] }] };
  assert.equal(withSw(true, true, () => P.planFor("lottery", { facts: f, res, lang: "th", items: SEED })), null, "unknown goal");
  assert.equal(withSw(true, true, () => P.planFor(undefined, { facts: f, res, lang: "th", items: SEED })), null, "no goal chosen");
  assert.equal(withSw(true, true, () => P.planFor("work", { facts: f, res, lang: "th", items: SEED.filter(s => s.type !== "place") })), null, "no places");
  const drafts = SEED.map(s => Object.assign({}, s, { status: "draft" }));
  assert.equal(withSw(true, true, () => P.planFor("work", { facts: f, res, lang: "th", items: drafts })), null, "unpublished places never used");
  assert.equal(withSw(true, false, () => P.planFor("work", { facts: f, res, lang: "th", items: SEED })), null, "plan switch off");
  assert.equal(withSw(true, true, () => P.planFor("work", { facts: f, res, lang: "th", items: SEED, crisis: true })), null, "crisis");
  assert.equal(withSw(true, true, () => P.planFor("work", { facts: f, res: FA.crisis.result({ lang: "th" }), lang: "th", items: SEED })), null, "support card");
  const only = withSw(true, true, () => P.planFor("protection", { facts: f, res, lang: "th", items: SEED }));
  assert.ok(only && !only.placeIds.includes("sample-cf-place-2"), "a chong place is never in a plan");
});

test("plan: every place, colour and direction in a plan is also free information (free reading text or the free Merit list)", async () => {
  const C = await corpus();
  let checked = 0;
  for (const x of C.filter(c => c.lang === "th").slice(0, 400)) {
    const pl = withSw(true, true, () => P.planFor("money", { facts: x.f, res: x.res, lang: "th", items: SEED }));
    const sp = withSw(true, true, () => P.split(x.res, { lang: "th", straight: x.straight }));
    const free = sp.groups.flatMap(g => g.free).join(" ") + " " + JSON.stringify(x.res.summary || "") + " " + JSON.stringify(x.res.plan || "");
    for (const c of pl.colours) { checked++; assert.ok(free.includes(c), `${x.d}: colour ${c} only in the plan`); }
    for (const id of pl.placeIds) assert.ok(PUBLISHED_PLACES.has(id), "a published Merit entry (shown free in the Merit panel)");
  }
  assert.ok(checked >= 50, "colours checked " + checked);
});

test("conversion a + d: one 49 offer per group with paid depth, price in the button text; the ladder shows 49 / 99 / 199 / 149 together", async () => {
  const C = await corpus();
  for (const l of LANGS) {
    const ld = P.ladder(l);
    assert.deepEqual(ld.map(r => r.plan), ["group", "full", "year", "plus"]);
    for (const r of ld) { assert.equal(r.price, LADDER[r.plan]); assert.ok(r.priceText.includes(String(r.price)), r.priceText); assert.ok(r.label.trim()); }
  }
  for (const x of C.slice(0, 300)) {
    const sp = withSw(true, false, () => P.split(x.res, { lang: x.lang, straight: x.straight }));
    const offers = withSw(true, false, () => P.offers(sp, x.lang, {}));
    for (const o of offers.filter(o => o.plan === "group")) assert.ok(String(o.button).includes(String(o.price)), "price on the button: " + o.button);
  }
});

test("conversion b + c: the pre-payment preview lists every paid group's heading with at most two lines of its paid text, made for this person", async () => {
  const C = await corpus();
  let n = 0;
  for (const x of C.slice(0, 900)) {
    const sp = withSw(true, false, () => P.split(x.res, { lang: x.lang, straight: x.straight }));
    const paid = sp.groups.filter(g => g.paid.length);
    const pv = withSw(true, false, () => P.preview(sp, x.lang, { nickname: (x.f.subject || {}).nickname, headline: x.f.headline }));
    if (!paid.length) { assert.equal(pv, null, "nothing to sell, no preview"); continue; }
    n++;
    assert.deepEqual(pv.groups.map(g => g.title), paid.map(g => g.title), "every heading, in order");
    pv.groups.forEach((g, k) => {
      assert.ok(g.lines.length >= 1 && g.lines.length <= 2, "one or two lines");
      const body = paid[k].paid.join(" ");
      for (const ln of g.lines) assert.ok(body.includes(ln.replace(/…$/, "").trim()), "a line comes from that group's own paid text");
    });
    const nick = (x.f.subject || {}).nickname;
    if (nick) assert.ok(pv.madeFor.includes(nick), "nickname shown when given");
    if (x.f.headline) assert.ok(pv.madeFor.includes(String(x.f.headline).slice(0, 20)), "the reading's headline (birth data) shown");
    assert.deepEqual(pv.ladder.map(r => r.price), [49, 99, 199, 149]);
    assert.equal(withSw(true, false, () => P.preview(sp, x.lang, {}, { crisis: true })), null, "no preview in the crisis state");
  }
  assert.ok(n >= 500, "previews " + n);
});

test("conversion f: the share card holds no personal data unless the person chooses it", async () => {
  const C = await corpus();
  for (const x of C.filter(c => (c.f.subject || {}).nickname).slice(0, 100)) {
    const card = P.shareCard(x.res, { lang: x.lang, nickname: x.f.subject.nickname, headline: x.f.headline });
    const txt = JSON.stringify(card);
    assert.ok(!txt.includes(x.f.subject.nickname), "no nickname by default");
    if (x.f.headline) assert.ok(!txt.includes(String(x.f.headline)), "no birth data by default");
    const chosen = JSON.stringify(P.shareCard(x.res, { lang: x.lang, nickname: x.f.subject.nickname, showName: true }));
    assert.ok(chosen.includes(x.f.subject.nickname), "nickname only when chosen");
    assert.ok(card.lines.length >= 1 && card.lines.every(l => typeof l === "string" && l.trim()), "lines");
    assert.equal(P.shareCard(FA.crisis.result({ lang: x.lang }), { lang: x.lang }), null, "no share card for a support card");
  }
});

test("conversion h: no countdown, urgency, invented reviews or counts, no fear wording; every number in the offer text is a price", () => {
  const all = JSON.stringify(P.TEXT);
  assert.ok(!URGENCY.test(all), "urgency / review / count wording: " + (all.match(URGENCY) || [])[0]);
  assert.ok(!FEAR.test(all), "fear wording: " + (all.match(FEAR) || [])[0]);
  const keys = l => Object.keys(P.TEXT[l]).sort();
  assert.deepEqual(keys("en"), keys("th")); assert.deepEqual(keys("zh"), keys("th"));
  const nums = (all.match(/\d+/g) || []).map(Number).filter(n => n > 12);
  for (const n of nums) assert.ok(Object.values(P.PRICES).includes(n), "a number in the text that is not a price: " + n);
});

test("funnel: totals only through the consent-gated analytics; nothing without analytics or consent; no personal field", () => {
  const sent = [];
  const A = { consent: () => "no", feature: (f, s) => sent.push([f, s]) };
  const old = globalThis.LQAnalytics;
  try {
    delete globalThis.LQAnalytics;
    for (const st of ["overview", "open", "tap", "paid"]) assert.equal(P.funnel(st), false, "no analytics: not sent");
    globalThis.LQAnalytics = A;
    for (const st of ["overview", "open", "tap", "paid"]) assert.equal(P.funnel(st), false, "no consent: not sent");
    assert.equal(sent.length, 0);
    A.consent = () => "yes";
    for (const st of ["overview", "open", "tap", "paid"]) assert.equal(P.funnel(st), true, "consent: one count");
    assert.equal(P.funnel("someone@example.com"), false, "unknown step refused");
    assert.deepEqual(sent, [["fortune.paid.overview", "start"], ["fortune.paid.open", "start"], ["fortune.paid.tap", "start"], ["fortune.paid.paid", "start"]]);
  } finally { if (old === undefined) delete globalThis.LQAnalytics; else globalThis.LQAnalytics = old; }
});
