"use strict";
// tests/unit/crowd-report.test.js — crowd page reports: density per hour, entry/exit per 15 minutes with net occupancy,
// peak report, marketing tables, the count-quality label (lensiq-crowd.js); the offline accuracy tool tools/crowd-eval.mjs
// (error statistics, count-sheet parsing with two counters + adjudication, line windows, the page pipeline it reads);
// the accuracy docs (PRELIMINARY, AI reference, final pending a human count, no frames in the repo).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../../lensiq-crowd.js");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const evalTool = () => import(path.join(ROOT, "tools", "crowd-eval.mjs"));

test("heat per hour: 12x7 grid per hour created on demand, hours with data, repaired and rounded", () => {
  const d = C.newDay("2026-11-08");
  assert.deepEqual(d.heatH, {}); assert.deepEqual(C.heatHours(d), []);
  C.gridAdd(C.heatHour(d, 14), { x: 0.5, y: 0.5 }, 2.4); C.gridAdd(C.heatHour(d, 9), { x: 0.01, y: 0.99 }, 1); C.heatHour(d, 20);
  assert.equal(d.heatH["14"].d.length, C.HEAT_H.cols * C.HEAT_H.rows);
  assert.deepEqual(C.heatHours(d), [9, 14], "an empty hour grid is not listed");
  assert.equal(d.heatH["9"].d[6 * 12], 1, "bottom-left cell");
  const bad = C.ensureDay({ date: "x", heatH: { 14: { cols: 12, rows: 7, d: Array(84).fill(-1) }, 30: { d: Array(84).fill(1) }, x: 1, 8: { d: [1, 2] } } });
  assert.deepEqual(Object.keys(bad.heatH), ["14"]); assert.ok(bad.heatH["14"].d.every(v => v === 0));
  const c = C.compactDay(JSON.parse(JSON.stringify(d)));
  assert.equal(c.heatH["14"].d[3 * 12 + 6], 2, "whole person-seconds after compaction");
});

test("entry/exit per 15 minutes: slots, gaps filled, net, occupancy never below 0", () => {
  const d = C.newDay("x");
  for (const [m, dir] of [[600, "in"], [601, "in"], [614, "in"], [615, "out"], [660, "out"], [660, "out"], [660, "out"], [661, "in"], [2000, "in"], [5, "sideways"]]) C.addCross(d, m, dir);
  assert.deepEqual(d.q15, { 40: [3, 0], 41: [0, 1], 44: [1, 3] });
  const t = C.quarterTable(d);
  assert.deepEqual(t.map(r => [r.from, r.to, r.in, r.out, r.net, r.occ]), [
    ["10:00", "10:15", 3, 0, 3, 3], ["10:15", "10:30", 0, 1, -1, 2], ["10:30", "10:45", 0, 0, 0, 2], ["10:45", "11:00", 0, 0, 0, 2], ["11:00", "11:15", 1, 3, -2, 0]]);
  const e = C.newDay("x"); C.addCross(e, 1439, "out"); C.addCross(e, 1439, "in");
  assert.deepEqual(C.quarterTable(e).map(r => [r.from, r.to, r.occ]), [["23:45", "00:00", 0]]);
  assert.deepEqual(C.quarterTable(C.newDay("x")), []);
  assert.deepEqual(C.ensureDay({ date: "x", q15: { 40: ["2", -1], 99: [1, 1], 41: "bad" } }).q15, { 40: [0, 0] });
});

test("zone summary, hot-spot share, peak report, marketing tables", () => {
  const d = C.newDay("x"), z = { id: "z1", name: "Booth", role: "stop", area: 4 }, z2 = { id: "z2", name: "Hall", area: 0 };
  Object.assign(C.zoneStat(d, z), { visits: 10, dwellSum: 300000, dwellN: 10, peak: 12, occSum: 6 * 3600000, occMs: 3600000 });
  Object.assign(C.zoneStat(d, z2), { visits: 4, peak: 20, occSum: 3 * 3600000, occMs: 3600000 });
  const s = C.zoneSummary(d, z);
  assert.equal(s.avg, 6); assert.equal(s.dwellSec, 30); assert.equal(s.avgPerM2, 1.5); assert.equal(s.peakPerM2, 3); assert.equal(s.level, "crowded");
  assert.equal(C.zoneSummary(d, z2).avgPerM2, null, "no area -> no density");
  const G = C.newGrid(10, 1); G.d = [90, 5, 5, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(C.hotShare(G), 0.9); assert.equal(C.hotShare(C.newGrid(2, 2)), null);
  for (const [h, avg, pk, i, o, u] of [[10, 4, 7, 20, 12, 30], [11, 9, 14, 41, 25, 55], [12, 6, 10, 18, 30, 40], [13, 99, 99, 0, 0, 1]]) {
    d.hourly.occSum[h] = avg * (h === 13 ? 30000 : 3600000); d.hourly.occMs[h] = h === 13 ? 30000 : 3600000;
    d.hourly.peak[h] = pk; d.hourly.in[h] = i; d.hourly.out[h] = o; d.hourly.uniq[h] = u;
  }
  C.addCross(d, 11 * 60 + 5, "in"); C.addCross(d, 11 * 60 + 6, "in"); C.addCross(d, 12 * 60, "out");
  const rp = C.peakReport(d, [z, z2]);
  assert.deepEqual(rp.hours.map(p => p.h), [11, 12, 10], "hour 13 has < 1 minute of data");
  assert.deepEqual(rp.hours[0], { h: 11, avg: 9, peak: 14, in: 41, out: 25, uniq: 55 });
  assert.equal(rp.zone.id, "z1", "busiest zone by average occupancy");
  assert.equal(rp.quarter.from, "11:00"); assert.equal(rp.visitors, 126);
  const mt = C.marketingTables(d, [z, z2]);
  assert.deepEqual(mt.hourly.map(r => r.h), [10, 11, 12, 13]);
  assert.deepEqual(mt.hourly[1], { h: 11, avg: 9, peak: 14, uniq: 55, in: 41, out: 25, net: 16 });
  assert.equal(mt.quarters.length, 5); assert.equal(mt.zones.length, 2);
  assert.ok(!/data:image|"box"|"id":\d/.test(JSON.stringify(mt)), "numbers and zone names only");
});

test("count quality: estimate label at >= 15 people or >= 2 people/m2; small-people hint below 10 % of the frame height", () => {
  assert.deepEqual(C.QUALITY, { estimateAt: 15, smallH: 0.1, crowdedM2: 2, collapseShare: 0.5 });
  const q = (estimate, small, collapse = false) => ({ estimate, small, collapse });
  assert.deepEqual(C.countQuality({ count: 14, medH: 0.3 }), q(false, false));
  assert.deepEqual(C.countQuality({ count: 15, medH: 0.3 }), q(true, false));
  assert.deepEqual(C.countQuality({ count: 3, medH: 0.3, perM2: 2 }), q(true, false));
  assert.deepEqual(C.countQuality({ count: 3, medH: 0.06 }), q(false, true));
  assert.deepEqual(C.countQuality({ count: 1, medH: 0.06 }), q(false, false), "one person is not a pattern");
  assert.deepEqual(C.countQuality({}), q(false, false));
});

test("count quality: dense-crowd collapse needs the operator's expected crowd (measured: the count falls, it does not rise)", () => {
  // collapse: expected >= 15 and fewer than half of it seen
  assert.deepEqual(C.countQuality({ count: 2, expected: 300 }), { estimate: true, small: false, collapse: true });
  assert.deepEqual(C.countQuality({ count: 0, expected: 300 }).collapse, true, "0 counted in a crowd of 300");
  assert.equal(C.countQuality({ count: 9, expected: 20 }).collapse, true);
  assert.equal(C.countQuality({ count: 10, expected: 20 }).collapse, false, "half of the expected crowd is not a collapse");
  assert.equal(C.countQuality({ count: 0, expected: 14 }).collapse, false, "small expected crowds: an empty scene is normal");
  assert.equal(C.countQuality({ count: 0, expected: 0 }).collapse, false, "0 = setting off");
  assert.equal(C.countQuality({ count: 0, expected: "abc" }).collapse, false);
  // the stored measurements: ~300 people at Shibuya, the page counted 0-2 -> NO automatic label without the setting
  const app = JSON.parse(read("docs/crowd-count/app-counts.json"));
  for (const id of ["dense_shibuya", "dense_shibuya_timelapse"]) {
    const ss = app.clips[id].samples; assert.ok(ss.length >= 4, id);
    for (const s of ss) {
      assert.ok(s.shown <= 2, `${id} t${s.t}: the measured count collapses to 0-2`);
      assert.deepEqual(C.countQuality({ count: s.shown, medH: s.medH }), { estimate: false, small: false, collapse: false },
        `${id} t${s.t}: without the expected-crowd setting no label fires (documented limit)`);
      const w = C.countQuality({ count: s.shown, medH: s.medH, expected: 300 });
      assert.ok(w.estimate && w.collapse, `${id} t${s.t}: with "expected crowd 300" the label fires`);
    }
  }
  const html = read("crowd.html"), js = read("crowd.js");
  assert.match(html, /name="expectCrowd" type="number" min="0"/);
  assert.match(js, /expectCrowd: 0 \}/); assert.match(js, /expected: Number\(P\.settings\.expectCrowd\) \|\| 0/);
  for (const f of ["i18n/en-crowd.js", "i18n/zh-crowd.js"]) {
    const t = read(f);
    for (const k of ["cr.q.collapse", "cr.s.expect"]) assert.ok(t.includes(`"${k}"`), f + " " + k);
    assert.ok(!/shows the label|会显示"密度估计/.test(t), f + ": no claim that the label fires by itself for dense crowds");
  }
  assert.match(read("docs/CROWD-ACCURACY.md"), /does NOT appear on its own for a very dense crowd/);
});

test("crowd.js / crowd.html: hour heatmaps, peak report, 15-min table, marketing CSV, quality label, accuracy note", () => {
  const js = read("crowd.js"), html = read("crowd.html");
  for (const id of ["crAcc", "crQual", "heatHour", "heatHourLbl", "heatHours", "peakRep", "peakBody", "printPeak", "q15", "exportMkt"]) assert.ok(html.includes(`id="${id}"`), "#" + id);
  assert.match(js, /C\.addCross\(day, h \* 60 \+ d\.getMinutes\(\), c\.dir\)/);
  assert.match(js, /C\.gridAdd\(hg, a, dt \/ 1000\)/);
  assert.match(js, /ZC\.downloadCsv\(`lensiq-crowd-marketing-/, "marketing CSV goes through the BOM writer");
  assert.match(js, /C\.countQuality\(/);
  assert.match(html, /PRELIMINARY/); assert.match(html, /รอผลการนับโดยคน/); assert.match(html, /AI/);
  for (const f of ["crowd.js?v=2", "lensiq-crowd.js?v=2", "crowd.css?v=2", "i18n/zh-crowd.js?v=2"]) assert.ok(html.includes(f), "cache-busted " + f);
  assert.match(read("crowd.css"), /html\.cr-print-peak/);
});

// ---------------- tools/crowd-eval.mjs ----------------
test("crowd-eval: error statistics and tolerance bands", async () => {
  const E = await evalTool();
  const s = E.errorStats([{ app: 8, ref: 10 }, { app: 12, ref: 10 }, { app: 0, ref: 0 }, { app: 1, ref: NaN }], E.TOLERANCE.medium);
  assert.equal(s.n, 3); assert.equal(s.mae, 1.333); assert.equal(s.mape, 20); assert.equal(s.bias, 0); assert.equal(s.within, 0.333);
  assert.equal(E.errorStats([]).mae, null);
  assert.equal(E.TOLERANCE.sparse(3), 1); assert.equal(E.TOLERANCE.dense(100), 25); assert.equal(E.TOLERANCE.medium(2), 1);
  assert.deepEqual(E.sampleTimes(2, 13.07), [0, 2, 4, 6, 8, 10, 12]); assert.deepEqual(E.sampleTimes(5, 10), [0, 5]);
});

test("crowd-eval: CSV parsing, two counters + adjudication, inter-counter gap, line windows, final = human only", async () => {
  const E = await evalTool();
  const csv = "﻿" + E.SHEET_COLS.join(",") + "\r\n" + [
    "clipA,0,10,4,,,,,A,", "clipA,0,12,4,,,,,B,\"note, with comma\"", "clipA,2,20,8,,,,,A,", "clipA,2,30,8,,,,,B,", "clipA,2,24,8,,,,,C (adjudicated),",
    "clipA,,,,0,10,3,1,A,", "clipA,,,,0,10,5,1,B,", "clipA,4,,,,,,,A,blank row is skipped", "clipA,0,99,99,,,,,AI reviewer,"].join("\r\n");
  const rows = E.parseCsv(csv);
  assert.equal(rows.length, 9); assert.equal(rows[1].notes, "note, with comma"); assert.equal(rows[0].video, "clipA");
  const { frames, windows } = E.collectSheet(rows, { ai: false });
  const f0 = frames.get("clipA|0"), f2 = frames.get("clipA|2");
  assert.deepEqual(f0.frame, [10, 12]); assert.equal(E.refOf(f0, "frame"), 11);
  assert.deepEqual(f2.frame, [20, 30]); assert.equal(E.refOf(f2, "frame"), 24, "the adjudicated value settles the gap");
  assert.ok(!frames.has("clipA|4"));
  assert.deepEqual(E.counterGap([...frames.values()]), { n: 2, meanAbs: 6, over10pct: 1 });
  assert.equal(E.refOf(windows.get("clipA|0|10"), "in"), 4);
  assert.deepEqual(E.crossingsIn([{ t: 1, dir: "in" }, { t: 9.9, dir: "out" }, { t: 10, dir: "in" }], 0, 10), { in: 1, out: 1 });
  const app = { clips: { clipA: { samples: [{ t: 0, shown: 9, zone: 4 }, { t: 2, shown: 18, zone: 6 }], crossings: [{ t: 3, dir: "in" }, { t: 4, dir: "in" }, { t: 5, dir: "out" }] } } };
  const clips = [{ id: "clipA", crowd: "medium" }];
  const h = E.score(rows, app, clips, { ai: false }).clipA;
  assert.deepEqual(h.perFrame, [{ t: 0, app: 9, ref: 11 }, { t: 2, app: 18, ref: 24 }]);
  assert.equal(h.frame.bias, -4); assert.equal(h.zone.mae, 1);
  assert.deepEqual([h.line.refIn, h.line.refOut, h.line.appIn, h.line.appOut], [4, 1, 2, 1]);
  assert.deepEqual(h.counters.sort(), ["A", "B", "C (adjudicated)"]);
  const ai = E.score(rows, app, clips, { ai: true }).clipA;
  assert.deepEqual(ai.counters, ["AI reviewer"]); assert.equal(ai.frame.refMean, 99);
  assert.ok(E.isAI("AI reviewer pass 1") && !E.isAI("Aimee") && E.isAdj("AI reviewer (adjudicated)"));
});

test("crowd-eval: reads the page pipeline from the shared runtime (cannot drift from crowd.html)", async () => {
  const E = await evalTool();
  const p = E.pagePipeline();
  assert.deepEqual(p, { minScore: 0.4, hz: 5, detW: 416, max: 40, split: "auto", preset: "object", minHits: 2, smooth: 5 });
  const t = E.templateRows([{ id: "a", step: 2, kit: true, line: {} }, { id: "b", step: 1, kit: false }], { a: 13.07 });
  assert.deepEqual(t[0], E.SHEET_COLS);
  assert.equal(t.filter(r => r[8] === "A").length, 7 + 2); assert.equal(t.filter(r => r[8] === "B").length, 9);
  assert.ok(!t.some(r => r[0] === "b"), "only kit clips");
  assert.match(read("tools/crowd-eval.mjs"), /--out must be outside the repo/);
});

test("crowd accuracy docs + data: clips with licences, line direction matches swap, counts only, final pending human count", () => {
  const clips = JSON.parse(read("docs/crowd-count/clips.json")).clips;
  assert.ok(clips.length >= 3);
  for (const c of clips) {
    assert.ok(c.title && c.licence && /^https:\/\/commons\.wikimedia\.org\//.test(c.url) && !/NC|ND/.test(c.licence), c.id);
    assert.ok(Array.isArray(c.zone) && c.zone.length >= 3, c.id + " zone");
    if (c.line) { // the point described as the "in" side must be on the side the counter calls "in"
      const side = C.lineSide(c.line, c.inPoint);
      assert.equal((side === 1) !== !!c.line.swap, true, c.id + " inPoint / swap");
    }
  }
  assert.deepEqual(clips.filter(c => c.kit).map(c => c.crowd).sort(), ["medium", "sparse"]);
  const sheet = read("docs/crowd-count/count-sheet.csv");
  assert.ok(sheet.startsWith("﻿video,frame_time_s,people_in_frame,people_in_zone,window_start_s,window_end_s,crossings_in,crossings_out,counter_name,notes"));
  assert.ok(/,A,/.test(sheet) && /,B,/.test(sheet), "two counters");
  const app = JSON.parse(read("docs/crowd-count/app-counts.json"));
  assert.ok(app.clips.sparse_roncesvalles && app.clips.medium_yonge_dundas && app.clips.dense_shibuya, "sparse, medium and dense measured");
  assert.ok(!/data:image|base64/.test(read("docs/crowd-count/app-counts.json")), "numbers only");
  const doc = read("docs/CROWD-ACCURACY.md");
  for (const re of [/PRELIMINARY/, /pending human count/i, /AI reviewer/, /MAE/, /MAPE/, /CC BY-SA 4\.0/, /CC0/, /CC BY 2\.0/, /ภาษาไทย|ขั้นตอน/]) assert.match(doc, re);
  // no image or video files under docs/crowd-count (frames of people are never committed)
  for (const f of fs.readdirSync(path.join(ROOT, "docs", "crowd-count"))) assert.ok(!/\.(jpe?g|png|webp|gif|mp4|webm|ogv)$/i.test(f), f);
});

test("crowd-eval: variantKey gives every experiment its own key (never the shipped row)", async () => {
  const E = await evalTool(), k = E.variantKey;
  assert.equal(k(), "", "shipped");
  assert.equal(k({ model: "coco" }), "coco");
  assert.equal(k({ tiles: "3x2" }), "tiles3x2", "round 15 key unchanged");
  assert.equal(k({ tiles: "2x1" }), "tiles2x1");
  assert.equal(k({ tiles: "4x3" }), "tiles4x3");
  assert.equal(k({ tiles: "3x2", overlap: 0.3 }), "tiles3x2-o0.3");
  assert.equal(k({ tiles: "3x2", iou: 0.4 }), "tiles3x2-iou0.4");
  assert.equal(k({ tiles: "3x2", iou: 0.6 }), "tiles3x2-iou0.6");
  assert.equal(k({ tiles: "3x2", iou: 0.5 }), "tiles3x2", "default IoU adds nothing");
  assert.equal(k({ split: "none" }), "full");
  assert.equal(k({ size: 640, modelFile: true }), "r640");
  assert.equal(k({ size: 640, modelFile: true, split: "none" }), "r640-full");
  assert.equal(k({ size: 832, modelFile: true }), "r832");
  assert.equal(k({ size: 640, modelFile: true, tiles: "2x1" }), "r640-tiles2x1");
  // the two collisions the round 16 review found
  assert.equal(k({ size: 416, modelFile: true }), "m416", "a custom ONNX at 416 is not the shipped model");
  assert.equal(k({ max: 300, maxDefault: 40 }), "max300", "a custom cap is not the shipped pipeline");
  assert.equal(k({ max: 40, maxDefault: 40 }), "", "the page's own cap is the shipped pipeline");
  assert.equal(k({ tiles: "4x3", max: 300, maxDefault: 300 }), "tiles4x3", "the experiment default cap adds nothing");
  assert.equal(k({ tiles: "4x3", max: 500, maxDefault: 300 }), "tiles4x3-max500");
  assert.deepEqual(E.ACCEPTED_IN_APP_FILE, ["coco", "tiles3x2"]);
  assert.match(read("tools/crowd-eval.mjs"), /is an experiment: pass --out/);
});

test("crowd-eval: timingStats median / p90 / mean on odd and even lengths", async () => {
  const E = await evalTool();
  assert.deepEqual(E.timingStats([3, 1, 2]), { n: 3, median: 2, p90: 3, mean: 2 });
  assert.deepEqual(E.timingStats([4, 1, 3, 2]), { n: 4, median: 2.5, p90: 4, mean: 2.5 });
  const ten = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.deepEqual(E.timingStats(ten), { n: 10, median: 55, p90: 90, mean: 55 });
  assert.deepEqual(E.timingStats([1.04, NaN, 1.06]), { n: 2, median: 1.1, p90: 1.1, mean: 1.1 }, "drops non-numbers, rounds to 0.1");
  assert.deepEqual(E.timingStats([]), { n: 0, median: null, p90: null, mean: null });
});

test("crowd-eval: compareVariants reports the change against shipped", async () => {
  const E = await evalTool();
  const rows = E.parseCsv(E.SHEET_COLS.join(",") + "\n" + ["clipA,0,10,4,,,,,AI reviewer,", "clipA,2,20,8,,,,,AI reviewer,"].join("\n"));
  const clips = [{ id: "clipA", crowd: "medium" }];
  const app = { clips: {
    clipA: { samples: [{ t: 0, shown: 5, zone: 4 }, { t: 2, shown: 10, zone: 8 }], crossings: [] },
    "clipA@r640": { samples: [{ t: 0, shown: 8, zone: 4 }, { t: 2, shown: 18, zone: 6, capped: true }], crossings: [] } } };
  const res = E.compareVariants(rows, app, clips, ["shipped", "r640"]);
  assert.equal(res.length, 2);
  const [s, r] = res;
  assert.equal(s.variant, "shipped"); assert.equal(s.frame.mape, 50); assert.equal(s.dFrameMape, 0); assert.equal(s.capped, 0);
  assert.equal(r.variant, "r640"); assert.equal(r.frame.mape, 15); assert.equal(r.dFrameMape, -35);
  assert.equal(r.frame.bias, -2); assert.equal(r.dFrameBias, 5.5); assert.equal(r.zone.bias, -1); assert.equal(r.capped, 1);
});
