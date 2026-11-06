"use strict";
// node --test tests/unit — qc.js multi-lane helpers: blob segmentation / two-bottle warning, p-chart limits,
// localStorage -> IndexedDB image migration (idempotent), per-lane stats, simulator parity.
const test = require("node:test");
const assert = require("node:assert/strict");
const QC = require("../../qc.js");

const W = 640, H = 480;
const img = () => ({ data: new Uint8ClampedArray(W * H * 4), width: W, height: H });
const G = QC.simGeom("600", W, H);
function bgImg() { const b = img(); QC.simBackground(b, G); QC.simNoise(b, 99); return b; }
function bottles(xs) { const im = img(); QC.simBackground(im, G); xs.forEach(x => QC.simBottle(im, G, x, null)); QC.simNoise(im, 3); return im; }
const TR = QC.roiPx(G.rois.trigger, W, H);

test("blobs/multiCheck: one bottle is one group, two bottles warn 'two', touching bottles warn 'wide'", () => {
  const bg = bgImg();
  const one = QC.multiCheck(QC.blobs(bottles([W / 2]), bg, TR), null);
  assert.equal(one.multi, false); assert.equal(one.n, 1);
  const two = QC.multiCheck(QC.blobs(bottles([W / 2 - 52, W / 2 + 56]), bg, TR), null);
  assert.equal(two.multi, true); assert.equal(two.kind, "two"); assert.equal(two.n, 2);
  // golden width from calibration
  const rec = { rois: G.rois, mode: "dark", tol: { fill: 6, fillUnit: "px", minContrast: 12, capDE: 15, capCov: 50, capTilt: 6, capHigh: 4, labelSim: 80, labelShift: 6 } };
  const g = QC.calibrate(bottles([W / 2]), rec, bg);
  assert.ok(g.trigW > 0.3 && g.trigW < 0.7, "trigW " + g.trigW);
  // synthetic: one merged blob twice as wide as the golden bottle -> 'wide'
  const wide = QC.multiCheck([{ area: 100, frac: 0.5, x0: 0.05, x1: 0.95, y0: 0, y1: 1, cx: 0.5 }], 0.45);
  assert.equal(wide.kind, "wide");
  assert.equal(QC.multiCheck([{ area: 100, frac: 0.5, x0: 0.3, x1: 0.7, y0: 0, y1: 1, cx: 0.5 }], 0.45).multi, false);
  // cap / body split vertically are one bottle (same x range)
  const split = QC.multiCheck([{ area: 50, frac: 0.2, x0: 0.4, x1: 0.6, y0: 0, y1: 0.2, cx: 0.5 }, { area: 80, frac: 0.3, x0: 0.3, x1: 0.7, y0: 0.4, y1: 1, cx: 0.5 }], null);
  assert.equal(split.multi, false);
  assert.equal(QC.multiCheck([], 0.4).multi, false);
});

test("simFrame default output is unchanged by the new pair option", () => {
  const a = img(), b = img();
  const ia = QC.simFrame(a, "600", 1234, 2400, 0.3), ib = QC.simFrame(b, "600", 1234, 2400, 0.3, { pairRate: 0 });
  assert.deepEqual({ ...ia, pair: false }, ib);
  assert.deepEqual(a.data, b.data);
  const c = img(), ic = QC.simFrame(c, "600", 1234, 2400, 0.3, { pairRate: 1 });
  assert.equal(ic.pair, true); assert.equal(ic.defect, ia.defect, "defect sequence unchanged");
});

test("pChart: p̄, ±3σ limits per subgroup size, LCL clipped at 0, out-of-control flags, lane filter", () => {
  const log = [];
  let t = 0;
  // lane L1: 5 groups of 20 with 1 defect each, then one group with 10 defects
  for (let g = 0; g < 6; g++) for (let i = 0; i < 20; i++) log.push({ t: t++, lane: "L1", pass: !(g < 5 ? i === 0 : i < 10) });
  // lane L2: all good; legacy entries without lane belong to L1
  for (let i = 0; i < 10; i++) log.push({ t: t++, lane: "L2", pass: true });
  const pc = QC.pChart(log, { lane: "L1", size: 20 });
  assert.equal(pc.groups.length, 6); assert.equal(pc.n, 120); assert.equal(pc.d, 15);
  const pbar = 15 / 120, sd = Math.sqrt(pbar * (1 - pbar) / 20);
  assert.ok(Math.abs(pc.pbar - pbar) < 1e-12);
  assert.ok(Math.abs(pc.groups[0].ucl - (pbar + 3 * sd)) < 1e-12);
  assert.equal(pc.groups[0].lcl, 0, "LCL clipped at 0");
  assert.equal(pc.outCount, 1); assert.equal(pc.groups[5].out, true); assert.equal(pc.groups[0].out, false);
  // partial last group uses its own n
  const p2 = QC.pChart(log.slice(0, 30), { lane: "L1", size: 20 });
  assert.equal(p2.groups[1].n, 10);
  assert.ok(p2.groups[1].ucl > p2.groups[0].ucl, "smaller n -> wider limits");
  // lane filter + legacy default lane
  assert.equal(QC.pChart(log, { lane: "L2", size: 5 }).d, 0);
  assert.equal(QC.pChart([{ t: 1, pass: false }], { lane: "L1" }).d, 1, "entries without lane are L1");
  assert.equal(QC.pChart(log, { size: 20 }).n, 130, "lane null = all lanes");
  assert.deepEqual(QC.pChart([], {}).groups, []);
  // LCL > 0 when p̄ is large enough
  const hi = Array.from({ length: 200 }, (_, i) => ({ t: i, pass: i % 2 === 0 }));
  const ph = QC.pChart(hi, { size: 50 });
  assert.ok(ph.groups[0].lcl > 0.2 && ph.groups[0].ucl < 0.8);
});

test("migrateBgs / migrateThumbs move data URLs to the store once (idempotent) and keep data on failure", async () => {
  const store = new Map();
  const put = async (k, v) => { store.set(k, v); };
  const recipes = [{ id: "sim-600", bg: "data:image/jpeg;base64,AAA" }, { id: "r2", bg: null }, { id: "r3" }];
  const m1 = await QC.migrateBgs(recipes, put);
  assert.deepEqual(m1, ["L1|sim-600"]);
  assert.equal(recipes[0].bg, null); assert.equal(recipes[0].ik, "L1|sim-600");
  assert.equal(store.get("L1|sim-600"), "data:image/jpeg;base64,AAA");
  const snap = JSON.stringify(recipes);
  assert.deepEqual(await QC.migrateBgs(recipes, put), [], "second run: nothing to do");
  assert.equal(JSON.stringify(recipes), snap);
  // failing store: recipe keeps its background (fallback)
  const keep = [{ id: "x", bg: "data:image/jpeg;base64,BBB" }];
  assert.deepEqual(await QC.migrateBgs(keep, async () => { throw new Error("quota"); }), []);
  assert.equal(keep[0].bg, "data:image/jpeg;base64,BBB");
  // thumbs
  const rejects = [{ t: 5, lane: "L2", reasons: ["under"], img: "data:image/jpeg;base64,C" }, { t: 6, reasons: [], img: "" }];
  assert.deepEqual(await QC.migrateThumbs(rejects, put), ["L2|5"]);
  assert.equal(rejects[0].img, ""); assert.equal(rejects[0].ik, "L2|5");
  assert.deepEqual(await QC.migrateThumbs(rejects, put), []);
  assert.equal(QC.thumbKey({ t: 9 }), "L1|9");
  assert.equal(QC.bgKey("L3", "r"), "L3|r");
});

test("laneStats: per lane, totals, and old single-lane shifts map to L1", () => {
  const old = { total: 10, pass: 8, reject: 2, missed: 1, reasons: { under: 2 } };
  assert.equal(QC.laneStats(old, "L1").total, 10);
  assert.equal(QC.laneStats(old, "L2").total, 0);
  const nw = { total: 7, pass: 5, reject: 2, missed: 0, reasons: { capTilt: 2 }, lanes: { L1: { total: 4, pass: 4, reject: 0, missed: 0, multi: 1, reasons: {} }, L2: { total: 3, pass: 1, reject: 2, missed: 0, multi: 0, reasons: { capTilt: 2 } } } };
  assert.equal(QC.laneStats(nw, "L2").reasons.capTilt, 2);
  assert.equal(QC.laneStats(nw, null).total, 7);
  assert.equal(QC.laneStats(nw, null).multi, 1);
  assert.equal(QC.laneStats(null, "L1").total, 0);
});

test("presenceStep keeps extra per-arrival flags until the bottle leaves", () => {
  const cfg = { on: 0.15, off: 0.05, centerTol: 0.12, motionMax: 0.01, requireStill: false, stableFrames: 1, leaveFrames: 2 };
  let s = { ...QC.presenceInit(), phase: "present", multi: true };
  s = QC.presenceStep(s, { frac: 0.3, cx: 0.9, motion: 0 }, 1, cfg).st;
  assert.equal(s.multi, true);
  s = QC.presenceStep(s, { frac: 0, cx: 0.5, motion: 0 }, 2, cfg).st;
  const r = QC.presenceStep(s, { frac: 0, cx: 0.5, motion: 0 }, 3, cfg);
  assert.equal(r.event, "missed"); assert.equal(r.st.multi, undefined, "reset when the bottle leaves");
});

/* ---- photometric normalisation + label skew (round 5) ---- */
const TOL5 = { fill: 6, fillUnit: "px", minContrast: 12, capDE: 15, capCov: 50, capTilt: 6, capHigh: 4, labelSim: 80, labelShift: 6 }; // defTol()
function scene(defect = null, cx = W / 2, seed = 3) { const im = img(); QC.simBackground(im, G); QC.simBottle(im, G, cx, defect); QC.simNoise(im, seed, 4); return im; }
// lighting change after calibration: brightness gain, then contrast around mid-grey (clipped like a camera)
function relight(im, gain = 1, contrast = 1) {
  const d = new Uint8ClampedArray(im.data.length);
  for (let i = 0; i < d.length; i += 4) { for (let c = 0; c < 3; c++) d[i + c] = (im.data[i + c] * gain - 128) * contrast + 128; d[i + 3] = 255; }
  return { data: d, width: im.width, height: im.height };
}
// rotate the printed label by deg around its centre (nearest neighbour, only inside the bottle body)
function skewLabel(im, deg) {
  const out = { data: new Uint8ClampedArray(im.data), width: W, height: H }, a = deg * Math.PI / 180;
  const cx = W / 2, cy = G.labelTop + G.labelH / 2, hw = G.bodyW / 2 - 4;
  for (let y = G.bodyTop; y < G.belt; y++) for (let x = cx - hw; x <= cx + hw; x++) {
    const sx = Math.round(cx + (x - cx) * Math.cos(a) + (y - cy) * Math.sin(a)), sy = Math.round(cy - (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a));
    if (sx < cx - hw || sx > cx + hw || sy < G.bodyTop || sy >= G.belt) continue;
    const o = (y * W + x) * 4, s = (sy * W + sx) * 4;
    for (let c = 0; c < 3; c++) out.data[o + c] = im.data[s + c];
  }
  return out;
}
function recipe(withBg) {
  const bg = bgImg(), rec = { rois: G.rois, mode: "dark", tol: { ...TOL5 } };
  rec.golden = QC.calibrate(scene(), rec, withBg ? bg : null);
  return { rec, bg: withBg ? bg : null };
}

test("photometric normalisation: ±20% brightness and ±10% contrast after calibration cause no false rejects", () => {
  for (const withBg of [true, false]) {
    const { rec, bg } = recipe(withBg);
    assert.ok(rec.golden.photo && rec.golden.photo.px.length > 100, "golden stores photometric reference");
    for (const [gain, ct] of [[1, 1], [1.2, 1], [0.8, 1], [1, 1.1], [1, 0.9], [1.2, 0.9], [0.8, 1.1], [1.1, 1.1]]) {
      for (const [k, cx] of [[0, W / 2], [1, W / 2 - 5], [2, W / 2 + 6]]) {
        const r = QC.inspect(relight(scene(null, cx, 10 + k), gain, ct), rec, bg);
        assert.equal(r.pass, true, `bg ${withBg} gain ${gain} contrast ${ct} cx ${cx}: ${r.reasons}`);
        if (gain !== 1 || ct !== 1) { assert.equal(r.photo.on, true); assert.ok(Math.abs(r.photo.gain[1] - gain * ct) < 0.06, "gain " + r.photo.gain); }
      }
    }
  }
});

test("photometric normalisation: defects are still rejected under ±20% brightness / ±10% contrast", () => {
  const { rec, bg } = recipe(true);
  for (const [gain, ct] of [[1.2, 1], [0.8, 1], [1, 1.1], [1, 0.9]]) {
    for (const d of QC.SIM_DEFECTS) {
      const r = QC.inspect(relight(scene(d), gain, ct), rec, bg);
      assert.ok(r.reasons.includes(d) || (d === "capTilt" && r.reasons.includes("capHigh")), `${d} at gain ${gain} contrast ${ct}: got ${r.reasons}`);
    }
  }
  // without normalisation the same lighting change rejects good bottles (the round-4 failure)
  const off = QC.inspect(relight(scene(), 1.2, 1), { ...rec, photoNorm: false }, bg);
  assert.equal(off.pass, false);
});

test("label skew: ≥5° detected (also under changed lighting), 0–2° passes, old golden without strips still works", () => {
  const { rec, bg } = recipe(true);
  for (const deg of [-10, -5, 5, 7, 10]) {
    const r = QC.inspect(skewLabel(scene(), deg), rec, bg);
    assert.ok(r.reasons.includes("labelShift") && r.label.skew, `skew ${deg}°: ${r.reasons} angle ${r.label.angle}`);
    assert.ok(Math.sign(r.label.angle) === Math.sign(deg) && Math.abs(Math.abs(r.label.angle) - Math.abs(deg)) < 2, `angle ${r.label.angle} for ${deg}`);
    assert.ok(QC.inspect(relight(skewLabel(scene(), deg), 0.8, 1.1), rec, bg).label.skew, `skew ${deg}° at −20% light`);
  }
  for (const deg of [0, 1, -2, 2]) {
    const r = QC.inspect(skewLabel(scene(), deg), rec, bg);
    assert.equal(r.pass, true, `skew ${deg}°: ${r.reasons} angle ${r.label.angle}`);
  }
  // configurable tolerance; recipes calibrated before round 5 (no strips / no photo ref) behave as before
  assert.equal(QC.inspect(skewLabel(scene(), 7), { ...rec, tol: { ...TOL5, labelAngle: 10 } }, bg).label.skew, false);
  const legacy = { ...rec, golden: { ...rec.golden, photo: undefined, label: { ...rec.golden.label, strips: undefined } } };
  const lr = QC.inspect(scene(), legacy, bg);
  assert.equal(lr.pass, true); assert.equal(lr.label.angle, null); assert.equal(lr.photo, null);
});
