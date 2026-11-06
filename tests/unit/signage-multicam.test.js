"use strict";
// signage.js: camera role routing (audience / kiosk / shared), dayparts, per-ad audience report, proof-of-play log.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../signage.js");

test("routeCams: one camera always carries both roles (shared), whatever its saved role", () => {
  assert.deepEqual(S.routeCams([]), { audience: null, kiosk: null, shared: true });
  for (const role of ["both", "audience", "kiosk", ""]) assert.deepEqual(S.routeCams([{ slot: "c1", role }]), { audience: "c1", kiosk: "c1", shared: true });
});

test("routeCams: two cameras split by role; 'both' fills the missing role; never the same camera twice", () => {
  assert.deepEqual(S.routeCams([{ slot: "c1", role: "audience" }, { slot: "c2", role: "kiosk" }]), { audience: "c1", kiosk: "c2", shared: false });
  assert.deepEqual(S.routeCams([{ slot: "c1", role: "kiosk" }, { slot: "c2", role: "audience" }]), { audience: "c2", kiosk: "c1", shared: false });
  assert.deepEqual(S.routeCams([{ slot: "c1", role: "both" }, { slot: "c2", role: "kiosk" }]), { audience: "c1", kiosk: "c2", shared: false });
  assert.deepEqual(S.routeCams([{ slot: "c1", role: "kiosk" }, { slot: "c2", role: "both" }]), { audience: "c2", kiosk: "c1", shared: false });
  assert.deepEqual(S.routeCams([{ slot: "c1", role: "both" }, { slot: "c2", role: "both" }]), { audience: "c1", kiosk: "c2", shared: false });
  assert.deepEqual(S.routeCams([{ slot: "c1", role: "kiosk" }, { slot: "c2", role: "kiosk" }]), { audience: "c1", kiosk: "c2", shared: false });
  assert.deepEqual(S.routeCams([{ slot: "c1", role: "audience" }, { slot: "c2", role: "audience" }]), { audience: "c1", kiosk: "c2", shared: false });
  // a camera in error is filtered by the page before routing: the survivor gets both roles
  assert.deepEqual(S.routeCams([{ slot: "c2", role: "kiosk" }]), { audience: "c2", kiosk: "c2", shared: true });
});

test("dayparts: hour -> daypart (night wraps past midnight); ads without dayparts play all day", () => {
  assert.deepEqual([0, 5, 6, 10, 11, 13, 14, 16, 17, 20, 21, 23].map(S.daypartOf),
    ["night", "night", "morning", "morning", "midday", "midday", "afternoon", "afternoon", "evening", "evening", "night", "night"]);
  assert.equal(S.inDaypart({}, 3), true);
  assert.equal(S.inDaypart({ dayparts: [] }, 3), true);
  assert.equal(S.inDaypart({ dayparts: ["morning"] }, 8), true);
  assert.equal(S.inDaypart({ dayparts: ["morning"] }, 12), false);
  assert.deepEqual(S.cleanDayparts(["morning", "x", "morning", 3]), ["morning"]);
});

test("selectAd honours dayparts when an hour is given (and ignores them when not, for old callers)", () => {
  const ads = [{ id: "am", dayparts: ["morning"], ages: [] }, { id: "pm", dayparts: ["evening"], ages: [] }, { id: "all", ages: [] }];
  const at = h => { const seen = new Set(); let last = null; for (let i = 0; i < 6; i++) { const r = S.selectAd(ads, null, { lastId: last, hour: h }); seen.add(r.ad.id); last = r.ad.id; } return [...seen].sort().join(); };
  assert.equal(at(8), "all,am");
  assert.equal(at(18), "all,pm");
  assert.equal(at(12), "all");
  assert.equal(S.selectAd([{ id: "am", dayparts: ["morning"] }], null, { hour: 12 }), null);
  assert.equal(S.selectAd([{ id: "am", dayparts: ["morning"] }], null, {}).ad.id, "am");
});

const face = (x, extra = {}) => ({ box: { x, y: 0.3, width: 0.12, height: 0.16 }, look: true, happy: false, ...extra });
test("per-ad report: OTS, avg attention, gaze rate, valence and estimated age/gender distribution", () => {
  const T = S.newTracker(), st = S.newStats(0), play = S.newPlay("ad1");
  let now = 0;
  for (let i = 0; i < 6; i++) {
    now += 200;
    const r = S.updateTracks(T, [face(0.2, { age: 25, male: 0.9, val: 0.6 }), face(0.7, { look: i < 2, age: 45, male: 0.1, val: -0.2 })], now);
    S.recordFrame(st, play, r.present, 0.2);
  }
  S.finishPlay(st, play, true);
  S.finishPlay(st, play, true); // idempotent
  const [row] = S.adRows(st, [{ id: "ad1", title: "A" }]);
  assert.equal(row.ots, 2);
  assert.equal(row.viewers, 1, "second person never looked while counted (look only in frames 1-2, MIN_FRAMES 3)");
  assert.equal(row.viewRate, 50);
  assert.ok(Math.abs(row.valence - 0.6) < 1e-9, "valence " + row.valence);
  assert.deepEqual(row.demo, { "18_34_male": 1, "35_54_female": 1 });
  assert.ok(row.avgAttn > 0.7 && row.avgAttn < 0.9, "avg attention " + row.avgAttn);
  const csv = S.buildAdReportCsv(st, [{ id: "ad1", title: "A" }]);
  const lines = csv.replace(/^﻿/, "").split("\r\n");
  const head = lines[0].split(",").map(x => x.replace(/"/g, ""));
  assert.ok(head.includes("gaze_rate_pct") && head.includes("avg_valence") && head.includes("est_18_34_male"));
  const cells = lines[1].split(",").map(x => x.replace(/"/g, ""));
  assert.equal(cells[head.indexOf("ots")], "2");
  assert.equal(cells[head.indexOf("gaze_rate_pct")], "50.0");
  assert.equal(cells[head.indexOf("est_35_54_female")], "1");
  // demographics off: nothing attributed
  const st2 = S.newStats(0), p2 = S.newPlay("x");
  S.recordFrame(st2, p2, T.tracks, 0.2); S.finishPlay(st2, p2, false);
  assert.deepEqual(st2.ads.x.demo, {});
});

test("legacy sg-stats ad rows (no valSum/demo) still report and get the new fields on update", () => {
  const st = { v: 1, ads: { old: { title: "เดิม", plays: 3, ots: 5, viewers: 2, attn: 6, look: 4, happy: 1 } } };
  const [row] = S.adRows(st, []);
  assert.equal(row.valence, null); assert.deepEqual(row.demo, {});
  const a = S.adStat(st, "old");
  assert.equal(a.valSum, 0); assert.deepEqual(a.demo, {}); assert.equal(a.ots, 5);
  assert.ok(S.buildCsv({ ...S.newStats(0), ads: st.ads }, []).includes("เดิม"));
});

test("proof-of-play: entry per finished play, capped, parse tolerant, CSV", () => {
  const play = S.newPlay("ad1"); play.seen.add("T1"); play.seen.add("T2"); play.looked.add("T1");
  const at = new Date(2026, 10, 6, 9, 0, 0).getTime();
  const e = S.popEntry({ ad: { id: "ad1", title: "Latte" }, reason: "target", at }, play, at + 8040, true);
  assert.deepEqual(e, { t: at, ad: "ad1", title: "Latte", s: 8, why: "target", dp: "morning", ots: 2, v: 1, m: 1 });
  let P = S.parsePop(null);
  assert.deepEqual(P, { v: 1, log: [] });
  for (let i = 0; i < 12; i++) S.pushPop(P, { ...e, t: at + i }, 10);
  assert.equal(P.log.length, 10); assert.equal(P.log[0].t, at + 2);
  P = S.parsePop(JSON.stringify({ v: 1, log: [e, null, { t: "x" }, { t: 1, ad: 5 }] }));
  assert.equal(P.log.length, 1);
  assert.deepEqual(S.parsePop("{bad"), { v: 1, log: [] });
  const csv = S.buildPopCsv(P);
  assert.ok(csv.startsWith("﻿") && csv.includes('"ad1"') && csv.includes('"morning"'));
  // a full log stays far below the 200 KB privacy-scan limit
  const full = S.parsePop(null); for (let i = 0; i < S.POP_MAX + 5; i++) S.pushPop(full, { ...e, title: "x".repeat(40) });
  assert.equal(full.log.length, S.POP_MAX);
  assert.ok(JSON.stringify(full).length < 200 * 1024);
});
