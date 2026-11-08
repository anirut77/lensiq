"use strict";
// tests/unit/zones.test.js — lensiq-zones.js (LQZones): the pure zone / timer / rule maths behind queue.html, tables.html,
// afterhours.html and bays.html — point-in-polygon, coverage, line crossing, hysteresis, cooldown, dwell, smoothing,
// threshold alerts, queue wait, the table state machine, schedules (overnight), alert precision, COCO class maps;
// plus static checks of the four pages (privacy wording, human-in-the-loop wording, test seam, i18n coverage).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Z = require("../../lensiq-zones.js");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const SQ = [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.6, y: 0.6 }, { x: 0.2, y: 0.6 }];
const TRI = [{ x: 0.5, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const L = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.4 }, { x: 0.4, y: 0.4 }, { x: 0.4, y: 0.9 }, { x: 0.1, y: 0.9 }]; // concave "L"

test("pointInPolygon: square, triangle, concave L, degenerate input", () => {
  assert.equal(Z.pointInPolygon({ x: 0.4, y: 0.4 }, SQ), true);
  assert.equal(Z.pointInPolygon({ x: 0.1, y: 0.4 }, SQ), false);
  assert.equal(Z.pointInPolygon({ x: 0.7, y: 0.4 }, SQ), false);
  assert.equal(Z.pointInPolygon({ x: 0.5, y: 0.5 }, TRI), true);
  assert.equal(Z.pointInPolygon({ x: 0.15, y: 0.2 }, TRI), false);
  assert.equal(Z.pointInPolygon({ x: 0.2, y: 0.7 }, L), true);
  assert.equal(Z.pointInPolygon({ x: 0.7, y: 0.7 }, L), false, "the notch of the L is outside");
  assert.equal(Z.pointInPolygon({ x: 0.5, y: 0.5 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }]), false);
  assert.equal(Z.pointInPolygon(null, SQ), false);
  // brute force against a pixel-grid rasterisation of the L (inside = the two rectangles)
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
    const p = { x: (i + 0.5) / 40, y: (j + 0.5) / 40 };
    const want = (p.x > 0.1 && p.x < 0.9 && p.y > 0.1 && p.y < 0.4) || (p.x > 0.1 && p.x < 0.4 && p.y > 0.1 && p.y < 0.9);
    assert.equal(Z.pointInPolygon(p, L), want, JSON.stringify(p));
  }
});

test("polyArea / polyCentroid / rectPoly / anchor / boxInZone", () => {
  assert.ok(Math.abs(Z.polyArea(SQ) - 0.16) < 1e-12);
  assert.ok(Math.abs(Z.polyArea(SQ.slice().reverse()) - 0.16) < 1e-12, "orientation independent");
  assert.ok(Math.abs(Z.polyArea(L) - (0.8 * 0.3 + 0.3 * 0.5)) < 1e-12);
  const c = Z.polyCentroid(SQ); assert.ok(Math.abs(c.x - 0.4) < 1e-12 && Math.abs(c.y - 0.4) < 1e-12);
  assert.deepEqual(Z.polyCentroid([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]), { x: 1, y: 0 }, "degenerate -> vertex mean");
  assert.deepEqual(Z.rectPoly({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }).map(p => [+p.x.toFixed(3), +p.y.toFixed(3)]), [[0.1, 0.2], [0.4, 0.2], [0.4, 0.6], [0.1, 0.6]]);
  const box = { x: 0.3, y: 0.1, w: 0.1, h: 0.4 }; // centre (0.35,0.3) inside, foot (0.35,0.5) inside
  assert.deepEqual(Z.anchor(box), { x: 0.35, y: 0.5 });
  assert.deepEqual(Z.anchor(box, "center"), { x: 0.35, y: 0.30000000000000004 });
  const tall = { x: 0.3, y: 0.1, w: 0.1, h: 0.8 }; // foot at 0.9 -> outside SQ, centre at 0.5 -> inside
  assert.equal(Z.boxInZone(tall, SQ, "foot"), false);
  assert.equal(Z.boxInZone(tall, SQ, "center"), true);
  assert.deepEqual(Z.anchor({ x: 0, y: 0.5, w: 0.2, h: 0.9 }), { x: 0.1, y: 1 }, "foot clamped to the frame");
});

test("coverage: share of the zone inside a box", () => {
  assert.equal(Z.coverage({ x: 0, y: 0, w: 1, h: 1 }, SQ), 1);
  assert.equal(Z.coverage({ x: 0.7, y: 0.7, w: 0.2, h: 0.2 }, SQ), 0);
  const half = Z.coverage({ x: 0.2, y: 0.2, w: 0.2, h: 0.4 }, SQ, 20);
  assert.ok(Math.abs(half - 0.5) < 0.06, "half " + half);
  assert.equal(Z.coverage(null, SQ), 0);
});

test("normPoly: clamps, drops garbage, needs 3 points, caps the length", () => {
  assert.equal(Z.normPoly("x"), null);
  assert.equal(Z.normPoly([{ x: 0, y: 0 }, { x: 1, y: 1 }]), null);
  assert.deepEqual(Z.normPoly([{ x: -1, y: 0.5 }, { x: 2, y: "0.25" }, null, { x: "a", y: 1 }, { x: 0.5, y: 0.9 }]), [{ x: 0, y: 0.5 }, { x: 1, y: 0.25 }, { x: 0.5, y: 0.9 }]);
  assert.equal(Z.normPoly(Array.from({ length: 50 }, (_, i) => ({ x: i / 50, y: (i % 2) / 2 }))).length, 24);
  assert.deepEqual(Z.normPoly([{ x: 1 / 3, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]), [{ x: 0.3333, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], "rounded to 4 decimals");
});

test("segCross: direction, misses beyond the segment, touching is no crossing", () => {
  const a = { x: 0.5, y: 0 }, b = { x: 0.5, y: 1 };
  const lr = Z.segCross({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }, a, b), rl = Z.segCross({ x: 0.6, y: 0.5 }, { x: 0.4, y: 0.5 }, a, b);
  assert.ok(lr !== 0 && rl === -lr, `${lr} / ${rl}`);
  assert.equal(Z.segCross({ x: 0.4, y: 0.5 }, { x: 0.45, y: 0.5 }, a, b), 0);
  const a2 = { x: 0.5, y: 0 }, b2 = { x: 0.5, y: 0.4 };
  assert.equal(Z.segCross({ x: 0.4, y: 0.8 }, { x: 0.6, y: 0.8 }, a2, b2), 0, "passes below the segment end");
  assert.equal(Z.segCross({ x: 0.4, y: 0.5 }, { x: 0.5, y: 0.5 }, a, b), 0, "ends on the line");
});

test("createHysteresis: on after onMs present, off after offMs absent, short gaps do not flicker", () => {
  const H = Z.createHysteresis({ onMs: 1000, offMs: 3000 });
  assert.deepEqual(H.update("a", true, 0), { on: false, changed: false, since: 0 });
  assert.equal(H.update("a", true, 900).on, false);
  const r = H.update("a", true, 1000); assert.ok(r.on && r.changed);
  assert.equal(H.update("a", false, 1500).on, true);
  assert.equal(H.update("a", true, 2000).on, true, "a 500 ms gap resets the absence timer");
  assert.equal(H.update("a", false, 2100).on, true);
  assert.equal(H.update("a", false, 5000).on, true, "2900 ms < offMs");
  const off = H.update("a", false, 5100); assert.ok(!off.on && off.changed && off.since === 5100);
  // presence that keeps flickering never turns on
  const F = Z.createHysteresis({ onMs: 1000, offMs: 1000 });
  for (let t = 0; t < 5000; t += 100) assert.equal(F.update("f", (t / 100) % 2 === 0, t).on, false);
  assert.ok(H.state("a") && H.keys().includes("a"));
  H.reset("a"); assert.equal(H.state("a"), null);
});

test("createCooldown: one fire per key per window, keys independent", () => {
  const C = Z.createCooldown(60000);
  assert.equal(C.fire("z1", 0), true);
  assert.equal(C.fire("z1", 59999), false);
  assert.equal(C.ready("z1", 60000), true);
  assert.equal(C.fire("z2", 10), true, "other key");
  assert.equal(C.fire("z1", 60000), true);
  C.reset(); assert.equal(C.fire("z1", 60001), true);
});

test("createDwell: entry time per anonymous id, visits end after graceMs", () => {
  const D = Z.createDwell({ graceMs: 1000 });
  D.update("q", [1, 2], 0);
  let r = D.update("q", [1, 2], 5000);
  assert.deepEqual(r.active.map(a => [a.id, a.ms]), [[1, 5000], [2, 5000]]);
  r = D.update("q", [1, 3], 5500); // 2 missing for 500 ms: still active
  assert.equal(r.ended.length, 0);
  r = D.update("q", [1, 3], 6100); // 2 last seen at 5000 -> ended with 5000 ms
  assert.deepEqual(r.ended, [{ id: 2, ms: 5000 }]);
  assert.deepEqual(r.active.map(a => a.id), [1, 3], "longest first");
  assert.deepEqual(D.update("other", [], 0), { active: [], ended: [] });
  D.reset(); assert.deepEqual(D.active("q", 7000), []);
});

test("createSmoother / median", () => {
  assert.equal(Z.median([]), 0);
  assert.equal(Z.median([3, 1, 2]), 2);
  assert.equal(Z.median([4, 1, 3, 2]), 2.5);
  assert.equal(Z.median([1, NaN, 3]), 2);
  const S = Z.createSmoother(3);
  assert.deepEqual([5, 0, 5, 5, 9, 5].map(v => S.push(v)), [5, 2.5, 5, 5, 5, 5], "one-frame dropouts and spikes are ignored");
  S.reset(); assert.equal(S.value(), 0);
});

test("createThresholdAlert: hold, clear, cooldown between raises (debounce)", () => {
  const A = Z.createThresholdAlert({ holdMs: 20000, clearMs: 30000, cooldownMs: 300000 });
  const ev = [];
  const run = (from, to, over) => { for (let t = from; t <= to; t += 1000) { const e = A.update("q1", over, t); if (e) ev.push([e, t]); } };
  run(0, 10000, true); run(11000, 15000, false); // 10 s over then a dip: no alert
  assert.deepEqual(ev, []);
  run(16000, 40000, true); // over 20 s from 16000 -> raise at 36000
  assert.deepEqual(ev, [["raise", 36000]]);
  assert.equal(A.isOn("q1"), true);
  run(41000, 80000, false); // under 30 s from 41000 -> clear at 71000
  assert.deepEqual(ev.slice(1), [["clear", 71000]]);
  run(81000, 120000, true); // would raise at 101000 but the 5-min cooldown from 36000 holds
  assert.equal(ev.length, 2, JSON.stringify(ev));
  run(121000, 200000, false);
  run(201000, 400000, true);
  assert.deepEqual(ev.slice(2), [["raise", 336000]], "raises once the cooldown (36000 + 300000) ends while still over");
});

test("queueWait: estimate, measured median (>= 3 waits), larger of the two", () => {
  assert.deepEqual(Z.queueWait({ count: 6, serviceSec: 60, counters: 2 }), { estSec: 180, measuredSec: null, sec: 180 });
  assert.equal(Z.queueWait({ count: 2, serviceSec: 60, counters: 1, recentWaits: [300, 400] }).measuredSec, null, "2 waits are not enough");
  const r = Z.queueWait({ count: 2, serviceSec: 60, counters: 1, recentWaits: [300, 400, 500, NaN, -1] });
  assert.equal(r.measuredSec, 400); assert.equal(r.sec, 400);
  assert.equal(Z.queueWait({ count: 5, serviceSec: 30, counters: 0 }).estSec, 150, "0 counters treated as 1");
  assert.equal(Z.queueWait({}).sec, 0);
});

test("tableStep: free -> occupied -> clearing -> free; short visits need no clearing; auto-clear", () => {
  const cfg = { seatMs: 60000, leaveMs: 90000, minSeatMs: 120000, autoClearMs: 0 };
  let t = Z.newTable(0), ev = [];
  const step = (now, n) => { const r = Z.tableStep(t, n, now, cfg); t = r.tbl; if (r.event) ev.push([r.event, now]); };
  step(0, 2); step(30000, 2); step(45000, 0); step(50000, 2); // a 5 s gap before seating restarts the seat timer
  assert.equal(t.state, "free");
  step(109000, 2); assert.equal(t.state, "free");
  step(110000, 2); assert.deepEqual(ev, [["seated", 110000]]); assert.equal(t.seatedAt, 50000);
  step(600000, 3); step(1200000, 0); step(1250000, 1); // someone comes back within leaveMs: still seated
  assert.equal(t.state, "occupied");
  step(1300000, 0); step(1389999, 0); assert.equal(t.state, "occupied");
  step(1390000, 0); // empty 90 s from 1300000
  assert.deepEqual(ev[1], ["left", 1390000]);
  assert.equal(t.state, "clearing"); assert.equal(t.turns, 1); assert.equal(t.seatMsSum, 1300000 - 50000);
  step(5000000, 0); assert.equal(t.state, "clearing", "waits for staff when autoClearMs = 0");
  t = Z.clearTable(t, 5000001).tbl; assert.equal(t.state, "free");
  // short visit (< minSeatMs) -> straight back to free
  let u = Z.newTable(0);
  for (const [now, n] of [[0, 1], [60000, 1], [100000, 0], [190000, 0]]) u = Z.tableStep(u, n, now, cfg).tbl;
  assert.equal(u.state, "free"); assert.equal(u.turns, 1);
  // auto clear + a new party seating a table nobody cleared
  let w = Z.newTable(0); const ac = { ...cfg, autoClearMs: 60000 }, evs = [];
  for (const [now, n] of [[0, 2], [60000, 2], [500000, 0], [590000, 0], [649999, 0], [650000, 0]]) { const r = Z.tableStep(w, n, now, ac); w = r.tbl; if (r.event) evs.push(r.event); }
  assert.deepEqual(evs, ["seated", "left", "cleared"]);
  let x = Z.newTable(0);
  for (const [now, n] of [[0, 2], [60000, 2], [500000, 0], [590000, 0], [600000, 2], [660000, 2]]) x = Z.tableStep(x, n, now, cfg).tbl;
  assert.equal(x.state, "occupied"); assert.equal(x.turns, 1);
});

test("parseHM / inSchedule: day windows, overnight windows on their start days, 24 h days", () => {
  assert.equal(Z.parseHM("22:30"), 1350); assert.equal(Z.parseHM("7:05"), 425); assert.equal(Z.parseHM("24:00"), 1440);
  for (const bad of ["25:00", "12:60", "x", "", null, "24:01"]) assert.equal(Z.parseHM(bad), null, String(bad));
  const night = [{ days: [1, 2, 3, 4, 5], from: "22:00", to: "06:00" }]; // Mon–Fri nights
  const at = (day, hm) => Z.inSchedule({ day, min: Z.parseHM(hm) }, night);
  assert.equal(at(1, "22:00"), true, "Monday 22:00");
  assert.equal(at(1, "21:59"), false);
  assert.equal(at(2, "05:59"), true, "Tuesday early morning belongs to Monday night");
  assert.equal(at(2, "06:00"), false);
  assert.equal(at(6, "02:00"), true, "Saturday 02:00 = Friday night");
  assert.equal(at(0, "02:00"), false, "Sunday 02:00 = Saturday night (not listed)");
  assert.equal(at(1, "03:00"), false, "Monday 03:00 = Sunday night (not listed)");
  const day = [{ from: "09:00", to: "17:00" }];
  assert.equal(Z.inSchedule({ day: 0, min: 600 }, day), true, "no days = every day");
  assert.equal(Z.inSchedule({ day: 0, min: 1020 }, day), false, "end is exclusive");
  assert.equal(Z.inSchedule({ day: 3, min: 5 }, [{ days: [3], from: "00:00", to: "00:00" }]), true, "from == to = all day");
  assert.equal(Z.inSchedule({ day: 3, min: 5 }, [{ from: "bad", to: "06:00" }]), false);
  assert.equal(Z.inSchedule(null, night), false);
});

test("precision: Wilson interval for staff-checked alerts", () => {
  assert.deepEqual(Z.precision({}), { n: 0, p: null, lo: 0, hi: 1 });
  const r = Z.precision({ tp: 18, fp: 2 });
  assert.equal(r.n, 20); assert.equal(r.p, 0.9);
  assert.ok(Math.abs(r.lo - 0.699) < 0.002 && Math.abs(r.hi - 0.972) < 0.002, JSON.stringify(r));
  const all = Z.precision({ tp: 5, fp: 0 }); assert.equal(all.hi, 1); assert.ok(all.lo > 0.5 && all.lo < 0.6);
});

test("COCO class maps: YOLOX 80 contiguous, COCO-SSD = original id - 1, labelOf round trip", () => {
  assert.equal(Z.COCO80.length, 80); assert.equal(Z.COCO_IDS.length, 80);
  assert.equal(new Set(Z.COCO_IDS).size, 80);
  const want = { person: [0, 0], car: [2, 2], motorcycle: [3, 3], bus: [5, 5], truck: [7, 7], "dining table": [60, 66], "cell phone": [67, 76], book: [73, 83], laptop: [63, 72], chair: [56, 61] };
  for (const [n, [y, c]] of Object.entries(want)) { assert.equal(Z.cocoIndex(n, "yolox"), y, n); assert.equal(Z.cocoIndex(n, "coco"), c, n); }
  assert.equal(Z.cocoIndex("unicorn"), -1);
  for (const n of Z.COCO80) {
    assert.equal(Z.labelOf({ cls: Z.cocoIndex(n, "yolox") }, "yolox"), n);
    assert.equal(Z.labelOf({ cls: Z.cocoIndex(n, "coco") }, "coco"), n);
  }
  assert.equal(Z.labelOf({ x: 0 }), "person", "scripted test box without cls");
  assert.equal(Z.labelOf({ label: "car", cls: 0 }), "car");
  assert.equal(Z.labelOf({ cls: 11 }, "coco"), null, "COCO id 12 is unused");
  // the COCO-SSD decoder in lensiq-detect.js takes these indices as score-tensor columns
  const D = require("../../lensiq-detect.js");
  const N = 1, C = 90, scores = new Float32Array(N * C); scores[Z.cocoIndex("car", "coco")] = 0.9;
  const dets = D.decodeCoco(new Float32Array([0.1, 0.1, 0.5, 0.5]), scores, N, C, { classes: [0, Z.cocoIndex("car", "coco")] });
  assert.equal(Z.labelOf(dets[0], "coco"), "car");
});

// ---------------- the four pages ----------------
const PAGES = ["queue", "tables", "afterhours", "bays"];
test("zone pages: shared runtime, test seam, CSP meta, no inline script, notice gate", () => {
  for (const p of PAGES) {
    const html = read(p + ".html");
    for (const s of ["lensiq-camera.js", "lensiq-detect.js", "lensiq-track.js", "lensiq-zones.js", "lensiq-zonecam.js", p + ".js", "nav.js", "i18n/zh-zones.js"])
      assert.ok(html.includes(`src="${s}`), `${p}.html loads ${s}`);
    assert.match(html, /<meta http-equiv="Content-Security-Policy"/);
    assert.ok(!/<script>(?!<\/script>)|<script\s+(?!src=)[^>]*>/.test(html), p + ": no inline script");
    for (const id of ["gate", "engine", "alerts", "cam", "startCam", "demoCam", "stopCam", "drawZone", "rectZone", "zoneList",
      "settingsForm", "log", "logStats", "exportCsv", "clearData", "printNotice"])
      assert.ok(html.includes(`id="${id}"`), `${p}.html #${id}`);
    assert.ok(html.includes('href="camera-notice.html"'), p + " links the printable notice");
    assert.ok(html.includes('href="solutions.html"'), p + " links back to the catalogue");
  }
  const zc = read("lensiq-zonecam.js");
  assert.match(zc, /LQDetect\.isTest\(\)/); assert.match(zc, /LQDetect\.fake\(o\.key/);
  assert.ok(!/toDataURL|toBlob|MediaRecorder|fetch\(|XMLHttpRequest|sendBeacon/.test(zc), "the runtime never encodes, records or sends frames");
  for (const p of PAGES) assert.ok(!/toDataURL|toBlob|MediaRecorder|fetch\(|XMLHttpRequest|sendBeacon/.test(read(p + ".js")), p + ".js sends nothing");
});

test("zone pages: human-in-the-loop wording, no identity or emotion claims", () => {
  const BAD = /(ตรวจจับ(ผู้)?บุกรุก|ขโมย|ผู้ต้องสงสัย|ทุจริต|มีความผิด|intruder detected|thief|suspect|guilty|cheat|emotion|อารมณ์)/i;
  for (const f of [...PAGES.map(p => p + ".html"), ...PAGES.map(p => p + ".js"), "lensiq-zonecam.js"]) {
    const s = read(f);
    const m = s.match(BAD); assert.ok(!m, `${f}: "${m && m[0]}"`);
  }
  assert.match(read("afterhours.js"), /ให้เจ้าหน้าที่ตรวจสอบ/);
  assert.match(read("queue.js"), /ให้พนักงานดูหน้างานก่อนตัดสินใจ/);
  assert.match(read("bays.html"), /ไม่อ่านป้ายทะเบียน/);
});

function loadDict(file, lang) {
  const w = {}; w.window = w;
  vm.runInNewContext(read("i18n/" + file), w);
  return Object.assign({}, ...w.LQI18N_Q.map(d => d[lang] || {}));
}
test("zone pages: every data-i18n key and every T() key has English and Chinese, values without Thai", () => {
  const en = loadDict("en-zones.js", "en"), zh = loadDict("zh-zones.js", "zh");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  const keys = new Set();
  for (const p of PAGES) {
    const h = read(p + ".html");
    for (const m of h.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
    for (const m of h.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pr of m[1].split(";")) keys.add(pr.split(":")[1]);
  }
  for (const f of [...PAGES.map(p => p + ".js"), "lensiq-zonecam.js"]) for (const m of read(f).matchAll(/T\("([\w.]+)"/g)) keys.add(m[1]);
  const missing = [...keys].filter(k => !(k in en) || !(k in zh));
  assert.deepEqual(missing, []);
  for (const [k, v] of [...Object.entries(en), ...Object.entries(zh)]) assert.ok(!/[ก-๛]/.test(v), "Thai in " + k);
  for (const k of Object.keys(en)) for (const ph of (en[k].match(/\{\w+\}/g) || [])) assert.ok(zh[k].includes(ph), `${k} zh lacks ${ph}`);
});
