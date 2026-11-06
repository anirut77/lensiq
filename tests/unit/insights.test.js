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
