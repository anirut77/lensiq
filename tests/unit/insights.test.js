"use strict";
// node --test tests/unit — insights.js: store byCam / namespaced zones, fortune stats keys, privacy of fr-leads, demo residue.
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../../insights.js");
const S = require("../../store.js");

const hourly = () => ({ in: Array(24).fill(0), out: Array(24).fill(0) });
const R = (now = new Date(2026, 10, 6, 12).getTime()) => I.iqRange("all", now, {});
const snapOf = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
const browserSnap = ls => Object.fromEntries(Object.entries(ls).filter(([k]) => I.iqIsModuleKey(k))); // = insights snapshot()

test("legacy st-day (no byCam, zones 'z1') gives the same totals as before, also after store migration", () => {
  const legacy = { "st-day-2026-11-05": { date: "2026-11-05", in: 12, out: 9, occ: 3, peak: 6, peakAt: 1, maxQueue: 2, hourly: hourly(), zones: { z1: { name: "ชั้นวาง", visits: 5, dwellSum: 1, dwellN: 1, peak: 2 } } } };
  const D = I.iqCollect(snapOf(legacy)), r = I.iqRange("all", new Date(2026, 10, 6, 12).getTime(), D);
  const M = I.iqMetrics(D, r);
  assert.equal(M.store.in, 12); assert.equal(M.store.peak, 6); assert.equal(M.store.maxQueue, 2);
  assert.deepEqual(D.store[0].byCam, {});
  assert.equal(D.store[0].zones.z1.name, "ชั้นวาง");
  // migrate as store.html would, totals unchanged
  const m = new Map(Object.entries(snapOf(legacy)));
  S.migrateStore(k => m.get(k) ?? null, (k, v) => m.set(k, v), [...m.keys()]);
  const D2 = I.iqCollect(Object.fromEntries(m)), M2 = I.iqMetrics(D2, r);
  assert.equal(M2.store.in, 12); assert.equal(M2.store.peak, 6);
  assert.equal(D2.store[0].zones["c1:z1"].name, "ชั้นวาง"); // one camera -> no prefix
});

test("v2 day with byCam is summed correctly and zone names get the camera prefix", () => {
  const mk = (date, a, b) => ({ date, in: a.in + b.in, out: a.out + b.out, occ: 0, peak: 4, peakAt: 0, maxQueue: 1, hourly: hourly(), zv: 2,
    byCam: { c1: { name: "ประตูหน้า", ...a }, c2: { name: "ประตูหลัง", ...b } },
    zones: { "c1:z1": { name: "โซน", visits: 2, dwellSum: 0, dwellN: 0, peak: 1 }, "c2:z1": { name: "โซน", visits: 3, dwellSum: 0, dwellN: 0, peak: 1 } } });
  const snap = snapOf({ "st-day-2026-11-05": mk("2026-11-05", { in: 3, out: 2 }, { in: 4, out: 4 }), "st-day-2026-11-06": mk("2026-11-06", { in: 1, out: 1 }, { in: 2, out: 0 }) });
  const D = I.iqCollect(snap), M = I.iqMetrics(D, I.iqRange("all", new Date(2026, 10, 6, 12).getTime(), D));
  assert.equal(M.store.in, 10);
  assert.deepEqual(M.store.byCam, { c1: { name: "ประตูหน้า", in: 4, out: 3 }, c2: { name: "ประตูหลัง", in: 6, out: 4 } });
  assert.equal(M.store.byCam.c1.in + M.store.byCam.c2.in, M.store.in);
  assert.equal(D.store[0].zones["c1:z1"].name, "ประตูหน้า · โซน");
  assert.equal(D.store[0].zones["c2:z1"].name, "ประตูหลัง · โซน");
  const bars = I.iqModuleBars(D, I.iqRange("all", new Date(2026, 10, 6, 12).getTime(), D), "store");
  assert.deepEqual(bars.map(b => [b.label, b.value]), [["ประตูหลัง", 6], ["ประตูหน้า", 4]]);
  const today = I.iqMetrics(D, I.iqRange("today", new Date(2026, 10, 6, 12).getTime(), D));
  assert.equal(today.store.in, 3);
});

const LS = () => ({
  "fr-stats": { v: 1, total: 3, el: { wood: 1, fire: 2, earth: 0, metal: 0, water: 0 }, days: { "2026-11-05": 1, "2026-11-06": 2 }, first: "x", last: "y" },
  "palm-stats": { v: 1, total: 2, types: { earth: 0, air: 2, fire: 0, water: 0 }, days: { "2026-11-06": 2 } },
  "fs-stats": { v: 1, total: 1, days: { "2026-11-04": 1 }, kua: { 3: 1 } },
  "fr-leads": [{ ts: "2026-11-06", nick: "นิด", contact: "line:nid", element: "fire", consent: "ยินยอม" }],
  "fr-prefs": { voice: true }, "palm-prefs": { a: 1 }, "fs-prefs": { b: 1 },
  "lq-camcap": { v: 1, maxLive: 1, at: 1 },
  "st-cams": { v: 1, cams: [{ slot: "c1", deviceId: "d", label: "", name: "กล้อง 1", role: "both" }] },
  "st-cam-c1": { line: null, swap: false, zones: [], detW: 0 }, "st-heat-c1": [0, 1]
});

test("iqIsModuleKey: fortune stats + st-cam keys in; fr-leads, fr-prefs, lq-camcap never", () => {
  for (const k of ["fr-stats", "palm-stats", "fs-stats", "st-cams", "st-cam-c1", "st-cam-c4", "st-heat-c2", "st-settings"]) assert.ok(I.iqIsModuleKey(k), k);
  for (const k of ["fr-leads", "fr-prefs", "palm-prefs", "fs-prefs", "lq-camcap", "fortune-ai", "frx-stats"]) assert.ok(!I.iqIsModuleKey(k), k);
});

test("fr-leads is never in the snapshot or backup; fr/palm/fs stats are in the backup and collected", () => {
  const snap = browserSnap(snapOf(LS()));
  assert.ok(!("fr-leads" in snap) && !("lq-camcap" in snap) && !("fr-prefs" in snap));
  const b = I.iqBackup(snap, {}, 0);
  for (const k of ["fr-stats", "palm-stats", "fs-stats", "st-cams", "st-cam-c1", "st-heat-c1"]) assert.ok(k in b.localStorage, k);
  assert.ok(!JSON.stringify(b).includes("line:nid"));
  // even a full localStorage passed to iqBackup filters fr-leads out
  const b2 = I.iqBackup(snapOf(LS()), {}, 0);
  assert.ok(!("fr-leads" in b2.localStorage) && !("lq-camcap" in b2.localStorage));
  assert.deepEqual(I.iqValidateBackup({ format: "lensiq-backup", localStorage: snapOf(LS()) }).keys.sort(), Object.keys(b.localStorage).sort());
  const D = I.iqCollect(snap), r = I.iqRange("all", new Date(2026, 10, 6, 12).getTime(), D);
  assert.equal(D.fr.total, 3); assert.equal(D.palm.total, 2); assert.equal(D.fs.total, 1);
  const M = I.iqMetrics(D, r);
  assert.deepEqual([M.fr.count, M.palm.count, M.fs.count], [3, 2, 1]);
  assert.equal(I.iqMetrics(D, I.iqRange("today", new Date(2026, 10, 6, 12).getTime(), D)).fr.count, 2);
  assert.equal(r.from, "2026-11-04"); // earliest includes fortune days
  assert.deepEqual(I.iqModuleBars(D, r, "fr").map(x => x.label), ["ไฟ", "ไม้"]);
  assert.deepEqual(I.iqModuleBars(D, r, "fs").map(x => x.label), ["เลขกัว 3"]);
});

test("demo add/remove leaves no residue (incl. byCam days and st-heat-c1), real data untouched", () => {
  const now = new Date(2026, 10, 6, 15).getTime();
  const real = snapOf({ "st-heat": [1, 2], "st-cams": LS()["st-cams"], "fr-stats": LS()["fr-stats"] });
  const ls = { ...real };
  const out = I.iqBuildDemo(browserSnap(ls), now, 7);
  Object.assign(ls, out.set);
  const days = Object.keys(ls).filter(k => k.startsWith("st-day-"));
  assert.ok(days.length >= 29);
  const d0 = JSON.parse(ls[days[0]]);
  assert.equal(d0.byCam.c1.in + d0.byCam.c2.in, d0.in);
  assert.equal(d0.byCam.c1.out + d0.byCam.c2.out, d0.out);
  assert.ok(Object.keys(d0.zones).every(k => /^c[12]:/.test(k)));
  assert.ok(ls["st-heat-c1"]);
  const D = I.iqCollect(browserSnap(ls));
  assert.equal(Object.keys(I.iqMetrics(D, I.iqRange("all", now, D)).store.byCam).length, 2);
  const rm = I.iqRemoveDemo(browserSnap(ls));
  for (const k of rm.remove) delete ls[k];
  Object.assign(ls, rm.set);
  assert.deepEqual(rm.kept, []);
  assert.deepEqual(ls, real);
  assert.equal(I.iqHasDemo(browserSnap(ls)), false);
});

// ---------- interpretation text: context-appropriate wording for every card type, data quality, i18n coverage ----------
const ST = require("../../lensiq-stats.js");
const NOW2 = new Date(2026, 10, 6, 15).getTime();
const rng2 = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
/** scenarios that produce every card type: full demo, demo + goals/alerts, short data, flat noisy store, store with an outage */
function scenarios() {
  const out = [];
  for (const seed of [7, 11]) {
    const D = I.iqCollect(I.iqBuildDemo({}, NOW2, seed).set);
    for (const p of ["today", "d7", "d30", "d90", "all"]) for (const compare of ["prev", "week"]) out.push({ D, r: I.iqRange(p, NOW2, D, { compare }), opt: { now: NOW2, goals: { storeInDay: 400, convPct: 5, revenueDay: 1e6 }, alerts: { queueWaitMin: 0.5, occMax: 1 } } });
  }
  const R = rng2(3), snap = {};
  for (let d = 1; d <= 3; d++) { const day = I.iqAddDays("2026-11-06", -d), h = Array(24).fill(0); h[10] = 9; snap["st-day-" + day] = JSON.stringify({ date: day, in: 9, out: 9, peak: 3, maxQueue: 1, hourly: { in: h, out: h }, zones: {}, byCam: {} }); }
  const Ds = I.iqCollect(snap); out.push({ D: Ds, r: I.iqRange("d7", NOW2, Ds), opt: { now: NOW2 } });
  const snap2 = {};
  for (let d = 1; d <= 70; d++) {
    const day = I.iqAddDays("2026-11-06", -d), n = Math.round(150 * (1 + 0.3 * (2 * R() - 1))), h = Array(24).fill(0);
    for (let k = 9; k <= 20; k++) h[k] = Math.round(n / 12);
    if (d === 9) for (let k = 13; k <= 20; k++) h[k] = 0; // camera dark 13:00–20:59
    snap2["st-day-" + day] = JSON.stringify({ date: day, in: h.reduce((s, v) => s + v, 0), out: 0, peak: 5, maxQueue: 1, hourly: { in: h, out: h }, zones: {}, byCam: {} });
  }
  const Do = I.iqCollect(snap2); out.push({ D: Do, r: I.iqRange("d30", NOW2, Do), opt: { now: NOW2 } });
  return out;
}

test("every card type uses wording that fits its question (change / correlation / A-B) and has exactly one action", () => {
  const seen = new Set();
  const changeOnly = /จากเดิม|เปลี่ยนจริง|ความผันผวนรายวัน/; // period-comparison phrases
  for (const { D, r, opt } of scenarios()) {
    const A = I.iqAnalyze(D, r, opt), C = I.iqInsights(D, A);
    assert.deepEqual(I.iqTextOk(C), [], r.preset + ": bad text");
    for (const c of C) {
      seen.add(c.id.replace(/^(corr|goal|alert)-.*/, "$1"));
      assert.ok(typeof c.action === "string" && c.action.length > 8 && !/\n/.test(c.action), c.id + ": one action");
      assert.ok(c.title.length <= 90, c.id + ": short title " + c.title);
      if (c.kind === "corr") { assert.ok(!changeOnly.test(c.sure + c.title), c.id + ": correlation card uses period-change wording: " + c.sure); assert.match(c.sure, /ขึ้นลง|เกี่ยวกัน|บังเอิญ|ข้อมูลยังน้อย/); }
      if (c.kind === "diff") { assert.ok(!changeOnly.test(c.sure), c.id + ": A/B card uses period-change wording: " + c.sure); }
      if (c.kind === "change" && c.level !== "insufficient") assert.ok(/เปลี่ยน|ผันผวน|ระหว่าง/.test(c.sure), c.id + ": change wording " + c.sure);
      if (c.level === "strong" || c.level === "moderate") assert.ok(!/อาจเป็นแค่|ยังไม่เห็น/.test(c.sure), c.id + ": confident card hedges " + c.sure);
      if (c.level === "none" || c.level === "weak") assert.ok(!/น่าจะเปลี่ยนจริง|ต่างกันจริง|ขึ้นลงไปด้วยกันจริง/.test(c.sure), c.id + ": unsure card claims " + c.sure);
      assert.ok(!/บังเอิญไม่ถึง|โอกาสเป็นความบังเอิญ/.test(JSON.stringify(c)), c.id + ": p-value misread");
    }
    // the weekday caution is only shown when the weekday effect was NOT removed
    A.corr.forEach(c => { if (c.adjusted === "weekday+trend") assert.ok(!/ขึ้นกับวันในสัปดาห์เหมือนกัน/.test(c.caution), c.id + ": weekday caution after weekday removal"); });
  }
  for (const id of ["short", "alert", "quality", "store-change", "anomaly", "peak", "forecast", "conv", "corr", "ab-sg", "ab-neuro", "cohort", "booth", "qc", "dr", "goal"]) assert.ok(seen.has(id), "scenario set covers card type " + id + " (seen " + [...seen] + ")");
});

test("data reliability: coverage, missing days and a camera outage are detected and explained", () => {
  const sc = scenarios().at(-1), A = I.iqAnalyze(sc.D, sc.r, sc.opt), Q = A.quality;
  assert.equal(Q.sources.find(x => x.id === "store").coverage, 1);
  const o = Q.outages.find(x => x.day === I.iqAddDays("2026-11-06", -9));
  assert.ok(o && o.from === 13 && o.to === 20 && o.lost > 50, JSON.stringify(Q.outages));
  assert.equal(Q.outages.length, 1, "no false outages on normal days");
  const C = I.iqInsights(sc.D, A), q = C.find(c => c.id === "quality");
  assert.ok(q && /13:00–20:59/.test(q.body) && /ตรวจไฟ/.test(q.action), q && q.body);
  // demo: injected half-day outage is found
  const D = I.iqCollect(I.iqBuildDemo({}, NOW2, 7).set), Ad = I.iqAnalyze(D, I.iqRange("d30", NOW2, D), { now: NOW2 });
  assert.ok(Ad.quality.outages.some(x => x.kind === "store" && x.day === I.iqAddDays("2026-11-06", -26)), JSON.stringify(Ad.quality.outages));
});

test("conversion-drop alert uses day-level (quasi-binomial) test, not person-level z", () => {
  const snap = {};
  for (let d = 0; d <= 20; d++) {
    const day = I.iqAddDays("2026-11-06", -d), n = 200, h = Array(24).fill(0); h[12] = n;
    snap["st-day-" + day] = JSON.stringify({ date: day, in: n, out: n, peak: 5, maxQueue: 1, hourly: { in: h, out: h }, zones: {}, byCam: {} });
  }
  const sales = [];
  for (let d = 1; d <= 14; d++) { const day = I.iqAddDays("2026-11-06", -d), k = d <= 7 ? (d % 2 ? 10 : 22) : (d % 2 ? 26 : 14); for (let i = 0; i < k; i++) sales.push({ t: I.iqDayStart(day) + 12 * 3600000 + i * 1000, total: 50, qty: 1 }); }
  snap["co-sales"] = JSON.stringify(sales);
  const D = I.iqCollect(snap), A = I.iqAnalyze(D, I.iqRange("d7", NOW2, D), { now: NOW2, alerts: { convDropPct: 10 } });
  const a = A.alerts.find(x => x.id === "conv");
  assert.ok(a && a.test.method === "quasi-binomial", JSON.stringify(a));
  // person-level z would call 16 vs 20 bills/day on 200 people "clear"; with day-to-day swings 10↔22 it is not
  const t = ST.twoProp(112, 1400, 140, 1400);
  assert.ok(a.test.p > t.p, `daily p ${a.test.p} vs person-level ${t.p}`);
});

test("i18n: every generated text key has a Chinese entry; Thai stays the default without LQI18N", () => {
  const fs = require("node:fs"), path = require("node:path"), root = path.join(__dirname, "../..");
  const zh = require("../../i18n/zh-insights.js").zh;
  const src = ["insights-cards.js", "insights-ui.js", "insights-analysis.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  const keys = [...new Set([...src.matchAll(/\b(?:T|iqT)\("(iq\.[\w.]+)"/g)].map(m => m[1]))].filter(k => !k.endsWith("."));
  const missing = keys.filter(k => !(k in zh));
  assert.deepEqual(missing, [], "keys without zh");
  const html = fs.readFileSync(path.join(root, "insights.html"), "utf8");
  const hk = [...new Set([...html.matchAll(/data-i18n="(iq\.[\w.]+)"/g)].map(m => m[1]))];
  assert.deepEqual(hk.filter(k => !(k in zh)), [], "html keys without zh");
  for (const lv of ["strong", "moderate", "weak", "none", "insufficient"]) for (const kd of ["change", "corr", "diff"]) assert.ok(zh[`iq.conf.${kd}.${lv}`], `iq.conf.${kd}.${lv}`);
  // placeholders preserved in translation
  for (const k of keys) { const th = (src.match(new RegExp(`T\\("${k.replace(/\./g, "\\.")}", "([^"]*)"`)) || [])[1] || ""; const need = (th.match(/\{\w+\}/g) || []).sort().join(); const have = (zh[k].match(/\{\w+\}/g) || []).sort().join(); assert.equal([...new Set(have.split(","))].join(), [...new Set(need.split(","))].join(), k + " placeholders"); }
  // with a translator present the cards switch language
  globalThis.LQI18N = { tf: (k, th, v) => (zh[k] || th).replace(/\{(\w+)\}/g, (m, n) => (v && v[n] != null ? v[n] : m)) };
  try {
    const D = I.iqCollect(I.iqBuildDemo({}, NOW2, 7).set), A = I.iqAnalyze(D, I.iqRange("d30", NOW2, D), { now: NOW2 }), C = I.iqInsights(D, A);
    assert.ok(C.filter(c => /[一-鿿]/.test(c.title)).length >= C.length - 1, C.map(c => c.title).join(" | "));
  } finally { delete globalThis.LQI18N; }
});
