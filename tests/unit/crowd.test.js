"use strict";
// tests/unit/crowd.test.js — lensiq-crowd.js (LQCrowd): line crossing (bit-for-bit with store.js crossStep on random walks),
// line counter per anonymous id, density grid, day record repair, minute series, peak hours, conversion / funnel rates,
// density bands, LQAgg pack compatibility; plus static checks of crowd.html / crowd.js (runtime reuse, CSP, no network /
// image encoding, no identity or emotion wording, every i18n key in English and Chinese without Thai).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const C = require("../../lensiq-crowd.js");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

test("lineSide / crossStep match store.js on random walks (band + confirmation)", () => {
  const S = require("../../store.js");
  const r = rng(7);
  for (let k = 0; k < 200; k++) {
    const line = { a: { x: r(), y: r() }, b: { x: r(), y: r() } }, swap = r() < 0.5, cfg = { band: 0.012, bandRel: 0.08, confirm: 1 + (k % 3) };
    const m1 = {}, m2 = {};
    let p = { x: r(), y: r() };
    for (let i = 0; i < 60; i++) {
      p = { x: Math.min(1, Math.max(0, p.x + (r() - 0.5) * 0.1)), y: Math.min(1, Math.max(0, p.y + (r() - 0.5) * 0.1)) };
      const h = r() * 0.4;
      assert.equal(C.lineSide(line, p, 0.01), S.lineSide(line, p, 0.01));
      assert.equal(C.crossStep(m1, line, p, swap, cfg, h), S.crossStep(m2, line, p, swap, cfg, h), `walk ${k} step ${i}`);
    }
  }
});

test("createLineCounter: one id crossing in, back out; unconfirmed ids ignored; direction swap", () => {
  const line = { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } };
  const lc = C.createLineCounter();
  const box = (id, x) => ({ id, x: x - 0.03, y: 0.3, w: 0.06, h: 0.3 });
  const seen = [];
  let t = 0;
  for (const x of [0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.8]) seen.push(...lc.update([box(1, x), box(0, x)], line, false, t += 200));
  for (const x of [0.7, 0.6, 0.4, 0.3, 0.2]) seen.push(...lc.update([box(1, x)], line, false, t += 200));
  // a->b points down, so the left half of the image is side +1; moving to the right ends on side -1 = "out"
  assert.deepEqual(seen.map(s => s.dir), ["out", "in"]);
  const lc2 = C.createLineCounter(), seen2 = [];
  for (const x of [0.2, 0.3, 0.4, 0.6, 0.7, 0.8]) seen2.push(...lc2.update([box(5, x)], line, true, t += 200));
  assert.deepEqual(seen2.map(s => s.dir), ["in"], "swap flips the direction");
  // a jitter around the line (inside the band) never counts
  const lc3 = C.createLineCounter(); let n = 0;
  for (let i = 0; i < 20; i++) n += lc3.update([box(9, 0.5 + (i % 2 ? 0.01 : -0.01))], line, false, t += 200).length;
  assert.equal(n, 0);
  // ids not seen for longer than forgetMs are dropped
  lc3.update([], line, false, t += 10000); assert.equal(lc3.size, 0);
  assert.deepEqual(lc.update([box(1, 0.3)], null, false, t), [], "no line = nothing counted");
});

test("density grid: foot positions, clamping, max, 0..100 normalisation, colour ramp", () => {
  const G = C.newGrid(4, 2);
  C.gridAdd(G, { x: 0.1, y: 0.1 }, 2); C.gridAdd(G, { x: 0.99, y: 0.99 }, 1); C.gridAdd(G, { x: 1.5, y: -1 }, 1);
  C.gridAdd(G, { x: NaN, y: 0.5 }, 5); C.gridAdd(G, { x: 0.5, y: 0.5 }, -3);
  assert.deepEqual(G.d, [2, 0, 0, 1, 0, 0, 0, 1]);
  assert.equal(C.gridMax(G), 2);
  assert.deepEqual(C.gridNorm(G), [100, 0, 0, 50, 0, 0, 0, 50]);
  assert.deepEqual(C.gridNorm(C.newGrid(2, 1)), [0, 0]);
  assert.deepEqual(C.heatColor(0), [42, 120, 214]); assert.deepEqual(C.heatColor(1), [220, 50, 40]); assert.deepEqual(C.heatColor(9), [220, 50, 40]);
  assert.deepEqual(C.heatColor(0.5), [80, 190, 90]);
});

test("day record: newDay shape, ensureDay repairs partial / hostile records", () => {
  const d = C.newDay("2026-11-08");
  assert.equal(d.hourly.in.length, 24); assert.equal(d.heat.d.length, 24 * 14);
  const bad = { date: "2026-11-08", peak: -5, in: "7", hourly: { in: [1, 2], occSum: Array(24).fill(1) }, heat: { cols: 3, rows: 3, d: [1] }, funnel: null, minutes: [] };
  const r = C.ensureDay(bad);
  assert.equal(r.peak, 0); assert.equal(r.in, 0);
  assert.deepEqual(r.hourly.in, Array(24).fill(0)); assert.deepEqual(r.hourly.occSum, Array(24).fill(1));
  assert.equal(r.heat.d.length, 24 * 14); assert.deepEqual(r.funnel, { pass: 0, stop: 0 }); assert.deepEqual(r.minutes, {});
  assert.equal(C.ensureDay(null).date, "");
  const ok = C.newDay("x"); ok.heat.d[3] = 4; assert.equal(C.ensureDay(ok).heat.d[3], 4, "valid grid kept");
});

test("minute series, hourly averages, peak hours", () => {
  const d = C.newDay("x");
  C.addMinute(d, 600, 4, 30000); C.addMinute(d, 600, 2, 30000); C.addMinute(d, 601, 10, 60000);
  C.addMinute(d, 2000, 1, 1000); C.addMinute(d, 5, 1, 0);
  assert.deepEqual(C.series(d, 0, 1439), [{ m: 600, avg: 3, max: 4 }, { m: 601, avg: 10, max: 10 }]);
  assert.deepEqual(C.series(d, 601, 601).map(p => p.m), [601]);
  for (const [h, cnt, ms, pk] of [[9, 3, 120000, 5], [14, 8, 60000, 12], [18, 8, 600000, 9], [20, 50, 30000, 50]]) {
    d.hourly.occSum[h] = cnt * ms; d.hourly.occMs[h] = ms; d.hourly.peak[h] = pk;
  }
  assert.equal(C.hourAvg(d, 9), 3); assert.equal(C.hourAvg(d, 3), null);
  // hour 20 has < 1 minute of data -> not a peak hour; ties on average break by the higher peak
  assert.deepEqual(C.peakHours(d, 3).map(p => p.h), [14, 18, 9]);
  assert.deepEqual(C.peakHours(d, 1).map(p => p.h), [14]);
});

test("zone stats, dwell, density, conversion and funnel rates, density bands", () => {
  const d = C.newDay("x"), z = { id: "z1", name: "หน้าเวที", role: "stop" };
  const zs = C.zoneStat(d, z); zs.dwellSum = 90000; zs.dwellN = 3;
  assert.equal(C.zoneStat(d, z), zs, "created once");
  assert.equal(C.avgDwellSec(zs), 30); assert.equal(C.avgDwellSec({ dwellN: 0 }), 0);
  assert.equal(C.density(12, 6), 2); assert.equal(C.density(3, 0), null);
  assert.equal(C.rate(5, 20), 0.25); assert.equal(C.rate(5, 0), null); assert.equal(C.rate(NaN, 3), null); assert.equal(C.rate(-1, 3), null);
  assert.deepEqual(C.funnelRates({ pass: 200, stop: 50, enter: 20 }), { stopRate: 0.25, enterRate: 0.4, overall: 0.1 });
  assert.deepEqual(C.funnelRates({}), { stopRate: null, enterRate: null, overall: null });
  assert.deepEqual([0.5, 1, 1.5, 2, 3, 4, 4.1, null, NaN].map(C.densityLevel), ["low", "low", "busy", "busy", "crowded", "crowded", "critical", null, null]);
});

test("aggDay -> LQAgg.packFromDay + cleanPack: numbers only, zone keys c1:<id>", () => {
  const A = require("../../lensiq-agg.js");
  const d = C.newDay("2026-11-08"); d.in = 40; d.out = 31; d.peak = 17; d.peakAt = 1762600000000; d.hourly.in[10] = 40;
  d.heat.d[5] = 99; d.conv._line = 8;
  C.zoneStat(d, { id: "z1", name: "บูธ A" }).visits = 12;
  const day = C.aggDay(d, [{ id: "z1", name: "บูธ A" }, { id: "z9", name: "ไม่มีข้อมูล" }]);
  const pack = A.packFromDay(day, "อีเวนต์");
  const r = A.cleanPack(pack);
  assert.ok(r.ok, r.error);
  assert.equal(r.pack.in, 40); assert.equal(r.pack.occ, 9); assert.equal(r.pack.hourlyIn[10], 40);
  assert.deepEqual(Object.keys(r.pack.zones), ["c1:z1"]); assert.equal(r.pack.zones["c1:z1"].visits, 12);
  const json = JSON.stringify(r.pack);
  assert.ok(!/heat|conv|minutes|funnel/.test(json), "the pack carries only the LQAgg contract fields");
});

test("storage budget: compactDay drops the minute map and rounds; planPrune keeps today + the newest days", () => {
  const d = C.newDay("2026-11-07");
  for (let m = 0; m < 1440; m++) C.addMinute(d, m, 3, 200);
  for (let i = 0; i < d.heat.d.length; i++) d.heat.d[i] = 0.1 + 0.2 + i / 3;
  d.hourly.occSum[9] = 12345.678; C.zoneStat(d, { id: "z1", name: "A" }).dwellSum = 1000.4;
  d.in = 5; d.funnel.pass = 4;
  const before = JSON.stringify(d).length;
  const c = C.compactDay(JSON.parse(JSON.stringify(d)));
  const after = JSON.stringify(c).length;
  assert.deepEqual(c.minutes, {}); assert.equal(c.in, 5); assert.equal(c.funnel.pass, 4); assert.equal(c.hourly.occSum[9], 12346);
  assert.equal(c.zones.z1.dwellSum, 1000); assert.equal(c.heat.d[0], 0.3);
  assert.ok(before > 30000 && after < 8000, `full day ${before} B -> compact ${after} B`);
  const P = "lqcr-day-", keys = ["lqcr-line", "lqcr-day-bad", "lqst-day-2026-01-01", P + "2026-11-08"];
  for (let i = 1; i <= 70; i++) keys.push(P + new Date(Date.UTC(2026, 10, 8 - i)).toISOString().slice(0, 10));
  const r = C.planPrune(keys, P, "2026-11-08");
  assert.equal(C.DAY_KEEP, 60);
  assert.equal(r.compact.length, 59); assert.equal(r.drop.length, 11);
  assert.ok(!r.compact.includes(P + "2026-11-08") && !r.drop.includes(P + "2026-11-08"), "today is never touched");
  assert.equal(r.compact[0], P + "2026-11-07"); assert.ok(r.drop.includes(P + new Date(Date.UTC(2026, 10, 8 - 70)).toISOString().slice(0, 10)));
  assert.ok(![...r.compact, ...r.drop].some(k => !k.startsWith(P) || k === "lqcr-day-bad"), "only this page's dated day records");
  assert.deepEqual(C.planPrune([P + "2026-11-01"], P, "2026-11-08", 3), { compact: [P + "2026-11-01"], drop: [] });
});

test("crowd.js: demo data is kept out of the real day, alert list and counting line", () => {
  const s = read("crowd.js");
  assert.ok(/demo: true/.test(s) && /P\.day\.demo\) return true/.test(s), "the demo day is flagged and never saved");
  assert.ok(/line = \{ \.\.\.DEMO_LINE, demo: true \}/.test(s) && !/store\.set\(LINE_KEY, line\)/.test(s), "the demo line stays in memory");
  assert.ok(/cr\.pack\.demo/.test(s) && /cr\.csv\.demo/.test(s), "pack refused / CSV labelled while in demo");
  assert.ok(/addEventListener\("startCam"|\$\("startCam"\)\.addEventListener\("click", \(\) => leaveDemo\(P\)\)/.test(s), "camera start leaves the demo");
});

// ---------------- the page ----------------
test("crowd.html: shared runtime, CSP meta, no inline script, notice gate, element ids", () => {
  const html = read("crowd.html");
  for (const s of ["lensiq-camera.js", "lensiq-detect.js", "lensiq-track.js", "lensiq-zones.js", "lensiq-zonecam.js", "lensiq-agg.js", "lensiq-crowd.js",
    "crowd.js", "nav.js", "i18n/zh-zones.js", "i18n/zh-crowd.js"]) assert.ok(html.includes(`src="${s}`), `crowd.html loads ${s}`);
  assert.match(html, /<meta http-equiv="Content-Security-Policy"/);
  assert.ok(!/<script>(?!<\/script>)|<script\s+(?!src=)[^>]*>/.test(html), "no inline script");
  for (const id of ["gate", "engine", "alerts", "cam", "startCam", "demoCam", "stopCam", "drawZone", "finishZone", "cancelZone", "rectZone", "drawMsg",
    "zoneList", "settingsForm", "setMsg", "log", "logStats", "exportCsv", "clearData", "printNotice", "drawLine", "swapLine", "clearLine", "tiles",
    "zoneState", "heat", "series", "crHourly", "peaks", "funnel", "conv", "summary", "sumBody", "printSummary", "exportPack"])
    assert.ok(html.includes(`id="${id}"`), `crowd.html #${id}`);
  assert.ok(html.includes('href="camera-notice.html"') && html.includes('href="solutions.html"'));
  for (const f of ["crowd.js", "lensiq-crowd.js"]) {
    const s = read(f);
    assert.ok(!/toDataURL|toBlob|getImageData|MediaRecorder|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|indexedDB/.test(s), f + " never encodes, records or sends anything");
  }
  assert.match(read("crowd.js"), /LQDetect\.fake\("crowd"\)|key: "crowd"/);
});

test("crowd: human-in-the-loop wording, no identity, emotion or deception claims", () => {
  const BAD = /(ตรวจจับ(ผู้)?บุกรุก|ขโมย|ผู้ต้องสงสัย|ทุจริต|มีความผิด|อารมณ์|โกหก|ใบหน้าของ|intruder|thief|suspect|guilty|cheat|emotion|mood|lie detect|decepti|gender|เพศ|อายุ)/i;
  for (const f of ["crowd.html", "crowd.js", "lensiq-crowd.js", "i18n/en-crowd.js", "i18n/zh-crowd.js"]) {
    const m = read(f).match(BAD); assert.ok(!m, `${f}: "${m && m[0]}"`);
  }
  assert.match(read("crowd.js"), /ให้เจ้าหน้าที่ดูหน้างานก่อนตัดสินใจ/);
  assert.match(read("crowd.html"), /ไม่จดจำใบหน้า/);
});

function loadDict(file, lang) {
  const w = {}; w.window = w;
  vm.runInNewContext(read("i18n/" + file), w);
  return Object.assign({}, ...w.LQI18N_Q.map(d => d[lang] || {}));
}
test("crowd: every data-i18n key and every T() key has English and Chinese, values without Thai, same placeholders", () => {
  const en = { ...loadDict("en-zones.js", "en"), ...loadDict("en-crowd.js", "en") }, zh = { ...loadDict("zh-zones.js", "zh"), ...loadDict("zh-crowd.js", "zh") };
  const enC = loadDict("en-crowd.js", "en"), zhC = loadDict("zh-crowd.js", "zh");
  assert.deepEqual(Object.keys(enC).sort(), Object.keys(zhC).sort());
  const keys = new Set(), h = read("crowd.html"), js = read("crowd.js");
  for (const m of h.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
  for (const m of h.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pr of m[1].split(";")) keys.add(pr.split(":")[1]);
  const thai = new Map();
  for (const m of js.matchAll(/T\("([\w.]+)",\s*"((?:[^"\\]|\\.)*)"/g)) { keys.add(m[1]); thai.set(m[1], m[2]); }
  assert.ok(keys.size > 150, "found " + keys.size);
  assert.deepEqual([...keys].filter(k => !(k in en) || !(k in zh)), []);
  for (const k of Object.keys(enC)) assert.ok(keys.has(k), "unused key " + k);
  for (const [k, v] of [...Object.entries(enC), ...Object.entries(zhC)]) assert.ok(!/[ก-๛]/.test(v), "Thai in " + k);
  for (const [k, v] of thai) for (const ph of (v.match(/\{\w+\}/g) || [])) {
    assert.ok(en[k].includes(ph), `${k} en lacks ${ph}`); assert.ok(zh[k].includes(ph), `${k} zh lacks ${ph}`);
  }
});

test("docs: PDPA note for the crowd page exists", () => {
  const s = read("docs/pdpa-notes/S1-A-crowd.md");
  assert.match(s, /crowd\.html/); assert.match(s, /PDPA/);
});
